DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'webhook_trigger' AND enumtypid = 'credit_source_type'::regtype) THEN ALTER TYPE "public"."credit_source_type" ADD VALUE 'webhook_trigger'; END IF; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automation_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"intent" jsonb NOT NULL,
	"scripts" jsonb NOT NULL,
	"thumbnail_url" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'library_items' AND column_name = 'parent_id') THEN ALTER TABLE "library_items" ADD COLUMN "parent_id" integer; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'automation_templates_tenant_id_tenants_id_fk') THEN ALTER TABLE "automation_templates" ADD CONSTRAINT "automation_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'automation_templates_user_id_users_id_fk') THEN ALTER TABLE "automation_templates" ADD CONSTRAINT "automation_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_templates_tenant_idx" ON "automation_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_templates_public_usage_idx" ON "automation_templates" USING btree ("is_public","usage_count");--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'library_items_parent_id_library_items_id_fk') THEN ALTER TABLE "library_items" ADD CONSTRAINT "library_items_parent_id_library_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_items_parent_id_idx" ON "library_items" USING btree ("parent_id");
