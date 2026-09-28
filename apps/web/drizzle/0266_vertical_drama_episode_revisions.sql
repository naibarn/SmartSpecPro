CREATE TABLE IF NOT EXISTS "vertical_drama_episode_revisions" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE cascade,
  "episodeId" bigint NOT NULL REFERENCES "vertical_drama_episodes"("id") ON DELETE cascade,
  "revisionNumber" integer NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'queued',
  "jobId" varchar(64),
  "idempotencyKey" varchar(160) NOT NULL,
  "sourceUpdatedAt" timestamptz NOT NULL,
  "sourceFingerprint" varchar(64) NOT NULL,
  "contextSummary" jsonb,
  "script" jsonb,
  "storyboard" jsonb,
  "safetyFindings" jsonb,
  "errorCode" varchar(80),
  "errorMessage" text,
  "promotedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "vds_episode_revision_lookup_idx" ON "vertical_drama_episode_revisions" ("tenantId", "seriesId", "episodeId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "vds_episode_revision_idempotency_idx" ON "vertical_drama_episode_revisions" ("tenantId", "userId", "episodeId", "idempotencyKey");
