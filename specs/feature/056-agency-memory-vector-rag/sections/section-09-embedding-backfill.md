# Section 09: Embedding Backfill

## Overview

This section implements a one-time Celery task (`agency.backfill_memory_embeddings`) that batch-generates embeddings for all existing `agency_agent_memories` rows with `embedding IS NULL AND isActive = true`. Resumable, processes in batches of 100, degrades gracefully on API errors. Also covers the lazy backfill path in `get_memories_for_agent()`.

**Depends on**: section-01 (embedding column), section-02 (EmbeddingService integration in LongTermMemoryService)
**Blocks**: section-10-tests-verification

---

## Files to Create

| File | Purpose |
|------|---------|
| `python-backend/app/tasks/memory_backfill_task.py` | One-time Celery backfill task |
| `python-backend/tests/unit/test_memory_backfill_task.py` | Unit tests |

## Files to Modify

| File | Change |
|------|--------|
| `python-backend/app/services/long_term_memory.py` | Add lazy backfill in `get_memories_for_agent()` |

---

## Tests (Write First)

**File**: `python-backend/tests/unit/test_memory_backfill_task.py`

```python
# Test: backfill generates embeddings only for rows with embedding IS NULL AND isActive = true
# Test: backfill skips rows that already have embeddings (resumable)
# Test: backfill processes in batches of 100
# Test: backfill handles EmbeddingService errors gracefully (skips, logs, continues)
# Test: backfill updates rows with generated embeddings
```

**In `test_long_term_memory.py`**:
```python
# Test: lazy backfill in get_memories_for_agent generates embedding on-the-fly for unembedded memory
```

---

## Implementation Details

### Batch Backfill Task

**File**: `python-backend/app/tasks/memory_backfill_task.py`

Follow `memory_decay_task.py` pattern:

```python
@celery_app.task(name="agency.backfill_memory_embeddings", bind=True, max_retries=1)
def backfill_memory_embeddings(self):
    """One-time task to batch-embed existing memories without embeddings."""
```

### `_run_backfill()` async function

1. Deferred import `AsyncSessionLocal`, `AgencyAgentMemory`, `EmbeddingService`
2. Initialize `EmbeddingService()` with default config
3. Loop:
   a. Query: `SELECT * FROM agency_agent_memories WHERE embedding IS NULL AND isActive = true ORDER BY id ASC LIMIT 100`
   b. If empty, break
   c. Call `embedding_service.embed_batch([m.content for m in rows])`
   d. On success: UPDATE each row's embedding
   e. On failure: log warning, increment error counter, continue
   f. `await session.commit()` after each batch
4. Return `{"processed": total, "errors": errors, "batches": batches}`

**Constants**: `BACKFILL_BATCH_SIZE = 100`

**Key decisions**:
- NOT added to Celery beat (one-time job)
- Idempotent — re-running only processes rows still missing embeddings
- Uses `ORDER BY id ASC` for deterministic pagination (no OFFSET needed)
- Triggered via `celery_app.send_task("agency.backfill_memory_embeddings")` or admin API

### Lazy Backfill in `get_memories_for_agent()`

**File**: `python-backend/app/services/long_term_memory.py`

Add after retrieval, before returning results:

```python
async def _lazy_backfill_embedding(self, memory: AgencyAgentMemory) -> None:
    """Generate and store embedding for memory saved without one. Fire-and-forget."""
```

- If `embedding_service` available and memory has `embedding is None`:
  - Call `embed(memory.content)` in try/except
  - On success: UPDATE the row's embedding
  - On failure: log warning, don't raise

Sequential await is preferred over `create_task()` for db session safety.

---

## Expected Cost & Performance

- ~2000 existing active memories
- 20 batches × ~1.5s each = ~30 seconds
- Cost: ~$0.04 (text-embedding-3-small)

## Triggering

Options:
- **Admin API endpoint**: `celery_app.send_task("agency.backfill_memory_embeddings")`
- **Manual**: `python -c "from app.core.celery_app import celery_app; celery_app.send_task('agency.backfill_memory_embeddings')"`
- **Auto on deploy**: Startup hook checking for unembedded memories, gated by Redis key

## Verification

1. After backfill: `SELECT count(*) FROM agency_agent_memories WHERE embedding IS NULL AND isActive = true` → 0
2. Re-running returns `processed: 0` (idempotent)
3. All tests pass
