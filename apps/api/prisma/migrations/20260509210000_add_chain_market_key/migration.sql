-- On-chain market PDA seed `market_id` (base58 pubkey) for multi-round markets per mint.
ALTER TABLE "markets" ADD COLUMN "chain_market_key" VARCHAR(44);
