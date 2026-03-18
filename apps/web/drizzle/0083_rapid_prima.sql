CREATE TYPE "public"."assistant_team_status" AS ENUM('active', 'archived', 'draft');--> statement-breakpoint
CREATE TYPE "public"."model_selection_policy" AS ENUM('fixed', 'cost_optimized', 'quality_optimized', 'auto');--> statement-breakpoint
CREATE TYPE "public"."orchestrator_autonomy_level" AS ENUM('manual', 'guided', 'autonomous');--> statement-breakpoint
CREATE TYPE "public"."orchestrator_view_mode" AS ENUM('transparent', 'milestone', 'summary');--> statement-breakpoint
CREATE TABLE "assistant_profiles" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"teamId" varchar(36) NOT NULL,
	"agencyAgentId" varchar(36) NOT NULL,
	"personaId" varchar(36),
	"displayName" varchar(255),
	"nickname" varchar(100),
	"roleTitle" varchar(100),
	"genderStyle" varchar(20),
	"specialtyTags" text[],
	"preferredModelId" varchar(100),
	"modelSelectionPolicy" "model_selection_policy" DEFAULT 'auto',
	"toolPolicyJson" jsonb,
	"approvalPolicyJson" jsonb,
	"memoryPolicyJson" jsonb,
	"visibilityPolicyJson" jsonb,
	"preferredLanguage" varchar(10),
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"isLead" boolean DEFAULT false NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_team_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36),
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100),
	"teamConfigJson" jsonb,
	"memberTemplateJson" jsonb,
	"defaultDiscussionMode" varchar(50),
	"isSystem" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_teams" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"ownerUserId" integer NOT NULL,
	"agencyId" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100),
	"teamPersonaOverlay" jsonb,
	"defaultViewMode" "orchestrator_view_mode" DEFAULT 'transparent',
	"defaultSummaryMode" varchar(50),
	"defaultAutonomyLevel" "orchestrator_autonomy_level" DEFAULT 'guided',
	"defaultModelId" varchar(100),
	"modelBudgetPolicy" jsonb,
	"memoryPolicyJson" jsonb,
	"artifactPolicyJson" jsonb,
	"status" "assistant_team_status" DEFAULT 'draft',
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_orchestrator_profiles" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" integer NOT NULL,
	"defaultPersonaId" varchar(36),
	"orchestratorDisplayName" varchar(255),
	"preferredViewMode" "orchestrator_view_mode" DEFAULT 'transparent',
	"preferredAutonomyLevel" "orchestrator_autonomy_level" DEFAULT 'guided',
	"preferredSummaryStyle" varchar(50),
	"defaultApprovalPolicy" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "multimodal_memory_items" ALTER COLUMN "tenantId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "multimodal_memory_items" ALTER COLUMN "userId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "multimodal_memory_vectors" ALTER COLUMN "embedding" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_visual_state" ADD COLUMN "tenantId" varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE "model_provider_map" ADD COLUMN "supportsThinking" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "persona_templates" ADD COLUMN "assistantNickname" text;--> statement-breakpoint
ALTER TABLE "persona_templates" ADD COLUMN "assistantGender" text DEFAULT 'neutral';--> statement-breakpoint
ALTER TABLE "persona_templates" ADD COLUMN "sourceTemplateIds" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "persona_templates" ADD COLUMN "sourceTemplateLabels" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "persona_templates" ADD COLUMN "sourceTemplateCategories" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_profiles" ADD CONSTRAINT "assistant_profiles_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_profiles" ADD CONSTRAINT "assistant_profiles_teamId_assistant_teams_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."assistant_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_profiles" ADD CONSTRAINT "assistant_profiles_agencyAgentId_agency_agents_id_fk" FOREIGN KEY ("agencyAgentId") REFERENCES "public"."agency_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_profiles" ADD CONSTRAINT "assistant_profiles_personaId_persona_templates_id_fk" FOREIGN KEY ("personaId") REFERENCES "public"."persona_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_team_templates" ADD CONSTRAINT "assistant_team_templates_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_teams" ADD CONSTRAINT "assistant_teams_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_teams" ADD CONSTRAINT "assistant_teams_ownerUserId_users_id_fk" FOREIGN KEY ("ownerUserId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_teams" ADD CONSTRAINT "assistant_teams_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_orchestrator_profiles" ADD CONSTRAINT "user_orchestrator_profiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_orchestrator_profiles" ADD CONSTRAINT "user_orchestrator_profiles_defaultPersonaId_persona_templates_id_fk" FOREIGN KEY ("defaultPersonaId") REFERENCES "public"."persona_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_profiles_team_idx" ON "assistant_profiles" USING btree ("teamId");--> statement-breakpoint
CREATE INDEX "assistant_profiles_agent_idx" ON "assistant_profiles" USING btree ("agencyAgentId");--> statement-breakpoint
CREATE INDEX "assistant_profiles_persona_idx" ON "assistant_profiles" USING btree ("personaId");--> statement-breakpoint
CREATE INDEX "assistant_team_templates_tenant_idx" ON "assistant_team_templates" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "assistant_teams_tenant_idx" ON "assistant_teams" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "assistant_teams_owner_idx" ON "assistant_teams" USING btree ("ownerUserId");--> statement-breakpoint
CREATE INDEX "assistant_teams_agency_idx" ON "assistant_teams" USING btree ("agencyId");--> statement-breakpoint
CREATE UNIQUE INDEX "user_orchestrator_profiles_user_idx" ON "user_orchestrator_profiles" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "media_assets_tenant_user_idx" ON "media_assets" USING btree ("tenantId","userId");--> statement-breakpoint
CREATE UNIQUE INDEX "multimodal_memory_links_unique_idx" ON "multimodal_memory_links" USING btree ("fromMemoryItemId","toMemoryItemId","relationType");--> statement-breakpoint
CREATE INDEX "persona_templates_source_template_ids_idx" ON "persona_templates" USING gin ("sourceTemplateIds");--> statement-breakpoint
ALTER TABLE "persona_templates" ADD CONSTRAINT "persona_templates_assistant_gender_check" CHECK ("assistantGender" IN ('female','male','neutral') OR "assistantGender" IS NULL);