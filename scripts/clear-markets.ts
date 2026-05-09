/**
 * Wipes all markets and bets from the database (local/dev).
 *
 * Run from repo root:
 *   npx tsx scripts/clear-markets.ts
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
    "[clear-markets] DATABASE_URL is not set. Add it to apps/api/.env (or .env at repo root).",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.bet.deleteMany({});
  await prisma.market.deleteMany({});
  console.log("✅ All markets cleared");
}

main()
  .catch((e) => {
    console.error("[clear-markets] Failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
