import { PublicKey } from "@solana/web3.js";

import { getProgramId } from "../config/solana";

/** Market PDA: seeds `[market, mint]` (duration is not part of the PDA). */
export function marketPdaBase58ForMintAndDuration(
  tokenMint: string,
  _durationSeconds: number,
): string {
  const mint = new PublicKey(tokenMint);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), mint.toBuffer()],
    getProgramId(),
  );
  return pda.toBase58();
}

/**
 * Always derive from mint + **current** `SURVIVEFUN_PROGRAM_ID`.
 * DB `on_chain_address` may still hold a previous deployment's PDA and must not
 * be trusted for verification or RPC (matches frontend `resolveMarketPdaForTransaction`).
 */
export function marketPdaBase58ForDbRow(row: {
  tokenMint: string;
  durationSeconds: number;
}): string {
  return marketPdaBase58ForMintAndDuration(row.tokenMint, row.durationSeconds);
}
