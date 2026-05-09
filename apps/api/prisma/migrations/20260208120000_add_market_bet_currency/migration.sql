-- AlterTable
ALTER TABLE "markets" ADD COLUMN "currency" VARCHAR(10) NOT NULL DEFAULT 'usdc';

-- AlterTable
ALTER TABLE "bets" ADD COLUMN "currency" VARCHAR(10) NOT NULL DEFAULT 'usdc';
