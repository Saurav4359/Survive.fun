/**
 * Seeds demo markets, demo bettor wallets, and bets for local development.
 * Data is loaded from `demo-seed-data.json` (no inline seed constants).
 *
 * Run from repo root (loads `apps/api/.env`, then root `.env`, for DATABASE_URL):
 *   pnpm setup-demo
 */

import fs from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

const repoRoot = path.resolve(__dirname, "..");
const apiEnv = path.join(repoRoot, "apps", "api", ".env");
const rootEnv = path.join(repoRoot, ".env");
loadEnv({ path: apiEnv });
if (!process.env.DATABASE_URL?.trim()) {
  loadEnv({ path: rootEnv });
}
if (!process.env.DATABASE_URL?.trim()) {
  console.error(
    "[setup-demo] DATABASE_URL is not set. Add it to apps/api/.env (or .env at repo root).",
  );
  process.exit(1);
}

type SeedFile = {
  creatorWallet: string;
  userWallets: string[];
  markets: {
    tokenMint: string;
    tokenName: string;
    tokenTicker: string;
    durationSeconds: number;
    openPrice: string;
    openLiquidity: string;
    devWallet: string;
    survivePool: string;
    rugPool: string;
  }[];
  betsTemplate: {
    marketIndex: number;
    userIndex: number;
    side: "survive" | "rug";
    amountUsdc: string;
  }[];
  txPrefix: string;
};

function loadSeed(): SeedFile {
  const seedPath = path.join(__dirname, "demo-seed-data.json");
  const raw = fs.readFileSync(seedPath, "utf8");
  return JSON.parse(raw) as SeedFile;
}

const prisma = new PrismaClient();

async function wipePreviousDemo(seed: SeedFile): Promise<void> {
  const mints = seed.markets.map((m) => m.tokenMint);
  await prisma.bet.deleteMany({
    where: { txSignature: { startsWith: seed.txPrefix } },
  });
  await prisma.market.deleteMany({
    where: { tokenMint: { in: [...mints] } },
  });
  console.log("[setup-demo] Removed prior demo rows (same token mints / demo tx prefix).");
}

async function main(): Promise<void> {
  const seed = loadSeed();
  console.log("[setup-demo] Starting…");

  await wipePreviousDemo(seed);

  const now = Date.now();
  const createdMarkets = [];

  for (const m of seed.markets) {
    const expiresAt = new Date(now + m.durationSeconds * 1000);
    const row = await prisma.market.create({
      data: {
        tokenMint: m.tokenMint,
        tokenName: m.tokenName,
        tokenTicker: m.tokenTicker,
        creatorWallet: seed.creatorWallet,
        durationSeconds: m.durationSeconds,
        expiresAt,
        survivePool: m.survivePool,
        rugPool: m.rugPool,
        openPrice: m.openPrice,
        openLiquidity: m.openLiquidity,
        devWallet: m.devWallet,
        status: "active",
        outcome: null,
        onChainAddress: null,
        totalBettors: 0,
      },
    });
    createdMarkets.push(row);
    console.log("[setup-demo] Created market", {
      id: row.id,
      tokenMint: row.tokenMint,
      tokenName: row.tokenName,
      tokenTicker: row.tokenTicker,
      durationSeconds: row.durationSeconds,
      expiresAt: row.expiresAt.toISOString(),
      openPrice: row.openPrice?.toString(),
      openLiquidity: row.openLiquidity?.toString(),
      devWallet: row.devWallet,
      survivePool: row.survivePool.toString(),
      rugPool: row.rugPool.toString(),
    });
  }

  console.log("[setup-demo] Demo users (bettor wallets):");
  for (const w of seed.userWallets) {
    console.log("  -", w);
  }

  const createdBets = [];
  let i = 0;
  for (const b of seed.betsTemplate) {
    const market = createdMarkets[b.marketIndex];
    if (!market) continue;
    const wallet = seed.userWallets[b.userIndex];
    if (!wallet) continue;
    const txSignature = `${seed.txPrefix}${i}_${market.id.slice(0, 8)}`.slice(0, 88);
    const bet = await prisma.bet.create({
      data: {
        marketId: market.id,
        bettorWallet: wallet,
        side: b.side,
        amountUsdc: b.amountUsdc,
        potentialWin: null,
        txSignature,
        claimed: false,
      },
    });
    createdBets.push(bet);
    console.log("[setup-demo] Created bet", {
      id: bet.id,
      marketId: bet.marketId,
      bettorWallet: bet.bettorWallet,
      side: bet.side,
      amountUsdc: bet.amountUsdc.toString(),
      txSignature: bet.txSignature,
    });
    i += 1;
  }

  for (const market of createdMarkets) {
    const distinct = await prisma.bet.groupBy({
      by: ["bettorWallet"],
      where: { marketId: market.id },
    });
    const totalBettors = distinct.length;
    await prisma.market.update({
      where: { id: market.id },
      data: { totalBettors },
    });
    console.log("[setup-demo] Updated market totalBettors", {
      marketId: market.id,
      totalBettors,
    });
  }

  console.log("[setup-demo] Done.", {
    markets: createdMarkets.length,
    bets: createdBets.length,
    demoUsers: seed.userWallets.length,
  });
}

main()
  .catch((e) => {
    console.error("[setup-demo] Failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
