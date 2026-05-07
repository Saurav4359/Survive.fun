"use client";

import type { ApiResponse, Bet, BetSide, Market, Token } from "@survivefun/types";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronLeft, SearchX } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UTCTimestamp } from "lightweight-charts";

import { BetPanel } from "@/components/BetPanel";
import { WalletBalancePanel } from "@/components/WalletBalancePanel";
import { LiveFeed } from "@/components/LiveFeed";
import { PoolBar } from "@/components/PoolBar";
import { RiskScore } from "@/components/RiskScore";
import { useToast } from "@/components/ToastProvider";
import { Timer } from "@/components/Timer";
import { ChartAreaSkeleton, MarketDetailPageSkeleton } from "@/components/ui/skeletons";
import { marketQueryKey, useMarket } from "@/hooks/useMarket";
import { useMarketBetsList, marketBetsQueryKey } from "@/hooks/useMarketBetsList";
import { useToken } from "@/hooks/useToken";
import { API_URL } from "@/utils/constants";
import { formatPool, formatUSDC, formatWallet } from "@/utils/format";
import { getMarketPDA, placeBet as placeBetOnChain } from "@/utils/transactions";

const CHART_LINE = "#86f0ad";

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

  const wallet = useWallet();
  const queryClient = useQueryClient();
  const { market, isLoading, error } = useMarket(id || undefined);
  const tokenHook = useToken(market?.tokenMint);
  const { bets: marketBets } = useMarketBetsList(id || undefined);

  const [detailTab, setDetailTab] = useState<DetailTab>("about");
  const [chartTf, setChartTf] = useState<ChartTf>("1h");
  const [position, setPosition] = useState<{
    side: BetSide;
    amountUsdc: number;
  } | null>(null);
  const [chartReady, setChartReady] = useState(false);

  const toast = useToast();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<import("lightweight-charts").IChartApi | null>(null);
  const seriesRef = useRef<import("lightweight-charts").ISeriesApi<"Line"> | null>(
    null,
  );
  const chartTfRef = useRef(chartTf);
  chartTfRef.current = chartTf;

  const chartPriceRef = useRef(0.0001);
  const openPriceStr = market?.openPrice ?? null;
  chartPriceRef.current =
    tokenHook.price ??
    parseNum(openPriceStr) ??
    0.0001;

  const placeBetMut = useMutation({
    mutationFn: async ({
      side,
      amountUsdc,
      m,
    }: {
      side: BetSide;
      amountUsdc: number;
      m: Market;
    }) => {
      const marketPda =
        m.onChainAddress?.trim() ||
        (await getMarketPDA(m.tokenMint)).toBase58();
      const sig = await placeBetOnChain(wallet, marketPda, side, amountUsdc);
      const pk = wallet.publicKey;
      if (!pk) {
        throw new Error("Connect a wallet to place a bet");
      }
      const res = await fetch(
        `${API_URL}/v1/markets/${encodeURIComponent(id)}/bets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            side,
            amount: amountUsdc,
            txSignature: sig,
            walletAddress: pk.toBase58(),
          }),
        },
      );
      const body = (await res.json()) as ApiResponse<Bet>;
      if (!res.ok || !body.success) {
        const msg =
          !body.success ? body.error.message : `Bet failed (${res.status})`;
        throw new Error(msg);
      }
      return body.data;
    },
    onSuccess: () => {
      toast({
        variant: "success",
        title: "Bet placed",
        message: "Your trade is on-chain and recorded.",
      });
      void queryClient.invalidateQueries({ queryKey: marketQueryKey(id) });
      void queryClient.invalidateQueries({ queryKey: marketBetsQueryKey(id) });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Bet failed";
      toast({ variant: "error", title: "Transaction failed", message: msg });
    },
  });

  const seedFlatSeries = useCallback(() => {
    const series = seriesRef.current;
    if (!series) return;
    const base = chartPriceRef.current;
    if (!Number.isFinite(base) || base <= 0) return;
    const { stepSec, bars } = TF_CONFIG[chartTfRef.current];
    const now = Math.floor(Date.now() / 1000);
    const points: { time: UTCTimestamp; value: number }[] = [];
    for (let i = bars - 1; i >= 0; i -= 1) {
      const t = (now - i * stepSec) as UTCTimestamp;
      points.push({ time: t, value: base });
    }
    series.setData(points);
    chartApiRef.current?.timeScale().fitContent();
  }, []);

  const token: Token = useMemo(
    () => ({
      address: market?.tokenMint ?? "",
      name: market?.tokenName ?? tokenHook.token?.name ?? "Token",
      symbol: market?.tokenTicker ?? tokenHook.token?.symbol ?? "TKN",
    }),
    [
      market?.tokenMint,
      market?.tokenName,
      market?.tokenTicker,
      tokenHook.token?.name,
      tokenHook.token?.symbol,
    ],
  );

  const survive = parseNum(market?.survivePool) ?? 0;
  const rug = parseNum(market?.rugPool) ?? 0;
  const openLiquidityUsd =
    tokenHook.liquidity ?? parseNum(market?.openLiquidity);
  const pairCreatedAtSeconds = tokenHook.pair?.pairCreatedAt ?? null;

  const displayPriceUsd = tokenHook.price ?? parseNum(market?.openPrice);
  const change24 =
    tokenHook.priceChange24h != null
      ? `${tokenHook.priceChange24h >= 0 ? "+" : ""}${tokenHook.priceChange24h.toFixed(2)}%`
      : "—";

  const tickerLetter = (market?.tokenTicker ?? "?").slice(0, 1).toUpperCase();

  const devShown =
    market?.devWallet ?? tokenHook.devWallet ?? market?.creatorWallet;

  useEffect(() => {
    setPosition(null);
    setChartReady(false);
  }, [id]);

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el || !market) return undefined;

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
      chartPriceRef.current =
        tokenHook.price ?? parseNum(market.openPrice) ?? 0.0001;
      seedFlatSeries();
      setChartReady(true);

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
      setChartReady(false);
    };
  }, [id, market, seedFlatSeries]);

  useEffect(() => {
    chartPriceRef.current =
      tokenHook.price ?? parseNum(market?.openPrice) ?? 0.0001;
    seedFlatSeries();
  }, [
    market?.openPrice,
    tokenHook.price,
    chartTf,
    seedFlatSeries,
    market,
  ]);

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

  const onBet = useCallback(
    async (side: BetSide, amountUsdc: number) => {
      if (!market) return;
      await placeBetMut.mutateAsync({ side, amountUsdc, m: market });
      setPosition({ side, amountUsdc });
    },
    [placeBetMut, market],
  );

  if (!id) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-16 font-mono text-muted">
        Invalid market id
      </div>
    );
  }

  if (isLoading) {
    return <MarketDetailPageSkeleton />;
  }

  if (error || !market) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-mono text-sm text-accent-bright"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Markets
        </Link>
        <p className="mt-8 font-display text-xl text-foreground">
          Market not found
        </p>
        <p className="mt-2 font-mono text-sm text-muted">
          {error?.message ?? "No data for this id."}
        </p>
      </div>
    );
  }

  const marketCapLabel =
    tokenHook.marketCap != null ? formatPool(tokenHook.marketCap) : "—";

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
          <div className="flex flex-wrap items-center justify-end gap-3">
            <WalletBalancePanel />
            <span className="rounded-lg border border-border bg-surface px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted">
              {market.status}
            </span>
          </div>
        </motion.div>

        <div
          className="sticky top-0 z-40 -mx-4 mb-4 flex items-center justify-between gap-3 border-b border-border bg-[var(--bg-primary)]/93 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 xl:hidden"
          aria-label="Market closes in"
        >
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted">
            {(market.tokenTicker ?? "Market").slice(0, 12)}
            {market.tokenTicker && market.tokenTicker.length > 12 ? "…" : ""}{" "}
            · closes in
          </span>
          <div className="shrink-0 font-mono text-base font-bold tabular-nums text-accent-bright sm:text-lg [&_span]:text-base sm:[&_span]:text-lg">
            <Timer expiresAt={new Date(market.expiresAt)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5 xl:items-start xl:gap-10">
          <motion.div
            className="order-1 min-w-0 space-y-6 xl:col-span-3"
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
                        {displayPriceUsd != null
                          ? formatUSDC(displayPriceUsd)
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                        24h
                      </p>
                      <p
                        className={`font-mono text-lg font-semibold tabular-nums ${
                          tokenHook.priceChange24h != null &&
                          tokenHook.priceChange24h < 0
                            ? "text-rug"
                            : "text-survive"
                        }`}
                      >
                        {change24}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <RiskScore
                token={token}
                liquidityUsd={openLiquidityUsd}
                pairCreatedAt={pairCreatedAtSeconds}
                devWalletPctHeld={null}
              />

              {tokenHook.notFound && !tokenHook.isLoading ? (
                <div className="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3">
                  <div className="flex gap-3">
                    <SearchX
                      className="mt-0.5 h-5 w-5 shrink-0 text-warn"
                      aria-hidden
                    />
                    <div>
                      <p className="font-mono text-sm font-semibold text-warn">
                        Token not found
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted">
                        No DexScreener pair for this mint yet. Price and liquidity
                        may show as “—” until the token is indexed.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="card-cyber overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <p className="font-display text-xs font-bold uppercase tracking-widest text-foreground">
                  Price (USD)
                </p>
                <div className="flex gap-1" role="tablist" aria-label="Chart timeframe">
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
                        {tf === "5m" ? "5M" : tf === "15m" ? "15M" : "1H"}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="relative h-[280px] w-full sm:h-[340px]">
                {!chartReady ? <ChartAreaSkeleton /> : null}
                <div ref={chartContainerRef} className="h-full w-full" />
              </div>
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
                      {marketCapLabel}
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
                    <dd
                      suppressHydrationWarning
                      className="mt-1 font-mono text-sm font-medium text-foreground"
                    >
                      {formatTokenAgeShort(market.createdAt)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                      Bettors
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-medium text-foreground">
                      {market.totalBettors}
                    </dd>
                  </div>
                </dl>
              ) : null}

              {detailTab === "holders" ? (
                <p className="py-8 text-center font-mono text-sm text-muted">
                  On-chain holder breakdown is not available in Survive.fun yet.
                </p>
              ) : null}

              {detailTab === "transactions" ? (
                <div className="overflow-x-auto">
                  {marketBets.length === 0 ? (
                    <p className="py-8 text-center font-mono text-sm text-muted">
                      No bets recorded for this market yet.
                    </p>
                  ) : (
                    <table className="w-full min-w-[320px] border-collapse font-mono text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted">
                          <th className="pb-3 pr-4 font-semibold">Time</th>
                          <th className="pb-3 pr-4 font-semibold">Side</th>
                          <th className="pb-3 font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {marketBets.map((row) => {
                          const t = new Date(row.createdAt);
                          const timeStr = t.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          });
                          return (
                            <tr
                              key={row.id}
                              className="border-b border-border/80 transition-colors hover:bg-surface/80"
                            >
                              <td className="py-2.5 pr-4 tabular-nums text-muted">
                                {timeStr}
                              </td>
                              <td className="py-2.5 pr-4 text-fg-soft">
                                {row.side === "survive" ? "SURVIVE" : "RUG"}
                              </td>
                              <td className="py-2.5 tabular-nums text-foreground">
                                {formatUSDC(Number.parseFloat(row.amountUsdc))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
            </div>
          </motion.div>

          <motion.aside
            className="order-2 space-y-5 xl:sticky xl:top-8 xl:col-span-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: 0.08 }}
          >
            <div className="card-cyber p-5 sm:p-6">
              <p className="hidden text-center text-[10px] font-semibold uppercase tracking-widest text-muted xl:block">
                Closes in
              </p>
              <div className="mt-0 hidden justify-center xl:mt-4 xl:flex [&_span]:text-3xl [&_span]:font-bold [&_span]:tracking-[0.08em] sm:[&_span]:text-4xl">
                <Timer expiresAt={new Date(market.expiresAt)} />
              </div>
              <p className="mb-3 text-center font-mono text-[10px] uppercase tracking-widest text-muted xl:hidden">
                Pool snapshot
              </p>

              <div className="mt-4 xl:mt-8">
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

            <BetPanel
              market={market}
              onBet={onBet}
              position={position}
            />
          </motion.aside>
        </div>

        <motion.section
          className="mt-12 sm:mt-16"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <LiveFeed marketId={market.id} maxRows={20} heading="Last 20 bets" />
        </motion.section>
      </div>
    </div>
  );
}
