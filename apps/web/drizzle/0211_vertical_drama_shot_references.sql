CREATE TABLE "vertical_drama_shot_references" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"seriesId" bigint NOT NULL,
	"episodeId" bigint NOT NULL,
	"shotNumber" integer NOT NULL,
	"mediaAssetId" bigint NOT NULL,
	"role" varchar(20) DEFAULT 'reference' NOT NULL,
	"source" varchar(20) NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vertical_drama_shot_references" ADD CONSTRAINT "vertical_drama_shot_references_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vertical_drama_shot_references" ADD CONSTRAINT "vertical_drama_shot_references_seriesId_vertical_drama_series_id_fk" FOREIGN KEY ("seriesId") REFERENCES "public"."vertical_drama_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vertical_drama_shot_references" ADD CONSTRAINT "vertical_drama_shot_references_episodeId_vertical_drama_episodes_id_fk" FOREIGN KEY ("episodeId") REFERENCES "public"."vertical_drama_episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vertical_drama_shot_references" ADD CONSTRAINT "vertical_drama_shot_references_mediaAssetId_media_assets_id_fk" FOREIGN KEY ("mediaAssetId") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vds_shot_ref_lookup_idx" ON "vertical_drama_shot_references" USING btree ("tenantId","seriesId","episodeId","shotNumber");--> statement-breakpoint
CREATE UNIQUE INDEX "vds_shot_ref_unique" ON "vertical_drama_shot_references" USING btree ("episodeId","shotNumber","mediaAssetId");
