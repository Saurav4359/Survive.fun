/**
 * Socket.IO wiring: client subscriptions (rooms) and typed server emits.
 * No database access — callers pass data in from routes/jobs/services.
 */

import type { BetPlaced, Market, MarketResolved } from "@survivefun/types";
import type { Server, Socket } from "socket.io";
import { z } from "zod";

/** All connected clients are joined here on connect (platform-wide feed). */
export const ROOM_PLATFORM_FEED = "platform_feed";

/** Platform stats subscribers (`subscribe_stats`). */
export const ROOM_STATS = "stats";

export function roomForMarket(marketId: string): string {
  return `market:${marketId}`;
}

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

const marketIdUuid = z.string().uuid();

function readSubscribeMarketPayload(raw: unknown): { marketId: string } | null {
  if (!isRecord(raw)) return null;
  const marketId = raw.marketId;
  if (typeof marketId !== "string" || marketId.trim() === "") return null;
  const parsed = marketIdUuid.safeParse(marketId.trim());
  if (!parsed.success) return null;
  return { marketId: parsed.data };
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

/**
 * Broadcasts `bet_placed` to all clients (home LiveFeed + market subscribers).
 * Clients filter by `marketId` as needed.
 */
export function emitBetPlaced(payload: BetPlaced): void {
  getIo().emit("bet_placed", payload);
}

/** Broadcasts pool totals after bets / external updates. */
export function emitPoolUpdate(payload: {
  marketId: string;
  survivePool: string;
  rugPool: string;
}): void {
  getIo().emit("pool_update", payload);
}

/** Full `MarketResolved` payload (matches `@survivefun/types` / frontend guards). */
export function emitMarketResolved(payload: MarketResolved): void {
  try {
    getIo().emit("market_resolved", payload);
  } catch (e) {
    console.log("[socket] market_resolved emit failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export function emitPayoutReady(payload: {
  wallet: string;
  amount: string;
  marketId: string;
}): void {
  try {
    getIo().emit("payout_ready", payload);
  } catch (e) {
    console.log("[socket] payout_ready emit failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export function emitPayoutClaimed(payload: {
  wallet: string;
  marketId: string;
  betId: string;
  amount: string;
}): void {
  try {
    getIo().emit("payout_claimed", payload);
  } catch (e) {
    console.log("[socket] payout_claimed emit failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
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
