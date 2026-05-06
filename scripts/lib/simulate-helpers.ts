/**
 * Shared helpers for demo-day simulate-rug / simulate-survive scripts only.
 */
import type { Bet, Market, Outcome } from "@survivefun/types";
import type { PrismaClient } from "@prisma/client";
import { Connection, clusterApiUrl } from "@solana/web3.js";

export const DEVNET_GENESIS_HASH =
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

const PLATFORM_FEE_BPS = 200n;

export function banner(title: string): void {
  const line = "=".repeat(Math.max(60, title.length + 8));
  console.log(`\n${line}\n  DEMO: ${title}\n${line}\n`);
}

export function log(msg: string, detail?: Record<string, unknown>): void {
  if (detail) console.log(`[simulate] ${msg}`, detail);
  else console.log(`[simulate] ${msg}`);
}

/** Throws so callers can run `finally` cleanup (never use process.exit here). */
export function die(msg: string): never {
  throw new Error(`[simulate] FATAL: ${msg}`);
}

/** Block accidental mainnet configuration. */
export function assertDemoNetworkEnv(): void {
  if (process.env.ALLOW_MAINNET_SIMULATE?.trim() === "I_KNOW_WHAT_IM_DOING") {
    log("WARNING: ALLOW_MAINNET_SIMULATE set — skipping mainnet env guard.");
    return;
  }
  const hn = process.env.HELIUS_NETWORK?.trim().toLowerCase() ?? "";
  if (hn.includes("main")) {
    die(
      "HELIUS_NETWORK must be devnet for demo scripts (or set ALLOW_MAINNET_SIMULATE=I_KNOW_WHAT_IM_DOING).",
    );
  }
  const rpc = process.env.SOLANA_RPC_URL?.trim().toLowerCase() ?? "";
  if (rpc.includes("mainnet-beta") || rpc.includes("api.mainnet")) {
    die(
      "SOLANA_RPC_URL looks like mainnet. Use devnet only (or set ALLOW_MAINNET_SIMULATE=I_KNOW_WHAT_IM_DOING).",
    );
  }
}

export function getDemoConnection(): Connection {
  const url =
    process.env.SOLANA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_RPC_URL?.trim() ||
    clusterApiUrl("devnet");
  return new Connection(url, "confirmed");
}

export async function assertDevnetRpc(connection: Connection): Promise<void> {
  const gh = await connection.getGenesisHash();
  if (gh !== DEVNET_GENESIS_HASH) {
    die(
      `RPC is not Solana devnet (genesis ${gh}). Refusing to run. ` +
        `Use devnet RPC or set ALLOW_MAINNET_SIMULATE=I_KNOW_WHAT_IM_DOING to override.`,
    );
  }
}

/** USDC-like 6-decimal fixed point from Prisma/API decimal string. */
export function decimalStringToRaw6(s: string): bigint {
  const t = s.trim();
  if (!t) return 0n;
  const neg = t.startsWith("-");
  const u = neg ? t.slice(1) : t;
  const [whole, frac = ""] = u.split(".");
  const w = whole.replace(/^\0+/, "") || "0";
  const f = (frac + "000000").slice(0, 6);
  const raw = BigInt(w) * 1_000_000n + BigInt(f || "0");
  return neg ? -raw : raw;
}

export function raw6ToUiString(raw: bigint): string {
  const neg = raw < 0n;
  const a = neg ? -raw : raw;
  const whole = a / 1_000_000n;
  const frac = (a % 1_000_000n).toString().padStart(6, "0");
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
}

/**
 * On-chain claim amount for a winning bet (principal + share of distributable losing pool).
 * Matches program `claim_payout` bettor transfer (excludes fee portion sent to platform).
 */
export function expectedWinnerClaimRaw(args: {
  betSide: Outcome;
  marketOutcome: Outcome;
  amountUsdcRaw: bigint;
  survivePoolRaw: bigint;
  rugPoolRaw: bigint;
}): bigint | null {
  if (args.betSide !== args.marketOutcome) return null;
  const winning =
    args.marketOutcome === "survive"
      ? args.survivePoolRaw
      : args.rugPoolRaw;
  const losing =
    args.marketOutcome === "survive"
      ? args.rugPoolRaw
      : args.survivePoolRaw;
  if (winning <= 0n) return null;
  const platformFee = (losing * PLATFORM_FEE_BPS) / 10_000n;
  const distributable = losing - platformFee;
  const yourShare = (args.amountUsdcRaw * distributable) / winning;
  return args.amountUsdcRaw + yourShare;
}

export function expectedPlatformFeeFromBetRaw(args: {
  betSide: Outcome;
  marketOutcome: Outcome;
  amountUsdcRaw: bigint;
  survivePoolRaw: bigint;
  rugPoolRaw: bigint;
}): bigint {
  if (args.betSide !== args.marketOutcome) return 0n;
  const winning =
    args.marketOutcome === "survive"
      ? args.survivePoolRaw
      : args.rugPoolRaw;
  const losing =
    args.marketOutcome === "survive"
      ? args.rugPoolRaw
      : args.survivePoolRaw;
  if (winning <= 0n) return 0n;
  const platformFee = (losing * PLATFORM_FEE_BPS) / 10_000n;
  return (args.amountUsdcRaw * platformFee) / winning;
}

export function logPayoutTable(args: {
  market: Market;
  bets: Bet[];
}): void {
  const outcome = args.market.outcome;
  if (!outcome) {
    log("No outcome on market; skipping payout table.");
    return;
  }
  const survivePoolRaw = decimalStringToRaw6(args.market.survivePool);
  const rugPoolRaw = decimalStringToRaw6(args.market.rugPool);
  console.log("\n[simulate] —— Payout preview (off-chain math vs DB pool snapshot) ——");
  console.log(
    `[simulate] Outcome: ${outcome.toUpperCase()} | survivePool: ${args.market.survivePool} USDC | rugPool: ${args.market.rugPool} USDC`,
  );
  for (const b of args.bets) {
    const amt = decimalStringToRaw6(b.amountUsdc);
    const claim = expectedWinnerClaimRaw({
      betSide: b.side,
      marketOutcome: outcome,
      amountUsdcRaw: amt,
      survivePoolRaw,
      rugPoolRaw,
    });
    const platformFee = expectedPlatformFeeFromBetRaw({
      betSide: b.side,
      marketOutcome: outcome,
      amountUsdcRaw: amt,
      survivePoolRaw,
      rugPoolRaw,
    });
    if (claim == null) {
      console.log(
        `[simulate]   ${b.bettorWallet.slice(0, 8)}…  side=${b.side}  LOST  (no claim)`,
      );
    } else {
      console.log(
        `[simulate]   ${b.bettorWallet.slice(0, 8)}…  side=${b.side}  CLAIM ≈ ${raw6ToUiString(claim)} USDC (platform fee portion from pool ≈ ${raw6ToUiString(platformFee)} USDC)`,
      );
    }
  }
  console.log("[simulate] —— (Actual on-chain claim uses live pool; DB may lag.) ——\n");
}

export async function pollUntilResolved(
  prisma: PrismaClient,
  marketId: string,
  expectOutcome: Outcome,
  opts: { timeoutMs: number; intervalMs: number },
): Promise<Market> {
  const start = Date.now();
  while (Date.now() - start < opts.timeoutMs) {
    const row = await prisma.market.findUnique({ where: { id: marketId } });
    if (!row) die(`Market ${marketId} disappeared`);
    if (row.status === "resolved" && row.outcome === expectOutcome) {
      return {
        id: row.id,
        tokenMint: row.tokenMint,
        tokenName: row.tokenName,
        tokenTicker: row.tokenTicker,
        creatorWallet: row.creatorWallet,
        durationSeconds: row.durationSeconds,
        expiresAt: row.expiresAt.toISOString(),
        survivePool: row.survivePool.toString(),
        rugPool: row.rugPool.toString(),
        openPrice: row.openPrice?.toString() ?? null,
        openLiquidity: row.openLiquidity?.toString() ?? null,
        devWallet: row.devWallet,
        devSellThresholdOverride: row.devSellThresholdOverride?.toString() ?? null,
        status: row.status as Market["status"],
        outcome: row.outcome as Outcome | null,
        onChainAddress: row.onChainAddress,
        createdAt: row.createdAt.toISOString(),
        totalBettors: row.totalBettors,
      };
    }
    if (row.status === "resolved" && row.outcome !== expectOutcome) {
      die(
        `Market resolved as ${row.outcome} but this script expected ${expectOutcome}.`,
      );
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  die(
    `Timed out after ${opts.timeoutMs}ms waiting for ${expectOutcome} resolution. Is the API resolver running?`,
  );
}
