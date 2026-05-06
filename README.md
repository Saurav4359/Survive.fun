# Survive.fun

Turborepo monorepo: `apps/web` (Next.js 14), `apps/api` (Express), `packages/types`, and `contracts/` (Anchor).

## Commands

```bash
pnpm install
pnpm dev        # web + api (+ builds @survivefun/types first)
pnpm build
```

Anchor (from `contracts/`):

```bash
cd contracts && anchor build
```

Use `npx pnpm@9.15.4` if `pnpm` is not installed globally.
