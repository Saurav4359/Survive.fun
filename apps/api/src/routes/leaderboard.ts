import type {
  ApiResponse,
  LeaderboardRow,
  LeaderboardTab,
} from "@survivefun/types";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../config/database";
import { parseQuery } from "../lib/zodUtil";

const router = Router();

const querySchema = z.object({
  tab: z
    .enum(["winners", "rug-callers", "biggest-payouts"])
    .optional()
    .default("winners"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

function toUsdString(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  return n.toFixed(6);
}

router.get("/", async (req, res, next) => {
  try {
    const q = parseQuery(querySchema, req.query);
    const limit = q.limit;
    const tab = q.tab as LeaderboardTab;

    if (tab === "biggest-payouts") {
      const rows = await prisma.bet.findMany({
        where: { payoutAmount: { not: null } },
        orderBy: { payoutAmount: "desc" },
        take: limit,
        include: { market: true },
      });
      const data: LeaderboardRow[] = rows.map((b) => {
        const pay = b.payoutAmount != null ? Number(b.payoutAmount) : 0;
        return {
          wallet: b.bettorWallet,
          totalWon: toUsdString(pay),
          winRatePct: 100,
          bestPayout: toUsdString(pay),
        };
      });
      const body: ApiResponse<LeaderboardRow[]> = { success: true, data };
      res.json(body);
      return;
    }

    const bets = await prisma.bet.findMany({
      where: {
        market: { status: "resolved" },
        ...(tab === "rug-callers" ? { side: "rug" } : {}),
      },
      include: { market: true },
      take: 8000,
    });

    type Agg = { w: number; l: number; sum: number; best: number };
    const map = new Map<string, Agg>();

    for (const b of bets) {
      const m = b.market;
      const outcome = m.outcome;
      if (outcome !== "survive" && outcome !== "rug") continue;

      const won =
        (outcome === "survive" && b.side === "survive") ||
        (outcome === "rug" && b.side === "rug");
      const pay = b.payoutAmount != null ? Number(b.payoutAmount) : 0;
      const e = map.get(b.bettorWallet) ?? { w: 0, l: 0, sum: 0, best: 0 };

      if (won) {
        e.w += 1;
        e.sum += pay;
        e.best = Math.max(e.best, pay);
      } else {
        e.l += 1;
      }
      map.set(b.bettorWallet, e);
    }

    const data: LeaderboardRow[] = [...map.entries()]
      .map(([wallet, e]) => ({
        wallet,
        totalWon: toUsdString(e.sum),
        winRatePct:
          e.w + e.l > 0
            ? Math.round((10_000 * e.w) / (e.w + e.l)) / 100
            : 0,
        bestPayout: toUsdString(e.best),
      }))
      .filter((r) => {
        const tw = Number.parseFloat(r.totalWon);
        if (tab === "rug-callers") return tw > 0;
        return tw > 0 || r.winRatePct > 0;
      })
      .sort((a, b) => Number.parseFloat(b.totalWon) - Number.parseFloat(a.totalWon))
      .slice(0, limit);

    const body: ApiResponse<LeaderboardRow[]> = { success: true, data };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

export default router;
