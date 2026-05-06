function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function PoolBar({
  survivePool,
  rugPool,
}: {
  survivePool: number;
  rugPool: number;
}) {
  const total = survivePool + rugPool;
  const survivePctRaw = total > 0 ? (survivePool / total) * 100 : 50;
  const survivePct = clampPct(survivePctRaw);
  const rugPct = clampPct(100 - survivePct);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between font-mono text-xs font-medium text-muted">
        <span className="text-survive">SURVIVE {survivePct.toFixed(1)}%</span>
        <span className="text-rug">RUG {rugPct.toFixed(1)}%</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden border border-border">
        <div
          className="h-full bg-survive transition-[width] duration-300 ease-out"
          style={{ width: `${survivePct}%` }}
        />
        <div className="h-full flex-1 bg-rug" />
      </div>
    </div>
  );
}
