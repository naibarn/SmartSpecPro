ALTER TABLE "agencies" ADD COLUMN "triggerPhrases" jsonb;--> statement-breakpoint
ALTER TABLE "agency_conversations" ADD COLUMN "tenantId" varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_conversations" ADD CONSTRAINT "agency_conversations_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;