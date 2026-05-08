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
| **`CORS_ORIGIN`** | ✅ | Express cors | Comma-separated list, set to `${FRONTEND_URL}` (and any preview origins). |
| **`HELIUS_WEBHOOK_URL`** | ✅ | webhook bootstrap | `${BACKEND_URL}/webhook/helius` — must be public HTTPS. |
| **`HELIUS_WEBHOOK_AUTH_SECRET`** | ✅ | webhook auth | Long random string. Helius sends it as `Authorization` header; API verifies via `timingSafeEqual`. |
| `HELIUS_NETWORK` | optional | rug detector | `mainnet` (default) or `devnet`. |
| `AUTO_MARKET_CREATOR_WALLET` | optional | webhook auto-create | Wallet recorded as creator on Pump.fun TOKEN_MINT auto-markets. |
| `BIRDEYE_API_KEY` | optional | OHLCV chart, graduation rule | Improves charts; not required. |
| `PORT` | optional | Express | Railway sets this automatically; default `3001`. |
| `NODE_ENV` | optional | Prisma logging | Set to `production` on Railway. |

> **Local-only flags** (must NOT be set in production): `ALLOW_DB_ONLY_MARKET_CREATE=true`, `SKIP_TX_VERIFICATION=true`.

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

`apps/api/src/index.ts` reads `CORS_ORIGIN` (comma-separated). Set it to the comma-joined union of:
- production frontend (`https://survive.fun`)
- Vercel preview origin pattern (Vercel does not expose a single hostname for previews — either disable previews via `vercel.json`, or temporarily widen `CORS_ORIGIN` while testing a preview).

The Socket.IO server uses the same list (or `*` if unset).

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

## 10. Session checklist (this run)

| Item | Status |
|------|--------|
| Frontend URL | _not deployed in this session_ |
| Backend URL | _not deployed in this session_ |
| Program ID | `HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH` (devnet, from `contracts/Anchor.toml`) |
| Helius Webhook ID | _not registered — `HELIUS_WEBHOOK_URL` empty (no public BACKEND_URL yet)_ |
| All envs set | partial — see notes |
| Full flow working | local-only (HTTP `/health`, `/v1/stats`, `/v1/markets/active` returned 200 against local Postgres + Redis) |

### What was done this session

- Read `apps/api/env.sample`, `apps/web/env.sample`, `apps/api/.env`, `contracts/Anchor.toml`, `apps/api/prisma/schema.prisma`, `backend.md`.
- Reconciled spec env names (`PROGRAM_ID`, `PLATFORM_WALLET_SECRET`, `SOLANA_RPC`) with the names the code actually reads (`SURVIVEFUN_PROGRAM_ID`, `PLATFORM_WALLET_SECRET_KEY`, `SOLANA_RPC_URL`); added the spec aliases as comments + dual entries in both env.sample files.
- Added `BACKEND_URL`, `FRONTEND_URL`, `USDC_MINT_DEVNET` to `apps/api/env.sample` and `NEXT_PUBLIC_USDC_MINT` to `apps/web/env.sample`.
- Created `apps/web/.env.local` for local dev.
- Updated `apps/api/.env` with the full required-var set (placeholders for secrets).
- Added scripts to `apps/api/package.json`: `helius:list`, `helius:register`, `helius:ensure`, `helius:delete`, `db:migrate:deploy`, `db:migrate:dev`, `db:generate`, `db:push`.
- Wrote `apps/api/src/scripts/helius-webhook.ts` (list / register / ensure / delete; auto-loads `apps/api/.env`).
- Verified Helius API key is valid (`pnpm helius:list` succeeded — no webhooks currently registered, expected because `HELIUS_WEBHOOK_URL` is unset).
- Created the initial Prisma migration `apps/api/prisma/migrations/20260509000000_init/migration.sql` from the schema, baseline-resolved it against the existing local DB, then ran `prisma migrate deploy` and `prisma generate`. All four expected tables (`markets`, `bets`, `rug_events`, `platform_stats`) verified via `psql \dt`.
- Booted the API on a free port (`PORT=3099`) and verified `/health`, `/v1/stats`, `/v1/markets/active` all return 200 with valid Prisma queries against the local DB.
- API typecheck (`pnpm --filter api typecheck`) passes.

### What still needs the user

The following require credentials / public infra that this session does not have:

1. **Generate / paste a `PLATFORM_WALLET_SECRET_KEY`** (JSON byte-array of a Solana keypair holding devnet SOL). Required for on-chain `resolve_market`.
2. **Provision Railway** (Postgres + Redis plugins + service for `apps/api`); copy the public domain into `BACKEND_URL` and `HELIUS_WEBHOOK_URL`.
3. **Provision Vercel** (`apps/web`) with the four `NEXT_PUBLIC_*` vars; copy the public domain into `FRONTEND_URL` and `CORS_ORIGIN` on Railway.
4. After both URLs exist, run `pnpm --filter api helius:register` (or `helius:ensure`) — record the returned `webhookID` back here.
5. Free local port 3001 (Next.js dev server is currently bound to it; the API can't bind alongside it). Either kill the orphan `next-server` (PID was 54751 during this session) or run the web app on its default 3000 explicitly.

### Known minor issue (out of devops scope, flagged for backend agent)

`apps/api/src/index.ts:96-97` logs `✅ Helius webhook registered` even when `registerHeliusWebhook()` skips registration (missing env). Logging is unconditional inside the `then`. Consider moving the log inside `registerHeliusWebhook()` so it only fires on actual creation.

---

## END-OF-SESSION SUMMARY

```
Frontend URL:        (not deployed this session — Vercel setup pending)
Backend URL:         (not deployed this session — Railway setup pending)
Program ID:          HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH
Helius Webhook ID:   (not registered — needs public BACKEND_URL first)
All envs set:        no   (need PLATFORM_WALLET_SECRET_KEY, HELIUS_WEBHOOK_URL, HELIUS_WEBHOOK_AUTH_SECRET, BACKEND_URL, FRONTEND_URL, CORS_ORIGIN)
Full flow working:   no   (local backend ✅ verified end-to-end against Postgres + Redis; deploys not executed)
```
