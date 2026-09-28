CREATE TABLE IF NOT EXISTS "llm_inference_profile_candidate_heads" (
  "deploymentId" varchar(256) PRIMARY KEY NOT NULL,
  "profileVersionId" integer NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "llm_inference_profile_candidate_version_deployment_fk"
    FOREIGN KEY ("profileVersionId", "deploymentId")
    REFERENCES "llm_inference_profile_versions"("id", "deploymentId")
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "llm_inference_profile_candidate_head_version_unique"
  ON "llm_inference_profile_candidate_heads" ("profileVersionId");
