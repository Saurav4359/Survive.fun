/**
 * BullMQ schedulers (when REDIS_URL set) + setInterval fallback:
 * - OHLCV: warm Redis cache for active market mints (feeds GET .../chart).
 * - Stats: persist PlatformStats snapshot + optional stats_update to subscribers.
 *
 * Market resolution + rug detection tick lives in ./resolver (also BullMQ / 30s).
 */

import { Prisma } from "@prisma/client";
import { Queue, Worker } from "bullmq";
import { applyUpstashRestAsRedisUrl } from "../config/resolveRedisEnv";
import {
  attachRedisErrorHandlers,
  createRedisConnection,
} from "../lib/redisConnection";

import { prisma } from "../config/database";
import { birdeyeFetchOhlcv } from "../lib/birdeye";
import { cacheSet } from "../lib/redisCache";
import { emitStatsUpdate } from "../websocket/socketHandler";
import { purgeClosedMarketsOlderThan } from "./marketRetention";
import { startResolver } from "./resolver";

const LOG_PREFIX = "[backgroundJobs]";

const OHLCV_QUEUE = "survive-ohlcv-aggregation";
const STATS_QUEUE = "survive-stats-updater";
const OHLCV_JOB_ID = "ohlcv-every-5m";
const STATS_JOB_ID = "stats-every-60s";
const OHLCV_EVERY_MS = 5 * 60 * 1000;
const STATS_EVERY_MS = 60_000;
const MARKET_RETENTION_INTERVAL_MS = 86_400_000;

const CHART_INTERVALS = ["5m", "15m", "1H"] as const;

async function runOhlcvAggregation(): Promise<void> {
  try {
    const markets = await prisma.market.findMany({
      where: { status: "active" },
      select: { tokenMint: true },
    });
    for (const m of markets) {
      for (const interval of CHART_INTERVALS) {
        const bars = await birdeyeFetchOhlcv(m.tokenMint, interval);
        if (bars.length > 0) {
          await cacheSet(
            `ohlcv:${m.tokenMint}:${interval}`,
            JSON.stringify(bars),
            600,
          );
        }
      }
    }
    console.log(`${LOG_PREFIX} OHLCV cache warmed for ${markets.length} markets`);
  } catch (e) {
    console.log(`${LOG_PREFIX} OHLCV aggregation failed`, {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function runStatsUpdater(): Promise<void> {
  try {
    const [
      activeMarkets,
      totalMarkets,
      volumeSum,
      totalRugs,
      totalSurvives,
      bettorGroups,
    ] = await Promise.all([
      prisma.market.count({ where: { status: "active" } }),
      prisma.market.count(),
      prisma.bet.aggregate({
        where: { currency: "usdc" },
        _sum: { amountUsdc: true },
      }),
      prisma.market.count({
        where: { status: "resolved", outcome: "rug" },
      }),
      prisma.market.count({
        where: { status: "resolved", outcome: "survive" },
      }),
      prisma.bet.groupBy({
        by: ["bettorWallet"],
      }),
    ]);

    const volDec =
      volumeSum._sum.amountUsdc ?? new Prisma.Decimal(0);
    const totalVolumeStr = volDec.toString();
    const activeTraders = bettorGroups.length;

    const existing = await prisma.platformStats.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    const statsData = {
      totalMarkets,
      totalVolume: volDec,
      totalFees: existing?.totalFees ?? new Prisma.Decimal(0),
      totalRugs,
      totalSurvives,
      updatedAt: new Date(),
    };
    if (existing) {
      await prisma.platformStats.update({
        where: { id: existing.id },
        data: statsData,
      });
    } else {
      await prisma.platformStats.create({
        data: {
          ...statsData,
          totalFees: new Prisma.Decimal(0),
        },
      });
    }

    try {
      emitStatsUpdate({
        totalMarkets: activeMarkets,
        totalVolume: totalVolumeStr,
        activeTraders,
      });
    } catch {
      /* socket may not be ready in tests */
    }

    console.log(`${LOG_PREFIX} stats snapshot updated`);
  } catch (e) {
    console.log(`${LOG_PREFIX} stats updater failed`, {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

function startOhlcvWithRedis(url: string): void {
  const connection = createRedisConnection(url, "ohlcv-queue");
  const workerConnection = connection.duplicate();
  attachRedisErrorHandlers(workerConnection, "ohlcv-worker");
  const queue = new Queue(OHLCV_QUEUE, { connection });
  void queue
    .upsertJobScheduler(
      OHLCV_JOB_ID,
      { every: OHLCV_EVERY_MS },
      { name: "ohlcv-tick", data: {}, opts: {} },
    )
    .catch((e: unknown) => {
      console.log(`${LOG_PREFIX} OHLCV scheduler register failed`, {
        error: e instanceof Error ? e.message : String(e),
      });
    });

  const worker = new Worker(
    OHLCV_QUEUE,
    async () => {
      await runOhlcvAggregation();
    },
    { connection: workerConnection, concurrency: 1 },
  );
  worker.on("failed", (job, err) => {
    console.log(`${LOG_PREFIX} OHLCV job failed`, {
      jobId: job?.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
  worker.on("error", (err) => {
    console.log(`${LOG_PREFIX} OHLCV worker error`, {
      error: err instanceof Error ? err.message : String(err),
    });
  });
  console.log(
    `${LOG_PREFIX} OHLCV aggregation: BullMQ every ${OHLCV_EVERY_MS}ms`,
  );
}

function startStatsWithRedis(url: string): void {
  const connection = createRedisConnection(url, "stats-queue");
  const workerConnection = connection.duplicate();
  attachRedisErrorHandlers(workerConnection, "stats-worker");
  const queue = new Queue(STATS_QUEUE, { connection });
  void queue
    .upsertJobScheduler(
      STATS_JOB_ID,
      { every: STATS_EVERY_MS },
      { name: "stats-tick", data: {}, opts: {} },
    )
    .catch((e: unknown) => {
      console.log(`${LOG_PREFIX} stats scheduler register failed`, {
        error: e instanceof Error ? e.message : String(e),
      });
    });

  const worker = new Worker(
    STATS_QUEUE,
    async () => {
      await runStatsUpdater();
    },
    { connection: workerConnection, concurrency: 1 },
  );
  worker.on("failed", (job, err) => {
    console.log(`${LOG_PREFIX} stats job failed`, {
      jobId: job?.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
  worker.on("error", (err) => {
    console.log(`${LOG_PREFIX} stats worker error`, {
      error: err instanceof Error ? err.message : String(err),
    });
  });
  console.log(`${LOG_PREFIX} stats updater: BullMQ every ${STATS_EVERY_MS}ms`);
}

function startOhlcvFallback(): void {
  setInterval(() => {
    void runOhlcvAggregation();
  }, OHLCV_EVERY_MS);
  void runOhlcvAggregation();
  console.log(
    `${LOG_PREFIX} OHLCV aggregation: setInterval every ${OHLCV_EVERY_MS}ms`,
  );
}

function startStatsFallback(): void {
  setInterval(() => {
    void runStatsUpdater();
  }, STATS_EVERY_MS);
  void runStatsUpdater();
  console.log(
    `${LOG_PREFIX} stats updater: setInterval every ${STATS_EVERY_MS}ms`,
  );
}

/**
 * Starts resolver (30s rug + expiry), OHLCV cache job, and stats job.
 * Call after `initSocketHandler(io)` so emits are safe.
 */
export function startBackgroundJobs(): void {
  startResolver();

  const retentionRaw = process.env.MARKET_RETENTION_DELETE_AFTER_DAYS?.trim();
  const retentionDays = retentionRaw ? Number.parseInt(retentionRaw, 10) : Number.NaN;
  if (Number.isFinite(retentionDays) && retentionDays >= 1) {
    const runRetention = () => {
      void purgeClosedMarketsOlderThan(retentionDays).catch((e: unknown) => {
        console.log(`${LOG_PREFIX} market retention purge failed`, {
          error: e instanceof Error ? e.message : String(e),
        });
      });
    };
    runRetention();
    setInterval(runRetention, MARKET_RETENTION_INTERVAL_MS);
    console.log(
      `${LOG_PREFIX} market retention enabled: delete resolved/expired markets older than ${retentionDays}d (daily; also deletes their bets)`,
    );
  }

  applyUpstashRestAsRedisUrl();
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    startOhlcvWithRedis(redisUrl);
    startStatsWithRedis(redisUrl);
  } else {
    console.log(
      `${LOG_PREFIX} REDIS_URL unset — OHLCV + stats using setInterval (resolver too)`,
    );
    startOhlcvFallback();
    startStatsFallback();
  }
}
