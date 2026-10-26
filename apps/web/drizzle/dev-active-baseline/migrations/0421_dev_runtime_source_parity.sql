-- Active source migration 0234 sha256:24a48ec1c7a575c2e993df0cf1fe9f0e0f961f0a64b46b5c85e3b924273c321f
DO $dev_production_runtime_guard$ BEGIN
  IF current_database() !~ '_dev(_web)?$' THEN RAISE EXCEPTION 'DEV_ACTIVE_SCHEMA_TARGET_REQUIRED'; END IF;
  IF to_regclass('public.oauth_connections') IS NULL OR to_regclass('public.presentation_exports') IS NULL THEN
    RAISE EXCEPTION 'DEV_ACTIVE_SCHEMA_BASELINE_REQUIRED';
  END IF;
END $dev_production_runtime_guard$;
--> statement-breakpoint
ALTER TABLE public.oauth_connections ADD COLUMN IF NOT EXISTS access_token text;
--> statement-breakpoint
ALTER TABLE public.oauth_connections ADD COLUMN IF NOT EXISTS refresh_token text;
--> statement-breakpoint
ALTER TABLE public.oauth_connections ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
--> statement-breakpoint
ALTER TABLE public.oauth_connections ADD COLUMN IF NOT EXISTS scopes text;
--> statement-breakpoint
ALTER TABLE public.oauth_connections ALTER COLUMN status SET DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE public.oauth_connections ALTER COLUMN created_at SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public.oauth_connections ALTER COLUMN updated_at SET DEFAULT now();
--> statement-breakpoint
-- Preserve original presentation export URLs for audit while making the
-- protected R2 proxy URL the only canonical playback URL.
ALTER TABLE "presentation_exports"
  ADD COLUMN IF NOT EXISTS "output_original_url" text;

CREATE INDEX IF NOT EXISTS "presentation_exports_tenant_user_storage_idx"
  ON "presentation_exports" ("tenant_id", "user_id", "output_storage_key");
