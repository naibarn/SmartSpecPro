---
name: Vector Infrastructure and Agency Memory Integration Status
description: Comprehensive audit of vector DB, RAG, and agency memory (long-term, working, execution) tiers. Key finding: vectors intentionally omitted from agency memories (not a gap).
type: reference
---

# Vector Infrastructure & Agency Memory Audit — Key Findings

**Date:** 2026-03-23
**Status:** Research complete, brief written

## TL;DR

- **Vector infrastructure exists:** pgvector + hybrid RAG (BM25 + vector + rerank) fully implemented
- **Agency memories DON'T use vectors:** Intentional design, not a gap
- **Real risk:** Context window overflow in ReAct executor (unbounded message accumulation)
- **Recommendation:** Implement context safety checks (4-6h), do NOT add vectors to memories

## Three Agency Memory Tiers

### Execution Memory
- **Storage:** Redis scratch-pad (1h TTL) + PostgreSQL checkpoints
- **Purpose:** Crash recovery
- **Retrieval:** Simple load by run_id/tenant_id (no search)

### Working Memory
- **Storage:** Redis only (1h TTL)
- **Purpose:** In-run ReAct iteration state
- **Data:** observations, constraints, failed_approaches, artifacts
- **Limits:** 50 observations, 20 constraints, 20 failed_approaches
- **Retrieval:** In-memory Python object, no DB query
- **Format:** Text summary with `<past_learnings>` framing
- **NO vectors** — purely sequential text formatting

### Long-Term Memory
- **Storage:** PostgreSQL `agency_agent_memories` table
- **Purpose:** Persistent learnings from run outputs
- **Schema:** No embedding column, no vector index
- **Retrieval:** `ORDER BY confidence DESC, useCount DESC LIMIT 20`
- **Limits:** 100 memories per agent per user, 500 chars per memory
- **Lifecycle:** Extract → Safety filter → Dedup check → Store → Decay

**Why no vectors?**
- Max 20 memories injected per run (small set, not corpus)
- High-confidence extracted facts (not document search)
- Exact match + sorting sufficient
- Cost (embedding call) > benefit
- Transparency (clear what memories selected, why)

## Vector Infrastructure (Mature, Ready)

### pgvector Storage
- **Table:** `vector_documents` (1536-dim embeddings)
- **Indexes:** IVFFlat for approximate search, GIN for full-text, tenant/project filters
- **Features:** Multi-tenant isolation, metadata JSONB, doc_type classification
- **Location:** `python-backend/app/orchestrator/vector_store/pgvector_store.py`

### Hybrid RAG Engine
- **Components:** BM25 retriever + vector retriever + reranker + scope engine
- **Search modes:** VECTOR, KEYWORD, HYBRID, FAST
- **Ranking:** Reciprocal Rank Fusion (70% vector, 30% keyword by default)
- **Location:** `python-backend/app/orchestrator/rag/hybrid_rag.py`

### Embedding Service
- **Provider:** OpenAI `text-embedding-3-small` or `text-embedding-ada-002`
- **Dimension:** 1536 (standard)
- **Caching:** In-memory cache with MD5 keys
- **Location:** `python-backend/app/orchestrator/vector_store/embedding_service.py`

## Chat Memory (Different from Agencies)

### Three Tiers
1. **Buffer:** Last 20 messages (full fetch)
2. **Summaries:** 5 max, auto-triggered at 70% unsummarized chars
3. **Entity facts:** 10 max, per-user + per-persona scope

### Context Budgeting
- Default 8,000 tokens if model context not found
- CHARS_PER_TOKEN = 4 (approximate)
- Auto-trigger summarization when threshold exceeded
- **Also NO vectors** — entity_memories is plain text

## Context Window Risk (ReAct Executor)

### Problem
- **Unbounded accumulation:** Messages grow with each iteration
- **No pre-call validation:** Never checks if context exceeds model limit
- **Exponential cost:** At 10 iterations, ~40K tokens total (expensive)

### Scenario
```
Iteration 1:  4K tokens accumulated
Iteration 2:  8K tokens accumulated
Iteration 10: 40K tokens accumulated
```

### Mitigation (Absent)
- [ ] Pre-flight token estimate before each LLM call
- [ ] Refuse if > 90% of model context window
- [ ] Sliding-window working memory (drop oldest observations)
- [ ] Filter long-term memories by confidence threshold

## Action Items

**HIGH (Implement now):**
- Context safety checks in `react_executor.py` (4-6h)
- Token counter + pre-call validation
- Sliding-window working memory

**MEDIUM (If relevance becomes issue):**
- Task-aware memory filtering (keyword match, not vectors)
- Extend hybrid RAG for agency-specific document retrieval (8-12h)

**NOT RECOMMENDED:**
- Adding vectors to `agency_agent_memories` table
- Would add complexity without clear user benefit
- Chat system intentionally omits vectors (same opportunity)

## Code Locations

| System | File | Key Class |
|--------|------|-----------|
| pgvector | `app/orchestrator/vector_store/pgvector_store.py` | `PgVectorStore` |
| Hybrid RAG | `app/orchestrator/rag/hybrid_rag.py` | `HybridRAGEngine` |
| Vector Retriever | `app/orchestrator/rag/vector_retriever.py` | `VectorRetriever` |
| Long-term Memory | `app/services/long_term_memory.py` | `LongTermMemoryService` |
| Working Memory | `app/services/working_memory.py` | `WorkingMemory` |
| Execution Memory | `app/services/execution_memory_store.py` | `ExecutionMemoryStore` |
| ReAct Executor | `app/services/react_executor.py` | `ReActExecutor` |
| Agency Memories Table | `apps/web/drizzle/schema.ts:5018-5043` | `agencyAgentMemories` |
| Chat Context | `apps/web/server/services/memoryService.ts` | `MemoryService` |

## Relevant Tests

- `python-backend/tests/unit/services/test_library_pgvector_integration.py` — pgvector operations
- `python-backend/tests/orchestrator/rag/test_hybrid_rag.py` — RAG retrieval quality
- `python-backend/tests/orchestrator/rag/test_scope_filtering.py` — Multi-tenant isolation

## Key Constants

```python
# agentic_limits.py
MAX_TOKENS_BUDGET = 100,000          # Per-run hard cap
MAX_TOKENS_PER_ITERATION = 8,000     # Per LLM call
MAX_REACT_ITERATIONS = 20            # Max ReAct loop cycles
MAX_MEMORY_CONTENT_LENGTH = 500       # Per-memory char limit
MAX_MEMORIES_PER_AGENT = 100         # Per-agent capacity

# working_memory.py
TTL_SECONDS = 3600                   # 1 hour (Redis)
MAX_OBSERVATIONS = 50
MAX_CONSTRAINTS = 20
MAX_FAILED_APPROACHES = 20

# long_term_memory.py
DECAY_RATE = 0.95                    # Per day
DEACTIVATION_THRESHOLD = 0.1         # Confidence threshold
```

---

**Last Updated:** 2026-03-23
**Audit Method:** Code reading + pattern search + schema analysis
**Confidence:** High (all findings code-verified)
