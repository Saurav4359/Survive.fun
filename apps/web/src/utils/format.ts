const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const poolFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

import type { Bet, BetSide } from "@survivefun/types";

/** Fiat USD for token prices / liquidity (not stake collateral). */
export function formatUsd(amount: number): string {
  return usdFormatter.format(amount);
}

/** Decimal string the API/DB already validated — no float or Intl rounding. */
const USD_PRICE_LITERAL_RE = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;

/**
 * Renders a USD price exactly as given (e.g. `market.openPrice` or `pair.priceUsd`).
 * Does not parse through `Number` (avoids IEEE rounding on long fractional strings).
 */
export function formatUsdPriceLiteral(value: string | null | undefined): string {
  if (value == null) return "—";
  const t = value.trim();
  if (t === "") return "—";
  if (!USD_PRICE_LITERAL_RE.test(t)) return "—";
  return `$${t}`;
}

/** Lamports → `"x.xxxx SOL"` */
export function formatSOL(lamports: number): string {
  if (!Number.isFinite(lamports)) return "0.0000 SOL";
  return `${(lamports / 1e9).toFixed(4)} SOL`;
}

/** Human SOL → `"◎ x.xxxx"` */
export function formatSOLDisplay(sol: number): string {
  if (!Number.isFinite(sol)) return "◎ 0.0000";
  return `◎ ${sol.toFixed(4)}`;
}

export function formatBetStake(bet: Pick<Bet, "amountLamports">): string {
  const lamports = BigInt(bet.amountLamports ?? "0");
  return formatSolBetLine(Number(lamports) / 1e9);
}

/** Pool / payout strings from API: lamports integer string. */
export function formatNativeBetAmount(amountStr: string | null | undefined): string {
  if (amountStr == null || amountStr === "") return "—";
  const lamports = BigInt(amountStr.split(".")[0] ?? "0");
  return formatSolBetLine(Number(lamports) / 1e9);
}

export function formatPoolTotals(
  surviveLamports: number,
  rugLamports: number,
): { survive: string; rug: string } {
  return {
    survive: formatSolBetLine(surviveLamports / 1e9),
    rug: formatSolBetLine(rugLamports / 1e9),
  };
}

/** Adaptive SOL display (legacy helper). */
export function formatSolAmount(sol: number): string {
  if (!Number.isFinite(sol)) return "0";
  if (sol === 0) return "0";
  if (sol >= 1) {
    return sol.toLocaleString("en-US", { maximumFractionDigits: 4 });
  }
  return sol.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** Bet panel / confirmations — 4 dp, ◎ prefix. */
export function formatSolBetLine(sol: number): string {
  if (!Number.isFinite(sol)) return "◎ 0.0000 SOL";
  return `◎ ${sol.toFixed(4)} SOL`;
}

/** Parimutuel gross payout in lamports (SOL pools). */
export function potentialPayoutLamports(
  side: BetSide,
  surviveLamports: bigint,
  rugLamports: bigint,
  stakeLamports: bigint,
): bigint {
  if (stakeLamports <= 0n) return 0n;
  if (side === "survive") {
    const ts = surviveLamports + stakeLamports;
    const tr = rugLamports;
    if (ts === 0n) return stakeLamports;
    return (stakeLamports * (ts + tr)) / ts;
  }
  const tr = rugLamports + stakeLamports;
  const ts = surviveLamports;
  if (tr === 0n) return stakeLamports;
  return (stakeLamports * (ts + tr)) / tr;
}

export function parsePoolLamports(value: string): bigint {
  const s = value.trim().split(".")[0] ?? "0";
  try {
    const n = BigInt(s === "" ? "0" : s);
    return n < 0n ? 0n : n;
  } catch {
    return 0n;
  }
}

export function formatWallet(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length <= 8) {
    return trimmed;
  }
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function formatTimeLeft(expiresAt: Date): string {
  const diffMs = expiresAt.getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return "Ended";
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(" ");
}

/** Compact number for tight labels (pool totals use `formatSolBetLine` instead). */
export function formatPool(amount: number): string {
  return poolFormatter.format(amount);
}
