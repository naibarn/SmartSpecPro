# Section 02: Embedding Integration

## Overview

This section enhances the existing `LongTermMemoryService` in `python-backend/app/services/long_term_memory.py` to generate embeddings when saving memories (Level 1 facts) and to support semantic search via cosine similarity in `get_memories_for_agent()`.

**Depends on**: section-01-db-migration (the `embedding vector(1536)` column must exist on `agency_agent_memories`)
**Blocks**: section-04-retrieval-engine, section-09-embedding-backfill
**Parallelizable with**: section-03-chunk-service, section-05-context-budget, section-08-memory-purge

---

## Files to Modify

| File | Change |
|------|--------|
| `python-backend/app/services/long_term_memory.py` | Add embedding generation in `save_memory()`, semantic search in `get_memories_for_agent()`, `_recency_decay()` and `_generate_embedding()` helpers |
| `python-backend/tests/unit/test_long_term_memory.py` | Extend with embedding integration tests |

---

## Tests (Write First)

**File**: `python-backend/tests/unit/test_long_term_memory.py` -- extend the existing test file.

All tests use `pytest` with `@pytest.mark.asyncio`. Mock `EmbeddingService` via `unittest.mock.AsyncMock`.

### Test 1: save_memory generates embedding and stores it

```python
# Setup: Mock EmbeddingService.embed() to return a 1536-dim vector
# Call save_memory() with valid content
# Assert: the AgencyAgentMemory object added to session has .embedding set to the mock vector
```

### Test 2: save_memory succeeds without embedding when EmbeddingService.embed() raises

```python
# Setup: Mock EmbeddingService.embed() to raise Exception("API timeout")
# Call save_memory() with valid content
# Assert: memory IS saved (session.add called), memory.embedding is None
# Assert: logger.warning was called with "embedding_generation_failed"
```

### Test 3: save_memory succeeds without embedding when EmbeddingService is None

```python
# Setup: Construct LongTermMemoryService WITHOUT passing embedding_service (default None)
# Call save_memory()
# Assert: memory IS saved, memory.embedding is None (graceful skip)
```

### Test 4: get_memories_for_agent with query param uses semantic search

```python
# Setup: Mock db query to return memories with embeddings and similarity scores
# Mock EmbeddingService.embed() to return a query embedding
# Call get_memories_for_agent(..., query="test query")
# Assert: results are sorted by hybrid score (0.7*similarity + 0.2*confidence + 0.1*recency)
```

### Test 5: get_memories_for_agent with query=None falls back to confidence-sort

```python
# Setup: same as existing test_memory_retrieval
# Call get_memories_for_agent(...) without query param
# Assert: ORDER BY confidence DESC, use_count DESC (backward compatible)
```

### Test 6: get_memories_for_agent supplements vector results with confidence-sort when < 3 matches

```python
# Setup: Mock vector search to return only 2 results above threshold 0.6
# Mock confidence-sort fallback to return 5 results
# Assert: result contains the 2 vector results PLUS supplemental confidence-sorted results
```

### Test 7: get_memories_for_agent filters by similarity threshold 0.6

```python
# Setup: Mock vector results with similarities [0.9, 0.7, 0.55, 0.3]
# Assert: only results with similarity >= 0.6 are returned from vector path
```

### Test 8: hybrid scoring weights are correct

```python
# Memory A: similarity=0.9, confidence=0.5, last_used=today
# Expected A: 0.7*0.9 + 0.2*0.5 + 0.1*1.0 = 0.83
# Memory B: similarity=0.7, confidence=1.0, last_used=today
# Expected B: 0.7*0.7 + 0.2*1.0 + 0.1*1.0 = 0.79
# Assert: A is ranked above B
```

### Test 9: _recency_decay returns correct values

```python
# Test: last_used_at = now → returns 1.0
# Test: last_used_at = 10 days ago → returns ~0.5
# Test: last_used_at = 30+ days ago → returns near 0.0
# Test: last_used_at = None → returns 0.5 (neutral default)
```

### Test 10: memories without embeddings included via fallback

```python
# Setup: query provided, vector search returns < 3 results
# Assert: non-embedded memories appear via confidence-sort fallback
```

---

## Implementation Details

### 1. Enhance LongTermMemoryService Constructor

Add an optional `embedding_service` parameter to `__init__`:

```python
def __init__(
    self,
    db_session: AsyncSession,
    gateway_url: str = "http://localhost:3000",
    user_token: str = "",
    embedding_service: "EmbeddingService | None" = None,
) -> None:
    self.db = db_session
    self.gateway_url = gateway_url
    self.user_token = user_token
    self.embedding_service = embedding_service
```

Backward compatible -- all existing callers work without modification.

### 2. Add _generate_embedding Helper

```python
async def _generate_embedding(self, content: str) -> list[float] | None:
    """Generate embedding for memory content. Returns None on failure (graceful degradation)."""
```

- If `self.embedding_service` is None, return None immediately
- Call `self.embedding_service.embed(content)`
- Wrap in try/except; on any exception, log warning (`"embedding_generation_failed"`) and return None

### 3. Enhance save_memory()

Insert embedding generation between the capacity check and the `AgencyAgentMemory(...)` construction:

```python
# After capacity check, before creating the memory object:
embedding = await self._generate_embedding(content)

memory = AgencyAgentMemory(
    ...,
    embedding=embedding,  # NEW — nullable, None if generation failed
)
```

No other changes to the save flow. Existing sanitization, safety filter, dedup, and capacity check remain unchanged.

### 4. Add _recency_decay Helper

```python
def _recency_decay(self, last_used_at: datetime | None) -> float:
    """Compute recency score: 1.0 for today, decaying toward 0 over 30 days.

    Uses exponential decay: score = exp(-0.07 * days_since_last_use).
    Returns 0.5 as neutral default when last_used_at is None.
    """
```

- Import `math` at top of file
- Compute `days = (now - last_used_at).total_seconds() / 86400`
- Return `math.exp(-0.07 * days)` — gives ~1.0 for today, ~0.50 at 10 days, ~0.12 at 30 days
- If `last_used_at` is None, return `0.5`

### 5. Enhance get_memories_for_agent()

Add `query: str | None = None` parameter:

```python
async def get_memories_for_agent(
    self,
    tenant_id: str,
    agency_id: str,
    agent_node_id: str,
    user_id: int,
    memory_type: str | None = None,
    limit: int = 20,
    query: str | None = None,       # NEW
) -> list[dict]:
```

**Logic**:

1. If `query` is None or `self.embedding_service` is None → use existing confidence-sort path unchanged (backward compatible)

2. If `query` is provided and embedding_service available:
   a. Generate query embedding via `self.embedding_service.embed(query)`. If fails, fall back to confidence-sort.
   b. Vector search against `agency_agent_memories`:
      - WHERE scope matches (tenantId, agencyId, agentNodeId, userId, isActive=true)
      - WHERE embedding IS NOT NULL
      - ORDER BY cosine distance `embedding <=> query_embedding` ASC
      - LIMIT `VECTOR_TOP_K` (10)
   c. Compute similarity as `1 - distance` for each result
   d. Filter: discard results with similarity < `SIMILARITY_THRESHOLD` (0.6)
   e. Hybrid score: `0.7 * similarity + 0.2 * float(confidence) + 0.1 * _recency_decay(last_used_at)`
   f. Sort by hybrid score descending
   g. If fewer than `L1_MIN_RESULTS` (3) results remain, supplement with confidence-sorted results for memories NOT already included
   h. Combine vector results (first) + supplemental results, truncate to `limit`
   i. Update `use_count` and `last_used_at` for returned memory IDs
   j. Return dicts with added `"similarity"` key for vector results

**SQL for vector search**:

```sql
SELECT *, (embedding <=> :query_embedding) AS distance
FROM agency_agent_memories
WHERE "tenantId" = :tenant_id
  AND "agencyId" = :agency_id
  AND "agentNodeId" = :agent_node_id
  AND "userId" = :user_id
  AND "isActive" = true
  AND embedding IS NOT NULL
ORDER BY distance ASC
LIMIT :top_k
```

The HNSW partial index on `isActive = true` from section-01 will be used.

**Important**: The `<=>` operator returns cosine **distance** (0 = identical, 2 = opposite). Convert to similarity: `similarity = 1 - distance`.

### 6. Constants

```python
VECTOR_TOP_K = 10
SIMILARITY_THRESHOLD = 0.6
L1_MIN_RESULTS = 3
HYBRID_WEIGHTS = (0.7, 0.2, 0.1)  # (similarity, confidence, recency)
```

---

## Dependency Injection Notes

The orchestrator (`agency_orchestrator.py`) creates a `LongTermMemoryService` instance. After this section, it should pass `embedding_service` to the constructor. This wiring is formally done in section-06, but the constructor must accept the parameter NOW.

## Backward Compatibility

- `save_memory()`: When `embedding_service` is None, embedding is None. Memory saved exactly as before.
- `get_memories_for_agent()`: When `query` is None, uses existing confidence-sort path.
- `format_memories_for_injection()`: Unchanged. `<past_learnings>` format preserved.
- `to_dict()` does NOT include `embedding` to avoid serializing large float arrays.

## Verification Checklist

1. All existing tests in `test_long_term_memory.py` still pass (no regression)
2. New tests for embedding generation (success, failure, None service) pass
3. New tests for semantic search (vector path, fallback path, hybrid scoring) pass
4. `_recency_decay` unit tests pass
5. `mypy` and `ruff check` pass
