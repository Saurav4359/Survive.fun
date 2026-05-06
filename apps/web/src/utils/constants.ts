import { PublicKey, clusterApiUrl } from "@solana/web3.js";

/**
 * Circle USDC on Solana devnet (canonical mint).
 * @see https://developers.circle.com/stablecoins/docs/usdc-on-test-networks
 */
export const USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

const devnetFallbackProgram = "11111111111111111111111111111112";

const programIdBase58 =
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? devnetFallbackProgram;

/**
 * Deployed Survive.fun program id. Set `NEXT_PUBLIC_PROGRAM_ID` in `.env.local`
 * for real deployments; until then this resolves to a well-known placeholder
 * PublicKey so the bundle type-checks.
 */
export const PROGRAM_ID = new PublicKey(programIdBase58);

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL?.trim() || clusterApiUrl("devnet");

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:3001";

export const BET_LIMITS = {
  min: 1,
  max: 50,
} as const;

export const MARKET_DURATIONS = [3600, 21600, 86400] as const;

/** DexScreener latest pairs for one or more token addresses (comma-separated). */
export const DEXSCREENER_TOKENS_URL =
  "https://api.dexscreener.com/latest/dex/tokens";
