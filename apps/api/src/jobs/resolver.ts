/**
 * Periodic market resolver: full `detectRug()` (dev sell, price drop, liquidity,
 * graduation stall) vs expiry → survive. Runs every 30s via BullMQ when
 * REDIS_URL is set, else setInterval. Emits `market_resolved` via Socket.IO.
 *
 * Resolution is chain-first: we submit `resolve_market` and only update the DB
 * (and emit / RugEvent) after `sendAndConfirmTransaction` succeeds, so indexer
 * state stays aligned with the program (no “resolved” UI while still Active on-chain).
 */

import { createHash } from "node:crypto";

import type { Market as DbMarket, Prisma } from "@prisma/client";
import type { Market, Outcome as MarketOutcome } from "@survivefun/types";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import {
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

import { connection, getProgramId } from "../config/solana";
import { prisma } from "../config/database";
import { toMarketDto } from "../lib/dto";
import { detectRug } from "../services/rugDetector";
import { emitMarketResolved } from "../websocket/socketHandler";

const LOG_PREFIX = "[resolver]";
const QUEUE_NAME = "survive-market-resolver";
const TICK_MS = 30_000;
const JOB_SCHEDULER_ID = "survive-market-resolver-every-30s";

/** Anchor `Outcome`: `Survive` = 0, `Rug` = 1 (declaration order in program). */
const OUTCOME_SURVIVE_U8 = 0;
const OUTCOME_RUG_U8 = 1;

let resolverStarted = false;
let fallbackInterval: ReturnType<typeof setInterval> | undefined;

function anchorIxDiscriminator(name: string): Buffer {
  const preimage = `global:${name}`;
  const hash = createHash("sha256").update(preimage).digest();
  return Buffer.from(hash.subarray(0, 8));
}

let platformKeypairCache: Keypair | null = null;

function loadPlatformKeypair(): Keypair {
  if (platformKeypairCache) return platformKeypairCache;
  const raw =
    process.env.PLATFORM_WALLET_SECRET_KEY?.trim() ??
    process.env.PLATFORM_AUTHORITY_SECRET_KEY?.trim();
  if (!raw) {
    throw new Error(
      "PLATFORM_WALLET_SECRET_KEY (or PLATFORM_AUTHORITY_SECRET_KEY) must be set to resolve on-chain",
    );
  }
  let secret: Uint8Array;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("secret key JSON must be a number array");
    }
    secret = Uint8Array.from(parsed.map((n) => Number(n)));
  } catch {
    throw new Error(
      "PLATFORM_WALLET_SECRET_KEY must be a JSON array of byte values (Solana CLI format)",
    );
  }
  platformKeypairCache = Keypair.fromSecretKey(secret);
  return platformKeypairCache;
}

function durationSeedLe(durationSeconds: number): Buffer {
  const b = Buffer.allocUnsafe(8);
  b.writeBigUInt64LE(BigInt(durationSeconds), 0);
  return b;
}

function marketPda(tokenMint: PublicKey, durationSeconds: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"),
      tokenMint.toBuffer(),
      durationSeedLe(durationSeconds),
    ],
    getProgramId(),
  );
  return pda;
}

function marketAccountPk(dto: Market): PublicKey {
  return marketPda(new PublicKey(dto.tokenMint), dto.durationSeconds);
}

/**
 * Submits `resolve_market` as the platform authority (signer from env).
 */
export async function resolveOnChain(
  market: Market,
  outcome: MarketOutcome,
): Promise<string> {
  const platform = loadPlatformKeypair();
  const marketPk = marketAccountPk(market);
  const outcomeU8 =
    outcome === "rug" ? OUTCOME_RUG_U8 : OUTCOME_SURVIVE_U8;

  const disc = anchorIxDiscriminator("resolve_market");
  const data = Buffer.concat([disc, Buffer.from([outcomeU8])]);

  const ix = new TransactionInstruction({
    programId: getProgramId(),
    keys: [
      { pubkey: marketPk, isSigner: false, isWritable: true },
      { pubkey: platform.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  tx.lastValidBlockHeight = latest.lastValidBlockHeight;
  tx.feePayer = platform.publicKey;

  const signature = await sendAndConfirmTransaction(
    connection,
    tx,
    [platform],
    { commitment: "confirmed" },
  );
  return signature;
}

function rugEventType(
  condition: Awaited<ReturnType<typeof detectRug>>["condition"],
): "dev_sell" | "price_drop" | "liquidity_removed" | "graduation_stall" {
  if (
    condition === "dev_sell" ||
    condition === "price_drop" ||
    condition === "liquidity_removed" ||
    condition === "graduation_stall"
  ) {
    return condition;
  }
  return "price_drop";
}

/**
 * After a confirmed on-chain `resolve_market` (rug), persist DB + RugEvent + socket.
 * Call only when `resolveOnChain` has already succeeded.
 */
export async function finalizeRugResolutionAfterChain(
  row: DbMarket,
  rug: Awaited<ReturnType<typeof detectRug>>,
  txSig: string,
): Promise<void> {
  const updated = await prisma.$transaction(async (tx) => {
    const m = await tx.market.update({
      where: { id: row.id },
      data: { status: "resolved", outcome: "rug" },
    });
    await tx.rugEvent.create({
      data: {
        marketId: row.id,
        tokenMint: row.tokenMint,
        eventType: rugEventType(rug.condition),
        eventData: rug.data as Prisma.InputJsonValue,
        txSignature: txSig,
        detectedAt: new Date(),
      },
    });
    return m;
  });

  emitMarketResolved({
    marketId: updated.id,
    outcome: "rug",
    survivePool: updated.survivePool.toString(),
    rugPool: updated.rugPool.toString(),
    timestamp: new Date().toISOString(),
  });

  console.log(`${LOG_PREFIX} resolved market as rug (chain confirmed)`, {
    marketId: row.id,
    tokenMint: row.tokenMint,
    rugCondition: rug.condition,
    txSignature: txSig,
  });
}

/**
 * After a confirmed on-chain `resolve_market` (survive), persist DB + socket.
 */
export async function finalizeSurviveResolutionAfterChain(
  row: DbMarket,
  txSig: string,
): Promise<void> {
  const updated = await prisma.market.update({
    where: { id: row.id },
    data: { status: "resolved", outcome: "survive" },
  });

  emitMarketResolved({
    marketId: updated.id,
    outcome: "survive",
    survivePool: updated.survivePool.toString(),
    rugPool: updated.rugPool.toString(),
    timestamp: new Date().toISOString(),
  });

  console.log(`${LOG_PREFIX} resolved market as survive (chain confirmed, expired)`, {
    marketId: row.id,
    tokenMint: row.tokenMint,
    expiresAt: row.expiresAt.toISOString(),
    txSignature: txSig,
  });
}

async function handleRugResolution(
  row: DbMarket,
  dto: Market,
  rug: Awaited<ReturnType<typeof detectRug>>,
): Promise<void> {
  let txSig: string;
  try {
    txSig = await resolveOnChain(dto, "rug");
  } catch (e) {
    console.log(`${LOG_PREFIX} on-chain resolve failed (rug); leaving market active in DB`, {
      marketId: row.id,
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  try {
    await finalizeRugResolutionAfterChain(row, rug, txSig);
  } catch (e) {
    console.error(`${LOG_PREFIX} CRITICAL: on-chain rug resolve succeeded but DB finalize failed`, {
      marketId: row.id,
      txSignature: txSig,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function handleSurviveResolution(
  row: DbMarket,
  dto: Market,
): Promise<void> {
  let txSig: string;
  try {
    txSig = await resolveOnChain(dto, "survive");
  } catch (e) {
    console.log(`${LOG_PREFIX} on-chain resolve failed (survive); leaving market active in DB`, {
      marketId: row.id,
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  try {
    await finalizeSurviveResolutionAfterChain(row, txSig);
  } catch (e) {
    console.error(`${LOG_PREFIX} CRITICAL: on-chain survive resolve succeeded but DB finalize failed`, {
      marketId: row.id,
      txSignature: txSig,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function runResolverCycle(): Promise<void> {
  let active: DbMarket[];
  try {
    active = await prisma.market.findMany({
      where: { status: "active" },
    });
  } catch (e) {
    console.log(`${LOG_PREFIX} failed to load active markets`, {
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  const now = Date.now();

  for (const row of active) {
    try {
      const dto = toMarketDto(row);
      const rug = await detectRug(dto);

      if (rug.isRug) {
        await handleRugResolution(row, dto, rug);
        continue;
      }

      if (row.expiresAt.getTime() <= now) {
        await handleSurviveResolution(row, dto);
      }
    } catch (e) {
      console.log(`${LOG_PREFIX} market iteration error`, {
        marketId: row.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

/**
 * Starts the resolver loop (BullMQ repeatable job when REDIS_URL is set, otherwise setInterval).
 */
export function startResolver(): void {
  if (resolverStarted) {
    console.log(`${LOG_PREFIX} startResolver called again; ignoring`);
    return;
  }
  resolverStarted = true;

  const redisUrl = process.env.REDIS_URL?.trim();

  if (redisUrl) {
    const redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    });

    const queue = new Queue(QUEUE_NAME, { connection: redisConnection });

    void queue
      .upsertJobScheduler(
        JOB_SCHEDULER_ID,
        { every: TICK_MS },
        { name: "tick", data: {}, opts: {} },
      )
      .catch((e: unknown) => {
        console.log(`${LOG_PREFIX} failed to register job scheduler`, {
          error: e instanceof Error ? e.message : String(e),
        });
      });

    const workerConnection = redisConnection.duplicate();

    const worker = new Worker(
      QUEUE_NAME,
      async () => {
        await runResolverCycle();
      },
      { connection: workerConnection, concurrency: 1 },
    );

    worker.on("failed", (job, err) => {
      console.log(`${LOG_PREFIX} worker job failed`, {
        jobId: job?.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    worker.on("error", (err) => {
      console.log(`${LOG_PREFIX} worker error`, {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    console.log(`${LOG_PREFIX} started with BullMQ (every ${TICK_MS}ms)`);
    return;
  }

  console.log(
    `${LOG_PREFIX} REDIS_URL not set; using setInterval (${TICK_MS}ms)`,
  );
  fallbackInterval = setInterval(() => {
    void runResolverCycle();
  }, TICK_MS);
  void runResolverCycle();
}
