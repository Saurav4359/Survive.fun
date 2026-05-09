"use client";

import type { ApiResponse, MarketResultPayload } from "@survivefun/types";
import { useQuery } from "@tanstack/react-query";

import { apiV1Url } from "@/utils/constants";

export const marketResultQueryKey = (marketId: string) =>
  ["market-result", marketId] as const;

async function fetchMarketResult(marketId: string): Promise<MarketResultPayload> {
  const res = await fetch(
    apiV1Url(`/markets/${encodeURIComponent(marketId)}/result`),
  );
  const body = (await res.json()) as ApiResponse<MarketResultPayload>;
  if (!res.ok || !body.success) {
    const msg = !body.success
      ? body.error.message
      : `Market result failed (${res.status})`;
    throw new Error(msg);
  }
  return body.data;
}

export function useMarketResult(
  marketId: string | undefined,
  enabled: boolean,
): {
  data: MarketResultPayload | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const q = useQuery({
    queryKey: marketId ? marketResultQueryKey(marketId) : ["market-result", "none"],
    queryFn: () => fetchMarketResult(marketId!),
    enabled: Boolean(marketId?.trim()) && enabled,
    staleTime: 10_000,
  });

  return {
    data: q.data,
    isLoading: q.isPending,
    error: q.error instanceof Error ? q.error : null,
  };
}
