import type {
  ApiResponse,
  PlatformSnapshot,
  RecentPayout,
} from "@survivefun/types";
import { Router } from "express";

import { prisma } from "../config/database";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const [
      activeMarkets,
      volumeSum,
      resolvedRugs,
      resolvedSurvives,
      maxPayout,
      payoutRows,
    ] = await Promise.all([
      prisma.market.count({ where: { status: "active" } }),
      prisma.bet.aggregate({
        _sum: { amountUsdc: true },
      }),
      prisma.market.count({
        where: { status: "resolved", outcome: "rug" },
      }),
      prisma.market.count({
        where: { status: "resolved", outcome: "survive" },
      }),
      prisma.bet.aggregate({
        _max: { payoutAmount: true },
      }),
      prisma.bet.findMany({
        where: {
          payoutAmount: { not: null },
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
      totalBetVolumeUsdc:
        volumeSum._sum.amountUsdc?.toString() ?? "0",
      resolvedRugs,
      resolvedSurvives,
      largestPayoutUsdc:
        maxPayout._max.payoutAmount?.toString() ?? null,
      recentPayouts,
    };

    const body: ApiResponse<PlatformSnapshot> = { success: true, data };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

export default router;
