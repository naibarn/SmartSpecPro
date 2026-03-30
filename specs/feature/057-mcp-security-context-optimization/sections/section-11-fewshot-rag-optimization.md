# Section 11 — Few-Shot Relevance Filtering + RAG Deduplication

## Section ID
`section-11-fewshot-rag-optimization`

## Dependencies
- None (Wave 2 — independent)

## Overview

Two context optimizations: (1) Replace blind few-shot example injection with embedding-based relevance selection — when an agent has >3 examples, embed the current task and select top 3 by cosine similarity. (2) Add content-hash deduplication to RAG results after hybrid retrieval + re-ranking to remove near-duplicate chunks before context injection.

## Files to Modify

| File | Path |
|------|------|
| agency_few_shot.py | `python-backend/app/services/agency_few_shot.py` |
| hybrid_rag.py | `python-backend/app/orchestrator/rag/hybrid_rag.py` |

## Test Files to Create

| File | Path |
|------|------|
| test_few_shot_relevance.py | `python-backend/tests/unit/services/test_few_shot_relevance.py` |
| test_rag_dedup.py | `python-backend/tests/unit/rag/test_rag_dedup.py` |

---

## TDD Specification

### Few-Shot Relevance

```
# Test: <=3 examples pass through unchanged
  - Input: 2 few-shot examples, any task text
  - Assert both examples returned in original order

# Test: >3 examples filtered to top 3 by relevance
  - Input: 6 examples covering: math, writing, coding, design, sales, cooking
  - Task: "Write a Python function to sort a list"
  - Assert top 3 includes coding example, excludes cooking/sales

# Test: embedding cache prevents redundant embed calls
  - Call with same examples twice, different tasks
  - Assert EmbeddingService.embed called once per example (cached)
  - Assert EmbeddingService.embed called twice for task (not cached)

# Test: handles embedding service failure gracefully
  - Mock EmbeddingService to raise
  - Assert falls back to returning first 3 examples (original behavior)
```

### RAG Deduplication

```
# Test: duplicate chunks removed, highest score kept
  - Input: 3 chunks, 2 with identical normalized content
  - Assert output has 2 chunks, the higher-scored duplicate kept

# Test: near-duplicate detection via content hash
  - Chunk A: "The quick brown fox" (score 0.9)
  - Chunk B: "The quick brown fox" (score 0.8) — same content
  - Assert only chunk A (score 0.9) in output

# Test: different content chunks preserved
  - 5 chunks with unique content
  - Assert all 5 in output

# Test: deduplication preserves ranking order
  - After dedup, chunks should still be sorted by score descending
```

---

## Implementation Guidance

### agency_few_shot.py — Relevance Filtering

```python
from app.orchestrator.vector_store.embedding_service import EmbeddingService
from functools import lru_cache
import numpy as np

_example_embedding_cache: dict[int, list[float]] = {}
_CACHE_MAX_SIZE = 200  # Evict oldest when exceeded

async def select_relevant_examples(examples: list[dict], task_text: str, top_k: int = 3) -> list[dict]:
    if len(examples) <= top_k:
        return examples

    embedding_service = EmbeddingService()
    task_embedding = await embedding_service.embed_text(task_text)

    scored = []
    for ex in examples:
        ex_text = ex.get("user_message", "") or ex.get("input", "")
        cache_key = hash(ex_text)
        if cache_key not in _example_embedding_cache:
            _example_embedding_cache[cache_key] = await embedding_service.embed_text(ex_text)
        ex_embedding = _example_embedding_cache[cache_key]
        similarity = np.dot(task_embedding, ex_embedding) / (np.linalg.norm(task_embedding) * np.linalg.norm(ex_embedding))
        scored.append((similarity, ex))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [ex for _, ex in scored[:top_k]]
```

### hybrid_rag.py — Content Hash Deduplication

Add after the re-ranking step, before returning results:

```python
import hashlib

def deduplicate_chunks(chunks: list[dict]) -> list[dict]:
    seen_hashes: set[str] = set()
    deduped = []
    for chunk in chunks:
        content = chunk.get("content", "").strip().lower()
        content_hash = hashlib.md5(content.encode()).hexdigest()
        if content_hash not in seen_hashes:
            seen_hashes.add(content_hash)
            deduped.append(chunk)
    return deduped
```

Call `deduplicate_chunks()` on the ranked results before returning from the hybrid search method. Chunks must already be sorted by score (highest first) so the first occurrence of each hash is the highest-scored duplicate.

### Security Considerations

1. **MD5 for dedup**: MD5 is used for content hashing (deduplication), not cryptographic security. Collision resistance is not a concern here — two different chunks with the same MD5 would both be useful to keep, and this is statistically negligible.
2. **Embedding cache**: The few-shot embedding cache is in-process memory with a max size of 200 entries. When exceeded, the oldest entries are evicted (FIFO). The cache does not persist across restarts and does not contain sensitive data (only vector representations of generic example prompts). If an example's content is updated, the cache key (content hash) will differ, causing a cache miss and re-embedding.
