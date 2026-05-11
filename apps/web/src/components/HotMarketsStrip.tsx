"use client";

import type { ApiResponse, Market, MarketListPage } from "@survivefun/types";
import { useQuery } from "@tanstack/react-query";
import { useReducedMotion } from "framer-motion";
import { Flame } from "lucide-react";
import { useMemo } from "react";

import { TokenThumb } from "@/components/TokenThumb";
import { marketsQueryKey } from "@/hooks/useMarkets";
import { useFilteredOpenActiveMarkets } from "@/hooks/useFilteredOpenActiveMarkets";
import { apiV1Url } from "@/utils/constants";
import { formatSolBetLine } from "@/utils/format";
import { isActiveMarketStillOpen } from "@/utils/marketListing";
import { totalPoolLamports } from "@/utils/marketRisk";

function TrendingMarketPill({ market: m }: { market: Market }) {
  return (
    <div
      className="pointer-events-none inline-flex w-fit max-w-[200px] shrink-0 select-none items-center gap-2 rounded border border-border bg-card px-2 py-1"
    >
      <TokenThumb
        mint={m.tokenMint}
        ticker={m.tokenTicker ?? "?"}
        size={24}
      />
      <div className="min-w-0 leading-tight">
        <p className="truncate font-mono text-[11px] font-bold text-white">
          ${m.tokenTicker ?? "—"}
        </p>
        <p className="truncate font-mono text-[9px] text-fg-muted">
          Pool {formatSolBetLine(totalPoolLamports(m) / 1e9)}
        </p>
      </div>
    </div>
  );
}

export function HotMarketsStrip() {
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

  return (
    <div className="w-full min-w-0 shrink-0 border-b border-border bg-surface py-[2px]">
      <div
        className="mx-auto flex w-full min-w-0 max-w-[1440px] items-stretch gap-3"
        aria-label="Trending markets"
      >
        <div className="flex shrink-0 items-center gap-1 border-r border-border px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-accent sm:px-5 lg:px-8">
          <Flame className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" aria-hidden />
          <span className="hidden sm:inline">Hot Markets</span>
          <span className="sm:hidden">Hot</span>
        </div>
        <div
          className="survive-hot-marquee-viewport py-1 pr-3 sm:pr-5 lg:pr-8"
        >
          {reduceMotion ? (
            <div className="hide-scrollbar flex gap-2.5 overflow-x-auto pr-2.5">
              {trending.map((m) => (
                <TrendingMarketPill key={m.id} market={m} />
              ))}
            </div>
          ) : (
            <div className="survive-hot-marquee-track">
              {[0, 1].map((dup) => (
                <div
                  key={dup}
                  className="flex shrink-0 gap-2.5 pr-2.5"
                  aria-hidden={dup === 1}
                >
                  {trending.map((m) => (
                    <TrendingMarketPill
                      key={`${dup}-${m.id}`}
                      market={m}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
