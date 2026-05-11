import { PublicKey } from "@solana/web3.js";
import {
  deriveBetPDA,
  deriveMarketPDAForDbRow,
} from "@survivefun/solana-pda";

import { getProgramId } from "../config/solana";

/**
 * Derives the market vault PDA for a DB row (legacy vs multi-round).
 */
export function marketPdaBase58ForDbRow(row: {
  tokenMint: string;
  chainMarketKey?: string | null;
}): string {
  return deriveMarketPDAForDbRow(getProgramId(), row).publicKey.toBase58();
}

/** Bet PDA: `[b"bet", market, bettor]` — matches on-chain program seeds. */
export function betPdaBase58(marketPdaBase58: string, bettorWallet: string): string {
  const pid = getProgramId();
  return deriveBetPDA(
    pid,
    new PublicKey(marketPdaBase58),
    new PublicKey(bettorWallet),
  ).publicKey.toBase58();
}
