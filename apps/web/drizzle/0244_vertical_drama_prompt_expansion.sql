CREATE TABLE IF NOT EXISTS "vertical_drama_prompt_expansion_runs" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "draftSessionId" varchar(128) REFERENCES "vertical_drama_source_pack_sessions"("draftSessionId") ON DELETE SET NULL,
  "seriesId" bigint REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "idempotencyKey" varchar(256) NOT NULL,
  "originalPrompt" text NOT NULL,
  "originalPromptHash" varchar(64) NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "status" varchar(24) NOT NULL DEFAULT 'preview',
  "previewJson" jsonb NOT NULL,
  "approvedJson" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "vds_prompt_expansion_idempotency_unique" UNIQUE ("tenantId", "userId", "idempotencyKey")
);
CREATE INDEX IF NOT EXISTS "vds_prompt_expansion_owner_idx"
  ON "vertical_drama_prompt_expansion_runs" ("tenantId", "userId", "seriesId", "draftSessionId", "createdAt");
