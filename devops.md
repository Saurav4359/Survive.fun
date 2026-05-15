# Survive.fun — DevOps runbook

Owner: DevOps Agent. Scope: env vars, deployment configs, integration wiring, scripts.
Out of scope: business logic, frontend UI, contract code.

---

## 1. Repository layout (devops-relevant)

| Path | Purpose |
|------|---------|
| `apps/api/` | Express + Prisma + Socket.IO backend (deploys to **Railway**) |
| `apps/web/` | Next.js 14 frontend (deploys to **Vercel**) |
| `apps/api/prisma/schema.prisma` | Database schema (Postgres) |
| `apps/api/prisma/migrations/` | Versioned SQL migrations |
| `apps/api/src/config/productionGate.ts` | Exits on boot in production if unsafe demo env flags are set |
| `apps/api/src/scripts/helius-webhook.ts` | Helius webhook CRUD (list / register / ensure / delete) |
| `apps/api/railway.json` | Railway build & deploy config |
| `apps/web/vercel.json` | Vercel build config |
| `contracts/Anchor.toml` | On-chain program id (devnet + localnet) |
| `docker-compose.yml` | Local Postgres + Redis |

---

## 2. Environment variables

### Backend — Railway (`apps/api`)

The **bold** name is what the code reads (`process.env.X`); the indented italicised name is the spec alias kept for compatibility (set both in production for safety).

| Variable | Required | Used by | Notes |
|----------|----------|---------|-------|
| **`DATABASE_URL`** | ✅ | Prisma | Postgres connection string. Railway auto-provisions via the Postgres plugin. |
| **`REDIS_URL`** | ✅ | BullMQ + cache | Railway Redis plugin or Upstash. Without it, `setInterval` fallback kicks in. |
| **`HELIUS_API_KEY`** | ✅ | Rug detector + webhook | From Helius dashboard. |
| **`SURVIVEFUN_PROGRAM_ID`** | ✅ | Anchor + resolver | Deployed program id (matches `contracts/Anchor.toml`). |
| &nbsp;&nbsp;&nbsp;_`PROGRAM_ID`_ | alias | spec only | Keep equal to `SURVIVEFUN_PROGRAM_ID`. |
| **`PLATFORM_WALLET_SECRET_KEY`** | ✅ | Resolver signer | JSON byte-array (e.g. `[12,34,...]`). Must hold SOL for resolve_market fees. |
| &nbsp;&nbsp;&nbsp;_`PLATFORM_WALLET_SECRET`_ | alias | spec only | Same value. |
| **`SOLANA_RPC_URL`** | ✅ | Anchor RPC | Devnet: `https://api.devnet.solana.com` or Helius devnet RPC. |
| &nbsp;&nbsp;&nbsp;_`SOLANA_RPC`_ | alias | spec only | Same value. |
| **`USDC_MINT_DEVNET`** | ✅ | spec / docs | Canonical Circle devnet mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. |
| **`BACKEND_URL`** | ✅ | webhook URL builder | Public origin of the API, e.g. `https://survivefun-api.up.railway.app`. |
| **`FRONTEND_URL`** | ✅ | CORS guidance | Public origin of the web app, e.g. `https://survive.fun`. |
| **`CORS_ORIGIN`** | ✅ in prod | Express + Socket.IO | Comma-separated allowed origins. **If `NODE_ENV=production` and this parses to an empty list, the process exits on startup.** In dev, omitting it keeps permissive behavior (Express reflects origin; Socket.IO uses `*`). |
| **`HELIUS_WEBHOOK_URL`** | ✅ | webhook bootstrap | `${BACKEND_URL}/webhook/helius` — must be public HTTPS. |
| **`HELIUS_WEBHOOK_AUTH_SECRET`** | ✅ | webhook auth | Long random string. Helius sends it as `Authorization` header; API verifies via `timingSafeEqual`. |
| `HELIUS_NETWORK` | optional | Helius SDK (webhook tooling) | **`devnet`** (default). Use `mainnet` only to list/delete **legacy** Pump.fun webhooks on Helius; the API skips auto-registration unless this is `mainnet`. |
| `AUTO_MARKET_CREATOR_WALLET` | optional | webhook auto-create | Wallet recorded as creator on Pump.fun TOKEN_MINT auto-markets. |
| `BIRDEYE_API_KEY` | optional | OHLCV chart, graduation rule | Improves charts; not required. |
| `PORT` | optional | Express | Railway sets this automatically; default `3001`. |
| `NODE_ENV` | optional | Prisma logging + boot guards | Set to `production` on Railway. When production, the API also enforces the rules below. |

> **Local-only flags** (must NOT be set in production): `ALLOW_DB_ONLY_MARKET_CREATE=true`, `SKIP_TX_VERIFICATION=true`.

### Production startup guards (`assertProductionSafeOrExit`)

When **`NODE_ENV=production`**, the API exits immediately (before listening) if any of these hold:

- `SKIP_TX_VERIFICATION=true`
- `ALLOW_DB_ONLY_MARKET_CREATE=true`
- `CORS_ORIGIN` is missing or whitespace-only (no allowed origins after parsing)

Implementation: `apps/api/src/config/productionGate.ts`, called from `apps/api/src/index.ts`.

### Frontend — Vercel (`apps/web`)

| Variable | Required | Notes |
|----------|----------|-------|
| **`NEXT_PUBLIC_API_URL`** | ✅ | API origin (no path), e.g. `https://survivefun-api.up.railway.app`. Socket.IO uses this origin only. |
| **`NEXT_PUBLIC_RPC_URL`** | ✅ | Solana RPC for the wallet adapter / read-only queries. |
| **`NEXT_PUBLIC_PROGRAM_ID`** | ✅ | Same value as backend `SURVIVEFUN_PROGRAM_ID`. |
| **`NEXT_PUBLIC_USDC_MINT`** | ✅ | Currently hard-coded in `src/utils/constants.ts` to the canonical devnet mint; expose for parity. |
| `NEXT_PUBLIC_API_V1_PREFIX` | optional | Default `/v1`. Set to `/api/v1` only if a reverse proxy strips the `/v1` prefix. |
| `NEXT_PUBLIC_PLATFORM_AUTHORITY` | optional | Pubkey of the resolver signer; used by `create_market` / `claim`. |

---

## 3. Local development

```bash
# Boot local Postgres + Redis
pnpm docker:up

# Apply migrations + generate Prisma client
cd apps/api
pnpm db:migrate:deploy
pnpm db:generate

# Boot API on :3001 and web on :3000
cd ../..
pnpm dev
```

Health check: `curl http://localhost:3001/health` → `{"ok":true}`.

> ⚠ **Port 3001 conflict:** during this DevOps session the host had a Next.js dev server bound to `:3001` (next-server PID 54751 in `apps/web`). That blocks the API from starting. Verify with `lsof -nP -iTCP:3001 -sTCP:LISTEN`; either kill the offending process or set `PORT=3099 pnpm --filter api dev` to confirm health locally. Vercel/Railway are unaffected since each service binds the port their platform injects.

---

## 4. Database — Prisma

The schema lives at `apps/api/prisma/schema.prisma`. Migrations live next to it under `apps/api/prisma/migrations/`.

```bash
cd apps/api

# Production deploy (Railway runs this on every release)
pnpm db:migrate:deploy

# Generate the Prisma client (runs as `postinstall`)
pnpm db:generate

# Local schema iteration (creates a new migration directory)
pnpm db:migrate:dev --name <change_description>
```

Tables (verified present):
```
markets
bets
rug_events
platform_stats
_prisma_migrations
```

**Uniqueness:** migration `20260509120000_markets_active_mint_duration_unique` adds a **partial unique index** on `markets (token_mint, duration)` where `status = 'active'`. Applying it fails if duplicate active rows already exist — dedupe first. `POST /v1/markets` treats `P2002` as idempotent when it can reload the active row; otherwise responds **409** `MARKET_CONFLICT`. Helius auto-create treats `P2002` as “already listed” and skips.

---

## 5. Helius webhook — Pump.fun (program `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`)

The API auto-registers the webhook on boot in `apps/api/src/routes/webhook.ts:registerHeliusWebhook()` when `HELIUS_API_KEY`, `HELIUS_WEBHOOK_URL`, and `HELIUS_WEBHOOK_AUTH_SECRET` are all set. For manual control we also ship a CLI:

```bash
cd apps/api

pnpm helius:list                      # list all webhooks under HELIUS_API_KEY
pnpm helius:register                  # create the Survive.fun webhook
pnpm helius:ensure                    # delete duplicates pointing at HELIUS_WEBHOOK_URL, then register
pnpm helius:delete <webhookID>        # remove a specific webhook
```

Watched events: `TOKEN_MINT`, `TRANSFER`. Account address: Pump.fun program `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`. Payload is verified server-side by comparing the raw `Authorization` header to `HELIUS_WEBHOOK_AUTH_SECRET` using `timingSafeEqual`.

Endpoints exposed for the same handler:
- `POST {BACKEND_URL}/webhook/helius`  (canonical)
- `POST {BACKEND_URL}/v1/webhook/helius`
- `POST {BACKEND_URL}/api/v1/webhook/helius`

---

## 6. Deployment — Railway (backend)

`apps/api/railway.json` already pins NIXPACKS, the workspace-aware build command, and the `/health` healthcheck.

**One-time setup (UI):**
1. New project → "Deploy from GitHub repo" → `Saurav4359/Survive.fun`.
2. Service settings → **Root directory** = `apps/api`.
3. Add the **Postgres** plugin and the **Redis** plugin → Railway will inject `DATABASE_URL` and `REDIS_URL` automatically (link them under "Variables → Reference").
4. Add the rest of the variables from §2 (Backend). Most importantly:
   - `BACKEND_URL` = the service's public URL (Settings → Domains → Generate Domain).
   - `HELIUS_WEBHOOK_URL` = `${BACKEND_URL}/webhook/helius`.
   - `CORS_ORIGIN` = `${FRONTEND_URL}` (set after Vercel domain is provisioned).
5. Deploy. After first deploy, run **once** from local against the Railway DB:
   ```bash
   DATABASE_URL='<railway-postgres-url>' pnpm --filter api db:migrate:deploy
   ```
   (Subsequent releases run it automatically because the build script generates the client and Railway preserves migration history.)

**One-time setup (CLI alternative):**
```bash
npm i -g @railway/cli
railway login
railway link
railway variables set HELIUS_API_KEY=...
railway variables set SURVIVEFUN_PROGRAM_ID=HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH
# …repeat for the rest of §2 backend table…
railway up
```

Verify after deploy:
```bash
curl https://<railway-domain>/health           # → {"ok":true}
curl https://<railway-domain>/v1/stats         # → success: true
```

---

## 7. Deployment — Vercel (frontend)

`apps/web/vercel.json` already pins the workspace install + Turbo build commands.

**One-time setup (UI):**
1. New project → import `Saurav4359/Survive.fun`.
2. **Root directory** = `apps/web`.
3. Framework preset = **Next.js**.
4. Add the four required `NEXT_PUBLIC_*` variables from §2 (Frontend) for **Production**, **Preview**, and **Development**.
5. Deploy.
6. After Vercel provisions a domain, copy it back into Railway as `FRONTEND_URL` and `CORS_ORIGIN` so Socket.IO and REST CORS allow it.

**One-time setup (CLI alternative):**
```bash
npm i -g vercel
cd apps/web
vercel login
vercel link
vercel env add NEXT_PUBLIC_API_URL production
vercel env add NEXT_PUBLIC_RPC_URL production
vercel env add NEXT_PUBLIC_PROGRAM_ID production
vercel env add NEXT_PUBLIC_USDC_MINT production
vercel --prod
```

---

## 8. CORS

`apps/api/src/index.ts` parses `CORS_ORIGIN` as a comma-separated list (trimmed, empty entries dropped).

- **Production (`NODE_ENV=production`):** the list must be **non-empty** or the process **exits**. Express and Socket.IO both use that explicit list only (no reflect-all, no `*`).
- **Development:** if `CORS_ORIGIN` is unset or empty, Express uses `origin: true` (reflect request origin) and Socket.IO uses `*` — convenient for local tooling only.

Set production values to the comma-joined union of your real frontends (e.g. `https://survive.fun`). For Vercel previews, either list preview hostnames explicitly when testing, or use a staging API with a wider allowlist — there is no single wildcard preview domain.

---

## 9. Full-flow verification checklist

After both deployments are live, run end-to-end:

```bash
# 1. Backend health
curl https://<railway-domain>/health

# 2. Frontend reachable + Solana wallet connect works
open https://<vercel-domain>

# 3. Helius webhook is registered
cd apps/api && pnpm helius:list

# 4. Place a fake bet from the UI; observe:
#    - bet_placed event in browser network tab (Socket.IO)
#    - INSERT INTO bets in Railway logs
#    - tx signature visible on https://explorer.solana.com/?cluster=devnet
```

---

## 10. Doc maintenance notes

Keep this file aligned with `apps/api/src/index.ts`, `apps/api/env.sample`, and `backend.md` when changing env vars, CORS, or migrations.

**Recent production hardening (surfaces to double-check on deploy):**

- Fail-fast if `NODE_ENV=production` and `SKIP_TX_VERIFICATION` / `ALLOW_DB_ONLY_MARKET_CREATE` are enabled, or if `CORS_ORIGIN` is empty.
- Partial unique index on active markets: migration `20260509120000_markets_active_mint_duration_unique`.
- If a one-off duplicate migration folder named `20260509140000_markets_active_mint_duration_partial_unique` ever existed in a clone, it duplicated the same index — remove it from the repo and use `prisma migrate resolve --rolled-back …` on any DB that recorded a failed apply.

### Known minor issue

`apps/api/src/index.ts` still logs `✅ Helius webhook registered` after `registerHeliusWebhook()` even when registration was skipped (missing env). Prefer tightening that log inside `registerHeliusWebhook()` when touching that code.

---
