CREATE TABLE "agency_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"agencyId" varchar(36) NOT NULL,
	"tenantId" varchar(36),
	"versionNumber" integer NOT NULL,
	"snapshotJson" json NOT NULL,
	"contentHash" varchar(64) NOT NULL,
	"changeDescription" text,
	"createdByUserId" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_agent_tools" DROP CONSTRAINT "agency_agent_tools_toolId_agency_tools_id_fk";
--> statement-breakpoint
ALTER TABLE "agency_agent_tools" ALTER COLUMN "toolId" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "agency_agent_tools" ADD COLUMN "toolConfig" json;--> statement-breakpoint
ALTER TABLE "agency_agents" ADD COLUMN "nodeType" varchar(30) DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_agents" ADD COLUMN "nodeConfig" json;--> statement-breakpoint
ALTER TABLE "agency_versions" ADD CONSTRAINT "agency_versions_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_versions" ADD CONSTRAINT "agency_versions_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_versions" ADD CONSTRAINT "agency_versions_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "av_agency_version_unique" ON "agency_versions" USING btree ("agencyId","versionNumber");--> statement-breakpoint
CREATE INDEX "av_agency_created_idx" ON "agency_versions" USING btree ("agencyId","createdAt");