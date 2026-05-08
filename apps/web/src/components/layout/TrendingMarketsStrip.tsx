"use client";

import type { Market, TokenPair } from "@survivefun/types";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { totalPoolUsdc } from "@/utils/marketRisk";
import { formatPool } from "@/utils/format";

function TokenThumb({
  mint,
  ticker,
}: {
  mint: string;
  ticker: string;
}) {
  const [bad, setBad] = useState(false);
  const src = `https://dd.dexscreener.com/ds-data/tokens/solana/${mint}.png`;
  const letter = (ticker || "?").slice(0, 1).toUpperCase();
  if (bad) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-accent/20 font-mono text-xs font-bold text-accent-bright">
        {letter}
      </div>
    );
  }
  return (
    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-surface">
      <Image
        src={src}
        alt=""
        width={36}
        height={36}
        className="h-full w-full object-cover"
        onError={() => setBad(true)}
        unoptimized
      />
    </div>
  );
}

type RowProps = {
  rank: number;
  market: Market;
  pair: TokenPair | null;
};

function StripRow({ rank, market, pair }: RowProps) {
  const ticker = market.tokenTicker?.trim() || "—";
  const pool = totalPoolUsdc(market);
  return (
    <Link
      href={`/market/${market.id}`}
      className="flex min-w-[200px] shrink-0 items-center gap-3 rounded-xl border border-border bg-surface/90 px-3 py-2 transition hover:border-accent/50 hover:bg-surface"
    >
      <span className="w-6 font-mono text-xs font-bold tabular-nums text-muted-foreground">
        {rank}
      </span>
      <TokenThumb mint={market.tokenMint} ticker={ticker} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm font-bold text-accent-bright">
          ${ticker}
        </p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          Pool {formatPool(pool)} USDC
        </p>
      </div>
    </Link>
  );
}

type Props = {
  markets: Market[];
  pairByMint: Map<string, TokenPair | null>;
};

export function TrendingMarketsStrip({ markets, pairByMint }: Props) {
  const ranked = useMemo(() => {
    return [...markets]
      .sort((a, b) => totalPoolUsdc(b) - totalPoolUsdc(a))
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
          {ranked.map((m, i) => (
            <StripRow
              key={m.id}
              rank={i + 1}
              market={m}
              pair={pairByMint.get(m.tokenMint) ?? null}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
