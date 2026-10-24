-- Reconcile additive gaps found in the authorized development catalog audit.
-- These objects are already declared by schema.ts / 0410_snapshot.json.
-- Keep historical migration hashes intact; do not replay retired systems.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_item_id" varchar(50) NOT NULL,
	"platform" varchar(10) DEFAULT 'web' NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"custom_label" varchar(100),
	"custom_icon" varchar(50),
	"sort_order" integer,
	"tenant_id" varchar(36),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.menu_config'::regclass AND conname = 'menu_config_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "menu_config" ADD CONSTRAINT "menu_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "menu_config_unique" ON "menu_config" USING btree ("menu_item_id","platform","tenant_id");
--> statement-breakpoint
ALTER TABLE "automation_handoffs"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" varchar(64) NOT NULL DEFAULT gen_random_uuid()::text;
--> statement-breakpoint
ALTER TABLE "automation_handoffs"
  ADD COLUMN IF NOT EXISTS "dispatchTokenHash" varchar(64);
--> statement-breakpoint
ALTER TABLE "automation_handoffs"
  ADD COLUMN IF NOT EXISTS "callbackNonce" varchar(64);
--> statement-breakpoint
ALTER TABLE "automation_handoffs"
  ADD COLUMN IF NOT EXISTS "callbackDeadlineAt" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "automation_handoffs"
  ADD COLUMN IF NOT EXISTS "attemptCount" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "automation_handoffs"
  ADD COLUMN IF NOT EXISTS "lastAttemptAt" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "automation_handoffs_run_idempotency_idx"
  ON "automation_handoffs" USING btree ("runId", "idempotencyKey");

--> statement-breakpoint
ALTER TABLE "channel_messages"
  ADD COLUMN IF NOT EXISTS "errorCode" varchar(100),
  ADD COLUMN IF NOT EXISTS "errorMessage" text;
--> statement-breakpoint
ALTER TABLE "vertical_drama_object_detection_suggestions"
  ADD COLUMN IF NOT EXISTS "planningKey" varchar(160);
