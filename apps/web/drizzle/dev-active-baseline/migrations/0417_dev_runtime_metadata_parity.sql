DO $dev_runtime_metadata_guard$ BEGIN
  IF current_database() !~ '_dev(_web)?$' THEN RAISE EXCEPTION 'DEV_ACTIVE_SCHEMA_TARGET_REQUIRED'; END IF;
  IF to_regclass('public.tenants') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'DEV_ACTIVE_SCHEMA_BASELINE_REQUIRED';
  END IF;
END $dev_runtime_metadata_guard$;
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS owner_email varchar(255);
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS max_users integer;
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS max_projects integer;
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS max_storage_gb integer;
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS max_api_calls_per_month integer;
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS current_users integer;
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS current_projects integer;
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS current_storage_gb integer;
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS current_api_calls integer;
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS billing_email varchar(255);
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS stripe_customer_id varchar(255);
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS description text;
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS logo_url varchar(500);
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS website varchar(255);
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS updated_at timestamp without time zone;
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS suspended_at timestamp without time zone;
--> statement-breakpoint
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS deleted_at timestamp without time zone;
--> statement-breakpoint
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banned_until timestamp with time zone;
--> statement-breakpoint
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ban_reason text;
