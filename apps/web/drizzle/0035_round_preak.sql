CREATE TABLE "presentation_exports" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_id" integer NOT NULL,
	"user_id" integer,
	"tenant_id" varchar(36) NOT NULL,
	"format" varchar(8) NOT NULL,
	"quality" varchar(12),
	"width" integer DEFAULT 1920 NOT NULL,
	"height" integer DEFAULT 1080 NOT NULL,
	"fps" integer,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"progress_pct" integer DEFAULT 0 NOT NULL,
	"stage" varchar(64),
	"error_message" text,
	"output_url" text,
	"output_storage_key" text,
	"output_bytes" bigint,
	"celery_task_id" varchar(255),
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "presentation_decks" ADD COLUMN "project_audio_track" json;--> statement-breakpoint
ALTER TABLE "presentation_slides" ADD COLUMN "audio_track" json;--> statement-breakpoint
ALTER TABLE "presentation_exports" ADD CONSTRAINT "presentation_exports_deck_id_presentation_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."presentation_decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_exports" ADD CONSTRAINT "presentation_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_exports_idempotency_key_unique" ON "presentation_exports" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "presentation_exports_deck_idx" ON "presentation_exports" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "presentation_exports_user_idx" ON "presentation_exports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "presentation_exports_tenant_idx" ON "presentation_exports" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "presentation_exports_celery_task_idx" ON "presentation_exports" USING btree ("celery_task_id");