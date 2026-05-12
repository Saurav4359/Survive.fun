"use client";

import type {
  BetPlaced,
  MarketResolved,
  SocketEvents,
} from "@survivefun/types";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";

import { API_URL } from "@/utils/constants";

export type PoolUpdatePayload = SocketEvents["pool_update"];

/**
 * Single, refcounted Socket.IO connection shared by every consumer.
 *
 * Two access patterns are supported:
 *   1. {@link useWebSocket} — scoped per-market: call `subscribeToMarket(id)` and
 *      read `latestBet` / `poolUpdate` / `marketResolved` from the snapshot
 *      (only events for the subscribed market populate it).
 *   2. {@link useWebSocketEvents} — global callbacks for ALL `bet_placed`,
 *      `pool_update` and `market_resolved` events regardless of subscription.
 *      Used to keep TanStack caches (markets list, my bets) live across the app.
 */

type WsSnapshot = {
  isConnected: boolean;
  /** Most recent event for the currently subscribed market (or null). */
  latestBet: BetPlaced | null;
  poolUpdate: PoolUpdatePayload | null;
  marketResolved: MarketResolved | null;
};

const INITIAL_SNAPSHOT: WsSnapshot = {
  isConnected: false,
  latestBet: null,
  poolUpdate: null,
  marketResolved: null,
};

let snapshot: WsSnapshot = { ...INITIAL_SNAPSHOT };
const snapshotListeners = new Set<() => void>();

let socketInstance: Socket | null = null;
let connectionRefCount = 0;

/** When set, only events for this market update the snapshot fields. */
let subscribedMarketId: string | null = null;

/** Global event listeners — fire for EVERY validated event regardless of subscription. */
const betListeners = new Set<(b: BetPlaced) => void>();
const poolListeners = new Set<(p: PoolUpdatePayload) => void>();
const resolvedListeners = new Set<(r: MarketResolved) => void>();
const payoutReadyListeners = new Set<(p: SocketEvents["payout_ready"]) => void>();
const payoutClaimedListeners = new Set<
  (p: SocketEvents["payout_claimed"]) => void
>();

function emitSnapshot(): void {
  snapshotListeners.forEach((fn) => fn());
}

function patchSnapshot(partial: Partial<WsSnapshot>): void {
  snapshot = { ...snapshot, ...partial };
  emitSnapshot();
}

function subscribeSnapshot(listener: () => void): () => void {
  snapshotListeners.add(listener);
  return () => snapshotListeners.delete(listener);
}

function getSnapshot(): WsSnapshot {
  return snapshot;
}

function getServerSnapshot(): WsSnapshot {
  return INITIAL_SNAPSHOT;
}

function matchesSubscription(marketId: string): boolean {
  return subscribedMarketId !== null && subscribedMarketId === marketId;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isBetPlaced(v: unknown): v is BetPlaced {
  if (!isRecord(v)) return false;
  return (
    typeof v.marketId === "string" &&
    typeof v.bettorWallet === "string" &&
    (v.side === "survive" || v.side === "rug") &&
    (v.currency === "sol" || v.currency === "usdc") &&
    typeof v.amountUsdc === "string" &&
    (v.amountLamports === null || typeof v.amountLamports === "string") &&
    typeof v.survivePool === "string" &&
    typeof v.rugPool === "string" &&
    typeof v.timestamp === "string" &&
    (v.betId === undefined || typeof v.betId === "string") &&
    (v.txSignature === undefined || typeof v.txSignature === "string")
  );
}

function isPoolUpdate(v: unknown): v is PoolUpdatePayload {
  if (!isRecord(v)) return false;
  return (
    typeof v.marketId === "string" &&
    typeof v.survivePool === "string" &&
    typeof v.rugPool === "string"
  );
}

function isMarketResolved(v: unknown): v is MarketResolved {
  if (!isRecord(v)) return false;
  return (
    typeof v.marketId === "string" &&
    (v.outcome === "survive" || v.outcome === "rug") &&
    typeof v.survivePool === "string" &&
    typeof v.rugPool === "string" &&
    typeof v.timestamp === "string"
  );
}

function isPayoutReady(v: unknown): v is SocketEvents["payout_ready"] {
  if (!isRecord(v)) return false;
  return (
    typeof v.wallet === "string" &&
    typeof v.amount === "string" &&
    typeof v.marketId === "string"
  );
}

function isPayoutClaimed(v: unknown): v is SocketEvents["payout_claimed"] {
  if (!isRecord(v)) return false;
  return (
    typeof v.wallet === "string" &&
    typeof v.marketId === "string" &&
    typeof v.betId === "string" &&
    typeof v.amount === "string"
  );
}

function onSocketConnect(): void {
  patchSnapshot({ isConnected: true });
  // Re-subscribe after reconnect so the API resumes scoped delivery.
  if (subscribedMarketId && socketInstance) {
    socketInstance.emit("subscribe_market", { marketId: subscribedMarketId });
  }
}

function onSocketDisconnect(): void {
  patchSnapshot({ isConnected: false });
}

function onBetPlaced(raw: unknown): void {
  if (!isBetPlaced(raw)) return;
  betListeners.forEach((fn) => {
    try {
      fn(raw);
    } catch {
      /* ignore listener throw */
    }
  });
  if (matchesSubscription(raw.marketId)) {
    patchSnapshot({ latestBet: raw });
  }
}

function onPoolUpdate(raw: unknown): void {
  if (!isPoolUpdate(raw)) return;
  poolListeners.forEach((fn) => {
    try {
      fn(raw);
    } catch {
      /* ignore listener throw */
    }
  });
  if (matchesSubscription(raw.marketId)) {
    patchSnapshot({ poolUpdate: raw });
  }
}

function onMarketResolved(raw: unknown): void {
  if (!isMarketResolved(raw)) return;
  resolvedListeners.forEach((fn) => {
    try {
      fn(raw);
    } catch {
      /* ignore listener throw */
    }
  });
  if (matchesSubscription(raw.marketId)) {
    patchSnapshot({ marketResolved: raw });
  }
}

function onPayoutReady(raw: unknown): void {
  if (!isPayoutReady(raw)) return;
  payoutReadyListeners.forEach((fn) => {
    try {
      fn(raw);
    } catch {
      /* ignore listener throw */
    }
  });
}

function onPayoutClaimed(raw: unknown): void {
  if (!isPayoutClaimed(raw)) return;
  payoutClaimedListeners.forEach((fn) => {
    try {
      fn(raw);
    } catch {
      /* ignore listener throw */
    }
  });
}

function bindHandlers(socket: Socket): void {
  socket.on("connect", onSocketConnect);
  socket.on("disconnect", onSocketDisconnect);
  socket.on("bet_placed", onBetPlaced);
  socket.on("pool_update", onPoolUpdate);
  socket.on("market_resolved", onMarketResolved);
  socket.on("payout_ready", onPayoutReady);
  socket.on("payout_claimed", onPayoutClaimed);
}

function unbindHandlers(socket: Socket): void {
  socket.off("connect", onSocketConnect);
  socket.off("disconnect", onSocketDisconnect);
  socket.off("bet_placed", onBetPlaced);
  socket.off("pool_update", onPoolUpdate);
  socket.off("market_resolved", onMarketResolved);
  socket.off("payout_ready", onPayoutReady);
  socket.off("payout_claimed", onPayoutClaimed);
}

function acquireSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(API_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    if (process.env.NODE_ENV === "development") {
      socketInstance.on("connect_error", (err) => {
        console.warn(
          "[socket.io] connect_error — is the API running at",
          API_URL,
          "?",
          err.message,
        );
      });
    }
    bindHandlers(socketInstance);
    patchSnapshot({ isConnected: socketInstance.connected });
  }
  return socketInstance;
}

function releaseSocket(): void {
  if (!socketInstance) return;
  unbindHandlers(socketInstance);
  socketInstance.disconnect();
  socketInstance = null;
  subscribedMarketId = null;
  snapshot = { ...INITIAL_SNAPSHOT };
  emitSnapshot();
}

/**
 * Focus the per-market snapshot fields on a single market. Required before the
 * scoped `latestBet` / `poolUpdate` / `marketResolved` slots populate.
 * Clears prior payloads when switching markets.
 */
export function subscribeToMarket(marketId: string): void {
  subscribedMarketId = marketId;
  patchSnapshot({
    latestBet: null,
    poolUpdate: null,
    marketResolved: null,
  });
  socketInstance?.emit("subscribe_market", { marketId });
}

/**
 * Per-market socket hook (legacy). Returns the snapshot scoped to the market
 * passed to `subscribeToMarket`. Use {@link useWebSocketEvents} for global
 * cache invalidation.
 */
export function useWebSocket(): {
  isConnected: boolean;
  subscribeToMarket: (marketId: string) => void;
  latestBet: BetPlaced | null;
  poolUpdate: PoolUpdatePayload | null;
  marketResolved: MarketResolved | null;
} {
  const state = useSyncExternalStore(
    subscribeSnapshot,
    getSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    connectionRefCount += 1;
    acquireSocket();

    return () => {
      connectionRefCount -= 1;
      if (connectionRefCount <= 0) {
        releaseSocket();
      }
    };
  }, []);

  const subscribeMarket = useCallback((marketId: string) => {
    subscribeToMarket(marketId);
  }, []);

  return {
    isConnected: state.isConnected,
    subscribeToMarket: subscribeMarket,
    latestBet: state.latestBet,
    poolUpdate: state.poolUpdate,
    marketResolved: state.marketResolved,
  };
}

/**
 * Subscribes to ALL `bet_placed`, `pool_update` and `market_resolved` events
 * regardless of which market the snapshot is scoped to. Use this to drive
 * cache invalidation, global toasts, top-level live feeds, etc.
 *
 * Each callback is held in a ref internally so consumers can pass inline
 * functions without thrashing the subscription set.
 */
export function useWebSocketEvents(handlers: {
  onBetPlaced?: (b: BetPlaced) => void;
  onPoolUpdate?: (p: PoolUpdatePayload) => void;
  onMarketResolved?: (r: MarketResolved) => void;
  onPayoutReady?: (p: SocketEvents["payout_ready"]) => void;
  onPayoutClaimed?: (p: SocketEvents["payout_claimed"]) => void;
}): { isConnected: boolean } {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const state = useSyncExternalStore(
    subscribeSnapshot,
    getSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    connectionRefCount += 1;
    acquireSocket();
    return () => {
      connectionRefCount -= 1;
      if (connectionRefCount <= 0) {
        releaseSocket();
      }
    };
  }, []);

  useEffect(() => {
    const onBet = (b: BetPlaced) => handlersRef.current.onBetPlaced?.(b);
    const onPool = (p: PoolUpdatePayload) =>
      handlersRef.current.onPoolUpdate?.(p);
    const onResolved = (r: MarketResolved) =>
      handlersRef.current.onMarketResolved?.(r);
    const onPayReady = (p: SocketEvents["payout_ready"]) =>
      handlersRef.current.onPayoutReady?.(p);
    const onPayClaimed = (p: SocketEvents["payout_claimed"]) =>
      handlersRef.current.onPayoutClaimed?.(p);

    betListeners.add(onBet);
    poolListeners.add(onPool);
    resolvedListeners.add(onResolved);
    payoutReadyListeners.add(onPayReady);
    payoutClaimedListeners.add(onPayClaimed);

    return () => {
      betListeners.delete(onBet);
      poolListeners.delete(onPool);
      resolvedListeners.delete(onResolved);
      payoutReadyListeners.delete(onPayReady);
      payoutClaimedListeners.delete(onPayClaimed);
    };
  }, []);

  return { isConnected: state.isConnected };
}
