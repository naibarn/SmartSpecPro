ALTER TABLE "library_knowledge_release_gate_overrides"
  ADD COLUMN IF NOT EXISTS "override_mode" varchar(32) DEFAULT 'standard' NOT NULL;

ALTER TABLE "library_knowledge_release_gate_overrides"
  ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;

ALTER TABLE "library_knowledge_release_gate_overrides"
  ADD COLUMN IF NOT EXISTS "approval_reason" text;

ALTER TABLE "library_knowledge_release_gate_overrides"
  ADD COLUMN IF NOT EXISTS "rejected_at" timestamp with time zone;

ALTER TABLE "library_knowledge_release_gate_overrides"
  ADD COLUMN IF NOT EXISTS "rejected_by_user_id" integer REFERENCES "users"("id") ON DELETE set null;

ALTER TABLE "library_knowledge_release_gate_overrides"
  ADD COLUMN IF NOT EXISTS "rejected_reason" text;

UPDATE "library_knowledge_release_gate_overrides"
SET
  "override_mode" = 'standard',
  "approved_at" = CASE
    WHEN "status" = 'active'
      AND "approved_by_user_id" IS NOT NULL
      AND "approved_at" IS NULL
    THEN "created_at"
    ELSE "approved_at"
  END
WHERE
  "override_mode" IS DISTINCT FROM 'standard'
  OR (
    "status" = 'active'
    AND "approved_by_user_id" IS NOT NULL
    AND "approved_at" IS NULL
  );

CREATE INDEX IF NOT EXISTS "library_knowledge_release_gate_overrides_status_created_idx"
  ON "library_knowledge_release_gate_overrides" ("tenant_id", "status", "created_at");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'library_knowledge_release_gate_overrides_status_check'
  ) THEN
    ALTER TABLE "library_knowledge_release_gate_overrides"
      DROP CONSTRAINT "library_knowledge_release_gate_overrides_status_check";
  END IF;

  ALTER TABLE "library_knowledge_release_gate_overrides"
    ADD CONSTRAINT "library_knowledge_release_gate_overrides_status_check"
    CHECK ("status" IN (
      'pending_approval',
      'active',
      'rejected',
      'revoked',
      'expired'
    ));

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'library_knowledge_release_gate_overrides_mode_check'
  ) THEN
    ALTER TABLE "library_knowledge_release_gate_overrides"
      DROP CONSTRAINT "library_knowledge_release_gate_overrides_mode_check";
  END IF;

  ALTER TABLE "library_knowledge_release_gate_overrides"
    ADD CONSTRAINT "library_knowledge_release_gate_overrides_mode_check"
    CHECK ("override_mode" IN ('standard', 'break_glass'));
END $$;
