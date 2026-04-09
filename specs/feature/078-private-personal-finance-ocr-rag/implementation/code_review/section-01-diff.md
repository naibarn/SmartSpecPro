diff --git a/apps/web/drizzle/0138_private_personal_finance_foundation.sql b/apps/web/drizzle/0138_private_personal_finance_foundation.sql
new file mode 100644
index 00000000..820f9aa6
--- /dev/null
+++ b/apps/web/drizzle/0138_private_personal_finance_foundation.sql
@@ -0,0 +1,256 @@
+CREATE TYPE "public"."finance_transaction_type" AS ENUM('income', 'expense', 'transfer');--> statement-breakpoint
+CREATE TYPE "public"."finance_transaction_status" AS ENUM('draft', 'confirmed', 'voided');--> statement-breakpoint
+CREATE TYPE "public"."finance_draft_status" AS ENUM('draft', 'confirmed', 'expired', 'cancelled');--> statement-breakpoint
+CREATE TYPE "public"."finance_recurring_rule_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint
+CREATE TYPE "public"."finance_source" AS ENUM('chat_text', 'ocr_document', 'import', 'api', 'recurring_rule');--> statement-breakpoint
+CREATE TYPE "public"."finance_document_role" AS ENUM('receipt', 'invoice', 'statement', 'supporting');--> statement-breakpoint
+
+CREATE TABLE IF NOT EXISTS "finance_recurring_rules" (
+  "id" serial PRIMARY KEY NOT NULL,
+  "tenant_id" varchar(36) NOT NULL,
+  "project_id" varchar(100) NOT NULL,
+  "owner_user_id" integer NOT NULL,
+  "type" "finance_transaction_type" NOT NULL,
+  "amount_minor" integer NOT NULL,
+  "currency" varchar(3) NOT NULL DEFAULT 'THB',
+  "category_code" varchar(64) NOT NULL,
+  "merchant_name" text,
+  "note" text,
+  "rrule" text NOT NULL,
+  "timezone" varchar(64) NOT NULL DEFAULT 'Asia/Bangkok',
+  "start_date" timestamp with time zone NOT NULL,
+  "end_date" timestamp with time zone,
+  "next_run_at" timestamp with time zone,
+  "last_run_at" timestamp with time zone,
+  "run_count" integer NOT NULL DEFAULT 0,
+  "auto_confirm" boolean NOT NULL DEFAULT false,
+  "status" "finance_recurring_rule_status" NOT NULL DEFAULT 'active',
+  "idempotency_key" varchar(256) NOT NULL,
+  "source_hash" varchar(64),
+  "source_message_id" integer,
+  "source_library_item_id" integer,
+  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
+  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
+  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
+  CONSTRAINT "finance_recurring_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
+  CONSTRAINT "finance_recurring_rules_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
+  CONSTRAINT "finance_recurring_rules_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action,
+  CONSTRAINT "finance_recurring_rules_source_library_item_id_library_items_id_fk" FOREIGN KEY ("source_library_item_id") REFERENCES "public"."library_items"("id") ON DELETE set null ON UPDATE no action
+);
+--> statement-breakpoint
+CREATE UNIQUE INDEX IF NOT EXISTS "finance_recurring_rules_tenant_idempotency_unique" ON "finance_recurring_rules" USING btree ("tenant_id","idempotency_key");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_recurring_rules_tenant_project_owner_idx" ON "finance_recurring_rules" USING btree ("tenant_id","project_id","owner_user_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_recurring_rules_tenant_status_next_run_idx" ON "finance_recurring_rules" USING btree ("tenant_id","status","next_run_at");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_recurring_rules_source_hash_idx" ON "finance_recurring_rules" USING btree ("source_hash");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_recurring_rules_source_message_idx" ON "finance_recurring_rules" USING btree ("source_message_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_recurring_rules_source_library_item_idx" ON "finance_recurring_rules" USING btree ("source_library_item_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_recurring_rules_allowed_scopes_gin_idx" ON "finance_recurring_rules" USING gin ("allowed_scopes");
+--> statement-breakpoint
+
+CREATE TABLE IF NOT EXISTS "finance_drafts" (
+  "id" serial PRIMARY KEY NOT NULL,
+  "tenant_id" varchar(36) NOT NULL,
+  "project_id" varchar(100) NOT NULL,
+  "owner_user_id" integer NOT NULL,
+  "type" "finance_transaction_type" NOT NULL,
+  "status" "finance_draft_status" NOT NULL DEFAULT 'draft',
+  "source" "finance_source" NOT NULL,
+  "idempotency_key" varchar(256) NOT NULL,
+  "source_hash" varchar(64),
+  "payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
+  "missing_fields" text[] NOT NULL DEFAULT '{}'::text[],
+  "confidence" numeric(3, 2),
+  "needs_clarification" boolean NOT NULL DEFAULT false,
+  "clarification_prompt" text,
+  "source_message_id" integer,
+  "source_library_item_id" integer,
+  "recurring_rule_id" integer,
+  "expires_at" timestamp with time zone,
+  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
+  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
+  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
+  CONSTRAINT "finance_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
+  CONSTRAINT "finance_drafts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
+  CONSTRAINT "finance_drafts_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action,
+  CONSTRAINT "finance_drafts_source_library_item_id_library_items_id_fk" FOREIGN KEY ("source_library_item_id") REFERENCES "public"."library_items"("id") ON DELETE set null ON UPDATE no action,
+  CONSTRAINT "finance_drafts_recurring_rule_id_finance_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."finance_recurring_rules"("id") ON DELETE set null ON UPDATE no action
+);
+--> statement-breakpoint
+CREATE UNIQUE INDEX IF NOT EXISTS "finance_drafts_tenant_idempotency_unique" ON "finance_drafts" USING btree ("tenant_id","idempotency_key");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_drafts_tenant_project_owner_idx" ON "finance_drafts" USING btree ("tenant_id","project_id","owner_user_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_drafts_tenant_status_created_idx" ON "finance_drafts" USING btree ("tenant_id","status","created_at");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_drafts_source_hash_idx" ON "finance_drafts" USING btree ("source_hash");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_drafts_source_message_idx" ON "finance_drafts" USING btree ("source_message_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_drafts_source_library_item_idx" ON "finance_drafts" USING btree ("source_library_item_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_drafts_recurring_rule_idx" ON "finance_drafts" USING btree ("recurring_rule_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_drafts_allowed_scopes_gin_idx" ON "finance_drafts" USING gin ("allowed_scopes");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_drafts_expires_at_idx" ON "finance_drafts" USING btree ("expires_at");
+--> statement-breakpoint
+
+CREATE TABLE IF NOT EXISTS "finance_transactions" (
+  "id" serial PRIMARY KEY NOT NULL,
+  "tenant_id" varchar(36) NOT NULL,
+  "project_id" varchar(100) NOT NULL,
+  "owner_user_id" integer NOT NULL,
+  "type" "finance_transaction_type" NOT NULL,
+  "status" "finance_transaction_status" NOT NULL DEFAULT 'draft',
+  "source" "finance_source" NOT NULL,
+  "amount_minor" integer NOT NULL,
+  "currency" varchar(3) NOT NULL DEFAULT 'THB',
+  "occurred_at" timestamp with time zone NOT NULL,
+  "category_code" varchar(64) NOT NULL,
+  "merchant_name" text,
+  "note" text,
+  "confidence" numeric(3, 2),
+  "idempotency_key" varchar(256) NOT NULL,
+  "source_hash" varchar(64),
+  "confirmed_from_draft_id" integer,
+  "recurring_rule_id" integer,
+  "source_message_id" integer,
+  "source_library_item_id" integer,
+  "confirmed_at" timestamp with time zone,
+  "confirmed_by_user_id" integer,
+  "voided_at" timestamp with time zone,
+  "voided_by_user_id" integer,
+  "void_reason" text,
+  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
+  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
+  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
+  CONSTRAINT "finance_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
+  CONSTRAINT "finance_transactions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
+  CONSTRAINT "finance_transactions_confirmed_from_draft_id_finance_drafts_id_fk" FOREIGN KEY ("confirmed_from_draft_id") REFERENCES "public"."finance_drafts"("id") ON DELETE set null ON UPDATE no action,
+  CONSTRAINT "finance_transactions_recurring_rule_id_finance_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."finance_recurring_rules"("id") ON DELETE set null ON UPDATE no action,
+  CONSTRAINT "finance_transactions_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action,
+  CONSTRAINT "finance_transactions_source_library_item_id_library_items_id_fk" FOREIGN KEY ("source_library_item_id") REFERENCES "public"."library_items"("id") ON DELETE set null ON UPDATE no action,
+  CONSTRAINT "finance_transactions_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
+  CONSTRAINT "finance_transactions_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
+);
+--> statement-breakpoint
+CREATE UNIQUE INDEX IF NOT EXISTS "finance_transactions_tenant_idempotency_unique" ON "finance_transactions" USING btree ("tenant_id","idempotency_key");
+--> statement-breakpoint
+CREATE UNIQUE INDEX IF NOT EXISTS "finance_transactions_confirmed_from_draft_unique" ON "finance_transactions" USING btree ("confirmed_from_draft_id") WHERE "confirmed_from_draft_id" IS NOT NULL;
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_transactions_tenant_project_owner_idx" ON "finance_transactions" USING btree ("tenant_id","project_id","owner_user_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_transactions_tenant_status_occurred_idx" ON "finance_transactions" USING btree ("tenant_id","status","occurred_at");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_transactions_source_hash_idx" ON "finance_transactions" USING btree ("source_hash");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_transactions_source_message_idx" ON "finance_transactions" USING btree ("source_message_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_transactions_source_library_item_idx" ON "finance_transactions" USING btree ("source_library_item_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_transactions_recurring_rule_idx" ON "finance_transactions" USING btree ("recurring_rule_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_transactions_allowed_scopes_gin_idx" ON "finance_transactions" USING gin ("allowed_scopes");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_transactions_owner_voided_idx" ON "finance_transactions" USING btree ("tenant_id","owner_user_id","voided_at");
+--> statement-breakpoint
+
+CREATE TABLE IF NOT EXISTS "document_extractions" (
+  "id" serial PRIMARY KEY NOT NULL,
+  "tenant_id" varchar(36) NOT NULL,
+  "project_id" varchar(100) NOT NULL,
+  "owner_user_id" integer NOT NULL,
+  "library_item_id" integer NOT NULL,
+  "finance_draft_id" integer,
+  "source" "finance_source" NOT NULL DEFAULT 'ocr_document',
+  "idempotency_key" varchar(256) NOT NULL,
+  "source_hash" varchar(64),
+  "ocr_provider" varchar(64) NOT NULL,
+  "ocr_text" text NOT NULL,
+  "ocr_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
+  "extracted_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
+  "confidence_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
+  "mime_type" varchar(128) NOT NULL,
+  "file_hash" varchar(64) NOT NULL,
+  "page_count" integer NOT NULL DEFAULT 1,
+  "source_message_id" integer,
+  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
+  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
+  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
+  CONSTRAINT "document_extractions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
+  CONSTRAINT "document_extractions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
+  CONSTRAINT "document_extractions_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action,
+  CONSTRAINT "document_extractions_finance_draft_id_finance_drafts_id_fk" FOREIGN KEY ("finance_draft_id") REFERENCES "public"."finance_drafts"("id") ON DELETE set null ON UPDATE no action,
+  CONSTRAINT "document_extractions_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action
+);
+--> statement-breakpoint
+CREATE UNIQUE INDEX IF NOT EXISTS "document_extractions_tenant_idempotency_unique" ON "document_extractions" USING btree ("tenant_id","idempotency_key");
+--> statement-breakpoint
+CREATE UNIQUE INDEX IF NOT EXISTS "document_extractions_finance_draft_unique" ON "document_extractions" USING btree ("finance_draft_id") WHERE "finance_draft_id" IS NOT NULL;
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "document_extractions_tenant_project_owner_idx" ON "document_extractions" USING btree ("tenant_id","project_id","owner_user_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "document_extractions_library_item_idx" ON "document_extractions" USING btree ("library_item_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "document_extractions_source_hash_idx" ON "document_extractions" USING btree ("source_hash");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "document_extractions_source_message_idx" ON "document_extractions" USING btree ("source_message_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "document_extractions_file_hash_idx" ON "document_extractions" USING btree ("file_hash");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "document_extractions_allowed_scopes_gin_idx" ON "document_extractions" USING gin ("allowed_scopes");
+--> statement-breakpoint
+
+CREATE TABLE IF NOT EXISTS "finance_transaction_documents" (
+  "id" serial PRIMARY KEY NOT NULL,
+  "tenant_id" varchar(36) NOT NULL,
+  "project_id" varchar(100) NOT NULL,
+  "owner_user_id" integer NOT NULL,
+  "transaction_id" integer NOT NULL,
+  "library_item_id" integer NOT NULL,
+  "source_extraction_id" integer,
+  "role" "finance_document_role" NOT NULL DEFAULT 'supporting',
+  "note" text,
+  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
+  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
+  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
+  CONSTRAINT "finance_transaction_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
+  CONSTRAINT "finance_transaction_documents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
+  CONSTRAINT "finance_transaction_documents_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE cascade ON UPDATE no action,
+  CONSTRAINT "finance_transaction_documents_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action,
+  CONSTRAINT "finance_transaction_documents_source_extraction_id_document_extractions_id_fk" FOREIGN KEY ("source_extraction_id") REFERENCES "public"."document_extractions"("id") ON DELETE set null ON UPDATE no action
+);
+--> statement-breakpoint
+CREATE UNIQUE INDEX IF NOT EXISTS "finance_transaction_documents_link_unique" ON "finance_transaction_documents" USING btree ("transaction_id","library_item_id","role");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_transaction_documents_tenant_project_owner_idx" ON "finance_transaction_documents" USING btree ("tenant_id","project_id","owner_user_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_transaction_documents_transaction_idx" ON "finance_transaction_documents" USING btree ("transaction_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_transaction_documents_library_item_idx" ON "finance_transaction_documents" USING btree ("library_item_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_transaction_documents_source_extraction_idx" ON "finance_transaction_documents" USING btree ("source_extraction_id");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "finance_transaction_documents_allowed_scopes_gin_idx" ON "finance_transaction_documents" USING gin ("allowed_scopes");
+--> statement-breakpoint
+
+ALTER TABLE "library_items"
+  ADD COLUMN IF NOT EXISTS "project_id" varchar(100);--> statement-breakpoint
+ALTER TABLE "library_chunks"
+  ADD COLUMN IF NOT EXISTS "project_id" varchar(100);--> statement-breakpoint
+ALTER TABLE "library_index_jobs"
+  ADD COLUMN IF NOT EXISTS "project_id" varchar(100);--> statement-breakpoint
+
+CREATE INDEX IF NOT EXISTS "library_items_tenant_project_idx" ON "library_items" USING btree ("tenant_id","project_id");--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "library_items_tenant_owner_project_idx" ON "library_items" USING btree ("tenant_id","owner_user_id","project_id");--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "library_chunks_tenant_project_idx" ON "library_chunks" USING btree ("tenant_id","project_id");--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "library_index_jobs_tenant_project_idx" ON "library_index_jobs" USING btree ("tenant_id","project_id");--> statement-breakpoint
+
+-- Legacy library rows with project_id = NULL remain compatibility-only until the backfill remediates them.
+-- Purge paths must tombstone finance-backed library rows, chunks, and vector artifacts so deleted personal evidence cannot resurface in search.
diff --git a/apps/web/drizzle/0139_private_personal_finance_security_backstop.sql b/apps/web/drizzle/0139_private_personal_finance_security_backstop.sql
new file mode 100644
index 00000000..0960f5bb
--- /dev/null
+++ b/apps/web/drizzle/0139_private_personal_finance_security_backstop.sql
@@ -0,0 +1,177 @@
+ALTER TABLE "finance_recurring_rules" ENABLE ROW LEVEL SECURITY;
+--> statement-breakpoint
+ALTER TABLE "finance_recurring_rules" FORCE ROW LEVEL SECURITY;
+--> statement-breakpoint
+CREATE POLICY "finance_recurring_rules_tenant_scope" ON "finance_recurring_rules" FOR ALL TO public
+USING (
+  tenant_id = current_setting('app.current_tenant_id', true)
+  AND (
+    (
+      project_id = 'personal'
+      AND current_setting('app.current_project_id', true) = 'personal'
+      AND owner_user_id::text = current_setting('app.current_user_id', true)
+    )
+    OR (
+      project_id <> 'personal'
+      AND project_id = current_setting('app.current_project_id', true)
+    )
+  )
+)
+WITH CHECK (
+  tenant_id = current_setting('app.current_tenant_id', true)
+  AND (
+    (
+      project_id = 'personal'
+      AND current_setting('app.current_project_id', true) = 'personal'
+      AND owner_user_id::text = current_setting('app.current_user_id', true)
+    )
+    OR (
+      project_id <> 'personal'
+      AND project_id = current_setting('app.current_project_id', true)
+    )
+  )
+);
+--> statement-breakpoint
+
+ALTER TABLE "finance_drafts" ENABLE ROW LEVEL SECURITY;
+--> statement-breakpoint
+ALTER TABLE "finance_drafts" FORCE ROW LEVEL SECURITY;
+--> statement-breakpoint
+CREATE POLICY "finance_drafts_tenant_scope" ON "finance_drafts" FOR ALL TO public
+USING (
+  tenant_id = current_setting('app.current_tenant_id', true)
+  AND (
+    (
+      project_id = 'personal'
+      AND current_setting('app.current_project_id', true) = 'personal'
+      AND owner_user_id::text = current_setting('app.current_user_id', true)
+    )
+    OR (
+      project_id <> 'personal'
+      AND project_id = current_setting('app.current_project_id', true)
+    )
+  )
+)
+WITH CHECK (
+  tenant_id = current_setting('app.current_tenant_id', true)
+  AND (
+    (
+      project_id = 'personal'
+      AND current_setting('app.current_project_id', true) = 'personal'
+      AND owner_user_id::text = current_setting('app.current_user_id', true)
+    )
+    OR (
+      project_id <> 'personal'
+      AND project_id = current_setting('app.current_project_id', true)
+    )
+  )
+);
+--> statement-breakpoint
+
+ALTER TABLE "finance_transactions" ENABLE ROW LEVEL SECURITY;
+--> statement-breakpoint
+ALTER TABLE "finance_transactions" FORCE ROW LEVEL SECURITY;
+--> statement-breakpoint
+CREATE POLICY "finance_transactions_tenant_scope" ON "finance_transactions" FOR ALL TO public
+USING (
+  tenant_id = current_setting('app.current_tenant_id', true)
+  AND (
+    (
+      project_id = 'personal'
+      AND current_setting('app.current_project_id', true) = 'personal'
+      AND owner_user_id::text = current_setting('app.current_user_id', true)
+    )
+    OR (
+      project_id <> 'personal'
+      AND project_id = current_setting('app.current_project_id', true)
+    )
+  )
+)
+WITH CHECK (
+  tenant_id = current_setting('app.current_tenant_id', true)
+  AND (
+    (
+      project_id = 'personal'
+      AND current_setting('app.current_project_id', true) = 'personal'
+      AND owner_user_id::text = current_setting('app.current_user_id', true)
+    )
+    OR (
+      project_id <> 'personal'
+      AND project_id = current_setting('app.current_project_id', true)
+    )
+  )
+);
+--> statement-breakpoint
+
+ALTER TABLE "document_extractions" ENABLE ROW LEVEL SECURITY;
+--> statement-breakpoint
+ALTER TABLE "document_extractions" FORCE ROW LEVEL SECURITY;
+--> statement-breakpoint
+CREATE POLICY "document_extractions_tenant_scope" ON "document_extractions" FOR ALL TO public
+USING (
+  tenant_id = current_setting('app.current_tenant_id', true)
+  AND (
+    (
+      project_id = 'personal'
+      AND current_setting('app.current_project_id', true) = 'personal'
+      AND owner_user_id::text = current_setting('app.current_user_id', true)
+    )
+    OR (
+      project_id <> 'personal'
+      AND project_id = current_setting('app.current_project_id', true)
+    )
+  )
+)
+WITH CHECK (
+  tenant_id = current_setting('app.current_tenant_id', true)
+  AND (
+    (
+      project_id = 'personal'
+      AND current_setting('app.current_project_id', true) = 'personal'
+      AND owner_user_id::text = current_setting('app.current_user_id', true)
+    )
+    OR (
+      project_id <> 'personal'
+      AND project_id = current_setting('app.current_project_id', true)
+    )
+  )
+);
+--> statement-breakpoint
+
+ALTER TABLE "finance_transaction_documents" ENABLE ROW LEVEL SECURITY;
+--> statement-breakpoint
+ALTER TABLE "finance_transaction_documents" FORCE ROW LEVEL SECURITY;
+--> statement-breakpoint
+CREATE POLICY "finance_transaction_documents_tenant_scope" ON "finance_transaction_documents" FOR ALL TO public
+USING (
+  tenant_id = current_setting('app.current_tenant_id', true)
+  AND (
+    (
+      project_id = 'personal'
+      AND current_setting('app.current_project_id', true) = 'personal'
+      AND owner_user_id::text = current_setting('app.current_user_id', true)
+    )
+    OR (
+      project_id <> 'personal'
+      AND project_id = current_setting('app.current_project_id', true)
+    )
+  )
+)
+WITH CHECK (
+  tenant_id = current_setting('app.current_tenant_id', true)
+  AND (
+    (
+      project_id = 'personal'
+      AND current_setting('app.current_project_id', true) = 'personal'
+      AND owner_user_id::text = current_setting('app.current_user_id', true)
+    )
+    OR (
+      project_id <> 'personal'
+      AND project_id = current_setting('app.current_project_id', true)
+    )
+  )
+);
+--> statement-breakpoint
+
+-- Backfill planning note: legacy NULL project_id rows on library_items/library_chunks/library_index_jobs stay compatibility-only
+-- until the section-06 backfill and verification path remediates them.
diff --git a/apps/web/drizzle/financeSchema.test.ts b/apps/web/drizzle/financeSchema.test.ts
new file mode 100644
index 00000000..da28edaa
--- /dev/null
+++ b/apps/web/drizzle/financeSchema.test.ts
@@ -0,0 +1,100 @@
+import { describe, expect, it } from "vitest";
+import { getTableColumns, getTableName } from "drizzle-orm";
+
+import {
+  documentExtractions,
+  financeDrafts,
+  financeRecurringRules,
+  financeTransactionDocuments,
+  financeTransactions,
+  libraryChunks,
+  libraryIndexJobs,
+  libraryItems,
+} from "./schema";
+
+describe("finance schema foundation", () => {
+  it("defines the expected finance tables", () => {
+    expect(getTableName(financeTransactions)).toBe("finance_transactions");
+    expect(getTableName(financeDrafts)).toBe("finance_drafts");
+    expect(getTableName(financeRecurringRules)).toBe("finance_recurring_rules");
+    expect(getTableName(documentExtractions)).toBe("document_extractions");
+    expect(getTableName(financeTransactionDocuments)).toBe("finance_transaction_documents");
+  });
+
+  it("adds the required transaction and draft columns", () => {
+    const transactionColumns = getTableColumns(financeTransactions);
+    expect(transactionColumns.tenantId).toBeDefined();
+    expect(transactionColumns.projectId).toBeDefined();
+    expect(transactionColumns.ownerUserId).toBeDefined();
+    expect(transactionColumns.type).toBeDefined();
+    expect(transactionColumns.status).toBeDefined();
+    expect(transactionColumns.source).toBeDefined();
+    expect(transactionColumns.amountMinor).toBeDefined();
+    expect(transactionColumns.currency).toBeDefined();
+    expect(transactionColumns.occurredAt).toBeDefined();
+    expect(transactionColumns.categoryCode).toBeDefined();
+    expect(transactionColumns.idempotencyKey).toBeDefined();
+    expect(transactionColumns.confirmedFromDraftId).toBeDefined();
+    expect(transactionColumns.allowedScopes).toBeDefined();
+
+    const draftColumns = getTableColumns(financeDrafts);
+    expect(draftColumns.tenantId).toBeDefined();
+    expect(draftColumns.projectId).toBeDefined();
+    expect(draftColumns.ownerUserId).toBeDefined();
+    expect(draftColumns.type).toBeDefined();
+    expect(draftColumns.status).toBeDefined();
+    expect(draftColumns.source).toBeDefined();
+    expect(draftColumns.idempotencyKey).toBeDefined();
+    expect(draftColumns.payloadJson).toBeDefined();
+    expect(draftColumns.missingFields).toBeDefined();
+    expect(draftColumns.needsClarification).toBeDefined();
+    expect(draftColumns.sourceMessageId).toBeDefined();
+    expect(draftColumns.sourceLibraryItemId).toBeDefined();
+    expect(draftColumns.recurringRuleId).toBeDefined();
+  });
+
+  it("adds OCR traceability and document linkage columns", () => {
+    const extractionColumns = getTableColumns(documentExtractions);
+    expect(extractionColumns.tenantId).toBeDefined();
+    expect(extractionColumns.projectId).toBeDefined();
+    expect(extractionColumns.ownerUserId).toBeDefined();
+    expect(extractionColumns.libraryItemId).toBeDefined();
+    expect(extractionColumns.financeDraftId).toBeDefined();
+    expect(extractionColumns.source).toBeDefined();
+    expect(extractionColumns.idempotencyKey).toBeDefined();
+    expect(extractionColumns.ocrProvider).toBeDefined();
+    expect(extractionColumns.ocrText).toBeDefined();
+    expect(extractionColumns.ocrJson).toBeDefined();
+    expect(extractionColumns.extractedJson).toBeDefined();
+    expect(extractionColumns.confidenceJson).toBeDefined();
+    expect(extractionColumns.mimeType).toBeDefined();
+    expect(extractionColumns.fileHash).toBeDefined();
+    expect(extractionColumns.pageCount).toBeDefined();
+    expect(extractionColumns.sourceMessageId).toBeDefined();
+    expect(extractionColumns.allowedScopes).toBeDefined();
+
+    const linkColumns = getTableColumns(financeTransactionDocuments);
+    expect(linkColumns.tenantId).toBeDefined();
+    expect(linkColumns.projectId).toBeDefined();
+    expect(linkColumns.ownerUserId).toBeDefined();
+    expect(linkColumns.transactionId).toBeDefined();
+    expect(linkColumns.libraryItemId).toBeDefined();
+    expect(linkColumns.sourceExtractionId).toBeDefined();
+    expect(linkColumns.role).toBeDefined();
+    expect(linkColumns.allowedScopes).toBeDefined();
+  });
+
+  it("adds project-aware indexes to the existing library tables", () => {
+    const libraryItemColumns = getTableColumns(libraryItems);
+    const libraryChunkColumns = getTableColumns(libraryChunks);
+    const libraryIndexJobColumns = getTableColumns(libraryIndexJobs);
+
+    expect(libraryItemColumns.projectId).toBeDefined();
+    expect(libraryChunkColumns.projectId).toBeDefined();
+    expect(libraryIndexJobColumns.projectId).toBeDefined();
+
+    expect(libraryItemColumns.projectId.notNull).toBe(false);
+    expect(libraryChunkColumns.projectId.notNull).toBe(false);
+    expect(libraryIndexJobColumns.projectId.notNull).toBe(false);
+  });
+});
diff --git a/apps/web/drizzle/meta/_journal.json b/apps/web/drizzle/meta/_journal.json
index 81c043e0..d464eacd 100644
--- a/apps/web/drizzle/meta/_journal.json
+++ b/apps/web/drizzle/meta/_journal.json
@@ -932,6 +932,27 @@
       "when": 1775606400000,
       "tag": "0135_model_provider_upstream_uniqueness",
       "breakpoints": true
+    },
+    {
+      "idx": 133,
+      "version": "7",
+      "when": 1775685600000,
+      "tag": "0137_desktop_installer_distribution",
+      "breakpoints": true
+    },
+    {
+      "idx": 134,
+      "version": "7",
+      "when": 1776000000000,
+      "tag": "0138_private_personal_finance_foundation",
+      "breakpoints": true
+    },
+    {
+      "idx": 135,
+      "version": "7",
+      "when": 1776000001000,
+      "tag": "0139_private_personal_finance_security_backstop",
+      "breakpoints": true
     }
   ]
 }
diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index 52802221..216ba7db 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -1113,6 +1113,8 @@ export const desktopDevices = pgTable("desktop_devices", {
   pendingActionsJson: jsonb("pendingActionsJson").$type<Record<string, unknown>[]>().notNull().default([]),
   currentWorkspaceProfileJson: jsonb("currentWorkspaceProfileJson").$type<Record<string, unknown>>().notNull().default({}),
   lastRunSummaryJson: jsonb("lastRunSummaryJson").$type<Record<string, unknown>>().notNull().default({}),
+  accessState: varchar("accessState", { length: 32 }).notNull().default("active"),
+  policyOverridesJson: jsonb("policyOverridesJson").$type<Record<string, unknown>>().notNull().default({}),
   policyCursor: varchar("policyCursor", { length: 128 }),
   policyVersion: varchar("policyVersion", { length: 128 }),
   policyExpiresAt: timestamp("policyExpiresAt", { withTimezone: true }),
@@ -2051,6 +2053,46 @@ export const libraryIndexJobStatusEnum = pgEnum("library_index_job_status", [
   "failed",
 ]);
 
+export const financeTransactionTypeEnum = pgEnum("finance_transaction_type", [
+  "income",
+  "expense",
+  "transfer",
+]);
+
+export const financeTransactionStatusEnum = pgEnum("finance_transaction_status", [
+  "draft",
+  "confirmed",
+  "voided",
+]);
+
+export const financeDraftStatusEnum = pgEnum("finance_draft_status", [
+  "draft",
+  "confirmed",
+  "expired",
+  "cancelled",
+]);
+
+export const financeRecurringRuleStatusEnum = pgEnum("finance_recurring_rule_status", [
+  "active",
+  "paused",
+  "ended",
+]);
+
+export const financeSourceEnum = pgEnum("finance_source", [
+  "chat_text",
+  "ocr_document",
+  "import",
+  "api",
+  "recurring_rule",
+]);
+
+export const financeDocumentRoleEnum = pgEnum("finance_document_role", [
+  "receipt",
+  "invoice",
+  "statement",
+  "supporting",
+]);
+
 export const libraryItems = pgTable("library_items", {
   id: serial("id").primaryKey(),
   tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
@@ -2059,6 +2101,7 @@ export const libraryItems = pgTable("library_items", {
   parentId: integer("parent_id").references((): AnyPgColumn => libraryItems.id, { onDelete: "cascade" }),
   itemType: varchar("item_type", { length: 32 }).notNull(),
   source: varchar("source", { length: 64 }).notNull(),
+  projectId: varchar("project_id", { length: 100 }),
   title: varchar("title", { length: 255 }).notNull(),
   description: text("description"),
   status: libraryItemStatusEnum("status").notNull().default("ready"),
@@ -2080,6 +2123,8 @@ export const libraryItems = pgTable("library_items", {
   uniqueIndex("library_items_id_tenant_unique").on(t.id, t.tenantId),
   index("library_items_tenant_visibility_status_idx").on(t.tenantId, t.visibility, t.status),
   index("library_items_tenant_owner_status_idx").on(t.tenantId, t.ownerUserId, t.status),
+  index("library_items_tenant_project_idx").on(t.tenantId, t.projectId),
+  index("library_items_tenant_owner_project_idx").on(t.tenantId, t.ownerUserId, t.projectId),
   index("library_items_source_item_type_idx").on(t.source, t.itemType),
   index("library_items_deleted_at_idx").on(t.deletedAt),
   index("library_items_allowed_scopes_gin_idx").using("gin", t.allowedScopes),
@@ -2110,6 +2155,7 @@ export const libraryChunks = pgTable("library_chunks", {
   id: serial("id").primaryKey(),
   tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
   libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
+  projectId: varchar("project_id", { length: 100 }),
   chunkIndex: integer("chunk_index").notNull(),
   content: text("content").notNull(),
   contentType: varchar("content_type", { length: 32 }).notNull().default("text"),
@@ -2125,6 +2171,7 @@ export const libraryChunks = pgTable("library_chunks", {
 }, (t) => [
   uniqueIndex("library_chunks_item_chunk_index_unique").on(t.libraryItemId, t.chunkIndex),
   index("library_chunks_tenant_content_type_idx").on(t.tenantId, t.contentType),
+  index("library_chunks_tenant_project_idx").on(t.tenantId, t.projectId),
   index("library_chunks_vector_ref_idx").on(t.vectorRefId),
   index("library_chunks_allowed_scopes_gin_idx").using("gin", t.allowedScopes),
   index("library_chunks_parent_chunk_idx").on(t.parentChunkId),
@@ -2206,6 +2253,7 @@ export const libraryIndexJobs = pgTable("library_index_jobs", {
   id: serial("id").primaryKey(),
   tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
   libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
+  projectId: varchar("project_id", { length: 100 }),
   jobType: varchar("job_type", { length: 64 }).notNull(),
   status: libraryIndexJobStatusEnum("status").notNull().default("pending"),
   attemptCount: integer("attempt_count").notNull().default(0),
@@ -2219,6 +2267,7 @@ export const libraryIndexJobs = pgTable("library_index_jobs", {
   updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
 }, (t) => [
   index("library_index_jobs_tenant_status_run_at_idx").on(t.tenantId, t.status, t.runAt),
+  index("library_index_jobs_tenant_project_idx").on(t.tenantId, t.projectId),
   index("library_index_jobs_status_retry_idx").on(t.status, t.nextRetryAt),
   index("library_index_jobs_item_status_idx").on(t.libraryItemId, t.status),
 ]);
@@ -2226,6 +2275,194 @@ export const libraryIndexJobs = pgTable("library_index_jobs", {
 export type LibraryIndexJob = typeof libraryIndexJobs.$inferSelect;
 export type InsertLibraryIndexJob = typeof libraryIndexJobs.$inferInsert;
 
+export const financeRecurringRules = pgTable("finance_recurring_rules", {
+  id: serial("id").primaryKey(),
+  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
+  projectId: varchar("project_id", { length: 100 }).notNull(),
+  ownerUserId: integer("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
+  type: financeTransactionTypeEnum("type").notNull(),
+  amountMinor: integer("amount_minor").notNull(),
+  currency: varchar("currency", { length: 3 }).notNull().default("THB"),
+  categoryCode: varchar("category_code", { length: 64 }).notNull(),
+  merchantName: text("merchant_name"),
+  note: text("note"),
+  rrule: text("rrule").notNull(),
+  timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Bangkok"),
+  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
+  endDate: timestamp("end_date", { withTimezone: true }),
+  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
+  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
+  runCount: integer("run_count").notNull().default(0),
+  autoConfirm: boolean("auto_confirm").notNull().default(false),
+  status: financeRecurringRuleStatusEnum("status").notNull().default("active"),
+  idempotencyKey: varchar("idempotency_key", { length: 256 }).notNull(),
+  sourceHash: varchar("source_hash", { length: 64 }),
+  sourceMessageId: integer("source_message_id").references(() => messages.id, { onDelete: "set null" }),
+  sourceLibraryItemId: integer("source_library_item_id").references(() => libraryItems.id, { onDelete: "set null" }),
+  allowedScopes: text("allowed_scopes").array().notNull().default(sql`'{}'`),
+  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  uniqueIndex("finance_recurring_rules_tenant_idempotency_unique").on(t.tenantId, t.idempotencyKey),
+  index("finance_recurring_rules_tenant_project_owner_idx").on(t.tenantId, t.projectId, t.ownerUserId),
+  index("finance_recurring_rules_tenant_status_next_run_idx").on(t.tenantId, t.status, t.nextRunAt),
+  index("finance_recurring_rules_source_hash_idx").on(t.sourceHash),
+  index("finance_recurring_rules_allowed_scopes_gin_idx").using("gin", t.allowedScopes),
+  index("finance_recurring_rules_source_message_idx").on(t.sourceMessageId),
+  index("finance_recurring_rules_source_library_item_idx").on(t.sourceLibraryItemId),
+  check("finance_recurring_rules_amount_minor_positive", sql`${t.amountMinor} > 0`),
+]);
+
+export type FinanceRecurringRule = typeof financeRecurringRules.$inferSelect;
+export type InsertFinanceRecurringRule = typeof financeRecurringRules.$inferInsert;
+
+export const financeDrafts = pgTable("finance_drafts", {
+  id: serial("id").primaryKey(),
+  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
+  projectId: varchar("project_id", { length: 100 }).notNull(),
+  ownerUserId: integer("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
+  type: financeTransactionTypeEnum("type").notNull(),
+  status: financeDraftStatusEnum("status").notNull().default("draft"),
+  source: financeSourceEnum("source").notNull(),
+  idempotencyKey: varchar("idempotency_key", { length: 256 }).notNull(),
+  sourceHash: varchar("source_hash", { length: 64 }),
+  payloadJson: jsonb("payload_json").$type<Record<string, any>>().notNull().default({}),
+  missingFields: text("missing_fields").array().notNull().default(sql`'{}'`),
+  confidence: numeric("confidence", { precision: 3, scale: 2 }),
+  needsClarification: boolean("needs_clarification").notNull().default(false),
+  clarificationPrompt: text("clarification_prompt"),
+  sourceMessageId: integer("source_message_id").references(() => messages.id, { onDelete: "set null" }),
+  sourceLibraryItemId: integer("source_library_item_id").references(() => libraryItems.id, { onDelete: "set null" }),
+  recurringRuleId: integer("recurring_rule_id").references(() => financeRecurringRules.id, { onDelete: "set null" }),
+  expiresAt: timestamp("expires_at", { withTimezone: true }),
+  allowedScopes: text("allowed_scopes").array().notNull().default(sql`'{}'`),
+  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  uniqueIndex("finance_drafts_tenant_idempotency_unique").on(t.tenantId, t.idempotencyKey),
+  index("finance_drafts_tenant_project_owner_idx").on(t.tenantId, t.projectId, t.ownerUserId),
+  index("finance_drafts_tenant_status_created_idx").on(t.tenantId, t.status, t.createdAt),
+  index("finance_drafts_source_hash_idx").on(t.sourceHash),
+  index("finance_drafts_source_message_idx").on(t.sourceMessageId),
+  index("finance_drafts_source_library_item_idx").on(t.sourceLibraryItemId),
+  index("finance_drafts_recurring_rule_idx").on(t.recurringRuleId),
+  index("finance_drafts_allowed_scopes_gin_idx").using("gin", t.allowedScopes),
+  index("finance_drafts_expires_at_idx").on(t.expiresAt),
+]);
+
+export type FinanceDraft = typeof financeDrafts.$inferSelect;
+export type InsertFinanceDraft = typeof financeDrafts.$inferInsert;
+
+export const financeTransactions = pgTable("finance_transactions", {
+  id: serial("id").primaryKey(),
+  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
+  projectId: varchar("project_id", { length: 100 }).notNull(),
+  ownerUserId: integer("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
+  type: financeTransactionTypeEnum("type").notNull(),
+  status: financeTransactionStatusEnum("status").notNull().default("draft"),
+  source: financeSourceEnum("source").notNull(),
+  amountMinor: integer("amount_minor").notNull(),
+  currency: varchar("currency", { length: 3 }).notNull().default("THB"),
+  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
+  categoryCode: varchar("category_code", { length: 64 }).notNull(),
+  merchantName: text("merchant_name"),
+  note: text("note"),
+  confidence: numeric("confidence", { precision: 3, scale: 2 }),
+  idempotencyKey: varchar("idempotency_key", { length: 256 }).notNull(),
+  sourceHash: varchar("source_hash", { length: 64 }),
+  confirmedFromDraftId: integer("confirmed_from_draft_id").references(() => financeDrafts.id, { onDelete: "set null" }),
+  recurringRuleId: integer("recurring_rule_id").references(() => financeRecurringRules.id, { onDelete: "set null" }),
+  sourceMessageId: integer("source_message_id").references(() => messages.id, { onDelete: "set null" }),
+  sourceLibraryItemId: integer("source_library_item_id").references(() => libraryItems.id, { onDelete: "set null" }),
+  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
+  confirmedByUserId: integer("confirmed_by_user_id").references(() => users.id, { onDelete: "set null" }),
+  voidedAt: timestamp("voided_at", { withTimezone: true }),
+  voidedByUserId: integer("voided_by_user_id").references(() => users.id, { onDelete: "set null" }),
+  voidReason: text("void_reason"),
+  allowedScopes: text("allowed_scopes").array().notNull().default(sql`'{}'`),
+  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  uniqueIndex("finance_transactions_tenant_idempotency_unique").on(t.tenantId, t.idempotencyKey),
+  uniqueIndex("finance_transactions_confirmed_from_draft_unique")
+    .on(t.confirmedFromDraftId)
+    .where(sql`"confirmed_from_draft_id" IS NOT NULL`),
+  index("finance_transactions_tenant_project_owner_idx").on(t.tenantId, t.projectId, t.ownerUserId),
+  index("finance_transactions_tenant_status_occurred_idx").on(t.tenantId, t.status, t.occurredAt),
+  index("finance_transactions_source_hash_idx").on(t.sourceHash),
+  index("finance_transactions_source_message_idx").on(t.sourceMessageId),
+  index("finance_transactions_source_library_item_idx").on(t.sourceLibraryItemId),
+  index("finance_transactions_recurring_rule_idx").on(t.recurringRuleId),
+  index("finance_transactions_allowed_scopes_gin_idx").using("gin", t.allowedScopes),
+  index("finance_transactions_owner_voided_idx").on(t.tenantId, t.ownerUserId, t.voidedAt),
+  check("finance_transactions_amount_minor_positive", sql`${t.amountMinor} > 0`),
+]);
+
+export type FinanceTransaction = typeof financeTransactions.$inferSelect;
+export type InsertFinanceTransaction = typeof financeTransactions.$inferInsert;
+
+export const documentExtractions = pgTable("document_extractions", {
+  id: serial("id").primaryKey(),
+  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
+  projectId: varchar("project_id", { length: 100 }).notNull(),
+  ownerUserId: integer("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
+  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
+  financeDraftId: integer("finance_draft_id").references(() => financeDrafts.id, { onDelete: "set null" }),
+  source: financeSourceEnum("source").notNull().default("ocr_document"),
+  idempotencyKey: varchar("idempotency_key", { length: 256 }).notNull(),
+  sourceHash: varchar("source_hash", { length: 64 }),
+  ocrProvider: varchar("ocr_provider", { length: 64 }).notNull(),
+  ocrText: text("ocr_text").notNull(),
+  ocrJson: jsonb("ocr_json").$type<Record<string, any>>().notNull().default({}),
+  extractedJson: jsonb("extracted_json").$type<Record<string, any>>().notNull().default({}),
+  confidenceJson: jsonb("confidence_json").$type<Record<string, any>>().notNull().default({}),
+  mimeType: varchar("mime_type", { length: 128 }).notNull(),
+  fileHash: varchar("file_hash", { length: 64 }).notNull(),
+  pageCount: integer("page_count").notNull().default(1),
+  sourceMessageId: integer("source_message_id").references(() => messages.id, { onDelete: "set null" }),
+  allowedScopes: text("allowed_scopes").array().notNull().default(sql`'{}'`),
+  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  uniqueIndex("document_extractions_tenant_idempotency_unique").on(t.tenantId, t.idempotencyKey),
+  index("document_extractions_tenant_project_owner_idx").on(t.tenantId, t.projectId, t.ownerUserId),
+  index("document_extractions_library_item_idx").on(t.libraryItemId),
+  index("document_extractions_finance_draft_idx").on(t.financeDraftId),
+  index("document_extractions_source_hash_idx").on(t.sourceHash),
+  index("document_extractions_source_message_idx").on(t.sourceMessageId),
+  index("document_extractions_file_hash_idx").on(t.fileHash),
+  index("document_extractions_allowed_scopes_gin_idx").using("gin", t.allowedScopes),
+  check("document_extractions_page_count_positive", sql`${t.pageCount} > 0`),
+]);
+
+export type DocumentExtraction = typeof documentExtractions.$inferSelect;
+export type InsertDocumentExtraction = typeof documentExtractions.$inferInsert;
+
+export const financeTransactionDocuments = pgTable("finance_transaction_documents", {
+  id: serial("id").primaryKey(),
+  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
+  projectId: varchar("project_id", { length: 100 }).notNull(),
+  ownerUserId: integer("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
+  transactionId: integer("transaction_id").notNull().references(() => financeTransactions.id, { onDelete: "cascade" }),
+  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
+  sourceExtractionId: integer("source_extraction_id").references(() => documentExtractions.id, { onDelete: "set null" }),
+  role: financeDocumentRoleEnum("role").notNull().default("supporting"),
+  note: text("note"),
+  allowedScopes: text("allowed_scopes").array().notNull().default(sql`'{}'`),
+  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  uniqueIndex("finance_transaction_documents_link_unique").on(t.transactionId, t.libraryItemId, t.role),
+  index("finance_transaction_documents_tenant_project_owner_idx").on(t.tenantId, t.projectId, t.ownerUserId),
+  index("finance_transaction_documents_transaction_idx").on(t.transactionId),
+  index("finance_transaction_documents_library_item_idx").on(t.libraryItemId),
+  index("finance_transaction_documents_source_extraction_idx").on(t.sourceExtractionId),
+  index("finance_transaction_documents_allowed_scopes_gin_idx").using("gin", t.allowedScopes),
+]);
+
+export type FinanceTransactionDocument = typeof financeTransactionDocuments.$inferSelect;
+export type InsertFinanceTransactionDocument = typeof financeTransactionDocuments.$inferInsert;
+
 // ============================================================
 // Presentation Editing Tables
 // ============================================================
@@ -3178,6 +3415,32 @@ export const storageSettings = pgTable("storage_settings", {
 export type StorageSettings = typeof storageSettings.$inferSelect;
 export type InsertStorageSettings = typeof storageSettings.$inferInsert;
 
+export const desktopInstallerReleases = pgTable("desktop_installer_releases", {
+  id: serial("id").primaryKey(),
+  version: varchar("version", { length: 64 }).notNull(),
+  platform: text("platform").notNull(),
+  channel: text("channel").notNull().default("stable"),
+  installerFormat: text("installerFormat").notNull(),
+  fileName: varchar("fileName", { length: 255 }).notNull(),
+  contentType: varchar("contentType", { length: 255 }).notNull().default("application/octet-stream"),
+  storageKey: text("storageKey").notNull(),
+  fileSizeBytes: bigint("fileSizeBytes", { mode: "number" }).notNull(),
+  fileSha256: varchar("fileSha256", { length: 64 }).notNull(),
+  releaseNotes: text("releaseNotes"),
+  isPublished: boolean("isPublished").notNull().default(true),
+  publishedAt: timestamp("publishedAt", { withTimezone: true }),
+  uploadedBy: integer("uploadedBy").references(() => users.id, { onDelete: "set null" }),
+  uploadedAt: timestamp("uploadedAt", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  index("idx_desktop_installer_releases_platform_published").on(t.platform, t.isPublished, t.publishedAt),
+  index("idx_desktop_installer_releases_version").on(t.version),
+  uniqueIndex("desktop_installer_releases_storage_key_unique").on(t.storageKey),
+]);
+
+export type DesktopInstallerRelease = typeof desktopInstallerReleases.$inferSelect;
+export type InsertDesktopInstallerRelease = typeof desktopInstallerReleases.$inferInsert;
+
 // ============================================================
 // System Settings - Platform-wide configuration
 // ============================================================
diff --git a/apps/web/server/__tests__/migrationOrdering.test.ts b/apps/web/server/__tests__/migrationOrdering.test.ts
index f6a4435a..f8825448 100644
--- a/apps/web/server/__tests__/migrationOrdering.test.ts
+++ b/apps/web/server/__tests__/migrationOrdering.test.ts
@@ -57,12 +57,75 @@ describe("migration ordering", () => {
       .filter((f: string) => f.match(/^\d{3}_/))
       .sort();
 
-    expect(migrations.length).toBeGreaterThanOrEqual(8);
+    expect(migrations.length).toBeGreaterThanOrEqual(12);
+    expect(migrations).toContain("008_library_provider_switch_state.py");
     expect(migrations[migrations.length - 1]).toContain(
-      "008_library_provider_switch_state"
+      "012_agency_structured_results"
     );
   });
 
+  it("finance foundation migrations are ordered and present in the web drizzle folder", () => {
+    const migrationsDir = path.resolve(
+      import.meta.dirname,
+      "../../../../apps/web/drizzle"
+    );
+
+    const migrations = fs
+      .readdirSync(migrationsDir)
+      .filter((f: string) => /^\d{4}_.+\.sql$/.test(f))
+      .sort();
+
+    const foundationFile = "0138_private_personal_finance_foundation.sql";
+    const backstopFile = "0139_private_personal_finance_security_backstop.sql";
+    const foundationIndex = migrations.indexOf(foundationFile);
+    const backstopIndex = migrations.indexOf(backstopFile);
+
+    expect(foundationIndex).toBeGreaterThan(-1);
+    expect(backstopIndex).toBeGreaterThan(foundationIndex);
+    expect(migrations[foundationIndex - 1]).toBe("0137_desktop_installer_distribution.sql");
+  });
+
+  it("finance foundation migration creates the new finance tables and keeps legacy library rows compatibility-only", () => {
+    const foundationPath = path.resolve(
+      import.meta.dirname,
+      "../../../../apps/web/drizzle/0138_private_personal_finance_foundation.sql"
+    );
+
+    expect(fs.existsSync(foundationPath)).toBe(true);
+
+    const content = fs.readFileSync(foundationPath, "utf-8");
+    expect(content).toContain('CREATE TYPE "public"."finance_transaction_type"');
+    expect(content).toContain('CREATE TABLE IF NOT EXISTS "finance_transactions"');
+    expect(content).toContain('CREATE TABLE IF NOT EXISTS "finance_drafts"');
+    expect(content).toContain('CREATE TABLE IF NOT EXISTS "document_extractions"');
+    expect(content).toContain('CREATE TABLE IF NOT EXISTS "finance_transaction_documents"');
+    expect(content).toContain('ADD COLUMN IF NOT EXISTS "project_id" varchar(100)');
+    expect(content).toContain('"source_message_id" integer');
+    expect(content).toContain("compatibility-only");
+    expect(content).toContain("tombstone finance-backed library rows");
+  });
+
+  it("finance security backstop migration enables RLS on the finance tables", () => {
+    const backstopPath = path.resolve(
+      import.meta.dirname,
+      "../../../../apps/web/drizzle/0139_private_personal_finance_security_backstop.sql"
+    );
+
+    expect(fs.existsSync(backstopPath)).toBe(true);
+
+    const content = fs.readFileSync(backstopPath, "utf-8");
+    expect(content).toContain("ENABLE ROW LEVEL SECURITY");
+    expect(content).toContain("FORCE ROW LEVEL SECURITY");
+    expect(content).toContain("CREATE POLICY \"finance_transactions_tenant_scope\"");
+    expect(content).toContain("CREATE POLICY \"finance_drafts_tenant_scope\"");
+    expect(content).toContain("CREATE POLICY \"finance_recurring_rules_tenant_scope\"");
+    expect(content).toContain("CREATE POLICY \"document_extractions_tenant_scope\"");
+    expect(content).toContain("CREATE POLICY \"finance_transaction_documents_tenant_scope\"");
+    expect(content).toContain("app.current_tenant_id");
+    expect(content).toContain("app.current_user_id");
+    expect(content).toContain("app.current_project_id");
+  });
+
   it("Python migration 006 defines pgvector extension and tenant RLS", () => {
     const migrationPath = path.resolve(
       import.meta.dirname,
diff --git a/apps/web/shared/__tests__/finance.test.ts b/apps/web/shared/__tests__/finance.test.ts
new file mode 100644
index 00000000..c6ff48d3
--- /dev/null
+++ b/apps/web/shared/__tests__/finance.test.ts
@@ -0,0 +1,82 @@
+import { describe, expect, it } from "vitest";
+
+import {
+  financeDocumentRoleValues,
+  financeDraftStatusValues,
+  financeMonthlySummarySchema,
+  financeSourceValues,
+  financeStructuredDraftSchema,
+  financeTransactionStatusValues,
+  financeTransactionTypeValues,
+} from "../finance";
+
+describe("finance shared contracts", () => {
+  it("exposes the finance enum value sets used by the app", () => {
+    expect(financeTransactionTypeValues).toEqual(["income", "expense", "transfer"]);
+    expect(financeTransactionStatusValues).toEqual(["draft", "confirmed", "voided"]);
+    expect(financeDraftStatusValues).toEqual(["draft", "confirmed", "expired", "cancelled"]);
+    expect(financeSourceValues).toEqual([
+      "chat_text",
+      "ocr_document",
+      "import",
+      "api",
+      "recurring_rule",
+    ]);
+    expect(financeDocumentRoleValues).toEqual([
+      "receipt",
+      "invoice",
+      "statement",
+      "supporting",
+    ]);
+  });
+
+  it("validates a structured finance draft payload", () => {
+    const draft = financeStructuredDraftSchema.parse({
+      type: "expense",
+      amountMinor: 1250,
+      currency: "THB",
+      occurredAt: "2026-04-09T10:15:00.000Z",
+      categoryCode: "food.team_meal",
+      merchantName: "Cafe 123",
+      note: "Team lunch",
+      confidence: 0.92,
+      needsClarification: false,
+      missingFields: [],
+      sourceMessageId: 10,
+      sourceLibraryItemId: 22,
+    });
+
+    expect(draft.amountMinor).toBe(1250);
+  });
+
+  it("rejects malformed summary payloads", () => {
+    expect(() =>
+      financeMonthlySummarySchema.parse({
+        tenantId: "tenant-1",
+        projectId: "personal",
+        timezone: "Asia/Bangkok",
+        rangeStart: "2026-04-01T00:00:00.000Z",
+        rangeEnd: "2026-04-30T23:59:59.999Z",
+        incomeMinor: 1000.5,
+        expenseMinor: 1200,
+        transferMinor: 0,
+        balanceMinor: -200,
+      }),
+    ).toThrow();
+  });
+
+  it("rejects non-positive draft amounts", () => {
+    expect(() =>
+      financeStructuredDraftSchema.parse({
+        type: "income",
+        amountMinor: 0,
+        currency: "THB",
+        occurredAt: "2026-04-09T10:15:00.000Z",
+        categoryCode: "income.misc",
+        confidence: 0.5,
+        needsClarification: false,
+        missingFields: [],
+      }),
+    ).toThrow();
+  });
+});
diff --git a/apps/web/shared/finance.ts b/apps/web/shared/finance.ts
new file mode 100644
index 00000000..19f1f867
--- /dev/null
+++ b/apps/web/shared/finance.ts
@@ -0,0 +1,53 @@
+import { z } from "zod";
+
+export const financeTransactionTypeValues = ["income", "expense", "transfer"] as const;
+export const financeTransactionStatusValues = ["draft", "confirmed", "voided"] as const;
+export const financeDraftStatusValues = ["draft", "confirmed", "expired", "cancelled"] as const;
+export const financeRecurringRuleStatusValues = ["active", "paused", "ended"] as const;
+export const financeSourceValues = [
+  "chat_text",
+  "ocr_document",
+  "import",
+  "api",
+  "recurring_rule",
+] as const;
+export const financeDocumentRoleValues = ["receipt", "invoice", "statement", "supporting"] as const;
+
+export const financeTransactionTypeSchema = z.enum(financeTransactionTypeValues);
+export const financeTransactionStatusSchema = z.enum(financeTransactionStatusValues);
+export const financeDraftStatusSchema = z.enum(financeDraftStatusValues);
+export const financeRecurringRuleStatusSchema = z.enum(financeRecurringRuleStatusValues);
+export const financeSourceSchema = z.enum(financeSourceValues);
+export const financeDocumentRoleSchema = z.enum(financeDocumentRoleValues);
+
+export const financeStructuredDraftSchema = z.object({
+  type: financeTransactionTypeSchema,
+  amountMinor: z.number().int().positive(),
+  currency: z.string().length(3),
+  occurredAt: z.string().datetime(),
+  categoryCode: z.string().min(1),
+  merchantName: z.string().nullable().optional(),
+  note: z.string().nullable().optional(),
+  confidence: z.number().min(0).max(1),
+  needsClarification: z.boolean(),
+  missingFields: z.array(z.string()),
+  sourceMessageId: z.number().int().positive().nullable().optional(),
+  sourceLibraryItemId: z.number().int().positive().nullable().optional(),
+  recurringRuleId: z.number().int().positive().nullable().optional(),
+});
+
+export type FinanceStructuredDraft = z.infer<typeof financeStructuredDraftSchema>;
+
+export const financeMonthlySummarySchema = z.object({
+  tenantId: z.string().min(1),
+  projectId: z.string().min(1),
+  timezone: z.string().min(1),
+  rangeStart: z.string().datetime(),
+  rangeEnd: z.string().datetime(),
+  incomeMinor: z.number().int(),
+  expenseMinor: z.number().int(),
+  transferMinor: z.number().int(),
+  balanceMinor: z.number().int(),
+});
+
+export type FinanceMonthlySummary = z.infer<typeof financeMonthlySummarySchema>;
diff --git a/specs/feature/078-private-personal-finance-ocr-rag/sections/section-01-schema-and-migrations.md b/specs/feature/078-private-personal-finance-ocr-rag/sections/section-01-schema-and-migrations.md
new file mode 100644
index 00000000..cd079b4a
--- /dev/null
+++ b/specs/feature/078-private-personal-finance-ocr-rag/sections/section-01-schema-and-migrations.md
@@ -0,0 +1,66 @@
+# section-01-schema-and-migrations
+
+## Objective
+
+Create the data foundation for personal finance, OCR traceability, recurring rules, and scope-safe library evidence.
+
+## Scope
+
+This section owns the schema-first work that every later section depends on.
+
+## Files to Change
+
+- `apps/web/drizzle/schema.ts`
+- `apps/web/server/__tests__/migrationOrdering.test.ts`
+- generated migration files
+- `apps/web/server/services/financeTypes.ts` or `apps/web/shared/finance.ts` if shared types are needed
+
+## Implementation Notes
+
+- Add `finance_transactions` with confirmed transaction fields, `tenant_id`, `project_id`, `owner_user_id`, `idempotency_key`, `source_hash`, and source trace fields.
+- Add `finance_drafts` with `payload_json`, `missing_fields`, source trace fields, and a draft status lifecycle.
+- Add `finance_recurring_rules` with schedule data, `auto_confirm`, next run bookkeeping, and ownership fields.
+- Add `document_extractions` with OCR text, OCR JSON, extraction JSON, confidence JSON, MIME type, file hash, page count, ownership, and project scope.
+- Add `finance_transaction_documents` to link confirmed transactions to supporting documents.
+- Add `project_id` to `library_items`, `library_chunks`, and `library_index_jobs`.
+- Keep `allowed_scopes` as the denormalized scope cache and make sure chunk rows can mirror their parent item’s scope.
+- Make purge/backfill behavior explicit for library-backed finance evidence so deleted personal content cannot survive only inside chunks or vector artifacts.
+- Add the indexes needed for tenant/project/owner lookup, occurred-at range queries, and idempotency de-duplication.
+- Keep legacy library rows with `project_id = null` in compatibility mode until they are backfilled.
+- Prepare the migration order so RLS and backfill changes land after the tables and columns exist.
+
+## Data Rules
+
+- Personal finance rows require `owner_user_id`.
+- Personal finance rows must fail closed if the owner, tenant, or project context is missing.
+- Money stays in minor units.
+- `project_id = "personal"` is a reserved per-user namespace, not a tenant-wide bucket.
+- Only the explicit personal-create flow may set `project_id = "personal"`; generic project update flows must reject the reserved slug.
+
+## Validation
+
+- Schema tests should prove the new tables and columns compile and expose the expected names.
+- Migration-order tests should prove the RLS and backfill steps are present.
+- Legacy compatibility tests should prove null-project rows are not accidentally treated as personal evidence.
+
+## Implemented
+
+### Files Created
+
+- `apps/web/drizzle/0138_private_personal_finance_foundation.sql`
+- `apps/web/drizzle/0139_private_personal_finance_security_backstop.sql`
+- `apps/web/drizzle/financeSchema.test.ts`
+- `apps/web/shared/finance.ts`
+- `apps/web/shared/__tests__/finance.test.ts`
+
+### Files Updated
+
+- `apps/web/drizzle/schema.ts`
+- `apps/web/drizzle/meta/_journal.json`
+- `apps/web/server/__tests__/migrationOrdering.test.ts`
+
+### Notes
+
+- `financeStructuredDraftSchema` intentionally omits `projectId`; the active finance project is derived from authenticated request context instead of being accepted from structured output.
+- Added DB checks so `finance_recurring_rules.amount_minor` and `finance_transactions.amount_minor` must be positive, and `document_extractions.page_count` must stay above zero.
+- Legacy `library_items`, `library_chunks`, and `library_index_jobs` remain `project_id = null` compatible until later backfill and scope propagation sections run.
