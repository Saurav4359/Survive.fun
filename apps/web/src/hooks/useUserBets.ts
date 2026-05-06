"use client";

import type { ApiResponse, BetWithMarket } from "@survivefun/types";
import { useQuery } from "@tanstack/react-query";

import { API_URL } from "@/utils/constants";

export const userBetsQueryKey = (wallet: string) =>
  ["user-bets", wallet] as const;

async function fetchUserBets(wallet: string): Promise<BetWithMarket[]> {
  const res = await fetch(
    `${API_URL}/v1/users/${encodeURIComponent(wallet)}/bets`,
  );
  if (!res.ok) {
    throw new Error(`Bets request failed (${res.status})`);
  }
  const body = (await res.json()) as ApiResponse<BetWithMarket[]>;
  if (!body.success) {
    throw new Error(body.error.message || "Bets request failed");
  }
  return body.data;
}

export function useUserBets(wallet: string | undefined): {
  bets: BetWithMarket[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: wallet ? userBetsQueryKey(wallet) : ["user-bets", "none"],
    queryFn: () => fetchUserBets(wallet!),
    enabled: Boolean(wallet?.trim()),
    staleTime: 15_000,
  });

  return {
    bets: q.data ?? [],
    isLoading: q.isPending,
    error: q.error instanceof Error ? q.error : null,
    refetch: () => {
      void q.refetch();
    },
  };
}
