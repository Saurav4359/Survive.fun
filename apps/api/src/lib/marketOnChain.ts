import { PublicKey } from "@solana/web3.js";

import { getProgramId } from "../config/solana";

function durationSeedLe(durationSeconds: number): Buffer {
  const b = Buffer.allocUnsafe(8);
  b.writeBigUInt64LE(BigInt(durationSeconds), 0);
  return b;
}

/** Market PDA: seeds `[market, mint, duration_le]`. */
export function marketPdaBase58ForMintAndDuration(
  tokenMint: string,
  durationSeconds: number,
): string {
  const mint = new PublicKey(tokenMint);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), mint.toBuffer(), durationSeedLe(durationSeconds)],
    getProgramId(),
  );
  return pda.toBase58();
}

/**
 * Always derive from mint + duration + **current** `SURVIVEFUN_PROGRAM_ID`.
 * DB `on_chain_address` may still hold a previous deployment's PDA and must not
 * be trusted for verification or RPC (matches frontend `resolveMarketPdaForTransaction`).
 */
export function marketPdaBase58ForDbRow(row: {
  tokenMint: string;
  durationSeconds: number;
}): string {
  return marketPdaBase58ForMintAndDuration(row.tokenMint, row.durationSeconds);
}
