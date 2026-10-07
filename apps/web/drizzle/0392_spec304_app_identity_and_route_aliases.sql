-- SPEC-304 Wave 1: stable App identity and separately mutable route aliases.
-- Additive only. This migration is not executed by the development checkpoint.

BEGIN;

CREATE TABLE IF NOT EXISTS "app_identities" (
  "app_id" varchar(128) PRIMARY KEY,
  "public_app_id" varchar(128) NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "publisher_ref" varchar(128) NOT NULL,
  "canonical_product_id" varchar(128) NOT NULL,
  "lifecycle" varchar(16) NOT NULL DEFAULT 'draft',
  "policy_refs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "parent_app_id" varchar(128),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "app_identities_lifecycle_check"
    CHECK ("lifecycle" IN ('draft', 'active', 'suspended', 'archived')),
  CONSTRAINT "app_identities_parent_not_self_check"
    CHECK ("parent_app_id" IS NULL OR "parent_app_id" <> "app_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_identities_public_app_id_unique"
  ON "app_identities" ("public_app_id");

CREATE TABLE IF NOT EXISTS "app_route_aliases" (
  "alias_id" varchar(128) PRIMARY KEY,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "app_id" varchar(128) NOT NULL REFERENCES "app_identities"("app_id") ON DELETE RESTRICT,
  "kind" varchar(16) NOT NULL,
  "value" varchar(253) NOT NULL,
  "status" varchar(32) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "activated_at" timestamp with time zone,
  CONSTRAINT "app_route_aliases_kind_check"
    CHECK ("kind" IN ('slug', 'custom-domain')),
  CONSTRAINT "app_route_aliases_status_check"
    CHECK ("status" IN ('PLATFORM_SUBDOMAIN', 'CUSTOM_DOMAIN_REQUESTED', 'DNS_VERIFICATION_PENDING', 'CERTIFICATE_PENDING', 'ACTIVE')),
  CONSTRAINT "app_route_aliases_value_lowercase_check"
    CHECK ("value" = lower("value"))
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_route_aliases_tenant_kind_value_unique"
  ON "app_route_aliases" ("tenant_id", "kind", "value");

CREATE UNIQUE INDEX IF NOT EXISTS "app_route_aliases_custom_domain_unique"
  ON "app_route_aliases" ("value") WHERE "kind" = 'custom-domain';

COMMIT;
