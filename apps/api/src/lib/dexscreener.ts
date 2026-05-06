import axios from "axios";

import { AppError } from "../middleware/errorHandler";

const DEXSCREENER_TOKEN_URL =
  "https://api.dexscreener.com/latest/dex/tokens";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function fetchDexTokenJson(mint: string): Promise<unknown> {
  const url = `${DEXSCREENER_TOKEN_URL}/${encodeURIComponent(mint)}`;
  try {
    const res = await axios.get<unknown>(url, {
      timeout: 15_000,
      validateStatus: () => true,
    });
    if (res.status === 404) {
      return null;
    }
    if (res.status !== 200) {
      throw new AppError(
        "DEXSCREENER_ERROR",
        `DexScreener returned HTTP ${res.status}`,
        502,
      );
    }
    return res.data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AppError("DEXSCREENER_ERROR", `DexScreener request failed: ${msg}`, 502);
  }
}

export function firstPairFromDexBody(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body)) return null;
  const pairs = body.pairs;
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const first = pairs[0];
  return isRecord(first) ? first : null;
}

function parseNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractDevWallet(pair: Record<string, unknown>): string | null {
  const info = pair.info;
  if (!isRecord(info)) return null;
  for (const key of ["creatorAddress", "owner", "devWallet"] as const) {
    const v = info[key];
    if (typeof v === "string" && v.length >= 32 && v.length <= 44) {
      return v.trim();
    }
  }
  return null;
}

export type MarketTokenBootstrap = {
  tokenName: string | null;
  tokenTicker: string | null;
  openPrice: string | null;
  openLiquidity: string | null;
  devWallet: string | null;
};

export function pairToMarketBootstrap(
  pair: Record<string, unknown>,
  mint: string,
): MarketTokenBootstrap {
  const base = pair.baseToken;
  let tokenName: string | null = null;
  let tokenTicker: string | null = null;
  if (isRecord(base)) {
    if (typeof base.name === "string") tokenName = base.name;
    if (typeof base.symbol === "string") tokenTicker = base.symbol;
  }

  const priceUsd = parseNumber(pair.priceUsd);
  const liq = pair.liquidity;
  let liqUsd: number | null = null;
  if (isRecord(liq)) {
    liqUsd = parseNumber(liq.usd);
  }

  return {
    tokenName,
    tokenTicker,
    openPrice: priceUsd !== null ? String(priceUsd) : null,
    openLiquidity: liqUsd !== null ? String(liqUsd) : null,
    devWallet: extractDevWallet(pair),
  };
}

/** Ensures mint appears on DexScreener; throws 404 AppError if not. */
export async function requireDexPairForMint(
  mint: string,
): Promise<Record<string, unknown>> {
  const body = await fetchDexTokenJson(mint);
  const pair = firstPairFromDexBody(body);
  if (!pair) {
    throw new AppError("TOKEN_NOT_FOUND", "No DexScreener pair for this mint", 404);
  }
  return pair;
}
