CREATE TYPE "payment_method_type" AS ENUM ('card');
CREATE TYPE "billing_payment_method_status" AS ENUM ('active', 'requires_verification', 'expired', 'revoked', 'provider_unavailable');
CREATE TYPE "renewal_mode" AS ENUM ('manual_invoice', 'auto_charge');
CREATE TYPE "renewal_attempt_status" AS ENUM (
  'scheduled',
  'charge_in_progress',
  'retry_scheduled',
  'grace_period_active',
  'requires_new_card',
  'manual_fallback_active',
  'paused_dunning',
  'settled',
  'terminal_failure',
  'manual_review_required'
);
CREATE TYPE "decline_category" AS ENUM ('soft_decline', 'hard_decline', 'provider_unknown', 'manual_review_required');

CREATE TABLE "billing_payment_methods" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36),
  "userId" integer NOT NULL,
  "provider" "payment_provider" DEFAULT 'beam' NOT NULL,
  "providerCustomerId" varchar(128),
  "providerPaymentMethodId" varchar(128) NOT NULL,
  "methodType" "payment_method_type" DEFAULT 'card' NOT NULL,
  "brand" varchar(64),
  "last4" varchar(8),
  "expMonth" integer,
  "expYear" integer,
  "cardholderName" varchar(256),
  "isDefault" boolean DEFAULT false NOT NULL,
  "status" "billing_payment_method_status" DEFAULT 'active' NOT NULL,
  "autoRenewEligible" boolean DEFAULT false NOT NULL,
  "consentVersion" varchar(128),
  "consentedAt" timestamp with time zone,
  "revokedAt" timestamp with time zone,
  "metadataJson" json,
  "consentSnapshotJson" json,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "billing_payment_methods_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE cascade,
  CONSTRAINT "billing_payment_methods_user_fk" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE cascade
);

CREATE UNIQUE INDEX "billing_payment_methods_provider_ref_unique"
  ON "billing_payment_methods" ("provider", "providerCustomerId", "providerPaymentMethodId");
CREATE UNIQUE INDEX "billing_payment_methods_default_scope_unique"
  ON "billing_payment_methods" ("userId", "tenantId", "provider")
  WHERE "isDefault" = true AND "status" IN ('active', 'requires_verification');
CREATE INDEX "billing_payment_methods_user_idx"
  ON "billing_payment_methods" ("userId", "createdAt");
CREATE INDEX "billing_payment_methods_tenant_idx"
  ON "billing_payment_methods" ("tenantId", "userId");

ALTER TABLE "billing_subscriptions"
  ADD COLUMN "renewalMode" "renewal_mode" DEFAULT 'manual_invoice' NOT NULL,
  ADD COLUMN "defaultPaymentMethodId" integer,
  ADD COLUMN "autoRenewEnabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN "nextRetryAt" timestamp with time zone,
  ADD COLUMN "graceEndsAt" timestamp with time zone;

ALTER TABLE "billing_subscriptions"
  ADD CONSTRAINT "billing_subscriptions_default_payment_method_fk"
  FOREIGN KEY ("defaultPaymentMethodId") REFERENCES "billing_payment_methods"("id") ON DELETE set null;

CREATE TABLE "subscription_payment_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "subscriptionId" integer NOT NULL,
  "renewalMode" "renewal_mode" DEFAULT 'manual_invoice' NOT NULL,
  "defaultPaymentMethodId" integer,
  "retryPolicyJson" json,
  "dunningPolicyJson" json,
  "autoRenewEnabled" boolean DEFAULT false NOT NULL,
  "consentWithdrawnAt" timestamp with time zone,
  "rolloutCohort" varchar(128),
  "updatedBy" integer,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "subscription_payment_settings_subscription_fk" FOREIGN KEY ("subscriptionId") REFERENCES "billing_subscriptions"("id") ON DELETE cascade,
  CONSTRAINT "subscription_payment_settings_default_method_fk" FOREIGN KEY ("defaultPaymentMethodId") REFERENCES "billing_payment_methods"("id") ON DELETE set null,
  CONSTRAINT "subscription_payment_settings_updated_by_fk" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE set null
);

CREATE UNIQUE INDEX "subscription_payment_settings_subscription_unique"
  ON "subscription_payment_settings" ("subscriptionId");
CREATE INDEX "subscription_payment_settings_default_method_idx"
  ON "subscription_payment_settings" ("defaultPaymentMethodId");

CREATE TABLE "payment_method_audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "paymentMethodId" integer NOT NULL,
  "action" varchar(128) NOT NULL,
  "actorType" "rendered_by_type" NOT NULL,
  "actorId" integer,
  "reason" text,
  "beforeJson" json,
  "afterJson" json,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_method_audit_logs_payment_method_fk" FOREIGN KEY ("paymentMethodId") REFERENCES "billing_payment_methods"("id") ON DELETE cascade
);

CREATE INDEX "payment_method_audit_logs_method_idx"
  ON "payment_method_audit_logs" ("paymentMethodId", "createdAt");

ALTER TABLE "payments"
  ADD COLUMN "paymentMethodId" integer,
  ADD COLUMN "offSession" boolean DEFAULT false NOT NULL,
  ADD COLUMN "declineCode" varchar(128),
  ADD COLUMN "declineCategory" "decline_category";

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_payment_method_fk"
  FOREIGN KEY ("paymentMethodId") REFERENCES "billing_payment_methods"("id") ON DELETE set null;

CREATE TABLE "renewal_attempts" (
  "id" serial PRIMARY KEY NOT NULL,
  "subscriptionId" integer NOT NULL,
  "invoiceId" integer,
  "cycleKey" varchar(128) NOT NULL,
  "renewalModeSnapshot" "renewal_mode" DEFAULT 'manual_invoice' NOT NULL,
  "paymentMethodId" integer,
  "attemptNo" integer DEFAULT 1 NOT NULL,
  "status" "renewal_attempt_status" DEFAULT 'scheduled' NOT NULL,
  "retryClassification" varchar(64),
  "scheduledAt" timestamp with time zone,
  "executedAt" timestamp with time zone,
  "failureCode" varchar(128),
  "failureMessage" text,
  "nextRetryAt" timestamp with time zone,
  "finalOutcome" varchar(128),
  "metadataJson" json,
  "supersededByAttemptId" integer,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "renewal_attempts_subscription_fk" FOREIGN KEY ("subscriptionId") REFERENCES "billing_subscriptions"("id") ON DELETE cascade,
  CONSTRAINT "renewal_attempts_invoice_fk" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE cascade,
  CONSTRAINT "renewal_attempts_payment_method_fk" FOREIGN KEY ("paymentMethodId") REFERENCES "billing_payment_methods"("id") ON DELETE set null
);

CREATE UNIQUE INDEX "renewal_attempts_subscription_cycle_attempt_unique"
  ON "renewal_attempts" ("subscriptionId", "cycleKey", "attemptNo");
CREATE UNIQUE INDEX "renewal_attempts_active_cycle_unique"
  ON "renewal_attempts" ("subscriptionId", "cycleKey")
  WHERE "status" IN ('scheduled', 'charge_in_progress', 'retry_scheduled', 'grace_period_active', 'paused_dunning', 'manual_review_required');
CREATE INDEX "renewal_attempts_invoice_idx"
  ON "renewal_attempts" ("invoiceId");
CREATE INDEX "renewal_attempts_payment_method_idx"
  ON "renewal_attempts" ("paymentMethodId");
