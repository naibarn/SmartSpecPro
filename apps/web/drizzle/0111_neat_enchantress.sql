CREATE TABLE "agency_memory_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"agencyId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"agentNodeId" text NOT NULL,
	"runId" text NOT NULL,
	"sourceNodeId" text NOT NULL,
	"chunkIndex" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_agent_memories" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "agency_memory_chunks" ADD CONSTRAINT "agency_memory_chunks_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_memory_chunks" ADD CONSTRAINT "agency_memory_chunks_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_memory_chunks" ADD CONSTRAINT "agency_memory_chunks_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_chunks_scope_idx" ON "agency_memory_chunks" USING btree ("tenantId","agencyId","agentNodeId","userId");--> statement-breakpoint
CREATE INDEX "memory_chunks_expires_idx" ON "agency_memory_chunks" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "memory_chunks_run_idx" ON "agency_memory_chunks" USING btree ("runId","sourceNodeId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_memories_embedding_idx" ON "agency_agent_memories" USING hnsw ("embedding" vector_cosine_ops) WHERE "isActive" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_memories_active_lookup_idx" ON "agency_agent_memories" USING btree ("tenantId","agencyId","agentNodeId","userId") WHERE "isActive" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_chunks_embedding_idx" ON "agency_memory_chunks" USING hnsw ("embedding" vector_cosine_ops);
