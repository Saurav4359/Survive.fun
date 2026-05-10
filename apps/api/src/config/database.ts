import * as dotenv from "dotenv";
import * as path from "path";

import { Prisma, PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/**
 * Prisma-documented URL defaults (`connect_timeout`, `pool_timeout`) so idle
 * pool waits and initial TCP connect fail less often. Existing query params win.
 */
function mergePostgresUrlResilienceParams(): void {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return;

  try {
    const forParse = raw.startsWith("postgresql://")
      ? raw
      : raw.startsWith("postgres://")
        ? `postgresql://${raw.slice("postgres://".length)}`
        : raw;
    const u = new URL(forParse);

    const defaults: Record<string, string> = {
      connect_timeout: "15",
      pool_timeout: "60",
    };

    for (const [key, value] of Object.entries(defaults)) {
      if (!u.searchParams.has(key)) u.searchParams.set(key, value);
    }

    process.env.DATABASE_URL = u.toString();
  } catch {
    /* leave DATABASE_URL unchanged on parse errors */
  }
}

mergePostgresUrlResilienceParams();

function isTransientDbConnectionError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return e.code === "P1001" || e.code === "P1002" || e.code === "P1017";
  }
  if (e instanceof Prisma.PrismaClientInitializationError) {
    const m = e.message.toLowerCase();
    return (
      m.includes("timeout") ||
      m.includes("econnrefused") ||
      m.includes("econnreset") ||
      m.includes("etimedout") ||
      m.includes("network") ||
      m.includes("can't reach database") ||
      m.includes("server closed")
    );
  }
  if (e instanceof Error) {
    const ne = e as NodeJS.ErrnoException;
    if (
      ne.code === "ECONNRESET" ||
      ne.code === "ECONNREFUSED" ||
      ne.code === "ETIMEDOUT" ||
      ne.code === "EPIPE"
    ) {
      return true;
    }
    const m = e.message.toLowerCase();
    return (
      m.includes("econnreset") ||
      m.includes("connection reset") ||
      m.includes("server closed") ||
      m.includes("connection terminated") ||
      m.includes("unexpectedly closed")
    );
  }
  return false;
}

async function withDbQueryRetry<T>(run: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  const backoffMs = [0, 100, 280];
  let last: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (backoffMs[attempt]! > 0) {
      await new Promise((r) => setTimeout(r, backoffMs[attempt]));
    }
    try {
      return await run();
    } catch (e) {
      last = e;
      const canRetry =
        attempt < maxAttempts - 1 && isTransientDbConnectionError(e);
      if (!canRetry) throw e;
    }
  }
  throw last;
}

function createPrismaClient() {
  const log =
    process.env.NODE_ENV === "development"
      ? (["query", "warn", "error"] as const)
      : (["error"] as const);

  return new PrismaClient({ log: [...log] }).$extends({
    query: {
      $allOperations({ args, query }) {
        return withDbQueryRetry(() => query(args));
      },
    },
  });
}

type PrismaExtended = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaExtended | undefined;
};

export const prisma: PrismaExtended =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
