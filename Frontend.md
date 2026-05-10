# Frontend.md — Survive.fun Web App

Single source of truth for the `apps/web` frontend: what it does, how it's
built, and exactly which file is responsible for each behavior.

> **Design DNA** — pure black `#000000` + lime `#cdf078` only. Zero
> gradients, zero purple *decoration*, zero white backgrounds. **Exception:**
> SOL glyph/badge `#9945FF` only (brand accent on ◎). Space Grotesk for display,
> JetBrains Mono for every number. Sharp, precise, intentional.

---

## 1. Tech Stack

### Core framework

| Tool                                | Version  | Why it's here                                                                           |
| ----------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| **Next.js**                         | `14.2.x` | App Router, RSC + client components, SSG/ISR for static pages, dynamic for `/market/:id`. |
| **React**                           | `18.3.x` | Concurrent rendering, `useSyncExternalStore` for socket store.                         |
| **TypeScript**                      | `5.9.x`  | `strict` everywhere; types shared from `@survivefun/types` workspace package.          |
| **Node**                            | `>=20`   | pnpm 9.15.4 monorepo via Turborepo.                                                     |

### Styling

| Tool                | Use                                                                |
| ------------------- | ------------------------------------------------------------------ |
| **TailwindCSS 3.4** | Utility-first layout + design tokens via CSS variables.            |
| **shadcn/ui**       | Base primitives (Button), composable into the strict palette.      |
| **clsx + tailwind-merge** | `cn()` helper at `src/lib/utils.ts`.                          |
| **CSS variables**   | Single palette in `globals.css` so shadcn semantic tokens stay in sync. |

### Animation & 3D

| Tool                | Use                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------- |
| **framer-motion 12** | Every interaction (hover, tap, page transitions, slide-in feeds, layoutId underline tabs).  |
| **three.js 0.184**  | 3D layer: hero `ParticleField` and `LeaderboardHeader3D` (lazy-loaded via dynamic import).   |
| **lightweight-charts 4.2** | Price chart on Market Detail (lime line, pure black bg, custom crosshair).            |
| **lucide-react**    | Every icon. No emojis baked into JSX.                                                        |

### Data & realtime

| Tool                                | Use                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| **TanStack Query 5**                | All server state (markets, stats, bets, token metadata from API, DexScreener bulk pairs). |
| **socket.io-client 4.8**            | Real-time `bet_placed`, `pool_update`, `market_resolved` events from API.                 |
| **zustand 5**                       | Tiny client state — currently `marketSearchStore` (search query shared between TopBar + HomePage). |
| **axios 1.12**                      | A few outbound API calls (most still use `fetch`).                                        |

### Solana / wallet

| Tool                                                                                          | Use                                                              |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **@solana/wallet-adapter-react** + **react-ui** + **phantom** + **base**                       | Phantom-only MVP: modal, `autoConnect`, devnet `ConnectionProvider`. |
| **@solana/web3.js 1.98**                                                                      | RPC client, `Transaction`, `PublicKey`, error mapping.            |
| **@solana/spl-token 0.4**                                                                     | Present in deps; **bet collateral is native SOL only** (no SPL stake path in UI). |
| **@coral-xyz/anchor 0.31**                                                                    | `BN` for u64 encoding of instruction data.                        |

### Build / quality

- `pnpm` workspaces + `turbo` orchestration.
- ESLint via `eslint-config-next` (zero warnings on green).
- `tsc --noEmit` typecheck (zero errors on green).

---

## 2. Visual System

All tokens live as CSS variables in `apps/web/src/app/globals.css` and are
exposed to Tailwind in `apps/web/tailwind.config.ts`.

### Palette

| Token            | Value                          | Tailwind class              | Used for                          |
| ---------------- | ------------------------------ | --------------------------- | --------------------------------- |
| `--bg`           | `#000000`                      | `bg-bg`                     | Page background, sidebar, topbar  |
| `--bg-surface`   | `#0a0a0a`                      | `bg-surface`                | Inset wells, chart fallback bg    |
| `--bg-card`      | `#111111`                      | `bg-card`                   | Cards, panels, popovers           |
| `--border`       | `#1a1a1a`                      | `border-border`             | Default 1px borders               |
| `--border-accent`| `rgba(205,240,120,0.125)` (`#cdf07820`) | `border-border-accent` | Subtle lime hint divider          |
| `--accent`       | `#cdf078`                      | `text-accent` / `bg-accent` | Lime — sole accent color          |
| `--survive`      | `#cdf078`                      | `text-survive`              | SURVIVE side                      |
| `--rug`          | `#ef4444`                      | `text-rug`                  | RUG side                          |
| `--warning`      | `#facc15`                      | `text-warn`                 | Medium-risk badge                 |
| `--text`         | `#ffffff`                      | `text-white`                | Primary text                      |
| `--text-soft`    | `#a3a3a3`                      | `text-fg-soft`              | Secondary text                    |
| `--text-muted`   | `#525252`                      | `text-fg-muted`             | Tertiary / labels                 |
| `--on-accent`    | `#000000`                      | `text-ink`                  | Black text on lime button         |
| `--glow`         | `rgba(205,240,120,0.22)`       | `shadow-glow*`              | Glow shadows (no gradients)       |

Three custom shadow tokens ship lime glows without any gradient fill:
`shadow-glow-sm` (16px), `shadow-glow` (28px + 1px ring), `shadow-glow-lg` (48px).

### Typography

- **Display** — Space Grotesk via `next/font/google`, exposed as `--font-display`.
  Mapped to Tailwind `font-sans` and `font-display`.
- **Mono** — JetBrains Mono via `next/font/google`, exposed as `--font-mono`.
  Mapped to Tailwind `font-mono`. **All numbers, prices, timers, mints, wallet
  truncations** use `font-mono` + `tabular-nums` so digits never jitter.

Both are loaded with `display: "swap"` and weights `400/500/600/700`.

### Borders / radii

Sharp, terminal-grade corners: `2px / 4px / 6px / 8px / 12px`. Most cards
intentionally use the default `4px` or no radius for the trading-terminal feel.

### Animation primitives

`apps/web/src/app/globals.css` defines two utilities used everywhere:

- `.glow-lime` / `.glow-lime-soft` — solid box-shadow rings (no gradients).
- `.pulse-rug` — 1s opacity pulse used on timers under 5 minutes.

Plus `.hide-scrollbar` for the trending strip and feed lists.

---

## 3. App Shell & Routing

### Root layout — `src/app/layout.tsx`

- Loads Space Grotesk + JetBrains Mono via `next/font/google` and binds them
  to `--font-display` / `--font-mono` on `<html>`.
- Forces `dark` class so shadcn semantic tokens resolve to our palette.
- Wraps everything in `<Providers>` then `<AppShell>`.
- Sets metadata: `survive.fun — rug or survive`.

### Providers — `src/app/providers.tsx`

Single client boundary that mounts **in this order**:

1. `ConnectionProvider` — endpoint `NEXT_PUBLIC_RPC_URL` or devnet `clusterApiUrl` (must match `RPC_URL` / transaction helpers).
2. `WalletProvider` — `wallets = [new PhantomWalletAdapter()]`, `autoConnect`, `onError` → wallet toasts (skips send/sign tx duplicates).
3. `WalletModalProvider` — wallet modal (themed in `globals.css`).
4. `QueryClientProvider` — TanStack Query, default `staleTime: 30_000ms`.
5. `ToastProvider` — framer-motion toasts + **`WalletToastBridge`** (listens for adapter-level wallet errors).

Reference **`wallet-adapter`** monorepo was vendored for alignment, then **removed** after migration (see §17 session log).

### AppShell — `src/components/layout/AppShell.tsx`

- Fixed **240px** left sidebar on `lg` (≥1024px), animated in with framer
  (`x: -32 → 0`, `opacity: 0 → 1`, custom cubic-bezier).
- Below `lg`, sidebar collapses into a left drawer triggered by the topbar
  hamburger. Drawer + scrim use `AnimatePresence` (slide-in from `-100%`,
  scrim fades).
- Main column has `lg:pl-[240px]` and contains `<TopBar>` + `<main>`.

### Routing map (App Router)

| Route              | File                                  | Mode                               |
| ------------------ | ------------------------------------- | ---------------------------------- |
| `/`                | `src/app/page.tsx`                    | Static (homepage / hero / markets) |
| `/market/[id]`     | `src/app/market/[id]/page.tsx`        | Dynamic SSR (per-market detail)    |
| `/bets`            | `src/app/bets/page.tsx`               | Static (My Bets dashboard)         |
| `/leaderboard`     | `src/app/leaderboard/page.tsx`        | Static                             |
| `/live-rugs`       | `src/app/live-rugs/page.tsx`          | Static                             |
| `/live`            | `src/app/live/page.tsx`               | Static                             |
| `/profile`         | `src/app/profile/page.tsx`            | Static                             |
| `/chat`            | `src/app/chat/page.tsx`               | Static (placeholder)               |

Every page that can throw has a sibling `error.tsx` (`/`, `/bets`,
`/market/[id]`) — themed with framer-motion fade-in and a single "Try again"
button.

---

## 4. Sidebar & TopBar

### `src/components/layout/SidebarNav.tsx`

- Logo: `Skull` lucide icon in lime + "survive`.fun`" wordmark (`.fun` lime).
- Nav items use `lucide-react` (Home, Skull, Flame, User, Trophy, Zap) — **no
  emojis**.
- Active state: lime 3px left border + lime icon + lime text + `#0a0a0a` bg.
- Hover state: framer animates a 1px lime bar from `x: -100% → 0` on the left
  edge, plus background fades to `#0a0a0a`.
- Bottom section:
  - `+ Create Market` lime button (`bg-accent text-ink`), framer
    `whileHover: scale 1.02` + `whileTap: scale 0.98`.
  - Holdings card (**SOL balance** + truncated wallet) sourced from
    `useWalletBalances`.

### `src/components/layout/TopBar.tsx`

- Sticky `top-0`, 56–64px tall.
- Search input writes to a zustand store (`marketSearchStore`) so the home
  page filters markets reactively as you type. Input gets
  `focus:border-accent focus:shadow-glow-sm` (the lime glow on focus).
- Right side: `<WalletConnectButton>` only — outlined lime when disconnected;
  when connected, truncated address + **◎ SOL** (4 dp) with dropdown (copy /
  switch wallet / disconnect).

### Mobile

- TopBar shows a `Menu` button only `<lg`, which opens the sidebar drawer.
- All grids collapse to single column at `375px` minimum width.

---

## 5. Three.js Layer

### `src/components/three/ParticleField.tsx`

Hero background on the homepage.

- Lazy-loaded via `await import("three")` inside `useEffect` so `three` ships
  only to the client.
- 200 particles distributed on a spherical shell (`r = 2 + rand*4`), pure
  lime (`0xcdf078`), `size: 0.04`, `transparent + depthWrite: false`.
- Continuous slow rotation (`y: t * 0.04`) plus mouse parallax (`x/y` lerped
  toward normalized cursor coords with `0.04` ease).
- `ResizeObserver` keeps the renderer in sync with the container.
- Cleans up `renderer.dispose()`, geometry/material disposal, RAF cancel,
  mousemove listener, and removes the canvas on unmount.
- Uses `setClearColor(0x000000, 0)` so the canvas is transparent over the
  page's pure black.

### `src/components/three/LeaderboardHeader3D.tsx`

3D pixel-font "LEADERBOARD" wordmark on `/leaderboard`.

- Builds each character from cubes using a tiny pixel-font map.
- Cubes are lime (`MeshBasicMaterial 0xcdf078`), wrapped in a translucent
  lime wireframe (`LineBasicMaterial`, opacity 0.55).
- Slow oscillation: `rotation.y = sin(t*0.4)*0.4`, `rotation.x = sin(t*0.3)*0.1`.
- Same lazy-load + dispose lifecycle as `ParticleField`.

---

## 6. Pages — What Each One Does

### Homepage — `src/app/page.tsx`

```
[ Hero w/ ParticleField ]
[ Trending strip ] [ Create Market form ]
[ Stats bar (4) ]
[ Filter tabs ]
[ Markets grid (3 col) ]   [ Live Feed ]
```

- **Trending strip** — horizontal scroll of pill cards sorted by total pool;
  uses `hide-scrollbar`. Each pill links to `/market/:id`.
- **Create market form** — Pump.fun mint input (lime border on focus, glow
  shadow), three duration pills `[1H] [6H] [24H]` backed by
  `MARKET_DURATIONS = [3600, 21600, 86400]`. **Duplicate guard:** while mint +
  duration resolve, **`GET /v1/markets?tokenMint=&durationSeconds=&limit=1`**;
  if a row exists, show “Market already exists” + **View market →** and disable
  create. Submit runs **`createMarket` on chain first** (`utils/transactions.ts`,
  PDA seeds include duration), then **POST `/v1/markets`** with
  `createMarketTxSignature` and `currency: "sol"`.
- **Stats bar** — 4 cards (Active Markets, Total Volume, Rugs Caught, Biggest
  Win). Each number wrapped in `<CountUp>` for animated rollup on mount.
- **Filter tabs** — `🔥 Hot` / `💀 High Risk` / `✅ Likely Survive` / `⚡ New`
  / `⭐ Watch`. Active indicator uses framer `layoutId="filter-pill"` so the
  underline slides between tabs. Logic in `applyFilter()`.
- **Markets grid** — `MarketCard` × N with staggered fade+slide entry
  (`staggerChildren: 0.06`). Search query from zustand filters by name /
  ticker / mint.
- **Live Feed** — sticky right column on `xl`, full width below.

Loading state uses `Skeletons` (`src/components/ui/skeletons.tsx`) — flat
`bg-surface` blocks with `animate-pulse`, no gradients.

Empty / error state via `<EmptyState>` with framer button hover/tap.

### Market Detail — `src/app/market/[id]/page.tsx`

Two-column layout (60/40 on `lg`):

**Left (60%)**
- **Header**: token avatar (first letter on a black square, lime border),
  name, ticker, large mono price, 24h change colored lime/rug, risk pill,
  `[⭐ Watch]` button toggling `useWatchlist`.
- **Price chart** — `lightweight-charts` line series, lime stroke
  `#cdf078`, pure black background, `#1a1a1a` grid + crosshair, custom mono
  font in axis labels. OHLCV comes from **`GET /v1/markets/:id/chart`**
  (Birdeye when configured on the API). Timeframe pills `5m / 15m / 1h` select
  the interval.
- **Signals row** — Liquidity, Token age, Bettors (from market record). Each
  signal is a `motion.div` with staggered `delay = index * 0.07`. A footnote
  can mention holder metrics when the backend has Birdeye enabled.
- **Tabs**: About / Holders / Transactions. Active underline uses
  `layoutId="market-tab"`. Content swaps with framer fade.

**Right (40%, sticky on `lg`)**
- **Timer card** with circular SVG progress ring (`<ProgressTimerRing>`,
  framer-animated `strokeDashoffset`). Timer value goes lime → rug + pulses
  under 5 minutes.
- **Pool card** — animated `<PoolBar>` ratio + total pool + bettor count.
- **Bet panel** (see §7 below).
- **Your position** card (only if user has bet).

**Below, full width** — `<LiveFeed>` scoped to this `marketId`.

### My Bets — `src/app/bets/page.tsx`

- 4 summary cards: Total Bet, Won, Win Rate, Open. All numbers via
  `<CountUp>`.
- Filter tabs: `[All] [Active] [Won] [Lost]` with `layoutId` underline.
- Bets table: black bg, 1px `#1a1a1a` borders, monospace amounts, lime
  outlined `SURVIVE` and rug outlined `RUG` badges. Won rows expand to a
  small subtable with claim payout button (calls `claimPayout` on chain).
- Rows enter staggered (`framer-motion stagger`).

### Leaderboard — `src/app/leaderboard/page.tsx`

- Three.js 3D `LEADERBOARD` header (slow rotation).
- Tabs: `Top Winners | Top Rug Callers | Biggest Payouts` — `layoutId`
  underline. Data from **`useLeaderboard`** → `GET /v1/leaderboard?tab=…`
  with loading / error / empty states.
- Table: `Rank | Wallet | Won | Win Rate | Best`. #1 row highlight, rank
  coloring (#1 lime, #2 white, #3 soft, rest muted). Rows animate in with
  stagger.

### Live Rugs / Live / Profile / Chat

Refactored to the strict theme — header animates in with framer, content
either renders `MarketCard`s (live / live-rugs filtered subsets) or simple
placeholder copy in pure-black panels.

### Error pages

`src/app/error.tsx`, `src/app/bets/error.tsx`, `src/app/market/[id]/error.tsx`
all share the same shape: rug-bordered card, `AlertTriangle` icon, mono
error message, "Try again" button (framer `whileTap: 0.97`).

---

## 7. Component Library (`src/components`)

### Trading-specific

| File                     | Responsibility                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `MarketCard.tsx`         | Token avatar, **◎ SOL** collateral badge, risk badge, USD token **price** via `formatUsd`, `<PoolBar>` (lamports), SURVIVE/RUG pool lines via `formatPoolTotals`, timer, "Bet" CTA. `whileHover: scale 1.01`, `hover:shadow-glow-sm`. |
| `PoolBar.tsx`            | Animated SURVIVE/RUG ratio bar. `motion.div` width animates from 0 → target with cubic-bezier. Labels are mono, side-coded lime/rug. |
| `Timer.tsx`              | Live HH:MM:SS countdown using `setInterval`. Lime when active → rug + `.pulse-rug` under 5m → `text-fg-muted` when ended. `suppressHydrationWarning` for SSR. |
| `BetPanel.tsx`           | **SOL-only** collateral: header “Place a bet ◎ SOL”, balance from `useWalletBalances`, amount **0.01–10 SOL** with quick picks `QUICK_SOL_AMOUNTS`, inline validation (min/max/wallet), payout preview (`potentialPayoutLamports` + `formatSolBetLine`). On-chain bet uses Anchor `place_bet` (native transfer inside program). Props: `{ market, onBet(side, amountSolUi), position?: { side, stakeSol } }`. |
| `LiveFeed.tsx`           | `socket.io-client` listener for `bet_placed`. New rows slide in from top via `AnimatePresence`, side-coded lime/rug left border, fade-out after 30s. Optionally scoped to a `marketId`. |
| `RiskScore.tsx`          | Risk panel with HIGH/MEDIUM/LOW badge + Dev held / Liquidity / Token age stats. Logic in `utils/marketRisk.ts`. |
| `WalletConnectButton.tsx`| **`next/dynamic` client-only** wrapper around `WalletConnectButtonInner.tsx`: Connect Wallet → modal; Connecting…; connected → truncated address + ◎ SOL (4 dp) + dropdown (copy / switch / disconnect). |
| `WalletToastBridge.tsx` | Subscribes to `survive:wallet-toast` for `WalletProvider` `onError` messages. |
| `WalletBalancePanel.tsx` | Big balance card (**◎ SOL** primary, copy address pill, deposit/withdraw/buy/history grid, view on Solscan, switch / disconnect). |

### Animation utilities

| File                  | What it does                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `CountUp.tsx`         | `useInView` + framer `animate(motionVal, to, …)` driving a `useTransform` formatted span. Supports `prefix`, `suffix`, `decimals`, `format`, `delay`. |
| `EmptyState.tsx`      | Themed empty / error placeholder with framer button hover/tap.                              |
| `ToastProvider.tsx`   | Toast stack (success / error / info) with framer slide-in. Also renders the **fullscreen lime/rug flash** on `market_resolved` events. |

### Layout

| File                       | What it does                                                                  |
| -------------------------- | ----------------------------------------------------------------------------- |
| `layout/AppShell.tsx`      | Fixed sidebar + topbar + main column + mobile drawer.                         |
| `layout/SidebarNav.tsx`    | Sidebar contents — logo, nav, create-market button, holdings.                 |
| `layout/TopBar.tsx`        | Search + connect/balance dropdown.                                            |
| `layout/TrendingMarketsStrip.tsx` | Reusable horizontal token strip (variant of the homepage strip).       |

### Three.js

| File                                  | What it does                                              |
| ------------------------------------- | --------------------------------------------------------- |
| `three/ParticleField.tsx`             | Lime particles, mouse parallax, hero background.          |
| `three/LeaderboardHeader3D.tsx`       | 3D pixel-font wordmark with slow rotation.                |

### shadcn / primitives

| File                            | What it does                                                              |
| ------------------------------- | ------------------------------------------------------------------------- |
| `components.json`               | shadcn registry config (style: new-york, base: zinc, css vars).           |
| `ui/button.tsx`                 | shadcn Button — variants `default | destructive | outline | secondary | ghost | link`. |
| `ui/skeletons.tsx`              | Flat `bg-surface` skeletons with `animate-pulse` for loading states.       |
| `lib/utils.ts`                  | `cn()` = `twMerge(clsx(...))`.                                            |

---

## 8. Hooks (`src/hooks`)

| Hook                       | Returns                                                                | Source                                     |
| -------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| `useMarkets`               | Active markets list                                                    | `GET /v1/markets/active` via TanStack      |
| `useMarket(id)`            | Single market detail                                                   | `GET /v1/markets/:id`                      |
| `useToken(mint)`           | Normalized token + primary pair (price, liquidity, etc.)                 | `GET /v1/tokens/:mint`                     |
| `useLeaderboard(tab)`      | Ranked wallets for winners / rug-callers / biggest-payouts              | `GET /v1/leaderboard?tab=…`               |
| `useMarketBetsList(id)`    | All bets for a market                                                  | `GET /v1/markets/:id/bets`                 |
| `useMarketPairsMap`        | Bulk DexScreener pair lookup keyed by mint                             | DexScreener                                |
| `useUserBets(wallet)`      | Bets placed by a wallet                                                | `GET /v1/users/:wallet/bets`               |
| `useStats`                 | Platform-wide aggregate stats                                          | `GET /v1/stats`                            |
| `useWalletBalances`        | `{ lamports, sol }` via `connection.getBalance(publicKey)`; **`solToDisplay(lamports)`** (4 dp); **30s refresh** via `useEffect` + `query.refetch` | TanStack Query + interval |
| `useSolUsdPrice`           | `{ usd, isLoading, error }` — SOL→USD from CoinGecko `simple/price`     | TanStack Query, 60s stale                    |
| `useWatchlist`             | localStorage-backed star/unstar list                                   | Local                                      |
| `useWebSocket`             | Per-market scoped snapshot — `{ isConnected, latestBet, poolUpdate, marketResolved, subscribeToMarket }`. Only events for the subscribed market populate the snapshot. | shared singleton |
| `useWebSocketEvents`       | Global callbacks `{ onBetPlaced?, onPoolUpdate?, onMarketResolved? }` that fire for **every** validated event, ref-stable handlers. | shared singleton |
| `useMarketsLiveSync`       | Patches `marketsQueryKey` and any hot `marketQueryKey(id)` cache slices in place from socket events so all pages stay live without polling. Mounted once at the provider root. | wraps `useWebSocketEvents` |

Every TanStack query exports a `…QueryKey` constant so mutations can
`queryClient.invalidateQueries()` against the right cache slice.

### Realtime architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Providers (root)                                             │
│   QueryClientProvider                                        │
│     ToastProvider           ← useWebSocketEvents (resolve flash)
│       <GlobalSocketSync>    ← useMarketsLiveSync (cache patch)
│         …pages…                                              │
│           useMarket(id)     ← useWebSocket per-market snap   │
│           LiveFeed          ← useWebSocketEvents(onBetPlaced)│
│                                                              │
│ All consumers share ONE refcounted socket.io connection.     │
└─────────────────────────────────────────────────────────────┘
```

`bet_placed` / `pool_update` / `market_resolved` mutate the right TanStack
caches in place, the live feed slides new rows in, and the fullscreen lime
or rug flash plays — all from a single underlying socket.

---

## 9. State Stores (`src/stores`)

- **`marketSearchStore.ts`** — zustand store: `{ query: string; setQuery }`.
  TopBar writes; HomePage reads + filters. Keeps the URL clean and avoids
  prop drilling.

(More zustand stores can plug in here as needed — `useWebSocket` itself uses
a hand-rolled singleton + `useSyncExternalStore`, not zustand.)

---

## 10. On-Chain Wiring (`src/utils/transactions.ts`)

The frontend talks to the Anchor program (`HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH`
in dev, override via `NEXT_PUBLIC_PROGRAM_ID`):

- **`createMarket(wallet, mint, duration)`** — Anchor `create_market` with
  PDA seeds **`[b"market", mint, duration_le]`**, platform seeds **0.01 SOL per side**
  into the market vault. Validates duration is in `MARKET_DURATIONS`. The homepage
  mutation submits this first, then **POST `/v1/markets`** with the returned
  signature so the indexer persists the market.
- **`placeBet(wallet, params)`** — `PlaceBetParams`:
  `{ marketPda, side, amount, marketId? }` with **`amount`** = human SOL (e.g. `0.25`).
  Builds a legacy `Transaction` with `getLatestBlockhashAndContext`, confirms after
  **`wallet.sendTransaction`** (`minContextSlot`). With **`marketId`** set, after confirmation
  POSTs **`/v1/markets/:id/bets`** (`currency: "sol"`, `amount` lamports, `txSignature`, `walletAddress`) — camelCase matches `apps/api`.
- **`src/idl/survivefun.json`** — copy of `contracts/target/idl/survivefun.json`
  for Anchor method builders; regenerate when the program changes.
- **`claimPayout(wallet, marketPda, betPda, opts?)`** — Anchor `claim_payout` ix;
  same send/confirm path as other helpers. With **`opts.betId`**, POST **`/v1/bets/:id/claim`**
  (`txSignature`, `walletAddress`) after confirmation.
- **Error mapping** — `mapCaughtSendError` maps adapter errors (connect wallet / cancelled /
  insufficient / network) for UI toasts; RPC/program failures still use `mapSendError` +
  optional simulation logs for vague wallet errors.

---


## 11. Configuration

### Environment (`apps/web/env.sample`)

| Variable                          | Default                       | Purpose                                        |
| --------------------------------- | ----------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_RPC_URL`             | devnet via `clusterApiUrl`    | Solana RPC endpoint                            |
| `NEXT_PUBLIC_API_URL`             | `http://localhost:3001`       | Backend origin (Socket.IO + REST host)         |
| `NEXT_PUBLIC_API_V1_PREFIX`       | `/v1`                         | REST prefix; use `/api/v1` if the server mounts routes there |
| `NEXT_PUBLIC_PROGRAM_ID`          | `HB3uE5...` (dev)             | Anchor program id                              |
| `NEXT_PUBLIC_PLATFORM_AUTHORITY`  | unset (falls back to creator) | Platform authority for seeded SOL create flow   |

### Constants (`src/utils/constants.ts`)

- `API_URL`, `API_V1_PREFIX`, **`apiV1Url(path)`** — full REST URLs, e.g.
  `apiV1Url("/markets/active")` → `{API_URL}{prefix}/markets/active`.
- `ONCHAIN_MIN_STAKE_RAW` / `ONCHAIN_MAX_STAKE_RAW` — **10_000_000 … 10_000_000_000**
  lamports (**0.01 – 10 SOL**), matching the program.
- `SOL_BET_LIMITS` / `QUICK_SOL_AMOUNTS` — human SOL bounds and quick picks
  aligned to on-chain min/max.
- `MARKET_DURATIONS = [3600, 21600, 86400]` seconds = 1H / 6H / 24H

### Format helpers (`src/utils/format.ts`)

- `formatUsd` — fiat `$X,XXX.XX` for **token USD prices / liquidity**, not stake collateral
- `formatSOL` / `formatSOLDisplay` / `formatSolBetLine` — lamports or ◎ SOL stake lines
- `formatSolAmount` — adaptive decimals (misc)
- `formatWallet` — `abcd…wxyz`
- `formatTimeLeft` — `Xd Xh Xm Xs` for human times
- `formatPool` — compact (`12.5K`, `2.4M`) for tight grid cells
- `potentialPayoutLamports` — parimutuel gross preview (SOL pools)
- `parsePoolLamports` — integer pool strings → `bigint` for SOL markets

---

## 12. Animation Spec — Implementation Map

| Spec                                            | Where                                                       |
| ----------------------------------------------- | ----------------------------------------------------------- |
| Sidebar slides in from left (0.3s)              | `AppShell.tsx` `motion.aside initial x:-32`                 |
| Stats count up (0.8s delay)                     | `<CountUp delay={…}>` on home stats bar                     |
| Cards fade + slide up staggered (0.1s)          | Home grid / My Bets rows / Leaderboard rows                 |
| All buttons: `scale(0.97)` on click             | `motion.button whileTap={{ scale: 0.97 }}`                  |
| Cards: `scale(1.01)` on hover                   | `MarketCard` `whileHover={{ scale: 1.01 }}`                 |
| Tabs: slide indicator (framer layout)           | `layoutId="filter-pill" / "market-tab" / "bets-tab"`        |
| Bet toggle: spring animation                    | `BetPanel.tsx` `transition={{ type: "spring", stiffness, damping }}` |
| New bets in feed: slide from top + fade in      | `LiveFeed.tsx` `AnimatePresence + initial y:-16`            |
| Market resolve: full screen flash               | `ToastProvider.tsx` lime/rug solid overlay on `market_resolved` |
| Pool updates: number rolls up/down              | `<CountUp>` re-driven on TanStack data refresh              |
| Timer smooth transition                         | `Timer.tsx` second-tick interval, `tabular-nums`            |
| Price flash lime/rug                            | Market detail price node uses `motion.span animate={{ color }}` on change |

---

## 13. Build & Run

```bash
# from repo root
pnpm install

# web only
pnpm --filter web dev          # next dev on :3000
pnpm --filter web build        # production build
pnpm --filter web start        # serve build

# quality
pnpm --filter web typecheck    # tsc --noEmit
pnpm --filter web lint         # next lint
```

Current state of green:

- `pnpm --filter web typecheck` → `0 errors`.
- `pnpm --filter web lint` → clean aside from an existing `react-hooks/exhaustive-deps` note on `market/[id]/page.tsx` (chart effect).
- `pnpm --filter web build` → 10 routes built (1 dynamic `/market/[id]`, 9 static).

---

## 14. Strict Rules — Enforcement Checklist

These rules are codified in CSS + Tailwind tokens and **must stay green**
across the codebase. To verify:

```bash
# from repo root — should all return zero matches
rg -n "card-cyber|glitch-rug|atmosphere-mesh|atmosphere-grain|header-scanline|section-rail" apps/web/src
rg -n "bg-gradient|from-violet|via-violet|to-violet|purple|fuchsia" apps/web/src
rg -n "border-glow|shadow-inset-glow|text-text-muted|bg-bg-card|bg-bg-surface" apps/web/src
```

Rules:

1. **`#000000` background everywhere.** No off-blacks.
2. **Lime `#cdf078` is the only accent.** Rug `#ef4444` and warn `#facc15`
   exist solely for state — never decoration.
3. **Zero gradients.** Solid fills only. Glow uses single-color
   `box-shadow`.
4. **Zero purple / fuchsia / violet** — except **SOL glyph/badge** (`#9945FF`)
   per product spec.
5. **Zero white backgrounds.** White is text only.
6. **Space Grotesk for all text.**
7. **JetBrains Mono + `tabular-nums` for every number / data field.**
8. **shadcn/ui** for primitives, **framer-motion** for motion,
   **three.js** for 3D, **TailwindCSS** for layout, **lucide-react** for
   icons. No emoji icons in JSX.
9. **Mobile responsive at 375px min.**

---

## 15. Directory Map

```
apps/web/
├── components.json                         # shadcn registry config
├── env.sample
├── next.config.mjs                         # transpilePackages: workspace types + wallet adapters
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts                      # palette + fontFamily + boxShadow tokens
├── tsconfig.json
└── src/
    ├── app/
    │   ├── layout.tsx                      # fonts + Providers + AppShell
    │   ├── providers.tsx                   # Solana + TanStack + Toasts
    │   ├── globals.css                     # CSS vars + glow utils + wallet modal theme
    │   ├── error.tsx
    │   ├── page.tsx                        # Homepage
    │   ├── market/[id]/{page,error}.tsx    # Market Detail
    │   ├── bets/{page,error}.tsx           # My Bets
    │   ├── leaderboard/page.tsx
    │   ├── live/page.tsx
    │   ├── live-rugs/page.tsx
    │   ├── profile/page.tsx
    │   └── chat/page.tsx
    ├── components/
    │   ├── BetPanel.tsx
    │   ├── CountUp.tsx
    │   ├── EmptyState.tsx
    │   ├── LiveFeed.tsx
    │   ├── MarketCard.tsx
    │   ├── PoolBar.tsx
    │   ├── RiskScore.tsx
    │   ├── Timer.tsx
    │   ├── ToastProvider.tsx
    │   ├── WalletBalancePanel.tsx
    │   ├── WalletConnectButton.tsx
    │   ├── layout/
    │   │   ├── AppShell.tsx
    │   │   ├── SidebarNav.tsx
    │   │   ├── TopBar.tsx
    │   │   └── TrendingMarketsStrip.tsx
    │   ├── three/
    │   │   ├── ParticleField.tsx
    │   │   └── LeaderboardHeader3D.tsx
    │   └── ui/
    │       ├── button.tsx                  # shadcn
    │       └── skeletons.tsx
    ├── idl/
    │   └── survivefun.json                   # Anchor IDL (sync from contracts/target/idl)
    ├── hooks/
    │   ├── useSolUsdPrice.ts                 # CoinGecko SOL/USD for bet panel
    │   ├── useLeaderboard.ts
    │   ├── useMarket.ts
    │   ├── useMarketBetsList.ts
    │   ├── useMarketPairsMap.ts
    │   ├── useMarkets.ts
    │   ├── useMarketsLiveSync.ts            # cache patcher mounted in Providers
    │   ├── useStats.ts
    │   ├── useToken.ts
    │   ├── useUserBets.ts
    │   ├── useWalletBalances.ts
    │   ├── useWatchlist.ts
    │   └── useWebSocket.ts                  # exports useWebSocket + useWebSocketEvents
    ├── stores/
    │   └── marketSearchStore.ts            # zustand
    ├── lib/
    │   └── utils.ts                        # cn()
    └── utils/
        ├── constants.ts                    # PROGRAM_ID, RPC, API URL, SOL stake bounds, durations
        ├── format.ts                       # SOL / USD (fiat) / wallet / time / pool formatters
        ├── marketRisk.ts                   # HIGH/MEDIUM/LOW scoring
        └── transactions.ts                 # Anchor instruction builders + error mapping
```

---

## 16. Animation library

All UI motion is **framer-motion** (tabs, sliding indicators, list staggers,
page transitions, modal/drawer/scrim, toasts, market-resolve flash,
`whileHover` / `whileTap` button feedback). **three.js** drives the hero
particle field and the leaderboard 3D headline. GSAP is no longer used —
the legacy `lib/gsap/*` files are orphaned and can be removed.

---

## 17. Frontend Agent — Session Log

### 2026-05-09 (wallet-adapter reference migration)

**Reference repo**

- Vendored Solana **`wallet-adapter`** monorepo (starter **react-ui-starter** + richer **example**) was read for patterns, then **`rm -rf wallet-adapter`** after green build.

**Packages**

- **Added:** `@solana/wallet-adapter-phantom`
- **Removed:** `@solana/wallet-adapter-wallets` (Phantom-only MVP)

**Files added**

- `src/utils/walletErrorToast.ts` — wallet toast event + adapter error copy + skip duplicate tx errors on `WalletProvider.onError`
- `src/components/WalletToastBridge.tsx` — listens for wallet toast events inside `ToastProvider`
- `src/components/WalletConnectButtonInner.tsx` — connect / connecting / connected UI + dropdown

**Files changed**

- `src/app/providers.tsx` — Phantom package adapter, explicit devnet endpoint, provider order, `onError`, `WalletToastBridge`
- `src/utils/transactions.ts` — `sendTransaction` + `minContextSlot`, user-facing error strings, `placeBet` optional API record, `claimPayout` optional claim POST
- `src/hooks/useWalletBalances.ts` — 30s balance polling via `useEffect` + `refetch`
- `src/components/WalletConnectButton.tsx` — dynamic import (`ssr: false`)
- `src/components/layout/TopBar.tsx` — single `WalletConnectButton` for wallet UX
- `src/app/market/[id]/page.tsx` — `placeBet` passes `marketId`; claim uses `claimPayout(..., { betId })`
- `src/app/bets/page.tsx` — claim uses `claimPayout(..., { betId })`
- `apps/web/next.config.mjs` — transpile `@solana/wallet-adapter-phantom`

**Files deleted**

- Entire **`wallet-adapter/`** reference directory (post-migration).

**Build**

- `pnpm --filter web typecheck` → 0 errors
- `pnpm --filter web build` → success

**Note:** Backend expects **camelCase** JSON (`txSignature`, `walletAddress`, `amount`); the implementation matches `apps/api` routes.

### 2026-05-09 (SOL-only collateral UI)

**Completed**

- ✅ Removed **all USDC betting / balance UI** (TopBar, sidebar holdings, profile,
  wallet panel, stats mislabeled as dollars, pool labels, etc.).
- ✅ **SOL-only `BetPanel`**: ◎ branding, `useWalletBalances` SOL, 0.01–10 SOL
  stakes, quick amounts, payout in SOL, inline errors.
- ✅ **Pools & cards** — `MarketCard`, `PoolBar`, trending strips, and market
  detail use **lamports → `formatSolBetLine`** (◎ prefix).
- ✅ **Duplicate market UX** — `GET /v1/markets?tokenMint&durationSeconds&limit=1`
  before create; “Market already exists” + link to `/market/:id`.
- ✅ **`placeBet` / market page** — `getMarketPDA(mint, durationSeconds)`;
  POST body `currency: "sol"` + lamport integer `amount`.
- ✅ **`format.ts`** — `formatSOL`, `formatSOLDisplay`, `formatSolBetLine`,
  `formatUsd` for fiat; no `formatUSDC` usage in app code.

**Breaking changes:** none for routes; backend field names like `totalBetVolumeUsdc`
may still hold **SOL lamports** — UI divides by 1e9.

**Tests:** `pnpm --filter web typecheck` → 0 errors; `pnpm --filter web lint` → clean.

### 2026-05-09 (SOL / USDC betting UI)

**Completed**

- ✅ **`BetPanel` SOL + USDC.** Branches on `market.currency` (no toggle — each
  market is fixed-currency). SOL: balance, 4 dp input, program-range quick picks,
  `≈ $… USD` via `useSolUsdPrice`, payout in SOL. USDC: prior layout and limits
  preserved.
- ✅ **`MarketCard` currency badge** + pool cells use `formatPoolTotals` so SOL
  markets never show a bogus `USDC` suffix.
- ✅ **`format.potentialPayoutUsdc`** exported for web parity with API math.
- ✅ **`useWalletBalances`** documents `lamports`; **`solToDisplay`** for 4 dp UI.
- ✅ **`transactions.toAnchorWallet`** cast satisfies Anchor `Wallet` typing.
- ✅ **`Frontend.md`** updated (components, hooks, `PlaceBetParams`, IDL path).

**Breaking changes:** none (`placeBet` already object-shaped on the call site).

**Tests:** `pnpm --filter web typecheck` → 0 errors; `pnpm --filter web lint` → clean.

### 2026-05-09 (earlier — API / websocket session)

**Completed**

- ✅ **Real API everywhere.** Audited the codebase: every page (`/`,
  `/market/[id]`, `/bets`, `/leaderboard`, `/live`, `/live-rugs`, `/profile`,
  `/chat`) and every hook now talks to the real backend through `apiV1Url()`.
  No mock objects, no stubbed lists, no hand-rolled fixtures. Verified by
  ripgrep across `apps/web/src` — only `Math.random()` usage left is the
  legitimate three.js particle scatter and toast/feed id generation.
- ✅ **`BetPanel` calls `transactions.ts`.** `apps/web/src/app/market/[id]/page.tsx`
  invokes `placeBet as placeBetOnChain` from `utils/transactions.ts` (Anchor
  `place_bet` discriminator `de3e43dc3fa67e21` matches the IDL exactly), then
  POSTs `txSignature` + amount to `/v1/markets/:id/bets` for backend
  recording.
- ✅ **`MarketCard` shows real pool data.** Reads `survivePool` / `rugPool`
  / `totalBettors` / `expiresAt` directly from the API record; 24h change
  comes from `useToken(market.tokenMint)` (DexScreener via `/v1/tokens/:mint`).
- ✅ **`Timer` syncs with real `expires_at`.** Every `<Timer>` consumer
  (`MarketCard`, `BetsPage` table + mobile cards, market detail
  `<ProgressTimerRing>`) passes `new Date(market.expiresAt)` from the API
  record. Lime → rug + `pulse-rug` once `< 5min`.
- ✅ **`LiveFeed` shows real bets from socket.** Rebuilt
  `components/LiveFeed.tsx` to consume the singleton via `useWebSocketEvents`
  instead of opening its own `io()` client. New rows slide in from the top,
  fade after 30s, with a connection dot in the header.
- ✅ **`useWebSocket` rewrite.** `hooks/useWebSocket.ts` now exports two
  hooks sharing **one refcounted `socket.io-client` connection**:
  - `useWebSocket()` — per-market scoped snapshot for the market detail page
    (existing API preserved).
  - `useWebSocketEvents({ onBetPlaced, onPoolUpdate, onMarketResolved })` —
    global listeners that fire for **every** validated event.
  The socket auto-reconnects and re-subscribes on `connect`. Strict payload
  validation (`isBetPlaced` / `isPoolUpdate` / `isMarketResolved`) prevents a
  malformed broadcast from corrupting the cache.
- ✅ **Global cache sync.** New `hooks/useMarketsLiveSync.ts` mounted in
  `providers.tsx` (`<GlobalSocketSync />`) patches `marketsQueryKey` and
  any hot `marketQueryKey(id)` cache slices in place on every event, so the
  homepage grid, `/live`, `/live-rugs`, market detail, and the live feed all
  stay in sync with **one** WebSocket and **zero** polling.
- ✅ **`ToastProvider` consolidation.** No longer opens its own socket — uses
  `useWebSocketEvents({ onMarketResolved })` to drive the lime/rug
  fullscreen flash and the "Market resolved" toast.
- ✅ **BetPanel "Your position" persists.** `apps/web/src/app/market/[id]/page.tsx`
  now derives `position` from `useUserBets(wallet)` instead of local state,
  so reloading the page still shows the user's open side + amount on this
  market. Place-bet success also invalidates `userBetsQueryKey(wallet)` so
  the panel updates immediately.
- ✅ **Typecheck + lint + build green.**
  `pnpm --filter web typecheck` → no errors.
  `pnpm --filter web lint`      → no warnings.
  `pnpm --filter web build`     → all 10 routes compile, only acknowledged
  third-party `viem`/`ox` `Critical dependency` warning remains (upstream).

**Blocked / waiting on backend**

- ⏳ **Holders breakdown tab** on the market detail page. Requires backend
  to surface a Birdeye holders endpoint (or proxy on-chain holders
  enumeration). UI already renders the `tokenHook.holderCount` count when
  available, with a fallback string otherwise.
- ⏳ **Chat page (`/chat`)** is intentionally a "coming soon" placeholder.
  Will swap to a real channels API + socket room when backend ships.

**Needs backend ready first (no frontend change required)**

- 🔌 `/v1/markets/active`, `/v1/markets/:id`, `/v1/markets/:id/bets`,
  `/v1/markets/:id/chart`, `/v1/users/:wallet/bets`, `/v1/stats`,
  `/v1/leaderboard`, `/v1/tokens/:mint`, `POST /v1/markets`,
  `POST /v1/markets/:id/bets` — all referenced by the frontend right now.
- 🔌 Socket.IO events from `apps/api`: `bet_placed`, `pool_update`,
  `market_resolved` (payload shapes per `@survivefun/types`'s `SocketEvents`,
  `BetPlaced`, `MarketResolved`). The frontend revalidates payloads
  defensively but expects these field names.
- 🔌 Anchor program at `HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH` (override
  via `NEXT_PUBLIC_PROGRAM_ID`). Discriminators in `utils/transactions.ts`
  (`create_market`, `place_bet`, `claim_payout`, `resolve_market`) are
  byte-for-byte identical to `contracts/target/idl/survivefun.json`.

---

That's the entire frontend, end-to-end. If something is rendered on the
screen, its file lives in this map.
