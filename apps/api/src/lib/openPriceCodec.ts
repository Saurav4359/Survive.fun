/**
 * On-chain `Market.open_price` is stored as USD × 1e6 (integer micros).
 * Bootstrap / Dex paths use decimal strings (e.g. `"0.000022222"`).
 * This module normalizes both for API + DB writes.
 */

function trimTrailingZerosAndDot(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

/** Decode micro-units string from chain account → decimal USD string for DB/API. */
export function openPriceMicroStringToDecimal(microStr: string): string | null {
  const t = microStr.trim();
  if (!t || t === "0") return null;
  if (!/^\d+$/.test(t)) return null;
  const micro = Number(t);
  if (!Number.isFinite(micro) || micro <= 0) return null;
  const usd = micro / 1_000_000;
  if (!Number.isFinite(usd) || usd <= 0) return null;
  return trimTrailingZerosAndDot(usd.toFixed(12));
}

/**
 * Value persisted on `Market.open_price` — may be a decimal string (bootstrap)
 * or a legacy integer micro string (older rows indexed from chain without decode).
 */
export function apiOpenPriceFromStored(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t || t === "0") return null;
  if (t.includes(".") || /[eE]/.test(t)) return t;
  if (/^\d+$/.test(t)) return openPriceMicroStringToDecimal(t);
  return null;
}
