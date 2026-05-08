import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";

const devnetRpc = clusterApiUrl("devnet");

export const connection = new Connection(
  process.env.SOLANA_RPC_URL?.trim() || devnetRpc,
  "confirmed",
);

/** Default from `contracts/programs/survivefun` Anchor `declare_id!` (local dev). */
const DEFAULT_DEV_PROGRAM_ID = "HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH";

let programIdMemo: PublicKey | null = null;

/**
 * Program id for on-chain instructions. Resolved lazily so the process can boot
 * (markets, stats, health) even when `SURVIVEFUN_PROGRAM_ID` is missing; resolution
 * jobs log errors if they cannot sign or resolve.
 */
export function getProgramId(): PublicKey {
  if (programIdMemo) return programIdMemo;

  const raw = process.env.SURVIVEFUN_PROGRAM_ID?.trim();
  if (raw) {
    programIdMemo = new PublicKey(raw);
    return programIdMemo;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SURVIVEFUN_PROGRAM_ID must be set when submitting on-chain transactions",
    );
  }

  console.warn(
    "[solana] SURVIVEFUN_PROGRAM_ID unset; using local dev program id (set env for your deployment)",
  );
  programIdMemo = new PublicKey(DEFAULT_DEV_PROGRAM_ID);
  return programIdMemo;
}

/**
 * Server-side signer for Anchor `Provider` wiring only; replace with a funded
 * keypair or wallet adapter when submitting transactions from the API.
 */
export const anchorWallet = new Wallet(Keypair.generate());

export const anchorProvider = new AnchorProvider(connection, anchorWallet, {
  commitment: "confirmed",
  preflightCommitment: "confirmed",
});
