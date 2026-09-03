-- Feature 175: Vertical Drama Native Cinematic Audio & 3-Stem Mastering
CREATE TABLE IF NOT EXISTS "vertical_drama_series_sound_bibles" (
  "id" bigserial PRIMARY KEY,
  "tenantId" text NOT NULL,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "version" integer NOT NULL DEFAULT 1,
  "audioStyle" jsonb NOT NULL,
  "characterVoiceProfiles" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "locationSoundProfiles" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "transitionPolicy" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vd_sound_bible_series_version_idx" ON "vertical_drama_series_sound_bibles" ("seriesId", "version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_sound_bible_tenant_series_idx" ON "vertical_drama_series_sound_bibles" ("tenantId", "seriesId");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vertical_drama_audio_qc_reports" (
  "id" bigserial PRIMARY KEY,
  "tenantId" text NOT NULL,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "episodeId" bigint NOT NULL REFERENCES "vertical_drama_episodes"("id") ON DELETE CASCADE,
  "shotNumber" integer NOT NULL,
  "clipNumber" integer NOT NULL,
  "overallScore" integer NOT NULL,
  "asrCer" text,
  "vadSpeechRatio" text,
  "avSyncOffsetMs" integer,
  "integratedLufs" text,
  "truePeakDb" text,
  "phaseCorrelation" text,
  "bgmBleedDetected" boolean NOT NULL DEFAULT false,
  "flags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_audio_qc_episode_shot_idx" ON "vertical_drama_audio_qc_reports" ("episodeId", "shotNumber");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vertical_drama_audio_manifests" (
  "id" bigserial PRIMARY KEY,
  "tenantId" text NOT NULL,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "episodeId" bigint NOT NULL REFERENCES "vertical_drama_episodes"("id") ON DELETE CASCADE,
  "shotNumber" integer NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "nativeAudioMode" varchar(32) NOT NULL DEFAULT 'native_baked',
  "stems" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "mixDeltas" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "takeHistory" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vd_audio_manifest_shot_version_idx" ON "vertical_drama_audio_manifests" ("episodeId", "shotNumber", "version");
