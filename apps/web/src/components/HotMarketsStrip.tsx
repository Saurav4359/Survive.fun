"use client";

/**
 * Infinite marquees fail from tiny layout drift. Do not “simplify” this implementation unless you
 * fully understand the phase model.
 *
 * Implementation contract (do not regress):
 * - Never use flex `gap` on the animated track — spacing is margins on fixed-width pills.
 * - Never drive this strip with CSS keyframes or `animation` on the track.
 * - Never animate `width` on the track or pills for motion.
 * - Do not continuously re-sort children from live queries — use `useStableHotTrending`.
 * - Motion state lives in rAF + float phase modulo `W`; React render is not the animation clock.
 *
 * Phase model: internal float `phase ∈ [0, W)` advances each frame; transform is `-round(phase)`.
 * Wrapping is ONLY `((phase + step) % W + W) % W` — no `if (x < …) x = …` reset branches.
 * ResizeObserver updates `W` and `track.style.width = 2*W` only — never writes phase (normalization
 * happens once per tick via modulo against current `W`).
 */

import type { ApiResponse, Market, MarketListPage } from "@survivefun/types";
import { useQuery } from "@tanstack/react-query";
import { useReducedMotion } from "framer-motion";
import { Flame } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { TokenThumb } from "@/components/TokenThumb";
import { marketsQueryKey } from "@/hooks/useMarkets";
import { useFilteredOpenActiveMarkets } from "@/hooks/useFilteredOpenActiveMarkets";
import { useStableHotTrending } from "@/hooks/useStableHotTrending";
import {
  HOT_MARQUEE_MAX_DT_SEC,
  HOT_MARQUEE_PX_PER_SEC,
} from "@/lib/hotMarqueeConstants";
import { apiV1Url } from "@/utils/constants";
import { formatSolBetLine } from "@/utils/format";
import { isActiveMarketStillOpen } from "@/utils/marketListing";
import { totalPoolLamports } from "@/utils/marketRisk";

const IS_DEV = process.env.NODE_ENV === "development";

/** Inter-pill spacing — no flex `gap` on the track. */
const PILL_MARGIN_RIGHT_PX = 10;
const SEGMENT_PAD_RIGHT_PX = PILL_MARGIN_RIGHT_PX;

/** Frozen outer width so pool/ticker updates cannot change measured `W` mid-scroll. */
const PILL_OUTER_W_PX = 200;

function wrapPhase(phase: number, W: number): number {
  if (W <= 0) return phase;
  return ((phase % W) + W) % W;
}

const TrendingMarketPill = memo(function TrendingMarketPill({
  market: m,
  isLastInSegment,
}: {
  market: Market;
  isLastInSegment: boolean;
}) {
  return (
    <div
      className="survive-hot-marquee-pill pointer-events-none inline-flex shrink-0 select-none items-center gap-2 rounded border border-border bg-card px-2 py-1 whitespace-nowrap"
      style={{
        width: PILL_OUTER_W_PX,
        minWidth: PILL_OUTER_W_PX,
        maxWidth: PILL_OUTER_W_PX,
        marginRight: isLastInSegment ? 0 : PILL_MARGIN_RIGHT_PX,
      }}
    >
      <TokenThumb
        mint={m.tokenMint}
        ticker={m.tokenTicker ?? "?"}
        size={24}
        loading="eager"
      />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-mono text-[11px] font-bold tabular-nums text-white">
          ${m.tokenTicker ?? "—"}
        </p>
        <p className="truncate font-mono text-[9px] tabular-nums text-fg-muted">
          Pool {formatSolBetLine(totalPoolLamports(m) / 1e9)}
        </p>
      </div>
    </div>
  );
});

function usePrefersReducedMotionMedia(): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMatch(mq.matches);
    const fn = () => setMatch(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return match;
}

/** Memoized animated lane — stable identity; props stay referentially stable via trendingKey. */
const HotMarqueeAnimatedLane = memo(function HotMarqueeAnimatedLane({
  trending,
  trendingKey,
}: {
  trending: Market[];
  trendingKey: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const segmentRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const WRef = useRef(0);
  /** Float phase in `[0, W)` — only mutates in rAF; wrapping is pure modulo each frame. */
  const phaseRef = useRef(0);
  const roRafRef = useRef(0);

  const lastIdx = trending.length - 1;

  /** Measure only: `W` + track width. Does not read or write phase. */
  const applyWidthFromSegment = useCallback(() => {
    const seg = segmentRef.current;
    const track = trackRef.current;
    if (!seg || !track) return;

    const measured = seg.scrollWidth;
    if (measured <= 0) return;

    const prev = WRef.current;
    if (IS_DEV && prev > 0 && Math.abs(measured - prev) > 1) {
      console.warn("[HotMarquee] segment width delta", {
        measured,
        stored: prev,
      });
    }

    WRef.current = measured;
    track.style.width = `${2 * measured}px`;
  }, []);

  const scheduleMeasure = useCallback(() => {
    if (roRafRef.current) return;
    roRafRef.current = requestAnimationFrame(() => {
      roRafRef.current = 0;
      applyWidthFromSegment();
    });
  }, [applyWidthFromSegment]);

  useLayoutEffect(() => {
    applyWidthFromSegment();
  }, [applyWidthFromSegment, trendingKey]);

  useEffect(() => {
    const seg = segmentRef.current;
    if (!seg) return;

    const ro = new ResizeObserver(() => {
      scheduleMeasure();
    });
    ro.observe(seg);
    return () => {
      ro.disconnect();
      if (roRafRef.current) {
        cancelAnimationFrame(roRafRef.current);
        roRafRef.current = 0;
      }
    };
  }, [scheduleMeasure, trendingKey]);

  const [motionReady, setMotionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const vp = viewportRef.current;
    if (!vp) return;

    const waitImages = () =>
      Promise.all(
        [...vp.querySelectorAll("img")].map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) resolve();
              else {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }
            }),
        ),
      );

    void (async () => {
      await document.fonts.ready;
      await waitImages();
      if (!cancelled) setMotionReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [trendingKey]);

  useEffect(() => {
    if (!motionReady) return;

    let rafId = 0;
    let last = performance.now();
    let paused = document.visibilityState === "hidden";

    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      paused = hidden;
      if (!hidden) last = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const tick = (now: number) => {
      if (paused) {
        last = now;
        rafId = requestAnimationFrame(tick);
        return;
      }

      const track = trackRef.current;
      const W = WRef.current;

      let dt = (now - last) / 1000;
      last = now;
      dt = Math.min(dt, HOT_MARQUEE_MAX_DT_SEC);

      if (track && W > 0) {
        const step = HOT_MARQUEE_PX_PER_SEC * dt;
        let ph = wrapPhase(phaseRef.current, W);
        ph = wrapPhase(ph + step, W);
        phaseRef.current = ph;
        const renderX = Math.round(ph);
        track.style.transform = `translate3d(${-renderX}px, 0, 0)`;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(rafId);
    };
  }, [motionReady, trendingKey]);

  return (
    <div
      ref={viewportRef}
      className="survive-hot-marquee-viewport min-h-[44px] px-3 py-1 sm:px-5 lg:px-8"
    >
      <div
        ref={trackRef}
        className="survive-hot-marquee-track pointer-events-none"
      >
        <div
          ref={segmentRef}
          className="survive-hot-marquee-segment flex shrink-0 flex-nowrap items-center whitespace-nowrap"
          style={{
            paddingRight: SEGMENT_PAD_RIGHT_PX,
            boxSizing: "border-box",
          }}
        >
          {trending.map((m, idx) => (
            <TrendingMarketPill
              key={`a-${m.id}`}
              market={m}
              isLastInSegment={idx === lastIdx}
            />
          ))}
        </div>
        <div
          className="survive-hot-marquee-segment flex shrink-0 flex-nowrap items-center whitespace-nowrap"
          style={{
            paddingRight: SEGMENT_PAD_RIGHT_PX,
            boxSizing: "border-box",
          }}
          aria-hidden
        >
          {trending.map((m, idx) => (
            <TrendingMarketPill
              key={`b-${m.id}`}
              market={m}
              isLastInSegment={idx === lastIdx}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

export const HotMarketsStrip = memo(function HotMarketsStrip() {
  const reduceMotionHook = useReducedMotion();
  const prefersReducedMedia = usePrefersReducedMotionMedia();
  const reduceMotion = Boolean(reduceMotionHook ?? prefersReducedMedia);

  const marketsQuery = useQuery({
    queryKey: marketsQueryKey,
    queryFn: async (): Promise<Market[]> => {
      const params = new URLSearchParams({
        page: "1",
        limit: "100",
        status: "active",
      });
      const res = await fetch(`${apiV1Url("/markets")}?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Markets request failed (${res.status})`);
      }
      const body = (await res.json()) as ApiResponse<MarketListPage>;
      if (!body.success) {
        throw new Error(body.error.message || "Markets request failed");
      }
      return body.data.items.filter((m) => isActiveMarketStillOpen(m));
    },
    staleTime: 15_000,
  });

  const markets = useFilteredOpenActiveMarkets(marketsQuery.data ?? []);
  const trending = useStableHotTrending(markets);

  const trendingKey = useMemo(
    () => trending.map((m) => m.id).join(","),
    [trending],
  );

  if (trending.length === 0) {
    return null;
  }

  return (
    <div className="w-full min-w-0 shrink-0 border-b border-border bg-surface py-[2px]">
      <div
        className="mx-auto flex w-full min-w-0 max-w-[1200px] items-stretch gap-3"
        aria-label="Trending markets"
      >
        <div className="flex shrink-0 items-center gap-1 border-r border-border px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-accent sm:px-5 lg:px-8">
          <Flame className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" aria-hidden />
          <span className="hidden sm:inline">Hot Markets</span>
          <span className="sm:hidden">Hot</span>
        </div>
        {reduceMotion ? (
          <div className="survive-hot-marquee-viewport min-h-[44px] px-3 py-1 sm:px-5 lg:px-8">
            <div
              className="hide-scrollbar survive-hot-marquee-static flex flex-nowrap overflow-x-auto"
              style={{
                paddingRight: SEGMENT_PAD_RIGHT_PX,
                boxSizing: "border-box",
              }}
            >
              {trending.map((m, idx) => (
                <TrendingMarketPill
                  key={m.id}
                  market={m}
                  isLastInSegment={idx === trending.length - 1}
                />
              ))}
            </div>
          </div>
        ) : (
          <HotMarqueeAnimatedLane
            key={trendingKey}
            trending={trending}
            trendingKey={trendingKey}
          />
        )}
      </div>
    </div>
  );
});
