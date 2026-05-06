"use client";

import type { BetPlaced, BetSide } from "@survivefun/types";
import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { API_URL } from "@/utils/constants";
import { formatUSDC, formatWallet } from "@/utils/format";

type FeedRow = {
  id: string;
  wallet: string;
  side: BetSide;
  amountUsdc: number;
  at: Date;
};

const FADE_AFTER_MS = 30_000;

function normalizeBetPayload(raw: BetPlaced, fallbackId: string): FeedRow {
  const amount = Number.parseFloat(raw.amountUsdc);
  return {
    id: `${raw.bettorWallet}-${raw.timestamp}-${fallbackId}`,
    wallet: raw.bettorWallet,
    side: raw.side,
    amountUsdc: Number.isFinite(amount) ? amount : 0,
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
  return 1 - t * 0.65;
}

export function LiveFeed({ marketId }: { marketId: string }) {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
    });
    socketRef.current = socket;

    const onBetPlaced = (payload: BetPlaced) => {
      if (payload.marketId !== marketId) return;
      const row = normalizeBetPayload(payload, `${Date.now()}-${Math.random()}`);
      setRows((prev) => [row, ...prev].slice(0, 80));
    };

    socket.on("bet_placed", onBetPlaced);

    socket.on("connect_error", () => {
      if (cancelled) return;
      setRows((prev) => {
        if (prev.length > 0) return prev;
        const t = new Date();
        return [
          {
            id: "demo-1",
            wallet: "Demo1111111111111111111111111111111111",
            side: "survive" as const,
            amountUsdc: 25,
            at: t,
          },
          {
            id: "demo-2",
            wallet: "Demo2222222222222222222222222222222222",
            side: "rug" as const,
            amountUsdc: 10,
            at: new Date(t.getTime() - 60_000),
          },
        ];
      });
    });

    return () => {
      cancelled = true;
      socket.off("bet_placed", onBetPlaced);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [marketId]);

  return (
    <section aria-label="Live bets" className="card-cyber">
      <div className="header-scanline flex items-center justify-between gap-2 border-b border-border px-5 py-4">
        <h2 className="relative z-[1] font-display text-sm font-bold uppercase tracking-widest text-foreground">
          Live bet feed
        </h2>
        <span className="relative z-[1] rounded-lg border border-border-glow/50 bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-accent-bright">
          Realtime
        </span>
      </div>
      <div
        ref={listRef}
        className="max-h-[420px] space-y-2 overflow-y-auto px-3 py-3 sm:max-h-[520px]"
      >
        <AnimatePresence initial={false}>
          {rows.length === 0 ? (
            <p className="px-2 py-10 text-center font-mono text-sm text-muted">
              Waiting for bets…
            </p>
          ) : (
            rows.map((r) => {
              const op = rowOpacity(r.at, now);
              return (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: -24 }}
                  animate={{ opacity: op, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  className={
                    r.side === "survive"
                      ? "border border-border border-l-4 border-l-survive bg-survive/5 px-3 py-2.5 shadow-glow-sm transition-colors duration-200 hover:border-border-glow/40"
                      : "border border-border border-l-4 border-l-rug bg-rug/5 px-3 py-2.5 shadow-[0_0_16px_rgba(239,68,68,0.12)] transition-colors duration-200 hover:border-rug/50"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-semibold text-foreground">
                        {formatWallet(r.wallet)}
                      </p>
                      <p className="mt-0.5 font-mono text-xs font-medium uppercase tracking-wide text-muted">
                        {r.side === "survive" ? (
                          <span className="text-survive">Survive</span>
                        ) : (
                          <span className="text-rug">Rug</span>
                        )}{" "}
                        ·{" "}
                        <span className="tabular-nums text-accent-bright">
                          {formatUSDC(r.amountUsdc)}
                        </span>
                      </p>
                    </div>
                    <time
                      dateTime={r.at.toISOString()}
                      className="shrink-0 font-mono text-[11px] tabular-nums text-muted"
                    >
                      {formatTime(r.at)}
                    </time>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
