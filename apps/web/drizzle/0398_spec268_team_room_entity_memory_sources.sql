CREATE UNIQUE INDEX "entity_memories_id_user_project_unique"
  ON "entity_memories" USING btree ("id", "userId", "projectId");--> statement-breakpoint
CREATE UNIQUE INDEX "team_room_messages_id_room_unique"
  ON "team_room_messages" USING btree ("id", "roomId");--> statement-breakpoint

CREATE TABLE "team_room_entity_memory_sources" (
  "id" serial PRIMARY KEY NOT NULL,
  "entityMemoryId" integer NOT NULL,
  "entityMemoryOwnerUserId" integer NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "roomId" varchar(36) NOT NULL,
  "teamId" varchar(36) NOT NULL,
  "runId" varchar(36),
  "sourceMessageId" varchar(36) NOT NULL,
  "actorUserId" integer NOT NULL,
  "canonicalProjectId" varchar(36) NOT NULL,
  "authorityVersion" varchar(80) DEFAULT 'team-room-provider-context.v1' NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "team_room_entity_memory_sources_memory_fk"
    FOREIGN KEY ("entityMemoryId", "entityMemoryOwnerUserId", "canonicalProjectId")
    REFERENCES "entity_memories"("id", "userId", "projectId") ON DELETE CASCADE,
  CONSTRAINT "team_room_entity_memory_sources_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "team_room_entity_memory_sources_room_fk"
    FOREIGN KEY ("roomId") REFERENCES "team_rooms"("id") ON DELETE CASCADE,
  CONSTRAINT "team_room_entity_memory_sources_team_fk"
    FOREIGN KEY ("teamId") REFERENCES "assistant_teams"("id") ON DELETE CASCADE,
  CONSTRAINT "team_room_entity_memory_sources_run_fk"
    FOREIGN KEY ("runId") REFERENCES "team_runs"("id") ON DELETE SET NULL,
  CONSTRAINT "team_room_entity_memory_sources_message_fk"
    FOREIGN KEY ("sourceMessageId") REFERENCES "team_room_messages"("id") ON DELETE CASCADE,
  CONSTRAINT "team_room_entity_memory_sources_message_room_fk"
    FOREIGN KEY ("sourceMessageId", "roomId") REFERENCES "team_room_messages"("id", "roomId") ON DELETE CASCADE,
  CONSTRAINT "team_room_entity_memory_sources_actor_fk"
    FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "team_room_entity_memory_sources_project_fk"
    FOREIGN KEY ("tenantId", "canonicalProjectId")
    REFERENCES "canonical_projects"("tenant_id", "project_id") ON DELETE CASCADE,
  CONSTRAINT "team_room_entity_memory_sources_authority_check"
    CHECK ("authorityVersion" = 'team-room-provider-context.v1')
);--> statement-breakpoint

CREATE UNIQUE INDEX "team_room_entity_memory_sources_message_unique"
  ON "team_room_entity_memory_sources" USING btree ("entityMemoryId", "sourceMessageId");--> statement-breakpoint
CREATE INDEX "team_room_entity_memory_sources_tenant_project_idx"
  ON "team_room_entity_memory_sources" USING btree ("tenantId", "canonicalProjectId", "actorUserId");
