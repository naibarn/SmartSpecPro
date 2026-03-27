# Section 03: Chunk Service -- AgencyChunkService

## Overview

This section creates the `AgencyChunkService`, a new Python service that chunks raw agent node outputs into ~500 token segments with overlap, batch-embeds them via the existing `EmbeddingService`, and stores them in the `agency_memory_chunks` table (created by section-01). This is the Level 2 (L2) store of the hybrid 2-level vector RAG system.

**Depends on**: section-01-db-migration (the `agency_memory_chunks` table and SQLAlchemy model must exist)
**Blocks**: section-04-retrieval-engine (uses `search_chunks()`), section-07-internode-optimization (uses `chunk_and_store()`)

---

## Files to Create

| File | Purpose |
|------|---------|
| `python-backend/app/services/agency_chunk_service.py` | `AgencyChunkService` class |
| `python-backend/tests/unit/test_agency_chunk_service.py` | Unit tests (write FIRST) |

## Files to Read (Dependencies)

| File | What You Need From It |
|------|----------------------|
| `python-backend/app/models/agency_memory_chunks.py` | SQLAlchemy model (`AgencyMemoryChunk`) -- created by section-01 |
| `python-backend/app/orchestrator/vector_store/embedding_service.py` | `EmbeddingService.embed_batch()` and `EmbeddingService.embed()` APIs |
| `python-backend/app/services/agentic_sanitizer.py` | `sanitize_llm_input()` function |
| `python-backend/app/services/long_term_memory.py` | Pattern reference for constructor, async session usage |

---

## Tests (Write First)

**File**: `python-backend/tests/unit/test_agency_chunk_service.py`

Follow test patterns from `test_long_term_memory.py`: `@pytest.mark.asyncio`, `AsyncMock` for db session.

### _split_into_chunks tests (pure function, no mocking)

```python
# Test: splits text into ~500 token (~2000 char) segments
#   Input: 6000 char string -> expect 3-4 chunks
#   Assert each chunk length <= 2200 chars

# Test: maintains ~50 token (~200 char) overlap between consecutive chunks
#   Input: 5000 char string
#   Assert: last 200 chars of chunk[i] appear in first 200 chars of chunk[i+1]

# Test: prefers sentence boundary breaks
#   Input: text with sentences of varying length
#   Assert: each chunk ends at "." or "\n" when possible

# Test: drops chunks shorter than 20 chars
#   Input: "Hello." (6 chars)
#   Assert: returns empty list

# Test: caps at MAX_CHUNKS_PER_OUTPUT (30)
#   Input: very long text (>60000 chars)
#   Assert: len(result) <= 30

# Test: handles empty string input → returns []

# Test: handles text shorter than CHUNK_SIZE → returns single chunk
```

### chunk_and_store tests (mock db + embedding service)

```python
# Test: creates correct number of chunks with embeddings
# Test: sets expiresAt based on chunk_retention_days parameter
# Test: defaults expiresAt to 7 days
# Test: sanitizes input before chunking
# Test: handles empty output (returns 0 chunks)
# Test: passes correct metadata to each chunk row
# Test: each chunk has correct scope fields
# Test: chunk indexes are sequential (0, 1, 2, ...)
# Test: graceful handling when embed_batch raises exception (stores without embeddings)
```

### search_chunks tests (mock db)

```python
# Test: returns results above threshold sorted by similarity descending
# Test: scopes by tenantId + agencyId + agentNodeId + userId
# Test: returns empty list when no chunks match threshold
```

---

## Implementation Details

### File: `python-backend/app/services/agency_chunk_service.py`

#### Class: `AgencyChunkService`

```python
class AgencyChunkService:
    """Level 2 chunk storage: split agent outputs into embeddable segments."""

    CHUNK_SIZE = 500        # tokens (~2000 chars at 4 chars/token)
    CHUNK_OVERLAP = 50      # tokens (~200 chars)
    CHUNK_SIZE_CHARS = 2000
    CHUNK_OVERLAP_CHARS = 200
    MAX_CHUNKS_PER_OUTPUT = 30
    MIN_CHUNK_LENGTH = 20   # chars
    DEFAULT_RETENTION_DAYS = 7

    def __init__(self, db: AsyncSession, embedding_service: EmbeddingService):
        """
        Args:
            db: SQLAlchemy async session (from orchestrator's existing session)
            embedding_service: Shared EmbeddingService instance
        """
```

#### Method: `_split_into_chunks(self, text: str) -> list[str]`

Pure synchronous method. Algorithm:

1. If `text` is empty or whitespace-only, return `[]`
2. Walk through `text` in windows of `CHUNK_SIZE_CHARS` (2000 chars)
3. For each window, search backward from the end for the nearest sentence boundary (`. `, `.\n`, `\n\n`, or `\n`). If found within the last 400 chars of the window, split there
4. Advance the cursor by `(split_position - CHUNK_OVERLAP_CHARS)` to create overlap
5. After splitting, drop any chunk with `len(chunk.strip()) < MIN_CHUNK_LENGTH`
6. Cap at `MAX_CHUNKS_PER_OUTPUT` (30)
7. Return the list of chunk strings

#### Method: `async def _batch_embed(self, chunks: list[str]) -> list[list[float] | None]`

Calls `self.embedding_service.embed_batch(chunks)`. On failure, log warning and return `[None] * len(chunks)` (graceful degradation).

#### Method: `async def chunk_and_store(...) -> int`

```python
async def chunk_and_store(
    self,
    output: str,
    tenant_id: str,
    agency_id: str,
    user_id: int,
    agent_node_id: str,
    run_id: str,
    source_node_id: str,
    metadata: dict | None = None,
    chunk_retention_days: int = 7,
) -> int:
    """Chunk output, embed, store. Returns chunk count."""
```

Flow:
1. Call `sanitize_llm_input(output)`
2. Call `self._split_into_chunks(sanitized_output)`
3. If no chunks, return 0
4. Call `self._batch_embed(chunks)` to get embeddings
5. Compute `expires_at = datetime.now(timezone.utc) + timedelta(days=chunk_retention_days)`
6. For each `(i, chunk, embedding)`: create `AgencyMemoryChunk` with all scope fields, `chunk_index=i`, `content=chunk`, `embedding=embedding`, `metadata=metadata`, `expires_at=expires_at`
7. `await self.db.commit()`
8. Return `len(chunks)`

Use `str(uuid.uuid4())` for chunk `id`.

#### Method: `async def search_chunks(...) -> list[dict]`

```python
async def search_chunks(
    self,
    query_embedding: list[float],
    tenant_id: str,
    agency_id: str,
    agent_node_id: str,
    user_id: int,
    top_k: int = 5,
    threshold: float = 0.5,
) -> list[dict]:
    """Search chunks by cosine similarity within scope."""
```

Flow:
1. Query `agency_memory_chunks` with scope filters + `expires_at > NOW()` + `embedding IS NOT NULL`
2. Use pgvector cosine distance: `ORDER BY embedding <=> query_embedding ASC`
3. `LIMIT top_k * 2` (over-fetch for threshold filtering)
4. Filter in Python: keep rows where `similarity >= threshold`
5. Return top `top_k` as dicts with: `id`, `content`, `similarity`, `sourceNodeId`, `chunkIndex`, `metadata`, `createdAt`

**Important**: Threshold filtering in Python (application-side) per pgvector best practices -- SQL WHERE threshold prevents HNSW index usage.

---

## Key Design Decisions

1. **Chars as proxy for tokens**: `CHUNK_SIZE_CHARS = 2000` approximates 500 tokens at ~4 chars/token
2. **Sentence-boundary splitting**: Avoids cutting mid-sentence which degrades embedding quality
3. **Overlap of 200 chars**: Ensures information spanning chunk boundaries is in both chunks
4. **MAX_CHUNKS_PER_OUTPUT = 30**: Prevents cost attacks (~60,000 chars max)
5. **Graceful embedding failure**: Chunks stored without embeddings, can be backfilled later
6. **No locking**: Each chunk has unique UUID `id`, concurrent writes don't conflict

---

## Integration Notes

- **Section 04** calls `search_chunks()` when L1 fact search returns < 3 results
- **Section 06** calls `chunk_and_store()` after agent node execution
- **Section 07** depends on chunking happening before `ctx.results` truncation
- **Section 08** deletes chunks where `expiresAt < NOW()`
