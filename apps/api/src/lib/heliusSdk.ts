export type HeliusSdkNetwork = "devnet" | "mainnet";

/**
 * Helius SDK `network` option for REST calls (webhooks, etc.).
 * Defaults to **devnet** — Survive.fun runs on Solana devnet only.
 * Set `HELIUS_NETWORK=mainnet` only for operational tooling that must touch
 * legacy mainnet webhooks (e.g. `helius-webhook.ts delete`).
 */
export function resolveHeliusSdkNetwork(): HeliusSdkNetwork {
  const n = process.env.HELIUS_NETWORK?.trim().toLowerCase() ?? "";
  if (n === "mainnet" || n === "mainnet-beta") {
    return "mainnet";
  }
  return "devnet";
}
