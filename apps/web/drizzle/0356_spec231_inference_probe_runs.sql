SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE "llm_inference_probe_runs" (
  "runId" uuid PRIMARY KEY,
  "profileVersionId" integer NOT NULL,
  "deploymentId" varchar(256) NOT NULL,
  "deploymentRevision" varchar(256) NOT NULL,
  "providerRecordId" integer NOT NULL,
  "modelMappingId" integer NOT NULL,
  "actorUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "probeKind" varchar(64) NOT NULL,
  "probeSuiteRevision" varchar(128) NOT NULL,
  "status" varchar(16) NOT NULL,
  "resultJson" jsonb NOT NULL,
  "startedAt" timestamp with time zone NOT NULL,
  "finishedAt" timestamp with time zone NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "llm_inference_probe_profile_version_fk"
    FOREIGN KEY ("profileVersionId", "deploymentId")
    REFERENCES "llm_inference_profile_versions"("id", "deploymentId")
    ON DELETE RESTRICT,
  CONSTRAINT "llm_inference_probe_status_check"
    CHECK ("status" IN ('passed', 'failed', 'blocked')),
  CONSTRAINT "llm_inference_probe_kind_check"
    CHECK ("probeKind" = 'connectivity'),
  CONSTRAINT "llm_inference_probe_result_check"
    CHECK (jsonb_typeof("resultJson") = 'object')
);
--> statement-breakpoint
CREATE INDEX "llm_inference_probe_deployment_created_idx"
  ON "llm_inference_probe_runs" ("deploymentId", "createdAt" DESC);
--> statement-breakpoint
CREATE TRIGGER "llm_inference_probe_runs_immutable"
  BEFORE UPDATE OR DELETE ON "llm_inference_probe_runs"
  FOR EACH ROW EXECUTE FUNCTION "reject_llm_inference_authority_history_mutation"();
