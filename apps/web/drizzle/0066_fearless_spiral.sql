CREATE TYPE "public"."content_artifact_status" AS ENUM('active', 'stale', 'archived');--> statement-breakpoint
CREATE TABLE "content_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"userId" integer NOT NULL,
	"skillSlug" text NOT NULL,
	"outputFormat" text NOT NULL,
	"contentJson" jsonb,
	"qualityScore" jsonb,
	"lastVerifiedAt" timestamp with time zone,
	"refreshCadenceDays" integer DEFAULT 30,
	"nextRefreshAt" timestamp with time zone,
	"status" "content_artifact_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "content_artifacts_tenant_idx" ON "content_artifacts" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "content_artifacts_status_idx" ON "content_artifacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_artifacts_next_refresh_idx" ON "content_artifacts" USING btree ("nextRefreshAt");