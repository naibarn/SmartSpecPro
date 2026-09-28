SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE "llm_inference_policy_snapshots" (
  "id" serial PRIMARY KEY,
  "scopeType" varchar(16) NOT NULL,
  "scopeKey" varchar(256) NOT NULL,
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "principalRef" varchar(256),
  "revision" varchar(256) NOT NULL,
  "policyJson" jsonb NOT NULL,
  "createdByUserId" integer REFERENCES "users"("id") ON DELETE RESTRICT,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "llm_inference_policy_snapshot_scope_revision_unique"
    UNIQUE ("scopeType", "scopeKey", "revision"),
  CONSTRAINT "llm_inference_policy_snapshot_id_scope_unique"
    UNIQUE ("id", "scopeType", "scopeKey"),
  CONSTRAINT "llm_inference_policy_snapshot_scope_check"
    CHECK (
      ("scopeType" = 'platform' AND "scopeKey" = 'platform' AND "tenantId" IS NULL AND "principalRef" IS NULL)
      OR ("scopeType" = 'tenant' AND "tenantId" IS NOT NULL AND "scopeKey" = "tenantId" AND "principalRef" IS NULL)
      OR ("scopeType" = 'principal' AND "tenantId" IS NOT NULL AND "principalRef" IS NOT NULL AND "scopeKey" = "tenantId" || ':' || "principalRef")
    ),
  CONSTRAINT "llm_inference_policy_snapshot_payload_check"
    CHECK (
      jsonb_typeof("policyJson") = 'object'
      AND jsonb_typeof("policyJson"->'ready') = 'boolean'
      AND jsonb_typeof("policyJson"->'requireZeroDataRetention') = 'boolean'
      AND jsonb_typeof("policyJson"->'allowedProviderIds') = 'array'
      AND jsonb_typeof("policyJson"->'allowedRegions') = 'array'
      AND jsonb_typeof("policyJson"->'allowedCredentialOwnerRefs') = 'array'
    )
);
--> statement-breakpoint
CREATE INDEX "llm_inference_policy_snapshot_scope_created_idx"
  ON "llm_inference_policy_snapshots" ("scopeType", "scopeKey", "createdAt" DESC);
--> statement-breakpoint
CREATE TABLE "llm_inference_policy_heads" (
  "scopeType" varchar(16) NOT NULL,
  "scopeKey" varchar(256) NOT NULL,
  "snapshotId" integer NOT NULL,
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "llm_inference_policy_heads_pk" PRIMARY KEY ("scopeType", "scopeKey"),
  CONSTRAINT "llm_inference_policy_head_snapshot_scope_fk"
    FOREIGN KEY ("snapshotId", "scopeType", "scopeKey")
    REFERENCES "llm_inference_policy_snapshots"("id", "scopeType", "scopeKey")
    ON DELETE RESTRICT,
  CONSTRAINT "llm_inference_policy_head_scope_check"
    CHECK ("scopeType" IN ('platform', 'tenant', 'principal'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "llm_inference_policy_head_snapshot_unique"
  ON "llm_inference_policy_heads" ("snapshotId");
--> statement-breakpoint
CREATE TABLE "llm_inference_revocations" (
  "id" serial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "scopeType" varchar(16) NOT NULL,
  "principalRef" varchar(256),
  "targetType" varchar(16) NOT NULL,
  "targetId" varchar(256) NOT NULL,
  "reasonCode" varchar(64) NOT NULL,
  "createdByUserId" integer REFERENCES "users"("id") ON DELETE RESTRICT,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "expiresAt" timestamp with time zone,
  CONSTRAINT "llm_inference_revocation_scope_check"
    CHECK (("scopeType" = 'tenant' AND "principalRef" IS NULL) OR ("scopeType" = 'principal' AND "principalRef" IS NOT NULL)),
  CONSTRAINT "llm_inference_revocation_target_check"
    CHECK ("targetType" IN ('model', 'deployment')),
  CONSTRAINT "llm_inference_revocation_expiry_check"
    CHECK ("expiresAt" IS NULL OR "expiresAt" > "createdAt")
);
--> statement-breakpoint
CREATE INDEX "llm_inference_revocation_active_scope_idx"
  ON "llm_inference_revocations" ("tenantId", "scopeType", "principalRef", "expiresAt");
--> statement-breakpoint
CREATE INDEX "llm_inference_revocation_target_idx"
  ON "llm_inference_revocations" ("targetType", "targetId", "expiresAt");
--> statement-breakpoint
CREATE FUNCTION "reject_llm_inference_authority_history_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'llm inference authority history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "llm_inference_policy_snapshots_immutable"
  BEFORE UPDATE OR DELETE ON "llm_inference_policy_snapshots"
  FOR EACH ROW EXECUTE FUNCTION "reject_llm_inference_authority_history_mutation"();
--> statement-breakpoint
CREATE TRIGGER "llm_inference_revocations_immutable"
  BEFORE UPDATE OR DELETE ON "llm_inference_revocations"
  FOR EACH ROW EXECUTE FUNCTION "reject_llm_inference_authority_history_mutation"();
