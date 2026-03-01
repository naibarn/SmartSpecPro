-- Enum values 'tts', 'browser_automation', 'widget_chat', 'webhook_chat' already added via raw SQL
CREATE TABLE "channel_connections" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"channelType" text NOT NULL,
	"externalUserId" text NOT NULL,
	"externalChatId" text,
	"connectionConfig" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"activeChannelId" varchar(36),
	"linkedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"linkedBy" varchar(20),
	"revokedAt" timestamp with time zone,
	"revokedBy" varchar(36),
	CONSTRAINT "channel_connections_type_check" CHECK ("channelType" IN ('telegram','whatsapp','line','slack','discord')),
	CONSTRAINT "channel_connections_status_check" CHECK ("status" IN ('active','revoked','pending','blocked'))
);
--> statement-breakpoint
CREATE TABLE "channel_credentials" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"channelType" text NOT NULL,
	"credentialsEncrypted" text NOT NULL,
	"webhookUrl" text,
	"webhookSecretEncrypted" text,
	"isActive" boolean DEFAULT true,
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_credentials_type_check" CHECK ("channelType" IN ('telegram','whatsapp','line','slack','discord'))
);
--> statement-breakpoint
CREATE TABLE "channel_routing_rules" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"priority" integer DEFAULT 50,
	"isActive" boolean DEFAULT true,
	"conditions" jsonb NOT NULL,
	"targetType" text NOT NULL,
	"targetAgencyId" varchar(36),
	"targetPersonaId" varchar(36),
	"targetWorkflowId" integer,
	"totalMatches" integer DEFAULT 0,
	"lastMatchedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_routing_rules_target_type_check" CHECK ("targetType" IN ('agency','chat','workflow'))
);
--> statement-breakpoint
CREATE TABLE "chat_widgets" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"targetType" text,
	"targetAgencyId" varchar(36),
	"defaultPersonaId" varchar(36),
	"theme" jsonb,
	"allowedOrigins" text[] DEFAULT '{}',
	"rateLimitPerMinute" integer DEFAULT 10,
	"maxConversationLength" integer DEFAULT 100,
	"requireEmail" boolean DEFAULT false,
	"creditSource" text,
	"monthlyCreditBudget" integer,
	"maxCreditsPerVisitorSession" integer DEFAULT 50,
	"maxCreditsPerVisitorDay" integer DEFAULT 100,
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_widgets_target_type_check" CHECK ("targetType" IN ('chat','agency') OR "targetType" IS NULL),
	CONSTRAINT "chat_widgets_credit_source_check" CHECK ("creditSource" IN ('tenant','visitor') OR "creditSource" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "conversation_artifacts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversationId" integer NOT NULL,
	"messageId" integer NOT NULL,
	"artifactType" text NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"language" text,
	"version" integer DEFAULT 1,
	"parentArtifactId" varchar(36),
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_artifacts_type_check" CHECK ("artifactType" IN ('code','react','chart','table','mermaid','html','markdown','svg'))
);
--> statement-breakpoint
CREATE TABLE "persona_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36),
	"userId" integer,
	"name" text NOT NULL,
	"description" text,
	"systemPromptPrefix" text NOT NULL,
	"tone" text,
	"language" text DEFAULT 'auto',
	"responseStyle" jsonb DEFAULT '{}'::jsonb,
	"restrictions" text[] DEFAULT '{}',
	"scope" text NOT NULL,
	"isDefault" boolean DEFAULT false,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "persona_templates_tone_check" CHECK ("tone" IN ('formal','casual','friendly','technical','creative') OR "tone" IS NULL),
	CONSTRAINT "persona_templates_scope_check" CHECK ("scope" IN ('platform','tenant','user'))
);
--> statement-breakpoint
CREATE TABLE "webhook_trigger_logs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"triggerId" varchar(36) NOT NULL,
	"requestMethod" text,
	"requestHeadersSafe" jsonb,
	"requestBodyHash" varchar(64),
	"requestBodySize" integer,
	"extractedVariables" jsonb,
	"sourceIpMasked" text,
	"status" text NOT NULL,
	"targetExecutionId" text,
	"creditsConsumed" numeric(12, 4) DEFAULT '0',
	"errorMessage" text,
	"processingTimeMs" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_trigger_logs_status_check" CHECK ("status" IN ('success','auth_failed','rate_limited','target_error','credit_insufficient'))
);
--> statement-breakpoint
CREATE TABLE "webhook_triggers" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"authType" text DEFAULT 'token' NOT NULL,
	"authSecretEncrypted" text NOT NULL,
	"targetType" text NOT NULL,
	"targetConversationId" integer,
	"targetAgencyId" varchar(36),
	"targetWorkflowId" integer,
	"payloadTemplate" jsonb DEFAULT '{}'::jsonb,
	"rateLimitPerMinute" integer DEFAULT 10,
	"monthlyTriggerBudget" integer,
	"isActive" boolean DEFAULT true,
	"totalTriggers" integer DEFAULT 0,
	"lastTriggeredAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_triggers_auth_type_check" CHECK ("authType" IN ('token','hmac_sha256')),
	CONSTRAINT "webhook_triggers_target_type_check" CHECK ("targetType" IN ('chat','agency','workflow'))
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "tenantId" varchar(36);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "personaId" varchar(36);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "traceId" varchar(32);--> statement-breakpoint
-- skills columns llmModelId, preferredProviderId, strictProviderPin already exist from 0053
ALTER TABLE "tenants" ADD COLUMN "defaultPersonaId" varchar(36);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "featureFlags" json;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "defaultPersonaId" varchar(36);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "voiceConsentGrantedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_credentials" ADD CONSTRAINT "channel_credentials_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_routing_rules" ADD CONSTRAINT "channel_routing_rules_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_routing_rules" ADD CONSTRAINT "channel_routing_rules_targetAgencyId_agencies_id_fk" FOREIGN KEY ("targetAgencyId") REFERENCES "public"."agencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_routing_rules" ADD CONSTRAINT "channel_routing_rules_targetPersonaId_persona_templates_id_fk" FOREIGN KEY ("targetPersonaId") REFERENCES "public"."persona_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_routing_rules" ADD CONSTRAINT "channel_routing_rules_targetWorkflowId_workflows_id_fk" FOREIGN KEY ("targetWorkflowId") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD CONSTRAINT "chat_widgets_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD CONSTRAINT "chat_widgets_targetAgencyId_agencies_id_fk" FOREIGN KEY ("targetAgencyId") REFERENCES "public"."agencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD CONSTRAINT "chat_widgets_defaultPersonaId_persona_templates_id_fk" FOREIGN KEY ("defaultPersonaId") REFERENCES "public"."persona_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_artifacts" ADD CONSTRAINT "conversation_artifacts_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_artifacts" ADD CONSTRAINT "conversation_artifacts_messageId_messages_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_artifacts" ADD CONSTRAINT "conversation_artifacts_parentArtifactId_conversation_artifacts_id_fk" FOREIGN KEY ("parentArtifactId") REFERENCES "public"."conversation_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_templates" ADD CONSTRAINT "persona_templates_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_templates" ADD CONSTRAINT "persona_templates_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_trigger_logs" ADD CONSTRAINT "webhook_trigger_logs_triggerId_webhook_triggers_id_fk" FOREIGN KEY ("triggerId") REFERENCES "public"."webhook_triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_triggers" ADD CONSTRAINT "webhook_triggers_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_triggers" ADD CONSTRAINT "webhook_triggers_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_triggers" ADD CONSTRAINT "webhook_triggers_targetConversationId_conversations_id_fk" FOREIGN KEY ("targetConversationId") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_triggers" ADD CONSTRAINT "webhook_triggers_targetAgencyId_agencies_id_fk" FOREIGN KEY ("targetAgencyId") REFERENCES "public"."agencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_triggers" ADD CONSTRAINT "webhook_triggers_targetWorkflowId_workflows_id_fk" FOREIGN KEY ("targetWorkflowId") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_tenant_type_user_unique" ON "channel_connections" USING btree ("tenantId","channelType","externalUserId");--> statement-breakpoint
CREATE INDEX "channel_connections_tenant_type_status_idx" ON "channel_connections" USING btree ("tenantId","channelType","status");--> statement-breakpoint
CREATE INDEX "channel_connections_tenant_user_idx" ON "channel_connections" USING btree ("tenantId","userId");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_credentials_tenant_type_unique" ON "channel_credentials" USING btree ("tenantId","channelType");--> statement-breakpoint
CREATE INDEX "channel_routing_rules_tenant_active_priority_idx" ON "channel_routing_rules" USING btree ("tenantId","isActive","priority");--> statement-breakpoint
CREATE INDEX "chat_widgets_tenant_active_idx" ON "chat_widgets" USING btree ("tenantId","isActive");--> statement-breakpoint
CREATE INDEX "conversation_artifacts_conversation_idx" ON "conversation_artifacts" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "conversation_artifacts_message_idx" ON "conversation_artifacts" USING btree ("messageId");--> statement-breakpoint
CREATE INDEX "persona_templates_tenant_scope_idx" ON "persona_templates" USING btree ("tenantId","scope");--> statement-breakpoint
CREATE INDEX "persona_templates_user_idx" ON "persona_templates" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "webhook_trigger_logs_trigger_created_idx" ON "webhook_trigger_logs" USING btree ("triggerId","createdAt");--> statement-breakpoint
CREATE INDEX "webhook_triggers_tenant_active_idx" ON "webhook_triggers" USING btree ("tenantId","isActive");--> statement-breakpoint
-- skills FK already exists from 0053
CREATE INDEX "idx_conversations_tenant" ON "conversations" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "idx_messages_traceid" ON "messages" USING btree ("traceId");