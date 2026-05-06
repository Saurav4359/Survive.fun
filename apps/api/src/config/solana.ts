import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";

const devnetRpc = clusterApiUrl("devnet");

export const connection = new Connection(
  process.env.SOLANA_RPC_URL?.trim() || devnetRpc,
  "confirmed",
);

/** Default from `contracts/programs/survivefun` Anchor `declare_id!` (local dev). */
const DEFAULT_DEV_PROGRAM_ID = "HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH";

function readProgramId(): PublicKey {
  const raw = process.env.SURVIVEFUN_PROGRAM_ID?.trim();
  if (raw) {
    return new PublicKey(raw);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SURVIVEFUN_PROGRAM_ID must be set in production");
  }
  console.warn(
    "[solana] SURVIVEFUN_PROGRAM_ID unset; using local dev program id (set env for your deployment)",
  );
  return new PublicKey(DEFAULT_DEV_PROGRAM_ID);
}

/** On-chain program public key (from env). */
export const programId = readProgramId();

/**
 * Server-side signer for Anchor `Provider` wiring only; replace with a funded
 * keypair or wallet adapter when submitting transactions from the API.
 */
export const anchorWallet = new Wallet(Keypair.generate());

export const anchorProvider = new AnchorProvider(connection, anchorWallet, {
  commitment: "confirmed",
  preflightCommitment: "confirmed",
});
