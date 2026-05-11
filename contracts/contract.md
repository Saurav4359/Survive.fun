# Survive.fun — Smart Contract Status

**Current Program ID (devnet):** `9ZqPpXBid4xzB49HjB7zE6BnTWryMuuZFTULTSJqqTd8`  
**Previous Program ID:** `3shYxrDG1srw1Wxu2yVnrnEUk53m6tS8HDyVKuoYLVd1` (superseded)  
**Older Program ID:** `HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH`  
**Deploy wallet:** `~/.config/solana/id.json` → address `9LL4o1q9SWFuSdDQgWxqLpKB6wnwrZpVHDKCr1RQRidT`  
**Deploy date:** 2026-05-10 — **devnet** program upgrade (same program id)  
**Cluster:** Solana devnet (**live**)  
**Build:** passing (`anchor build`, Anchor 0.31.1; compiler warnings only from Anchor macros, **zero errors**)  
**IDL:** `contracts/target/idl/survivefun.json` (copied to `apps/web/src/idl/survivefun.json` and `apps/api/src/idl/survivefun.json`)  
**Latest devnet deploy signature (upgrade):** `vufQdDp1MWNWSeW4mS2AYXBavvDbsuFfQdwL9aWHg8hkhGkqs9VxqK7FWoYYVc1NMD1HD9JmiwMEqapDihZedDs`

---

## `create_market` — instruction parameters (current)

| Parameter | Type | Meaning |
|-----------|------|---------|
| `token_mint` | `Pubkey` | SPL mint for the prediction market |
| `market_id` | `Pubkey` | Round id; part of PDA seeds (`same mint` → multiple rounds) |
| `duration_seconds` | `u64` | 3600 / 21600 / 86400 (production); 10s with `--features integration-test` |
| `dev_wallet` | `Pubkey` | Token creator / dev wallet address snapshot |
| `dev_balance_at_open` | `u64` | That wallet’s **SOL lamports** at creation time |
| `open_price` | `u64` | Price × **1_000_000** (fixed-point) |
| `open_liquidity` | `u64` | Liquidity × **100** (fixed-point) |

**Why:** Snapshots are immutable on-chain; off-chain estimation after transfers is unreliable.

---

## `Market` account — struct fields (current)

| Field | Type |
|-------|------|
| `token_mint` | `Pubkey` |
| `market_id` | `Pubkey` |
| `dev_wallet` | `Pubkey` |
| `dev_balance_at_open` | `u64` |
| `open_price` | `u64` |
| `open_liquidity` | `u64` |
| `creator` | `Pubkey` |
| `survive_pool` | `u64` |
| `rug_pool` | `u64` |
| `total_bettors` | `u32` |
| `duration` | `u64` |
| `created_at` | `i64` |
| `expires_at` | `i64` |
| `status` | `MarketStatus` |
| `outcome` | `Option<Outcome>` |
| `platform_fee_bps` | `u64` |
| `platform_authority` | `Pubkey` |
| `bump` | `u8` |

**Account size:** `8 + Market::INIT_SPACE` (Anchor `InitSpace` includes new fields: **+32 +8 +8 +8** vs layout before snapshot fields).

---

## Market PDA seeds

`seeds = [b"market", token_mint.as_ref(), market_id.as_ref()], bump`

Same mint + **different** `market_id` → **new** market account (new round).

---

## Instructions unchanged (behavior)

- **`place_bet`** — unchanged  
- **`resolve_market`** — unchanged  
- **`claim_payout`** — unchanged  
- **`close_market`** — unchanged  

---

## Resolve timing

- **`resolve_market`** may run while `status == Active`; **`place_bet`** still requires `now < expires_at`.

---

## Errors (`SurviveError`)

Includes **`MarketAlreadyExists`**, **`InvalidMarketId`**, bet bounds, **`InsufficientRent`**, **`MarketHasOpenPositions`**, etc.

---

## Local tests vs deploy

- **`integration-test` Cargo feature:** allows **10-second** market durations for **`anchor test -- --features integration-test`** only. **Do not** deploy a binary built with this feature to devnet/mainnet.
- **Production:** `anchor build` with **no** `integration-test` (durations: 1h / 6h / 24h only).

---

## Tests

**Localnet (`anchor test -- --features integration-test`):** **12/12 passing.**

Suite: `contracts/tests/survivefun.ts`. Includes duplicate-market checks, place-bet flows, resolve + claim (localnet only).

| # | Result |
|---|--------|
| 1 | create market → succeeds (snapshot fields asserted) |
| 2 | create same market again → `MarketAlreadyExists` |
| 2b | same mint, new `market_id` → second market succeeds |
| 3–6 | place bet / limits |
| 7–9 | resolve + claim |

---

## Devnet workflow

- Prefer **`anchor test --provider.cluster devnet --skip-deploy`** for routine runs.
- **Redeploy** after Rust changes: `anchor build && anchor deploy --provider.cluster devnet`.
