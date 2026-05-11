import { PublicKey } from "@solana/web3.js";

import {
  MarketAddressScheme,
  SEED_BET,
  SEED_MARKET,
} from "./constants.js";

export interface DerivedPda {
  publicKey: PublicKey;
  bump: number;
  /** Set for market vault PDAs only. */
  scheme?: MarketAddressScheme;
  /** Human-readable seed layout for logs / migrations. */
  seedDescription: string;
}

export type DeriveMarketInput =
  | { scheme: MarketAddressScheme.LegacyMintOnly }
  | {
      scheme: MarketAddressScheme.MintAndMarketId;
      chainMarketKey: PublicKey;
    };

export interface MarketPdaDbRowInput {
  tokenMint: string;
  chainMarketKey?: string | null;
}

/**
 * Canonical market vault PDA — native SOL pools live on this account (no separate vault).
 */
export function deriveMarketPDA(
  programId: PublicKey,
  tokenMint: PublicKey,
  input: DeriveMarketInput,
): DerivedPda {
  if (input.scheme === MarketAddressScheme.LegacyMintOnly) {
    const [pk, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_MARKET), tokenMint.toBuffer()],
      programId,
    );
    return {
      publicKey: pk,
      bump,
      scheme: MarketAddressScheme.LegacyMintOnly,
      seedDescription: '[b"market", token_mint]',
    };
  }
  const key = input.chainMarketKey;
  const [pk, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_MARKET), tokenMint.toBuffer(), key.toBuffer()],
    programId,
  );
  return {
    publicKey: pk,
    bump,
    scheme: MarketAddressScheme.MintAndMarketId,
    seedDescription: '[b"market", token_mint, market_id]',
  };
}

export function deriveMarketPDAForDbRow(
  programId: PublicKey,
  row: MarketPdaDbRowInput,
): DerivedPda {
  const key = row.chainMarketKey?.trim();
  if (key) {
    return deriveMarketPDA(programId, new PublicKey(row.tokenMint), {
      scheme: MarketAddressScheme.MintAndMarketId,
      chainMarketKey: new PublicKey(key),
    });
  }
  return deriveMarketPDA(programId, new PublicKey(row.tokenMint), {
    scheme: MarketAddressScheme.LegacyMintOnly,
  });
}

export function marketSchemeForDbRow(row: MarketPdaDbRowInput): MarketAddressScheme {
  return row.chainMarketKey?.trim()
    ? MarketAddressScheme.MintAndMarketId
    : MarketAddressScheme.LegacyMintOnly;
}

/** Per-user bet position PDA: `[b"bet", market, bettor]`. */
export function deriveBetPDA(
  programId: PublicKey,
  market: PublicKey,
  bettor: PublicKey,
): DerivedPda {
  const [pk, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_BET), market.toBuffer(), bettor.toBuffer()],
    programId,
  );
  return {
    publicKey: pk,
    bump,
    seedDescription: '[b"bet", market, bettor]',
  };
}
