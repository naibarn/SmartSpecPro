SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE "llm_inference_plans" (
  "planId" varchar(256) PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "principalRef" varchar(256) NOT NULL,
  "logicalCallId" varchar(256) NOT NULL,
  "idempotencyKey" varchar(256) NOT NULL,
  "intentHash" varchar(71) NOT NULL,
  "planHash" varchar(71) NOT NULL,
  "planJson" jsonb NOT NULL,
  "workerJobId" varchar(36) REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "creditReservationId" varchar(256) NOT NULL,
  "selectedModelProfile" varchar(256) NOT NULL,
  "selectedDeploymentProfile" varchar(256) NOT NULL,
  "endpointSurface" varchar(32) NOT NULL,
  "policyRevision" varchar(256) NOT NULL,
  "registryRevision" varchar(256) NOT NULL,
  "routePolicyRevision" varchar(256) NOT NULL,
  "scoreCalibrationRevision" varchar(256) NOT NULL,
  "estimatedCostMicros" bigint NOT NULL,
  "parentCostCeilingMicros" bigint NOT NULL,
  "attemptBudget" smallint NOT NULL,
  "deadlineAt" timestamp with time zone NOT NULL,
  "overallDeadlineAt" timestamp with time zone NOT NULL,
  "residencyPolicySnapshotRef" varchar(256) NOT NULL,
  "routerFeatureProvenanceRef" varchar(256) NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "llm_inference_plans_intent_hash_check"
    CHECK ("intentHash" ~ '^sha256:[a-fA-F0-9]{64}$'),
  CONSTRAINT "llm_inference_plans_plan_hash_check"
    CHECK ("planHash" ~ '^sha256:[a-fA-F0-9]{64}$'),
  CONSTRAINT "llm_inference_plans_endpoint_surface_check"
    CHECK ("endpointSurface" IN ('native_responses', 'responses_compatible', 'chat_compatible', 'native_provider', 'local')),
  CONSTRAINT "llm_inference_plans_cost_check"
    CHECK ("estimatedCostMicros" >= 0 AND "parentCostCeilingMicros" >= "estimatedCostMicros"),
  CONSTRAINT "llm_inference_plans_attempt_budget_check"
    CHECK ("attemptBudget" BETWEEN 1 AND 16),
  CONSTRAINT "llm_inference_plans_deadline_check"
    CHECK ("overallDeadlineAt" >= "deadlineAt"),
  CONSTRAINT "llm_inference_plans_tenant_logical_call_unique"
    UNIQUE ("tenantId", "logicalCallId"),
  CONSTRAINT "llm_inference_plans_tenant_idempotency_unique"
    UNIQUE ("tenantId", "idempotencyKey")
);
--> statement-breakpoint
CREATE INDEX "llm_inference_plans_tenant_created_idx"
  ON "llm_inference_plans" ("tenantId", "createdAt" DESC);
--> statement-breakpoint
CREATE INDEX "llm_inference_plans_worker_job_idx"
  ON "llm_inference_plans" ("workerJobId")
  WHERE "workerJobId" IS NOT NULL;
--> statement-breakpoint
CREATE FUNCTION "reject_llm_inference_plan_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'llm_inference_plans rows are immutable; create a new plan';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "llm_inference_plans_immutable"
  BEFORE UPDATE ON "llm_inference_plans"
  FOR EACH ROW EXECUTE FUNCTION "reject_llm_inference_plan_update"();
--> statement-breakpoint
CREATE TABLE "llm_inference_attempts" (
  "attemptId" varchar(256) PRIMARY KEY,
  "planId" varchar(256) NOT NULL REFERENCES "llm_inference_plans"("planId") ON DELETE CASCADE,
  "workerJobAttemptId" varchar(36) REFERENCES "worker_job_attempts"("id") ON DELETE SET NULL,
  "attemptOrdinal" smallint NOT NULL,
  "attemptOwnershipEpoch" bigint NOT NULL,
  "ownerTokenHash" varchar(64) NOT NULL,
  "modelProfileId" varchar(256) NOT NULL,
  "actualModel" varchar(256),
  "deploymentId" varchar(256) NOT NULL,
  "providerId" varchar(256) NOT NULL,
  "credentialOwnerRef" varchar(256) NOT NULL,
  "endpointSurface" varchar(32) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'prepared',
  "submissionState" varchar(16) NOT NULL DEFAULT 'not_submitted',
  "outcome" varchar(16),
  "normalizedFailure" varchar(32),
  "streamCommitted" boolean NOT NULL DEFAULT false,
  "providerRequestId" varchar(256),
  "gatewayRequestId" varchar(256),
  "observedProviderId" varchar(256),
  "observedCredentialOwnerRef" varchar(256),
  "observedDeploymentId" varchar(256),
  "observedEndpointSurface" varchar(32),
  "inputTokens" bigint,
  "cachedInputTokens" bigint,
  "outputTokens" bigint,
  "reasoningTokens" bigint,
  "chargedCostMicros" bigint,
  "effectReceiptRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "terminalAt" timestamp with time zone,
  CONSTRAINT "llm_inference_attempts_plan_ordinal_unique"
    UNIQUE ("planId", "attemptOrdinal"),
  CONSTRAINT "llm_inference_attempts_ordinal_check"
    CHECK ("attemptOrdinal" BETWEEN 1 AND 16),
  CONSTRAINT "llm_inference_attempts_epoch_check"
    CHECK ("attemptOwnershipEpoch" > 0),
  CONSTRAINT "llm_inference_attempts_endpoint_surface_check"
    CHECK ("endpointSurface" IN ('native_responses', 'responses_compatible', 'chat_compatible', 'native_provider', 'local')),
  CONSTRAINT "llm_inference_attempts_status_check"
    CHECK ("status" IN ('prepared', 'submitting', 'submitted', 'terminal')),
  CONSTRAINT "llm_inference_attempts_submission_state_check"
    CHECK ("submissionState" IN ('not_submitted', 'submitted', 'unknown')),
  CONSTRAINT "llm_inference_attempts_outcome_check"
    CHECK ("outcome" IS NULL OR "outcome" IN ('completed', 'failed', 'cancelled', 'unknown')),
  CONSTRAINT "llm_inference_attempts_failure_check"
    CHECK ("normalizedFailure" IS NULL OR "normalizedFailure" IN ('rate_limited', 'provider_unavailable', 'connection_failed', 'authentication_failed', 'invalid_request', 'content_policy', 'budget_exceeded', 'unknown_outcome')),
  CONSTRAINT "llm_inference_attempts_usage_check"
    CHECK (
      COALESCE("inputTokens", 0) >= 0
      AND COALESCE("cachedInputTokens", 0) >= 0
      AND COALESCE("outputTokens", 0) >= 0
      AND COALESCE("reasoningTokens", 0) >= 0
      AND COALESCE("chargedCostMicros", 0) >= 0
    ),
  CONSTRAINT "llm_inference_attempts_state_consistency_check"
    CHECK (
      ("status" = 'prepared' AND "submissionState" = 'not_submitted' AND "outcome" IS NULL AND "terminalAt" IS NULL)
      OR ("status" = 'submitting' AND "submissionState" = 'unknown' AND "outcome" IS NULL AND "terminalAt" IS NULL)
      OR ("status" = 'submitted' AND "submissionState" = 'submitted' AND "outcome" IS NULL AND "terminalAt" IS NULL)
      OR ("status" = 'terminal' AND "outcome" IS NOT NULL AND "terminalAt" IS NOT NULL)
    ),
  CONSTRAINT "llm_inference_attempts_stream_submission_check"
    CHECK (NOT "streamCommitted" OR "submissionState" = 'submitted'),
  CONSTRAINT "llm_inference_attempts_observed_identity_check"
    CHECK (
      ("observedProviderId" IS NULL AND "observedCredentialOwnerRef" IS NULL AND "observedDeploymentId" IS NULL AND "observedEndpointSurface" IS NULL)
      OR ("observedProviderId" IS NOT NULL AND "observedCredentialOwnerRef" IS NOT NULL AND "observedDeploymentId" IS NOT NULL AND "observedEndpointSurface" IS NOT NULL AND "observedEndpointSurface" IN ('native_responses', 'responses_compatible', 'chat_compatible', 'native_provider', 'local'))
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "llm_inference_attempts_worker_job_attempt_unique"
  ON "llm_inference_attempts" ("workerJobAttemptId")
  WHERE "workerJobAttemptId" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "llm_inference_attempts_plan_status_idx"
  ON "llm_inference_attempts" ("planId", "status", "attemptOrdinal");
--> statement-breakpoint
CREATE INDEX "llm_inference_attempts_deployment_created_idx"
  ON "llm_inference_attempts" ("deploymentId", "createdAt" DESC);
