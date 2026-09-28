-- Feature 176/177: durable semantic analysis, plan revisions and rights admission.
CREATE TABLE IF NOT EXISTS "vertical_drama_audio_analyses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "episodeId" bigint NOT NULL REFERENCES "vertical_drama_episodes"("id") ON DELETE CASCADE,
  "planningKey" varchar(160),
  "status" varchar(24) NOT NULL DEFAULT 'queued',
  "sourceRevision" varchar(128) NOT NULL,
  "sourceHash" varchar(64) NOT NULL,
  "sourceSnapshot" jsonb NOT NULL,
  "resultJson" jsonb,
  "workerJobId" varchar(36),
  "error" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_audio_analysis_owner_idx" ON "vertical_drama_audio_analyses" ("tenantId", "userId", "seriesId", "episodeId", "createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_audio_analysis_status_idx" ON "vertical_drama_audio_analyses" ("tenantId", "status", "createdAt");--> statement-breakpoint
ALTER TABLE "vertical_drama_audio_analyses" ADD COLUMN IF NOT EXISTS "planningKey" varchar(160);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_audio_analysis_scope_status_idx" ON "vertical_drama_audio_analyses" ("tenantId", "seriesId", "episodeId", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_audio_analysis_planning_status_idx" ON "vertical_drama_audio_analyses" ("tenantId", "seriesId", "planningKey", "status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vertical_drama_emotion_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "episodeId" bigint NOT NULL REFERENCES "vertical_drama_episodes"("id") ON DELETE CASCADE,
  "planningKey" varchar(160),
  "revision" integer NOT NULL DEFAULT 1,
  "status" varchar(24) NOT NULL DEFAULT 'needs_review',
  "sourceHash" varchar(64) NOT NULL,
  "planHash" varchar(64) NOT NULL,
  "planJson" jsonb NOT NULL,
  "skillMetadata" jsonb NOT NULL,
  "rightsStatus" varchar(32) NOT NULL DEFAULT 'unreviewed',
  "rightsPolicyHash" varchar(64) NOT NULL,
  "rightsReview" jsonb NOT NULL DEFAULT '{"status":"unreviewed","evidenceRef":null,"scope":null,"reviewerId":null,"reviewedAt":null}'::jsonb,
  "approvedAt" timestamptz,
  "approvedBy" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vd_emotion_plan_episode_unique" ON "vertical_drama_emotion_plans" ("tenantId", "userId", "episodeId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_emotion_plan_series_idx" ON "vertical_drama_emotion_plans" ("tenantId", "userId", "seriesId", "createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_emotion_plan_admission_idx" ON "vertical_drama_emotion_plans" ("tenantId", "episodeId", "status", "rightsStatus");--> statement-breakpoint
ALTER TABLE "vertical_drama_emotion_plans" ADD COLUMN IF NOT EXISTS "planningKey" varchar(160);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_emotion_plan_scope_revision_idx" ON "vertical_drama_emotion_plans" ("tenantId", "seriesId", "episodeId", "revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_emotion_plan_planning_revision_idx" ON "vertical_drama_emotion_plans" ("tenantId", "seriesId", "planningKey", "revision");--> statement-breakpoint
ALTER TABLE "vertical_drama_emotion_plans" ADD COLUMN IF NOT EXISTS "rightsReview" jsonb NOT NULL DEFAULT '{"status":"unreviewed","evidenceRef":null,"scope":null,"reviewerId":null,"reviewedAt":null}'::jsonb;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vertical_drama_emotion_plan_revisions" (
  "id" bigserial PRIMARY KEY,
  "planId" uuid NOT NULL REFERENCES "vertical_drama_emotion_plans"("id") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL,
  "revision" integer NOT NULL,
  "planHash" varchar(64) NOT NULL,
  "planJson" jsonb NOT NULL,
  "changeReason" varchar(120) NOT NULL,
  "createdBy" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vd_emotion_plan_revision_unique" ON "vertical_drama_emotion_plan_revisions" ("planId", "revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_emotion_plan_revision_owner_idx" ON "vertical_drama_emotion_plan_revisions" ("tenantId", "createdAt");
