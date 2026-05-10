import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { RPC_URL } from "@/utils/constants";

/** Lamports → display SOL with exactly 4 fractional digits (JetBrains Mono in UI). */
export function solToDisplay(lamports: bigint | number): string {
  const n =
    typeof lamports === "bigint"
      ? Number(lamports) / LAMPORTS_PER_SOL
      : lamports / LAMPORTS_PER_SOL;
  if (!Number.isFinite(n)) return "0.0000";
  return n.toFixed(4);
}

export function walletBalancesQueryKey(walletAddress: string | null) {
  return ["wallet-balances", walletAddress, RPC_URL] as const;
}

export function useWalletBalances() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const address = publicKey?.toBase58() ?? null;

  const query = useQuery({
    queryKey: walletBalancesQueryKey(address),
    enabled: Boolean(publicKey),
    staleTime: 15_000,
    queryFn: async () => {
      if (!publicKey) {
        throw new Error("Wallet not connected");
      }

      const lamports = await connection.getBalance(publicKey, "confirmed");

      return {
        lamports,
        sol: lamports / LAMPORTS_PER_SOL,
      };
    },
  });

  const { refetch } = query;

  useEffect(() => {
    if (!publicKey) return;
    const interval = setInterval(() => {
      void refetch();
    }, 30_000);
    return () => clearInterval(interval);
  }, [publicKey, refetch]);

  return query;
}
