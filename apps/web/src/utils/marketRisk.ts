import type { Market, TokenPair } from "@survivefun/types";

export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export function computeRiskLevel(input: {
  devWalletPctHeld: number | null | undefined;
  liquidityUsd: number | null | undefined;
  pairCreatedAtSeconds: number | null | undefined;
}): RiskLevel {
  const { devWalletPctHeld, liquidityUsd, pairCreatedAtSeconds } = input;
  const hasAny =
    devWalletPctHeld != null || liquidityUsd != null || pairCreatedAtSeconds != null;
  if (!hasAny) return "LOW";

  let score = 0;
  if (devWalletPctHeld != null && Number.isFinite(devWalletPctHeld)) {
    if (devWalletPctHeld >= 35) score += 45;
    else if (devWalletPctHeld >= 20) score += 28;
    else if (devWalletPctHeld >= 10) score += 12;
  }
  if (liquidityUsd != null && Number.isFinite(liquidityUsd)) {
    if (liquidityUsd < 15_000) score += 40;
    else if (liquidityUsd < 50_000) score += 22;
    else if (liquidityUsd < 150_000) score += 10;
  }
  if (pairCreatedAtSeconds != null && Number.isFinite(pairCreatedAtSeconds)) {
    const ageHours = (Date.now() - pairCreatedAtSeconds * 1000) / 3_600_000;
    if (ageHours < 1) score += 30;
    else if (ageHours < 6) score += 15;
    else if (ageHours < 24) score += 6;
  }

  if (score >= 55) return "HIGH";
  if (score >= 28) return "MEDIUM";
  return "LOW";
}

/** Risk from live pair + market fallbacks (no holder % on-chain in MVP). */
export function riskLevelForMarket(
  market: Market,
  pair: TokenPair | null | undefined,
): RiskLevel {
  const liqUsd =
    pair?.liquidity?.usd ??
    (market.openLiquidity != null
      ? Number.parseFloat(market.openLiquidity)
      : null);
  const pairCreated =
    pair?.pairCreatedAt ?? Math.floor(Date.parse(market.createdAt) / 1000);
  return computeRiskLevel({
    devWalletPctHeld: null,
    liquidityUsd: Number.isFinite(liqUsd as number) ? liqUsd : null,
    pairCreatedAtSeconds: pairCreated,
  });
}

/** Higher = more “about to rug” for featured strip. */
export function aboutToRugScore(market: Market, pair: TokenPair | null): number {
  const survive = Number.parseFloat(market.survivePool);
  const rug = Number.parseFloat(market.rugPool);
  const total =
    Number.isFinite(survive) && Number.isFinite(rug) ? survive + rug : 0;
  let score = total > 0 ? (rug / total) * 45 : 0;
  const h24 = pair?.priceChange?.h24;
  if (h24 != null && Number.isFinite(h24) && h24 < 0) {
    score += Math.min(45, Math.abs(h24) * 0.6);
  }
  const level = riskLevelForMarket(market, pair);
  if (level === "HIGH") score += 38;
  else if (level === "MEDIUM") score += 16;
  return score;
}

export function totalPoolUsdc(market: Market): number {
  const s = Number.parseFloat(market.survivePool);
  const r = Number.parseFloat(market.rugPool);
  const t = (Number.isFinite(s) ? s : 0) + (Number.isFinite(r) ? r : 0);
  return t;
}
