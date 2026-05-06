"use client";

import type { Token } from "@survivefun/types";
import { useQuery } from "@tanstack/react-query";

import { DEXSCREENER_TOKENS_URL } from "@/utils/constants";

export type UseTokenResult = {
  token: Token | null;
  price: number | null;
  priceChange24h: number | null;
  liquidity: number | null;
  devWallet: string | null;
  notFound: boolean;
};

export const tokenQueryKey = (mint: string) => ["dex-token", mint] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseToken(base: unknown, fallbackMint: string): Token | null {
  if (!isRecord(base)) return null;
  const address =
    typeof base.address === "string" ? base.address : fallbackMint;
  const name = typeof base.name === "string" ? base.name : "Unknown";
  const symbol = typeof base.symbol === "string" ? base.symbol : "???";
  return { address, name, symbol };
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
  const candidates = ["creatorAddress", "owner", "devWallet"] as const;
  for (const key of candidates) {
    const v = info[key];
    if (typeof v === "string" && v.length >= 32) return v;
  }
  return null;
}

async function fetchDexToken(mint: string): Promise<UseTokenResult> {
  let res: Response;
  try {
    const url = `${DEXSCREENER_TOKENS_URL}/${encodeURIComponent(mint)}`;
    res = await fetch(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    throw new Error(msg);
  }

  if (res.status === 404) {
    return {
      token: null,
      price: null,
      priceChange24h: null,
      liquidity: null,
      devWallet: null,
      notFound: true,
    };
  }

  if (!res.ok) {
    throw new Error(`DexScreener error (${res.status})`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("Failed to parse DexScreener response");
  }

  if (!isRecord(body)) {
    throw new Error("Invalid DexScreener payload");
  }

  const pairsRaw = body.pairs;
  if (!Array.isArray(pairsRaw) || pairsRaw.length === 0) {
    return {
      token: null,
      price: null,
      priceChange24h: null,
      liquidity: null,
      devWallet: null,
      notFound: true,
    };
  }

  const first = pairsRaw[0];
  if (!isRecord(first)) {
    throw new Error("Invalid pair entry");
  }

  const token = parseToken(first.baseToken, mint);
  const price = parseNumber(first.priceUsd);

  const priceChange = first.priceChange;
  let priceChange24h: number | null = null;
  if (isRecord(priceChange)) {
    priceChange24h = parseNumber(priceChange.h24);
  }

  const liq = first.liquidity;
  let liquidity: number | null = null;
  if (isRecord(liq)) {
    liquidity = parseNumber(liq.usd);
  }

  const devWallet = extractDevWallet(first);

  return {
    token,
    price,
    priceChange24h,
    liquidity,
    devWallet,
    notFound: token === null,
  };
}

export function useToken(mint: string | undefined): {
  token: Token | null;
  price: number | null;
  priceChange24h: number | null;
  liquidity: number | null;
  devWallet: string | null;
  isLoading: boolean;
  error: Error | null;
  notFound: boolean;
} {
  const query = useQuery({
    queryKey: mint ? tokenQueryKey(mint) : ["dex-token", "none"],
    queryFn: () => fetchDexToken(mint!),
    enabled: Boolean(mint),
    staleTime: 30_000,
    gcTime: 60_000,
    retry: (failureCount, err) => {
      if (err instanceof Error && /404/i.test(err.message)) return false;
      return failureCount < 2;
    },
  });

  const data = query.data;

  return {
    token: data?.token ?? null,
    price: data?.price ?? null,
    priceChange24h: data?.priceChange24h ?? null,
    liquidity: data?.liquidity ?? null,
    devWallet: data?.devWallet ?? null,
    isLoading: query.isPending,
    error: query.error instanceof Error ? query.error : null,
    notFound: Boolean(data?.notFound),
  };
}
