SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE "llm_inference_policy_events" (
  "id" serial PRIMARY KEY,
  "scopeType" varchar(16) NOT NULL,
  "scopeKey" varchar(256) NOT NULL,
  "action" varchar(16) NOT NULL,
  "fromRevision" varchar(256),
  "toRevision" varchar(256) NOT NULL,
  "actorUserId" integer REFERENCES "users"("id") ON DELETE RESTRICT,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "llm_inference_policy_event_to_revision_fk"
    FOREIGN KEY ("scopeType", "scopeKey", "toRevision")
    REFERENCES "llm_inference_policy_snapshots"("scopeType", "scopeKey", "revision")
    ON DELETE RESTRICT,
  CONSTRAINT "llm_inference_policy_event_from_revision_fk"
    FOREIGN KEY ("scopeType", "scopeKey", "fromRevision")
    REFERENCES "llm_inference_policy_snapshots"("scopeType", "scopeKey", "revision")
    ON DELETE RESTRICT,
  CONSTRAINT "llm_inference_policy_event_action_check"
    CHECK ("action" IN ('publish', 'rollback')),
  CONSTRAINT "llm_inference_policy_event_transition_check"
    CHECK ("fromRevision" IS NULL OR "fromRevision" <> "toRevision"),
  CONSTRAINT "llm_inference_policy_rollback_source_check"
    CHECK ("action" <> 'rollback' OR "fromRevision" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX "llm_inference_policy_event_scope_created_idx"
  ON "llm_inference_policy_events" ("scopeType", "scopeKey", "createdAt" DESC);
--> statement-breakpoint
CREATE TRIGGER "llm_inference_policy_events_immutable"
  BEFORE UPDATE OR DELETE ON "llm_inference_policy_events"
  FOR EACH ROW EXECUTE FUNCTION "reject_llm_inference_authority_history_mutation"();
