import type { Bet, BetWithMarket, Market } from "@survivefun/types";
import type { Bet as DbBet, Market as DbMarket } from "@prisma/client";

export function toMarketDto(row: DbMarket): Market {
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
    onChainAddress: row.onChainAddress,
    createdAt: row.createdAt.toISOString(),
    totalBettors: row.totalBettors,
  };
}

export function toBetDto(row: DbBet): Bet {
  return {
    id: row.id,
    marketId: row.marketId,
    bettorWallet: row.bettorWallet,
    side: row.side as Bet["side"],
    amountUsdc: row.amountUsdc.toString(),
    potentialWin: row.potentialWin?.toString() ?? null,
    txSignature: row.txSignature,
    claimed: row.claimed,
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
