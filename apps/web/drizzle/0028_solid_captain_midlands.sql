CREATE TABLE "workflow_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflowId" integer NOT NULL,
	"tenantId" varchar(36),
	"versionNumber" integer NOT NULL,
	"workflowJson" json NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"defaultModel" varchar(255),
	"contentHash" varchar(64) NOT NULL,
	"changeDescription" text,
	"createdByUserId" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "previewSvg" text;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "industry" json;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "stepCount" integer;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "estimatedSetupMinutes" integer;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "templateKey" varchar(50);--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflowId_workflows_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wv_workflow_version_unique" ON "workflow_versions" USING btree ("workflowId","versionNumber");--> statement-breakpoint
CREATE INDEX "wv_workflow_created_idx" ON "workflow_versions" USING btree ("workflowId","createdAt");--> statement-breakpoint
CREATE INDEX "wv_tenant_created_idx" ON "workflow_versions" USING btree ("tenantId","createdAt");--> statement-breakpoint
CREATE INDEX "wv_content_hash_idx" ON "workflow_versions" USING btree ("contentHash");--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_templateKey_unique" UNIQUE("templateKey");