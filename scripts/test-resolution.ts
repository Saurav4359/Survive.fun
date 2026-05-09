/**
 * Manual resolution smoke test: picks one active market, logs payout previews,
 * runs `processMarketResolution(..., 'rug', 'price_drop')`, then prints DB state.
 *
 * From repo root (after `pnpm demo` or with an active market in DB):
 *   npx tsx scripts/test-resolution.ts
 */

import * as path from "node:path";

import { config as loadEnv } from "dotenv";

const repoRoot = path.resolve(__dirname, "..");
loadEnv({ path: path.join(repoRoot, "apps", "api", ".env") });
loadEnv({ path: path.join(repoRoot, ".env") });

import { prisma } from "../apps/api/src/config/database";
import {
  calculatePayout,
  processMarketResolution,
} from "../apps/api/src/services/payoutService";

async function main(): Promise<void> {
  const active = await prisma.market.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    include: { bets: true },
  });

  if (!active) {
    console.log(
      "[test-resolution] No active market in DB. Seed one (e.g. pnpm demo) then retry.",
    );
    return;
  }

  console.log("[test-resolution] Market", active.id, "bets:", active.bets.length);

  const surviveN = active.survivePool.toNumber();
  const rugN = active.rugPool.toNumber();

  for (const b of active.bets) {
    const preview = calculatePayout(
      b.amountUsdc.toNumber(),
      b.side as "survive" | "rug",
      "rug",
      surviveN,
      rugN,
    );
    console.log("[test-resolution] payout preview", {
      betId: b.id,
      side: b.side,
      amount: b.amountUsdc.toString(),
      previewPayout: preview,
    });
  }

  await processMarketResolution(active.id, "rug", "price_drop");

  const resolved = await prisma.market.findUnique({ where: { id: active.id } });
  console.log("[test-resolution] market after", {
    status: resolved?.status,
    outcome: resolved?.outcome,
    resolvedAt: resolved?.resolvedAt?.toISOString() ?? null,
    rugCondition: resolved?.rugCondition,
  });

  const betsAfter = await prisma.bet.findMany({
    where: { marketId: active.id },
    orderBy: { createdAt: "asc" },
  });
  for (const b of betsAfter) {
    console.log("[test-resolution] bet after", {
      id: b.id,
      won: b.won,
      payoutAmount: b.payoutAmount?.toString() ?? null,
    });
  }
}

main()
  .catch((e) => {
    console.error("[test-resolution] failed", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
