diff --git a/apps/web/drizzle/0054_claw_enum_extension.sql b/apps/web/drizzle/0054_claw_enum_extension.sql
new file mode 100644
index 0000000..19290c3
--- /dev/null
+++ b/apps/web/drizzle/0054_claw_enum_extension.sql
@@ -0,0 +1,5 @@
+-- ClawFeature: Enum extension (must run outside transaction)
+ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'tts';
+ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'browser_automation';
+ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'widget_chat';
+ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'webhook_chat';
diff --git a/apps/web/drizzle/0054_faithful_midnight.sql b/apps/web/drizzle/0054_faithful_midnight.sql
new file mode 100644
index 0000000..2495659
--- /dev/null
+++ b/apps/web/drizzle/0054_faithful_midnight.sql
@@ -0,0 +1,195 @@
+-- Enum values 'tts', 'browser_automation', 'widget_chat', 'webhook_chat' already added via raw SQL
+CREATE TABLE "channel_connections" (
+	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
+	"tenantId" varchar(36) NOT NULL,
+	"userId" integer NOT NULL,
+	"channelType" text NOT NULL,
+	"externalUserId" text NOT NULL,
+	"externalChatId" text,
+	"connectionConfig" jsonb DEFAULT '{}'::jsonb,
+	"status" text DEFAULT 'pending' NOT NULL,
+	"activeChannelId" varchar(36),
+	"linkedAt" timestamp with time zone DEFAULT now() NOT NULL,
+	"linkedBy" varchar(20),
+	"revokedAt" timestamp with time zone,
+	"revokedBy" varchar(36),
+	CONSTRAINT "channel_connections_type_check" CHECK ("channelType" IN ('telegram','whatsapp','line','slack','discord')),
+	CONSTRAINT "channel_connections_status_check" CHECK ("status" IN ('active','revoked','pending','blocked'))
+);
+--> statement-breakpoint
+CREATE TABLE "channel_credentials" (
+	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
+	"tenantId" varchar(36) NOT NULL,
+	"channelType" text NOT NULL,
+	"credentialsEncrypted" text NOT NULL,
+	"webhookUrl" text,
+	"webhookSecretEncrypted" text,
+	"isActive" boolean DEFAULT true,
+	"metadata" jsonb,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
+	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
+	CONSTRAINT "channel_credentials_type_check" CHECK ("channelType" IN ('telegram','whatsapp','line','slack','discord'))
+);
+--> statement-breakpoint
+CREATE TABLE "channel_routing_rules" (
+	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
+	"tenantId" varchar(36) NOT NULL,
+	"name" text NOT NULL,
+	"description" text,
+	"priority" integer DEFAULT 50,
+	"isActive" boolean DEFAULT true,
+	"conditions" jsonb NOT NULL,
+	"targetType" text NOT NULL,
+	"targetAgencyId" varchar(36),
+	"targetPersonaId" varchar(36),
+	"targetWorkflowId" integer,
+	"totalMatches" integer DEFAULT 0,
+	"lastMatchedAt" timestamp with time zone,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
+	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
+	CONSTRAINT "channel_routing_rules_target_type_check" CHECK ("targetType" IN ('agency','chat','workflow'))
+);
+--> statement-breakpoint
+CREATE TABLE "chat_widgets" (
+	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
+	"tenantId" varchar(36) NOT NULL,
+	"name" text NOT NULL,
+	"targetType" text,
+	"targetAgencyId" varchar(36),
+	"defaultPersonaId" varchar(36),
+	"theme" jsonb,
+	"allowedOrigins" text[] DEFAULT '{}',
+	"rateLimitPerMinute" integer DEFAULT 10,
+	"maxConversationLength" integer DEFAULT 100,
+	"requireEmail" boolean DEFAULT false,
+	"creditSource" text,
+	"monthlyCreditBudget" integer,
+	"maxCreditsPerVisitorSession" integer DEFAULT 50,
+	"maxCreditsPerVisitorDay" integer DEFAULT 100,
+	"isActive" boolean DEFAULT true,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
+	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
+	CONSTRAINT "chat_widgets_target_type_check" CHECK ("targetType" IN ('chat','agency') OR "targetType" IS NULL),
+	CONSTRAINT "chat_widgets_credit_source_check" CHECK ("creditSource" IN ('tenant','visitor') OR "creditSource" IS NULL)
+);
+--> statement-breakpoint
+CREATE TABLE "conversation_artifacts" (
+	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
+	"conversationId" integer NOT NULL,
+	"messageId" integer NOT NULL,
+	"artifactType" text NOT NULL,
+	"title" text,
+	"content" text NOT NULL,
+	"language" text,
+	"version" integer DEFAULT 1,
+	"parentArtifactId" varchar(36),
+	"metadata" jsonb,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
+	CONSTRAINT "conversation_artifacts_type_check" CHECK ("artifactType" IN ('code','react','chart','table','mermaid','html','markdown','svg'))
+);
+--> statement-breakpoint
+CREATE TABLE "persona_templates" (
+	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
+	"tenantId" varchar(36),
+	"userId" integer,
+	"name" text NOT NULL,
+	"description" text,
+	"systemPromptPrefix" text NOT NULL,
+	"tone" text,
+	"language" text DEFAULT 'auto',
+	"responseStyle" jsonb DEFAULT '{}'::jsonb,
+	"restrictions" text[] DEFAULT '{}',
+	"scope" text NOT NULL,
+	"isDefault" boolean DEFAULT false,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
+	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
+	CONSTRAINT "persona_templates_tone_check" CHECK ("tone" IN ('formal','casual','friendly','technical','creative') OR "tone" IS NULL),
+	CONSTRAINT "persona_templates_scope_check" CHECK ("scope" IN ('platform','tenant','user'))
+);
+--> statement-breakpoint
+CREATE TABLE "webhook_trigger_logs" (
+	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
+	"triggerId" varchar(36) NOT NULL,
+	"requestMethod" text,
+	"requestHeadersSafe" jsonb,
+	"requestBodyHash" varchar(64),
+	"requestBodySize" integer,
+	"extractedVariables" jsonb,
+	"sourceIpMasked" text,
+	"status" text NOT NULL,
+	"targetExecutionId" text,
+	"creditsConsumed" numeric(12, 4) DEFAULT '0',
+	"errorMessage" text,
+	"processingTimeMs" integer,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
+	CONSTRAINT "webhook_trigger_logs_status_check" CHECK ("status" IN ('success','auth_failed','rate_limited','target_error','credit_insufficient'))
+);
+--> statement-breakpoint
+CREATE TABLE "webhook_triggers" (
+	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
+	"tenantId" varchar(36) NOT NULL,
+	"userId" integer NOT NULL,
+	"name" text NOT NULL,
+	"description" text,
+	"authType" text DEFAULT 'token' NOT NULL,
+	"authSecretEncrypted" text NOT NULL,
+	"targetType" text NOT NULL,
+	"targetConversationId" integer,
+	"targetAgencyId" varchar(36),
+	"targetWorkflowId" integer,
+	"payloadTemplate" jsonb DEFAULT '{}'::jsonb,
+	"rateLimitPerMinute" integer DEFAULT 10,
+	"monthlyTriggerBudget" integer,
+	"isActive" boolean DEFAULT true,
+	"totalTriggers" integer DEFAULT 0,
+	"lastTriggeredAt" timestamp with time zone,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
+	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
+	CONSTRAINT "webhook_triggers_auth_type_check" CHECK ("authType" IN ('token','hmac_sha256')),
+	CONSTRAINT "webhook_triggers_target_type_check" CHECK ("targetType" IN ('chat','agency','workflow'))
+);
+--> statement-breakpoint
+ALTER TABLE "conversations" ADD COLUMN "tenantId" varchar(36);--> statement-breakpoint
+ALTER TABLE "conversations" ADD COLUMN "personaId" varchar(36);--> statement-breakpoint
+ALTER TABLE "messages" ADD COLUMN "traceId" varchar(32);--> statement-breakpoint
+-- skills columns llmModelId, preferredProviderId, strictProviderPin already exist from 0053
+ALTER TABLE "tenants" ADD COLUMN "defaultPersonaId" varchar(36);--> statement-breakpoint
+ALTER TABLE "tenants" ADD COLUMN "featureFlags" json;--> statement-breakpoint
+ALTER TABLE "users" ADD COLUMN "defaultPersonaId" varchar(36);--> statement-breakpoint
+ALTER TABLE "users" ADD COLUMN "voiceConsentGrantedAt" timestamp with time zone;--> statement-breakpoint
+ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "channel_credentials" ADD CONSTRAINT "channel_credentials_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "channel_routing_rules" ADD CONSTRAINT "channel_routing_rules_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "channel_routing_rules" ADD CONSTRAINT "channel_routing_rules_targetAgencyId_agencies_id_fk" FOREIGN KEY ("targetAgencyId") REFERENCES "public"."agencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "channel_routing_rules" ADD CONSTRAINT "channel_routing_rules_targetPersonaId_persona_templates_id_fk" FOREIGN KEY ("targetPersonaId") REFERENCES "public"."persona_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "channel_routing_rules" ADD CONSTRAINT "channel_routing_rules_targetWorkflowId_workflows_id_fk" FOREIGN KEY ("targetWorkflowId") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "chat_widgets" ADD CONSTRAINT "chat_widgets_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "chat_widgets" ADD CONSTRAINT "chat_widgets_targetAgencyId_agencies_id_fk" FOREIGN KEY ("targetAgencyId") REFERENCES "public"."agencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "chat_widgets" ADD CONSTRAINT "chat_widgets_defaultPersonaId_persona_templates_id_fk" FOREIGN KEY ("defaultPersonaId") REFERENCES "public"."persona_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "conversation_artifacts" ADD CONSTRAINT "conversation_artifacts_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "conversation_artifacts" ADD CONSTRAINT "conversation_artifacts_messageId_messages_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "conversation_artifacts" ADD CONSTRAINT "conversation_artifacts_parentArtifactId_conversation_artifacts_id_fk" FOREIGN KEY ("parentArtifactId") REFERENCES "public"."conversation_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "persona_templates" ADD CONSTRAINT "persona_templates_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "persona_templates" ADD CONSTRAINT "persona_templates_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "webhook_trigger_logs" ADD CONSTRAINT "webhook_trigger_logs_triggerId_webhook_triggers_id_fk" FOREIGN KEY ("triggerId") REFERENCES "public"."webhook_triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "webhook_triggers" ADD CONSTRAINT "webhook_triggers_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "webhook_triggers" ADD CONSTRAINT "webhook_triggers_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "webhook_triggers" ADD CONSTRAINT "webhook_triggers_targetConversationId_conversations_id_fk" FOREIGN KEY ("targetConversationId") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "webhook_triggers" ADD CONSTRAINT "webhook_triggers_targetAgencyId_agencies_id_fk" FOREIGN KEY ("targetAgencyId") REFERENCES "public"."agencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "webhook_triggers" ADD CONSTRAINT "webhook_triggers_targetWorkflowId_workflows_id_fk" FOREIGN KEY ("targetWorkflowId") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
+CREATE UNIQUE INDEX "channel_connections_tenant_type_user_unique" ON "channel_connections" USING btree ("tenantId","channelType","externalUserId");--> statement-breakpoint
+CREATE INDEX "channel_connections_tenant_type_status_idx" ON "channel_connections" USING btree ("tenantId","channelType","status");--> statement-breakpoint
+CREATE INDEX "channel_connections_tenant_user_idx" ON "channel_connections" USING btree ("tenantId","userId");--> statement-breakpoint
+CREATE UNIQUE INDEX "channel_credentials_tenant_type_unique" ON "channel_credentials" USING btree ("tenantId","channelType");--> statement-breakpoint
+CREATE INDEX "channel_routing_rules_tenant_active_priority_idx" ON "channel_routing_rules" USING btree ("tenantId","isActive","priority");--> statement-breakpoint
+CREATE INDEX "chat_widgets_tenant_active_idx" ON "chat_widgets" USING btree ("tenantId","isActive");--> statement-breakpoint
+CREATE INDEX "conversation_artifacts_conversation_idx" ON "conversation_artifacts" USING btree ("conversationId");--> statement-breakpoint
+CREATE INDEX "conversation_artifacts_message_idx" ON "conversation_artifacts" USING btree ("messageId");--> statement-breakpoint
+CREATE INDEX "persona_templates_tenant_scope_idx" ON "persona_templates" USING btree ("tenantId","scope");--> statement-breakpoint
+CREATE INDEX "persona_templates_user_idx" ON "persona_templates" USING btree ("userId");--> statement-breakpoint
+CREATE INDEX "webhook_trigger_logs_trigger_created_idx" ON "webhook_trigger_logs" USING btree ("triggerId","createdAt");--> statement-breakpoint
+CREATE INDEX "webhook_triggers_tenant_active_idx" ON "webhook_triggers" USING btree ("tenantId","isActive");--> statement-breakpoint
+-- skills FK already exists from 0053
+CREATE INDEX "idx_conversations_tenant" ON "conversations" USING btree ("tenantId");--> statement-breakpoint
+CREATE INDEX "idx_messages_traceid" ON "messages" USING btree ("traceId");
\ No newline at end of file
diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index 2caa00a..2f0b6d3 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -44,6 +44,7 @@ export const templateStatusEnum = pgEnum("template_status", [
   "pending_review",
   "published",
   "archived",
+  "rejected",
 ]);
 
 // Skill visibility enum
@@ -111,6 +112,11 @@ export const creditSourceTypeEnum = pgEnum("credit_source_type", [
   "agency",
   "creator_revenue",
   "other",
+  // ClawFeature additions
+  "tts",
+  "browser_automation",
+  "widget_chat",
+  "webhook_chat",
 ]);
 
 // Settlement status for creator revenue sharing
@@ -228,6 +234,12 @@ export const users = pgTable("users", {
   twoFactorSecret: text("twoFactorSecret"), // encrypted TOTP secret (base32)
   recoveryCodes: json("recoveryCodes").$type<string[]>().default([]), // bcrypt-hashed one-time codes
 
+  /** Default AI persona for this user */
+  defaultPersonaId: varchar("defaultPersonaId", { length: 36 }),
+
+  /** PDPA/GDPR voice consent: NULL = not consented, timestamp = when consent was given */
+  voiceConsentGrantedAt: timestamp("voiceConsentGrantedAt", { withTimezone: true }),
+
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
   updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
   lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
@@ -787,6 +799,12 @@ export const tenants = pgTable("tenants", {
   /** Owner/Admin user ID */
   ownerId: integer("ownerId").references((): AnyPgColumn => users.id),
 
+  /** Default AI persona for this tenant */
+  defaultPersonaId: varchar("defaultPersonaId", { length: 36 }),
+
+  /** Feature flags for this tenant */
+  featureFlags: json("featureFlags").$type<Record<string, boolean>>(),
+
   /** Tenant status (from Python backend) */
   status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
 
@@ -1172,9 +1190,17 @@ export const conversations = pgTable("conversations", {
   /** Default policy for attaching external channels to this conversation */
   defaultChannelPolicy: varchar("defaultChannelPolicy", { length: 20 }).default("allow_attach"),
 
+  /** Tenant this conversation belongs to (for multi-tenant isolation) */
+  tenantId: varchar("tenantId", { length: 36 }),
+
+  /** AI persona used for this conversation */
+  personaId: varchar("personaId", { length: 36 }),
+
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
   updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
-});
+}, (t) => [
+  index("idx_conversations_tenant").on(t.tenantId),
+]);
 
 export type Conversation = typeof conversations.$inferSelect;
 export type InsertConversation = typeof conversations.$inferInsert;
@@ -1252,9 +1278,13 @@ export const messages = pgTable("messages", {
   /** External platform message ID (e.g., Telegram message_id) */
   externalSourceId: varchar("externalSourceId", { length: 64 }),
 
+  /** Trace ID for cost correlation with providerUsageLog */
+  traceId: varchar("traceId", { length: 32 }),
+
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
 }, (t) => [
   index("messages_created_at_idx").on(t.createdAt),
+  index("idx_messages_traceid").on(t.traceId),
 ]);
 
 export type Message = typeof messages.$inferSelect;
@@ -1711,6 +1741,8 @@ export const libraryContentVersions = pgTable("library_content_versions", {
   contentType: varchar("content_type", { length: 32 }).notNull().default("markdown_source"),
   contentSizeBytes: integer("content_size_bytes").notNull(),
   changeDescription: text("change_description"),
+  // S3/storage key of archived file for binary file versions (null for markdown versions)
+  snapshotObjectKey: varchar("snapshot_object_key", { length: 512 }),
   createdByUserId: integer("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
   createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 }, (t) => [
@@ -2280,6 +2312,15 @@ export const skills = pgTable("skills", {
   /** Default model for this skill */
   defaultModel: varchar("defaultModel", { length: 128 }),
 
+  /** Canonical routed LLM model id for text-generation skills */
+  llmModelId: varchar("llmModelId", { length: 128 }),
+
+  /** Preferred provider pin for this skill (optional) */
+  preferredProviderId: integer("preferredProviderId").references(() => llmProviders.id),
+
+  /** Enforce provider pin without fallback when true */
+  strictProviderPin: boolean("strictProviderPin").default(false).notNull(),
+
   /** Execution mode: llm-only (text response), media-generate (LLM→prompt→media API) */
   executionMode: varchar("executionMode", { length: 50 }).default("llm-only").notNull(),
 
@@ -2342,6 +2383,9 @@ export const skills = pgTable("skills", {
   /** Reason for rejection (if visibility = 'rejected') */
   rejectionReason: text("rejectionReason"),
 
+  /** When an admin set this skill to pending_approval (for admin review queue ordering) */
+  requestedPublishAt: timestamp("requestedPublishAt", { withTimezone: true }),
+
   /** Sandbox profile slug for skills that require sandbox execution */
   sandboxProfileSlug: varchar("sandboxProfileSlug", { length: 64 }),
   /** Whether this skill needs network access in sandbox */
@@ -3176,6 +3220,15 @@ export const workflowTemplates = pgTable("workflow_templates", {
    */
   templateKey: varchar("templateKey", { length: 50 }).unique(),
 
+  /** When the creator requested gallery publishing */
+  requestedPublishAt: timestamp("requestedPublishAt", { withTimezone: true }),
+  /** Admin who approved/rejected the publish request */
+  approvedBy: integer("approvedBy").references(() => users.id, { onDelete: "set null" }),
+  /** When admin approved the publish request */
+  approvedAt: timestamp("approvedAt", { withTimezone: true }),
+  /** Reason for rejection (shown to creator) */
+  rejectionReason: text("rejectionReason"),
+
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
   updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
 }, (t) => [
@@ -3936,11 +3989,25 @@ export const agencies = pgTable("agencies", {
   creatorFeeCredits: integer("creatorFeeCredits").default(0).notNull(),
   /** Platform share percentage of creator fee (default 20% — creator gets 80%) */
   platformSharePct: integer("platformSharePct").default(20).notNull(),
+  /** Default LLM model for new agents & fallback when agent model is unset */
+  defaultModel: varchar("defaultModel", { length: 100 }),
   maxAgents: integer("maxAgents").default(10),
   maxRunTimeSeconds: integer("maxRunTimeSeconds").default(600),
   status: varchar("status", { length: 20 }).default("draft").notNull(),
   isFallbackSafe: boolean("isFallbackSafe").default(false).notNull(),
   isPublished: boolean("isPublished").default(false).notNull(),
+  /** Visibility: private (owner only), shared (specific groups), public (all tenant users) */
+  visibility: varchar("visibility", { length: 20 }).default("private").notNull(),
+  /** Pre-generated SVG topology diagram for marketplace preview */
+  previewSvg: text("previewSvg"),
+  /** When the creator requested public publishing */
+  requestedPublishAt: timestamp("requestedPublishAt", { withTimezone: true }),
+  /** Admin who approved/rejected the publish request */
+  approvedBy: integer("approvedBy").references(() => users.id, { onDelete: "set null" }),
+  /** When admin approved the publish request */
+  approvedAt: timestamp("approvedAt", { withTimezone: true }),
+  /** Reason for rejection (shown to creator) */
+  rejectionReason: text("rejectionReason"),
   createdBy: integer("createdBy").references(() => users.id, { onDelete: "set null" }),
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
   updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
@@ -3953,6 +4020,28 @@ export const agencies = pgTable("agencies", {
 export type Agency = typeof agencies.$inferSelect;
 export type InsertAgency = typeof agencies.$inferInsert;
 
+/**
+ * Agency Permissions — controls which groups can access a shared agency.
+ * Mirrors the skillPermissions pattern.
+ */
+export const agencyPermissions = pgTable("agency_permissions", {
+  id: serial("id").primaryKey(),
+  agencyId: varchar("agencyId", { length: 36 }).notNull()
+    .references(() => agencies.id, { onDelete: "cascade" }),
+  groupId: integer("groupId").notNull()
+    .references(() => userGroups.id, { onDelete: "cascade" }),
+  grantedByUserId: integer("grantedByUserId")
+    .references(() => users.id, { onDelete: "set null" }),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  uniqueIndex("agency_permissions_unique").on(t.agencyId, t.groupId),
+  index("agency_permissions_group_idx").on(t.groupId),
+  index("agency_permissions_agency_idx").on(t.agencyId),
+]);
+
+export type AgencyPermission = typeof agencyPermissions.$inferSelect;
+export type InsertAgencyPermission = typeof agencyPermissions.$inferInsert;
+
 /**
  * Agency Agents -- Individual AI agents within an agency.
  * Each agent has its own model, instructions, and tool set.
@@ -3972,6 +4061,45 @@ export const agencyAgents = pgTable("agency_agents", {
   isEntryPoint: boolean("isEntryPoint").default(false).notNull(),
   isOptional: boolean("isOptional").default(false).notNull(),
   position: json("position").$type<{ x: number; y: number }>(),
+  nodeType: varchar("nodeType", { length: 30 }).default("agent").notNull(),
+  nodeConfig: json("nodeConfig").$type<{
+    // supervisor
+    maxRounds?: number;
+    routingStrategy?: "llm" | "round_robin" | "broadcast";
+    // router
+    routingMode?: "keyword" | "regex" | "llm_classify";
+    routes?: Array<{ condition: string; targetNodeId: string; label?: string }>;
+    defaultTargetNodeId?: string;
+    // aggregator
+    aggregationMode?: "first_wins" | "majority_vote" | "llm_merge" | "concatenate";
+    minResponses?: number;
+    mergeInstructions?: string;
+    // knowledge_base (node-level)
+    collectionId?: string;
+    topK?: number;
+    searchMode?: "hybrid" | "vector" | "keyword";
+    scoreThreshold?: number;
+    outputFormat?: "formatted_context" | "documents_array" | "first_only";
+    // agent/supervisor — attached knowledge base documents
+    knowledgeBase?: {
+      documentIds?: string[];
+      searchMode?: "hybrid" | "vector" | "keyword";
+      topK?: number;
+      scoreThreshold?: number;
+      maxContextTokens?: number;
+    };
+    // skill_call
+    skillId?: string;
+    skillSlug?: string;
+    inputMapping?: Record<string, string>;
+    passInputThrough?: boolean;
+    // human_approval
+    approvalMessage?: string;
+    approvers?: string[];
+    timeoutHours?: number;
+    onTimeout?: "auto_approve" | "auto_reject" | "escalate";
+    requireAllApprovers?: boolean;
+  }>(),
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
   updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
 }, (t) => [
@@ -4056,7 +4184,28 @@ export type InsertAgencyTool = typeof agencyTools.$inferInsert;
 export const agencyAgentTools = pgTable("agency_agent_tools", {
   id: varchar("id", { length: 36 }).primaryKey(),
   agentId: varchar("agentId", { length: 36 }).notNull().references(() => agencyAgents.id, { onDelete: "cascade" }),
-  toolId: varchar("toolId", { length: 36 }).notNull().references(() => agencyTools.id, { onDelete: "cascade" }),
+  toolId: varchar("toolId", { length: 100 }).notNull(),
+  toolConfig: json("toolConfig").$type<{
+    // rag
+    collectionId?: string;
+    topK?: number;
+    // skill_executor
+    skillId?: string;
+    skillSlug?: string;
+    // http
+    url?: string;
+    method?: string;
+    headers?: Record<string, string>;
+    // email
+    toTemplate?: string;
+    subjectTemplate?: string;
+    // webhook
+    webhookUrl?: string;
+    // slack
+    channelId?: string;
+    // document search
+    collectionIds?: string[];
+  }>(),
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
 }, (t) => [
   uniqueIndex("agency_agent_tools_agent_tool_idx").on(t.agentId, t.toolId),
@@ -4105,6 +4254,28 @@ export const agencyConversations = pgTable("agency_conversations", {
 export type AgencyConversation = typeof agencyConversations.$inferSelect;
 export type InsertAgencyConversation = typeof agencyConversations.$inferInsert;
 
+/**
+ * Agency Versions -- Immutable snapshots of an agency graph for version history.
+ * Max 50 versions per agency (oldest pruned on insert).
+ */
+export const agencyVersions = pgTable("agency_versions", {
+  id: serial("id").primaryKey(),
+  agencyId: varchar("agencyId", { length: 36 }).notNull().references(() => agencies.id, { onDelete: "cascade" }),
+  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),
+  versionNumber: integer("versionNumber").notNull(),
+  snapshotJson: json("snapshotJson").$type<{ nodes: unknown[]; edges: unknown[]; name: string }>().notNull(),
+  contentHash: varchar("contentHash", { length: 64 }).notNull(),
+  changeDescription: text("changeDescription"),
+  createdByUserId: integer("createdByUserId").notNull().references(() => users.id),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  uniqueIndex("av_agency_version_unique").on(t.agencyId, t.versionNumber),
+  index("av_agency_created_idx").on(t.agencyId, t.createdAt),
+]);
+
+export type AgencyVersion = typeof agencyVersions.$inferSelect;
+export type InsertAgencyVersion = typeof agencyVersions.$inferInsert;
+
 // ─── Chat Bridge Tables ─────────────────────────────────────────────────────
 
 /**
@@ -4331,3 +4502,244 @@ export const creatorSettlements = pgTable("creator_settlements", {
 
 export type CreatorSettlement = typeof creatorSettlements.$inferSelect;
 export type InsertCreatorSettlement = typeof creatorSettlements.$inferInsert;
+
+// ==========================================
+// ClawFeature: Persona Templates
+// ==========================================
+
+/**
+ * Persona Templates -- AI persona definitions for customizing chat behavior.
+ * Scope hierarchy: platform > tenant > user (4-level resolution chain).
+ */
+export const personaTemplates = pgTable("persona_templates", {
+  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
+  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),
+  userId: integer("userId").references(() => users.id, { onDelete: "cascade" }),
+  name: text("name").notNull(),
+  description: text("description"),
+  systemPromptPrefix: text("systemPromptPrefix").notNull(),
+  tone: text("tone"),
+  language: text("language").default("auto"),
+  responseStyle: jsonb("responseStyle").default({}),
+  restrictions: text("restrictions").array().default(sql`'{}'`),
+  scope: text("scope").notNull(),
+  isDefault: boolean("isDefault").default(false),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  index("persona_templates_tenant_scope_idx").on(t.tenantId, t.scope),
+  index("persona_templates_user_idx").on(t.userId),
+  check("persona_templates_tone_check", sql`"tone" IN ('formal','casual','friendly','technical','creative') OR "tone" IS NULL`),
+  check("persona_templates_scope_check", sql`"scope" IN ('platform','tenant','user')`),
+]);
+
+export type PersonaTemplate = typeof personaTemplates.$inferSelect;
+export type InsertPersonaTemplate = typeof personaTemplates.$inferInsert;
+
+// ==========================================
+// ClawFeature: Channel Infrastructure
+// ==========================================
+
+/**
+ * Channel Connections -- Generalizes telegramConnections to support
+ * multiple channel types (Telegram, WhatsApp, LINE, Slack, Discord).
+ */
+export const channelConnections = pgTable("channel_connections", {
+  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
+  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
+  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
+  channelType: text("channelType").notNull(),
+  externalUserId: text("externalUserId").notNull(),
+  externalChatId: text("externalChatId"),
+  connectionConfig: jsonb("connectionConfig").default({}),
+  status: text("status").notNull().default("pending"),
+  activeChannelId: varchar("activeChannelId", { length: 36 }),
+  linkedAt: timestamp("linkedAt", { withTimezone: true }).defaultNow().notNull(),
+  linkedBy: varchar("linkedBy", { length: 20 }),
+  revokedAt: timestamp("revokedAt", { withTimezone: true }),
+  revokedBy: varchar("revokedBy", { length: 36 }),
+}, (t) => [
+  uniqueIndex("channel_connections_tenant_type_user_unique").on(t.tenantId, t.channelType, t.externalUserId),
+  index("channel_connections_tenant_type_status_idx").on(t.tenantId, t.channelType, t.status),
+  index("channel_connections_tenant_user_idx").on(t.tenantId, t.userId),
+  check("channel_connections_type_check", sql`"channelType" IN ('telegram','whatsapp','line','slack','discord')`),
+  check("channel_connections_status_check", sql`"status" IN ('active','revoked','pending','blocked')`),
+]);
+
+export type ChannelConnection = typeof channelConnections.$inferSelect;
+export type InsertChannelConnection = typeof channelConnections.$inferInsert;
+
+/**
+ * Channel Credentials -- Admin-configured per-tenant channel secrets
+ * (bot tokens, API keys, webhook secrets). Encrypted via crypto.ts.
+ */
+export const channelCredentials = pgTable("channel_credentials", {
+  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
+  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
+  channelType: text("channelType").notNull(),
+  credentialsEncrypted: text("credentialsEncrypted").notNull(),
+  webhookUrl: text("webhookUrl"),
+  webhookSecretEncrypted: text("webhookSecretEncrypted"),
+  isActive: boolean("isActive").default(true),
+  metadata: jsonb("metadata"),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  uniqueIndex("channel_credentials_tenant_type_unique").on(t.tenantId, t.channelType),
+  check("channel_credentials_type_check", sql`"channelType" IN ('telegram','whatsapp','line','slack','discord')`),
+]);
+
+export type ChannelCredential = typeof channelCredentials.$inferSelect;
+export type InsertChannelCredential = typeof channelCredentials.$inferInsert;
+
+// ==========================================
+// ClawFeature: Chat Widget & Artifacts
+// ==========================================
+
+/**
+ * Chat Widgets -- Embeddable chat widget configurations per tenant.
+ */
+export const chatWidgets = pgTable("chat_widgets", {
+  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
+  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
+  name: text("name").notNull(),
+  targetType: text("targetType"),
+  targetAgencyId: varchar("targetAgencyId", { length: 36 }).references(() => agencies.id, { onDelete: "set null" }),
+  defaultPersonaId: varchar("defaultPersonaId", { length: 36 }).references(() => personaTemplates.id, { onDelete: "set null" }),
+  theme: jsonb("theme"),
+  allowedOrigins: text("allowedOrigins").array().default(sql`'{}'`),
+  rateLimitPerMinute: integer("rateLimitPerMinute").default(10),
+  maxConversationLength: integer("maxConversationLength").default(100),
+  requireEmail: boolean("requireEmail").default(false),
+  creditSource: text("creditSource"),
+  monthlyCreditBudget: integer("monthlyCreditBudget"),
+  maxCreditsPerVisitorSession: integer("maxCreditsPerVisitorSession").default(50),
+  maxCreditsPerVisitorDay: integer("maxCreditsPerVisitorDay").default(100),
+  isActive: boolean("isActive").default(true),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  index("chat_widgets_tenant_active_idx").on(t.tenantId, t.isActive),
+  check("chat_widgets_target_type_check", sql`"targetType" IN ('chat','agency') OR "targetType" IS NULL`),
+  check("chat_widgets_credit_source_check", sql`"creditSource" IN ('tenant','visitor') OR "creditSource" IS NULL`),
+]);
+
+export type ChatWidget = typeof chatWidgets.$inferSelect;
+export type InsertChatWidget = typeof chatWidgets.$inferInsert;
+
+/**
+ * Conversation Artifacts -- Versioned AI-generated artifacts
+ * (code, charts, tables, React components, HTML) stored per conversation.
+ */
+export const conversationArtifacts = pgTable("conversation_artifacts", {
+  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
+  conversationId: integer("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),
+  messageId: integer("messageId").notNull().references(() => messages.id, { onDelete: "cascade" }),
+  artifactType: text("artifactType").notNull(),
+  title: text("title"),
+  content: text("content").notNull(),
+  language: text("language"),
+  version: integer("version").default(1),
+  parentArtifactId: varchar("parentArtifactId", { length: 36 })
+    .references((): AnyPgColumn => conversationArtifacts.id, { onDelete: "set null" }),
+  metadata: jsonb("metadata"),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  index("conversation_artifacts_conversation_idx").on(t.conversationId),
+  index("conversation_artifacts_message_idx").on(t.messageId),
+  check("conversation_artifacts_type_check", sql`"artifactType" IN ('code','react','chart','table','mermaid','html','markdown','svg')`),
+]);
+
+export type ConversationArtifact = typeof conversationArtifacts.$inferSelect;
+export type InsertConversationArtifact = typeof conversationArtifacts.$inferInsert;
+
+// ==========================================
+// ClawFeature: Webhooks & Routing
+// ==========================================
+
+/**
+ * Webhook Triggers -- Inbound webhook endpoints for external integrations.
+ * Auth secrets are AES-256-GCM encrypted via crypto.ts.
+ */
+export const webhookTriggers = pgTable("webhook_triggers", {
+  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
+  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
+  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
+  name: text("name").notNull(),
+  description: text("description"),
+  authType: text("authType").notNull().default("token"),
+  authSecretEncrypted: text("authSecretEncrypted").notNull(),
+  targetType: text("targetType").notNull(),
+  targetConversationId: integer("targetConversationId").references(() => conversations.id, { onDelete: "set null" }),
+  targetAgencyId: varchar("targetAgencyId", { length: 36 }).references(() => agencies.id, { onDelete: "set null" }),
+  targetWorkflowId: integer("targetWorkflowId").references(() => workflows.id, { onDelete: "set null" }),
+  payloadTemplate: jsonb("payloadTemplate").default({}),
+  rateLimitPerMinute: integer("rateLimitPerMinute").default(10),
+  monthlyTriggerBudget: integer("monthlyTriggerBudget"),
+  isActive: boolean("isActive").default(true),
+  totalTriggers: integer("totalTriggers").default(0),
+  lastTriggeredAt: timestamp("lastTriggeredAt", { withTimezone: true }),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  index("webhook_triggers_tenant_active_idx").on(t.tenantId, t.isActive),
+  check("webhook_triggers_auth_type_check", sql`"authType" IN ('token','hmac_sha256')`),
+  check("webhook_triggers_target_type_check", sql`"targetType" IN ('chat','agency','workflow')`),
+]);
+
+export type WebhookTrigger = typeof webhookTriggers.$inferSelect;
+export type InsertWebhookTrigger = typeof webhookTriggers.$inferInsert;
+
+/**
+ * Webhook Trigger Logs -- Append-heavy log of webhook invocations.
+ */
+export const webhookTriggerLogs = pgTable("webhook_trigger_logs", {
+  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
+  triggerId: varchar("triggerId", { length: 36 }).notNull().references(() => webhookTriggers.id, { onDelete: "cascade" }),
+  requestMethod: text("requestMethod"),
+  requestHeadersSafe: jsonb("requestHeadersSafe"),
+  requestBodyHash: varchar("requestBodyHash", { length: 64 }),
+  requestBodySize: integer("requestBodySize"),
+  extractedVariables: jsonb("extractedVariables"),
+  sourceIpMasked: text("sourceIpMasked"),
+  status: text("status").notNull(),
+  targetExecutionId: text("targetExecutionId"),
+  creditsConsumed: numeric("creditsConsumed", { precision: 12, scale: 4 }).default("0"),
+  errorMessage: text("errorMessage"),
+  processingTimeMs: integer("processingTimeMs"),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  index("webhook_trigger_logs_trigger_created_idx").on(t.triggerId, t.createdAt),
+  check("webhook_trigger_logs_status_check", sql`"status" IN ('success','auth_failed','rate_limited','target_error','credit_insufficient')`),
+]);
+
+export type WebhookTriggerLog = typeof webhookTriggerLogs.$inferSelect;
+export type InsertWebhookTriggerLog = typeof webhookTriggerLogs.$inferInsert;
+
+/**
+ * Channel Routing Rules -- Priority-ordered rules for routing inbound
+ * channel messages to agencies, conversations, or workflows.
+ */
+export const channelRoutingRules = pgTable("channel_routing_rules", {
+  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
+  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
+  name: text("name").notNull(),
+  description: text("description"),
+  priority: integer("priority").default(50),
+  isActive: boolean("isActive").default(true),
+  conditions: jsonb("conditions").notNull(),
+  targetType: text("targetType").notNull(),
+  targetAgencyId: varchar("targetAgencyId", { length: 36 }).references(() => agencies.id, { onDelete: "set null" }),
+  targetPersonaId: varchar("targetPersonaId", { length: 36 }).references(() => personaTemplates.id, { onDelete: "set null" }),
+  targetWorkflowId: integer("targetWorkflowId").references(() => workflows.id, { onDelete: "set null" }),
+  totalMatches: integer("totalMatches").default(0),
+  lastMatchedAt: timestamp("lastMatchedAt", { withTimezone: true }),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  index("channel_routing_rules_tenant_active_priority_idx").on(t.tenantId, t.isActive, t.priority),
+  check("channel_routing_rules_target_type_check", sql`"targetType" IN ('agency','chat','workflow')`),
+])
+
+export type ChannelRoutingRule = typeof channelRoutingRules.$inferSelect;
+export type InsertChannelRoutingRule = typeof channelRoutingRules.$inferInsert;
diff --git a/apps/web/server/services/__tests__/clawDatabaseMigrations.test.ts b/apps/web/server/services/__tests__/clawDatabaseMigrations.test.ts
new file mode 100644
index 0000000..998ea62
--- /dev/null
+++ b/apps/web/server/services/__tests__/clawDatabaseMigrations.test.ts
@@ -0,0 +1,247 @@
+/**
+ * ClawFeature Database Migration Tests
+ *
+ * Integration tests: require a running PostgreSQL database.
+ * Tests validate that the 0054 migration produces the expected database state.
+ */
+import { describe, it, expect, beforeAll } from "vitest";
+import { drizzle } from "drizzle-orm/postgres-js";
+import postgres from "postgres";
+import { llmProviders } from "../../../drizzle/schema";
+import { sql } from "drizzle-orm";
+import { config } from "dotenv";
+import { resolve } from "path";
+
+// Load .env from apps/web root
+config({ path: resolve(__dirname, "../../../.env") });
+
+type DrizzleDB = ReturnType<typeof drizzle>;
+let dbInstance: DrizzleDB | null = null;
+let pgClient: ReturnType<typeof postgres> | null = null;
+
+beforeAll(async () => {
+  const url = process.env.DATABASE_URL;
+  if (!url) return;
+  pgClient = postgres(url, { max: 2 });
+  dbInstance = drizzle(pgClient);
+});
+
+function requireDb(): DrizzleDB {
+  if (!dbInstance) throw new Error("Database not available - skip integration tests");
+  return dbInstance;
+}
+
+describe("ClawFeature Database Migrations", () => {
+  describe("1.1 Enum Extension", () => {
+    it("should accept new creditSourceType values", async () => {
+      const db = requireDb();
+      const result = await db.execute(
+        sql`SELECT unnest(enum_range(null::credit_source_type)) AS val`
+      );
+      const values = result.map((r: any) => r.val);
+
+      expect(values).toContain("tts");
+      expect(values).toContain("browser_automation");
+      expect(values).toContain("widget_chat");
+      expect(values).toContain("webhook_chat");
+    });
+
+    it("should still accept existing creditSourceType values", async () => {
+      const db = requireDb();
+      const result = await db.execute(
+        sql`SELECT unnest(enum_range(null::credit_source_type)) AS val`
+      );
+      const values = result.map((r: any) => r.val);
+
+      expect(values).toContain("chat");
+      expect(values).toContain("skill");
+      expect(values).toContain("stt");
+      expect(values).toContain("agency");
+    });
+  });
+
+  describe("1.1b Provider Seed Data", () => {
+    it("should have STT/TTS providers seeded", async () => {
+      const db = requireDb();
+      const providers = await db
+        .select({
+          providerName: llmProviders.providerName,
+          displayName: llmProviders.displayName,
+        })
+        .from(llmProviders)
+        .where(
+          sql`"providerName" IN ('groq-whisper-stt','openai-whisper-stt','elevenlabs-tts','openai-tts')`
+        );
+
+      expect(providers).toHaveLength(4);
+      const names = providers.map((p) => p.providerName);
+      expect(names).toContain("groq-whisper-stt");
+      expect(names).toContain("openai-whisper-stt");
+      expect(names).toContain("elevenlabs-tts");
+      expect(names).toContain("openai-tts");
+    });
+  });
+
+  describe("1.2-1.7 New Tables", () => {
+    it("persona_templates table exists with correct CHECK constraints", async () => {
+      const db = requireDb();
+      const validResult = await db.execute(
+        sql`INSERT INTO persona_templates (id, name, "systemPromptPrefix", scope, tone)
+            VALUES ('test-pt-valid', 'Test Persona', 'You are helpful', 'platform', 'formal')
+            RETURNING id`
+      );
+      expect(validResult).toHaveLength(1);
+
+      // Cleanup
+      await db.execute(sql`DELETE FROM persona_templates WHERE id = 'test-pt-valid'`);
+    });
+
+    it("persona_templates rejects invalid tone", async () => {
+      const db = requireDb();
+      await expect(
+        db.execute(
+          sql`INSERT INTO persona_templates (id, name, "systemPromptPrefix", scope, tone)
+              VALUES ('test-pt-bad', 'Test', 'prefix', 'platform', 'angry')`
+        )
+      ).rejects.toThrow();
+    });
+
+    it("persona_templates rejects invalid scope", async () => {
+      const db = requireDb();
+      await expect(
+        db.execute(
+          sql`INSERT INTO persona_templates (id, name, "systemPromptPrefix", scope)
+              VALUES ('test-pt-bad2', 'Test', 'prefix', 'global')`
+        )
+      ).rejects.toThrow();
+    });
+
+    it("channel_connections table exists with correct constraints", async () => {
+      const db = requireDb();
+      const result = await db.execute(sql`SELECT count(*) as cnt FROM channel_connections`);
+      expect(Number((result[0] as any).cnt)).toBe(0);
+    });
+
+    it("channel_connections rejects invalid channelType", async () => {
+      const db = requireDb();
+      await expect(
+        db.execute(
+          sql`INSERT INTO channel_connections (id, "tenantId", "userId", "channelType", "externalUserId")
+              VALUES ('test-cc-bad', 'tenant-ZCSKEM9s', 1, 'invalid_type', 'ext123')`
+        )
+      ).rejects.toThrow();
+    });
+
+    it("channel_credentials table exists", async () => {
+      const db = requireDb();
+      const result = await db.execute(sql`SELECT count(*) as cnt FROM channel_credentials`);
+      expect(Number((result[0] as any).cnt)).toBe(0);
+    });
+
+    it("chat_widgets table exists", async () => {
+      const db = requireDb();
+      const result = await db.execute(sql`SELECT count(*) as cnt FROM chat_widgets`);
+      expect(Number((result[0] as any).cnt)).toBe(0);
+    });
+
+    it("conversation_artifacts table exists with self-referential FK", async () => {
+      const db = requireDb();
+      const result = await db.execute(sql`
+        SELECT column_name FROM information_schema.columns
+        WHERE table_name = 'conversation_artifacts' AND column_name = 'parentArtifactId'
+      `);
+      expect(result).toHaveLength(1);
+    });
+
+    it("webhook_triggers table exists", async () => {
+      const db = requireDb();
+      const result = await db.execute(sql`SELECT count(*) as cnt FROM webhook_triggers`);
+      expect(Number((result[0] as any).cnt)).toBe(0);
+    });
+
+    it("webhook_trigger_logs table exists", async () => {
+      const db = requireDb();
+      const result = await db.execute(sql`SELECT count(*) as cnt FROM webhook_trigger_logs`);
+      expect(Number((result[0] as any).cnt)).toBe(0);
+    });
+
+    it("channel_routing_rules table exists", async () => {
+      const db = requireDb();
+      const result = await db.execute(sql`SELECT count(*) as cnt FROM channel_routing_rules`);
+      expect(Number((result[0] as any).cnt)).toBe(0);
+    });
+  });
+
+  describe("New Columns on Existing Tables", () => {
+    it("conversations should have tenantId column populated", async () => {
+      const db = requireDb();
+      const result = await db.execute(
+        sql`SELECT count(*) as total, count("tenantId") as with_tenant FROM conversations`
+      );
+      const row = result[0] as any;
+      expect(Number(row.with_tenant)).toBe(Number(row.total));
+    });
+
+    it("conversations should have personaId column", async () => {
+      const db = requireDb();
+      const result = await db.execute(sql`
+        SELECT column_name FROM information_schema.columns
+        WHERE table_name = 'conversations' AND column_name = 'personaId'
+      `);
+      expect(result).toHaveLength(1);
+    });
+
+    it("messages should have traceId column", async () => {
+      const db = requireDb();
+      const result = await db.execute(sql`
+        SELECT column_name FROM information_schema.columns
+        WHERE table_name = 'messages' AND column_name = 'traceId'
+      `);
+      expect(result).toHaveLength(1);
+    });
+
+    it("users should have defaultPersonaId and voiceConsentGrantedAt columns", async () => {
+      const db = requireDb();
+      const result = await db.execute(sql`
+        SELECT column_name FROM information_schema.columns
+        WHERE table_name = 'users' AND column_name IN ('defaultPersonaId', 'voiceConsentGrantedAt')
+      `);
+      expect(result).toHaveLength(2);
+    });
+
+    it("tenants should have defaultPersonaId and featureFlags columns", async () => {
+      const db = requireDb();
+      const result = await db.execute(sql`
+        SELECT column_name FROM information_schema.columns
+        WHERE table_name = 'tenants' AND column_name IN ('defaultPersonaId', 'featureFlags')
+      `);
+      expect(result).toHaveLength(2);
+    });
+  });
+
+  describe("Index Verification", () => {
+    it("should have idx_messages_traceid index", async () => {
+      const db = requireDb();
+      const result = await db.execute(
+        sql`SELECT indexname FROM pg_indexes WHERE tablename = 'messages' AND indexname = 'idx_messages_traceid'`
+      );
+      expect(result).toHaveLength(1);
+    });
+
+    it("should have idx_conversations_tenant index", async () => {
+      const db = requireDb();
+      const result = await db.execute(
+        sql`SELECT indexname FROM pg_indexes WHERE tablename = 'conversations' AND indexname = 'idx_conversations_tenant'`
+      );
+      expect(result).toHaveLength(1);
+    });
+
+    it("should have persona_templates indexes", async () => {
+      const db = requireDb();
+      const result = await db.execute(
+        sql`SELECT indexname FROM pg_indexes WHERE tablename = 'persona_templates'`
+      );
+      expect(result.length).toBeGreaterThanOrEqual(2);
+    });
+  });
+});
diff --git a/apps/web/server/services/creditService.ts b/apps/web/server/services/creditService.ts
index f815ad3..2933dc9 100644
--- a/apps/web/server/services/creditService.ts
+++ b/apps/web/server/services/creditService.ts
@@ -14,7 +14,8 @@ export type TransactionType = "purchase" | "usage" | "bonus" | "refund" | "adjus
 export type CreditSourceType =
   | "chat" | "skill" | "media_image" | "media_video" | "media_audio"
   | "indexing" | "rag" | "stt" | "translation" | "brainstorm"
-  | "scheduler" | "admin" | "agency" | "creator_revenue" | "other";
+  | "scheduler" | "admin" | "agency" | "creator_revenue" | "other"
+  | "tts" | "browser_automation" | "widget_chat" | "webhook_chat";
 
 export class BudgetExceededError extends Error {
   public readonly monthlyLimit: number;
