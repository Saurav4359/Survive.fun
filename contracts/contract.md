# Survive.fun — Smart Contract Status

**Program ID:** `HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH`
**Cluster:** Solana devnet
**Build:** ✅ passing (`anchor build`, Anchor 0.31.1)
**Deployed:** ✅ yes (slot 461011217, signature `tJWakC2vFr18kiRkBPqkaa5AR3ggecVe2Mah3FATNj1XXMj4HigK72kXBfuxkEzK4i7Hdm4JrcTWDZtJnQprrVT`)
**Upgrade authority:** `J6utNEGcSTw6Nwjpx4HSpkp3sgXAGz7n3Web71eyaANC`
**USDC mint (pinned):** `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
**IDL:** `contracts/target/idl/survivefun.json` (also TS types at `contracts/target/types/survivefun.ts`)

---

## What existed already

All 4 instructions, both account structs, all events, and all error codes were already implemented before this session.

### Instructions (4/4)
1. `create_market(token_mint, duration_seconds)` — PDA `["market", token_mint]`, creates ATA escrow, validates duration ∈ {3600, 21600, 86400}, transfers `2 × 10 USDC` platform seed (one per pool), sets `platform_fee_bps = 200`.
2. `place_bet(side, amount)` — PDA `["bet", market, bettor]`, MIN/MAX bet (1–50 USDC), checks `Active` status and not expired, transfers USDC to escrow, increments side pool + `total_bettors`, emits `BetPlaced`.
3. `resolve_market(outcome)` — flips `status -> Resolved`, sets `outcome`, emits `MarketResolved`. Authorized by `platform_authority` signer.
4. `claim_payout()` — pro-rata payout from losing pool, 200 bps platform fee, PDA-signed escrow transfer to bettor + platform, marks `bet.claimed = true`, emits `PayoutClaimed`.

### Account structs
- `Market { token_mint, creator, survive_pool, rug_pool, total_bettors, duration, created_at, expires_at, status, outcome, platform_fee_bps, bump }` — matches spec exactly.
- `Bet { market, bettor, side, amount, claimed, bump }` — matches spec exactly.

### Enums
- `MarketStatus { Active, Resolved, Expired }`
- `Outcome { Survive, Rug }`
- `BetSide { Survive, Rug }`

### Errors (11)
`MarketNotActive`, `MarketExpired`, `BetTooSmall`, `BetTooLarge`, `Unauthorized`, `MarketNotResolved`, `AlreadyClaimed`, `DidNotWin`, `InvalidDuration`, `ZeroWinningPool`, `ArithmeticOverflow`.

### Events (3)
`BetPlaced`, `MarketResolved`, `PayoutClaimed`.

---

## What I added

Nothing structural — every instruction and account in the spec already existed. Only added the USDC mint pin (see “Fixed” below).

---

## What I fixed

1. **Anchor version bump (0.29 → 0.31.1).** `programs/survivefun/Cargo.toml` was pinned to `anchor-lang/anchor-spl = 0.29.0` while the installed CLI is `anchor-cli 0.31.1`. Bumped both to `0.31.1` to match the toolchain (spec required Anchor 0.31).
2. **USDC mint hardcoded.** Added a top-level constant in `lib.rs`:
   ```rust
   pub const USDC_MINT: Pubkey = pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
   ```
   Applied `#[account(address = USDC_MINT)]` to the `usdc_mint` account in `CreateMarket`, `PlaceBet`, and `ClaimPayout` so any other mint is rejected at the program boundary.

No build errors before or after — the prior build issues would only have surfaced under the 0.31 toolchain, and the version bump compiles cleanly.

---

## Build status

```
anchor build
   Finished `release` profile [optimized] target(s) in 2.39s
   Finished `test` profile [unoptimized + debuginfo] target(s) in 3.24s
```

Two non-fatal warnings (deprecated `AccountInfo::realloc`, unexpected `cfg(no-idl)`); both originate inside Anchor's `#[program]` macro, not user code.

---

## Test results

No `tests/` folder present — none were specified in the task. Skipped per the “only build what's missing per spec” rule.

---

## Session summary

```
Existing code: 4/4 instructions found
Added:         0 instructions
Fixed:         2 issues (Anchor 0.29 → 0.31.1, USDC mint pinned)
Program ID:    HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH
Build:         passing
Deployed:      yes (devnet)
```
