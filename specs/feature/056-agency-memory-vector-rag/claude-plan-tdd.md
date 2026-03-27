# TDD Plan: Agency Memory Hybrid 2-Level Vector RAG (056)

Companion to `claude-plan.md`. Defines tests to write BEFORE each implementation section.

**Testing framework**: pytest with `@pytest.mark.asyncio`, `AsyncSession` mocking via `MagicMock`.
**Conventions**: Follow existing patterns in `python-backend/tests/unit/test_long_term_memory.py`.
**Coverage**: 80% minimum enforced per `python-backend/` convention.

---

## Section 01: DB Migration

No Python tests needed. Verify via:
- `drizzle-kit migrate` completes without error
- SQL query: `SELECT column_name FROM information_schema.columns WHERE table_name = 'agency_agent_memories' AND column_name = 'embedding'`
- SQL query: `SELECT tablename FROM pg_tables WHERE tablename = 'agency_memory_chunks'`
- Index existence: `SELECT indexname FROM pg_indexes WHERE tablename = 'agency_agent_memories' AND indexname = 'agent_memories_embedding_idx'`

---

## Section 02: Embedding Integration (save_memory)

**File**: `python-backend/tests/unit/test_long_term_memory.py` (extend existing)

```python
# Test: save_memory generates embedding and stores it with the memory
# Test: save_memory succeeds without embedding when EmbeddingService.embed() raises exception (graceful degradation)
# Test: save_memory succeeds without embedding when EmbeddingService.embed() returns None
# Test: get_memories_for_agent with query param returns results sorted by semantic similarity
# Test: get_memories_for_agent with query=None falls back to confidence-sort (backward compat)
# Test: get_memories_for_agent supplements vector results with confidence-sort when < 3 vector matches
# Test: get_memories_for_agent filters by similarity threshold (0.6)
# Test: hybrid scoring: 70% similarity + 20% confidence + 10% recency
# Test: recency_decay returns 1.0 for today, ~0.5 for 10 days ago, near 0 for 30+ days
# Test: memories without embeddings are found via fallback when vector search returns < 3
```

---

## Section 03: Chunk Service

**File**: `python-backend/tests/unit/test_agency_chunk_service.py` (new)

```python
# Test: _split_into_chunks splits text into ~500 token (~2000 char) segments
# Test: _split_into_chunks maintains 50 token overlap between consecutive chunks
# Test: _split_into_chunks prefers sentence boundary breaks
# Test: _split_into_chunks drops chunks shorter than 20 chars
# Test: _split_into_chunks caps at MAX_CHUNKS_PER_OUTPUT (30)
# Test: chunk_and_store creates correct number of chunks with embeddings
# Test: chunk_and_store sets expiresAt based on tenant's chunkRetentionDays
# Test: chunk_and_store defaults expiresAt to 7 days when tenant setting not configured
# Test: chunk_and_store sanitizes input before chunking
# Test: chunk_and_store handles empty output (returns 0 chunks)
# Test: search_chunks returns results above threshold sorted by similarity
# Test: search_chunks scopes by tenantId + agencyId + agentNodeId + userId
# Test: search_chunks returns empty list when no chunks match threshold
```

---

## Section 04: 2-Level Retrieval Engine

**File**: `python-backend/tests/unit/test_agency_memory_retriever.py` (new)

```python
# Test: retrieve returns L1 facts only when >= 3 results above threshold
# Test: retrieve falls back to L2 chunks when L1 returns < 3 results
# Test: retrieve does NOT search L2 when L1 returns >= 3 results
# Test: retrieve merges L1 + L2 with facts prioritized over chunks
# Test: retrieve deduplicates chunks with >80% content overlap with facts
# Test: retrieve applies 0.8x score discount to chunks
# Test: retrieve respects max_tokens budget (greedy fit)
# Test: retrieve returns empty result when no matches in either level
# Test: format_retrieval_for_context produces <agent_context> XML with facts section
# Test: format_retrieval_for_context includes chunks section when L2 used
# Test: format_retrieval_for_context returns empty string when no results
# Test: RetrievalResult dataclass has correct l1_count and l2_count
```

---

## Section 05: Context Budget Manager

**File**: `python-backend/tests/unit/test_agency_context_budget.py` (new)

```python
# Test: __init__ computes budget as model_limit * 0.6 for known models
# Test: __init__ uses DEFAULT_CONTEXT_LIMIT (32000) for unknown models
# Test: estimate_tokens returns len(text) // 4 + 1
# Test: allocate returns full text when within budget
# Test: allocate truncates text when exceeding remaining budget
# Test: allocate returns None when remaining budget < 25 tokens
# Test: allocate tracks cumulative usage across multiple calls
# Test: remaining decreases after each allocate call
# Test: can_fit returns True when tokens <= remaining
# Test: can_fit returns False when tokens > remaining
# Test: budget for gpt-4o is 128000 * 0.6 = 76800
# Test: budget for claude-sonnet is 200000 * 0.6 = 120000
```

---

## Section 06: Orchestrator Wiring

**File**: `python-backend/tests/unit/test_agency_orchestrator.py` (extend existing or new)

```python
# Test: agent node execution uses AgencyMemoryRetriever instead of confidence-sort
# Test: agent node execution calls chunk_and_store after execution completes
# Test: agent node execution creates ContextBudgetManager with correct model name
# Test: memory retrieval is budget-aware (max_tokens = remaining // 2)
# Test: orchestrator initializes EmbeddingService if not already present
# Test: format_retrieval_for_context output is injected as user-role message
```

---

## Section 07: Inter-Node Context Optimization

```python
# Test: ctx.results[node_id] is truncated to 2000 chars (not 50000)
# Test: full output is passed to chunk_and_store before truncation
# Test: get_context_text() still works correctly with 2000 char results
# Test: downstream nodes can retrieve full detail via retriever
```

---

## Section 08: Memory Purge Job

**File**: `python-backend/tests/unit/test_memory_purge_task.py` (new)

```python
# Test: purge deletes soft-deleted memories older than 30 days
# Test: purge does NOT delete soft-deleted memories younger than 30 days
# Test: purge does NOT delete active memories regardless of age
# Test: purge deletes expired chunks (expiresAt < now)
# Test: purge does NOT delete unexpired chunks
# Test: purge deletes agency_run_traces older than 30 days
# Test: purge logs counts for each deletion type
# Test: purge task is registered in Celery beat at 5:00 AM UTC
```

---

## Section 09: Embedding Backfill

**File**: `python-backend/tests/unit/test_memory_backfill_task.py` (new)

```python
# Test: backfill generates embeddings only for rows with embedding IS NULL AND isActive = true
# Test: backfill skips rows that already have embeddings (resumable)
# Test: backfill processes in batches of 100
# Test: backfill handles EmbeddingService errors gracefully (skips, logs, continues)
# Test: backfill updates rows with generated embeddings
# Test: lazy backfill in get_memories_for_agent generates embedding on-the-fly for unembedded memory
```

---

## Section 10: Integration Tests + Verification

```python
# Integration test: full flow — save memory with embedding → retrieve via vector search → verify relevance
# Integration test: chunk_and_store → search_chunks → verify content matches
# Integration test: 2-level retrieval with both L1 and L2 results
# Integration test: context budget manager prevents overflow in multi-node chain
# Integration test: purge job cleans up expired data correctly
# Verification: no regressions in existing long_term_memory tests
# Verification: TypeScript typecheck passes (drizzle schema changes)
```
