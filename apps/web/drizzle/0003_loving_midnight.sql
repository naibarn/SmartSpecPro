CREATE TYPE "public"."follow_status" AS ENUM('active', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('scheduled_message', 'follow_request', 'alert', 'system');--> statement-breakpoint
CREATE TYPE "public"."schedule_status" AS ENUM('active', 'paused', 'completed', 'failed');--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'decision';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'plan';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'architecture';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'component';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'task';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'code_knowledge';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'rule';--> statement-breakpoint
ALTER TYPE "public"."package_type" ADD VALUE 'agency';--> statement-breakpoint
CREATE TABLE "blocked_patterns" (
	"id" serial PRIMARY KEY NOT NULL,
	"patternType" varchar(20) NOT NULL,
	"pattern" varchar(320) NOT NULL,
	"reason" text,
	"createdBy" integer,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"title" varchar(500) NOT NULL,
	"excerpt" text,
	"content" text,
	"coverImage" varchar(1024),
	"author" varchar(255),
	"authorAvatar" varchar(1024),
	"category" varchar(100),
	"tags" json,
	"readTime" varchar(50),
	"isPublished" boolean DEFAULT false NOT NULL,
	"isFeatured" boolean DEFAULT false NOT NULL,
	"metaDescription" text,
	"metaKeywords" varchar(500),
	"publishedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_fingerprints" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"fingerprintHash" varchar(64) NOT NULL,
	"firstSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"seenCount" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "direct_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"senderId" integer NOT NULL,
	"receiverId" integer NOT NULL,
	"content" text NOT NULL,
	"isUrgent" boolean DEFAULT false NOT NULL,
	"isRead" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" integer,
	"companyName" varchar(256),
	"addressLine1" varchar(256),
	"addressLine2" varchar(256),
	"city" varchar(128),
	"state" varchar(128),
	"postalCode" varchar(32),
	"country" varchar(128),
	"taxId" varchar(64),
	"email" varchar(256),
	"phone" varchar(64),
	"website" varchar(256),
	"logoUrl" varchar(512),
	"footerText" text,
	"termsText" text,
	"bankDetails" json,
	"customFields" json,
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"email" varchar(320) NOT NULL,
	"normalizedEmail" varchar(320) NOT NULL,
	"ipAddress" varchar(45) NOT NULL,
	"fingerprintHash" varchar(64),
	"userAgent" text,
	"loginMethod" varchar(64),
	"trustScore" integer,
	"outcome" varchar(20) NOT NULL,
	"metadata" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_message_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"scheduledMessageId" integer NOT NULL,
	"executedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"responseContent" text,
	"creditsUsed" numeric(10, 4) DEFAULT '0',
	"status" varchar(20) DEFAULT 'success' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "scheduled_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"conversationId" integer,
	"targetUserId" integer,
	"prompt" text NOT NULL,
	"cronExpression" varchar(100),
	"timezone" varchar(64) DEFAULT 'Asia/Bangkok' NOT NULL,
	"scheduledAt" timestamp with time zone,
	"isRecurring" boolean DEFAULT false NOT NULL,
	"status" "schedule_status" DEFAULT 'active' NOT NULL,
	"modelId" varchar(128),
	"skillId" varchar(100) DEFAULT 'chat-alert',
	"emailNotify" boolean DEFAULT true NOT NULL,
	"description" text,
	"lastRunAt" timestamp with time zone,
	"nextRunAt" timestamp with time zone,
	"bullmqJobId" varchar(255),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"skillId" integer NOT NULL,
	"userId" integer NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"skillId" integer NOT NULL,
	"userId" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_repositories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"git_url" varchar(500) NOT NULL,
	"branch" varchar(100) DEFAULT 'main',
	"format_type" varchar(50) DEFAULT 'auto',
	"skills_subdir" varchar(200) DEFAULT 'skills',
	"last_fetched_at" timestamp with time zone,
	"last_commit_hash" varchar(64),
	"skill_count" integer DEFAULT 0,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" varchar(64) NOT NULL,
	"key" varchar(128) NOT NULL,
	"value" text,
	"valueJson" json,
	"isSensitive" boolean DEFAULT false,
	"description" text,
	"updatedBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_follows" (
	"id" serial PRIMARY KEY NOT NULL,
	"followerId" integer NOT NULL,
	"followingId" integer NOT NULL,
	"status" "follow_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text,
	"conversationId" integer,
	"scheduledMessageId" integer,
	"isRead" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_skill_visibility" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"skillId" integer NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"autoTriggerEnabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD COLUMN "project_id" varchar(100);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "trashedAt" timestamp;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "project_id" varchar(100);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "memory_mode" varchar(20) DEFAULT 'full';--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "brainstormPartnerModel" varchar(100);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "brainstormMaxRounds" integer DEFAULT 3;--> statement-breakpoint
ALTER TABLE "entity_memories" ADD COLUMN "projectId" varchar(100);--> statement-breakpoint
ALTER TABLE "entity_memories" ADD COLUMN "importance" integer DEFAULT 5;--> statement-breakpoint
ALTER TABLE "entity_memories" ADD COLUMN "source" varchar(20) DEFAULT 'auto';--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "visibleByDefault" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "marketplaceContent" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "repositoryId" integer;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "repositorySlug" varchar(200);--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "contentHash" varchar(64);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "websiteLogoUrl" varchar(512);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "normalizedEmail" varchar(320);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trustScore" integer DEFAULT 100;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "registrationIp" varchar(45);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "userPreferences" json DEFAULT '{}'::json;--> statement-breakpoint
ALTER TABLE "blocked_patterns" ADD CONSTRAINT "blocked_patterns_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_fingerprints" ADD CONSTRAINT "device_fingerprints_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_senderId_users_id_fk" FOREIGN KEY ("senderId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_receiverId_users_id_fk" FOREIGN KEY ("receiverId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_config" ADD CONSTRAINT "invoice_config_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_events" ADD CONSTRAINT "registration_events_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_message_logs" ADD CONSTRAINT "scheduled_message_logs_scheduledMessageId_scheduled_messages_id_fk" FOREIGN KEY ("scheduledMessageId") REFERENCES "public"."scheduled_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_targetUserId_users_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_comments" ADD CONSTRAINT "skill_comments_skillId_skills_id_fk" FOREIGN KEY ("skillId") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_comments" ADD CONSTRAINT "skill_comments_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_likes" ADD CONSTRAINT "skill_likes_skillId_skills_id_fk" FOREIGN KEY ("skillId") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_likes" ADD CONSTRAINT "skill_likes_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_repositories" ADD CONSTRAINT "skill_repositories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_followerId_users_id_fk" FOREIGN KEY ("followerId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_followingId_users_id_fk" FOREIGN KEY ("followingId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_scheduledMessageId_scheduled_messages_id_fk" FOREIGN KEY ("scheduledMessageId") REFERENCES "public"."scheduled_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skill_visibility" ADD CONSTRAINT "user_skill_visibility_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skill_visibility" ADD CONSTRAINT "user_skill_visibility_skillId_skills_id_fk" FOREIGN KEY ("skillId") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_likes_unique" ON "skill_likes" USING btree ("skillId","userId");--> statement-breakpoint
CREATE UNIQUE INDEX "user_skill_visibility_unique" ON "user_skill_visibility" USING btree ("userId","skillId");--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_repositoryId_skill_repositories_id_fk" FOREIGN KEY ("repositoryId") REFERENCES "public"."skill_repositories"("id") ON DELETE no action ON UPDATE no action;