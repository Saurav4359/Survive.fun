import type {
  Token,
  TokenLiquidity,
  TokenPair,
} from "@survivefun/types";

import { normalizeDexUnixSeconds } from "./unixSecondsNormalize";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parseNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readToken(raw: unknown, fallbackMint: string): Token {
  if (!isRecord(raw)) {
    return { address: fallbackMint, name: "Unknown", symbol: "???" };
  }
  const address =
    typeof raw.address === "string" && raw.address.length > 0
      ? raw.address
      : fallbackMint;
  return {
    address,
    name: typeof raw.name === "string" ? raw.name : "Unknown",
    symbol: typeof raw.symbol === "string" ? raw.symbol : "???",
  };
}

function readTxnSlice(raw: unknown): { buys: number; sells: number } {
  if (!isRecord(raw)) return { buys: 0, sells: 0 };
  return {
    buys: parseNum(raw.buys),
    sells: parseNum(raw.sells),
  };
}

function readLiquidity(raw: unknown): TokenLiquidity | null {
  if (!isRecord(raw)) return null;
  return {
    usd: parseNumOrNull(raw.usd),
    base: parseNum(raw.base),
    quote: parseNum(raw.quote),
  };
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

/** Maps a DexScreener pair object into our `TokenPair` DTO. */
export function mapDexRecordToTokenPair(
  pair: Record<string, unknown>,
  mint: string,
): TokenPair {
  const baseToken = readToken(pair.baseToken, mint);
  const quoteToken = readToken(pair.quoteToken, "");

  const txnsRaw = pair.txns;
  const txns = isRecord(txnsRaw)
    ? {
        m5: readTxnSlice(txnsRaw.m5),
        h1: readTxnSlice(txnsRaw.h1),
        h6: readTxnSlice(txnsRaw.h6),
        h24: readTxnSlice(txnsRaw.h24),
      }
    : {
        m5: { buys: 0, sells: 0 },
        h1: { buys: 0, sells: 0 },
        h6: { buys: 0, sells: 0 },
        h24: { buys: 0, sells: 0 },
      };

  const volumeRaw = pair.volume;
  const volume = isRecord(volumeRaw)
    ? {
        h24: parseNum(volumeRaw.h24),
        h6: parseNum(volumeRaw.h6),
        h1: parseNum(volumeRaw.h1),
        m5: parseNum(volumeRaw.m5),
      }
    : { h24: 0, h6: 0, h1: 0, m5: 0 };

  const priceChangeRaw = pair.priceChange;
  const priceChange = isRecord(priceChangeRaw)
    ? {
        m5: parseNumOrNull(priceChangeRaw.m5),
        h1: parseNumOrNull(priceChangeRaw.h1),
        h6: parseNumOrNull(priceChangeRaw.h6),
        h24: parseNumOrNull(priceChangeRaw.h24),
      }
    : { m5: null, h1: null, h6: null, h24: null };

  const labels = pair.labels;
  const labelsOut =
    Array.isArray(labels) && labels.every((x) => typeof x === "string")
      ? (labels as string[])
      : null;

  return {
    chainId: typeof pair.chainId === "string" ? pair.chainId : "solana",
    dexId: typeof pair.dexId === "string" ? pair.dexId : "unknown",
    url: typeof pair.url === "string" ? pair.url : "",
    pairAddress:
      typeof pair.pairAddress === "string" ? pair.pairAddress : "",
    labels: labelsOut,
    baseToken,
    quoteToken,
    priceNative:
      typeof pair.priceNative === "string" ? pair.priceNative : "0",
    priceUsd:
      typeof pair.priceUsd === "string"
        ? pair.priceUsd
        : pair.priceUsd === null
          ? null
          : String(pair.priceUsd),
    txns,
    volume,
    priceChange,
    liquidity: readLiquidity(pair.liquidity),
    fdv: parseNumOrNull(pair.fdv),
    marketCap: parseNumOrNull(pair.marketCap),
    pairCreatedAt: normalizeDexUnixSeconds(
      typeof pair.pairCreatedAt === "number"
        ? pair.pairCreatedAt
        : typeof pair.pairCreatedAt === "string"
          ? Number.parseInt(pair.pairCreatedAt, 10)
          : null,
    ),
    devWallet: extractDevWallet(pair),
  };
}
