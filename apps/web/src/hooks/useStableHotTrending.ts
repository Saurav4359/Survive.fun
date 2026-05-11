import type { Market } from "@survivefun/types";
import { useCallback, useEffect, useRef, useState } from "react";

import { totalPoolLamports } from "@/utils/marketRisk";

export const HOT_TRENDING_RESORT_INTERVAL_MS = 30_000;

const MAX_ITEMS = 12;

function sortAndSlice(markets: Market[]): Market[] {
  return [...markets]
    .sort((a, b) => totalPoolLamports(b) - totalPoolLamports(a))
    .slice(0, MAX_ITEMS);
}

/** Stable DOM order between resort ticks — pool ticks merge in place; full sort on interval only. */
export function useStableHotTrending(markets: Market[]): Market[] {
  const [trending, setTrending] = useState<Market[]>([]);
  const marketsRef = useRef(markets);
  marketsRef.current = markets;

  const fullResort = useCallback(() => {
    setTrending(sortAndSlice(marketsRef.current));
  }, []);

  useEffect(() => {
    if (markets.length === 0) {
      setTrending([]);
      return;
    }
    setTrending((prev) => {
      if (prev.length === 0) return sortAndSlice(markets);

      const map = new Map(markets.map((m) => [m.id, m]));
      const kept: Market[] = [];
      for (const p of prev) {
        const next = map.get(p.id);
        if (next) kept.push(next);
      }
      const keptIds = new Set(kept.map((m) => m.id));
      const newcomers = markets
        .filter((m) => !keptIds.has(m.id))
        .sort((a, b) => totalPoolLamports(b) - totalPoolLamports(a));
      return [...kept, ...newcomers].slice(0, MAX_ITEMS);
    });
  }, [markets]);

  useEffect(() => {
    const id = window.setInterval(fullResort, HOT_TRENDING_RESORT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fullResort]);

  return trending;
}
