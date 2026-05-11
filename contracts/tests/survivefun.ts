/**
 * Survive.fun — SOL-only markets. Runs against `anchor test` (local validator).
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program, type AnchorProvider } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { assert } from "chai";

import idl from "../target/idl/survivefun.json";

/** Production: 3600 | 21600 | 86400. Local tests: 10s when program built with `--features integration-test`. */
let marketDurationSec: number;

const MIN_BET_LAMPORTS = 10_000_000n;
const MAX_BET_LAMPORTS = 10_000_000_000n;
const PLATFORM_SEED_PER_SIDE = 10_000_000n;
const PLATFORM_FEE_BPS = 200n;

function bn(n: bigint | number): BN {
  return new BN(typeof n === "bigint" ? n.toString() : n.toString());
}

function marketPda(
  programId: PublicKey,
  tokenMint: PublicKey,
  marketId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), tokenMint.toBuffer(), marketId.toBuffer()],
    programId,
  );
}

function betPda(programId: PublicKey, market: PublicKey, bettor: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), market.toBuffer(), bettor.toBuffer()],
    programId,
  );
}

function expectAnchorError(err: unknown, needle: string): void {
  const msg = err instanceof Error ? err.message : String(err);
  assert.ok(msg.includes(needle), `expected "${needle}" in: ${msg}`);
}

/** Local Anchor validator exposes a working faucet; devnet faucet RPC often returns 429. */
function usesLocalValidatorRpc(endpoint: string): boolean {
  return endpoint.includes("127.0.0.1") || endpoint.includes("localhost");
}

describe("survivefun SOL-only (local validator)", function () {
  this.timeout(120_000);

  let provider: AnchorProvider;
  let program: Program;
  let authority: Keypair;
  /** Separate from fee-paying wallet so claim fee-share balance checks are not confounded by tx fees. */
  let platformKp: Keypair;
  /** Snapshot target for dev-wallet fields at `create_market` (fixed across tests). */
  let devWallet: Keypair;
  /** Devnet: avoid RPC faucet (429) by funding from ANCHOR_WALLET; keep transfers small enough for typical post-deploy balances. */
  let leanDevnet: boolean;

  before(async () => {
    provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    program = new Program(idl as anchor.Idl, provider);
    const w = provider.wallet as anchor.Wallet;
    if (!("payer" in w) || !(w.payer instanceof Keypair)) {
      throw new Error("ANCHOR_WALLET must be a file-based keypair with .payer");
    }
    authority = w.payer;

    leanDevnet = !usesLocalValidatorRpc(provider.connection.rpcEndpoint);
    marketDurationSec = leanDevnet ? 3600 : 10;
    platformKp = Keypair.generate();
    devWallet = Keypair.generate();
    const platformFund = leanDevnet ? 250_000_000 : 5_000_000_000;
    await fundLamports(provider, authority, platformKp.publicKey, platformFund);
  });

  async function fundLamports(
    providerInner: AnchorProvider,
    from: Keypair,
    dest: PublicKey,
    lamports: number,
  ): Promise<void> {
    if (usesLocalValidatorRpc(providerInner.connection.rpcEndpoint)) {
      const sig = await providerInner.connection.requestAirdrop(dest, lamports);
      await providerInner.connection.confirmTransaction(sig, "confirmed");
      return;
    }
    const ix = SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: dest,
      lamports,
    });
    let lastErr: unknown;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const tx = new Transaction().add(ix);
        await providerInner.sendAndConfirm(tx, [from], {
          commitment: "confirmed",
          maxRetries: 5,
        });
        return;
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("Blockhash not found")) throw e;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  function fundSmallBettor(pubkey: PublicKey): Promise<void> {
    const lamports = leanDevnet ? 80_000_000 : 2_000_000_000;
    return fundLamports(provider, authority, pubkey, lamports);
  }

  function fundPairBettor(pubkey: PublicKey): Promise<void> {
    const lamports = leanDevnet ? 200_000_000 : 3_000_000_000;
    return fundLamports(provider, authority, pubkey, lamports);
  }

  const SNAP_DEV_BALANCE = 1_000_000_000n;
  const SNAP_OPEN_PRICE = 1_000n;
  const SNAP_OPEN_LIQ = 100_000n;

  async function createMarketIx(tokenMint: PublicKey, marketId: PublicKey, durationSeconds: number) {
    const [market] = marketPda(program.programId, tokenMint, marketId);
    return program.methods
      .createMarket(
        tokenMint,
        marketId,
        bn(durationSeconds),
        devWallet.publicKey,
        bn(SNAP_DEV_BALANCE),
        bn(SNAP_OPEN_PRICE),
        bn(SNAP_OPEN_LIQ),
      )
      .accountsPartial({
        creator: authority.publicKey,
        platformAuthority: platformKp.publicKey,
        market,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  async function send(providerInner: AnchorProvider, ix: TransactionInstruction, signers: Keypair[]) {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const tx = new Transaction().add(ix);
        return await providerInner.sendAndConfirm(tx, signers, {
          commitment: "confirmed",
          maxRetries: 5,
        });
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("Blockhash not found")) throw e;
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  it("test 1: create market → succeeds", async () => {
    const tokenMint = Keypair.generate().publicKey;
    const marketId = Keypair.generate().publicKey;
    const ix = await createMarketIx(tokenMint, marketId, marketDurationSec);
    await send(provider, ix, [authority, platformKp]);
    const [market] = marketPda(program.programId, tokenMint, marketId);
    const acc: any = await (program.account as any).market.fetch(market);
    assert.equal(acc.tokenMint.toBase58(), tokenMint.toBase58());
    assert.equal(acc.devWallet.toBase58(), devWallet.publicKey.toBase58());
    assert.equal(acc.devBalanceAtOpen.toString(), SNAP_DEV_BALANCE.toString());
    assert.equal(acc.openPrice.toString(), SNAP_OPEN_PRICE.toString());
    assert.equal(acc.openLiquidity.toString(), SNAP_OPEN_LIQ.toString());
    assert.equal(acc.survivePool.toString(), PLATFORM_SEED_PER_SIDE.toString());
    assert.equal(acc.rugPool.toString(), PLATFORM_SEED_PER_SIDE.toString());
  });

  it("test 2: create same market again → fails (MarketAlreadyExists)", async () => {
    const tokenMint = Keypair.generate().publicKey;
    const marketId = Keypair.generate().publicKey;
    const ix1 = await createMarketIx(tokenMint, marketId, marketDurationSec);
    await send(provider, ix1, [authority, platformKp]);
    const ix2 = await createMarketIx(tokenMint, marketId, marketDurationSec);
    try {
      await send(provider, ix2, [authority, platformKp]);
      assert.fail("expected MarketAlreadyExists");
    } catch (e) {
      expectAnchorError(e, "MarketAlreadyExists");
    }
  });

  it("test 2b: same mint, new market id → second market succeeds", async () => {
    const tokenMint = Keypair.generate().publicKey;
    const marketIdA = Keypair.generate().publicKey;
    const marketIdB = Keypair.generate().publicKey;
    await send(provider, await createMarketIx(tokenMint, marketIdA, marketDurationSec), [authority, platformKp]);
    await send(provider, await createMarketIx(tokenMint, marketIdB, marketDurationSec), [authority, platformKp]);
    const [marketA] = marketPda(program.programId, tokenMint, marketIdA);
    const [marketB] = marketPda(program.programId, tokenMint, marketIdB);
    assert.notEqual(marketA.toBase58(), marketB.toBase58());
    const accB: any = await (program.account as any).market.fetch(marketB);
    assert.equal(accB.marketId.toBase58(), marketIdB.toBase58());
    assert.equal(accB.tokenMint.toBase58(), tokenMint.toBase58());
  });

  it("test 3: place SOL bet SURVIVE → works", async () => {
    const tokenMint = Keypair.generate().publicKey;
    const marketId = Keypair.generate().publicKey;
    await send(provider, await createMarketIx(tokenMint, marketId, marketDurationSec), [authority, platformKp]);
    const [market] = marketPda(program.programId, tokenMint, marketId);

    const bettor = Keypair.generate();
    await fundSmallBettor(bettor.publicKey);

    const [bet] = betPda(program.programId, market, bettor.publicKey);
    const amt = 50_000_000n;
    const before = BigInt((await (program.account as any).market.fetch(market)).survivePool.toString());

    const ix = await program.methods
      .placeBet({ survive: {} }, bn(amt))
      .accountsPartial({
        market,
        bettor: bettor.publicKey,
        bet,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await send(provider, ix, [bettor]);

    const after = BigInt((await (program.account as any).market.fetch(market)).survivePool.toString());
    assert.equal((after - before).toString(), amt.toString());
  });

  it("test 4: place SOL bet RUG → works", async () => {
    const tokenMint = Keypair.generate().publicKey;
    const marketId = Keypair.generate().publicKey;
    await send(provider, await createMarketIx(tokenMint, marketId, marketDurationSec), [authority, platformKp]);
    const [market] = marketPda(program.programId, tokenMint, marketId);

    const bettor = Keypair.generate();
    await fundSmallBettor(bettor.publicKey);

    const [bet] = betPda(program.programId, market, bettor.publicKey);
    const amt = 40_000_000n;
    const before = BigInt((await (program.account as any).market.fetch(market)).rugPool.toString());

    const ix = await program.methods
      .placeBet({ rug: {} }, bn(amt))
      .accountsPartial({
        market,
        bettor: bettor.publicKey,
        bet,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await send(provider, ix, [bettor]);

    const after = BigInt((await (program.account as any).market.fetch(market)).rugPool.toString());
    assert.equal((after - before).toString(), amt.toString());
  });

  it("test 4b: second placeBet same wallet + side → tops up (no account init error)", async () => {
    const tokenMint = Keypair.generate().publicKey;
    const marketId = Keypair.generate().publicKey;
    await send(provider, await createMarketIx(tokenMint, marketId, marketDurationSec), [authority, platformKp]);
    const [market] = marketPda(program.programId, tokenMint, marketId);

    const bettor = Keypair.generate();
    await fundSmallBettor(bettor.publicKey);

    const [bet] = betPda(program.programId, market, bettor.publicKey);
    const first = 50_000_000n;
    const second = 40_000_000n;

    await send(
      provider,
      await program.methods
        .placeBet({ survive: {} }, bn(first))
        .accountsPartial({
          market,
          bettor: bettor.publicKey,
          bet,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
      [bettor],
    );

    await send(
      provider,
      await program.methods
        .placeBet({ survive: {} }, bn(second))
        .accountsPartial({
          market,
          bettor: bettor.publicKey,
          bet,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
      [bettor],
    );

    const betAcc: any = await (program.account as any).bet.fetch(bet);
    assert.equal(betAcc.amount.toString(), (first + second).toString());

    const m: any = await (program.account as any).market.fetch(market);
    assert.equal(m.totalBettors, 1);
  });

  it("test 4c: second placeBet opposite side → BetSideMismatch", async () => {
    const tokenMint = Keypair.generate().publicKey;
    const marketId = Keypair.generate().publicKey;
    await send(provider, await createMarketIx(tokenMint, marketId, marketDurationSec), [authority, platformKp]);
    const [market] = marketPda(program.programId, tokenMint, marketId);

    const bettor = Keypair.generate();
    await fundSmallBettor(bettor.publicKey);

    const [bet] = betPda(program.programId, market, bettor.publicKey);
    await send(
      provider,
      await program.methods
        .placeBet({ survive: {} }, bn(50_000_000n))
        .accountsPartial({
          market,
          bettor: bettor.publicKey,
          bet,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
      [bettor],
    );

    try {
      const ix = await program.methods
        .placeBet({ rug: {} }, bn(50_000_000n))
        .accountsPartial({
          market,
          bettor: bettor.publicKey,
          bet,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      await send(provider, ix, [bettor]);
      assert.fail("expected BetSideMismatch");
    } catch (e) {
      expectAnchorError(e, "BetSideMismatch");
    }
  });

  it("test 5: bet below 0.01 SOL → fails", async () => {
    const tokenMint = Keypair.generate().publicKey;
    const marketId = Keypair.generate().publicKey;
    await send(provider, await createMarketIx(tokenMint, marketId, marketDurationSec), [authority, platformKp]);
    const [market] = marketPda(program.programId, tokenMint, marketId);

    const bettor = Keypair.generate();
    await fundSmallBettor(bettor.publicKey);

    const [bet] = betPda(program.programId, market, bettor.publicKey);
    try {
      const ix = await program.methods
        .placeBet({ survive: {} }, bn(MIN_BET_LAMPORTS - 1n))
        .accountsPartial({
          market,
          bettor: bettor.publicKey,
          bet,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      await send(provider, ix, [bettor]);
      assert.fail("expected BetTooSmall");
    } catch (e) {
      expectAnchorError(e, "BetTooSmall");
    }
  });

  it("test 6: bet above 10 SOL → fails", async () => {
    const tokenMint = Keypair.generate().publicKey;
    const marketId = Keypair.generate().publicKey;
    await send(provider, await createMarketIx(tokenMint, marketId, marketDurationSec), [authority, platformKp]);
    const [market] = marketPda(program.programId, tokenMint, marketId);

    const bettor = Keypair.generate();
    await fundSmallBettor(bettor.publicKey);

    const [bet] = betPda(program.programId, market, bettor.publicKey);
    try {
      const ix = await program.methods
        .placeBet({ rug: {} }, bn(MAX_BET_LAMPORTS + 1n))
        .accountsPartial({
          market,
          bettor: bettor.publicKey,
          bet,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      await send(provider, ix, [bettor]);
      assert.fail("expected BetTooLarge");
    } catch (e) {
      expectAnchorError(e, "BetTooLarge");
    }
  });

  describe("resolve + claim (skipped on devnet — 1h expiry)", function () {
    before(function () {
      if (leanDevnet) this.skip();
      this.timeout(180_000);
    });

  it("test 7: rug resolves → winner claims SOL", async () => {
    const tokenMint = Keypair.generate().publicKey;
    const marketId = Keypair.generate().publicKey;
    await send(provider, await createMarketIx(tokenMint, marketId, marketDurationSec), [authority, platformKp]);
    const [market] = marketPda(program.programId, tokenMint, marketId);

    const winnerBet = 500_000_000n;
    const loserBet = 500_000_000n;

    const loser = Keypair.generate();
    const winner = Keypair.generate();
    for (const k of [loser, winner]) {
      await fundPairBettor(k.publicKey);
    }

    const [betLoser] = betPda(program.programId, market, loser.publicKey);
    await send(
      provider,
      await program.methods
        .placeBet({ survive: {} }, bn(loserBet))
        .accountsPartial({
          market,
          bettor: loser.publicKey,
          bet: betLoser,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
      [loser],
    );

    const [betWinner] = betPda(program.programId, market, winner.publicKey);
    await send(
      provider,
      await program.methods
        .placeBet({ rug: {} }, bn(winnerBet))
        .accountsPartial({
          market,
          bettor: winner.publicKey,
          bet: betWinner,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
      [winner],
    );

    await send(
      provider,
      await program.methods
        .resolveMarket({ rug: {} })
        .accountsPartial({
          market,
          platformAuthority: platformKp.publicKey,
        })
        .instruction(),
      [platformKp],
    );

    const winningPool = PLATFORM_SEED_PER_SIDE + winnerBet;
    const losingPool = PLATFORM_SEED_PER_SIDE + loserBet;
    const platformFee = (losingPool * PLATFORM_FEE_BPS) / 10_000n;
    const distributable = losingPool - platformFee;
    const yourShare = (winnerBet * distributable) / winningPool;
    const expectedPayout = winnerBet + yourShare;
    const expectedFeeShare = (winnerBet * platformFee) / winningPool;

    const wBefore = BigInt(await provider.connection.getBalance(winner.publicKey));
    const pBefore = BigInt(await provider.connection.getBalance(platformKp.publicKey));

    await send(
      provider,
      await program.methods
        .claimPayout()
        .accountsPartial({
          market,
          bet: betWinner,
          bettor: winner.publicKey,
          platformAuthority: platformKp.publicKey,
        })
        .instruction(),
      [winner],
    );

    const wAfter = BigInt(await provider.connection.getBalance(winner.publicKey));
    const pAfter = BigInt(await provider.connection.getBalance(platformKp.publicKey));

    assert.equal((pAfter - pBefore).toString(), expectedFeeShare.toString(), "platform fee lamports");

    const maxFee = 500_000n;
    assert.ok(
      wAfter - wBefore <= expectedPayout && wAfter - wBefore >= expectedPayout - maxFee,
      `winner delta ${wAfter - wBefore} vs payout ${expectedPayout}`,
    );
  });

  it("test 8: loser tries claim → fails", async () => {
    const stake = 100_000_000n;
    const tokenMint = Keypair.generate().publicKey;
    const marketId = Keypair.generate().publicKey;
    await send(provider, await createMarketIx(tokenMint, marketId, marketDurationSec), [authority, platformKp]);
    const [market] = marketPda(program.programId, tokenMint, marketId);

    const loser = Keypair.generate();
    const winner = Keypair.generate();
    for (const k of [loser, winner]) {
      await fundPairBettor(k.publicKey);
    }

    const [betLoser] = betPda(program.programId, market, loser.publicKey);
    await send(
      provider,
      await program.methods
        .placeBet({ survive: {} }, bn(stake))
        .accountsPartial({
          market,
          bettor: loser.publicKey,
          bet: betLoser,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
      [loser],
    );

    const [betWinner] = betPda(program.programId, market, winner.publicKey);
    await send(
      provider,
      await program.methods
        .placeBet({ rug: {} }, bn(stake))
        .accountsPartial({
          market,
          bettor: winner.publicKey,
          bet: betWinner,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
      [winner],
    );

    await send(
      provider,
      await program.methods
        .resolveMarket({ rug: {} })
        .accountsPartial({
          market,
          platformAuthority: platformKp.publicKey,
        })
        .instruction(),
      [platformKp],
    );

    try {
      await send(
        provider,
        await program.methods
          .claimPayout()
          .accountsPartial({
            market,
            bet: betLoser,
            bettor: loser.publicKey,
            platformAuthority: platformKp.publicKey,
          })
        .instruction(),
        [loser],
      );
      assert.fail("expected DidNotWin");
    } catch (e) {
      expectAnchorError(e, "DidNotWin");
    }
  });

  it("test 9: claim twice → fails", async () => {
    const stake = 100_000_000n;
    const tokenMint = Keypair.generate().publicKey;
    const marketId = Keypair.generate().publicKey;
    await send(provider, await createMarketIx(tokenMint, marketId, marketDurationSec), [authority, platformKp]);
    const [market] = marketPda(program.programId, tokenMint, marketId);

    const loser = Keypair.generate();
    const winner = Keypair.generate();
    for (const k of [loser, winner]) {
      await fundPairBettor(k.publicKey);
    }

    const [betLoser] = betPda(program.programId, market, loser.publicKey);
    await send(
      provider,
      await program.methods
        .placeBet({ survive: {} }, bn(stake))
        .accountsPartial({
          market,
          bettor: loser.publicKey,
          bet: betLoser,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
      [loser],
    );

    const [betWinner] = betPda(program.programId, market, winner.publicKey);
    await send(
      provider,
      await program.methods
        .placeBet({ rug: {} }, bn(stake))
        .accountsPartial({
          market,
          bettor: winner.publicKey,
          bet: betWinner,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
      [winner],
    );

    await send(
      provider,
      await program.methods
        .resolveMarket({ rug: {} })
        .accountsPartial({
          market,
          platformAuthority: platformKp.publicKey,
        })
        .instruction(),
      [platformKp],
    );

    await send(
      provider,
      await program.methods
        .claimPayout()
        .accountsPartial({
          market,
          bet: betWinner,
          bettor: winner.publicKey,
          platformAuthority: platformKp.publicKey,
        })
        .instruction(),
      [winner],
    );

    try {
      await send(
        provider,
        await program.methods
          .claimPayout()
          .accountsPartial({
            market,
            bet: betWinner,
            bettor: winner.publicKey,
            platformAuthority: platformKp.publicKey,
          })
        .instruction(),
        [winner],
      );
      assert.fail("expected AlreadyClaimed");
    } catch (e) {
      expectAnchorError(e, "AlreadyClaimed");
    }
  });
  });
});

export {};
