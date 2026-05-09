"use client";

import type { Market, MarketStatus } from "@survivefun/types";
import { useQueryClient } from "@tanstack/react-query";

import { marketQueryKey } from "./useMarket";
import { marketResultQueryKey } from "./useMarketResult";
import { marketsQueryKey } from "./useMarkets";
import { myPayoutQueryKey } from "./useMyPayout";
import { userBetsQueryKey } from "./useUserBets";
import { useWebSocketEvents } from "./useWebSocket";

/**
 * Mounts a global socket listener that patches the active-markets list cache
 * (and any per-market caches that already exist) when `bet_placed`,
 * `pool_update`, or `market_resolved` events arrive. Stale-time still applies
 * for the underlying refetch — this just keeps the in-memory data fresh between
 * fetches so the markets grid, live feed, and stats bar stay in sync.
 *
 * Mount once near the top of any page that renders a markets list.
 */
export function useMarketsLiveSync(): void {
  const queryClient = useQueryClient();

  useWebSocketEvents({
    onPoolUpdate: (p) => {
      queryClient.setQueryData<Market[]>(marketsQueryKey, (prev) => {
        if (!prev) return prev;
        let mutated = false;
        const next = prev.map((m) => {
          if (m.id !== p.marketId) return m;
          if (m.survivePool === p.survivePool && m.rugPool === p.rugPool) {
            return m;
          }
          mutated = true;
          return { ...m, survivePool: p.survivePool, rugPool: p.rugPool };
        });
        return mutated ? next : prev;
      });

      queryClient.setQueryData<Market>(marketQueryKey(p.marketId), (prev) =>
        prev
          ? { ...prev, survivePool: p.survivePool, rugPool: p.rugPool }
          : prev,
      );
    },
    onBetPlaced: (b) => {
      queryClient.setQueryData<Market[]>(marketsQueryKey, (prev) => {
        if (!prev) return prev;
        let mutated = false;
        const next = prev.map((m) => {
          if (m.id !== b.marketId) return m;
          if (m.survivePool === b.survivePool && m.rugPool === b.rugPool) {
            return m;
          }
          mutated = true;
          return { ...m, survivePool: b.survivePool, rugPool: b.rugPool };
        });
        return mutated ? next : prev;
      });
    },
    onMarketResolved: (r) => {
      queryClient.setQueryData<Market[]>(marketsQueryKey, (prev) => {
        if (!prev) return prev;
        let mutated = false;
        const next = prev.map((m) => {
          if (m.id !== r.marketId) return m;
          mutated = true;
          const resolved: MarketStatus = "resolved";
          return {
            ...m,
            status: resolved,
            outcome: r.outcome,
            survivePool: r.survivePool,
            rugPool: r.rugPool,
            rugCondition:
              r.rugCondition !== undefined ? r.rugCondition : m.rugCondition,
          };
        });
        return mutated ? next : prev;
      });

      queryClient.setQueryData<Market>(marketQueryKey(r.marketId), (prev) => {
        if (!prev) return prev;
        const resolved: MarketStatus = "resolved";
        return {
          ...prev,
          status: resolved,
          outcome: r.outcome,
          survivePool: r.survivePool,
          rugPool: r.rugPool,
          rugCondition:
            r.rugCondition !== undefined ? r.rugCondition : prev.rugCondition,
        };
      });

      void queryClient.invalidateQueries({
        queryKey: marketResultQueryKey(r.marketId),
      });
    },
    onPayoutReady: (p) => {
      void queryClient.invalidateQueries({
        queryKey: myPayoutQueryKey(p.marketId, p.wallet),
      });
    },
    onPayoutClaimed: (p) => {
      void queryClient.invalidateQueries({
        queryKey: myPayoutQueryKey(p.marketId, p.wallet),
      });
      void queryClient.invalidateQueries({
        queryKey: userBetsQueryKey(p.wallet),
      });
      void queryClient.invalidateQueries({
        queryKey: marketResultQueryKey(p.marketId),
      });
    },
  });
}
