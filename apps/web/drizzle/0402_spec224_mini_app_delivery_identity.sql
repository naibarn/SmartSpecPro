SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint

ALTER TABLE "app_identities"
  ADD COLUMN IF NOT EXISTS "owner_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "visibility" varchar(16) NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS "deployment_version" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_known_good_artifact_ref" varchar(512),
  ADD COLUMN IF NOT EXISTS "creation_idempotency_key" varchar(160);
--> statement-breakpoint

ALTER TABLE "app_identities"
  ADD CONSTRAINT "app_identities_visibility_check" CHECK ("visibility" IN ('private', 'public')),
  ADD CONSTRAINT "app_identities_deployment_version_check" CHECK ("deployment_version" >= 0);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "app_identities_owner_create_key_unique"
  ON "app_identities" ("tenant_id", "owner_user_id", "creation_idempotency_key");
