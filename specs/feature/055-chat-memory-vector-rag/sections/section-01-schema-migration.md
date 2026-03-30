# Section 01 — Schema Migration

## Overview

Database migration foundation for Chat Memory Vector RAG. Adds two new tables (`message_chunks`, `memory_archive_metadata`), four new columns on `conversation_summaries`, HNSW/GIN indexes, and composite index on `messages`.

**Migration file:** `apps/web/drizzle/0111_chat_memory_vector.sql`
**Schema file:** `apps/web/drizzle/schema.ts`

**Dependencies:** None (foundation section)
**Blocks:** All other sections (02 through 12)

---

## Tests First

### Test File: `apps/web/server/services/__tests__/chatMemorySchema.test.ts`

```
Test: messageChunks table has all required columns (id, tenantId, userId, conversationId, messageRangeStart, messageRangeEnd, chunkIndex, content, tokenCount, embedding, projectId, personaId, createdAt)
Test: messageChunks.id is text (UUID primary key)
Test: messageChunks.embedding uses vector1536 custom type (nullable)
Test: messageChunks.conversationId references conversations.id with CASCADE
Test: messageChunks.userId references users.id with CASCADE

Test: memoryArchiveMetadata table has all required columns (id, tenantId, userId, conversationId, archiveDate, filePath, messageCount, fileSizeBytes, encryptionVersion, createdAt)
Test: memoryArchiveMetadata.id is serial primary key
Test: memoryArchiveMetadata.conversationId references conversations.id with CASCADE

Test: conversationSummaries has new columns (skippedRiskyCount, extractedFactIds, hasRawArchive, classificationStats)
Test: conversationSummaries.skippedRiskyCount defaults to 0
Test: conversationSummaries.hasRawArchive defaults to false
Test: conversationSummaries.classificationStats is jsonb type
Test: conversationSummaries.extractedFactIds is text array type
```

### Post-Migration Verification

```
Verify: UNIQUE constraint on (conversationId, chunkIndex) in message_chunks
Verify: UNIQUE constraint on (conversationId, archiveDate) in memory_archive_metadata
Verify: HNSW index on scoped_memories.embedding is valid (indisvalid = true)
Verify: HNSW index on message_chunks.embedding is valid (indisvalid = true)
Verify: GIN tsvector index on scoped_memories and message_chunks
Verify: Composite index on messages (conversationId, createdAt)
Verify: FK CASCADE: deleting conversation cascades to message_chunks and memory_archive_metadata
```

---

## Schema Changes in `apps/web/drizzle/schema.ts`

### New Table: `message_chunks`

Add after scoped memory tables (~line 6920+).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `text` PK | `$defaultFn(() => crypto.randomUUID())` |
| `tenantId` | `varchar(36)` | NOT NULL |
| `userId` | `integer` | NOT NULL, FK `users.id` CASCADE |
| `conversationId` | `integer` | NOT NULL, FK `conversations.id` CASCADE |
| `messageRangeStart` | `integer` | NOT NULL |
| `messageRangeEnd` | `integer` | NOT NULL |
| `chunkIndex` | `integer` | NOT NULL |
| `content` | `text` | NOT NULL |
| `tokenCount` | `integer` | NOT NULL |
| `embedding` | `vector1536` | NULLABLE (async via BullMQ) |
| `projectId` | `varchar(100)` | NULLABLE |
| `personaId` | `varchar(36)` | NULLABLE |
| `createdAt` | `timestamp(tz)` | DEFAULT now() |

**Indexes:**

| Index | Columns | Type |
|-------|---------|------|
| `message_chunks_conv_chunk_idx` | `(conversationId, chunkIndex)` | UNIQUE |
| `message_chunks_tenant_user_idx` | `(tenantId, userId)` | B-tree |
| `message_chunks_created_idx` | `(createdAt)` | B-tree |
| `message_chunks_tenant_project_idx` | `(tenantId, projectId)` | B-tree |

**Type exports:**
```typescript
export type MessageChunk = typeof messageChunks.$inferSelect;
export type InsertMessageChunk = typeof messageChunks.$inferInsert;
```

### New Table: `memory_archive_metadata`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` PK | Auto-increment |
| `tenantId` | `varchar(36)` | NOT NULL |
| `userId` | `integer` | NOT NULL, FK `users.id` CASCADE |
| `conversationId` | `integer` | NOT NULL, FK `conversations.id` CASCADE |
| `archiveDate` | `varchar(10)` | NOT NULL (YYYY-MM-DD) |
| `filePath` | `text` | NOT NULL |
| `messageCount` | `integer` | DEFAULT 0 |
| `fileSizeBytes` | `integer` | DEFAULT 0 |
| `encryptionVersion` | `integer` | DEFAULT 1 |
| `createdAt` | `timestamp(tz)` | DEFAULT now() |

**Index:** `memory_archive_conv_date_idx` UNIQUE on `(conversationId, archiveDate)`

**Type exports:**
```typescript
export type MemoryArchiveMetadata = typeof memoryArchiveMetadata.$inferSelect;
export type InsertMemoryArchiveMetadata = typeof memoryArchiveMetadata.$inferInsert;
```

### Alter Table: `conversation_summaries`

Add four nullable columns (metadata-only ALTER, no table rewrite):

| Column | Type | Default |
|--------|------|---------|
| `skippedRiskyCount` | `integer` | `0` |
| `extractedFactIds` | `text().array()` | nullable |
| `hasRawArchive` | `boolean` | `false` |
| `classificationStats` | `jsonb` | nullable |

---

## Migration SQL: `apps/web/drizzle/0111_chat_memory_vector.sql`

After `pnpm db:push` generates the base migration, **append** these raw SQL statements (Drizzle cannot generate HNSW/GIN indexes):

```sql
-- Ensure pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- L1 HNSW: scoped_memories (small, stable)
CREATE INDEX CONCURRENTLY IF NOT EXISTS scoped_memories_embedding_hnsw_idx
  ON scoped_memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200)
  WHERE embedding IS NOT NULL;

-- L1 BM25: keyword search on scoped_memories
CREATE INDEX CONCURRENTLY IF NOT EXISTS scoped_memories_content_tsvector_idx
  ON scoped_memories USING gin (to_tsvector('english', content || ' ' || title));

-- L2 HNSW: message_chunks (write-heavy, lower ef_construction)
CREATE INDEX CONCURRENTLY IF NOT EXISTS message_chunks_embedding_hnsw_idx
  ON message_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

-- L2 BM25: keyword search on message_chunks
CREATE INDEX CONCURRENTLY IF NOT EXISTS message_chunks_content_tsvector_idx
  ON message_chunks USING gin (to_tsvector('english', content));

-- Hot path: chunker reads messages by conversation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_id
  ON messages ("conversationId", "createdAt");
```

**Note:** `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block.

---

## Post-Migration Verification

```sql
-- Verify HNSW indexes are valid
SELECT indexrelname, indisvalid
FROM pg_stat_user_indexes JOIN pg_index ON indexrelid = pg_stat_user_indexes.indexrelid
WHERE indexrelname IN ('scoped_memories_embedding_hnsw_idx', 'message_chunks_embedding_hnsw_idx');

-- Verify new columns on conversation_summaries
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'conversation_summaries'
  AND column_name IN ('skippedRiskyCount', 'extractedFactIds', 'hasRawArchive', 'classificationStats');
```

---

## Database Safety Protocol

1. Backup `conversation_summaries` before migration
2. Record row counts pre-migration
3. Run `cd apps/web && pnpm db:push`
4. Verify row counts unchanged
5. Run raw SQL for HNSW/GIN indexes
6. Verify all indexes valid via `indisvalid` check

## Interfaces Consumed by Downstream Sections

- **`MessageChunk` / `InsertMessageChunk`** -- section-05, section-07
- **`MemoryArchiveMetadata` / `InsertMemoryArchiveMetadata`** -- section-02
- **`messageChunks` table reference** -- section-03, section-05, section-09
- **`memoryArchiveMetadata` table reference** -- section-02, section-09
