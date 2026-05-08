"use client";

import type { BetSide, Market } from "@survivefun/types";
import { motion } from "framer-motion";
import { Shield, Skull } from "lucide-react";
import { useMemo, useState } from "react";

import { CountUp } from "@/components/CountUp";
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

  const sideLabel = side === "survive" ? "SURVIVE" : "RUG";

  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-white">
          Place a bet
        </h3>
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
          USDC · devnet
        </span>
      </div>

      <div className="space-y-4 p-4">
        {/* Side toggle */}
        <div className="relative grid grid-cols-2 gap-0 border border-border bg-bg p-1">
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            aria-hidden
            className="pointer-events-none absolute top-1 bottom-1 w-[calc(50%-4px)]"
            style={{
              left: side === "survive" ? 4 : "calc(50% + 0px)",
              backgroundColor: side === "survive" ? "#cdf078" : "#ef4444",
            }}
          />
          <button
            type="button"
            onClick={() => setSide("survive")}
            className="relative z-[1] flex items-center justify-center gap-2 py-2.5 font-display text-xs font-bold uppercase tracking-[0.15em] transition-colors"
            aria-pressed={side === "survive"}
          >
            <Shield
              className={`h-3.5 w-3.5 ${side === "survive" ? "text-ink" : "text-survive"}`}
              aria-hidden
            />
            <span className={side === "survive" ? "text-ink" : "text-survive"}>
              SURVIVE
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSide("rug")}
            className="relative z-[1] flex items-center justify-center gap-2 py-2.5 font-display text-xs font-bold uppercase tracking-[0.15em] transition-colors"
            aria-pressed={side === "rug"}
          >
            <Skull
              className={`h-3.5 w-3.5 ${side === "rug" ? "text-white" : "text-rug"}`}
              aria-hidden
            />
            <span className={side === "rug" ? "text-white" : "text-rug"}>
              RUG
            </span>
          </button>
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <label
            htmlFor="bet-amount"
            className="block font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted"
          >
            Amount ({formatUSDC(BET_LIMITS.min)} – {formatUSDC(BET_LIMITS.max)})
          </label>
          <div className="relative">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-base font-bold text-fg-muted"
              aria-hidden
            >
              $
            </span>
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
              className="w-full rounded-md border border-border bg-bg py-3 pl-8 pr-3 font-mono text-base font-semibold tabular-nums text-white transition-shadow focus:border-accent focus:outline-none focus:shadow-glow-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_AMOUNTS.map((q) => {
              const active = amount === q;
              return (
                <motion.button
                  key={q}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setClamped(q)}
                  className={
                    active
                      ? "rounded-md bg-accent px-3 py-1.5 font-mono text-[10px] font-bold tabular-nums text-ink"
                      : "rounded-md border border-accent/60 bg-bg px-3 py-1.5 font-mono text-[10px] font-bold tabular-nums text-accent transition-colors hover:border-accent hover:bg-accent hover:text-ink"
                  }
                >
                  ${q}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Potential win */}
        <div className="border border-border bg-bg px-4 py-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted">
            If {sideLabel} wins:
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-accent">
            <CountUp
              key={`${side}-${amount}-${survive}-${rug}`}
              to={payout}
              duration={0.5}
              format={(n) => formatUSDC(n)}
            />
          </p>
          <p className="mt-1 font-mono text-[10px] text-fg-muted">
            ${amount} → {formatUSDC(payout)} (gross)
          </p>
        </div>

        {/* Place bet */}
        <motion.button
          type="button"
          whileHover={market.status === "active" && !pending ? { scale: 1.01 } : undefined}
          whileTap={{ scale: 0.97 }}
          disabled={pending || market.status !== "active"}
          onClick={() => void handlePlaceBet()}
          className="flex w-full items-center justify-center rounded-md bg-accent px-4 py-3 font-display text-xs font-bold uppercase tracking-[0.2em] text-ink transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? (
            <span className="flex items-center gap-2">
              <span
                className="h-3 w-3 animate-spin rounded-full border-2 border-ink/30 border-t-ink"
                aria-hidden
              />
              Placing…
            </span>
          ) : (
            "Place Bet"
          )}
        </motion.button>

        {position ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={
              position.side === "survive"
                ? "border border-border border-l-[3px] border-l-survive bg-bg px-3 py-2.5"
                : "border border-border border-l-[3px] border-l-rug bg-bg px-3 py-2.5"
            }
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted">
              Your position
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-white">
              {position.side === "survive" ? "SURVIVE" : "RUG"} ·{" "}
              {formatUSDC(position.amountUsdc)}
            </p>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
