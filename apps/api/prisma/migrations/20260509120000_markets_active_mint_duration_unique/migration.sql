-- At most one active row per (token_mint, duration); aligns with POST /markets dedupe.
-- If this fails, you have duplicate active rows for the same mint+duration — fix data first.
CREATE UNIQUE INDEX "markets_active_token_mint_duration_key"
ON "markets" ("token_mint", "duration")
WHERE "status" = 'active';
