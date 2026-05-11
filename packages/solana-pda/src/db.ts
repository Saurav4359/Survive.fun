import { PublicKey } from "@solana/web3.js";

import {
  deriveMarketPDAForDbRow,
  type MarketPdaDbRowInput,
} from "./derive.js";
import { PdaInvariantError } from "./errors.js";

export type MarketRowPdaFields = MarketPdaDbRowInput & {
  onChainAddress?: string | null;
};

/**
 * Hard invariant: when `chainMarketKey` is present (multi-round scheme), `onChainAddress`
 * must equal the canonical derived PDA for the current program id.
 *
 * Legacy rows (`chainMarketKey` null) skip this check — stored `on_chain_address` is authoritative
 * (may be 2-seed or an older 3-seed row missing the key column).
 */
export function assertMultiRoundMarketStoredMatchesDerived(
  programId: PublicKey,
  row: MarketRowPdaFields,
): void {
  const key = row.chainMarketKey?.trim();
  if (!key) return;

  const derived = deriveMarketPDAForDbRow(programId, row).publicKey.toBase58();
  const stored = row.onChainAddress?.trim();
  if (!stored) {
    throw new PdaInvariantError(
      "MARKET_PDA_MISSING_STORED",
      `chainMarketKey set but onChainAddress missing (expected ${derived})`,
    );
  }
  if (stored !== derived) {
    throw new PdaInvariantError(
      "MARKET_PDA_MISMATCH",
      `stored onChainAddress ${stored} !== canonical derived ${derived} for multi-round market`,
    );
  }
}
