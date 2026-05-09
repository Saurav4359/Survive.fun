import { RPC_URL } from "@/utils/constants";

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
