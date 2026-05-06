"use client";

import type { BetSide, Market } from "@survivefun/types";
import { motion } from "framer-motion";
import { Coins, Shield, Skull } from "lucide-react";
import { useMemo, useState } from "react";

import { BET_LIMITS } from "@/utils/constants";
import { formatUSDC } from "@/utils/format";

function parsePool(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function clampAmount(n: number): number {
  return Math.min(BET_LIMITS.max, Math.max(BET_LIMITS.min, n));
}

/** Parimutuel-style gross payout if this side wins (includes returned stake). */
function potentialPayoutUsdc(
  side: BetSide,
  survive: number,
  rug: number,
  amount: number,
): number {
  if (amount <= 0 || !Number.isFinite(amount)) return 0;
  if (side === "survive") {
    const ts = survive + amount;
    const tr = rug;
    if (ts <= 0) return amount;
    return (amount * (ts + tr)) / ts;
  }
  const tr = rug + amount;
  const ts = survive;
  if (tr <= 0) return amount;
  return (amount * (ts + tr)) / tr;
}

const QUICK_AMOUNTS = [5, 10, 25, 50] as const;

export type BetPanelProps = {
  market: Market;
  onBet: (side: BetSide, amountUsdc: number) => void | Promise<void>;
  position?: { side: BetSide; amountUsdc: number } | null;
};

export function BetPanel({ market, onBet, position = null }: BetPanelProps) {
  const [side, setSide] = useState<BetSide>("survive");
  const [amount, setAmount] = useState<number>(5);
  const [pending, setPending] = useState(false);

  const survive = parsePool(market.survivePool);
  const rug = parsePool(market.rugPool);

  const payout = useMemo(
    () => potentialPayoutUsdc(side, survive, rug, amount),
    [side, survive, rug, amount],
  );
  const profit = payout - amount;

  const setClamped = (n: number) => setAmount(clampAmount(n));

  async function handlePlaceBet() {
    const a = clampAmount(amount);
    setPending(true);
    try {
      await onBet(side, a);
    } finally {
      setPending(false);
    }
  }

  return (
    <motion.div layout className="card-cyber space-y-5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-foreground">
          <Shield className="h-4 w-4 text-accent" aria-hidden />
          <h3 className="font-display text-sm font-bold uppercase tracking-widest">
            Place a bet
          </h3>
        </div>
        <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted">
          USDC · devnet
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Bet side">
        <motion.button
          type="button"
          role="tab"
          aria-selected={side === "survive"}
          onClick={() => setSide("survive")}
          whileTap={{ scale: 0.99 }}
          className={
            side === "survive"
              ? "flex items-center justify-center gap-2 rounded-lg border-2 border-survive bg-survive py-3 font-display text-sm font-bold uppercase tracking-wide text-ink shadow-glow-sm transition-all duration-200"
              : "flex items-center justify-center gap-2 rounded-lg border-2 border-survive bg-transparent py-3 font-display text-sm font-bold uppercase tracking-wide text-survive transition-all duration-200 hover:bg-survive hover:text-ink hover:shadow-glow-sm"
          }
        >
          <Shield className="h-4 w-4" aria-hidden />
          SURVIVE
        </motion.button>
        <motion.button
          type="button"
          role="tab"
          aria-selected={side === "rug"}
          onClick={() => setSide("rug")}
          whileTap={{ scale: 0.99 }}
          className={
            side === "rug"
              ? "flex items-center justify-center gap-2 rounded-lg border-2 border-rug bg-rug py-3 font-display text-sm font-bold uppercase tracking-wide text-ink shadow-[0_0_20px_rgba(239,68,68,0.25)] transition-all duration-200"
              : "flex items-center justify-center gap-2 rounded-lg border-2 border-rug bg-transparent py-3 font-display text-sm font-bold uppercase tracking-wide text-rug transition-all duration-200 hover:bg-rug hover:text-ink hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]"
          }
        >
          <Skull className="h-4 w-4" aria-hidden />
          RUG
        </motion.button>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="bet-amount"
          className="text-xs font-semibold uppercase tracking-widest text-muted"
        >
          Amount ({formatUSDC(BET_LIMITS.min)} – {formatUSDC(BET_LIMITS.max)})
        </label>
        <div className="relative">
          <Coins
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            id="bet-amount"
            type="number"
            inputMode="decimal"
            min={BET_LIMITS.min}
            max={BET_LIMITS.max}
            step={1}
            value={Number.isFinite(amount) ? amount : BET_LIMITS.min}
            onChange={(e) => {
              const v = Number.parseFloat(e.target.value);
              if (!Number.isFinite(v)) {
                setAmount(BET_LIMITS.min);
                return;
              }
              setClamped(v);
            }}
            className="w-full rounded-lg border border-border bg-surface py-3 pl-10 pr-3 font-mono text-sm font-medium tabular-nums text-foreground transition-all duration-200 focus:border-border-glow focus:outline-none focus:ring-2 focus:ring-accent/35 focus:shadow-glow-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((q) => (
            <motion.button
              key={q}
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => setClamped(q)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-xs font-semibold tabular-nums text-fg-soft transition-all duration-200 hover:border-border-glow hover:text-accent-bright hover:shadow-glow-sm"
            >
              {formatUSDC(q)}
            </motion.button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border-glow/40 bg-accent/5 px-4 py-4 shadow-inset-glow">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Potential win (est.)
        </p>
        <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-accent-bright">
          {formatUSDC(profit)}
        </p>
        <p className="mt-2 font-mono text-[11px] text-fg-soft">
          Gross return {formatUSDC(payout)} if {side === "survive" ? "SURVIVE" : "RUG"}{" "}
          resolves in your favor (simplified pool model).
        </p>
      </div>

      {position ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={
            position.side === "survive"
              ? "rounded-lg border border-survive/40 bg-survive/10 px-4 py-3"
              : "glitch-rug rounded-lg border border-rug/40 bg-rug/10 px-4 py-3"
          }
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Your position
          </p>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground">
            {position.side === "survive" ? "SURVIVE" : "RUG"} ·{" "}
            {formatUSDC(position.amountUsdc)}
          </p>
        </motion.div>
      ) : null}

      <motion.button
        type="button"
        layout
        disabled={pending || market.status !== "active"}
        whileTap={{ scale: market.status === "active" && !pending ? 0.99 : 1 }}
        onClick={() => void handlePlaceBet()}
        className="w-full rounded-lg border border-accent bg-accent py-3 font-display text-sm font-bold uppercase tracking-widest text-ink transition-all duration-200 hover:bg-transparent hover:text-accent-bright hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Placing…" : "Place Bet"}
      </motion.button>
    </motion.div>
  );
}
