"use client";

import type { Market, TokenPair } from "@survivefun/types";
import Link from "next/link";
import { useMemo } from "react";

import { TokenThumb } from "@/components/TokenThumb";
import { formatSolBetLine } from "@/utils/format";
import { totalPoolLamports } from "@/utils/marketRisk";

function StripRow({ market }: { market: Market }) {
  const ticker = market.tokenTicker?.trim() || "—";
  const pool = totalPoolLamports(market);
  return (
    <Link
      href={`/market/${market.id}`}
      className="inline-flex w-fit max-w-[220px] shrink-0 items-center gap-2 rounded-xl border border-border bg-surface/90 px-3 py-2 transition hover:border-accent/50 hover:bg-surface"
    >
      <TokenThumb
        mint={market.tokenMint}
        ticker={ticker}
        size={36}
        rounded="full"
        className="bg-accent/20"
      />
      <div className="min-w-0 leading-tight">
        <p className="truncate font-mono text-sm font-bold text-accent-bright">
          ${ticker}
        </p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          Pool {formatSolBetLine(pool / 1e9)}
        </p>
      </div>
    </Link>
  );
}

type Props = {
  markets: Market[];
  /** Optional map for future pair metadata; strip layout does not use it. */
  pairByMint?: Map<string, TokenPair | null>;
};

export function TrendingMarketsStrip({ markets }: Props) {
  const ranked = useMemo(() => {
    return [...markets]
      .sort((a, b) => totalPoolLamports(b) - totalPoolLamports(a))
      .slice(0, 12);
  }, [markets]);

  if (ranked.length === 0) return null;

  return (
    <section
      aria-label="Trending survival markets"
      className="border-b border-border bg-[var(--bg-primary)] py-3"
    >
      <div className="flex items-center gap-2 px-3 sm:px-5">
        <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-widest text-accent-bright">
          🔥 Trending
        </span>
        <div className="hide-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {ranked.map((m) => (
            <StripRow key={m.id} market={m} />
          ))}
        </div>
      </div>
    </section>
  );
}
