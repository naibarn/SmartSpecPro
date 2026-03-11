CREATE TABLE "agency_run_artifacts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"runId" varchar(36) NOT NULL,
	"conversationId" varchar(36) NOT NULL,
	"agencyId" varchar(36) NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"artifactType" varchar(50) NOT NULL,
	"intent" varchar(50) NOT NULL,
	"state" varchar(32) DEFAULT 'preview_generated' NOT NULL,
	"summary" text,
	"payloadJson" json,
	"payloadStorageKey" varchar(255),
	"provenanceJson" json,
	"commitStatus" varchar(32) DEFAULT 'not_committed' NOT NULL,
	"commitToken" varchar(64) NOT NULL,
	"targetType" varchar(64),
	"targetId" varchar(128),
	"committedAt" timestamp with time zone,
	"expiredAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_runs" ADD COLUMN "traceId" varchar(64);--> statement-breakpoint
ALTER TABLE "agency_run_artifacts" ADD CONSTRAINT "agency_run_artifacts_conversationId_agency_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."agency_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_run_artifacts" ADD CONSTRAINT "agency_run_artifacts_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_run_artifacts" ADD CONSTRAINT "agency_run_artifacts_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agency_run_artifacts_commit_token_idx" ON "agency_run_artifacts" USING btree ("commitToken");--> statement-breakpoint
CREATE INDEX "agency_run_artifacts_run_idx" ON "agency_run_artifacts" USING btree ("runId");--> statement-breakpoint
CREATE INDEX "agency_run_artifacts_conversation_idx" ON "agency_run_artifacts" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "agency_run_artifacts_tenant_idx" ON "agency_run_artifacts" USING btree ("tenantId");