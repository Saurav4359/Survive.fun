"use client";

import type { Market } from "@survivefun/types";
import { useEffect, useState } from "react";

import { isActiveMarketStillOpen } from "@/utils/marketListing";

function sameMarketOrder(a: Market[], b: Market[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]!.id !== b[i]!.id) return false;
  }
  return true;
}

/**
 * Drops `active` markets once `expiresAt` passes so grids update without waiting
 * for the next REST refetch. Re-renders only when the visible list actually changes.
 */
export function useFilteredOpenActiveMarkets(markets: Market[]): Market[] {
  const [out, setOut] = useState(() =>
    markets.filter((m) => isActiveMarketStillOpen(m)),
  );

  useEffect(() => {
    setOut(markets.filter((m) => isActiveMarketStillOpen(m)));
  }, [markets]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = markets.filter((m) => isActiveMarketStillOpen(m));
      setOut((prev) => (sameMarketOrder(prev, next) ? prev : next));
    }, 1000);
    return () => window.clearInterval(id);
  }, [markets]);

  return out;
}
