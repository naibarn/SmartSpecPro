-- Older application processes may have written the original totalCredits
-- before the audit columns existed. Preserve that durable ledger amount and
-- only backfill rows where actual work was not recorded, never infer work.
UPDATE "skill_revenue_settlements"
SET "configuredTotalCredits" = GREATEST("configuredTotalCredits", "totalCredits"),
    "chargedTotalCredits" = "totalCredits"
WHERE "actualWorkCredits" IS NULL
  AND ("chargedTotalCredits" <> "totalCredits" OR "configuredTotalCredits" < "totalCredits");

ALTER TABLE "skill_revenue_settlements"
  ADD CONSTRAINT "skill_revenue_settlements_charge_matches_total"
    CHECK ("chargedTotalCredits" = "totalCredits");
