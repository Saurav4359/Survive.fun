import { Prisma } from "@prisma/client";
import type { Bet } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { prisma } from "./markets";

const solanaAddress = z
  .string()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/);

const txSignatureSchema = z
  .string()
  .min(64)
  .max(128)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/);

const placeBetBodySchema = z.object({
  side: z.enum(["survive", "rug"]),
  amount: z.union([z.string().regex(/^\d+(\.\d+)?$/), z.number().positive()]),
  txSignature: txSignatureSchema,
  bettorWallet: solanaAddress,
});

const marketIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const walletParamsSchema = z.object({
  wallet: solanaAddress,
});

const listBetsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } });
}

function sendOk<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

function serializeBet(b: Bet) {
  return {
    id: b.id,
    marketId: b.marketId,
    bettorWallet: b.bettorWallet,
    side: b.side,
    amountUsdc: b.amountUsdc.toString(),
    potentialWin: b.potentialWin?.toString() ?? null,
    txSignature: b.txSignature,
    claimed: b.claimed,
    payoutAmount: b.payoutAmount?.toString() ?? null,
    payoutTx: b.payoutTx,
    createdAt: b.createdAt.toISOString(),
  };
}

const router = Router();

router.post("/markets/:id/bets", async (req: Request, res: Response) => {
  try {
    const paramsParsed = marketIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid market id");
      return;
    }

    const bodyParsed = placeBetBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      sendError(
        res,
        400,
        "VALIDATION_ERROR",
        JSON.stringify(bodyParsed.error.flatten().fieldErrors),
      );
      return;
    }

    const marketId = paramsParsed.data.id;
    const { side, amount, txSignature, bettorWallet } = bodyParsed.data;

    const market = await prisma.market.findUnique({ where: { id: marketId } });
    if (!market) {
      sendError(res, 404, "NOT_FOUND", "Market not found");
      return;
    }
    if (market.status !== "active") {
      sendError(res, 409, "MARKET_NOT_ACTIVE", "Market is not accepting bets");
      return;
    }
    if (market.expiresAt.getTime() <= Date.now()) {
      sendError(res, 409, "MARKET_EXPIRED", "Market has expired");
      return;
    }

    const amountStr = typeof amount === "number" ? amount.toString() : amount;

    const created = await prisma.bet.create({
      data: {
        marketId,
        bettorWallet,
        side,
        amountUsdc: amountStr,
        potentialWin: null,
        txSignature,
        claimed: false,
        payoutAmount: null,
        payoutTx: null,
      },
    });

    sendOk(res, { bet: serializeBet(created) }, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      sendError(res, 409, "DUPLICATE_TX", "This transaction signature is already recorded");
      return;
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    sendError(res, 500, "INTERNAL_ERROR", message);
  }
});

router.get("/markets/:id/bets", async (req: Request, res: Response) => {
  try {
    const paramsParsed = marketIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid market id");
      return;
    }

    const queryParsed = listBetsQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid query parameters");
      return;
    }

    const { id } = paramsParsed.data;
    const { page, limit } = queryParsed.data;
    const skip = (page - 1) * limit;

    const market = await prisma.market.findUnique({ where: { id } });
    if (!market) {
      sendError(res, 404, "NOT_FOUND", "Market not found");
      return;
    }

    const [rows, total] = await Promise.all([
      prisma.bet.findMany({
        where: { marketId: id },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.bet.count({ where: { marketId: id } }),
    ]);

    sendOk(res, {
      bets: rows.map(serializeBet),
      page,
      limit,
      total,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    sendError(res, 500, "INTERNAL_ERROR", message);
  }
});

router.get("/users/:wallet/bets", async (req: Request, res: Response) => {
  try {
    const paramsParsed = walletParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid wallet address");
      return;
    }

    const queryParsed = listBetsQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid query parameters");
      return;
    }

    const { wallet } = paramsParsed.data;
    const { page, limit } = queryParsed.data;
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      prisma.bet.findMany({
        where: { bettorWallet: wallet },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.bet.count({ where: { bettorWallet: wallet } }),
    ]);

    sendOk(res, {
      bets: rows.map(serializeBet),
      page,
      limit,
      total,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    sendError(res, 500, "INTERNAL_ERROR", message);
  }
});

export default router;
