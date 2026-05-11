/**
 * Bump this when adding a new account seed layout that must not alias older PDAs.
 * Runtime derivations use {@link MarketAddressScheme}; this constant is for docs + audits.
 */
export const PDA_LAYOUT_VERSION = 2 as const;

/** Anchor `account:Market` discriminator (sha256 prefix). */
export const MARKET_ACCOUNT_DISCRIMINATOR = Buffer.from([
  0xdb, 0xbe, 0xd5, 0x37, 0x00, 0xe3, 0xc6, 0x9a,
]);

/** Anchor `account:Bet` discriminator (sha256 prefix). */
export const BET_ACCOUNT_DISCRIMINATOR = Buffer.from([
  0x93, 0x17, 0x23, 0x3b, 0x0f, 0x4b, 0x9b, 0x20,
]);

export const SEED_MARKET = "market" as const;
export const SEED_BET = "bet" as const;

/**
 * How the market vault PDA is derived for a row or instruction input.
 * - `LegacyMintOnly` — seeds `[b"market", token_mint]` (pre multi-round).
 * - `MintAndMarketId` — seeds `[b"market", token_mint, market_id]` (current).
 */
export enum MarketAddressScheme {
  LegacyMintOnly = 1,
  MintAndMarketId = 2,
}
