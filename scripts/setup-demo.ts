/**
 * Seeds demo markets and bets for local development.
 *
 * Run from repo root:
 *   npx ts-node scripts/setup-demo.ts
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
if (process.env.DATABASE_URL.toLowerCase().includes("placeholder")) {
  console.error("Set real DATABASE_URL first");
  process.exit(1);
}

const creatorWallet = "7u1f7PjM9n4EsrA8sNpR8uS3Yf9rE7d8qJgN5H2k6LmP";
const userWallets = [
  "8hW9v5kKx2Yq8M4s3Zr6Nf2Dq7Pj4Lw1Tg9sVb6mQeY2",
  "4tY8dK3nQp7Lr2Vb9sJm5Fh1Wz6Xc8Nq3Pj7Rk4LhM2",
  "9pR3mN7kL2Qv8sD4wX5tY1hF6jK3bV9zC2nM7qL4rT8",
  "5kN2vR8mP3sQ7dL1xF9hT4wY6jZ2cV8bM5nQ1rL7pK3",
  "2mQ8rT4vN7kL1dP5sX9hF3wY6jZ2cV8bM4nQ1rL7pK5",
  "7dL3pK9mQ2rT8vN1sX5hF4wY6jZ2cV8bM7nQ1rL4pK3",
];

const marketsSeed = [
  {
    tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    tokenName: "PepeCoin",
    tokenTicker: "PEPE2",
    durationSeconds: 3600,
    openPrice: "0.00013",
    openLiquidity: "42000",
    devWallet: "9qPmDemoDevWallet111111111111111111111111111",
    survivePool: "10",
    rugPool: "10",
  },
  {
    tokenMint: "7zQ5Q8bG8AaP8k1hVj6xVg4E2j5qC6Y8L4j2f1n8mP9A",
    tokenName: "MoonFrog",
    tokenTicker: "MFRG",
    durationSeconds: 21600,
    openPrice: "0.00042",
    openLiquidity: "28000",
    devWallet: "6mQkDemoDevWallet222222222222222222222222222",
    survivePool: "10",
    rugPool: "10",
  },
  {
    tokenMint: "So11111111111111111111111111111111111111112",
    tokenName: "SafeRocket",
    tokenTicker: "SRKT",
    durationSeconds: 86400,
    openPrice: "0.00091",
    openLiquidity: "12000",
    devWallet: "9pKrRandom3ghiiiiiiiiiiiiiiiiiiiiiiiiiiii",
    survivePool: "10",
    rugPool: "10",
  },
] as const;

const betsTemplate: Array<{
  marketIndex: number;
  userIndex: number;
  side: "survive" | "rug";
  amountUsdc: string;
}> = [
  { marketIndex: 0, userIndex: 0, side: "survive", amountUsdc: "5" },
  { marketIndex: 0, userIndex: 1, side: "rug", amountUsdc: "10" },
  { marketIndex: 0, userIndex: 2, side: "survive", amountUsdc: "15" },
  { marketIndex: 0, userIndex: 3, side: "rug", amountUsdc: "20" },
  { marketIndex: 0, userIndex: 4, side: "survive", amountUsdc: "25" },
  { marketIndex: 1, userIndex: 1, side: "survive", amountUsdc: "8" },
  { marketIndex: 1, userIndex: 2, side: "rug", amountUsdc: "12" },
  { marketIndex: 1, userIndex: 3, side: "survive", amountUsdc: "18" },
  { marketIndex: 1, userIndex: 4, side: "rug", amountUsdc: "30" },
  { marketIndex: 1, userIndex: 5, side: "survive", amountUsdc: "50" },
  { marketIndex: 2, userIndex: 0, side: "rug", amountUsdc: "7" },
  { marketIndex: 2, userIndex: 2, side: "survive", amountUsdc: "14" },
  { marketIndex: 2, userIndex: 3, side: "rug", amountUsdc: "22" },
  { marketIndex: 2, userIndex: 4, side: "survive", amountUsdc: "35" },
  { marketIndex: 2, userIndex: 5, side: "rug", amountUsdc: "45" },
];

const txPrefix = "demo_tx_";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("[setup-demo] Starting…");
  const seed = {
    creatorWallet,
    userWallets,
    markets: marketsSeed,
    betsTemplate,
    txPrefix,
  };

  await prisma.bet.deleteMany({
    where: { txSignature: { startsWith: txPrefix } },
  });
  await prisma.market.deleteMany({
    where: {
      tokenMint: {
        in: marketsSeed.map((m) => m.tokenMint),
      },
    },
  });
  console.log("[setup-demo] Removed prior demo rows (same mints / tx prefix).");

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
        currency: "usdc",
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
        currency: "usdc",
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
