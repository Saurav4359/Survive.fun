/**
 * Delete a market and all related bets + rug_events (Postgres FK-safe).
 * Use when Prisma Studio fails or complains about relations.
 *
 * Usage (from repo root): pnpm --dir apps/api run db:delete-market -- <market-uuid>
 */
import { prisma } from "../src/config/database";

const id = process.argv[2]?.trim();
const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main(): Promise<void> {
  if (!id || !uuidRe.test(id)) {
    console.error(
      "Usage: pnpm --dir apps/api run db:delete-market -- <market-uuid>",
    );
    process.exit(1);
  }

  const m = await prisma.market.findUnique({
    where: { id },
    select: { id: true, tokenTicker: true, status: true },
  });
  if (!m) {
    console.error(`No market with id=${id}`);
    process.exit(1);
  }

  const [bets, events] = await Promise.all([
    prisma.bet.count({ where: { marketId: id } }),
    prisma.rugEvent.count({ where: { marketId: id } }),
  ]);

  await prisma.$transaction([
    prisma.bet.deleteMany({ where: { marketId: id } }),
    prisma.rugEvent.deleteMany({ where: { marketId: id } }),
    prisma.market.delete({ where: { id } }),
  ]);

  console.log(
    `Deleted market ${id} (${m.tokenTicker ?? "?"}, status=${m.status}) + ${bets} bet(s), ${events} rug_event(s).`,
  );
}

void main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
