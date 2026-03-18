CREATE TYPE "public"."memory_kind" AS ENUM('fact', 'rule', 'preference', 'decision', 'note', 'checklist', 'artifact_note', 'handoff_note', 'episode');--> statement-breakpoint
CREATE TYPE "public"."memory_owner_type" AS ENUM('user', 'agent', 'team', 'room', 'project', 'run');--> statement-breakpoint
CREATE TYPE "public"."memory_source_type" AS ENUM('auto', 'manual', 'promoted');--> statement-breakpoint
CREATE TYPE "public"."memory_visibility" AS ENUM('private', 'shared_team', 'shared_room', 'shared_project');--> statement-breakpoint
CREATE TABLE "memory_promotions" (
	"id" text PRIMARY KEY NOT NULL,
	"memoryId" text NOT NULL,
	"fromOwnerType" "memory_owner_type" NOT NULL,
	"fromOwnerId" text NOT NULL,
	"toOwnerType" "memory_owner_type" NOT NULL,
	"toOwnerId" text NOT NULL,
	"promotedByUserId" integer,
	"promotedByAssistantId" text,
	"reason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoped_memories" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"ownerType" "memory_owner_type" NOT NULL,
	"ownerId" text NOT NULL,
	"memoryKind" "memory_kind" NOT NULL,
	"visibility" "memory_visibility" DEFAULT 'private' NOT NULL,
	"sourceType" "memory_source_type" DEFAULT 'auto' NOT NULL,
	"sourceUserId" integer,
	"sourceAssistantId" text,
	"sourceRoomId" text,
	"projectId" varchar(100),
	"title" text NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"tags" text[],
	"metadataJson" jsonb,
	"embedding" vector(1536),
	"confidence" numeric(3, 2) DEFAULT '0.80',
	"importance" integer DEFAULT 5,
	"reinforcementCount" integer DEFAULT 0,
	"lastAccessedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_promotions" ADD CONSTRAINT "memory_promotions_memoryId_scoped_memories_id_fk" FOREIGN KEY ("memoryId") REFERENCES "public"."scoped_memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_promotions_memory_idx" ON "memory_promotions" USING btree ("memoryId");--> statement-breakpoint
CREATE INDEX "scoped_memories_owner_created_idx" ON "scoped_memories" USING btree ("ownerType","ownerId","createdAt");--> statement-breakpoint
CREATE INDEX "scoped_memories_tenant_kind_idx" ON "scoped_memories" USING btree ("tenantId","memoryKind");