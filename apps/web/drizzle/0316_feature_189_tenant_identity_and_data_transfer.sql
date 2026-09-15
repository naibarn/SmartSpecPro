-- Feature 189: tenant identity evidence and resumable same-tenant transfer
-- foundation. Additive only: no existing jobs, events, credits, transactions,
-- media, or domain-owned records are copied, deleted, or rewritten.
--
-- The optional app.feature189_default_tenant_id setting is intentionally
-- fail-closed. Nullable legacy currentTenantId rows are assigned only by a
-- unique persisted registered-domain match or that explicit setting; they are
-- never assigned by request hostname or by an arbitrary "first active" tenant.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "tenantIdentityMigrationReason" varchar(120);--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "tenantIdentityMigratedAt" timestamptz;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_current_tenant_idx"
  ON "users" ("currentTenantId", "id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tenant_identity_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "actorType" varchar(32) NOT NULL,
  "actorId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "oldTenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "newTenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "action" varchar(40) NOT NULL CHECK ("action" IN ('backfill', 'system_admin_move')),
  "reason" varchar(500) NOT NULL,
  "priorCredits" integer NOT NULL DEFAULT 0 CHECK ("priorCredits" >= 0),
  "currentCredits" integer NOT NULL DEFAULT 0 CHECK ("currentCredits" >= 0),
  "creditResetStatus" varchar(40) NOT NULL DEFAULT 'not_applicable',
  "sessionRevocationStatus" varchar(40) NOT NULL DEFAULT 'not_attempted',
  "actionIdempotencyKey" varchar(128) NOT NULL,
  "eventKey" varchar(200) NOT NULL,
  "correlationId" varchar(128),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_identity_events_event_key_unique"
  ON "tenant_identity_events" ("eventKey");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_identity_events_action_user_unique"
  ON "tenant_identity_events" ("userId", "actionIdempotencyKey", "action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_identity_events_user_created_idx"
  ON "tenant_identity_events" ("userId", "createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_identity_events_tenant_created_idx"
  ON "tenant_identity_events" ("newTenantId", "createdAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tenant_identity_actions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "actionId" varchar(128) NOT NULL,
  "commandTargetHash" varchar(64) NOT NULL,
  "sourceTenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "targetTenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "phase" varchar(40) NOT NULL DEFAULT 'pending'
    CHECK ("phase" IN ('pending', 'open', 'fenced', 'executing', 'paused', 'completed', 'failed', 'cancelled')),
  "fencingVersion" integer NOT NULL DEFAULT 0 CHECK ("fencingVersion" >= 0),
  "authorizationDecision" varchar(40) NOT NULL,
  "reason" varchar(500) NOT NULL,
  "outcomeJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "safeErrorCode" varchar(100),
  "effectiveAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_identity_actions_user_action_unique"
  ON "tenant_identity_actions" ("userId", "actionId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_identity_actions_active_fence_unique"
  ON "tenant_identity_actions" ("userId")
  WHERE "phase" IN ('pending', 'open', 'fenced', 'executing', 'paused');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_identity_actions_user_updated_idx"
  ON "tenant_identity_actions" ("userId", "updatedAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tenant_data_transfer_previews" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "sourceUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "targetUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "selectionHash" varchar(64) NOT NULL,
  "snapshotFingerprint" varchar(64) NOT NULL,
  "handlerRegistryVersion" varchar(80) NOT NULL,
  "policyVersion" varchar(80) NOT NULL,
  "schemaVersion" varchar(80) NOT NULL,
  "createdByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "selectionJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "handlerSnapshotJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "countsJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "requestIdempotencyKey" varchar(128) NOT NULL,
  "generatedAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL,
  CONSTRAINT "tenant_data_transfer_previews_distinct_users_check"
    CHECK ("sourceUserId" <> "targetUserId")
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_data_transfer_previews_request_unique"
  ON "tenant_data_transfer_previews" ("tenantId", "requestIdempotencyKey");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_data_transfer_previews_fingerprint_unique"
  ON "tenant_data_transfer_previews" ("tenantId", "snapshotFingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_data_transfer_previews_tenant_expiry_idx"
  ON "tenant_data_transfer_previews" ("tenantId", "expiresAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_data_transfer_previews_source_idx"
  ON "tenant_data_transfer_previews" ("tenantId", "sourceUserId", "generatedAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tenant_data_transfer_preview_items" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "previewId" varchar(36) NOT NULL REFERENCES "tenant_data_transfer_previews"("id") ON DELETE RESTRICT,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "sourceUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "targetUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "resourceKind" varchar(100) NOT NULL,
  "sourceResourceId" varchar(255) NOT NULL,
  "handlerVersion" varchar(80) NOT NULL,
  "dependencyOrder" integer NOT NULL DEFAULT 0,
  "classification" varchar(40) NOT NULL,
  "disposition" varchar(80),
  "reasonCode" varchar(100),
  "reasonDetail" varchar(1000),
  "contentHash" varchar(128),
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "cursorKey" varchar(255) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_data_transfer_preview_items_distinct_users_check"
    CHECK ("sourceUserId" <> "targetUserId")
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_data_transfer_preview_items_resource_unique"
  ON "tenant_data_transfer_preview_items" ("previewId", "resourceKind", "sourceResourceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_data_transfer_preview_items_cursor_idx"
  ON "tenant_data_transfer_preview_items" ("previewId", "cursorKey", "id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_data_transfer_preview_items_classification_idx"
  ON "tenant_data_transfer_preview_items" ("previewId", "classification", "cursorKey");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tenant_data_transfer_plans" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "operationId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "previewId" varchar(36) NOT NULL REFERENCES "tenant_data_transfer_previews"("id") ON DELETE RESTRICT,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "sourceUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "targetUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "previewFingerprint" varchar(64) NOT NULL,
  "selectionJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "handlerSnapshotJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "policyJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "approvedAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_data_transfer_plans_distinct_users_check"
    CHECK ("sourceUserId" <> "targetUserId")
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_data_transfer_plans_operation_unique"
  ON "tenant_data_transfer_plans" ("operationId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_data_transfer_plans_preview_unique"
  ON "tenant_data_transfer_plans" ("previewId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_data_transfer_plans_tenant_source_idx"
  ON "tenant_data_transfer_plans" ("tenantId", "sourceUserId", "createdAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tenant_data_transfer_items" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "operationId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "sourceUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "targetUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "resourceKind" varchar(100) NOT NULL,
  "sourceResourceId" varchar(255) NOT NULL,
  "destinationResourceId" varchar(255),
  "destinationMarker" varchar(255),
  "state" varchar(40) NOT NULL DEFAULT 'pending'
    CHECK ("state" IN ('pending', 'transferred', 'retryable_error', 'permanent_error', 'conflict', 'skipped')),
  "handlerVersion" varchar(80) NOT NULL,
  "contentHash" varchar(128),
  "definitionHash" varchar(64),
  "itemIdempotencyKey" varchar(200) NOT NULL,
  "disposition" varchar(80),
  "conflictKey" varchar(255),
  "errorCode" varchar(100),
  "errorDetail" varchar(4000),
  "checkpointKey" varchar(160),
  "batchSequence" integer,
  "causalJobId" varchar(36) REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "settledAt" timestamptz,
  CONSTRAINT "tenant_data_transfer_items_distinct_users_check"
    CHECK ("sourceUserId" <> "targetUserId")
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_data_transfer_items_resource_unique"
  ON "tenant_data_transfer_items" ("operationId", "resourceKind", "sourceResourceId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_data_transfer_items_idempotency_unique"
  ON "tenant_data_transfer_items" ("operationId", "itemIdempotencyKey");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_data_transfer_items_destination_unique"
  ON "tenant_data_transfer_items" ("operationId", "destinationMarker")
  WHERE "destinationMarker" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_data_transfer_items_operation_state_idx"
  ON "tenant_data_transfer_items" ("operationId", "state", "batchSequence", "id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_data_transfer_items_tenant_source_idx"
  ON "tenant_data_transfer_items" ("tenantId", "sourceUserId", "state");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tenant_data_transfer_actions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "actionId" varchar(128) NOT NULL,
  "command" varchar(40) NOT NULL CHECK ("command" IN ('approve', 'resume', 'resolveItem', 'cancel')),
  "commandTargetHash" varchar(64) NOT NULL,
  "previewId" varchar(36) REFERENCES "tenant_data_transfer_previews"("id") ON DELETE RESTRICT,
  "operationId" varchar(36) REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "itemId" varchar(36) REFERENCES "tenant_data_transfer_items"("id") ON DELETE RESTRICT,
  "actorType" varchar(32) NOT NULL,
  "actorId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "authorizationScope" varchar(160) NOT NULL,
  "expectedOperationStatus" varchar(40),
  "expectedAttempt" integer,
  "expectedFencingVersion" integer,
  "outcomeJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "safeErrorCode" varchar(100),
  "safeErrorMessage" varchar(1000),
  "effectiveAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_data_transfer_actions_tenant_action_unique"
  ON "tenant_data_transfer_actions" ("tenantId", "actionId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_data_transfer_actions_operation_created_idx"
  ON "tenant_data_transfer_actions" ("operationId", "createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_data_transfer_actions_preview_created_idx"
  ON "tenant_data_transfer_actions" ("previewId", "createdAt");--> statement-breakpoint

-- Record only explicit, safe identity backfills. Existing valid bindings are
-- preserved; null bindings are assigned only when an operator supplies the
-- configured default tenant through app.feature189_default_tenant_id.
DO $$
DECLARE
  configured_default_tenant_id text := NULLIF(current_setting('app.feature189_default_tenant_id', true), '');
  default_tenant_id varchar(36);
  resolved_tenant_id varchar(36);
  resolution_reason varchar(120);
  normalized_registered_domain text;
  updated_count integer;
  user_row record;
BEGIN
  IF configured_default_tenant_id IS NOT NULL THEN
    SELECT t."id"
      INTO default_tenant_id
      FROM "tenants" t
     WHERE t."id" = configured_default_tenant_id
       AND t."isActive" = true
     LIMIT 1;
    IF default_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Configured app.feature189_default_tenant_id is missing or inactive';
    END IF;

    FOR user_row IN
      SELECT u."id", u."currentTenantId", u."credits", u."registeredDomain"
        FROM "users" u
       WHERE u."currentTenantId" IS NULL
         AND COALESCE(u."isSystemUser", false) = false
    LOOP
      resolved_tenant_id := NULL;
      resolution_reason := NULL;
      normalized_registered_domain := NULLIF(
        lower(trim(trailing '.' from btrim(user_row."registeredDomain"))),
        ''
      );

      -- Prefer a single active tenant whose primary/additional domain agrees
      -- with the persisted registration domain. Ambiguous or absent matches
      -- deliberately fall through to the explicitly configured Default
      -- tenant; no hostname or arbitrary first row is ever used.
      IF normalized_registered_domain IS NOT NULL THEN
        SELECT min(t."id")
          INTO resolved_tenant_id
          FROM "tenants" t
         WHERE t."isActive" = true
           AND (
             lower(trim(trailing '.' from btrim(t."primaryDomain"))) = normalized_registered_domain
             OR EXISTS (
               SELECT 1
                 FROM jsonb_array_elements_text(COALESCE(t."domains"::jsonb, '[]'::jsonb)) AS domain(value)
                WHERE lower(trim(trailing '.' from btrim(domain.value))) = normalized_registered_domain
             )
           )
        HAVING count(*) = 1;
        IF resolved_tenant_id IS NOT NULL THEN
          resolution_reason := 'registered_domain_backfill';
        END IF;
      END IF;

      IF resolved_tenant_id IS NULL AND default_tenant_id IS NOT NULL THEN
        resolved_tenant_id := default_tenant_id;
        resolution_reason := 'default_tenant_backfill';
      END IF;

      IF resolved_tenant_id IS NULL THEN
        CONTINUE;
      END IF;

      UPDATE "users"
         SET "currentTenantId" = resolved_tenant_id,
             "tenantIdentityMigrationReason" = resolution_reason,
             "tenantIdentityMigratedAt" = now(),
             "updatedAt" = now()
       WHERE "id" = user_row."id"
         AND "currentTenantId" IS NULL;

      GET DIAGNOSTICS updated_count = ROW_COUNT;
      IF updated_count = 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO "tenant_identity_events" (
        "userId", "actorType", "oldTenantId", "newTenantId", "action",
        "reason", "priorCredits", "currentCredits", "creditResetStatus",
        "sessionRevocationStatus", "actionIdempotencyKey", "eventKey"
      ) VALUES (
        user_row."id", 'system_migration', NULL, resolved_tenant_id, 'backfill',
        resolution_reason, user_row."credits", user_row."credits",
        'not_applicable', 'not_attempted',
        'backfill:user:' || user_row."id" || ':' || resolution_reason,
        'backfill:user:' || user_row."id" || ':tenant:' || resolved_tenant_id
      ) ON CONFLICT ("eventKey") DO NOTHING;
    END LOOP;
  END IF;
END $$;--> statement-breakpoint

UPDATE "users"
   SET "tenantIdentityMigrationReason" = COALESCE("tenantIdentityMigrationReason", 'existing_current_tenant'),
       "tenantIdentityMigratedAt" = COALESCE("tenantIdentityMigratedAt", now())
 WHERE "currentTenantId" IS NOT NULL
   AND ("tenantIdentityMigrationReason" IS NULL OR "tenantIdentityMigratedAt" IS NULL);
