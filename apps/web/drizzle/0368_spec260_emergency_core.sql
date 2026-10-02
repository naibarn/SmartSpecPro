SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint

-- Spec 260 requires PostGIS as the geospatial authority. Deployment preflight
-- must verify the managed PostgreSQL plan exposes this extension.
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_reports" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "publicRef" varchar(24) NOT NULL,
  "idempotencyKeyHash" varchar(64) NOT NULL,
  "reportType" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'received',
  "summary" varchar(1000) NOT NULL,
  "detailsJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "observedAt" timestamptz,
  "exactLocation" geography(Point,4326),
  "locationAccuracyMeters" integer,
  "locationDisclosure" varchar(24) NOT NULL DEFAULT 'private',
  "contactJson" jsonb,
  "sourceJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "reporterUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "workerJobId" varchar(36) REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_reports_status_check" CHECK ("status" IN ('received', 'triage', 'linked', 'closed', 'duplicate', 'rejected')),
  CONSTRAINT "emergency_reports_location_disclosure_check" CHECK ("locationDisclosure" IN ('private', 'responder', 'operations')),
  CONSTRAINT "emergency_reports_location_accuracy_check" CHECK ("locationAccuracyMeters" IS NULL OR "locationAccuracyMeters" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_reports_tenant_public_ref_unique" ON "emergency_reports" ("tenantId", "publicRef");
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_reports_tenant_idempotency_unique" ON "emergency_reports" ("tenantId", "idempotencyKeyHash");
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_reports_worker_job_unique" ON "emergency_reports" ("workerJobId") WHERE "workerJobId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "emergency_reports_tenant_status_created_idx" ON "emergency_reports" ("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "emergency_reports_location_gist_idx" ON "emergency_reports" USING gist ("exactLocation");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "eventType" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'monitoring',
  "jurisdictionRef" varchar(160),
  "provenanceJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "occurredAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "emergency_events_tenant_status_created_idx" ON "emergency_events" ("tenantId", "status", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_incidents" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "eventId" varchar(36) REFERENCES "emergency_events"("id") ON DELETE SET NULL,
  "reportId" varchar(36) REFERENCES "emergency_reports"("id") ON DELETE SET NULL,
  "hazardType" varchar(96) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'reported',
  "severity" varchar(24) NOT NULL DEFAULT 'unknown',
  "exactLocation" geography(Point,4326),
  "provenanceJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_incidents_status_check" CHECK ("status" IN ('reported', 'assessed', 'active', 'contained', 'resolved', 'closed'))
);
CREATE INDEX IF NOT EXISTS "emergency_incidents_tenant_status_idx" ON "emergency_incidents" ("tenantId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "emergency_incidents_event_idx" ON "emergency_incidents" ("tenantId", "eventId");
CREATE INDEX IF NOT EXISTS "emergency_incidents_location_gist_idx" ON "emergency_incidents" USING gist ("exactLocation");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_situations" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "eventId" varchar(36) REFERENCES "emergency_events"("id") ON DELETE SET NULL,
  "incidentId" varchar(36) REFERENCES "emergency_incidents"("id") ON DELETE SET NULL,
  "publicRef" varchar(24) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'monitoring',
  "severity" varchar(24) NOT NULL DEFAULT 'unknown',
  "publicProjectionJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "publicLocation" geography(Point,4326),
  "sourceJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "observedAt" timestamptz,
  "freshUntil" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_situations_status_check" CHECK ("status" IN ('draft', 'monitoring', 'active', 'contained', 'resolved', 'cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_situations_tenant_public_ref_unique" ON "emergency_situations" ("tenantId", "publicRef");
CREATE INDEX IF NOT EXISTS "emergency_situations_public_status_idx" ON "emergency_situations" ("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "emergency_situations_location_gist_idx" ON "emergency_situations" USING gist ("publicLocation");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_cases" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "reporterUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reportId" varchar(36) REFERENCES "emergency_reports"("id") ON DELETE SET NULL,
  "incidentId" varchar(36) REFERENCES "emergency_incidents"("id") ON DELETE SET NULL,
  "status" varchar(32) NOT NULL DEFAULT 'open',
  "revision" integer NOT NULL DEFAULT 0,
  "caseContextJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_cases_status_check" CHECK ("status" IN ('open', 'triage', 'active', 'waiting', 'resolved', 'closed'))
);
CREATE INDEX IF NOT EXISTS "emergency_cases_tenant_owner_status_idx" ON "emergency_cases" ("tenantId", "reporterUserId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "emergency_cases_report_idx" ON "emergency_cases" ("reportId");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_case_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "caseId" varchar(36) NOT NULL REFERENCES "emergency_cases"("id") ON DELETE RESTRICT,
  "eventIdempotencyKey" varchar(160) NOT NULL,
  "actorType" varchar(24) NOT NULL,
  "actorRef" varchar(160),
  "eventType" varchar(64) NOT NULL,
  "reason" varchar(1000) NOT NULL,
  "revision" integer NOT NULL,
  "previousHash" varchar(64),
  "eventHash" varchar(64) NOT NULL,
  "payloadJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_case_events_tenant_key_unique" ON "emergency_case_events" ("tenantId", "eventIdempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_case_events_case_revision_unique" ON "emergency_case_events" ("caseId", "revision");
CREATE INDEX IF NOT EXISTS "emergency_case_events_tenant_case_created_idx" ON "emergency_case_events" ("tenantId", "caseId", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_audit_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "subjectType" varchar(48) NOT NULL,
  "subjectId" varchar(36) NOT NULL,
  "eventIdempotencyKey" varchar(160) NOT NULL,
  "actorType" varchar(24) NOT NULL,
  "actorRef" varchar(160),
  "eventType" varchar(64) NOT NULL,
  "reason" varchar(1000) NOT NULL,
  "previousHash" varchar(64),
  "eventHash" varchar(64) NOT NULL,
  "beforeJson" jsonb,
  "afterJson" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_audit_events_tenant_key_unique" ON "emergency_audit_events" ("tenantId", "eventIdempotencyKey");
CREATE INDEX IF NOT EXISTS "emergency_audit_events_subject_created_idx" ON "emergency_audit_events" ("tenantId", "subjectType", "subjectId", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_needs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "caseId" varchar(36) NOT NULL REFERENCES "emergency_cases"("id") ON DELETE RESTRICT,
  "needType" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'reported',
  "priority" varchar(24) NOT NULL DEFAULT 'unknown',
  "requestedQuantity" numeric(14,3),
  "fulfilledQuantity" numeric(14,3) NOT NULL DEFAULT 0,
  "revision" integer NOT NULL DEFAULT 0,
  "needJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_needs_status_check" CHECK ("status" IN ('reported', 'triage', 'verified', 'partially_fulfilled', 'fulfilled', 'verified_fulfilled', 'cancelled')),
  CONSTRAINT "emergency_needs_quantity_check" CHECK ("fulfilledQuantity" >= 0 AND ("requestedQuantity" IS NULL OR "requestedQuantity" >= 0))
);
CREATE INDEX IF NOT EXISTS "emergency_needs_tenant_case_status_idx" ON "emergency_needs" ("tenantId", "caseId", "status", "updatedAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_capability_grants" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "capability" varchar(64) NOT NULL,
  "scopeType" varchar(32) NOT NULL DEFAULT 'tenant',
  "scopeRef" varchar(160) NOT NULL DEFAULT 'tenant',
  "grantedByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "expiresAt" timestamptz,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_capability_grants_capability_check" CHECK ("capability" IN ('emergency.respond', 'emergency.command', 'emergency.sponsorship', 'emergency.verify'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_capability_grants_scope_unique" ON "emergency_capability_grants" ("tenantId", "userId", "capability", "scopeType", "scopeRef");
CREATE INDEX IF NOT EXISTS "emergency_capability_grants_user_active_idx" ON "emergency_capability_grants" ("tenantId", "userId", "revokedAt", "expiresAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_response_tasks" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "caseId" varchar(36) NOT NULL REFERENCES "emergency_cases"("id") ON DELETE RESTRICT,
  "needId" varchar(36) REFERENCES "emergency_needs"("id") ON DELETE SET NULL,
  "taskType" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'ready',
  "safetyClass" varchar(32) NOT NULL DEFAULT 'professional_only',
  "taskJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_response_tasks_status_check" CHECK ("status" IN ('draft', 'ready', 'offered', 'claimed', 'in_progress', 'completed', 'cancelled', 'blocked')),
  CONSTRAINT "emergency_response_tasks_safety_check" CHECK ("safetyClass" IN ('community_safe', 'verified_only', 'professional_only', 'restricted'))
);
CREATE INDEX IF NOT EXISTS "emergency_response_tasks_tenant_case_status_idx" ON "emergency_response_tasks" ("tenantId", "caseId", "status");
CREATE INDEX IF NOT EXISTS "emergency_response_tasks_need_idx" ON "emergency_response_tasks" ("tenantId", "needId", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_assignments" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "caseId" varchar(36) NOT NULL REFERENCES "emergency_cases"("id") ON DELETE RESTRICT,
  "needId" varchar(36) REFERENCES "emergency_needs"("id") ON DELETE SET NULL,
  "taskId" varchar(36) REFERENCES "emergency_response_tasks"("id") ON DELETE RESTRICT,
  "responderUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "status" varchar(32) NOT NULL DEFAULT 'offered',
  "scopeJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_assignments_status_check" CHECK ("status" IN ('offered', 'accepted', 'en_route', 'working', 'completed', 'declined', 'cancelled', 'safety_stopped'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_assignments_active_scope_unique" ON "emergency_assignments" ("tenantId", "caseId", "needId", "responderUserId");
CREATE INDEX IF NOT EXISTS "emergency_assignments_responder_status_idx" ON "emergency_assignments" ("tenantId", "responderUserId", "status", "updatedAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_public_alerts" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "situationId" varchar(36) REFERENCES "emergency_situations"("id") ON DELETE SET NULL,
  "publicRef" varchar(24) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'draft',
  "severity" varchar(24) NOT NULL,
  "messageJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "issuedAt" timestamptz,
  "expiresAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_public_alerts_status_check" CHECK ("status" IN ('draft', 'published', 'updated', 'cancelled', 'expired'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_public_alerts_tenant_ref_unique" ON "emergency_public_alerts" ("tenantId", "publicRef");
CREATE INDEX IF NOT EXISTS "emergency_public_alerts_status_issued_idx" ON "emergency_public_alerts" ("status", "issuedAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_facilities" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "publicRef" varchar(24) NOT NULL,
  "facilityType" varchar(64) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'open',
  "capacityClass" varchar(24),
  "publicProjectionJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "publicLocation" geography(Point,4326),
  "verifiedAt" timestamptz,
  "freshUntil" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_facilities_status_check" CHECK ("status" IN ('open', 'limited', 'full', 'closed', 'unknown'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_facilities_tenant_ref_unique" ON "emergency_facilities" ("tenantId", "publicRef");
CREATE INDEX IF NOT EXISTS "emergency_facilities_public_status_idx" ON "emergency_facilities" ("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "emergency_facilities_location_gist_idx" ON "emergency_facilities" USING gist ("publicLocation");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_support_pools" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "publicRef" varchar(24) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'draft',
  "title" varchar(200) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "currency" varchar(3) NOT NULL,
  "targetMinorUnits" bigint,
  "policyJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_support_pools_status_check" CHECK ("status" IN ('draft', 'active', 'paused', 'closed', 'cancelled')),
  CONSTRAINT "emergency_support_pools_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "emergency_support_pools_target_check" CHECK ("targetMinorUnits" IS NULL OR "targetMinorUnits" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_support_pools_tenant_ref_unique" ON "emergency_support_pools" ("tenantId", "publicRef");
CREATE INDEX IF NOT EXISTS "emergency_support_pools_status_created_idx" ON "emergency_support_pools" ("status", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_contributions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "poolId" varchar(36) NOT NULL REFERENCES "emergency_support_pools"("id") ON DELETE RESTRICT,
  "donorUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "idempotencyKeyHash" varchar(64) NOT NULL,
  "amountMinorUnits" bigint NOT NULL,
  "currency" varchar(3) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'pending',
  "paymentIntentRef" varchar(200),
  "paymentRecordRef" integer REFERENCES "payments"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_contributions_status_check" CHECK ("status" IN ('pending', 'authorized', 'settled', 'failed', 'refunded', 'disputed')),
  CONSTRAINT "emergency_contributions_amount_check" CHECK ("amountMinorUnits" > 0 AND "currency" ~ '^[A-Z]{3}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_contributions_tenant_idempotency_unique" ON "emergency_contributions" ("tenantId", "idempotencyKeyHash");
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_contributions_payment_ref_unique" ON "emergency_contributions" ("paymentIntentRef") WHERE "paymentIntentRef" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "emergency_contributions_pool_status_idx" ON "emergency_contributions" ("tenantId", "poolId", "status", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_consent_receipts" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "caseId" varchar(36) NOT NULL REFERENCES "emergency_cases"("id") ON DELETE RESTRICT,
  "subjectUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "purpose" varchar(64) NOT NULL,
  "dataCategoriesJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "recipientScopeJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "legalBasis" varchar(48) NOT NULL,
  "decision" varchar(16) NOT NULL,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_consent_decision_check" CHECK ("decision" IN ('granted', 'denied'))
);
CREATE INDEX IF NOT EXISTS "emergency_consent_case_purpose_idx" ON "emergency_consent_receipts" ("tenantId", "caseId", "purpose", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_evidence_assets" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "caseId" varchar(36) REFERENCES "emergency_cases"("id") ON DELETE RESTRICT,
  "reportId" varchar(36) REFERENCES "emergency_reports"("id") ON DELETE RESTRICT,
  "objectRef" varchar(512) NOT NULL,
  "sha256" varchar(64) NOT NULL,
  "mediaType" varchar(128) NOT NULL,
  "byteLength" bigint NOT NULL,
  "visibility" varchar(24) NOT NULL DEFAULT 'restricted',
  "chainJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_evidence_sha256_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "emergency_evidence_bytes_check" CHECK ("byteLength" > 0),
  CONSTRAINT "emergency_evidence_visibility_check" CHECK ("visibility" IN ('restricted', 'responder', 'public_derivative'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_evidence_object_ref_unique" ON "emergency_evidence_assets" ("objectRef");
CREATE INDEX IF NOT EXISTS "emergency_evidence_case_created_idx" ON "emergency_evidence_assets" ("tenantId", "caseId", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_case_messages" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "caseId" varchar(36) NOT NULL REFERENCES "emergency_cases"("id") ON DELETE RESTRICT,
  "senderType" varchar(24) NOT NULL,
  "senderRef" varchar(160),
  "channel" varchar(32) NOT NULL,
  "body" text NOT NULL,
  "idempotencyKey" varchar(160) NOT NULL,
  "consentReceiptId" varchar(36) REFERENCES "emergency_consent_receipts"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_case_messages_tenant_idempotency_unique" ON "emergency_case_messages" ("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "emergency_case_messages_tenant_case_created_idx" ON "emergency_case_messages" ("tenantId", "caseId", "createdAt");
--> statement-breakpoint

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "emergency_report_access_tokens" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "reportId" varchar(36) NOT NULL REFERENCES "emergency_reports"("id") ON DELETE CASCADE,
  "caseId" varchar(36) NOT NULL REFERENCES "emergency_cases"("id") ON DELETE CASCADE,
  "tokenHash" varchar(64) NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_report_access_token_hash_unique" ON "emergency_report_access_tokens" ("tokenHash");
CREATE INDEX IF NOT EXISTS "emergency_report_access_tenant_case_idx" ON "emergency_report_access_tokens" ("tenantId", "caseId", "expiresAt");
