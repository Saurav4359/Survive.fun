"use client";

import type { ApiResponse, MyPayoutPayload } from "@survivefun/types";
import { useQuery } from "@tanstack/react-query";

import { apiV1Url } from "@/utils/constants";

export const myPayoutQueryKey = (marketId: string, wallet: string) =>
  ["my-payout", marketId, wallet] as const;

async function fetchMyPayout(
  marketId: string,
  wallet: string,
): Promise<MyPayoutPayload> {
  const qs = new URLSearchParams({ wallet });
  const res = await fetch(
    `${apiV1Url(`/markets/${encodeURIComponent(marketId)}/my-payout`)}?${qs.toString()}`,
  );
  const body = (await res.json()) as ApiResponse<MyPayoutPayload>;
  if (!res.ok || !body.success) {
    const msg = !body.success
      ? body.error.message
      : `My payout failed (${res.status})`;
    throw new Error(msg);
  }
  return body.data;
}

export function useMyPayout(
  marketId: string | undefined,
  wallet: string | undefined,
  enabled: boolean,
): {
  data: MyPayoutPayload | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const q = useQuery({
    queryKey:
      marketId && wallet
        ? myPayoutQueryKey(marketId, wallet)
        : ["my-payout", "none"],
    queryFn: () => fetchMyPayout(marketId!, wallet!),
    enabled: Boolean(marketId?.trim() && wallet?.trim()) && enabled,
    staleTime: 5000,
  });

  return {
    data: q.data,
    isLoading: q.isPending,
    error: q.error instanceof Error ? q.error : null,
  };
}
