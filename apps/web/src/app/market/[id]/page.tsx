"use client";

import type { BetSide, Market, PriceUpdate, Token } from "@survivefun/types";
import { motion } from "framer-motion";
import {
  BarChart3,
  ChevronLeft,
  LineChart as LineChartIcon,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { UTCTimestamp } from "lightweight-charts";

import { BetPanel } from "@/components/BetPanel";
import { LiveFeed } from "@/components/LiveFeed";
import { PoolBar } from "@/components/PoolBar";
import { RiskScore } from "@/components/RiskScore";
import { Timer } from "@/components/Timer";
import { API_URL } from "@/utils/constants";
import { formatPool, formatUSDC } from "@/utils/format";

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
    devWallet: null,
    status: "active",
    outcome: null,
    onChainAddress: null,
    createdAt: new Date().toISOString(),
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
    createdAt: new Date().toISOString(),
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
    createdAt: new Date().toISOString(),
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

type TabKey = "chart" | "stats" | "risk";

export default function MarketPage() {
  const params = useParams();
  const rawId = params?.id;
  const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] ?? "" : "";

  const [market, setMarket] = useState<Market>(() => fallbackMarket(id));
  const [tab, setTab] = useState<TabKey>("chart");
  const [position, setPosition] = useState<{
    side: BetSide;
    amountUsdc: number;
  } | null>(null);
  const [priceFlash, setPriceFlash] = useState<"up" | "down" | null>(null);

  const marketRef = useRef(market);
  marketRef.current = market;
  const lastPriceRef = useRef<number | null>(null);
  const flashClearRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<import("lightweight-charts").IChartApi | null>(null);
  const seriesRef = useRef<import("lightweight-charts").ISeriesApi<"Line"> | null>(
    null,
  );
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

  useEffect(() => {
    let cancelled = false;
    lastPriceRef.current = null;
    setMarket(fallbackMarket(id));
    setPosition(null);

    (async () => {
      try {
        const res = await fetch(`${API_URL}/v1/markets/${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const body: unknown = await res.json();
        if (cancelled) return;
        if (
          body &&
          typeof body === "object" &&
          "success" in body &&
          (body as { success: boolean }).success &&
          "data" in body
        ) {
          const data = (body as { data: Market }).data;
          if (data && typeof data === "object" && "id" in data) {
            setMarket(data);
          }
        }
      } catch {
        /* keep demo */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const seedSeries = useCallback((openPrice: string | null) => {
    const series = seriesRef.current;
    if (!series) return;
    const base = parseNum(openPrice) ?? 0.0001;
    const now = Math.floor(Date.now() / 1000);
    const points: { time: UTCTimestamp; value: number }[] = [];
    for (let i = 59; i >= 0; i -= 1) {
      const t = (now - i * 60) as UTCTimestamp;
      const wobble = 1 + Math.sin(i / 4) * 0.02 + (i % 7) * 0.001;
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
          vertLines: { color: "rgba(134, 240, 173, 0.08)" },
          horzLines: { color: "rgba(134, 240, 173, 0.08)" },
        },
        crosshair: {
          mode: CrosshairMode.Magnet,
          vertLine: {
            color: "#86f0ad",
            width: 1,
            labelBackgroundColor: "#3d8f62",
          },
          horzLine: {
            color: "#86f0ad",
            width: 1,
            labelBackgroundColor: "#3d8f62",
          },
        },
        rightPriceScale: { borderColor: "#1f1f1f" },
        timeScale: { borderColor: "#1f1f1f" },
      });

      const series = chart.addLineSeries({
        color: "#86f0ad",
        lineWidth: 2,
      });

      chartApiRef.current = chart;
      seriesRef.current = series;
      seedSeries(marketRef.current.openPrice);

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
    seedSeries(market.openPrice);
  }, [market.openPrice, seedSeries]);

  useEffect(() => {
    if (tab !== "chart") return undefined;
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
  }, [tab]);

  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket", "polling"] });

    const onPrice = (p: PriceUpdate) => {
      if (p.marketId !== market.id) return;
      const s = seriesRef.current;
      if (!s) return;
      const v = Number.parseFloat(p.priceUsd);
      if (!Number.isFinite(v)) return;
      const prev = lastPriceRef.current;
      lastPriceRef.current = v;
      if (prev != null && Number.isFinite(prev) && v !== prev) {
        if (flashClearRef.current) clearTimeout(flashClearRef.current);
        setPriceFlash(v > prev ? "up" : "down");
        flashClearRef.current = setTimeout(() => setPriceFlash(null), 450);
      }
      const t = Math.floor(new Date(p.timestamp).getTime() / 1000) as UTCTimestamp;
      s.update({ time: t, value: v });
    };

    const onPool = (payload: {
      marketId: string;
      survivePool: string;
      rugPool: string;
    }) => {
      setMarket((m) => {
        if (m.id !== payload.marketId) return m;
        return {
          ...m,
          survivePool: payload.survivePool,
          rugPool: payload.rugPool,
        };
      });
    };

    socket.on("price_update", onPrice);
    socket.on("pool_update", onPool);

    return () => {
      if (flashClearRef.current) clearTimeout(flashClearRef.current);
      socket.off("price_update", onPrice);
      socket.off("pool_update", onPool);
      socket.disconnect();
    };
  }, [market.id]);

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

  const tabs: { key: TabKey; label: string; icon: typeof LineChartIcon }[] = [
    { key: "chart", label: "Chart", icon: LineChartIcon },
    { key: "stats", label: "Stats", icon: BarChart3 },
    { key: "risk", label: "Risk", icon: ShieldAlert },
  ];

  const openPriceLabel =
    parseNum(market.openPrice) != null
      ? formatUSDC(parseNum(market.openPrice)!)
      : "—";

  return (
    <div className="min-h-screen animate-fade-in bg-bg pb-20 pt-8 sm:pt-12">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:pl-12 lg:pr-8">
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
          <span className="border border-border bg-surface px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted">
            {market.status}
          </span>
        </motion.div>

        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.04 }}
          className="header-scanline mb-10 border-l-2 border-accent pl-5 sm:pl-8"
        >
          <p className="relative z-[1] font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
            Market terminal
          </p>
          <h1 className="relative z-[1] font-display mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            {market.tokenName ?? "Market"}
            <span className="ml-2 font-mono text-accent-bright">
              {market.tokenTicker ? `$${market.tokenTicker}` : ""}
            </span>
          </h1>
          <p className="relative z-[1] mt-3 max-w-2xl font-mono text-sm leading-relaxed text-fg-soft">
            Price stream, pool deltas, and print log via Socket.io.
          </p>
        </motion.header>

        <div className="flex flex-col gap-10 xl:flex-row xl:items-start xl:gap-12">
          <motion.section
            layout
            className="min-w-0 flex-1 space-y-6 xl:w-[58%]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: 0.06 }}
          >
            <div className="flex border border-border bg-surface p-px">
              {tabs.map((t) => {
                const active = tab === t.key;
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={
                      active
                        ? "relative flex flex-1 items-center justify-center gap-2 rounded-lg border border-border-glow/45 bg-accent/12 py-2.5 font-display text-xs font-bold uppercase tracking-widest text-accent-bright shadow-glow-sm"
                        : "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 font-display text-xs font-semibold uppercase tracking-widest text-muted transition-colors duration-200 hover:bg-card hover:text-fg-soft"
                    }
                  >
                    {active ? (
                      <motion.span
                        layoutId="market-tab"
                        className="pointer-events-none absolute inset-0 -z-10 bg-transparent"
                        transition={{ type: "spring", stiffness: 500, damping: 38 }}
                      />
                    ) : null}
                    <Icon className="h-4 w-4" aria-hidden />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className={tab === "chart" ? "block" : "hidden"}>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="card-cyber overflow-hidden"
              >
                <div
                  className={`flex items-center justify-between gap-3 border-b border-border px-4 py-3 transition-colors duration-200 ${
                    priceFlash === "up"
                      ? "animate-flash-up"
                      : priceFlash === "down"
                        ? "animate-flash-down"
                        : ""
                  }`}
                >
                  <p className="font-display text-xs font-bold uppercase tracking-widest text-foreground">
                    Price (USD)
                  </p>
                  <p className="font-mono text-xs text-muted">
                    Open <span className="text-fg-soft">{openPriceLabel}</span>
                  </p>
                </div>
                <div ref={chartContainerRef} className="h-[320px] w-full sm:h-[380px]" />
              </motion.div>
            </div>

            <div className={tab === "stats" ? "block" : "hidden"}>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="grid gap-3 sm:grid-cols-2"
              >
                <div className="card-cyber p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Pools
                  </p>
                  <p className="mt-2 font-mono text-sm text-fg-soft">
                    <span className="text-survive">SURVIVE</span> {formatPool(survive)}{" "}
                    · <span className="text-rug">RUG</span> {formatPool(rug)}
                  </p>
                </div>
                <div className="card-cyber p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Bettors
                  </p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
                    {market.totalBettors}
                  </p>
                </div>
                <div className="card-cyber p-5 sm:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Token mint
                  </p>
                  <p className="mt-2 break-all font-mono text-xs text-fg-soft">
                    {market.tokenMint}
                  </p>
                </div>
              </motion.div>
            </div>

            <div className={tab === "risk" ? "block" : "hidden"}>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <RiskScore
                  token={token}
                  liquidityUsd={openLiquidityUsd}
                  pairCreatedAt={pairCreatedAtSeconds}
                  devWalletPctHeld={null}
                />
              </motion.div>
            </div>
          </motion.section>

          <motion.aside
            layout
            className="w-full shrink-0 space-y-5 xl:sticky xl:top-8 xl:w-[42%]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: 0.08 }}
          >
            <div className="card-cyber p-5">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Closes in
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold text-foreground">
                    <Timer expiresAt={new Date(market.expiresAt)} />
                  </p>
                </div>
                <div className="rounded-lg border border-border-glow/40 bg-accent/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-accent-bright">
                  Live
                </div>
              </div>
              <div className="mt-5">
                <PoolBar survivePool={survive} rugPool={rug} />
              </div>
            </div>

            <BetPanel market={market} onBet={onBet} position={position} />
          </motion.aside>
        </div>

        <motion.section
          className="mt-14"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <LiveFeed marketId={market.id} />
        </motion.section>
      </div>
    </div>
  );
}
