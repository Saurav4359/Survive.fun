"use client";

import type { Market } from "@survivefun/types";
import { motion } from "framer-motion";
import { Clock, TrendingUp } from "lucide-react";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatUsd, parsePoolLamports } from "@/utils/format";

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
  HIGH: "border-rug text-rug shadow-[0_0_14px_-6px_var(--rug)]",
  MEDIUM: "border-warn/80 text-warn",
  LOW: "border-accent/70 text-accent",
};

const SOL_BADGE = "#9945FF";

const springHover = { type: "spring" as const, stiffness: 460, damping: 22 };

/** List grids use `staggerChildren`; these variants animate each card in. */
const cardListVariants = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 340, damping: 28 },
  },
};

export function MarketCard({ market }: { market: Market }) {
  const name = market.tokenName?.trim() || "Unknown token";
  const ticker = market.tokenTicker?.trim() || "—";
  const survive = Number(parsePoolLamports(market.survivePool));
  const rug = Number(parsePoolLamports(market.rugPool));
  const open = market.openPrice;
  const priceNum = open != null ? Number.parseFloat(open) : NaN;
  const hasPrice = Number.isFinite(priceNum);
  const expiresAt = new Date(market.expiresAt);
  const risk = inferRisk(market);

  return (
    <motion.div
      className="group/card-hover h-full"
      variants={cardListVariants}
      whileHover={{
        y: -6,
        transition: springHover,
      }}
      whileTap={{ scale: 0.992 }}
    >
      <Link
        href={`/market/${market.id}`}
        className="block h-full focus-visible:outline-none"
      >
        <Card
          size="sm"
          className={cn(
            /* Single hairline border — no stacked ring (reads thicker). */
            "h-full justify-between gap-2.5 rounded-lg border border-border bg-card py-0 shadow-none ring-0",
            "transition-[border-color,box-shadow] duration-200 ease-out",
            /* Hover: thin 1px accent stroke only; glow stays very soft */
            "hover:border-accent hover:shadow-[0_0_20px_-12px_var(--glow)]",
            "group-hover/card-hover:border-accent",
            "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/30",
          )}
        >
          <CardHeader className="flex flex-row items-start gap-3.5 px-4 pb-0 pt-3.5">
            <TokenThumb mint={market.tokenMint} ticker={ticker} size={52} />
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate border-0 p-0 font-display text-lg font-bold leading-snug tracking-tight text-white">
                {name}
              </CardTitle>
              <CardDescription className="mt-1 font-mono text-base font-medium leading-tight text-fg-muted">
                ${ticker}
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-md border border-border bg-bg px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.15em]"
                style={{ color: SOL_BADGE }}
              >
                <span aria-hidden>◎</span> SOL
              </span>
              <span
                className={cn(
                  "rounded-md border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider",
                  RISK_STYLES[risk],
                )}
              >
                {risk}
              </span>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-2.5 px-4 pb-0 pt-3">
            <div className="flex items-end justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-fg-muted">
                  Price
                </p>
                <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums leading-none text-white">
                  {hasPrice ? formatUsd(priceNum) : "—"}
                </p>
              </div>
              <div className="flex items-center gap-2 text-right">
                <TrendingUp className="size-4 text-fg-muted" aria-hidden />
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-fg-muted">
                    24h
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums leading-none text-fg-soft">
                    —
                  </p>
                </div>
              </div>
            </div>

            <PoolBar survivePool={survive} rugPool={rug} />
          </CardContent>

          <CardFooter className="mt-auto flex items-center justify-between gap-2 rounded-b-lg border-t border-border bg-transparent px-4 py-2.5">
            <div className="flex items-center gap-2 font-mono text-sm leading-none">
              <Clock className="size-4 text-accent" aria-hidden />
              <Timer expiresAt={expiresAt} className="text-base" />
            </div>
            <motion.span
              className="rounded-md border border-accent px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-accent transition-colors duration-200 group-hover/card-hover:bg-accent group-hover/card-hover:text-ink"
              whileHover={{ scale: 1.03 }}
              transition={{ type: "spring", stiffness: 500, damping: 24 }}
            >
              Bet
            </motion.span>
          </CardFooter>
        </Card>
      </Link>
    </motion.div>
  );
}
