CREATE TABLE IF NOT EXISTS "library_public_share_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"library_item_id" integer NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"token_encrypted" text NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_public_share_links"
  ADD CONSTRAINT "library_public_share_links_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "library_public_share_links"
  ADD CONSTRAINT "library_public_share_links_library_item_id_library_items_id_fk"
  FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "library_public_share_links"
  ADD CONSTRAINT "library_public_share_links_created_by_user_id_users_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_public_share_links_token_hash_unique"
  ON "library_public_share_links" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_public_share_links_tenant_item_idx"
  ON "library_public_share_links" USING btree ("tenant_id", "library_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_public_share_links_tenant_token_idx"
  ON "library_public_share_links" USING btree ("tenant_id", "token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_public_share_links_item_active_idx"
  ON "library_public_share_links" USING btree ("library_item_id", "revoked_at", "expires_at");
