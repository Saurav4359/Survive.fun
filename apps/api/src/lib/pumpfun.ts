import type { TokenPair } from "@survivefun/types";
import axios from "axios";

import type { MarketTokenBootstrap } from "./dexscreener";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isProbableSolanaAddress(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());
}

/**
 * Pump.fun public coin API — works for brand-new tokens before DexScreener indexes them.
 * @throws On network errors or non-2xx (caller may catch and fall through to Dex/Helius).
 */
export async function fetchPumpFunData(mint: string): Promise<unknown> {
  const res = await axios.get(
    `https://frontend-api.pump.fun/coins/${encodeURIComponent(mint)}`,
    { timeout: 15_000, validateStatus: () => true },
  );
  if (res.status !== 200) {
    throw new Error(`Pump.fun API HTTP ${res.status}`);
  }
  return res.data;
}

/** Best-effort: never throws. */
export function pumpFunRecordToMarketBootstrap(
  data: unknown,
  _mint: string,
): MarketTokenBootstrap | null {
  if (!isRecord(data)) return null;

  const name = typeof data.name === "string" ? data.name.trim() : null;
  const symbol = typeof data.symbol === "string" ? data.symbol.trim() : null;
  const creatorRaw = typeof data.creator === "string" ? data.creator.trim() : "";
  const devWallet = isProbableSolanaAddress(creatorRaw) ? creatorRaw : null;

  const usdMcap = parseFiniteNumber(data.usd_market_cap);
  const virtualSol = parseFiniteNumber(data.virtual_sol_reserves);

  let openPrice: string | null = null;
  let avgOpenPrice: number | null = null;
  const explicitPriceUsd = parseFiniteNumber(data.price_usd);
  const explicitPrice = parseFiniteNumber(data.price);
  const p = explicitPriceUsd ?? explicitPrice;
  if (p != null && p > 0) {
    avgOpenPrice = p;
    openPrice = String(p);
  } else if (usdMcap != null && usdMcap > 0 && virtualSol != null && virtualSol > 0) {
    const estUsdPerSolDepth = usdMcap / virtualSol;
    if (Number.isFinite(estUsdPerSolDepth) && estUsdPerSolDepth > 0) {
      avgOpenPrice = estUsdPerSolDepth;
      openPrice = String(estUsdPerSolDepth);
    }
  }

  let openLiquidity: string | null = null;
  let avgOpenLiquidityUsd: number | null = null;
  if (usdMcap != null && usdMcap > 0) {
    avgOpenLiquidityUsd = usdMcap;
    openLiquidity = String(usdMcap);
  }

  if (!name && !symbol && !devWallet && openPrice == null && openLiquidity == null) {
    return null;
  }

  return {
    tokenName: name && name.length > 0 ? name : null,
    tokenTicker: symbol && symbol.length > 0 ? symbol : null,
    openPrice,
    openLiquidity,
    devWallet,
    pairsChecked: 0,
    avgOpenPrice,
    avgOpenLiquidityUsd,
  };
}

/** DexScreener-shaped `TokenPair` for UI when only Pump.fun data exists. */
export function pumpFunRecordToTokenPair(
  mint: string,
  data: unknown,
): TokenPair | null {
  const b = pumpFunRecordToMarketBootstrap(data, mint);
  if (!b) return null;

  const usdMcap = isRecord(data) ? parseFiniteNumber(data.usd_market_cap) : null;
  const virtualSol = isRecord(data) ? parseFiniteNumber(data.virtual_sol_reserves) : null;

  let priceUsdStr: string | null = b.openPrice;
  if (priceUsdStr == null && usdMcap != null && virtualSol != null && virtualSol > 0) {
    const est = usdMcap / virtualSol;
    if (Number.isFinite(est) && est > 0) priceUsdStr = String(est);
  }

  return {
    chainId: "solana",
    dexId: "pump.fun",
    url: `https://pump.fun/coin/${encodeURIComponent(mint)}`,
    pairAddress: mint,
    labels: ["pump.fun"],
    baseToken: {
      address: mint,
      name: b.tokenName ?? "Unknown",
      symbol: b.tokenTicker ?? "???",
    },
    quoteToken: { address: "SOL", name: "SOL", symbol: "SOL" },
    priceNative: "0",
    priceUsd: priceUsdStr,
    txns: {
      m5: { buys: 0, sells: 0 },
      h1: { buys: 0, sells: 0 },
      h6: { buys: 0, sells: 0 },
      h24: { buys: 0, sells: 0 },
    },
    volume: { h24: 0, h6: 0, h1: 0, m5: 0 },
    priceChange: { m5: null, h1: null, h6: null, h24: null },
    liquidity:
      usdMcap != null && usdMcap > 0
        ? { usd: usdMcap, base: 0, quote: 0 }
        : null,
    fdv: usdMcap,
    marketCap: usdMcap,
    pairCreatedAt: null,
    devWallet: b.devWallet,
  };
}
