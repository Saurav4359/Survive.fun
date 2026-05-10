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
import { marketResultQueryKey } from "@/hooks/useMarketResult";
import { myPayoutQueryKey } from "@/hooks/useMyPayout";
import { userBetsQueryKey, useUserBets } from "@/hooks/useUserBets";
import {
  formatBetStake,
  formatNativeBetAmount,
  formatSolBetLine,
  parsePoolLamports,
} from "@/utils/format";
import { solscanTxUrl } from "@/utils/explorer";
import {
  claimPayout,
  getBetPDA,
  resolveMarketPdaForTransaction,
} from "@/utils/transactions";

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
  const survive = Number(parsePoolLamports(b.market.survivePool));
  const rug = Number(parsePoolLamports(b.market.rugPool));
  const total = survive + rug;
  if (!Number.isFinite(total) || total <= 0) return null;
  if (b.currency !== "sol") return null;
  const amt = Number(BigInt(b.amountLamports ?? "0"));
  if (!Number.isFinite(amt) || amt <= 0) return null;
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
      const marketPda = await resolveMarketPdaForTransaction(
        m.tokenMint,
        m.durationSeconds,
        m.onChainAddress,
      );
      const bettor = walletAdapter.publicKey;
      if (!bettor) throw new Error("Connect a wallet to claim");
      const betPda = (await getBetPDA(marketPda, bettor.toBase58())).toBase58();
      return claimPayout(walletAdapter, marketPda, betPda, {
        betId: bet.id,
      });
    },
    onSuccess: (_sig, bet) => {
      toast({
        variant: "success",
        title: "Payout claimed",
        message: "Funds should appear in your wallet shortly.",
      });
      if (wallet) {
        void queryClient.invalidateQueries({
          queryKey: userBetsQueryKey(wallet),
        });
        void queryClient.invalidateQueries({
          queryKey: myPayoutQueryKey(bet.market.id, wallet),
        });
      }
      void queryClient.invalidateQueries({
        queryKey: marketResultQueryKey(bet.market.id),
      });
    },
    onError: (e, bet) => {
      const msg = e instanceof Error ? e.message : "Claim failed";
      const already =
        msg.includes("already claimed on-chain") ||
        msg.toLowerCase().includes("already claimed");
      toast({
        variant: already ? "info" : "error",
        title: already ? "Already claimed" : "Transaction failed",
        message: msg,
      });
      if (already && wallet) {
        void queryClient.invalidateQueries({
          queryKey: userBetsQueryKey(wallet),
        });
        void queryClient.invalidateQueries({
          queryKey: myPayoutQueryKey(bet.market.id, wallet),
        });
        void queryClient.invalidateQueries({
          queryKey: marketResultQueryKey(bet.market.id),
        });
      }
    },
  });

  const filtered = useMemo(
    () => bets.filter((b) => matchesFilter(b, filter)),
    [bets, filter],
  );

  const summary = useMemo(() => {
    if (bets.length === 0) {
      return {
        totalBetSol: 0,
        totalWonSol: 0,
        winRatePct: 0,
        openBets: 0,
      };
    }
    let totalBetSol = 0;
    let totalWonSol = 0;
    let wins = 0;
    let resolved = 0;
    let openBets = 0;
    for (const b of bets) {
      if (b.currency !== "sol") continue;
      const lam = Number(BigInt(b.amountLamports ?? "0"));
      if (Number.isFinite(lam)) totalBetSol += lam / 1e9;
      const o = rowOutcome(b);
      if (o === "active") openBets += 1;
      if (o === "won" || o === "lost") resolved += 1;
      if (o === "won") {
        wins += 1;
        const payRaw = b.payoutAmount;
        if (payRaw != null) {
          totalWonSol += Number(BigInt(payRaw.split(".")[0] ?? "0")) / 1e9;
        }
      }
    }
    const winRatePct = resolved > 0 ? (wins / resolved) * 100 : 0;
    return {
      totalBetSol,
      totalWonSol,
      winRatePct,
      openBets,
    };
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
            className="mt-6 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0, duration: 0.4 }}
              className="border border-border border-t border-t-accent bg-card px-3 py-2.5"
            >
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-fg-muted">
                Total Bet
              </p>
              <div className="mt-1 font-mono text-base font-bold tabular-nums text-accent sm:text-lg">
                {isLoading ? (
                  "—"
                ) : (
                  <CountUp
                    to={summary.totalBetSol}
                    format={(n) => formatSolBetLine(n)}
                    delay={0.2}
                  />
                )}
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06, duration: 0.4 }}
              className="border border-border border-t border-t-accent bg-card px-3 py-2.5"
            >
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-fg-muted">
                Won
              </p>
              <div className="mt-1 font-mono text-base font-bold tabular-nums text-accent sm:text-lg">
                {isLoading ? (
                  "—"
                ) : (
                  <CountUp
                    to={summary.totalWonSol}
                    format={(n) => formatSolBetLine(n)}
                    delay={0.25}
                  />
                )}
              </div>
            </motion.div>
            {[
              {
                label: "Win Rate",
                value: summary.winRatePct,
                format: (n: number) => `${n.toFixed(1)}%`,
                delay: 0.12,
              },
              {
                label: "Open",
                value: summary.openBets,
                format: (n: number) => `${Math.round(n)}`,
                delay: 0.18,
              },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: s.delay, duration: 0.4 }}
                className="border border-border border-t border-t-accent bg-card px-3 py-2.5"
              >
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-fg-muted">
                  {s.label}
                </p>
                <p className="mt-1 font-mono text-base font-bold tabular-nums text-accent sm:text-lg">
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
                        const winRaw =
                          outcome === "won" && bet.payoutAmount != null
                            ? bet.payoutAmount
                            : outcome === "won" && bet.potentialWin != null
                              ? bet.potentialWin
                              : null;
                        const winDisplay =
                          winRaw != null ? formatNativeBetAmount(winRaw) : "—";
                        const claimable = outcome === "won" && !bet.claimed;
                        const rowEdge =
                          outcome === "won"
                            ? "border-l-4 border-l-accent"
                            : outcome === "lost"
                              ? "border-l-4 border-l-rug opacity-50"
                              : "";

                        return (
                          <motion.tr
                            key={bet.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.03 }}
                            className={`border-b border-border/80 transition-colors hover:bg-bg ${rowEdge}`}
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
                              {formatBetStake(bet)}
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
                                <span className="font-bold tabular-nums text-accent">
                                  WON {winDisplay}
                                </span>
                              ) : (
                                <span className="font-bold tabular-nums text-rug">
                                  LOST {formatBetStake(bet)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-fg-soft">
                              {outcome === "active" ? winDisplay : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {claimable ? (
                                <motion.button
                                  whileTap={{ scale: 0.95 }}
                                  type="button"
                                  disabled={claimMut.isPending}
                                  onClick={() => claimMut.mutate(bet)}
                                  className="rounded-md border border-accent bg-accent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:bg-transparent hover:text-accent disabled:opacity-50"
                                >
                                  {claimMut.isPending ? "…" : "Claim"}
                                </motion.button>
                              ) : outcome === "won" && bet.claimed ? (
                                <span className="font-mono text-[10px] font-bold text-accent">
                                  Claimed ✅
                                </span>
                              ) : outcome === "won" &&
                                bet.payoutTx != null &&
                                bet.payoutTx.length > 0 ? (
                                <a
                                  href={solscanTxUrl(bet.payoutTx)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-accent underline-offset-2 hover:underline"
                                >
                                  Tx ↗
                                </a>
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
                    const winRaw =
                      outcome === "won" && bet.payoutAmount != null
                        ? bet.payoutAmount
                        : outcome === "won" && bet.potentialWin != null
                          ? bet.potentialWin
                          : null;
                    const winDisplay =
                      winRaw != null ? formatNativeBetAmount(winRaw) : "—";
                    const claimable = outcome === "won" && !bet.claimed;
                    const cardEdge =
                      outcome === "won"
                        ? "border-l-4 border-l-accent"
                        : outcome === "lost"
                          ? "border-l-4 border-l-rug opacity-50"
                          : "border-l-[3px] border-l-accent";

                    return (
                      <motion.article
                        key={bet.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        className={`space-y-3 border border-border bg-card p-4 ${cardEdge}`}
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
                              {formatBetStake(bet)}
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
                                <span className="font-bold tabular-nums text-accent">
                                  WON {winDisplay}
                                </span>
                              ) : (
                                <span className="font-bold tabular-nums text-rug">
                                  LOST {formatBetStake(bet)}
                                </span>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-fg-muted">Win</dt>
                            <dd className="mt-0.5 tabular-nums text-fg-soft">
                              {outcome === "active" ? winDisplay : "—"}
                            </dd>
                          </div>
                        </dl>
                        <div className="flex justify-end border-t border-border pt-3">
                          {claimable ? (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              type="button"
                              disabled={claimMut.isPending}
                              onClick={() => claimMut.mutate(bet)}
                              className="rounded-md border border-accent bg-accent px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:bg-transparent hover:text-accent disabled:opacity-50"
                            >
                              {claimMut.isPending ? "…" : "Claim"}
                            </motion.button>
                          ) : outcome === "won" && bet.claimed ? (
                            <span className="font-mono text-xs font-bold text-accent">
                              Claimed ✅
                            </span>
                          ) : outcome === "won" &&
                            bet.payoutTx != null &&
                            bet.payoutTx.length > 0 ? (
                            <a
                              href={solscanTxUrl(bet.payoutTx)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-xs font-bold text-accent underline-offset-2 hover:underline"
                            >
                              View tx ↗
                            </a>
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
