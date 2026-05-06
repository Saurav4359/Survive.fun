"use client";

import type {
  BetPlaced,
  MarketResolved,
  SocketEvents,
} from "@survivefun/types";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";

import { API_URL } from "@/utils/constants";

export type PoolUpdatePayload = SocketEvents["pool_update"];

type WsSnapshot = {
  isConnected: boolean;
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
const listeners = new Set<() => void>();

let socketInstance: Socket | null = null;
let connectionRefCount = 0;

/** When set, only events for this market update `latestBet` / `poolUpdate` / `marketResolved`. */
let subscribedMarketId: string | null = null;

function emit(): void {
  listeners.forEach((fn) => fn());
}

function patchSnapshot(partial: Partial<WsSnapshot>): void {
  snapshot = { ...snapshot, ...partial };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): WsSnapshot {
  return snapshot;
}

function matchesSubscription(marketId: string): boolean {
  return (
    subscribedMarketId !== null && subscribedMarketId === marketId
  );
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
    typeof v.amountUsdc === "string" &&
    typeof v.survivePool === "string" &&
    typeof v.rugPool === "string" &&
    typeof v.timestamp === "string"
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

function onSocketConnect(): void {
  patchSnapshot({ isConnected: true });
}

function onSocketDisconnect(): void {
  patchSnapshot({ isConnected: false });
}

function onBetPlaced(raw: unknown): void {
  if (!isBetPlaced(raw)) return;
  if (!matchesSubscription(raw.marketId)) return;
  patchSnapshot({ latestBet: raw });
}

function onPoolUpdate(raw: unknown): void {
  if (!isPoolUpdate(raw)) return;
  if (!matchesSubscription(raw.marketId)) return;
  patchSnapshot({ poolUpdate: raw });
}

function onMarketResolved(raw: unknown): void {
  if (!isMarketResolved(raw)) return;
  if (!matchesSubscription(raw.marketId)) return;
  patchSnapshot({ marketResolved: raw });
}

function bindHandlers(socket: Socket): void {
  socket.on("connect", onSocketConnect);
  socket.on("disconnect", onSocketDisconnect);
  socket.on("bet_placed", onBetPlaced);
  socket.on("pool_update", onPoolUpdate);
  socket.on("market_resolved", onMarketResolved);
}

function unbindHandlers(socket: Socket): void {
  socket.off("connect", onSocketConnect);
  socket.off("disconnect", onSocketDisconnect);
  socket.off("bet_placed", onBetPlaced);
  socket.off("pool_update", onPoolUpdate);
  socket.off("market_resolved", onMarketResolved);
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
  emit();
}

/**
 * Focus socket-driven updates on a single market (required before events populate).
 * Clears the last event payloads when switching markets.
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

export function useWebSocket(): {
  isConnected: boolean;
  subscribeToMarket: (marketId: string) => void;
  latestBet: BetPlaced | null;
  poolUpdate: PoolUpdatePayload | null;
  marketResolved: MarketResolved | null;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

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
