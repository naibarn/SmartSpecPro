The scheduler.ts is actually for Cloud Tasks, not for general cron. The project uses BullMQ repeatable jobs for recurring tasks (as seen in escalationJob.ts and notificationDigestJob.ts). Now I have all the context needed.

# Section 09: Background Tasks

## Overview

This section implements five recurring background tasks for the chat memory vector RAG system:

1. **Archive cleanup** -- BullMQ repeatable job (daily 03:00 UTC)
2. **Chunk cleanup** -- BullMQ repeatable job (daily 03:30 UTC)
3. **Orphaned embedding reconciliation** -- BullMQ repeatable job (daily 04:00 UTC)
4. **HNSW index rebuild** -- Celery beat task (weekly Sunday 04:00 UTC)
5. **Memory eviction** -- BullMQ repeatable job (daily 05:00 UTC)

**Depends on:** section-08-process-integration (pipeline must be wired before maintenance tasks make sense)

**Blocks:** Nothing (leaf section, parallelizable with section-10 and section-12)

---

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/jobs/memoryMaintenanceJobs.ts` | All four BullMQ repeatable jobs (archive cleanup, chunk cleanup, embedding reconciliation, memory eviction) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/jobs/__tests__/memoryMaintenanceJobs.test.ts` | Tests for all four Node.js background tasks |
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/memory_maintenance_tasks.py` | Celery task for HNSW index rebuild |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_memory_maintenance_tasks.py` | Tests for Celery HNSW rebuild task |

## Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py` | Add task route + beat_schedule entry for `memory.rebuild_hnsw_indexes` |

---

## Tests First

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/jobs/__tests__/memoryMaintenanceJobs.test.ts`

Tests follow the pattern established by `escalationJob.test.ts` -- export core logic functions separately from BullMQ init so logic can be tested directly without queue infrastructure.

```
# Test: archive cleanup reads per-tenant retention setting from system_settings
# Test: archive cleanup calls cleanupExpiredArchives(tenantId, retentionDays) for each tenant
# Test: archive cleanup enforces 7-day minimum floor (setting=3 becomes 7)
# Test: archive cleanup skips tenants where chat_archive_enabled flag is OFF
# Test: archive cleanup logs completion with tenantsProcessed count and durationMs

# Test: chunk cleanup reads per-tenant retention (default 90 days) from system_settings
# Test: chunk cleanup deletes message_chunks where createdAt < NOW() - retention interval
# Test: chunk cleanup scopes deletion to tenantId (no cross-tenant deletion)
# Test: chunk cleanup logs deleted count

# Test: orphaned embedding reconciliation finds message_chunks with NULL embedding created > 1 hour ago
# Test: orphaned embedding reconciliation finds scoped_memories with NULL embedding created > 1 hour ago
# Test: orphaned embedding reconciliation limits batch to 200 records per run
# Test: orphaned embedding reconciliation re-queues each orphan to "memory-embedding" BullMQ queue
# Test: orphaned embedding reconciliation logs orphanedChunks and orphanedMemories counts
# Test: orphaned embedding reconciliation logs warning when orphan count > 50

# Test: memory eviction step 1 -- deletes scoped_memories past expiresAt for a given user
# Test: memory eviction step 2 -- decays memories with importance < 3 AND reinforcementCount = 0 AND lastAccessedAt > 30 days
# Test: memory eviction step 3 -- compact merges similar memories (cosine > 0.95 from DB query)
# Test: memory eviction runs all steps in order: expire -> decay -> compact -> warn
# Test: memory eviction only runs for users with scoped_memories count >= 500 (ownerType='user')
# Test: memory eviction logs per-user: expired, decayed, compacted counts
```

### Test file: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_memory_maintenance_tasks.py`

```
# Test: rebuild_hnsw_indexes calls REINDEX INDEX CONCURRENTLY on scoped_memories_embedding_hnsw_idx
# Test: rebuild_hnsw_indexes calls REINDEX INDEX CONCURRENTLY on message_chunks_embedding_hnsw_idx
# Test: rebuild_hnsw_indexes checks indisvalid for both indexes after rebuild
# Test: rebuild_hnsw_indexes logs error when any index has indisvalid = false
# Test: rebuild_hnsw_indexes succeeds silently when all indexes are valid
# Test: rebuild_hnsw_indexes runs without error when indexes do not exist (graceful handling)
```

---

## Implementation Details

### 1. BullMQ Jobs Module: `memoryMaintenanceJobs.ts`

**Pattern:** Follow the exact pattern from `/home/dev/projects/SmartSpecPro/apps/web/server/jobs/escalationJob.ts`:
- Module-level `let queue: Queue | null = null` and `let worker: Worker | null = null`
- `initializeMemoryMaintenanceJobs()` function (idempotent, called once at server startup)
- Uses `getRealtimeClient().duplicate()` for both queue and worker connections
- Exports core logic functions separately for direct testing (e.g., `executeArchiveCleanup()`, `executeChunkCleanup()`, etc.)
- `shutdownMemoryMaintenanceJobs()` for graceful shutdown

**Queue name:** `"memory-maintenance"`

**Single queue, multiple job schedulers** -- use `queue.upsertJobScheduler()` with distinct scheduler IDs for each task:

```
Scheduler ID                     | Schedule              | Job name
---------------------------------|-----------------------|-----------------------------
"memory-archive-cleanup"         | pattern: "0 3 * * *"  | "archive-cleanup"
"memory-chunk-cleanup"           | pattern: "0 30 3 * *" | "chunk-cleanup"
"memory-embedding-reconciliation"| pattern: "0 4 * * *"  | "embedding-reconciliation"
"memory-eviction"                | pattern: "0 5 * * *"  | "eviction"
```

**Worker concurrency:** 1 (these are serialized daily tasks, not high-throughput)

**Worker processor:** Switch on `job.name` to route to the correct handler function.

### 2. Archive Cleanup: `executeArchiveCleanup()`

**Logic:**
1. Get database connection via `getDb()`
2. Query all distinct `tenantId` values from `memory_archive_metadata` table (avoid scanning all tenants -- only those with archives)
3. For each tenant:
   a. Read `chat_archive_retention_days` from `system_settings` (default: 90)
   b. Enforce 7-day minimum floor: `Math.max(retentionDays, 7)`
   c. Call `cleanupExpiredArchives(tenantId, effectiveRetention)` from `memoryArchiveService.ts` (section-02)
4. Log completion: `[memoryMaintenance] archive_cleanup_completed { tenantsProcessed, durationMs }`

**Dependencies from other sections:**
- `cleanupExpiredArchives()` from section-02 (`memoryArchiveService.ts`)
- `system_settings` table for per-tenant retention config
- `memory_archive_metadata` table from section-01

### 3. Chunk Cleanup: `executeChunkCleanup()`

**Logic:**
1. Get database connection
2. Query distinct `tenantId` values from `message_chunks` table
3. For each tenant:
   a. Read `chat_chunk_retention_days` from `system_settings` (default: 90)
   b. Delete from `message_chunks` where `tenantId = X AND createdAt < NOW() - interval`
   c. Use parameterized SQL (not string interpolation) for the interval:
      ```typescript
      sql`${messageChunks.createdAt} < NOW() - make_interval(days => ${retentionDays})`
      ```
4. Log: `[memoryMaintenance] chunk_cleanup_completed { tenantsProcessed, totalDeleted, durationMs }`

**Dependencies:**
- `messageChunks` table from section-01 (schema)
- Drizzle ORM delete operation

### 4. Orphaned Embedding Reconciliation: `executeEmbeddingReconciliation()`

**Logic:**
1. Find `message_chunks` with `embedding IS NULL AND createdAt < NOW() - INTERVAL '1 hour'`, limit 200
2. Find `scoped_memories` with `embedding IS NULL AND createdAt < NOW() - INTERVAL '1 hour' AND ownerType = 'user'`, limit 200
3. For each orphan, add job to the `memory-embedding` BullMQ queue (from section-03, `embeddingQueue.ts`):
   - Chunk: `{ type: "message_chunk", recordId: chunk.id, text: chunk.content }`
   - Memory: `{ type: "scoped_memory", recordId: memory.id, text: memory.title + " " + memory.content }`
4. Log counts: `[memoryMaintenance] embedding_reconciliation_completed { orphanedChunks, orphanedMemories, requeuedTotal, durationMs }`
5. If `orphanedChunks + orphanedMemories > 50`, log a warning: `[memoryMaintenance] WARN high_orphan_count -- embedding service may be degraded`

**Dependencies:**
- `enqueueEmbedding()` or queue access from section-03 (`embeddingQueue.ts`)
- `messageChunks` and `scopedMemories` from schema

### 5. Memory Eviction: `executeMemoryEviction()`

**Logic:**
1. Find users with >= 500 scoped memories (ownerType = 'user'):
   ```sql
   SELECT "ownerId", COUNT(*) as cnt FROM scoped_memories
   WHERE "ownerType" = 'user'
   GROUP BY "ownerId" HAVING COUNT(*) >= 500
   ```
2. For each user, execute eviction steps in order:

   **Step 1 -- Expire:** Delete where `expiresAt IS NOT NULL AND expiresAt < NOW()`

   **Step 2 -- Decay:** Delete where `importance < 3 AND reinforcementCount = 0 AND (lastAccessedAt IS NULL OR lastAccessedAt < NOW() - INTERVAL '30 days')`

   **Step 3 -- Compact:** Find pairs with cosine similarity > 0.95:
   ```sql
   SELECT a.id, b.id, 1 - (a.embedding <=> b.embedding) as similarity
   FROM scoped_memories a, scoped_memories b
   WHERE a."ownerId" = $1 AND b."ownerId" = $1
     AND a."ownerType" = 'user' AND b."ownerType" = 'user'
     AND a.id < b.id
     AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
     AND 1 - (a.embedding <=> b.embedding) > 0.95
   LIMIT 50
   ```
   For each pair: keep the one with higher importance (or higher reinforcementCount as tiebreaker), append the other's content, delete the duplicate.

   **Step 4 -- Warn:** If user still has >= 500 after eviction, log warning (future: toast notification).

3. Log per-user: `[memoryMaintenance] memory_eviction { userId, expired, decayed, compacted, remainingCount }`

**Dependencies:**
- `scopedMemories` table (existing schema)
- pgvector cosine distance operator `<=>`

### 6. HNSW Index Rebuild: Celery Task

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/memory_maintenance_tasks.py`

```python
# Task name: "memory.rebuild_hnsw_indexes"
# Decorated with @celery_app.task(name="memory.rebuild_hnsw_indexes")
# Uses get_sync_session() (same pattern as existing maintenance tasks)
#
# Steps:
# 1. REINDEX INDEX CONCURRENTLY scoped_memories_embedding_hnsw_idx
# 2. REINDEX INDEX CONCURRENTLY message_chunks_embedding_hnsw_idx
# 3. Verify indisvalid = true for both indexes via pg_index query
# 4. Log error if any index is invalid
```

**Celery beat schedule entry** to add in `celery_app.py`:

```python
# In beat_schedule dict:
"rebuild-hnsw-indexes": {
    "task": "memory.rebuild_hnsw_indexes",
    "schedule": crontab(hour=4, minute=0, day_of_week=0),  # Sunday 04:00 UTC
},
```

**Task route** to add in `task_routes` dict:

```python
"memory.rebuild_hnsw_indexes": {"queue": "media"},  # lightweight, periodic
```

### 7. Server Startup Integration

The `initializeMemoryMaintenanceJobs()` function should be called during server startup, alongside the existing BullMQ job initializers. Find where `initializeEscalationJob()` is called and add `initializeMemoryMaintenanceJobs()` at the same location.

The `shutdownMemoryMaintenanceJobs()` function should be called during graceful shutdown, alongside `shutdownEscalationJob()`.

---

## Key Conventions

- **Logging prefix:** `[memoryMaintenance]` for all log lines (consistent with `[escalationJob]`, `[DigestJob]` patterns)
- **Error handling:** Each task wraps its entire body in try/catch. Errors are logged but do not crash the worker. Individual tenant/user failures are caught and logged separately so one failure does not block processing of other tenants/users.
- **Drizzle imports:** Import schema tables from `../../drizzle/schema` (relative to jobs directory)
- **No direct DB mutations in tests:** Mock `getDb()` return value and verify SQL operations via mock assertions (same pattern as `escalationJob.test.ts`)
- **BullMQ upsertJobScheduler:** Use `pattern` property (cron string) inside the repeatable options, not `every` (milliseconds). This matches the cron-style scheduling described in the plan.

---

## Security Considerations

- **Tenant isolation:** All cleanup queries include `tenantId` in WHERE clauses. No cross-tenant data access.
- **Parameterized SQL:** Retention days passed via parameterized queries, never string-interpolated into SQL.
- **Batch limits:** Orphan reconciliation limited to 200 per run to prevent queue flooding.
- **Eviction compaction limit:** Compact step limited to 50 pairs per user per run to bound execution time.
- **No secret exposure:** Tasks log counts and IDs only, never memory content or embeddings.

---

## Verification Checklist

1. All four BullMQ jobs register via `upsertJobScheduler` with correct cron patterns
2. Worker routes jobs by `job.name` to correct handler
3. Archive cleanup honors 7-day minimum floor
4. Chunk cleanup uses parameterized interval (not string interpolation)
5. Embedding reconciliation re-queues to the correct `memory-embedding` queue with valid job payloads
6. Memory eviction follows expire -> decay -> compact -> warn sequence
7. Celery beat schedule entry added for weekly HNSW rebuild
8. `REINDEX INDEX CONCURRENTLY` used (not `REINDEX INDEX` which takes an exclusive lock)
9. `initializeMemoryMaintenanceJobs()` called at server startup
10. `shutdownMemoryMaintenanceJobs()` called at graceful shutdown
11. All tests pass with mocked DB and queue dependencies