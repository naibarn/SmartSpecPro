SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE "llm_inference_profile_certifications" (
  "profileVersionId" integer PRIMARY KEY
    REFERENCES "llm_inference_profile_versions"("id") ON DELETE RESTRICT,
  "probeRunId" uuid NOT NULL UNIQUE
    REFERENCES "llm_inference_probe_runs"("runId") ON DELETE RESTRICT,
  "certifiedProfileJson" jsonb NOT NULL,
  "certifiedByUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "certifiedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "llm_inference_profile_certification_payload_check"
    CHECK (
      jsonb_typeof("certifiedProfileJson") = 'object'
      AND jsonb_typeof("certifiedProfileJson"->'model') = 'object'
      AND jsonb_typeof("certifiedProfileJson"->'deployment') = 'object'
    )
);
--> statement-breakpoint
CREATE TRIGGER "llm_inference_profile_certifications_immutable"
  BEFORE UPDATE OR DELETE ON "llm_inference_profile_certifications"
  FOR EACH ROW EXECUTE FUNCTION "reject_llm_inference_authority_history_mutation"();
