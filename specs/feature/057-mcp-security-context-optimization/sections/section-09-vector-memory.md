# Section 09 — Vector-Based Long-Term Memory

## Section ID
`section-09-vector-memory`

## Dependencies
- None (Wave 2 — uses existing pgvector + EmbeddingService infrastructure)

## Status: COMPLETE (pre-implemented, tests fixed)

## Overview

Replaces SQL `ORDER BY confidence DESC` memory retrieval with pgvector semantic similarity search. Currently `get_memories_for_agent()` returns memories sorted by confidence score regardless of relevance to the current task. With embeddings, only semantically relevant memories are injected into agent context, reducing irrelevant memories from ~20 to ~10 while improving quality.

Uses existing infrastructure: `EmbeddingService` with 1536-dimension vectors (OpenAI text-embedding-3-small), `library_chunk_vectors` pgvector table pattern, and HNSW indexing.

**Deviation from plan**: The spec specified MiniLM-384D embeddings, but the actual implementation uses 1536-dimension embeddings to match the project's existing embedding infrastructure. Default limit remains 20 (not 10 as planned) since the hybrid scoring effectively ranks by relevance.

## Files Modified (pre-existing)

| File | Path | Status |
|------|------|--------|
| long_term_memory.py | `python-backend/app/services/long_term_memory.py` | Already implemented |
| agency_agent_memories.py | `python-backend/app/models/agency_agent_memories.py` | Already has embedding column |
| schema.ts | `apps/web/drizzle/schema.ts` | Already has `embedding: vector1536("embedding")` |
| memory_backfill_task.py | `python-backend/app/tasks/memory_backfill_task.py` | Already implemented |

## Test File (actual location)

`python-backend/tests/unit/test_long_term_memory.py` (not `test_vector_memory.py` as planned — tests co-located with other memory tests)

## Changes Made in This Section

Fixed 3 pre-existing test bugs where `MagicMock` objects lacked required attributes for the hybrid scoring code path:
- Added `last_used_at`, `created_at`, `confidence`, `embedding` attributes to all memory mocks
- Replaced `object()` with `MagicMock(spec=[])` in SQL fallback test for clearer intent
- Added negative assertion verifying vector path was NOT taken in fallback test
- All 17 tests now pass

---

## TDD Specification

```
# Test: store_memory generates and saves embedding
  - Call store_memory with content="User prefers dark mode"
  - Assert EmbeddingService.embed called with "User prefers dark mode"
  - Assert DB insert includes embedding vector (384 dimensions)

# Test: get_memories_for_agent returns semantically relevant memories
  - Store 10 memories with varied topics
  - Query with task="Generate a dark theme stylesheet"
  - Assert top result is the dark mode preference memory

# Test: get_memories_for_agent falls back to SQL when no embeddings exist
  - Store memories WITHOUT embeddings (pre-migration records)
  - Query — assert SQL confidence-based fallback used
  - Assert results returned (not empty)

# Test: get_memories_for_agent limits to 10 results (reduced from 20)
  - Store 30 memories with embeddings
  - Assert max 10 returned

# Test: get_memories_for_agent filters by agent_id and user_id
  - Store memories for agent A and agent B
  - Query for agent A — assert only agent A memories returned

# Test: backfill_embeddings processes memories without embeddings
  - Create 5 memories without embedding column populated
  - Run backfill task
  - Assert all 5 now have embeddings
```

---

## Implementation Guidance

### Schema Migration

Add embedding column to `agency_agent_memories`:

```sql
-- Migration: add_memory_embedding.sql
ALTER TABLE agency_agent_memories ADD COLUMN IF NOT EXISTS embedding vector(384);
CREATE INDEX IF NOT EXISTS ix_agent_memories_embedding
  ON agency_agent_memories USING hnsw (embedding vector_cosine_ops);
```

In `schema.ts`, add the column definition (using raw SQL type since Drizzle doesn't have native pgvector support — follow existing `library_chunk_vectors` pattern).

### store_memory() Enhancement

```python
from app.orchestrator.vector_store.embedding_service import EmbeddingService

async def store_memory(self, ..., content: str, ...):
    # Generate embedding
    embedding_service = EmbeddingService()
    text_for_embedding = f"{title} {content}" if title else content
    embedding = await embedding_service.embed_text(text_for_embedding)

    # Insert with embedding
    await db.execute(
        insert(agency_agent_memories).values(
            ...,
            embedding=embedding,
        )
    )
```

### get_memories_for_agent() Enhancement

```python
async def get_memories_for_agent(self, agent_id, user_id, task_text: str, limit: int = 10):
    # Try vector search first
    embedding = await self.embedding_service.embed_text(task_text)
    results = await db.execute(
        select(agency_agent_memories)
        .where(and_(
            agency_agent_memories.c.agent_id == agent_id,
            agency_agent_memories.c.user_id == user_id,
            agency_agent_memories.c.is_active == True,
            agency_agent_memories.c.embedding.isnot(None),
        ))
        .order_by(agency_agent_memories.c.embedding.cosine_distance(embedding))
        .limit(limit)
    )

    if not results:
        # Fallback: SQL confidence-based for pre-migration memories
        results = await db.execute(
            select(agency_agent_memories)
            .where(...)
            .order_by(desc(agency_agent_memories.c.confidence))
            .limit(limit)
        )
    return results
```

### Backfill Celery Task

```python
@celery_app.task(name="backfill_memory_embeddings")
def backfill_memory_embeddings(batch_size: int = 100):
    """One-time task to embed existing memories without embeddings."""
    memories = db.execute(
        select(agency_agent_memories)
        .where(agency_agent_memories.c.embedding.is_(None))
        .limit(batch_size)
    )
    for memory in memories:
        text = f"{memory.title} {memory.content}" if memory.title else memory.content
        embedding = embedding_service.embed_text_sync(text)
        db.execute(update(...).where(...).values(embedding=embedding))
```

### Security Considerations

1. **Embedding does not encrypt content**: The embedding vector is a lossy representation but can be used to find similar text. Embeddings of sensitive memories are stored in plaintext — this is acceptable since the source content is already plaintext in the same table.
2. **Database Safety Protocol**: Follow mandatory backup + verification steps for the ALTER TABLE migration.
