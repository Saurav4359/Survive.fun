import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";

const devnetRpc = clusterApiUrl("devnet");

export const connection = new Connection(
  process.env.SOLANA_RPC_URL?.trim() || devnetRpc,
  "confirmed",
);

function readProgramId(): PublicKey {
  const raw = process.env.SURVIVEFUN_PROGRAM_ID?.trim();
  if (!raw) {
    throw new Error("SURVIVEFUN_PROGRAM_ID must be set");
  }
  return new PublicKey(raw);
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
