# Survive.fun — Complete Technical Build Spec
### *The First On-Chain Survival Market for Solana Memecoins*
> Full end-to-end spec. Any developer or AI agent can build this from scratch using this document alone.

---

## Table of Contents

1. [What You're Building](#1-what-youre-building)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture](#3-system-architecture)
4. [Smart Contract](#4-smart-contract)
5. [Rug Detection Engine](#5-rug-detection-engine)
6. [Backend API](#6-backend-api)
7. [Frontend — Every Page](#7-frontend--every-page)
8. [Database Schema](#8-database-schema)
9. [WebSocket Events](#9-websocket-events)
10. [4-Day Build Plan](#10-4-day-build-plan)
11. [Demo Setup](#11-demo-setup)
12. [Deployment](#12-deployment)
13. [Environment Variables](#13-environment-variables)
14. [Folder Structure](#14-folder-structure)
15. [Pitch Script](#15-pitch-script)

---

## 1. What You're Building

Survive.fun is a **prediction market specifically for Pump.fun memecoin survival.**

### Core Loop
```
User pastes Pump.fun token address
↓
App fetches live token data
↓
Market created with timer (1h/6h/24h)
↓
Traders bet USDC on SURVIVE or RUG
↓
Helius watches on-chain for rug events
↓
Rug detected OR timer expires
↓
Winners split the losing pool
↓
USDC paid out automatically
```

### Rug Event Definition (Objective On-Chain)
```
Event 1: Dev wallet sells > 25% of holdings
Event 2: Token price drops > 90% from market open
Event 3: Liquidity removed > 80% in single tx
Event 4: Token fails to graduate from bonding curve
          after reaching 80% threshold

ANY ONE of these = RUG confirmed
Smart contract resolves automatically
No human judgment needed
```

### One Line Pitch
> "Pump.fun lets you buy the coin. Survive.fun lets you bet on whether it survives."

---

## 2. Tech Stack

### Blockchain
```
Chain:          Solana (Devnet for MVP)
Smart Contract: Anchor Framework (Rust)
Token:          USDC SPL for betting
Wallet:         Phantom
RPC:            Helius (webhooks + data)
Data:           DexScreener API + Birdeye API
```

### Backend
```
Runtime:        Node.js 20+
Framework:      Express.js + TypeScript
Database:       PostgreSQL (Supabase)
Cache:          Redis (Upstash)
Queue:          Bull (background jobs)
WebSocket:      Socket.io
ORM:            Prisma
```

### Frontend
```
Framework:      Next.js 14 (App Router)
Language:       TypeScript
Styling:        TailwindCSS
Charts:         TradingView Lightweight Charts
Wallet:         @solana/wallet-adapter-react
State:          Zustand
Data:           React Query
```

### External APIs
```
Helius:         Webhook listener for on-chain events
DexScreener:    Token price + chart data
Birdeye:        Holder data + wallet tracking
Pump.fun:       Token metadata
```

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────┐
│              FRONTEND (Next.js)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │  Home    │ │  Market  │ │   My Bets        ││
│  │  Page    │ │  Detail  │ │   Page           ││
│  └──────────┘ └──────────┘ └──────────────────┘│
└──────────────────┬──────────────────────────────┘
                   │ REST + WebSocket
┌──────────────────▼──────────────────────────────┐
│              BACKEND (Express.js)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │  Market  │ │  Rug     │ │   Payout         ││
│  │  Service │ │  Detector│ │   Service        ││
│  └──────────┘ └──────────┘ └──────────────────┘│
│  ┌─────────────────────────────────────────────┐│
│  │         PostgreSQL + Redis                  ││
│  └─────────────────────────────────────────────┘│
└──────────────────┬──────────────────────────────┘
         ┌─────────┴──────────┐
         │                    │
┌────────▼───────┐  ┌─────────▼────────┐
│ SOLANA PROGRAM │  │  HELIUS WEBHOOKS │
│                │  │                  │
│ • create_market│  │ • Watch dev wallet│
│ • place_bet    │  │ • Watch price    │
│ • resolve      │  │ • Watch liquidity│
│ • claim_payout │  │ • Watch graduate │
└────────────────┘  └──────────────────┘
```

---

## 4. Smart Contract

### Program Accounts

```rust
// MARKET ACCOUNT
#[account]
pub struct Market {
    pub token_mint: Pubkey,          // Pump.fun token address
    pub creator: Pubkey,             // Who created the market
    pub survive_pool: u64,           // Total USDC in SURVIVE pool
    pub rug_pool: u64,               // Total USDC in RUG pool
    pub total_bettors: u32,          // Number of bettors
    pub duration: u64,               // 1h/6h/24h in seconds
    pub created_at: i64,             // Unix timestamp
    pub expires_at: i64,             // When market closes
    pub status: MarketStatus,        // Active/Resolved/Expired
    pub outcome: Option<Outcome>,    // Survive/Rug/None
    pub platform_fee_bps: u64,       // 200 = 2%
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum MarketStatus {
    Active,
    Resolved,
    Expired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum Outcome {
    Survive,
    Rug,
}

// BET ACCOUNT — one per user per market
#[account]
pub struct Bet {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub side: BetSide,
    pub amount: u64,         // USDC amount (6 decimals)
    pub claimed: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum BetSide {
    Survive,
    Rug,
}
```

### Instructions

```rust
// 1. CREATE MARKET
pub fn create_market(
    ctx: Context<CreateMarket>,
    token_mint: Pubkey,
    duration_seconds: u64,  // 3600 = 1h, 21600 = 6h, 86400 = 24h
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.token_mint = token_mint;
    market.creator = ctx.accounts.creator.key();
    market.survive_pool = 0;
    market.rug_pool = 0;
    market.duration = duration_seconds;
    market.created_at = Clock::get()?.unix_timestamp;
    market.expires_at = market.created_at + duration_seconds as i64;
    market.status = MarketStatus::Active;
    market.outcome = None;
    market.platform_fee_bps = 200; // 2%
    market.bump = ctx.bumps.market;

    // Platform seeds initial liquidity: $10 each side
    // Done in separate instruction after creation
    Ok(())
}

// 2. PLACE BET
pub fn place_bet(
    ctx: Context<PlaceBet>,
    side: BetSide,
    amount: u64,  // USDC amount in lamports (6 decimals)
) -> Result<()> {
    let market = &mut ctx.accounts.market;

    require!(
        market.status == MarketStatus::Active,
        SurviveError::MarketNotActive
    );
    require!(
        Clock::get()?.unix_timestamp < market.expires_at,
        SurviveError::MarketExpired
    );
    require!(amount >= 1_000_000, SurviveError::BetTooSmall);   // min $1
    require!(amount <= 50_000_000, SurviveError::BetTooLarge);  // max $50

    // Transfer USDC from bettor to market escrow
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.bettor_usdc.to_account_info(),
                to: ctx.accounts.market_escrow.to_account_info(),
                authority: ctx.accounts.bettor.to_account_info(),
            },
        ),
        amount,
    )?;

    // Update pool
    match side {
        BetSide::Survive => market.survive_pool += amount,
        BetSide::Rug => market.rug_pool += amount,
    }
    market.total_bettors += 1;

    // Record bet
    let bet = &mut ctx.accounts.bet;
    bet.market = market.key();
    bet.bettor = ctx.accounts.bettor.key();
    bet.side = side;
    bet.amount = amount;
    bet.claimed = false;
    bet.bump = ctx.bumps.bet;

    emit!(BetPlaced {
        market: market.key(),
        bettor: ctx.accounts.bettor.key(),
        side: side.clone(),
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// 3. RESOLVE MARKET (called by backend resolver)
pub fn resolve_market(
    ctx: Context<ResolveMarket>,
    outcome: Outcome,
) -> Result<()> {
    let market = &mut ctx.accounts.market;

    require!(
        market.status == MarketStatus::Active,
        SurviveError::MarketNotActive
    );
    // Only platform authority can resolve
    require!(
        ctx.accounts.resolver.key() == ctx.accounts.platform_authority.key(),
        SurviveError::Unauthorized
    );

    market.status = MarketStatus::Resolved;
    market.outcome = Some(outcome.clone());

    emit!(MarketResolved {
        market: market.key(),
        outcome,
        survive_pool: market.survive_pool,
        rug_pool: market.rug_pool,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// 4. CLAIM PAYOUT
pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
    let market = &ctx.accounts.market;
    let bet = &mut ctx.accounts.bet;

    require!(
        market.status == MarketStatus::Resolved,
        SurviveError::MarketNotResolved
    );
    require!(!bet.claimed, SurviveError::AlreadyClaimed);

    let outcome = market.outcome.clone().unwrap();

    // Check if bettor is on winning side
    let won = match (&bet.side, &outcome) {
        (BetSide::Survive, Outcome::Survive) => true,
        (BetSide::Rug, Outcome::Rug) => true,
        _ => false,
    };

    require!(won, SurviveError::DidNotWin);

    // Calculate payout
    let winning_pool = match outcome {
        Outcome::Survive => market.survive_pool,
        Outcome::Rug => market.rug_pool,
    };
    let losing_pool = match outcome {
        Outcome::Survive => market.rug_pool,
        Outcome::Rug => market.survive_pool,
    };

    // Platform takes 2% of losing pool
    let platform_fee = losing_pool * market.platform_fee_bps / 10_000;
    let distributable = losing_pool - platform_fee;

    // Your share = (your bet / total winning pool) * distributable + your bet back
    let your_share = (bet.amount as u128 * distributable as u128
        / winning_pool as u128) as u64;
    let payout = bet.amount + your_share;

    // Transfer payout from escrow to winner
    // ... token transfer CPI here

    bet.claimed = true;

    emit!(PayoutClaimed {
        market: market.key(),
        bettor: bet.bettor,
        amount: payout,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
```

### Build and Deploy

```bash
# Install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install latest && avm use latest

# Create project
anchor init survivefun
cd survivefun

# Configure devnet
solana config set --url devnet
solana-keygen new --outfile ~/.config/solana/id.json
solana airdrop 2

# Build and deploy
anchor build
anchor deploy

# Get program ID
solana address -k target/deploy/survivefun-keypair.json
```

---

## 5. Rug Detection Engine

### How It Works

```typescript
// backend/src/services/rugDetector.ts

import { Helius } from 'helius-sdk';
import axios from 'axios';

const helius = new Helius(process.env.HELIUS_API_KEY!);

// RUG CONDITION 1: Dev wallet sells > 25% of holdings
async function checkDevSell(
  tokenMint: string,
  devWallet: string,
  marketOpenSupply: number
): Promise<boolean> {
  const txHistory = await helius.rpc.getSignaturesForAddress(
    new PublicKey(devWallet),
    { limit: 10 }
  );

  for (const tx of txHistory) {
    const details = await helius.rpc.getTransaction(tx.signature);
    // Check if dev sold > 25% of their initial holdings
    const soldAmount = extractSoldAmount(details, tokenMint, devWallet);
    if (soldAmount > marketOpenSupply * 0.25) return true;
  }
  return false;
}

// RUG CONDITION 2: Price drops > 90%
async function checkPriceDrop(
  tokenMint: string,
  marketOpenPrice: number
): Promise<boolean> {
  const response = await axios.get(
    `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`
  );
  const currentPrice = response.data.pairs[0]?.priceUsd;
  if (!currentPrice) return false;

  const dropPercent = (marketOpenPrice - currentPrice) / marketOpenPrice * 100;
  return dropPercent >= 90;
}

// RUG CONDITION 3: Liquidity removed > 80%
async function checkLiquidityRemoved(
  tokenMint: string,
  marketOpenLiquidity: number
): Promise<boolean> {
  const response = await axios.get(
    `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`
  );
  const currentLiquidity = response.data.pairs[0]?.liquidity?.usd;
  if (!currentLiquidity) return true; // No liquidity = definitely rugged

  const dropPercent = (marketOpenLiquidity - currentLiquidity)
    / marketOpenLiquidity * 100;
  return dropPercent >= 80;
}

// MAIN RESOLVER — runs every 30 seconds for active markets
export async function resolveMarket(market: Market): Promise<void> {
  const isRug = await Promise.any([
    checkDevSell(market.tokenMint, market.devWallet, market.openSupply),
    checkPriceDrop(market.tokenMint, market.openPrice),
    checkLiquidityRemoved(market.tokenMint, market.openLiquidity),
  ]);

  if (isRug) {
    await resolveOnChain(market.id, 'RUG');
    return;
  }

  // Check if expired
  if (Date.now() > market.expiresAt) {
    await resolveOnChain(market.id, 'SURVIVE');
  }
}
```

### Helius Webhook Setup

```typescript
// backend/src/services/heliusWebhook.ts

// Register webhook to watch Pump.fun program
const webhook = await helius.createWebhook({
  webhookURL: `${process.env.BACKEND_URL}/webhook/helius`,
  transactionTypes: ['TOKEN_MINT'],
  accountAddresses: ['6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'], // Pump.fun program
  webhookType: 'enhanced',
});

// Handle incoming webhook events
app.post('/webhook/helius', async (req, res) => {
  const events = req.body;

  for (const event of events) {
    // New token minted on Pump.fun
    if (event.type === 'TOKEN_MINT') {
      const tokenMint = event.tokenTransfers[0]?.mint;
      if (tokenMint) {
        // Auto-create market for new token
        await autoCreateMarket(tokenMint);
        // Notify frontend via WebSocket
        io.emit('new_token', { tokenMint });
      }
    }
  }

  res.json({ success: true });
});
```

---

## 6. Backend API

### Base URL
```
Development: http://localhost:3001/api/v1
Production:  https://api.survive.fun/api/v1
```

### Endpoints

```
GET /tokens/:mint
→ Fetches token data from DexScreener + Birdeye
→ Returns: name, price, liquidity, holders, dev wallet, chart

POST /markets
Body: { tokenMint, duration: '1h'|'6h'|'24h', walletAddress }
→ Creates market on-chain + in DB
→ Returns: market object

GET /markets
Query: ?status=active&page=1&limit=20
→ Returns all active markets with live data

GET /markets/:id
→ Returns single market with:
   live price, pools, time remaining, recent bets

POST /markets/:id/bets
Body: { side: 'survive'|'rug', amount, txSignature }
→ Records bet in DB after on-chain confirmation

GET /markets/:id/bets
→ Returns all bets for a market

GET /users/:wallet/bets
→ Returns all bets for a wallet address

GET /markets/:id/chart
→ Returns OHLCV data for the token

POST /webhook/helius
→ Receives Helius webhook events
→ Triggers rug detection

GET /stats
→ Platform stats:
   total markets, total volume, biggest win, recent payouts
```

---

## 7. Frontend — Every Page

### 7.1 Homepage (`/`)

```
HEADER:
  Logo: survive.fun
  Tagline: "Bet on whether memecoins survive or rug"
  [Connect Wallet Button]

STATS BAR (live):
  Active Markets | Total Volume | Biggest Win | Rugs Caught

SEARCH BOX (hero):
  ┌─────────────────────────────────────────────┐
  │ Paste Pump.fun token address...             │
  │                          [Create Market →]  │
  └─────────────────────────────────────────────┘

ACTIVE MARKETS GRID:
  Each card shows:
  ┌──────────────────────────────────┐
  │ [Token Logo] $TICKER             │
  │ Price: $0.000042  -12% ↓        │
  │                                  │
  │ SURVIVE pool: $240 USDC         │
  │ RUG pool: $180 USDC             │
  │                                  │
  │ ██████████░░░░ 57% SURVIVE      │
  │                                  │
  │ ⏱ 43 minutes remaining          │
  │                                  │
  │ [Bet Now]                        │
  └──────────────────────────────────┘

RECENT OUTCOMES (live feed):
  $PEPE2 → RUGGED 💀 → RUG bettors won $420
  $DOGE3 → SURVIVED ✅ → SURVIVE bettors won $180
  $MOON  → RUGGED 💀 → RUG bettors won $1,200
```

---

### 7.2 Market Page (`/market/:id`)

```
LEFT COLUMN (60%):
  Token Header:
  [Logo] $TICKER — TokenName
  $0.000042 USDC  -12.4% (24h)
  
  Risk Score: 🔴 HIGH RISK
  → Dev holds 45% of supply
  → No liquidity lock
  → Launched 23 mins ago

  PRICE CHART (TradingView)
  Timeframes: 5M 15M 1H

  TOKEN STATS:
  Liquidity: $4,200
  Market Cap: $42,000
  Dev Wallet: 7xKp...3mNq (45% supply)
  Age: 23 minutes
  Holders: 142

  RECENT BETS (live feed):
  8xPq... → BET RUG $50 → 2 mins ago
  3mNq... → BET SURVIVE $20 → 4 mins ago

RIGHT COLUMN (40%):
  MARKET TIMER:
  ⏱ 43:21 remaining

  POOLS:
  SURVIVE: $240 USDC (57%)
  RUG: $180 USDC (43%)

  BET PANEL:
  ┌──────────────────────────────────┐
  │  [SURVIVE ✅]  [RUG 💀]         │
  │                                  │
  │  Amount: [___________] USDC     │
  │  Quick: $5  $10  $25  $50      │
  │                                  │
  │  If RUG wins you get:           │
  │  $50 → ~$116 USDC (2.3x)       │
  │                                  │
  │  [Connect Wallet to Bet]        │
  └──────────────────────────────────┘

  YOUR POSITION:
  You bet: $25 on RUG
  Potential win: ~$58 USDC

  RUG CONDITIONS BEING WATCHED:
  ☐ Dev sells > 25% holdings
  ☐ Price drops > 90%
  ☐ Liquidity removed > 80%
  ← Any one triggers RUG outcome
```

---

### 7.3 My Bets Page (`/bets`)

```
SUMMARY:
  Total Bet: $X USDC
  Total Won: $X USDC
  Win Rate: X%
  Open Bets: X

TABS: [Active] [Won] [Lost]

ACTIVE BETS:
  Token | Side | Amount | Pool | Time Left | Potential Win
  $PEPE | RUG  | $25    | 43%  | 43 mins   | ~$58
  $DOGE | SURVIVE | $10 | 67%  | 5h 12m   | ~$14

WON BETS:
  Token | Side | Bet | Won | Tx
  $MOON | RUG  | $50 | $124 | [View]

LOST BETS:
  Token | Side | Bet | Lost
  $SAFE | RUG  | $20 | -$20
```

---

### 7.4 Leaderboard Page (`/leaderboard`)

```
TOP WINNERS:
  Rank | Wallet | Total Won | Win Rate | Best Bet
  1. 7xKp... | $4,200 | 73% | $420 on $PEPE rug

TOP RUG CALLERS:
  Wallets who called most rugs correctly

BIGGEST PAYOUTS:
  Recent biggest single wins
```

---

## 8. Database Schema

```sql
-- MARKETS TABLE
CREATE TABLE markets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint      VARCHAR(44) NOT NULL,
  token_name      VARCHAR(100),
  token_ticker    VARCHAR(20),
  creator_wallet  VARCHAR(44) NOT NULL,
  duration        INTEGER NOT NULL,      -- seconds
  expires_at      TIMESTAMP NOT NULL,
  survive_pool    DECIMAL(18,6) DEFAULT 0,
  rug_pool        DECIMAL(18,6) DEFAULT 0,
  open_price      DECIMAL(18,9),         -- price when market created
  open_liquidity  DECIMAL(18,2),
  dev_wallet      VARCHAR(44),
  status          VARCHAR(20) DEFAULT 'active', -- active|resolved|expired
  outcome         VARCHAR(10),           -- survive|rug|null
  on_chain_address VARCHAR(44),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- BETS TABLE
CREATE TABLE bets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id       UUID REFERENCES markets(id),
  bettor_wallet   VARCHAR(44) NOT NULL,
  side            VARCHAR(10) NOT NULL,  -- survive|rug
  amount_usdc     DECIMAL(18,6) NOT NULL,
  potential_win   DECIMAL(18,6),
  tx_signature    VARCHAR(88) UNIQUE,
  claimed         BOOLEAN DEFAULT FALSE,
  payout_amount   DECIMAL(18,6),
  payout_tx       VARCHAR(88),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- RUG EVENTS TABLE
CREATE TABLE rug_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id       UUID REFERENCES markets(id),
  token_mint      VARCHAR(44) NOT NULL,
  event_type      VARCHAR(50) NOT NULL, -- dev_sell|price_drop|liquidity_removed
  event_data      JSONB,
  tx_signature    VARCHAR(88),
  detected_at     TIMESTAMP DEFAULT NOW()
);

-- PLATFORM STATS TABLE
CREATE TABLE platform_stats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_markets   INTEGER DEFAULT 0,
  total_volume    DECIMAL(18,6) DEFAULT 0,
  total_rugs      INTEGER DEFAULT 0,
  total_survives  INTEGER DEFAULT 0,
  updated_at      TIMESTAMP DEFAULT NOW()
);
```

---

## 9. WebSocket Events

```typescript
// Server emits:
io.emit('market_created', { market });
io.emit('bet_placed', { marketId, side, amount, wallet });
io.emit('pool_update', { marketId, survivePool, rugPool });
io.emit('rug_detected', { marketId, eventType, token });
io.emit('market_resolved', { marketId, outcome });
io.emit('new_token', { tokenMint, tokenName }); // Auto-detected from Pump.fun

// Client subscribes:
socket.on('pool_update', (data) => updatePools(data));
socket.on('rug_detected', (data) => showRugAlert(data));
socket.on('market_resolved', (data) => showOutcome(data));
```

---

## 10. 4-Day Build Plan

### Day 1 — Frontend UI
```
Morning:
→ Next.js setup + TailwindCSS
→ Wallet adapter integration
→ Homepage layout

Afternoon:
→ Token search + paste flow
→ Market card component
→ Market detail page layout

Evening:
→ Bet panel UI
→ Pool visualization
→ Timer component
→ My Bets page
```

### Day 2 — Smart Contract
```
Morning:
→ Anchor setup + project init
→ Market account structure
→ create_market instruction

Afternoon:
→ place_bet instruction
→ USDC escrow setup
→ resolve_market instruction

Evening:
→ claim_payout instruction
→ Deploy to devnet
→ Basic tests passing
```

### Day 3 — Backend + Rug Detector
```
Morning:
→ Express.js setup
→ Database schema + Prisma
→ Token data API (DexScreener)

Afternoon:
→ Market creation endpoint
→ Bet recording endpoint
→ Helius webhook setup

Evening:
→ Rug detection engine
→ Auto-resolver job (every 30s)
→ WebSocket events
→ Connect frontend to backend
```

### Day 4 — Demo Polish
```
Morning:
→ Pre-load 3 real Pump.fun tokens
→ Seed demo markets
→ Full flow test end-to-end

Afternoon:
→ Controlled rug simulation on devnet
→ Fix all bugs
→ Polish UI

Evening:
→ Deploy to Vercel + Railway
→ Record backup demo video
→ Practice pitch 20 times
→ Ship launch
```

---

## 11. Demo Setup

### Pre-load These For Demo
```typescript
// scripts/setup-demo.ts

const DEMO_TOKENS = [
  {
    mint: 'REAL_PUMP_FUN_TOKEN_1',
    name: 'PepeCoin',
    ticker: 'PEPE2',
    devWallet: 'DEV_WALLET_1',
    duration: '1h',
  },
  {
    mint: 'REAL_PUMP_FUN_TOKEN_2',
    name: 'MoonDoge',
    ticker: 'MDOGE',
    devWallet: 'DEV_WALLET_2',
    duration: '6h',
  },
  {
    mint: 'REAL_PUMP_FUN_TOKEN_3',
    name: 'SafeMoon2',
    ticker: 'SAFE2',
    devWallet: 'DEV_WALLET_3',
    duration: '24h',
  },
];
```

### Controlled Rug Simulation
```typescript
// scripts/simulate-rug.ts
// For demo purposes only — devnet only

async function simulateRug(tokenMint: string) {
  console.log('Simulating dev wallet sell...');

  // Transfer 30% of dev holdings to another wallet
  // This triggers the rug detector
  // Market resolves as RUG
  // RUG bettors get paid
  // Show live on screen during demo
}
```

### The 60-Second Demo Script
```
"I just found this token on Pump.fun.
$PEPE2. Launched 4 minutes ago.
Dev holds 45% of supply.
Classic rug setup.

Watch — I go to Survive.fun.
Paste the token address.
App pulls live data instantly.
Risk score: HIGH.

I bet $25 on RUG.
[Phantom approves]
Done. Bet placed on-chain.

Now watch the dev wallet...
[Simulate rug]

Dev just sold 30% of holdings.
Rug detected automatically.
My $25 became $58.
In 30 seconds.
On-chain. No trust needed."
```

---

## 12. Deployment

### Frontend (Vercel)
```bash
cd frontend
npm install
npm run build
vercel --prod
```

### Backend (Railway)
```bash
cd backend
npm install
npm run build
railway login
railway init
railway up
```

### Smart Contract (Devnet)
```bash
anchor build
anchor deploy --provider.cluster devnet
```

---

## 13. Environment Variables

### Backend (.env)
```env
PORT=3001
DATABASE_URL=postgresql://user:pass@db.supabase.co:5432/postgres
REDIS_URL=redis://default:pass@upstash.io:6379
HELIUS_API_KEY=your_helius_key
PROGRAM_ID=your_program_id
PLATFORM_WALLET_SECRET=[1,2,3...]
USDC_MINT_DEVNET=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
SOLANA_RPC=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
BACKEND_URL=https://api.survive.fun
FRONTEND_URL=https://survive.fun
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:3001
NEXT_PUBLIC_PROGRAM_ID=your_program_id
NEXT_PUBLIC_NETWORK=devnet
NEXT_PUBLIC_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
NEXT_PUBLIC_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
```

---

## 14. Folder Structure

```
survivefun/
├── contracts/
│   ├── programs/
│   │   └── survivefun/
│   │       └── src/
│   │           ├── lib.rs
│   │           ├── instructions/
│   │           │   ├── create_market.rs
│   │           │   ├── place_bet.rs
│   │           │   ├── resolve_market.rs
│   │           │   └── claim_payout.rs
│   │           ├── state/
│   │           │   ├── market.rs
│   │           │   └── bet.rs
│   │           └── errors.rs
│   ├── tests/
│   │   └── survivefun.ts
│   └── Anchor.toml
├── backend/
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── markets.ts
│   │   │   ├── bets.ts
│   │   │   ├── tokens.ts
│   │   │   └── webhook.ts
│   │   ├── services/
│   │   │   ├── rugDetector.ts
│   │   │   ├── marketResolver.ts
│   │   │   ├── tokenData.ts
│   │   │   └── payoutService.ts
│   │   ├── jobs/
│   │   │   └── resolver.ts
│   │   └── websocket/
│   │       └── socketHandler.ts
│   └── prisma/
│       └── schema.prisma
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx
│       │   ├── market/[id]/page.tsx
│       │   ├── bets/page.tsx
│       │   └── leaderboard/page.tsx
│       ├── components/
│       │   ├── MarketCard.tsx
│       │   ├── BetPanel.tsx
│       │   ├── PriceChart.tsx
│       │   ├── PoolBar.tsx
│       │   ├── Timer.tsx
│       │   ├── RiskScore.tsx
│       │   └── LiveFeed.tsx
│       ├── hooks/
│       │   ├── useMarket.ts
│       │   ├── useToken.ts
│       │   └── useWebSocket.ts
│       └── utils/
│           ├── rugDetection.ts
│           └── calculations.ts
└── scripts/
    ├── setup-demo.ts
    └── simulate-rug.ts
```

---

## 15. Pitch Script

### Pitch Script

```
"$500 million lost to memecoin rugs in 2024.
Every trader knows the feeling.
You bought a bag. Dev dumps. You lose everything.

There was no way to hedge that risk.
Until now.

Survive.fun is the first on-chain survival market
for Pump.fun memecoins.

You don't have to buy the coin.
You just bet on whether it survives or rugs.

Watch this. Live. On Solana.

[Demo the full flow]

Paste token. Pick side. Win USDC.
That's it.

We're not another launchpad.
Not another scanner.
We created a new Solana-native trading primitive.

Rug risk is now a liquid market."
```

---

> **Survive.fun** — Pump.fun lets you buy the coin. We let you bet on whether it survives.