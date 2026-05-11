/**
 * Loads apps/api/.env and checks integrations (no secret values printed).
 * Run: pnpm --dir apps/api run verify:env
 */
import * as dotenv from "dotenv";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import axios from "axios";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

import { applyUpstashRestAsRedisUrl, isRedisEnvConfigured } from "../src/config/resolveRedisEnv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
applyUpstashRestAsRedisUrl();

const checks: { name: string; ok: boolean; detail: string }[] = [];

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  const icon = ok ? "✅" : "❌";
  console.log(`${icon} ${name}: ${detail}`);
}

async function main() {
  console.log("Verifying env (values redacted)…\n");

  const keys = [
    "PORT",
    "DATABASE_URL",
    "REDIS_URL",
    "HELIUS_API_KEY",
    "PROGRAM_ID",
    "PLATFORM_WALLET_SECRET_KEY",
    "SOLANA_RPC",
    "BIRDEYE_API_KEY",
  ] as const;

  for (const k of keys) {
    const v = process.env[k]?.trim();
    const ok = Boolean(v && !String(v).includes("placeholder"));
    record(
      `env.${k}`,
      ok,
      ok ? "set" : "missing or placeholder",
    );
  }

  // Postgres
  let prisma: PrismaClient | null = null;
  try {
    prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    record("PostgreSQL", true, "SELECT 1 OK");
  } catch (e) {
    record(
      "PostgreSQL",
      false,
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    await prisma?.$disconnect().catch(() => {});
  }

  // Redis
  if (!isRedisEnvConfigured()) {
    record("Redis", false, "REDIS_URL not configured after Upstash merge");
  } else {
    const redis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 1,
      connectTimeout: 10_000,
    });
    try {
      const pong = await redis.ping();
      record("Redis", pong === "PONG", `ping → ${pong}`);
    } catch (e) {
      record(
        "Redis",
        false,
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      redis.disconnect();
    }
  }

  // Solana RPC (Helius)
  const rpc =
    process.env.SOLANA_RPC?.trim() ||
    process.env.SOLANA_RPC_URL?.trim() ||
    "";
  try {
    const conn = new Connection(rpc, "confirmed");
    const slot = await conn.getSlot("confirmed");
    record("Solana RPC", Number.isFinite(slot), `slot ${slot}`);
  } catch (e) {
    record(
      "Solana RPC",
      false,
      e instanceof Error ? e.message : String(e),
    );
  }

  // Program id parse
  try {
    const pid = process.env.PROGRAM_ID?.trim();
    if (!pid) throw new Error("PROGRAM_ID empty");
    new PublicKey(pid);
    record("PROGRAM_ID", true, "valid base58");
  } catch (e) {
    record(
      "PROGRAM_ID",
      false,
      e instanceof Error ? e.message : String(e),
    );
  }

  // Platform wallet key
  try {
    const raw = process.env.PLATFORM_WALLET_SECRET_KEY?.trim();
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("not a JSON array");
    const secret = Uint8Array.from(parsed.map((n) => Number(n)));
    const kp = Keypair.fromSecretKey(secret);
    record(
      "PLATFORM_WALLET_SECRET_KEY",
      true,
      `parsed → ${kp.publicKey.toBase58().slice(0, 4)}…${kp.publicKey.toBase58().slice(-4)}`,
    );
  } catch (e) {
    record(
      "PLATFORM_WALLET_SECRET_KEY",
      false,
      e instanceof Error ? e.message : String(e),
    );
  }

  // Birdeye
  const be = process.env.BIRDEYE_API_KEY?.trim();
  if (!be) {
    record("Birdeye API", false, "BIRDEYE_API_KEY unset");
  } else {
    try {
      const res = await axios.get("https://public-api.birdeye.so/defi/token_overview", {
        params: { address: "So11111111111111111111111111111111111111112" },
        headers: {
          "X-API-KEY": be,
          "x-chain": "solana",
        },
        timeout: 15_000,
        validateStatus: () => true,
      });
      const ok = res.status === 200 && res.data && typeof res.data === "object";
      record(
        "Birdeye API",
        ok,
        ok ? `HTTP ${res.status}` : `HTTP ${res.status} (check key / quota)`,
      );
    } catch (e) {
      record(
        "Birdeye API",
        false,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  // Helius REST (API key separate from RPC URL)
  const hk = process.env.HELIUS_API_KEY?.trim();
  if (!hk) {
    record("Helius API key", false, "HELIUS_API_KEY unset");
  } else {
    record("Helius API key", hk.length > 8, "set (used by webhook tooling / server)");
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(
    failed.length === 0
      ? "\nAll checks passed."
      : `\n${failed.length} check(s) failed — fix the items marked ❌ above.`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
