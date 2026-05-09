import IORedis from "ioredis";

let redis: IORedis | null | undefined;

function connect(): IORedis | null {
  if (redis !== undefined) {
    return redis;
  }
  const url = process.env.REDIS_URL?.trim();
  if (
    !url ||
    url.includes("placeholder") ||
    url.includes("your_")
  ) {
    console.error("❌ REDIS_URL is not set correctly");
    console.error("Current value:", process.env.REDIS_URL);
    process.exit(1);
  }
  redis = new IORedis(url, { maxRetriesPerRequest: 3 });
  return redis;
}

export async function cacheGet(key: string): Promise<string | null> {
  const r = connect();
  if (!r) return null;
  try {
    return await r.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  const r = connect();
  if (!r) return;
  try {
    await r.set(key, value, "EX", ttlSeconds);
  } catch {
    /* ignore cache write failures */
  }
}
