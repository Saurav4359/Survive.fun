"use client";

import type { Market } from "@survivefun/types";
import { motion } from "framer-motion";
import { Clock, TrendingUp } from "lucide-react";
import Link from "next/link";

import { formatPoolTotals, formatUsd, parsePoolLamports } from "@/utils/format";

import { PoolBar } from "./PoolBar";
import { TokenThumb } from "./TokenThumb";
import { Timer } from "./Timer";

type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

function inferRisk(market: Market): RiskLevel {
  const liq = market.openLiquidity
    ? Number.parseFloat(market.openLiquidity)
    : 0;
  if (Number.isFinite(liq) && liq > 50_000) return "LOW";
  if (Number.isFinite(liq) && liq > 10_000) return "MEDIUM";
  return "HIGH";
}

const RISK_STYLES: Record<RiskLevel, string> = {
  HIGH: "border-rug/60 text-rug",
  MEDIUM: "border-warn/60 text-warn",
  LOW: "border-accent/60 text-accent",
};

const SOL_BADGE = "#9945FF";

export function MarketCard({ market }: { market: Market }) {
  const name = market.tokenName?.trim() || "Unknown token";
  const ticker = market.tokenTicker?.trim() || "—";
  const survive = Number(parsePoolLamports(market.survivePool));
  const rug = Number(parsePoolLamports(market.rugPool));
  const poolCells = formatPoolTotals(survive, rug);
  const open = market.openPrice;
  const priceNum = open != null ? Number.parseFloat(open) : NaN;
  const hasPrice = Number.isFinite(priceNum);
  const expiresAt = new Date(market.expiresAt);
  const risk = inferRisk(market);
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="group relative"
    >
      <Link
        href={`/market/${market.id}`}
        className="relative flex flex-col gap-4 border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 hover:border-accent hover:shadow-glow-sm focus-visible:border-accent focus-visible:shadow-glow-sm focus-visible:outline-none"
      >
        <header className="flex items-start gap-3">
          <TokenThumb mint={market.tokenMint} ticker={ticker} size={40} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-base font-bold tracking-tight text-white">
              {name}
            </h3>
            <p className="font-mono text-xs font-medium text-fg-muted">
              ${ticker}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em]"
              style={{ color: SOL_BADGE }}
            >
              <span aria-hidden>◎</span> SOL
            </span>
            <span
              className={`rounded-sm border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider bg-bg ${RISK_STYLES[risk]}`}
            >
              {risk}
            </span>
          </div>
        </header>

        <div className="flex items-end justify-between gap-3 border border-border bg-bg px-3 py-2">
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-fg-muted">
              Price
            </p>
            <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-white">
              {hasPrice ? formatUsd(priceNum) : "—"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-right">
            <TrendingUp className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
            <div>
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-fg-muted">
                24h
              </p>
              <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-fg-soft">
                —
              </p>
            </div>
          </div>
        </div>

        <PoolBar survivePool={survive} rugPool={rug} />

        <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
          <div className="border border-border bg-bg px-2.5 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-survive">
              Survive pool
            </p>
            <p className="mt-0.5 font-mono tabular-nums text-white">
              {poolCells.survive}
            </p>
          </div>
          <div className="border border-border bg-bg px-2.5 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-rug">
              Rug pool
            </p>
            <p className="mt-0.5 font-mono tabular-nums text-white">
              {poolCells.rug}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <Clock className="h-3.5 w-3.5 text-accent" aria-hidden />
            <Timer expiresAt={expiresAt} />
          </div>
          <span className="rounded-sm border border-accent px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-accent transition-colors group-hover:bg-accent group-hover:text-ink">
            Bet
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
