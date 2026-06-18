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

/** Lamports (SOL pools). Platform seeds 0.01 SOL/side; totals include fake bet volume. */
const LAMPORTS = {
  seed: "10000000",
  half: "500000000",
  one: "1000000000",
  oneHalf: "1500000000",
  two: "2000000000",
  twoHalf: "2500000000",
  three: "3000000000",
  four: "4000000000",
  five: "5000000000",
  six: "6000000000",
  eight: "8000000000",
  ten: "10000000000",
  twelve: "12000000000",
} as const;

const marketsSeed = [
  {
    tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    tokenName: "PepeCoin",
    tokenTicker: "PEPE2",
    durationSeconds: 3600,
    openPrice: "0.00013",
    openLiquidity: "42000",
    devWallet: "9qPmDemoDevWallet111111111111111111111111111",
    survivePool: "1420000000",
    rugPool: "5870000000",
  },
  {
    tokenMint: "7zQ5Q8bG8AaP8k1hVj6xVg4E2j5qC6Y8L4j2f1n8mP9A",
    tokenName: "MoonFrog",
    tokenTicker: "MFRG",
    durationSeconds: 21600,
    openPrice: "0.00042",
    openLiquidity: "28000",
    devWallet: "6mQkDemoDevWallet222222222222222222222222222",
    survivePool: "2150000000",
    rugPool: "1890000000",
  },
  {
    tokenMint: "So11111111111111111111111111111111111111112",
    tokenName: "SafeRocket",
    tokenTicker: "SRKT",
    durationSeconds: 86400,
    openPrice: "0.00091",
    openLiquidity: "12000",
    devWallet: "9pKrRandom3ghiiiiiiiiiiiiiiiiiiiiiiiiiiii",
    survivePool: "8900000000",
    rugPool: "2100000000",
  },
  {
    tokenMint: "JUPyiwrYJFskUPiHa7PkKq7X8K2vN4mT5wR9pL3sQ1c",
    tokenName: "ChadPump",
    tokenTicker: "CHAD",
    durationSeconds: 3600,
    openPrice: "0.00284",
    openLiquidity: "95000",
    devWallet: "3xChDemoDevWallet333333333333333333333333333",
    survivePool: "12400000000",
    rugPool: "9600000000",
  },
  {
    tokenMint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    tokenName: "WojakCoin",
    tokenTicker: "WOJAK",
    durationSeconds: 21600,
    openPrice: "0.000067",
    openLiquidity: "18500",
    devWallet: "4wOjDemoDevWallet444444444444444444444444444",
    survivePool: "3200000000",
    rugPool: "7800000000",
  },
  {
    tokenMint: "9mK4vR2nQp8Ls7Wx5Tc3Yh1Fj6Bq9Pn2Km8Rv4Lw7Xz0",
    tokenName: "DiamondPaws",
    tokenTicker: "DPAW",
    durationSeconds: 86400,
    openPrice: "0.00112",
    openLiquidity: "67000",
    devWallet: "5dPaDemoDevWallet555555555555555555555555555",
    survivePool: "15600000000",
    rugPool: "4400000000",
  },
  {
    tokenMint: "3sN5aC7mQ2pT8vX1wY9zA2bD5eF7gH0jK3mN6qR4tU8",
    tokenName: "SnailMoon",
    tokenTicker: "SNAIL",
    durationSeconds: 3600,
    openPrice: "0.000019",
    openLiquidity: "5400",
    devWallet: "6sNaDemoDevWallet666666666666666666666666666",
    survivePool: "680000000",
    rugPool: "4320000000",
  },
] as const;

const betsTemplate: Array<{
  marketIndex: number;
  userIndex: number;
  side: "survive" | "rug";
  amountLamports: string;
}> = [
  { marketIndex: 0, userIndex: 0, side: "survive", amountLamports: LAMPORTS.half },
  { marketIndex: 0, userIndex: 1, side: "rug", amountLamports: LAMPORTS.two },
  { marketIndex: 0, userIndex: 2, side: "survive", amountLamports: LAMPORTS.one },
  { marketIndex: 0, userIndex: 3, side: "rug", amountLamports: LAMPORTS.three },
  { marketIndex: 0, userIndex: 4, side: "rug", amountLamports: LAMPORTS.twoHalf },
  { marketIndex: 1, userIndex: 1, side: "survive", amountLamports: LAMPORTS.one },
  { marketIndex: 1, userIndex: 2, side: "rug", amountLamports: LAMPORTS.oneHalf },
  { marketIndex: 1, userIndex: 3, side: "survive", amountLamports: LAMPORTS.two },
  { marketIndex: 1, userIndex: 4, side: "rug", amountLamports: LAMPORTS.one },
  { marketIndex: 1, userIndex: 5, side: "survive", amountLamports: LAMPORTS.half },
  { marketIndex: 2, userIndex: 0, side: "rug", amountLamports: LAMPORTS.one },
  { marketIndex: 2, userIndex: 2, side: "survive", amountLamports: LAMPORTS.four },
  { marketIndex: 2, userIndex: 3, side: "survive", amountLamports: LAMPORTS.five },
  { marketIndex: 2, userIndex: 4, side: "survive", amountLamports: LAMPORTS.six },
  { marketIndex: 2, userIndex: 5, side: "rug", amountLamports: LAMPORTS.one },
  { marketIndex: 3, userIndex: 0, side: "survive", amountLamports: LAMPORTS.five },
  { marketIndex: 3, userIndex: 1, side: "rug", amountLamports: LAMPORTS.four },
  { marketIndex: 3, userIndex: 2, side: "survive", amountLamports: LAMPORTS.three },
  { marketIndex: 3, userIndex: 3, side: "rug", amountLamports: LAMPORTS.five },
  { marketIndex: 3, userIndex: 4, side: "survive", amountLamports: LAMPORTS.two },
  { marketIndex: 3, userIndex: 5, side: "rug", amountLamports: LAMPORTS.three },
  { marketIndex: 4, userIndex: 0, side: "rug", amountLamports: LAMPORTS.two },
  { marketIndex: 4, userIndex: 1, side: "survive", amountLamports: LAMPORTS.oneHalf },
  { marketIndex: 4, userIndex: 2, side: "rug", amountLamports: LAMPORTS.four },
  { marketIndex: 4, userIndex: 3, side: "survive", amountLamports: LAMPORTS.one },
  { marketIndex: 4, userIndex: 4, side: "rug", amountLamports: LAMPORTS.twoHalf },
  { marketIndex: 5, userIndex: 1, side: "survive", amountLamports: LAMPORTS.eight },
  { marketIndex: 5, userIndex: 2, side: "survive", amountLamports: LAMPORTS.four },
  { marketIndex: 5, userIndex: 3, side: "rug", amountLamports: LAMPORTS.two },
  { marketIndex: 5, userIndex: 4, side: "survive", amountLamports: LAMPORTS.three },
  { marketIndex: 5, userIndex: 5, side: "rug", amountLamports: LAMPORTS.oneHalf },
  { marketIndex: 6, userIndex: 0, side: "survive", amountLamports: LAMPORTS.half },
  { marketIndex: 6, userIndex: 1, side: "rug", amountLamports: LAMPORTS.four },
  { marketIndex: 6, userIndex: 2, side: "rug", amountLamports: LAMPORTS.two },
  { marketIndex: 6, userIndex: 3, side: "survive", amountLamports: LAMPORTS.one },
  { marketIndex: 6, userIndex: 4, side: "rug", amountLamports: LAMPORTS.three },
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
        currency: "sol",
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
        currency: "sol",
        amountUsdc: b.amountLamports,
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
      amountLamports: bet.amountUsdc.toString(),
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
