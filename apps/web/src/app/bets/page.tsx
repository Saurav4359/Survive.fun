"use client";

import type { BetSide, BetWithMarket } from "@survivefun/types";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Inbox } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { CountUp } from "@/components/CountUp";
import { EmptyState } from "@/components/EmptyState";
import { Timer } from "@/components/Timer";
import { useToast } from "@/components/ToastProvider";
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
      <span className="inline-flex rounded-sm border border-survive bg-bg px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-survive">
        Survive
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-sm border border-rug bg-bg px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-rug">
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

  const claimMut = useMutation({
    mutationFn: async (bet: BetWithMarket) => {
      const m = bet.market;
      const marketPda =
        m.onChainAddress?.trim() ||
        (await getMarketPDA(m.tokenMint)).toBase58();
      const bettor = walletAdapter.publicKey;
      if (!bettor) throw new Error("Connect a wallet to claim");
      const betPda = (await getBetPDA(marketPda, bettor.toBase58())).toBase58();
      return claimPayout(walletAdapter, marketPda, betPda);
    },
    onSuccess: () => {
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
      toast({ variant: "error", title: "Transaction failed", message: msg });
    },
  });

  const filtered = useMemo(
    () => bets.filter((b) => matchesFilter(b, filter)),
    [bets, filter],
  );

  const summary = useMemo(() => {
    if (bets.length === 0) {
      return { totalBet: 0, totalWon: 0, winRatePct: 0, openBets: 0 };
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
        const pay =
          b.payoutAmount != null ? Number.parseFloat(b.payoutAmount) : 0;
        if (Number.isFinite(pay)) totalWon += pay;
      }
    }
    const winRatePct = resolved > 0 ? (wins / resolved) * 100 : 0;
    return { totalBet, totalWon, winRatePct, openBets };
  }, [bets]);

  return (
    <div className="mx-auto min-h-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="border-b border-border pb-6"
      >
        <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
          My Bets
        </h1>
        <p className="mt-1 font-mono text-xs text-fg-muted">
          {wallet
            ? `Wallet ${wallet.slice(0, 4)}…${wallet.slice(-4)}`
            : "Connect a wallet to see your positions"}
        </p>
      </motion.header>

      {!wallet ? (
        <p className="mt-6 font-mono text-sm text-fg-muted">
          Connect your Solana wallet to load bet history from the API.
        </p>
      ) : null}

      {wallet ? (
        <>
          {/* Summary row */}
          <section
            aria-label="Betting summary"
            className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            {[
              {
                label: "Total Bet",
                value: summary.totalBet,
                format: (n: number) => formatUSDC(n),
              },
              {
                label: "Won",
                value: summary.totalWon,
                format: (n: number) => formatUSDC(n),
              },
              {
                label: "Win Rate",
                value: summary.winRatePct,
                format: (n: number) => `${n.toFixed(1)}%`,
              },
              {
                label: "Open",
                value: summary.openBets,
                format: (n: number) => `${Math.round(n)}`,
              },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
                className="border border-border border-t-2 border-t-accent bg-card px-4 py-4"
              >
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                  {s.label}
                </p>
                <p className="mt-2 font-mono text-xl font-bold tabular-nums text-accent sm:text-2xl">
                  {isLoading ? (
                    "—"
                  ) : (
                    <CountUp
                      to={s.value}
                      format={s.format}
                      delay={0.2 + i * 0.05}
                    />
                  )}
                </p>
              </motion.div>
            ))}
          </section>

          {error ? (
            <p className="mt-6 font-mono text-sm text-rug">{error.message}</p>
          ) : null}

          {/* Filter tabs */}
          <div className="mt-8 flex flex-wrap gap-1 border-b border-border" role="tablist">
            {FILTERS.map(({ key, label }) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(key)}
                  className="relative px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.15em] transition-colors"
                >
                  <span className={active ? "text-accent" : "text-fg-soft hover:text-white"}>
                    {label}
                  </span>
                  {active ? (
                    <motion.span
                      layoutId="bets-tab"
                      className="absolute -bottom-px left-0 right-0 h-0.5 bg-accent"
                      transition={{ duration: 0.28, ease: "easeOut" }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-5">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse border border-border bg-card"
                  />
                ))}
              </div>
            ) : bets.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No bets yet"
                description="Open a market and place a SURVIVE or RUG position to see it here."
                action={{ label: "Browse markets", href: "/" }}
              />
            ) : filtered.length === 0 ? (
              <div
                role="status"
                className="flex flex-col items-center justify-center border border-border bg-card px-6 py-16 text-center"
              >
                <p className="font-display text-base font-semibold text-white">
                  No bets in this filter.
                </p>
                <p className="mt-2 font-mono text-sm text-fg-muted">
                  Try another tab or place a new bet.
                </p>
                <Link
                  href="/"
                  className="mt-6 inline-flex items-center justify-center rounded-md border border-accent bg-accent px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:bg-transparent hover:text-accent"
                >
                  Go to Markets
                </Link>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto border border-border bg-card md:block">
                  <table className="w-full min-w-[860px] border-collapse text-left font-mono text-sm">
                    <thead>
                      <tr className="border-b border-border text-[9px] uppercase tracking-[0.2em] text-fg-muted">
                        <th className="px-4 py-3 font-bold">Token</th>
                        <th className="px-4 py-3 font-bold">Side</th>
                        <th className="px-4 py-3 font-bold">Bet</th>
                        <th className="px-4 py-3 font-bold">Pool %</th>
                        <th className="px-4 py-3 font-bold">Status</th>
                        <th className="px-4 py-3 font-bold">Win</th>
                        <th className="px-4 py-3 font-bold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((bet, idx) => {
                        const outcome = rowOutcome(bet);
                        const poolPct = poolSharePct(bet);
                        const winAmt =
                          outcome === "won" && bet.payoutAmount != null
                            ? Number.parseFloat(bet.payoutAmount)
                            : outcome === "won" && bet.potentialWin != null
                              ? Number.parseFloat(bet.potentialWin)
                              : null;
                        const claimable = outcome === "won" && !bet.claimed;
                        const rowBg =
                          outcome === "won"
                            ? "bg-survive/[0.06]"
                            : outcome === "lost"
                              ? "bg-rug/[0.04] opacity-75"
                              : "";

                        return (
                          <motion.tr
                            key={bet.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.03 }}
                            className={`border-b border-border/80 transition-colors hover:bg-bg ${rowBg}`}
                          >
                            <td className="px-4 py-3">
                              <span className="font-semibold text-white">
                                {bet.market.tokenName ?? "—"}
                              </span>
                              <span className="ml-2 text-accent">
                                ${bet.market.tokenTicker ?? "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <SideBadge side={bet.side} />
                            </td>
                            <td className="px-4 py-3 tabular-nums text-fg-soft">
                              {formatUSDC(Number.parseFloat(bet.amountUsdc))}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-fg-muted">
                              {poolPct != null ? `${poolPct.toFixed(1)}%` : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {outcome === "active" ? (
                                <Timer
                                  expiresAt={new Date(bet.market.expiresAt)}
                                />
                              ) : outcome === "won" ? (
                                <span className="font-bold text-survive">
                                  WON
                                </span>
                              ) : (
                                <span className="font-bold text-rug">LOST</span>
                              )}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-fg-soft">
                              {winAmt != null && Number.isFinite(winAmt)
                                ? formatUSDC(winAmt)
                                : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {claimable ? (
                                <motion.button
                                  whileTap={{ scale: 0.95 }}
                                  type="button"
                                  disabled={claimMut.isPending}
                                  onClick={() => void claimMut.mutateAsync(bet)}
                                  className="rounded-md border border-accent bg-accent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:bg-transparent hover:text-accent disabled:opacity-50"
                                >
                                  {claimMut.isPending ? "…" : "Claim"}
                                </motion.button>
                              ) : (
                                <span className="text-fg-muted">—</span>
                              )}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="space-y-3 md:hidden">
                  {filtered.map((bet, idx) => {
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
                        key={bet.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        className={`space-y-3 border border-border bg-card p-4 ${
                          outcome === "won"
                            ? "border-l-[3px] border-l-survive"
                            : outcome === "lost"
                              ? "border-l-[3px] border-l-rug opacity-80"
                              : "border-l-[3px] border-l-accent"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-display text-sm font-semibold text-white">
                              {bet.market.tokenName ?? "—"}
                            </p>
                            <p className="font-mono text-xs text-accent">
                              ${bet.market.tokenTicker ?? "—"}
                            </p>
                          </div>
                          <SideBadge side={bet.side} />
                        </div>
                        <dl className="grid grid-cols-2 gap-2 font-mono text-xs">
                          <div>
                            <dt className="text-fg-muted">Bet</dt>
                            <dd className="mt-0.5 tabular-nums text-fg-soft">
                              {formatUSDC(Number.parseFloat(bet.amountUsdc))}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-fg-muted">Pool %</dt>
                            <dd className="mt-0.5 tabular-nums text-fg-muted">
                              {poolPct != null
                                ? `${poolPct.toFixed(1)}%`
                                : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-fg-muted">Status</dt>
                            <dd className="mt-0.5 tabular-nums">
                              {outcome === "active" ? (
                                <Timer
                                  expiresAt={new Date(bet.market.expiresAt)}
                                />
                              ) : outcome === "won" ? (
                                <span className="font-bold text-survive">
                                  WON
                                </span>
                              ) : (
                                <span className="font-bold text-rug">
                                  LOST
                                </span>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-fg-muted">Win</dt>
                            <dd className="mt-0.5 tabular-nums text-fg-soft">
                              {winAmt != null && Number.isFinite(winAmt)
                                ? formatUSDC(winAmt)
                                : "—"}
                            </dd>
                          </div>
                        </dl>
                        <div className="flex justify-end border-t border-border pt-3">
                          {claimable ? (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              type="button"
                              disabled={claimMut.isPending}
                              onClick={() => void claimMut.mutateAsync(bet)}
                              className="rounded-md border border-accent bg-accent px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:bg-transparent hover:text-accent disabled:opacity-50"
                            >
                              {claimMut.isPending ? "…" : "Claim"}
                            </motion.button>
                          ) : (
                            <span className="font-mono text-xs text-fg-muted">
                              —
                            </span>
                          )}
                        </div>
                      </motion.article>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
