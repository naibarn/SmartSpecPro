CREATE TABLE "social_automation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"pageId" integer,
	"name" varchar(255) NOT NULL,
	"isEnabled" boolean DEFAULT false NOT NULL,
	"triggerType" varchar(50) NOT NULL,
	"conditions" json,
	"actionMode" varchar(20) DEFAULT 'draft_only' NOT NULL,
	"policyConfig" json,
	"createdByUserId" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_comment_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"commentId" integer NOT NULL,
	"actionType" varchar(20) NOT NULL,
	"performedByUserId" integer,
	"performedBySystem" boolean DEFAULT false NOT NULL,
	"providerResult" json,
	"status" varchar(20) DEFAULT 'completed' NOT NULL,
	"errorMessage" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"pageId" integer NOT NULL,
	"providerCommentId" varchar(255),
	"providerObjectId" varchar(255),
	"parentCommentId" integer,
	"authorExternalId" varchar(255),
	"authorDisplayName" varchar(500),
	"body" text,
	"status" varchar(20) DEFAULT 'visible' NOT NULL,
	"lastAction" varchar(20),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"pageId" integer NOT NULL,
	"providerConversationId" varchar(255),
	"channelType" varchar(50) DEFAULT 'messenger' NOT NULL,
	"customerExternalId" varchar(255) NOT NULL,
	"customerDisplayName" varchar(500),
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"assignedToUserId" integer,
	"priority" integer DEFAULT 0 NOT NULL,
	"lastMessageAt" timestamp with time zone,
	"lastInboundAt" timestamp with time zone,
	"lastOutboundAt" timestamp with time zone,
	"unreadCount" integer DEFAULT 0 NOT NULL,
	"labels" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_human_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"pageId" integer NOT NULL,
	"entityType" varchar(50) NOT NULL,
	"entityId" integer NOT NULL,
	"proposedContent" text,
	"confidence" double precision,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"requestedBySystem" boolean DEFAULT true NOT NULL,
	"reviewedByUserId" integer,
	"decisionNote" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"conversationId" integer NOT NULL,
	"pageId" integer NOT NULL,
	"providerMessageId" varchar(255),
	"direction" varchar(10) NOT NULL,
	"senderType" varchar(20) NOT NULL,
	"senderExternalId" varchar(255),
	"senderUserId" integer,
	"messageType" varchar(30) DEFAULT 'text' NOT NULL,
	"body" text,
	"payload" json,
	"deliveryStatus" varchar(20) DEFAULT 'sent' NOT NULL,
	"errorMessage" text,
	"sentAt" timestamp with time zone,
	"receivedAt" timestamp with time zone,
	"workflowTriggerStatus" varchar(20),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"connectionId" integer NOT NULL,
	"providerPageId" varchar(255) NOT NULL,
	"pageName" varchar(500),
	"pageCategory" varchar(255),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"encryptedPageAccessToken" text,
	"tokenExpiresAt" timestamp with time zone,
	"selectedForInbox" boolean DEFAULT true NOT NULL,
	"selectedForPublishing" boolean DEFAULT true NOT NULL,
	"selectedForModeration" boolean DEFAULT false NOT NULL,
	"aiActionMode" varchar(20) DEFAULT 'draft_only' NOT NULL,
	"autoSendConfidenceThreshold" double precision DEFAULT 0.95 NOT NULL,
	"metadata" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"pageId" integer NOT NULL,
	"providerPostId" varchar(255),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"contentText" text,
	"contentLink" text,
	"mediaRefs" json,
	"scheduledAt" timestamp with time zone,
	"publishedAt" timestamp with time zone,
	"createdByUserId" integer,
	"approvedByUserId" integer,
	"errorMessage" text,
	"metadata" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_provider_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"provider" varchar(50) NOT NULL,
	"providerUserId" varchar(255),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"grantedScopes" json,
	"encryptedAccessToken" text,
	"encryptedRefreshToken" text,
	"tokenExpiresAt" timestamp with time zone,
	"metadata" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_webhook_events_raw" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36),
	"provider" varchar(50) NOT NULL,
	"pageId" integer,
	"deliveryId" varchar(255) NOT NULL,
	"eventType" varchar(100),
	"payload" json,
	"headers" json,
	"receivedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"processingStatus" varchar(20) DEFAULT 'pending' NOT NULL,
	"errorMessage" text
);
--> statement-breakpoint
CREATE TABLE "social_webhook_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"pageId" integer NOT NULL,
	"subscriptionStatus" varchar(20) DEFAULT 'pending' NOT NULL,
	"subscribedFields" json,
	"lastVerifiedAt" timestamp with time zone,
	"lastDeliveryAt" timestamp with time zone,
	"lastError" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_templates" ADD COLUMN "tenantId" varchar(36);--> statement-breakpoint
ALTER TABLE "agency_templates" ADD COLUMN "createdBy" integer;--> statement-breakpoint
ALTER TABLE "agency_templates" ADD COLUMN "sourceAgencyId" varchar(36);--> statement-breakpoint
ALTER TABLE "agency_templates" ADD COLUMN "status" varchar(20) DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_templates" ADD COLUMN "agentDefinitions" jsonb;--> statement-breakpoint
ALTER TABLE "agency_templates" ADD COLUMN "communicationFlows" jsonb;--> statement-breakpoint
ALTER TABLE "social_automation_rules" ADD CONSTRAINT "social_automation_rules_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_automation_rules" ADD CONSTRAINT "social_automation_rules_pageId_social_pages_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."social_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_automation_rules" ADD CONSTRAINT "social_automation_rules_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comment_actions" ADD CONSTRAINT "social_comment_actions_commentId_social_comments_id_fk" FOREIGN KEY ("commentId") REFERENCES "public"."social_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comment_actions" ADD CONSTRAINT "social_comment_actions_performedByUserId_users_id_fk" FOREIGN KEY ("performedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_pageId_social_pages_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."social_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_parentCommentId_social_comments_id_fk" FOREIGN KEY ("parentCommentId") REFERENCES "public"."social_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_conversations" ADD CONSTRAINT "social_conversations_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_conversations" ADD CONSTRAINT "social_conversations_pageId_social_pages_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."social_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_conversations" ADD CONSTRAINT "social_conversations_assignedToUserId_users_id_fk" FOREIGN KEY ("assignedToUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_human_approvals" ADD CONSTRAINT "social_human_approvals_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_human_approvals" ADD CONSTRAINT "social_human_approvals_pageId_social_pages_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."social_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_human_approvals" ADD CONSTRAINT "social_human_approvals_reviewedByUserId_users_id_fk" FOREIGN KEY ("reviewedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_messages" ADD CONSTRAINT "social_messages_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_messages" ADD CONSTRAINT "social_messages_conversationId_social_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."social_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_messages" ADD CONSTRAINT "social_messages_pageId_social_pages_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."social_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_messages" ADD CONSTRAINT "social_messages_senderUserId_users_id_fk" FOREIGN KEY ("senderUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_pages" ADD CONSTRAINT "social_pages_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_pages" ADD CONSTRAINT "social_pages_connectionId_social_provider_connections_id_fk" FOREIGN KEY ("connectionId") REFERENCES "public"."social_provider_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_pageId_social_pages_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."social_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_approvedByUserId_users_id_fk" FOREIGN KEY ("approvedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_provider_connections" ADD CONSTRAINT "social_provider_connections_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_provider_connections" ADD CONSTRAINT "social_provider_connections_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_webhook_subscriptions" ADD CONSTRAINT "social_webhook_subscriptions_pageId_social_pages_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."social_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_social_automation_rules_tenant" ON "social_automation_rules" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "idx_social_comments_page_created" ON "social_comments" USING btree ("pageId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_social_comments_provider_id" ON "social_comments" USING btree ("providerCommentId");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_social_conversations_page_customer" ON "social_conversations" USING btree ("pageId","customerExternalId");--> statement-breakpoint
CREATE INDEX "idx_social_conversations_tenant_page" ON "social_conversations" USING btree ("tenantId","pageId");--> statement-breakpoint
CREATE INDEX "idx_social_conversations_status_last_msg" ON "social_conversations" USING btree ("status","lastMessageAt");--> statement-breakpoint
CREATE INDEX "idx_social_conversations_tenant_status" ON "social_conversations" USING btree ("tenantId","status");--> statement-breakpoint
CREATE INDEX "idx_social_human_approvals_tenant_status" ON "social_human_approvals" USING btree ("tenantId","status","createdAt");--> statement-breakpoint
CREATE INDEX "idx_social_messages_conversation_created" ON "social_messages" USING btree ("conversationId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_social_messages_provider_msg_id" ON "social_messages" USING btree ("providerMessageId");--> statement-breakpoint
CREATE INDEX "idx_social_pages_tenant" ON "social_pages" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "idx_social_pages_connection" ON "social_pages" USING btree ("connectionId");--> statement-breakpoint
CREATE INDEX "idx_social_posts_tenant_status" ON "social_posts" USING btree ("tenantId","status");--> statement-breakpoint
CREATE INDEX "idx_social_posts_page_scheduled" ON "social_posts" USING btree ("pageId","scheduledAt");--> statement-breakpoint
CREATE INDEX "idx_social_provider_connections_tenant" ON "social_provider_connections" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "idx_social_provider_connections_user" ON "social_provider_connections" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_social_webhook_events_raw_status" ON "social_webhook_events_raw" USING btree ("processingStatus","receivedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_social_webhook_events_raw_provider_delivery" ON "social_webhook_events_raw" USING btree ("provider","deliveryId");--> statement-breakpoint
ALTER TABLE "agency_templates" ADD CONSTRAINT "agency_templates_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_templates" ADD CONSTRAINT "agency_templates_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_templates" ADD CONSTRAINT "agency_templates_sourceAgencyId_agencies_id_fk" FOREIGN KEY ("sourceAgencyId") REFERENCES "public"."agencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_templates_tenant_idx" ON "agency_templates" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "agency_templates_created_by_idx" ON "agency_templates" USING btree ("createdBy");