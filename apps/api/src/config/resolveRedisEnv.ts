/**
 * BullMQ + ioredis need a TCP URL (`redis://` / `rediss://`).
 * Upstash often ships `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` only;
 * the REST token is the Redis password and the REST hostname is the Redis endpoint.
 *
 * Call once after `dotenv.config()` so `process.env.REDIS_URL` is set before validation.
 */
export function applyUpstashRestAsRedisUrl(): void {
  const existing = process.env.REDIS_URL?.trim();
  if (
    existing &&
    !existing.includes("placeholder") &&
    !existing.includes("your_")
  ) {
    return;
  }

  const restUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (
    !restUrl ||
    !token ||
    restUrl.includes("placeholder") ||
    token.includes("your_")
  ) {
    return;
  }

  try {
    const u = new URL(restUrl);
    const host = u.hostname;
    if (!host) return;
    const username =
      process.env.UPSTASH_REDIS_USERNAME?.trim() || "default";
    const password = encodeURIComponent(token);
    process.env.REDIS_URL = `rediss://${username}:${password}@${host}:6379`;
  } catch {
    /* invalid REST URL — leave REDIS_URL unchanged */
  }
}

/** True if `REDIS_URL` is set (call `applyUpstashRestAsRedisUrl()` first when using Upstash REST). */
export function isRedisEnvConfigured(): boolean {
  const r = process.env.REDIS_URL?.trim();
  return Boolean(
    r &&
      !r.includes("placeholder") &&
      !r.includes("your_"),
  );
}
