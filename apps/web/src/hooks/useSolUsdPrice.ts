"use client";

import { useQuery } from "@tanstack/react-query";

const COINGECKO_SOL_USD =
  "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";

export function useSolUsdPrice(): {
  usd: number | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const q = useQuery({
    queryKey: ["sol-usd-coingecko"],
    queryFn: async () => {
      const res = await fetch(COINGECKO_SOL_USD);
      if (!res.ok) {
        throw new Error(`SOL price request failed (${res.status})`);
      }
      const j = (await res.json()) as {
        solana?: { usd?: number };
      };
      const n = j.solana?.usd;
      if (typeof n !== "number" || !Number.isFinite(n)) {
        throw new Error("Invalid SOL price payload");
      }
      return n;
    },
    staleTime: 60_000,
    retry: 1,
  });

  return {
    usd: q.data,
    isLoading: q.isPending,
    error: q.error instanceof Error ? q.error : null,
  };
}
