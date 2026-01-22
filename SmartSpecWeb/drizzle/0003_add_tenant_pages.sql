-- Add tenant_pages table for domain-specific page content
CREATE TABLE IF NOT EXISTS "tenant_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" integer NOT NULL,
	"pageKey" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"content" text,
	"sections" json,
	"metadata" json,
	"isPublished" boolean DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"showInMenu" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

-- Add foreign key constraint
ALTER TABLE "tenant_pages" ADD CONSTRAINT "tenant_pages_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS "tenant_pages_tenantId_idx" ON "tenant_pages" ("tenantId");
CREATE INDEX IF NOT EXISTS "tenant_pages_pageKey_idx" ON "tenant_pages" ("pageKey");
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_pages_tenantId_pageKey_idx" ON "tenant_pages" ("tenantId", "pageKey");
