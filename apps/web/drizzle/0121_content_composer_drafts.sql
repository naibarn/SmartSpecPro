CREATE TABLE IF NOT EXISTS "content_composer_drafts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"executionSource" varchar(20),
	"skillId" varchar(255),
	"agencyId" varchar(255),
	"articleBody" text,
	"requiresWebSearch" boolean DEFAULT false NOT NULL,
	"requiresThinking" boolean DEFAULT false NOT NULL,
	"attachmentIds" json DEFAULT '[]'::json NOT NULL,
	"destinationKind" varchar(20),
	"docsSubKind" varchar(20),
	"docsTargetId" integer,
	"blogTargetId" integer,
	"socialPlatform" varchar(50),
	"socialTargetId" integer,
	"socialCaption" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"errorMessage" text,
	"publishedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_composer_drafts"
  ADD CONSTRAINT "content_composer_drafts_tenantId_tenants_id_fk"
  FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_composer_drafts"
  ADD CONSTRAINT "content_composer_drafts_userId_users_id_fk"
  FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccd_tenant_user_status_idx"
  ON "content_composer_drafts" USING btree ("tenantId", "userId", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccd_tenant_updated_at_idx"
  ON "content_composer_drafts" USING btree ("tenantId", "updatedAt");
--> statement-breakpoint
ALTER TABLE "blog_posts"
  ADD COLUMN IF NOT EXISTS "mediaAttachments" json;
