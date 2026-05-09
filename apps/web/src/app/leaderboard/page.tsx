"use client";

import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { useState } from "react";

import { LeaderboardHeader3D } from "@/components/three/LeaderboardHeader3D";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { formatNativeBetAmount, formatWallet } from "@/utils/format";

type LeaderTab = "winners" | "rug-callers" | "biggest-payouts";

const TABS: { key: LeaderTab; label: string }[] = [
  { key: "winners", label: "Top Winners" },
  { key: "rug-callers", label: "Top Rug Callers" },
  { key: "biggest-payouts", label: "Biggest Payouts" },
];

function rankStyle(rank: number): string {
  if (rank === 1) return "text-accent";
  if (rank === 2) return "text-white/85";
  if (rank === 3) return "text-fg-soft/85";
  return "text-fg-muted";
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<LeaderTab>("winners");
  const { rows, isLoading, error } = useLeaderboard(tab);

  return (
    <div className="mx-auto min-h-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <div className="relative border border-border bg-card">
        <div className="pointer-events-none">
          <LeaderboardHeader3D height={220} />
        </div>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
          <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-fg-muted">
            <Trophy className="h-3 w-3 text-accent" />
            Top of the leaderboard
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-1 border-b border-border" role="tablist">
        {TABS.map(({ key, label }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className="relative px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.15em] transition-colors"
            >
              <span
                className={active ? "text-accent" : "text-fg-soft hover:text-white"}
              >
                {label}
              </span>
              {active ? (
                <motion.span
                  layoutId="leaderboard-tab"
                  className="absolute -bottom-px left-0 right-0 h-0.5 bg-accent"
                  transition={{ duration: 0.28, ease: "easeOut" }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-6 overflow-x-auto border border-border bg-card">
        {error ? (
          <p className="p-8 text-center font-mono text-sm text-rug">
            {error.message}
          </p>
        ) : isLoading ? (
          <p className="p-8 text-center font-mono text-sm text-fg-muted">
            Loading leaderboard…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center font-mono text-sm text-fg-muted">
            No data yet — place bets and resolve markets to populate rankings.
          </p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-left font-mono text-sm">
            <thead>
              <tr className="border-b border-border text-[9px] uppercase tracking-[0.2em] text-fg-muted">
                <th className="px-4 py-3 font-bold">Rank</th>
                <th className="px-4 py-3 font-bold">Wallet</th>
                <th className="px-4 py-3 text-right font-bold">Won</th>
                <th className="px-4 py-3 text-right font-bold">Win Rate</th>
                <th className="px-4 py-3 text-right font-bold">Best</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const rank = idx + 1;
                const won = row.totalWon;
                const best = row.bestPayout;
                return (
                  <motion.tr
                    key={`${tab}-${idx}-${row.wallet}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05, duration: 0.32 }}
                    className={`border-b border-border/80 transition-colors hover:bg-bg ${rank === 1 ? "bg-accent/[0.04]" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`font-bold tabular-nums ${rankStyle(rank)}`}
                      >
                        #{rank}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white">
                      {formatWallet(row.wallet)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-survive">
                      {formatNativeBetAmount(won)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg-soft">
                      {row.winRatePct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-accent">
                      {formatNativeBetAmount(best)}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.15em] text-fg-muted">
        Rankings from the Survive.fun leaderboard API — settled markets and recorded
        payouts.
      </p>
    </div>
  );
}
