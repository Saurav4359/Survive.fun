"use client";

import type { ApiResponse, Token, TokenPair } from "@survivefun/types";
import { useQuery } from "@tanstack/react-query";

import { apiV1Url } from "@/utils/constants";

export const tokenQueryKey = (mint: string) => ["api-token", mint] as const;

function parseNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function fetchTokenFromApi(mint: string): Promise<{
  pair: TokenPair | null;
  notFound: boolean;
}> {
  const res = await fetch(apiV1Url(`/tokens/${encodeURIComponent(mint)}`));
  if (res.status === 404) {
    return { pair: null, notFound: true };
  }
  if (!res.ok) {
    throw new Error(`Token request failed (${res.status})`);
  }
  const body = (await res.json()) as ApiResponse<TokenPair>;
  if (!body.success) {
    throw new Error(body.error.message || "Token request failed");
  }
  return { pair: body.data, notFound: false };
}

export type UseTokenResult = {
  token: Token | null;
  /** Parsed for math/charts; prefer `priceUsdText` for UI to avoid float rounding. */
  price: number | null;
  /** Raw `pair.priceUsd` from API — use with `formatUsdPriceLiteral` for display. */
  priceUsdText: string | null;
  priceChange24h: number | null;
  liquidity: number | null;
  devWallet: string | null;
  holderCount: number | null;
  marketCap: number | null;
  pair: TokenPair | null;
  isLoading: boolean;
  error: Error | null;
  notFound: boolean;
};

export function useToken(mint: string | undefined): UseTokenResult {
  const query = useQuery({
    queryKey: mint ? tokenQueryKey(mint) : ["api-token", "none"],
    queryFn: () => fetchTokenFromApi(mint!),
    enabled: Boolean(mint),
    staleTime: 25_000,
    gcTime: 60_000,
    retry: (failureCount, err) => {
      if (err instanceof Error && /404/i.test(err.message)) return false;
      return failureCount < 2;
    },
  });

  const data = query.data;
  const pair = data?.pair ?? null;

  const token: Token | null = pair
    ? {
        address: pair.baseToken.address,
        name: pair.baseToken.name,
        symbol: pair.baseToken.symbol,
      }
    : null;

  const priceUsdText =
    pair?.priceUsd != null && String(pair.priceUsd).trim() !== ""
      ? String(pair.priceUsd).trim()
      : null;
  const price = priceUsdText != null ? parseNum(priceUsdText) : null;
  const priceChange24h =
    pair?.priceChange?.h24 != null
      ? pair.priceChange.h24
      : pair?.birdeyePriceChange24hPercent != null
        ? pair.birdeyePriceChange24hPercent
        : null;
  const liquidity =
    pair?.liquidity?.usd != null ? pair.liquidity.usd : null;
  const devWallet = pair?.devWallet ?? null;
  const holderCount = pair?.holderCount ?? null;
  const marketCap = pair?.marketCap ?? null;

  return {
    token,
    price,
    priceUsdText,
    priceChange24h,
    liquidity,
    devWallet,
    holderCount,
    marketCap,
    pair,
    isLoading: query.isPending,
    error: query.error instanceof Error ? query.error : null,
    notFound: Boolean(data?.notFound),
  };
}
