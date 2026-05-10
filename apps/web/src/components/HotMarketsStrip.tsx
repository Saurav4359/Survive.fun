"use client";

import type { ApiResponse, Market, MarketListPage } from "@survivefun/types";
import { useQuery } from "@tanstack/react-query";
import { useReducedMotion } from "framer-motion";
import { Flame } from "lucide-react";
import { useMemo } from "react";

import { marketsQueryKey } from "@/hooks/useMarkets";
import { useFilteredOpenActiveMarkets } from "@/hooks/useFilteredOpenActiveMarkets";
import { apiV1Url } from "@/utils/constants";
import { formatSolBetLine } from "@/utils/format";
import { isActiveMarketStillOpen } from "@/utils/marketListing";
import { totalPoolLamports } from "@/utils/marketRisk";

function TrendingMarketPill({
  market: m,
  rank,
}: {
  market: Market;
  rank: number;
}) {
  return (
    <a
      href={`/market/${m.id}`}
      className="flex min-w-[200px] shrink-0 items-center gap-2.5 rounded-md border border-border bg-card px-3 py-1.5 transition-colors hover:border-accent"
    >
      <span className="w-5 font-mono text-[10px] font-bold tabular-nums text-fg-muted">
        {rank + 1}
      </span>
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border bg-bg font-mono text-[11px] font-bold text-accent"
        aria-hidden
      >
        {(m.tokenTicker ?? "?").slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs font-bold text-white">
          ${m.tokenTicker ?? "—"}
        </p>
        <p className="truncate font-mono text-[10px] text-fg-muted">
          Pool {formatSolBetLine(totalPoolLamports(m) / 1e9)}
        </p>
      </div>
    </a>
  );
}

type Props = {
  /** Tighter layout when embedded in the sticky top bar */
  compact?: boolean;
};

export function HotMarketsStrip({ compact }: Props) {
  const reduceMotion = useReducedMotion();

  const marketsQuery = useQuery({
    queryKey: marketsQueryKey,
    queryFn: async (): Promise<Market[]> => {
      const params = new URLSearchParams({
        page: "1",
        limit: "100",
        status: "active",
      });
      const res = await fetch(`${apiV1Url("/markets")}?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Markets request failed (${res.status})`);
      }
      const body = (await res.json()) as ApiResponse<MarketListPage>;
      if (!body.success) {
        throw new Error(body.error.message || "Markets request failed");
      }
      return body.data.items.filter((m) => isActiveMarketStillOpen(m));
    },
    staleTime: 15_000,
  });

  const markets = useFilteredOpenActiveMarkets(marketsQuery.data ?? []);

  const trending = useMemo(() => {
    return [...markets]
      .sort((a, b) => totalPoolLamports(b) - totalPoolLamports(a))
      .slice(0, 12);
  }, [markets]);

  if (trending.length === 0) {
    return null;
  }

  const labelClass = compact
    ? "flex shrink-0 items-center gap-1 border-r border-border pr-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-accent sm:gap-1.5 sm:pr-3 sm:text-[10px]"
    : "flex shrink-0 items-center gap-1.5 border-r border-border px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent sm:px-6 lg:px-10";

  const trackClass = compact
    ? "relative min-h-0 min-w-0 flex-1 overflow-hidden py-0.5 sm:py-1"
    : "relative min-h-0 min-w-0 flex-1 overflow-hidden py-2 pr-4 sm:pr-6 lg:pr-10";

  const outerClass = compact
    ? "flex min-w-0 flex-1 items-stretch overflow-hidden"
    : "mx-auto flex max-w-[1440px] items-stretch";

  return (
    <div className={outerClass} aria-label="Trending markets">
      <div className={labelClass}>
        <Flame className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
        <span className="hidden sm:inline">Hot Markets</span>
        <span className="sm:hidden">Hot</span>
      </div>
      <div className={trackClass}>
        {reduceMotion ? (
          <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-0.5">
            {trending.map((m, i) => (
              <TrendingMarketPill key={m.id} market={m} rank={i} />
            ))}
          </div>
        ) : (
          <div className="flex w-max shrink-0 flex-nowrap motion-safe:animate-marquee-hot-markets will-change-transform hover:[animation-play-state:paused]">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex shrink-0 gap-2">
                {trending.map((m, i) => (
                  <TrendingMarketPill
                    key={`${dup}-${m.id}`}
                    market={m}
                    rank={i}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
