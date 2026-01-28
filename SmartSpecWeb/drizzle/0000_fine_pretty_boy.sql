CREATE TYPE "public"."aspect_ratio" AS ENUM('1:1', '9:16', '16:9');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('image', 'video', 'website');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('user', 'project', 'preference', 'technical');--> statement-breakpoint
CREATE TYPE "public"."media_model_type" AS ENUM('image', 'video', 'audio');--> statement-breakpoint
CREATE TYPE "public"."media_provider_type" AS ENUM('image', 'video', 'audio', 'multimodal');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'starter', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin', 'domain_admin');--> statement-breakpoint
CREATE TYPE "public"."skill_category" AS ENUM('image_generation', 'video_generation', 'audio_generation', 'sound_effects', 'prompt_enhancement', 'code_assistant', 'document_analysis', 'web_search', 'data_analysis', 'translation', 'summarization', 'chat_assistant', 'automation', 'other');--> statement-breakpoint
CREATE TYPE "public"."storage_provider_type" AS ENUM('r2', 's3', 'local');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('purchase', 'usage', 'bonus', 'refund', 'adjustment', 'subscription');--> statement-breakpoint
CREATE TABLE "conversation_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"summary" text NOT NULL,
	"messageRangeStart" integer NOT NULL,
	"messageRangeEnd" integer NOT NULL,
	"messageCount" integer NOT NULL,
	"tokensUsed" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"title" varchar(255) DEFAULT 'New Chat' NOT NULL,
	"model" varchar(100) DEFAULT 'gpt-4o-mini',
	"temperature" numeric(3, 2) DEFAULT '0.7',
	"systemPrompt" text,
	"skillSettings" json DEFAULT '{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}'::json,
	"isArchived" boolean DEFAULT false NOT NULL,
	"isPinned" boolean DEFAULT false NOT NULL,
	"totalCreditsUsed" numeric(12, 4) DEFAULT '0',
	"messageCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"credits" integer NOT NULL,
	"priceUsd" numeric(10, 2) NOT NULL,
	"stripePriceId" varchar(128),
	"isActive" boolean DEFAULT true NOT NULL,
	"isFeatured" boolean DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"amount" integer NOT NULL,
	"type" "transaction_type" NOT NULL,
	"description" varchar(512),
	"metadata" json,
	"balanceAfter" integer NOT NULL,
	"referenceId" varchar(128),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"entityType" "entity_type" NOT NULL,
	"entityName" varchar(255) NOT NULL,
	"facts" json DEFAULT '[]'::json NOT NULL,
	"sourceConversationId" integer,
	"confidence" numeric(3, 2) DEFAULT '0.8',
	"lastAccessedAt" timestamp with time zone DEFAULT now(),
	"reinforcementCount" integer DEFAULT 1,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" integer,
	"type" "content_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"aspectRatio" "aspect_ratio" NOT NULL,
	"fileKey" varchar(512),
	"fileUrl" varchar(1024),
	"thumbnailKey" varchar(512),
	"thumbnailUrl" varchar(1024),
	"duration" varchar(10),
	"demoUrl" varchar(512),
	"tags" json,
	"model" varchar(128),
	"views" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"isPublished" boolean DEFAULT true NOT NULL,
	"isFeatured" boolean DEFAULT false NOT NULL,
	"authorId" integer,
	"authorName" varchar(255),
	"authorAvatar" varchar(512),
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"providerName" varchar(64) NOT NULL,
	"displayName" varchar(128) NOT NULL,
	"description" text,
	"baseUrl" varchar(512),
	"apiKeyEncrypted" text,
	"hasApiKey" boolean DEFAULT false NOT NULL,
	"defaultModel" varchar(128),
	"availableModels" json,
	"configJson" json,
	"isEnabled" boolean DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_providers_providerName_unique" UNIQUE("providerName")
);
--> statement-breakpoint
CREATE TABLE "media_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"modelId" varchar(128) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"modelType" "media_model_type" NOT NULL,
	"provider" varchar(64) NOT NULL,
	"aliases" json DEFAULT '[]'::json,
	"creditCost" integer DEFAULT 10 NOT NULL,
	"aspectRatios" json,
	"sizes" json,
	"durations" json,
	"voices" json,
	"configJson" json,
	"isEnabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 99 NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_models_modelId_unique" UNIQUE("modelId")
);
--> statement-breakpoint
CREATE TABLE "media_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"providerName" varchar(64) NOT NULL,
	"displayName" varchar(128) NOT NULL,
	"description" text,
	"providerType" "media_provider_type" DEFAULT 'multimodal' NOT NULL,
	"baseUrl" varchar(512),
	"callbackUrl" varchar(512),
	"apiKeyEncrypted" text,
	"hasApiKey" boolean DEFAULT false NOT NULL,
	"availableModels" json,
	"defaultModel" varchar(128),
	"configJson" json,
	"isEnabled" boolean DEFAULT false NOT NULL,
	"isPrimary" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"lastTestedAt" timestamp with time zone,
	"lastTestResult" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_providers_providerName_unique" UNIQUE("providerName")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"inputTokens" integer DEFAULT 0,
	"outputTokens" integer DEFAULT 0,
	"creditsUsed" numeric(10, 4) DEFAULT '0',
	"modelUsed" varchar(100),
	"attachments" json DEFAULT '[]'::json,
	"artifacts" json DEFAULT '[]'::json,
	"skillUsed" varchar(100),
	"skillArgs" json,
	"error" text,
	"isRegenerated" boolean DEFAULT false,
	"parentMessageId" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_metadata" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" integer NOT NULL,
	"path" varchar(512) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"keywords" json,
	"canonicalUrl" varchar(512),
	"ogMetadata" json,
	"twitterMetadata" json,
	"aiContent" json,
	"structuredData" json,
	"geoData" json,
	"qualitySignals" json,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"skillId" varchar(100) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"customSettings" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" "skill_category" DEFAULT 'other' NOT NULL,
	"version" varchar(20) DEFAULT '1.0.0',
	"author" varchar(255),
	"icon" varchar(50) DEFAULT 'sparkles',
	"tags" json DEFAULT '[]'::json,
	"folderPath" varchar(512),
	"isAutoTrigger" boolean DEFAULT false NOT NULL,
	"triggerPatterns" json DEFAULT '[]'::json,
	"isEnabled" boolean DEFAULT true NOT NULL,
	"enabledByDefault" boolean DEFAULT true NOT NULL,
	"creditMultiplier" numeric(5, 2) DEFAULT '1.0',
	"priority" integer DEFAULT 50 NOT NULL,
	"availableModels" json,
	"defaultModel" varchar(128),
	"systemPrompt" text,
	"skillContent" text,
	"knowledgebase" text,
	"configJson" json,
	"importSource" varchar(50) DEFAULT 'manual',
	"importedFromZip" varchar(512),
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "storage_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"displayName" varchar(128) NOT NULL,
	"description" text,
	"providerType" "storage_provider_type" DEFAULT 'r2' NOT NULL,
	"endpoint" varchar(512),
	"region" varchar(64) DEFAULT 'auto',
	"bucket" varchar(128),
	"accessKeyIdEncrypted" text,
	"secretAccessKeyEncrypted" text,
	"hasCredentials" boolean DEFAULT false NOT NULL,
	"publicUrlPrefix" varchar(512),
	"devTunnelUrl" varchar(512),
	"pathPrefix" varchar(128) DEFAULT 'uploads/',
	"isActive" boolean DEFAULT false NOT NULL,
	"configJson" json,
	"lastTestedAt" timestamp with time zone,
	"lastTestResult" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_settings_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tenant_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" integer NOT NULL,
	"pageKey" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"content" text,
	"sections" json,
	"metadata" json,
	"isPublished" boolean DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"showInMenu" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"primaryDomain" varchar(255),
	"domains" json,
	"logoUrl" varchar(512),
	"faviconUrl" varchar(512),
	"isActive" boolean DEFAULT true NOT NULL,
	"seoConfig" json,
	"themeConfig" json,
	"contactInfo" json,
	"settings" json,
	"ownerId" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_primaryDomain_unique" UNIQUE("primaryDomain")
);
--> statement-breakpoint
CREATE TABLE "theme_presets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"displayName" varchar(255) NOT NULL,
	"description" text,
	"previewImageUrl" varchar(512),
	"themeConfig" json NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "theme_presets_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"password" text,
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"registeredDomain" varchar(255),
	"currentTenantId" integer,
	"credits" integer DEFAULT 0 NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"isDisabled" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_memories" ADD CONSTRAINT "entity_memories_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_memories" ADD CONSTRAINT "entity_memories_sourceConversationId_conversations_id_fk" FOREIGN KEY ("sourceConversationId") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_authorId_users_id_fk" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_metadata" ADD CONSTRAINT "seo_metadata_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_preferences" ADD CONSTRAINT "skill_preferences_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_pages" ADD CONSTRAINT "tenant_pages_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_ownerId_users_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_currentTenantId_tenants_id_fk" FOREIGN KEY ("currentTenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;