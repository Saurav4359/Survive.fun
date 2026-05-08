/**
 * On-chain demo bootstrap (devnet).
 *
 * What it does (all on Solana devnet):
 *   1. Generates 3 demo wallet keypairs and writes them to scripts/.demo-wallets/
 *      so the same wallets are reused across runs.
 *   2. Airdrops 2 SOL to each demo wallet.
 *   3. Transfers Circle devnet USDC from the platform authority to each
 *      demo wallet (60 USDC each).
 *   4. Creates 3 markets on-chain (using random tokenMint pubkeys; durations
 *      1h / 6h / 24h) — paid for and seeded by the platform authority.
 *   5. Records on-chain market PDAs into the DB Market rows so the API
 *      verifier and resolver pick them up. Wipes prior demo rows first.
 *
 * Pre-reqs:
 *   - SOLANA_RPC_URL = devnet
 *   - Platform authority keypair (~/.config/solana/id.json or SOLANA_KEYPAIR)
 *     funded with ≥ 2 SOL and ≥ 220 USDC devnet
 *     (60 USDC × 3 wallets + 20 USDC seed × 3 markets ≈ 240 USDC)
 *   - DATABASE_URL (apps/api/.env or .env)
 *   - Program deployed at SURVIVEFUN_PROGRAM_ID
 *
 * Run from repo root:
 *   pnpm setup-demo-onchain
 *
 * For DB-only seed (25 fake bets, no chain interaction):
 *   pnpm setup-demo
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
import { PrismaClient, Prisma } from "@prisma/client";

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

const IX_CREATE_MARKET = Buffer.from("67e261ebc8bcfbfe", "hex");

const ONE_USDC_RAW = 1_000_000n;
const PER_WALLET_USDC = 60n * ONE_USDC_RAW;
const PER_MARKET_SEED = 20n * ONE_USDC_RAW;
const AIRDROP_LAMPORTS = 2_000_000_000;
const WALLETS_DIR = path.join(__dirname, ".demo-wallets");

const DEMO_MARKETS = [
  { ticker: "BONK", name: "Bonk", durationSec: 3600 },
  { ticker: "PEPE2", name: "PepeCoin", durationSec: 21_600 },
  { ticker: "MDOGE", name: "MoonDoge", durationSec: 86_400 },
] as const;

function log(msg: string, detail?: Record<string, unknown>): void {
  if (detail) console.log(`[setup-demo-onchain] ${msg}`, detail);
  else console.log(`[setup-demo-onchain] ${msg}`);
}

function abort(msg: string): never {
  console.error(`[setup-demo-onchain] FATAL: ${msg}`);
  process.exit(1);
}

function loadAuthority(): Keypair {
  const p =
    process.env.SOLANA_KEYPAIR?.trim() ||
    path.join(os.homedir(), ".config/solana/id.json");
  const expanded = p.replace(/^~(?=$|\/)/, os.homedir());
  if (!fs.existsSync(expanded)) abort(`keypair not found at ${expanded}`);
  const secret = JSON.parse(fs.readFileSync(expanded, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function loadOrCreateDemoWallet(slot: number): Keypair {
  if (!fs.existsSync(WALLETS_DIR)) fs.mkdirSync(WALLETS_DIR, { recursive: true });
  const file = path.join(WALLETS_DIR, `demo-wallet-${slot}.json`);
  if (fs.existsSync(file)) {
    const arr = JSON.parse(fs.readFileSync(file, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(file, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

async function airdropToBalance(
  connection: Connection,
  pubkey: PublicKey,
  minLamports: number,
): Promise<void> {
  const before = await connection.getBalance(pubkey, "confirmed");
  if (before >= minLamports) return;
  try {
    const sig = await connection.requestAirdrop(pubkey, minLamports - before);
    await connection.confirmTransaction(sig, "confirmed");
  } catch (e) {
    log("airdrop failed (rate-limited?) — continuing", {
      pubkey: pubkey.toBase58(),
      error: e instanceof Error ? e.message : String(e),
    });
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
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
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

function marketPda(tokenMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), tokenMint.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

async function fundWalletWithUsdc(
  connection: Connection,
  authority: Keypair,
  recipient: PublicKey,
): Promise<void> {
  const ataIx = await ensureUsdcAtaIx(connection, authority.publicKey, recipient);
  const ixs: TransactionInstruction[] = [];
  if (ataIx) ixs.push(ataIx);
  const src = getAssociatedTokenAddressSync(USDC_MINT, authority.publicKey, false);
  const dest = getAssociatedTokenAddressSync(USDC_MINT, recipient, false);
  ixs.push(
    createTransferInstruction(
      src,
      dest,
      authority.publicKey,
      PER_WALLET_USDC,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );
  const sig = await sendTx(connection, authority, ixs);
  log(`funded ${recipient.toBase58()} with ${PER_WALLET_USDC} USDC raw`, { signature: sig });
}

async function createMarketOnChain(
  connection: Connection,
  authority: Keypair,
  durationSec: number,
): Promise<{ tokenMint: PublicKey; market: PublicKey; signature: string }> {
  const tokenMint = Keypair.generate().publicKey;
  const market = marketPda(tokenMint);
  const escrow = getAssociatedTokenAddressSync(USDC_MINT, market, true);
  const platformUsdc = getAssociatedTokenAddressSync(USDC_MINT, authority.publicKey, false);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: platformUsdc, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeCreateMarket(tokenMint, durationSec),
  });
  const signature = await sendTx(connection, authority, [ix]);
  return { tokenMint, market, signature };
}

async function main(): Promise<void> {
  log("starting on-chain demo bootstrap", {
    rpc: RPC_URL,
    programId: PROGRAM_ID.toBase58(),
  });

  const connection = new Connection(RPC_URL, "confirmed");
  const genesis = await connection.getGenesisHash();
  if (genesis !== DEVNET_GENESIS_HASH) {
    abort(`refusing to run: genesis ${genesis} is not devnet`);
  }
  const programInfo = await connection.getAccountInfo(PROGRAM_ID, "confirmed");
  if (!programInfo) abort(`program ${PROGRAM_ID.toBase58()} not found on devnet`);

  const authority = loadAuthority();
  const sol = await connection.getBalance(authority.publicKey);
  if (sol < 200_000_000) {
    abort(
      `authority needs ≥ 0.2 SOL on devnet (have ${sol}). Fund ${authority.publicKey.toBase58()}.`,
    );
  }
  const authAta = getAssociatedTokenAddressSync(USDC_MINT, authority.publicKey, false);
  let authUsdc = 0n;
  try {
    authUsdc = (await getAccount(connection, authAta)).amount;
  } catch {
    abort(
      `authority has no Circle devnet USDC ATA. Fund ${authority.publicKey.toBase58()} via the Circle devnet faucet.`,
    );
  }
  const need = PER_WALLET_USDC * 3n + PER_MARKET_SEED * BigInt(DEMO_MARKETS.length);
  if (authUsdc < need) {
    abort(
      `authority needs ≥ ${need} USDC raw on devnet (have ${authUsdc}). Fund ${authority.publicKey.toBase58()}.`,
    );
  }

  // 1+2+3) Demo wallets: load/create, airdrop SOL, fund USDC.
  const demoWallets: Keypair[] = [];
  for (let i = 0; i < 3; i++) {
    const kp = loadOrCreateDemoWallet(i);
    demoWallets.push(kp);
    log(`demo wallet ${i} = ${kp.publicKey.toBase58()}`);
    await airdropToBalance(connection, kp.publicKey, AIRDROP_LAMPORTS);
    await fundWalletWithUsdc(connection, authority, kp.publicKey);
  }

  // 4) Create 3 markets on-chain.
  const created: {
    ticker: string;
    name: string;
    durationSec: number;
    tokenMint: string;
    market: string;
    signature: string;
  }[] = [];

  for (const m of DEMO_MARKETS) {
    log(`creating ${m.ticker} on-chain (${m.durationSec}s)…`);
    const r = await createMarketOnChain(connection, authority, m.durationSec);
    log(`✅ ${m.ticker} created`, {
      tokenMint: r.tokenMint.toBase58(),
      marketPda: r.market.toBase58(),
      signature: r.signature,
    });
    created.push({
      ticker: m.ticker,
      name: m.name,
      durationSec: m.durationSec,
      tokenMint: r.tokenMint.toBase58(),
      market: r.market.toBase58(),
      signature: r.signature,
    });
  }

  // 5) DB write: wipe prior demo rows by token-mint, insert new ones.
  if (!process.env.DATABASE_URL?.trim()) {
    log("DATABASE_URL not set — skipping DB rows. On-chain markets are still live.");
    return;
  }

  const prisma = new PrismaClient();
  try {
    await prisma.bet.deleteMany({
      where: { txSignature: { startsWith: "demo_onchain_" } },
    });
    await prisma.market.deleteMany({
      where: {
        tokenMint: { in: created.map((c) => c.tokenMint) },
      },
    });

    for (const c of created) {
      const row = await prisma.market.create({
        data: {
          tokenMint: c.tokenMint,
          tokenName: c.name,
          tokenTicker: c.ticker,
          creatorWallet: authority.publicKey.toBase58(),
          durationSeconds: c.durationSec,
          expiresAt: new Date(Date.now() + c.durationSec * 1000),
          survivePool: new Prisma.Decimal(10),
          rugPool: new Prisma.Decimal(10),
          openPrice: null,
          openLiquidity: null,
          devWallet: demoWallets[0].publicKey.toBase58(),
          status: "active",
          outcome: null,
          onChainAddress: c.market,
        },
      });
      log("inserted market row", { id: row.id, tokenMint: row.tokenMint, onChain: row.onChainAddress });
    }
  } finally {
    await prisma.$disconnect();
  }

  log("───────────── on-chain demo summary ─────────────");
  log("Demo wallets (kept in scripts/.demo-wallets/):");
  demoWallets.forEach((kp, i) => log(`  [${i}] ${kp.publicKey.toBase58()}`));
  log("Markets:");
  for (const c of created) {
    log(`  ${c.ticker}  market=${c.market}  mint=${c.tokenMint}  tx=${c.signature}`);
  }
  log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
