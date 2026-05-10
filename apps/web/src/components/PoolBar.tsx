"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { formatPoolTotals } from "@/utils/format";

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function PoolBar({
  survivePool,
  rugPool,
  showLabels = true,
}: {
  /** Pool depth in lamports (integer). */
  survivePool: number;
  rugPool: number;
  showLabels?: boolean;
}) {
  const total = survivePool + rugPool;
  const survivePctRaw = total > 0 ? (survivePool / total) * 100 : 50;
  const survivePct = clampPct(survivePctRaw);
  const rugPct = clampPct(100 - survivePct);

  const surviveLabel = `SURVIVE ${survivePct.toFixed(1)}%`;
  const rugLabel = `RUG ${rugPct.toFixed(1)}%`;
  const { survive: surviveAmt, rug: rugAmt } = formatPoolTotals(
    survivePool,
    rugPool,
  );

  // Defer initial fill to next tick so animation runs from 0 → target.
  const mounted = useRef(false);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      const id = window.setTimeout(() => setPct(survivePct), 40);
      return () => window.clearTimeout(id);
    }
    setPct(survivePct);
    return undefined;
  }, [survivePct]);

  return (
    <div className="flex flex-col gap-1.5">
      {showLabels ? (
        <div className="flex items-center justify-between font-mono text-[11px] font-semibold tracking-wide">
          <span className="text-survive">{surviveLabel}</span>
          <span className="text-rug">{rugLabel}</span>
        </div>
      ) : null}

      <div className="relative flex h-2 w-full overflow-hidden border border-border bg-bg">
        <motion.div
          aria-hidden
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="h-full bg-survive"
        />
        <div className="h-full flex-1 bg-rug" />
      </div>

      {showLabels ? (
        <div className="flex items-center justify-between font-mono text-[10px] tabular-nums">
          <span className="text-survive/85">{surviveAmt}</span>
          <span className="text-rug/85">{rugAmt}</span>
        </div>
      ) : null}
    </div>
  );
}
