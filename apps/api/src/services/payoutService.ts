/**
 * Parimutuel payout math + on-chain resolve FIRST, then DB persistence.
 */

import { Prisma } from "@prisma/client";

import { connection } from "../config/solana";
import { prisma } from "../config/database";
import { resolveMarketOnChain } from "../lib/onchainProgram";
import {
  betPdaBase58,
  marketPdaBase58ForDbRow,
} from "../lib/marketOnChain";
import { verifyClaimPayoutTransaction } from "../lib/solanaTxVerify";
import { toMarketDto } from "../lib/dto";
import { AppError } from "../middleware/errorHandler";
import {
  emitMarketResolved,
  emitPayoutClaimed,
  emitPayoutReady,
} from "../websocket/socketHandler";

const LOG_PREFIX = "[payoutService]";

export function calculatePayout(
  betAmount: number,
  betSide: "survive" | "rug",
  outcome: "survive" | "rug",
  survivePool: number,
  rugPool: number,
): number {
  if (betSide !== outcome) return 0;

  const winningPool = outcome === "rug" ? rugPool : survivePool;
  const losingPool = outcome === "rug" ? survivePool : rugPool;

  if (!Number.isFinite(winningPool) || winningPool <= 0) {
    return betAmount;
  }

  const platformFee = losingPool * 0.02;
  const distributable = losingPool - platformFee;
  const share = (betAmount / winningPool) * distributable;
  return betAmount + share;
}

function numPool(d: { toNumber: () => number }): number {
  const n = d.toNumber();
  return Number.isFinite(n) ? n : 0;
}

export async function processMarketResolution(
  marketId: string,
  outcome: "survive" | "rug",
  rugCondition: string | null,
  resolutionMeta?: Record<string, unknown> | null,
): Promise<void> {
  const market = await prisma.market.findUnique({ where: { id: marketId } });
  if (!market) {
    console.error(`${LOG_PREFIX} market not found`, { marketId });
    return;
  }
  if (market.status !== "active") {
    console.log(`${LOG_PREFIX} skip resolution (not active)`, {
      marketId,
      status: market.status,
    });
    return;
  }

  const bets = await prisma.bet.findMany({ where: { marketId } });
  const survivePoolN = numPool(market.survivePool);
  const rugPoolN = numPool(market.rugPool);

  const losingPool = outcome === "rug" ? survivePoolN : rugPoolN;
  const platformFee = losingPool * 0.02;

  type PayoutRow = { betId: string; payout: number; won: boolean; wallet: string };
  const payoutRows: PayoutRow[] = [];

  for (const bet of bets) {
    const side = bet.side as "survive" | "rug";
    const amt = numPool(bet.amountUsdc);
    const payout = calculatePayout(amt, side, outcome, survivePoolN, rugPoolN);
    const won = side === outcome;
    payoutRows.push({
      betId: bet.id,
      payout,
      won,
      wallet: bet.bettorWallet,
    });
  }

  try {
    const sig = await resolveMarketOnChain(
      connection,
      market.tokenMint,
      market.chainMarketKey,
      outcome,
    );
    console.log(`${LOG_PREFIX} ✅ On-chain resolved`, {
      marketId,
      outcome,
      signature: sig.signature,
      marketPda: sig.marketPda,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} ❌ On-chain resolution failed (DB not updated)`, {
      marketId,
      outcome,
      error: msg,
    });
    throw new Error(`On-chain resolution failed: ${msg}`);
  }

  const resolvedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.market.update({
      where: { id: marketId },
      data: {
        status: "resolved",
        outcome,
        resolvedAt,
        rugCondition: outcome === "rug" ? rugCondition : null,
        pendingRugAt: null,
        ...(resolutionMeta != null
          ? {
              resolutionData: resolutionMeta as Prisma.InputJsonValue,
            }
          : {}),
      },
    });

    for (const row of payoutRows) {
      await tx.bet.update({
        where: { id: row.betId },
        data: {
          won: row.won,
          payoutAmount: new Prisma.Decimal(String(row.payout)),
        },
      });
    }

    if (outcome === "rug" && rugCondition) {
      await tx.rugEvent.create({
        data: {
          marketId,
          tokenMint: market.tokenMint,
          eventType: rugCondition,
          eventData: { source: "automated_resolution" } as Prisma.InputJsonValue,
          detectedAt: resolvedAt,
        },
      });
    }

    const volDelta = survivePoolN + rugPoolN;
    const existing = await tx.platformStats.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    const volInc = new Prisma.Decimal(String(volDelta));
    const feeInc = new Prisma.Decimal(String(platformFee));

    if (existing) {
      await tx.platformStats.update({
        where: { id: existing.id },
        data: {
          totalVolume: { increment: volInc },
          totalFees: { increment: feeInc },
          ...(outcome === "rug" ? { totalRugs: { increment: 1 } } : {}),
          ...(outcome === "survive" ? { totalSurvives: { increment: 1 } } : {}),
          updatedAt: resolvedAt,
        },
      });
    } else {
      await tx.platformStats.create({
        data: {
          totalMarkets: 0,
          totalVolume: volInc,
          totalFees: feeInc,
          totalRugs: outcome === "rug" ? 1 : 0,
          totalSurvives: outcome === "survive" ? 1 : 0,
          updatedAt: resolvedAt,
        },
      });
    }
  });

  const dto = toMarketDto(
    await prisma.market.findUniqueOrThrow({ where: { id: marketId } }),
  );

  try {
    emitMarketResolved({
      marketId,
      outcome,
      survivePool: dto.survivePool,
      rugPool: dto.rugPool,
      timestamp: resolvedAt.toISOString(),
      rugCondition: outcome === "rug" ? rugCondition : null,
    });
  } catch (e) {
    console.log(`${LOG_PREFIX} emit market_resolved failed`, {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  for (const row of payoutRows) {
    if (!row.won || row.payout <= 0) continue;
    try {
      emitPayoutReady({
        wallet: row.wallet,
        amount: String(row.payout),
        marketId,
      });
    } catch (e) {
      console.log(`${LOG_PREFIX} emit payout_ready failed`, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const winners = payoutRows.filter((r) => r.won);
  const totalDistributed = winners.reduce((s, r) => s + r.payout, 0);

  console.log(`${LOG_PREFIX}
      Market ${marketId} resolved:
      Outcome: ${outcome}
      Total bets: ${bets.length}
      Winners: ${winners.length}
      Total distributed: ${totalDistributed}
      Platform fee: ${platformFee}
    `);
}

export async function processBetClaim(
  betId: string,
  txSignature: string,
  walletAddress: string,
): Promise<{ success: true; amount: string }> {
  const bet = await prisma.bet.findUnique({
    where: { id: betId },
    include: { market: true },
  });
  if (!bet) {
    throw new AppError("NOT_FOUND", "Bet not found", 404);
  }
  if (bet.bettorWallet !== walletAddress) {
    throw new AppError("FORBIDDEN", "Wallet does not match bettor", 403);
  }
  if (!bet.won) {
    throw new AppError("CLAIM_NOT_WINNER", "Bet did not win", 400);
  }
  if (bet.claimed) {
    throw new AppError("ALREADY_CLAIMED", "Already claimed", 409);
  }

  const marketPk = marketPdaBase58ForDbRow(bet.market);
  const betPk = betPdaBase58(marketPk, walletAddress);
  await verifyClaimPayoutTransaction(
    connection,
    txSignature,
    walletAddress,
    marketPk,
    betPk,
  );

  const updated = await prisma.bet.update({
    where: { id: betId },
    data: {
      claimed: true,
      claimedAt: new Date(),
      payoutTx: txSignature,
    },
  });

  const amountStr = updated.payoutAmount?.toString() ?? "0";
  try {
    emitPayoutClaimed({
      wallet: walletAddress,
      marketId: bet.marketId,
      betId,
      amount: amountStr,
    });
  } catch {
    /* optional socket */
  }

  return { success: true, amount: amountStr };
}
