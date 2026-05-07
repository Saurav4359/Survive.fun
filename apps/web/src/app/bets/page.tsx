"use client";

import type { BetSide, BetWithMarket } from "@survivefun/types";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Inbox } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { WalletBalancePanel } from "@/components/WalletBalancePanel";
import { useToast } from "@/components/ToastProvider";
import { Timer } from "@/components/Timer";
import { BetsPageSkeleton } from "@/components/ui/skeletons";
import { userBetsQueryKey, useUserBets } from "@/hooks/useUserBets";
import { formatUSDC } from "@/utils/format";
import { claimPayout, getBetPDA, getMarketPDA } from "@/utils/transactions";

type BetFilter = "all" | "active" | "won" | "lost";

const FILTERS: { key: BetFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

function rowOutcome(b: BetWithMarket): "active" | "won" | "lost" {
  const m = b.market;
  if (m.status === "active") return "active";
  if (m.status !== "resolved" || !m.outcome) return "active";
  if (m.outcome === "survive" && b.side === "survive") return "won";
  if (m.outcome === "rug" && b.side === "rug") return "won";
  return "lost";
}

function matchesFilter(b: BetWithMarket, filter: BetFilter): boolean {
  const o = rowOutcome(b);
  if (filter === "all") return true;
  if (filter === "active") return o === "active";
  if (filter === "won") return o === "won";
  return o === "lost";
}

function poolSharePct(b: BetWithMarket): number | null {
  const survive = Number.parseFloat(b.market.survivePool);
  const rug = Number.parseFloat(b.market.rugPool);
  const total = survive + rug;
  if (!Number.isFinite(total) || total <= 0) return null;
  const amt = Number.parseFloat(b.amountUsdc);
  if (!Number.isFinite(amt)) return null;
  return (amt / total) * 100;
}

function SideBadge({ side }: { side: BetSide }) {
  if (side === "survive") {
    return (
      <span className="inline-flex rounded-md border border-survive/45 bg-survive/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-survive">
        Survive
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md border border-rug/45 bg-rug/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-rug">
      Rug
    </span>
  );
}

export default function BetsPage() {
  const walletAdapter = useWallet();
  const wallet = walletAdapter.publicKey?.toBase58();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { bets, isLoading, error } = useUserBets(wallet);
  const [filter, setFilter] = useState<BetFilter>("all");
  const [claimError, setClaimError] = useState<string | null>(null);

  const claimMut = useMutation({
    mutationFn: async (bet: BetWithMarket) => {
      const m = bet.market;
      const marketPda =
        m.onChainAddress?.trim() ||
        (await getMarketPDA(m.tokenMint)).toBase58();
      const bettor = walletAdapter.publicKey;
      if (!bettor) {
        throw new Error("Connect a wallet to claim");
      }
      const betPda = (await getBetPDA(marketPda, bettor.toBase58())).toBase58();
      return claimPayout(walletAdapter, marketPda, betPda);
    },
    onSuccess: () => {
      setClaimError(null);
      toast({
        variant: "success",
        title: "Payout claimed",
        message: "Funds should appear in your wallet shortly.",
      });
      if (wallet) {
        void queryClient.invalidateQueries({
          queryKey: userBetsQueryKey(wallet),
        });
      }
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Claim failed";
      setClaimError(msg);
      toast({ variant: "error", title: "Transaction failed", message: msg });
    },
  });

  const filtered = useMemo(
    () => bets.filter((b) => matchesFilter(b, filter)),
    [bets, filter],
  );

  const summary = useMemo(() => {
    if (bets.length === 0) {
      return {
        totalBet: 0,
        totalWon: 0,
        winRatePct: 0,
        openBets: 0,
      };
    }
    let totalBet = 0;
    let totalWon = 0;
    let wins = 0;
    let resolved = 0;
    let openBets = 0;
    for (const b of bets) {
      const amt = Number.parseFloat(b.amountUsdc);
      if (Number.isFinite(amt)) totalBet += amt;
      const o = rowOutcome(b);
      if (o === "active") openBets += 1;
      if (o === "won" || o === "lost") resolved += 1;
      if (o === "won") {
        wins += 1;
        const pay = b.payoutAmount != null ? Number.parseFloat(b.payoutAmount) : 0;
        if (Number.isFinite(pay)) totalWon += pay;
      }
    }
    const winRatePct = resolved > 0 ? (wins / resolved) * 100 : 0;
    return { totalBet, totalWon, winRatePct, openBets };
  }, [bets]);

  return (
    <div className="min-h-screen animate-fade-in pb-20 pt-8 sm:pt-12">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <motion.header
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="mb-10 flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-start sm:justify-between"
        >
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Your bets
            </h1>
            <p className="mt-2 font-mono text-sm text-muted">
              {wallet
                ? `Wallet ${wallet.slice(0, 4)}…${wallet.slice(-4)}`
                : "Connect a wallet to see your positions"}
            </p>
          </div>
          <div className="shrink-0 sm:max-w-[min(420px,100%)] sm:pt-1">
            <WalletBalancePanel />
          </div>
        </motion.header>

        {!wallet ? (
          <p className="font-mono text-sm text-muted">
            Connect your Solana wallet to load bet history from the API.
          </p>
        ) : null}

        {wallet ? (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1], delay: 0.05 }}
            aria-label="Betting summary"
            className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            {(
              [
                ["Total Bet", formatUSDC(summary.totalBet)],
                ["Total Won", formatUSDC(summary.totalWon)],
                ["Win Rate", `${summary.winRatePct.toFixed(1)}%`],
                ["Open Bets", String(summary.openBets)],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="card-cyber border-border-glow/35 px-4 py-4 shadow-glow-sm sm:px-5 sm:py-5"
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                  {label}
                </p>
                <p className="mt-2 font-mono text-lg font-semibold tabular-nums text-foreground sm:text-xl">
                  {isLoading ? "—" : value}
                </p>
              </div>
            ))}
          </motion.section>
        ) : null}

        {wallet && error ? (
          <p className="mb-6 font-mono text-sm text-rug">{error.message}</p>
        ) : null}

        {wallet && claimError ? (
          <p className="mb-6 font-mono text-sm text-rug">{claimError}</p>
        ) : null}

        {wallet ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1], delay: 0.08 }}
            className="mb-6 flex flex-wrap gap-1 border-b border-border"
            role="tablist"
            aria-label="Filter bets"
          >
            {FILTERS.map(({ key, label }) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(key)}
                  className={
                    active
                      ? "relative px-4 py-3 font-display text-xs font-bold uppercase tracking-widest text-accent-bright"
                      : "px-4 py-3 font-display text-xs font-semibold uppercase tracking-widest text-muted transition-colors duration-200 hover:text-fg-soft"
                  }
                >
                  {label}
                  {active ? (
                    <motion.span
                      layoutId="bets-tab-underline"
                      className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  ) : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}

        {wallet ? (
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <BetsPageSkeleton />
              </motion.div>
            ) : bets.length === 0 ? (
              <motion.div
                key="empty-all"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              >
                <EmptyState
                  icon={Inbox}
                  title="No bets yet"
                  description="Open a market and place a SURVIVE or RUG position to see it here."
                  action={{ label: "Browse markets", href: "/" }}
                />
              </motion.div>
            ) : filtered.length === 0 ? (
              <motion.div
                key="empty-filter"
                role="status"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className="card-cyber flex flex-col items-center justify-center px-6 py-16 text-center"
              >
                <p className="font-display text-lg font-semibold text-foreground">
                  No bets in this filter.
                </p>
                <p className="mt-2 font-mono text-sm text-muted">
                  Try another tab or place a new bet.
                </p>
                <Link
                  href="/"
                  className="mt-6 inline-flex items-center justify-center rounded-lg border border-accent bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-ink transition-all duration-200 hover:border-accent-bright hover:bg-transparent hover:text-accent-bright"
                >
                  Go to Markets
                </Link>
              </motion.div>
            ) : (
              <motion.div
                key={`list-${filter}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              >
                <div className="card-cyber hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[860px] border-collapse text-left font-mono text-sm">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
                        <th className="px-4 py-3 font-semibold">Token</th>
                        <th className="px-4 py-3 font-semibold">Side</th>
                        <th className="px-4 py-3 font-semibold">Bet</th>
                        <th className="px-4 py-3 font-semibold">Pool%</th>
                        <th className="px-4 py-3 font-semibold">Time / Status</th>
                        <th className="px-4 py-3 font-semibold">Win</th>
                        <th className="px-4 py-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((bet) => {
                        const outcome = rowOutcome(bet);
                        const poolPct = poolSharePct(bet);
                        const rowResolved =
                          outcome === "won"
                            ? "bg-survive/[0.07]"
                            : outcome === "lost"
                              ? "bg-rug/[0.06] opacity-75"
                              : "";
                        const winAmt =
                          outcome === "won" && bet.payoutAmount != null
                            ? Number.parseFloat(bet.payoutAmount)
                            : outcome === "won" && bet.potentialWin != null
                              ? Number.parseFloat(bet.potentialWin)
                              : null;
                        const claimable = outcome === "won" && !bet.claimed;

                        return (
                          <tr
                            key={bet.id}
                            className={`border-b border-border/80 transition-colors hover:bg-surface/60 ${rowResolved}`}
                          >
                            <td className="px-4 py-3">
                              <span className="font-semibold text-foreground">
                                {bet.market.tokenName ?? "—"}
                              </span>
                              <span className="ml-2 text-accent-bright">
                                ${bet.market.tokenTicker ?? "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <SideBadge side={bet.side} />
                            </td>
                            <td className="px-4 py-3 tabular-nums text-fg-soft">
                              {formatUSDC(Number.parseFloat(bet.amountUsdc))}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-muted">
                              {poolPct != null ? `${poolPct.toFixed(1)}%` : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {outcome === "active" ? (
                                <span className="tabular-nums text-accent-bright">
                                  <Timer
                                    expiresAt={new Date(bet.market.expiresAt)}
                                  />
                                </span>
                              ) : outcome === "won" ? (
                                <span className="text-survive">Won</span>
                              ) : (
                                <span className="text-rug">Lost</span>
                              )}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-fg-soft">
                              {winAmt != null && Number.isFinite(winAmt)
                                ? formatUSDC(winAmt)
                                : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {claimable ? (
                                <button
                                  type="button"
                                  disabled={claimMut.isPending}
                                  onClick={() => void claimMut.mutateAsync(bet)}
                                  className="rounded-lg border border-accent bg-accent px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-ink transition-colors duration-200 hover:bg-transparent hover:text-accent-bright disabled:opacity-50"
                                >
                                  {claimMut.isPending ? "…" : "Claim"}
                                </button>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 md:hidden">
                  {filtered.map((bet) => {
                    const outcome = rowOutcome(bet);
                    const poolPct = poolSharePct(bet);
                    const winAmt =
                      outcome === "won" && bet.payoutAmount != null
                        ? Number.parseFloat(bet.payoutAmount)
                        : outcome === "won" && bet.potentialWin != null
                          ? Number.parseFloat(bet.potentialWin)
                          : null;
                    const claimable = outcome === "won" && !bet.claimed;

                    return (
                      <motion.article
                        layout
                        key={bet.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22 }}
                        className={`card-cyber space-y-3 p-4 ${
                          outcome === "won"
                            ? "border-survive/35 bg-survive/[0.06]"
                            : outcome === "lost"
                              ? "border-rug/30 bg-rug/[0.05] opacity-80"
                              : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-display font-semibold text-foreground">
                              {bet.market.tokenName ?? "—"}
                            </p>
                            <p className="font-mono text-sm text-accent-bright">
                              ${bet.market.tokenTicker ?? "—"}
                            </p>
                          </div>
                          <SideBadge side={bet.side} />
                        </div>
                        <dl className="grid grid-cols-2 gap-2 font-mono text-xs">
                          <div>
                            <dt className="text-muted">Bet</dt>
                            <dd className="mt-0.5 tabular-nums text-fg-soft">
                              {formatUSDC(Number.parseFloat(bet.amountUsdc))}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted">Pool%</dt>
                            <dd className="mt-0.5 tabular-nums text-muted">
                              {poolPct != null ? `${poolPct.toFixed(1)}%` : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted">Time / Status</dt>
                            <dd className="mt-0.5 tabular-nums text-accent-bright">
                              {outcome === "active" ? (
                                <Timer
                                  expiresAt={new Date(bet.market.expiresAt)}
                                />
                              ) : outcome === "won" ? (
                                <span className="text-survive">Won</span>
                              ) : (
                                <span className="text-rug">Lost</span>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted">Win</dt>
                            <dd className="mt-0.5 tabular-nums text-fg-soft">
                              {winAmt != null && Number.isFinite(winAmt)
                                ? formatUSDC(winAmt)
                                : "—"}
                            </dd>
                          </div>
                        </dl>
                    <div className="flex justify-end border-t border-border pt-3">
                      {claimable ? (
                        <button
                          type="button"
                          disabled={claimMut.isPending}
                          onClick={() => void claimMut.mutateAsync(bet)}
                          className="rounded-lg border border-accent bg-accent px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-ink transition-colors duration-200 hover:bg-transparent hover:text-accent-bright disabled:opacity-50"
                        >
                          {claimMut.isPending ? "…" : "Claim"}
                        </button>
                      ) : (
                        <span className="font-mono text-xs text-muted">—</span>
                      )}
                    </div>
                      </motion.article>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        ) : null}
      </div>
    </div>
  );
}
