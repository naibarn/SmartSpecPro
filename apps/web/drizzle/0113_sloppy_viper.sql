ALTER TYPE "public"."entity_type" ADD VALUE 'fact';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'goal';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'insight';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'context';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'relationship';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'process';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'constraint';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'reference';--> statement-breakpoint
CREATE TABLE "memory_archive_metadata" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"conversationId" integer NOT NULL,
	"archiveDate" varchar(10) NOT NULL,
	"filePath" text NOT NULL,
	"messageCount" integer DEFAULT 0,
	"fileSizeBytes" integer DEFAULT 0,
	"encryptionVersion" integer DEFAULT 1,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"conversationId" integer NOT NULL,
	"messageRangeStart" integer NOT NULL,
	"messageRangeEnd" integer NOT NULL,
	"chunkIndex" integer NOT NULL,
	"content" text NOT NULL,
	"tokenCount" integer NOT NULL,
	"embedding" vector(1536),
	"projectId" varchar(100),
	"personaId" varchar(36),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD COLUMN "skippedRiskyCount" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD COLUMN "extractedFactIds" text[];--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD COLUMN "hasRawArchive" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD COLUMN "classificationStats" jsonb;--> statement-breakpoint
ALTER TABLE "memory_archive_metadata" ADD CONSTRAINT "memory_archive_metadata_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_archive_metadata" ADD CONSTRAINT "memory_archive_metadata_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_chunks" ADD CONSTRAINT "message_chunks_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_chunks" ADD CONSTRAINT "message_chunks_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memory_archive_conv_date_idx" ON "memory_archive_metadata" USING btree ("conversationId","archiveDate");--> statement-breakpoint
CREATE UNIQUE INDEX "message_chunks_conv_chunk_idx" ON "message_chunks" USING btree ("conversationId","chunkIndex");--> statement-breakpoint
CREATE INDEX "message_chunks_tenant_user_idx" ON "message_chunks" USING btree ("tenantId","userId");--> statement-breakpoint
CREATE INDEX "message_chunks_created_idx" ON "message_chunks" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "message_chunks_tenant_project_idx" ON "message_chunks" USING btree ("tenantId","projectId");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversationId","createdAt");