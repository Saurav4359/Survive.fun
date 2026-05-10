/**
 * BullMQ (or setInterval) market resolver: `detectRug` every 30s per active market,
 * then `processMarketResolution` for rug/survive outcomes. One market failure never
 * stops the batch (`Promise.allSettled`).
 */

import type { Market as DbMarket } from "@prisma/client";
import { Queue, Worker } from "bullmq";
import { applyUpstashRestAsRedisUrl } from "../config/resolveRedisEnv";
import {
  attachRedisErrorHandlers,
  createRedisConnection,
} from "../lib/redisConnection";

import { prisma } from "../config/database";
import { processMarketResolution } from "../services/payoutService";
import { dbMarketToDetectInput, detectRug } from "../services/rugDetector";

const LOG_PREFIX = "[resolver]";
const QUEUE_NAME = "survive-market-resolver";
const TICK_MS = 30_000;
const JOB_SCHEDULER_ID = "survive-market-resolver-every-30s";

let resolverStarted = false;
let fallbackInterval: ReturnType<typeof setInterval> | undefined;

async function checkMarket(market: DbMarket): Promise<void> {
  try {
    const result = await detectRug(dbMarketToDetectInput(market));

    if (result.isRug) {
      console.log(`💀 RUG detected: ${market.id}`);
      console.log(`Condition: ${result.condition}`);
      await processMarketResolution(
        market.id,
        "rug",
        result.condition ?? "unknown",
      );
      return;
    }

    if (result.isSurvive) {
      console.log(`✅ SURVIVED: ${market.id}`);
      await processMarketResolution(market.id, "survive", null);
      return;
    }

    console.log(`⏳ Still active: ${market.id}`);
  } catch (err) {
    console.log(`${LOG_PREFIX} checkMarket error`, {
      marketId: market.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function runResolverCycle(): Promise<void> {
  let active: DbMarket[];
  try {
    active = await prisma.market.findMany({
      where: { status: "active" },
    });
  } catch (e) {
    console.log(`${LOG_PREFIX} failed to load active markets`, {
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  const outcomes = await Promise.allSettled(
    active.map((m) => checkMarket(m)),
  );

  const failed = outcomes.filter((o) => o.status === "rejected").length;
  if (failed > 0) {
    console.log(`${LOG_PREFIX} ${failed} market checks rejected`, {
      total: active.length,
    });
  }

  console.log(`${LOG_PREFIX} Checked ${active.length} markets`);
}

/**
 * Starts the resolver loop (BullMQ repeatable job when REDIS_URL is set, otherwise setInterval).
 */
export function startResolver(): void {
  if (resolverStarted) {
    console.log(`${LOG_PREFIX} startResolver called again; ignoring`);
    return;
  }
  resolverStarted = true;

  applyUpstashRestAsRedisUrl();
  const redisUrl = process.env.REDIS_URL?.trim();

  if (redisUrl) {
    const redisConnection = createRedisConnection(redisUrl, "resolver-queue");
    const queue = new Queue(QUEUE_NAME, { connection: redisConnection });

    void queue
      .upsertJobScheduler(
        JOB_SCHEDULER_ID,
        { every: TICK_MS },
        { name: "tick", data: {}, opts: {} },
      )
      .catch((e: unknown) => {
        console.log(`${LOG_PREFIX} failed to register job scheduler`, {
          error: e instanceof Error ? e.message : String(e),
        });
      });

    const workerConnection = redisConnection.duplicate();
    attachRedisErrorHandlers(workerConnection, "resolver-worker");

    const worker = new Worker(
      QUEUE_NAME,
      async () => {
        await runResolverCycle();
      },
      { connection: workerConnection, concurrency: 1 },
    );

    worker.on("failed", (job, err) => {
      console.log(`${LOG_PREFIX} worker job failed`, {
        jobId: job?.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    worker.on("error", (err) => {
      console.log(`${LOG_PREFIX} worker error`, {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    console.log(`${LOG_PREFIX} started with BullMQ (every ${TICK_MS}ms)`);
    return;
  }

  console.log(
    `${LOG_PREFIX} REDIS_URL not set; using setInterval (${TICK_MS}ms)`,
  );
  fallbackInterval = setInterval(() => {
    void runResolverCycle();
  }, TICK_MS);
  void runResolverCycle();
}
