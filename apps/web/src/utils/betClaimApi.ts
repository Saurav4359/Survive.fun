import type { ApiResponse } from "@survivefun/types";

import { apiV1Url } from "@/utils/constants";

export async function postBetClaim(
  betId: string,
  txSignature: string,
  walletAddress: string,
): Promise<{ success: true; amount: string }> {
  const res = await fetch(apiV1Url(`/bets/${encodeURIComponent(betId)}/claim`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txSignature, walletAddress }),
  });
  const body = (await res.json()) as ApiResponse<{
    success: true;
    amount: string;
  }>;
  if (!res.ok || !body.success) {
    const msg =
      !body.success
        ? body.error.message
        : `Claim API failed (${res.status})`;
    throw new Error(msg);
  }
  return body.data;
}

export async function postReconcileClaimFromChain(
  marketId: string,
  walletAddress: string,
): Promise<{ updated: number; onChainClaimed: boolean }> {
  const res = await fetch(
    apiV1Url(`/markets/${encodeURIComponent(marketId)}/reconcile-claim`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress }),
    },
  );
  const body = (await res.json()) as ApiResponse<{
    updated: number;
    onChainClaimed: boolean;
  }>;
  if (!res.ok || !body.success) {
    const msg = !body.success
      ? body.error.message
      : `Reconcile failed (${res.status})`;
    throw new Error(msg);
  }
  return body.data;
}
