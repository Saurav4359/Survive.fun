"use client";

import type { BetSide } from "@survivefun/types";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Timer } from "@/components/Timer";
import { formatUSDC } from "@/utils/format";

type BetFilter = "all" | "active" | "won" | "lost";

type DemoBet = {
  id: string;
  tokenName: string;
  tokenTicker: string;
  side: BetSide;
  betUsdc: number;
  poolPct: number;
  outcome: "active" | "won" | "lost";
  expiresAt?: string;
  winUsdc?: number;
  /** Show Claim for resolved wins that are still claimable. */
  claimable?: boolean;
};

const SUMMARY = {
  totalBet: 2847.5,
  totalWon: 923.25,
  winRatePct: 61.5,
  openBets: 4,
} as const;

const DEMO_BETS: DemoBet[] = [
  {
    id: "1",
    tokenName: "Survive Sendit",
    tokenTicker: "SND",
    side: "survive",
    betUsdc: 50,
    poolPct: 8.2,
    outcome: "active",
    expiresAt: new Date(Date.now() + 95 * 60 * 1000).toISOString(),
  },
  {
    id: "2",
    tokenName: "Only Up",
    tokenTicker: "UP",
    side: "rug",
    betUsdc: 25,
    poolPct: 3.1,
    outcome: "active",
    expiresAt: new Date(Date.now() + 6 * 60 * 1000).toISOString(),
  },
  {
    id: "3",
    tokenName: "Bonk Survivors",
    tokenTicker: "BNK",
    side: "survive",
    betUsdc: 100,
    poolPct: 11.4,
    outcome: "won",
    winUsdc: 186.4,
    claimable: true,
  },
  {
    id: "4",
    tokenName: "Fresh Mint Mayhem",
    tokenTicker: "FMM",
    side: "rug",
    betUsdc: 15,
    poolPct: 4.8,
    outcome: "lost",
  },
  {
    id: "5",
    tokenName: "Roundtrip Risk",
    tokenTicker: "RISK",
    side: "survive",
    betUsdc: 40,
    poolPct: 6.0,
    outcome: "won",
    winUsdc: 72.1,
    claimable: false,
  },
  {
    id: "6",
    tokenName: "Normie Exit Liquidity",
    tokenTicker: "NEL",
    side: "survive",
    betUsdc: 30,
    poolPct: 2.9,
    outcome: "active",
    expiresAt: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(),
  },
];

const FILTERS: { key: BetFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

function matchesFilter(bet: DemoBet, filter: BetFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return bet.outcome === "active";
  if (filter === "won") return bet.outcome === "won";
  return bet.outcome === "lost";
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

/** Set to true to preview the empty state layout. */
const SHOW_EMPTY_STATE = false;

export default function BetsPage() {
  const [filter, setFilter] = useState<BetFilter>("all");

  const bets = SHOW_EMPTY_STATE ? [] : DEMO_BETS;

  const filtered = useMemo(
    () => bets.filter((b) => matchesFilter(b, filter)),
    [bets, filter],
  );

  return (
    <div className="min-h-screen animate-fade-in pb-20 pt-8 sm:pt-12">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <motion.header
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="mb-10 border-b border-border pb-8"
        >
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Your bets
          </h1>
          <p className="mt-2 font-mono text-sm text-muted">
            Demo portfolio · positions across markets
          </p>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1], delay: 0.05 }}
          aria-label="Betting summary"
          className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          {(
            [
              ["Total Bet", formatUSDC(SUMMARY.totalBet)],
              ["Total Won", formatUSDC(SUMMARY.totalWon)],
              ["Win Rate", `${SUMMARY.winRatePct}%`],
              ["Open Bets", String(SUMMARY.openBets)],
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
                {value}
              </p>
            </div>
          ))}
        </motion.section>

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

        <AnimatePresence mode="wait">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              role="status"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="card-cyber flex flex-col items-center justify-center px-6 py-16 text-center"
            >
              <p className="font-display text-lg font-semibold text-foreground">
                No bets yet. Find a token to survive.
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
              {/* Desktop table */}
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
                      const rowResolved =
                        bet.outcome === "won"
                          ? "bg-survive/[0.07]"
                          : bet.outcome === "lost"
                            ? "bg-rug/[0.06] opacity-75"
                            : "";

                      return (
                        <tr
                          key={bet.id}
                          className={`border-b border-border/80 transition-colors hover:bg-surface/60 ${rowResolved}`}
                        >
                          <td className="px-4 py-3">
                            <span className="font-semibold text-foreground">
                              {bet.tokenName}
                            </span>
                            <span className="ml-2 text-accent-bright">
                              ${bet.tokenTicker}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <SideBadge side={bet.side} />
                          </td>
                          <td className="px-4 py-3 tabular-nums text-fg-soft">
                            {formatUSDC(bet.betUsdc)}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-muted">
                            {bet.poolPct.toFixed(1)}%
                          </td>
                          <td className="px-4 py-3">
                            {bet.outcome === "active" && bet.expiresAt ? (
                              <span className="tabular-nums text-accent-bright">
                                <Timer expiresAt={new Date(bet.expiresAt)} />
                              </span>
                            ) : bet.outcome === "won" ? (
                              <span className="text-survive">Won</span>
                            ) : (
                              <span className="text-rug">Lost</span>
                            )}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-fg-soft">
                            {bet.winUsdc != null ? formatUSDC(bet.winUsdc) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {bet.outcome === "won" && bet.claimable ? (
                              <button
                                type="button"
                                className="rounded-lg border border-accent bg-accent px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-ink transition-colors duration-200 hover:bg-transparent hover:text-accent-bright"
                              >
                                Claim
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

              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {filtered.map((bet) => (
                  <motion.article
                    layout
                    key={bet.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22 }}
                    className={`card-cyber space-y-3 p-4 ${
                      bet.outcome === "won"
                        ? "border-survive/35 bg-survive/[0.06]"
                        : bet.outcome === "lost"
                          ? "border-rug/30 bg-rug/[0.05] opacity-80"
                          : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-display font-semibold text-foreground">
                          {bet.tokenName}
                        </p>
                        <p className="font-mono text-sm text-accent-bright">
                          ${bet.tokenTicker}
                        </p>
                      </div>
                      <SideBadge side={bet.side} />
                    </div>
                    <dl className="grid grid-cols-2 gap-2 font-mono text-xs">
                      <div>
                        <dt className="text-muted">Bet</dt>
                        <dd className="mt-0.5 tabular-nums text-fg-soft">
                          {formatUSDC(bet.betUsdc)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Pool%</dt>
                        <dd className="mt-0.5 tabular-nums text-muted">
                          {bet.poolPct.toFixed(1)}%
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Time / Status</dt>
                        <dd className="mt-0.5 tabular-nums text-accent-bright">
                          {bet.outcome === "active" && bet.expiresAt ? (
                            <Timer expiresAt={new Date(bet.expiresAt)} />
                          ) : bet.outcome === "won" ? (
                            <span className="text-survive">Won</span>
                          ) : (
                            <span className="text-rug">Lost</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Win</dt>
                        <dd className="mt-0.5 tabular-nums text-fg-soft">
                          {bet.winUsdc != null ? formatUSDC(bet.winUsdc) : "—"}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex justify-end border-t border-border pt-3">
                      {bet.outcome === "won" && bet.claimable ? (
                        <button
                          type="button"
                          className="rounded-lg border border-accent bg-accent px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-ink transition-colors duration-200 hover:bg-transparent hover:text-accent-bright"
                        >
                          Claim
                        </button>
                      ) : (
                        <span className="font-mono text-xs text-muted">—</span>
                      )}
                    </div>
                  </motion.article>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
