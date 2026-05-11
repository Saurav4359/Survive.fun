import { PublicKey } from "@solana/web3.js";

import { getProgramId } from "../config/solana";

/** Legacy market PDA: seeds `[market, mint]` only. */
export function marketPdaBase58Legacy(tokenMint: string): string {
  const mint = new PublicKey(tokenMint);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), mint.toBuffer()],
    getProgramId(),
  );
  return pda.toBase58();
}

/** Current layout: `[market, mint, market_id]`. */
export function marketPdaBase58ForMintAndChainKey(
  tokenMint: string,
  chainMarketKey: string,
): string {
  const mint = new PublicKey(tokenMint);
  const key = new PublicKey(chainMarketKey.trim());
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), mint.toBuffer(), key.toBuffer()],
    getProgramId(),
  );
  return pda.toBase58();
}

/**
 * @deprecated Use `marketPdaBase58Legacy` or `marketPdaBase58ForMintAndChainKey`.
 * Kept for call sites that still pass duration; duration is not a PDA seed.
 */
export function marketPdaBase58ForMintAndDuration(
  tokenMint: string,
  _durationSeconds: number,
): string {
  return marketPdaBase58Legacy(tokenMint);
}

/**
 * Derives the market vault PDA for a DB row (legacy vs multi-round).
 */
export function marketPdaBase58ForDbRow(row: {
  tokenMint: string;
  durationSeconds: number;
  chainMarketKey?: string | null;
}): string {
  const key = row.chainMarketKey?.trim();
  if (key) {
    return marketPdaBase58ForMintAndChainKey(row.tokenMint, key);
  }
  return marketPdaBase58Legacy(row.tokenMint);
}

/** Bet PDA: `[b"bet", market, bettor]` — matches on-chain program seeds. */
export function betPdaBase58(marketPdaBase58: string, bettorWallet: string): string {
  const market = new PublicKey(marketPdaBase58);
  const bettor = new PublicKey(bettorWallet);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), market.toBuffer(), bettor.toBuffer()],
    getProgramId(),
  );
  return pda.toBase58();
}
