export type BetSide = "survive" | "rug";

export type MarketStatus = "active" | "resolved" | "expired";

export type Outcome = "survive" | "rug";

export type RugEventType =
  | "dev_sell"
  | "price_drop"
  | "liquidity_removed"
  | "graduation_stall";

export interface Market {
  id: string;
  tokenMint: string;
  tokenName: string | null;
  tokenTicker: string | null;
  creatorWallet: string;
  durationSeconds: number;
  expiresAt: string;
  survivePool: string;
  rugPool: string;
  openPrice: string | null;
  openLiquidity: string | null;
  devWallet: string | null;
  status: MarketStatus;
  outcome: Outcome | null;
  onChainAddress: string | null;
  createdAt: string;
  totalBettors: number;
}

export interface Bet {
  id: string;
  marketId: string;
  bettorWallet: string;
  side: BetSide;
  amountUsdc: string;
  potentialWin: string | null;
  txSignature: string;
  claimed: boolean;
  payoutAmount: string | null;
  payoutTx: string | null;
  createdAt: string;
}

export interface DexScreenerTokenInfo {
  address: string;
  name: string;
  symbol: string;
}

export interface DexScreenerTxnsBucket {
  buys: number;
  sells: number;
}

export interface DexScreenerTxns {
  m5: DexScreenerTxnsBucket;
  h1: DexScreenerTxnsBucket;
  h6: DexScreenerTxnsBucket;
  h24: DexScreenerTxnsBucket;
}

export interface DexScreenerVolume {
  h24: number;
  h6: number;
  h1: number;
  m5: number;
}

export interface DexScreenerPriceChange {
  m5: number | null;
  h1: number | null;
  h6: number | null;
  h24: number | null;
}

export interface DexScreenerLiquidity {
  usd: number | null;
  base: number;
  quote: number;
}

export interface Token {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels: string[] | null;
  baseToken: DexScreenerTokenInfo;
  quoteToken: DexScreenerTokenInfo;
  priceNative: string;
  priceUsd: string | null;
  txns: DexScreenerTxns;
  volume: DexScreenerVolume;
  priceChange: DexScreenerPriceChange;
  liquidity: DexScreenerLiquidity | null;
  fdv: number | null;
  marketCap: number | null;
  pairCreatedAt: number | null;
}

export interface RugEvent {
  id: string;
  marketId: string;
  tokenMint: string;
  eventType: RugEventType;
  eventData: Record<string, unknown>;
  txSignature: string | null;
  detectedAt: string;
}
