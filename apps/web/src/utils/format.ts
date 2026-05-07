const usdcFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const poolFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export function formatUSDC(amount: number): string {
  return usdcFormatter.format(amount);
}

/** SOL balance for wallet UI (trims trailing zeros). */
export function formatSolAmount(sol: number): string {
  if (!Number.isFinite(sol)) return "0";
  if (sol === 0) return "0";
  if (sol >= 1) {
    return sol.toLocaleString("en-US", { maximumFractionDigits: 4 });
  }
  return sol.toLocaleString("en-US", { maximumFractionDigits: 6 });
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

export function formatPool(amount: number): string {
  return poolFormatter.format(amount);
}
