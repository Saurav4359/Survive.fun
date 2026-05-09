"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "survivefun-watchlist-v1";
/** Same-tab sync — `storage` only fires across tabs. */
const CHANGE_EVENT = "survivefun-watchlist-change";

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function useWatchlist() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(readIds());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY || e.key === null) setIds(readIds());
    };
    const onLocalChange = () => setIds(readIds());
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onLocalChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onLocalChange);
    };
  }, []);

  const toggle = useCallback((marketId: string) => {
    setIds((prev) => {
      const base = prev.length > 0 ? prev : readIds();
      const set = new Set(base);
      if (set.has(marketId)) set.delete(marketId);
      else set.add(marketId);
      const next = [...set];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      queueMicrotask(() => {
        window.dispatchEvent(new Event(CHANGE_EVENT));
      });
      return next;
    });
  }, []);

  const has = useCallback(
    (marketId: string) => ids.includes(marketId),
    [ids],
  );

  return { ids, toggle, has };
}
