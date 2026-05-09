# Survive.fun — Smart Contract Status

**Current Program ID (devnet):** `9ZqPpXBid4xzB49HjB7zE6BnTWryMuuZFTULTSJqqTd8`  
**Previous Program ID:** `3shYxrDG1srw1Wxu2yVnrnEUk53m6tS8HDyVKuoYLVd1` (superseded — new keypair + layout)  
**Older Program ID:** `HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH`  
**Deploy wallet:** `~/.config/solana/id.json` → address `9LL4o1q9SWFuSdDQgWxqLpKB6wnwrZpVHDKCr1RQRidT`  
**Deploy date:** 2026-05-09 — **devnet** program deploy + IDL init (upgrade authority: deploy wallet).  
**Cluster:** Solana devnet (**live**)  
**Build:** passing (`anchor build`, Anchor 0.31.1; compiler warnings only from Anchor macros, **zero errors**)  
**IDL:** `contracts/target/idl/survivefun.json` (copied to `apps/web/src/idl/survivefun.json` and `apps/api/src/idl/survivefun.json`)

---

## Latest deploy run (2026-05-09)

- **Market PDA:** `seeds = [b"market", token_mint]` only — fixes `AccountDidNotDeserialize` from stale PDAs that used extra seed bytes; **one market account per token mint** (duration still passed to `create_market` for expiry, not for PDA).
- **New instruction:** `close_market` — creator may close an **empty** market (no bettors, pools still platform seed only) and reclaim rent.
- New program keypair generated → **new Program ID** (see header).
- Build: `anchor build` ✅
- Devnet deploy: `anchor deploy --provider.cluster devnet` ✅
  - Deploy signature: `3NjUjmyW1MEVoZJtJnYSjBMRB7tkfdYRd5YvZxGtVNXhjeYppLVDC16ZmipcQr62M23qiYtKBinVqPPmSJoVjdd5`
- IDL initialized on devnet: `anchor idl init --filepath target/idl/survivefun.json 9ZqPpXBid4xzB49HjB7zE6BnTWryMuuZFTULTSJqqTd8 --provider.cluster devnet`
  - IDL account: `G8PDvwc6B7b26gq1w1gtQRtVRd2qf3skNxQC2W53jPWT`
- IDL instructions present: `create_market`, `place_bet`, `resolve_market`, `claim_payout`, `close_market`
- App env / PDA helpers updated for new program id and 2-seed market PDA.

---

## Removed (USDC)

- All SPL token transfers, token accounts, mint references, and **`anchor-spl`** dependency.
- **`MarketCurrency`** and any dual-path USDC/SOL instruction wiring.

---

## Added / current behavior (SOL + uniqueness)

### Market PDA seeds

`seeds = [b"market", token_mint.as_ref()], bump`

Same token mint → same PDA → second `create_market` for that mint hits **`MarketAlreadyExists`** (duration does not change the PDA).

### Errors (`SurviveError`)

See prior sections in git history; includes **`MarketAlreadyExists`**, bet bounds, **`InsufficientRent`**, etc.

### Authorization (production)

- **`Market.platform_authority`** is set once in **`create_market`** from the **`platform_authority`** signer. It is the canonical resolver and platform fee recipient for that market.
- **`resolve_market`** and **`claim_payout`** require **`platform_authority`** to match **`market.platform_authority`** (arbitrary signers cannot resolve or steal fee routing).
- **`resolve_market`** rejects resolution before **`market.expires_at`** (**`CannotResolveBeforeExpiry`**).
- **Account layout:** adding `platform_authority` changes the `Market` account size; existing on-chain `Market` accounts from before this layout are **incompatible** — upgrade the program and use **new** markets (or migrate off old PDAs).

### Local tests vs deploy

- **`integration-test` Cargo feature:** allows **10-second** market durations for **`anchor test -- --features integration-test`** only. **Do not** deploy a binary built with this feature to devnet/mainnet.
- **Production:** `anchor build` with **no** `integration-test` (durations: 1h / 6h / 24h only).

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
