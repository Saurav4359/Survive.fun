import type { Market as DbMarket } from "@prisma/client";
import {
  assertMultiRoundMarketStoredMatchesDerived,
  PdaInvariantError,
} from "@survivefun/solana-pda";

import { getProgramId } from "../config/solana";
import { AppError } from "../middleware/errorHandler";

/** Fails closed on corrupted multi-round rows (`chainMarketKey` present). */
export function enforceSolanaMarketRowInvariants(row: DbMarket): void {
  if (row.currency !== "sol") return;
  try {
    assertMultiRoundMarketStoredMatchesDerived(getProgramId(), {
      tokenMint: row.tokenMint,
      chainMarketKey: row.chainMarketKey,
      onChainAddress: row.onChainAddress,
    });
  } catch (e) {
    if (e instanceof PdaInvariantError) {
      throw new AppError("MARKET_PDA_INVARIANT", e.message, 500);
    }
    throw e;
  }
}
