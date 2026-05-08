import type {
  ApiResponse,
  Market,
  MarketChartResponse,
  MarketListPage,
  OhlcvBar,
} from "@survivefun/types";
import { Router } from "express";
import { z } from "zod";

import { connection } from "../config/solana";
import { prisma } from "../config/database";
import { birdeyeFetchOhlcv } from "../lib/birdeye";
import { cacheGet } from "../lib/redisCache";
import {
  pairToMarketBootstrap,
  requireDexPairForMint,
} from "../lib/dexscreener";
import { toMarketDto } from "../lib/dto";
import { verifyCreateMarketTransaction } from "../lib/solanaTxVerify";
import { parseBody, parseQuery } from "../lib/zodUtil";
import { AppError } from "../middleware/errorHandler";
import { emitMarketCreated } from "../websocket/socketHandler";

const router = Router();

const solanaAddress = z
  .string()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Invalid base58 address");

const listMarketsQuerySchema = z.object({
  status: z
    .enum(["active", "resolved", "expired", "all"])
    .optional()
    .default("active"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const createMarketBodySchema = z.object({
  tokenMint: solanaAddress,
  duration: z.union([
    z.literal(3600),
    z.literal(21600),
    z.literal(86400),
    z
      .enum(["1h", "6h", "24h"])
      .transform((s) =>
        s === "1h" ? 3600 : s === "6h" ? 21_600 : 86_400,
      ),
  ]),
  walletAddress: solanaAddress,
  createMarketTxSignature: z.string().min(64).max(128).optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const chartQuerySchema = z.object({
  interval: z.string().optional().default("1H"),
});

const activeMarketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(100),
});

function allowDbOnlyMarketCreate(): boolean {
  return process.env.ALLOW_DB_ONLY_MARKET_CREATE === "true";
}

router.get("/", async (req, res, next) => {
  try {
    const q = parseQuery(listMarketsQuerySchema, req.query);
    const where =
      q.status === "all"
        ? {}
        : { status: q.status as "active" | "resolved" | "expired" };

    const [total, rows] = await Promise.all([
      prisma.market.count({ where }),
      prisma.market.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);

    const items: Market[] = rows.map(toMarketDto);
    const data: MarketListPage = {
      items,
      page: q.page,
      limit: q.limit,
      total,
    };
    const body: ApiResponse<MarketListPage> = { success: true, data };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

/** Shorthand for active markets only (matches Frontend.md hook docs). */
router.get("/active", async (req, res, next) => {
  try {
    const q = parseQuery(activeMarketsQuerySchema, req.query);
    const where = { status: "active" as const };
    const [total, rows] = await Promise.all([
      prisma.market.count({ where }),
      prisma.market.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    const data: MarketListPage = {
      items: rows.map(toMarketDto),
      page: q.page,
      limit: q.limit,
      total,
    };
    const body: ApiResponse<MarketListPage> = { success: true, data };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

router.get("/:id/chart", async (req, res, next) => {
  try {
    const { id } = parseQuery(idParamSchema, req.params);
    const q = parseQuery(chartQuerySchema, req.query);
    const row = await prisma.market.findUnique({ where: { id } });
    if (!row) {
      throw new AppError("NOT_FOUND", "Market not found", 404);
    }
    const cacheKey = `ohlcv:${row.tokenMint}:${q.interval}`;
    const cached = await cacheGet(cacheKey);
    let bars: OhlcvBar[] = [];
    let source: MarketChartResponse["source"] = "none";
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          bars = parsed as OhlcvBar[];
          source = "birdeye";
        }
      } catch {
        /* fetch live */
      }
    }
    if (bars.length === 0) {
      bars = await birdeyeFetchOhlcv(row.tokenMint, q.interval);
      source = bars.length > 0 ? "birdeye" : "none";
    }
    const data: MarketChartResponse = {
      tokenMint: row.tokenMint,
      interval: q.interval,
      bars,
      source,
    };
    const body: ApiResponse<MarketChartResponse> = { success: true, data };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { id } = parseQuery(idParamSchema, req.params);
    const row = await prisma.market.findUnique({ where: { id } });
    if (!row) {
      throw new AppError("NOT_FOUND", "Market not found", 404);
    }
    const body: ApiResponse<Market> = { success: true, data: toMarketDto(row) };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = parseBody(createMarketBodySchema, req.body);
    const pair = await requireDexPairForMint(input.tokenMint);
    const boot = pairToMarketBootstrap(pair, input.tokenMint);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.duration * 1000);

    let onChainAddress: string | null = null;
    const dbOnly = allowDbOnlyMarketCreate();
    const sig = input.createMarketTxSignature?.trim();

    if (dbOnly && !sig) {
      onChainAddress = null;
    } else if (sig) {
      const verified = await verifyCreateMarketTransaction(
        connection,
        sig,
        input.walletAddress,
        input.tokenMint,
        input.duration,
      );
      onChainAddress = verified.marketPda;
    } else {
      throw new AppError(
        "REQUIRE_ONCHAIN_TX",
        "Submit create_market from your wallet, then pass createMarketTxSignature (or set ALLOW_DB_ONLY_MARKET_CREATE=true for local DB-only demo).",
        400,
      );
    }

    const row = await prisma.market.create({
      data: {
        tokenMint: input.tokenMint,
        tokenName: boot.tokenName,
        tokenTicker: boot.tokenTicker,
        creatorWallet: input.walletAddress,
        durationSeconds: input.duration,
        expiresAt,
        survivePool: 0,
        rugPool: 0,
        openPrice: boot.openPrice,
        openLiquidity: boot.openLiquidity,
        devWallet: boot.devWallet,
        status: "active",
        onChainAddress,
      },
    });

    const dto = toMarketDto(row);
    try {
      emitMarketCreated(dto);
    } catch {
      /* socket optional */
    }

    const body: ApiResponse<Market> = { success: true, data: dto };
    res.status(201).json(body);
  } catch (e) {
    next(e);
  }
});

export default router;
