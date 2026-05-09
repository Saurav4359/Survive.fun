import type { Token } from "@survivefun/types";
import { AlertTriangle, Droplets, Timer, UserRound } from "lucide-react";

import { formatUsd } from "@/utils/format";
import { computeRiskLevel, type RiskLevel } from "@/utils/marketRisk";

export type { RiskLevel };

function formatTokenAge(pairCreatedAtSeconds: number | null | undefined): string {
  if (pairCreatedAtSeconds == null || !Number.isFinite(pairCreatedAtSeconds)) {
    return "—";
  }
  const createdMs = pairCreatedAtSeconds * 1000;
  const diff = Date.now() - createdMs;
  if (!Number.isFinite(diff) || diff < 0) return "—";
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  const m = Math.floor(diff / 60_000);
  return `${Math.max(1, m)}m`;
}

const badgeStyles: Record<
  RiskLevel,
  { wrap: string; label: string; Icon: typeof AlertTriangle }
> = {
  HIGH: {
    wrap: "border-rug text-rug",
    label: "High risk",
    Icon: AlertTriangle,
  },
  MEDIUM: {
    wrap: "border-warn text-warn",
    label: "Medium risk",
    Icon: AlertTriangle,
  },
  LOW: {
    wrap: "border-accent text-accent",
    label: "Lower risk",
    Icon: AlertTriangle,
  },
};

export type RiskScoreProps = {
  token: Token;
  /** Approximate % of circulating supply held by dev wallets (0–100). */
  devWalletPctHeld?: number | null;
  /** USD liquidity (e.g. DexScreener `liquidity.usd`). */
  liquidityUsd?: number | null;
  /** Pair creation time as unix seconds (e.g. DexScreener `pairCreatedAt`). */
  pairCreatedAt?: number | null;
};

export function RiskScore({
  token,
  devWalletPctHeld = null,
  liquidityUsd = null,
  pairCreatedAt = null,
}: RiskScoreProps) {
  const level = computeRiskLevel({
    devWalletPctHeld,
    liquidityUsd,
    pairCreatedAtSeconds: pairCreatedAt,
  });
  const badge = badgeStyles[level];

  const devLabel =
    devWalletPctHeld != null && Number.isFinite(devWalletPctHeld)
      ? `${devWalletPctHeld.toFixed(1)}%`
      : "—";
  const liqLabel =
    liquidityUsd != null && Number.isFinite(liquidityUsd)
      ? formatUsd(liquidityUsd)
      : "—";
  const ageLabel = formatTokenAge(pairCreatedAt ?? null);

  return (
    <div className="border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted">
            Risk profile
          </p>
          <p className="mt-1 truncate font-display text-base font-bold text-white">
            {token.name}
          </p>
          <p className="font-mono text-xs font-semibold text-accent">
            ${token.symbol}
          </p>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 rounded-sm border bg-bg px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.15em] ${badge.wrap}`}
        >
          <badge.Icon className="h-3 w-3" aria-hidden />
          {level}
        </div>
      </div>

      <p className="mt-3 font-mono text-[11px] text-fg-muted">{badge.label}</p>

      <dl className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="border border-border bg-bg p-3">
          <dt className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
            <UserRound className="h-3 w-3 text-accent" aria-hidden />
            Dev held
          </dt>
          <dd className="mt-2 font-mono text-sm font-medium tabular-nums text-white">
            {devLabel}
          </dd>
        </div>
        <div className="border border-border bg-bg p-3">
          <dt className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
            <Droplets className="h-3 w-3 text-accent" aria-hidden />
            Liquidity
          </dt>
          <dd className="mt-2 font-mono text-sm font-medium tabular-nums text-white">
            {liqLabel}
          </dd>
        </div>
        <div className="border border-border bg-bg p-3">
          <dt className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
            <Timer className="h-3 w-3 text-accent" aria-hidden />
            Token age
          </dt>
          <dd className="mt-2 font-mono text-sm font-medium tabular-nums text-white">
            {ageLabel}
          </dd>
        </div>
      </dl>
    </div>
  );
}
