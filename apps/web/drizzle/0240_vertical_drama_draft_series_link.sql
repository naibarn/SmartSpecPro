-- Series-first compatibility link for pre-Series Draft jobs.
-- Expand-only and idempotent: the Draft ledger remains recoverable if its
-- Series is later deleted, while the normal inbox can exclude linked rows.
ALTER TABLE "vertical_drama_draft_ledgers"
  ADD COLUMN IF NOT EXISTS "seriesId" bigint
  REFERENCES "vertical_drama_series"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vdd_ledger_owner_series_idx"
  ON "vertical_drama_draft_ledgers" ("tenantId", "userId", "seriesId");
