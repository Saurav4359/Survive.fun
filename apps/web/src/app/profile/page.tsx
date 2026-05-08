"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { motion } from "framer-motion";
import { User } from "lucide-react";
import Link from "next/link";

import { useUserBets } from "@/hooks/useUserBets";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { formatSolAmount, formatUSDC, formatWallet } from "@/utils/format";

export default function ProfilePage() {
  const { publicKey, connected } = useWallet();
  const wallet = publicKey?.toBase58();
  const balances = useWalletBalances();
  const { bets } = useUserBets(wallet);

  const stats = (() => {
    let total = 0;
    let won = 0;
    let openCount = 0;
    let resolvedCount = 0;
    let wins = 0;
    for (const b of bets) {
      const amt = Number.parseFloat(b.amountUsdc);
      if (Number.isFinite(amt)) total += amt;
      if (b.market.status === "active") openCount += 1;
      if (b.market.status === "resolved") {
        resolvedCount += 1;
        const winSide = b.market.outcome;
        if (winSide && winSide === b.side) {
          wins += 1;
          const pay =
            b.payoutAmount != null ? Number.parseFloat(b.payoutAmount) : 0;
          if (Number.isFinite(pay)) won += pay;
        }
      }
    }
    const winRate = resolvedCount > 0 ? (wins / resolvedCount) * 100 : 0;
    return { total, won, openCount, winRate };
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
                "USDC Balance",
                balances.isPending ? "—" : formatUSDC(balances.data?.usdc ?? 0),
              ],
              [
                "SOL Balance",
                balances.isPending
                  ? "—"
                  : `${formatSolAmount(balances.data?.sol ?? 0)} SOL`,
              ],
              ["Total Bet", formatUSDC(stats.total)],
              ["Total Won", formatUSDC(stats.won)],
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
                Open positions
              </p>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-white">
                {stats.openCount}
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
