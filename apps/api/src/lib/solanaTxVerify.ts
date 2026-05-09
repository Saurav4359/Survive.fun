/**
 * Verifies Survive.fun program transactions via RPC (parsed tx + Anchor discriminators).
 */

import { createHash } from "node:crypto";

import bs58 from "bs58";
import {
  type Connection,
  type PartiallyDecodedInstruction,
  PublicKey,
  type ParsedTransactionWithMeta,
  type TokenBalance,
} from "@solana/web3.js";

import { getProgramId } from "../config/solana";
import { AppError } from "../middleware/errorHandler";

const USDC_DECIMALS = 6;

/** On-chain min/max stake (lamports) — matches `MIN_BET_LAMPORTS` / `MAX_BET_LAMPORTS` in program. */
export const ONCHAIN_MIN_STAKE_RAW = 10_000_000n;
export const ONCHAIN_MAX_STAKE_RAW = 10_000_000_000n;

function durationSeedLe(durationSeconds: number): Buffer {
  const b = Buffer.allocUnsafe(8);
  b.writeBigUInt64LE(BigInt(durationSeconds), 0);
  return b;
}

function anchorIxDiscriminator(name: string): Buffer {
  const hash = createHash("sha256").update(`global:${name}`).digest();
  return Buffer.from(hash.subarray(0, 8));
}

const IX_CREATE_MARKET = anchorIxDiscriminator("create_market");
const IX_PLACE_BET = anchorIxDiscriminator("place_bet");

function* walkPartiallyDecoded(
  tx: ParsedTransactionWithMeta,
): Generator<PartiallyDecodedInstruction> {
  const msg = tx.transaction.message;
  for (const ix of msg.instructions) {
    if (
      "programId" in ix &&
      typeof (ix as PartiallyDecodedInstruction).data === "string"
    ) {
      yield ix as PartiallyDecodedInstruction;
    }
  }
  for (const group of tx.meta?.innerInstructions ?? []) {
    for (const ix of group.instructions) {
      if (
        "programId" in ix &&
        typeof (ix as PartiallyDecodedInstruction).data === "string"
      ) {
        yield ix as PartiallyDecodedInstruction;
      }
    }
  }
}

function feePayer(tx: ParsedTransactionWithMeta): PublicKey {
  const keys = tx.transaction.message.accountKeys;
  const first = keys[0];
  if (!first) {
    throw new AppError("TX_PARSE", "Transaction has no accounts", 400);
  }
  return first.pubkey;
}

export async function verifyCreateMarketTransaction(
  connection: Connection,
  signature: string,
  expectedCreator: string,
  expectedMint: string,
  expectedDurationSec: number,
): Promise<{ marketPda: string }> {
  const programId = getProgramId();
  const tx = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx) {
    throw new AppError("TX_NOT_FOUND", "Transaction not found", 400);
  }
  if (tx.meta?.err) {
    throw new AppError("TX_FAILED", "Transaction did not succeed on-chain", 400);
  }

  const payer = feePayer(tx);
  if (payer.toBase58() !== expectedCreator) {
    throw new AppError(
      "TX_SIGNER_MISMATCH",
      "Transaction fee payer does not match creator wallet",
      400,
    );
  }

  const mintPk = new PublicKey(expectedMint);
  const [expectedPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"),
      mintPk.toBuffer(),
      durationSeedLe(expectedDurationSec),
    ],
    programId,
  );

  for (const ix of walkPartiallyDecoded(tx)) {
    if (!ix.programId.equals(programId)) continue;
    let buf: Buffer;
    try {
      buf = Buffer.from(bs58.decode(ix.data));
    } catch {
      continue;
    }
    if (buf.length < 8 + 32 + 8) continue;
    if (!buf.subarray(0, 8).equals(IX_CREATE_MARKET)) continue;

    const ixMint = new PublicKey(buf.subarray(8, 40));
    const dur = Number(buf.readBigUInt64LE(40));
    if (!ixMint.equals(mintPk)) {
      throw new AppError(
        "TX_MINT_MISMATCH",
        "On-chain mint does not match request",
        400,
      );
    }
    if (dur !== expectedDurationSec) {
      throw new AppError(
        "TX_DURATION_MISMATCH",
        "On-chain duration does not match request",
        400,
      );
    }

    return { marketPda: expectedPda.toBase58() };
  }

  throw new AppError(
    "TX_NO_CREATE_MARKET",
    "No valid create_market instruction found in transaction",
    400,
  );
}

export async function verifyPlaceBetTransaction(
  connection: Connection,
  signature: string,
  expectedBettor: string,
  marketPdaStr: string,
  expectedSide: "survive" | "rug",
  stake:
    | { currency: "usdc"; amountUi: number }
    | { currency: "sol"; lamports: bigint },
): Promise<void> {
  const programId = getProgramId();
  const amountRaw =
    stake.currency === "usdc"
      ? BigInt(Math.round(stake.amountUi * 10 ** USDC_DECIMALS))
      : stake.lamports;

  if (
    amountRaw < ONCHAIN_MIN_STAKE_RAW ||
    amountRaw > ONCHAIN_MAX_STAKE_RAW
  ) {
    throw new AppError(
      "TX_AMOUNT_OUT_OF_RANGE",
      "On-chain bet amount is outside program min/max",
      400,
    );
  }

  const marketPk = new PublicKey(marketPdaStr);
  const bettorPk = new PublicKey(expectedBettor);

  const tx = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx) {
    throw new AppError("TX_NOT_FOUND", "Transaction not found", 400);
  }
  if (tx.meta?.err) {
    throw new AppError("TX_FAILED", "Transaction did not succeed on-chain", 400);
  }

  const payer = feePayer(tx);
  if (!payer.equals(bettorPk)) {
    throw new AppError(
      "TX_SIGNER_MISMATCH",
      "Transaction fee payer does not match bettor wallet",
      400,
    );
  }

  const wantSide: number = expectedSide === "survive" ? 0 : 1;

  for (const ix of walkPartiallyDecoded(tx)) {
    if (!ix.programId.equals(programId)) continue;
    let buf: Buffer;
    try {
      buf = Buffer.from(bs58.decode(ix.data));
    } catch {
      continue;
    }
    if (buf.length < 8 + 1 + 8) continue;
    if (!buf.subarray(0, 8).equals(IX_PLACE_BET)) continue;

    const side = buf.readUInt8(8);
    const gotRaw = buf.readBigUInt64LE(9);
    if (side !== wantSide) {
      throw new AppError("TX_SIDE_MISMATCH", "On-chain bet side does not match", 400);
    }
    if (gotRaw !== amountRaw) {
      throw new AppError(
        "TX_AMOUNT_MISMATCH",
        "On-chain bet amount does not match request",
        400,
      );
    }
    if (ix.accounts.length < 2) {
      throw new AppError("TX_PARSE", "place_bet has too few accounts", 400);
    }
    if (!ix.accounts[0].equals(marketPk)) {
      throw new AppError(
        "TX_MARKET_MISMATCH",
        "On-chain market account does not match this market",
        400,
      );
    }
    if (!ix.accounts[1].equals(bettorPk)) {
      throw new AppError(
        "TX_BETTOR_MISMATCH",
        "On-chain bettor does not match wallet",
        400,
      );
    }
    return;
  }

  throw new AppError(
    "TX_NO_PLACE_BET",
    "No valid place_bet instruction found in transaction",
    400,
  );
}
