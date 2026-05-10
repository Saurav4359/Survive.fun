import type { Market } from "@survivefun/types";

/** True while status is active and the betting window has not ended (`expiresAt` in the future). */
export function isActiveMarketStillOpen(
  m: Market,
  atMs: number = Date.now(),
): boolean {
  if (m.status !== "active") return false;
  const end = Date.parse(m.expiresAt);
  if (!Number.isFinite(end)) return false;
  return atMs < end;
}
