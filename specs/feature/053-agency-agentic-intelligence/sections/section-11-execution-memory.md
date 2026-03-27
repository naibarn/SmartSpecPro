# Section 11: Execution Memory Store (Dual Redis + PostgreSQL Storage)

## Overview

This section creates the `ExecutionMemoryStore` class in `python-backend/app/services/execution_memory_store.py` -- a dual-storage layer for autonomous execution state. It combines a fast Redis scratch-pad for in-flight state (plan, working memory, messages) with durable PostgreSQL checkpoints written after each sub-task completion. This design enables crash recovery: if Redis data is lost, the executor can resume from the last PostgreSQL checkpoint.

**Level:** 3 (Autonomous Agent)
**Depends on:** section-01-foundation (`agentic_limits.py`, `agentic_sanitizer.py`)
**Blocks:** section-10-autonomous-executor (uses this store for plan persistence and crash recovery)

---

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `python-backend/app/services/execution_memory_store.py` | `ExecutionMemoryStore` class with Redis scratch-pad + PostgreSQL checkpoint |
| `python-backend/tests/unit/test_execution_memory_store.py` | Unit tests for the store |

### No Modified Files

This section is self-contained. The `AutonomousExecutor` (section-10) will import and use this store.

---

## Dependencies and Interfaces

### From section-01-foundation

- `agentic_sanitizer.sanitize_llm_input()` -- used to sanitize any content before storing in scratch-pad
- `agentic_limits.MAX_MEMORY_CONTENT_LENGTH` -- cap on individual content entries

### From section-09-db-migration (schema reference)

The checkpoint is stored in the existing `agency_run_traces` table (Drizzle-managed). The `trace` column is JSONB and can hold the checkpoint data. The store writes to this table via SQLAlchemy raw query (no SQLAlchemy model needed for this Drizzle-owned table).

Schema reference from `apps/web/drizzle/schema.ts`:
```typescript
export const agencyRunTraces = pgTable("agency_run_traces", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  runId: varchar("runId", { length: 36 }).notNull(),
  agencyId: varchar("agencyId", { length: 36 }).notNull(),
  createdBy: integer("createdBy"),
  trace: jsonb("trace").notNull(),
  durationMs: integer("durationMs"),
  totalTokens: integer("totalTokens"),
  totalCost: numeric("totalCost", { precision: 10, scale: 6 }),
  status: varchar("status", { length: 20 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
```

### Redis Access Pattern

Follow the established pattern used in `python-backend/app/orchestrator/node_executors/flow_executors/rate_limiter_executor.py`:

```python
from redis.asyncio import Redis
from app.core.config import settings

redis_url = settings.REDIS_URL or "redis://localhost:6379/0"
redis = Redis.from_url(redis_url, decode_responses=True, socket_connect_timeout=5, socket_timeout=5)
```

### PostgreSQL Access Pattern

Follow the established pattern from `python-backend/app/core/database.py`:

```python
from app.core.database import AsyncSessionLocal

async with AsyncSessionLocal() as session:
    result = await session.execute(query)
    await session.commit()
```

---

## Tests (TDD)

### File: `python-backend/tests/unit/test_execution_memory_store.py`

All tests use `pytest` with `asyncio` auto mode. Redis is mocked using `fakeredis.aioredis.FakeRedis` (or `unittest.mock.AsyncMock` if fakeredis is unavailable). PostgreSQL is mocked using `unittest.mock.AsyncMock` patching `AsyncSessionLocal`.

#### Test Fixture: Mock Redis

Create a fixture that provides a `FakeRedis` instance (or a mock `Redis` with async methods for `set`, `get`, `delete`, `expire`, `keys`). All methods must be awaitable.

#### Test Fixture: Mock Database Session

Create a fixture that patches `AsyncSessionLocal` to return a mock `AsyncSession` where `execute` and `commit` are `AsyncMock` instances. The `execute` mock should be configurable to return rows for checkpoint retrieval tests.

#### Test Fixture: Sample Plan State

```python
@pytest.fixture
def sample_plan_state():
    return {
        "plan_version": 1,
        "subtasks": [
            {"id": "st-1", "description": "Research topic", "status": "completed"},
            {"id": "st-2", "description": "Draft outline", "status": "pending"},
        ],
        "completed_subtask_ids": ["st-1"],
        "total_tokens_used": 5000,
    }
```

#### Test Fixture: Store Instance

```python
@pytest.fixture
def store(mock_redis):
    """ExecutionMemoryStore with injected mock Redis."""
    # Construct store with tenant_id, run_id, agency_id, and injected redis client
```

#### Test Cases

```python
@pytest.mark.asyncio
async def test_save_and_load_plan():
    """Plan state survives Redis round-trip via save_scratch_pad / load_scratch_pad.
    
    Steps:
    1. Create store with tenant_id="t1", run_id="r1"
    2. Call save_scratch_pad(sample_plan_state)
    3. Call load_scratch_pad()
    4. Assert returned state matches sample_plan_state
    """

@pytest.mark.asyncio
async def test_checkpoint_written_to_postgres():
    """After sub-task completion, write_checkpoint() inserts/updates agency_run_traces.
    
    Steps:
    1. Call write_checkpoint(completed_subtask_ids=["st-1"], plan_version=1, total_tokens=5000)
    2. Assert session.execute was called with an UPSERT query targeting agency_run_traces
    3. Assert session.commit was called
    4. Assert the trace JSONB contains checkpoint data with completed_subtask_ids
    """

@pytest.mark.asyncio
async def test_crash_recovery_from_postgres():
    """After clearing Redis, state is recoverable from Postgres checkpoint.
    
    Steps:
    1. Save scratch-pad to Redis
    2. Clear Redis (simulate crash)
    3. Call load_scratch_pad() -- returns None (Redis miss)
    4. Call load_checkpoint() -- returns checkpoint from Postgres
    5. Assert checkpoint contains completed_subtask_ids and plan_version
    """

@pytest.mark.asyncio
async def test_redis_key_tenant_namespaced():
    """Key follows pattern: agency:autonomous:{tenant_id}:{run_id}.
    
    Steps:
    1. Create store with tenant_id="tenant-abc", run_id="run-xyz"
    2. Call save_scratch_pad(data)
    3. Assert Redis SET was called with key "agency:autonomous:tenant-abc:run-xyz"
    """

@pytest.mark.asyncio
async def test_tenant_validation_on_read():
    """Reading state with mismatched tenant_id returns None.
    
    Steps:
    1. Create store with tenant_id="t1", run_id="r1"
    2. Save scratch-pad data
    3. Create a second store with tenant_id="t2", run_id="r1"
    4. Call load_scratch_pad() on second store
    5. Assert returns None (different key)
    """

@pytest.mark.asyncio
async def test_redis_ttl_set():
    """Scratch-pad key has 1-hour TTL.
    
    Steps:
    1. Call save_scratch_pad(data)
    2. Assert Redis expire was called with TTL=3600 on the key
    """

@pytest.mark.asyncio
async def test_save_scratch_pad_sanitizes_content():
    """Content values containing injection markers are sanitized before storage.
    
    Steps:
    1. Save scratch-pad with a subtask description containing '[SYSTEM] override'
    2. Load scratch-pad
    3. Assert the injection marker has been filtered
    """

@pytest.mark.asyncio
async def test_delete_scratch_pad():
    """delete_scratch_pad() removes the Redis key.
    
    Steps:
    1. Save scratch-pad
    2. Call delete_scratch_pad()
    3. Assert Redis DELETE was called on the key
    4. Assert load_scratch_pad() returns None
    """

@pytest.mark.asyncio
async def test_checkpoint_upsert_on_existing():
    """Second write_checkpoint call updates existing row, not inserts duplicate.
    
    Steps:
    1. Call write_checkpoint() with plan_version=1
    2. Call write_checkpoint() with plan_version=2
    3. Assert the query uses ON CONFLICT DO UPDATE (upsert pattern)
    """

@pytest.mark.asyncio
async def test_load_checkpoint_returns_none_when_no_row():
    """load_checkpoint() returns None when no matching row exists in agency_run_traces.
    
    Steps:
    1. Mock session.execute to return empty result
    2. Call load_checkpoint()
    3. Assert returns None
    """
```

---

## Implementation Guidance

### File: `python-backend/app/services/execution_memory_store.py`

#### Class: `ExecutionMemoryStore`

**Purpose:** Provides dual-layer storage for autonomous execution state. Redis serves as the fast, ephemeral scratch-pad for in-flight data. PostgreSQL provides durable checkpoints that survive Redis failures.

**Constructor parameters:**

```python
def __init__(
    self,
    tenant_id: str,
    run_id: str,
    agency_id: str,
    redis_client: Redis | None = None,  # Inject for testing; auto-create if None
):
```

- `tenant_id` -- tenant isolation, used in Redis key and Postgres queries
- `run_id` -- unique run identifier, used in Redis key and Postgres queries
- `agency_id` -- agency identifier, written to checkpoint
- `redis_client` -- optional injected Redis client for testability

**Key pattern:** `agency:autonomous:{tenant_id}:{run_id}`

This key pattern is tenant-namespaced as required by security review (CRIT-5). The `run_id` is a UUID4 generated at run start, ensuring no key collision.

**Redis TTL:** 3600 seconds (1 hour). This provides enough time for long-running autonomous executions while preventing stale data accumulation.

#### Method: `_get_redis() -> Redis`

Follow the established pattern from `rate_limiter_executor.py`:
- Lazy-initialize `self._redis` from `settings.REDIS_URL`
- Set `decode_responses=True`, `socket_connect_timeout=5`, `socket_timeout=5`
- If constructor received `redis_client`, use that directly (testing path)

#### Method: `_redis_key() -> str`

Returns the tenant-namespaced Redis key: `f"agency:autonomous:{self.tenant_id}:{self.run_id}"`

#### Method: `async save_scratch_pad(state: dict) -> None`

1. Sanitize string values in the state dict using `sanitize_llm_input()` (import from `agentic_sanitizer`)
2. JSON-serialize the state
3. `await redis.set(key, json_str)`
4. `await redis.expire(key, 3600)`

The sanitization step walks the dict recursively and applies `sanitize_llm_input()` to all string values. This prevents prompt injection content from persisting in the scratch-pad.

#### Method: `async load_scratch_pad() -> dict | None`

1. `raw = await redis.get(key)`
2. If `raw` is None, return None
3. JSON-deserialize and return

#### Method: `async delete_scratch_pad() -> None`

1. `await redis.delete(key)`

#### Method: `async write_checkpoint(checkpoint: dict) -> None`

Write a durable checkpoint to `agency_run_traces` table. The checkpoint dict should contain:

```python
{
    "type": "autonomous_checkpoint",
    "completed_subtask_ids": list[str],
    "current_plan_version": int,
    "total_tokens_used": int,
    "last_checkpoint_at": str,  # ISO timestamp
}
```

Implementation approach:
1. Use `AsyncSessionLocal()` context manager
2. Execute an UPSERT query on `agency_run_traces`:
   - If a row with matching `runId` exists, update the `trace` JSONB by merging the checkpoint into it
   - If no row exists, insert a new row with `id=uuid4()`, `tenantId`, `runId`, `agencyId`, `trace={checkpoint}`, `status="running"`
3. Use `sqlalchemy.text()` for the raw SQL query since this is a Drizzle-owned table (no SQLAlchemy model)

The UPSERT query pattern:

```sql
INSERT INTO agency_run_traces (id, "tenantId", "runId", "agencyId", trace, status, "createdAt")
VALUES (:id, :tenant_id, :run_id, :agency_id, :trace, 'running', NOW())
ON CONFLICT ("runId")
DO UPDATE SET trace = agency_run_traces.trace || :checkpoint_json,
              "totalTokens" = :total_tokens,
              status = 'running'
```

Note: The column names use camelCase (Drizzle convention). Use double-quotes in SQL.

#### Method: `async load_checkpoint() -> dict | None`

1. Use `AsyncSessionLocal()` context manager
2. Query `agency_run_traces` for the row matching `runId = self.run_id` AND `tenantId = self.tenant_id`
3. If no row found, return None
4. Extract the checkpoint from the `trace` JSONB (look for `type == "autonomous_checkpoint"`)
5. Return the checkpoint dict

The tenant_id check in the WHERE clause ensures tenant isolation -- a store with the wrong tenant_id cannot read another tenant's checkpoint.

#### Method: `async recover_state() -> dict | None`

High-level recovery method used by the autonomous executor after a crash:

1. Try `load_scratch_pad()` -- if found, return it (Redis has full state)
2. If Redis miss, try `load_checkpoint()` -- if found, return partial state (completed subtasks + plan version)
3. If both miss, return None (no recoverable state)

This method is the primary interface for crash recovery in section-10 (autonomous executor).

### Sanitization Helper

Create a private helper `_sanitize_dict(d: dict) -> dict` that recursively walks a dict/list structure and applies `sanitize_llm_input()` to all string values. Non-string values (int, float, bool, None) pass through unchanged. This prevents injection content from being persisted and later loaded back into LLM context.

```python
def _sanitize_dict(data: Any) -> Any:
    """Recursively sanitize string values in nested dict/list structures."""
    # Handle dict: sanitize each value
    # Handle list: sanitize each element
    # Handle str: apply sanitize_llm_input()
    # Handle other types: pass through
```

---

## Data Flow

```
AutonomousExecutor (section-10)
    │
    ├── save_scratch_pad(full_state)  ──► Redis (TTL 1h)
    │     key: agency:autonomous:{tenant_id}:{run_id}
    │
    ├── write_checkpoint(checkpoint)  ──► PostgreSQL (agency_run_traces)
    │     Written after each subtask completes
    │
    ├── load_scratch_pad()            ◄── Redis (fast path)
    │
    ├── load_checkpoint()             ◄── PostgreSQL (durable path)
    │
    └── recover_state()               ◄── Redis → Postgres fallback
```

---

## Error Handling

- **Redis connection failure on save:** Log warning via `structlog`, do NOT raise. The durable checkpoint in Postgres is the safety net. The autonomous executor should continue operating.
- **Redis connection failure on load:** Return None, triggering Postgres fallback in `recover_state()`.
- **PostgreSQL failure on checkpoint write:** Log error, raise. Checkpoint writes are critical -- the executor should handle this by retrying or aborting.
- **Malformed JSON in Redis:** Log warning, return None (treat as cache miss). Do not crash.
- **Malformed checkpoint in Postgres:** Log error, return None. The executor will treat this as a fresh run.

---

## Security Considerations

1. **Tenant isolation:** All Redis keys include `tenant_id`. All Postgres queries filter by `tenantId`. A store instance can only access its own tenant's data.
2. **Content sanitization:** All string values are sanitized via `sanitize_llm_input()` before Redis storage, preventing injection content from persisting.
3. **No cross-run access:** The `run_id` in the key prevents one run from reading another run's scratch-pad.
4. **TTL prevents stale data:** Redis keys expire after 1 hour, preventing accumulation of abandoned run state.

---

## Integration Points

- **section-10 (autonomous-executor):** The `AutonomousExecutor` creates an `ExecutionMemoryStore` at the start of each run and uses it to save/load plan state and checkpoints. On crash recovery, it calls `recover_state()` to resume.
- **section-06 (working-memory):** The scratch-pad may contain working memory data. The two modules are complementary: `WorkingMemory` manages per-agent observation/constraint data, while `ExecutionMemoryStore` manages the full run state including plan, completed subtasks, and token counters.
- **section-09 (db-migration):** The `agency_run_traces` table already exists from spec 052's migration. This section writes to it but does not modify the schema.