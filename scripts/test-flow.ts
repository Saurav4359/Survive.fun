/**
 * End-to-end devnet flow for Survive.fun on-chain program (Anchor 0.29.0).
 *
 * Steps: create market → bet SURVIVE → bet RUG → simulate rug detection → resolve RUG
 *        → claim winner → assert loser cannot claim → verify USDC balances.
 *
 * Prereqs:
 *   - solana CLI: `solana config set --url devnet`
 *   - Funded payer keypair (SOL + Circle devnet USDC): ~/.config/solana/id.json or SOLANA_KEYPAIR
 *   - SURVIVEFUN_PROGRAM_ID or deployed default in apps/web constants
 *
 * Run from repo root:
 *   pnpm test-flow
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { config as loadEnv } from "dotenv";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  deriveBetPDA,
  deriveMarketPDA,
  MarketAddressScheme,
} from "@survivefun/solana-pda";
import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
} from "@solana/web3.js";

const repoRoot = path.resolve(__dirname, "..");
loadEnv({ path: path.join(repoRoot, ".env") });
loadEnv({ path: path.join(repoRoot, "apps", "api", ".env") });
loadEnv({ path: path.join(repoRoot, "apps", "web", ".env.local") });

/** Devnet genesis (guardrail: devnet only). */
const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

const USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

const DEFAULT_PROGRAM_ID = new PublicKey(
  "HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH",
);

const PROGRAM_ID = new PublicKey(
  process.env.SURVIVEFUN_PROGRAM_ID?.trim() ||
    process.env.NEXT_PUBLIC_PROGRAM_ID?.trim() ||
    DEFAULT_PROGRAM_ID.toBase58(),
);

const RPC_URL =
  process.env.SOLANA_RPC_URL?.trim() ||
  process.env.NEXT_PUBLIC_RPC_URL?.trim() ||
  clusterApiUrl("devnet");

const PLATFORM_SEED_RAW_PER_SIDE = 10_000_000n;
const BET_RAW = 5_000_000n;

/** From IDL / sha256("global:create_market")[0..8] */
const IX_CREATE_MARKET = Buffer.from("67e261ebc8bcfbfe", "hex");
const IX_PLACE_BET = Buffer.from("de3e43dc3fa67e21", "hex");
const IX_RESOLVE_MARKET = Buffer.from("9b1750ad2e4a17ef", "hex");
const IX_CLAIM_PAYOUT = Buffer.from("7ff0843ee3c69285", "hex");

const MARKET_DURATION_SEC = 3600;

function logStep(step: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.log(`[test-flow] ${step}`, detail);
  } else {
    console.log(`[test-flow] ${step}`);
  }
}

function fail(msg: string): never {
  console.error(`[test-flow] FATAL: ${msg}`);
  process.exit(1);
}

function loadAuthority(): Keypair {
  const p =
    process.env.SOLANA_KEYPAIR?.trim() ||
    path.join(os.homedir(), ".config/solana/id.json");
  const expanded = p.replace(/^~(?=$|\/)/, os.homedir());
  if (!fs.existsSync(expanded)) {
    fail(`keypair not found at ${expanded} (set SOLANA_KEYPAIR)`);
  }
  const secret = JSON.parse(fs.readFileSync(expanded, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function marketPda(tokenMint: PublicKey): PublicKey {
  return deriveMarketPDA(PROGRAM_ID, tokenMint, {
    scheme: MarketAddressScheme.LegacyMintOnly,
  }).publicKey;
}

function betPda(market: PublicKey, bettor: PublicKey): PublicKey {
  return deriveBetPDA(PROGRAM_ID, market, bettor).publicKey;
}

async function usdcBalance(
  connection: Connection,
  owner: PublicKey,
  allowOwnerOffCurve = false,
): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(USDC_MINT, owner, allowOwnerOffCurve);
  try {
    const acc = await getAccount(connection, ata);
    return acc.amount;
  } catch {
    return 0n;
  }
}

async function ensureUsdcAtaIx(
  connection: Connection,
  payer: PublicKey,
  owner: PublicKey,
): Promise<TransactionInstruction | null> {
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

async function sendAndConfirm(
  connection: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[],
  extraSigners: Keypair[] = [],
): Promise<string> {
  const tx = new Transaction().add(...instructions);
  tx.feePayer = payer.publicKey;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(payer, ...extraSigners);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}

function encodeCreateMarket(tokenMint: PublicKey, durationSeconds: number): Buffer {
  const d = Buffer.allocUnsafe(8);
  d.writeBigUInt64LE(BigInt(durationSeconds), 0);
  return Buffer.concat([IX_CREATE_MARKET, tokenMint.toBuffer(), d]);
}

function encodePlaceBet(side: "survive" | "rug", amountRaw: bigint): Buffer {
  const sideByte = Buffer.from([side === "survive" ? 0 : 1]);
  const amt = Buffer.allocUnsafe(8);
  amt.writeBigUInt64LE(amountRaw, 0);
  return Buffer.concat([IX_PLACE_BET, sideByte, amt]);
}

/** Outcome::Rug = 1 (second enum variant). */
function encodeResolveRug(): Buffer {
  return Buffer.concat([IX_RESOLVE_MARKET, Buffer.from([1])]);
}

async function maybeAirdropSol(
  connection: Connection,
  who: PublicKey,
  minLamports: number,
): Promise<void> {
  const bal = await connection.getBalance(who, "confirmed");
  if (bal >= minLamports) return;
  logStep("request SOL airdrop", { who: who.toBase58(), hadLamports: bal });
  const sig = await connection.requestAirdrop(who, 1_000_000_000);
  await connection.confirmTransaction(sig, "confirmed");
}

async function main(): Promise<void> {
  logStep("connecting", { rpc: RPC_URL, programId: PROGRAM_ID.toBase58() });
  const connection = new Connection(RPC_URL, "confirmed");

  const genesis = await connection.getGenesisHash();
  if (genesis !== DEVNET_GENESIS_HASH) {
    fail(
      `refusing to run: genesis hash ${genesis} is not devnet (${DEVNET_GENESIS_HASH})`,
    );
  }

  const authority = loadAuthority();
  logStep("loaded authority", { pubkey: authority.publicKey.toBase58() });

  await maybeAirdropSol(connection, authority.publicKey, 100_000_000);

  const seedNeed = PLATFORM_SEED_RAW_PER_SIDE * 2n;
  const authUsdc = await usdcBalance(connection, authority.publicKey);
  if (authUsdc < seedNeed + BET_RAW * 4n) {
    fail(
      `authority needs devnet USDC (have ${authUsdc}, need at least ${seedNeed + BET_RAW * 4n}). ` +
        `Fund ${authority.publicKey.toBase58()} via Circle devnet faucet.`,
    );
  }

  const bettorA = Keypair.generate();
  const bettorB = Keypair.generate();
  logStep("generated bettors", {
    bettorA: bettorA.publicKey.toBase58(),
    bettorB: bettorB.publicKey.toBase58(),
  });

  await maybeAirdropSol(connection, bettorA.publicKey, 50_000_000);
  await maybeAirdropSol(connection, bettorB.publicKey, 50_000_000);

  const fundBettors = BET_RAW + 1_000_000n;
  for (const [label, kp] of [
    ["bettorA", bettorA],
    ["bettorB", bettorB],
  ] as const) {
    const ixs: TransactionInstruction[] = [];
    const ataIx = await ensureUsdcAtaIx(connection, authority.publicKey, kp.publicKey);
    if (ataIx) ixs.push(ataIx);
    const destAta = getAssociatedTokenAddressSync(USDC_MINT, kp.publicKey, false);
    const srcAta = getAssociatedTokenAddressSync(
      USDC_MINT,
      authority.publicKey,
      false,
    );
    ixs.push(
      createTransferInstruction(
        srcAta,
        destAta,
        authority.publicKey,
        fundBettors,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );
    logStep(`fund ${label} USDC`, { lamportsUsdcRaw: fundBettors.toString() });
    await sendAndConfirm(connection, authority, ixs);
  }

  const tokenMint = Keypair.generate().publicKey;
  const market = marketPda(tokenMint);
  const marketEscrow = getAssociatedTokenAddressSync(USDC_MINT, market, true);
  const platformUsdc = getAssociatedTokenAddressSync(
    USDC_MINT,
    authority.publicKey,
    false,
  );

  logStep("create_market", {
    tokenMint: tokenMint.toBase58(),
    market: market.toBase58(),
    durationSec: MARKET_DURATION_SEC,
  });

  const preAuthUsdc = await usdcBalance(connection, authority.publicKey);
  const preEscrow = await usdcBalance(connection, market, true);

  const createIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: platformUsdc, isSigner: false, isWritable: true },
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
    data: encodeCreateMarket(tokenMint, MARKET_DURATION_SEC),
  });

  await sendAndConfirm(connection, authority, [createIx]);

  const postCreateAuth = await usdcBalance(connection, authority.publicKey);
  const postCreateEscrow = await usdcBalance(connection, market, true);
  if (postCreateEscrow - preEscrow !== seedNeed) {
    fail(
      `escrow did not receive seed USDC: expected +${seedNeed} got ${postCreateEscrow - preEscrow}`,
    );
  }
  if (preAuthUsdc - postCreateAuth !== seedNeed) {
    fail(
      `authority USDC did not decrease by seed amount: expected -${seedNeed} got ${preAuthUsdc - postCreateAuth}`,
    );
  }

  async function placeBetFor(
    label: string,
    bettor: Keypair,
    side: "survive" | "rug",
  ): Promise<void> {
    const ixs: TransactionInstruction[] = [];
    const ataIx = await ensureUsdcAtaIx(connection, bettor.publicKey, bettor.publicKey);
    if (ataIx) ixs.push(ataIx);
    const bettorUsdc = getAssociatedTokenAddressSync(
      USDC_MINT,
      bettor.publicKey,
      false,
    );
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: market, isSigner: false, isWritable: true },
        { pubkey: bettor.publicKey, isSigner: true, isWritable: true },
        {
          pubkey: betPda(market, bettor.publicKey),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: bettorUsdc, isSigner: false, isWritable: true },
        { pubkey: marketEscrow, isSigner: false, isWritable: true },
        { pubkey: USDC_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodePlaceBet(side, BET_RAW),
    });
    ixs.push(ix);
    logStep(`place_bet ${label}`, { side, amountRaw: BET_RAW.toString() });
    await sendAndConfirm(connection, bettor, ixs);
  }

  await placeBetFor("bettorA (SURVIVE)", bettorA, "survive");
  await placeBetFor("bettorB (RUG)", bettorB, "rug");

  logStep("simulate rug detection (off-chain signal → resolve RUG on-chain)");
  const resolveIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ],
    data: encodeResolveRug(),
  });
  await sendAndConfirm(connection, authority, [resolveIx]);
  logStep("resolve_market complete", { outcome: "rug" });

  const escrowBeforeClaim = await usdcBalance(connection, market, true);
  const bBefore = await usdcBalance(connection, bettorB.publicKey);
  const platformBefore = await usdcBalance(connection, authority.publicKey);

  const winningPool = 10_000_000n + BET_RAW;
  const losingPool = 10_000_000n + BET_RAW;
  const platformFee = (losingPool * 200n) / 10_000n;
  const distributable = losingPool - platformFee;
  const expectedYourShare = (BET_RAW * distributable) / winningPool;
  const expectedFeeShare = (BET_RAW * platformFee) / winningPool;
  const expectedPayout = BET_RAW + expectedYourShare;

  logStep("expected payout math (winner bettorB)", {
    expectedPayout: expectedPayout.toString(),
    expectedFeeToPlatform: expectedFeeShare.toString(),
  });

  const claimIxB = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: market, isSigner: false, isWritable: true },
      {
        pubkey: betPda(market, bettorB.publicKey),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: bettorB.publicKey, isSigner: true, isWritable: false },
      {
        pubkey: getAssociatedTokenAddressSync(USDC_MINT, bettorB.publicKey, false),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: platformUsdc, isSigner: false, isWritable: true },
      {
        pubkey: authority.publicKey,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: marketEscrow, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: IX_CLAIM_PAYOUT,
  });

  logStep("claim_payout bettorB (won RUG side)");
  await sendAndConfirm(connection, bettorB, [claimIxB]);

  const bAfter = await usdcBalance(connection, bettorB.publicKey);
  const platformAfter = await usdcBalance(connection, authority.publicKey);
  const escrowAfterClaim = await usdcBalance(connection, market, true);

  const bGain = bAfter - bBefore;
  const platGain = platformAfter - platformBefore;
  const escrowDelta = escrowBeforeClaim - escrowAfterClaim;

  if (bGain !== expectedPayout) {
    fail(
      `bettorB USDC gain ${bGain} !== expected payout ${expectedPayout}`,
    );
  }
  if (platGain !== expectedFeeShare) {
    fail(
      `platform USDC gain ${platGain} !== expected fee share ${expectedFeeShare}`,
    );
  }
  if (escrowDelta !== expectedPayout + expectedFeeShare) {
    fail(
      `escrow decrease ${escrowDelta} !== payout+fee ${expectedPayout + expectedFeeShare}`,
    );
  }

  logStep("USDC balance checks passed", {
    bettorBGain: bGain.toString(),
    platformFeeReceived: platGain.toString(),
    escrowDecreasedBy: escrowDelta.toString(),
  });

  const claimIxA = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: market, isSigner: false, isWritable: true },
      {
        pubkey: betPda(market, bettorA.publicKey),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: bettorA.publicKey, isSigner: true, isWritable: false },
      {
        pubkey: getAssociatedTokenAddressSync(USDC_MINT, bettorA.publicKey, false),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: platformUsdc, isSigner: false, isWritable: true },
      {
        pubkey: authority.publicKey,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: marketEscrow, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: IX_CLAIM_PAYOUT,
  });

  logStep("claim_payout bettorA (loser) — expect transaction failure");
  try {
    await sendAndConfirm(connection, bettorA, [claimIxA]);
    fail("loser claim unexpectedly succeeded");
  } catch (e) {
    if (e instanceof SendTransactionError || e instanceof Error) {
      logStep("loser claim failed as expected", { error: String(e) });
    } else {
      fail(`unexpected throw type: ${String(e)}`);
    }
  }

  logStep("ALL STEPS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
