import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

import { RPC_URL, USDC_MINT } from "@/utils/constants";

export function walletBalancesQueryKey(walletAddress: string | null) {
  return ["wallet-balances", walletAddress, RPC_URL] as const;
}

export function useWalletBalances() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const address = publicKey?.toBase58() ?? null;

  return useQuery({
    queryKey: walletBalancesQueryKey(address),
    enabled: Boolean(publicKey),
    staleTime: 15_000,
    queryFn: async () => {
      if (!publicKey) {
        throw new Error("Wallet not connected");
      }

      const ata = getAssociatedTokenAddressSync(
        USDC_MINT,
        publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      const [lamports, tokenBal] = await Promise.all([
        connection.getBalance(publicKey, "confirmed"),
        connection.getTokenAccountBalance(ata).catch(() => null),
      ]);

      let usdc = 0;
      if (tokenBal != null) {
        const v = tokenBal.value;
        if (v.uiAmount != null) {
          usdc = v.uiAmount;
        } else {
          const raw = Number(v.amount);
          usdc = Number.isFinite(raw) ? raw / 10 ** v.decimals : 0;
        }
      }

      return {
        sol: lamports / LAMPORTS_PER_SOL,
        usdc: Number.isFinite(usdc) ? usdc : 0,
      };
    },
  });
}
