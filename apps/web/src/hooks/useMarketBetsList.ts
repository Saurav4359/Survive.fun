"use client";

import type { ApiResponse, Bet } from "@survivefun/types";
import { useQuery } from "@tanstack/react-query";

import { API_URL } from "@/utils/constants";

export const marketBetsQueryKey = (marketId: string) =>
  ["market-bets", marketId] as const;

async function fetchMarketBets(marketId: string): Promise<Bet[]> {
  const res = await fetch(
    `${API_URL}/v1/markets/${encodeURIComponent(marketId)}/bets`,
  );
  if (!res.ok) {
    throw new Error(`Market bets request failed (${res.status})`);
  }
  const body = (await res.json()) as ApiResponse<Bet[]>;
  if (!body.success) {
    throw new Error(body.error.message || "Market bets request failed");
  }
  return body.data;
}

export function useMarketBetsList(marketId: string | undefined): {
  bets: Bet[];
  isLoading: boolean;
  error: Error | null;
} {
  const q = useQuery({
    queryKey: marketId ? marketBetsQueryKey(marketId) : ["market-bets", "none"],
    queryFn: () => fetchMarketBets(marketId!),
    enabled: Boolean(marketId),
    staleTime: 10_000,
  });

  return {
    bets: q.data ?? [],
    isLoading: q.isPending,
    error: q.error instanceof Error ? q.error : null,
  };
}
