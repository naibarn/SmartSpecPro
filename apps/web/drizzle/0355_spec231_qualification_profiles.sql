SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE "llm_inference_profile_versions" (
  "id" serial PRIMARY KEY,
  "deploymentId" varchar(256) NOT NULL,
  "deploymentRevision" varchar(256) NOT NULL,
  "logicalModelId" varchar(256) NOT NULL,
  "modelRevision" varchar(256) NOT NULL,
  "providerId" varchar(256) NOT NULL,
  "profileJson" jsonb NOT NULL,
  "createdByUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "llm_inference_profile_version_deployment_revision_unique"
    UNIQUE ("deploymentId", "deploymentRevision"),
  CONSTRAINT "llm_inference_profile_version_id_deployment_unique"
    UNIQUE ("id", "deploymentId"),
  CONSTRAINT "llm_inference_profile_version_payload_check"
    CHECK (
      jsonb_typeof("profileJson") = 'object'
      AND jsonb_typeof("profileJson"->'model') = 'object'
      AND jsonb_typeof("profileJson"->'deployment') = 'object'
    )
);
--> statement-breakpoint
CREATE INDEX "llm_inference_profile_version_model_idx"
  ON "llm_inference_profile_versions" ("logicalModelId", "modelRevision");
--> statement-breakpoint
CREATE INDEX "llm_inference_profile_version_provider_idx"
  ON "llm_inference_profile_versions" ("providerId");
--> statement-breakpoint
CREATE TABLE "llm_inference_profile_heads" (
  "deploymentId" varchar(256) PRIMARY KEY,
  "profileVersionId" integer NOT NULL,
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "llm_inference_profile_head_version_deployment_fk"
    FOREIGN KEY ("profileVersionId", "deploymentId")
    REFERENCES "llm_inference_profile_versions"("id", "deploymentId")
    ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX "llm_inference_profile_head_version_unique"
  ON "llm_inference_profile_heads" ("profileVersionId");
--> statement-breakpoint
CREATE TRIGGER "llm_inference_profile_versions_immutable"
  BEFORE UPDATE OR DELETE ON "llm_inference_profile_versions"
  FOR EACH ROW EXECUTE FUNCTION "reject_llm_inference_authority_history_mutation"();
