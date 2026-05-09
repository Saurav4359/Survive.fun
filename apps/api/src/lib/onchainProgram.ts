import fs from "node:fs";
import path from "node:path";

import { AnchorProvider, BN, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  type Connection,
} from "@solana/web3.js";

import { getProgramId } from "../config/solana";

const IDL_PATH = path.resolve(__dirname, "..", "idl", "survivefun.json");

let idlCache: Idl | null = null;
let walletCache: Wallet | null = null;

function loadIdl(): Idl {
  if (idlCache) return idlCache;
  const raw = fs.readFileSync(IDL_PATH, "utf8");
  idlCache = JSON.parse(raw) as Idl;
  return idlCache;
}

function loadPlatformWallet(): Wallet {
  if (walletCache) return walletCache;
  const raw = process.env.PLATFORM_WALLET_SECRET_KEY?.trim();
  if (!raw) {
    throw new Error("PLATFORM_WALLET_SECRET_KEY is required for on-chain instructions");
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("PLATFORM_WALLET_SECRET_KEY must be a JSON number array");
  }
  const secret = Uint8Array.from(parsed.map((n) => Number(n)));
  const kp = Keypair.fromSecretKey(secret);
  walletCache = new Wallet(kp);
  return walletCache;
}

function providerFor(connection: Connection): AnchorProvider {
  return new AnchorProvider(connection, loadPlatformWallet(), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

async function ensureSignerFunded(
  connection: Connection,
  signer: PublicKey,
): Promise<void> {
  const minLamports = 50_000_000; // 0.05 SOL
  const current = await connection.getBalance(signer, "confirmed");
  if (current >= minLamports) return;

  const rpc = connection.rpcEndpoint.toLowerCase();
  const isDevnetRpc = rpc.includes("devnet");
  if (!isDevnetRpc) {
    throw new Error(
      `Platform wallet ${signer.toBase58()} has insufficient SOL (${current / LAMPORTS_PER_SOL}). Fund it before create_market.`,
    );
  }

  try {
    const sig = await connection.requestAirdrop(signer, 1 * LAMPORTS_PER_SOL);
    const latest = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction(
      {
        signature: sig,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      "confirmed",
    );
    const after = await connection.getBalance(signer, "confirmed");
    console.log("[onchainProgram] funded platform wallet via devnet airdrop", {
      signer: signer.toBase58(),
      beforeLamports: current,
      afterLamports: after,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Platform wallet ${signer.toBase58()} is unfunded and devnet airdrop failed: ${msg}`,
    );
  }
}

function marketPda(tokenMint: PublicKey, _durationSeconds: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), tokenMint.toBuffer()],
    getProgramId(),
  );
  return pda;
}

export async function createMarketOnChain(
  connection: Connection,
  tokenMintBase58: string,
  durationSeconds: number,
): Promise<{ signature: string; marketPda: string; platformAuthority: string }> {
  const idl = loadIdl();
  const provider = providerFor(connection);
  const program = new Program(idl, provider);
  const tokenMint = new PublicKey(tokenMintBase58);
  const market = marketPda(tokenMint, durationSeconds);
  const platformAuthority = provider.wallet.publicKey;
  await ensureSignerFunded(connection, platformAuthority);

  const signature = await program.methods
    .createMarket(tokenMint, new BN(durationSeconds))
    .accounts({
      creator: platformAuthority,
      platformAuthority,
      market,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return {
    signature,
    marketPda: market.toBase58(),
    platformAuthority: platformAuthority.toBase58(),
  };
}

export async function resolveMarketOnChain(
  connection: Connection,
  tokenMintBase58: string,
  durationSeconds: number,
  outcome: "survive" | "rug",
): Promise<{ signature: string; marketPda: string; platformAuthority: string }> {
  const idl = loadIdl();
  const provider = providerFor(connection);
  const program = new Program(idl, provider);
  const tokenMint = new PublicKey(tokenMintBase58);
  const market = marketPda(tokenMint, durationSeconds);
  const platformAuthority = provider.wallet.publicKey;

  const anchorOutcome = outcome === "rug" ? { rug: {} } : { survive: {} };
  const signature = await program.methods
    .resolveMarket(anchorOutcome)
    .accounts({
      market,
      platformAuthority,
    })
    .rpc();

  return {
    signature,
    marketPda: market.toBase58(),
    platformAuthority: platformAuthority.toBase58(),
  };
}
