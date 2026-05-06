"use client";

import type { ApiResponse, PlatformSnapshot } from "@survivefun/types";
import { useQuery } from "@tanstack/react-query";

import { API_URL } from "@/utils/constants";

export const statsQueryKey = ["platform-stats"] as const;

export async function fetchStats(): Promise<PlatformSnapshot> {
  const res = await fetch(`${API_URL}/v1/stats`);
  if (!res.ok) {
    throw new Error(`Stats request failed (${res.status})`);
  }
  const body = (await res.json()) as ApiResponse<PlatformSnapshot>;
  if (!body.success) {
    throw new Error(body.error.message || "Stats request failed");
  }
  return body.data;
}

export function useStats(): {
  stats: PlatformSnapshot | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const q = useQuery({
    queryKey: statsQueryKey,
    queryFn: fetchStats,
    staleTime: 20_000,
  });

  return {
    stats: q.data,
    isLoading: q.isPending,
    error: q.error instanceof Error ? q.error : null,
  };
}
