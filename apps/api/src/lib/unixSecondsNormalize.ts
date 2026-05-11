/**
 * Dex feeds may return pair creation time as unix seconds or milliseconds.
 * Store and expose unix seconds only (consumers multiply by 1000 for Date).
 */
export function normalizeDexUnixSeconds(ts: number | null): number | null {
  if (ts == null || !Number.isFinite(ts)) return null;
  let n = Math.floor(ts);
  const maxUnixSec = 5_000_000_000;
  while (n > maxUnixSec) {
    n = Math.floor(n / 1000);
  }
  return n;
}
