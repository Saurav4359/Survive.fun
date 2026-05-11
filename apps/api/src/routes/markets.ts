import type {
  ApiResponse,
  Market,
  MarketChartResponse,
  MarketPoolHistoryPoint,
  MarketPoolHistoryResponse,
  MarketListPage,
  OhlcvBar,
} from "@survivefun/types";
import { Prisma, type Market as DbMarket } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { connection } from "../config/solana";
import { prisma } from "../config/database";
import { birdeyeFetchOhlcv } from "../lib/birdeye";
import { cacheGet } from "../lib/redisCache";
import { dexBodyToMarketBootstrap } from "../lib/dexscreener";
import { resolveMarketTokenBootstrap } from "../lib/tokenBootstrap";
import {
  createMarketOnChain,
  isMarketResolvedOnChain,
} from "../lib/onchainProgram";
import { enforceSolanaMarketRowInvariants } from "../lib/marketPdaGuard";
import { toMarketDto } from "../lib/dto";
import { formatZod, parseQuery } from "../lib/zodUtil";
import { AppError } from "../middleware/errorHandler";
import { emitMarketCreated } from "../websocket/socketHandler";

const router = Router();

const solanaAddress = z
  .string()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Invalid base58 address");

/** Query strings arrive as `"86400"` etc.; literals alone reject them. */
const ALLOWED_MARKET_DURATION_SECONDS = [3600, 21_600, 86_400] as const;
const durationSecondsQuery = z.coerce
  .number()
  .refine(
    (n): n is (typeof ALLOWED_MARKET_DURATION_SECONDS)[number] =>
      (ALLOWED_MARKET_DURATION_SECONDS as readonly number[]).includes(n),
    { message: "Invalid duration" },
  );

const listMarketsQuerySchema = z.object({
  status: z
    .enum(["active", "resolved", "expired", "all"])
    .optional()
    .default("active"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  tokenMint: solanaAddress.optional(),
  durationSeconds: durationSecondsQuery.optional(),
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
  currency: z.literal("sol").default("sol"),
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
  tokenMint: solanaAddress.optional(),
  durationSeconds: durationSecondsQuery.optional(),
});

router.get("/", async (req, res, next) => {
  try {
    const q = parseQuery(listMarketsQuerySchema, req.query);
    const now = new Date();
    const where: Record<string, unknown> =
      q.status === "all"
        ? {}
        : q.status === "active"
          ? { status: "active" as const, expiresAt: { gt: now } }
          : { status: q.status as "resolved" | "expired" };
    if (q.tokenMint) {
      where.tokenMint = q.tokenMint;
    }
    if (q.durationSeconds != null) {
      where.durationSeconds = q.durationSeconds;
    }

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
    const now = new Date();
    const where: Record<string, unknown> = {
      status: "active" as const,
      expiresAt: { gt: now },
    };
    if (q.tokenMint) {
      where.tokenMint = q.tokenMint;
    }
    if (q.durationSeconds != null) {
      where.durationSeconds = q.durationSeconds;
    }
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

const walletQuerySchema = z.object({
  wallet: solanaAddress,
});

router.get("/:id/result", async (req, res, next) => {
  try {
    const { id } = parseQuery(idParamSchema, req.params);
    const row = await prisma.market.findUnique({
      where: { id },
      include: {
        bets: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!row) {
      throw new AppError("NOT_FOUND", "Market not found", 404);
    }

    enforceSolanaMarketRowInvariants(row);
    const market = toMarketDto(row);
    const surviveN = row.survivePool.toNumber();
    const rugN = row.rugPool.toNumber();
    const resolved = row.status === "resolved";
    const outcome = row.outcome;

    let platformFee = 0;
    if (resolved && (outcome === "rug" || outcome === "survive")) {
      const losingPool = outcome === "rug" ? surviveN : rugN;
      platformFee = losingPool * 0.02;
    }

    let totalDistributed = 0;
    const payouts = row.bets.map((b) => {
      const payoutAmount = b.payoutAmount?.toNumber() ?? 0;
      if (b.won) totalDistributed += payoutAmount;
      return {
        wallet: b.bettorWallet,
        betAmount: b.amountUsdc.toNumber(),
        betSide: b.side,
        payoutAmount,
        won: b.won,
        claimed: b.claimed,
      };
    });

    const data = {
      market,
      outcome: row.outcome,
      payouts,
      platformFee,
      totalDistributed,
      rugCondition: row.rugCondition,
      resolvedAt: row.resolvedAt,
    };
    const body: ApiResponse<typeof data> = { success: true, data };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

router.get("/:id/my-payout", async (req, res, next) => {
  try {
    const { id: marketId } = parseQuery(idParamSchema, req.params);
    const { wallet } = parseQuery(walletQuerySchema, req.query);

    const marketRow = await prisma.market.findUnique({
      where: { id: marketId },
    });
    if (!marketRow) {
      throw new AppError("NOT_FOUND", "Market not found", 404);
    }

    enforceSolanaMarketRowInvariants(marketRow);

    let onChainResolved = false;
    try {
      onChainResolved = await isMarketResolvedOnChain(
        connection,
        marketRow.tokenMint,
        marketRow.chainMarketKey,
      );
    } catch (e) {
      console.log("[markets] my-payout on-chain status check failed", {
        marketId,
        error: e instanceof Error ? e.message : String(e),
      });
      onChainResolved = false;
    }

    const bet = await prisma.bet.findFirst({
      where: { marketId, bettorWallet: wallet },
    });

    if (!bet) {
      const data = {
        found: false as const,
        won: false,
        betAmount: 0,
        betSide: "",
        payoutAmount: 0,
        claimed: false,
        claimTxSignature: null as string | null,
        onChainResolved,
      };
      const body: ApiResponse<typeof data> = { success: true, data };
      res.json(body);
      return;
    }

    const data = {
      found: true as const,
      won: bet.won,
      betAmount: bet.amountUsdc.toNumber(),
      betSide: bet.side,
      payoutAmount: bet.payoutAmount?.toNumber() ?? 0,
      claimed: bet.claimed,
      claimTxSignature: bet.payoutTx,
      onChainResolved,
    };
    const body: ApiResponse<typeof data> = { success: true, data };
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

function poolRawFromDecimal(d: Prisma.Decimal): bigint {
  const s = d.toFixed(0);
  const head = s.split(".")[0] ?? "0";
  try {
    return BigInt(head);
  } catch {
    return 0n;
  }
}

router.get("/:id/pool-history", async (req, res, next) => {
  try {
    const { id } = parseQuery(idParamSchema, req.params);
    const row = await prisma.market.findUnique({
      where: { id },
      include: {
        bets: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!row) {
      throw new AppError("NOT_FOUND", "Market not found", 404);
    }

    const curSurvive = poolRawFromDecimal(row.survivePool);
    const curRug = poolRawFromDecimal(row.rugPool);

    let sumSurvive = 0n;
    let sumRug = 0n;
    for (const b of row.bets) {
      const amt = poolRawFromDecimal(b.amountUsdc);
      if (b.side === "survive") sumSurvive += amt;
      else sumRug += amt;
    }

    let initSurvive = curSurvive - sumSurvive;
    let initRug = curRug - sumRug;
    if (initSurvive < 0n) initSurvive = 0n;
    if (initRug < 0n) initRug = 0n;

    const points: MarketPoolHistoryPoint[] = [];
    const createdSec = Math.floor(row.createdAt.getTime() / 1000);
    let runS = initSurvive;
    let runR = initRug;
    let lastT = createdSec - 1;

    const pushPoint = (tRaw: number, s: bigint, r: bigint) => {
      let t = tRaw;
      if (t <= lastT) t = lastT + 1;
      lastT = t;
      points.push({
        t,
        survivePoolRaw: s.toString(),
        rugPoolRaw: r.toString(),
      });
    };

    pushPoint(createdSec, runS, runR);

    for (const b of row.bets) {
      const amt = poolRawFromDecimal(b.amountUsdc);
      if (b.side === "survive") runS += amt;
      else runR += amt;
      const t = Math.floor(b.createdAt.getTime() / 1000);
      pushPoint(t, runS, runR);
    }

    if (points.length === 1) {
      const only = points[0]!;
      const nowSec = Math.floor(Date.now() / 1000);
      const tEnd = Math.max(nowSec, only.t + 1);
      points.push({
        t: tEnd,
        survivePoolRaw: only.survivePoolRaw,
        rugPoolRaw: only.rugPoolRaw,
      });
    }

    const cur = row.currency === "sol" ? "sol" : "usdc";
    const data: MarketPoolHistoryResponse = {
      currency: cur,
      points,
    };
    const body: ApiResponse<MarketPoolHistoryResponse> = { success: true, data };
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
    enforceSolanaMarketRowInvariants(row);
    const body: ApiResponse<Market> = { success: true, data: toMarketDto(row) };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = createMarketBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const currencyBad = parsed.error.issues.some(
        (i) => i.path[0] === "currency",
      );
      throw new AppError(
        currencyBad ? "INVALID_CURRENCY" : "VALIDATION_ERROR",
        currencyBad
          ? "Currency must be sol"
          : formatZod(parsed.error),
        400,
      );
    }
    const input = parsed.data;

    const existingActive = await prisma.market.findFirst({
      where: {
        tokenMint: input.tokenMint,
        durationSeconds: input.duration,
        status: "active",
      },
    });
    if (existingActive) {
      const body: ApiResponse<Market> = {
        success: true,
        data: toMarketDto(existingActive),
      };
      res.status(200).json(body);
      return;
    }

    const snapshotAt = new Date();
    let boot: NonNullable<ReturnType<typeof dexBodyToMarketBootstrap>>;
    try {
      const { bootstrap: b, source } = await resolveMarketTokenBootstrap(
        input.tokenMint,
      );
      if (source === "placeholder") {
        throw new AppError(
          "TOKEN_NOT_FOUND",
          "Could not resolve this mint from Pump.fun, DexScreener, or chain RPC",
          404,
        );
      }
      boot = b;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[markets] token snapshot failed", {
        tokenMint: input.tokenMint,
        error: msg,
      });
      if (e instanceof AppError) {
        next(e);
        return;
      }
      next(
        new AppError(
          "TOKEN_SNAPSHOT_ERROR",
          `Token snapshot failed: ${msg}`,
          502,
        ),
      );
      return;
    }

    const now = snapshotAt;
    const expiresAt = new Date(now.getTime() + input.duration * 1000);

    let onChainAddress: string;
    let chainMarketKey: string;
    try {
      const chain = await createMarketOnChain(
        connection,
        input.tokenMint,
        input.duration,
        undefined,
        boot,
      );
      onChainAddress = chain.marketPda;
      chainMarketKey = chain.chainMarketKey;
      console.log("[markets] create_market on-chain success", {
        tokenMint: input.tokenMint,
        duration: input.duration,
        creatorWallet: input.walletAddress,
        platformAuthority: chain.platformAuthority,
        marketPda: chain.marketPda,
        chainMarketKey: chain.chainMarketKey,
        signature: chain.signature,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log("[markets] create_market on-chain failed", {
        tokenMint: input.tokenMint,
        duration: input.duration,
        creatorWallet: input.walletAddress,
        error: msg,
      });
      if (
        msg.includes("MarketAlreadyExists") ||
        msg.includes("custom program error: 0x1770")
      ) {
        try {
          const retry = await createMarketOnChain(
            connection,
            input.tokenMint,
            input.duration,
            undefined,
            boot,
          );
          onChainAddress = retry.marketPda;
          chainMarketKey = retry.chainMarketKey;
          console.log("[markets] create_market retry OK after MarketAlreadyExists", {
            marketPda: retry.marketPda,
            chainMarketKey: retry.chainMarketKey,
          });
        } catch (e2) {
          const msg2 = e2 instanceof Error ? e2.message : String(e2);
          throw new AppError(
            "ONCHAIN_CREATE_FAILED",
            `create_market failed on-chain: ${msg2}`,
            502,
          );
        }
      } else {
        throw new AppError(
          "ONCHAIN_CREATE_FAILED",
          `create_market failed on-chain: ${msg}`,
          502,
        );
      }
    }

    const seedLamportsPerSide = "10000000";
    let row: DbMarket;
    try {
      row = await prisma.market.create({
        data: {
          tokenMint: input.tokenMint,
          tokenName: boot.tokenName,
          tokenTicker: boot.tokenTicker,
          creatorWallet: input.walletAddress,
          durationSeconds: input.duration,
          expiresAt,
          survivePool: seedLamportsPerSide,
          rugPool: seedLamportsPerSide,
          openPrice: boot.openPrice,
          openLiquidity: boot.openLiquidity,
          devWallet: boot.devWallet,
          openSnapshotAt: snapshotAt,
          status: "active",
          onChainAddress,
          chainMarketKey,
          currency: input.currency,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        const raced = await prisma.market.findFirst({
          where: {
            tokenMint: input.tokenMint,
            durationSeconds: input.duration,
            status: "active",
          },
        });
        if (raced) {
          const body: ApiResponse<Market> = {
            success: true,
            data: toMarketDto(raced),
          };
          res.status(200).json(body);
          return;
        }
        throw new AppError(
          "MARKET_CONFLICT",
          "An active market for this token and duration already exists",
          409,
        );
      }
      throw e;
    }

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
