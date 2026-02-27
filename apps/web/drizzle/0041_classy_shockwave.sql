ALTER TYPE "public"."credit_source_type" ADD VALUE 'agency' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."sandbox_feature_type" ADD VALUE 'agency';--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"systemPrompt" text,
	"creditMultiplier" numeric(5, 2) DEFAULT '1.00',
	"maxAgents" integer DEFAULT 10,
	"maxRunTimeSeconds" integer DEFAULT 600,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"isFallbackSafe" boolean DEFAULT false NOT NULL,
	"isPublished" boolean DEFAULT false NOT NULL,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_agent_tools" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"agentId" varchar(36) NOT NULL,
	"toolId" varchar(36) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_agents" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"agencyId" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"instructions" text,
	"model" varchar(100),
	"modelSettings" json,
	"isEntryPoint" boolean DEFAULT false NOT NULL,
	"isOptional" boolean DEFAULT false NOT NULL,
	"position" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_communication_flows" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"agencyId" varchar(36) NOT NULL,
	"fromAgentId" varchar(36) NOT NULL,
	"toAgentId" varchar(36) NOT NULL,
	"flowType" varchar(20) DEFAULT 'delegation' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_conversations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"agencyId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"title" varchar(255) DEFAULT 'New Agency Chat' NOT NULL,
	"totalCreditsUsed" numeric(12, 4) DEFAULT '0',
	"messageCount" integer DEFAULT 0 NOT NULL,
	"isArchived" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_tools" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"toolType" varchar(20) NOT NULL,
	"config" json,
	"riskLevel" varchar(10) DEFAULT 'low' NOT NULL,
	"requiresApproval" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_agent_tools" ADD CONSTRAINT "agency_agent_tools_agentId_agency_agents_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."agency_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_agent_tools" ADD CONSTRAINT "agency_agent_tools_toolId_agency_tools_id_fk" FOREIGN KEY ("toolId") REFERENCES "public"."agency_tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_agents" ADD CONSTRAINT "agency_agents_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_communication_flows" ADD CONSTRAINT "agency_communication_flows_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_communication_flows" ADD CONSTRAINT "agency_communication_flows_fromAgentId_agency_agents_id_fk" FOREIGN KEY ("fromAgentId") REFERENCES "public"."agency_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_communication_flows" ADD CONSTRAINT "agency_communication_flows_toAgentId_agency_agents_id_fk" FOREIGN KEY ("toAgentId") REFERENCES "public"."agency_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_conversations" ADD CONSTRAINT "agency_conversations_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_conversations" ADD CONSTRAINT "agency_conversations_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_tools" ADD CONSTRAINT "agency_tools_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agencies_tenant_slug_idx" ON "agencies" USING btree ("tenantId","slug");--> statement-breakpoint
CREATE INDEX "agencies_tenant_idx" ON "agencies" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "agencies_created_by_idx" ON "agencies" USING btree ("createdBy");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_agent_tools_agent_tool_idx" ON "agency_agent_tools" USING btree ("agentId","toolId");--> statement-breakpoint
CREATE INDEX "agency_agent_tools_tool_idx" ON "agency_agent_tools" USING btree ("toolId");--> statement-breakpoint
CREATE INDEX "agency_agents_agency_idx" ON "agency_agents" USING btree ("agencyId");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_agents_agency_name_idx" ON "agency_agents" USING btree ("agencyId","name");--> statement-breakpoint
CREATE INDEX "agency_comm_flows_agency_idx" ON "agency_communication_flows" USING btree ("agencyId");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_comm_flows_unique_idx" ON "agency_communication_flows" USING btree ("agencyId","fromAgentId","toAgentId");--> statement-breakpoint
CREATE INDEX "agency_conversations_agency_user_idx" ON "agency_conversations" USING btree ("agencyId","userId");--> statement-breakpoint
CREATE INDEX "agency_conversations_user_idx" ON "agency_conversations" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "agency_tools_tenant_idx" ON "agency_tools" USING btree ("tenantId");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_tools_tenant_name_idx" ON "agency_tools" USING btree ("tenantId","name");