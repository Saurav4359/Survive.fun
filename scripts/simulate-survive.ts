/**
 * Demo only: resolve market as SURVIVE via timer expiry (devnet).
 *
 * Usage (repo root):
 *   npx ts-node --project tsconfig.scripts.json scripts/simulate-survive.ts <marketId>
 *
 * Temporarily (for demo) suppresses rug signals for this market only:
 *   - dev_sell threshold → 1.0 (cannot exceed)
 *   - openPrice / openLiquidity → null (skip DEX heuristics)
 *   - expiresAt → soon (SIMULATE_SURVIVE_EXPIRE_SEC, default 90s)
 *
 * Restores original DB fields after resolution.
 *
 * Requires DATABASE_URL, API resolver running.
 */
import * as path from "node:path";

import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

import {
  assertDemoNetworkEnv,
  assertDevnetRpc,
  banner,
  die,
  getDemoConnection,
  log,
  logPayoutTable,
  pollUntilResolved,
} from "./lib/simulate-helpers";

const repoRoot = path.resolve(__dirname, "..");
loadEnv({ path: path.join(repoRoot, "apps", "api", ".env") });
loadEnv({ path: path.join(repoRoot, ".env") });

async function main(): Promise<void> {
  banner("simulate-survive (devnet demo)");
  assertDemoNetworkEnv();

  const marketId = process.argv[2]?.trim();
  if (!marketId) {
    die(
      "Usage: npx ts-node --project tsconfig.scripts.json scripts/simulate-survive.ts <marketId>",
    );
  }

  const expireSec = Number(process.env.SIMULATE_SURVIVE_EXPIRE_SEC ?? "90");
  if (!Number.isFinite(expireSec) || expireSec < 15 || expireSec > 3600) {
    die("SIMULATE_SURVIVE_EXPIRE_SEC must be between 15 and 3600 (default 90).");
  }

  const connection = getDemoConnection();
  await assertDevnetRpc(connection);

  const prisma = new PrismaClient();

  const row = await prisma.market.findUnique({ where: { id: marketId } });
  if (!row) die(`Market not found: ${marketId}`);
  if (row.status !== "active") die(`Market must be active (status=${row.status})`);

  const snapshot = {
    devSellThresholdOverride: row.devSellThresholdOverride,
    openPrice: row.openPrice,
    openLiquidity: row.openLiquidity,
    expiresAt: row.expiresAt,
  };

  const newExpiry = new Date(Date.now() + expireSec * 1000);

  log("Applying demo-only DB overrides so resolver takes SURVIVE (expiry) path.", {
    marketId,
    devSellThresholdOverride: "1 (disable dev_sell rug)",
    openPrice: "null",
    openLiquidity: "null",
    newExpiresAt: newExpiry.toISOString(),
    note: "Original values restored after resolution.",
  });

  await prisma.market.update({
    where: { id: marketId },
    data: {
      devSellThresholdOverride: "1",
      openPrice: null,
      openLiquidity: null,
      expiresAt: newExpiry,
    },
  });

  try {
    log("Waiting for resolver to mark market SURVIVE after expiry (poll DB)…", {
      hint: "Ensure apps/api is running (resolver tick every ~30s).",
      pollTimeoutNote: "Up to 10 minutes buffer after expiry for tick alignment.",
    });

    const resolved = await pollUntilResolved(prisma, marketId, "survive", {
      timeoutMs: 600_000,
      intervalMs: 2500,
    });

    log("Market resolved as SURVIVE.", {
      marketId: resolved.id,
      outcome: resolved.outcome,
      expiresAt: resolved.expiresAt,
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
  } finally {
    log("Restoring market fields from snapshot.", {
      devSellThresholdOverride: snapshot.devSellThresholdOverride?.toString() ?? "null",
      hadOpenPrice: snapshot.openPrice != null,
      hadOpenLiquidity: snapshot.openLiquidity != null,
      expiresAt: snapshot.expiresAt.toISOString(),
    });
    await prisma.market.update({
      where: { id: marketId },
      data: {
        devSellThresholdOverride: snapshot.devSellThresholdOverride,
        openPrice: snapshot.openPrice,
        openLiquidity: snapshot.openLiquidity,
        expiresAt: snapshot.expiresAt,
      },
    });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
