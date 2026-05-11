"use client";

import { Search } from "lucide-react";

import { useMarketSearchStore } from "@/stores/marketSearchStore";

export function MarketSearchBar() {
  const query = useMarketSearchStore((s) => s.query);
  const setQuery = useMarketSearchStore((s) => s.setQuery);

  return (
    <div className="relative min-h-0 min-w-0 flex-1">
      <label htmlFor="topbar-market-search" className="sr-only">
        Search tokens
      </label>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-[15.4px] w-[15.4px] -translate-y-1/2 text-fg-soft sm:left-3 sm:h-[17.6px] sm:w-[17.6px]"
        aria-hidden
      />
      <input
        id="topbar-market-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name, ticker, or mint…"
        className="w-full rounded-md border border-neutral-600 bg-surface py-2 pl-9 pr-3 font-mono text-[13.2px] text-white caret-accent placeholder:text-fg-soft placeholder:opacity-100 transition-shadow focus:border-accent focus:outline-none focus:shadow-glow-sm sm:py-2.5 sm:pl-10 sm:text-[15.4px]"
        autoComplete="off"
      />
    </div>
  );
}
