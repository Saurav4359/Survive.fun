import type { ApiResponse, Market } from "@survivefun/types";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../config/database";
import {
  pairToMarketBootstrap,
  requireDexPairForMint,
} from "../lib/dexscreener";
import { toMarketDto } from "../lib/dto";
import { parseBody, parseQuery } from "../lib/zodUtil";
import { AppError } from "../middleware/errorHandler";

const router = Router();

const solanaAddress = z
  .string()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Invalid base58 address");

const listMarketsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const createMarketBodySchema = z.object({
  tokenMint: solanaAddress,
  duration: z.union([
    z.literal(3600),
    z.literal(21600),
    z.literal(86400),
  ]),
  walletAddress: solanaAddress,
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

router.get("/", async (req, res, next) => {
  try {
    const q = parseQuery(listMarketsQuerySchema, req.query);
    const rows = await prisma.market.findMany({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
      take: q.limit,
    });
    const data: Market[] = rows.map(toMarketDto);
    const body: ApiResponse<Market[]> = { success: true, data };
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
    const expiresAt = new Date(
      now.getTime() + input.duration * 1000,
    );

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
      },
    });

    const body: ApiResponse<Market> = { success: true, data: toMarketDto(row) };
    res.status(201).json(body);
  } catch (e) {
    next(e);
  }
});

export default router;
