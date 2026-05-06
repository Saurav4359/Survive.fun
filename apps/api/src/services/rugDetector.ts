/**
 * Chain rug heuristics for Survive.fun markets.
 * Uses Helius (via helius-sdk + RPC URL) for signatures / parsed txs and axios for DexScreener.
 */

import type {
  Market,
  RugCondition,
  RugDetectionResult,
} from "@survivefun/types";
import axios from "axios";
import { createHelius } from "helius-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  type ParsedTransactionWithMeta,
  type TokenBalance,
} from "@solana/web3.js";

const DEXSCREENER_TOKEN_URL =
  "https://api.dexscreener.com/latest/dex/tokens";

const SIGNATURE_PAGE_LIMIT = 100;
const MAX_TX_FETCH = 40;

/** Sell threshold: cumulative sells / estimated initial position > 25%. */
const DEV_SELL_RATIO_THRESHOLD = 0.25;

/** Price vs market.openPrice: current below 10% of open ⇒ dropped > 90%. */
const PRICE_DROP_THRESHOLD = 0.1;

/** Liquidity vs market.openLiquidity: current below 20% of open ⇒ removed > 80%. */
const LIQUIDITY_REMAINING_THRESHOLD = 0.2;

const LOG_PREFIX = "[rugDetector]";

function log(message: string, data?: unknown): void {
  if (data !== undefined) {
    console.info(`${LOG_PREFIX} ${message}`, data);
  } else {
    console.info(`${LOG_PREFIX} ${message}`);
  }
}

export type RugDetectionServiceResult = RugDetectionResult & {
  /** First triggered condition (priority: dev sell → price → liquidity). */
  condition: RugCondition | null;
  /** Structured detail per check and/or errors. */
  data: unknown;
};

function parseMarketDecimal(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function heliusNetwork(): "mainnet" | "devnet" {
  const net = process.env.HELIUS_NETWORK?.trim().toLowerCase();
  if (net === "mainnet" || net === "mainnet-beta") return "mainnet";
  return "devnet";
}

function heliusRpcUrl(): string | null {
  const apiKey = process.env.HELIUS_API_KEY?.trim();
  if (!apiKey) return null;
  const net = heliusNetwork();
  return `https://${net}.helius-rpc.com/?api-key=${encodeURIComponent(apiKey)}`;
}

function getHeliusClient() {
  const apiKey = process.env.HELIUS_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    return createHelius({ apiKey, network: heliusNetwork() });
  } catch (e) {
    log("failed to create Helius client", e);
    return null;
  }
}

function getConnection(): Connection | null {
  const url = heliusRpcUrl();
  if (!url) return null;
  return new Connection(url, "confirmed");
}

function uiAmountFromBalance(b: TokenBalance): number {
  const raw = b.uiTokenAmount?.uiAmountString ?? b.uiTokenAmount?.uiAmount;
  if (raw == null) return 0;
  const n =
    typeof raw === "number"
      ? raw
      : Number.parseFloat(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Estimate tokens sold in this tx for `mint` owned by `ownerWallet` (wallet pubkey base58).
 */
function soldUiFromTxMeta(
  meta: ParsedTransactionWithMeta["meta"],
  mint: string,
  ownerWallet: string,
): number {
  if (!meta) return 0;

  const sumForOwner = (rows: readonly TokenBalance[] | null | undefined): number => {
    let t = 0;
    for (const row of rows ?? []) {
      if (row.mint === mint && row.owner === ownerWallet) {
        t += uiAmountFromBalance(row);
      }
    }
    return t;
  };

  const pre = sumForOwner(meta.preTokenBalances);
  const post = sumForOwner(meta.postTokenBalances);
  const delta = pre - post;
  return delta > 0 ? delta : 0;
}

async function checkDevWalletSell(
  market: Market,
): Promise<{
  triggered: boolean;
  condition: RugCondition;
  detail: Record<string, unknown>;
} | null> {
  const devWallet =
    market.devWallet?.trim() || market.creatorWallet?.trim() || "";
  if (!devWallet) {
    log("skip dev-sell check: no devWallet or creatorWallet", {
      marketId: market.id,
    });
    return null;
  }

  const helius = getHeliusClient();
  const connection = getConnection();
  if (!helius || !connection) {
    log("skip dev-sell check: HELIUS_API_KEY missing or RPC unavailable", {
      marketId: market.id,
    });
    return null;
  }

  let mintPk: PublicKey;
  let ownerPk: PublicKey;
  try {
    mintPk = new PublicKey(market.tokenMint);
    ownerPk = new PublicKey(devWallet);
  } catch {
    log("skip dev-sell check: invalid mint or wallet pubkey", {
      marketId: market.id,
    });
    return null;
  }

  try {
    const signatures = await helius.getSignaturesForAddress(devWallet, {
      limit: SIGNATURE_PAGE_LIMIT,
    });

    let totalSoldUi = 0;
    const sigList = signatures.slice(0, MAX_TX_FETCH);

    for (const row of sigList) {
      const sig = typeof row === "string" ? row : row.signature;
      try {
        const parsed = await connection.getParsedTransaction(sig, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        });
        if (!parsed?.meta) continue;
        totalSoldUi += soldUiFromTxMeta(parsed.meta, market.tokenMint, devWallet);
      } catch (e) {
        log(`getParsedTransaction failed for ${sig}`, e);
      }
    }

    const ata = getAssociatedTokenAddressSync(mintPk, ownerPk, false);
    let currentUi = 0;
    try {
      const bal = await connection.getTokenAccountBalance(ata);
      currentUi =
        bal.value.uiAmount ??
        Number.parseFloat(bal.value.amount) / 10 ** bal.value.decimals;
      if (!Number.isFinite(currentUi)) currentUi = 0;
    } catch {
      currentUi = 0;
    }

    const initialEstimate = currentUi + totalSoldUi;
    const ratio =
      initialEstimate > 0 ? totalSoldUi / initialEstimate : 0;

    const detail = {
      devWallet,
      tokenMint: market.tokenMint,
      signaturesScanned: sigList.length,
      totalSoldUi,
      currentBalanceUi: currentUi,
      initialEstimateUi: initialEstimate,
      soldToInitialRatio: ratio,
    };

    if (ratio > DEV_SELL_RATIO_THRESHOLD) {
      log("DETECT dev_sold_over_25_percent", detail);
      return {
        triggered: true,
        condition: "dev_sold_over_25_percent",
        detail,
      };
    }

    log("dev-sell check passed", detail);
    return {
      triggered: false,
      condition: "dev_sold_over_25_percent",
      detail,
    };
  } catch (e) {
    log("dev-sell check error", e);
    return {
      triggered: false,
      condition: "dev_sold_over_25_percent",
      detail: { error: e instanceof Error ? e.message : String(e) },
    };
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function fetchDexscreenerPair(
  mint: string,
): Promise<Record<string, unknown> | null> {
  try {
    const url = `${DEXSCREENER_TOKEN_URL}/${encodeURIComponent(mint)}`;
    const res = await axios.get<unknown>(url, {
      timeout: 15_000,
      validateStatus: (s) => s === 200,
    });
    const body = res.data;
    if (!isRecord(body)) return null;
    const pairs = body.pairs;
    if (!Array.isArray(pairs) || pairs.length === 0) return null;
    const first = pairs[0];
    return isRecord(first) ? first : null;
  } catch (e) {
    log("DexScreener request failed", e instanceof Error ? e.message : e);
    return null;
  }
}

async function checkPriceDrop(
  market: Market,
): Promise<{
  triggered: boolean;
  condition: RugCondition;
  detail: Record<string, unknown>;
}> {
  const open = parseMarketDecimal(market.openPrice);
  const detail: Record<string, unknown> = {
    openPrice: open,
    tokenMint: market.tokenMint,
  };

  if (open == null || open <= 0) {
    log("skip price-drop check: no openPrice", { marketId: market.id });
    return {
      triggered: false,
      condition: "price_dropped_over_90_percent",
      detail: { ...detail, skipped: true, reason: "no_open_price" },
    };
  }

  try {
    const pair = await fetchDexscreenerPair(market.tokenMint);
    if (!pair) {
      return {
        triggered: false,
        condition: "price_dropped_over_90_percent",
        detail: { ...detail, skipped: true, reason: "dex_pair_not_found" },
      };
    }

    const priceUsdRaw = pair.priceUsd;
    const priceNow =
      typeof priceUsdRaw === "string"
        ? Number.parseFloat(priceUsdRaw)
        : typeof priceUsdRaw === "number"
          ? priceUsdRaw
          : NaN;

    detail.priceUsd = priceNow;

    if (!Number.isFinite(priceNow) || priceNow <= 0) {
      return {
        triggered: false,
        condition: "price_dropped_over_90_percent",
        detail: { ...detail, skipped: true, reason: "no_price_usd" },
      };
    }

    const thresholdAbs = open * PRICE_DROP_THRESHOLD;
    const triggered = priceNow < thresholdAbs;
    detail.thresholdAbs = thresholdAbs;
    detail.dropRatio = priceNow / open;

    if (triggered) {
      log("DETECT price_dropped_over_90_percent", detail);
      return { triggered: true, condition: "price_dropped_over_90_percent", detail };
    }

    log("price-drop check passed", detail);
    return {
      triggered: false,
      condition: "price_dropped_over_90_percent",
      detail,
    };
  } catch (e) {
    log("price-drop check error", e);
    return {
      triggered: false,
      condition: "price_dropped_over_90_percent",
      detail: {
        ...detail,
        error: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

async function checkLiquidityRemoved(
  market: Market,
): Promise<{
  triggered: boolean;
  condition: RugCondition;
  detail: Record<string, unknown>;
}> {
  const openLiq = parseMarketDecimal(market.openLiquidity);
  const detail: Record<string, unknown> = {
    openLiquidityUsd: openLiq,
    tokenMint: market.tokenMint,
  };

  if (openLiq == null || openLiq <= 0) {
    log("skip liquidity check: no openLiquidity", { marketId: market.id });
    return {
      triggered: false,
      condition: "liquidity_removed_over_80_percent",
      detail: { ...detail, skipped: true, reason: "no_open_liquidity" },
    };
  }

  try {
    const pair = await fetchDexscreenerPair(market.tokenMint);
    if (!pair) {
      return {
        triggered: false,
        condition: "liquidity_removed_over_80_percent",
        detail: { ...detail, skipped: true, reason: "dex_pair_not_found" },
      };
    }

    const liq = pair.liquidity;
    let currentUsd: number | null = null;
    if (isRecord(liq)) {
      const u = liq.usd;
      if (typeof u === "number" && Number.isFinite(u)) currentUsd = u;
      else if (typeof u === "string") {
        const n = Number.parseFloat(u);
        currentUsd = Number.isFinite(n) ? n : null;
      }
    }

    detail.currentLiquidityUsd = currentUsd;

    if (currentUsd == null || currentUsd < 0) {
      return {
        triggered: false,
        condition: "liquidity_removed_over_80_percent",
        detail: { ...detail, skipped: true, reason: "no_liquidity_usd" },
      };
    }

    const thresholdAbs = openLiq * LIQUIDITY_REMAINING_THRESHOLD;
    const triggered = currentUsd < thresholdAbs;
    detail.thresholdAbs = thresholdAbs;
    detail.remainingRatio = currentUsd / openLiq;

    if (triggered) {
      log("DETECT liquidity_removed_over_80_percent", detail);
      return {
        triggered: true,
        condition: "liquidity_removed_over_80_percent",
        detail,
      };
    }

    log("liquidity check passed", detail);
    return {
      triggered: false,
      condition: "liquidity_removed_over_80_percent",
      detail,
    };
  } catch (e) {
    log("liquidity check error", e);
    return {
      triggered: false,
      condition: "liquidity_removed_over_80_percent",
      detail: {
        ...detail,
        error: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

/**
 * Evaluate all rug heuristics for a market.
 */
export async function detectRug(market: Market): Promise<RugDetectionServiceResult> {
  const evaluatedAt = new Date().toISOString();
  const triggeredConditions: RugCondition[] = [];
  const data: Record<string, unknown> = {
    marketId: market.id,
    tokenMint: market.tokenMint,
  };

  try {
    try {
      const dev = await checkDevWalletSell(market);
      if (dev) {
        data.devSell = dev.detail;
        if (dev.triggered) triggeredConditions.push(dev.condition);
      }
    } catch (e) {
      log("checkDevWalletSell outer catch", e);
      data.devSell = { error: e instanceof Error ? e.message : String(e) };
    }

    try {
      const price = await checkPriceDrop(market);
      data.priceDrop = price.detail;
      if (price.triggered) triggeredConditions.push(price.condition);
    } catch (e) {
      log("checkPriceDrop outer catch", e);
      data.priceDrop = { error: e instanceof Error ? e.message : String(e) };
    }

    try {
      const liq = await checkLiquidityRemoved(market);
      data.liquidity = liq.detail;
      if (liq.triggered) triggeredConditions.push(liq.condition);
    } catch (e) {
      log("checkLiquidityRemoved outer catch", e);
      data.liquidity = { error: e instanceof Error ? e.message : String(e) };
    }

    const isRug = triggeredConditions.length > 0;
    const condition = triggeredConditions[0] ?? null;

    log("evaluation complete", {
      marketId: market.id,
      isRug,
      triggeredConditions,
      condition,
    });

    return {
      isRug,
      triggeredConditions,
      evaluatedAt,
      condition,
      data,
    };
  } catch (e) {
    log("detectRug fatal", e);
    return {
      isRug: false,
      triggeredConditions: [],
      evaluatedAt,
      condition: null,
      data: {
        ...data,
        fatal: e instanceof Error ? e.message : String(e),
      },
    };
  }
}
