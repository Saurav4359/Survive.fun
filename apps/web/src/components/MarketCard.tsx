import type { Market } from "@survivefun/types";
import { Clock, Shield, Skull, TrendingUp } from "lucide-react";
import Link from "next/link";

import { formatPool, formatUSDC } from "@/utils/format";

import { PoolBar } from "./PoolBar";
import { Timer } from "./Timer";

function parseAmount(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function MarketCard({ market }: { market: Market }) {
  const name = market.tokenName?.trim() || "Unknown token";
  const ticker = market.tokenTicker?.trim() || "—";
  const survive = parseAmount(market.survivePool);
  const rug = parseAmount(market.rugPool);
  const open = market.openPrice;
  const priceNum = open != null ? Number.parseFloat(open) : NaN;
  const hasPrice = Number.isFinite(priceNum);
  const expiresAt = new Date(market.expiresAt);

  return (
    <article
      className="card-cyber group flex flex-col gap-4 border-l-[3px] border-l-accent p-5 pl-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="font-display truncate text-lg font-bold tracking-tight text-foreground">
            {name}
          </h3>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent-bright">
            {ticker}
          </p>
        </div>
        <div className="flex items-center gap-1.5 border border-border bg-surface px-2 py-1 font-mono text-xs text-muted transition-colors duration-200 group-hover:border-border-glow/50">
          <Clock className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          <Timer expiresAt={expiresAt} />
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3 border border-border bg-surface px-4 py-3 transition-colors duration-200 group-hover:border-border-glow/40">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Price
          </p>
          <p className="font-mono text-xl font-medium tabular-nums text-foreground">
            {hasPrice ? formatUSDC(priceNum) : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-right">
          <TrendingUp className="h-4 w-4 text-muted" aria-hidden />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              % chg
            </p>
            <p className="font-mono text-sm font-medium tabular-nums text-fg-soft">
              —
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-start gap-2 border border-survive/35 bg-survive/5 px-3 py-2">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-survive" aria-hidden />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-survive">
              SURVIVE pool
            </p>
            <p className="mt-1 font-mono font-medium tabular-nums text-fg-soft">
              {formatPool(survive)} USDC
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 border border-rug/35 bg-rug/5 px-3 py-2">
          <Skull className="mt-0.5 h-4 w-4 shrink-0 text-rug" aria-hidden />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-rug">
              RUG pool
            </p>
            <p className="mt-1 font-mono font-medium tabular-nums text-fg-soft">
              {formatPool(rug)} USDC
            </p>
          </div>
        </div>
      </div>

      <PoolBar survivePool={survive} rugPool={rug} />

      <Link
        href={`/market/${market.id}`}
        className="block rounded-lg border border-accent bg-accent px-4 py-3 text-center text-sm font-semibold uppercase tracking-wide text-ink transition-all duration-200 hover:bg-transparent hover:text-accent-bright hover:shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-px"
      >
        Bet Now
      </Link>
    </article>
  );
}
