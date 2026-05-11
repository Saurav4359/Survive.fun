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
  for (const key of ["creatorAddress", "owner", "devWallet", "creator"] as const) {
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
  /** Top pairs used for averaged snapshot (1–3). */
  pairsChecked: number;
  avgOpenPrice: number | null;
  avgOpenLiquidityUsd: number | null;
};

export function pairsSliceWithPrices(body: unknown): Record<string, unknown>[] {
  if (!isRecord(body)) return [];
  const pairs = body.pairs;
  if (!Array.isArray(pairs)) return [];
  const out: Record<string, unknown>[] = [];
  for (const raw of pairs.slice(0, 3)) {
    if (!isRecord(raw)) continue;
    const p = parseNumber(raw.priceUsd);
    if (p != null && Number.isFinite(p) && p > 0) {
      out.push(raw);
    }
  }
  return out;
}

/**
 * Snapshot at creation: first Dex pair for labels/dev; average price & liquidity over up to 3 pairs with valid priceUsd.
 */
export function dexBodyToMarketBootstrap(body: unknown, mint: string): MarketTokenBootstrap | null {
  const priced = pairsSliceWithPrices(body);
  if (priced.length === 0) return null;

  let sumPrice = 0;
  let sumLiq = 0;
  let liqCount = 0;
  for (const p of priced) {
    const pu = parseNumber(p.priceUsd);
    if (pu != null && Number.isFinite(pu)) sumPrice += pu;
    const liq = p.liquidity;
    const lu = isRecord(liq) ? parseNumber(liq.usd) : null;
    if (lu != null && Number.isFinite(lu) && lu >= 0) {
      sumLiq += lu;
      liqCount += 1;
    }
  }

  const avgPrice = sumPrice / priced.length;
  const avgLiq = liqCount > 0 ? sumLiq / liqCount : null;

  const first = priced[0]!;
  const base = first.baseToken;
  let tokenName: string | null = null;
  let tokenTicker: string | null = null;
  if (isRecord(base)) {
    if (typeof base.name === "string") tokenName = base.name;
    if (typeof base.symbol === "string") tokenTicker = base.symbol;
  }

  return {
    tokenName,
    tokenTicker,
    openPrice: String(avgPrice),
    openLiquidity: avgLiq != null ? String(avgLiq) : null,
    devWallet: extractDevWallet(first),
    pairsChecked: priced.length,
    avgOpenPrice: avgPrice,
    avgOpenLiquidityUsd: avgLiq,
  };
}

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
    pairsChecked: 1,
    avgOpenPrice: priceUsd ?? null,
    avgOpenLiquidityUsd: liqUsd,
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

/** Full Dex JSON for POST /markets snapshot + on-chain args (multi-pair averages). */
export async function requireDexBodyForMint(mint: string): Promise<unknown> {
  const body = await fetchDexTokenJson(mint);
  const priced = pairsSliceWithPrices(body);
  if (priced.length === 0) {
    throw new AppError("TOKEN_NOT_FOUND", "No DexScreener pair for this mint", 404);
  }
  return body;
}

/** Rug detection: averaged metrics from same multi-pair slice as market snapshot (max 3 pairs). */
export function aggregateTopDexPairs(body: unknown): {
  avgPrice: number;
  avgLiquidity: number | null;
  pairsChecked: number;
} | null {
  const priced = pairsSliceWithPrices(body);
  if (priced.length === 0) return null;

  let sumPrice = 0;
  let sumLiq = 0;
  let liqCount = 0;
  for (const p of priced) {
    const pu = parseNumber(p.priceUsd);
    if (pu != null && Number.isFinite(pu)) sumPrice += pu;
    const liq = p.liquidity;
    const lu = isRecord(liq) ? parseNumber(liq.usd) : null;
    if (lu != null && Number.isFinite(lu) && lu >= 0) {
      sumLiq += lu;
      liqCount += 1;
    }
  }

  const avgPrice = sumPrice / priced.length;
  const avgLiq = liqCount > 0 ? sumLiq / liqCount : null;

  return {
    avgPrice,
    avgLiquidity: avgLiq,
    pairsChecked: priced.length,
  };
}

/** Safe Dex fetch + aggregate for rug detector (null on any failure — caller treats as API outage). */
export async function fetchDexAggregatesForMint(mint: string): Promise<{
  avgPrice: number;
  avgLiquidity: number | null;
  pairsChecked: number;
} | null> {
  try {
    const body = await fetchDexTokenJson(mint);
    if (body == null) return null;
    return aggregateTopDexPairs(body);
  } catch (e) {
    console.error("[dexscreener] fetchDexAggregatesForMint failed", {
      mint,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
