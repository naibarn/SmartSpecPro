# Section 08: Memory Purge Job

## Overview

This section implements a Celery beat task that performs daily hard-deletion of expired data across three tables: soft-deleted `agency_agent_memories` (30-day grace period), expired `agency_memory_chunks` (TTL-based via `expiresAt`), and old `agency_run_traces` (30-day retention). Scheduled at 5:00 AM UTC.

**Depends on**: section-01-db-migration (the `agency_memory_chunks` table must exist)
**Blocks**: section-10-tests-verification
**Parallelizable with**: section-02, section-03, section-05

---

## Files to Create

| File | Purpose |
|------|---------|
| `python-backend/app/tasks/memory_purge_task.py` | Celery task for daily purge |
| `python-backend/tests/unit/test_memory_purge_task.py` | Unit tests |

## Files to Modify

| File | Change |
|------|--------|
| `python-backend/app/core/celery_app.py` | Add purge task to `beat_schedule` |

---

## Tests (Write First)

**File**: `python-backend/tests/unit/test_memory_purge_task.py`

```python
# Test: purge deletes soft-deleted memories older than 30 days
#   Assert: DELETE WHERE "isActive" = false AND "updatedAt" < NOW() - 30 days

# Test: purge does NOT delete active memories regardless of age
#   Assert: WHERE clause includes "isActive" = false

# Test: purge deletes expired chunks (expiresAt < now)
#   Assert: DELETE WHERE "expiresAt" < NOW()

# Test: purge does NOT delete unexpired chunks

# Test: purge deletes agency_run_traces older than 30 days
#   Assert: DELETE WHERE "createdAt" < NOW() - 30 days

# Test: purge logs counts for each deletion type
#   Assert: logger.info called with all three counts

# Test: purge task registered in Celery beat at 5:00 AM UTC
#   Assert: beat_schedule has "purge-expired-agency-memories" with crontab(hour=5, minute=0)
```

---

## Implementation Details

### Celery Task: `memory_purge_task.py`

Follow the pattern from `memory_decay_task.py`:

```python
@celery_app.task(name="agency.purge_expired_memories", bind=True, max_retries=1)
def purge_expired_memories(self):
    """Daily purge: hard-delete expired memories, chunks, and traces."""
```

Use the sync-to-async bridge pattern (try `get_event_loop()`, fall back to `new_event_loop()`).

### `_run_purge()` async function

Uses deferred import of `AsyncSessionLocal`. Executes three DELETE statements via `sqlalchemy.text()`:

**Step 1 — Hard-delete soft-deleted memories (30-day grace)**:
```sql
DELETE FROM agency_agent_memories
WHERE "isActive" = false AND "updatedAt" < NOW() - INTERVAL '30 days'
```

**Step 2 — Hard-delete expired chunks (TTL)**:
```sql
DELETE FROM agency_memory_chunks WHERE "expiresAt" < NOW()
```

**Step 3 — Hard-delete old run traces (30-day retention)**:
```sql
DELETE FROM agency_run_traces WHERE "createdAt" < NOW() - INTERVAL '30 days'
```

Single `await session.commit()` after all three. Return `{"memories_purged": N, "chunks_purged": N, "traces_purged": N}`.

### Beat Schedule Entry

In `celery_app.py`, add after `decay-agent-memories` entry:

```python
"purge-expired-agency-memories": {
    "task": "agency.purge_expired_memories",
    "schedule": crontab(hour=5, minute=0),
},
```

Runs 30 minutes after decay job (4:30 AM), ensuring low-confidence memories are deactivated first.

---

## Retention Policy

| Data | Retention | Mechanism |
|------|-----------|-----------|
| Active memories (L1) | Until confidence < 0.1 | Existing decay job deactivates |
| Soft-deleted memories | 30 days after deactivation | This purge job |
| Memory chunks (L2) | Tenant-configurable (default 7d) | This purge job via expiresAt |
| agency_run_traces | 30 days | This purge job |
| Working memory (Redis) | 1 hour TTL | Redis auto-expire |

## Key Decisions

- **Raw SQL via `text()`**: No SQLAlchemy model for `agency_run_traces`; raw SQL for consistency
- **Single transaction**: All deletes atomic; failure defers cleanup by one day
- **No batch limiting**: DELETE with proper indexes is fast even for thousands of rows
