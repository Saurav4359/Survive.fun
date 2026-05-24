# Survive.fun
<img width="2048" height="1173" alt="image" src="https://github.com/user-attachments/assets/df8808e0-8d1c-4c1f-8d93-0bacb4388a0a" />


On-chain prediction markets for Pump.fun memecoins. Bet USDC on **SURVIVE** or **RUG**; markets resolve from objective on-chain signals (dev dump, price collapse, liquidity pull, failed graduation) or when the timer ends.

> Pump.fun lets you buy the coin. Survive.fun lets you bet on whether it survives.

## How it works

1. Paste a Pump.fun token mint → market opens with a duration (1h / 6h / 24h).
2. Traders bet USDC on either side; odds come from the pooled stakes.
3. The API watches chain activity (Helius) and runs rug-detection rules.
4. On **RUG** or **SURVIVE**, winners split the losing side; payouts settle on Solana (Anchor).

## Stack

| Layer | Tech |
|-------|------|
| Web | Next.js 14, Phantom, Socket.IO |
| API | Express, Prisma, Postgres, Redis (BullMQ) |
| Chain | Solana devnet, Anchor, USDC |
| Monorepo | pnpm + Turborepo |

## Repo layout

```
apps/web/          Next.js frontend (port 3000)
apps/api/          Express API + Prisma (port 3001)
contracts/         Anchor program
packages/types/    Shared TypeScript types
packages/solana-pda/
```

## Prerequisites

- Node.js ≥ 20
- [pnpm](https://pnpm.io) 9.15.4 (`corepack enable` or `npx pnpm@9.15.4`)
- Docker (for local Postgres + Redis)

## Local setup

```bash
pnpm install
pnpm docker:up

cp apps/api/env.sample apps/api/.env
cp apps/web/env.sample apps/web/.env.local

pnpm db:migrate:dev   # or: cd apps/api && pnpm db:push
pnpm dev              # web :3000 + api :3001
```

Open [http://localhost:3000](http://localhost:3000).

**Env:** defaults in `apps/api/env.sample` and `apps/web/env.sample` work for local dev. For on-chain bets and resolution you need `PLATFORM_WALLET_SECRET_KEY`, Helius keys, and a deployed program id (see `contracts/contract.md`).

**Demo (DB-only, no chain):** set `ALLOW_DB_ONLY_MARKET_CREATE=true` in `apps/api/.env`, then `pnpm setup-demo`.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run web + API |
| `pnpm build` | Production build |
| `pnpm test` | API unit tests |
| `pnpm test-contracts` | Anchor tests |
| `pnpm docker:up` / `docker:down` | Postgres + Redis |
| `pnpm db:migrate:dev` | Apply Prisma migrations |
| `pnpm db:studio` | Prisma Studio |
| `pnpm setup-demo` | Seed demo markets |

**Contracts**

```bash
cd contracts && anchor build && anchor test
```

## Further reading

- [`Spec.md`](./Spec.md) — full product & technical spec
- [`devops.md`](./devops.md) — deployment & production env
- [`contracts/contract.md`](./contracts/contract.md) — program IDs & deploy notes
