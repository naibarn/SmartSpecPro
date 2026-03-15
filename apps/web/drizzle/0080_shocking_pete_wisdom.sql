CREATE TABLE "conversation_visual_state" (
	"conversationId" integer PRIMARY KEY NOT NULL,
	"recentAssetIds" jsonb DEFAULT '[]'::jsonb,
	"activeAssetIds" jsonb DEFAULT '[]'::jsonb,
	"comparedAssetIds" jsonb DEFAULT '[]'::jsonb,
	"namedSets" jsonb DEFAULT '{}'::jsonb,
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "media_asset_analysis" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"mediaAssetId" bigint NOT NULL,
	"provider" varchar(64),
	"model" varchar(128),
	"shortCaption" text,
	"detailedCaption" text,
	"ocrText" text,
	"objects" jsonb,
	"styles" jsonb,
	"materials" jsonb,
	"colors" jsonb,
	"rooms" jsonb,
	"architectureTags" jsonb,
	"aestheticScore" numeric(4, 3),
	"safetyLabels" jsonb,
	"extractedJson" jsonb,
	"createdAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"projectId" varchar(100),
	"conversationId" integer,
	"messageId" integer,
	"sourceType" varchar(32) DEFAULT 'chat_attachment',
	"status" varchar(32) DEFAULT 'pending',
	"storageKey" text NOT NULL,
	"originalUrl" text,
	"thumbnailUrl" text,
	"mimeType" varchar(100) NOT NULL,
	"width" integer,
	"height" integer,
	"fileSize" bigint,
	"checksumSha256" varchar(64),
	"perceptualHash" varchar(128),
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "multimodal_memory_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36),
	"userId" integer,
	"projectId" varchar(100),
	"conversationId" integer,
	"messageId" integer,
	"mediaAssetId" bigint,
	"memoryKind" varchar(32),
	"title" text,
	"summary" text,
	"searchableText" text NOT NULL,
	"sourceRole" varchar(16),
	"salience" numeric DEFAULT '0.500',
	"confidence" numeric DEFAULT '0.800',
	"lastAccessedAt" timestamp with time zone,
	"accessCount" integer DEFAULT 0,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "multimodal_memory_links" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fromMemoryItemId" bigint NOT NULL,
	"toMemoryItemId" bigint NOT NULL,
	"relationType" varchar(32),
	"weight" numeric DEFAULT '1.000',
	"createdAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "multimodal_memory_vectors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"memoryItemId" bigint NOT NULL,
	"provider" varchar(64) NOT NULL,
	"model" varchar(128),
	"modality" varchar(16),
	"embedding" vector(768),
	"embeddingVersion" varchar(32),
	"createdAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "conversation_visual_state" ADD CONSTRAINT "conversation_visual_state_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset_analysis" ADD CONSTRAINT "media_asset_analysis_mediaAssetId_media_assets_id_fk" FOREIGN KEY ("mediaAssetId") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_messageId_messages_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multimodal_memory_items" ADD CONSTRAINT "multimodal_memory_items_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multimodal_memory_items" ADD CONSTRAINT "multimodal_memory_items_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multimodal_memory_items" ADD CONSTRAINT "multimodal_memory_items_mediaAssetId_media_assets_id_fk" FOREIGN KEY ("mediaAssetId") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multimodal_memory_links" ADD CONSTRAINT "multimodal_memory_links_fromMemoryItemId_multimodal_memory_items_id_fk" FOREIGN KEY ("fromMemoryItemId") REFERENCES "public"."multimodal_memory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multimodal_memory_links" ADD CONSTRAINT "multimodal_memory_links_toMemoryItemId_multimodal_memory_items_id_fk" FOREIGN KEY ("toMemoryItemId") REFERENCES "public"."multimodal_memory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multimodal_memory_vectors" ADD CONSTRAINT "multimodal_memory_vectors_memoryItemId_multimodal_memory_items_id_fk" FOREIGN KEY ("memoryItemId") REFERENCES "public"."multimodal_memory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_asset_analysis_asset_idx" ON "media_asset_analysis" USING btree ("mediaAssetId");--> statement-breakpoint
CREATE INDEX "media_assets_user_idx" ON "media_assets" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "media_assets_conversation_idx" ON "media_assets" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "media_assets_tenant_project_idx" ON "media_assets" USING btree ("tenantId","projectId");--> statement-breakpoint
CREATE INDEX "media_assets_checksum_idx" ON "media_assets" USING btree ("checksumSha256");--> statement-breakpoint
CREATE INDEX "multimodal_memory_items_user_project_idx" ON "multimodal_memory_items" USING btree ("userId","projectId");--> statement-breakpoint
CREATE INDEX "multimodal_memory_items_conversation_idx" ON "multimodal_memory_items" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "multimodal_memory_items_asset_idx" ON "multimodal_memory_items" USING btree ("mediaAssetId");--> statement-breakpoint
CREATE INDEX "multimodal_memory_links_from_idx" ON "multimodal_memory_links" USING btree ("fromMemoryItemId");--> statement-breakpoint
CREATE INDEX "multimodal_memory_links_to_idx" ON "multimodal_memory_links" USING btree ("toMemoryItemId");--> statement-breakpoint
CREATE INDEX "multimodal_memory_vectors_item_idx" ON "multimodal_memory_vectors" USING btree ("memoryItemId");