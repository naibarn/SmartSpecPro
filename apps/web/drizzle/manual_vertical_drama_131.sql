-- Feature 131 Vertical Drama Series — 10 tables (additive, CREATE IF NOT EXISTS).
-- Hand-authored from drizzle/schema.ts because drizzle-kit generate is blocked by a
-- pre-existing meta-journal collision (0146/0147). Zero data-loss (no drops/alters).
BEGIN;

CREATE TABLE IF NOT EXISTS vertical_drama_series (
  id bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  locale varchar(8) NOT NULL DEFAULT 'th',
  "aspectRatio" varchar(8) NOT NULL DEFAULT '9:16',
  status varchar(20) NOT NULL DEFAULT 'draft',
  "targetEpisodeCount" integer NOT NULL DEFAULT 10,
  "defaultEpisodeDurationSeconds" integer NOT NULL DEFAULT 60,
  genre varchar(100),
  tone varchar(100),
  "targetAudience" varchar(100),
  "agePolicyId" varchar(64),
  bible jsonb,
  memory jsonb,
  "productTieIn" jsonb,
  policy jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vds_series_list_idx ON vertical_drama_series ("tenantId","userId","updatedAt");
CREATE INDEX IF NOT EXISTS vds_series_status_idx ON vertical_drama_series ("tenantId",status);

CREATE TABLE IF NOT EXISTS vertical_drama_characters (
  id bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES vertical_drama_series(id) ON DELETE CASCADE,
  "characterKey" varchar(64) NOT NULL,
  name varchar(255) NOT NULL,
  role varchar(100),
  data jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vds_character_lookup_idx ON vertical_drama_characters ("tenantId","seriesId","characterKey");
CREATE UNIQUE INDEX IF NOT EXISTS vds_character_key_unique ON vertical_drama_characters ("seriesId","characterKey");

CREATE TABLE IF NOT EXISTS vertical_drama_character_assets (
  id bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES vertical_drama_series(id) ON DELETE CASCADE,
  "characterId" bigint REFERENCES vertical_drama_characters(id) ON DELETE CASCADE,
  "mediaAssetId" bigint REFERENCES media_assets(id) ON DELETE SET NULL,
  "assetType" varchar(40) NOT NULL,
  role varchar(40),
  approved boolean NOT NULL DEFAULT false,
  "containsHumanFace" boolean,
  "qcStatus" varchar(20) NOT NULL DEFAULT 'pending',
  "checksumSha256" varchar(64),
  metadata jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vds_char_asset_series_idx ON vertical_drama_character_assets ("tenantId","seriesId");
CREATE INDEX IF NOT EXISTS vds_char_asset_character_idx ON vertical_drama_character_assets ("seriesId","characterId");
CREATE INDEX IF NOT EXISTS vds_char_asset_media_idx ON vertical_drama_character_assets ("mediaAssetId");

CREATE TABLE IF NOT EXISTS vertical_drama_episodes (
  id bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES vertical_drama_series(id) ON DELETE CASCADE,
  "episodeNumber" integer NOT NULL,
  title varchar(255),
  status varchar(30) NOT NULL DEFAULT 'draft',
  "targetDurationSeconds" integer NOT NULL DEFAULT 60,
  "durationProfileId" varchar(64) NOT NULL DEFAULT 'vertical_drama_60s_9_frames_8_clips',
  script jsonb,
  storyboard jsonb,
  "startFramePlan" jsonb,
  "dialogueAudioPlan" jsonb,
  "motionPromptPack" jsonb,
  "assemblyManifest" jsonb,
  "storyboardReviewId" varchar(64),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vds_episode_number_unique ON vertical_drama_episodes ("tenantId","seriesId","episodeNumber");
CREATE INDEX IF NOT EXISTS vds_episode_status_idx ON vertical_drama_episodes ("tenantId","seriesId",status);

CREATE TABLE IF NOT EXISTS vertical_drama_episode_runs (
  id bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES vertical_drama_series(id) ON DELETE CASCADE,
  "episodeId" bigint NOT NULL REFERENCES vertical_drama_episodes(id) ON DELETE CASCADE,
  stage varchar(48) NOT NULL,
  "runMode" varchar(20) NOT NULL DEFAULT 'dry_run',
  status varchar(24) NOT NULL DEFAULT 'queued',
  "nextAction" varchar(32) NOT NULL DEFAULT 'none',
  "artifactIds" jsonb,
  warnings jsonb,
  errors jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vds_run_episode_idx ON vertical_drama_episode_runs ("tenantId","seriesId","episodeId");
CREATE INDEX IF NOT EXISTS vds_run_stage_idx ON vertical_drama_episode_runs ("tenantId","seriesId","episodeId",stage);

CREATE TABLE IF NOT EXISTS vertical_drama_run_artifacts (
  id bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES vertical_drama_series(id) ON DELETE CASCADE,
  "episodeId" bigint NOT NULL REFERENCES vertical_drama_episodes(id) ON DELETE CASCADE,
  "runId" bigint NOT NULL REFERENCES vertical_drama_episode_runs(id) ON DELETE CASCADE,
  stage varchar(40) NOT NULL,
  "storageKey" text,
  "jsonPayload" jsonb,
  "mediaAssetIds" jsonb,
  "checksumSha256" varchar(64),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vds_artifact_lookup_idx ON vertical_drama_run_artifacts ("tenantId","seriesId","episodeId","runId",stage);

CREATE TABLE IF NOT EXISTS vertical_drama_approval_checkpoints (
  id bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES vertical_drama_series(id) ON DELETE CASCADE,
  "episodeId" bigint NOT NULL REFERENCES vertical_drama_episodes(id) ON DELETE CASCADE,
  "runId" bigint NOT NULL REFERENCES vertical_drama_episode_runs(id) ON DELETE CASCADE,
  stage varchar(48) NOT NULL,
  state varchar(20) NOT NULL DEFAULT 'pending',
  "approvedByUserId" integer REFERENCES users(id) ON DELETE SET NULL,
  "rejectedByUserId" integer REFERENCES users(id) ON DELETE SET NULL,
  "sourceArtifactIds" jsonb,
  "repairRequestIds" jsonb,
  notes text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vds_checkpoint_episode_idx ON vertical_drama_approval_checkpoints ("tenantId","seriesId","episodeId");
CREATE INDEX IF NOT EXISTS vds_checkpoint_lookup_idx ON vertical_drama_approval_checkpoints ("tenantId","seriesId","episodeId","runId",stage);

CREATE TABLE IF NOT EXISTS vertical_drama_memory_events (
  id bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES vertical_drama_series(id) ON DELETE CASCADE,
  "episodeId" bigint REFERENCES vertical_drama_episodes(id) ON DELETE SET NULL,
  "runId" bigint REFERENCES vertical_drama_episode_runs(id) ON DELETE SET NULL,
  "memoryKind" varchar(40) NOT NULL,
  payload jsonb NOT NULL,
  "summaryText" text,
  "supersedesEventIds" jsonb,
  approved boolean,
  "approvedByUserId" integer REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vds_memory_event_retrieval_idx ON vertical_drama_memory_events ("tenantId","seriesId","memoryKind","createdAt");

CREATE TABLE IF NOT EXISTS vertical_drama_memory_snapshots (
  id bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES vertical_drama_series(id) ON DELETE CASCADE,
  "compactedMemoryText" text,
  memory jsonb,
  "checksumSha256" varchar(64),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vds_memory_snapshot_idx ON vertical_drama_memory_snapshots ("tenantId","seriesId","updatedAt");

CREATE TABLE IF NOT EXISTS vertical_drama_qc_reports (
  id bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES vertical_drama_series(id) ON DELETE CASCADE,
  "episodeId" bigint NOT NULL REFERENCES vertical_drama_episodes(id) ON DELETE CASCADE,
  "runId" bigint NOT NULL REFERENCES vertical_drama_episode_runs(id) ON DELETE CASCADE,
  stage varchar(40) NOT NULL,
  passed boolean NOT NULL DEFAULT false,
  score real NOT NULL DEFAULT 0,
  issues jsonb,
  "recommendedRepairs" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vds_qc_lookup_idx ON vertical_drama_qc_reports ("tenantId","seriesId","episodeId","runId",stage);

COMMIT;
