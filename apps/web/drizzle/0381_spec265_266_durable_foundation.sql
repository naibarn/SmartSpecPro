SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint

CREATE TABLE "intelligence_sources" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "visibility" varchar(16) DEFAULT 'tenant' NOT NULL,
  "canonicalSourceId" varchar(160) NOT NULL,
  "providerId" varchar(160) NOT NULL,
  "independenceGroup" varchar(160) NOT NULL,
  "status" varchar(24) DEFAULT 'pending_review' NOT NULL,
  "sourceJson" jsonb NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "updatedAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "intelligence_source_scope_check" CHECK (("visibility" = 'public' AND "tenantId" IS NULL) OR ("visibility" = 'tenant' AND "tenantId" IS NOT NULL)),
  CONSTRAINT "intelligence_source_status_check" CHECK ("status" IN ('pending_review', 'active', 'degraded', 'disabled', 'revoked')),
  CONSTRAINT "intelligence_source_identity_nonempty_check" CHECK (length(btrim("canonicalSourceId")) > 0 AND length(btrim("providerId")) > 0 AND length(btrim("independenceGroup")) > 0),
  CONSTRAINT "intelligence_source_json_size_check" CHECK (octet_length("sourceJson"::text) <= 65536)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "intelligence_source_scope_canonical_unique" ON "intelligence_sources" ("visibility", COALESCE("tenantId", ''), "canonicalSourceId");
CREATE UNIQUE INDEX "intelligence_source_tenant_id_unique" ON "intelligence_sources" ("tenantId", "id");
CREATE INDEX "intelligence_source_provider_status_idx" ON "intelligence_sources" ("providerId", "status");
--> statement-breakpoint

CREATE TABLE "intelligence_datasets" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sourceId" varchar(36) NOT NULL REFERENCES "intelligence_sources"("id") ON DELETE RESTRICT,
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "datasetRef" varchar(160) NOT NULL,
  "version" varchar(80) NOT NULL,
  "status" varchar(24) DEFAULT 'active' NOT NULL,
  "datasetJson" jsonb NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "updatedAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "intelligence_dataset_status_check" CHECK ("status" IN ('active', 'degraded', 'disabled', 'revoked')),
  CONSTRAINT "intelligence_dataset_identity_nonempty_check" CHECK (length(btrim("datasetRef")) > 0 AND length(btrim("version")) > 0),
  CONSTRAINT "intelligence_dataset_json_size_check" CHECK (octet_length("datasetJson"::text) <= 65536)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "intelligence_dataset_source_ref_version_unique" ON "intelligence_datasets" ("sourceId", "datasetRef", "version");
CREATE INDEX "intelligence_dataset_tenant_status_idx" ON "intelligence_datasets" ("tenantId", "status");
--> statement-breakpoint

CREATE TABLE "intelligence_evidence_items" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "visibility" varchar(16) DEFAULT 'tenant' NOT NULL,
  "sourceId" varchar(36) NOT NULL REFERENCES "intelligence_sources"("id") ON DELETE RESTRICT,
  "datasetId" varchar(36) REFERENCES "intelligence_datasets"("id") ON DELETE RESTRICT,
  "evidenceRef" varchar(200) NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "contentHash" varchar(64) NOT NULL,
  "observedAt" timestamptz,
  "evidenceJson" jsonb NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "intelligence_evidence_scope_check" CHECK (("visibility" = 'public' AND "tenantId" IS NULL) OR ("visibility" = 'tenant' AND "tenantId" IS NOT NULL)),
  CONSTRAINT "intelligence_evidence_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "intelligence_evidence_hash_check" CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "intelligence_evidence_json_size_check" CHECK (octet_length("evidenceJson"::text) <= 131072)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "intelligence_evidence_scope_ref_revision_unique" ON "intelligence_evidence_items" ("visibility", COALESCE("tenantId", ''), "evidenceRef", "revision");
CREATE INDEX "intelligence_evidence_source_observed_idx" ON "intelligence_evidence_items" ("sourceId", "observedAt" DESC);
--> statement-breakpoint

CREATE TABLE "intelligence_research_requests" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "authorizationScope" varchar(16) NOT NULL,
  "consumerKind" varchar(32) NOT NULL,
  "consumerRef" varchar(200) NOT NULL,
  "requestedBy" varchar(160) NOT NULL,
  "idempotencyKeyHash" varchar(64) NOT NULL,
  "projectId" varchar(36),
  "status" varchar(24) DEFAULT 'admitted' NOT NULL,
  "requestJson" jsonb NOT NULL,
  "canonicalJobId" varchar(36) REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "updatedAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "intelligence_research_request_scope_check" CHECK (("authorizationScope" = 'PUBLIC' AND "tenantId" IS NULL) OR ("authorizationScope" = 'TENANT' AND "tenantId" IS NOT NULL)),
  CONSTRAINT "intelligence_research_request_status_check" CHECK ("status" IN ('admitted', 'queued', 'running', 'completed', 'partial', 'failed', 'cancelled', 'blocked')),
  CONSTRAINT "intelligence_research_request_json_size_check" CHECK (octet_length("requestJson"::text) <= 65536),
  CONSTRAINT "intelligence_research_request_key_hash_check" CHECK ("idempotencyKeyHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "intelligence_research_request_refs_nonempty_check" CHECK (length(btrim("consumerRef")) > 0 AND length(btrim("requestedBy")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "intelligence_research_request_scope_key_unique" ON "intelligence_research_requests" ("authorizationScope", COALESCE("tenantId", ''), "idempotencyKeyHash");
CREATE UNIQUE INDEX "intelligence_research_request_tenant_id_unique" ON "intelligence_research_requests" ("tenantId", "id");
CREATE INDEX "intelligence_research_request_consumer_idx" ON "intelligence_research_requests" ("consumerKind", "consumerRef", "createdAt" DESC);
CREATE INDEX "intelligence_research_request_status_idx" ON "intelligence_research_requests" ("status", "updatedAt");
--> statement-breakpoint

CREATE TABLE "intelligence_research_runs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "requestId" varchar(36) NOT NULL REFERENCES "intelligence_research_requests"("id") ON DELETE RESTRICT,
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "runNumber" integer NOT NULL,
  "status" varchar(24) NOT NULL,
  "providerId" varchar(160) NOT NULL,
  "startedAt" timestamptz NOT NULL,
  "completedAt" timestamptz,
  "receiptJson" jsonb NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "intelligence_research_run_status_check" CHECK ("status" IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled')),
  CONSTRAINT "intelligence_research_run_number_check" CHECK ("runNumber" > 0),
  CONSTRAINT "intelligence_research_run_json_size_check" CHECK (octet_length("receiptJson"::text) <= 131072)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "intelligence_research_run_request_number_unique" ON "intelligence_research_runs" ("requestId", "runNumber");
CREATE INDEX "intelligence_research_run_tenant_created_idx" ON "intelligence_research_runs" ("tenantId", "createdAt" DESC);
--> statement-breakpoint

CREATE TABLE "decision_projects" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "ownerPrincipalId" varchar(160) NOT NULL,
  "title" varchar(200) NOT NULL,
  "status" varchar(32) DEFAULT 'draft' NOT NULL,
  "projectJson" jsonb NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "updatedAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "decision_project_status_check" CHECK ("status" IN ('draft', 'collecting_evidence', 'analyzing', 'waiting_user', 'monitoring', 'closed')),
  CONSTRAINT "decision_project_title_nonempty_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "decision_project_json_size_check" CHECK (octet_length("projectJson"::text) <= 65536)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "decision_project_tenant_id_unique" ON "decision_projects" ("tenantId", "id");
CREATE INDEX "decision_project_owner_status_idx" ON "decision_projects" ("tenantId", "ownerPrincipalId", "status", "updatedAt" DESC);
--> statement-breakpoint

ALTER TABLE "intelligence_research_requests"
  ADD CONSTRAINT "intelligence_research_request_project_tenant_fk"
    FOREIGN KEY ("tenantId", "projectId") REFERENCES "decision_projects"("tenantId", "id") ON DELETE RESTRICT;
--> statement-breakpoint

CREATE TABLE "decision_analysis_runs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "projectId" varchar(36) NOT NULL REFERENCES "decision_projects"("id") ON DELETE RESTRICT,
  "runNumber" integer NOT NULL,
  "status" varchar(24) NOT NULL,
  "researchRequestId" varchar(36) REFERENCES "intelligence_research_requests"("id") ON DELETE RESTRICT,
  "snapshotJson" jsonb NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "decision_analysis_run_status_check" CHECK ("status" IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled')),
  CONSTRAINT "decision_analysis_run_number_check" CHECK ("runNumber" > 0),
  CONSTRAINT "decision_analysis_run_json_size_check" CHECK (octet_length("snapshotJson"::text) <= 262144),
  CONSTRAINT "decision_analysis_run_project_tenant_fk" FOREIGN KEY ("tenantId", "projectId") REFERENCES "decision_projects"("tenantId", "id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX "decision_analysis_run_project_number_unique" ON "decision_analysis_runs" ("projectId", "runNumber");
CREATE INDEX "decision_analysis_run_tenant_created_idx" ON "decision_analysis_runs" ("tenantId", "createdAt" DESC);
--> statement-breakpoint

CREATE FUNCTION "validate_intelligence_tenant_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_tenant varchar(36);
  expected_project varchar(36);
  job_tenant varchar(36);
BEGIN
  IF TG_TABLE_NAME = 'intelligence_datasets' THEN
    SELECT "tenantId" INTO expected_tenant FROM "intelligence_sources" WHERE "id" = NEW."sourceId";
    IF NOT FOUND OR expected_tenant IS DISTINCT FROM NEW."tenantId" THEN
      RAISE EXCEPTION 'INTELLIGENCE_TENANT_SCOPE_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'intelligence_evidence_items' THEN
    SELECT "tenantId" INTO expected_tenant FROM "intelligence_sources" WHERE "id" = NEW."sourceId";
    IF NOT FOUND OR expected_tenant IS DISTINCT FROM NEW."tenantId" THEN
      RAISE EXCEPTION 'INTELLIGENCE_TENANT_SCOPE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF NEW."datasetId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "intelligence_datasets" d
      WHERE d."id" = NEW."datasetId" AND d."sourceId" = NEW."sourceId"
        AND d."tenantId" IS NOT DISTINCT FROM NEW."tenantId"
    ) THEN
      RAISE EXCEPTION 'INTELLIGENCE_DATASET_SOURCE_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'intelligence_research_runs' THEN
    SELECT "tenantId" INTO expected_tenant FROM "intelligence_research_requests" WHERE "id" = NEW."requestId";
    IF NOT FOUND OR expected_tenant IS DISTINCT FROM NEW."tenantId" THEN
      RAISE EXCEPTION 'INTELLIGENCE_TENANT_SCOPE_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'intelligence_research_requests' THEN
    IF NEW."canonicalJobId" IS NOT NULL THEN
      SELECT "tenantId" INTO job_tenant FROM "worker_jobs" WHERE "id" = NEW."canonicalJobId";
      IF NOT FOUND OR NEW."authorizationScope" <> 'TENANT' OR job_tenant IS DISTINCT FROM NEW."tenantId" THEN
        RAISE EXCEPTION 'INTELLIGENCE_RESEARCH_JOB_SCOPE_MISMATCH' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'decision_analysis_runs' THEN
    IF NEW."researchRequestId" IS NOT NULL THEN
      SELECT "tenantId", "projectId" INTO expected_tenant, expected_project
        FROM "intelligence_research_requests" WHERE "id" = NEW."researchRequestId"
          AND "consumerKind" = 'DECISION_ANALYSIS';
      IF NOT FOUND OR expected_tenant IS DISTINCT FROM NEW."tenantId" OR expected_project IS DISTINCT FROM NEW."projectId" THEN
        RAISE EXCEPTION 'DECISION_ANALYSIS_RESEARCH_SCOPE_MISMATCH' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "intelligence_dataset_tenant_scope" BEFORE INSERT OR UPDATE ON "intelligence_datasets"
  FOR EACH ROW EXECUTE FUNCTION "validate_intelligence_tenant_scope"();
CREATE TRIGGER "intelligence_evidence_tenant_scope" BEFORE INSERT ON "intelligence_evidence_items"
  FOR EACH ROW EXECUTE FUNCTION "validate_intelligence_tenant_scope"();
CREATE TRIGGER "intelligence_research_run_tenant_scope" BEFORE INSERT ON "intelligence_research_runs"
  FOR EACH ROW EXECUTE FUNCTION "validate_intelligence_tenant_scope"();
CREATE TRIGGER "intelligence_research_request_job_scope" BEFORE INSERT OR UPDATE ON "intelligence_research_requests"
  FOR EACH ROW EXECUTE FUNCTION "validate_intelligence_tenant_scope"();
CREATE TRIGGER "decision_analysis_research_scope" BEFORE INSERT ON "decision_analysis_runs"
  FOR EACH ROW EXECUTE FUNCTION "validate_intelligence_tenant_scope"();
--> statement-breakpoint

CREATE FUNCTION "reject_intelligence_immutable_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RECORD: % cannot be changed', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "reject_intelligence_identity_rekey"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'intelligence_sources' THEN
    IF (NEW."id", NEW."tenantId", NEW."visibility", NEW."canonicalSourceId") IS DISTINCT FROM
      (OLD."id", OLD."tenantId", OLD."visibility", OLD."canonicalSourceId") THEN
      RAISE EXCEPTION 'IMMUTABLE_SOURCE_IDENTITY' USING ERRCODE = '55000';
    END IF;
  ELSIF TG_TABLE_NAME = 'intelligence_datasets' THEN
    IF (NEW."id", NEW."tenantId", NEW."sourceId", NEW."datasetRef", NEW."version") IS DISTINCT FROM
      (OLD."id", OLD."tenantId", OLD."sourceId", OLD."datasetRef", OLD."version") THEN
      RAISE EXCEPTION 'IMMUTABLE_DATASET_IDENTITY' USING ERRCODE = '55000';
    END IF;
  ELSIF TG_TABLE_NAME = 'intelligence_research_requests' THEN
    IF (NEW."id", NEW."tenantId", NEW."authorizationScope", NEW."consumerKind", NEW."consumerRef", NEW."requestedBy", NEW."idempotencyKeyHash", NEW."projectId") IS DISTINCT FROM
      (OLD."id", OLD."tenantId", OLD."authorizationScope", OLD."consumerKind", OLD."consumerRef", OLD."requestedBy", OLD."idempotencyKeyHash", OLD."projectId") THEN
      RAISE EXCEPTION 'IMMUTABLE_RESEARCH_REQUEST_IDENTITY' USING ERRCODE = '55000';
    END IF;
    IF OLD."canonicalJobId" IS NOT NULL AND NEW."canonicalJobId" IS DISTINCT FROM OLD."canonicalJobId" THEN
      RAISE EXCEPTION 'IMMUTABLE_RESEARCH_JOB_BINDING' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "intelligence_source_identity_immutable" BEFORE UPDATE ON "intelligence_sources"
  FOR EACH ROW EXECUTE FUNCTION "reject_intelligence_identity_rekey"();
CREATE TRIGGER "intelligence_dataset_identity_immutable" BEFORE UPDATE ON "intelligence_datasets"
  FOR EACH ROW EXECUTE FUNCTION "reject_intelligence_identity_rekey"();
CREATE TRIGGER "intelligence_research_request_identity_immutable" BEFORE UPDATE ON "intelligence_research_requests"
  FOR EACH ROW EXECUTE FUNCTION "reject_intelligence_identity_rekey"();
--> statement-breakpoint
CREATE TRIGGER "intelligence_evidence_immutable" BEFORE UPDATE OR DELETE ON "intelligence_evidence_items"
  FOR EACH ROW EXECUTE FUNCTION "reject_intelligence_immutable_mutation"();
CREATE TRIGGER "intelligence_research_run_immutable" BEFORE UPDATE OR DELETE ON "intelligence_research_runs"
  FOR EACH ROW EXECUTE FUNCTION "reject_intelligence_immutable_mutation"();
CREATE TRIGGER "decision_analysis_run_immutable" BEFORE UPDATE OR DELETE ON "decision_analysis_runs"
  FOR EACH ROW EXECUTE FUNCTION "reject_intelligence_immutable_mutation"();
