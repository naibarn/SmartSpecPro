# Synthesized Specification: Agency Memory Hybrid 2-Level Vector RAG (056)

## 1. Problem Statement

The current agency memory system suffers from four critical issues:

1. **Context bloat**: Inter-node outputs pass up to 50K chars (~12,500 tokens) via `ctx.results`, often exceeding model context limits in multi-node chains.
2. **Lossy summarization**: `_compress_messages()` uses LLM summarization to reduce context, but important details are irrecoverably lost.
3. **Irrelevant memory retrieval**: Memories are retrieved by confidence score sort, not semantic relevance — ~70% of injected memories are irrelevant to the current task.
4. **Unbounded memory growth**: Soft-deleted memories are never hard-purged. No TTL on any data. Storage grows indefinitely.

## 2. Solution: Hybrid 2-Level Vector Index

### Level 1: Extracted Facts (Primary Search)
- Short, extracted facts from agent outputs (5-10 per run)
- Stored in existing `agency_agent_memories` table with new `embedding vector(1536)` column
- Searched first via cosine similarity (threshold ≥ 0.6, top-K = 10)
- High quality, low token count, always used in context

### Level 2: Message Chunks (Fallback Search)
- Raw node outputs chunked into ~500 token segments with 50-token overlap
- Stored in new `agency_memory_chunks` table with embeddings
- Searched only when Level 1 returns < 3 results (threshold ≥ 0.5, top-K = 5)
- Safety net — raw data never lost, detail retrievable when needed

### Context Budget Manager
- Pre-flight check before every LLM call
- Allocates max 60% of model context window for input
- Greedily fills budget: system prompt → L1 facts → L2 chunks → working memory → user input
- Truncates gracefully when budget exceeded

## 3. Scope & Decisions

### From Interview

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Memory scale | Medium (100-1000/agent) | HNSW defaults sufficient, no need for IVFFlat |
| Rollout | Default ON for all agencies | No feature flag gating for 2-level retrieval |
| Chunk retention | Configurable per-tenant (default 7 days) | Admin sets in tenant settings, range 3-30 days |
| Embedding failure | Graceful degradation | Save without embedding, fall back to confidence-sort |
| Backfill | Auto on deploy | Celery task triggers after migration, ~30s / $0.04 |

### Auto-Decided (Technical)

| Decision | Choice | Reason |
|----------|--------|--------|
| Embedding model | text-embedding-3-small (1536-dim) | Matches existing embedding_service.py |
| Index type | HNSW (m=16, ef_construction=64) | Optimal for < 1M rows, stable recall |
| Partial index | WHERE `isActive = true` | Matches spec + pgvector best practices |
| Distance metric | Cosine, app-side threshold | Threshold via WHERE doesn't use index efficiently |
| Hybrid scoring | 70% semantic + 20% confidence + 10% recency | Matches existing hybrid_rag.py weights |
| Purge schedule | Celery beat daily at 5:00 AM UTC | Matches existing decay task pattern |
| Testing | pytest + AsyncSession mocking | Matches existing test infrastructure |

## 4. Database Changes

### 4.1 Modify: `agency_agent_memories`
- Add `embedding vector(1536)` nullable column
- Add HNSW index with partial filter: `WHERE "isActive" = true`
- Add compound lookup index: `(tenantId, agencyId, agentNodeId, userId) WHERE isActive = true`
- Risk: LOW — nullable column, no data migration required

### 4.2 Create: `agency_memory_chunks`
- New table for Level 2 chunk storage
- Columns: id, tenantId, agencyId, userId, agentNodeId, runId, sourceNodeId, chunkIndex, content, embedding, metadata (JSONB), createdAt, expiresAt
- HNSW index on embedding column
- Lookup index on (tenantId, agencyId, agentNodeId, userId)
- TTL cleanup index on expiresAt
- Corresponding SQLAlchemy model for Python backend

### 4.3 Tenant Settings Extension
- Add `chunkRetentionDays` field to tenant settings (default: 7, range: 3-30)

## 5. New Components

### 5.1 Agency Chunk Service
- `chunk_and_store()`: Split output into ~500 token chunks with overlap, batch embed, store
- `_split_into_chunks()`: Sentence-boundary-aware splitting
- Max 30 chunks per output, sanitize before chunking
- Hooks into post-execution flow (after ReAct/Autonomous executor completes)

### 5.2 Agency Memory Retriever (2-Level)
- `retrieve()`: Search L1 facts → conditional L2 chunks → merge + dedup + budget fit
- L1: cosine ≥ 0.6, top 10; L2: cosine ≥ 0.5, top 5 (only if L1 < 3 results)
- Merge: facts priority 1, chunks priority 2 (discounted 0.8x), dedup by 80% content overlap
- Budget fit: greedy selection until max_tokens reached
- Fallback: confidence-sort when embeddings unavailable

### 5.3 Context Budget Manager
- Model context limit lookup (GPT-4o: 128K, Claude: 200K, default: 32K)
- 60% budget ratio for input context
- `allocate()`: Try to fit text, truncate if needed
- `can_fit()`: Pre-check before allocation
- Token estimation: len(text) // 4 + 1

### 5.4 Memory Purge Job
- Celery beat task, daily at 5:00 AM UTC
- Hard-delete soft-deleted memories older than 30 days
- Hard-delete expired chunks (expiresAt < now)
- Hard-delete old agency_run_traces (> 30 days)

### 5.5 Embedding Backfill
- One-time Celery task triggered after migration
- Batch-embed all existing memories without embeddings
- Resumable (skip rows that already have embeddings)
- Cost: ~$0.04 for ~2000 rows, ~30 seconds

## 6. Integration Points

### 6.1 Orchestrator Wiring
- **Pre-execution**: Replace confidence-sort retrieval with 2-level vector retrieval in `_execute_agent_node()`
- **Post-execution**: Add chunking after result extraction; truncate `ctx.results[node_id]` from 50K to 2K chars
- **Memory injection**: Update format to include L1 facts + L2 chunks with `<agent_context>` framing

### 6.2 Inter-Node Context Optimization
- `ctx.results[node_id]` truncated to 2,000 chars (was 50,000)
- Full output stored in vector chunks for on-demand retrieval
- Backward compatible: existing `get_context_text()` already truncates to 200 chars

## 7. Security Requirements

| Concern | Mitigation |
|---------|-----------|
| Tenant isolation in vector search | All queries scoped by tenantId + agencyId + userId |
| Prompt injection via chunks | `sanitize_llm_input()` before chunking |
| Memory poisoning | Existing safety filter (30+ patterns) on fact extraction |
| Cost attack (mass embeddings) | MAX_MEMORIES_PER_AGENT (100) + MAX_CHUNKS_PER_OUTPUT (30) |
| Context injection | User-role message, explicitly "not instructions" framing |

## 8. Performance Targets

| Metric | Current | Target |
|--------|---------|--------|
| Context tokens per node | ~8,000 avg | ~2,500 avg |
| Memory relevance | ~30% | ~80% |
| Context overflow errors | ~5% of runs | 0% |
| Inter-node token passing | ~12,500 tokens | ~500 tokens |
| Memory retrieval latency | ~5ms | ~15ms (acceptable) |
| Storage per tenant/year | ~1GB | ~200MB |

## 9. Implementation Sections

| # | Title | Dependencies |
|---|-------|-------------|
| 01 | DB Migration — embedding column + chunks table | — |
| 02 | Embedding Integration — save_memory with embedding | 01 |
| 03 | Chunk Service — chunk + embed + store | 01 |
| 04 | 2-Level Retrieval Engine | 02, 03 |
| 05 | Context Budget Manager | — |
| 06 | Orchestrator Wiring — integrate into execution flow | 03, 04, 05 |
| 07 | Inter-Node Context Optimization | 03, 06 |
| 08 | Memory Purge Job | 01 |
| 09 | Embedding Backfill | 02 |
| 10 | Tests + Verification | All |
