"use client";

import type {
  ApiResponse,
  Bet,
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
import { cn } from "@/lib/utils";
import { apiV1Url } from "@/utils/constants";
import { formatBetStake, formatSolBetLine, formatWallet } from "@/utils/format";
import { isLikelySolanaTxSignature, solscanTxUrl } from "@/utils/explorer";

type FeedRow =
  | {
      kind: "bet";
      id: string;
      wallet: string;
      side: BetSide;
      stakeLabel: string;
      at: Date;
      /** Place-bet on-chain signature when available (Solscan). */
      txSignature?: string;
    }
  | {
      kind: "resolved";
      id: string;
      headline: string;
      at: Date;
      outcome: MarketResolved["outcome"];
    };

function normalizeBetPayload(raw: BetPlaced, fallbackId: string): FeedRow {
  const id = raw.betId
    ? `bet:${raw.betId}`
    : `${raw.bettorWallet}-${raw.timestamp}-${fallbackId}`;
  return {
    kind: "bet",
    id,
    wallet: raw.bettorWallet,
    side: raw.side,
    stakeLabel: formatBetStake({
      amountLamports: raw.amountLamports ?? "0",
    }),
    at: new Date(raw.timestamp),
    txSignature: raw.txSignature,
  };
}

function betDtoToFeedRow(b: Bet): FeedRow {
  return {
    kind: "bet",
    id: `bet:${b.id}`,
    wallet: b.bettorWallet,
    side: b.side,
    stakeLabel: formatBetStake({
      amountLamports: b.amountLamports ?? "0",
    }),
    at: new Date(b.createdAt),
    txSignature: b.txSignature,
  };
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function FeedRowCard({ row }: { row: FeedRow }) {
  if (row.kind === "resolved") {
    return <ResolutionFeedCard row={row} />;
  }
  return (
    <motion.div
      key={row.id}
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={
        row.side === "survive"
          ? "border border-border border-l-[3px] border-l-survive bg-[#0d0d0d] px-3 py-2.5"
          : "border border-border border-l-[3px] border-l-rug bg-[#0d0d0d] px-3 py-2.5"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[13px] font-semibold leading-tight tracking-tight text-white">
            {formatWallet(row.wallet)}
          </p>
          <p className="mt-1 font-mono text-[11px] font-semibold leading-snug tracking-normal">
            {row.side === "survive" ? (
              <span className="text-survive brightness-110">Survive</span>
            ) : (
              <span className="text-rug brightness-110">Rug</span>
            )}
            <span className="text-neutral-500"> · </span>
            <span className="tabular-nums text-neutral-200">
              {row.stakeLabel}
            </span>
          </p>
        </div>
        <time
          dateTime={row.at.toISOString()}
          className="shrink-0 pt-0.5 font-mono text-[11px] font-medium tabular-nums leading-none text-fg-soft"
        >
          {formatTime(row.at)}
        </time>
      </div>
      {isLikelySolanaTxSignature(row.txSignature) ? (
        <a
          href={solscanTxUrl(row.txSignature)}
          target="_blank"
          rel="noreferrer"
          title="Open place-bet transaction on Solscan"
          className="mt-2 block w-full border-t border-border/60 pt-2 font-mono text-[11px] font-medium leading-normal tracking-normal text-red-400 underline-offset-[3px] hover:text-red-300 hover:underline"
        >
          See transaction details →
        </a>
      ) : null}
    </motion.div>
  );
}

function ResolutionFeedCard({
  row,
}: {
  row: Extract<FeedRow, { kind: "resolved" }>;
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
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={`${border} bg-[#0d0d0d] px-3 py-2.5`}
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
          <p className="mt-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            Resolved
          </p>
        </div>
        <time
          dateTime={row.at.toISOString()}
          className="shrink-0 pt-0.5 font-mono text-[11px] font-medium tabular-nums leading-none text-fg-soft"
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
  /** Bump to re-fetch REST hydration (e.g. after placing a bet). */
  refreshKey?: number;
  /** Override scroll area max-height. */
  listClassName?: string;
  /** Section wrapper (e.g. match column surface). */
  className?: string;
};

export function LiveFeed({
  marketId,
  maxRows = 50,
  heading = "Live Bets",
  compact = false,
  refreshKey = 0,
  listClassName,
  className: sectionClassName,
}: LiveFeedProps) {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToNewest = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, []);

  useLayoutEffect(() => {
    scrollToNewest();
  }, [rows, scrollToNewest]);

  /** Load existing bets from API — feed used to be socket-only, so it stayed empty without WS. */
  useEffect(() => {
    if (compact) return;
    let cancelled = false;
    const url = marketId
      ? apiV1Url(`/markets/${encodeURIComponent(marketId)}/bets`)
      : apiV1Url(
          `/stats/recent-bets?limit=${encodeURIComponent(String(maxRows))}`,
        );

    void (async () => {
      try {
        const res = await fetch(url);
        const j = (await res.json()) as ApiResponse<Bet[]>;
        if (cancelled || !res.ok || !j.success || !j.data?.length) return;
        const fromApi = j.data.map(betDtoToFeedRow).slice(0, maxRows);
        setRows((prev) => {
          const byId = new Map<string, FeedRow>();
          for (const r of fromApi) byId.set(r.id, r);
          for (const r of prev) {
            if (!byId.has(r.id)) byId.set(r.id, r);
          }
          return Array.from(byId.values())
            .sort((a, b) => b.at.getTime() - a.at.getTime())
            .slice(0, maxRows);
        });
      } catch {
        /* keep socket-only */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [compact, marketId, maxRows, refreshKey]);

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
      setRows((prev) => {
        const deduped = prev.filter((r) => r.id !== row.id);
        return [row, ...deduped].slice(0, maxRows);
      });
    },
    onMarketResolved: (r) => {
      void pushResolutionRow(r);
    },
  });

  return (
    <section
      aria-label="Live bets"
      className={cn("border border-border bg-card", sectionClassName)}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.2em] text-white">
          {!compact ? <Zap className="h-3.5 w-3.5 text-accent-bright" /> : null}
          {heading}
        </h2>
        {!compact ? (
          <span className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-accent-bright">
            <span
              className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-accent-bright shadow-glow-sm" : "bg-fg-soft"}`}
            />
            {isConnected ? "Live" : "Offline"}
          </span>
        ) : null}
      </div>
      <div
        ref={listRef}
        className={cn(
          "flex max-h-[420px] flex-col gap-2 overflow-y-auto px-3 py-2.5 sm:max-h-[520px] hide-scrollbar",
          listClassName,
        )}
      >
        {rows.length === 0 ? (
          <p className="px-2 py-10 text-center font-mono text-xs text-neutral-300">
            {isConnected ? "Waiting for bets…" : "Reconnecting…"}
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {rows.map((r) => (
              <FeedRowCard key={r.id} row={r} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
