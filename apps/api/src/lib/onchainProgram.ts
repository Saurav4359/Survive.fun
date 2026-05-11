import fs from "node:fs";
import path from "node:path";

import {
  AnchorProvider,
  BN,
  BorshAccountsCoder,
  Program,
  Wallet,
  type Idl,
} from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  type Connection,
} from "@solana/web3.js";

import { getProgramId } from "../config/solana";
import type { MarketTokenBootstrap } from "./dexscreener";

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

function marketPda(tokenMint: PublicKey, marketId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), tokenMint.toBuffer(), marketId.toBuffer()],
    getProgramId(),
  );
  return pda;
}

/** Legacy deployments: `[market, mint]` only. */
function marketPdaLegacy(tokenMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), tokenMint.toBuffer()],
    getProgramId(),
  );
  return pda;
}

function resolveMarketPubkey(
  tokenMint: PublicKey,
  chainMarketKeyBase58: string | null | undefined,
): PublicKey {
  const trimmed = chainMarketKeyBase58?.trim();
  if (trimmed) {
    return marketPda(tokenMint, new PublicKey(trimmed));
  }
  return marketPdaLegacy(tokenMint);
}

function accountEnumVariant(status: unknown): string | null {
  if (!status || typeof status !== "object" || Array.isArray(status)) {
    return null;
  }
  const keys = Object.keys(status as Record<string, unknown>);
  return keys[0] ?? null;
}

/** Anchor IDL enums decode as `{ resolved: {} }` or `{ Resolved: {} }` depending on version. */
function isResolvedMarketAccount(status: unknown, outcome: unknown): boolean {
  const v = accountEnumVariant(status);
  if (!v || v.toLowerCase() !== "resolved") return false;
  return outcome != null && typeof outcome === "object";
}

/**
 * True when on-chain market account is `Resolved` with a set outcome (required for `claim_payout`).
 */
export async function isMarketResolvedOnChain(
  connection: Connection,
  tokenMintBase58: string,
  chainMarketKeyBase58: string | null | undefined,
): Promise<boolean> {
  try {
    const idl = loadIdl();
    const coder = new BorshAccountsCoder(idl);
    const tokenMint = new PublicKey(tokenMintBase58);
    const marketPk = resolveMarketPubkey(tokenMint, chainMarketKeyBase58);
    const ai = await connection.getAccountInfo(marketPk, "confirmed");
    if (!ai?.data) return false;
    const acc = coder.decode("Market", ai.data) as {
      status: unknown;
      outcome: unknown;
    };
    const ok = isResolvedMarketAccount(acc.status, acc.outcome);
    if (process.env.DEBUG_MARKET_FETCH === "1") {
      console.log("[onchainProgram] market fetch", {
        marketPda: marketPk.toBase58(),
        status: acc.status,
        outcome: acc.outcome,
        resolved: ok,
      });
    }
    return ok;
  } catch (e) {
    console.log("[onchainProgram] isMarketResolvedOnChain fetch failed", {
      tokenMint: tokenMintBase58,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

async function snapshotFromBootstrap(
  connection: Connection,
  platformAuthority: PublicKey,
  bootstrap: MarketTokenBootstrap | null | undefined,
): Promise<{
  devWallet: PublicKey;
  devBalanceAtOpen: BN;
  openPrice: BN;
  openLiquidity: BN;
}> {
  let devWallet = platformAuthority;
  let devBalanceAtOpen = new BN(0);
  if (bootstrap?.devWallet?.trim()) {
    try {
      devWallet = new PublicKey(bootstrap.devWallet.trim());
      const lamports = await connection.getBalance(devWallet, "confirmed");
      devBalanceAtOpen = new BN(lamports);
    } catch {
      devWallet = platformAuthority;
    }
  }
  let openPrice = new BN(0);
  if (bootstrap?.openPrice) {
    const n = Number.parseFloat(bootstrap.openPrice);
    if (Number.isFinite(n)) {
      openPrice = new BN(Math.min(Number.MAX_SAFE_INTEGER, Math.round(n * 1_000_000)));
    }
  }
  let openLiquidity = new BN(0);
  if (bootstrap?.openLiquidity) {
    const n = Number.parseFloat(bootstrap.openLiquidity);
    if (Number.isFinite(n)) {
      openLiquidity = new BN(Math.min(Number.MAX_SAFE_INTEGER, Math.round(n * 100)));
    }
  }
  return { devWallet, devBalanceAtOpen, openPrice, openLiquidity };
}

export async function createMarketOnChain(
  connection: Connection,
  tokenMintBase58: string,
  durationSeconds: number,
  chainMarketKeyBase58?: string,
  bootstrap?: MarketTokenBootstrap | null,
): Promise<{
  signature: string;
  marketPda: string;
  platformAuthority: string;
  chainMarketKey: string;
}> {
  const idl = loadIdl();
  const provider = providerFor(connection);
  const program = new Program(idl, provider);
  const tokenMint = new PublicKey(tokenMintBase58);
  const marketIdKey = chainMarketKeyBase58?.trim()
    ? new PublicKey(chainMarketKeyBase58.trim())
    : Keypair.generate().publicKey;
  const market = marketPda(tokenMint, marketIdKey);
  const platformAuthority = provider.wallet.publicKey;
  await ensureSignerFunded(connection, platformAuthority);

  const snap = await snapshotFromBootstrap(connection, platformAuthority, bootstrap);

  const signature = await program.methods
    .createMarket(
      tokenMint,
      marketIdKey,
      new BN(durationSeconds),
      snap.devWallet,
      snap.devBalanceAtOpen,
      snap.openPrice,
      snap.openLiquidity,
    )
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
    chainMarketKey: marketIdKey.toBase58(),
  };
}

export async function resolveMarketOnChain(
  connection: Connection,
  tokenMintBase58: string,
  chainMarketKeyBase58: string | null | undefined,
  outcome: "survive" | "rug",
): Promise<{ signature: string; marketPda: string; platformAuthority: string }> {
  const idl = loadIdl();
  const provider = providerFor(connection);
  const program = new Program(idl, provider);
  const tokenMint = new PublicKey(tokenMintBase58);
  const market = resolveMarketPubkey(tokenMint, chainMarketKeyBase58);
  const platformAuthority = provider.wallet.publicKey;

  const anchorOutcome = outcome === "rug" ? { rug: {} } : { survive: {} };
  console.log("[onchainProgram] resolve_market submitting", {
    marketPda: market.toBase58(),
    outcome,
    platformAuthority: platformAuthority.toBase58(),
  });
  const signature = await program.methods
    .resolveMarket(anchorOutcome)
    .accounts({
      market,
      platformAuthority,
    })
    .rpc();

  console.log("[onchainProgram] resolve_market confirmed", {
    signature,
    marketPda: market.toBase58(),
    outcome,
  });

  return {
    signature,
    marketPda: market.toBase58(),
    platformAuthority: platformAuthority.toBase58(),
  };
}
