-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "markets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_mint" VARCHAR(44) NOT NULL,
    "token_name" VARCHAR(100),
    "token_ticker" VARCHAR(20),
    "creator_wallet" VARCHAR(44) NOT NULL,
    "duration" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "survive_pool" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "rug_pool" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "open_price" DECIMAL(18,9),
    "open_liquidity" DECIMAL(18,2),
    "dev_wallet" VARCHAR(44),
    "dev_sell_threshold_override" DECIMAL(7,6),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "outcome" VARCHAR(10),
    "on_chain_address" VARCHAR(44),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_bettors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "market_id" UUID NOT NULL,
    "bettor_wallet" VARCHAR(44) NOT NULL,
    "side" VARCHAR(10) NOT NULL,
    "amount_usdc" DECIMAL(18,6) NOT NULL,
    "potential_win" DECIMAL(18,6),
    "tx_signature" VARCHAR(88) NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "payout_amount" DECIMAL(18,6),
    "payout_tx" VARCHAR(88),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rug_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "market_id" UUID NOT NULL,
    "token_mint" VARCHAR(44) NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "event_data" JSONB,
    "tx_signature" VARCHAR(88),
    "detected_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rug_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_stats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "total_markets" INTEGER NOT NULL DEFAULT 0,
    "total_volume" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "total_rugs" INTEGER NOT NULL DEFAULT 0,
    "total_survives" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bets_tx_signature_key" ON "bets"("tx_signature");

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rug_events" ADD CONSTRAINT "rug_events_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

