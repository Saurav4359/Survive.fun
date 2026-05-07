import type { Token } from "@survivefun/types";
import { AlertTriangle, Droplets, Timer, UserRound } from "lucide-react";

import { formatUSDC } from "@/utils/format";
import {
  computeRiskLevel,
  type RiskLevel,
} from "@/utils/marketRisk";

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
  { wrap: string; dot: string; label: string }
> = {
  HIGH: {
    wrap: "border-rug/40 bg-rug/10 text-rug",
    dot: "bg-rug",
    label: "High risk",
  },
  MEDIUM: {
    wrap: "border-warn/40 bg-warn/10 text-warn",
    dot: "bg-warn",
    label: "Medium risk",
  },
  LOW: {
    wrap: "border-survive/40 bg-survive/10 text-survive",
    dot: "bg-survive",
    label: "Lower risk",
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
      ? formatUSDC(liquidityUsd)
      : "—";
  const ageLabel = formatTokenAge(pairCreatedAt ?? null);

  return (
    <div className="card-cyber space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Risk profile
          </p>
          <p className="font-display mt-1 truncate text-lg font-bold text-foreground">
            {token.name}
          </p>
          <p className="font-mono text-sm font-semibold text-accent-bright">
            {token.symbol}
          </p>
        </div>
        <div
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1 font-mono text-xs font-bold uppercase tracking-widest ${badge.wrap} ${level === "HIGH" ? "glitch-rug" : ""}`}
        >
          <span className={`h-2 w-2 ${badge.dot}`} />
          {level}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted">{badge.label}</p>

      <dl className="grid gap-2 sm:grid-cols-3 sm:gap-px sm:bg-border sm:ring-1 sm:ring-border">
        <div className="border border-border bg-surface p-3 sm:border-0">
          <dt className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
            <UserRound className="h-3.5 w-3.5 text-accent" aria-hidden />
            Dev held
          </dt>
          <dd className="mt-2 font-mono text-sm font-medium tabular-nums text-foreground">
            {devLabel}
          </dd>
        </div>
        <div className="border border-border bg-surface p-3 sm:border-0">
          <dt className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
            <Droplets className="h-3.5 w-3.5 text-accent" aria-hidden />
            Liquidity
          </dt>
          <dd className="mt-2 font-mono text-sm font-medium tabular-nums text-foreground">
            {liqLabel}
          </dd>
        </div>
        <div className="border border-border bg-surface p-3 sm:border-0">
          <dt className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
            <Timer className="h-3.5 w-3.5 text-accent" aria-hidden />
            Token age
          </dt>
          <dd
            suppressHydrationWarning
            className="mt-2 font-mono text-sm font-medium tabular-nums text-foreground"
          >
            {ageLabel}
          </dd>
        </div>
      </dl>

      <div className="flex items-start gap-2 border border-warn/30 bg-warn/5 px-3 py-2 font-mono text-[11px] text-warn">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="leading-relaxed">
          Heuristic only — not financial advice. Wire real supply + holder data before
          relying on this in production.
        </p>
      </div>
    </div>
  );
}
