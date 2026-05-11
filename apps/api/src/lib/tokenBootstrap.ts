import type { TokenPair } from "@survivefun/types";
import axios from "axios";

import {
  dexBodyToMarketBootstrap,
  fetchDexTokenJson,
  type MarketTokenBootstrap,
} from "./dexscreener";
import { fetchPumpFunData, pumpFunRecordToMarketBootstrap } from "./pumpfun";

export type TokenSnapshotSource = "pump_fun" | "dexscreener" | "helius" | "placeholder";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function mergePumpPreferDex(
  pump: MarketTokenBootstrap | null,
  dex: MarketTokenBootstrap,
): MarketTokenBootstrap {
  if (!pump) return dex;
  return {
    ...dex,
    tokenName: dex.tokenName ?? pump.tokenName,
    tokenTicker: dex.tokenTicker ?? pump.tokenTicker,
    devWallet: dex.devWallet ?? pump.devWallet,
  };
}

function placeholderMarketBootstrap(mint: string): MarketTokenBootstrap {
  return {
    tokenName: "Unknown token",
    tokenTicker: mint.length >= 4 ? mint.slice(0, 8) : "???",
    openPrice: "0.000001",
    openLiquidity: "1",
    devWallet: null,
    pairsChecked: 0,
    avgOpenPrice: 0.000001,
    avgOpenLiquidityUsd: 1,
  };
}

/**
 * DAS `getAsset` and/or `getTokenSupply` via configured RPC (typically Helius).
 */
async function fetchHeliusMintBootstrap(mint: string): Promise<MarketTokenBootstrap | null> {
  const rpc =
    process.env.SOLANA_RPC?.trim() ||
    process.env.SOLANA_RPC_URL?.trim();
  if (!rpc) return null;

  const post = async (method: string, params: unknown) =>
    axios.post<{
      result?: unknown;
      error?: { message?: string };
    }>(
      rpc,
      { jsonrpc: "2.0", id: `survivefun-${method}`, method, params },
      {
        timeout: 15_000,
        headers: { "Content-Type": "application/json" },
        validateStatus: () => true,
      },
    );

  try {
    const res = await post("getAsset", { id: mint });
    if (res.status === 200 && !res.data?.error && isRecord(res.data?.result)) {
      const r = res.data.result as Record<string, unknown>;
      const content = r.content;
      const meta =
        isRecord(content) && isRecord(content.metadata)
          ? (content.metadata as Record<string, unknown>)
          : null;
      const tokenName =
        meta && typeof meta.name === "string" ? meta.name.trim() : null;
      const tokenTicker =
        meta && typeof meta.symbol === "string" ? meta.symbol.trim() : null;

      if (tokenName || tokenTicker) {
        return {
          tokenName,
          tokenTicker,
          openPrice: null,
          openLiquidity: null,
          devWallet: null,
          pairsChecked: 0,
          avgOpenPrice: null,
          avgOpenLiquidityUsd: null,
        };
      }
    }
  } catch {
    /* try supply */
  }

  try {
    const res = await post("getTokenSupply", [mint]);
    if (res.status !== 200 || res.data?.error) return null;
    const v = res.data?.result;
    if (!isRecord(v)) return null;
    const value = v.value;
    if (!isRecord(value)) return null;
    const uiRaw =
      value.uiAmount ?? value.ui_amount ?? value.uiAmountString;
    const ui =
      typeof uiRaw === "number"
        ? uiRaw
        : Number.parseFloat(String(uiRaw ?? ""));
    if (!Number.isFinite(ui) || ui < 0) return null;

    return {
      tokenName: `Token`,
      tokenTicker: mint.slice(0, 4),
      openPrice: null,
      openLiquidity: null,
      devWallet: null,
      pairsChecked: 0,
      avgOpenPrice: null,
      avgOpenLiquidityUsd: null,
    };
  } catch {
    return null;
  }
}

/**
 * Token snapshot for market creation: **Pump.fun → DexScreener → Helius RPC → placeholder**.
 * Dex wins price/liquidity pairs when present; Pump fills missing name/ticker/creator.
 */
export async function resolveMarketTokenBootstrap(mint: string): Promise<{
  bootstrap: MarketTokenBootstrap;
  source: TokenSnapshotSource;
}> {
  let pumpBootstrap: MarketTokenBootstrap | null = null;
  try {
    const raw = await fetchPumpFunData(mint);
    pumpBootstrap = pumpFunRecordToMarketBootstrap(raw, mint);
  } catch {
    pumpBootstrap = null;
  }

  let dexBody: unknown = null;
  try {
    dexBody = await fetchDexTokenJson(mint);
  } catch {
    dexBody = null;
  }

  const dexBoot =
    dexBody == null ? null : dexBodyToMarketBootstrap(dexBody, mint);
  if (dexBoot) {
    return {
      bootstrap: mergePumpPreferDex(pumpBootstrap, dexBoot),
      source: "dexscreener",
    };
  }

  if (pumpBootstrap) {
    return { bootstrap: pumpBootstrap, source: "pump_fun" };
  }

  const heliusBoot = await fetchHeliusMintBootstrap(mint);
  if (heliusBoot) {
    return { bootstrap: heliusBoot, source: "helius" };
  }

  return {
    bootstrap: placeholderMarketBootstrap(mint),
    source: "placeholder",
  };
}

/** Thin `TokenPair` when only bootstrap fields exist (Helius / placeholder tiers). */
export function marketBootstrapToSyntheticTokenPair(
  mint: string,
  b: MarketTokenBootstrap,
  dexId: string,
): TokenPair {
  const liqUsd =
    b.avgOpenLiquidityUsd != null && Number.isFinite(b.avgOpenLiquidityUsd)
      ? b.avgOpenLiquidityUsd
      : b.openLiquidity != null
        ? Number.parseFloat(b.openLiquidity)
        : null;

  return {
    chainId: "solana",
    dexId,
    url: "",
    pairAddress: mint,
    labels: [dexId],
    baseToken: {
      address: mint,
      name: b.tokenName ?? "Unknown",
      symbol: b.tokenTicker ?? "???",
    },
    quoteToken: { address: "SOL", name: "SOL", symbol: "SOL" },
    priceNative: "0",
    priceUsd: b.openPrice,
    txns: {
      m5: { buys: 0, sells: 0 },
      h1: { buys: 0, sells: 0 },
      h6: { buys: 0, sells: 0 },
      h24: { buys: 0, sells: 0 },
    },
    volume: { h24: 0, h6: 0, h1: 0, m5: 0 },
    priceChange: { m5: null, h1: null, h6: null, h24: null },
    liquidity:
      liqUsd != null && Number.isFinite(liqUsd) && liqUsd > 0
        ? { usd: liqUsd, base: 0, quote: 0 }
        : null,
    fdv: null,
    marketCap: liqUsd,
    pairCreatedAt: null,
    devWallet: b.devWallet,
  };
}

export async function tokenPairFromHeliusOrPlaceholder(
  mint: string,
): Promise<TokenPair> {
  const h = await fetchHeliusMintBootstrap(mint);
  if (h) {
    return marketBootstrapToSyntheticTokenPair(mint, h, "helius-rpc");
  }
  return marketBootstrapToSyntheticTokenPair(
    mint,
    placeholderMarketBootstrap(mint),
    "unknown",
  );
}
