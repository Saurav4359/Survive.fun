import axios from "axios";
import { Prisma, PrismaClient } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

const DEXSCREENER_TOKEN_URL = "https://api.dexscreener.com/latest/dex/tokens";

declare global {
  var __survivefun_prisma: PrismaClient | undefined;
}

const prisma =
  globalThis.__survivefun_prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__survivefun_prisma = prisma;
}

export { prisma };

const solanaAddress = z
  .string()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/);

const createMarketBodySchema = z.object({
  tokenMint: solanaAddress,
  duration: z.enum(["1h", "6h", "24h"]),
  walletAddress: solanaAddress,
});

const listMarketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

const marketIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const durationSeconds: Record<z.infer<typeof createMarketBodySchema>["duration"], number> = {
  "1h": 3600,
  "6h": 21_600,
  "24h": 86_400,
};

type DexScreenerPair = {
  chainId?: string;
  priceUsd?: string;
  baseToken?: { name?: string; symbol?: string };
  liquidity?: { usd?: number | string | null };
};

type DexScreenerResponse = { pairs?: DexScreenerPair[] };

function pickSolanaPair(pairs: DexScreenerPair[] | undefined): DexScreenerPair | null {
  if (!pairs?.length) {
    return null;
  }
  return pairs.find((p) => p.chainId === "solana") ?? pairs[0] ?? null;
}

async function fetchDexPair(tokenMint: string): Promise<DexScreenerPair | null> {
  const { data } = await axios.get<DexScreenerResponse>(`${DEXSCREENER_TOKEN_URL}/${tokenMint}`, {
    timeout: 15_000,
    validateStatus: () => true,
  });
  return pickSolanaPair(data.pairs);
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } });
}

function sendOk<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

function serializeMarket(m: {
  id: string;
  tokenMint: string;
  tokenName: string | null;
  tokenTicker: string | null;
  creatorWallet: string;
  durationSeconds: number;
  expiresAt: Date;
  survivePool: Prisma.Decimal;
  rugPool: Prisma.Decimal;
  openPrice: Prisma.Decimal | null;
  openLiquidity: Prisma.Decimal | null;
  devWallet: string | null;
  status: string;
  outcome: string | null;
  onChainAddress: string | null;
  createdAt: Date;
  totalBettors: number;
}) {
  return {
    id: m.id,
    tokenMint: m.tokenMint,
    tokenName: m.tokenName,
    tokenTicker: m.tokenTicker,
    creatorWallet: m.creatorWallet,
    durationSeconds: m.durationSeconds,
    expiresAt: m.expiresAt.toISOString(),
    survivePool: m.survivePool.toString(),
    rugPool: m.rugPool.toString(),
    openPrice: m.openPrice?.toString() ?? null,
    openLiquidity: m.openLiquidity?.toString() ?? null,
    devWallet: m.devWallet,
    status: m.status,
    outcome: m.outcome,
    onChainAddress: m.onChainAddress,
    createdAt: m.createdAt.toISOString(),
    totalBettors: m.totalBettors,
  };
}

const router = Router();

router.get("/markets", async (req: Request, res: Response) => {
  try {
    const parsed = listMarketsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, "VALIDATION_ERROR", parsed.error.flatten().formErrors.join("; "));
      return;
    }
    const { page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      prisma.market.findMany({
        where: { status: "active" },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.market.count({ where: { status: "active" } }),
    ]);

    sendOk(res, {
      markets: rows.map(serializeMarket),
      page,
      limit,
      total,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    sendError(res, 500, "INTERNAL_ERROR", message);
  }
});

router.get("/markets/:id", async (req: Request, res: Response) => {
  try {
    const parsed = marketIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid market id");
      return;
    }

    const row = await prisma.market.findUnique({ where: { id: parsed.data.id } });
    if (!row) {
      sendError(res, 404, "NOT_FOUND", "Market not found");
      return;
    }

    sendOk(res, { market: serializeMarket(row) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    sendError(res, 500, "INTERNAL_ERROR", message);
  }
});

router.post("/markets", async (req: Request, res: Response) => {
  try {
    const parsed = createMarketBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(
        res,
        400,
        "VALIDATION_ERROR",
        parsed.error.flatten().fieldErrors
          ? JSON.stringify(parsed.error.flatten().fieldErrors)
          : parsed.error.message,
      );
      return;
    }

    const { tokenMint, duration, walletAddress } = parsed.data;
    const seconds = durationSeconds[duration];

    let openPrice: Prisma.Decimal | null = null;
    let openLiquidity: Prisma.Decimal | null = null;
    let tokenName: string | null = null;
    let tokenTicker: string | null = null;

    try {
      const pair = await fetchDexPair(tokenMint);
      if (pair) {
        tokenName = pair.baseToken?.name ?? null;
        tokenTicker = pair.baseToken?.symbol ?? null;
        if (pair.priceUsd !== undefined && pair.priceUsd !== "") {
          openPrice = new Prisma.Decimal(pair.priceUsd);
        }
        const liq = pair.liquidity?.usd;
        if (liq !== undefined && liq !== null) {
          openLiquidity = new Prisma.Decimal(String(liq));
        }
      }
    } catch {
      // DexScreener optional for market creation
    }

    const now = Date.now();
    const created = await prisma.market.create({
      data: {
        tokenMint,
        tokenName,
        tokenTicker,
        creatorWallet: walletAddress,
        durationSeconds: seconds,
        expiresAt: new Date(now + seconds * 1000),
        survivePool: new Prisma.Decimal(0),
        rugPool: new Prisma.Decimal(0),
        openPrice,
        openLiquidity,
        devWallet: null,
        status: "active",
        outcome: null,
        onChainAddress: null,
        totalBettors: 0,
      },
    });

    sendOk(res, { market: serializeMarket(created) }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    sendError(res, 500, "INTERNAL_ERROR", message);
  }
});

export default router;
