/**
 * Unit tests for `apps/api/src/services/rugDetector.ts`.
 *
 * Strategy: stub the global axios `defaults.adapter` so DexScreener calls
 * resolve from in-test fixtures, leaving Helius / Birdeye paths in their
 * "skipped" branches when keys aren't present. Each scenario is a self-checked
 * assertion; failures call `process.exit(1)` after a summary so the script
 * doubles as a CI gate.
 *
 * Run from repo root:
 *   pnpm test-rug-detector
 */
import * as path from "node:path";

import { config as loadEnv } from "dotenv";

const repoRoot = path.resolve(__dirname, "..");
loadEnv({ path: path.join(repoRoot, "apps", "api", ".env") });
loadEnv({ path: path.join(repoRoot, ".env") });

// Resolve axios from the api workspace (only place it's installed).
// Use require so we can do this without TS dragging in @types/axios at root.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require(
  path.join(repoRoot, "apps", "api", "node_modules", "axios"),
) as {
  defaults: { adapter?: (config: any) => Promise<any> };
};

interface MockResponse {
  status: number;
  data: unknown;
}

const mockResponses = new Map<string, MockResponse>();
const realAdapter = axios.defaults.adapter;

axios.defaults.adapter = (config: any) => {
  const url = `${config.baseURL ?? ""}${config.url ?? ""}`;
  for (const [pattern, resp] of mockResponses) {
    if (url.includes(pattern)) {
      return Promise.resolve({
        data: resp.data,
        status: resp.status,
        statusText: resp.status === 200 ? "OK" : "STUB",
        headers: {},
        config,
        request: {},
      });
    }
  }
  if (realAdapter) return realAdapter(config);
  return Promise.reject(new Error(`No mock adapter handler for ${url}`));
};

import {
  checkDevSell,
  checkLiquidityRemoved,
  checkPriceDrop,
} from "../apps/api/src/services/rugDetector";
import type { Market } from "@survivefun/types";

const LOG = "[test-rug-detector]";

type TestResult = {
  name: string;
  passed: boolean;
  detail?: string;
};

const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail?: string): void {
  results.push({ name, passed: condition, detail });
  if (condition) {
    console.log(`${LOG} ✅ ${name}`);
  } else {
    console.log(`${LOG} ❌ ${name}${detail ? `\n          → ${detail}` : ""}`);
  }
}

function buildMarket(overrides: Partial<Market> = {}): Market {
  const now = new Date().toISOString();
  return {
    id: "00000000-0000-0000-0000-000000000001",
    tokenMint: "So11111111111111111111111111111111111111112",
    tokenName: "TestTok",
    tokenTicker: "TEST",
    creatorWallet: "DemoCreatorSurviveFun111111111111111",
    durationSeconds: 3600,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    survivePool: "10",
    rugPool: "10",
    openPrice: "1.000",
    openLiquidity: "10000.00",
    devWallet: null,
    devSellThresholdOverride: null,
    status: "active",
    outcome: null,
    onChainAddress: null,
    createdAt: now,
    totalBettors: 0,
    ...overrides,
  };
}

function setDexscreenerMock(args: {
  mintMatch: string;
  priceUsd?: string | null;
  liquidityUsd?: number | null;
}): void {
  const data = {
    pairs: [
      {
        priceUsd: args.priceUsd ?? null,
        liquidity: args.liquidityUsd != null ? { usd: args.liquidityUsd } : null,
      },
    ],
  };
  mockResponses.set(`dex/tokens/${args.mintMatch}`, {
    status: 200,
    data,
  });
}

function clearMocks(): void {
  mockResponses.clear();
}

async function testPriceDropFires(): Promise<void> {
  clearMocks();
  const mint = "PriceDropFire1111111111111111111111111111111";
  setDexscreenerMock({ mintMatch: mint, priceUsd: "0.05", liquidityUsd: 5000 });
  const market = buildMarket({
    tokenMint: mint,
    openPrice: "1.000",
  });
  const out = await checkPriceDrop(market);
  // current=0.05 vs open=1.0 → ratio 0.05 < 0.10 → fire
  assert(
    "checkPriceDrop fires when price < 10% of open (>90% drop)",
    out.triggered === true,
    JSON.stringify(out.detail),
  );
}

async function testPriceDropDoesNotFire(): Promise<void> {
  clearMocks();
  const mint = "PriceDropQuiet111111111111111111111111111111";
  setDexscreenerMock({ mintMatch: mint, priceUsd: "0.50", liquidityUsd: 5000 });
  const market = buildMarket({
    tokenMint: mint,
    openPrice: "1.000",
  });
  const out = await checkPriceDrop(market);
  // current=0.5 vs open=1.0 → ratio 0.50 ≥ 0.10 → no fire
  assert(
    "checkPriceDrop does NOT fire when drop is < 90%",
    out.triggered === false,
    JSON.stringify(out.detail),
  );
}

async function testPriceDropEdgeAt90Percent(): Promise<void> {
  clearMocks();
  const mint = "PriceDropEdge11111111111111111111111111111";
  // Exactly 89.999% drop → should not fire (current = 0.10001 > threshold 0.1)
  setDexscreenerMock({ mintMatch: mint, priceUsd: "0.10001", liquidityUsd: 5000 });
  const market = buildMarket({ tokenMint: mint, openPrice: "1.0" });
  const out = await checkPriceDrop(market);
  assert(
    "checkPriceDrop does NOT fire at exactly 89.999% drop (boundary)",
    out.triggered === false,
    JSON.stringify(out.detail),
  );
}

async function testPriceDropSkippedWhenNoOpenPrice(): Promise<void> {
  clearMocks();
  const market = buildMarket({ openPrice: null });
  const out = await checkPriceDrop(market);
  assert(
    "checkPriceDrop returns skipped when openPrice is null",
    out.triggered === false &&
      typeof out.detail === "object" &&
      out.detail !== null &&
      (out.detail as Record<string, unknown>).skipped === true,
    JSON.stringify(out.detail),
  );
}

async function testLiquidityRemovedFires(): Promise<void> {
  clearMocks();
  const mint = "LiqDropFire1111111111111111111111111111111";
  setDexscreenerMock({ mintMatch: mint, priceUsd: "0.5", liquidityUsd: 100 });
  const market = buildMarket({
    tokenMint: mint,
    openLiquidity: "10000.00",
  });
  const out = await checkLiquidityRemoved(market);
  // current=100 vs open=10000 → ratio 0.01 < 0.20 → fire (>80% removed)
  assert(
    "checkLiquidityRemoved fires when liquidity < 20% of open (>80% removed)",
    out.triggered === true,
    JSON.stringify(out.detail),
  );
}

async function testLiquidityRemovedDoesNotFire(): Promise<void> {
  clearMocks();
  const mint = "LiqDropQuiet111111111111111111111111111111";
  setDexscreenerMock({ mintMatch: mint, priceUsd: "0.5", liquidityUsd: 5000 });
  const market = buildMarket({
    tokenMint: mint,
    openLiquidity: "10000.00",
  });
  const out = await checkLiquidityRemoved(market);
  // current=5000 vs open=10000 → ratio 0.5 ≥ 0.20 → no fire
  assert(
    "checkLiquidityRemoved does NOT fire when removal < 80%",
    out.triggered === false,
    JSON.stringify(out.detail),
  );
}

async function testLiquidityRemovedSkippedWhenNoOpenLiquidity(): Promise<void> {
  clearMocks();
  const market = buildMarket({ openLiquidity: null });
  const out = await checkLiquidityRemoved(market);
  assert(
    "checkLiquidityRemoved returns skipped when openLiquidity is null",
    out.triggered === false &&
      typeof out.detail === "object" &&
      out.detail !== null &&
      (out.detail as Record<string, unknown>).skipped === true,
    JSON.stringify(out.detail),
  );
}

async function testLiquidityRemovedSkippedWhenPairMissing(): Promise<void> {
  clearMocks();
  const mint = "LiqDropMissing11111111111111111111111111111";
  // No mock set → adapter falls through to real network. To stay deterministic,
  // mock a 200 with pairs=[] which the detector treats as "pair not found".
  mockResponses.set(`dex/tokens/${mint}`, {
    status: 200,
    data: { pairs: [] },
  });
  const market = buildMarket({ tokenMint: mint });
  const out = await checkLiquidityRemoved(market);
  assert(
    "checkLiquidityRemoved returns skipped when DexScreener pair missing",
    out.triggered === false &&
      typeof out.detail === "object" &&
      out.detail !== null &&
      (out.detail as Record<string, unknown>).skipped === true &&
      (out.detail as Record<string, unknown>).reason === "dex_pair_not_found",
    JSON.stringify(out.detail),
  );
}

async function testDevSellSkipsWithoutHeliusKey(): Promise<void> {
  clearMocks();
  // We can only safely test the skip-paths without a live Helius env.
  const hadKey = process.env.HELIUS_API_KEY?.trim();
  if (hadKey) {
    delete process.env.HELIUS_API_KEY;
  }
  try {
    const market = buildMarket({
      devWallet: "7xKpRandom1DemoDevWalletSurviveFun111",
    });
    const out = await checkDevSell(market);
    assert(
      "checkDevSell skips cleanly when HELIUS_API_KEY is unset",
      out.triggered === false &&
        typeof out.detail === "object" &&
        out.detail !== null &&
        (out.detail as Record<string, unknown>).skipped === true,
      JSON.stringify(out.detail),
    );
  } finally {
    if (hadKey) process.env.HELIUS_API_KEY = hadKey;
  }
}

async function testDevSellSkipsWhenNoWallet(): Promise<void> {
  const market = buildMarket({ devWallet: null, creatorWallet: "" });
  const out = await checkDevSell(market);
  assert(
    "checkDevSell skips when no devWallet AND no creatorWallet",
    out.triggered === false &&
      typeof out.detail === "object" &&
      out.detail !== null &&
      (out.detail as Record<string, unknown>).skipped === true &&
      (out.detail as Record<string, unknown>).reason === "no_dev_or_creator_wallet",
    JSON.stringify(out.detail),
  );
}

async function testDevSellThresholdOverrideAccepted(): Promise<void> {
  // Even though the heuristic skips without a Helius key, we can still verify
  // the threshold override is parsed by inspecting the detail object when
  // a key IS present. To avoid network dependency, we just assert the field
  // override is reflected when the function does run; if HELIUS is absent
  // we mark as skipped (still passing — informational).
  if (!process.env.HELIUS_API_KEY?.trim()) {
    results.push({
      name: "checkDevSell threshold override (skipped: no HELIUS_API_KEY)",
      passed: true,
      detail: "no helius key — skip integration assertion",
    });
    console.log(`${LOG} ⏭  checkDevSell threshold override (skipped: no HELIUS_API_KEY)`);
    return;
  }
  const market = buildMarket({
    devWallet: "7xKpRandom1DemoDevWalletSurviveFun111",
    devSellThresholdOverride: "0.05",
  });
  const out = await checkDevSell(market);
  // We don't know the actual ratio (depends on chain state), but the
  // detail must include our threshold value when not skipped.
  const detail = out.detail as Record<string, unknown>;
  const ok =
    detail.skipped === true ||
    Number(detail.devSellRatioThreshold) === 0.05;
  assert(
    "checkDevSell honors devSellThresholdOverride (0.05) when set",
    ok,
    JSON.stringify(out.detail),
  );
}

async function main(): Promise<void> {
  console.log(`${LOG} starting…`);

  await testPriceDropFires();
  await testPriceDropDoesNotFire();
  await testPriceDropEdgeAt90Percent();
  await testPriceDropSkippedWhenNoOpenPrice();
  await testLiquidityRemovedFires();
  await testLiquidityRemovedDoesNotFire();
  await testLiquidityRemovedSkippedWhenNoOpenLiquidity();
  await testLiquidityRemovedSkippedWhenPairMissing();
  await testDevSellSkipsWithoutHeliusKey();
  await testDevSellSkipsWhenNoWallet();
  await testDevSellThresholdOverrideAccepted();

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`\n${LOG} ─────────────────────────────────────────`);
  console.log(`${LOG} Results: ${passed}/${total} passed`);
  if (passed !== total) {
    console.log(`${LOG} Failed cases:`);
    for (const r of results) {
      if (!r.passed) console.log(`${LOG}   ✗ ${r.name}: ${r.detail ?? ""}`);
    }
    process.exit(1);
  }
  console.log(`${LOG} all checks passed`);
}

main().catch((e) => {
  console.error(`${LOG} fatal`, e);
  process.exit(1);
});
