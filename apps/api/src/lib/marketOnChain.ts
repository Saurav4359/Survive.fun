import { PublicKey } from "@solana/web3.js";

import { getProgramId } from "../config/solana";

/** Market PDA for bets/resolver when `onChainAddress` is unset. */
export function marketPdaBase58ForMint(tokenMint: string): string {
  const mint = new PublicKey(tokenMint);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), mint.toBuffer()],
    getProgramId(),
  );
  return pda.toBase58();
}

export function marketPdaBase58ForDbRow(row: {
  onChainAddress: string | null;
  tokenMint: string;
}): string {
  const trimmed = row.onChainAddress?.trim();
  if (trimmed) return trimmed;
  return marketPdaBase58ForMint(row.tokenMint);
}
