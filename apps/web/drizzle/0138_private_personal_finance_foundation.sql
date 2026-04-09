CREATE TYPE "public"."finance_transaction_type" AS ENUM('income', 'expense', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."finance_transaction_status" AS ENUM('draft', 'confirmed', 'voided');--> statement-breakpoint
CREATE TYPE "public"."finance_draft_status" AS ENUM('draft', 'confirmed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."finance_recurring_rule_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint
CREATE TYPE "public"."finance_source" AS ENUM('chat_text', 'ocr_document', 'import', 'api', 'recurring_rule');--> statement-breakpoint
CREATE TYPE "public"."finance_document_role" AS ENUM('receipt', 'invoice', 'statement', 'supporting');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "finance_recurring_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL,
  "project_id" varchar(100) NOT NULL,
  "owner_user_id" integer NOT NULL,
  "type" "finance_transaction_type" NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'THB',
  "category_code" varchar(64) NOT NULL,
  "merchant_name" text,
  "note" text,
  "rrule" text NOT NULL,
  "timezone" varchar(64) NOT NULL DEFAULT 'Asia/Bangkok',
  "start_date" timestamp with time zone NOT NULL,
  "end_date" timestamp with time zone,
  "next_run_at" timestamp with time zone,
  "last_run_at" timestamp with time zone,
  "run_count" integer NOT NULL DEFAULT 0,
  "auto_confirm" boolean NOT NULL DEFAULT false,
  "status" "finance_recurring_rule_status" NOT NULL DEFAULT 'active',
  "idempotency_key" varchar(256) NOT NULL,
  "source_hash" varchar(64),
  "source_message_id" integer,
  "source_library_item_id" integer,
  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "finance_recurring_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "finance_recurring_rules_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "finance_recurring_rules_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "finance_recurring_rules_source_library_item_id_library_items_id_fk" FOREIGN KEY ("source_library_item_id") REFERENCES "public"."library_items"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_recurring_rules_tenant_idempotency_unique" ON "finance_recurring_rules" USING btree ("tenant_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_recurring_rules_tenant_project_owner_idx" ON "finance_recurring_rules" USING btree ("tenant_id","project_id","owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_recurring_rules_tenant_status_next_run_idx" ON "finance_recurring_rules" USING btree ("tenant_id","status","next_run_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_recurring_rules_source_hash_idx" ON "finance_recurring_rules" USING btree ("source_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_recurring_rules_source_message_idx" ON "finance_recurring_rules" USING btree ("source_message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_recurring_rules_source_library_item_idx" ON "finance_recurring_rules" USING btree ("source_library_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_recurring_rules_allowed_scopes_gin_idx" ON "finance_recurring_rules" USING gin ("allowed_scopes");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "finance_drafts" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL,
  "project_id" varchar(100) NOT NULL,
  "owner_user_id" integer NOT NULL,
  "type" "finance_transaction_type" NOT NULL,
  "status" "finance_draft_status" NOT NULL DEFAULT 'draft',
  "source" "finance_source" NOT NULL,
  "idempotency_key" varchar(256) NOT NULL,
  "source_hash" varchar(64),
  "payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "missing_fields" text[] NOT NULL DEFAULT '{}'::text[],
  "confidence" numeric(3, 2),
  "needs_clarification" boolean NOT NULL DEFAULT false,
  "clarification_prompt" text,
  "source_message_id" integer,
  "source_library_item_id" integer,
  "recurring_rule_id" integer,
  "expires_at" timestamp with time zone,
  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "finance_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "finance_drafts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "finance_drafts_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "finance_drafts_source_library_item_id_library_items_id_fk" FOREIGN KEY ("source_library_item_id") REFERENCES "public"."library_items"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "finance_drafts_recurring_rule_id_finance_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."finance_recurring_rules"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_drafts_tenant_idempotency_unique" ON "finance_drafts" USING btree ("tenant_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_drafts_tenant_project_owner_idx" ON "finance_drafts" USING btree ("tenant_id","project_id","owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_drafts_tenant_status_created_idx" ON "finance_drafts" USING btree ("tenant_id","status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_drafts_source_hash_idx" ON "finance_drafts" USING btree ("source_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_drafts_source_message_idx" ON "finance_drafts" USING btree ("source_message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_drafts_source_library_item_idx" ON "finance_drafts" USING btree ("source_library_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_drafts_recurring_rule_idx" ON "finance_drafts" USING btree ("recurring_rule_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_drafts_allowed_scopes_gin_idx" ON "finance_drafts" USING gin ("allowed_scopes");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_drafts_expires_at_idx" ON "finance_drafts" USING btree ("expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "finance_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL,
  "project_id" varchar(100) NOT NULL,
  "owner_user_id" integer NOT NULL,
  "type" "finance_transaction_type" NOT NULL,
  "status" "finance_transaction_status" NOT NULL DEFAULT 'draft',
  "source" "finance_source" NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'THB',
  "occurred_at" timestamp with time zone NOT NULL,
  "category_code" varchar(64) NOT NULL,
  "merchant_name" text,
  "note" text,
  "confidence" numeric(3, 2),
  "idempotency_key" varchar(256) NOT NULL,
  "source_hash" varchar(64),
  "confirmed_from_draft_id" integer,
  "recurring_rule_id" integer,
  "source_message_id" integer,
  "source_library_item_id" integer,
  "confirmed_at" timestamp with time zone,
  "confirmed_by_user_id" integer,
  "voided_at" timestamp with time zone,
  "voided_by_user_id" integer,
  "void_reason" text,
  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "finance_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "finance_transactions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "finance_transactions_confirmed_from_draft_id_finance_drafts_id_fk" FOREIGN KEY ("confirmed_from_draft_id") REFERENCES "public"."finance_drafts"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "finance_transactions_recurring_rule_id_finance_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."finance_recurring_rules"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "finance_transactions_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "finance_transactions_source_library_item_id_library_items_id_fk" FOREIGN KEY ("source_library_item_id") REFERENCES "public"."library_items"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "finance_transactions_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "finance_transactions_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_transactions_tenant_idempotency_unique" ON "finance_transactions" USING btree ("tenant_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_transactions_confirmed_from_draft_unique" ON "finance_transactions" USING btree ("confirmed_from_draft_id") WHERE "confirmed_from_draft_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_tenant_project_owner_idx" ON "finance_transactions" USING btree ("tenant_id","project_id","owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_tenant_status_occurred_idx" ON "finance_transactions" USING btree ("tenant_id","status","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_source_hash_idx" ON "finance_transactions" USING btree ("source_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_source_message_idx" ON "finance_transactions" USING btree ("source_message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_source_library_item_idx" ON "finance_transactions" USING btree ("source_library_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_recurring_rule_idx" ON "finance_transactions" USING btree ("recurring_rule_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_allowed_scopes_gin_idx" ON "finance_transactions" USING gin ("allowed_scopes");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_owner_voided_idx" ON "finance_transactions" USING btree ("tenant_id","owner_user_id","voided_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "document_extractions" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL,
  "project_id" varchar(100) NOT NULL,
  "owner_user_id" integer NOT NULL,
  "library_item_id" integer NOT NULL,
  "finance_draft_id" integer,
  "source" "finance_source" NOT NULL DEFAULT 'ocr_document',
  "idempotency_key" varchar(256) NOT NULL,
  "source_hash" varchar(64),
  "ocr_provider" varchar(64) NOT NULL,
  "ocr_text" text NOT NULL,
  "ocr_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "extracted_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "confidence_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "mime_type" varchar(128) NOT NULL,
  "file_hash" varchar(64) NOT NULL,
  "page_count" integer NOT NULL DEFAULT 1,
  "source_message_id" integer,
  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "document_extractions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "document_extractions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "document_extractions_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "document_extractions_finance_draft_id_finance_drafts_id_fk" FOREIGN KEY ("finance_draft_id") REFERENCES "public"."finance_drafts"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "document_extractions_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_extractions_tenant_idempotency_unique" ON "document_extractions" USING btree ("tenant_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_extractions_finance_draft_unique" ON "document_extractions" USING btree ("finance_draft_id") WHERE "finance_draft_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_extractions_tenant_project_owner_idx" ON "document_extractions" USING btree ("tenant_id","project_id","owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_extractions_library_item_idx" ON "document_extractions" USING btree ("library_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_extractions_source_hash_idx" ON "document_extractions" USING btree ("source_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_extractions_source_message_idx" ON "document_extractions" USING btree ("source_message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_extractions_file_hash_idx" ON "document_extractions" USING btree ("file_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_extractions_allowed_scopes_gin_idx" ON "document_extractions" USING gin ("allowed_scopes");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "finance_transaction_documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL,
  "project_id" varchar(100) NOT NULL,
  "owner_user_id" integer NOT NULL,
  "transaction_id" integer NOT NULL,
  "library_item_id" integer NOT NULL,
  "source_extraction_id" integer,
  "role" "finance_document_role" NOT NULL DEFAULT 'supporting',
  "note" text,
  "allowed_scopes" text[] NOT NULL DEFAULT '{}'::text[],
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "finance_transaction_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "finance_transaction_documents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "finance_transaction_documents_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "finance_transaction_documents_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "finance_transaction_documents_source_extraction_id_document_extractions_id_fk" FOREIGN KEY ("source_extraction_id") REFERENCES "public"."document_extractions"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_transaction_documents_link_unique" ON "finance_transaction_documents" USING btree ("transaction_id","library_item_id","role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transaction_documents_tenant_project_owner_idx" ON "finance_transaction_documents" USING btree ("tenant_id","project_id","owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transaction_documents_transaction_idx" ON "finance_transaction_documents" USING btree ("transaction_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transaction_documents_library_item_idx" ON "finance_transaction_documents" USING btree ("library_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transaction_documents_source_extraction_idx" ON "finance_transaction_documents" USING btree ("source_extraction_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transaction_documents_allowed_scopes_gin_idx" ON "finance_transaction_documents" USING gin ("allowed_scopes");
--> statement-breakpoint

ALTER TABLE "library_items"
  ADD COLUMN IF NOT EXISTS "project_id" varchar(100);--> statement-breakpoint
ALTER TABLE "library_chunks"
  ADD COLUMN IF NOT EXISTS "project_id" varchar(100);--> statement-breakpoint
ALTER TABLE "library_index_jobs"
  ADD COLUMN IF NOT EXISTS "project_id" varchar(100);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "library_items_tenant_project_idx" ON "library_items" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_items_tenant_owner_project_idx" ON "library_items" USING btree ("tenant_id","owner_user_id","project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_chunks_tenant_project_idx" ON "library_chunks" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_index_jobs_tenant_project_idx" ON "library_index_jobs" USING btree ("tenant_id","project_id");--> statement-breakpoint

-- Legacy library rows with project_id = NULL remain compatibility-only until the backfill remediates them.
-- Purge paths must tombstone finance-backed library rows, chunks, and vector artifacts so deleted personal evidence cannot resurface in search.
