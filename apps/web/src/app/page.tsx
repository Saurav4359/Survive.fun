"use client";

import type { ApiResponse, Market } from "@survivefun/types";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { motion } from "framer-motion";
import { ArrowRight, Inbox } from "lucide-react";
import { useState, type CSSProperties } from "react";

import { EmptyState } from "@/components/EmptyState";
import { LiveFeed } from "@/components/LiveFeed";
import { MarketCard } from "@/components/MarketCard";
import { useToast } from "@/components/ToastProvider";
import { MarketCardSkeleton } from "@/components/ui/skeletons";
import { fetchActiveMarkets, marketsQueryKey } from "@/hooks/useMarkets";
import { fetchStats, statsQueryKey } from "@/hooks/useStats";
import { API_URL, MARKET_DURATIONS } from "@/utils/constants";
import { formatUSDC } from "@/utils/format";

const DURATION_TABS: { label: string; seconds: (typeof MARKET_DURATIONS)[number] }[] =
  [
    { label: "1H", seconds: MARKET_DURATIONS[0] },
    { label: "6H", seconds: MARKET_DURATIONS[1] },
    { label: "24H", seconds: MARKET_DURATIONS[2] },
  ];

const sectionEase = { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const };

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.08 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } },
};

const HERO_GRID_STYLE: CSSProperties = {
  backgroundImage: `
    linear-gradient(rgba(134, 240, 173, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(134, 240, 173, 0.06) 1px, transparent 1px)
  `,
  backgroundSize: "28px 28px",
};

function StatCellSkeleton() {
  return (
    <div className="bg-card px-4 py-4 sm:px-5 sm:py-5">
      <div className="h-3 w-24 animate-pulse rounded bg-border/80" />
      <div className="mt-3 h-7 w-20 animate-pulse rounded bg-border/80" />
    </div>
  );
}

export default function HomePage() {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const toast = useToast();

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

  const markets = marketsQuery.data ?? [];
  const marketsLoading = marketsQuery.isPending;
  const marketsError =
    marketsQuery.error instanceof Error ? marketsQuery.error : null;

  const stats = statsQuery.data;
  const statsLoading = statsQuery.isPending;
  const statsError =
    statsQuery.error instanceof Error ? statsQuery.error : null;

  const [tokenMint, setTokenMint] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number>(
    MARKET_DURATIONS[2],
  );
  const [createError, setCreateError] = useState<string | null>(null);

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
      const res = await fetch(`${API_URL}/v1/markets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenMint: mint,
          duration,
          walletAddress: publicKey.toBase58(),
        }),
      });
      const body = (await res.json()) as ApiResponse<Market>;
      if (!res.ok || !body.success) {
        const msg =
          !body.success ? body.error.message : `Create failed (${res.status})`;
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
        message: "It’s live — traders can start betting.",
      });
      void queryClient.invalidateQueries({ queryKey: marketsQueryKey });
      void queryClient.invalidateQueries({ queryKey: statsQueryKey });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Create failed";
      setCreateError(msg);
      toast({ variant: "error", title: "Couldn’t create market", message: msg });
    },
  });

  const statRows = [
    {
      label: "Active Markets",
      value: statsLoading ? "—" : String(stats?.activeMarkets ?? "—"),
    },
    {
      label: "Total Volume",
      value: statsLoading
        ? "—"
        : stats
          ? `${formatUSDC(Number.parseFloat(stats.totalBetVolumeUsdc))} USDC`
          : statsError
            ? "—"
            : "—",
    },
    {
      label: "Rugs (resolved)",
      value: statsLoading ? "—" : String(stats?.resolvedRugs ?? "—"),
    },
    {
      label: "Biggest payout",
      value: statsLoading
        ? "—"
        : stats?.largestPayoutUsdc != null
          ? formatUSDC(Number.parseFloat(stats.largestPayoutUsdc))
          : "—",
    },
  ];

  return (
    <div className="min-h-screen pb-16 pt-6 sm:pb-24 sm:pt-10">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={sectionEase}
        className="border-b-2 border-accent"
      >
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6 lg:px-12">
          <div>
            <p className="font-mono text-lg font-semibold tracking-tight text-accent-bright sm:text-xl">
              survive.fun
            </p>
            <p className="mt-1 max-w-md font-display text-sm text-fg-soft sm:text-base">
              Bet whether memecoins survive or rug
            </p>
          </div>
          <div className="flex shrink-0 justify-start sm:justify-end">
            <WalletConnectButton className="!rounded-lg !border !border-accent !bg-accent !font-mono !text-xs !font-bold !uppercase !tracking-widest !text-ink transition-colors hover:!border-accent-bright hover:!bg-transparent hover:!text-accent-bright" />
          </div>
        </div>
      </motion.header>

      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-12">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...sectionEase, delay: 0.05 }}
          aria-label="Platform statistics"
          className="mt-8 grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4"
        >
          {statsLoading
            ? Array.from({ length: 4 }).map((_, i) => <StatCellSkeleton key={i} />)
            : statRows.map((row) => (
                <div
                  key={row.label}
                  className="bg-card px-4 py-4 sm:px-5 sm:py-5"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                    {row.label}
                  </p>
                  <p className="mt-2 font-mono text-base font-semibold tabular-nums text-foreground sm:text-lg">
                    {row.value}
                  </p>
                </div>
              ))}
        </motion.section>

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8 xl:gap-10">
          <div className="min-w-0 space-y-10 lg:col-span-8">
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...sectionEase, delay: 0.1 }}
              aria-label="Create market"
              className="relative overflow-hidden rounded-lg border border-border bg-card"
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-90"
                style={HERO_GRID_STYLE}
                aria-hidden
              />
              <div className="relative z-[1] space-y-5 p-6 sm:p-8">
                <label className="block space-y-2">
                  <span className="block font-mono text-[10px] font-bold uppercase tracking-widest text-muted">
                    Token mint (SPL)
                  </span>
                  <input
                    type="text"
                    value={tokenMint}
                    onChange={(e) => setTokenMint(e.target.value)}
                    placeholder="e.g. So111… from Solscan / Pump.fun mint"
                    className="w-full rounded-lg border border-border bg-surface px-4 py-4 font-mono text-sm text-foreground placeholder:text-muted transition-all duration-200 focus:border-border-glow focus:outline-none focus:ring-1 focus:ring-accent focus:shadow-glow-sm sm:text-base"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="font-mono text-[11px] leading-relaxed text-muted">
                    Paste the token’s{" "}
                    <span className="text-fg-soft">mint address</span> (base58,
                    32–44 chars) — the coin you’re betting on, not your wallet.
                  </p>
                </label>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Market duration"
                  >
                    {DURATION_TABS.map(({ label, seconds }) => {
                      const active = durationSeconds === seconds;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setDurationSeconds(seconds)}
                          className={
                            active
                              ? "rounded-lg border border-border-glow bg-accent/15 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-accent-bright shadow-glow-sm"
                              : "rounded-lg border border-border bg-surface px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-muted transition-colors duration-200 hover:border-accent/40 hover:text-fg-soft"
                          }
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={
                      createMarket.isPending ||
                      !publicKey ||
                      !tokenMint.trim()
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
                        toast({
                          variant: "error",
                          title: "Missing mint",
                          message:
                            "Paste the SPL mint for the coin you want a market for.",
                        });
                        return;
                      }
                      void createMarket.mutateAsync({
                        mint,
                        duration: durationSeconds,
                      });
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-ink shadow-glow-sm transition-all duration-200 hover:border-accent-bright hover:bg-transparent hover:text-accent-bright hover:shadow-none disabled:opacity-50"
                  >
                    Create Market
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                {createError ? (
                  <p className="font-mono text-xs text-rug">{createError}</p>
                ) : null}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...sectionEase, delay: 0.14 }}
              aria-label="Active markets"
            >
              <div className="mb-5 flex items-end justify-between gap-3 border-b border-border pb-3">
                <h2 className="font-display text-lg font-bold uppercase tracking-widest text-foreground">
                  Active markets
                </h2>
                {marketsError ? (
                  <span className="font-mono text-xs text-rug">Load error</span>
                ) : null}
              </div>

              {marketsLoading ? (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <MarketCardSkeleton key={i} />
                  ))}
                </div>
              ) : markets.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="No active markets"
                  description="Create one with the form above, or seed demo data from the API when you’re developing locally."
                  action={{ label: "Scroll to create", onClick: () => {
                    document
                      .querySelector('[aria-label="Create market"]')
                      ?.scrollIntoView({ behavior: "smooth" });
                  } }}
                />
              ) : (
                <motion.div
                  className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                >
                  {markets.map((market) => (
                    <motion.div key={market.id} variants={staggerItem}>
                      <MarketCard market={market} />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.section>
          </div>

          <motion.aside
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...sectionEase, delay: 0.18 }}
            className="lg:col-span-4"
            aria-label="Live bets"
          >
            <div className="lg:sticky lg:top-8">
              <LiveFeed />
            </div>
          </motion.aside>
        </div>
      </div>
    </div>
  );
}
