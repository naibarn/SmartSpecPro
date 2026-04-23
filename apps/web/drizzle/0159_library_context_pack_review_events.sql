CREATE TABLE IF NOT EXISTS "library_context_pack_review_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "context_pack_id" integer NOT NULL REFERENCES "library_context_packs"("id") ON DELETE CASCADE,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "action" varchar(64) NOT NULL,
  "previous_readiness_status" "library_context_pack_readiness_status",
  "next_readiness_status" "library_context_pack_readiness_status",
  "previous_approved_for_agents" boolean NOT NULL DEFAULT false,
  "next_approved_for_agents" boolean NOT NULL DEFAULT false,
  "reason" text,
  "metadata" json NOT NULL DEFAULT '{}'::json,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "library_context_pack_review_events_pack_idx"
  ON "library_context_pack_review_events" ("context_pack_id", "created_at");

CREATE INDEX IF NOT EXISTS "library_context_pack_review_events_tenant_idx"
  ON "library_context_pack_review_events" ("tenant_id", "created_at");
