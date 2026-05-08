"use client";

import type {
  ApiResponse,
  LeaderboardRow,
  LeaderboardTab,
} from "@survivefun/types";
import { useQuery } from "@tanstack/react-query";

import { apiV1Url } from "@/utils/constants";

export const leaderboardQueryKey = (tab: LeaderboardTab) =>
  ["leaderboard", tab] as const;

export async function fetchLeaderboard(
  tab: LeaderboardTab,
): Promise<LeaderboardRow[]> {
  const params = new URLSearchParams({ tab });
  const res = await fetch(
    `${apiV1Url("/leaderboard")}?${params.toString()}`,
  );
  if (!res.ok) {
    throw new Error(`Leaderboard request failed (${res.status})`);
  }
  const body = (await res.json()) as ApiResponse<LeaderboardRow[]>;
  if (!body.success) {
    throw new Error(body.error.message || "Leaderboard request failed");
  }
  return body.data;
}

export function useLeaderboard(tab: LeaderboardTab): {
  rows: LeaderboardRow[];
  isLoading: boolean;
  error: Error | null;
} {
  const q = useQuery({
    queryKey: leaderboardQueryKey(tab),
    queryFn: () => fetchLeaderboard(tab),
    staleTime: 60_000,
  });
  return {
    rows: q.data ?? [],
    isLoading: q.isPending,
    error: q.error instanceof Error ? q.error : null,
  };
}
