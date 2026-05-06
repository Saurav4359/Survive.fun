"use client";

import type { Market } from "@survivefun/types";
import {
  Activity,
  ArrowRight,
  Layers,
  PlusCircle,
  Radio,
  Search,
  Users,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";

import { MarketCard } from "@/components/MarketCard";
import { formatPool, formatWallet } from "@/utils/format";

const DEMO_MARKETS: Market[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    tokenMint: "So11111111111111111111111111111111111111112",
    tokenName: "Survive Sendit",
    tokenTicker: "SND",
    creatorWallet: "Creator1111111111111111111111111111111111",
    durationSeconds: 3600,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    survivePool: "12450.5",
    rugPool: "8320.25",
    openPrice: "0.00042",
    openLiquidity: "210000",
    devWallet: null,
    status: "active",
    outcome: null,
    onChainAddress: null,
    createdAt: new Date().toISOString(),
    totalBettors: 128,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    tokenName: "Only Up",
    tokenTicker: "UP",
    creatorWallet: "Creator2222222222222222222222222222222222",
    durationSeconds: 21600,
    expiresAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    survivePool: "50200",
    rugPool: "12800",
    openPrice: "0.0012",
    openLiquidity: "480000",
    devWallet: "Dev2222222222222222222222222222222222222",
    status: "active",
    outcome: null,
    onChainAddress: null,
    createdAt: new Date().toISOString(),
    totalBettors: 342,
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    tokenName: "Roundtrip Risk",
    tokenTicker: "RISK",
    creatorWallet: "Creator3333333333333333333333333333333333",
    durationSeconds: 86400,
    expiresAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
    survivePool: "980",
    rugPool: "4100",
    openPrice: "0.0000098",
    openLiquidity: "12000",
    devWallet: null,
    status: "active",
    outcome: null,
    onChainAddress: null,
    createdAt: new Date().toISOString(),
    totalBettors: 56,
  },
];

const FEED = [
  {
    id: "1",
    title: "Pool rebalance",
    detail: "SND · survive lead +2.4%",
    tone: "neutral" as const,
  },
  {
    id: "2",
    title: "Large SURVIVE bet",
    detail: formatWallet("Bettor9xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRu") + " · 250 USDC",
    tone: "survive" as const,
  },
  {
    id: "3",
    title: "New market",
    detail: "RISK · 24h window",
    tone: "accent" as const,
  },
  {
    id: "4",
    title: "Price update",
    detail: "UP · +6.2% (DexScreener)",
    tone: "neutral" as const,
  },
];

export default function HomePage() {
  const [tokenQuery, setTokenQuery] = useState("");

  const filtered = useMemo(() => {
    const q = tokenQuery.trim().toLowerCase();
    if (!q) return DEMO_MARKETS;
    return DEMO_MARKETS.filter((m) => {
      return (
        m.tokenMint.toLowerCase().includes(q) ||
        (m.tokenName?.toLowerCase().includes(q) ?? false) ||
        (m.tokenTicker?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [tokenQuery]);

  const totalVolume = useMemo(
    () =>
      DEMO_MARKETS.reduce((sum, m) => {
        const s = Number.parseFloat(m.survivePool) || 0;
        const r = Number.parseFloat(m.rugPool) || 0;
        return sum + s + r;
      }, 0),
    [],
  );

  const totalBettors = useMemo(
    () => DEMO_MARKETS.reduce((sum, m) => sum + m.totalBettors, 0),
    [],
  );

  return (
    <div className="min-h-screen animate-fade-in pb-24 pt-8 sm:pt-14">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:pl-12 lg:pr-8">
        {/* Terminal status strip — data-dense, sharp dividers */}
        <section
          aria-label="Platform stats"
          className="mb-14 grid grid-cols-1 border border-border sm:grid-cols-12"
        >
          <div className="flex items-center gap-4 border-b border-border bg-card px-5 py-4 transition-colors duration-200 hover:bg-surface sm:col-span-5 sm:border-b-0 sm:border-r">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-surface text-accent">
              <Zap className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                Volume (demo)
              </p>
              <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
                {formatPool(totalVolume)} USDC
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 border-b border-border bg-card px-5 py-4 transition-colors duration-200 hover:bg-surface sm:col-span-4 sm:border-b-0 sm:border-r">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-surface text-accent">
              <Layers className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                Active markets
              </p>
              <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
                {DEMO_MARKETS.length}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-card px-5 py-4 transition-colors duration-200 hover:bg-surface sm:col-span-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-surface text-accent">
              <Users className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                Bettors (demo)
              </p>
              <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
                {totalBettors}
              </p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="min-w-0 space-y-12 lg:col-span-7 xl:col-span-8">
            <div className="header-scanline border-l-2 border-accent pl-5 sm:pl-8">
              <div className="relative z-[1] flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
                    Terminal / markets
                  </p>
                  <h1 className="font-display mt-2 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
                    Survive.fun
                  </h1>
                  <p className="mt-3 max-w-lg font-mono text-sm leading-relaxed text-fg-soft">
                    Binary pools on memecoin outcomes. SURVIVE vs RUG. Sharp prices,
                    sharp risk.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-accent bg-accent px-6 py-3 font-display text-xs font-bold uppercase tracking-widest text-ink shadow-glow-sm transition-all duration-200 hover:border-accent-bright hover:bg-transparent hover:text-accent-bright hover:shadow-none sm:self-auto"
                >
                  <PlusCircle className="h-4 w-4" aria-hidden />
                  Create Market
                </button>
              </div>
            </div>

            <div className="relative max-w-3xl">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                type="search"
                value={tokenQuery}
                onChange={(e) => setTokenQuery(e.target.value)}
                placeholder="Search or paste token mint…"
                className="w-full rounded-lg border border-border bg-surface py-3.5 pl-10 pr-4 font-mono text-sm text-foreground placeholder:text-muted transition-all duration-200 focus:border-border-glow focus:outline-none focus:ring-1 focus:ring-accent focus:shadow-glow-sm"
                aria-label="Search or paste token"
              />
            </div>

            <section aria-label="Active markets">
              <div className="mb-6 flex items-end justify-between gap-3 border-b border-border pb-3">
                <h2 className="font-display text-lg font-bold uppercase tracking-widest text-foreground">
                  Active markets
                </h2>
                <span className="font-mono text-xs text-muted">
                  {filtered.length} shown
                </span>
              </div>
              {filtered.length === 0 ? (
                <p className="border border-dashed border-border bg-surface/80 px-4 py-12 text-center font-mono text-sm text-muted">
                  No markets match that query. Try another mint or ticker.
                </p>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-2">
                  {filtered.map((market) => (
                    <MarketCard key={market.id} market={market} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside
            className="lg:col-span-5 xl:col-span-4 lg:pt-8 xl:pt-20"
            aria-label="Live feed"
          >
            <div className="card-cyber sticky top-8 space-y-4 p-5">
              <div className="header-scanline flex items-center justify-between gap-2 border-b border-border pb-4">
                <div className="relative z-[1] flex items-center gap-2">
                  <Radio className="h-4 w-4 text-accent" aria-hidden />
                  <h2 className="font-display text-xs font-bold uppercase tracking-widest text-foreground">
                    Live feed
                  </h2>
                </div>
                <span className="relative z-[1] rounded-lg border border-survive/30 bg-survive/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-survive">
                  Demo
                </span>
              </div>
              <ul className="space-y-2">
                {FEED.map((item) => (
                  <li key={item.id}>
                    <div
                      className={
                        item.tone === "survive"
                          ? "border border-survive/25 bg-survive/5 p-3 transition-colors duration-200 hover:border-survive/45"
                          : item.tone === "accent"
                            ? "border border-accent/30 bg-accent/10 p-3 transition-colors duration-200 hover:border-accent/50"
                            : "border border-border bg-surface p-3 transition-colors duration-200 hover:border-muted"
                      }
                    >
                      <div className="flex items-start gap-2">
                        <Activity
                          className={
                            item.tone === "survive"
                              ? "mt-0.5 h-4 w-4 shrink-0 text-survive"
                              : item.tone === "accent"
                                ? "mt-0.5 h-4 w-4 shrink-0 text-accent"
                                : "mt-0.5 h-4 w-4 shrink-0 text-muted"
                          }
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-sm font-semibold text-foreground">
                            {item.title}
                          </p>
                          <p className="mt-1 break-words font-mono text-xs text-muted">
                            {item.detail}
                          </p>
                        </div>
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
