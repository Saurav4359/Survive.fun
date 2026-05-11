# Survive.fun — canonical PDAs

## Single source of truth

All TypeScript PDA derivations live in **`@survivefun/solana-pda`** (`packages/solana-pda`). The Anchor program in `contracts/programs/survivefun` remains authoritative for **runtime behavior**; the package must mirror its seeds exactly.

Consumers:

- `apps/api` — verification, `create_market`, DTO guards  
- `apps/web` — wallet transactions  
- `contracts/tests` — Anchor integration tests  
- Root `scripts/*` — devnet helpers  

Do **not** call `PublicKey.findProgramAddressSync` with Survive seeds outside that package.

## Versioning

| Constant / enum | Meaning |
|-----------------|--------|
| `PDA_LAYOUT_VERSION` | Monotonic layout version for migrations and audits (`2` today). |
| `MarketAddressScheme.LegacyMintOnly` | Seeds `[b"market", token_mint]`. |
| `MarketAddressScheme.MintAndMarketId` | Seeds `[b"market", token_mint, market_id]`. |

Database inference:

- `chain_market_key IS NULL` → treat as **legacy scheme** for derivation; **`on_chain_address` may still be a 3-seed vault** (see migrations).  
- `chain_market_key IS NOT NULL` → **multi-round scheme**; **`on_chain_address` must equal** `deriveMarketPDAForDbRow(programId, row)` or the API returns **`MARKET_PDA_INVARIANT`**.

## Accounts

| Role | PDA | Seeds |
|------|-----|--------|
| Market vault (native SOL pools) | `deriveMarketPDA` | See schemes above. Same account receives stakes — **no separate SPL escrow** in v1. |
| User bet position | `deriveBetPDA` | `[b"bet", market, bettor]` |

## Invariants

- **`assertMultiRoundMarketStoredMatchesDerived`** — DB integrity when `chainMarketKey` is set.  
- **`MARKET_ACCOUNT_DISCRIMINATOR`** / **`BET_ACCOUNT_DISCRIMINATOR`** — Anchor 8-byte account headers (for custom RPC validation when needed).

## Migration tooling

| Script | Purpose |
|--------|--------|
| `pnpm pda:audit` | Scan SOL markets; exit 1 if any multi-round row disagrees with canonical derivation. |
| `pnpm pda:backfill-keys --dry-run` | Decode on-chain `Market.market_id` and propose/update `chain_market_key` where missing. |

## Changing seeds

1. Update **`contracts/programs/survivefun`** and redeploy.  
2. Update **`packages/solana-pda`** (and bump **`PDA_LAYOUT_VERSION`** / **`MarketAddressScheme`** if layout changes).  
3. Ship a DB migration strategy for existing rows.  
4. Run **`pnpm pda:audit`** against staging/prod snapshots.
