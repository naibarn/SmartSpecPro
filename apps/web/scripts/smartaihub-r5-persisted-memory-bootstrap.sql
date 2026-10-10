CREATE EXTENSION IF NOT EXISTS vector;

DO $$ BEGIN
  CREATE TYPE entity_type AS ENUM ('user','project','preference','technical','decision','plan','architecture','component','task','code_knowledge','rule','fact','goal','insight','context','relationship','process','constraint','reference','note','checklist','artifact_note','handoff_note','episode');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE memory_kind AS ENUM ('fact','rule','preference','decision','note','checklist','artifact_note','handoff_note','episode');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE memory_owner_type AS ENUM ('user','agent','team','room','project','run');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE memory_source_type AS ENUM ('auto','manual','promoted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE memory_visibility AS ENUM ('private','shared_team','shared_room','shared_project');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS conversations (
  id serial PRIMARY KEY,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL DEFAULT 'New Chat',
  "project_id" varchar(100),
  "tenantId" varchar(36) REFERENCES tenants(id) ON DELETE CASCADE,
  "trashedAt" timestamp
);
CREATE TABLE IF NOT EXISTS entity_memories (
  id serial PRIMARY KEY,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "personaId" varchar(36) REFERENCES persona_templates(id) ON DELETE SET NULL,
  "entityType" entity_type NOT NULL,
  "entityName" varchar(255) NOT NULL,
  facts json NOT NULL DEFAULT '[]'::json,
  "sourceConversationId" integer REFERENCES conversations(id) ON DELETE SET NULL,
  "projectId" varchar(100),
  confidence numeric(3,2) DEFAULT '0.8',
  "lastAccessedAt" timestamptz DEFAULT now(),
  importance integer DEFAULT 5,
  source varchar(20) DEFAULT 'auto',
  "reinforcementCount" integer DEFAULT 1,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entity_memories_user_persona_idx ON entity_memories ("userId", "personaId");
CREATE TABLE IF NOT EXISTS scoped_memories (
  id text PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "ownerType" memory_owner_type NOT NULL,
  "ownerId" text NOT NULL,
  "memoryKind" memory_kind NOT NULL,
  visibility memory_visibility NOT NULL DEFAULT 'private',
  "sourceType" memory_source_type NOT NULL DEFAULT 'auto',
  "sourceUserId" integer,
  "sourceAssistantId" text,
  "sourceRoomId" text,
  "projectId" varchar(100),
  title text NOT NULL,
  content text NOT NULL,
  summary text,
  tags text[],
  "metadataJson" jsonb,
  embedding vector(1536),
  confidence numeric(3,2) DEFAULT '0.80',
  importance integer DEFAULT 5,
  "reinforcementCount" integer DEFAULT 0,
  "lastAccessedAt" timestamptz,
  "expiresAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scoped_memories_owner_created_idx ON scoped_memories ("ownerType", "ownerId", "createdAt");
CREATE INDEX IF NOT EXISTS scoped_memories_tenant_kind_idx ON scoped_memories ("tenantId", "memoryKind");
CREATE INDEX IF NOT EXISTS scoped_memories_content_tsvector_idx ON scoped_memories USING gin (to_tsvector('english', content || ' ' || title));

CREATE TABLE IF NOT EXISTS memory_promotions (
  id text PRIMARY KEY,
  "memoryId" text NOT NULL REFERENCES scoped_memories(id) ON DELETE CASCADE,
  "fromOwnerType" memory_owner_type NOT NULL,
  "fromOwnerId" text NOT NULL,
  "toOwnerType" memory_owner_type NOT NULL,
  "toOwnerId" text NOT NULL,
  "promotedByUserId" integer,
  "promotedByAssistantId" text,
  reason text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS memory_promotions_memory_idx ON memory_promotions ("memoryId");
