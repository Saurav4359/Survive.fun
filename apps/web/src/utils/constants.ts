import { PublicKey, clusterApiUrl } from "@solana/web3.js";

/**
 * Circle USDC on Solana devnet (canonical mint).
 * @see https://developers.circle.com/stablecoins/docs/usdc-on-test-networks
 */
export const USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

/** Local Anchor `declare_id!` in `contracts/programs/survivefun` until you set env. */
const localAnchorProgramId =
  "HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH";

const programIdBase58 =
  process.env.NEXT_PUBLIC_PROGRAM_ID?.trim() || localAnchorProgramId;

/**
 * Deployed Survive.fun program id. Override with `NEXT_PUBLIC_PROGRAM_ID` in `.env.local`.
 */
export const PROGRAM_ID = new PublicKey(programIdBase58);

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL?.trim() || clusterApiUrl("devnet");

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:3001";

/**
 * REST prefix mounted by the API (`/v1` or `/api/v1`). Socket.IO still uses `API_URL` origin only.
 */
export const API_V1_PREFIX =
  process.env.NEXT_PUBLIC_API_V1_PREFIX?.trim() || "/v1";

/** Build a full URL for REST endpoints, e.g. `apiV1Url("/markets/active")`. */
export function apiV1Url(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${API_V1_PREFIX}${p}`;
}

export const BET_LIMITS = {
  min: 1,
  max: 50,
} as const;

export const MARKET_DURATIONS = [3600, 21600, 86400] as const;

/** DexScreener latest pairs for one or more token addresses (comma-separated). */
export const DEXSCREENER_TOKENS_URL =
  "https://api.dexscreener.com/latest/dex/tokens";
