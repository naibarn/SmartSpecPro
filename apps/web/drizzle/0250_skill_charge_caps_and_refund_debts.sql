ALTER TABLE "skill_revenue_settlements"
  ADD COLUMN "configuredTotalCredits" integer NOT NULL DEFAULT 0,
  ADD COLUMN "actualWorkCredits" integer,
  ADD COLUMN "chargedTotalCredits" integer NOT NULL DEFAULT 0,
  ADD COLUMN "pricingSource" varchar(64) NOT NULL DEFAULT 'skill_config',
  ADD COLUMN "capApplied" boolean NOT NULL DEFAULT false;

-- Existing settlements were created before the charge-audit fields existed;
-- preserve their already-recorded amount and leave actual work unknown.
UPDATE "skill_revenue_settlements"
SET "configuredTotalCredits" = "totalCredits",
    "chargedTotalCredits" = "totalCredits"
WHERE "configuredTotalCredits" = 0 AND "totalCredits" > 0;

ALTER TABLE "skill_revenue_settlements"
  ADD CONSTRAINT "skill_revenue_settlements_charge_audit_non_negative"
    CHECK ("configuredTotalCredits" >= 0 AND "chargedTotalCredits" >= 0 AND ("actualWorkCredits" IS NULL OR "actualWorkCredits" >= 0)),
  ADD CONSTRAINT "skill_revenue_settlements_charge_does_not_exceed_config"
    CHECK ("chargedTotalCredits" <= "configuredTotalCredits"),
  ADD CONSTRAINT "skill_revenue_settlements_charge_does_not_exceed_work"
    CHECK ("actualWorkCredits" IS NULL OR "chargedTotalCredits" <= "actualWorkCredits");

DO $$ BEGIN
  CREATE TYPE "skill_revenue_debt_status" AS ENUM ('open', 'settled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "skill_revenue_debts" (
  "id" serial PRIMARY KEY NOT NULL,
  "settlementId" integer NOT NULL,
  "recipientId" integer NOT NULL,
  "amount" integer NOT NULL,
  "recoveredCredits" integer NOT NULL DEFAULT 0,
  "status" "skill_revenue_debt_status" NOT NULL DEFAULT 'open',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "settledAt" timestamptz,
  CONSTRAINT "skill_revenue_debts_amounts_valid"
    CHECK ("amount" >= 0 AND "recoveredCredits" >= 0 AND "recoveredCredits" <= "amount"),
  CONSTRAINT "skill_revenue_debts_settlement_fk"
    FOREIGN KEY ("settlementId") REFERENCES "skill_revenue_settlements"("id") ON DELETE CASCADE,
  CONSTRAINT "skill_revenue_debts_recipient_fk"
    FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "skill_revenue_debts_settlement_recipient_unique"
  ON "skill_revenue_debts" ("settlementId", "recipientId");
CREATE INDEX IF NOT EXISTS "skill_revenue_debts_recipient_status_idx"
  ON "skill_revenue_debts" ("recipientId", "status");
