import { prisma } from "../config/database";

const LOG_PREFIX = "[marketRetention]";

/**
 * Deletes closed markets older than `retentionDays`, plus their bets and rug events.
 *
 * **Not required for creating new markets:** the DB allows many historical rows per
 * `(token_mint, duration)` as long as only one is `active` (partial unique index).
 *
 * **Warning:** Deleting markets removes related bets — leaderboard / history for those
 * rows disappears. Use only if you explicitly want TTL cleanup (e.g. dev noise).
 */
export async function purgeClosedMarketsOlderThan(retentionDays: number): Promise<{
  deletedMarkets: number;
}> {
  if (!Number.isFinite(retentionDays) || retentionDays < 1) {
    return { deletedMarkets: 0 };
  }

  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);

  const candidates = await prisma.market.findMany({
    where: {
      status: { in: ["resolved", "expired"] },
      OR: [{ resolvedAt: { lt: cutoff } }, { resolvedAt: null, expiresAt: { lt: cutoff } }],
    },
    select: { id: true },
  });

  const ids = candidates.map((c) => c.id);
  if (ids.length === 0) {
    return { deletedMarkets: 0 };
  }

  await prisma.$transaction([
    prisma.bet.deleteMany({ where: { marketId: { in: ids } } }),
    prisma.rugEvent.deleteMany({ where: { marketId: { in: ids } } }),
    prisma.market.deleteMany({ where: { id: { in: ids } } }),
  ]);

  console.log(`${LOG_PREFIX} purged ${ids.length} closed market(s) older than ${retentionDays}d`);
  return { deletedMarkets: ids.length };
}
