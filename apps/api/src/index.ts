import "dotenv/config";

import { createServer } from "node:http";

import type { ApiResponse } from "@survivefun/types";
import cors from "cors";
import express, { Router } from "express";
import { Server } from "socket.io";

import { errorHandler } from "./middleware/errorHandler";

const PORT = Number(process.env.PORT) || 3001;

const corsOrigins = process.env.CORS_ORIGIN?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  socket.on("disconnect", () => undefined);
});

app.use(
  cors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const apiRouter = Router();
app.use("/v1", apiRouter);

app.use((_req, res) => {
  const body: ApiResponse<never> = {
    success: false,
    error: { code: "NOT_FOUND", message: "Not found" },
  };
  res.status(404).json(body);
});

app.use(errorHandler);

httpServer.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
