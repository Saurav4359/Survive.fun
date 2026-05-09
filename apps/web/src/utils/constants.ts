import type { Idl } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL, PublicKey, clusterApiUrl } from "@solana/web3.js";

import survivefunIdl from "@/idl/survivefun.json";

/** Local Anchor `declare_id!` in `contracts/programs/survivefun` until you set env. */
const localAnchorProgramId =
  "9ZqPpXBid4xzB49HjB7zE6BnTWryMuuZFTULTSJqqTd8";

const programIdBase58 =
  process.env.NEXT_PUBLIC_PROGRAM_ID?.trim() || localAnchorProgramId;

/**
 * Deployed Survive.fun program id. Override with `NEXT_PUBLIC_PROGRAM_ID` in `.env.local`.
 */
export const PROGRAM_ID = new PublicKey(programIdBase58);
export const IDL = survivefunIdl as Idl;

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

/** On-chain min/max stake (lamports) — matches program `MIN_BET_LAMPORTS` / `MAX_BET_LAMPORTS`. */
export const ONCHAIN_MIN_STAKE_RAW = 10_000_000n;
export const ONCHAIN_MAX_STAKE_RAW = 10_000_000_000n;

/** Human SOL bounds (0.01 – 10 SOL). */
export const SOL_BET_LIMITS = {
  min: Number(ONCHAIN_MIN_STAKE_RAW) / LAMPORTS_PER_SOL,
  max: Number(ONCHAIN_MAX_STAKE_RAW) / LAMPORTS_PER_SOL,
} as const;

export const QUICK_SOL_AMOUNTS = [0.1, 0.5, 1, 2] as const;

/** Platform seeds 0.01 SOL per side into new markets (`PLATFORM_SEED_LAMPORTS_PER_SIDE`). */
export const PLATFORM_SEED_LAMPORTS_TOTAL = 20_000_000n;

export const MARKET_DURATIONS = [3600, 21600, 86400] as const;

/** DexScreener latest pairs for one or more token addresses (comma-separated). */
export const DEXSCREENER_TOKENS_URL =
  "https://api.dexscreener.com/latest/dex/tokens";
