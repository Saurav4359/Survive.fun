// --- Market types ---

export type MarketStatus = "active" | "resolved" | "expired";

export type Outcome = "survive" | "rug";

/** Collateral for pools and bets (never mix per market). */
export type MarketCurrency = "sol" | "usdc";

export interface Market {
  id: string;
  tokenMint: string;
  tokenName: string | null;
  tokenTicker: string | null;
  creatorWallet: string;
  durationSeconds: number;
  expiresAt: string;
  /** Parimutuel pools: USDC decimal string or SOL lamports integer string. */
  survivePool: string;
  rugPool: string;
  currency: MarketCurrency;
  openPrice: string | null;
  openLiquidity: string | null;
  devWallet: string | null;
  /** Optional ratio 0–1 for dev_sell detection (demo / overrides). */
  devSellThresholdOverride: string | null;
  status: MarketStatus;
  outcome: Outcome | null;
  resolvedAt: string | null;
  rugCondition: string | null;
  onChainAddress: string | null;
  createdAt: string;
  totalBettors: number;
}

/** Row from `GET /v1/markets/:id/result` (SOL: `betAmount` / `payoutAmount` are lamports). */
export interface MarketResultPayoutRow {
  wallet: string;
  betAmount: number;
  betSide: BetSide;
  payoutAmount: number;
  won: boolean;
  claimed: boolean;
}

export interface MarketResultPayload {
  market: Market;
  outcome: Outcome | null;
  payouts: MarketResultPayoutRow[];
  platformFee: number;
  totalDistributed: number;
  rugCondition: string | null;
  resolvedAt: string | null;
}

/** `GET /v1/markets/:id/my-payout?wallet=` — SOL stakes are lamports in `betAmount` / `payoutAmount`. */
export type MyPayoutPayload =
  | {
      found: false;
      won: false;
      betAmount: number;
      betSide: string;
      payoutAmount: number;
      claimed: false;
      claimTxSignature: null;
      /** Solana program market account is `Resolved` with outcome (required before `claim_payout`). */
      onChainResolved: boolean;
    }
  | {
      found: true;
      won: boolean;
      betAmount: number;
      betSide: BetSide;
      payoutAmount: number;
      claimed: boolean;
      claimTxSignature: string | null;
      onChainResolved: boolean;
    };

// --- Bet types ---

export type BetSide = "survive" | "rug";

export interface Bet {
  id: string;
  marketId: string;
  bettorWallet: string;
  side: BetSide;
  currency: MarketCurrency;
  /** USDC stake (decimal); null when `currency === "sol"`. */
  amountUsdc: string | null;
  /** SOL stake (lamports integer string); null when `currency === "usdc"`. */
  amountLamports: string | null;
  /** Estimated payout in the market currency (USDC decimal or lamports integer string). */
  potentialWin: string | null;
  txSignature: string;
  won: boolean;
  claimed: boolean;
  claimedAt: string | null;
  payoutAmount: string | null;
  payoutTx: string | null;
  createdAt: string;
}

/** Bet with joined market (e.g. user portfolio rows). */
export interface BetWithMarket extends Bet {
  market: Market;
}

/** Recent payout row for dashboard / stats. */
export interface RecentPayout {
  bettorWallet: string;
  payoutAmountUsdc: string;
  marketId: string;
  tokenTicker: string | null;
  payoutTx: string | null;
  createdAt: string;
}

/** Aggregated dashboard stats from the API (live DB). */
export interface PlatformSnapshot {
  activeMarkets: number;
  /** Lifetime USDC stake volume only (does not include SOL). */
  totalBetVolumeUsdc: string;
  /** Last 24h SOL stake volume (human SOL, not lamports). */
  solVolume24h: number;
  /** Last 24h USDC stake volume (human USDC). */
  usdcVolume24h: number;
  resolvedRugs: number;
  resolvedSurvives: number;
  largestPayoutUsdc: string | null;
  recentPayouts: RecentPayout[];
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
  /** Enriched from DexScreener `pair.info` when available. */
  devWallet?: string | null;
  /** Birdeye: holder count (when API key configured). */
  holderCount?: number | null;
  /** Birdeye: top traders / liquidity depth hints. */
  birdeyePriceChange24hPercent?: number | null;
}

/** Single OHLCV bar (chart endpoint). */
export interface OhlcvBar {
  /** Unix seconds (candle open). */
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  /** Volume in USD where available. */
  v: string;
}

export interface MarketChartResponse {
  tokenMint: string;
  interval: string;
  bars: OhlcvBar[];
  source: "birdeye" | "none";
}

/** One snapshot of pool balances over time (from DB bets + implied opening pool). */
export interface MarketPoolHistoryPoint {
  /** Unix seconds (UTC). */
  t: number;
  survivePoolRaw: string;
  rugPoolRaw: string;
}

/** `GET /v1/markets/:id/pool-history` — SURVIVE vs RUG pool size from recorded bets (Polymarket-style). */
export interface MarketPoolHistoryResponse {
  currency: MarketCurrency;
  points: MarketPoolHistoryPoint[];
}

/** Paginated active/all markets list. */
export interface MarketListPage {
  items: Market[];
  page: number;
  limit: number;
  total: number;
}

export type LeaderboardTab = "winners" | "rug-callers" | "biggest-payouts";

/** Row for `/v1/leaderboard` (matches leaderboard page columns). */
export interface LeaderboardRow {
  wallet: string;
  /** Sum of payouts won (USDC, decimal string). */
  totalWon: string;
  winRatePct: number;
  /** Largest single payout for this wallet (USDC, decimal string). */
  bestPayout: string;
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

export type RugEventType =
  | "dev_sell"
  | "price_drop"
  | "liquidity_removed"
  | "graduation_stall";

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
  | "liquidity_removed_over_80_percent"
  | "bonding_stalled_before_graduation";

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
  currency: MarketCurrency;
  /** USDC stake (decimal string); `"0"` when `currency === "sol"`. */
  amountUsdc: string;
  /** SOL stake (lamports integer string); `null` when `currency === "usdc"`. */
  amountLamports: string | null;
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
  rugCondition?: string | null;
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
  payout_ready: {
    wallet: string;
    amount: string;
    marketId: string;
  };
  payout_claimed: {
    wallet: string;
    marketId: string;
    betId: string;
    amount: string;
  };
  new_token: {
    tokenMint: string;
    tokenName: string | null;
  };
  price_update: PriceUpdate;
};
