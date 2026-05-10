/**
 * Loading placeholders — Tailwind animate-pulse only, NO gradients, pure black + lime theme.
 */

function Shimmer({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse bg-surface ${className}`}
      aria-hidden
    />
  );
}

export function MarketCardSkeleton() {
  return (
    <article
      className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5"
      aria-hidden
    >
      <div className="flex items-start gap-4">
        <Shimmer className="size-11 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Shimmer className="h-4 w-3/4 max-w-[200px]" />
          <Shimmer className="h-3 w-16" />
        </div>
        <div className="flex flex-col gap-2">
          <Shimmer className="h-6 w-14 rounded-md" />
          <Shimmer className="h-6 w-12 rounded-md" />
        </div>
      </div>
      <Shimmer className="h-[72px] w-full rounded-lg" />
      <Shimmer className="h-2 w-full rounded-sm" />
      <div className="grid grid-cols-2 gap-3">
        <Shimmer className="h-[72px] w-full rounded-lg" />
        <Shimmer className="h-[72px] w-full rounded-lg" />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Shimmer className="h-4 w-24" />
        <Shimmer className="h-8 w-16 rounded-md" />
      </div>
    </article>
  );
}

export function MarketDetailPageSkeleton() {
  return (
    <div className="mx-auto min-h-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <Shimmer className="h-5 w-28" />
      <div className="mt-6 border border-border bg-card p-5">
        <div className="flex gap-4">
          <Shimmer className="h-14 w-14" />
          <div className="flex flex-1 flex-col gap-3">
            <Shimmer className="h-8 w-full max-w-xs" />
            <Shimmer className="h-10 w-48" />
          </div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="flex flex-col gap-6 xl:col-span-3">
          <ChartSkeleton />
          <div className="grid grid-cols-3 gap-3">
            <Shimmer className="h-20" />
            <Shimmer className="h-20" />
            <Shimmer className="h-20" />
          </div>
        </div>
        <div className="flex flex-col gap-5 xl:col-span-2">
          <Shimmer className="h-48" />
          <BetPanelSkeleton />
        </div>
      </div>
    </div>
  );
}

export function BetPanelSkeleton() {
  return (
    <div
      className="flex flex-col gap-4 border border-border bg-card p-5"
      aria-hidden
    >
      <div className="flex items-center justify-between gap-3">
        <Shimmer className="h-4 w-32" />
        <Shimmer className="h-3 w-20" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Shimmer className="h-12 w-full" />
        <Shimmer className="h-12 w-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Shimmer className="h-3 w-24" />
        <Shimmer className="h-11 w-full" />
        <div className="flex gap-2">
          <Shimmer className="h-7 w-14" />
          <Shimmer className="h-7 w-14" />
          <Shimmer className="h-7 w-14" />
          <Shimmer className="h-7 w-14" />
        </div>
      </div>
      <Shimmer className="h-20 w-full" />
      <Shimmer className="h-11 w-full" />
    </div>
  );
}

export function BetsPageSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <Shimmer key={i} className="h-20 sm:h-16" />
      ))}
    </div>
  );
}

export function ChartAreaSkeleton() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex items-end bg-bg"
      aria-hidden
    >
      <div className="h-[70%] w-full animate-pulse bg-surface" />
    </div>
  );
}

export function ChartSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col border border-border bg-card ${className}`}
      aria-hidden
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <Shimmer className="h-4 w-24" />
        <div className="flex gap-1">
          <Shimmer className="h-7 w-10" />
          <Shimmer className="h-7 w-10" />
          <Shimmer className="h-7 w-10" />
        </div>
      </div>
      <div className="relative h-[280px] w-full p-4 sm:h-[340px]">
        <Shimmer className="h-full w-full opacity-50" />
      </div>
    </div>
  );
}
