/**
 * Ensures `@survivefun/solana-pda` matches raw Anchor seed layouts.
 * Contract tests (`contracts/tests/survivefun.ts`) import the same package — together
 * they cover API + web (via shared package) + on-chain test harness parity.
 */
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  deriveBetPDA,
  deriveMarketPDA,
  MarketAddressScheme,
  MARKET_ACCOUNT_DISCRIMINATOR,
} from "@survivefun/solana-pda";

describe("@survivefun/solana-pda vs Anchor seeds", () => {
  const programId = Keypair.generate().publicKey;

  it("multi-round market PDA matches findProgramAddressSync", () => {
    const mint = Keypair.generate().publicKey;
    const marketId = Keypair.generate().publicKey;
    const raw = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), mint.toBuffer(), marketId.toBuffer()],
      programId,
    );
    const d = deriveMarketPDA(programId, mint, {
      scheme: MarketAddressScheme.MintAndMarketId,
      chainMarketKey: marketId,
    });
    expect(d.publicKey.toBase58()).toBe(raw[0].toBase58());
    expect(d.bump).toBe(raw[1]);
  });

  it("legacy market PDA matches findProgramAddressSync", () => {
    const mint = Keypair.generate().publicKey;
    const raw = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), mint.toBuffer()],
      programId,
    );
    const d = deriveMarketPDA(programId, mint, {
      scheme: MarketAddressScheme.LegacyMintOnly,
    });
    expect(d.publicKey.toBase58()).toBe(raw[0].toBase58());
    expect(d.bump).toBe(raw[1]);
  });

  it("bet / user-position PDA matches findProgramAddressSync", () => {
    const market = Keypair.generate().publicKey;
    const bettor = Keypair.generate().publicKey;
    const raw = PublicKey.findProgramAddressSync(
      [Buffer.from("bet"), market.toBuffer(), bettor.toBuffer()],
      programId,
    );
    const d = deriveBetPDA(programId, market, bettor);
    expect(d.publicKey.toBase58()).toBe(raw[0].toBase58());
    expect(d.bump).toBe(raw[1]);
  });

  it("Market account discriminator length is 8 (Anchor)", () => {
    expect(MARKET_ACCOUNT_DISCRIMINATOR.length).toBe(8);
  });
});
