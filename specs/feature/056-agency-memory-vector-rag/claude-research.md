# Research: Agency Memory Hybrid 2-Level Vector RAG (Spec 056)

## 1. Existing Codebase Infrastructure

### 1.1 Agency Memory System (Current State)

**Long-Term Memory Service** (`python-backend/app/services/long_term_memory.py`):
- `save_memory()`: Stores with confidence score (0-1), content hash dedup, soft-delete (`is_active`)
- `get_memories_for_agent()`: Sorts by `confidence.desc(), use_count.desc()` — NO semantic search
- Safety filter: 30+ patterns for prompt injection, jailbreak, role-playing
- Capacity: `MAX_MEMORIES_PER_AGENT` hard cap per agent+user scope
- Decay: Exponential (DECAY_RATE=0.95), daily via Celery beat, auto-deactivate < 0.1
- Extraction: LLM-based from run outputs, types: constraint | preference | fact | skill

**`agency_agent_memories` table** (Drizzle `schema.ts:5018`):
- Columns: id (serial PK), tenantId, agencyId, userId, agentNodeId, content (text), contentHash (unique), memoryType, confidence (numeric 4,3), useCount, lastUsedAt, sourceRunId, isActive
- Indexes: compound lookup (tenant+agency+node+user+active), content hash unique
- **Missing**: No `embedding` column — spec 056 adds this

**`scoped_memories` table** (Drizzle `schema.ts:6874`):
- Already has `embedding: vector1536` column (for Chat Memory spec 055)
- Different scope model (user/agent/team/room/project/run) — NOT agency-specific
- Has importance, reinforcementCount — different ranking model

**`agency_run_traces` table** (`schema.ts:5114`):
- Checkpoints full execution trace as JSONB
- Has durationMs, totalTokens, totalCost for cost tracking

### 1.2 Vector Store Infrastructure (Ready to Use)

**PgVector Store** (`python-backend/app/orchestrator/vector_store/pgvector_store.py`):
- CRUD: add_document(), search(), update, delete, batch operations
- Search modes: VECTOR (semantic), KEYWORD (full-text via tsvector), HYBRID (70/30 weighted)
- Multi-tenant isolation via tenant_id filter
- Index types: IVFFlat (vector cosine), GIN (full-text), B-tree (metadata)
- Distance: Cosine similarity (1 - distance = similarity)
- In-memory fallback when PostgreSQL unavailable

**Embedding Service** (`python-backend/app/orchestrator/vector_store/embedding_service.py`):
- Models: OpenAI text-embedding-3-small (1536-dim), ada-002, 3-large; Cohere; Local MiniLM
- APIs: `embed(text)`, `embed_batch(texts)` — async-first
- Built-in caching (24hr TTL), rate limiting (batch_size=100)
- Deterministic mock embeddings for testing (hash-based seed)

**Hybrid RAG** (`python-backend/app/orchestrator/rag/hybrid_rag.py`):
- Architecture: BM25 + Vector + Cross-encoder Reranker
- RRF fusion: `score = weight / (k + rank)` with k=60
- Modes: HYBRID, KEYWORD, SEMANTIC, FAST
- Caching: Result cache 300s TTL
- Billing: 1 credit for semantic/hybrid searches
- Context budgeting via max_tokens parameter

### 1.3 Agency Orchestrator Integration Points

**Memory injection** (`agency_orchestrator.py:593-606`):
- Retrieves up to 20 memories by confidence sort
- Formats as `<past_learnings>` XML user-role message
- Called BEFORE agent node execution

**Memory extraction** (`agency_orchestrator.py:646-656, 776-782`):
- Triggered when `enableLongTermMemory` flag set in node config
- LLM-based fact extraction from agent output
- After ReAct/Autonomous executor completes

**ExecutionContext** structure:
- `results: dict[str, str]` — node_id → result text (inter-node passing)
- `knowledge: list[dict]` — populated by knowledge_base nodes
- Currently NO vector-based context retrieval

### 1.4 Celery Beat Schedule

- `decay-agent-memories`: Daily at 4:30 AM UTC — confidence decay for active memories
- Other tasks: cleanup-expired-tasks (daily), retry-failed-tasks (15 min)
- Queue: "media" (active workers)

### 1.5 Testing Infrastructure

- **Framework**: pytest with asyncio marker
- **DB**: In-memory SQLite with StaticPool (JSONB not compatible)
- **Mocking**: AsyncSession with MagicMock for queries
- **Coverage**: long_term_memory.py has comprehensive tests (sanitization, safety, dedup, capacity, decay)
- **Feature flags**: Mocked via `patch("app.services.agentic_feature_flags.check_agentic_flag")`

### 1.6 Design Precedents

| Decision | Source | Implication for 056 |
|----------|--------|-------------------|
| Vector dim = 1536 | embedding_service.py default | Use 1536 for both L1 and L2 |
| Cosine similarity | pgvector_store.py | Use cosine distance in retrieval |
| Hybrid weights 70/30 | hybrid_rag.py | Apply same weighting |
| Tenant isolation | All services | Enforce tenant_id at DB level |
| Soft-delete pattern | long_term_memory.py | Use is_active; hard-delete in maintenance |
| Feature flag control | agentic_feature_flags | Gate 2-level retrieval |
| Async-first | All orchestrator code | All new services async/await |

---

## 2. pgvector HNSW Best Practices (2026)

### Optimal Parameters for < 1M Rows

| Parameter | Default | Recommended | Notes |
|-----------|---------|-------------|-------|
| `m` | 16 | **16** (keep default) | Max bidirectional connections/layer |
| `ef_construction` | 64 | **64-128** | Build-time search depth; 128 for 100K+ rows |
| `hnsw.ef_search` | 40 | **40-200** at runtime | Primary recall vs latency knob |

**HNSW vs IVFFlat**: Use HNSW. Recall is stable (no centroid drift), query latency 2-6ms. IVFFlat only wins on build time (5-6x faster) but requires periodic reindexing.

### Partial Indexes

Partial indexes are dramatically effective for filtered searches:
- Index scoped to one category was **11x smaller** and built **20x faster**
- Pattern: `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops) WHERE "isActive" = true;`
- WHERE clause must exactly match query predicates

### Iterative Scans (pgvector 2026)

New feature for combining HNSW with WHERE filters:
- `SET hnsw.iterative_scan = 'relaxed_order'` — approximate ranking, faster
- `hnsw.max_scan_tuples = 20000` default; increase for aggressive filtering
- Eliminates need for multiple partial indexes in many cases

### Similarity Thresholds

| Use Case | Threshold | Notes |
|----------|-----------|-------|
| Broad retrieval | >= 0.5 | Captures loosely related |
| Balanced (recommended for RAG) | >= 0.65-0.7 | Good default |
| High precision | >= 0.75-0.8 | Only highly relevant |

**Important**: Threshold filtering via `1 - (embedding <=> query)` does NOT use index efficiently. Retrieve top-K first, filter in application code.

### Memory Tuning

Formula: `rows × (dims × 4 + 8) × (m/2 + 1)` bytes for `maintenance_work_mem`
- 100K rows × 1536-dim × m=16: ~5.5GB
- Use `SET LOCAL` for runtime params in production

**Warning**: `ef_search > 200-400` may cause PostgreSQL to switch to sequential scan (2.5ms → 365ms).

### Sources
- Crunchy Data, DBI Services, pgvector GitHub, Neon, Supabase

---

## 3. Hybrid RAG Retrieval Patterns

### Reciprocal Rank Fusion (RRF)

**Formula**: `RRF_score(d) = SUM(1 / (k + rank(r, d)))` per retriever r
- **k = 60** (industry standard) — favors consensus across retrievers
- Works on rank position, ignoring incomparable score magnitudes
- No normalization needed

### Two-Stage Architecture

```
Query → BM25 (parallel) → RRF Fusion (k=60) → Cross-encoder Rerank → Top 5-10
      → Vector search    ↗                     (top 20-50 candidates)
```

### 2-Level Index Pattern

| Level | Contents | Purpose |
|-------|----------|---------|
| **Facts/Summaries** | Extracted key facts, entity relationships | Fast factoid lookup, metadata-driven |
| **Raw Chunks** | Original document chunks (500-1000 tokens) | Detailed context, preserves nuance |

Query both levels, fuse with RRF, then rerank. Facts catch exact terms; chunks capture semantic meaning.

### Recency Scoring

- Add recency as third RRF input alongside BM25 + vector
- Decay function: `recency_boost = 1 / (1 + days_since_creation * decay_rate)`
- Rates: 0.01-0.05/day for stable knowledge, 0.1-0.5 for fast-changing

### When BM25 Beats Vector

Hybrid most valuable for: exact identifiers, error codes, rare tokens, acronyms, code snippets, domain abbreviations.

### Sources
- Elastic, Superlinked VectorHub, PremAI, Analytics Vidhya

---

## 4. Context Window Budget Management

### Allocation Framework

| Component | % of Budget | Strategy |
|-----------|-------------|----------|
| System Instructions | 10-15% | Static, cache aggressively |
| Tool Context | 15-20% | Dynamically filter to relevant tools |
| Knowledge/RAG Context | 30-40% | Dynamic, varies by query |
| History/Memory | 20-30% | Active compression required |
| Response Buffer | 10-15% | Always reserved, never allocated |

### Token Estimation

- ~4 chars/token for English, ~1.5-2 chars/token for code
- Budget response tokens separately (2K-8K standard, 16K+ for code)

### Compression Ratios

| Content | Target | Technique |
|---------|--------|-----------|
| Historical turns | 3:1 to 5:1 | Incremental summarization |
| Tool outputs | 10:1 to 20:1 | Extract key results; store full externally |
| Completed subtasks | 5:1 to 10:1 | Preserve outcome + decisions |

### Key Strategies for Agentic Systems

1. **Compaction**: Auto-summarize at 70% utilization; preserve architectural decisions, unresolved issues
2. **Sub-Agent Architecture**: Delegate focused tasks; subagents consume 10K+ tokens, return 1-2K summaries
3. **Dynamic Tool Filtering**: Load only phase-appropriate tools (67% savings)
4. **Just-in-Time Retrieval**: Pass identifiers, let agent request content via tools
5. **Context Awareness**: Inject token budget tracking for agent self-pacing

### Anti-Patterns

- Filling context "just because you can" — context rot degrades recall
- Pre-loading all RAG documents instead of JIT retrieval
- Keeping full tool outputs when only key results matter
- Hardcoded if-else in system prompts

### Sources
- Anthropic (Context Windows, Context Engineering), Maxim, Factory.ai, JRodDev
