/**
 * Helius webhook intake (Pump.fun program). Verify auth, ack immediately, process async.
 *
 * Prefer mounting this router **before** `express.json()` so `POST /helius` keeps a raw body.
 * If `express.json()` runs first, the handler still accepts an already-parsed object (signature
 * verification beyond Authorization cannot be added later without raw bytes).
 */

import { timingSafeEqual } from "node:crypto";

import { Prisma, type Market as DbMarket } from "@prisma/client";
import type { Market } from "@survivefun/types";
import axios from "axios";
import { createHelius } from "@helius-labs/helius-sdk";
import express, { Router, type Request, type Response } from "express";

import { prisma } from "../config/database";
import { toMarketDto } from "../lib/dto";
import { detectRug } from "../services/rugDetector";
import {
  finalizeRugResolutionAfterChain,
  resolveOnChain,
} from "../jobs/resolver";
import { emitNewToken } from "../websocket/socketHandler";

const LOG_PREFIX = "[heliusWebhook]";

/** Pump.fun program (mainnet). */
export const PUMP_FUN_PROGRAM_ADDRESS =
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

const DEXSCREENER_TOKEN_URL =
  "https://api.dexscreener.com/latest/dex/tokens";

const ONE_HOUR_SECONDS = 3600;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizeAuthHeader(raw: string | undefined): string {
  if (raw == null) return "";
  const t = raw.trim();
  if (t.toLowerCase().startsWith("bearer ")) {
    return t.slice(7).trim();
  }
  return t;
}

function authMatches(expected: string, received: string | undefined): boolean {
  const a = Buffer.from(normalizeAuthHeader(expected));
  const b = Buffer.from(normalizeAuthHeader(received));
  if (a.length === 0 || b.length === 0) return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function verifyHeliusWebhook(req: Request): boolean {
  const secret = process.env.HELIUS_WEBHOOK_AUTH_SECRET?.trim();
  if (!secret) {
    console.log(`${LOG_PREFIX} HELIUS_WEBHOOK_AUTH_SECRET is not set; rejecting webhook`);
    return false;
  }
  return authMatches(secret, req.headers.authorization);
}

/** Flatten Helius / batch payloads into individual event-like records. */
function extractEventRecords(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.filter(isRecord);
  }
  if (!isRecord(body)) return [];

  const nested = body.events;
  if (Array.isArray(nested)) {
    return nested.filter(isRecord);
  }

  return [body];
}

function eventTypeOf(ev: Record<string, unknown>): string {
  const t = ev.type;
  return typeof t === "string" ? t.toUpperCase() : "";
}

async function fetchDexscreenerPair(
  mint: string,
): Promise<Record<string, unknown> | null> {
  try {
    const url = `${DEXSCREENER_TOKEN_URL}/${encodeURIComponent(mint)}`;
    const res = await axios.get<unknown>(url, {
      timeout: 15_000,
      validateStatus: (s) => s === 200,
    });
    const data = res.data;
    if (!isRecord(data)) return null;
    const pairs = data.pairs;
    if (!Array.isArray(pairs) || pairs.length === 0) return null;
    const first = pairs[0];
    return isRecord(first) ? first : null;
  } catch (e) {
    console.log(`${LOG_PREFIX} DexScreener fetch failed`, {
      mint,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

function extractMintFromTokenMintEvent(ev: Record<string, unknown>): string | null {
  const direct = ev.mint ?? ev.tokenMint ?? ev.tokenAddress;
  if (typeof direct === "string" && direct.length >= 32 && direct.length <= 44) {
    return direct.trim();
  }

  const tt = ev.tokenTransfers;
  if (Array.isArray(tt)) {
    for (const row of tt) {
      if (!isRecord(row)) continue;
      const m = row.mint ?? row.tokenMint;
      if (typeof m === "string" && m.length >= 32 && m.length <= 44) {
        return m.trim();
      }
    }
  }

  const nested = ev.events;
  if (isRecord(nested)) {
    const m = nested.mint ?? nested.tokenMint;
    if (typeof m === "string" && m.length >= 32 && m.length <= 44) {
      return m.trim();
    }
  }

  return null;
}

function collectTransferSenders(ev: Record<string, unknown>): string[] {
  const out = new Set<string>();

  const pushAddr = (v: unknown) => {
    if (typeof v === "string" && v.length >= 32 && v.length <= 44) {
      out.add(v.trim());
    }
  };

  const tt = ev.tokenTransfers;
  if (Array.isArray(tt)) {
    for (const row of tt) {
      if (!isRecord(row)) continue;
      pushAddr(row.fromUserAccount ?? row.from ?? row.source);
    }
  }

  const nt = ev.nativeTransfers;
  if (Array.isArray(nt)) {
    for (const row of nt) {
      if (!isRecord(row)) continue;
      pushAddr(row.fromUserAccount ?? row.from);
    }
  }

  pushAddr(ev.fromUserAccount ?? ev.source ?? ev.from);

  return [...out];
}

async function resolveActiveMarketAsRug(
  row: DbMarket,
  dto: Market,
  rug: Awaited<ReturnType<typeof detectRug>>,
): Promise<void> {
  let txSig: string;
  try {
    txSig = await resolveOnChain(dto, "rug");
  } catch (e) {
    console.log(`${LOG_PREFIX} on-chain resolve failed (immediate rug); DB unchanged`, {
      marketId: row.id,
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  try {
    await finalizeRugResolutionAfterChain(row, rug, txSig);
  } catch (e) {
    console.error(`${LOG_PREFIX} CRITICAL: webhook rug resolve on-chain ok but DB finalize failed`, {
      marketId: row.id,
      txSignature: txSig,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function handleTokenMintEvent(ev: Record<string, unknown>): Promise<void> {
  const mint = extractMintFromTokenMintEvent(ev);
  if (!mint) {
    console.log(`${LOG_PREFIX} TOKEN_MINT without mint`, {
      signature: ev.signature,
    });
    return;
  }

  const creatorWallet = process.env.AUTO_MARKET_CREATOR_WALLET?.trim();
  if (!creatorWallet) {
    console.log(`${LOG_PREFIX} AUTO_MARKET_CREATOR_WALLET missing; skip auto-market`);
    return;
  }

  const existing = await prisma.market.findFirst({
    where: { tokenMint: mint },
  });
  if (existing) {
    console.log(`${LOG_PREFIX} market already exists for mint`, { mint });
    return;
  }

  const pair = await fetchDexscreenerPair(mint);
  let tokenName: string | null = null;
  let tokenTicker: string | null = null;
  let openPrice: string | null = null;
  let openLiquidity: string | null = null;

  if (pair) {
    const base = pair.baseToken;
    if (isRecord(base)) {
      if (typeof base.name === "string") tokenName = base.name;
      if (typeof base.symbol === "string") tokenTicker = base.symbol;
    }
    const pu = pair.priceUsd;
    if (typeof pu === "string" || typeof pu === "number") {
      openPrice = String(pu);
    }
    const liq = pair.liquidity;
    if (isRecord(liq) && liq.usd != null) {
      openLiquidity = String(liq.usd);
    }
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ONE_HOUR_SECONDS * 1000);

  let market: DbMarket;
  try {
    market = await prisma.market.create({
      data: {
        tokenMint: mint,
        tokenName,
        tokenTicker,
        creatorWallet,
        durationSeconds: ONE_HOUR_SECONDS,
        expiresAt,
        openPrice,
        openLiquidity,
        devWallet: null,
        status: "active",
        outcome: null,
        onChainAddress: null,
        currency: "usdc",
      },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      console.log(`${LOG_PREFIX} active market already exists for mint (unique index)`, {
        mint,
      });
      return;
    }
    throw e;
  }

  console.log(`${LOG_PREFIX} auto-created 1h market`, {
    marketId: market.id,
    mint,
    tokenName,
  });

  try {
    emitNewToken({
      tokenMint: mint,
      tokenName,
    });
  } catch (e) {
    console.log(`${LOG_PREFIX} emitNewToken failed`, {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function handleTransferEvent(ev: Record<string, unknown>): Promise<void> {
  const senders = collectTransferSenders(ev);
  if (senders.length === 0) return;

  for (const wallet of senders) {
    let rows: DbMarket[];
    try {
      rows = await prisma.market.findMany({
        where: {
          status: "active",
          OR: [{ devWallet: wallet }, { creatorWallet: wallet }],
        },
      });
    } catch (e) {
      console.log(`${LOG_PREFIX} DB lookup failed (transfer)`, {
        wallet,
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    for (const row of rows) {
      try {
        const dto = toMarketDto(row);
        const rug = await detectRug(dto);
        if (!rug.isRug) continue;
        await resolveActiveMarketAsRug(row, dto, rug);
      } catch (e) {
        console.log(`${LOG_PREFIX} immediate rug check failed`, {
          marketId: row.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
}

async function processHeliusPayload(body: unknown): Promise<void> {
  const records = extractEventRecords(body);
  if (records.length === 0) {
    console.log(`${LOG_PREFIX} empty events`);
    return;
  }

  for (const ev of records) {
    const t = eventTypeOf(ev);
    try {
      if (t === "TOKEN_MINT") {
        await handleTokenMintEvent(ev);
      } else if (t === "TRANSFER") {
        await handleTransferEvent(ev);
      }
    } catch (e) {
      console.log(`${LOG_PREFIX} event handler error`, {
        type: t,
        signature: ev.signature,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

function parseWebhookBody(req: Request): unknown {
  const raw = req.body as unknown;
  if (Buffer.isBuffer(raw)) {
    const s = raw.toString("utf8");
    if (s.trim() === "") return {};
    return JSON.parse(s) as unknown;
  }
  if (typeof raw === "string") {
    if (raw.trim() === "") return {};
    return JSON.parse(raw) as unknown;
  }
  return raw;
}

function heliusWebhookPost(req: Request, res: Response): void {
  if (!verifyHeliusWebhook(req)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  res.status(200).json({ ok: true });

  void (async () => {
    try {
      const parsed = parseWebhookBody(req);
      await processHeliusPayload(parsed);
    } catch (e) {
      console.log(`${LOG_PREFIX} async processing failed`, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  })();
}

/**
 * Router with `POST /helius`. Uses raw JSON body for optional future HMAC verification.
 * Mount at `/webhook` so the path is `/webhook/helius`.
 */
export function createHeliusWebhookRouter(): Router {
  const router = Router();
  router.post(
    "/helius",
    express.raw({ limit: "2mb" }),
    heliusWebhookPost,
  );
  return router;
}

/**
 * Registers (creates) a Helius webhook watching Pump.fun for TOKEN_MINT + TRANSFER.
 * Call once on server startup when `HELIUS_WEBHOOK_URL` is public HTTPS.
 */
export async function registerHeliusWebhook(): Promise<void> {
  const apiKey = process.env.HELIUS_API_KEY?.trim();
  const webhookURL = process.env.HELIUS_WEBHOOK_URL?.trim();
  const authHeader = process.env.HELIUS_WEBHOOK_AUTH_SECRET?.trim();

  if (!apiKey || !webhookURL || !authHeader) {
    console.log(`${LOG_PREFIX} registerHeliusWebhook skipped (missing HELIUS_API_KEY, HELIUS_WEBHOOK_URL, or HELIUS_WEBHOOK_AUTH_SECRET)`);
    return;
  }

  try {
    const helius = createHelius({ apiKey, network: "mainnet" });
    const webhook = await helius.webhooks.create({
      webhookURL,
      transactionTypes: ["TOKEN_MINT", "TRANSFER"],
      accountAddresses: [PUMP_FUN_PROGRAM_ADDRESS],
      authHeader,
      webhookType: "enhanced",
    });

    console.log(`${LOG_PREFIX} registered Helius webhook`, {
      webhookID: webhook.webhookID,
      url: webhook.webhookURL,
    });
  } catch (e) {
    console.log(`${LOG_PREFIX} registerHeliusWebhook failed`, {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
