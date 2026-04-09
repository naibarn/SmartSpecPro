CREATE TABLE IF NOT EXISTS "desktop_installer_releases" (
  "id" serial PRIMARY KEY NOT NULL,
  "version" varchar(64) NOT NULL,
  "platform" text NOT NULL,
  "channel" text NOT NULL DEFAULT 'stable',
  "installerFormat" text NOT NULL,
  "fileName" varchar(255) NOT NULL,
  "contentType" varchar(255) NOT NULL DEFAULT 'application/octet-stream',
  "storageKey" text NOT NULL,
  "fileSizeBytes" bigint NOT NULL,
  "fileSha256" varchar(64) NOT NULL,
  "releaseNotes" text,
  "isPublished" boolean NOT NULL DEFAULT true,
  "publishedAt" timestamp with time zone,
  "uploadedBy" integer,
  "uploadedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "desktop_installer_releases_uploadedBy_users_id_fk" FOREIGN KEY ("uploadedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_desktop_installer_releases_platform_published" ON "desktop_installer_releases" USING btree ("platform","isPublished","publishedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_desktop_installer_releases_version" ON "desktop_installer_releases" USING btree ("version");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "desktop_installer_releases_storage_key_unique" ON "desktop_installer_releases" USING btree ("storageKey");
