import type { ApiResponse, Bet, BetSide, BetWithMarket } from "@survivefun/types";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../config/database";
import { toBetDto, toBetWithMarketDto, toMarketDto } from "../lib/dto";
import { parseBody, parseQuery } from "../lib/zodUtil";
import { AppError } from "../middleware/errorHandler";
import { emitBetPlaced } from "../websocket/socketHandler";

const marketBetsRouter = Router({ mergeParams: true });
const userBetsRouter = Router();

const solanaAddress = z
  .string()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Invalid base58 address");

const marketIdParamSchema = z.object({
  id: z.string().uuid(),
});

const placeBetBodySchema = z.object({
  side: z.enum(["survive", "rug"]),
  amount: z.coerce.number().min(1).max(50),
  txSignature: z.string().min(64).max(128),
  walletAddress: solanaAddress,
});

const walletParamSchema = z.object({
  wallet: solanaAddress,
});

function potentialPayoutUsdc(
  side: BetSide,
  survive: number,
  rug: number,
  amount: number,
): number {
  if (amount <= 0 || !Number.isFinite(amount)) return 0;
  if (side === "survive") {
    const ts = survive + amount;
    const tr = rug;
    if (ts <= 0) return amount;
    return (amount * (ts + tr)) / ts;
  }
  const tr = rug + amount;
  const ts = survive;
  if (tr <= 0) return amount;
  return (amount * (ts + tr)) / tr;
}

marketBetsRouter.post("/:id/bets", async (req, res, next) => {
  try {
    const { id: marketId } = parseQuery(marketIdParamSchema, req.params);
    const input = parseBody(placeBetBodySchema, req.body);

    const result = await prisma.$transaction(async (tx) => {
      const market = await tx.market.findUnique({ where: { id: marketId } });
      if (!market) {
        throw new AppError("NOT_FOUND", "Market not found", 404);
      }
      if (market.status !== "active") {
        throw new AppError(
          "MARKET_NOT_ACTIVE",
          "Market is not accepting bets",
          400,
        );
      }

      const survive = Number(market.survivePool);
      const rug = Number(market.rugPool);
      if (!Number.isFinite(survive) || !Number.isFinite(rug)) {
        throw new AppError("INVALID_POOL", "Invalid pool state", 500);
      }

      const payout = potentialPayoutUsdc(
        input.side,
        survive,
        rug,
        input.amount,
      );
      const potentialWin = new Prisma.Decimal(payout.toFixed(6));

      const priorBets = await tx.bet.count({
        where: { marketId, bettorWallet: input.walletAddress },
      });

      let bet;
      try {
        bet = await tx.bet.create({
          data: {
            marketId,
            bettorWallet: input.walletAddress,
            side: input.side,
            amountUsdc: new Prisma.Decimal(input.amount),
            potentialWin,
            txSignature: input.txSignature,
          },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          throw new AppError(
            "CONFLICT",
            "Transaction signature already recorded",
            409,
          );
        }
        throw e;
      }

      const incSurvive =
        input.side === "survive"
          ? new Prisma.Decimal(input.amount)
          : new Prisma.Decimal(0);
      const incRug =
        input.side === "rug"
          ? new Prisma.Decimal(input.amount)
          : new Prisma.Decimal(0);

      const updated = await tx.market.update({
        where: { id: marketId },
        data: {
          survivePool: { increment: incSurvive },
          rugPool: { increment: incRug },
          ...(priorBets === 0 ? { totalBettors: { increment: 1 } } : {}),
        },
      });

      return { bet, market: updated };
    });

    const dto = toBetDto(result.bet);
    const marketDto = toMarketDto(result.market);

    emitBetPlaced({
      marketId,
      bettorWallet: input.walletAddress,
      side: input.side,
      amountUsdc: dto.amountUsdc,
      survivePool: marketDto.survivePool,
      rugPool: marketDto.rugPool,
      timestamp: dto.createdAt,
    });

    const body: ApiResponse<Bet> = { success: true, data: dto };
    res.status(201).json(body);
  } catch (e) {
    next(e);
  }
});

marketBetsRouter.get("/:id/bets", async (req, res, next) => {
  try {
    const { id: marketId } = parseQuery(marketIdParamSchema, req.params);
    const marketExists = await prisma.market.findUnique({
      where: { id: marketId },
      select: { id: true },
    });
    if (!marketExists) {
      throw new AppError("NOT_FOUND", "Market not found", 404);
    }

    const rows = await prisma.bet.findMany({
      where: { marketId },
      orderBy: { createdAt: "desc" },
    });
    const data: Bet[] = rows.map(toBetDto);
    const body: ApiResponse<Bet[]> = { success: true, data };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

userBetsRouter.get("/:wallet/bets", async (req, res, next) => {
  try {
    const { wallet } = parseQuery(walletParamSchema, req.params);
    const rows = await prisma.bet.findMany({
      where: { bettorWallet: wallet },
      orderBy: { createdAt: "desc" },
      include: { market: true },
    });
    const data: BetWithMarket[] = rows.map(toBetWithMarketDto);
    const body: ApiResponse<BetWithMarket[]> = { success: true, data };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

export { marketBetsRouter, userBetsRouter };
