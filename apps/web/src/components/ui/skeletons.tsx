/** Loading placeholders — Tailwind `animate-pulse` only. */

function Shimmer({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-border/70 ${className}`}
      aria-hidden
    />
  );
}

export function MarketCardSkeleton() {
  return (
    <article
      className="card-cyber flex flex-col gap-4 border-l-[3px] border-l-border p-5 pl-4"
      aria-hidden
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Shimmer className="h-6 w-3/4 max-w-[200px]" />
          <Shimmer className="h-4 w-20" />
        </div>
        <Shimmer className="h-8 w-24" />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 border border-border bg-surface px-4 py-3">
        <div className="space-y-2">
          <Shimmer className="h-3 w-12" />
          <Shimmer className="h-8 w-28" />
        </div>
        <Shimmer className="h-12 w-20" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Shimmer className="h-16 w-full" />
        <Shimmer className="h-16 w-full" />
      </div>
      <Shimmer className="h-2 w-full" />
      <Shimmer className="h-12 w-full rounded-lg" />
    </article>
  );
}

export function MarketDetailPageSkeleton() {
  return (
    <div className="min-h-screen pb-16 pt-6 sm:pb-24 sm:pt-10">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className="mb-8 h-5 w-28 animate-pulse rounded bg-border/80" />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5 xl:gap-10">
          <div className="min-w-0 space-y-6 xl:col-span-3">
            <div className="card-cyber space-y-4 p-5 sm:p-6">
              <div className="flex gap-4">
                <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-border/80" />
                <div className="flex-1 space-y-3">
                  <div className="h-8 w-full max-w-xs animate-pulse rounded bg-border/80" />
                  <div className="h-10 w-48 animate-pulse rounded bg-border/80" />
                </div>
              </div>
              <div className="h-24 w-full animate-pulse rounded-lg bg-border/50" />
            </div>
            <ChartSkeleton />
            <div className="flex gap-px">
              <div className="h-12 flex-1 animate-pulse bg-border/60" />
              <div className="h-12 flex-1 animate-pulse bg-border/50" />
              <div className="h-12 flex-1 animate-pulse bg-border/40" />
            </div>
            <div className="card-cyber h-48 animate-pulse bg-border/30" />
          </div>
          <div className="space-y-5 xl:col-span-2">
            <div className="card-cyber space-y-4 p-5 sm:p-6">
              <div className="mx-auto h-4 w-24 animate-pulse rounded bg-border/80" />
              <div className="mx-auto h-12 w-48 animate-pulse rounded bg-border/80" />
              <div className="h-3 w-full animate-pulse rounded bg-border/50" />
            </div>
            <BetPanelSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}

export function BetPanelSkeleton() {
  return (
    <div className="card-cyber space-y-5 p-5" aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <Shimmer className="h-5 w-36" />
        <Shimmer className="h-4 w-24" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Shimmer className="h-14 w-full rounded-lg" />
        <Shimmer className="h-14 w-full rounded-lg" />
      </div>
      <div className="space-y-2">
        <Shimmer className="h-3 w-24" />
        <Shimmer className="h-11 w-full rounded-lg" />
        <div className="flex flex-wrap gap-2">
          <Shimmer className="h-8 w-14 rounded-lg" />
          <Shimmer className="h-8 w-14 rounded-lg" />
          <Shimmer className="h-8 w-14 rounded-lg" />
        </div>
      </div>
      <Shimmer className="h-28 w-full rounded-lg" />
      <Shimmer className="h-12 w-full rounded-lg" />
    </div>
  );
}

/** Overlay inside chart card while lightweight-charts initializes */
export function BetsPageSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="card-cyber h-28 animate-pulse bg-border/25 sm:h-24"
        />
      ))}
    </div>
  );
}

export function ChartAreaSkeleton() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end bg-[#030303]"
      aria-hidden
    >
      <div className="h-[85%] w-full animate-pulse bg-gradient-to-t from-accent/10 via-border/25 to-transparent" />
    </div>
  );
}

export function ChartSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col border border-border bg-[#050505] ${className}`}
      aria-hidden
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <Shimmer className="h-4 w-24" />
        <div className="flex gap-1">
          <Shimmer className="h-8 w-10 rounded-lg" />
          <Shimmer className="h-8 w-10 rounded-lg" />
          <Shimmer className="h-8 w-10 rounded-lg" />
        </div>
      </div>
      <div className="relative h-[280px] w-full sm:h-[340px] p-4">
        <Shimmer className="h-full w-full rounded-md opacity-50" />
      </div>
    </div>
  );
}
