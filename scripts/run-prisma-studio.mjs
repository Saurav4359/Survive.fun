#!/usr/bin/env node
/**
 * Run Prisma Studio from apps/api after generate, with explicit query-engine path.
 * Survives pnpm layouts + fixes Studio's MODULE_NOT_FOUND engine resolution.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const apiDir = path.join(repoRoot, "apps", "api");

const STUDIO_PORT = "5555";

function stopStaleStudio() {
  if (process.platform === "win32") return;
  spawnSync("sh", ["-c", "pkill -f 'prisma studio' 2>/dev/null || true"], {
    stdio: "ignore",
  });
  spawnSync(
    "sh",
    [
      "-c",
      `lsof -ti:${STUDIO_PORT} | xargs kill -9 2>/dev/null || true`,
    ],
    { stdio: "ignore" },
  );
}

/** Absolute path to libquery_engine-*.node next to generated `.prisma/client`. */
function resolveQueryEngineLibrary() {
  const req = createRequire(path.join(apiDir, "package.json"));
  let pkgDir;
  try {
    pkgDir = path.dirname(req.resolve("@prisma/client/package.json"));
  } catch {
    return null;
  }
  // pkgDir = .../node_modules/@prisma/client → engines live in .../node_modules/.prisma/client
  const nm = path.join(pkgDir, "..", "..");
  const genDir = path.join(nm, ".prisma", "client");
  if (!fs.existsSync(genDir)) return null;
  const nodes = fs
    .readdirSync(genDir)
    .filter((f) => f.endsWith(".node"))
    .map((f) => path.join(genDir, f));
  return nodes[0] ?? null;
}

function run(label, cmd, args, extraEnv = {}) {
  const r = spawnSync(cmd, args, {
    cwd: apiDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });
  if (r.error) {
    console.error(`[db:studio] ${label} failed to spawn:`, r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

stopStaleStudio();

run("generate", "pnpm", ["exec", "prisma", "generate", "--schema=./prisma/schema.prisma"]);

const engineLib = resolveQueryEngineLibrary();
const studioEnv =
  engineLib != null ? { PRISMA_QUERY_ENGINE_LIBRARY: engineLib } : {};

if (engineLib == null) {
  console.warn(
    "[db:studio] Could not resolve libquery_engine *.node; Studio may still fail. Run `pnpm install` from repo root.",
  );
} else {
  console.log("[db:studio] PRISMA_QUERY_ENGINE_LIBRARY=", engineLib);
}

run(
  "studio",
  "pnpm",
  [
    "exec",
    "prisma",
    "studio",
    "--schema=./prisma/schema.prisma",
    "--port",
    STUDIO_PORT,
  ],
  studioEnv,
);
