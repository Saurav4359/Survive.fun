"use client";

import type { ApiResponse, Market, MarketListPage } from "@survivefun/types";
import { useQuery } from "@tanstack/react-query";

import { apiV1Url } from "@/utils/constants";

export const marketsQueryKey = ["markets", "active"] as const;

const DEFAULT_LIST_LIMIT = 100;

export async function fetchActiveMarkets(): Promise<Market[]> {
  const params = new URLSearchParams({
    page: "1",
    limit: String(DEFAULT_LIST_LIMIT),
  });
  const res = await fetch(`${apiV1Url("/markets/active")}?${params}`);
  if (!res.ok) {
    throw new Error(`Markets request failed (${res.status})`);
  }
  const body = (await res.json()) as ApiResponse<MarketListPage>;
  if (!body.success) {
    throw new Error(body.error.message || "Markets request failed");
  }
  return body.data.items;
}

export function useMarkets(): {
  markets: Market[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: marketsQueryKey,
    queryFn: fetchActiveMarkets,
    staleTime: 15_000,
  });

  return {
    markets: q.data ?? [],
    isLoading: q.isPending,
    error: q.error instanceof Error ? q.error : null,
    refetch: () => {
      void q.refetch();
    },
  };
}
