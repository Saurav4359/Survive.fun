/**
 * Audit Postgres market rows against canonical PDAs from `@survivefun/solana-pda`.
 *
 * Usage (from repo root):
 *   pnpm pda:audit
 *
 * Exit 1 if any multi-round row (`chain_market_key` set) disagrees with derivation.
 */
import path from "node:path";

import {
  deriveMarketPDAForDbRow,
  marketSchemeForDbRow,
  MarketAddressScheme,
} from "@survivefun/solana-pda";
import { PublicKey } from "@solana/web3.js";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

import { getProgramId } from "../src/config/solana";

const repoRoot = path.resolve(__dirname, "../..");
loadEnv({ path: path.join(repoRoot, ".env") });
loadEnv({ path: path.join(repoRoot, "apps", "api", ".env") });

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const pid = getProgramId();
  const rows = await prisma.market.findMany({
    where: { currency: "sol" },
    select: {
      id: true,
      tokenMint: true,
      chainMarketKey: true,
      onChainAddress: true,
    },
  });

  let multiMismatch = 0;
  let legacyDiff = 0;

  for (const row of rows) {
    const scheme = marketSchemeForDbRow(row);
    const canonical = deriveMarketPDAForDbRow(pid, row).publicKey.toBase58();
    const stored = row.onChainAddress?.trim() ?? "";

    if (scheme === MarketAddressScheme.MintAndMarketId) {
      if (!stored || stored !== canonical) {
        multiMismatch++;
        console.error("[pda:audit] MULTI_MISMATCH", {
          marketId: row.id,
          stored,
          canonical,
          chainMarketKey: row.chainMarketKey,
        });
      }
      continue;
    }

    if (stored && stored !== canonical) {
      legacyDiff++;
      console.warn("[pda:audit] LEGACY_STORED_NEQ_LEGACY_DERIVED (may be OK if 3-seed without chain_market_key)", {
        marketId: row.id,
        stored,
        legacyDerived: canonical,
      });
    }
  }

  console.log("[pda:audit] summary", {
    rows: rows.length,
    multiRoundMismatches: multiMismatch,
    legacyStoredDiffFromTwoSeedDerived: legacyDiff,
    programId: pid.toBase58(),
  });

  await prisma.$disconnect();

  if (multiMismatch > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
