CREATE TABLE "presentation_asset_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"deck_id" integer NOT NULL,
	"slide_id" integer,
	"library_item_id" integer NOT NULL,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presentation_decks" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"library_item_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"slide_count" integer DEFAULT 0 NOT NULL,
	"total_asset_bytes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presentation_slides" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_id" integer NOT NULL,
	"order_index" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" varchar(255) DEFAULT 'Slide' NOT NULL,
	"slide_content" json DEFAULT '{}'::json NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presentation_source_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_id" integer NOT NULL,
	"source_library_item_id" integer,
	"source_format" varchar(16) NOT NULL,
	"conversion_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"partial_fidelity" boolean DEFAULT false NOT NULL,
	"fidelity_warnings" json DEFAULT '[]'::json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_chunks" ADD COLUMN "allowed_scopes" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "library_items" ADD COLUMN "allowed_scopes" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "presentation_asset_links" ADD CONSTRAINT "presentation_asset_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_asset_links" ADD CONSTRAINT "presentation_asset_links_deck_id_presentation_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."presentation_decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_asset_links" ADD CONSTRAINT "presentation_asset_links_slide_id_presentation_slides_id_fk" FOREIGN KEY ("slide_id") REFERENCES "public"."presentation_slides"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_asset_links" ADD CONSTRAINT "presentation_asset_links_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_decks" ADD CONSTRAINT "presentation_decks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_decks" ADD CONSTRAINT "presentation_decks_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_slides" ADD CONSTRAINT "presentation_slides_deck_id_presentation_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."presentation_decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_source_attachments" ADD CONSTRAINT "presentation_source_attachments_deck_id_presentation_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."presentation_decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_source_attachments" ADD CONSTRAINT "presentation_source_attachments_source_library_item_id_library_items_id_fk" FOREIGN KEY ("source_library_item_id") REFERENCES "public"."library_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_asset_links_unique" ON "presentation_asset_links" USING btree ("deck_id","slide_id","library_item_id");--> statement-breakpoint
CREATE INDEX "presentation_asset_links_deck_idx" ON "presentation_asset_links" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "presentation_asset_links_slide_idx" ON "presentation_asset_links" USING btree ("slide_id");--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_decks_library_item_unique" ON "presentation_decks" USING btree ("library_item_id");--> statement-breakpoint
CREATE INDEX "presentation_decks_tenant_idx" ON "presentation_decks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "presentation_decks_tenant_updated_idx" ON "presentation_decks" USING btree ("tenant_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_slides_deck_order_unique" ON "presentation_slides" USING btree ("deck_id","order_index");--> statement-breakpoint
CREATE INDEX "presentation_slides_deck_idx" ON "presentation_slides" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "presentation_slides_deck_updated_idx" ON "presentation_slides" USING btree ("deck_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_source_attachments_deck_unique" ON "presentation_source_attachments" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "presentation_source_attachments_source_item_idx" ON "presentation_source_attachments" USING btree ("source_library_item_id");--> statement-breakpoint
CREATE INDEX "library_chunks_allowed_scopes_gin_idx" ON "library_chunks" USING gin ("allowed_scopes");--> statement-breakpoint
CREATE INDEX "library_items_allowed_scopes_gin_idx" ON "library_items" USING gin ("allowed_scopes");