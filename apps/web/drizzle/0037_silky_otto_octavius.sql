DROP INDEX "presentation_conversion_records_source_unique";--> statement-breakpoint
ALTER TABLE "presentation_conversion_records" ALTER COLUMN "source_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "presentation_conversion_records" ALTER COLUMN "deck_library_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "presentation_conversion_records" ALTER COLUMN "deck_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "presentation_conversion_records" ADD COLUMN "status" varchar(16) DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "presentation_conversion_records" ADD COLUMN "progress" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "presentation_conversion_records" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "presentation_conversion_records" ADD COLUMN "slides_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "presentation_conversion_records" ADD CONSTRAINT "presentation_conversion_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "presentation_conversion_records_user_idx" ON "presentation_conversion_records" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_conversion_records_source_unique" ON "presentation_conversion_records" USING btree ("tenant_id","source_item_id") WHERE "presentation_conversion_records"."source_item_id" IS NOT NULL;