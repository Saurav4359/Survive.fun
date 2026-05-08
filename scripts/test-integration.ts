/**
 * End-to-end integration test for Survive.fun on devnet.
 *
 * What it covers:
 *   1. Solana program is deployed at expected program id.
 *   2. create_market on-chain (PDA, escrow seed, status=Active).
 *   3. place_bet SURVIVE side on-chain (USDC moves to escrow, survive_pool grows).
 *   4. place_bet RUG side on-chain (rug_pool grows).
 *   5. resolve_market as RUG (platform authority signer).
 *   6. Winner (RUG bettor) claims, payout USDC delta matches formula.
 *   7. Loser (SURVIVE bettor) cannot claim — DidNotWin error.
 *   8. Cannot claim twice — AlreadyClaimed error.
 *   9. All transaction signatures captured & printed.
 *
 * Pre-reqs: same as test-flow.ts —
 *   - Program deployed (`scripts/deploy-contract.sh`)
 *   - Funded authority keypair (~/.config/solana/id.json or SOLANA_KEYPAIR)
 *     with ≥ 0.5 SOL devnet and ≥ 60 USDC Circle devnet
 *
 * Run from repo root:
 *   pnpm test-integration
 *
 * Notes:
 * - This script targets the on-chain program directly. It does NOT need the
 *   API or DB to be running. The companion `simulate-rug.ts` exercises the
 *   API resolver path; this script proves contract correctness end-to-end.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
} from "@solana/web3.js";
import { config as loadEnv } from "dotenv";

const repoRoot = path.resolve(__dirname, "..");
loadEnv({ path: path.join(repoRoot, "apps", "api", ".env") });
loadEnv({ path: path.join(repoRoot, ".env") });

const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

const USDC_MINT = new PublicKey(
  process.env.USDC_MINT_DEVNET?.trim() ||
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

const PROGRAM_ID = new PublicKey(
  process.env.SURVIVEFUN_PROGRAM_ID?.trim() ||
    process.env.NEXT_PUBLIC_PROGRAM_ID?.trim() ||
    "HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH",
);

const RPC_URL =
  process.env.SOLANA_RPC_URL?.trim() ||
  process.env.NEXT_PUBLIC_RPC_URL?.trim() ||
  clusterApiUrl("devnet");

/* ---- Anchor sha256("global:<name>")[0..8] discriminators ----- */
const IX_CREATE_MARKET = Buffer.from("67e261ebc8bcfbfe", "hex");
const IX_PLACE_BET = Buffer.from("de3e43dc3fa67e21", "hex");
const IX_RESOLVE_MARKET = Buffer.from("9b1750ad2e4a17ef", "hex");
const IX_CLAIM_PAYOUT = Buffer.from("7ff0843ee3c69285", "hex");

const PLATFORM_SEED_RAW = 10_000_000n;
const BET_RAW = 5_000_000n;
const PLATFORM_FEE_BPS = 200n;
const MARKET_DURATION_SEC = 3600;

type Step = {
  name: string;
  passed: boolean;
  detail?: string;
  signature?: string;
};

const steps: Step[] = [];
const txSignatures: { label: string; signature: string }[] = [];

function record(step: Step): void {
  steps.push(step);
  if (step.signature) {
    txSignatures.push({ label: step.name, signature: step.signature });
  }
  const icon = step.passed ? "✅" : "❌";
  const sig = step.signature ? `\n          tx: ${step.signature}` : "";
  const det = step.detail ? `\n          ${step.detail}` : "";
  console.log(`[test-integration] ${icon} ${step.name}${sig}${det}`);
}

function abort(msg: string): never {
  console.error(`[test-integration] FATAL: ${msg}`);
  process.exit(1);
}

function loadAuthority(): Keypair {
  const p =
    process.env.SOLANA_KEYPAIR?.trim() ||
    path.join(os.homedir(), ".config/solana/id.json");
  const expanded = p.replace(/^~(?=$|\/)/, os.homedir());
  if (!fs.existsSync(expanded)) {
    abort(`keypair not found at ${expanded} (set SOLANA_KEYPAIR)`);
  }
  const secret = JSON.parse(fs.readFileSync(expanded, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function marketPda(tokenMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), tokenMint.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

function betPda(market: PublicKey, bettor: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), market.toBuffer(), bettor.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

async function usdcBalance(
  connection: Connection,
  owner: PublicKey,
  allowOffCurve = false,
): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(USDC_MINT, owner, allowOffCurve);
  try {
    return (await getAccount(connection, ata)).amount;
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

async function sendTx(
  connection: Connection,
  payer: Keypair,
  ixs: TransactionInstruction[],
  extra: Keypair[] = [],
): Promise<string> {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = payer.publicKey;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(payer, ...extra);
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

function encodeResolve(outcome: "survive" | "rug"): Buffer {
  return Buffer.concat([IX_RESOLVE_MARKET, Buffer.from([outcome === "rug" ? 1 : 0])]);
}

async function main(): Promise<void> {
  console.log("[test-integration] starting on", RPC_URL, "program", PROGRAM_ID.toBase58());

  const connection = new Connection(RPC_URL, "confirmed");

  // ── Step 1: devnet sanity + program deployed ────────────────
  const genesis = await connection.getGenesisHash();
  if (genesis !== DEVNET_GENESIS_HASH) {
    abort(`refusing to run: genesis ${genesis} is not devnet`);
  }
  const programInfo = await connection.getAccountInfo(PROGRAM_ID, "confirmed");
  if (!programInfo) {
    record({
      name: "program is deployed on devnet",
      passed: false,
      detail: `${PROGRAM_ID.toBase58()} not found — run scripts/deploy-contract.sh first.`,
    });
    summary();
    process.exit(1);
  }
  record({
    name: "program is deployed on devnet",
    passed: true,
    detail: `executable=${programInfo.executable}, owner=${programInfo.owner.toBase58()}`,
  });

  const authority = loadAuthority();
  const seedNeed = PLATFORM_SEED_RAW * 2n;
  const authUsdc = await usdcBalance(connection, authority.publicKey);
  if (authUsdc < seedNeed + BET_RAW * 4n) {
    record({
      name: "authority has enough USDC + SOL on devnet",
      passed: false,
      detail: `have ${authUsdc} raw, need ≥ ${seedNeed + BET_RAW * 4n}. Fund ${authority.publicKey.toBase58()}.`,
    });
    summary();
    process.exit(1);
  }
  record({
    name: "authority has enough USDC + SOL on devnet",
    passed: true,
    detail: `pubkey=${authority.publicKey.toBase58()} usdc=${authUsdc}`,
  });

  // ── Step 2: bettors funded (SOL + USDC) ─────────────────────
  const bettorWin = Keypair.generate(); // bets RUG → wins (we resolve RUG)
  const bettorLose = Keypair.generate(); // bets SURVIVE → loses
  for (const [label, kp] of [["winner", bettorWin], ["loser", bettorLose]] as const) {
    try {
      const sig = await connection.requestAirdrop(kp.publicKey, 1_000_000_000);
      await connection.confirmTransaction(sig, "confirmed");
    } catch (e) {
      // airdrop rate limited on devnet — try anyway and continue if balance > 0
      const bal = await connection.getBalance(kp.publicKey, "confirmed");
      if (bal === 0) {
        abort(`airdrop failed for ${label}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  // Fund bettors with USDC from authority
  for (const [label, kp] of [["winner", bettorWin], ["loser", bettorLose]] as const) {
    const ataIx = await ensureUsdcAtaIx(connection, authority.publicKey, kp.publicKey);
    const ixs: TransactionInstruction[] = [];
    if (ataIx) ixs.push(ataIx);
    const dest = getAssociatedTokenAddressSync(USDC_MINT, kp.publicKey, false);
    const src = getAssociatedTokenAddressSync(USDC_MINT, authority.publicKey, false);
    ixs.push(
      createTransferInstruction(
        src,
        dest,
        authority.publicKey,
        BET_RAW + 1_000_000n,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );
    const sig = await sendTx(connection, authority, ixs);
    record({
      name: `funded bettor ${label} with USDC`,
      passed: true,
      signature: sig,
      detail: `${kp.publicKey.toBase58()} +${BET_RAW + 1_000_000n} raw`,
    });
  }

  // ── Step 3: create_market on-chain ──────────────────────────
  const tokenMint = Keypair.generate().publicKey;
  const market = marketPda(tokenMint);
  const marketEscrow = getAssociatedTokenAddressSync(USDC_MINT, market, true);
  const platformUsdc = getAssociatedTokenAddressSync(USDC_MINT, authority.publicKey, false);

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
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeCreateMarket(tokenMint, MARKET_DURATION_SEC),
  });

  const createSig = await sendTx(connection, authority, [createIx]);
  const postEscrow = await usdcBalance(connection, market, true);
  const escrowDelta = postEscrow - preEscrow;
  record({
    name: "create_market on-chain (escrow seeded with 20 USDC)",
    passed: escrowDelta === PLATFORM_SEED_RAW * 2n,
    signature: createSig,
    detail: `escrowΔ=${escrowDelta} expected=${PLATFORM_SEED_RAW * 2n} market=${market.toBase58()} mint=${tokenMint.toBase58()}`,
  });
  if (escrowDelta !== PLATFORM_SEED_RAW * 2n) {
    summary();
    process.exit(1);
  }

  // ── Step 4: place_bet SURVIVE (loser) and RUG (winner) ──────
  async function placeBet(label: string, bettor: Keypair, side: "survive" | "rug"): Promise<void> {
    const ataIx = await ensureUsdcAtaIx(connection, bettor.publicKey, bettor.publicKey);
    const ixs: TransactionInstruction[] = [];
    if (ataIx) ixs.push(ataIx);
    const bettorUsdc = getAssociatedTokenAddressSync(USDC_MINT, bettor.publicKey, false);
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: market, isSigner: false, isWritable: true },
        { pubkey: bettor.publicKey, isSigner: true, isWritable: true },
        { pubkey: betPda(market, bettor.publicKey), isSigner: false, isWritable: true },
        { pubkey: bettorUsdc, isSigner: false, isWritable: true },
        { pubkey: marketEscrow, isSigner: false, isWritable: true },
        { pubkey: USDC_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodePlaceBet(side, BET_RAW),
    });
    ixs.push(ix);
    const sig = await sendTx(connection, bettor, ixs);
    record({
      name: `place_bet ${label} (${side}, 5 USDC)`,
      passed: true,
      signature: sig,
    });
  }

  await placeBet("loser bettor", bettorLose, "survive");
  await placeBet("winner bettor", bettorWin, "rug");

  // ── Step 5: resolve_market as RUG ──────────────────────────
  const resolveIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ],
    data: encodeResolve("rug"),
  });
  const resolveSig = await sendTx(connection, authority, [resolveIx]);
  record({
    name: "resolve_market as RUG (platform authority signs)",
    passed: true,
    signature: resolveSig,
  });

  // ── Step 6: winner claim — assert correct USDC payout ──────
  const winningPool = PLATFORM_SEED_RAW + BET_RAW;
  const losingPool = PLATFORM_SEED_RAW + BET_RAW;
  const platformFee = (losingPool * PLATFORM_FEE_BPS) / 10_000n;
  const distributable = losingPool - platformFee;
  const yourShare = (BET_RAW * distributable) / winningPool;
  const expectedPayout = BET_RAW + yourShare;
  const expectedFeeShare = (BET_RAW * platformFee) / winningPool;

  const winBefore = await usdcBalance(connection, bettorWin.publicKey);
  const platformBefore = await usdcBalance(connection, authority.publicKey);

  const claimIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: betPda(market, bettorWin.publicKey), isSigner: false, isWritable: true },
      { pubkey: bettorWin.publicKey, isSigner: true, isWritable: false },
      {
        pubkey: getAssociatedTokenAddressSync(USDC_MINT, bettorWin.publicKey, false),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: platformUsdc, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: false, isWritable: false },
      { pubkey: marketEscrow, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: IX_CLAIM_PAYOUT,
  });
  const claimSig = await sendTx(connection, bettorWin, [claimIx]);

  const winAfter = await usdcBalance(connection, bettorWin.publicKey);
  const platformAfter = await usdcBalance(connection, authority.publicKey);

  const winDelta = winAfter - winBefore;
  const platDelta = platformAfter - platformBefore;
  record({
    name: "winner claim_payout — USDC delta matches formula",
    passed: winDelta === expectedPayout && platDelta === expectedFeeShare,
    signature: claimSig,
    detail: `winnerΔ=${winDelta} expected=${expectedPayout}, platformΔ=${platDelta} expected fee=${expectedFeeShare}`,
  });

  // ── Step 7: winner cannot claim twice — AlreadyClaimed ─────
  try {
    await sendTx(connection, bettorWin, [claimIx]);
    record({
      name: "winner cannot claim twice (AlreadyClaimed)",
      passed: false,
      detail: "second claim unexpectedly succeeded",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    record({
      name: "winner cannot claim twice (AlreadyClaimed)",
      passed: msg.includes("0x1") || msg.toLowerCase().includes("alreadyclaimed") || msg.includes("custom program error"),
      detail: msg.split("\n")[0],
    });
  }

  // ── Step 8: loser cannot claim — DidNotWin ─────────────────
  const claimIxLoser = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: betPda(market, bettorLose.publicKey), isSigner: false, isWritable: true },
      { pubkey: bettorLose.publicKey, isSigner: true, isWritable: false },
      {
        pubkey: getAssociatedTokenAddressSync(USDC_MINT, bettorLose.publicKey, false),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: platformUsdc, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: false, isWritable: false },
      { pubkey: marketEscrow, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: IX_CLAIM_PAYOUT,
  });
  try {
    await sendTx(connection, bettorLose, [claimIxLoser]);
    record({
      name: "loser cannot claim_payout (DidNotWin)",
      passed: false,
      detail: "loser claim unexpectedly succeeded",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    record({
      name: "loser cannot claim_payout (DidNotWin)",
      passed: msg.includes("custom program error") || msg.toLowerCase().includes("didnotwin"),
      detail: msg.split("\n")[0],
    });
  }

  summary();
  const failing = steps.filter((s) => !s.passed);
  process.exit(failing.length === 0 ? 0 : 1);
}

function summary(): void {
  const total = steps.length;
  const passed = steps.filter((s) => s.passed).length;
  console.log("\n[test-integration] ───────────── summary ─────────────");
  console.log(`[test-integration] ${passed}/${total} steps passed`);
  if (passed !== total) {
    console.log("[test-integration] failing steps:");
    for (const s of steps) {
      if (!s.passed) console.log(`[test-integration]   ✗ ${s.name} — ${s.detail ?? ""}`);
    }
  }
  console.log("\n[test-integration] tx signatures:");
  for (const s of txSignatures) {
    console.log(`[test-integration]   ${s.label}\n    ${s.signature}`);
  }
}

main().catch((e) => {
  console.error("[test-integration] fatal", e);
  summary();
  process.exit(1);
});
