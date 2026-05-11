"use client";

import type { ApiResponse, Market, MarketListPage } from "@survivefun/types";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, Inbox, Skull } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { CountUp } from "@/components/CountUp";
import { EmptyState } from "@/components/EmptyState";
import { LiveFeed } from "@/components/LiveFeed";
import { MarketCard } from "@/components/MarketCard";
import { useToast } from "@/components/ToastProvider";
import { useFilteredOpenActiveMarkets } from "@/hooks/useFilteredOpenActiveMarkets";
import { marketsQueryKey } from "@/hooks/useMarkets";
import { fetchStats, statsQueryKey } from "@/hooks/useStats";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useMarketSearchStore } from "@/stores/marketSearchStore";
import { apiV1Url, MARKET_DURATIONS } from "@/utils/constants";
import { formatSolBetLine, parsePoolLamports } from "@/utils/format";
import { isActiveMarketStillOpen } from "@/utils/marketListing";
import { totalPoolLamports } from "@/utils/marketRisk";

/**
 * WebGL has no Node canvas — this component must hydrate on the client only.
 * That is unrelated to “dev vs prod”: `next build` + `next start` still ship an optimized bundle.
 * Code-splitting keeps three.js out of the initial JS parse; prefetch below warms the chunk on idle.
 */
const ParticleField = dynamic(
  () =>
    import("@/components/three/ParticleField").then((m) => m.ParticleField),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 bg-bg" aria-hidden />
    ),
  },
);

const DURATION_TABS: {
  label: string;
  seconds: (typeof MARKET_DURATIONS)[number];
}[] = [
  { label: "1H", seconds: MARKET_DURATIONS[0] },
  { label: "6H", seconds: MARKET_DURATIONS[1] },
  { label: "24H", seconds: MARKET_DURATIONS[2] },
];

type FilterKey = "hot" | "high-risk" | "likely" | "new" | "watch";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "hot", label: "🔥 Hot" },
  { key: "high-risk", label: "💀 High Risk" },
  { key: "likely", label: "✅ Likely Survive" },
  { key: "new", label: "⚡ New" },
  { key: "watch", label: "⭐ Watch" },
];

function applyFilter(
  markets: Market[],
  filter: FilterKey,
  watchIds: string[],
): Market[] {
  switch (filter) {
    case "hot":
      return [...markets].sort(
        (a, b) => totalPoolLamports(b) - totalPoolLamports(a),
      );
    case "high-risk":
      return [...markets].sort((a, b) => {
        const lqA = Number.parseFloat(a.openLiquidity ?? "0") || 0;
        const lqB = Number.parseFloat(b.openLiquidity ?? "0") || 0;
        return lqA - lqB;
      });
    case "likely":
      return [...markets].sort((a, b) => {
        const sA = Number(parsePoolLamports(a.survivePool));
        const sB = Number(parsePoolLamports(b.survivePool));
        return sB - sA;
      });
    case "new":
      return [...markets].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    case "watch": {
      if (watchIds.length === 0) return [];
      const starred = new Set(watchIds);
      return markets.filter((m) => starred.has(m.id));
    }
  }
}

export default function HomePage() {
  useEffect(() => {
    const prefetch = () =>
      void import("@/components/three/ParticleField");
    const ric = window.requestIdleCallback?.(prefetch, { timeout: 1200 });
    if (ric != null) {
      return () => window.cancelIdleCallback?.(ric);
    }
    const t = window.setTimeout(prefetch, 400);
    return () => window.clearTimeout(t);
  }, []);

  const wallet = useWallet();
  const { publicKey } = wallet;
  const queryClient = useQueryClient();
  const toast = useToast();
  const search = useMarketSearchStore((s) => s.query);
  const setSearchQuery = useMarketSearchStore((s) => s.setQuery);
  const { ids: watchIds } = useWatchlist();

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

  const statsQuery = useQuery({
    queryKey: statsQueryKey,
    queryFn: fetchStats,
    staleTime: 20_000,
  });

  const markets = useFilteredOpenActiveMarkets(marketsQuery.data ?? []);
  const marketsLoading = marketsQuery.isPending;
  const marketsError =
    marketsQuery.error instanceof Error ? marketsQuery.error : null;
  const stats = statsQuery.data;
  const statsLoading = statsQuery.isPending;
  const statsError = statsQuery.error instanceof Error ? statsQuery.error : null;

  const [tokenMint, setTokenMint] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number>(
    MARKET_DURATIONS[2],
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("hot");

  const trimmedMint = tokenMint.trim();
  const duplicateMarketQuery = useQuery({
    queryKey: ["existing-market", trimmedMint, durationSeconds],
    enabled: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmedMint),
    staleTime: 10_000,
    queryFn: async () => {
      const u = new URL(apiV1Url("/markets"));
      u.searchParams.set("tokenMint", trimmedMint);
      u.searchParams.set("durationSeconds", String(durationSeconds));
      u.searchParams.set("limit", "1");
      u.searchParams.set("status", "active");
      const r = await fetch(u.toString());
      const body = (await r.json()) as ApiResponse<MarketListPage>;
      if (!r.ok || !body.success) return null;
      return body.data.items[0] ?? null;
    },
  });
  const existingMarket = duplicateMarketQuery.data;

  const filtered = useMemo(() => {
    const base = applyFilter(markets, filter, watchIds);
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((m) => {
      const name = (m.tokenName ?? "").toLowerCase();
      const ticker = (m.tokenTicker ?? "").toLowerCase();
      const mint = m.tokenMint.toLowerCase();
      return name.includes(q) || ticker.includes(q) || mint.includes(q);
    });
  }, [markets, filter, search, watchIds]);

  const emptyGridContent = (() => {
    if (markets.length === 0) {
      return {
        title: "No active markets yet",
        description: "Create the first market with the form above.",
        action: {
          label: "Create a market",
          onClick: () =>
            document
              .getElementById("create-market")
              ?.scrollIntoView({ behavior: "smooth" }),
        },
      } as const;
    }
    const q = search.trim();
    if (q) {
      return {
        title: "No matches for your search",
        description: `Nothing matches “${q}”. Clear the search bar (top) to see all ${markets.length} active market${markets.length === 1 ? "" : "s"}.`,
        action: {
          label: "Clear search",
          onClick: () => setSearchQuery(""),
        },
      } as const;
    }
    if (filter === "watch") {
      return {
        title: "No starred markets",
        description:
          "Open any market and tap Watch — it will show up here on the home page.",
        action: {
          label: "Browse Hot",
          onClick: () => setFilter("hot"),
        },
      } as const;
    }
    return {
      title: "No markets in this filter",
      description:
        "Try another filter tab or create a new market with the form above.",
      action: {
        label: "Create a market",
        onClick: () =>
          document
            .getElementById("create-market")
            ?.scrollIntoView({ behavior: "smooth" }),
      },
    } as const;
  })();

  const createMarket = useMutation({
    mutationFn: async ({
      mint,
      duration,
    }: {
      mint: string;
      duration: number;
    }): Promise<Market> => {
      if (!publicKey) {
        throw new Error("Connect a wallet to create a market");
      }
      const res = await fetch(apiV1Url("/markets"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenMint: mint,
          duration,
          walletAddress: publicKey.toBase58(),
          currency: "sol",
        }),
      });
      const body = (await res.json()) as ApiResponse<Market>;
      if (!res.ok || !body.success) {
        const msg = !body.success
          ? body.error.message
          : `Create failed (${res.status})`;
        throw new Error(msg);
      }
      return body.data;
    },
    onSuccess: () => {
      setCreateError(null);
      setTokenMint("");
      toast({
        variant: "success",
        title: "Market created",
        message: "Live now — traders can start betting.",
      });
      void queryClient.invalidateQueries({ queryKey: marketsQueryKey });
      void queryClient.invalidateQueries({ queryKey: statsQueryKey });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Create failed";
      setCreateError(msg);
      toast({
        variant: "error",
        title: "Couldn't create market",
        message: msg,
      });
    },
  });

  /** API fields still named `*Usdc`; values are lamports for SOL collateral. */
  const totalVolLamports = stats
    ? Number.parseFloat(stats.totalBetVolumeUsdc) || 0
    : 0;
  const biggestPayoutLamports =
    stats?.largestPayoutUsdc != null
      ? Number.parseFloat(stats.largestPayoutUsdc) || 0
      : 0;

  return (
    <div className="min-h-full">
      {/* HERO with three.js particle field */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 -z-0">
          <ParticleField />
        </div>

        <div className="relative z-[1] mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.32em] text-accent">
              Survive · Pump.fun prediction market
            </p>
            <h1 className="mt-2.5 font-display text-3xl font-bold leading-[1.05] tracking-tight text-white sm:mt-3 sm:text-4xl lg:text-5xl">
              RUG OR <span className="text-accent">SURVIVE</span>?
            </h1>
            <p className="mt-2.5 max-w-xl font-mono text-xs leading-snug text-fg-soft sm:mt-3 sm:text-sm">
              Bet on whether memecoins{" "}
              <span className="font-bold text-survive">survive</span> or{" "}
              <span className="font-bold text-rug">rug</span>. Pooled odds, live
              tape, on-chain settlement.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-[1440px] px-4 py-3 sm:px-6 lg:px-10">
        {/* CREATE MARKET */}
        <section
          id="create-market"
          aria-label="Create market"
          className="border border-border bg-card"
        >
          <div className="border-b border-border px-3 py-1.5 sm:px-3.5 sm:py-2">
            <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-white sm:text-xs">
              Create a market
            </h2>
            <p className="mt-0.5 hidden font-mono text-[10px] leading-tight text-fg-muted sm:block">
              Paste a Pump.fun mint, pick duration, create.
            </p>
          </div>
          <div className="space-y-2 p-3 sm:p-3.5">
            <div className="relative">
              <input
                type="text"
                value={tokenMint}
                onChange={(e) => setTokenMint(e.target.value)}
                placeholder="Paste any Pump.fun token mint..."
                className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-[13px] text-white placeholder:text-fg-muted transition-shadow focus:border-accent focus:outline-none focus:shadow-glow-sm sm:text-sm"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {existingMarket ? (
              <div className="rounded-md border border-accent/35 bg-bg px-3 py-2.5">
                <p className="font-mono text-xs font-bold text-white sm:text-sm">
                  Market already exists
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-fg-muted sm:text-[11px]">
                  A market for this token and duration is already live.
                </p>
                <Link
                  href={`/market/${existingMarket.id}`}
                  className="mt-2 inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-accent transition-colors hover:text-white sm:text-[11px]"
                >
                  View market →
                </Link>
              </div>
            ) : null}

            {!publicKey &&
            /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmedMint) &&
            !existingMarket ? (
              <p className="font-mono text-[11px] text-fg-soft">
                Connect your wallet (top right) to enable{" "}
                <span className="text-accent">Create Market</span> — creation is
                on-chain.
              </p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div
                className="flex flex-wrap gap-1"
                role="group"
                aria-label="Market duration"
              >
                {DURATION_TABS.map(({ label, seconds }) => {
                  const active = durationSeconds === seconds;
                  return (
                    <motion.button
                      key={label}
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setDurationSeconds(seconds)}
                      className={
                        active
                          ? "rounded-md bg-accent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink"
                          : "rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-fg-soft transition-colors hover:border-accent hover:text-accent"
                      }
                    >
                      {label}
                    </motion.button>
                  );
                })}
              </div>

              <motion.button
                type="button"
                whileHover={
                  !createMarket.isPending && publicKey && tokenMint.trim()
                    ? { scale: 1.02 }
                    : undefined
                }
                whileTap={{ scale: 0.97 }}
                disabled={
                  createMarket.isPending ||
                  !publicKey ||
                  !tokenMint.trim() ||
                  Boolean(existingMarket)
                }
                onClick={() => {
                  setCreateError(null);
                  const mint = tokenMint.trim();
                  if (!publicKey) {
                    toast({
                      variant: "error",
                      title: "Wallet required",
                      message: "Connect a wallet to create a market.",
                    });
                    return;
                  }
                  if (!mint) {
                    setCreateError("Paste the token mint address first.");
                    return;
                  }
                  if (existingMarket) {
                    return;
                  }
                  void createMarket.mutateAsync({
                    mint,
                    duration: durationSeconds,
                  });
                }}
                className="group inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 sm:px-3.5 sm:text-[11px]"
              >
                {createMarket.isPending ? "Creating…" : "Create Market"}
                <motion.span
                  initial={false}
                  className="inline-flex"
                  whileHover={{ x: 3 }}
                  transition={{ duration: 0.2 }}
                >
                  <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden />
                </motion.span>
              </motion.button>
            </div>
            {createError ? (
              <p className="font-mono text-xs text-rug">{createError}</p>
            ) : null}
          </div>
        </section>

        {/* STATS BAR — compact row */}
        <section
          aria-label="Platform statistics"
          className="mt-2.5 grid grid-cols-2 gap-1 sm:gap-1.5 lg:grid-cols-4"
        >
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={`stats-skeleton-${i}`}
                className="h-[48px] animate-pulse border border-border bg-card"
              />
            ))
          ) : statsError ? (
            <div className="col-span-full border border-rug/40 bg-card px-3 py-3">
              <p className="font-mono text-xs text-rug">
                Failed to load stats: {statsError.message}
              </p>
            </div>
          ) : (
            [
              {
                label: "Active Markets",
                value: stats?.activeMarkets ?? 0,
                format: (n: number) => `${Math.round(n)}`,
              },
              {
                label: "Total Volume",
                value: totalVolLamports / 1e9,
                format: (n: number) => formatSolBetLine(n),
              },
              {
                label: "Rugs Caught",
                value: stats?.resolvedRugs ?? 0,
                format: (n: number) => `${Math.round(n)}`,
              },
              {
                label: "Biggest Win",
                value: biggestPayoutLamports / 1e9,
                format: (n: number) => formatSolBetLine(n),
              },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
                className="border border-border border-t border-t-accent bg-card px-2 py-1.5"
              >
                <p className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-fg-muted sm:text-[9px]">
                  {stat.label}
                </p>
                <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-accent sm:text-base">
                  <CountUp
                    to={stat.value}
                    format={stat.format}
                    delay={0.2 + i * 0.08}
                  />
                </p>
              </motion.div>
            ))
          )}
        </section>

        {/* MARKETS GRID + LIVE FEED */}
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-4">
          <section className="min-w-0 lg:col-span-9" aria-label="Active markets">
            {/* Filter tabs */}
            <div className="flex flex-wrap gap-0.5 border-b border-border">
              {FILTERS.map(({ key, label }) => {
                const active = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className="relative px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors sm:px-2.5 sm:text-[11px]"
                  >
                    <span className={active ? "text-accent" : "text-fg-soft hover:text-white"}>
                      {label}
                    </span>
                    {active ? (
                      <motion.span
                        layoutId="filter-underline"
                        className="absolute -bottom-px left-0 right-0 h-0.5 bg-accent"
                        transition={{ duration: 0.28, ease: "easeOut" }}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-2">
              {search.trim() ? (
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-fg-muted">
                  Search:{" "}
                  <span className="text-accent">{search.trim()}</span>
                  <span className="text-fg-soft">
                    {" "}
                    · {filtered.length} of {markets.length} shown
                  </span>
                </p>
              ) : null}
              {marketsLoading ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3 xl:gap-5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-[260px] animate-pulse border border-border bg-card"
                    />
                  ))}
                </div>
              ) : marketsError ? (
                <EmptyState
                  icon={Inbox}
                  title="Failed to load markets"
                  description={marketsError.message}
                  action={{
                    label: "Retry",
                    onClick: () => void marketsQuery.refetch(),
                  }}
                />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title={emptyGridContent.title}
                  description={emptyGridContent.description}
                  action={emptyGridContent.action}
                />
              ) : (
                <motion.div
                  initial="hidden"
                  animate="show"
                  variants={{
                    hidden: {},
                    show: { transition: { staggerChildren: 0.06 } },
                  }}
                  className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3 xl:gap-5"
                >
                  {filtered.map((market) => (
                    <MarketCard key={market.id} market={market} />
                  ))}
                </motion.div>
              )}
            </div>
          </section>

          <aside className="lg:col-span-3" aria-label="Live bets">
            <div className="sticky top-20">
              <LiveFeed />
            </div>
          </aside>
        </div>

        <footer className="mt-10 flex items-center justify-between border-t border-border pt-5 font-mono text-[10px] uppercase tracking-[0.15em] text-fg-muted">
          <span className="flex items-center gap-1.5">
            <Skull className="h-3 w-3" />
            survive.fun
          </span>
          <span>v0.1 · devnet</span>
        </footer>
      </div>
    </div>
  );
}
