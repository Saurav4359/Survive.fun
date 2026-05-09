# Survive.fun — Smart Contract Status

**New Program ID:** `3shYxrDG1srw1Wxu2yVnrnEUk53m6tS8HDyVKuoYLVd1`  
**Old Program ID:** `HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH`  
**Deploy wallet:** `~/.config/solana/id.json` → address `9LL4o1q9SWFuSdDQgWxqLpKB6wnwrZpVHDKCr1RQRidT`  
**Deploy date:** 2026-05-09 — **devnet deployment confirmed** (program loaded at ID above; upgrade authority: deploy wallet).  
**Cluster:** Solana devnet (**live**)  
**Build:** passing (`anchor build`, Anchor 0.31.1; compiler warnings only from Anchor macros, **zero errors**)  
**IDL:** `contracts/target/idl/survivefun.json` (synced to `apps/web/src/idl/survivefun.json`)

---

## Removed (USDC)

- All SPL token transfers, token accounts, mint references, and **`anchor-spl`** dependency.
- **`MarketCurrency`** and any dual-path USDC/SOL instruction wiring.

---

## Added / current behavior (SOL + uniqueness)

### Market PDA seeds

`seeds = [b"market", token_mint.as_ref(), duration_seconds.to_le_bytes().as_ref()], bump`

Same token mint + same duration → same PDA → second `create_market` hits **`MarketAlreadyExists`**.

### Errors (`SurviveError`)

See prior sections in git history; includes **`MarketAlreadyExists`**, bet bounds, **`InsufficientRent`**, etc.

---

## Tests

**Localnet (`anchor test`):** **9/9 passing.**

### Devnet workflow (contract validation complete — avoid pointless redeploys)

- **Default:** run integration tests against the **already deployed** program — no chain upgrade per run:
  - `anchor run test-devnet`  
  - or `anchor test --provider.cluster devnet --skip-deploy`
- **`anchor test --provider.cluster devnet` without `--skip-deploy`** upgrades the program every time (~**1.8 SOL** each). **Do not use** for routine validation.
- **Redeploy only** after **`programs/survivefun` Rust changes** that must be exercised on devnet:  
  `anchor build && anchor deploy --provider.cluster devnet` **once**, then return to **`--skip-deploy`** for all further test runs until the next material program change.

Integration suite: `contracts/tests/survivefun.ts`. On devnet it funds ephemeral accounts from **`ANCHOR_WALLET`** (no CLI faucet). Stakes are scaled down on devnet vs Localnet.

Successful devnet run (deploy skipped):

| # | Result |
|---|--------|
| 1 | create market → succeeds |
| 2 | create same market again → fails (`MarketAlreadyExists`) |
| 3 | place SOL bet SURVIVE → works |
| 4 | place SOL bet RUG → works |
| 5 | bet below 0.01 SOL → fails |
| 6 | bet above 10 SOL → fails |
| 7 | rug resolves → winner claims SOL |
| 8 | loser tries claim → fails |
| 9 | claim twice → fails |

---
