"use client";

import type { ApiResponse, Token, TokenPair } from "@survivefun/types";
import { useQuery } from "@tanstack/react-query";

import { API_URL } from "@/utils/constants";

export const tokenQueryKey = (mint: string) => ["api-token", mint] as const;

function parseNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function fetchTokenFromApi(mint: string): Promise<{
  pair: TokenPair | null;
  notFound: boolean;
}> {
  const res = await fetch(`${API_URL}/v1/tokens/${encodeURIComponent(mint)}`);
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
  price: number | null;
  priceChange24h: number | null;
  liquidity: number | null;
  devWallet: string | null;
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

  const price = pair?.priceUsd != null ? parseNum(pair.priceUsd) : null;
  const priceChange24h =
    pair?.priceChange?.h24 != null ? pair.priceChange.h24 : null;
  const liquidity =
    pair?.liquidity?.usd != null ? pair.liquidity.usd : null;
  const devWallet = pair?.devWallet ?? null;
  const marketCap = pair?.marketCap ?? null;

  return {
    token,
    price,
    priceChange24h,
    liquidity,
    devWallet,
    marketCap,
    pair,
    isLoading: query.isPending,
    error: query.error instanceof Error ? query.error : null,
    notFound: Boolean(data?.notFound),
  };
}
