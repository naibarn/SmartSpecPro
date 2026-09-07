-- Feature 180 v2: provider-neutral VoiceProfile and optional training metadata.
-- Binary media remains in worker_artifacts/managed media; local-only values are
-- opaque handles. This migration is additive and intentionally has no down path.
CREATE TABLE IF NOT EXISTS audio_voice_profiles (
  id BIGSERIAL PRIMARY KEY,
  voice_profile_id VARCHAR(160) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_scope_type VARCHAR(16) NOT NULL CHECK (owner_scope_type IN ('project','series')),
  owner_scope_id VARCHAR(160) NOT NULL,
  current_revision INTEGER NOT NULL DEFAULT 1 CHECK (current_revision > 0),
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, voice_profile_id)
);
CREATE INDEX IF NOT EXISTS audio_voice_profiles_owner_idx ON audio_voice_profiles (tenant_id, owner_scope_type, owner_scope_id);

CREATE TABLE IF NOT EXISTS audio_voice_profile_revisions (
  id BIGSERIAL PRIMARY KEY,
  profile_id BIGINT NOT NULL REFERENCES audio_voice_profiles(id) ON DELETE CASCADE,
  tenant_id VARCHAR(36) NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  profile_json JSONB NOT NULL,
  content_hash VARCHAR(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, revision)
);
CREATE INDEX IF NOT EXISTS audio_voice_profile_revisions_tenant_idx ON audio_voice_profile_revisions (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS audio_voice_consents (
  id BIGSERIAL PRIMARY KEY,
  consent_id VARCHAR(160) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  consent_json JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, consent_id, revision)
);
CREATE INDEX IF NOT EXISTS audio_voice_consents_status_idx ON audio_voice_consents (tenant_id, status);

CREATE TABLE IF NOT EXISTS audio_voice_bindings (
  id BIGSERIAL PRIMARY KEY,
  voice_binding_id VARCHAR(160) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  voice_profile_id VARCHAR(160) NOT NULL,
  voice_profile_revision INTEGER NOT NULL CHECK (voice_profile_revision > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  binding_json JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, voice_binding_id, revision)
);
CREATE INDEX IF NOT EXISTS audio_voice_bindings_profile_idx ON audio_voice_bindings (tenant_id, voice_profile_id, status);

CREATE TABLE IF NOT EXISTS audio_voice_datasets (
  id BIGSERIAL PRIMARY KEY,
  dataset_id VARCHAR(160) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_scope_type VARCHAR(16) NOT NULL CHECK (owner_scope_type IN ('project','series')),
  owner_scope_id VARCHAR(160) NOT NULL,
  current_revision INTEGER NOT NULL DEFAULT 1 CHECK (current_revision > 0),
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, dataset_id)
);
CREATE INDEX IF NOT EXISTS audio_voice_datasets_owner_idx ON audio_voice_datasets (tenant_id, owner_scope_type, owner_scope_id);

CREATE TABLE IF NOT EXISTS audio_voice_dataset_revisions (
  id BIGSERIAL PRIMARY KEY,
  dataset_id BIGINT NOT NULL REFERENCES audio_voice_datasets(id) ON DELETE CASCADE,
  tenant_id VARCHAR(36) NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  manifest_json JSONB NOT NULL,
  manifest_hash VARCHAR(64) NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, revision)
);

CREATE TABLE IF NOT EXISTS audio_voice_training_runs (
  id BIGSERIAL PRIMARY KEY,
  job_id VARCHAR(160) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dataset_id VARCHAR(160) NOT NULL,
  dataset_revision INTEGER NOT NULL CHECK (dataset_revision > 0),
  idempotency_key VARCHAR(128) NOT NULL,
  recipe_json JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  checkpoint_json JSONB,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS audio_voice_training_runs_status_idx ON audio_voice_training_runs (tenant_id, status, updated_at);

CREATE TABLE IF NOT EXISTS audio_trained_voice_models (
  id BIGSERIAL PRIMARY KEY,
  model_id VARCHAR(160) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  training_run_id VARCHAR(160) NOT NULL,
  model_json JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'candidate',
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, model_id)
);
CREATE INDEX IF NOT EXISTS audio_trained_voice_models_status_idx ON audio_trained_voice_models (tenant_id, status);
