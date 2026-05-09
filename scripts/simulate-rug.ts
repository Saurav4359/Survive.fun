/**
 * Demo only: simulate a rug for judges (devnet).
 *
 * Usage (repo root):
 *   npx ts-node --project tsconfig.scripts.json scripts/simulate-rug.ts <marketId>
 *
 * Requires:
 *   - DATABASE_URL, HELIUS_API_KEY (resolver uses Helius for dev_sell)
 *   - API running with resolver (or wait will time out)
 *   - SIMULATE_DEV_KEYPAIR: path to JSON keypair = market devWallet (or creatorWallet)
 *   - SOLANA_RPC_URL devnet (optional)
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  assertDemoNetworkEnv,
  assertDevnetRpc,
  banner,
  decimalStringToRaw6,
  die,
  getDemoConnection,
  log,
  logPayoutTable,
  pollUntilResolved,
} from "./lib/simulate-helpers";

const repoRoot = path.resolve(__dirname, "..");
loadEnv({ path: path.join(repoRoot, "apps", "api", ".env") });
loadEnv({ path: path.join(repoRoot, ".env") });

const DEMO_DEV_SELL_THRESHOLD = "0.05";

function loadKeypairJson(filePath: string): Keypair {
  const expanded = filePath.replace(/^~(?=$|\/)/, process.env.HOME ?? "");
  if (!fs.existsSync(expanded)) die(`Keypair file not found: ${expanded}`);
  const raw = JSON.parse(fs.readFileSync(expanded, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function mintOwnerProgram(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint, "confirmed");
  if (!info) die(`Mint account not found: ${mint.toBase58()}`);
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

async function main(): Promise<void> {
  banner("simulate-rug (devnet demo)");
  assertDemoNetworkEnv();

  const marketId = process.argv[2]?.trim();
  if (!marketId) {
    die("Usage: npx ts-node --project tsconfig.scripts.json scripts/simulate-rug.ts <marketId>");
  }

  const keypairPath = process.env.SIMULATE_DEV_KEYPAIR?.trim();
  if (!keypairPath) {
    die("Set SIMULATE_DEV_KEYPAIR to the JSON keypair path for the market dev/creator wallet.");
  }

  const prisma = new PrismaClient();
  const connection = getDemoConnection();
  await assertDevnetRpc(connection);

  const row = await prisma.market.findUnique({ where: { id: marketId } });
  if (!row) die(`Market not found: ${marketId}`);
  if (row.status !== "active") die(`Market must be active (status=${row.status})`);

  const devWallet =
    row.devWallet?.trim() || row.creatorWallet?.trim() || "";
  if (!devWallet) die("Market has no devWallet or creatorWallet");

  const devKp = loadKeypairJson(keypairPath);
  if (devKp.publicKey.toBase58() !== devWallet) {
    die(
      `SIMULATE_DEV_KEYPAIR pubkey ${devKp.publicKey.toBase58()} does not match dev/creator ${devWallet}`,
    );
  }

  let mintPk: PublicKey;
  try {
    mintPk = new PublicKey(row.tokenMint);
  } catch {
    die(`Invalid tokenMint on market: ${row.tokenMint}`);
  }

  const prevOverride = row.devSellThresholdOverride;
  log("Lowering dev_sell ratio threshold to 5% for this market only (DB).", {
    marketId,
    previousOverride: prevOverride?.toString() ?? null,
  });

  await prisma.market.update({
    where: { id: marketId },
    data: { devSellThresholdOverride: DEMO_DEV_SELL_THRESHOLD },
  });

  try {
    const tokenProgram = await mintOwnerProgram(connection, mintPk);
    const mintInfo = await getMint(connection, mintPk, undefined, tokenProgram);
    const decimals = mintInfo.decimals;

    const sourceAta = getAssociatedTokenAddressSync(
      mintPk,
      devKp.publicKey,
      false,
      tokenProgram,
    );
    const sinkKp = Keypair.generate();
    const sinkAta = getAssociatedTokenAddressSync(
      mintPk,
      sinkKp.publicKey,
      false,
      tokenProgram,
    );

    let srcAccount;
    try {
      srcAccount = await getAccount(connection, sourceAta, "confirmed", tokenProgram);
    } catch {
      die(
        `No token ATA for dev wallet + mint (or mint invalid). Dev: ${devWallet} mint: ${row.tokenMint}`,
      );
    }

    const balance = srcAccount.amount;
    const transferAmount = (balance * 10n) / 100n;
    if (transferAmount < 1n) {
      die(
        `Dev token balance too small to simulate ~10% sell (raw balance ${balance}). Fund the dev ATA for ${row.tokenTicker ?? row.tokenMint}.`,
      );
    }

    log("Sending SPL transfer (dev → sink) to trigger dev_sell heuristic.", {
      mint: row.tokenMint,
      decimals,
      transferRaw: transferAmount.toString(),
      transferUi: (Number(transferAmount) / 10 ** decimals).toFixed(decimals),
      sink: sinkKp.publicKey.toBase58(),
      devWallet,
    });

    const ixs = [
      createAssociatedTokenAccountIdempotentInstruction(
        devKp.publicKey,
        sinkAta,
        sinkKp.publicKey,
        mintPk,
        tokenProgram,
      ),
      createTransferInstruction(
        sourceAta,
        sinkAta,
        devKp.publicKey,
        transferAmount,
        [],
        tokenProgram,
      ),
    ];

    const tx = new Transaction().add(...ixs);
    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [devKp],
      { commitment: "confirmed" },
    );
    log("Transfer confirmed.", { signature: sig });

    log("Waiting for API resolver to detect rug (poll DB)…", {
      hint: "Ensure apps/api is running with HELIUS_API_KEY and resolver tick.",
    });

    const resolved = await pollUntilResolved(prisma, marketId, "rug", {
      timeoutMs: 600_000,
      intervalMs: 2500,
    });

    log("Market resolved as RUG.", {
      marketId: resolved.id,
      outcome: resolved.outcome,
    });

    const bets = await prisma.bet.findMany({ where: { marketId } });
    const betDtos = bets.map((b) => ({
      id: b.id,
      marketId: b.marketId,
      bettorWallet: b.bettorWallet,
      side: b.side as "survive" | "rug",
      currency: b.currency === "sol" ? "sol" as const : "usdc" as const,
      amountUsdc:
        b.currency === "usdc" ? b.amountUsdc.toString() : null,
      amountLamports:
        b.currency === "sol"
          ? b.amountUsdc.toFixed(0).split(".")[0] ?? "0"
          : null,
      potentialWin: b.potentialWin?.toString() ?? null,
      txSignature: b.txSignature,
      claimed: b.claimed,
      payoutAmount: b.payoutAmount?.toString() ?? null,
      payoutTx: b.payoutTx,
      createdAt: b.createdAt.toISOString(),
    }));

    logPayoutTable({ market: resolved, bets: betDtos });

    const poolNote = {
      survivePoolRaw: decimalStringToRaw6(resolved.survivePool).toString(),
      rugPoolRaw: decimalStringToRaw6(resolved.rugPool).toString(),
    };
    log("Pool snapshot used for payout math (from DB at resolution).", poolNote);

    // Pull the RugEvent persisted by the resolver to surface the on-chain
    // `resolve_market` signature alongside the dev-sell transfer signature.
    const rugEvents = await prisma.rugEvent.findMany({
      where: { marketId },
      orderBy: { detectedAt: "desc" },
      take: 1,
    });
    const rugEvent = rugEvents[0];

    const winners = bets.filter((b) =>
      (resolved.outcome === "rug" && b.side === "rug") ||
      (resolved.outcome === "survive" && b.side === "survive"),
    );
    const losers = bets.length - winners.length;

    log("─────────────── DEMO RUG SUMMARY ───────────────");
    log("Market", { id: resolved.id, ticker: resolved.tokenTicker, mint: resolved.tokenMint });
    log("Outcome", {
      outcome: resolved.outcome,
      winners: winners.length,
      losers,
    });
    log("On-chain signatures", {
      devSellTransfer: sig,
      resolveMarket: rugEvent?.txSignature ?? "(resolver did not record on-chain tx — check PLATFORM_WALLET_SECRET_KEY)",
      rugEventCondition: rugEvent?.eventType ?? null,
    });
    log("───────────────────────────────────────────────");
  } finally {
    log("Restoring dev_sell threshold override on market.", {
      restoredTo: prevOverride?.toString() ?? "null",
    });
    await prisma.market.update({
      where: { id: marketId },
      data: { devSellThresholdOverride: prevOverride },
    });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
