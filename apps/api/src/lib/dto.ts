import type {
  Bet,
  BetWithMarket,
  Market,
  MarketCurrency,
} from "@survivefun/types";
import type { Bet as DbBet, Market as DbMarket } from "@prisma/client";

import { marketPdaBase58ForDbRow } from "./marketOnChain";

function asMarketCurrency(raw: string): MarketCurrency {
  return raw === "sol" ? "sol" : "usdc";
}

function lamportsIntegerString(d: { toFixed: (n: number) => string }): string {
  return d.toFixed(0).split(".")[0] ?? "0";
}

export function toMarketDto(row: DbMarket): Market {
  const stored = row.onChainAddress?.trim() ?? null;
  const chainKey = row.chainMarketKey?.trim();
  let onChainAddress: string | null = null;
  if (chainKey) {
    try {
      onChainAddress = marketPdaBase58ForDbRow(row);
    } catch {
      onChainAddress = stored;
    }
  } else if (stored) {
    // Persisted vault from create_market (3-seed); legacy derivation would be wrong here.
    onChainAddress = stored;
  } else {
    try {
      onChainAddress = marketPdaBase58ForDbRow(row);
    } catch {
      onChainAddress = null;
    }
  }
  return {
    id: row.id,
    tokenMint: row.tokenMint,
    tokenName: row.tokenName,
    tokenTicker: row.tokenTicker,
    creatorWallet: row.creatorWallet,
    durationSeconds: row.durationSeconds,
    expiresAt: row.expiresAt.toISOString(),
    survivePool: row.survivePool.toString(),
    rugPool: row.rugPool.toString(),
    openPrice: row.openPrice?.toString() ?? null,
    openLiquidity: row.openLiquidity?.toString() ?? null,
    devWallet: row.devWallet,
    devSellThresholdOverride:
      row.devSellThresholdOverride?.toString() ?? null,
    status: row.status as Market["status"],
    outcome: (row.outcome as Market["outcome"] | null) ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    rugCondition: row.rugCondition ?? null,
    onChainAddress,
    chainMarketKey: row.chainMarketKey?.trim() ?? null,
    createdAt: row.createdAt.toISOString(),
    totalBettors: row.totalBettors,
    currency: asMarketCurrency(row.currency),
  };
}

export function toBetDto(row: DbBet): Bet {
  const cur = asMarketCurrency(row.currency);
  const isUsdc = cur === "usdc";
  return {
    id: row.id,
    marketId: row.marketId,
    bettorWallet: row.bettorWallet,
    side: row.side as Bet["side"],
    currency: cur,
    amountUsdc: isUsdc ? row.amountUsdc.toString() : null,
    amountLamports: isUsdc ? null : lamportsIntegerString(row.amountUsdc),
    potentialWin: row.potentialWin?.toString() ?? null,
    txSignature: row.txSignature,
    won: row.won,
    claimed: row.claimed,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    payoutAmount: row.payoutAmount?.toString() ?? null,
    payoutTx: row.payoutTx,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toBetWithMarketDto(
  row: DbBet & { market: DbMarket },
): BetWithMarket {
  return {
    ...toBetDto(row),
    market: toMarketDto(row.market),
  };
}
