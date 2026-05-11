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
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted sm:left-3 sm:h-4 sm:w-4"
        aria-hidden
      />
      <input
        id="topbar-market-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tokens..."
        className="w-full rounded-md border border-border bg-bg py-2 pl-9 pr-3 font-mono text-[12px] text-white placeholder:text-fg-muted transition-shadow focus:border-accent focus:outline-none focus:shadow-glow-sm sm:py-2.5 sm:pl-10 sm:text-sm"
        autoComplete="off"
      />
    </div>
  );
}
