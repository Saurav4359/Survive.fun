"use client";

import type { BetSide, Market } from "@survivefun/types";
import { motion } from "framer-motion";
import { Shield, Skull } from "lucide-react";
import { useMemo, useState } from "react";

import { CountUp } from "@/components/CountUp";
import { solToDisplay, useWalletBalances } from "@/hooks/useWalletBalances";
import { QUICK_SOL_AMOUNTS, SOL_BET_LIMITS } from "@/utils/constants";
import {
  formatSolBetLine,
  parsePoolLamports,
  potentialPayoutLamports,
} from "@/utils/format";

function clampSol(n: number): number {
  return Math.min(SOL_BET_LIMITS.max, Math.max(SOL_BET_LIMITS.min, n));
}

/** Solana brand purple — header glyph only. */
const SOL_BRAND = "#9945FF";
const LIME_SELECTED = "#a3e635";

export type BetPanelProps = {
  market: Market;
  onBet: (side: BetSide, amountUi: number) => void | Promise<void>;
  position?: { side: BetSide; stakeSol: number } | null;
};

export function BetPanel({ market, onBet, position = null }: BetPanelProps) {
  const [side, setSide] = useState<BetSide>("survive");
  const [amountSol, setAmountSol] = useState<number>(0.1);
  const [pending, setPending] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);

  const balances = useWalletBalances();

  const surviveLamports = parsePoolLamports(market.survivePool);
  const rugLamports = parsePoolLamports(market.rugPool);

  const payoutLamports = useMemo(
    () =>
      potentialPayoutLamports(
        side,
        surviveLamports,
        rugLamports,
        solUiToLamportsSafe(amountSol),
      ),
    [side, surviveLamports, rugLamports, amountSol],
  );
  const payoutSolNum = Number(payoutLamports) / 1e9;

  const walletSol = balances.data?.sol ?? null;

  function validateAmount(ui: number): string | null {
    if (!Number.isFinite(ui)) return "Enter a valid amount.";
    if (ui < SOL_BET_LIMITS.min) {
      return `Minimum bet is ${SOL_BET_LIMITS.min} SOL.`;
    }
    if (ui > SOL_BET_LIMITS.max) {
      return `Maximum bet is ${SOL_BET_LIMITS.max} SOL.`;
    }
    if (walletSol != null && ui > walletSol) {
      return "Amount exceeds wallet SOL balance.";
    }
    return null;
  }

  async function handlePlaceBet() {
    const clamped = clampSol(amountSol);
    const err = validateAmount(clamped);
    setAmountError(err);
    if (err) return;

    setPending(true);
    try {
      await onBet(side, clamped);
    } finally {
      setPending(false);
    }
  }

  const sideLabel = side === "survive" ? "SURVIVE" : "RUG";

  return (
    <div className="border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-white">
          Place a bet{" "}
          <span className="font-mono text-[10px] tracking-[0.18em]" style={{ color: SOL_BRAND }}>
            ◎ SOL
          </span>
        </h3>
      </div>

      <div className="space-y-4 p-4">
        {balances.data != null ? (
          <p className="font-mono text-[10px] text-fg-muted">
            Balance:{" "}
            <span className="tabular-nums text-white">
              ◎ {solToDisplay(balances.data.lamports)} SOL
            </span>
          </p>
        ) : null}

        <div className="relative grid grid-cols-2 gap-0 border border-border bg-bg p-1">
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            aria-hidden
            className="pointer-events-none absolute top-1 bottom-1 w-[calc(50%-4px)]"
            style={{
              left: side === "survive" ? 4 : "calc(50% + 0px)",
              backgroundColor: side === "survive" ? LIME_SELECTED : "#ef4444",
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

        <div className="space-y-2">
          <label
            htmlFor="bet-amount-sol"
            className="block font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted"
          >
            Amount ({SOL_BET_LIMITS.min} – {SOL_BET_LIMITS.max} SOL)
          </label>
          <div className="relative">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-base font-bold tabular-nums text-fg-soft"
              aria-hidden
            >
              ◎
            </span>
            <input
              id="bet-amount-sol"
              type="number"
              inputMode="decimal"
              min={SOL_BET_LIMITS.min}
              max={SOL_BET_LIMITS.max}
              step={0.0001}
              value={Number.isFinite(amountSol) ? amountSol : SOL_BET_LIMITS.min}
              onChange={(e) => {
                const v = Number.parseFloat(e.target.value);
                if (!Number.isFinite(v)) {
                  setAmountSol(SOL_BET_LIMITS.min);
                  setAmountError(validateAmount(SOL_BET_LIMITS.min));
                  return;
                }
                const c = clampSol(v);
                setAmountSol(c);
                setAmountError(validateAmount(c));
              }}
              placeholder="0.00"
              className="w-full rounded-md border border-border bg-bg py-3 pl-10 pr-3 font-mono text-base font-semibold tabular-nums text-white transition-shadow focus:border-[#a3e635] focus:outline-none focus:shadow-glow-sm"
            />
          </div>
          {amountError ? (
            <p className="font-mono text-[10px] text-rug" role="alert">
              {amountError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_SOL_AMOUNTS.map((q) => {
              const active = Math.abs(amountSol - q) < 1e-9;
              const pick = clampSol(q);
              return (
                <motion.button
                  key={q}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setAmountSol(pick);
                    setAmountError(validateAmount(pick));
                  }}
                  className={
                    active
                      ? "rounded-md px-3 py-1.5 font-mono text-[10px] font-bold tabular-nums text-ink"
                      : "rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-[10px] font-bold tabular-nums text-fg-soft transition-colors hover:border-[#a3e635] hover:text-[#a3e635]"
                  }
                  style={active ? { backgroundColor: LIME_SELECTED } : undefined}
                >
                  {q} SOL
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="border border-border bg-bg px-4 py-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted">
            If {sideLabel} wins:
          </p>
          <p
            className="mt-1 font-mono text-2xl font-bold tabular-nums"
            style={{ color: LIME_SELECTED }}
          >
            <CountUp
              key={`${side}-${amountSol}-${surviveLamports}-${rugLamports}`}
              to={payoutSolNum}
              duration={0.5}
              format={(n) => formatSolBetLine(n)}
            />
          </p>
          <p className="mt-1 font-mono text-[10px] text-fg-muted">
            {formatSolBetLine(amountSol)} → {formatSolBetLine(payoutSolNum)}{" "}
            (gross)
          </p>
        </div>

        <motion.button
          type="button"
          whileHover={
            market.status === "active" && !pending ? { scale: 1.01 } : undefined
          }
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
            <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-white">
              {position.side === "survive" ? "SURVIVE" : "RUG"} ·{" "}
              {formatSolBetLine(position.stakeSol)}
            </p>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}

function solUiToLamportsSafe(sol: number): bigint {
  if (!Number.isFinite(sol) || sol <= 0) return 0n;
  return BigInt(Math.floor(sol * 1e9));
}
