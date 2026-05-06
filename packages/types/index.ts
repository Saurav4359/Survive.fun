// --- Market types ---

export type MarketStatus = "active" | "resolved" | "expired";

export type Outcome = "survive" | "rug";

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

// --- Bet types ---

export type BetSide = "survive" | "rug";

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

// --- Token types (DexScreener-aligned) ---

export interface Token {
  address: string;
  name: string;
  symbol: string;
}

export interface TokenLiquidity {
  usd: number | null;
  base: number;
  quote: number;
}

export interface TokenPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels: string[] | null;
  baseToken: Token;
  quoteToken: Token;
  priceNative: string;
  priceUsd: string | null;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    m5: number | null;
    h1: number | null;
    h6: number | null;
    h24: number | null;
  };
  liquidity: TokenLiquidity | null;
  fdv: number | null;
  marketCap: number | null;
  pairCreatedAt: number | null;
}

// --- API response types ---

export interface ApiErrorBody {
  code: string;
  message: string;
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiErrorBody };

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

// --- Rug detection types (used by socket payloads) ---

export type RugEventType = "dev_sell" | "price_drop" | "liquidity_removed";

export interface RugEvent {
  id: string;
  marketId: string;
  tokenMint: string;
  eventType: RugEventType;
  eventData: Record<string, unknown> | null;
  txSignature: string | null;
  detectedAt: string;
}

export type RugCondition =
  | "dev_sold_over_25_percent"
  | "price_dropped_over_90_percent"
  | "liquidity_removed_over_80_percent";

export interface RugDetectionResult {
  isRug: boolean;
  triggeredConditions: RugCondition[];
  evaluatedAt: string;
}

// --- WebSocket event types ---

export interface PriceUpdate {
  marketId: string;
  tokenMint: string;
  priceUsd: string;
  liquidityUsd: number | null;
  timestamp: string;
}

export interface BetPlaced {
  marketId: string;
  bettorWallet: string;
  side: BetSide;
  amountUsdc: string;
  survivePool: string;
  rugPool: string;
  timestamp: string;
}

export interface MarketResolved {
  marketId: string;
  outcome: Outcome;
  survivePool: string;
  rugPool: string;
  timestamp: string;
}

export type SocketEvents = {
  market_created: { market: Market };
  bet_placed: BetPlaced;
  pool_update: {
    marketId: string;
    survivePool: string;
    rugPool: string;
  };
  rug_detected: {
    marketId: string;
    tokenMint: string;
    eventType: RugEvent["eventType"];
  };
  market_resolved: MarketResolved;
  new_token: {
    tokenMint: string;
    tokenName: string | null;
  };
  price_update: PriceUpdate;
};
