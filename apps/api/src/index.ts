import "dotenv/config";

import { createServer } from "node:http";

import type { ApiResponse } from "@survivefun/types";
import cors from "cors";
import express, { Router } from "express";
import { Server } from "socket.io";

import { assertProductionSafeOrExit } from "./config/productionGate";
import { startBackgroundJobs } from "./jobs/backgroundJobs";
import { errorHandler } from "./middleware/errorHandler";
import { marketBetsRouter, userBetsRouter } from "./routes/bets";
import leaderboardRouter from "./routes/leaderboard";
import marketsRouter from "./routes/markets";
import statsRouter from "./routes/stats";
import tokensRouter from "./routes/tokens";
import {
  createHeliusWebhookRouter,
  registerHeliusWebhook,
} from "./routes/webhook";
import { initSocketHandler } from "./websocket/socketHandler";

assertProductionSafeOrExit();

const isProduction = process.env.NODE_ENV === "production";
const PORT_RAW = process.env.PORT?.trim();
const parsedPort =
  PORT_RAW !== undefined && PORT_RAW !== ""
    ? Number.parseInt(PORT_RAW, 10)
    : Number.NaN;
const PORT = Number.isFinite(parsedPort) ? parsedPort : 3001;

const corsOrigins: string[] =
  process.env.CORS_ORIGIN?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

if (isProduction && corsOrigins.length === 0) {
  console.error(
    "[fatal] CORS_ORIGIN must list allowed origins (comma-separated) when NODE_ENV=production",
  );
  process.exit(1);
}

/** In production, only explicit origins (after check above). In dev, reflect any origin if unset. */
const expressCorsOrigin: boolean | string[] =
  corsOrigins.length > 0 ? corsOrigins : true;
/** Socket.IO: wildcard only when not production and CORS_ORIGIN unset. */
const socketCorsOrigin: string | string[] =
  corsOrigins.length > 0 ? corsOrigins : "*";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: socketCorsOrigin,
    methods: ["GET", "POST"],
  },
});

initSocketHandler(io);
console.log("✅ Socket.io initialized");

app.use(
  cors({
    origin: expressCorsOrigin,
    credentials: true,
  }),
);

/** Raw JSON body for Helius verification; must run before express.json(). */
const webhookRawBody = express.raw({
  type: "application/json",
  limit: "2mb",
});
app.use("/webhook", webhookRawBody, createHeliusWebhookRouter());
app.use("/v1/webhook", webhookRawBody, createHeliusWebhookRouter());
app.use("/api/v1/webhook", webhookRawBody, createHeliusWebhookRouter());

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const apiRouter = Router();
apiRouter.use("/markets", marketBetsRouter);
apiRouter.use("/markets", marketsRouter);
apiRouter.use("/users", userBetsRouter);
apiRouter.use("/tokens", tokensRouter);
apiRouter.use("/stats", statsRouter);
apiRouter.use("/leaderboard", leaderboardRouter);

app.use("/v1", apiRouter);
app.use("/api/v1", apiRouter);

app.use((_req, res) => {
  const body: ApiResponse<never> = {
    success: false,
    error: { code: "NOT_FOUND", message: "Not found" },
  };
  res.status(404).json(body);
});

app.use(errorHandler);

startBackgroundJobs();
console.log("✅ Background jobs started (resolver + OHLCV + stats)");

httpServer.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  void registerHeliusWebhook().then(() => {
    console.log("✅ Helius webhook registered");
  });
});
