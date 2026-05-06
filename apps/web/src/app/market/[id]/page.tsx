"use client";

import type { BetSide, Market, Token } from "@survivefun/types";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UTCTimestamp } from "lightweight-charts";

import { BetPanel } from "@/components/BetPanel";
import { LiveFeed } from "@/components/LiveFeed";
import { PoolBar } from "@/components/PoolBar";
import { RiskScore } from "@/components/RiskScore";
import { Timer } from "@/components/Timer";
import { formatPool, formatUSDC, formatWallet } from "@/utils/format";

/** Accent line on dark chart (theme primary). */
const CHART_LINE = "#86f0ad";

const DEMO_BY_ID: Record<string, Market> = {
  "11111111-1111-1111-1111-111111111111": {
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
    devWallet: "DevSo111111111111111111111111111111111111111",
    status: "active",
    outcome: null,
    onChainAddress: null,
    createdAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
    totalBettors: 128,
  },
  "22222222-2222-2222-2222-222222222222": {
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
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    totalBettors: 342,
  },
  "33333333-3333-3333-3333-333333333333": {
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
    createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    totalBettors: 56,
  },
};

function fallbackMarket(id: string): Market {
  return (
    DEMO_BY_ID[id] ??
    Object.values(DEMO_BY_ID)[0] ??
    ({
      id,
      tokenMint: "So11111111111111111111111111111111111111112",
      tokenName: "Unknown",
      tokenTicker: "???",
      creatorWallet: "Creator1111111111111111111111111111111111",
      durationSeconds: 3600,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      survivePool: "1000",
      rugPool: "1000",
      openPrice: "0.0001",
      openLiquidity: "50000",
      devWallet: null,
      status: "active",
      outcome: null,
      onChainAddress: null,
      createdAt: new Date().toISOString(),
      totalBettors: 0,
    } satisfies Market)
  );
}

function parseNum(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

type DetailTab = "about" | "holders" | "transactions";
type ChartTf = "5m" | "15m" | "1h";

const TF_CONFIG: Record<ChartTf, { stepSec: number; bars: number }> = {
  "5m": { stepSec: 300, bars: 72 },
  "15m": { stepSec: 900, bars: 64 },
  "1h": { stepSec: 3600, bars: 72 },
};

const DEMO_MARKET_CAP = "$1.24M";
const DEMO_HOLDERS_COUNT = "3,421";

const DEMO_HOLDERS = [
  { wallet: "9xKX…TZRu", pct: "6.8%", amt: "$82.4k" },
  { wallet: "7QmN…NoPq", pct: "4.1%", amt: "$49.2k" },
  { wallet: "Whal…9t0", pct: "3.2%", amt: "$38.5k" },
  { wallet: "Pump…1111", pct: "2.4%", amt: "$29.1k" },
  { wallet: "Demo…2222", pct: "1.9%", amt: "$23.0k" },
];

const DEMO_TXS = [
  { time: "14:22:08", kind: "Bet SURVIVE", amt: "$50 USDC" },
  { time: "14:18:51", kind: "Bet RUG", amt: "$25 USDC" },
  { time: "14:05:12", kind: "Bet SURVIVE", amt: "$10 USDC" },
  { time: "13:58:44", kind: "Bet SURVIVE", amt: "$100 USDC" },
  { time: "13:41:03", kind: "Bet RUG", amt: "$15 USDC" },
];

function formatTokenAgeShort(createdIso: string): string {
  const t = Date.parse(createdIso);
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 0) return "—";
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor(diff / 3_600_000);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  const m = Math.floor(diff / 60_000);
  return `${Math.max(1, m)}m`;
}

export default function MarketPage() {
  const params = useParams();
  const rawId = params?.id;
  const id =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] ?? "" : "";

  const [market, setMarket] = useState<Market>(() => fallbackMarket(id));
  const [detailTab, setDetailTab] = useState<DetailTab>("about");
  const [chartTf, setChartTf] = useState<ChartTf>("1h");
  const [position, setPosition] = useState<{
    side: BetSide;
    amountUsdc: number;
  } | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<import("lightweight-charts").IChartApi | null>(null);
  const seriesRef = useRef<import("lightweight-charts").ISeriesApi<"Line"> | null>(
    null,
  );
  const chartTfRef = useRef(chartTf);
  chartTfRef.current = chartTf;
  const openPriceRef = useRef(market.openPrice);
  openPriceRef.current = market.openPrice;

  useEffect(() => {
    setMarket(fallbackMarket(id));
    setPosition(null);
  }, [id]);

  const token: Token = useMemo(
    () => ({
      address: market.tokenMint,
      name: market.tokenName ?? "Token",
      symbol: market.tokenTicker ?? "TKN",
    }),
    [market.tokenMint, market.tokenName, market.tokenTicker],
  );

  const survive = parseNum(market.survivePool) ?? 0;
  const rug = parseNum(market.rugPool) ?? 0;
  const openLiquidityUsd = parseNum(market.openLiquidity);
  const pairCreatedAtSeconds = useMemo(() => {
    const t = Date.parse(market.createdAt);
    return Number.isFinite(t) ? Math.floor(t / 1000) : null;
  }, [market.createdAt]);

  const openPx = parseNum(market.openPrice);
  const demoPriceUsd =
    openPx != null ? openPx * 1.084 : null;
  const demoChange24hPct = 8.42;

  const tickerLetter = (market.tokenTicker ?? "?").slice(0, 1).toUpperCase();

  const seedSeries = useCallback((openPrice: string | null, tf: ChartTf) => {
    const series = seriesRef.current;
    if (!series) return;
    const base = parseNum(openPrice) ?? 0.0001;
    const { stepSec, bars } = TF_CONFIG[tf];
    const now = Math.floor(Date.now() / 1000);
    const points: { time: UTCTimestamp; value: number }[] = [];
    for (let i = bars - 1; i >= 0; i -= 1) {
      const t = (now - i * stepSec) as UTCTimestamp;
      const wobble = 1 + Math.sin(i / 5) * 0.04 + (i % 11) * 0.0015;
      points.push({ time: t, value: Math.max(1e-9, base * wobble) });
    }
    series.setData(points);
    chartApiRef.current?.timeScale().fitContent();
  }, []);

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return undefined;

    let cancelled = false;
    let chart: import("lightweight-charts").IChartApi | null = null;
    let ro: ResizeObserver | null = null;

    void (async () => {
      const { createChart, ColorType, CrosshairMode } = await import(
        "lightweight-charts"
      );
      if (cancelled || !chartContainerRef.current) return;

      chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "#000000" },
          textColor: "#6b7280",
        },
        grid: {
          vertLines: { color: "rgba(134, 240, 173, 0.07)" },
          horzLines: { color: "rgba(134, 240, 173, 0.07)" },
        },
        crosshair: {
          mode: CrosshairMode.Magnet,
          vertLine: {
            color: CHART_LINE,
            width: 1,
            labelBackgroundColor: "#3d8f62",
          },
          horzLine: {
            color: CHART_LINE,
            width: 1,
            labelBackgroundColor: "#3d8f62",
          },
        },
        rightPriceScale: { borderColor: "#1f1f1f" },
        timeScale: { borderColor: "#1f1f1f" },
      });

      const series = chart.addLineSeries({
        color: CHART_LINE,
        lineWidth: 2,
      });

      chartApiRef.current = chart;
      seriesRef.current = series;
      seedSeries(openPriceRef.current, chartTfRef.current);

      ro = new ResizeObserver(() => {
        if (!chartContainerRef.current || !chart) return;
        const { width, height } = chartContainerRef.current.getBoundingClientRect();
        chart.applyOptions({ width, height });
      });
      ro.observe(chartContainerRef.current);
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      chart?.remove();
      chartApiRef.current = null;
      seriesRef.current = null;
    };
  }, [id, seedSeries]);

  useEffect(() => {
    seedSeries(market.openPrice, chartTf);
  }, [market.openPrice, chartTf, seedSeries]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      const el = chartContainerRef.current;
      const chart = chartApiRef.current;
      if (!el || !chart) return;
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        chart.resize(width, height);
        chart.timeScale().fitContent();
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [chartTf]);

  const onBet = useCallback(async (side: BetSide, amountUsdc: number) => {
    await new Promise((r) => window.setTimeout(r, 450));
    setPosition({ side, amountUsdc });
    setMarket((m) => {
      const s = parseNum(m.survivePool) ?? 0;
      const ru = parseNum(m.rugPool) ?? 0;
      if (side === "survive") {
        return { ...m, survivePool: String(s + amountUsdc) };
      }
      return { ...m, rugPool: String(ru + amountUsdc) };
    });
  }, []);

  const devShown = market.devWallet ?? market.creatorWallet;

  return (
    <div className="min-h-screen animate-fade-in pb-16 pt-6 sm:pb-24 sm:pt-10">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="mb-8 flex flex-wrap items-center justify-between gap-3"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 border-b border-transparent font-mono text-sm font-medium text-muted transition-colors duration-200 hover:border-accent-bright hover:text-accent-bright"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Markets
          </Link>
          <span className="rounded-lg border border-border bg-surface px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted">
            {market.status}
          </span>
        </motion.div>

        <div className="grid grid-cols-1 gap-10 xl:grid-cols-5 xl:items-start xl:gap-10">
          {/* LEFT ~60% */}
          <motion.div
            className="min-w-0 space-y-6 xl:col-span-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: 0.05 }}
          >
            <div className="card-cyber space-y-5 p-5 sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent/25 font-mono text-xl font-bold text-accent-bright ring-2 ring-accent/40"
                  aria-hidden
                >
                  {tickerLetter}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2 gap-y-1">
                    <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                      {market.tokenName ?? "Token"}
                    </h1>
                    <span className="font-mono text-lg font-semibold text-accent-bright">
                      ${market.tokenTicker ?? "—"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                        Price
                      </p>
                      <p className="font-mono text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
                        {demoPriceUsd != null ? formatUSDC(demoPriceUsd) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                        24h
                      </p>
                      <p className="font-mono text-lg font-semibold tabular-nums text-survive">
                        +{demoChange24hPct.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <RiskScore
                token={token}
                liquidityUsd={openLiquidityUsd}
                pairCreatedAt={pairCreatedAtSeconds}
                devWalletPctHeld={14.5}
              />
            </div>

            <div className="card-cyber overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <p className="font-display text-xs font-bold uppercase tracking-widest text-foreground">
                  Price (USD)
                </p>
                <div
                  className="flex gap-1"
                  role="tablist"
                  aria-label="Chart timeframe"
                >
                  {(["5m", "15m", "1h"] as const).map((tf) => {
                    const active = chartTf === tf;
                    return (
                      <button
                        key={tf}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setChartTf(tf)}
                        className={
                          active
                            ? "rounded-lg border border-border-glow bg-accent/15 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-accent-bright"
                            : "rounded-lg border border-transparent px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted transition-colors hover:border-border hover:text-fg-soft"
                        }
                      >
                        {tf === "5m"
                          ? "5M"
                          : tf === "15m"
                            ? "15M"
                            : "1H"}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div ref={chartContainerRef} className="h-[280px] w-full sm:h-[340px]" />
            </div>

            <div className="flex flex-wrap gap-px border border-border bg-border">
              {(
                [
                  ["about", "About"],
                  ["holders", "Holders"],
                  ["transactions", "Transactions"],
                ] as const
              ).map(([key, label]) => {
                const active = detailTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDetailTab(key)}
                    className={
                      active
                        ? "min-w-[7rem] flex-1 rounded-none bg-accent/15 px-4 py-3 font-display text-xs font-bold uppercase tracking-widest text-accent-bright"
                        : "min-w-[7rem] flex-1 rounded-none bg-surface px-4 py-3 font-display text-xs font-semibold uppercase tracking-widest text-muted transition-colors hover:bg-card hover:text-fg-soft"
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="card-cyber min-h-[200px] p-5 sm:p-6">
              {detailTab === "about" ? (
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                      Liquidity
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-medium text-foreground">
                      {openLiquidityUsd != null
                        ? formatUSDC(openLiquidityUsd)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                      Market cap
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-medium text-foreground">
                      {DEMO_MARKET_CAP}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                      Dev wallet
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-medium text-fg-soft">
                      {devShown ? formatWallet(devShown) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                      Token age
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-medium text-foreground">
                      {formatTokenAgeShort(market.createdAt)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                      Holder count
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-medium text-foreground">
                      {DEMO_HOLDERS_COUNT}
                    </dd>
                  </div>
                </dl>
              ) : null}

              {detailTab === "holders" ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] border-collapse font-mono text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted">
                        <th className="pb-3 pr-4 font-semibold">Wallet</th>
                        <th className="pb-3 pr-4 font-semibold">%</th>
                        <th className="pb-3 font-semibold">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEMO_HOLDERS.map((row) => (
                        <tr
                          key={row.wallet}
                          className="border-b border-border/80 transition-colors hover:bg-surface/80"
                        >
                          <td className="py-2.5 pr-4 text-fg-soft">{row.wallet}</td>
                          <td className="py-2.5 pr-4 tabular-nums text-foreground">
                            {row.pct}
                          </td>
                          <td className="py-2.5 tabular-nums text-accent-bright">
                            {row.amt}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {detailTab === "transactions" ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] border-collapse font-mono text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted">
                        <th className="pb-3 pr-4 font-semibold">Time</th>
                        <th className="pb-3 pr-4 font-semibold">Type</th>
                        <th className="pb-3 font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEMO_TXS.map((row) => (
                        <tr
                          key={`${row.time}-${row.kind}`}
                          className="border-b border-border/80 transition-colors hover:bg-surface/80"
                        >
                          <td className="py-2.5 pr-4 tabular-nums text-muted">
                            {row.time}
                          </td>
                          <td className="py-2.5 pr-4 text-fg-soft">{row.kind}</td>
                          <td className="py-2.5 tabular-nums text-foreground">
                            {row.amt}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </motion.div>

          {/* RIGHT ~40% */}
          <motion.aside
            className="space-y-5 xl:sticky xl:top-8 xl:col-span-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: 0.08 }}
          >
            <div className="card-cyber p-5 sm:p-6">
              <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-muted">
                Closes in
              </p>
              <div className="mt-4 flex justify-center [&_span]:text-3xl [&_span]:font-bold [&_span]:tracking-[0.08em] sm:[&_span]:text-4xl">
                <Timer expiresAt={new Date(market.expiresAt)} />
              </div>

              <div className="mt-8">
                <PoolBar survivePool={survive} rugPool={rug} />
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-6 font-mono text-sm">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Survive pool
                  </p>
                  <p className="mt-1 font-semibold tabular-nums text-survive">
                    {formatUSDC(survive)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Rug pool
                  </p>
                  <p className="mt-1 font-semibold tabular-nums text-rug">
                    {formatUSDC(rug)}
                  </p>
                </div>
              </div>
            </div>

            <BetPanel market={market} onBet={onBet} position={position} />
          </motion.aside>
        </div>

        <motion.section
          className="mt-12 sm:mt-16"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <LiveFeed
            marketId={market.id}
            maxRows={20}
            heading="Last 20 bets"
            demoOnly
          />
        </motion.section>
      </div>
    </div>
  );
}
