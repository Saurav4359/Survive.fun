/**
 * Seeds 7 demo markets and bets for local / showcase environments.
 *
 * Markets use real Solana mints (charts via DexScreener), each with its own
 * duration (1h / 6h / 24h). Re-run this script to refresh countdowns.
 *
 * Run from repo root:
 *   pnpm setup-demo
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

/** Seven showcase markets — real Solana mints (DexScreener charts), valid ≤44-char addresses. */
const marketsSeed = [
  {
    tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    tokenName: "Bonk",
    tokenTicker: "BONK",
    durationSeconds: 3600,
    openPrice: "0.000024",
    openLiquidity: "842000",
    devWallet: "9qPmDemoDevWallet11111111111111111111111",
    survivePool: "4200000000",
    rugPool: "11800000000",
    ageMinutes: 18,
  },
  {
    tokenMint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    tokenName: "dogwifhat",
    tokenTicker: "WIF",
    durationSeconds: 21600,
    openPrice: "2.84",
    openLiquidity: "12400000",
    devWallet: "6mQkDemoDevWallet22222222222222222222222",
    survivePool: "15600000000",
    rugPool: "4800000000",
    ageMinutes: 95,
  },
  {
    tokenMint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3f9EqDu4Q1X6qNbm",
    tokenName: "Popcat",
    tokenTicker: "POPCAT",
    durationSeconds: 86400,
    openPrice: "1.12",
    openLiquidity: "6800000",
    devWallet: "9pKrDemoDevWallet33333333333333333333333",
    survivePool: "9200000000",
    rugPool: "7400000000",
    ageMinutes: 410,
  },
  {
    tokenMint: "JUPyiwrYJFskUPiHa7Pk6aM5XBVCTjPzcs6kHarD9p",
    tokenName: "Jupiter",
    tokenTicker: "JUP",
    durationSeconds: 3600,
    openPrice: "0.92",
    openLiquidity: "18500000",
    devWallet: "3xChDemoDevWallet44444444444444444444444",
    survivePool: "11200000000",
    rugPool: "3600000000",
    ageMinutes: 42,
  },
  {
    tokenMint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    tokenName: "Raydium",
    tokenTicker: "RAY",
    durationSeconds: 21600,
    openPrice: "3.18",
    openLiquidity: "9200000",
    devWallet: "4wOjDemoDevWallet55555555555555555555555",
    survivePool: "3800000000",
    rugPool: "10200000000",
    ageMinutes: 220,
  },
  {
    tokenMint: "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5",
    tokenName: "cat in a dogs world",
    tokenTicker: "MEW",
    durationSeconds: 3600,
    openPrice: "0.0068",
    openLiquidity: "2100000",
    devWallet: "5dPaDemoDevWallet66666666666666666666666",
    survivePool: "6400000000",
    rugPool: "8900000000",
    ageMinutes: 7,
  },
  {
    tokenMint: "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
    tokenName: "OFFICIAL TRUMP",
    tokenTicker: "TRUMP",
    durationSeconds: 21600,
    openPrice: "12.40",
    openLiquidity: "42000000",
    devWallet: "6sNaDemoDevWallet77777777777777777777777",
    survivePool: "14800000000",
    rugPool: "5200000000",
    ageMinutes: 155,
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
  { marketIndex: 5, userIndex: 0, side: "rug", amountLamports: LAMPORTS.two },
  { marketIndex: 5, userIndex: 1, side: "survive", amountLamports: LAMPORTS.oneHalf },
  { marketIndex: 5, userIndex: 2, side: "rug", amountLamports: LAMPORTS.four },
  { marketIndex: 5, userIndex: 3, side: "rug", amountLamports: LAMPORTS.twoHalf },
  { marketIndex: 5, userIndex: 4, side: "survive", amountLamports: LAMPORTS.one },
  { marketIndex: 6, userIndex: 0, side: "survive", amountLamports: LAMPORTS.ten },
  { marketIndex: 6, userIndex: 1, side: "survive", amountLamports: LAMPORTS.eight },
  { marketIndex: 6, userIndex: 2, side: "rug", amountLamports: LAMPORTS.three },
  { marketIndex: 6, userIndex: 3, side: "survive", amountLamports: LAMPORTS.four },
  { marketIndex: 6, userIndex: 4, side: "rug", amountLamports: LAMPORTS.two },
  { marketIndex: 6, userIndex: 5, side: "survive", amountLamports: LAMPORTS.twoHalf },
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

  const priorDemoMarkets = await prisma.market.findMany({
    where: { creatorWallet: seed.creatorWallet },
    select: { id: true },
  });
  if (priorDemoMarkets.length > 0) {
    const ids = priorDemoMarkets.map((m) => m.id);
    await prisma.bet.deleteMany({ where: { marketId: { in: ids } } });
    await prisma.market.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.market.deleteMany({
    where: {
      tokenMint: {
        in: marketsSeed.map((m) => m.tokenMint),
      },
    },
  });
  console.log(
    "[setup-demo] Removed prior demo rows (creator wallet, mints, tx prefix).",
  );

  const now = Date.now();
  const createdMarkets = [];

  for (const m of seed.markets) {
    const durationMs = m.durationSeconds * 1000;
    const ageMs = Math.min(
      m.ageMinutes * 60 * 1000,
      Math.max(durationMs - 60_000, 0),
    );
    const createdAt = new Date(now - ageMs);
    const expiresAt = new Date(createdAt.getTime() + durationMs);
    const row = await prisma.market.create({
      data: {
        tokenMint: m.tokenMint,
        tokenName: m.tokenName,
        tokenTicker: m.tokenTicker,
        creatorWallet: seed.creatorWallet,
        durationSeconds: m.durationSeconds,
        expiresAt,
        createdAt,
        openSnapshotAt: createdAt,
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
