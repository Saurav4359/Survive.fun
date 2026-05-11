import type {
  ApiResponse,
  Bet,
  BetSide,
  BetWithMarket,
  MarketCurrency,
} from "@survivefun/types";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { connection } from "../config/solana";
import { prisma } from "../config/database";
import { toBetDto, toBetWithMarketDto, toMarketDto } from "../lib/dto";
import { marketPdaBase58ForDbRow } from "../lib/marketOnChain";
import {
  ONCHAIN_MAX_STAKE_RAW,
  ONCHAIN_MIN_STAKE_RAW,
  verifyPlaceBetTransaction,
} from "../lib/solanaTxVerify";
import { processBetClaim } from "../services/payoutService";
import { formatZod, parseQuery } from "../lib/zodUtil";
import { AppError } from "../middleware/errorHandler";
import { emitBetPlaced, emitPoolUpdate } from "../websocket/socketHandler";

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
  currency: z.literal("sol"),
  amount: z.union([z.number(), z.string()]),
  txSignature: z.string().min(64).max(128),
  walletAddress: solanaAddress,
});

const walletParamSchema = z.object({
  wallet: solanaAddress,
});

function marketCurrency(row: { currency: string }): MarketCurrency {
  return row.currency === "sol" ? "sol" : "usdc";
}

function parseSolLamports(amount: unknown): bigint {
  if (typeof amount === "number") {
    if (!Number.isInteger(amount)) {
      throw new AppError(
        "SOL_AMOUNT_INVALID",
        "SOL amount must be in lamports",
        400,
      );
    }
    return BigInt(amount);
  }
  if (typeof amount === "string" && /^\d+$/.test(amount)) {
    return BigInt(amount);
  }
  throw new AppError(
    "SOL_AMOUNT_INVALID",
    "SOL amount must be in lamports",
    400,
  );
}

function assertSolStakeRange(lamports: bigint): void {
  if (lamports < ONCHAIN_MIN_STAKE_RAW || lamports > ONCHAIN_MAX_STAKE_RAW) {
    throw new AppError(
      "SOL_AMOUNT_INVALID",
      "SOL amount must be in lamports",
      400,
    );
  }
}

function potentialPayoutLamports(
  side: BetSide,
  survive: bigint,
  rug: bigint,
  amount: bigint,
): bigint {
  if (amount <= 0n) return 0n;
  if (side === "survive") {
    const ts = survive + amount;
    const tr = rug;
    if (ts === 0n) return amount;
    return (amount * (ts + tr)) / ts;
  }
  const tr = rug + amount;
  const ts = survive;
  if (tr === 0n) return amount;
  return (amount * (ts + tr)) / tr;
}

marketBetsRouter.post("/:id/bets", async (req, res, next) => {
  try {
    const { id: marketId } = parseQuery(marketIdParamSchema, req.params);
    const parsed = placeBetBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const currencyBad = parsed.error.issues.some(
        (i) => i.path[0] === "currency",
      );
      throw new AppError(
        currencyBad ? "INVALID_CURRENCY" : "VALIDATION_ERROR",
        currencyBad ? "Currency must be sol" : formatZod(parsed.error),
        400,
      );
    }
    const raw = parsed.data;

    const marketRow = await prisma.market.findUnique({ where: { id: marketId } });
    if (!marketRow) {
      throw new AppError("NOT_FOUND", "Market not found", 404);
    }
    if (marketRow.status !== "active") {
      throw new AppError(
        "MARKET_NOT_ACTIVE",
        "Market is not accepting bets",
        400,
      );
    }

    const mCur = marketCurrency(marketRow);
    if (mCur !== "sol") {
      throw new AppError(
        "LEGACY_MARKET",
        "This market uses deprecated collateral; only SOL markets accept bets.",
        400,
      );
    }

    const lamports = parseSolLamports(raw.amount);
    assertSolStakeRange(lamports);
    const stakeDecimal = new Prisma.Decimal(lamports.toString());
    const verifyStake = { currency: "sol" as const, lamports };

    const marketPk = marketPdaBase58ForDbRow(marketRow);
    await verifyPlaceBetTransaction(
      connection,
      raw.txSignature,
      raw.walletAddress,
      marketPk,
      raw.side,
      verifyStake,
    );
    console.log("[bets] tx verified on Helius RPC", {
      marketId,
      txSignature: raw.txSignature,
      walletAddress: raw.walletAddress,
      side: raw.side,
      amountLamports: lamports.toString(),
      marketPda: marketPk,
    });

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
      if (marketCurrency(market) !== mCur) {
        throw new AppError("CURRENCY_MISMATCH", "Market currency changed", 409);
      }

      const survive = BigInt(market.survivePool.toFixed(0).split(".")[0]!);
      const rug = BigInt(market.rugPool.toFixed(0).split(".")[0]!);
      const amt = BigInt(stakeDecimal.toFixed(0).split(".")[0]!);
      const payout = potentialPayoutLamports(raw.side, survive, rug, amt);
      const potentialWin = new Prisma.Decimal(payout.toString());

      const priorBets = await tx.bet.count({
        where: { marketId, bettorWallet: raw.walletAddress },
      });

      let bet;
      try {
        bet = await tx.bet.create({
          data: {
            marketId,
            bettorWallet: raw.walletAddress,
            side: raw.side,
            currency: mCur,
            amountUsdc: stakeDecimal,
            potentialWin,
            txSignature: raw.txSignature,
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
        raw.side === "survive" ? stakeDecimal : new Prisma.Decimal(0);
      const incRug =
        raw.side === "rug" ? stakeDecimal : new Prisma.Decimal(0);

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
      bettorWallet: raw.walletAddress,
      side: raw.side,
      currency: mCur,
      amountUsdc: "0",
      amountLamports: dto.amountLamports,
      survivePool: marketDto.survivePool,
      rugPool: marketDto.rugPool,
      timestamp: dto.createdAt,
      betId: dto.id,
    });
    emitPoolUpdate({
      marketId,
      survivePool: marketDto.survivePool,
      rugPool: marketDto.rugPool,
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

const betIdParamSchema = z.object({
  id: z.string().uuid(),
});

const claimBetBodySchema = z.object({
  txSignature: z.string().min(64).max(128),
  walletAddress: solanaAddress,
});

const betsClaimRouter = Router();

betsClaimRouter.post("/:id/claim", async (req, res, next) => {
  try {
    const { id } = parseQuery(betIdParamSchema, req.params);
    const parsed = claimBetBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", formatZod(parsed.error), 400);
    }
    const data = await processBetClaim(
      id,
      parsed.data.txSignature,
      parsed.data.walletAddress,
    );
    const body: ApiResponse<typeof data> = { success: true, data };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

export { marketBetsRouter, userBetsRouter, betsClaimRouter };
