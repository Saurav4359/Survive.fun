/**
 * Compare DB `resolved` markets with Solana market account status.
 * On mismatch, attempts `resolve_market` again using DB outcome (repair).
 *
 *   npx tsx scripts/check-onchain.ts
 */

import * as path from "node:path";

import { config as loadEnv } from "dotenv";

const repoRoot = path.resolve(__dirname, "..");
loadEnv({ path: path.join(repoRoot, "apps", "api", ".env") });
loadEnv({ path: path.join(repoRoot, ".env") });

import { prisma } from "../apps/api/src/config/database";
import { connection } from "../apps/api/src/config/solana";
import {
  isMarketResolvedOnChain,
  resolveMarketOnChain,
} from "../apps/api/src/lib/onchainProgram";

async function main(): Promise<void> {
  const rows = await prisma.market.findMany({
    where: { status: "resolved" },
    orderBy: { createdAt: "desc" },
  });

  console.log(`[check-onchain] DB resolved markets: ${rows.length}`);

  let mismatchCount = 0;

  for (const row of rows) {
    const onChainResolved = await isMarketResolvedOnChain(
      connection,
      row.tokenMint,
      row.durationSeconds,
    );

    const mismatch = !onChainResolved;
    if (mismatch) mismatchCount += 1;

    console.log(
      `[check-onchain] market=${row.id} mint=${row.tokenMint.slice(0, 8)}… dbStatus=${row.status} dbOutcome=${row.outcome} onChainResolved=${onChainResolved} mismatch=${mismatch}`,
    );

    if (
      mismatch &&
      (row.outcome === "rug" || row.outcome === "survive")
    ) {
      console.log(
        `[check-onchain] repair: resolve_market(${row.outcome}) for ${row.id}`,
      );
      try {
        const out = await resolveMarketOnChain(
          connection,
          row.tokenMint,
          row.durationSeconds,
          row.outcome,
        );
        console.log(`[check-onchain] repair OK signature=${out.signature}`);
      } catch (e) {
        console.log(`[check-onchain] repair FAILED`, {
          marketId: row.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  console.log(
    `[check-onchain] done. mismatches=${mismatchCount} / ${rows.length}`,
  );
}

main()
  .catch((e) => {
    console.error("[check-onchain] fatal", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
