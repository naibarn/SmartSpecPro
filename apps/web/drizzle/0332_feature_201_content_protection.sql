-- Feature 201: tenant-scoped content protection, provenance, verification,
-- rights evidence, and external review records.
-- Secret watermark codewords and signing private keys are never persisted.

CREATE TABLE IF NOT EXISTS "content_protection_assets" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_asset_id" bigint REFERENCES "media_assets"("id") ON DELETE SET NULL,
  "source_version_id" varchar(160),
  "modality" varchar(16) NOT NULL,
  "protection_version" integer DEFAULT 1 NOT NULL,
  "profile_id" varchar(80) NOT NULL,
  "profile_version" varchar(40) NOT NULL,
  "status" varchar(32) DEFAULT 'queued' NOT NULL,
  "watermark_choice" varchar(8) DEFAULT 'off' NOT NULL,
  "choice_source" varchar(24) DEFAULT 'disabled_by_user' NOT NULL,
  "source_object_key" text NOT NULL,
  "protected_object_key" text,
  "source_sha256" varchar(64) NOT NULL,
  "protected_sha256" varchar(64),
  "mime_type" varchar(160) NOT NULL,
  "width" integer,
  "height" integer,
  "duration_ms" integer,
  "fps" real,
  "compound_artifact_id" varchar(160),
  "compound_plan_digest" varchar(64),
  "causal_job_id" varchar(36) REFERENCES "worker_jobs"("id") ON DELETE SET NULL,
  "compound_envelope" jsonb,
  "first_observed_at" timestamptz DEFAULT now() NOT NULL,
  "claimed_creation_at" timestamptz,
  "trusted_timestamp_at" timestamptz,
  "published_at" timestamptz,
  "idempotency_key" varchar(160) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "protected_at" timestamptz,
  "error_code" varchar(80),
  "error_message" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "content_protection_assets_tenant_idempotency_unique"
  ON "content_protection_assets" ("tenant_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "content_protection_assets_tenant_status_idx"
  ON "content_protection_assets" ("tenant_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "content_protection_assets_source_idx"
  ON "content_protection_assets" ("tenant_id", "source_asset_id", "source_version_id");
CREATE INDEX IF NOT EXISTS "content_protection_assets_protected_hash_idx"
  ON "content_protection_assets" ("tenant_id", "protected_sha256");

CREATE TABLE IF NOT EXISTS "content_protection_watermarks" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "protected_asset_id" varchar(36) NOT NULL REFERENCES "content_protection_assets"("id") ON DELETE CASCADE,
  "provider" varchar(80) NOT NULL,
  "channel" varchar(32) NOT NULL,
  "algorithm_version" varchar(40) NOT NULL,
  "watermark_id" varchar(160) NOT NULL,
  "key_version" varchar(80) NOT NULL,
  "embed_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "self_verify_metrics" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "content_protection_watermarks_asset_channel_unique"
  ON "content_protection_watermarks" ("protected_asset_id", "channel");
CREATE INDEX IF NOT EXISTS "content_protection_watermarks_tenant_idx"
  ON "content_protection_watermarks" ("tenant_id");

CREATE TABLE IF NOT EXISTS "content_protection_fingerprints" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "protected_asset_id" varchar(36) NOT NULL REFERENCES "content_protection_assets"("id") ON DELETE CASCADE,
  "fingerprint_type" varchar(32) NOT NULL,
  "fingerprint_version" varchar(40) NOT NULL,
  "digest" varchar(128) NOT NULL,
  "bucket" varchar(80),
  "features_json" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "content_protection_fingerprints_asset_type_unique"
  ON "content_protection_fingerprints" ("protected_asset_id", "fingerprint_type", "fingerprint_version");
CREATE INDEX IF NOT EXISTS "content_protection_fingerprints_tenant_digest_idx"
  ON "content_protection_fingerprints" ("tenant_id", "digest");

CREATE TABLE IF NOT EXISTS "content_provenance_manifests" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "protected_asset_id" varchar(36) NOT NULL REFERENCES "content_protection_assets"("id") ON DELETE CASCADE,
  "manifest_version" varchar(40) NOT NULL,
  "manifest_sha256" varchar(64) NOT NULL,
  "manifest_object_key" text NOT NULL,
  "c2pa_manifest_json" jsonb NOT NULL,
  "signer_key_id" varchar(160) NOT NULL,
  "signature_algorithm" varchar(80) NOT NULL,
  "signed_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "content_provenance_manifests_asset_version_unique"
  ON "content_provenance_manifests" ("protected_asset_id", "manifest_version");
CREATE INDEX IF NOT EXISTS "content_provenance_manifests_tenant_hash_idx"
  ON "content_provenance_manifests" ("tenant_id", "manifest_sha256");

CREATE TABLE IF NOT EXISTS "content_publications" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "protected_asset_id" varchar(36) NOT NULL REFERENCES "content_protection_assets"("id") ON DELETE CASCADE,
  "channel" varchar(80) NOT NULL,
  "external_reference" varchar(255),
  "published_url" text,
  "status" varchar(32) DEFAULT 'draft' NOT NULL,
  "observed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "content_publications_tenant_status_idx"
  ON "content_publications" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "content_publications_asset_idx"
  ON "content_publications" ("protected_asset_id");

CREATE TABLE IF NOT EXISTS "content_verification_runs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "requested_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "query_object_key" text,
  "query_sha256" varchar(64) NOT NULL,
  "modality" varchar(16) NOT NULL,
  "status" varchar(32) DEFAULT 'queued' NOT NULL,
  "match_count" integer DEFAULT 0 NOT NULL,
  "result_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "content_verification_runs_tenant_status_idx"
  ON "content_verification_runs" ("tenant_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "content_verification_runs_query_hash_idx"
  ON "content_verification_runs" ("tenant_id", "query_sha256");

CREATE TABLE IF NOT EXISTS "content_verification_matches" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "run_id" varchar(36) NOT NULL REFERENCES "content_verification_runs"("id") ON DELETE CASCADE,
  "protected_asset_id" varchar(36) REFERENCES "content_protection_assets"("id") ON DELETE SET NULL,
  "match_type" varchar(32) NOT NULL,
  "confidence" real NOT NULL,
  "evidence_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "content_verification_matches_run_idx"
  ON "content_verification_matches" ("run_id");
CREATE INDEX IF NOT EXISTS "content_verification_matches_tenant_asset_idx"
  ON "content_verification_matches" ("tenant_id", "protected_asset_id");

CREATE TABLE IF NOT EXISTS "content_protection_cases" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "opened_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "status" varchar(32) DEFAULT 'open' NOT NULL,
  "title" varchar(255) NOT NULL,
  "summary" text,
  "legal_declaration_confirmed" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "content_protection_cases_tenant_status_idx"
  ON "content_protection_cases" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "content_evidence_packages" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "case_id" varchar(36) REFERENCES "content_protection_cases"("id") ON DELETE CASCADE,
  "package_version" varchar(40) NOT NULL,
  "package_sha256" varchar(64) NOT NULL,
  "manifest_object_key" text NOT NULL,
  "status" varchar(24) DEFAULT 'draft' NOT NULL,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "sealed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "content_evidence_packages_tenant_case_idx"
  ON "content_evidence_packages" ("tenant_id", "case_id");
CREATE INDEX IF NOT EXISTS "content_evidence_packages_hash_idx"
  ON "content_evidence_packages" ("tenant_id", "package_sha256");

CREATE TABLE IF NOT EXISTS "content_protection_events" (
  "id" bigserial PRIMARY KEY,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "asset_id" varchar(36) REFERENCES "content_protection_assets"("id") ON DELETE SET NULL,
  "run_id" varchar(36) REFERENCES "content_verification_runs"("id") ON DELETE SET NULL,
  "event_type" varchar(64) NOT NULL,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "event_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "content_protection_events_tenant_created_idx"
  ON "content_protection_events" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "content_protection_events_asset_idx"
  ON "content_protection_events" ("asset_id", "created_at");

CREATE TABLE IF NOT EXISTS "content_protection_settings" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "default_choice" varchar(8) DEFAULT 'off' NOT NULL,
  "require_confirmation_on_export" boolean DEFAULT true NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "content_protection_settings_tenant_user_unique"
  ON "content_protection_settings" ("tenant_id", "user_id");

CREATE TABLE IF NOT EXISTS "content_rights_holder_profiles" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "display_name" varchar(255) NOT NULL,
  "contact_email" varchar(320),
  "subject_type" varchar(32) DEFAULT 'person' NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "content_rights_holder_profiles_tenant_user_unique"
  ON "content_rights_holder_profiles" ("tenant_id", "user_id");

CREATE TABLE IF NOT EXISTS "content_rights_claims" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "asset_id" varchar(36) NOT NULL REFERENCES "content_protection_assets"("id") ON DELETE CASCADE,
  "holder_profile_id" varchar(36) NOT NULL REFERENCES "content_rights_holder_profiles"("id") ON DELETE RESTRICT,
  "claim_type" varchar(48) NOT NULL,
  "status" varchar(32) DEFAULT 'claimed' NOT NULL,
  "claimed_creation_at" timestamptz,
  "attribution_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "legal_declaration_confirmed" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "content_rights_claims_tenant_asset_idx"
  ON "content_rights_claims" ("tenant_id", "asset_id");
CREATE INDEX IF NOT EXISTS "content_rights_claims_holder_idx"
  ON "content_rights_claims" ("holder_profile_id");

CREATE TABLE IF NOT EXISTS "content_rights_evidence_documents" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "claim_id" varchar(36) NOT NULL REFERENCES "content_rights_claims"("id") ON DELETE CASCADE,
  "document_type" varchar(48) NOT NULL,
  "object_key" text NOT NULL,
  "sha256" varchar(64) NOT NULL,
  "captured_at" timestamptz NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "content_rights_evidence_documents_claim_idx"
  ON "content_rights_evidence_documents" ("claim_id");
CREATE INDEX IF NOT EXISTS "content_rights_evidence_documents_hash_idx"
  ON "content_rights_evidence_documents" ("tenant_id", "sha256");

CREATE TABLE IF NOT EXISTS "content_component_rights" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "asset_id" varchar(36) NOT NULL REFERENCES "content_protection_assets"("id") ON DELETE CASCADE,
  "component_type" varchar(48) NOT NULL,
  "component_ref" varchar(160) NOT NULL,
  "rights_status" varchar(32) DEFAULT 'unverified' NOT NULL,
  "evidence_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "content_component_rights_asset_component_unique"
  ON "content_component_rights" ("asset_id", "component_type", "component_ref");
CREATE INDEX IF NOT EXISTS "content_component_rights_tenant_status_idx"
  ON "content_component_rights" ("tenant_id", "rights_status");

CREATE TABLE IF NOT EXISTS "content_creation_certificates" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "asset_id" varchar(36) NOT NULL REFERENCES "content_protection_assets"("id") ON DELETE CASCADE,
  "certificate_version" varchar(40) NOT NULL,
  "certificate_sha256" varchar(64) NOT NULL,
  "certificate_object_key" text NOT NULL,
  "signer_key_id" varchar(160) NOT NULL,
  "signed_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "content_creation_certificates_asset_version_unique"
  ON "content_creation_certificates" ("asset_id", "certificate_version");

CREATE TABLE IF NOT EXISTS "content_evidence_anchors" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "package_id" varchar(36) NOT NULL REFERENCES "content_evidence_packages"("id") ON DELETE CASCADE,
  "anchor_type" varchar(48) NOT NULL,
  "anchor_value" varchar(255) NOT NULL,
  "external_url" text,
  "observed_at" timestamptz,
  "metadata_json" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "content_evidence_anchors_package_idx"
  ON "content_evidence_anchors" ("package_id");
CREATE INDEX IF NOT EXISTS "content_evidence_anchors_tenant_type_idx"
  ON "content_evidence_anchors" ("tenant_id", "anchor_type");

CREATE TABLE IF NOT EXISTS "content_external_review_links" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "package_id" varchar(36) NOT NULL REFERENCES "content_evidence_packages"("id") ON DELETE CASCADE,
  "token_hash" varchar(128) NOT NULL UNIQUE,
  "scope_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "last_accessed_at" timestamptz,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "content_external_review_links_tenant_expiry_idx"
  ON "content_external_review_links" ("tenant_id", "expires_at");
CREATE INDEX IF NOT EXISTS "content_external_review_links_package_idx"
  ON "content_external_review_links" ("package_id");
