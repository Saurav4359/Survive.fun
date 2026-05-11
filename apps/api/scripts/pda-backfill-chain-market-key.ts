/**
 * Backfill `chain_market_key` for SOL markets where it is null but the on-chain
 * account is an Anchor `Market` owned by the configured program.
 *
 * Usage:
 *   pnpm pda:backfill-keys              # apply updates
 *   pnpm pda:backfill-keys --dry-run    # print only
 *
 * Requires: DATABASE_URL, SOLANA_RPC_URL, SURVIVEFUN_PROGRAM_ID or PROGRAM_ID (same as API).
 */
import fs from "node:fs";
import path from "node:path";

import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { deriveMarketPDAForDbRow } from "@survivefun/solana-pda";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

import { getProgramId } from "../src/config/solana";

const repoRoot = path.resolve(__dirname, "../..");
loadEnv({ path: path.join(repoRoot, ".env") });
loadEnv({ path: path.join(repoRoot, "apps", "api", ".env") });

const IDL_PATH = path.join(__dirname, "../src/idl/survivefun.json");

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const prisma = new PrismaClient();
  const pid = getProgramId();
  const rpc =
    process.env.SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as Idl;
  const coder = new BorshAccountsCoder(idl);

  const rows = await prisma.market.findMany({
    where: {
      currency: "sol",
      chainMarketKey: null,
      onChainAddress: { not: null },
    },
  });

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const addr = row.onChainAddress?.trim();
    if (!addr) continue;
    let pk: PublicKey;
    try {
      pk = new PublicKey(addr);
    } catch {
      skipped++;
      continue;
    }

    const info = await connection.getAccountInfo(pk, "confirmed");
    if (!info?.data || !info.owner.equals(pid)) {
      skipped++;
      continue;
    }

    let decoded: { market_id: PublicKey };
    try {
      decoded = coder.decode("Market", info.data) as { market_id: PublicKey };
    } catch {
      skipped++;
      continue;
    }

    const chainKey = decoded.market_id.toBase58();
    const derived = deriveMarketPDAForDbRow(pid, {
      tokenMint: row.tokenMint,
      chainMarketKey: chainKey,
    });

    if (derived.publicKey.toBase58() !== pk.toBase58()) {
      console.warn("[pda:backfill] derived PDA != stored row; skip", {
        marketId: row.id,
        stored: pk.toBase58(),
        derived: derived.publicKey.toBase58(),
      });
      skipped++;
      continue;
    }

    console.log("[pda:backfill] candidate", {
      marketId: row.id,
      chainMarketKey: chainKey,
    });

    if (!dryRun) {
      await prisma.market.update({
        where: { id: row.id },
        data: { chainMarketKey: chainKey },
      });
    }
    updated++;
  }

  console.log("[pda:backfill] done", { examined: rows.length, updated, skipped, dryRun });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
