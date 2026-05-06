/**
 * Rug heuristics for Survive.fun markets.
 * RPC via @helius-labs/helius-sdk (aliased to helius-sdk); HTTP via axios only.
 */

import type { Market } from "@survivefun/types";
import axios from "axios";
import { createHelius } from "@helius-labs/helius-sdk";
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

const DEV_SELL_RATIO_THRESHOLD = 0.25;
/** Trigger when current price is below 10% of open (drop over 90%). */
const PRICE_DROP_THRESHOLD = 0.1;
/** Trigger when current liquidity is below 20% of open (over 80% removed). */
const LIQUIDITY_REMAINING_THRESHOLD = 0.2;

const LOG_PREFIX = "[rugDetector]";

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

function getHeliusClient(): ReturnType<typeof createHelius> | null {
  const apiKey = process.env.HELIUS_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    return createHelius({ apiKey, network: heliusNetwork() });
  } catch (e) {
    console.log(`${LOG_PREFIX} createHelius failed`, e);
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

function marketOpenMs(market: Market): number | null {
  const t = Date.parse(market.createdAt);
  return Number.isFinite(t) ? t : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
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
 * Condition 1: dev sold more than 25% of estimated holdings at market open.
 * Uses Helius getSignaturesForAddress, parses SPL balances; only txs at/after market.createdAt.
 * Denominator: current ATA balance + cumulative sells since open (proxy for tokens held at open).
 */
async function conditionDevSell(market: Market): Promise<{
  triggered: boolean;
  detail: Record<string, unknown>;
}> {
  const devWallet =
    market.devWallet?.trim() || market.creatorWallet?.trim() || "";
  if (!devWallet) {
    return {
      triggered: false,
      detail: { skipped: true, reason: "no_dev_or_creator_wallet" },
    };
  }

  const helius = getHeliusClient();
  const connection = getConnection();
  if (!helius || !connection) {
    return {
      triggered: false,
      detail: { skipped: true, reason: "missing_helius_api_key_or_rpc" },
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
      detail: { skipped: true, reason: "invalid_mint_or_wallet" },
    };
  }

  const openMs = marketOpenMs(market);

  const signatures = await helius.getSignaturesForAddress(devWallet, {
    limit: SIGNATURE_PAGE_LIMIT,
  });

  let totalSoldUi = 0;
  const sigList = signatures.slice(0, MAX_TX_FETCH);

  for (const row of sigList) {
    const sig = typeof row === "string" ? row : (row as { signature?: string }).signature;
    if (!sig) continue;

    const parsed = await connection.getParsedTransaction(sig, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!parsed?.meta) continue;

    if (openMs != null && parsed.blockTime != null) {
      if (parsed.blockTime * 1000 < openMs) continue;
    }

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

  const initialHoldingsAtOpenUi = currentUi + totalSoldUi;
  const ratio =
    initialHoldingsAtOpenUi > 0 ? totalSoldUi / initialHoldingsAtOpenUi : 0;

  const override = parseMarketDecimal(market.devSellThresholdOverride ?? undefined);
  const ratioThreshold =
    override != null && override > 0 && override <= 1
      ? override
      : DEV_SELL_RATIO_THRESHOLD;

  const detail: Record<string, unknown> = {
    devWallet,
    tokenMint: market.tokenMint,
    marketCreatedAt: market.createdAt,
    signaturesScanned: sigList.length,
    totalSoldUi,
    currentBalanceUi: currentUi,
    initialHoldingsAtOpenUi,
    soldToInitialRatio: ratio,
    devSellRatioThreshold: ratioThreshold,
  };

  const triggered = ratio > ratioThreshold;
  return { triggered, detail };
}

async function conditionPriceDrop(market: Market): Promise<{
  triggered: boolean;
  detail: Record<string, unknown>;
}> {
  const openPrice = parseMarketDecimal(market.openPrice);
  const detail: Record<string, unknown> = {
    openPrice,
    tokenMint: market.tokenMint,
  };

  if (openPrice == null || openPrice <= 0) {
    return {
      triggered: false,
      detail: { ...detail, skipped: true, reason: "no_open_price" },
    };
  }

  const pair = await fetchDexscreenerPair(market.tokenMint);
  if (!pair) {
    return {
      triggered: false,
      detail: { ...detail, skipped: true, reason: "dex_pair_not_found" },
    };
  }

  const priceUsdRaw = pair.priceUsd;
  const currentPrice =
    typeof priceUsdRaw === "string"
      ? Number.parseFloat(priceUsdRaw)
      : typeof priceUsdRaw === "number"
        ? priceUsdRaw
        : NaN;

  detail.currentPrice = currentPrice;

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return {
      triggered: false,
      detail: { ...detail, skipped: true, reason: "no_current_price" },
    };
  }

  const thresholdAbs = openPrice * PRICE_DROP_THRESHOLD;
  detail.thresholdPrice = thresholdAbs;
  detail.priceVsOpen = currentPrice / openPrice;

  const triggered = currentPrice < thresholdAbs;
  return { triggered, detail };
}

async function conditionLiquidityRemoved(market: Market): Promise<{
  triggered: boolean;
  detail: Record<string, unknown>;
}> {
  const openLiquidity = parseMarketDecimal(market.openLiquidity);
  const detail: Record<string, unknown> = {
    openLiquidityUsd: openLiquidity,
    tokenMint: market.tokenMint,
  };

  if (openLiquidity == null || openLiquidity <= 0) {
    return {
      triggered: false,
      detail: { ...detail, skipped: true, reason: "no_open_liquidity" },
    };
  }

  const pair = await fetchDexscreenerPair(market.tokenMint);
  if (!pair) {
    return {
      triggered: false,
      detail: { ...detail, skipped: true, reason: "dex_pair_not_found" },
    };
  }

  const liq = pair.liquidity;
  let currentLiquidity: number | null = null;
  if (isRecord(liq)) {
    const u = liq.usd;
    if (typeof u === "number" && Number.isFinite(u)) currentLiquidity = u;
    else if (typeof u === "string") {
      const n = Number.parseFloat(u);
      currentLiquidity = Number.isFinite(n) ? n : null;
    }
  }

  detail.currentLiquidityUsd = currentLiquidity;

  if (currentLiquidity == null || currentLiquidity < 0) {
    return {
      triggered: false,
      detail: { ...detail, skipped: true, reason: "no_current_liquidity" },
    };
  }

  const thresholdAbs = openLiquidity * LIQUIDITY_REMAINING_THRESHOLD;
  detail.thresholdLiquidityUsd = thresholdAbs;
  detail.liquidityVsOpen = currentLiquidity / openLiquidity;

  const triggered = currentLiquidity < thresholdAbs;
  return { triggered, detail };
}

export async function detectRug(market: Market): Promise<{
  isRug: boolean;
  condition: "dev_sell" | "price_drop" | "liquidity_removed" | null;
  data: Record<string, any>;
}> {
  const data: Record<string, any> = {
    marketId: market.id,
    tokenMint: market.tokenMint,
  };

  let devTriggered = false;
  let priceTriggered = false;
  let liqTriggered = false;

  try {
    try {
      const { triggered, detail } = await conditionDevSell(market);
      data.devSell = detail;
      devTriggered = triggered;
      if (triggered) {
        console.log(`${LOG_PREFIX} detection`, {
          condition: "dev_sell",
          marketId: market.id,
          detail,
        });
      }
    } catch (e) {
      console.log(`${LOG_PREFIX} dev_sell condition error`, e);
      data.devSell = {
        error: e instanceof Error ? e.message : String(e),
      };
    }

    try {
      const { triggered, detail } = await conditionPriceDrop(market);
      data.priceDrop = detail;
      priceTriggered = triggered;
      if (triggered) {
        console.log(`${LOG_PREFIX} detection`, {
          condition: "price_drop",
          marketId: market.id,
          detail,
        });
      }
    } catch (e) {
      console.log(`${LOG_PREFIX} price_drop condition error`, e);
      data.priceDrop = {
        error: e instanceof Error ? e.message : String(e),
      };
    }

    try {
      const { triggered, detail } = await conditionLiquidityRemoved(market);
      data.liquidityRemoved = detail;
      liqTriggered = triggered;
      if (triggered) {
        console.log(`${LOG_PREFIX} detection`, {
          condition: "liquidity_removed",
          marketId: market.id,
          detail,
        });
      }
    } catch (e) {
      console.log(`${LOG_PREFIX} liquidity_removed condition error`, e);
      data.liquidityRemoved = {
        error: e instanceof Error ? e.message : String(e),
      };
    }

    const isRug = devTriggered || priceTriggered || liqTriggered;
    const condition: "dev_sell" | "price_drop" | "liquidity_removed" | null =
      devTriggered
      ? "dev_sell"
      : priceTriggered
        ? "price_drop"
        : liqTriggered
          ? "liquidity_removed"
          : null;

    console.log(`${LOG_PREFIX} evaluation`, {
      marketId: market.id,
      isRug,
      condition,
    });

    return { isRug, condition, data };
  } catch (e) {
    console.log(`${LOG_PREFIX} fatal error`, e);
    return {
      isRug: false,
      condition: null,
      data: {
        ...data,
        fatal: e instanceof Error ? e.message : String(e),
      },
    };
  }
}
