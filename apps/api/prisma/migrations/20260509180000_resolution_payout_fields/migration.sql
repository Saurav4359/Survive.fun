-- Market resolution metadata
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMP(6);
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "rug_condition" VARCHAR(50);

-- Bet payout / claim
ALTER TABLE "bets" ADD COLUMN IF NOT EXISTS "won" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bets" ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMP(6);

-- Platform fee rollup
ALTER TABLE "platform_stats" ADD COLUMN IF NOT EXISTS "total_fees" DECIMAL(18,6) NOT NULL DEFAULT 0;
