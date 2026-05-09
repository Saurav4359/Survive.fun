# Survive.fun backend (`apps/api`)

Node 20, Express, TypeScript, Prisma (PostgreSQL), Redis + **BullMQ**, Socket.IO, Helius SDK (RPC + webhooks), Birdeye (optional), DexScreener (HTTP).

## Run

```bash
pnpm --filter api dev
```

Prisma schema: `apps/api/prisma/schema.prisma`  
Anchor IDL reference: `contracts/target/idl/survivefun.json`

**Note:** Spec paths under `backend/src/` map to **`apps/api/src/`** (see `backend/README.md`).

---

## Market PDA vs `on_chain_address` (program upgrades)

**Root cause:** After **`SURVIVEFUN_PROGRAM_ID`** (or `PROGRAM_ID`) changes, Postgres may still hold an **`on_chain_address`** that is a **valid account** but owned by the **previous** program deployment. Trusting that pubkey for `place_bet` verification, `resolve_market`, or RPC reads caused **`TX_MARKET_MISMATCH`** and broken resolution—the wallet and new IDL derive the market PDA from **`token_mint` + `duration_seconds`** and the **current** program id, which no longer matches the stale stored address.

**Rule:** For verification, resolution, and API payloads, the market account is always the **canonical PDA** for the **current** program:

- Seeds: `market` (bytes) + **token mint** + **`duration_seconds` as little-endian `u64`** (8 bytes), per `contracts/target/idl/survivefun.json` and `contracts/contract.md`.

**Backend behavior (implemented):**

| Area | Behavior |
|------|----------|
| `apps/api/src/lib/marketOnChain.ts` | **`marketPdaBase58ForMintAndDuration`** / **`marketPdaBase58ForDbRow`** always derive from mint + duration + **`getProgramId()`**. They **do not** return a raw DB `on_chain_address` for logic. |
| `apps/api/src/lib/dto.ts` | **`toMarketDto`**: `onChainAddress` is **`null`** if the row has no on-chain marker (`on_chain_address` null/empty); otherwise the API returns the **canonical** PDA for the current program, **not** the stored pubkey from an old deployment. |
| `apps/api/src/routes/bets.ts` | Bet tx verification uses **`marketPdaBase58ForDbRow(marketRow)`**, aligned with what the wallet submits after a program upgrade. |
| `apps/api/src/jobs/resolver.ts` | **`resolveOnChain`** builds `resolve_market` against **`marketPda(...)`** from **`getProgramId()`** (same seed layout). Uses shared **`toMarketDto`** from `lib/dto` (no duplicate DTO helper). |
| `apps/api/src/routes/markets.ts` | Validation copy for SOL-only create path: **"Currency must be sol"** (schema already SOL-only for new markets where applicable). **`POST /markets`** returns **200** with an existing active market when **`token_mint` + `duration`** already exist (idempotent; skips DexScreener + duplicate rows). |
| `apps/api/src/routes/webhook.ts` | Rug sweep uses **`toMarketDto`** (same canonical **`onChainAddress`** as REST), not a duplicate mapper. |

**Frontend (parity):** `apps/web/src/utils/transactions.ts` — **`resolveMarketPdaForTransaction`** so client txs use the current program’s market PDA when stored metadata would be wrong; **`market/[id]/page.tsx`** and **`bets/page.tsx`** follow that pattern for place bet / claim.

**Env checklist (must match deployed program):**

- **API:** `SURVIVEFUN_PROGRAM_ID` or `PROGRAM_ID` = current deploy (see `contracts/contract.md`; e.g. devnet **`3shYxrDG1srw1Wxu2yVnrnEUk53m6tS8HDyVKuoYLVd1`**).
- **Web:** `NEXT_PUBLIC_PROGRAM_ID` = same value.

Restart the API after changing program id so DTO and verification pick up the new id. With **`SKIP_TX_VERIFICATION=false`**, SOL bets whose transactions hit the **new** market PDA should verify successfully.

**Optional follow-ups (not required for correctness):** SQL backfill/cleanup of legacy `on_chain_address` rows if you still have rows from an old program; dev scripts under `scripts/` may still mention older flows—update when refreshing tooling, not for runtime.

---

## Security & operational notes (audit)

This API is largely **public**: there is no session/JWT for traders; correctness relies on **Solana tx verification** (`SKIP_TX_VERIFICATION` must stay **false** in production), **Helius webhook auth** (`HELIUS_WEBHOOK_AUTH_SECRET` timing-safe compare), and **platform keys** for `resolve_market`.

When **`NODE_ENV=production`**, the process **exits on startup** if `SKIP_TX_VERIFICATION=true`, `ALLOW_DB_ONLY_MARKET_CREATE=true`, or **`CORS_ORIGIN`** is empty after parsing (`apps/api/src/config/productionGate.ts` + `apps/api/src/index.ts`). Documented in **`devops.md`**.

| Topic | Risk | Mitigation / status |
|-------|------|---------------------|
| **Bet replay / forged stakes** | High if verification disabled | **`SKIP_TX_VERIFICATION`** only for local tests — **blocked in production** at boot (see above). |
| **DB-only markets** | Spam / no on-chain market | **`ALLOW_DB_ONLY_MARKET_CREATE`** — **blocked in production** at boot if set to `true`. |
| **CORS** | Misconfigured browser access | **Production:** non-empty **`CORS_ORIGIN`** required or process exits. **Dev:** omit for permissive local defaults. |
| **Socket.IO** | Room flooding | **`subscribe_market`** accepts only **UUID** `marketId` (invalid payloads ignored). |
| **Helius webhook** | Unauthorized triggers | Rejects when secret unset or **`Authorization`** mismatch; responds **401**. Body size capped (**2mb** raw). |
| **Outbound HTTP** | SSRF | DexScreener/Birdeye/Helius URLs are fixed templates; mints validated as **base58** before interpolation. |
| **SQL injection** | — | Prisma parameterizes queries; no raw SQL from user input. |
| **Secrets in logs** | — | Errors use generic **INTERNAL_ERROR** message for unknown failures (`errorHandler`). |
| **Duplicate active markets** | Double listings | **`POST /markets`** checks **`token_mint` + `duration` + `active`** first; returns **200** + existing market. **DB:** partial unique index **`markets_active_token_mint_duration_key`** on **`(token_mint, duration)`** where **`status = 'active'`** (migration **`20260509120000_markets_active_mint_duration_unique`**). **`P2002`** on create → reload active row and return **200** if found; else **409** `MARKET_CONFLICT`. **Helius** auto-create: **`P2002`** → log and skip (idempotent). **Deploy:** migration fails if duplicate active rows already exist — dedupe before `migrate deploy`. |
| **Leaderboard** | Heavy query | Loads up to **8000** resolved bets into memory for aggregation — acceptable at small scale; consider SQL aggregation if traffic grows. |
| **Platform signer** | Key exposure | **`PLATFORM_WALLET_SECRET_KEY`** must never be committed; limits platform authority to **`resolve_market`** + funded SOL for fees. |

---

## Schema — markets & bets (`currency`)

| Table | New column | Default | Meaning |
|-------|------------|---------|---------|
| `markets` | `currency` `VARCHAR(10)` | `'usdc'` | Collateral for pool + bets: `usdc` \| `sol` |
| `bets` | `currency` `VARCHAR(10)` | `'usdc'` | Must match parent market; stake stored in `amount_usdc` column in **native units** (USDC decimal or **lamports integer**) |

Existing rows pick up `usdc` via migration default. **`survive_pool` / `rug_pool`** remain one numeric column per market: human USDC for USDC markets, **lamports** for SOL markets (never mixed).

---

## HTTP — `GET/POST` (prefix `/v1` and `/api/v1`)

| Method | Path | Status | Notes |
|--------|------|--------|--------|
| GET | `/health` | ✅ | Liveness |
| GET | `/v1/markets/active` | ✅ | Paginated active markets (`page`, `limit`); each item includes `currency` |
| GET | `/v1/markets` | ✅ | List with `?status=active|resolved|expired|all` |
| GET | `/v1/markets/:id` | ✅ | UUID; includes `currency` |
| POST | `/v1/markets` | ✅ | Body: `tokenMint`, `duration`, `walletAddress`, `currency` (`sol`\|`usdc`, default `usdc`), optional `createMarketTxSignature`. On-chain `create_market` must match `currency` (see IDL `MarketCurrency`). |
| GET | `/v1/markets/:id/bets` | ✅ | All bets for market |
| POST | `/v1/markets/:id/bets` | ✅ | Body: `side`, **`currency`** (`sol`\|`usdc`), `amount` (USDC 1–50 **or** SOL **integer lamports** 1_000_000–50_000_000), `txSignature`, `walletAddress`. **`CURRENCY_MISMATCH`** if bet currency ≠ market. |
| GET | `/v1/users/:wallet/bets` | ✅ | Bets + embedded market (`Bet` DTO includes `currency`, `amountUsdc` \| `amountLamports`) |
| GET | `/v1/stats` | ✅ | Adds **`solVolume24h`** (SOL), **`usdcVolume24h`** (USDC); **`totalBetVolumeUsdc`** is USDC-only lifetime sum (SOL excluded). |
| GET | `/v1/leaderboard` | ✅ | `?tab=winners|rug-callers|biggest-payouts&limit=` — **USDC-only** for v1 (avoids mixing units). |
| GET | `/v1/tokens/:mint` | ✅ | DexScreener pair + optional Birdeye enrich; Redis cache 30s |
| GET | `/v1/markets/:id/chart` | ✅ | `?interval=` OHLCV via Birdeye; Redis warm cache from background job |
| POST | `/webhook/helius` | ✅ | Raw JSON; `Authorization: Bearer <HELIUS_WEBHOOK_AUTH_SECRET>` |
| POST | `/v1/webhook/helius` | ✅ | Same handler (alternate mount) |
| POST | `/api/v1/webhook/helius` | ✅ | Same handler |

---

## WebSocket (Socket.IO, origin `API_URL`)

| Event | Direction | Status | Payload (summary) |
|-------|-----------|--------|-------------------|
| `bet_placed` | server → client | ✅ | `BetPlaced`: `currency`, `amountUsdc`, `amountLamports` — **broadcast** |
| `pool_update` | server → client | ✅ | `{ marketId, survivePool, rugPool }` — broadcast |
| `market_resolved` | server → client | ✅ | `MarketResolved` (includes pools + timestamp) — broadcast |
| `new_token` | server → client | ✅ | `{ tokenMint, tokenName }` to platform feed (Helius auto-market) |
| `market_created` | server → client | ✅ | `{ market }` on manual POST /markets |
| `stats_update` | server → client | ✅ | To room `stats` if clients call `subscribe_stats` |

Client events: `subscribe_market`, `subscribe_stats`.

---

## Rug detection & resolution

- **Cadence:** `detectRug()` runs for **every active market every 30s** (`apps/api/src/jobs/resolver.ts`), using BullMQ when `REDIS_URL` is set, else `setInterval`.
- **Checks inside `detectRug`:** dev sell ratio (Helius + RPC), price drop vs open (DexScreener), liquidity removed vs open (DexScreener), graduation stall (Birdeye).
- **Exported helpers** (same heuristics): `checkDevSell`, `checkPriceDrop`, `checkLiquidityRemoved` in `apps/api/src/services/rugDetector.ts`.
- **On rug / expiry:** DB update + `resolveOnChain()` when `PLATFORM_WALLET_SECRET_KEY` is set + `emitMarketResolved`.

---

## Helius webhook

- **Pump.fun program:** `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` (`PUMP_FUN_PROGRAM_ADDRESS`).
- **Registration:** `registerHeliusWebhook()` on boot if `HELIUS_API_KEY`, `HELIUS_WEBHOOK_URL` (public HTTPS, e.g. `https://api.example.com/webhook/helius`), and `HELIUS_WEBHOOK_AUTH_SECRET` are set.
- **Auto-market:** `TOKEN_MINT` events create a DB market when `AUTO_MARKET_CREATOR_WALLET` is set (no on-chain market in that path by default).

---

## BullMQ / background jobs

| Job | Queue / mode | Interval | Role |
|-----|----------------|----------|------|
| Market resolver | `survive-market-resolver` | 30s | Rug sweep + expiry → survive |
| OHLCV aggregation | `survive-ohlcv-aggregation` | 5m | Warm Redis `ohlcv:<mint>:<interval>` for charts |
| Stats updater | `survive-stats-updater` | 60s | Upsert `PlatformStats` + `stats_update` emit |

Without `REDIS_URL`, resolver + OHLCV + stats use **setInterval** with the same intervals (`apps/api/src/jobs/backgroundJobs.ts`).

---

## Environment (see `apps/api/env.sample`)

Critical: `DATABASE_URL`, `PORT`, `SOLANA_RPC_URL` / `SURVIVEFUN_PROGRAM_ID` (or `PROGRAM_ID`—must match live deploy; see **Market PDA vs `on_chain_address`**), resolver signer, optional `REDIS_URL`, `BIRDEYE_API_KEY`, Helius + webhook secrets, `AUTO_MARKET_CREATOR_WALLET` for webhook auto-create. Web clients: `NEXT_PUBLIC_PROGRAM_ID` must match the same program id.

---

## Validation & errors

| Code | When |
|------|------|
| `INVALID_CURRENCY` | POST `/markets` or `/markets/:id/bets`: invalid `currency` enum |
| `CURRENCY_MISMATCH` | Bet `currency` ≠ market `currency` |
| `SOL_AMOUNT_INVALID` | SOL bet: `amount` not integer lamports or outside on-chain min/max |
| `TX_CURRENCY_MISMATCH` | Verified `create_market` ix currency ≠ request |

---

## Testing (manual)

From repo root with API + DB running:

- Create USDC market (omit `currency` or `"usdc"`) → OK; legacy behavior.
- Create SOL market (`"currency":"sol"`) with matching on-chain tx → OK.
- POST bet `currency:"usdc"` on USDC market → OK.
- POST bet `currency:"sol"` with integer lamports on SOL market → OK.
- Cross pairs → `CURRENCY_MISMATCH`.
- GET `/v1/stats` → `solVolume24h` and `usdcVolume24h` reported separately (no combined total).

`pnpm --filter api typecheck` / `pnpm --filter web typecheck` — passing after this change.

---

## Session checklist (maintain each change)

### Endpoints completed ✅

All listed REST and webhook routes above are implemented in `apps/api/src`.

### Endpoints pending

- Optional: SOL-specific leaderboard, persisted SOL payout metrics.

### Blockers / ops notes

1. **Program id + market PDA:** See **Market PDA vs `on_chain_address` (program upgrades)** above—API and web **`PROGRAM_ID`** values must stay in sync with `contracts/contract.md` / IDL after any redeploy.
2. **On-chain resolve** requires a funded platform key and matching program deployment (`PLATFORM_WALLET_SECRET_KEY`, `SURVIVEFUN_PROGRAM_ID`, RPC).
3. **Rug heuristics** need `HELIUS_API_KEY` (dev sell path) and DexScreener reachability; Birdeye improves charts + graduation rule.
4. **Helius webhook** needs a **public HTTPS** URL; local dev typically uses a tunnel.
5. **Auto-create from webhook** creates **DB-only** markets unless you extend the handler to submit `create_market` on-chain.
6. **Monorepo note:** Prisma lives under `apps/api/prisma/`, not repo root `prisma/`.
7. **Breaking changes:** Response shapes are extended (`Market.currency`, `Bet` stake fields). Clients must treat `amountUsdc` as nullable when `currency === "sol"` (use `amountLamports`). No removal of USDC defaults.

Migration: `apps/api/prisma/migrations/20260208120000_add_market_bet_currency/migration.sql`
