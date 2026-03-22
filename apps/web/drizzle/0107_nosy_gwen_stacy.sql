CREATE TABLE "agency_agent_guardrails" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"agentId" varchar(36) NOT NULL,
	"guardrailId" varchar(36) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_guardrails" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"agencyId" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(10) NOT NULL,
	"mode" varchar(10) NOT NULL,
	"strategy" varchar(30) NOT NULL,
	"config" jsonb,
	"validationAttempts" integer DEFAULT 1,
	"isEnabled" boolean DEFAULT true,
	"sortOrder" integer DEFAULT 0,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_run_traces" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"runId" varchar(36) NOT NULL,
	"agencyId" varchar(36) NOT NULL,
	"createdBy" integer,
	"trace" jsonb NOT NULL,
	"durationMs" integer,
	"totalTokens" integer,
	"totalCost" numeric(10, 6),
	"status" varchar(20),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_shared_tools" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"agencyId" varchar(36) NOT NULL,
	"toolId" varchar(100) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "sharedInstructions" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "userContext" jsonb;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "conversationStarters" jsonb;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "topology" varchar(30) DEFAULT 'custom';--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "cacheConversationStarters" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "agency_agents" ADD COLUMN "outputSchema" jsonb;--> statement-breakpoint
ALTER TABLE "agency_agents" ADD COLUMN "examples" jsonb;--> statement-breakpoint
ALTER TABLE "agency_agents" ADD COLUMN "mcpServers" jsonb;--> statement-breakpoint
ALTER TABLE "agency_agents" ADD COLUMN "mcpServerTokensEncrypted" text;--> statement-breakpoint
ALTER TABLE "agency_agents" ADD COLUMN "parallelToolCalls" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "agency_agents" ADD COLUMN "maxTurns" integer DEFAULT 25;--> statement-breakpoint
ALTER TABLE "agency_communication_flows" ADD COLUMN "flowConfig" jsonb;--> statement-breakpoint
ALTER TABLE "agency_tools" ADD COLUMN "inputSchema" jsonb;--> statement-breakpoint
ALTER TABLE "agency_tools" ADD COLUMN "outputSchema" jsonb;--> statement-breakpoint
ALTER TABLE "agency_tools" ADD COLUMN "httpMethod" varchar(10);--> statement-breakpoint
ALTER TABLE "agency_tools" ADD COLUMN "headersEncrypted" text;--> statement-breakpoint
ALTER TABLE "agency_tools" ADD COLUMN "retryPolicy" jsonb;--> statement-breakpoint
ALTER TABLE "agency_tools" ADD COLUMN "icon" varchar(50);--> statement-breakpoint
ALTER TABLE "agency_tools" ADD COLUMN "category" varchar(50);--> statement-breakpoint
ALTER TABLE "agency_tools" ADD COLUMN "version" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "agency_tools" ADD COLUMN "isExposedAsApi" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "agency_tools" ADD COLUMN "strictSchema" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "agency_tools" ADD COLUMN "oneCallAtATime" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "agency_tools" ADD COLUMN "isEnabled" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "agency_tools" ADD COLUMN "updatedAt" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "agency_agent_guardrails" ADD CONSTRAINT "agency_agent_guardrails_agentId_agency_agents_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."agency_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_agent_guardrails" ADD CONSTRAINT "agency_agent_guardrails_guardrailId_agency_guardrails_id_fk" FOREIGN KEY ("guardrailId") REFERENCES "public"."agency_guardrails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_guardrails" ADD CONSTRAINT "agency_guardrails_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_guardrails" ADD CONSTRAINT "agency_guardrails_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_run_traces" ADD CONSTRAINT "agency_run_traces_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_shared_tools" ADD CONSTRAINT "agency_shared_tools_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agency_agent_guardrails_unique" ON "agency_agent_guardrails" USING btree ("agentId","guardrailId");--> statement-breakpoint
CREATE INDEX "agency_guardrails_tenant_idx" ON "agency_guardrails" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "agency_guardrails_agency_idx" ON "agency_guardrails" USING btree ("agencyId");--> statement-breakpoint
CREATE INDEX "agency_guardrails_agency_enabled_idx" ON "agency_guardrails" USING btree ("agencyId","isEnabled");--> statement-breakpoint
CREATE INDEX "agency_run_traces_tenant_idx" ON "agency_run_traces" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "agency_run_traces_run_idx" ON "agency_run_traces" USING btree ("runId");--> statement-breakpoint
CREATE INDEX "agency_run_traces_agency_idx" ON "agency_run_traces" USING btree ("agencyId");--> statement-breakpoint
CREATE INDEX "agency_run_traces_created_idx" ON "agency_run_traces" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_shared_tools_unique" ON "agency_shared_tools" USING btree ("agencyId","toolId");