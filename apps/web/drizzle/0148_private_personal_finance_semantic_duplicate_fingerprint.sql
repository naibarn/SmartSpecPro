ALTER TABLE "finance_drafts"
  ADD COLUMN IF NOT EXISTS "semantic_fingerprint" varchar(64);

CREATE INDEX IF NOT EXISTS "finance_drafts_semantic_fingerprint_idx"
  ON "finance_drafts" ("semantic_fingerprint");

ALTER TABLE "finance_transactions"
  ADD COLUMN IF NOT EXISTS "semantic_fingerprint" varchar(64);

CREATE INDEX IF NOT EXISTS "finance_transactions_semantic_fingerprint_idx"
  ON "finance_transactions" ("semantic_fingerprint");
