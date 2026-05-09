/**
 * Refuse to boot in production with unsafe demo / bypass flags.
 */

export function assertProductionSafeOrExit(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

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
