"use client";

import type { Market, TokenPair } from "@survivefun/types";
import { useQueries } from "@tanstack/react-query";

import { fetchTokenFromApi, tokenQueryKey } from "@/hooks/useToken";

/**
 * Fetches DexScreener pair data for many markets in parallel (cached per mint).
 */
export function useMarketPairsMap(markets: Market[]) {
  const results = useQueries({
    queries: markets.map((m) => ({
      queryKey: tokenQueryKey(m.tokenMint),
      queryFn: () => fetchTokenFromApi(m.tokenMint),
      staleTime: 25_000,
      gcTime: 120_000,
    })),
  });

  const pairByMint = new Map<string, TokenPair | null>();
  markets.forEach((m, i) => {
    const row = results[i]?.data;
    pairByMint.set(m.tokenMint, row?.pair ?? null);
  });

  const pairsLoading = results.some((r) => r.isPending);

  return { pairByMint, pairsLoading };
}
