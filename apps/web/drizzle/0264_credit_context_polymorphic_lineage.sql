CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
ALTER TABLE "credit_transactions"
  ADD COLUMN IF NOT EXISTS "tenantId" varchar(36);
--> statement-breakpoint
ALTER TABLE "credit_transactions"
  ADD COLUMN IF NOT EXISTS "reversalOfTransactionId" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_transactions_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "credit_transactions"
      ADD CONSTRAINT "credit_transactions_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_transactions_reversal_fk') THEN
    ALTER TABLE "credit_transactions"
      ADD CONSTRAINT "credit_transactions_reversal_fk"
      FOREIGN KEY ("reversalOfTransactionId") REFERENCES "credit_transactions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_contexts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "ownerUserId" integer,
  "contextType" varchar(32) NOT NULL,
  "sourceType" varchar(96) NOT NULL,
  "sourceId" varchar(191) NOT NULL,
  "contextKey" varchar(300) NOT NULL,
  "parentContextId" uuid,
  "rootContextId" uuid,
  "displayNameSnapshot" varchar(255),
  "displayTypeSnapshot" varchar(64),
  "resolutionState" varchar(32) DEFAULT 'unresolved' NOT NULL,
  "attributionStatus" varchar(32) DEFAULT 'unattributed' NOT NULL,
  "sourceRevision" varchar(128),
  "snapshotJson" jsonb,
  "resolverVersion" varchar(32) DEFAULT '1' NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "archivedAt" timestamp with time zone
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_contexts_tenant_fk') THEN
    ALTER TABLE "credit_contexts" ADD CONSTRAINT "credit_contexts_tenant_fk"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_contexts_owner_fk') THEN
    ALTER TABLE "credit_contexts" ADD CONSTRAINT "credit_contexts_owner_fk"
      FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_contexts_parent_fk') THEN
    ALTER TABLE "credit_contexts" ADD CONSTRAINT "credit_contexts_parent_fk"
      FOREIGN KEY ("parentContextId") REFERENCES "credit_contexts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_contexts_root_fk') THEN
    ALTER TABLE "credit_contexts" ADD CONSTRAINT "credit_contexts_root_fk"
      FOREIGN KEY ("rootContextId") REFERENCES "credit_contexts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_contexts_non_empty_keys_check') THEN
    ALTER TABLE "credit_contexts" ADD CONSTRAINT "credit_contexts_non_empty_keys_check"
      CHECK (length(btrim("contextType")) > 0 AND length(btrim("sourceType")) > 0 AND length(btrim("sourceId")) > 0 AND length(btrim("contextKey")) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_contexts_not_self_parent_check') THEN
    ALTER TABLE "credit_contexts" ADD CONSTRAINT "credit_contexts_not_self_parent_check"
      CHECK ("parentContextId" IS NULL OR "parentContextId" <> "id");
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_contexts_tenant_context_key_unique"
  ON "credit_contexts" USING btree ("tenantId", "contextKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_contexts_tenant_root_created_idx"
  ON "credit_contexts" USING btree ("tenantId", "rootContextId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_contexts_tenant_type_source_idx"
  ON "credit_contexts" USING btree ("tenantId", "contextType", "sourceType", "sourceId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_contexts_tenant_owner_updated_idx"
  ON "credit_contexts" USING btree ("tenantId", "ownerUserId", "updatedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_contexts_parent_idx"
  ON "credit_contexts" USING btree ("parentContextId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_transaction_contexts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "transactionId" integer NOT NULL,
  "contextId" uuid NOT NULL,
  "relationType" varchar(32) NOT NULL,
  "isPrimary" boolean DEFAULT false NOT NULL,
  "provenance" varchar(32) NOT NULL,
  "confidence" real,
  "reasonCode" varchar(64),
  "displayNameSnapshot" varchar(255),
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_transaction_contexts_transaction_fk') THEN
    ALTER TABLE "credit_transaction_contexts" ADD CONSTRAINT "credit_transaction_contexts_transaction_fk"
      FOREIGN KEY ("transactionId") REFERENCES "credit_transactions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_transaction_contexts_context_fk') THEN
    ALTER TABLE "credit_transaction_contexts" ADD CONSTRAINT "credit_transaction_contexts_context_fk"
      FOREIGN KEY ("contextId") REFERENCES "credit_contexts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_transaction_contexts_primary_relation_check') THEN
    ALTER TABLE "credit_transaction_contexts" ADD CONSTRAINT "credit_transaction_contexts_primary_relation_check"
      CHECK ("isPrimary" = false OR "relationType" IN ('primary_work', 'reversal', 'work_adjustment'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_transaction_contexts_confidence_check') THEN
    ALTER TABLE "credit_transaction_contexts" ADD CONSTRAINT "credit_transaction_contexts_confidence_check"
      CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_transaction_contexts_transaction_context_relation_unique"
  ON "credit_transaction_contexts" USING btree ("transactionId", "contextId", "relationType");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_transaction_contexts_one_primary_unique"
  ON "credit_transaction_contexts" USING btree ("transactionId") WHERE "isPrimary" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transaction_contexts_context_transaction_idx"
  ON "credit_transaction_contexts" USING btree ("contextId", "transactionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transaction_contexts_transaction_context_idx"
  ON "credit_transaction_contexts" USING btree ("transactionId", "contextId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transaction_contexts_relation_transaction_idx"
  ON "credit_transaction_contexts" USING btree ("relationType", "transactionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transaction_contexts_relation_context_transaction_idx"
  ON "credit_transaction_contexts" USING btree ("relationType", "contextId", "transactionId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_context_backfill_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "mode" varchar(16) NOT NULL,
  "status" varchar(16) NOT NULL,
  "schemaVersion" varchar(32) NOT NULL,
  "resolverVersion" varchar(32) NOT NULL,
  "lastTransactionId" integer,
  "scanThroughTransactionId" integer NOT NULL,
  "tenantId" varchar(36),
  "userId" integer,
  "batchSize" integer DEFAULT 100 NOT NULL,
  "countersJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "operatorId" varchar(128) NOT NULL,
  "leaseOwner" varchar(128),
  "leaseExpiresAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "completedAt" timestamp with time zone
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_context_backfill_runs_tenant_fk') THEN
    ALTER TABLE "credit_context_backfill_runs" ADD CONSTRAINT "credit_context_backfill_runs_tenant_fk"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_context_backfill_runs_user_fk') THEN
    ALTER TABLE "credit_context_backfill_runs" ADD CONSTRAINT "credit_context_backfill_runs_user_fk"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_context_backfill_runs_status_mode_updated_idx"
  ON "credit_context_backfill_runs" USING btree ("status", "mode", "updatedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_context_backfill_runs_scope_status_updated_idx"
  ON "credit_context_backfill_runs" USING btree ("tenantId", "userId", "status", "updatedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transactions_tenant_id_idx"
  ON "credit_transactions" USING btree ("tenantId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transactions_reversal_of_idx"
  ON "credit_transactions" USING btree ("reversalOfTransactionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transactions_tenant_type_created_idx"
  ON "credit_transactions" USING btree ("tenantId", "type", "createdAt", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transactions_user_tenant_created_idx"
  ON "credit_transactions" USING btree ("userId", "tenantId", "createdAt", "id");
--> statement-breakpoint
DO $$
DECLARE
  required_column text;
BEGIN
  -- CREATE IF NOT EXISTS must not silently accept an incompatible pre-existing
  -- object. Fail the migration before the application can write partial
  -- lineage data when a required table/column is missing.
  FOREACH required_column IN ARRAY ARRAY[
    'credit_transactions.tenantId',
    'credit_transactions.reversalOfTransactionId',
    'credit_contexts.id', 'credit_contexts.tenantId',
    'credit_contexts.ownerUserId', 'credit_contexts.contextType',
    'credit_contexts.sourceType', 'credit_contexts.sourceId',
    'credit_contexts.contextKey', 'credit_contexts.parentContextId',
    'credit_contexts.rootContextId', 'credit_contexts.displayNameSnapshot',
    'credit_contexts.displayTypeSnapshot', 'credit_contexts.resolutionState',
    'credit_contexts.attributionStatus', 'credit_contexts.sourceRevision',
    'credit_contexts.snapshotJson', 'credit_contexts.resolverVersion',
    'credit_transaction_contexts.id',
    'credit_transaction_contexts.transactionId',
    'credit_transaction_contexts.contextId',
    'credit_transaction_contexts.relationType',
    'credit_transaction_contexts.isPrimary',
    'credit_transaction_contexts.provenance',
    'credit_transaction_contexts.reasonCode',
    'credit_transaction_contexts.displayNameSnapshot',
    'credit_context_backfill_runs.id',
    'credit_context_backfill_runs.mode',
    'credit_context_backfill_runs.status',
    'credit_context_backfill_runs.schemaVersion',
    'credit_context_backfill_runs.resolverVersion',
    'credit_context_backfill_runs.lastTransactionId',
    'credit_context_backfill_runs.scanThroughTransactionId',
    'credit_context_backfill_runs.tenantId',
    'credit_context_backfill_runs.userId',
    'credit_context_backfill_runs.countersJson',
    'credit_context_backfill_runs.leaseOwner',
    'credit_context_backfill_runs.leaseExpiresAt'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = current_schema()
        AND c.table_name = split_part(required_column, '.', 1)
        AND c.column_name = split_part(required_column, '.', 2)
    ) THEN
      RAISE EXCEPTION 'Feature 166 migration validation failed: missing column %', required_column;
    END IF;
  END LOOP;
END $$;
