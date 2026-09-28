ALTER TABLE "skills"
  ADD COLUMN "tenantCreditCost" integer NOT NULL DEFAULT 2,
  ADD COLUMN "skillOwnerCreditCost" integer NOT NULL DEFAULT 0;

ALTER TABLE "skills"
  ADD CONSTRAINT "skills_tenant_credit_cost_non_negative"
    CHECK ("tenantCreditCost" >= 0),
  ADD CONSTRAINT "skills_skill_owner_credit_cost_non_negative"
    CHECK ("skillOwnerCreditCost" >= 0);

DO $$ BEGIN
  CREATE TYPE "skill_revenue_settlement_status" AS ENUM ('settled', 'reversed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "skill_revenue_settlements" (
  "id" serial PRIMARY KEY NOT NULL,
  "runId" varchar(191) NOT NULL,
  "skillId" integer,
  "skillSlug" varchar(128) NOT NULL,
  "tenantId" varchar(36),
  "userId" integer NOT NULL,
  "tenantOwnerId" integer,
  "skillOwnerId" integer,
  "tenantCredits" integer NOT NULL DEFAULT 0,
  "skillOwnerCredits" integer NOT NULL DEFAULT 0,
  "totalCredits" integer NOT NULL DEFAULT 0,
  "userTransactionId" integer,
  "tenantRevenueTransactionId" integer,
  "skillRevenueTransactionId" integer,
  "status" "skill_revenue_settlement_status" NOT NULL DEFAULT 'settled',
  "reversedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "skill_revenue_settlements_amounts_non_negative"
    CHECK ("tenantCredits" >= 0 AND "skillOwnerCredits" >= 0 AND "totalCredits" >= 0),
  CONSTRAINT "skill_revenue_settlements_skill_id_fk"
    FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE SET NULL,
  CONSTRAINT "skill_revenue_settlements_tenant_id_fk"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL,
  CONSTRAINT "skill_revenue_settlements_user_id_fk"
    FOREIGN KEY ("userId") REFERENCES "users"("id"),
  CONSTRAINT "skill_revenue_settlements_tenant_owner_id_fk"
    FOREIGN KEY ("tenantOwnerId") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "skill_revenue_settlements_skill_owner_id_fk"
    FOREIGN KEY ("skillOwnerId") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "skill_revenue_settlements_user_tx_fk"
    FOREIGN KEY ("userTransactionId") REFERENCES "credit_transactions"("id") ON DELETE SET NULL,
  CONSTRAINT "skill_revenue_settlements_tenant_tx_fk"
    FOREIGN KEY ("tenantRevenueTransactionId") REFERENCES "credit_transactions"("id") ON DELETE SET NULL,
  CONSTRAINT "skill_revenue_settlements_skill_tx_fk"
    FOREIGN KEY ("skillRevenueTransactionId") REFERENCES "credit_transactions"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "skill_revenue_settlements_run_id_unique"
  ON "skill_revenue_settlements" ("runId");
CREATE INDEX IF NOT EXISTS "skill_revenue_settlements_user_created_idx"
  ON "skill_revenue_settlements" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "skill_revenue_settlements_tenant_created_idx"
  ON "skill_revenue_settlements" ("tenantId", "createdAt");
