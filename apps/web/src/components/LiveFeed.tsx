"use client";

import type {
  ApiResponse,
  BetPlaced,
  BetSide,
  MarketResultPayload,
  MarketResolved,
} from "@survivefun/types";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { AnimatePresence, motion } from "framer-motion";
import { Zap } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useWebSocketEvents } from "@/hooks/useWebSocket";
import { apiV1Url } from "@/utils/constants";
import { formatBetStake, formatSolBetLine, formatWallet } from "@/utils/format";

type FeedRow =
  | {
      kind: "bet";
      id: string;
      wallet: string;
      side: BetSide;
      stakeLabel: string;
      at: Date;
    }
  | {
      kind: "resolved";
      id: string;
      headline: string;
      at: Date;
      outcome: MarketResolved["outcome"];
    };

const FADE_AFTER_MS = 30_000;

function normalizeBetPayload(raw: BetPlaced, fallbackId: string): FeedRow {
  return {
    kind: "bet",
    id: `${raw.bettorWallet}-${raw.timestamp}-${fallbackId}`,
    wallet: raw.bettorWallet,
    side: raw.side,
    stakeLabel: formatBetStake({
      amountLamports: raw.amountLamports ?? "0",
    }),
    at: new Date(raw.timestamp),
  };
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function rowOpacity(at: Date, now: number): number {
  const age = now - at.getTime();
  if (age <= FADE_AFTER_MS) return 1;
  const t = Math.min(1, (age - FADE_AFTER_MS) / 8000);
  return 1 - t * 0.7;
}

function FeedRowCard({ row, opacity }: { row: FeedRow; opacity: number }) {
  if (row.kind === "resolved") {
    return (
      <ResolutionFeedCard row={row} opacity={opacity} />
    );
  }
  return (
    <motion.div
      key={row.id}
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      style={{ opacity }}
      className={
        row.side === "survive"
          ? "border border-border border-l-[3px] border-l-survive bg-card px-3 py-2"
          : "border border-border border-l-[3px] border-l-rug bg-card px-3 py-2"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-semibold text-white">
            {formatWallet(row.wallet)}
          </p>
          <p className="mt-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em]">
            {row.side === "survive" ? (
              <span className="text-survive">Survive</span>
            ) : (
              <span className="text-rug">Rug</span>
            )}{" "}
            <span className="text-fg-muted">·</span>{" "}
            <span className="tabular-nums text-accent">{row.stakeLabel}</span>
          </p>
        </div>
        <time
          dateTime={row.at.toISOString()}
          className="shrink-0 font-mono text-[10px] tabular-nums text-fg-muted"
        >
          {formatTime(row.at)}
        </time>
      </div>
    </motion.div>
  );
}

function ResolutionFeedCard({
  row,
  opacity,
}: {
  row: Extract<FeedRow, { kind: "resolved" }>;
  opacity: number;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  /** GSAP is lazy-loaded so it isn’t parsed with the feed module — production-friendly splitting. */
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    let cancelled = false;
    let ctx: { revert: () => void } | undefined;

    const pending = import("gsap").then(({ gsap }) => {
      if (cancelled) return;
      ctx = gsap.context(() => {
        gsap
          .timeline({ defaults: { ease: "power2.inOut" } })
          .to(el, { rotation: -2, duration: 0.09 })
          .to(el, { rotation: 2, duration: 0.09 })
          .to(el, { rotation: -2, duration: 0.09 })
          .to(el, { rotation: 2, duration: 0.09 })
          .to(el, { rotation: 0, duration: 0.1, ease: "power2.out" });
      }, el);
    });

    return () => {
      cancelled = true;
      void pending.then(() => {
        ctx?.revert();
      });
    };
  }, [row.id]);

  const border =
    row.outcome === "rug"
      ? "border border-rug/60 border-l-[3px] border-l-rug bg-card"
      : "border border-accent/50 border-l-[3px] border-l-accent bg-card";

  return (
    <motion.div
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      style={{ opacity }}
      className={`${border} px-3 py-2.5`}
    >
      <div
        ref={bodyRef}
        className="flex items-start justify-between gap-3"
        style={{ transformOrigin: "50% 50%" }}
      >
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] font-semibold leading-snug text-white">
            {row.headline}
          </p>
          <p className="mt-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-fg-muted">
            Resolved
          </p>
        </div>
        <time
          dateTime={row.at.toISOString()}
          className="shrink-0 font-mono text-[10px] tabular-nums text-fg-muted"
        >
          {formatTime(row.at)}
        </time>
      </div>
    </motion.div>
  );
}

export type LiveFeedProps = {
  /** Limit feed to a single market id; omit for the global feed. */
  marketId?: string;
  /** Cap rows stored (default 50). */
  maxRows?: number;
  /** Section heading (default "Live Bets"). */
  heading?: string;
  /** Compact mode hides icon & realtime badge. */
  compact?: boolean;
};

export function LiveFeed({
  marketId,
  maxRows = 50,
  heading = "Live Bets",
  compact = false,
}: LiveFeedProps) {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToNewest = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, []);

  useLayoutEffect(() => {
    scrollToNewest();
  }, [rows, scrollToNewest]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(id);
  }, []);

  const pushResolutionRow = useCallback(
    async (r: MarketResolved) => {
      if (marketId && r.marketId !== marketId) return;
      const at = new Date(r.timestamp);
      const rowId = `resolved-${r.marketId}-${r.timestamp}`;
      let headline = `${r.outcome === "rug" ? "💀" : "✅"} Market ${r.outcome === "rug" ? "rugged" : "survived"}`;

      try {
        const res = await fetch(
          apiV1Url(`/markets/${encodeURIComponent(r.marketId)}/result`),
        );
        const j = (await res.json()) as ApiResponse<MarketResultPayload>;
        if (j.success && j.data) {
          const t = j.data.market.tokenTicker ?? "TOKEN";
          const distSol = j.data.totalDistributed / LAMPORTS_PER_SOL;
          const winSide = r.outcome === "rug" ? "RUG" : "SURVIVE";
          const verb = r.outcome === "rug" ? "RUGGED" : "SURVIVED";
          const emoji = r.outcome === "rug" ? "💀" : "✅";
          headline = `${emoji} $${t} ${verb} — ${winSide} bettors won ${formatSolBetLine(distSol)}`;
        }
      } catch {
        /* keep fallback headline */
      }

      const resolvedRow: Extract<FeedRow, { kind: "resolved" }> = {
        kind: "resolved",
        id: rowId,
        headline,
        at,
        outcome: r.outcome,
      };
      setRows((prev) => [resolvedRow, ...prev].slice(0, maxRows));
    },
    [marketId, maxRows],
  );

  const { isConnected } = useWebSocketEvents({
    onBetPlaced: (payload) => {
      if (marketId && payload.marketId !== marketId) return;
      const row = normalizeBetPayload(
        payload,
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      );
      setRows((prev) => [row, ...prev].slice(0, maxRows));
    },
    onMarketResolved: (r) => {
      void pushResolutionRow(r);
    },
  });

  return (
    <section
      aria-label="Live bets"
      className="border border-border bg-card"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.2em] text-white">
          {!compact ? <Zap className="h-3.5 w-3.5 text-accent" /> : null}
          {heading}
        </h2>
        {!compact ? (
          <span className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-accent">
            <span
              className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-accent shadow-glow-sm" : "bg-fg-muted"}`}
            />
            {isConnected ? "Live" : "Offline"}
          </span>
        ) : null}
      </div>
      <div
        ref={listRef}
        className="flex max-h-[420px] flex-col gap-2 overflow-y-auto px-3 py-3 sm:max-h-[520px] hide-scrollbar"
      >
        {rows.length === 0 ? (
          <p className="px-2 py-10 text-center font-mono text-xs text-fg-muted">
            {isConnected ? "Waiting for bets…" : "Reconnecting…"}
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {rows.map((r) => (
              <FeedRowCard key={r.id} row={r} opacity={rowOpacity(r.at, now)} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
