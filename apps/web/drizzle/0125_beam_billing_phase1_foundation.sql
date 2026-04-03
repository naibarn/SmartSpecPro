DO $$ BEGIN
 CREATE TYPE "billing_subscription_status" AS ENUM ('pending_migration', 'active', 'past_due', 'downgraded_to_free', 'canceled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "billing_subscription_source" AS ENUM ('legacy_backfill', 'beam_manual_invoice', 'admin_created');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "invoice_stream" AS ENUM ('domestic', 'international');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "invoice_type" AS ENUM ('subscription_renewal', 'topup', 'manual', 'replacement');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "invoice_status" AS ENUM ('draft', 'issued', 'payment_pending', 'paid', 'expired', 'canceled', 'canceled_overdue', 'replaced');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "document_language" AS ENUM ('th', 'en', 'bilingual');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "invoice_document_render_reason" AS ENUM ('initial_issue', 'sync_header', 'language_variant', 'reissue_render', 'manual_regeneration');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "rendered_by_type" AS ENUM ('system', 'admin', 'user');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "payment_provider" AS ENUM ('beam');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "provider_payment_type" AS ENUM ('charge', 'payment_link');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "payment_status" AS ENUM ('pending_provider_creation', 'payment_pending', 'provider_pending_unknown', 'reconciliation_required', 'paid', 'paid_unapplied', 'paid_recovered', 'grant_pending_recovery', 'downgraded_pending_reversal', 'manual_review_required', 'expired', 'expired_internal', 'canceled', 'canceled_overdue');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "payment_reconciliation_status" AS ENUM ('not_required', 'pending', 'in_progress', 'fixed', 'manual_review_required', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "payment_business_effect_status" AS ENUM ('not_started', 'pending', 'applied', 'reversed', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "amount_match_status" AS ENUM ('unknown', 'matched', 'underpaid', 'overpaid', 'currency_mismatch', 'mismatch');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "payment_attempt_status" AS ENUM ('pending_provider_creation', 'provider_pending_unknown', 'active', 'paid', 'expired', 'expired_internal', 'canceled', 'canceled_overdue', 'reconciliation_required');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "webhook_processing_status" AS ENUM ('pending', 'processed', 'ignored_duplicate', 'schema_invalid', 'manual_review_required', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "reconciliation_entity_type" AS ENUM ('payment', 'invoice', 'subscription');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "reconciliation_trigger_type" AS ENUM ('webhook', 'schedule', 'admin', 'support_case');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "reconciliation_result" AS ENUM ('no_change', 'fixed', 'manual_review_required', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "support_recovery_case_status" AS ENUM ('open', 'in_progress', 'waiting_for_customer', 'resolved', 'closed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "support_recovery_issue_type" AS ENUM ('payment_not_applied', 'wrong_downgrade', 'amount_mismatch', 'missing_document', 'duplicate_charge_review', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "support_recovery_resolution_type" AS ENUM ('reconciled', 'manual_mark_paid', 'reverse_downgrade', 'invoice_reopened', 'invoice_replaced', 'not_billable', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "billing_migration_run_status" AS ENUM ('pending', 'running', 'completed', 'completed_with_warnings', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "billing_effect_type" AS ENUM ('grant_credits', 'renew_subscription', 'downgrade_subscription', 'reverse_downgrade');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_migration_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "status" "billing_migration_run_status" DEFAULT 'pending' NOT NULL,
  "startedAt" timestamp with time zone,
  "completedAt" timestamp with time zone,
  "cutoverReadyAt" timestamp with time zone,
  "totalCandidates" integer DEFAULT 0 NOT NULL,
  "migratedCount" integer DEFAULT 0 NOT NULL,
  "skippedCount" integer DEFAULT 0 NOT NULL,
  "ambiguousCount" integer DEFAULT 0 NOT NULL,
  "reportJson" json,
  "notes" text,
  "createdBy" integer,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36),
  "userId" integer NOT NULL,
  "planCode" varchar(64) NOT NULL,
  "status" "billing_subscription_status" DEFAULT 'pending_migration' NOT NULL,
  "source" "billing_subscription_source" DEFAULT 'legacy_backfill' NOT NULL,
  "billingPeriod" "billing_period" DEFAULT 'monthly' NOT NULL,
  "billingAnchorAt" timestamp with time zone,
  "currentPeriodStart" timestamp with time zone,
  "currentPeriodEnd" timestamp with time zone,
  "nextInvoiceAt" timestamp with time zone,
  "legacyPlanSnapshot" json,
  "migratedFromUserPlan" boolean DEFAULT false NOT NULL,
  "migrationRunId" integer,
  "downgradedAt" timestamp with time zone,
  "downgradeReason" varchar(128),
  "lastRecoveryActionAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36),
  "userId" integer NOT NULL,
  "legalNameTh" varchar(256),
  "legalNameEn" varchar(256),
  "taxId" varchar(64),
  "phone" varchar(64),
  "email" varchar(256),
  "addressLine1" varchar(256),
  "addressLine2" varchar(256),
  "subdistrict" varchar(128),
  "district" varchar(128),
  "province" varchar(128),
  "postalCode" varchar(32),
  "country" varchar(128),
  "contactName" varchar(256),
  "invoiceNote" text,
  "updatedBy" integer,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seller_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36),
  "entityNameTh" varchar(256),
  "entityNameEn" varchar(256),
  "taxId" varchar(64),
  "phone" varchar(64),
  "email" varchar(256),
  "addressLine1" varchar(256),
  "addressLine2" varchar(256),
  "subdistrict" varchar(128),
  "district" varchar(128),
  "province" varchar(128),
  "postalCode" varchar(32),
  "country" varchar(128),
  "signerName" varchar(256),
  "signerTitle" varchar(256),
  "branchType" varchar(64),
  "footerNoteTh" text,
  "footerNoteEn" text,
  "autoGeneratedDocumentNoteTh" text,
  "autoGeneratedDocumentNoteEn" text,
  "logoUrl" varchar(512),
  "revision" integer DEFAULT 1 NOT NULL,
  "updatedBy" integer,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tax_policies" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36),
  "stream" "invoice_stream" NOT NULL,
  "taxName" varchar(128) NOT NULL,
  "taxRatePercent" numeric(7, 4) DEFAULT 0 NOT NULL,
  "isEnabled" boolean DEFAULT false NOT NULL,
  "effectiveFrom" timestamp with time zone NOT NULL,
  "effectiveTo" timestamp with time zone,
  "roundingPolicy" varchar(64) DEFAULT 'half_up_2dp' NOT NULL,
  "createdBy" integer,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_number_sequences" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36),
  "stream" "invoice_stream" NOT NULL,
  "documentType" varchar(32) DEFAULT 'invoice' NOT NULL,
  "prefix" varchar(64) NOT NULL,
  "yearMode" varchar(32) DEFAULT 'gregorian' NOT NULL,
  "currentRunningNo" integer DEFAULT 0 NOT NULL,
  "isActive" boolean DEFAULT true NOT NULL,
  "updatedBy" integer,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36),
  "invoiceNumber" varchar(64),
  "invoiceStream" "invoice_stream" NOT NULL,
  "taxPolicyId" integer,
  "invoiceType" "invoice_type" NOT NULL,
  "userId" integer NOT NULL,
  "subscriptionId" integer,
  "orderId" varchar(128),
  "status" "invoice_status" DEFAULT 'draft' NOT NULL,
  "currency" varchar(16) DEFAULT 'THB' NOT NULL,
  "subtotal" numeric(12, 2) DEFAULT 0 NOT NULL,
  "taxAmount" numeric(12, 2) DEFAULT 0 NOT NULL,
  "totalAmount" numeric(12, 2) DEFAULT 0 NOT NULL,
  "issuedAt" timestamp with time zone,
  "dueAt" timestamp with time zone,
  "paidAt" timestamp with time zone,
  "canceledAt" timestamp with time zone,
  "cancelReason" varchar(128),
  "headerVersion" integer DEFAULT 1 NOT NULL,
  "sellerSnapshotJson" json,
  "buyerSnapshotJson" json,
  "totalsSnapshotJson" json,
  "defaultDocumentLanguage" "document_language" DEFAULT 'th' NOT NULL,
  "replacedByInvoiceId" integer,
  "supersedesInvoiceId" integer,
  "billingCycleStart" timestamp with time zone,
  "billingCycleEnd" timestamp with time zone,
  "documentAccessScope" varchar(32) DEFAULT 'owner_or_admin' NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_line_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "invoiceId" integer NOT NULL,
  "itemType" varchar(64) NOT NULL,
  "description" text NOT NULL,
  "quantity" numeric(10, 2) DEFAULT 1 NOT NULL,
  "unitPrice" numeric(12, 2) DEFAULT 0 NOT NULL,
  "amount" numeric(12, 2) DEFAULT 0 NOT NULL,
  "metadataJson" json,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "invoiceId" integer NOT NULL,
  "documentLanguage" "document_language" NOT NULL,
  "documentVersion" integer DEFAULT 1 NOT NULL,
  "templateVersion" varchar(64),
  "pdfFileUrl" varchar(1024),
  "renderReason" "invoice_document_render_reason" NOT NULL,
  "renderedByType" "rendered_by_type" DEFAULT 'system' NOT NULL,
  "renderedById" integer,
  "isLatestForLanguage" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "invoiceId" integer NOT NULL,
  "provider" "payment_provider" DEFAULT 'beam' NOT NULL,
  "providerPaymentType" "provider_payment_type" DEFAULT 'charge' NOT NULL,
  "providerPaymentId" varchar(128),
  "providerReferenceId" varchar(128),
  "status" "payment_status" DEFAULT 'pending_provider_creation' NOT NULL,
  "amount" numeric(12, 2) DEFAULT 0 NOT NULL,
  "currency" varchar(16) DEFAULT 'THB' NOT NULL,
  "expectedAmount" numeric(12, 2),
  "expectedCurrency" varchar(16),
  "settledAmount" numeric(12, 2),
  "settledCurrency" varchar(16),
  "amountMatchStatus" "amount_match_status" DEFAULT 'unknown' NOT NULL,
  "expiresAt" timestamp with time zone,
  "paidAt" timestamp with time zone,
  "rawResponseJson" json,
  "reconciliationStatus" "payment_reconciliation_status" DEFAULT 'not_required' NOT NULL,
  "lastReconciledAt" timestamp with time zone,
  "providerStatusLastSeen" varchar(64),
  "providerEventLastSeenId" varchar(128),
  "businessEffectStatus" "payment_business_effect_status" DEFAULT 'not_started' NOT NULL,
  "manualRecoveryRequired" boolean DEFAULT false NOT NULL,
  "manualRecoveryResolvedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_attempts" (
  "id" serial PRIMARY KEY NOT NULL,
  "paymentId" integer NOT NULL,
  "attemptNo" integer NOT NULL,
  "status" "payment_attempt_status" DEFAULT 'pending_provider_creation' NOT NULL,
  "providerPayloadJson" json,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider" "payment_provider" DEFAULT 'beam' NOT NULL,
  "eventType" varchar(128) NOT NULL,
  "eventId" varchar(128),
  "signatureValid" boolean DEFAULT false NOT NULL,
  "payloadJson" json,
  "processingStatus" "webhook_processing_status" DEFAULT 'pending' NOT NULL,
  "processedAt" timestamp with time zone,
  "errorMessage" text,
  "validatedSecretVersion" varchar(64),
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "invoiceId" integer NOT NULL,
  "action" varchar(128) NOT NULL,
  "actorType" "rendered_by_type" NOT NULL,
  "actorId" integer,
  "reason" text,
  "beforeJson" json,
  "afterJson" json,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_dispatches" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer,
  "invoiceId" integer,
  "notificationType" varchar(64) NOT NULL,
  "channel" varchar(32) NOT NULL,
  "dedupeKey" varchar(256) NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "sentAt" timestamp with time zone,
  "suppressedReason" varchar(256),
  "metadataJson" json,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_effects" (
  "id" serial PRIMARY KEY NOT NULL,
  "effectKey" varchar(256) NOT NULL,
  "effectType" "billing_effect_type" NOT NULL,
  "invoiceId" integer,
  "paymentId" integer,
  "subscriptionId" integer,
  "metadataJson" json,
  "appliedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reconciliation_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "entityType" "reconciliation_entity_type" NOT NULL,
  "entityId" integer NOT NULL,
  "triggerType" "reconciliation_trigger_type" NOT NULL,
  "result" "reconciliation_result" NOT NULL,
  "beforeJson" json,
  "afterJson" json,
  "notes" text,
  "createdBy" integer,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_recovery_cases" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36),
  "userId" integer,
  "invoiceId" integer,
  "paymentId" integer,
  "status" "support_recovery_case_status" DEFAULT 'open' NOT NULL,
  "issueType" "support_recovery_issue_type" NOT NULL,
  "customerReportedAt" timestamp with time zone,
  "assignedAdminId" integer,
  "resolutionType" "support_recovery_resolution_type",
  "resolutionNote" text,
  "evidenceJson" json,
  "resolvedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "billing_profiles_user_unique" ON "billing_profiles" USING btree ("userId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_number_sequences_scope_unique" ON "document_number_sequences" USING btree ("tenantId", "stream", "documentType", "prefix");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_invoice_number_unique" ON "invoices" USING btree ("invoiceNumber") WHERE "invoiceNumber" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_subscription_cycle_unique" ON "invoices" USING btree ("subscriptionId", "billingCycleStart", "billingCycleEnd", "invoiceType") WHERE "subscriptionId" IS NOT NULL AND "supersedesInvoiceId" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_provider_payment_id_unique" ON "payments" USING btree ("providerPaymentId") WHERE "providerPaymentId" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_invoice_active_unique" ON "payments" USING btree ("invoiceId") WHERE "status" IN ('pending_provider_creation', 'payment_pending', 'provider_pending_unknown', 'reconciliation_required', 'manual_review_required');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_attempts_payment_attempt_no_unique" ON "payment_attempts" USING btree ("paymentId", "attemptNo");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_provider_event_unique" ON "webhook_events" USING btree ("provider", "eventId") WHERE "eventId" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_dispatches_dedupe_unique" ON "notification_dispatches" USING btree ("dedupeKey");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_effects_effect_key_unique" ON "billing_effects" USING btree ("effectKey");
--> statement-breakpoint
