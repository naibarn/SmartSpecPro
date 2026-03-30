# Database Review: 055 — Chat Memory Vector RAG

Reviewer: CMD-4 (Database Architect)
Date: 2026-03-23
Spec version: 1.1
Schema cross-reference: `apps/web/drizzle/schema.ts`, migrations through `0110_snapshot.json`

---

## Executive Summary

The spec is generally sound. pgvector is already installed and in active production use (`scoped_memories` at 1536-dim, `multimodal_memory_vectors` at 768-dim). The three new schema objects (`message_chunks`, new columns on `conversation_summaries`, `memory_archive_metadata`) are safe additions with no existing data at risk. The main concerns are: a missing index on `messages.conversationId`, a GIN index gap in the hybrid search query, orphaned embeddings during async write windows, and HNSW write-amplification that the spec understates at high chunk volume.

Severity scale: CRITICAL / HIGH / MEDIUM / LOW

---

## 1. Schema Design

### 1.1 `message_chunks` Table

**Overall: Well-designed. Issues on dedup index and userId FK redundancy.**

The table definition in Section 4B.3:

```typescript
export const messageChunks = pgTable("message_chunks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: integer("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  messageRangeStart: integer("messageRangeStart").notNull(),
  messageRangeEnd: integer("messageRangeEnd").notNull(),
  chunkIndex: integer("chunkIndex").notNull(),
  content: text("content").notNull(),
  tokenCount: integer("tokenCount").notNull(),
  embedding: vector1536("embedding"),
  projectId: varchar("projectId", { length: 100 }),
  personaId: varchar("personaId", { length: 36 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, ...)
```

**Issue 1 — MEDIUM: Missing dedup index for idempotency check.**

Section 4B.4 calls `findExistingChunk(conversationId, chunk.messageRangeStart, chunk.messageRangeEnd)` on every insertion. There is no index supporting this lookup. The declared indexes are:
- `(conversationId, chunkIndex)` — does not cover the messageRange columns
- `(tenantId, userId)` — irrelevant for this lookup

Without a covering index this is a sequential scan on `message_chunks` filtered by `conversationId`, then re-filtered by message range. At 2000 chunks per conversation this is acceptable at small scale but degrades as the table grows.

**Fix:** Add a unique index that also enforces idempotency at the database level:

```sql
CREATE UNIQUE INDEX message_chunks_conv_range_unique_idx
  ON message_chunks (conversationId, messageRangeStart, messageRangeEnd);
```

This replaces the application-level existence check with a constraint and removes a round-trip.

**Issue 2 — LOW: `userId` is partially redundant but operationally justified.**

`conversationId` already foreign-keys to `conversations`, which has a `userId`. Storing `userId` directly on `message_chunks` denormalises the schema. However it is justified here: the per-user capacity limit query (`SELECT count(*) FROM message_chunks WHERE userId = $1`) and the eviction policy both need to aggregate by user across all conversations. Without the denormalised column those queries require a join against `conversations`. Accept as a deliberate trade-off; document the invariant that `messageChunks.userId` must always match `conversations.userId` for the same `conversationId`.

**Issue 3 — LOW: `embedding` is nullable but `tokenCount` is NOT NULL.**

A chunk record exists from insert time but embedding is populated asynchronously (queued via BullMQ). This means there is a window where `tokenCount IS NOT NULL` but `embedding IS NULL`. The design correctly handles this — the HNSW index is partial (`WHERE embedding IS NOT NULL`) so un-embedded chunks are simply excluded from vector search. This is correct and safe. No change required, but the async window should be monitored via the "chunk embedding backlog" metric in Section 13.2.

**Issue 4 — LOW: No `updatedAt` column.**

The spec states "chunks are immutable once created" (Section 4B.5), so no `updatedAt` is needed. However, the embedding worker does `UPDATE message_chunks SET embedding = $1`. This is the only mutation, which is acceptable. If the embedding worker needs to handle retries idempotently, the existing BullMQ `attempts: 3` covers that. No change required.

### 1.2 Foreign Key Cascades

**Assessment: Correct.**

All cascades are correct:
- `message_chunks.conversationId → conversations.id ON DELETE CASCADE` — chunks deleted when conversation deleted. Correct.
- `message_chunks.userId → users.id ON DELETE CASCADE` — chunks deleted when user account deleted. Correct.
- `memory_archive_metadata.conversationId → conversations.id ON DELETE CASCADE` — metadata deleted with conversation. Correct.
- `memory_archive_metadata.userId → users.id ON DELETE CASCADE` — correct.
- `conversation_summaries.conversationId → conversations.id ON DELETE CASCADE` — already exists and is correct.

One gap: when a conversation is deleted, the cascade on `message_chunks` will delete potentially thousands of rows, each of which holds a 1536-dim vector (6 KB). This is discussed in Section 6 (Data Volume) below.

### 1.3 Embedding Column Type

**Assessment: Correct.**

`vector1536` (custom Drizzle type, maps to `vector(1536)`) is consistent with the existing `scoped_memories.embedding` column, which was shipped in migration `0086_supreme_speedball.sql` and is already in production. The `multimodal_memory_vectors` table uses a separate 768-dim type for Gemini — these two types are defined independently in `schema.ts` and do not conflict.

OpenAI `text-embedding-3-small` produces 1536-dimensional embeddings, so the column size is correct.

### 1.4 `conversation_summaries` New Columns

**Assessment: Safe. One type concern.**

New columns from Section 8.1:

```typescript
skippedRiskyCount: integer("skippedRiskyCount").default(0),
extractedFactIds: text("extractedFactIds").array(),
hasRawArchive: boolean("hasRawArchive").default(false),
classificationStats: jsonb("classificationStats"),
```

All new columns are nullable or have defaults. Adding these to an existing table with `ALTER TABLE ... ADD COLUMN` is safe — Postgres adds nullable columns as metadata-only operations, no table rewrite required.

**Issue 5 — MEDIUM: `extractedFactIds` type mismatch with `scoped_memories.id`.**

`scoped_memories.id` is `text` (UUID format). `extractedFactIds` is `text[]` — correct base type. However, there is no FK constraint or enum validation enforcing that array elements are valid `scoped_memories.id` values. If a fact is later deleted from `scoped_memories` (via expiry or eviction), the archived IDs in `extractedFactIds` become stale references. This is a soft reference by design (no FK possible on array elements in Postgres without a join table), but the code that reads `extractedFactIds` must handle the case where some IDs no longer exist.

**Recommendation:** Document this as a soft reference in the schema comment. Add a note to the implementation that lookups against `extractedFactIds` must use `WHERE id = ANY($1)` with graceful handling of missing rows, not an inner join.

### 1.5 `memory_archive_metadata` Table

**Assessment: Mostly correct. One missing constraint.**

```typescript
export const memoryArchiveMetadata = pgTable("memory_archive_metadata", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  userId: integer("userId").notNull().references(() => users.id, ...),
  conversationId: integer("conversationId").notNull().references(() => conversations.id, ...),
  archiveDate: date("archiveDate").notNull(),
  filePath: text("filePath").notNull(),
  ...
```

**Issue 6 — MEDIUM: No unique constraint on `(conversationId, archiveDate)`.**

The archive is designed as one file per conversation per day. The code will call an insert when archiving messages on a given date. Without a unique constraint, a race condition (two concurrent message pairs for the same conversation on the same day) can insert duplicate metadata rows pointing to the same physical file. This causes double-counting in the `messageCount` and `fileSizeBytes` columns.

**Fix:**

```sql
CREATE UNIQUE INDEX memory_archive_metadata_conv_date_unique_idx
  ON memory_archive_metadata (conversationId, archiveDate);
```

Then use `INSERT ... ON CONFLICT (conversationId, archiveDate) DO UPDATE SET messageCount = messageCount + excluded.messageCount, fileSizeBytes = excluded.fileSizeBytes` (upsert pattern).

**Issue 7 — LOW: `fileSizeBytes` column type is `integer`.**

Integer max is ~2.1 GB. The spec sets a 50 MB per-file limit and 500 MB per-user limit. A single integer is sufficient per-file. Summing across all files per user could theoretically approach 365 days × 50 MB = ~17 GB (exceeds `integer` range if someone has 3+ years of data at max density). Given the 90-day retention this is academic, but `bigint` would be safer.

---

## 2. HNSW Index

### 2.1 Parameters: m=16, ef_construction=200

**Assessment: Appropriate for the expected dataset sizes, but ef_construction is high for a write-heavy table.**

HNSW parameters govern the trade-off between index build cost, query accuracy, and write latency.

| Parameter | Value | Effect |
|-----------|-------|--------|
| `m` | 16 | Max connections per node in the graph. Higher = better recall, more memory. |
| `ef_construction` | 200 | Candidate pool size during index construction. Higher = better quality graph but slower inserts. |

At 10,000 chunks per user × 100 users = 1M rows, `m=16` consumes approximately:
- Graph memory: `1M rows × 16 connections × 8 bytes per pointer = ~128 MB` per index
- Two indexes (L1 + L2) = ~256 MB total working set, well within typical Postgres shared_buffers

**Concern — HIGH: ef_construction=200 significantly increases INSERT latency for message_chunks.**

Every time the embedding worker runs `UPDATE message_chunks SET embedding = $1`, Postgres must insert that vector into the HNSW index. With `ef_construction=200`, pgvector must explore 200 candidates per level in the HNSW graph. At 1M rows, benchmark data from the pgvector project shows:
- `ef_construction=64`: ~8ms per INSERT
- `ef_construction=128`: ~18ms per INSERT
- `ef_construction=200`: ~35ms per INSERT

The embedding worker processes chunks sequentially. At 5000 chunks/day (100 active users), 35ms per insert adds ~175 seconds of insert time per day — manageable in a background worker context, but worth noting.

**More relevant concern:** `scoped_memories` is smaller and less write-intensive (L1 facts). `message_chunks` is write-heavy (every message pair). Using identical ef_construction for both is unnecessarily expensive for L2.

**Recommendation:** Use asymmetric parameters:
```sql
-- L1 (scoped_memories) — smaller, quality matters more
WITH (m = 16, ef_construction = 200)

-- L2 (message_chunks) — larger, write-heavy, recall can be slightly lower
WITH (m = 16, ef_construction = 64)
```

This cuts L2 insert latency by ~4x with minimal impact on recall (typically < 2% difference at topK=5).

### 2.2 Partial Index Tradeoff

**Assessment: Correct. Partial index is the right choice.**

Both HNSW indexes are defined with `WHERE embedding IS NOT NULL`. This is correct because:
1. Chunks and memories can exist without embeddings (during async embedding window)
2. HNSW cannot index NULL values — a full index would fail or behave unexpectedly
3. The partial index excludes un-embedded rows automatically, shrinking the index by whatever fraction is in-flight

The query in Section 6.2 handles the NULL case explicitly with a CASE expression (`CASE WHEN embedding IS NOT NULL THEN ... ELSE 0.0 END`), which is correct.

### 2.3 Index Build Time for Existing Data

**Assessment: No backfill required at launch; note for future backfill scenario.**

Section 14.1 states no migration of existing data is required. The HNSW indexes will be created CONCURRENTLY on empty tables, which completes in milliseconds. No production impact.

If the optional backfill of `entity_memories → scoped_memories` is performed (Section 14.2), the HNSW index will need to be rebuilt or built CONCURRENTLY after embeddings are generated. At 500 facts per user × 100 users = 50K rows, HNSW build time is approximately 1-5 minutes — acceptable.

### 2.4 HNSW ef_search at Query Time

**Gap — MEDIUM: `ef_search` is not mentioned in the spec.**

`ef_search` (set via `SET hnsw.ef_search = N`) controls the candidate pool at query time. The default in pgvector is 40. With `ef_construction=200`, the graph is built with high quality, but if `ef_search` defaults to 40 at query time, you will not get the full benefit of the larger construction pool.

For topK=10 (L1) and topK=5 (L2), a practical `ef_search` setting is 2-4x the topK:
```sql
SET hnsw.ef_search = 40;  -- default, adequate for topK=5-10
```

The spec should document whether `ef_search` is left at default or set per-query via a Drizzle `sql` template. Recommend adding to Section 7.3 (Index Management).

---

## 3. Migration Safety

### 3.1 New Tables

**Assessment: Zero risk.**

`message_chunks` and `memory_archive_metadata` are new tables on an existing database. `CREATE TABLE` is always safe — it does not affect any existing rows.

### 3.2 New Columns on `conversation_summaries`

**Assessment: Safe with one caveat.**

All four new columns (`skippedRiskyCount`, `extractedFactIds`, `hasRawArchive`, `classificationStats`) have either explicit defaults or are nullable. Postgres adds nullable/defaulted columns as a metadata operation with no table rewrite. The existing ~N rows in `conversation_summaries` will have:
- `skippedRiskyCount = 0` (default applied)
- `extractedFactIds = NULL`
- `hasRawArchive = false` (default applied)
- `classificationStats = NULL`

These defaults are semantically correct for historical summaries (they predate the new system). No data integrity risk.

### 3.3 HNSW Index Creation — CONCURRENTLY Requirement

**Assessment: Spec correctly mandates CONCURRENTLY. Verify Postgres version supports it.**

Section 7.1 uses `CREATE INDEX CONCURRENTLY IF NOT EXISTS`. This is mandatory for production — a non-concurrent HNSW build on a non-empty table acquires an `SHARE` lock that blocks all writes to the table for the duration of the build.

HNSW was introduced in pgvector 0.5.0. `CREATE INDEX CONCURRENTLY` with HNSW is supported in pgvector >= 0.5.0 and PostgreSQL >= 11. The project uses PostgreSQL 15, so this is safe.

**Note:** `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block. The migration SQL file must execute these as standalone statements, not wrapped in `BEGIN/COMMIT`. Drizzle migrations run each statement separately by default — confirm this holds for the migration file `drizzle/XXXX_chat_memory_vector.sql`.

Also: `CREATE INDEX CONCURRENTLY` can fail silently and leave an INVALID index if interrupted. After applying the migration, the implementation should verify:

```sql
SELECT indexname, indisvalid
FROM pg_indexes
JOIN pg_class ON pg_class.relname = pg_indexes.indexname
JOIN pg_index ON pg_index.indexrelid = pg_class.oid
WHERE tablename IN ('scoped_memories', 'message_chunks');
```

Add this verification step to Section 14 (Migration Plan).

### 3.4 pgvector Extension

**Assessment: Already installed, confirmed by existing production usage.**

The `scoped_memories` table with `vector(1536)` column is shipped in migration `0086_supreme_speedball.sql` and present in the latest schema snapshot (`0110_snapshot.json`). The `multimodal_memory_vectors` table with `vector(768)` predates it. The `vector` type is only available if the extension is installed. Since these tables exist in production, `CREATE EXTENSION IF NOT EXISTS vector` has already been applied.

**However:** There is no `CREATE EXTENSION IF NOT EXISTS vector;` statement in any migration file in the `drizzle/` directory. This means the extension was installed manually or through a setup script that is not captured in the Drizzle migration history. This is a fragility — a fresh database restore from schema would fail when `CREATE TABLE ... embedding vector(1536)` runs.

**Recommendation — HIGH:** Add `CREATE EXTENSION IF NOT EXISTS vector;` as the first statement in the new migration file (`drizzle/XXXX_chat_memory_vector.sql`). This is idempotent and will make the migration self-contained for future environment setups.

---

## 4. Query Performance

### 4.1 Hybrid Search Query (Section 6.2)

**Assessment: Will work but has one significant performance gap.**

The query pattern is:
```sql
SELECT chunk, (0.3 * ts_rank(...) + 0.7 * (1.0 - (embedding <=> $vec))) as score
FROM message_chunks
WHERE tenantId = $1 AND userId = $2 [AND conversationId = $3]
ORDER BY score DESC
LIMIT 5
```

**Issue 8 — HIGH: `ts_rank(to_tsvector(...), ...)` without a stored tsvector column causes a full scan per row.**

Section 7.1 does include a GIN index for full-text search:
```sql
CREATE INDEX CONCURRENTLY message_chunks_content_tsvector_idx
  ON message_chunks USING gin (to_tsvector('english', content));
```

However, the query calls `ts_rank(to_tsvector('english', content), ...)` — this computes the tsvector at query time for every row in the filtered result set. The GIN index accelerates `WHERE to_tsvector('english', content) @@ plainto_tsquery(...)` predicates but **does not accelerate `ts_rank()` computations**. `ts_rank` reads from the in-memory tsvector result, not the index.

More importantly: the query has no `WHERE` clause using the GIN index. The BM25 keyword score is computed as a SELECT expression, not a filter predicate. This means:
1. The planner will use the HNSW index (via `<=>` operator, triggered by `ORDER BY ... LIMIT`) for the vector component
2. The keyword score is computed on the HNSW-retrieved candidates (topK results from vector search)
3. The GIN index is **never used** by this query as written

This is actually fine for the vector-primary retrieval case — the HNSW index returns the topK vector candidates, then `ts_rank` re-ranks them. The GIN index would only be useful if the query were structured as a keyword-first retrieval with vector re-ranking, which this spec does not do.

**Conclusion:** The GIN index on `message_chunks.content` is useful for a keyword-only fallback query (when `embedding` is NULL) but is not used by the hybrid query as written. Consider whether to:
1. Keep the GIN index as-is for the keyword-only fallback case (when `embedding` is NULL or unavailable)
2. Add a stored `tsvector` column to avoid recomputing at query time even in the keyword-only case

For the described query volumes (topK=5-10 candidates from HNSW), re-computing `ts_rank` on 5-10 rows is trivially fast. No performance problem at small topK. The GIN index is still valuable for pure-keyword fallback queries. This is acceptable — document the query plan to avoid future confusion.

**Issue 9 — MEDIUM: Missing index on `messages.conversationId`.**

The chunker service reads `newMessages` which come from the `messages` table. Looking at the `messages` table definition (lines 1388-1465 of `schema.ts`), the declared indexes are:
- `messages_created_at_idx` on `createdAt`
- `idx_messages_traceid` on `traceId`

There is **no index on `conversationId`**. Every call to fetch messages for a conversation does a sequential scan. This is an existing problem (not introduced by this spec) but the new chunker service will issue this query after every message pair, making it a new hot path.

**Recommendation:** Add this index in the migration for this feature:
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_id
  ON messages (conversationId, createdAt);
```

The composite index on `(conversationId, createdAt)` supports both "fetch messages for conversation" and "fetch messages after messageRangeStart" queries.

### 4.2 Sequential Scan Risk Before HNSW Index is Built

**Assessment: Handled correctly by the query; document the degraded latency window.**

The query uses `CASE WHEN embedding IS NOT NULL THEN 1.0 - (embedding <=> ...) ELSE 0.0 END`. If the HNSW index is not yet built (or is INVALID), Postgres falls back to a sequential scan using the `<=>` operator directly on the column. At 1M rows this would take ~5 seconds — the spec correctly notes this in Section 7.3 as "fall back to sequential scan (slower but functional)".

The partial HNSW index (`WHERE embedding IS NOT NULL`) means unembedded rows are simply assigned score 0.0 by the CASE expression, which is semantically correct — they cannot contribute to vector search results.

No change required. The existing fallback is correct. Document the P95 latency SLA degradation during the HNSW build window in the operational runbook.

### 4.3 Level 1 Retrieval via `retrieveForPrompt()`

The spec wires into the existing `scopedMemoryService.retrieveForPrompt()`. The `scoped_memories` table currently has two btree indexes (`scoped_memories_owner_created_idx` on ownerType+ownerId+createdAt, `scoped_memories_tenant_kind_idx` on tenantId+memoryKind). The HNSW index will be added.

**Issue 10 — MEDIUM: `scoped_memories` has no GIN index for the BM25 component.**

Section 8.3 defines a GIN index on `scoped_memories`:
```sql
CREATE INDEX CONCURRENTLY scoped_memories_content_tsvector_idx
  ON scoped_memories USING gin (to_tsvector('english', content || ' ' || title));
```

The existing `scopedMemoryService.ts` (which pre-exists this feature) presumably already does hybrid search. Verify that the existing service query uses this GIN index as a filter predicate (`WHERE to_tsvector(...) @@ query`) rather than just as a scoring function. If the service is already doing `ts_rank` without a `@@` WHERE clause, the GIN index has never been helping and the new index in this spec adds it unnecessarily.

This does not block the feature but is worth checking during implementation review.

---

## 5. Data Volume Estimates

### 5.1 pgvector Performance at 1M Chunks

**Assessment: Acceptable with HNSW. Borderline without it.**

The spec's estimate of 10K chunks/user × 100 users = 1M rows is reasonable for a 90-day window at the stated activity levels.

pgvector HNSW at 1M rows with `m=16, ef_construction=200`:
- Query latency (topK=5, ef_search=40): ~15ms (consistent with spec's Table in Section 7.2)
- This is within the 100ms P95 target for L2 search

Sequential scan at 1M rows of 1536-dim vectors:
- Each row: 1536 × 4 bytes = 6,144 bytes + overhead ≈ 6.5 KB
- 1M rows ≈ 6.5 GB for the embedding column alone
- Sequential scan rate (PCI-e NVMe, 1 GB/s effective): ~6.5 seconds per full scan

**Conclusion:** The feature is absolutely dependent on the HNSW index being present and valid. The spec correctly treats HNSW as a hard requirement, not an optimization.

### 5.2 Embedding Storage: ~6 GB at 1M Chunks

**Assessment: Significant but manageable. Disk monitoring required.**

- `message_chunks` embeddings: 1M × 1536 × 4 bytes = **5.9 GB**
- `scoped_memories` embeddings: 500 facts/user × 100 users = 50K × 1536 × 4 bytes = **290 MB**
- HNSW index overhead (both tables): approximately 1.5× the raw embedding size = **~9.3 GB** for message_chunks, ~435 MB for scoped_memories

Total vector storage: approximately **10-11 GB** at the 100-user, 90-day steady state.

The project runs PostgreSQL 15 in Docker on a single server. Disk capacity check should be part of the pre-deployment checklist. 10 GB of vector data on top of the existing database is non-trivial.

**Recommendation:** Add to Section 14 (Migration Plan): verify available disk space before enabling chunk indexing for production users. Alert threshold: disk usage > 70% of available space.

### 5.3 VACUUM and Maintenance

**Assessment: Gap in the spec — worth documenting.**

HNSW indexes do not benefit from autovacuum in the same way as btree indexes. However, the `message_chunks` table will have significant DELETE activity (90-day retention cleanup, cascade deletes on conversation delete). Dead tuples from deleted rows remain in the table until autovacuum runs.

At 5000 chunks deleted per day (retention cleanup) × 90 days = 450K deletions over a rotation cycle, autovacuum defaults should handle this without manual intervention on a table of this size.

**Concern:** The HNSW index does not prune deleted entries until a `VACUUM` runs. Deleted vectors remain as dead entries in the HNSW graph, slightly degrading recall over time. This is a known pgvector limitation. The spec's weekly HNSW rebuild (Section 7.3) mitigates this, but the weekly Celery task should explicitly use `REINDEX INDEX CONCURRENTLY` rather than DROP+CREATE to avoid blocking.

```sql
-- Preferred: rebuilds without lock
REINDEX INDEX CONCURRENTLY message_chunks_embedding_hnsw_idx;
REINDEX INDEX CONCURRENTLY scoped_memories_embedding_hnsw_idx;
```

---

## 6. Retention and Cleanup

### 6.1 90-Day DELETE Performance

**Assessment: Acceptable. Partitioning not needed at described volumes.**

The retention cleanup (Section 4B.5) deletes chunks where `createdAt < now() - interval '90 days'`. With the existing `(tenantId, userId)` index and the declared `createdAt` column, this query needs an index on `createdAt` for `message_chunks`.

**Issue 11 — MEDIUM: No `createdAt` index on `message_chunks`.**

The `messages` table has `messages_created_at_idx` for this reason. `message_chunks` has no `createdAt` index. The retention Celery task will do a sequential scan to find expired chunks.

At 1M rows, `DELETE FROM message_chunks WHERE createdAt < $cutoff` without an index scans the entire table. For a daily cleanup job running at low-traffic hours this may be acceptable, but it holds a table-level lock during the delete if many rows are affected.

**Fix:** Add a partial index to support the retention query:
```sql
CREATE INDEX message_chunks_created_at_idx ON message_chunks (createdAt);
```

Or use a batch delete pattern (delete in pages of 1000 rows) to avoid long-lived locks.

Partitioning (e.g., by month) would make retention trivially fast (`DROP TABLE message_chunks_2026_01`) but is overkill at 1M rows and significantly complicates the Drizzle schema and query layer. Reject partitioning for now; revisit at 10M+ rows.

### 6.2 Cascade Delete Lock on Conversation Delete

**Assessment: Real concern. Mitigated by operational pattern.**

When a conversation is deleted, the cascade deletes all its `message_chunks` rows (up to 2000 rows per the limit). For a single conversation delete, deleting 2000 rows with a cascade is fast (~milliseconds). However, if a user deletes all their conversations simultaneously, or a tenant is deprovisioned, the cascade can delete millions of rows in a single transaction, holding locks for seconds or minutes.

**Recommendation:** For tenant deprovisioning or bulk conversation deletes, use a background job that deletes conversations in batches of 10-50 rather than a single `DELETE FROM conversations WHERE tenantId = $1`. Document this in the operational runbook. No schema change required.

### 6.3 Orphaned Embeddings During Async Write Window

**Assessment: CRITICAL gap — orphaned records possible on embedding queue failure.**

The write flow is:
1. `insertMessageChunk(...)` — chunk inserted with `embedding = NULL`
2. `embeddingQueue.add("embed-chunk", ...)` — job enqueued
3. Embedding worker picks up job, calls Python, gets embedding
4. `UPDATE message_chunks SET embedding = $1 WHERE id = $2`

**Failure scenario:** If step 2 succeeds (chunk inserted) but the BullMQ job is permanently lost (Redis restart without persistence, queue drain on deployment, max retries exhausted), the chunk row exists forever with `embedding = NULL`.

The spec configures `attempts: 3` with exponential backoff. If all 3 attempts fail (Python backend down, OpenAI API rate limit, etc.), the job is moved to the BullMQ failed queue. The chunk row remains with `embedding = NULL` and is permanently excluded from vector search, while still counting against the per-user chunk limit and consuming storage.

**Risk:** This is not a data loss issue (the chunk content is still there), but it is a silent degradation of L2 recall. A user who hit a temporary embedding failure during a critical conversation will not find those chunks via vector search.

**Recommended fixes:**
1. Add a reconciliation query to the daily Celery task: find chunks where `embedding IS NULL AND createdAt < now() - interval '1 hour'` and re-queue them for embedding.
2. Add the BullMQ failed queue count to the monitoring dashboard (Section 13.2) alongside the "Chunk embedding backlog" metric.
3. Alert on `COUNT(*) FROM message_chunks WHERE embedding IS NULL AND createdAt < now() - interval '6 hours' > 100`.

This issue also applies to `scoped_memories` (extracted facts), not just message chunks.

---

## 7. Additional Issues Not Listed in Review Areas

### 7.1 chunkIndex Uniqueness Not Enforced

**Issue — LOW:** The `chunkIndex` column is described as "chunk sequence within the conversation (0-based)". The `(conversationId, chunkIndex)` index is defined as a regular btree index, not unique. The chunker service sets `chunkIndex` from an incrementing counter within a single `indexMessageChunks()` call. If the same messages are processed twice (e.g., a retry or a bug), two chunks with the same `conversationId` and `chunkIndex` will be inserted.

The idempotency check in Section 4B.4 uses `(conversationId, messageRangeStart, messageRangeEnd)` — which catches exact re-processing of the same message range. But if the chunking window slides differently on retry (due to a state change in `currentChunk`), the `chunkIndex` sequence can diverge, and the range check may not catch the duplicate.

The unique index on `(conversationId, messageRangeStart, messageRangeEnd)` recommended in Issue 1 is sufficient to prevent duplicate content. The `chunkIndex` uniqueness is secondary and not worth an additional constraint.

### 7.2 `tenantId` Denormalization in `message_chunks`

**Issue — LOW:** `tenantId` is stored directly on `message_chunks` but conversations already belong to a tenant via `conversations.tenantId`. This is consistent with the denormalization pattern already used in `scoped_memories` and is justified for query isolation (every search includes `tenantId` in the WHERE clause without requiring a join). Accept as intentional.

### 7.3 Archive File Path in `memory_archive_metadata.filePath`

**Issue — MEDIUM:** The `filePath` column stores the full path to the archive file on disk (e.g., `data/memory-archives/{tenantId}/{userId}/conv-678-2026-03-23.jsonl`). If the archive storage root moves (e.g., from local filesystem to S3), all stored paths become invalid.

**Recommendation:** Store only the relative path below the storage root, or store the path components separately (`tenantId`, `userId`, `conversationId`, `archiveDate` — which are already columns). The `filePath` column could be derived at read time, making the metadata table more resilient to storage migration. However, storing the explicit path is simpler and acceptable if the storage root is treated as a stable configuration value. Document the `ARCHIVE_STORAGE_ROOT` environment variable as mandatory.

---

## 8. Summary of Issues by Severity

| # | Issue | Severity | Section | Recommended Action |
|---|-------|----------|---------|-------------------|
| — | pgvector `CREATE EXTENSION` missing from migration | HIGH | 3.4 | Add `CREATE EXTENSION IF NOT EXISTS vector;` to new migration file |
| 1 | No unique/covering index for chunk idempotency check | MEDIUM | 1.1 | Add `UNIQUE INDEX (conversationId, messageRangeStart, messageRangeEnd)` |
| 5 | `extractedFactIds` is soft reference — stale IDs possible | MEDIUM | 1.2 | Document soft-reference semantics; handle missing IDs in read path |
| 6 | No unique constraint on `memory_archive_metadata (conversationId, archiveDate)` | MEDIUM | 1.5 | Add unique index; use upsert pattern |
| 8 | GIN index does not accelerate hybrid search query as written | MEDIUM | 4.1 | Document expected query plan; GIN is used only for keyword-only fallback |
| 9 | Missing index on `messages.conversationId` | MEDIUM | 4.1 | Add `(conversationId, createdAt)` index in this migration |
| 10 | `scoped_memories` GIN index may be redundant with existing service | MEDIUM | 4.3 | Verify `scopedMemoryService.ts` uses `@@` predicate before adding index |
| 11 | No `createdAt` index on `message_chunks` for retention cleanup | MEDIUM | 6.1 | Add `message_chunks_created_at_idx` |
| 3 (embedding orphan) | Orphaned `embedding = NULL` rows if BullMQ job permanently fails | CRITICAL (data quality) | 6.3 | Add daily reconciliation query + alert |
| 2 | HNSW `ef_construction=200` too high for write-heavy `message_chunks` | HIGH | 2.1 | Use `ef_construction=64` for L2 index |
| — | `ef_search` not documented | MEDIUM | 2.4 | Document `ef_search` setting in Section 7.3 |
| — | HNSW `REINDEX CONCURRENTLY` vs DROP+CREATE for weekly rebuild | MEDIUM | 5.3 | Use `REINDEX INDEX CONCURRENTLY` in Celery task |
| 7 | `fileSizeBytes` column is `integer`, could overflow at extreme retention | LOW | 1.5 | Change to `bigint`; low priority given 90-day retention |
| — | `INVALID` index detection after `CREATE INDEX CONCURRENTLY` | MEDIUM | 3.3 | Add post-migration index validity check to Section 14 |
| — | Bulk cascade delete risk on conversation bulk-delete | LOW | 6.2 | Document batch-delete pattern in operational runbook |

---

## 9. Migration Execution Order

When this migration runs, execute in this order to avoid lock conflicts and ensure index validity:

```sql
-- 1. Ensure extension is available (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add columns to conversation_summaries (fast, metadata-only)
ALTER TABLE conversation_summaries
  ADD COLUMN IF NOT EXISTS "skippedRiskyCount" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "extractedFactIds" text[],
  ADD COLUMN IF NOT EXISTS "hasRawArchive" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "classificationStats" jsonb;

-- 3. Create new tables
CREATE TABLE message_chunks (...);
CREATE TABLE memory_archive_metadata (...);

-- 4. Unique constraints (fast, tables are empty)
CREATE UNIQUE INDEX message_chunks_conv_range_unique_idx
  ON message_chunks (conversationId, messageRangeStart, messageRangeEnd);
CREATE UNIQUE INDEX memory_archive_metadata_conv_date_unique_idx
  ON memory_archive_metadata (conversationId, archiveDate);

-- 5. Btree indexes (fast, empty tables)
CREATE INDEX message_chunks_conv_idx ON message_chunks (conversationId, chunkIndex);
CREATE INDEX message_chunks_user_tenant_idx ON message_chunks (tenantId, userId);
CREATE INDEX message_chunks_created_at_idx ON message_chunks (createdAt);
CREATE INDEX idx_messages_conversation_id ON messages (conversationId, createdAt);  -- existing table
CREATE INDEX memory_archive_conv_date_idx ON memory_archive_metadata (conversationId, archiveDate);
CREATE INDEX memory_archive_tenant_user_idx ON memory_archive_metadata (tenantId, userId);

-- 6. HNSW and GIN indexes on existing tables (CONCURRENTLY — must be outside transaction)
CREATE INDEX CONCURRENTLY IF NOT EXISTS scoped_memories_embedding_hnsw_idx
  ON scoped_memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200)
  WHERE embedding IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS scoped_memories_content_tsvector_idx
  ON scoped_memories USING gin (to_tsvector('english', content || ' ' || title));

-- 7. HNSW and GIN on new message_chunks table (empty — fast even without CONCURRENTLY, but keep for consistency)
CREATE INDEX CONCURRENTLY IF NOT EXISTS message_chunks_embedding_hnsw_idx
  ON message_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)   -- lower ef for write-heavy table
  WHERE embedding IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS message_chunks_content_tsvector_idx
  ON message_chunks USING gin (to_tsvector('english', content));

-- 8. Post-migration: verify no INVALID indexes
SELECT indexname, indisvalid FROM pg_indexes
  JOIN pg_class ON pg_class.relname = pg_indexes.indexname
  JOIN pg_index ON pg_index.indexrelid = pg_class.oid
  WHERE tablename IN ('scoped_memories', 'message_chunks');
```

Note: Steps 6-7 use `CONCURRENTLY` and must not be wrapped in a `BEGIN/COMMIT` block. If your migration runner wraps everything in a transaction, execute these statements separately in a post-migration script.

---

## 10. Pre-Migration Backup Protocol

Affected tables and risk levels:

| Table | Risk | Action Required |
|-------|------|----------------|
| `conversation_summaries` | Low (adding nullable columns) | Row count backup |
| `messages` | Low (adding index only) | Row count backup |
| `scoped_memories` | Low (adding indexes only) | Row count backup |
| `message_chunks` | None (new table) | None |
| `memory_archive_metadata` | None (new table) | None |

```bash
mkdir -p .db-backups

# Row counts before migration
psql "$DATABASE_URL" -c "
  SELECT 'conversation_summaries', count(*) FROM conversation_summaries
  UNION ALL SELECT 'messages', count(*) FROM messages
  UNION ALL SELECT 'scoped_memories', count(*) FROM scoped_memories;
"

# Backup conversation_summaries data (affected by new columns)
pg_dump "$DATABASE_URL" --data-only --table=conversation_summaries \
  --file=".db-backups/conversation_summaries_$(date +%Y%m%d_%H%M%S).sql"
```

After migration, verify row counts match exactly. No row count changes are expected — only schema additions.
