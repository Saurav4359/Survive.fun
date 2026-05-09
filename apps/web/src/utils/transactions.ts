import {
  AnchorProvider,
  BN,
  type Idl,
  Program,
  type Wallet as AnchorWallet,
} from "@coral-xyz/anchor";
import type { BetSide } from "@survivefun/types";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { WalletError } from "@solana/wallet-adapter-base";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";

import survivefunIdl from "@/idl/survivefun.json";
import type { Survivefun } from "@/types/survivefun";
import {
  MARKET_DURATIONS,
  ONCHAIN_MAX_STAKE_RAW,
  ONCHAIN_MIN_STAKE_RAW,
  PLATFORM_SEED_LAMPORTS_TOTAL,
  PROGRAM_ID,
  RPC_URL,
  SOL_BET_LIMITS,
} from "@/utils/constants";

const MIN_BET_RAW = ONCHAIN_MIN_STAKE_RAW;
const MAX_BET_RAW = ONCHAIN_MAX_STAKE_RAW;

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

function toAnchorWallet(wallet: WalletContextState): AnchorWallet {
  const publicKey = assertWalletReady(wallet);
  if (!wallet.signTransaction) {
    throw new Error("Wallet cannot sign transactions.");
  }
  const signTransaction = wallet.signTransaction.bind(wallet);
  const signAllTransactions = wallet.signAllTransactions?.bind(wallet);

  return {
    publicKey,
    signTransaction,
    signAllTransactions:
      signAllTransactions ??
      (async <T extends Transaction | VersionedTransaction>(
        txs: T[],
      ): Promise<T[]> => {
        const out: T[] = [];
        for (const t of txs) {
          if (!(t instanceof Transaction)) {
            throw new Error("Only legacy Transaction is supported for this wallet.");
          }
          out.push((await signTransaction(t)) as T);
        }
        return out;
      }),
  } as AnchorWallet;
}

function normalizeMarketPda(marketPda: string | PublicKey): string {
  return typeof marketPda === "string" ? marketPda.trim() : marketPda.toBase58();
}

function solUiToLamports(amountSol: number): bigint {
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error("Bet amount must be a positive number.");
  }
  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
  return BigInt(lamports);
}

async function assertSufficientSolForBet(
  owner: PublicKey,
  stakeLamports: bigint,
): Promise<void> {
  const connection = getConnection();
  const balance = await connection.getBalance(owner, "confirmed");
  const rentExempt = await connection.getMinimumBalanceForRentExemption(256);
  const feeBuffer = 50_000;
  const needed = Number(stakeLamports) + rentExempt + feeBuffer;
  if (balance < needed) {
    throw new Error(
      `Insufficient SOL (need ~${(needed / LAMPORTS_PER_SOL).toFixed(4)} SOL including bet account rent).`,
    );
  }
}

async function assertSufficientSolBalance(owner: PublicKey, minLamports: bigint): Promise<void> {
  const connection = getConnection();
  const balance = BigInt(await connection.getBalance(owner, "confirmed"));
  if (balance < minLamports) {
    throw new Error(
      `Insufficient SOL (need at least ${(Number(minLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL).`,
    );
  }
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

function durationSeedBuf(durationSeconds: number): Buffer {
  const b = Buffer.allocUnsafe(8);
  b.writeBigUInt64LE(BigInt(durationSeconds), 0);
  return b;
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
        "Insufficient SOL for fees or stake." + devnetClusterHint(),
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
 * Market PDA: `[b"market", mint, duration_seconds_le]`.
 */
export async function getMarketPDA(
  tokenMint: string,
  durationSeconds: number,
): Promise<PublicKey> {
  let mint: PublicKey;
  try {
    mint = new PublicKey(tokenMint);
  } catch {
    throw new Error("Invalid token mint address.");
  }
  const allowed = MARKET_DURATIONS as readonly number[];
  if (!allowed.includes(durationSeconds)) {
    throw new Error(
      `Invalid market duration: ${durationSeconds}s. Allowed: ${allowed.join(", ")}.`,
    );
  }
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), mint.toBuffer(), durationSeedBuf(durationSeconds)],
    PROGRAM_ID,
  );
  return pda;
}

/**
 * API `onChainAddress` may still reference a market account from a **previous**
 * program deployment. Anchor then fails with 3007 (`AccountOwnedByWrongProgram`).
 * Always derive the PDA for the **current** `PROGRAM_ID`; reuse stored address only
 * when it matches derived or is on-chain owned by `PROGRAM_ID`.
 */
export async function resolveMarketPdaForTransaction(
  tokenMint: string,
  durationSeconds: number,
  storedOnChainAddress: string | null | undefined,
): Promise<string> {
  const derived = (await getMarketPDA(tokenMint, durationSeconds)).toBase58();
  const stored = storedOnChainAddress?.trim();
  if (!stored || stored === derived) return derived;

  try {
    const connection = getConnection();
    const info = await connection.getAccountInfo(new PublicKey(stored));
    if (info?.owner.equals(PROGRAM_ID)) return stored;
  } catch {
    /* invalid pubkey */
  }
  return derived;
}

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
    [Buffer.from("bet"), market.toBuffer(), bettor.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

/**
 * `create_market` — platform authority pays two 0.01 SOL seed transfers into the market vault.
 */
export async function createMarket(
  wallet: WalletContextState,
  tokenMint: string,
  duration: number,
): Promise<string> {
  const creator = assertWalletReady(wallet);
  const platformAuthority = platformAuthorityOrCreator(creator);

  let mintPk: PublicKey;
  try {
    mintPk = new PublicKey(tokenMint);
  } catch {
    throw new Error("Invalid token mint address.");
  }

  const allowed = MARKET_DURATIONS as readonly number[];
  if (!allowed.includes(duration)) {
    throw new Error(
      `Invalid market duration: ${duration}s. Allowed: ${allowed.join(", ")}.`,
    );
  }

  await assertSufficientSolBalance(platformAuthority, PLATFORM_SEED_LAMPORTS_TOTAL);

  const marketPk = await getMarketPDA(tokenMint, duration);
  const connection = getConnection();
  const provider = new AnchorProvider(connection, toAnchorWallet(wallet), {
    commitment: "confirmed",
  });
  const program = new Program(survivefunIdl as Idl, provider);

  const ix = await program.methods
    .createMarket(mintPk, new BN(duration))
    .accounts({
      creator,
      platformAuthority,
      market: marketPk,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return sendInstructions(wallet, [ix]);
}

export interface PlaceBetParams {
  side: BetSide;
  /** Stake in SOL (human, e.g. 0.25). */
  amount: number;
  marketPda: string | PublicKey;
}

/**
 * Native SOL stake via program `place_bet` (transfer + bet account init).
 */
export async function placeBet(
  wallet: WalletContextState,
  params: PlaceBetParams,
): Promise<string> {
  const marketPda = normalizeMarketPda(params.marketPda);
  const bettor = assertWalletReady(wallet);
  const lamports = solUiToLamports(params.amount);
  if (lamports < MIN_BET_RAW || lamports > MAX_BET_RAW) {
    throw new Error(
      `Bet must be between ${SOL_BET_LIMITS.min} and ${SOL_BET_LIMITS.max} SOL.`,
    );
  }
  await assertSufficientSolForBet(bettor, lamports);

  let marketPk: PublicKey;
  try {
    marketPk = new PublicKey(marketPda);
  } catch {
    throw new Error("Invalid market PDA.");
  }

  const betPk = await getBetPDA(marketPda, bettor.toBase58());
  const connection = getConnection();
  const provider = new AnchorProvider(connection, toAnchorWallet(wallet), {
    commitment: "confirmed",
  });
  const program = new Program(survivefunIdl as Idl, provider);

  const sideArg =
    params.side === "survive"
      ? { survive: {} as Record<string, never> }
      : { rug: {} as Record<string, never> };

  const ix = await program.methods
    .placeBet(sideArg, new BN(lamports.toString()))
    .accounts({
      market: marketPk,
      bettor,
      bet: betPk,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return sendInstructions(wallet, [ix]);
}

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

  const connection = getConnection();
  const provider = new AnchorProvider(connection, toAnchorWallet(wallet), {
    commitment: "confirmed",
  });
  const program = new Program<Survivefun>(survivefunIdl, provider);

  const marketAcc = await program.account.market.fetch(marketPk);
  const platformAuthority = marketAcc.platformAuthority;

  const ix = await program.methods
    .claimPayout()
    .accounts({
      market: marketPk,
      bet: betPk,
      bettor,
      platformAuthority,
    })
    .instruction();

  return sendInstructions(wallet, [ix]);
}
