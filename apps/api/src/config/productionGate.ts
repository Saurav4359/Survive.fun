/**
 * Refuse to boot in production with unsafe demo / bypass flags.
 */

function solanaRpcUrlForGate(): string {
  return (
    process.env.SOLANA_RPC?.trim() ||
    process.env.SOLANA_RPC_URL?.trim() ||
    ""
  );
}

/** Survive.fun is deployed against Solana devnet — block obvious mainnet RPC URLs in prod. */
function assertDevnetRpcOrExit(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  if (
    process.env.ALLOW_MAINNET_RPC?.trim() === "I_KNOW_WHAT_IM_DOING"
  ) {
    console.warn(
      "[productionGate] ALLOW_MAINNET_RPC=I_KNOW_WHAT_IM_DOING — mainnet-style RPC URL allowed",
    );
    return;
  }

  const raw = solanaRpcUrlForGate();
  const u = raw.toLowerCase();
  const looksMainnet =
    u.includes("mainnet-beta") ||
    u.includes("api.mainnet") ||
    u.includes("mainnet.helius");

  if (looksMainnet) {
    console.error(
      "[fatal] SOLANA_RPC / SOLANA_RPC_URL appears to point at Solana mainnet. This service targets devnet only. Use a devnet RPC (e.g. https://api.devnet.solana.com) or set ALLOW_MAINNET_RPC=I_KNOW_WHAT_IM_DOING to override.",
    );
    process.exit(1);
  }
}

export function assertProductionSafeOrExit(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  assertDevnetRpcOrExit();

  if (process.env.SKIP_TX_VERIFICATION === "true") {
    console.error(
      "[fatal] SKIP_TX_VERIFICATION cannot be true when NODE_ENV=production",
    );
    process.exit(1);
  }

  if (process.env.ALLOW_DB_ONLY_MARKET_CREATE === "true") {
    console.error(
      "[fatal] ALLOW_DB_ONLY_MARKET_CREATE cannot be true when NODE_ENV=production",
    );
    process.exit(1);
  }
}
