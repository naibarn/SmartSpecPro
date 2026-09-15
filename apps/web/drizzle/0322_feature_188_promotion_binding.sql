-- Feature 188 — bind an activation control to the exact promotion candidate.
-- Additive only; an unactivated control may remain unbound.
ALTER TABLE "platform_release_controls"
  ADD COLUMN IF NOT EXISTS "promotionId" varchar(36);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_release_controls_promotion_fk'
  ) THEN
    ALTER TABLE "platform_release_controls"
      ADD CONSTRAINT "platform_release_controls_promotion_fk"
      FOREIGN KEY ("promotionId")
      REFERENCES "data_promotions"("id")
      ON DELETE RESTRICT;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_release_controls_promotion_idx"
  ON "platform_release_controls" ("promotionId");
