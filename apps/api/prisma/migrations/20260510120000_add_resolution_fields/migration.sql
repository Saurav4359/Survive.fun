-- AlterTable
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "pending_rug_at" TIMESTAMP(6),
ADD COLUMN IF NOT EXISTS "resolution_data" JSONB,
ADD COLUMN IF NOT EXISTS "open_snapshot_at" TIMESTAMP(6);
