/**
 * Periodic market resolver: full `detectRug()` (dev sell, price drop, liquidity,
 * graduation stall) vs expiry → survive. Runs every 30s via BullMQ when
 * REDIS_URL is set, else setInterval. Emits `market_resolved` via Socket.IO.
 *
 * Resolution is chain-first: we submit `resolve_market` and only update the DB
 * (and emit / RugEvent) after the on-chain call succeeds, so indexer state
 * stays aligned with the program.
 */

import type { Market as DbMarket, Prisma } from "@prisma/client";
import type { Market, Outcome as MarketOutcome } from "@survivefun/types";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

import { connection } from "../config/solana";
import { prisma } from "../config/database";
import { toMarketDto } from "../lib/dto";
import { resolveMarketOnChain } from "../lib/onchainProgram";
import { detectRug } from "../services/rugDetector";
import { emitMarketResolved } from "../websocket/socketHandler";

const LOG_PREFIX = "[resolver]";
const QUEUE_NAME = "survive-market-resolver";
const TICK_MS = 30_000;
const JOB_SCHEDULER_ID = "survive-market-resolver-every-30s";

let resolverStarted = false;
let fallbackInterval: ReturnType<typeof setInterval> | undefined;

/**
 * Submits `resolve_market` as the platform authority (signer from env).
 */
export async function resolveOnChain(
  market: Market,
  outcome: MarketOutcome,
): Promise<string> {
  const out = await resolveMarketOnChain(
    connection,
    market.tokenMint,
    market.durationSeconds,
    outcome,
  );
  console.log(`${LOG_PREFIX} resolve_market on-chain success`, {
    marketId: market.id,
    tokenMint: market.tokenMint,
    durationSeconds: market.durationSeconds,
    outcome,
    marketPda: out.marketPda,
    platformAuthority: out.platformAuthority,
    signature: out.signature,
  });
  return out.signature;
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
