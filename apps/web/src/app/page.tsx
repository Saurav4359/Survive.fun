"use client";

import type { ApiResponse, Market } from "@survivefun/types";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, Flame, Inbox, Skull } from "lucide-react";
import { useMemo, useState } from "react";

import { CountUp } from "@/components/CountUp";
import { EmptyState } from "@/components/EmptyState";
import { LiveFeed } from "@/components/LiveFeed";
import { MarketCard } from "@/components/MarketCard";
import { ParticleField } from "@/components/three/ParticleField";
import { useToast } from "@/components/ToastProvider";
import { fetchActiveMarkets, marketsQueryKey } from "@/hooks/useMarkets";
import { fetchStats, statsQueryKey } from "@/hooks/useStats";
import { useMarketSearchStore } from "@/stores/marketSearchStore";
import { apiV1Url, MARKET_DURATIONS } from "@/utils/constants";
import { formatPool, formatUSDC } from "@/utils/format";
import { createMarket as createMarketOnChain } from "@/utils/transactions";
import { totalPoolUsdc } from "@/utils/marketRisk";

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

function applyFilter(markets: Market[], filter: FilterKey): Market[] {
  switch (filter) {
    case "hot":
      return [...markets].sort(
        (a, b) => totalPoolUsdc(b) - totalPoolUsdc(a),
      );
    case "high-risk":
      return [...markets].sort((a, b) => {
        const lqA = Number.parseFloat(a.openLiquidity ?? "0") || 0;
        const lqB = Number.parseFloat(b.openLiquidity ?? "0") || 0;
        return lqA - lqB;
      });
    case "likely":
      return [...markets].sort((a, b) => {
        const sA = Number.parseFloat(a.survivePool) || 0;
        const sB = Number.parseFloat(b.survivePool) || 0;
        return sB - sA;
      });
    case "new":
      return [...markets].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    case "watch":
      return markets;
  }
}

export default function HomePage() {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const queryClient = useQueryClient();
  const toast = useToast();
  const search = useMarketSearchStore((s) => s.query);

  const marketsQuery = useQuery({
    queryKey: marketsQueryKey,
    queryFn: fetchActiveMarkets,
    staleTime: 15_000,
  });

  const statsQuery = useQuery({
    queryKey: statsQueryKey,
    queryFn: fetchStats,
    staleTime: 20_000,
  });

  const markets = useMemo(
    () => marketsQuery.data ?? [],
    [marketsQuery.data],
  );
  const marketsLoading = marketsQuery.isPending;
  const stats = statsQuery.data;

  const [tokenMint, setTokenMint] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number>(
    MARKET_DURATIONS[2],
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("hot");

  const trending = useMemo(() => {
    return [...markets]
      .sort((a, b) => totalPoolUsdc(b) - totalPoolUsdc(a))
      .slice(0, 12);
  }, [markets]);

  const filtered = useMemo(() => {
    const base = applyFilter(markets, filter);
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((m) => {
      const name = (m.tokenName ?? "").toLowerCase();
      const ticker = (m.tokenTicker ?? "").toLowerCase();
      const mint = m.tokenMint.toLowerCase();
      return name.includes(q) || ticker.includes(q) || mint.includes(q);
    });
  }, [markets, filter, search]);

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
      const createMarketTxSignature = await createMarketOnChain(
        wallet,
        mint,
        duration,
      );
      const res = await fetch(apiV1Url("/markets"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenMint: mint,
          duration,
          walletAddress: publicKey.toBase58(),
          createMarketTxSignature,
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

  const totalVol = stats
    ? Number.parseFloat(stats.totalBetVolumeUsdc) || 0
    : 0;
  const biggest =
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

        <div className="relative z-[1] mx-auto max-w-[1440px] px-4 py-12 sm:px-6 sm:py-16 lg:px-10 lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.32em] text-accent">
              Survive · Pump.fun prediction market
            </p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              RUG OR <span className="text-accent">SURVIVE</span>?
            </h1>
            <p className="mt-4 max-w-xl font-mono text-sm leading-relaxed text-fg-soft sm:text-base">
              Bet on whether memecoins{" "}
              <span className="font-bold text-survive">survive</span> or{" "}
              <span className="font-bold text-rug">rug</span>. Pooled odds, live
              tape, on-chain settlement.
            </p>
          </motion.div>
        </div>
      </section>

      {/* TRENDING BAR (horizontal scroll) */}
      {trending.length > 0 ? (
        <section
          aria-label="Trending markets"
          className="border-b border-border bg-bg"
        >
          <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
              <Flame className="h-3.5 w-3.5" />
              Hot Markets
            </span>
            <div className="hide-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
              {trending.map((m, i) => (
                <a
                  key={m.id}
                  href={`/market/${m.id}`}
                  className="flex min-w-[200px] shrink-0 items-center gap-2.5 rounded-md border border-border bg-card px-3 py-1.5 transition-colors hover:border-accent"
                >
                  <span className="w-5 font-mono text-[10px] font-bold tabular-nums text-fg-muted">
                    {i + 1}
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
                      Pool {formatPool(totalPoolUsdc(m))} USDC
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-10">
        {/* CREATE MARKET */}
        <section
          id="create-market"
          aria-label="Create market"
          className="border border-border bg-card"
        >
          <div className="border-b border-border px-5 py-3">
            <h2 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-white">
              Create a market
            </h2>
            <p className="mt-1 font-mono text-[11px] text-fg-muted">
              Paste any Pump.fun token mint. Pick a duration. Ship it.
            </p>
          </div>
          <div className="space-y-4 p-5">
            <div className="relative">
              <input
                type="text"
                value={tokenMint}
                onChange={(e) => setTokenMint(e.target.value)}
                placeholder="Paste any Pump.fun token mint..."
                className="w-full rounded-md border border-border bg-bg px-4 py-3.5 font-mono text-sm text-white placeholder:text-fg-muted transition-shadow focus:border-accent focus:outline-none focus:shadow-glow-sm"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div
                className="flex flex-wrap gap-1.5"
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
                          ? "rounded-md bg-accent px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink"
                          : "rounded-md border border-border bg-bg px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-fg-soft transition-colors hover:border-accent hover:text-accent"
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
                  createMarket.isPending || !publicKey || !tokenMint.trim()
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
                  void createMarket.mutateAsync({
                    mint,
                    duration: durationSeconds,
                  });
                }}
                className="group inline-flex items-center justify-center gap-2 rounded-md bg-accent px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {createMarket.isPending ? "Creating…" : "Create Market"}
                <motion.span
                  initial={false}
                  className="inline-flex"
                  whileHover={{ x: 3 }}
                  transition={{ duration: 0.2 }}
                >
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </motion.span>
              </motion.button>
            </div>
            {createError ? (
              <p className="font-mono text-xs text-rug">{createError}</p>
            ) : null}
          </div>
        </section>

        {/* STATS BAR */}
        <section
          aria-label="Platform statistics"
          className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        >
          {[
            {
              label: "Active Markets",
              value: stats?.activeMarkets ?? 0,
              format: (n: number) => `${Math.round(n)}`,
            },
            {
              label: "Total Volume",
              value: totalVol,
              format: (n: number) => formatUSDC(n),
            },
            {
              label: "Rugs Caught",
              value: stats?.resolvedRugs ?? 0,
              format: (n: number) => `${Math.round(n)}`,
            },
            {
              label: "Biggest Win",
              value: biggest,
              format: (n: number) => formatUSDC(n),
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
              className="border border-border border-t-2 border-t-accent bg-card px-4 py-4"
            >
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                {stat.label}
              </p>
              <p className="mt-2 font-mono text-xl font-bold tabular-nums text-accent sm:text-2xl">
                <CountUp
                  to={stat.value}
                  format={stat.format}
                  delay={0.2 + i * 0.08}
                />
              </p>
            </motion.div>
          ))}
        </section>

        {/* MARKETS GRID + LIVE FEED */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-6">
          <section className="min-w-0 lg:col-span-9" aria-label="Active markets">
            {/* Filter tabs */}
            <div className="flex flex-wrap gap-1 border-b border-border">
              {FILTERS.map(({ key, label }) => {
                const active = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className="relative px-3 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.15em] transition-colors"
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

            <div className="mt-5">
              {marketsLoading ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-[320px] animate-pulse border border-border bg-card"
                    />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="No markets in this filter"
                  description="Try another filter or create a new market with the form above."
                  action={{
                    label: "Create a market",
                    onClick: () =>
                      document
                        .getElementById("create-market")
                        ?.scrollIntoView({ behavior: "smooth" }),
                  }}
                />
              ) : (
                <motion.div
                  initial="hidden"
                  animate="show"
                  variants={{
                    hidden: {},
                    show: { transition: { staggerChildren: 0.06 } },
                  }}
                  className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
                >
                  {filtered.map((market) => (
                    <motion.div
                      key={market.id}
                      variants={{
                        hidden: { opacity: 0, y: 18 },
                        show: { opacity: 1, y: 0 },
                      }}
                      transition={{ duration: 0.35 }}
                    >
                      <MarketCard market={market} />
                    </motion.div>
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

        <footer className="mt-16 flex items-center justify-between border-t border-border pt-6 font-mono text-[10px] uppercase tracking-[0.15em] text-fg-muted">
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
