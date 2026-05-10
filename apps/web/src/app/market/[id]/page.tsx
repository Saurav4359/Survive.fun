"use client";

import type {
  ApiResponse,
  BetSide,
  Market,
  MarketPoolHistoryPoint,
  MarketPoolHistoryResponse,
  Outcome,
} from "@survivefun/types";
import { useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  Clock,
  Droplets,
  Loader2,
  Star,
  Timer as TimerIcon,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEventParams, Time, UTCTimestamp } from "lightweight-charts";

import { BetPanel } from "@/components/BetPanel";
import { LiveFeed } from "@/components/LiveFeed";
import { MarketResultBanner } from "@/components/MarketResultBanner";
import { PoolBar } from "@/components/PoolBar";
import { Timer } from "@/components/Timer";
import { useToast } from "@/components/ToastProvider";
import { marketQueryKey, useMarket } from "@/hooks/useMarket";
import { marketResultQueryKey, useMarketResult } from "@/hooks/useMarketResult";
import { myPayoutQueryKey, useMyPayout } from "@/hooks/useMyPayout";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  marketBetsQueryKey,
  useMarketBetsList,
} from "@/hooks/useMarketBetsList";
import { useToken } from "@/hooks/useToken";
import { userBetsQueryKey, useUserBets } from "@/hooks/useUserBets";
import { apiV1Url } from "@/utils/constants";
import { solscanTxUrl } from "@/utils/explorer";
import {
  formatBetStake,
  formatPool,
  formatPoolTotals,
  formatSolBetLine,
  formatUsd,
  formatWallet,
  parsePoolLamports,
} from "@/utils/format";
import { formatRugConditionLabel } from "@/utils/rugConditionLabel";
import {
  claimPayout,
  getBetPDA,
  placeBet as placeBetOnChain,
  resolveMarketPdaForTransaction,
} from "@/utils/transactions";

/** Lightweight Charts — dual curved lines (shared 50% open, then diverge). */
const CHART_SURVIVE_LINE = "#a3e635";
const CHART_RUG_LINE = "#ef4444";

const POOL_CHART_DENSIFY_SEGMENTS = 8;

function parseNum(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

type DetailTab = "about" | "holders" | "transactions";

/** Survive share of pool in percent (0–100), stable vs float division on lamports. */
function poolSharePercentsFromRaw(
  surviveRaw: string,
  rugRaw: string,
): { survivePct: number; rugPct: number } {
  let s = 0n;
  let r = 0n;
  try {
    s = BigInt(surviveRaw);
    r = BigInt(rugRaw);
  } catch {
    return { survivePct: 50, rugPct: 50 };
  }
  const t = s + r;
  if (t === 0n) return { survivePct: 50, rugPct: 50 };
  const survivePct = Number((s * 10000n) / t) / 100;
  const rugPct = Number((r * 10000n) / t) / 100;
  return { survivePct, rugPct };
}

type PoolChartRange = "all" | "1h" | "15m" | "5m";

const POOL_CHART_RANGE_SEC: Record<Exclude<PoolChartRange, "all">, number> = {
  "5m": 300,
  "15m": 900,
  "1h": 3600,
};

function filterPoolHistoryPoints<
  T extends { t: number },
>(points: T[], range: PoolChartRange): T[] {
  if (range === "all" || points.length === 0) return points;
  const nowSec = Math.floor(Date.now() / 1000);
  const windowSec = POOL_CHART_RANGE_SEC[range];
  const minT = nowSec - windowSec;
  const filtered = points.filter((p) => p.t >= minT);
  return filtered.length > 0 ? filtered : points;
}

type PoolPctPoint = { time: UTCTimestamp; value: number };

function sortDedupePoolPctPoints(points: PoolPctPoint[]): PoolPctPoint[] {
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const out: PoolPctPoint[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && last.time === p.time) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

/** One row per `t` so survive/rug stay paired (API can repeat timestamps). */
function poolHistoryToPairedPctPoints(sliced: MarketPoolHistoryPoint[]): {
  survivePts: PoolPctPoint[];
  rugPts: PoolPctPoint[];
} {
  const byT = new Map<
    number,
    { survivePoolRaw: string; rugPoolRaw: string }
  >();
  for (const p of sliced) {
    byT.set(p.t, { survivePoolRaw: p.survivePoolRaw, rugPoolRaw: p.rugPoolRaw });
  }
  const keys = [...byT.keys()].sort((a, b) => a - b);
  const survivePts: PoolPctPoint[] = [];
  const rugPts: PoolPctPoint[] = [];
  for (const t of keys) {
    const row = byT.get(t)!;
    const { survivePct, rugPct } = poolSharePercentsFromRaw(
      row.survivePoolRaw,
      row.rugPoolRaw,
    );
    survivePts.push({ time: t as UTCTimestamp, value: survivePct });
    rugPts.push({ time: t as UTCTimestamp, value: rugPct });
  }
  return { survivePts, rugPts };
}

/**
 * 50/50 one tick **before** the first snapshot so both lines leave the vertical
 * midline even when `createdAt` is missing or after the first pool row (clock skew).
 */
function prependNeutralOpenAnchor(
  marketCreatedAtIso: string | undefined,
  survivePts: PoolPctPoint[],
  rugPts: PoolPctPoint[],
): { survivePts: PoolPctPoint[]; rugPts: PoolPctPoint[] } {
  if (survivePts.length === 0 || rugPts.length === 0) {
    return { survivePts, rugPts };
  }
  const firstT = survivePts[0]!.time as number;
  let tAnchor = firstT - 1;
  if (marketCreatedAtIso) {
    const tOpen = Math.floor(Date.parse(marketCreatedAtIso) / 1000);
    if (Number.isFinite(tOpen)) tAnchor = Math.min(tAnchor, tOpen);
  }
  if (tAnchor >= firstT) tAnchor = firstT - 1;
  const t = tAnchor as UTCTimestamp;
  if (survivePts[0]!.time === t && survivePts[0]!.value === 50) {
    return { survivePts, rugPts };
  }
  return {
    survivePts: [{ time: t, value: 50 }, ...survivePts],
    rugPts: [{ time: t, value: 50 }, ...rugPts],
  };
}

/**
 * Linear midpoints between consecutive snapshots (same clock for both series).
 * Rug% is derived as 100 − survive% so the pair stays consistent. More points
 * let `LineType.Curved` read as a smoother path through real pool movement.
 */
function densifyPairedPoolPct(
  survivePts: PoolPctPoint[],
  rugPts: PoolPctPoint[],
  innerBetween: number,
): { survivePts: PoolPctPoint[]; rugPts: PoolPctPoint[] } {
  if (
    innerBetween < 1 ||
    survivePts.length !== rugPts.length ||
    survivePts.length < 2
  ) {
    return { survivePts, rugPts };
  }
  const sOut: PoolPctPoint[] = [];
  const rOut: PoolPctPoint[] = [];
  for (let i = 0; i < survivePts.length - 1; i += 1) {
    const sa = survivePts[i]!;
    const sb = survivePts[i + 1]!;
    const ra = rugPts[i]!;
    const rb = rugPts[i + 1]!;
    if (sa.time !== ra.time || sb.time !== rb.time) {
      return { survivePts, rugPts };
    }
    sOut.push(sa);
    rOut.push(ra);
    const tA = sa.time as number;
    const tB = sb.time as number;
    const dt = tB - tA;
    if (dt > 1) {
      const maxInterior = Math.min(innerBetween, Math.max(1, dt - 1));
      let prevT = tA;
      for (let k = 1; k <= maxInterior; k += 1) {
        const frac = k / (maxInterior + 1);
        let t = Math.floor(tA + dt * frac);
        if (t <= prevT) t = prevT + 1;
        if (t >= tB) t = tB - 1;
        if (t <= prevT || t >= tB) continue;
        prevT = t;
        const sVal = sa.value + (sb.value - sa.value) * frac;
        const s = Math.min(100, Math.max(0, sVal));
        sOut.push({ time: t as UTCTimestamp, value: s });
        rOut.push({ time: t as UTCTimestamp, value: 100 - s });
      }
    }
  }
  sOut.push(survivePts[survivePts.length - 1]!);
  rOut.push(rugPts[rugPts.length - 1]!);
  return {
    survivePts: sortDedupePoolPctPoints(sOut),
    rugPts: sortDedupePoolPctPoints(rOut),
  };
}

function applyPoolChartVisibleRange(
  chart: import("lightweight-charts").IChartApi,
  survivePts: PoolPctPoint[],
): void {
  if (survivePts.length === 0) {
    chart.timeScale().fitContent();
    return;
  }
  const from = survivePts[0]!.time;
  const to = survivePts[survivePts.length - 1]!.time;
  const fromN = typeof from === "number" ? from : Number(from);
  const toN = typeof to === "number" ? to : Number(to);
  if (!Number.isFinite(fromN) || !Number.isFinite(toN)) {
    chart.timeScale().fitContent();
    return;
  }
  const pad = 2;
  const run = () => {
    try {
      if (toN <= fromN) {
        chart.timeScale().setVisibleRange({
          from: (fromN - 120) as Time,
          to: (fromN + 120) as Time,
        });
        return;
      }
      chart.timeScale().setVisibleRange({
        from: (fromN - pad) as Time,
        to: (toN + pad) as Time,
      });
    } catch {
      chart.timeScale().fitContent();
    }
  };
  run();
  requestAnimationFrame(run);
}

/** Extend the series to the current second with live pool shares (line reaches “now”). */
function appendLivePoolChartTail(
  survivePts: PoolPctPoint[],
  rugPts: PoolPctPoint[],
  liveSurviveRaw: string,
  liveRugRaw: string,
): { survivePts: PoolPctPoint[]; rugPts: PoolPctPoint[] } {
  const live = poolSharePercentsFromRaw(liveSurviveRaw, liveRugRaw);
  const tNow = Math.floor(Date.now() / 1000) as UTCTimestamp;

  const pushTail = (pts: PoolPctPoint[], liveValue: number): PoolPctPoint[] => {
    const out = [...pts];
    const last = out[out.length - 1];
    if (!last) return [{ time: tNow, value: liveValue }];
    if (tNow > last.time) {
      out.push({ time: tNow, value: liveValue });
    } else {
      out[out.length - 1] = { time: last.time, value: liveValue };
    }
    return out;
  };

  return {
    survivePts: pushTail(survivePts, live.survivePct),
    rugPts: pushTail(rugPts, live.rugPct),
  };
}

async function fetchPoolPctSeries(
  marketId: string,
  range: PoolChartRange,
  liveSurviveRaw: string,
  liveRugRaw: string,
  marketCreatedAtIso: string | undefined,
): Promise<{ survivePts: PoolPctPoint[]; rugPts: PoolPctPoint[] } | null> {
  const r = await fetch(
    apiV1Url(`/markets/${encodeURIComponent(marketId)}/pool-history`),
  );
  if (!r.ok) return null;
  const j = (await r.json()) as ApiResponse<MarketPoolHistoryResponse>;
  if (!j.success || j.data.points.length === 0) return null;
  const sliced = filterPoolHistoryPoints(j.data.points, range);
  const paired = poolHistoryToPairedPctPoints(sliced);
  let s = paired.survivePts;
  let ru = paired.rugPts;
  const anchored = prependNeutralOpenAnchor(marketCreatedAtIso, s, ru);
  s = anchored.survivePts;
  ru = anchored.rugPts;
  const dense = densifyPairedPoolPct(s, ru, POOL_CHART_DENSIFY_SEGMENTS);
  return appendLivePoolChartTail(
    dense.survivePts,
    dense.rugPts,
    liveSurviveRaw,
    liveRugRaw,
  );
}

function formatTokenAge(createdIso: string): string {
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

type RiskLevel = "HIGH" | "MEDIUM" | "LOW";
function inferRisk(liq: number | null | undefined): RiskLevel {
  if (liq != null && Number.isFinite(liq) && liq > 50_000) return "LOW";
  if (liq != null && Number.isFinite(liq) && liq > 10_000) return "MEDIUM";
  return "HIGH";
}

const RISK_STYLES: Record<RiskLevel, string> = {
  HIGH: "border-rug text-rug",
  MEDIUM: "border-warn text-warn",
  LOW: "border-accent text-accent",
};

export default function MarketPage() {
  const params = useParams();
  const rawId = params?.id;
  const id =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] ?? "" : "";

  const wallet = useWallet();
  const queryClient = useQueryClient();
  const { market, isLoading, error } = useMarket(id || undefined);
  const { marketResolved } = useWebSocket();
  const [resolveFlashKey, setResolveFlashKey] = useState<string | null>(null);

  const isResolvedWithOutcome = Boolean(
    market?.status === "resolved" && market.outcome,
  );
  const { data: marketResult } = useMarketResult(
    id || undefined,
    isResolvedWithOutcome,
  );

  useEffect(() => {
    if (!id || !marketResolved || marketResolved.marketId !== id) return;
    setResolveFlashKey(
      `${marketResolved.timestamp}:${marketResolved.outcome}`,
    );
  }, [id, marketResolved]);

  const tokenHook = useToken(market?.tokenMint);
  const { bets: marketBets } = useMarketBetsList(id || undefined);
  const userWallet = wallet.publicKey?.toBase58();
  const { data: myPayout } = useMyPayout(
    id || undefined,
    userWallet,
    isResolvedWithOutcome && Boolean(userWallet),
  );
  const { bets: userBets } = useUserBets(userWallet);
  const toast = useToast();

  const [detailTab, setDetailTab] = useState<DetailTab>("about");
  const [chartReady, setChartReady] = useState(false);
  const [poolChartRange, setPoolChartRange] = useState<PoolChartRange>("all");
  const { has: isStarred, toggle: toggleStar } = useWatchlist();

  /**
   * Derive the user's existing position on this market from the API so it
   * persists across reloads. Sums every bet the user has placed on this id.
   */
  const position = useMemo<{ side: BetSide; stakeSol: number } | null>(() => {
    if (!id || !market || !userBets || userBets.length === 0) return null;
    let surviveTotal = 0;
    let rugTotal = 0;
    for (const b of userBets) {
      if (b.market.id !== id) continue;
      if (b.currency !== "sol") continue;
      const amt = Number(BigInt(b.amountLamports ?? "0")) / LAMPORTS_PER_SOL;
      if (!Number.isFinite(amt)) continue;
      if (b.side === "survive") surviveTotal += amt;
      else if (b.side === "rug") rugTotal += amt;
    }
    if (surviveTotal === 0 && rugTotal === 0) return null;
    if (surviveTotal >= rugTotal) {
      return { side: "survive", stakeSol: surviveTotal };
    }
    return { side: "rug", stakeSol: rugTotal };
  }, [id, market, userBets]);

  const userMarketBet = useMemo(() => {
    if (!id || !userBets?.length) return null;
    const own = userBets
      .filter((b) => b.market.id === id && b.currency === "sol")
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    return own[0] ?? null;
  }, [id, userBets]);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<import("lightweight-charts").IChartApi | null>(
    null,
  );
  const surviveSeriesRef = useRef<
    import("lightweight-charts").ISeriesApi<"Line"> | null
  >(null);
  const rugSeriesRef = useRef<
    import("lightweight-charts").ISeriesApi<"Line"> | null
  >(null);
  const poolChartTooltipRef = useRef<HTMLDivElement | null>(null);
  /** Latest range + pool raw strings so async chart init does not apply stale data. */
  const poolChartInputRef = useRef({
    range: "all" as PoolChartRange,
    surviveRaw: "",
    rugRaw: "",
    createdAt: "" as string,
  });

  const placeBetMut = useMutation({
    mutationFn: async ({
      side,
      amountUi,
      m,
    }: {
      side: BetSide;
      amountUi: number;
      m: Market;
    }) => {
      const marketPda = await resolveMarketPdaForTransaction(
        m.tokenMint,
        m.durationSeconds,
        m.onChainAddress,
      );
      await placeBetOnChain(wallet, {
        marketPda,
        side,
        amount: amountUi,
        marketId: id,
      });
    },
    onSuccess: () => {
      toast({
        variant: "success",
        title: "Bet placed",
        message: "Your trade is on-chain and recorded.",
      });
      void queryClient.invalidateQueries({ queryKey: marketQueryKey(id) });
      void queryClient.invalidateQueries({ queryKey: marketBetsQueryKey(id) });
      if (userWallet) {
        void queryClient.invalidateQueries({
          queryKey: userBetsQueryKey(userWallet),
        });
      }
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Bet failed";
      toast({ variant: "error", title: "Transaction failed", message: msg });
    },
  });

  const claimMut = useMutation({
    mutationFn: async () => {
      if (!market || !userMarketBet) {
        throw new Error("No claimable position found.");
      }
      const marketPda = await resolveMarketPdaForTransaction(
        market.tokenMint,
        market.durationSeconds,
        market.onChainAddress,
      );
      const bettor = wallet.publicKey;
      if (!bettor) throw new Error("Connect a wallet to claim");
      const betPda = (await getBetPDA(marketPda, bettor.toBase58())).toBase58();
      return claimPayout(wallet, marketPda, betPda, {
        betId: userMarketBet.id,
      });
    },
    onSuccess: () => {
      toast({
        variant: "success",
        title: "Payout claimed",
        message: "Funds should appear in your wallet shortly.",
      });
      void queryClient.invalidateQueries({ queryKey: marketQueryKey(id) });
      void queryClient.invalidateQueries({ queryKey: marketBetsQueryKey(id) });
      if (userWallet) {
        void queryClient.invalidateQueries({
          queryKey: userBetsQueryKey(userWallet),
        });
        void queryClient.invalidateQueries({
          queryKey: myPayoutQueryKey(id, userWallet),
        });
      }
      void queryClient.invalidateQueries({
        queryKey: marketResultQueryKey(id),
      });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Claim failed";
      toast({ variant: "error", title: "Transaction failed", message: msg });
    },
  });

  const survive = market
    ? Number(parsePoolLamports(market.survivePool))
    : 0;
  const rug = market ? Number(parsePoolLamports(market.rugPool)) : 0;

  const liveSurviveSharePct = useMemo(() => {
    if (!market) return null;
    const { survivePct } = poolSharePercentsFromRaw(
      parsePoolLamports(market.survivePool).toString(),
      parsePoolLamports(market.rugPool).toString(),
    );
    return survivePct;
  }, [market]);
  const liveRugSharePct = useMemo(() => {
    if (!market) return null;
    const { rugPct } = poolSharePercentsFromRaw(
      parsePoolLamports(market.survivePool).toString(),
      parsePoolLamports(market.rugPool).toString(),
    );
    return rugPct;
  }, [market]);

  useEffect(() => {
    if (!market) return;
    poolChartInputRef.current = {
      range: poolChartRange,
      surviveRaw: parsePoolLamports(market.survivePool).toString(),
      rugRaw: parsePoolLamports(market.rugPool).toString(),
      createdAt: market.createdAt,
    };
  }, [market, poolChartRange]);
  const openLiquidityUsd =
    tokenHook.liquidity ?? parseNum(market?.openLiquidity);
  const pairCreatedAtSeconds = tokenHook.pair?.pairCreatedAt ?? null;

  const displayPriceUsd = tokenHook.price ?? parseNum(market?.openPrice ?? null);
  const change24Num =
    tokenHook.priceChange24h != null ? tokenHook.priceChange24h : null;
  const change24 =
    change24Num != null
      ? `${change24Num >= 0 ? "+" : ""}${change24Num.toFixed(2)}%`
      : "—";

  const tickerLetter = (market?.tokenTicker ?? "?").slice(0, 1).toUpperCase();
  const devShown =
    market?.devWallet ?? tokenHook.devWallet ?? market?.creatorWallet;

  /** Create the chart once per market; pool/range updates only refresh series data. */
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el || !market) return undefined;

    let cancelled = false;
    let disposed = false;
    let chart: import("lightweight-charts").IChartApi | null = null;
    let ro: ResizeObserver | null = null;
    let crosshairHandler: ((param: MouseEventParams<Time>) => void) | null = null;

    const safeResize = () => {
      if (disposed || cancelled || !chart || !chartContainerRef.current) return;
      try {
        const { width, height } =
          chartContainerRef.current.getBoundingClientRect();
        chart.applyOptions({ width, height });
      } catch {
        /* chart may already be removed (ResizeObserver vs React cleanup race) */
      }
    };

    void (async () => {
      const {
        createChart,
        ColorType,
        CrosshairMode,
        LastPriceAnimationMode,
        LineStyle,
        LineType,
        TickMarkType,
      } = await import("lightweight-charts");
      if (cancelled || disposed || !chartContainerRef.current) return;

      chart = createChart(chartContainerRef.current, {
        localization: {
          locale:
            typeof navigator !== "undefined" ? navigator.language : "en-US",
          dateFormat: "MMM d",
          timeFormatter: (t: Time) => {
            const sec = typeof t === "number" ? t : Number(t);
            if (!Number.isFinite(sec)) return "";
            return new Date(sec * 1000).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            });
          },
        },
        layout: {
          background: { type: ColorType.Solid, color: "#0f1114" },
          textColor: "#8b8b8b",
          /** Frees left gutter taken by the default TradingView mark; NOTICE still applies site-wide. */
          attributionLogo: false,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { color: "rgba(255,255,255,0.045)" },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: "rgba(255,255,255,0.42)",
            width: 1,
            style: LineStyle.Solid,
            labelBackgroundColor: "#262626",
          },
          horzLine: {
            visible: false,
            labelVisible: false,
          },
        },
        rightPriceScale: {
          borderColor: "#1a1a1a",
          ticksVisible: true,
          scaleMargins: { top: 0.08, bottom: 0.08 },
        },
        handleScroll: {
          mouseWheel: false,
          pressedMouseMove: false,
          horzTouchDrag: false,
          vertTouchDrag: false,
        },
        handleScale: {
          mouseWheel: false,
          pinch: false,
          axisPressedMouseMove: {
            time: false,
            price: false,
          },
          axisDoubleClickReset: false,
        },
        timeScale: {
          borderVisible: false,
          fixLeftEdge: false,
          fixRightEdge: false,
          lockVisibleTimeRangeOnResize: true,
          rightOffset: 0,
          barSpacing: 6,
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: (
            time: Time,
            tickMarkType: number,
            _locale: string,
          ): string | null => {
            const sec = typeof time === "number" ? time : NaN;
            if (!Number.isFinite(sec)) return null;
            const d = new Date(sec * 1000);
            if (
              tickMarkType === TickMarkType.Time ||
              tickMarkType === TickMarkType.TimeWithSeconds
            ) {
              let h = d.getHours();
              const m = d.getMinutes();
              const suf = h < 12 ? "a" : "p";
              h = h % 12 || 12;
              return `${h}:${String(m).padStart(2, "0")}${suf}`;
            }
            if (tickMarkType === TickMarkType.DayOfMonth) {
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }
            return null;
          },
        },
      });

      const scaleZeroToHundred = () => ({
        priceRange: {
          minValue: 0,
          maxValue: 100,
        },
        margins: {
          above: 4,
          below: 4,
        },
      });

      const pctPriceFormat = {
        type: "percent" as const,
        precision: 1,
        minMove: 0.1,
      };

      const lineBase = {
        lineWidth: 2,
        lineType: LineType.Curved,
        lineStyle: LineStyle.Solid,
        lineVisible: true,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: "rgba(255,255,255,0.9)",
        crosshairMarkerBorderWidth: 1,
        lastPriceAnimation: LastPriceAnimationMode.OnDataUpdate,
        priceFormat: pctPriceFormat,
        autoscaleInfoProvider: scaleZeroToHundred,
      } as const;

      /** Rug first so lime survive reads on top (Excalidraw-style overlap at open). */
      const rugSeries = chart.addLineSeries({
        ...lineBase,
        color: CHART_RUG_LINE,
        crosshairMarkerBackgroundColor: CHART_RUG_LINE,
      });
      const surviveSeries = chart.addLineSeries({
        ...lineBase,
        color: CHART_SURVIVE_LINE,
        crosshairMarkerBackgroundColor: CHART_SURVIVE_LINE,
      });

      if (cancelled || disposed) {
        chart.remove();
        return;
      }

      chartApiRef.current = chart;
      surviveSeriesRef.current = surviveSeries;
      rugSeriesRef.current = rugSeries;

      const inp = poolChartInputRef.current;
      try {
        const data = await fetchPoolPctSeries(
          id,
          inp.range,
          inp.surviveRaw,
          inp.rugRaw,
          inp.createdAt || undefined,
        );
        if (
          !cancelled &&
          !disposed &&
          data &&
          surviveSeriesRef.current === surviveSeries
        ) {
          surviveSeries.setData(data.survivePts);
          rugSeries.setData(data.rugPts);
          applyPoolChartVisibleRange(chart, data.survivePts);
        }
      } catch {
        /* empty chart */
      }
      if (cancelled || disposed) return;
      if (!cancelled && !disposed) {
        setChartReady(true);
      }

      crosshairHandler = (param: MouseEventParams<Time>) => {
        const tip = poolChartTooltipRef.current;
        if (!tip) return;
        const dateEl = tip.querySelector("[data-tip-date]");
        const surviveEl = tip.querySelector("[data-tip-survive]");
        const rugEl = tip.querySelector("[data-tip-rug]");
        if (!dateEl || !surviveEl || !rugEl) return;

        if (
          !param.point ||
          param.time === undefined ||
          Number.isNaN(Number(param.time))
        ) {
          tip.style.opacity = "0";
          return;
        }

        const sPt = param.seriesData.get(surviveSeries);
        const rPt = param.seriesData.get(rugSeries);
        const sv =
          sPt && typeof sPt === "object" && "value" in sPt
            ? Number((sPt as { value: number }).value)
            : null;
        const rv =
          rPt && typeof rPt === "object" && "value" in rPt
            ? Number((rPt as { value: number }).value)
            : null;
        if (sv == null || !Number.isFinite(sv) || rv == null || !Number.isFinite(rv)) {
          tip.style.opacity = "0";
          return;
        }

        const sec = Number(param.time);
        dateEl.textContent = new Date(sec * 1000).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        surviveEl.textContent = `Survive chance ${sv.toFixed(1)}%`;
        rugEl.textContent = `Rug chance ${rv.toFixed(1)}%`;

        const pad = 12;
        const tw = tip.offsetWidth || 140;
        const th = tip.offsetHeight || 56;
        const cw = chartContainerRef.current?.clientWidth ?? 0;
        const ch = chartContainerRef.current?.clientHeight ?? 0;
        let left = param.point.x + pad;
        let top = param.point.y + pad;
        if (left + tw > cw - 8) left = Math.max(8, param.point.x - tw - pad);
        if (top + th > ch - 8) top = Math.max(8, param.point.y - th - pad);
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
        tip.style.opacity = "1";
      };
      chart.subscribeCrosshairMove(crosshairHandler);

      ro = new ResizeObserver(() => {
        safeResize();
      });
      ro.observe(chartContainerRef.current);
      safeResize();
    })();

    return () => {
      cancelled = true;
      disposed = true;
      ro?.disconnect();
      ro = null;
      if (chart && crosshairHandler) {
        chart.unsubscribeCrosshairMove(crosshairHandler);
      }
      crosshairHandler = null;
      try {
        chart?.remove();
      } catch {
        /* already disposed */
      }
      chart = null;
      chartApiRef.current = null;
      surviveSeriesRef.current = null;
      rugSeriesRef.current = null;
      setChartReady(false);
    };
  }, [id, market?.id, market?.createdAt]);

  /** Refresh pool-% polylines when range or pools change; tick “now” while market is open. */
  useEffect(() => {
    if (!id || !market) return undefined;
    const chart = chartApiRef.current;
    const surviveSeries = surviveSeriesRef.current;
    const rugSeries = rugSeriesRef.current;
    if (!chart || !surviveSeries || !rugSeries) return undefined;

    let cancelled = false;

    const run = async () => {
      const inp = poolChartInputRef.current;
      try {
        const data = await fetchPoolPctSeries(
          id,
          inp.range,
          inp.surviveRaw,
          inp.rugRaw,
          inp.createdAt || undefined,
        );
        if (cancelled || !data) return;
        const s = surviveSeriesRef.current;
        const r = rugSeriesRef.current;
        const c = chartApiRef.current;
        if (!s || !r || !c) return;
        s.setData(data.survivePts);
        r.setData(data.rugPts);
        applyPoolChartVisibleRange(c, data.survivePts);
      } catch {
        /* keep last good frame */
      }
    };

    void run();
    const tick =
      market.status !== "resolved"
        ? setInterval(() => {
            void run();
          }, 4000)
        : null;

    return () => {
      cancelled = true;
      if (tick) clearInterval(tick);
    };
  }, [
    id,
    poolChartRange,
    market?.id,
    market?.status,
    market?.survivePool,
    market?.rugPool,
  ]);

  const onBet = useCallback(
    async (side: BetSide, amountUi: number) => {
      if (!market) return;
      await placeBetMut.mutateAsync({ side, amountUi, m: market });
    },
    [placeBetMut, market],
  );

  const totalPool = survive + rug;
  const poolSideLabels = market
    ? formatPoolTotals(survive, rug)
    : { survive: "—", rug: "—" };
  const totalPoolLabel = formatSolBetLine(totalPool / 1e9);
  const risk = inferRisk(openLiquidityUsd);
  const claimable =
    userMarketBet != null &&
    market != null &&
    market.status === "resolved" &&
    market.outcome != null &&
    userMarketBet.side === market.outcome &&
    !userMarketBet.claimed &&
    myPayout !== undefined &&
    myPayout.found &&
    myPayout.won &&
    !myPayout.claimed &&
    myPayout.onChainResolved;

  const payoutProcessing =
    myPayout !== undefined &&
    myPayout.found &&
    myPayout.won &&
    !myPayout.claimed &&
    !myPayout.onChainResolved;

  const sortedSignals = useMemo(() => {
    const items: { label: string; value: string; Icon: typeof Droplets }[] = [];
    items.push({
      label: "Liquidity",
      value:
        openLiquidityUsd != null && Number.isFinite(openLiquidityUsd)
          ? formatUsd(openLiquidityUsd)
          : "—",
      Icon: Droplets,
    });
    items.push({
      label: "Token age",
      value: market ? formatTokenAge(market.createdAt) : "—",
      Icon: TimerIcon,
    });
    items.push({
      label: "Bettors",
      value: market ? String(market.totalBettors) : "—",
      Icon: Users,
    });
    return items;
  }, [openLiquidityUsd, market]);

  if (!id) {
    return (
      <div className="px-6 py-16 font-mono text-fg-muted">Invalid market id</div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1440px] animate-pulse px-4 py-12 sm:px-6 lg:px-10">
        <div className="h-8 w-32 bg-card" />
        <div className="mt-6 h-32 bg-card" />
        <div className="mt-4 h-72 bg-card" />
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-mono text-sm text-accent"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Markets
        </Link>
        <p className="mt-8 font-display text-xl text-white">
          Market not found
        </p>
        <p className="mt-2 font-mono text-sm text-fg-muted">
          {error?.message ?? "No data for this id."}
        </p>
      </div>
    );
  }

  const expiresAt = new Date(market.expiresAt);
  const showResolutionBanner =
    market.status === "resolved" && market.outcome != null;
  const resolutionOutcome = market.outcome as Outcome;
  const resolutionSubtitle =
    resolutionOutcome === "rug"
      ? formatRugConditionLabel(
          marketResult?.rugCondition ?? market.rugCondition,
        )
      : "Token survived the full duration";

  const payoutTxSig =
    (typeof claimMut.data === "string" ? claimMut.data : null) ??
    (myPayout?.found === true ? myPayout.claimTxSignature : null);

  return (
    <>
      {showResolutionBanner ? (
        <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen max-w-none">
          <MarketResultBanner
            outcome={resolutionOutcome}
            subtitle={resolutionSubtitle}
            flashKey={resolveFlashKey}
          />
        </div>
      ) : null}
      <div className="mx-auto min-h-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.15em] text-fg-muted transition-colors hover:text-accent"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Markets
      </Link>

      {/* HEADER */}
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mt-4 flex flex-wrap items-start justify-between gap-4 border border-border bg-card p-5"
      >
        <div className="flex min-w-0 items-start gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-border bg-bg font-mono text-2xl font-bold text-accent"
            aria-hidden
          >
            {tickerLetter}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {market.tokenName ?? "Token"}
              </h1>
              <span className="font-mono text-base font-bold text-accent">
                ${market.tokenTicker ?? "—"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-5">
              <div>
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                  Price
                </p>
                <p className="mt-0.5 font-mono text-2xl font-bold tabular-nums text-white sm:text-3xl">
                  {displayPriceUsd != null ? formatUsd(displayPriceUsd) : "—"}
                </p>
              </div>
              <div>
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                  24h
                </p>
                <p
                  className={`mt-0.5 font-mono text-base font-bold tabular-nums ${
                    change24Num != null && change24Num < 0
                      ? "text-rug"
                      : change24Num != null && change24Num > 0
                        ? "text-survive"
                        : "text-fg-soft"
                  }`}
                >
                  {change24}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span
            className={`rounded-sm border bg-bg px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.15em] ${RISK_STYLES[risk]}`}
          >
            {risk} RISK
          </span>
          <motion.button
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={() => market && toggleStar(market.id)}
            className={
              market && isStarred(market.id)
                ? "flex items-center gap-1.5 rounded-md border border-accent bg-accent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink"
                : "flex items-center gap-1.5 rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-fg-soft transition-colors hover:border-accent hover:text-accent"
            }
          >
            <Star
              className="h-3 w-3"
              fill={
                market && isStarred(market.id) ? "currentColor" : "none"
              }
              aria-hidden
            />
            Watch
          </motion.button>
        </div>
      </motion.header>

      {/* MAIN GRID */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5 xl:items-start">
        {/* LEFT (60%) */}
        <div className="order-1 min-w-0 space-y-6 xl:col-span-3">
          {/* Chart */}
          <div className="border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-white">
                    Implied probability (pool-weighted)
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-fg-muted">
                    Same idea as Polymarket “% chance Yes” — here it’s implied {" "}
                    <span className="text-rug">RUG</span> vs{" "}
                    <span className="text-survive">survive</span> from stake split.
                    Updates live as bets land.
                  </p>
                </div>
                <div className="flex items-center gap-4 font-mono text-[10px] font-bold uppercase tracking-[0.15em]">
                  <span className="flex items-center gap-1.5 text-survive">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: CHART_SURVIVE_LINE }}
                      aria-hidden
                    />
                    Survive %
                  </span>
                  <span className="flex items-center gap-1.5 text-rug">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: CHART_RUG_LINE }}
                      aria-hidden
                    />
                    Rug %
                  </span>
                </div>
              </div>
              {liveRugSharePct != null ? (
                <p className="mt-3 font-mono text-3xl font-bold tabular-nums leading-none text-rug sm:text-4xl">
                  {liveRugSharePct.toFixed(1)}%{" "}
                  <span className="text-lg font-semibold text-fg-soft sm:text-xl">
                    chance RUG
                  </span>
                </p>
              ) : null}
              {liveSurviveSharePct != null ? (
                <p className="mt-1 font-mono text-lg font-bold tabular-nums text-survive sm:text-xl">
                  {liveSurviveSharePct.toFixed(1)}% survive
                </p>
              ) : null}
              <div
                className="mt-3 flex flex-wrap justify-end gap-1"
                role="tablist"
                aria-label="Pool history range"
              >
                {(
                  [
                    ["all", "ALL"],
                    ["1h", "1H"],
                    ["15m", "15M"],
                    ["5m", "5M"],
                  ] as const
                ).map(([key, label]) => {
                  const active = poolChartRange === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setPoolChartRange(key)}
                      className={
                        active
                          ? "rounded-sm bg-white px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-black"
                          : "rounded-sm px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg-soft transition-colors hover:text-white"
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="relative h-[280px] w-full sm:h-[340px]">
              {!chartReady ? (
                <div className="absolute inset-0 animate-pulse bg-bg" />
              ) : null}
              <div
                ref={poolChartTooltipRef}
                className="pointer-events-none absolute z-20 min-w-[132px] rounded-md border border-border bg-card/95 px-2.5 py-2 shadow-lg backdrop-blur-sm transition-opacity duration-75"
                style={{ opacity: 0, left: 0, top: 0 }}
              >
                <p
                  data-tip-date
                  className="font-mono text-[10px] text-fg-muted"
                />
                <p
                  data-tip-survive
                  className="mt-1 font-mono text-[11px] font-bold tabular-nums text-survive"
                />
                <p
                  data-tip-rug
                  className="font-mono text-[11px] font-bold tabular-nums text-rug"
                />
              </div>
              <div
                ref={chartContainerRef}
                className="h-full w-full rounded-md border border-dashed border-rug/35"
                style={{ userSelect: "none" }}
                onWheel={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Signals row */}
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.06 } },
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            {sortedSignals.map(({ label, value, Icon }) => (
              <motion.div
                key={label}
                variants={{
                  hidden: { opacity: 0, y: 12 },
                  show: { opacity: 1, y: 0 },
                }}
                className="border border-border bg-card p-4"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-accent" aria-hidden />
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                    {label}
                  </p>
                </div>
                <p className="mt-2 font-mono text-base font-semibold tabular-nums text-white">
                  {value}
                </p>
              </motion.div>
            ))}
          </motion.div>

          {/* Tabs */}
          <div className="border-b border-border">
            <div className="flex flex-wrap gap-1" role="tablist">
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
                    role="tab"
                    aria-selected={active}
                    onClick={() => setDetailTab(key)}
                    className="relative px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.15em] transition-colors"
                  >
                    <span
                      className={
                        active ? "text-accent" : "text-fg-soft hover:text-white"
                      }
                    >
                      {label}
                    </span>
                    {active ? (
                      <motion.span
                        layoutId="market-detail-tab"
                        className="absolute -bottom-px left-0 right-0 h-0.5 bg-accent"
                        transition={{ duration: 0.28, ease: "easeOut" }}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={detailTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border border-border bg-card p-5"
            >
              {detailTab === "about" ? (
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                      Liquidity
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-medium text-white">
                      {openLiquidityUsd != null
                        ? formatUsd(openLiquidityUsd)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                      Market cap
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-medium text-white">
                      {tokenHook.marketCap != null
                        ? formatPool(tokenHook.marketCap)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                      Dev wallet
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-medium text-fg-soft">
                      {devShown ? formatWallet(devShown) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                      Token age
                    </dt>
                    <dd
                      suppressHydrationWarning
                      className="mt-1 font-mono text-sm font-medium text-white"
                    >
                      {formatTokenAge(market.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                      Pair created
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-medium text-fg-soft">
                      {pairCreatedAtSeconds != null
                        ? new Date(
                            pairCreatedAtSeconds * 1000,
                          ).toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                      Bettors
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-medium text-white">
                      {market.totalBettors}
                    </dd>
                  </div>
                </dl>
              ) : null}

              {detailTab === "holders" ? (
                <div className="py-6 text-center font-mono text-sm text-fg-muted">
                  {tokenHook.holderCount != null ? (
                    <p className="text-white">
                      <span className="text-fg-muted">Estimated holders (Birdeye):</span>{" "}
                      {tokenHook.holderCount.toLocaleString()}
                    </p>
                  ) : (
                    <p>
                      No holder estimate from Birdeye yet. If you just added{" "}
                      <span className="text-fg-soft">BIRDEYE_API_KEY</span>, restart{" "}
                      <span className="text-fg-soft">apps/api</span> and refresh—cached token
                      payloads skip Birdeye for up to ~30s otherwise. Birdeye may also omit
                      holders for very new or unsupported mints. Full on-chain holder lists are
                      not wired yet.
                    </p>
                  )}
                </div>
              ) : null}

              {detailTab === "transactions" ? (
                <div className="overflow-x-auto">
                  {marketBets.length === 0 ? (
                    <p className="py-8 text-center font-mono text-sm text-fg-muted">
                      No bets recorded yet.
                    </p>
                  ) : (
                    <table className="w-full min-w-[320px] border-collapse font-mono text-xs">
                      <thead>
                        <tr className="border-b border-border text-left text-[9px] uppercase tracking-[0.2em] text-fg-muted">
                          <th className="pb-3 pr-4 font-bold">Time</th>
                          <th className="pb-3 pr-4 font-bold">Side</th>
                          <th className="pb-3 font-bold">Amount</th>
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
                              className="border-b border-border/80 transition-colors hover:bg-bg"
                            >
                              <td className="py-2.5 pr-4 tabular-nums text-fg-muted">
                                {timeStr}
                              </td>
                              <td
                                className={`py-2.5 pr-4 font-bold ${row.side === "survive" ? "text-survive" : "text-rug"}`}
                              >
                                {row.side === "survive" ? "SURVIVE" : "RUG"}
                              </td>
                              <td className="py-2.5 tabular-nums text-white">
                                {formatBetStake(row)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* RIGHT (40% sticky) */}
        <aside className="order-2 space-y-5 xl:sticky xl:top-20 xl:col-span-2">
          {/* Timer card with progress ring */}
          <div className="border border-accent/40 bg-card p-5 shadow-glow-sm">
            <p className="text-center font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted">
              Market closes in
            </p>
            <div className="mt-3 flex items-center justify-center">
              <ProgressTimerRing expiresAt={expiresAt} createdAt={new Date(market.createdAt)} />
            </div>
            <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-fg-muted">
              <span className="text-accent">Status:</span> {market.status}
            </p>
          </div>

          {/* Pool card */}
          <div className="border border-border bg-card p-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted">
              Pool snapshot
            </p>
            <div className="mt-4">
              <PoolBar survivePool={survive} rugPool={rug} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 font-mono text-sm">
              <div>
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                  Survive
                </p>
                <p className="mt-1 font-bold tabular-nums text-survive">
                  {poolSideLabels.survive}
                </p>
              </div>
              <div>
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                  Rug
                </p>
                <p className="mt-1 font-bold tabular-nums text-rug">
                  {poolSideLabels.rug}
                </p>
              </div>
              <div>
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                  Total
                </p>
                <p className="mt-1 font-bold tabular-nums text-white">
                  {totalPoolLabel}
                </p>
              </div>
              <div>
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                  Bettors
                </p>
                <p className="mt-1 font-bold tabular-nums text-white">
                  {market.totalBettors}
                </p>
              </div>
            </div>
          </div>

          <BetPanel market={market} onBet={onBet} position={position} />
          {market.status === "resolved" ? (
            userWallet ? (
              myPayout === undefined ? (
                <div className="border border-border bg-card p-5 font-mono text-xs text-fg-muted">
                  Loading payout…
                </div>
              ) : myPayout.found && myPayout.won ? (
                <div className="border-2 border-accent bg-card p-5 shadow-glow-sm">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                    🎉 You won!
                  </p>
                  <p className="mt-3 font-mono text-sm text-white">
                    Your bet:{" "}
                    <span className="font-bold text-white">
                      {formatSolBetLine(myPayout.betAmount / LAMPORTS_PER_SOL)}{" "}
                      <span
                        className={
                          myPayout.betSide === "survive"
                            ? "text-survive"
                            : "text-rug"
                        }
                      >
                        {myPayout.betSide.toUpperCase()}
                      </span>
                    </span>
                  </p>
                  <p className="mt-2 font-mono text-sm text-fg-muted">
                    Your payout:{" "}
                    <span className="font-bold tabular-nums text-accent">
                      {formatSolBetLine(myPayout.payoutAmount / LAMPORTS_PER_SOL)}
                    </span>
                  </p>
                  <div className="mt-4 border-t border-border pt-4">
                    {claimable ? (
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        type="button"
                        disabled={claimMut.isPending}
                        onClick={() => void claimMut.mutateAsync()}
                        className="w-full rounded-md border border-accent bg-accent px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:bg-transparent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {claimMut.isPending ? "Claiming…" : "Claim payout"}
                      </motion.button>
                    ) : payoutProcessing ? (
                      <div className="flex flex-col items-center gap-2 py-2 font-mono text-[11px] text-fg-muted">
                        <Loader2
                          className="h-5 w-5 animate-spin text-accent"
                          aria-hidden
                        />
                        <p className="text-center leading-relaxed">
                          Payout processing… (on-chain settlement). This usually
                          clears within ~30s.
                        </p>
                      </div>
                    ) : payoutTxSig ? (
                      <a
                        href={solscanTxUrl(payoutTxSig)}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-center font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-accent underline-offset-2 hover:underline"
                      >
                        View transaction ↗
                      </a>
                    ) : myPayout.claimed ? (
                      <p className="text-center font-mono text-[11px] font-bold text-accent">
                        Claimed ✅
                      </p>
                    ) : (
                      <p className="font-mono text-[11px] text-fg-muted">
                        Payout recorded.
                      </p>
                    )}
                  </div>
                </div>
              ) : myPayout.found ? (
                <div className="border-2 border-rug bg-card p-5 opacity-50">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-rug">
                    💀 You lost
                  </p>
                  <p className="mt-3 font-mono text-sm text-white">
                    Your bet:{" "}
                    <span className="font-bold">
                      {formatSolBetLine(myPayout.betAmount / LAMPORTS_PER_SOL)}{" "}
                      <span
                        className={
                          myPayout.betSide === "survive"
                            ? "text-survive"
                            : "text-rug"
                        }
                      >
                        {myPayout.betSide.toUpperCase()}
                      </span>
                    </span>
                  </p>
                  <p className="mt-2 font-mono text-xs text-fg-muted">
                    Better luck next time.
                  </p>
                </div>
              ) : null
            ) : (
              <div className="border border-border bg-card p-5 font-mono text-xs text-fg-muted">
                Connect your wallet to see resolution payout for your address.
              </div>
            )
          ) : position ? (
            <div className="border border-border bg-card p-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted">
                Your position
              </p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="font-mono text-xs">
                  <p className="text-fg-muted">Side</p>
                  <p
                    className={`mt-0.5 font-bold uppercase tracking-[0.15em] ${
                      position.side === "survive" ? "text-survive" : "text-rug"
                    }`}
                  >
                    {position.side}
                  </p>
                </div>
                <div className="font-mono text-right text-xs">
                  <p className="text-fg-muted">Stake</p>
                  <p className="mt-0.5 font-bold tabular-nums text-white">
                    {formatSolBetLine(position.stakeSol)}
                  </p>
                </div>
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <p className="font-mono text-[11px] text-fg-muted">
                  Claim becomes available after market resolution.
                </p>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      {/* Live feed below */}
      <section className="mt-12">
        <LiveFeed marketId={market.id} maxRows={20} heading="Last 20 Bets" />
      </section>
      </div>
    </>
  );
}

/** Lime ring around a timer that fills as the market progresses toward close. */
function ProgressTimerRing({
  expiresAt,
  createdAt,
}: {
  expiresAt: Date;
  createdAt: Date;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const total = expiresAt.getTime() - createdAt.getTime();
  const elapsed = Math.max(0, now - createdAt.getTime());
  const pct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
  const remainingMs = expiresAt.getTime() - now;
  const urgent = remainingMs > 0 && remainingMs < 5 * 60 * 1000;

  const radius = 64;
  const stroke = 4;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - pct / 100);

  return (
    <div className="relative h-[148px] w-[148px]">
      <svg
        viewBox="0 0 148 148"
        className="absolute inset-0"
        aria-hidden
      >
        <circle
          cx="74"
          cy="74"
          r={radius}
          stroke="#1a1a1a"
          strokeWidth={stroke}
          fill="none"
        />
        <motion.circle
          cx="74"
          cy="74"
          r={radius}
          stroke={urgent ? "#ef4444" : "#8aff8e"}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          initial={false}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{
            strokeDasharray: circ,
            transform: "rotate(-90deg)",
            transformOrigin: "74px 74px",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <Clock
            className="mx-auto mb-1 h-3.5 w-3.5 text-accent"
            aria-hidden
          />
          <Timer
            expiresAt={expiresAt}
            className={
              urgent
                ? "pulse-rug font-mono text-base font-bold tabular-nums text-rug"
                : "font-mono text-base font-bold tabular-nums text-accent"
            }
          />
        </div>
      </div>
    </div>
  );
}
