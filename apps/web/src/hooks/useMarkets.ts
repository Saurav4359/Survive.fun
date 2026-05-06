"use client";

import type { ApiResponse, Market } from "@survivefun/types";
import { useQuery } from "@tanstack/react-query";

import { API_URL } from "@/utils/constants";

export const marketsQueryKey = ["markets", "active"] as const;

export async function fetchActiveMarkets(): Promise<Market[]> {
  const res = await fetch(`${API_URL}/v1/markets`);
  if (!res.ok) {
    throw new Error(`Markets request failed (${res.status})`);
  }
  const body = (await res.json()) as ApiResponse<Market[]>;
  if (!body.success) {
    throw new Error(body.error.message || "Markets request failed");
  }
  return body.data;
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
