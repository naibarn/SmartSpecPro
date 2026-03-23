CREATE TABLE "agency_agent_memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"agencyId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"agentNodeId" text NOT NULL,
	"memoryType" text NOT NULL,
	"content" text NOT NULL,
	"contentHash" text NOT NULL,
	"sourceRunId" text,
	"confidence" numeric(4, 3) DEFAULT '1.000',
	"useCount" integer DEFAULT 0 NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_agent_memories" ADD CONSTRAINT "agency_agent_memories_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_agent_memories" ADD CONSTRAINT "agency_agent_memories_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_agent_memories" ADD CONSTRAINT "agency_agent_memories_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_memories_tenant_idx" ON "agency_agent_memories" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "agent_memories_agency_idx" ON "agency_agent_memories" USING btree ("agencyId");--> statement-breakpoint
CREATE INDEX "agent_memories_user_idx" ON "agency_agent_memories" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "agent_memories_lookup_idx" ON "agency_agent_memories" USING btree ("tenantId","agencyId","agentNodeId","userId","isActive");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memories_content_hash_idx" ON "agency_agent_memories" USING btree ("tenantId","agencyId","agentNodeId","userId","contentHash");--> statement-breakpoint
ALTER TABLE "agencies" DROP COLUMN "triggerPhrases";