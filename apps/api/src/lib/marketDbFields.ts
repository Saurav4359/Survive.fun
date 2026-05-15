/** Matches `Market.tokenName` in `schema.prisma`. */
export const MARKET_TOKEN_NAME_DB_MAX = 100;
/** Matches `Market.tokenTicker` in `schema.prisma`. */
export const MARKET_TOKEN_TICKER_DB_MAX = 20;

/**
 * Dex / Pump metadata can exceed Postgres `VarChar` limits; Prisma then throws and surfaces as 500.
 */
export function clampOptionalVarchar(
  s: string | null | undefined,
  max: number,
): string | null {
  if (s == null) return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}
