"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { motion } from "framer-motion";
import { User } from "lucide-react";
import Link from "next/link";

import { useUserBets } from "@/hooks/useUserBets";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { formatSolBetLine, formatWallet } from "@/utils/format";

export default function ProfilePage() {
  const { publicKey, connected } = useWallet();
  const wallet = publicKey?.toBase58();
  const balances = useWalletBalances();
  const { bets } = useUserBets(wallet);

  const stats = (() => {
    let totalSol = 0;
    let wonSol = 0;
    let openCount = 0;
    let resolvedCount = 0;
    let wins = 0;
    for (const b of bets) {
      if (b.currency !== "sol") continue;
      const lam = Number(BigInt(b.amountLamports ?? "0"));
      if (Number.isFinite(lam)) totalSol += lam / LAMPORTS_PER_SOL;
      if (b.market.status === "active") openCount += 1;
      if (b.market.status === "resolved") {
        resolvedCount += 1;
        const winSide = b.market.outcome;
        if (winSide && winSide === b.side) {
          wins += 1;
          const raw = b.payoutAmount;
          if (raw != null) {
            wonSol += Number(BigInt(raw.split(".")[0] ?? "0")) / LAMPORTS_PER_SOL;
          }
        }
      }
    }
    const winRate = resolvedCount > 0 ? (wins / resolvedCount) * 100 : 0;
    return { totalSol, wonSol, openCount, winRate };
  })();

  return (
    <div className="mx-auto min-h-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="border-b border-border pb-6"
      >
        <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-accent">
          <User className="h-3.5 w-3.5" />
          Profile
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {wallet ? formatWallet(wallet) : "Not connected"}
        </h1>
      </motion.header>

      {!connected || !wallet ? (
        <p className="mt-6 font-mono text-sm text-fg-muted">
          Connect a wallet to see your profile.
        </p>
      ) : (
        <>
          <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [
                "SOL Balance",
                balances.isPending
                  ? "—"
                  : formatSolBetLine(balances.data?.sol ?? 0),
              ],
              ["Total Bet", formatSolBetLine(stats.totalSol)],
              ["Total Won", formatSolBetLine(stats.wonSol)],
              ["Open Positions", String(stats.openCount)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="border border-border border-t-2 border-t-accent bg-card px-4 py-4"
              >
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                  {label}
                </p>
                <p className="mt-2 font-mono text-xl font-bold tabular-nums text-accent sm:text-2xl">
                  {value}
                </p>
              </div>
            ))}
          </section>

          <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="border border-border bg-card p-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                Your bets
              </p>
              <p className="mt-2 font-mono text-sm text-fg-muted">
                Stakes and payouts are SOL-only on-chain.
              </p>
              <Link
                href="/bets"
                className="mt-4 inline-flex font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-accent transition-colors hover:text-white"
              >
                View bets →
              </Link>
            </div>
            <div className="border border-border bg-card p-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                Win rate
              </p>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-survive">
                {stats.winRate.toFixed(1)}%
              </p>
              <p className="mt-2 font-mono text-[11px] text-fg-muted">
                Across resolved markets
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
