/**
 * Automated rug heuristics for Survive.fun (Helius RPC + DexScreener).
 * Never throws from `detectRug` — callers always get a result object.
 */

import type { Market as DbMarket } from "@prisma/client";
import type { Market } from "@survivefun/types";
import axios from "axios";
import { createHelius } from "@helius-labs/helius-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  PublicKey,
  type ParsedTransactionWithMeta,
  type TokenBalance,
} from "@solana/web3.js";

import { connection } from "../config/solana";

const DEXSCREENER_TOKEN_URL =
  "https://api.dexscreener.com/latest/dex/tokens";

const LOG_PREFIX = "[rugDetector]";

const DEV_SELL_RATIO_THRESHOLD = 0.25;
const PRICE_DROP_FRACTION = 0.9;
const LIQUIDITY_REMOVED_PERCENT = 80;

export type DetectRugMarketInput = {
  id: string;
  tokenMint: string;
  devWallet: string;
  openPrice: number;
  openLiquidity: number;
  expiresAt: Date;
  survivePool: number;
  rugPool: number;
  /** Optional 0–1 override for dev sell ratio (DB demo field). */
  devSellThresholdOverride?: number | null;
};

export type RugConditionResult = "dev_sell" | "price_drop" | "liquidity_removed" | null;

export type DetectRugResult = {
  isRug: boolean;
  condition: RugConditionResult;
  isSurvive: boolean;
  data: Record<string, unknown>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function heliusNetwork(): "mainnet" | "devnet" {
  const net = process.env.HELIUS_NETWORK?.trim().toLowerCase();
  if (net === "mainnet" || net === "mainnet-beta") return "mainnet";
  return "devnet";
}

function getHelius() {
  const apiKey = process.env.HELIUS_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    return createHelius({ apiKey, network: heliusNetwork() });
  } catch (e) {
    console.warn(`${LOG_PREFIX} createHelius failed`, {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
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

function soldUiFromTxMeta(
  meta: ParsedTransactionWithMeta["meta"],
  mint: string,
  ownerWallet: string,
): number {
  if (!meta) return 0;
  const sumForOwner = (
    rows: readonly TokenBalance[] | null | undefined,
  ): number => {
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

/**
 * Helius-backed RPC: `helius` proxies to the same JSON-RPC as `connection`.
 * Uses `getSignaturesForAddress` + `getParsedTransaction` on the shared connection.
 */
async function conditionDevSell(
  market: DetectRugMarketInput,
): Promise<{ triggered: boolean; condition: RugConditionResult; detail: Record<string, unknown> }> {
  const devWallet = market.devWallet?.trim() ?? "";
  const detail: Record<string, unknown> = {
    tokenMint: market.tokenMint,
    devWallet,
  };

  if (!devWallet) {
    return { triggered: false, condition: null, detail: { ...detail, skipped: true, reason: "no_dev_wallet" } };
  }

  if (!getHelius()) {
    return {
      triggered: false,
      condition: null,
      detail: { ...detail, skipped: true, reason: "missing_helius_api_key" },
    };
  }

  let mintPk: PublicKey;
  let ownerPk: PublicKey;
  try {
    mintPk = new PublicKey(market.tokenMint);
    ownerPk = new PublicKey(devWallet);
  } catch {
    return {
      triggered: false,
      condition: null,
      detail: { ...detail, skipped: true, reason: "invalid_mint_or_wallet" },
    };
  }

  try {
    const sigInfos = await connection.getSignaturesForAddress(ownerPk, {
      limit: 20,
    });

    let totalSoldUi = 0;
    for (const info of sigInfos) {
      const sig = info.signature;
      if (!sig) continue;
      const parsed = await connection.getParsedTransaction(sig, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      if (!parsed?.meta) continue;
      totalSoldUi += soldUiFromTxMeta(parsed.meta, market.tokenMint, devWallet);
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

    const initialHoldings = currentUi + totalSoldUi;
    const ratio = initialHoldings > 0 ? totalSoldUi / initialHoldings : 0;
    const override = market.devSellThresholdOverride;
    const ratioThreshold =
      override != null && override > 0 && override <= 1
        ? override
        : DEV_SELL_RATIO_THRESHOLD;

    const full = {
      ...detail,
      signaturesScanned: sigInfos.length,
      totalSoldUi,
      currentBalanceUi: currentUi,
      initialHoldingsAtOpenUi: initialHoldings,
      soldToInitialRatio: ratio,
      devSellRatioThreshold: ratioThreshold,
    };

    if (ratio > ratioThreshold) {
      return { triggered: true, condition: "dev_sell", detail: full };
    }
    return { triggered: false, condition: null, detail: full };
  } catch (e) {
    console.warn(`${LOG_PREFIX} dev_sell check failed (skipped)`, {
      marketId: market.id,
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      triggered: false,
      condition: null,
      detail: {
        ...detail,
        skipped: true,
        error: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

async function fetchDexscreenerPair(
  mint: string,
): Promise<Record<string, unknown> | null> {
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
}

/**
 * Single DexScreener request: price drop (>90%) and/or liquidity removed (>80%).
 */
async function conditionDexPair(
  market: DetectRugMarketInput,
): Promise<{
  priceDrop: { triggered: boolean; detail: Record<string, unknown> };
  liquidityRemoved: { triggered: boolean; detail: Record<string, unknown> };
}> {
  const emptyDetail = { tokenMint: market.tokenMint };
  const priceDetail: Record<string, unknown> = { ...emptyDetail };
  const liqDetail: Record<string, unknown> = { ...emptyDetail };

  const openPrice = Number(market.openPrice);
  const openLiquidity = Number(market.openLiquidity);

  if (!Number.isFinite(openPrice) || openPrice <= 0) {
    priceDetail.skipped = true;
    priceDetail.reason = "no_open_price";
    liqDetail.skipped = true;
    liqDetail.reason = "no_open_price";
    return {
      priceDrop: { triggered: false, detail: priceDetail },
      liquidityRemoved: { triggered: false, detail: liqDetail },
    };
  }

  try {
    const pair = await fetchDexscreenerPair(market.tokenMint);
    if (!pair) {
      priceDetail.skipped = true;
      priceDetail.reason = "dex_pair_not_found";
      liqDetail.skipped = true;
      liqDetail.reason = "dex_pair_not_found";
      return {
        priceDrop: { triggered: false, detail: priceDetail },
        liquidityRemoved: { triggered: false, detail: liqDetail },
      };
    }

    const priceUsdRaw = pair.priceUsd;
    const currentPrice =
      typeof priceUsdRaw === "string"
        ? Number.parseFloat(priceUsdRaw)
        : typeof priceUsdRaw === "number"
          ? priceUsdRaw
          : NaN;

    priceDetail.openPrice = openPrice;
    priceDetail.currentPrice = currentPrice;

    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      priceDetail.skipped = true;
      priceDetail.reason = "no_current_price";
    } else {
      const dropFraction =
        openPrice > 0 ? (openPrice - currentPrice) / openPrice : 0;
      priceDetail.dropFraction = dropFraction;
      priceDetail.thresholdFraction = PRICE_DROP_FRACTION;
      if (dropFraction > PRICE_DROP_FRACTION) {
        return {
          priceDrop: { triggered: true, detail: priceDetail },
          liquidityRemoved: {
            triggered: false,
            detail: {
              ...liqDetail,
              skipped: true,
              reason: "evaluated_with_same_request_as_price",
              pairLiquidityUsd: parseLiquidityUsd(pair),
            },
          },
        };
      }
    }

    if (!Number.isFinite(openLiquidity) || openLiquidity <= 0) {
      liqDetail.skipped = true;
      liqDetail.reason = "no_open_liquidity";
      return {
        priceDrop: { triggered: false, detail: priceDetail },
        liquidityRemoved: { triggered: false, detail: liqDetail },
      };
    }

    const currentLiquidity = parseLiquidityUsd(pair);
    liqDetail.openLiquidityUsd = openLiquidity;
    liqDetail.currentLiquidityUsd = currentLiquidity;

    if (currentLiquidity == null || !Number.isFinite(currentLiquidity) || currentLiquidity < 0) {
      liqDetail.skipped = true;
      liqDetail.reason = "no_current_liquidity";
      return {
        priceDrop: { triggered: false, detail: priceDetail },
        liquidityRemoved: { triggered: false, detail: liqDetail },
      };
    }

    const removedPercent =
      ((openLiquidity - currentLiquidity) / openLiquidity) * 100;
    liqDetail.removedPercent = removedPercent;

    if (removedPercent > LIQUIDITY_REMOVED_PERCENT) {
      return {
        priceDrop: { triggered: false, detail: priceDetail },
        liquidityRemoved: { triggered: true, detail: liqDetail },
      };
    }

    return {
      priceDrop: { triggered: false, detail: priceDetail },
      liquidityRemoved: { triggered: false, detail: liqDetail },
    };
  } catch (e) {
    console.warn(`${LOG_PREFIX} DexScreener pair check failed (skipped)`, {
      marketId: market.id,
      error: e instanceof Error ? e.message : String(e),
    });
    priceDetail.skipped = true;
    priceDetail.error = e instanceof Error ? e.message : String(e);
    liqDetail.skipped = true;
    liqDetail.error = e instanceof Error ? e.message : String(e);
    return {
      priceDrop: { triggered: false, detail: priceDetail },
      liquidityRemoved: { triggered: false, detail: liqDetail },
    };
  }
}

function parseLiquidityUsd(pair: Record<string, unknown>): number | null {
  const liq = pair.liquidity;
  if (!isRecord(liq)) return null;
  const u = liq.usd;
  if (typeof u === "number" && Number.isFinite(u)) return u;
  if (typeof u === "string") {
    const n = Number.parseFloat(u);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function dbMarketToDetectInput(row: DbMarket): DetectRugMarketInput {
  const dev = (row.devWallet ?? row.creatorWallet ?? "").trim();
  const op = row.openPrice != null ? row.openPrice.toNumber() : 0;
  const ol = row.openLiquidity != null ? row.openLiquidity.toNumber() : 0;
  const sp = row.survivePool.toNumber();
  const rp = row.rugPool.toNumber();
  const override =
    row.devSellThresholdOverride != null
      ? row.devSellThresholdOverride.toNumber()
      : null;

  return {
    id: row.id,
    tokenMint: row.tokenMint,
    devWallet: dev,
    openPrice: Number.isFinite(op) ? op : 0,
    openLiquidity: Number.isFinite(ol) ? ol : 0,
    expiresAt: row.expiresAt,
    survivePool: Number.isFinite(sp) ? sp : 0,
    rugPool: Number.isFinite(rp) ? rp : 0,
    devSellThresholdOverride:
      override != null && Number.isFinite(override) ? override : null,
  };
}

function mapMarketDtoToInput(m: Market): DetectRugMarketInput {
  const dev = (m.devWallet ?? m.creatorWallet ?? "").trim();
  const op = m.openPrice != null ? Number.parseFloat(m.openPrice) : NaN;
  const ol = m.openLiquidity != null ? Number.parseFloat(m.openLiquidity) : NaN;
  const sp = Number.parseFloat(m.survivePool);
  const rp = Number.parseFloat(m.rugPool);
  const overrideRaw = m.devSellThresholdOverride;
  const override =
    overrideRaw != null && overrideRaw !== ""
      ? Number.parseFloat(overrideRaw)
      : null;

  return {
    id: m.id,
    tokenMint: m.tokenMint,
    devWallet: dev,
    openPrice: Number.isFinite(op) ? op : 0,
    openLiquidity: Number.isFinite(ol) ? ol : 0,
    expiresAt: new Date(m.expiresAt),
    survivePool: Number.isFinite(sp) ? sp : 0,
    rugPool: Number.isFinite(rp) ? rp : 0,
    devSellThresholdOverride:
      override != null && Number.isFinite(override) ? override : null,
  };
}

export async function detectRug(market: DetectRugMarketInput): Promise<DetectRugResult> {
  const data: Record<string, unknown> = {
    marketId: market.id,
    tokenMint: market.tokenMint,
    evaluatedAt: new Date().toISOString(),
  };

  console.log(`${LOG_PREFIX} detection attempt`, { marketId: market.id });

  let condition: RugConditionResult = null;

  try {
    const dev = await conditionDevSell(market);
    data.devSell = dev.detail;
    if (dev.triggered && dev.condition) {
      condition = dev.condition;
      console.log(`${LOG_PREFIX} condition fired`, {
        marketId: market.id,
        condition,
      });
    }

    if (!condition) {
      const dex = await conditionDexPair(market);
      data.priceDrop = dex.priceDrop.detail;
      data.liquidityRemoved = dex.liquidityRemoved.detail;

      if (dex.priceDrop.triggered) {
        condition = "price_drop";
        console.log(`${LOG_PREFIX} condition fired`, {
          marketId: market.id,
          condition,
        });
      } else if (dex.liquidityRemoved.triggered) {
        condition = "liquidity_removed";
        console.log(`${LOG_PREFIX} condition fired`, {
          marketId: market.id,
          condition,
        });
      }
    }

    const isRug = condition != null;
    const expired = Date.now() > market.expiresAt.getTime();
    const isSurvive = !isRug && expired;

    if (isSurvive) {
      console.log(`${LOG_PREFIX} survive (expired, no rug signal)`, {
        marketId: market.id,
        expiresAt: market.expiresAt.toISOString(),
      });
    }

    const result: DetectRugResult = {
      isRug,
      condition,
      isSurvive,
      data,
    };

    console.log(`${LOG_PREFIX} evaluation summary`, {
      marketId: market.id,
      isRug: result.isRug,
      condition: result.condition,
      isSurvive: result.isSurvive,
    });

    return result;
  } catch (e) {
    console.warn(`${LOG_PREFIX} unexpected detectRug error`, {
      marketId: market.id,
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      isRug: false,
      condition: null,
      isSurvive: false,
      data: {
        ...data,
        fatal: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

/** @deprecated Use `detectRug` with numeric fields; kept for `scripts/test-rug-detector.ts`. */
export async function checkDevSell(m: Market): Promise<{
  triggered: boolean;
  detail: Record<string, unknown>;
}> {
  const r = await conditionDevSell(mapMarketDtoToInput(m));
  return { triggered: r.triggered, detail: r.detail };
}

/** @deprecated Use `detectRug`; kept for `scripts/test-rug-detector.ts`. */
export async function checkPriceDrop(m: Market): Promise<{
  triggered: boolean;
  detail: Record<string, unknown>;
}> {
  const { priceDrop } = await conditionDexPair(mapMarketDtoToInput(m));
  return { triggered: priceDrop.triggered, detail: priceDrop.detail };
}

/** @deprecated Use `detectRug`; kept for scripts/spec callers. */
export async function checkLiquidityRemoved(m: Market): Promise<{
  triggered: boolean;
  detail: Record<string, unknown>;
}> {
  const { liquidityRemoved } = await conditionDexPair(mapMarketDtoToInput(m));
  return {
    triggered: liquidityRemoved.triggered,
    detail: liquidityRemoved.detail,
  };
}
