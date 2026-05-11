import {
  AnchorProvider,
  BN,
  type Idl,
  Program,
  type Wallet as AnchorWallet,
} from "@coral-xyz/anchor";
import type { ApiResponse, Bet, BetSide } from "@survivefun/types";
import {
  deriveBetPDA,
  deriveMarketPDA,
  MarketAddressScheme,
} from "@survivefun/solana-pda";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import {
  WalletError,
  WalletNotConnectedError,
  WalletSignTransactionError,
  WalletWindowClosedError,
} from "@solana/wallet-adapter-base";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";

import survivefunIdl from "@/idl/survivefun.json";
import { postBetClaim } from "@/utils/betClaimApi";
import {
  apiV1Url,
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

/** Only when failure is likely wallet/RPC — not on-chain program rejects. */
function appendDevnetHintIfRelevant(message: string): string {
  const t = message.toLowerCase();
  if (
    t.includes("anchorerror") ||
    t.includes("instructionerror") ||
    t.includes("program log: instruction:") ||
    t.includes("accountdiddeserialize") ||
    /custom["']?\s*:\s*600\d/.test(t) ||
    /custom["']?\s*:\s*3003\b/.test(t) ||
    /0x177[0-9a-f]\b/i.test(message) ||
    /0xbbb\b/i.test(message)
  ) {
    return message;
  }
  return message + devnetClusterHint();
}

const SURVIVE_PROGRAM_USER_MSG = {
  alreadyClaimed:
    "This payout was already claimed on-chain. If the app still shows Claim, refresh the page — the UI may be out of sync until we record your claim.",
  marketNotActive:
    "This market is not active on-chain anymore (resolved or closed). Betting is disabled — refresh the page so the UI matches chain state.",
  marketExpired:
    "This market's betting window has ended on-chain. Refresh the page to see the latest status.",
  betTooSmall: "Bet amount is below the minimum (0.01 SOL).",
  betTooLarge: "Bet amount is above the maximum (10 SOL).",
  didNotWin: "You did not win this market — no payout available.",
  betSideMismatch:
    "Add stake on the same side as your existing bet (Survive or Rug — switching sides is not allowed).",
  unauthorized: "You are not authorized for this action.",
  zeroWinningPool: "Nothing to claim — the winning pool is empty.",
  arithmeticOverflow: "On-chain calculation error — try a smaller amount or refresh.",
  insufficientRent: "Insufficient SOL to cover account rent for this action.",
} as const;

/**
 * Maps Survive.fun program logs / simulation JSON to a short user-facing message.
 * Codes align with `apps/web/src/idl/survivefun.json` errors.
 */
function surviveProgramUserMessage(text: string): string | null {
  const t = text.toLowerCase();
  if (
    t.includes("accountdiddeserialize") ||
    t.includes("3003") ||
    /0xbbb\b/i.test(text)
  ) {
    return (
      "Wrong on-chain market address — the app was using a legacy PDA. Refresh the page and try again; " +
      "new markets need the API's chainMarketKey seed. Use Devnet in Phantom if your RPC is devnet."
    );
  }
  if (
    t.includes("alreadyclaimed") ||
    t.includes("already claimed") ||
    /\b6005\b/.test(text) ||
    /0x1775\b/i.test(text)
  ) {
    return SURVIVE_PROGRAM_USER_MSG.alreadyClaimed;
  }
  if (
    t.includes("marketnotactive") ||
    t.includes("market is not active") ||
    /\b6001\b/.test(text) ||
    /0x1771\b/i.test(text)
  ) {
    return SURVIVE_PROGRAM_USER_MSG.marketNotActive;
  }
  if (
    t.includes("marketexpired") ||
    t.includes("market has expired") ||
    /\b6002\b/.test(text) ||
    /0x1772\b/i.test(text)
  ) {
    return SURVIVE_PROGRAM_USER_MSG.marketExpired;
  }
  if (
    t.includes("bettoosmall") ||
    t.includes("bet below minimum") ||
    /\b6003\b/.test(text) ||
    /0x1773\b/i.test(text)
  ) {
    return SURVIVE_PROGRAM_USER_MSG.betTooSmall;
  }
  if (
    t.includes("bettoolarge") ||
    t.includes("bet above maximum") ||
    /\b6004\b/.test(text) ||
    /0x1774\b/i.test(text)
  ) {
    return SURVIVE_PROGRAM_USER_MSG.betTooLarge;
  }
  if (
    t.includes("didnotwin") ||
    t.includes("did not win") ||
    /\b6006\b/.test(text) ||
    /0x1776\b/i.test(text)
  ) {
    return SURVIVE_PROGRAM_USER_MSG.didNotWin;
  }
  if (
    t.includes("unauthorized") ||
    /\b6007\b/.test(text) ||
    /0x1777\b/i.test(text)
  ) {
    return SURVIVE_PROGRAM_USER_MSG.unauthorized;
  }
  if (
    t.includes("invalidduration") ||
    /\b6008\b/.test(text) ||
    /0x1778\b/i.test(text)
  ) {
    return "Invalid market duration for this operation.";
  }
  if (
    t.includes("zerowinningpool") ||
    /\b6009\b/.test(text) ||
    /0x1779\b/i.test(text)
  ) {
    return SURVIVE_PROGRAM_USER_MSG.zeroWinningPool;
  }
  if (
    t.includes("arithmeticoverflow") ||
    /\b6010\b/.test(text) ||
    /0x177a\b/i.test(text)
  ) {
    return SURVIVE_PROGRAM_USER_MSG.arithmeticOverflow;
  }
  if (
    t.includes("betsidemismatch") ||
    /\b6011\b/.test(text) ||
    /0x177b\b/i.test(text)
  ) {
    return SURVIVE_PROGRAM_USER_MSG.betSideMismatch;
  }
  if (
    t.includes("insufficientrent") ||
    /\b6012\b/.test(text) ||
    /0x177c\b/i.test(text)
  ) {
    return SURVIVE_PROGRAM_USER_MSG.insufficientRent;
  }
  if (
    t.includes("markethasopenpositions") ||
    /\b6013\b/.test(text) ||
    /0x177d\b/i.test(text)
  ) {
    return "This market still has open positions — it cannot be closed yet.";
  }
  if (
    t.includes("marketalreadyexists") ||
    /\b6000\b/.test(text) ||
    /0x1770\b/i.test(text)
  ) {
    return "A market for this token and duration already exists on-chain.";
  }
  return null;
}

function alreadyClaimedUserMessage(): string {
  return SURVIVE_PROGRAM_USER_MSG.alreadyClaimed;
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

    const programMsg = surviveProgramUserMessage(blob);
    if (programMsg) {
      return new Error(programMsg);
    }

    if (/insufficient funds|InsufficientFunds|insufficient lamports/i.test(blob)) {
      return new Error(
        appendDevnetHintIfRelevant("Insufficient SOL for fees or stake."),
      );
    }
    if (/Insufficient/i.test(blob)) {
      return new Error(
        appendDevnetHintIfRelevant(
          "Insufficient balance for this transaction.",
        ),
      );
    }
    if (/custom program error|Program log: Error|InstructionMissing/i.test(blob)) {
      const snippet = logLines?.length
        ? `\n${logLines.slice(-12).join("\n")}`
        : "";
      return new Error(`On-chain error: ${detail}${snippet}`);
    }
    const tail = logLines?.length
      ? `\n--- program logs (last lines) ---\n${logLines.slice(-15).join("\n")}`
      : "";
    return new Error(
      appendDevnetHintIfRelevant(`Transaction failed: ${detail}${tail}`),
    );
  }

  if (unwrapped instanceof Error) {
    const text = unwrapped.message || "Unknown error";
    const programMsg = surviveProgramUserMessage(text);
    if (programMsg) return new Error(programMsg);
    return new Error(appendDevnetHintIfRelevant(text));
  }

  return new Error(
    appendDevnetHintIfRelevant(String(unwrapped ?? err)),
  );
}

function isVagueTxMessage(msg: string): boolean {
  const first = msg.split("\n")[0]?.trim().toLowerCase() ?? "";
  return (
    first === "unexpected error" ||
    first === "unknown error" ||
    first.length < 6
  );
}

async function postMarketBetSol(params: {
  marketId: string;
  txSignature: string;
  side: BetSide;
  amountLamports: number;
  walletAddress: string;
}): Promise<void> {
  const res = await fetch(
    apiV1Url(`/markets/${encodeURIComponent(params.marketId)}/bets`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        side: params.side,
        currency: "sol" as const,
        amount: params.amountLamports,
        txSignature: params.txSignature,
        walletAddress: params.walletAddress,
      }),
    },
  );
  const body = (await res.json()) as ApiResponse<Bet>;
  if (!res.ok || !body.success) {
    const msg = !body.success
      ? body.error.message
      : `Bet failed (${res.status})`;
    throw new Error(msg);
  }
}

async function mapCaughtSendError(
  e: unknown,
  connection: Connection,
  tx: Transaction,
): Promise<Error> {
  const unwrapped = unwrapWalletErrors(e);
  if (unwrapped instanceof WalletNotConnectedError) {
    return new Error("Please connect wallet");
  }
  if (
    unwrapped instanceof WalletSignTransactionError ||
    unwrapped instanceof WalletWindowClosedError
  ) {
    return new Error("Transaction cancelled");
  }

  let mapped = await mapSendError(e, connection);
  let msg = mapped.message;
  const earlyFriendly = surviveProgramUserMessage(msg);
  if (earlyFriendly) {
    return new Error(earlyFriendly);
  }
  const lower = msg.toLowerCase();
  if (
    lower.includes("insufficient sol") ||
    lower.includes("insufficient balance") ||
    lower.includes("insufficient lamports") ||
    lower.includes("insufficient funds")
  ) {
    return new Error("Insufficient SOL balance");
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network request failed") ||
    lower.includes("socket hang up") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("timeout") ||
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("504")
  ) {
    return new Error("Network error, try again");
  }

  if (isVagueTxMessage(msg)) {
    const extra = await simulateForDebugLogs(connection, tx);
    if (extra) {
      mapped = new Error(`${msg}\n\n${extra}`);
      const afterSim = surviveProgramUserMessage(mapped.message);
      if (afterSim) {
        return new Error(afterSim);
      }
    } else if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- surfaced when wallet hides RPC details
      console.error("[survive.fun] Raw transaction failure:", e);
    }
  }
  return mapped;
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
  if (!wallet.sendTransaction) {
    throw new Error("Please connect wallet");
  }

  const {
    context: { slot: minContextSlot },
    value: { blockhash, lastValidBlockHeight },
  } = await connection.getLatestBlockhashAndContext("confirmed");

  const tx = new Transaction({
    feePayer: payer,
    recentBlockhash: blockhash,
  }).add(...instructions);

  try {
    const signature = await wallet.sendTransaction(tx, connection, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      minContextSlot,
    });
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    return signature;
  } catch (e) {
    throw await mapCaughtSendError(e, connection, tx);
  }
}

/**
 * Market PDA — must match `contracts/programs/survivefun` + API `createMarketOnChain`:
 * `[b"market", mint, market_id]` when `chainMarketKey` (market_id) is set.
 * Legacy deployments: `[b"market", mint]` only when `chainMarketKey` is null/empty.
 */
export function getMarketPDA(
  tokenMint: string,
  chainMarketKey: string | null | undefined,
  durationSeconds: number,
): PublicKey {
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
  const trimmed = chainMarketKey?.trim();
  if (trimmed) {
    let marketId: PublicKey;
    try {
      marketId = new PublicKey(trimmed);
    } catch {
      throw new Error("Invalid chain market key (market_id seed).");
    }
    return deriveMarketPDA(PROGRAM_ID, mint, {
      scheme: MarketAddressScheme.MintAndMarketId,
      chainMarketKey: marketId,
    }).publicKey;
  }
  return deriveMarketPDA(PROGRAM_ID, mint, {
    scheme: MarketAddressScheme.LegacyMintOnly,
  }).publicKey;
}

/**
 * API `onChainAddress` may still reference a market account from a **previous**
 * program deployment. Anchor then fails with 3007 (`AccountOwnedByWrongProgram`).
 * Prefer deriving from `tokenMint` + `chainMarketKey`; reuse stored address only when
 * it matches derived or is on-chain owned by `PROGRAM_ID`.
 */
export async function resolveMarketPdaForTransaction(
  tokenMint: string,
  durationSeconds: number,
  storedOnChainAddress: string | null | undefined,
  chainMarketKey: string | null | undefined,
): Promise<string> {
  const derived = getMarketPDA(
    tokenMint,
    chainMarketKey,
    durationSeconds,
  ).toBase58();
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
  return deriveBetPDA(PROGRAM_ID, market, bettor).publicKey;
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

  const connection = getConnection();
  const marketIdKey = Keypair.generate().publicKey;
  const marketPk = getMarketPDA(tokenMint, marketIdKey.toBase58(), duration);
  const devBalanceLamports = await connection.getBalance(creator, "confirmed");

  const provider = new AnchorProvider(connection, toAnchorWallet(wallet), {
    commitment: "confirmed",
  });
  const program = new Program(survivefunIdl as Idl, provider);

  const ix = await program.methods
    .createMarket(
      mintPk,
      marketIdKey,
      new BN(duration),
      creator,
      new BN(devBalanceLamports),
      new BN(0),
      new BN(0),
    )
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
  /** API market UUID — when set, records the bet via POST `/v1/markets/:id/bets` after confirmation. */
  marketId?: string;
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

  const sig = await sendInstructions(wallet, [ix]);
  if (params.marketId) {
    await postMarketBetSol({
      marketId: params.marketId,
      txSignature: sig,
      side: params.side,
      amountLamports: Number(lamports),
      walletAddress: bettor.toBase58(),
    });
  }
  return sig;
}

export async function claimPayout(
  wallet: WalletContextState,
  marketPDA: string,
  betPDA: string,
  opts?: { betId?: string },
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
  const program = new Program(survivefunIdl as Idl, provider);
  const acc = program.account as unknown as {
    market: { fetch: (pk: PublicKey) => Promise<{ platformAuthority: PublicKey }> };
    bet: { fetch: (pk: PublicKey) => Promise<{ claimed: boolean }> };
  };

  const marketAcc = await acc.market.fetch(marketPk);
  const platformAuthority = marketAcc.platformAuthority;

  try {
    const betAcc = await acc.bet.fetch(betPk);
    if (betAcc.claimed) {
      throw new Error(alreadyClaimedUserMessage());
    }
  } catch (e) {
    if (e instanceof Error && e.message === alreadyClaimedUserMessage()) throw e;
    /* Missing bet account etc. — let the chain reject with a normal error. */
  }

  const ix = await program.methods
    .claimPayout()
    .accounts({
      market: marketPk,
      bet: betPk,
      bettor,
      platformAuthority,
    })
    .instruction();

  const sig = await sendInstructions(wallet, [ix]);
  if (opts?.betId) {
    await postBetClaim(opts.betId, sig, bettor.toBase58());
  }
  return sig;
}
