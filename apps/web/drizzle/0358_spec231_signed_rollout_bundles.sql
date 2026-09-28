SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE "llm_inference_rollout_bundles" (
  "bundleHash" varchar(71) PRIMARY KEY,
  "bundleId" varchar(256) NOT NULL UNIQUE,
  "sequence" integer NOT NULL UNIQUE,
  "payloadJson" jsonb NOT NULL,
  "signingKeyId" varchar(128) NOT NULL,
  "signature" varchar(64) NOT NULL,
  "createdByUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "llm_inference_rollout_bundle_hash_check"
    CHECK ("bundleHash" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "llm_inference_rollout_bundle_signature_check"
    CHECK ("signature" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "llm_inference_rollout_bundle_payload_check"
    CHECK (
      jsonb_typeof("payloadJson") = 'object'
      AND "payloadJson"->>'contract' = 'SAH-INFERENCE-ROLLOUT-1'
    )
);
--> statement-breakpoint
CREATE TRIGGER "llm_inference_rollout_bundles_immutable"
  BEFORE UPDATE OR DELETE ON "llm_inference_rollout_bundles"
  FOR EACH ROW EXECUTE FUNCTION "reject_llm_inference_authority_history_mutation"();
--> statement-breakpoint
CREATE TABLE "llm_inference_rollout_bundle_heads" (
  "slotKey" varchar(16) PRIMARY KEY,
  "bundleHash" varchar(71) NOT NULL
    REFERENCES "llm_inference_rollout_bundles"("bundleHash") ON DELETE RESTRICT,
  "activatedByUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "readinessEvidenceJson" jsonb NOT NULL,
  "activatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "llm_inference_rollout_bundle_head_slot_check"
    CHECK ("slotKey" = 'platform'),
  CONSTRAINT "llm_inference_rollout_bundle_head_evidence_check"
    CHECK (jsonb_typeof("readinessEvidenceJson") = 'object')
);
--> statement-breakpoint
CREATE TABLE "llm_inference_rollout_bundle_events" (
  "id" serial PRIMARY KEY,
  "slotKey" varchar(16) NOT NULL,
  "action" varchar(16) NOT NULL,
  "fromBundleHash" varchar(71),
  "toBundleHash" varchar(71) NOT NULL,
  "actorUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "readinessEvidenceJson" jsonb NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "llm_inference_rollout_bundle_event_from_fk"
    FOREIGN KEY ("fromBundleHash")
    REFERENCES "llm_inference_rollout_bundles"("bundleHash") ON DELETE RESTRICT,
  CONSTRAINT "llm_inference_rollout_bundle_event_to_fk"
    FOREIGN KEY ("toBundleHash")
    REFERENCES "llm_inference_rollout_bundles"("bundleHash") ON DELETE RESTRICT,
  CONSTRAINT "llm_inference_rollout_bundle_event_slot_check"
    CHECK ("slotKey" = 'platform'),
  CONSTRAINT "llm_inference_rollout_bundle_event_action_check"
    CHECK ("action" IN ('activate', 'rollback')),
  CONSTRAINT "llm_inference_rollout_bundle_event_transition_check"
    CHECK ("fromBundleHash" IS NULL OR "fromBundleHash" <> "toBundleHash"),
  CONSTRAINT "llm_inference_rollout_bundle_event_evidence_check"
    CHECK (jsonb_typeof("readinessEvidenceJson") = 'object')
);
--> statement-breakpoint
CREATE INDEX "llm_inference_rollout_bundle_event_created_idx"
  ON "llm_inference_rollout_bundle_events" ("createdAt" DESC);
--> statement-breakpoint
CREATE TRIGGER "llm_inference_rollout_bundle_events_immutable"
  BEFORE UPDATE OR DELETE ON "llm_inference_rollout_bundle_events"
  FOR EACH ROW EXECUTE FUNCTION "reject_llm_inference_authority_history_mutation"();
