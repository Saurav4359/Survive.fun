/**
 * Socket.IO wiring: client subscriptions (rooms) and typed server emits.
 * No database access — callers pass data in from routes/jobs/services.
 */

import type { BetSide, Market, Outcome } from "@survivefun/types";
import type { Server, Socket } from "socket.io";

/** All connected clients are joined here on connect (platform-wide feed). */
export const ROOM_PLATFORM_FEED = "platform_feed";

/** Platform stats subscribers (`subscribe_stats`). */
export const ROOM_STATS = "stats";

export function roomForMarket(marketId: string): string {
  return `market:${marketId}`;
}

export type BetPlacedSocketPayload = {
  marketId: string;
  side: BetSide;
  amount: string;
  wallet: string;
  timestamp: string;
};

export type MarketResolvedSocketPayload = {
  marketId: string;
  outcome: Outcome;
};

export type StatsUpdatePayload = {
  totalMarkets: number;
  totalVolume: string;
  activeTraders: number;
};

let ioRef: Server | null = null;

function getIo(): Server {
  if (!ioRef) {
    throw new Error("initSocketHandler must be called before emitting");
  }
  return ioRef;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readSubscribeMarketPayload(raw: unknown): { marketId: string } | null {
  if (!isRecord(raw)) return null;
  const marketId = raw.marketId;
  if (typeof marketId !== "string" || marketId.trim() === "") return null;
  return { marketId: marketId.trim() };
}

function handleSubscribeMarket(socket: Socket, raw: unknown): void {
  const parsed = readSubscribeMarketPayload(raw);
  if (!parsed) {
    console.log("[socket] subscribe_market invalid payload", { socketId: socket.id });
    return;
  }
  const room = roomForMarket(parsed.marketId);
  void socket.join(room);
  console.log("[socket] subscribe_market", { socketId: socket.id, room });
}

function handleSubscribeStats(socket: Socket): void {
  void socket.join(ROOM_STATS);
  console.log("[socket] subscribe_stats", { socketId: socket.id, room: ROOM_STATS });
}

/**
 * Registers connection handlers and stores `io` for emit helpers.
 */
export function initSocketHandler(io: Server): void {
  ioRef = io;

  io.on("connection", (socket) => {
    void socket.join(ROOM_PLATFORM_FEED);

    socket.on("subscribe_market", (payload: unknown) => {
      try {
        handleSubscribeMarket(socket, payload);
      } catch (e) {
        console.log("[socket] subscribe_market error", {
          socketId: socket.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });

    socket.on("subscribe_stats", () => {
      try {
        handleSubscribeStats(socket);
      } catch (e) {
        console.log("[socket] subscribe_stats error", {
          socketId: socket.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });
  });
}

/** Emits only to `ROOM_PLATFORM_FEED` (every connected socket is auto-joined). */
export function emitMarketCreated(market: Market): void {
  getIo().to(ROOM_PLATFORM_FEED).emit("market_created", { market });
}

/** Emits only to subscribers of that market room. */
export function emitBetPlaced(payload: BetPlacedSocketPayload): void {
  getIo()
    .to(roomForMarket(payload.marketId))
    .emit("bet_placed", payload);
}

/** Emits only to subscribers of that market room. */
export function emitPoolUpdate(payload: {
  marketId: string;
  survivePool: string;
  rugPool: string;
}): void {
  getIo().to(roomForMarket(payload.marketId)).emit("pool_update", payload);
}

/** Emits only to subscribers of that market room. */
export function emitMarketResolved(payload: MarketResolvedSocketPayload): void {
  getIo().to(roomForMarket(payload.marketId)).emit("market_resolved", payload);
}

/** Emits only to `ROOM_PLATFORM_FEED`. */
export function emitNewToken(payload: {
  tokenMint: string;
  tokenName: string | null;
}): void {
  getIo().to(ROOM_PLATFORM_FEED).emit("new_token", payload);
}

/** Emits only to clients that called `subscribe_stats`. */
export function emitStatsUpdate(payload: StatsUpdatePayload): void {
  getIo().to(ROOM_STATS).emit("stats_update", payload);
}
