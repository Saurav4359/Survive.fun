# Survive.fun backend (`apps/api`)

Node 20, Express, TypeScript, Prisma (PostgreSQL), Redis + **BullMQ**, Socket.IO, Helius SDK (RPC + webhooks), Birdeye (optional), DexScreener (HTTP).

## Run

```bash
pnpm --filter api dev
```

Prisma schema: `apps/api/prisma/schema.prisma`  
Anchor IDL reference: `contracts/target/idl/survivefun.json`

---

## HTTP — `GET/POST` (prefix `/v1` and `/api/v1`)

| Method | Path | Status | Notes |
|--------|------|--------|--------|
| GET | `/health` | ✅ | Liveness |
| GET | `/v1/markets/active` | ✅ | Paginated active markets (`page`, `limit`) |
| GET | `/v1/markets` | ✅ | List with `?status=active|resolved|expired|all` |
| GET | `/v1/markets/:id` | ✅ | UUID |
| POST | `/v1/markets` | ✅ | Body: `tokenMint`, `duration`, `walletAddress`, optional `createMarketTxSignature` |
| GET | `/v1/markets/:id/bets` | ✅ | All bets for market |
| POST | `/v1/markets/:id/bets` | ✅ | Body: `side`, `amount`, `txSignature`, `walletAddress` |
| GET | `/v1/users/:wallet/bets` | ✅ | Bets + embedded market |
| GET | `/v1/stats` | ✅ | Platform snapshot (aggregates from DB) |
| GET | `/v1/leaderboard` | ✅ | `?tab=winners|rug-callers|biggest-payouts&limit=` |
| GET | `/v1/tokens/:mint` | ✅ | DexScreener pair + optional Birdeye enrich; Redis cache 30s |
| GET | `/v1/markets/:id/chart` | ✅ | `?interval=` OHLCV via Birdeye; Redis warm cache from background job |
| POST | `/webhook/helius` | ✅ | Raw JSON; `Authorization: Bearer <HELIUS_WEBHOOK_AUTH_SECRET>` |
| POST | `/v1/webhook/helius` | ✅ | Same handler (alternate mount) |
| POST | `/api/v1/webhook/helius` | ✅ | Same handler |

---

## WebSocket (Socket.IO, origin `API_URL`)

| Event | Direction | Status | Payload (summary) |
|-------|-----------|--------|-------------------|
| `bet_placed` | server → client | ✅ | `BetPlaced` — **broadcast** to all connections |
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

Critical: `DATABASE_URL`, `PORT`, `SOLANA_RPC_URL` / `SURVIVEFUN_PROGRAM_ID`, resolver signer, optional `REDIS_URL`, `BIRDEYE_API_KEY`, Helius + webhook secrets, `AUTO_MARKET_CREATOR_WALLET` for webhook auto-create.

---

## Session checklist (maintain each change)

### Endpoints completed ✅

All listed REST and webhook routes above are implemented in `apps/api/src`.

### Endpoints pending

- None required by current spec. Optional future: admin routes, GraphQL, historical candle storage in Postgres.

### Blockers / ops notes

1. **On-chain resolve** requires a funded platform key and matching program deployment (`PLATFORM_WALLET_SECRET_KEY`, `SURVIVEFUN_PROGRAM_ID`, RPC).
2. **Rug heuristics** need `HELIUS_API_KEY` (dev sell path) and DexScreener reachability; Birdeye improves charts + graduation rule.
3. **Helius webhook** needs a **public HTTPS** URL; local dev typically uses a tunnel.
4. **Auto-create from webhook** creates **DB-only** markets unless you extend the handler to submit `create_market` on-chain.
5. **Monorepo note:** Prisma lives under `apps/api/prisma/`, not repo root `prisma/`.
