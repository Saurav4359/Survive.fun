import { RPC_URL } from "@/utils/constants";

/** Base58 Solana tx signatures are typically 64–88 chars; filters demo / invalid placeholders. */
const SOLANA_TX_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;

export function isLikelySolanaTxSignature(
  s: string | null | undefined,
): s is string {
  if (s == null || typeof s !== "string") return false;
  return SOLANA_TX_SIG_RE.test(s.trim());
}

function solscanClusterParam(): string {
  if (RPC_URL.includes("mainnet")) return "";
  if (RPC_URL.includes("testnet")) return "?cluster=testnet";
  return "?cluster=devnet";
}

/** Solscan transaction URL for the configured RPC cluster. */
export function solscanTxUrl(signature: string): string {
  const q = solscanClusterParam();
  return `https://solscan.io/tx/${encodeURIComponent(signature)}${q}`;
}
