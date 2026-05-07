import { BN } from "@coral-xyz/anchor";
import type { BetSide } from "@survivefun/types";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { WalletError } from "@solana/wallet-adapter-base";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

import {
  MARKET_DURATIONS,
  PROGRAM_ID,
  RPC_URL,
  USDC_MINT,
} from "@/utils/constants";

/** On-chain USDC uses 6 decimals; amounts in instructions are raw units. */
const USDC_DECIMALS = 6;

/** Matches `instructions/create_market.rs` seed transfers (10 USDC each side). */
const PLATFORM_SEED_RAW_PER_SIDE = 10_000_000n;

/** Matches `MIN_BET_USDC` / `MAX_BET_USDC` in the program (raw units). */
const MIN_BET_RAW = 1_000_000n;
const MAX_BET_RAW = 50_000_000n;

/**
 * Anchor instruction discriminators: first 8 bytes of sha256("global:<snake_case_fn>").
 * Must match `anchor idl build` output — if instruction names change, regenerate from IDL.
 *
 * - create_market  ← sha256("global:create_market")[0..8] → 67e261ebc8bcfbfe
 * - place_bet      ← sha256("global:place_bet")[0..8]     → de3e43dc3fa67e21
 * - claim_payout   ← sha256("global:claim_payout")[0..8]  → 7ff0843ee3c69285
 */
const IX_CREATE_MARKET = Buffer.from("67e261ebc8bcfbfe", "hex");
const IX_PLACE_BET = Buffer.from("de3e43dc3fa67e21", "hex");
const IX_CLAIM_PAYOUT = Buffer.from("7ff0843ee3c69285", "hex");

function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

function assertWalletReady(wallet: WalletContextState): PublicKey {
  if (!wallet.connected) {
    throw new Error("Wallet not connected. Connect a wallet to continue.");
  }
  if (!wallet.publicKey) {
    throw new Error("Wallet not connected (missing public key).");
  }
  if (!wallet.sendTransaction && !wallet.signTransaction) {
    throw new Error("Wallet cannot sign or send transactions.");
  }
  return wallet.publicKey;
}

function platformAuthorityOrCreator(creator: PublicKey): PublicKey {
  const raw = process.env.NEXT_PUBLIC_PLATFORM_AUTHORITY?.trim();
  if (!raw) return creator;
  try {
    return new PublicKey(raw);
  } catch {
    throw new Error(
      "Invalid NEXT_PUBLIC_PLATFORM_AUTHORITY; expected a valid Solana address.",
    );
  }
}

function mapChainSide(side: BetSide): number {
  if (side === "survive") return 0;
  if (side === "rug") return 1;
  throw new Error(`Unsupported bet side: ${String(side)}`);
}

function usdcRawFromUi(amountUsdc: number): bigint {
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    throw new Error("Bet amount must be a positive number.");
  }
  const raw = BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS));
  return raw;
}

function encodeCreateMarketData(tokenMint: PublicKey, durationSeconds: number): Buffer {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Duration must be a positive number of seconds.");
  }
  const allowed = MARKET_DURATIONS as readonly number[];
  if (!allowed.includes(durationSeconds)) {
    throw new Error(
      `Invalid market duration: ${durationSeconds}s. Allowed: ${allowed.join(", ")}.`,
    );
  }
  const durationBuf = new BN(durationSeconds).toArrayLike(Buffer, "le", 8);
  return Buffer.concat([IX_CREATE_MARKET, tokenMint.toBuffer(), durationBuf]);
}

function encodePlaceBetData(side: BetSide, amountRaw: bigint): Buffer {
  const sideByte = Buffer.from([mapChainSide(side)]);
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amountRaw);
  return Buffer.concat([IX_PLACE_BET, sideByte, amountBuf]);
}

async function ensureUsdcAtaIx(
  payer: PublicKey,
  owner: PublicKey,
): Promise<TransactionInstruction | null> {
  const connection = getConnection();
  const ata = getAssociatedTokenAddressSync(USDC_MINT, owner, false);
  try {
    await getAccount(connection, ata);
    return null;
  } catch {
    return createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ata,
      owner,
      USDC_MINT,
    );
  }
}

async function assertSufficientUsdc(owner: PublicKey, requiredRaw: bigint): Promise<void> {
  const connection = getConnection();
  const ata = getAssociatedTokenAddressSync(USDC_MINT, owner, false);
  let balanceRaw = 0n;
  try {
    const acc = await getAccount(connection, ata);
    balanceRaw = acc.amount;
  } catch {
    if (requiredRaw > 0n) {
      throw new Error(
        "Insufficient USDC: no associated token account. Fund USDC for this wallet first.",
      );
    }
    return;
  }
  if (balanceRaw < requiredRaw) {
    throw new Error(
      `Insufficient USDC balance (need at least ${(Number(requiredRaw) / 1e6).toFixed(2)} USDC).`,
    );
  }
}

/** Wallet adapters wrap RPC failures in WalletSendTransactionError(message, inner). */
function unwrapWalletErrors(err: unknown): unknown {
  let cur: unknown = err;
  for (let i = 0; i < 14; i++) {
    if (cur instanceof WalletError && cur.error != null) {
      cur = cur.error;
      continue;
    }
    if (cur instanceof Error && cur.cause != null) {
      cur = cur.cause;
      continue;
    }
    break;
  }
  return cur;
}

/**
 * Bundlers sometimes duplicate `@solana/web3.js`, so `instanceof SendTransactionError` fails.
 * Fall back on duck typing + constructor name.
 */
function asSendTransactionError(err: unknown): SendTransactionError | null {
  if (err instanceof SendTransactionError) return err;
  if (typeof err !== "object" || err === null) return null;
  const ctor = (err as { constructor?: { name?: string } }).constructor?.name;
  if (ctor === "SendTransactionError") return err as SendTransactionError;
  const e = err as Record<string, unknown>;
  if (typeof e.getLogs === "function" && typeof e.message === "string") {
    return err as SendTransactionError;
  }
  return null;
}

function devnetClusterHint(): string {
  if (!/\bdevnet\b/i.test(RPC_URL)) return "";
  return "\n\nTip: This app uses Solana Devnet — set your wallet to Devnet or transactions will fail.";
}

async function mapSendError(
  err: unknown,
  connection: Connection,
): Promise<Error> {
  const unwrapped = unwrapWalletErrors(err);
  const ste = asSendTransactionError(unwrapped);

  if (ste != null) {
    const te = ste.transactionError;
    let logLines = te.logs ?? ste.logs;
    if (
      (!logLines || logLines.length === 0) &&
      typeof ste.getLogs === "function"
    ) {
      try {
        logLines = (await ste.getLogs(connection)) ?? undefined;
      } catch {
        /* ignore */
      }
    }
    const logText = (logLines ?? []).join("\n");
    const detail = te.message || ste.message;
    const blob = `${detail}\n${logText}`;

    if (/insufficient funds|InsufficientFunds|insufficient lamports/i.test(blob)) {
      return new Error(
        "Insufficient SOL for fees or insufficient USDC for this transaction." +
          devnetClusterHint(),
      );
    }
    if (/Insufficient/i.test(blob)) {
      return new Error(
        "Insufficient balance for this transaction." + devnetClusterHint(),
      );
    }
    if (/custom program error|Program log: Error|InstructionMissing/i.test(blob)) {
      const snippet = logLines?.length
        ? `\n${logLines.slice(-12).join("\n")}`
        : "";
      return new Error(
        `On-chain error: ${detail}${snippet}${devnetClusterHint()}`,
      );
    }
    const tail = logLines?.length
      ? `\n--- program logs (last lines) ---\n${logLines.slice(-15).join("\n")}`
      : "";
    return new Error(
      `Transaction failed: ${detail}${tail}${devnetClusterHint()}`,
    );
  }

  if (unwrapped instanceof Error) {
    const text = unwrapped.message || "Unknown error";
    return new Error(text + devnetClusterHint());
  }

  return new Error(String(unwrapped ?? err) + devnetClusterHint());
}

function isVagueTxMessage(msg: string): boolean {
  const first = msg.split("\n")[0]?.trim().toLowerCase() ?? "";
  return (
    first === "unexpected error" ||
    first === "unknown error" ||
    first.length < 6
  );
}

async function simulateForDebugLogs(
  connection: Connection,
  tx: Transaction,
): Promise<string | null> {
  try {
    const sim = await connection.simulateTransaction(tx);
    const v = sim.value;
    const errPart = v.err != null ? JSON.stringify(v.err) : null;
    const logs = v.logs?.length ? v.logs.slice(-25).join("\n") : "";
    if (!errPart && !logs) return null;
    return [errPart ? `Simulation err: ${errPart}` : null, logs ? `Logs:\n${logs}` : null]
      .filter(Boolean)
      .join("\n");
  } catch {
    return null;
  }
}

async function sendInstructions(
  wallet: WalletContextState,
  instructions: TransactionInstruction[],
): Promise<string> {
  const payer = assertWalletReady(wallet);
  const connection = getConnection();
  const tx = new Transaction().add(...instructions);
  tx.feePayer = payer;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  try {
    let signature: string;
    if (wallet.sendTransaction) {
      signature = await wallet.sendTransaction(tx, connection, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
    } else {
      const signed = await wallet.signTransaction!(tx);
      signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
    }

    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    return signature;
  } catch (e) {
    let mapped = await mapSendError(e, connection);
    if (isVagueTxMessage(mapped.message)) {
      const extra = await simulateForDebugLogs(connection, tx);
      if (extra) {
        mapped = new Error(`${mapped.message}\n\n${extra}`);
      } else if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console -- surfaced when wallet hides RPC details
        console.error("[survive.fun] Raw transaction failure:", e);
      }
    }
    throw mapped;
  }
}

/**
 * Derives the market PDA: seeds `[b"market", token_mint]`.
 */
export async function getMarketPDA(tokenMint: string): Promise<PublicKey> {
  let mint: PublicKey;
  try {
    mint = new PublicKey(tokenMint);
  } catch {
    throw new Error("Invalid token mint address.");
  }
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market", "utf8"), mint.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

/**
 * Derives the bet PDA: seeds `[b"bet", market, bettor]`.
 */
export async function getBetPDA(
  marketPDA: string,
  walletAddress: string,
): Promise<PublicKey> {
  let market: PublicKey;
  let bettor: PublicKey;
  try {
    market = new PublicKey(marketPDA);
    bettor = new PublicKey(walletAddress);
  } catch {
    throw new Error("Invalid market PDA or wallet address.");
  }
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bet", "utf8"), market.toBuffer(), bettor.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

/**
 * Creates a market via `create_market`.
 * Requires the platform USDC vault to fund two 10 USDC seed transfers (see program).
 * If `NEXT_PUBLIC_PLATFORM_AUTHORITY` is unset, the connected wallet is used as platform authority (dev convenience).
 */
export async function createMarket(
  wallet: WalletContextState,
  tokenMint: string,
  duration: number,
): Promise<string> {
  const creator = assertWalletReady(wallet);
  let mintPk: PublicKey;
  try {
    mintPk = new PublicKey(tokenMint);
  } catch {
    throw new Error("Invalid token mint address.");
  }

  const platformAuthority = platformAuthorityOrCreator(creator);
  const platformUsdcAta = getAssociatedTokenAddressSync(
    USDC_MINT,
    platformAuthority,
    false,
  );

  const seedTotal = PLATFORM_SEED_RAW_PER_SIDE * 2n;
  await assertSufficientUsdc(platformAuthority, seedTotal);

  const market = await getMarketPDA(tokenMint);
  const marketEscrow = getAssociatedTokenAddressSync(USDC_MINT, market, true);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: platformAuthority, isSigner: true, isWritable: false },
      { pubkey: platformUsdcAta, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: marketEscrow, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeCreateMarketData(mintPk, duration),
  });

  return sendInstructions(wallet, [ix]);
}

/**
 * Places a bet: SPL transfer into market escrow + `place_bet`.
 * `amountUsdc` is a UI amount (e.g. `5` = 5 USDC).
 */
export async function placeBet(
  wallet: WalletContextState,
  marketPDA: string,
  side: BetSide,
  amountUsdc: number,
): Promise<string> {
  const bettor = assertWalletReady(wallet);

  let marketPk: PublicKey;
  try {
    marketPk = new PublicKey(marketPDA);
  } catch {
    throw new Error("Invalid market PDA.");
  }

  const amountRaw = usdcRawFromUi(amountUsdc);
  if (amountRaw < MIN_BET_RAW || amountRaw > MAX_BET_RAW) {
    throw new Error(
      `Bet must be between ${Number(MIN_BET_RAW) / 1e6} and ${Number(MAX_BET_RAW) / 1e6} USDC.`,
    );
  }

  await assertSufficientUsdc(bettor, amountRaw);

  const maybeAtaIx = await ensureUsdcAtaIx(bettor, bettor);
  const bettorUsdc = getAssociatedTokenAddressSync(USDC_MINT, bettor, false);
  const marketEscrow = getAssociatedTokenAddressSync(USDC_MINT, marketPk, true);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: marketPk, isSigner: false, isWritable: true },
      { pubkey: bettor, isSigner: true, isWritable: true },
      {
        pubkey: await getBetPDA(marketPDA, bettor.toBase58()),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: bettorUsdc, isSigner: false, isWritable: true },
      { pubkey: marketEscrow, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodePlaceBetData(side, amountRaw),
  });

  const ixs = maybeAtaIx ? [maybeAtaIx, ix] : [ix];
  return sendInstructions(wallet, ixs);
}

/**
 * Claims winnings via `claim_payout`.
 */
export async function claimPayout(
  wallet: WalletContextState,
  marketPDA: string,
  betPDA: string,
): Promise<string> {
  const bettor = assertWalletReady(wallet);

  let marketPk: PublicKey;
  let betPk: PublicKey;
  try {
    marketPk = new PublicKey(marketPDA);
    betPk = new PublicKey(betPDA);
  } catch {
    throw new Error("Invalid market or bet PDA.");
  }

  const platformAuthority = platformAuthorityOrCreator(bettor);
  const platformUsdcAta = getAssociatedTokenAddressSync(
    USDC_MINT,
    platformAuthority,
    false,
  );
  const bettorUsdc = getAssociatedTokenAddressSync(USDC_MINT, bettor, false);
  const marketEscrow = getAssociatedTokenAddressSync(USDC_MINT, marketPk, true);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: marketPk, isSigner: false, isWritable: true },
      { pubkey: betPk, isSigner: false, isWritable: true },
      { pubkey: bettor, isSigner: true, isWritable: false },
      { pubkey: bettorUsdc, isSigner: false, isWritable: true },
      { pubkey: platformUsdcAta, isSigner: false, isWritable: true },
      {
        pubkey: platformAuthority,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: marketEscrow, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: IX_CLAIM_PAYOUT,
  });

  return sendInstructions(wallet, [ix]);
}
