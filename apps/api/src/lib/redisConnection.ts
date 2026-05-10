import IORedis, { type RedisOptions } from "ioredis";

/**
 * Shared ioredis options for API cache + BullMQ.
 * `maxRetriesPerRequest: null` avoids MaxRetriesPerRequestError after transient ECONNRESET;
 * `retryStrategy` lets the client reconnect instead of failing fast.
 */
export const redisConnectionOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  connectTimeout: 15_000,
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 5_000);
    if (times > 150) return null;
    return delay;
  },
};

/** Register listeners so ioredis never emits an unhandled "error" event. */
export function attachRedisErrorHandlers(client: IORedis, label: string): void {
  client.on("error", (err: Error) => {
    console.error(`[redis:${label}]`, err.message);
  });
  client.on("close", () => {
    console.log(`[redis:${label}] connection closed`);
  });
  client.on("reconnecting", (ms: number) => {
    console.log(`[redis:${label}] reconnecting in ${ms}ms`);
  });
}

export function createRedisConnection(url: string, label: string): IORedis {
  const client = new IORedis(url, redisConnectionOptions);
  attachRedisErrorHandlers(client, label);
  return client;
}
