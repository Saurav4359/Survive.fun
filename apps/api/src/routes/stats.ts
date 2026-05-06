import type { ApiResponse, PlatformSnapshot } from "@survivefun/types";
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
    ]);

    const data: PlatformSnapshot = {
      activeMarkets,
      totalBetVolumeUsdc:
        volumeSum._sum.amountUsdc?.toString() ?? "0",
      resolvedRugs,
      resolvedSurvives,
      largestPayoutUsdc:
        maxPayout._max.payoutAmount?.toString() ?? null,
    };

    const body: ApiResponse<PlatformSnapshot> = { success: true, data };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

export default router;
