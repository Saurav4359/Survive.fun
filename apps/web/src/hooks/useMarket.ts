"use client";

import type { ApiResponse, Market } from "@survivefun/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { apiV1Url } from "@/utils/constants";

import { useWebSocket } from "./useWebSocket";

export const marketQueryKey = (marketId: string) => ["market", marketId] as const;

async function fetchMarket(marketId: string): Promise<Market> {
  let res: Response;
  try {
    res = await fetch(apiV1Url(`/markets/${encodeURIComponent(marketId)}`));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    throw new Error(msg);
  }

  if (res.status === 404) {
    throw new Error("Market not found");
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("Failed to parse market response");
  }

  if (!res.ok) {
    const parsed = body as ApiResponse<Market>;
    const msg =
      parsed && typeof parsed === "object" && "success" in parsed && !parsed.success
        ? parsed.error.message
        : `Market request failed (${res.status})`;
    throw new Error(msg);
  }

  if (!body || typeof body !== "object") {
    throw new Error("Invalid market response");
  }

  const parsed = body as ApiResponse<Market>;

  if (!parsed.success) {
    throw new Error(parsed.error.message || "Market request failed");
  }

  if (!parsed.data || typeof parsed.data !== "object" || !("id" in parsed.data)) {
    throw new Error("Invalid market payload");
  }

  return parsed.data;
}

function mergeMarketPatch(
  prev: Market | undefined,
  patch: Partial<Market>,
): Market | undefined {
  if (!prev) return prev;
  return { ...prev, ...patch };
}

export function useMarket(marketId: string | undefined): {
  market: Market | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const queryClient = useQueryClient();
  const {
    subscribeToMarket,
    latestBet,
    poolUpdate,
    marketResolved,
  } = useWebSocket();

  const query = useQuery({
    queryKey: marketId ? marketQueryKey(marketId) : ["market", "none"],
    queryFn: () => fetchMarket(marketId!),
    enabled: Boolean(marketId),
    refetchInterval: 10_000,
    staleTime: 0,
    retry: (failureCount, err) => {
      if (err instanceof Error && /404|not found/i.test(err.message)) {
        return false;
      }
      return failureCount < 2;
    },
  });

  useEffect(() => {
    if (!marketId) return;
    subscribeToMarket(marketId);
  }, [marketId, subscribeToMarket]);

  useEffect(() => {
    if (!marketId || !latestBet || latestBet.marketId !== marketId) return;
    queryClient.setQueryData<Market>(marketQueryKey(marketId), (prev) =>
      mergeMarketPatch(prev, {
        survivePool: latestBet.survivePool,
        rugPool: latestBet.rugPool,
      }),
    );
  }, [latestBet, marketId, queryClient]);

  useEffect(() => {
    if (!marketId || !poolUpdate || poolUpdate.marketId !== marketId) return;
    queryClient.setQueryData<Market>(marketQueryKey(marketId), (prev) =>
      mergeMarketPatch(prev, {
        survivePool: poolUpdate.survivePool,
        rugPool: poolUpdate.rugPool,
      }),
    );
  }, [poolUpdate, marketId, queryClient]);

  useEffect(() => {
    if (!marketId || !marketResolved || marketResolved.marketId !== marketId) {
      return;
    }
    queryClient.setQueryData<Market>(marketQueryKey(marketId), (prev) =>
      mergeMarketPatch(prev, {
        status: "resolved",
        outcome: marketResolved.outcome,
        survivePool: marketResolved.survivePool,
        rugPool: marketResolved.rugPool,
        rugCondition:
          marketResolved.rugCondition !== undefined
            ? marketResolved.rugCondition
            : prev?.rugCondition ?? null,
      }),
    );
  }, [marketResolved, marketId, queryClient]);

  return {
    market: query.data,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
