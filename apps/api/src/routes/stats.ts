import type {
  ApiResponse,
  Bet,
  PlatformSnapshot,
  RecentPayout,
} from "@survivefun/types";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../config/database";
import { toBetDto } from "../lib/dto";
import { parseQuery } from "../lib/zodUtil";

const router = Router();

const recentBetsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

/** Latest bets platform-wide — hydrates home LiveFeed when socket events were missed. */
router.get("/recent-bets", async (req, res, next) => {
  try {
    const { limit } = parseQuery(recentBetsQuerySchema, req.query);
    const rows = await prisma.bet.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const data: Bet[] = rows.map(toBetDto);
    const body: ApiResponse<Bet[]> = { success: true, data };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

router.get("/", async (_req, res, next) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      activeMarkets,
      volumeSumSolLifetime,
      volumeSol24h,
      resolvedRugs,
      resolvedSurvives,
      maxPayoutSol,
      payoutRows,
    ] = await Promise.all([
      prisma.market.count({ where: { status: "active" } }),
      prisma.bet.aggregate({
        where: { currency: "sol" },
        _sum: { amountUsdc: true },
      }),
      prisma.bet.aggregate({
        where: { currency: "sol", createdAt: { gte: since24h } },
        _sum: { amountUsdc: true },
      }),
      prisma.market.count({
        where: { status: "resolved", outcome: "rug" },
      }),
      prisma.market.count({
        where: { status: "resolved", outcome: "survive" },
      }),
      prisma.bet.aggregate({
        where: { currency: "sol", payoutAmount: { not: null } },
        _max: { payoutAmount: true },
      }),
      prisma.bet.findMany({
        where: {
          payoutAmount: { not: null },
          currency: "sol",
        },
        orderBy: { createdAt: "desc" },
        take: 15,
        include: {
          market: {
            select: { tokenTicker: true },
          },
        },
      }),
    ]);

    const solLamportsSum =
      volumeSol24h._sum.amountUsdc ?? new Prisma.Decimal(0);
    const solVolume24h =
      Number(solLamportsSum.toString()) / 1_000_000_000;

    const lifetimeSolLamports =
      volumeSumSolLifetime._sum.amountUsdc ?? new Prisma.Decimal(0);

    const recentPayouts: RecentPayout[] = payoutRows
      .filter((b) => b.payoutAmount != null)
      .map((b) => ({
        bettorWallet: b.bettorWallet,
        payoutAmountUsdc: b.payoutAmount!.toString(),
        marketId: b.marketId,
        tokenTicker: b.market?.tokenTicker ?? null,
        payoutTx: b.payoutTx,
        createdAt: b.createdAt.toISOString(),
      }));

    const data: PlatformSnapshot = {
      activeMarkets,
      totalBetVolumeUsdc: lifetimeSolLamports.toString(),
      solVolume24h,
      usdcVolume24h: 0,
      resolvedRugs,
      resolvedSurvives,
      largestPayoutUsdc: maxPayoutSol._max.payoutAmount?.toString() ?? null,
      recentPayouts,
    };

    const body: ApiResponse<PlatformSnapshot> = { success: true, data };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

export default router;
