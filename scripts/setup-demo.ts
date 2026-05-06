/**
 * Seeds demo markets, demo bettor wallets, and bets for local development.
 *
 * Run from repo root (loads `apps/api/.env`, then root `.env`, for DATABASE_URL):
 *   pnpm setup-demo
 *
 * Or, after `pnpm install` and `npx prisma generate --schema=apps/api/prisma/schema.prisma`:
 *   npx ts-node --project tsconfig.scripts.json scripts/setup-demo.ts
 */

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

const prisma = new PrismaClient();

const DEMO_CREATOR_WALLET = "DemoCreatorSurviveFun111111111111111";

/** Three synthetic “users” that place bets (schema has no User model). */
const DEMO_USER_WALLETS = [
  "DemoUser1SurviveFunWalletAAAAAAAAAAAA",
  "DemoUser2SurviveFunWalletBBBBBBBBBBBB",
  "DemoUser3SurviveFunWalletCCCCCCCCCCCC",
] as const;

const DEMO_MARKETS = [
  {
    tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    tokenName: "Bonk",
    tokenTicker: "BONK",
    durationSeconds: 3600,
    openPrice: "0.000042",
    openLiquidity: "4200",
    devWallet: "7xKpRandom1DemoDevWalletSurviveFun111",
    survivePool: "10",
    rugPool: "10",
  },
  {
    tokenMint: "random_mint_2",
    tokenName: "PepeCoin",
    tokenTicker: "PEPE2",
    durationSeconds: 21600,
    openPrice: "0.0000018",
    openLiquidity: "800",
    devWallet: "8mNqRandom2DemoDevWalletSurviveFun222",
    survivePool: "10",
    rugPool: "10",
  },
  {
    tokenMint: "random_mint_3",
    tokenName: "MoonDoge",
    tokenTicker: "MDOGE",
    durationSeconds: 86400,
    openPrice: "0.00091",
    openLiquidity: "12000",
    devWallet: "9pKrRandom3DemoDevWalletSurviveFun333",
    survivePool: "10",
    rugPool: "10",
  },
] as const;

/** 15 bets: amounts USD 5–50, mixed sides, tx signatures prefixed for cleanup. */
const DEMO_BETS_TEMPLATE: {
  marketIndex: 0 | 1 | 2;
  userIndex: 0 | 1 | 2;
  side: "survive" | "rug";
  amountUsdc: string;
}[] = [
  { marketIndex: 0, userIndex: 0, side: "survive", amountUsdc: "12.5" },
  { marketIndex: 0, userIndex: 1, side: "rug", amountUsdc: "8" },
  { marketIndex: 0, userIndex: 2, side: "survive", amountUsdc: "22.25" },
  { marketIndex: 0, userIndex: 0, side: "rug", amountUsdc: "15" },
  { marketIndex: 0, userIndex: 1, side: "survive", amountUsdc: "40" },
  { marketIndex: 1, userIndex: 2, side: "rug", amountUsdc: "6.75" },
  { marketIndex: 1, userIndex: 0, side: "survive", amountUsdc: "50" },
  { marketIndex: 1, userIndex: 1, side: "rug", amountUsdc: "11" },
  { marketIndex: 1, userIndex: 2, side: "survive", amountUsdc: "33.33" },
  { marketIndex: 1, userIndex: 0, side: "rug", amountUsdc: "19.99" },
  { marketIndex: 2, userIndex: 1, side: "survive", amountUsdc: "5" },
  { marketIndex: 2, userIndex: 2, side: "rug", amountUsdc: "27.5" },
  { marketIndex: 2, userIndex: 0, side: "survive", amountUsdc: "44" },
  { marketIndex: 2, userIndex: 1, side: "rug", amountUsdc: "9.25" },
  { marketIndex: 2, userIndex: 2, side: "survive", amountUsdc: "31" },
];

const TX_PREFIX = "demo_setup_";

async function wipePreviousDemo(): Promise<void> {
  const mints = DEMO_MARKETS.map((m) => m.tokenMint);
  await prisma.bet.deleteMany({
    where: { txSignature: { startsWith: TX_PREFIX } },
  });
  await prisma.market.deleteMany({
    where: { tokenMint: { in: [...mints] } },
  });
  console.log("[setup-demo] Removed prior demo rows (same token mints / demo tx prefix).");
}

async function main(): Promise<void> {
  console.log("[setup-demo] Starting…");

  await wipePreviousDemo();

  const now = Date.now();
  const createdMarkets = [];

  for (const m of DEMO_MARKETS) {
    const expiresAt = new Date(now + m.durationSeconds * 1000);
    const row = await prisma.market.create({
      data: {
        tokenMint: m.tokenMint,
        tokenName: m.tokenName,
        tokenTicker: m.tokenTicker,
        creatorWallet: DEMO_CREATOR_WALLET,
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
  for (const w of DEMO_USER_WALLETS) {
    console.log("  -", w);
  }

  const createdBets = [];
  let i = 0;
  for (const b of DEMO_BETS_TEMPLATE) {
    const market = createdMarkets[b.marketIndex];
    const wallet = DEMO_USER_WALLETS[b.userIndex];
    const txSignature = `${TX_PREFIX}${i}_${market.id.slice(0, 8)}`.slice(0, 88);
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
    demoUsers: DEMO_USER_WALLETS.length,
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
