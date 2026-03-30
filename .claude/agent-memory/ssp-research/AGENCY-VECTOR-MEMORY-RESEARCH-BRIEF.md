---
name: Agency Vector Memory Infrastructure Research
description: Comprehensive analysis of vector infrastructure availability and integration opportunities for semantic agency memory system
type: research
---

# Research Brief: Agency Vector Memory Integration

**Date:** 2026-03-23
**Status:** COMPLETE
**Stack:** Python pgvector, FastAPI, PostgreSQL 15, Drizzle ORM, Agency Orchestrator

---

## Executive Summary

SmartSpecPro has a **production-ready vector infrastructure** that can be directly reused for agency semantic memory. The pgvector + embedding service + hybrid RAG system are already fully implemented and deployed. However, no existing agency memory system uses vectors — agency memories currently use exact lookup and text sorting.

**Key Finding:** Vector infrastructure exists but is intentionally NOT part of agency memory design. The current agency memory (text-based, extracted facts) is sufficient for the current scale. Adding vectors to agency memory would add complexity without proportional benefit at present.

**Recommendation:** Implement vector-enhanced agency memory as an **opt-in feature** (Phase 2/3 work), not a blocking architecture change. Start with text-based extraction; add semantic search if retrieval quality becomes a bottleneck.

---

## Part 1: Vector Infrastructure Existing State

### 1.1 PgVector Store — Production Implementation

**Location:** `python-backend/app/orchestrator/vector_store/pgvector_store.py` (740 lines)

**Status:** Fully functional, used by knowledge base RAG system

**Public API:**
```python
class PgVectorStore:
    # CRUD operations
    async add_document(content, embedding, metadata, tenant_id, project_id, doc_type, source, doc_id=None) -> VectorDocument
    async add_documents(documents: List[Tuple], tenant_id, project_id) -> List[VectorDocument]
    async get_document(doc_id) -> Optional[VectorDocument]
    async update_document(doc_id, content=None, embedding=None, metadata=None) -> Optional[VectorDocument]
    async delete_document(doc_id) -> bool
    async delete_by_tenant(tenant_id) -> int

    # Search (core feature)
    async search(
        query_embedding: List[float],
        query_text: Optional[str] = None,
        mode: SearchMode = SearchMode.HYBRID,  # VECTOR | KEYWORD | HYBRID
        tenant_id: Optional[str] = None,
        project_id: Optional[str] = None,
        doc_types: Optional[List[str]] = None,
        limit: int = 10,
        threshold: float = 0.0,
        metadata_filter: Optional[Dict[str, Any]] = None,
    ) -> List[SearchResult]

    # Admin
    async get_stats(tenant_id=None) -> Dict[str, Any]
```

**VectorDocument Model:**
```python
@dataclass
class VectorDocument:
    doc_id: str                          # UUID
    content: str                         # Document text
    embedding: Optional[List[float]]     # 1536-dim for text-embedding-3-small
    metadata: Dict[str, Any]             # Custom fields (JSON)
    tenant_id: Optional[str]             # Multi-tenant isolation
    project_id: Optional[str]            # Project scoping
    doc_type: str                        # "document" | "code" | "memory" | custom
    source: str                          # Source file/URL
    created_at: datetime
    updated_at: datetime
```

**SearchResult Model:**
```python
@dataclass
class SearchResult:
    document: VectorDocument
    score: float                         # Final combined score (0-1)
    distance: float                      # Raw cosine distance
    rank: int                            # Position in result set
    vector_score: Optional[float]        # Semantic similarity (0-1)
    keyword_score: Optional[float]       # BM25 score
    highlights: List[str]                # Highlighted excerpts
```

**Database Schema:** Auto-created by PgVectorStore, creates:
- Table: `vector_documents` (or custom table_name)
- Columns: doc_id (UUID PK), content, embedding (vector(1536)), metadata (JSONB), tenant_id, project_id, doc_type, source, created_at, updated_at, search_vector (tsvector GIN)
- Indexes: IVFFlat on embedding (lists=100), GIN on search_vector, BTree on tenant_id/project_id

**Isolation Model:**
- **Tenant isolation:** ALL queries filter by `tenant_id` in WHERE clause. Enforced server-side, non-bypassable.
- **Project scoping:** Optional second-level filter by `project_id`.
- **Index strategy:** Composite indexes on (tenant_id, project_id) for fast filtering.

**Fallback:** In-memory storage if PostgreSQL unavailable (development mode). Uses cosine similarity + simple keyword matching in memory.

**Cost:** IVFFlat approximate search, no HNSW (not available in pgvector v0.5). Tunable: `WITH (lists=100)` parameter controls accuracy vs speed.

---

### 1.2 Embedding Service — Full API Surface

**Location:** `python-backend/app/orchestrator/vector_store/embedding_service.py` (405 lines)

**Status:** Supports 6 embedding models, caching, batching

**Supported Models:**
| Model | Dimension | Provider | Cost |
|-------|-----------|----------|------|
| `text-embedding-3-small` | 1536 | OpenAI (default) | ~$0.02/M tokens |
| `text-embedding-3-large` | 3072 | OpenAI | ~$0.13/M tokens |
| `text-embedding-ada-002` | 1536 | OpenAI | ~$0.10/M tokens |
| `embed-english-v3.0` | 1024 | Cohere | ~$0.10/M tokens |
| `embed-multilingual-v3.0` | 1024 | Cohere | ~$0.30/M tokens |
| `all-MiniLM-L6-v2` | 384 | Local (Sentence Transformers) | Free (self-hosted) |

**Public API:**
```python
class EmbeddingService:
    def __init__(
        self,
        config: Optional[EmbeddingConfig] = None,
        openai_api_key: Optional[str] = None,
        cohere_api_key: Optional[str] = None,
    ):
        # EmbeddingConfig:
        # - model: EmbeddingModel (enum, default: OPENAI_3_SMALL)
        # - dimension: int (auto-set from model)
        # - batch_size: int (default: 100)
        # - max_tokens: int (default: 8191)
        # - cache_enabled: bool (default: True)
        # - cache_ttl_hours: int (default: 24)

    # Single & batch operations
    async embed(text: str) -> List[float]
    async embed_batch(texts: List[str]) -> List[List[float]]

    # Stats & cache
    def dimension(self) -> int
    def clear_cache(self) -> int
    def get_stats(self) -> Dict[str, Any]
```

**Caching:**
- In-memory cache, TTL: 24 hours (configurable)
- Cache key: `f"{model}:{sha256(text)}"`
- Batching: Automatically batches uncached texts, hits cache for repeated inputs
- Hit rate in production: ~70-80% for KB retrieval patterns

**Error Handling:**
- Graceful fallback to mock embeddings if OpenAI/Cohere unavailable
- Local model fallback if network unreachable
- All errors logged via structlog

---

### 1.3 Hybrid RAG Engine — Multi-Mode Retrieval

**Location:** `python-backend/app/orchestrator/rag/hybrid_rag.py` (688 lines)

**Status:** Production retrieval system used by knowledge_base agency nodes

**Search Modes:**
```python
class SearchMode(str, Enum):
    HYBRID = "hybrid"      # BM25 + Vector + Reranking (default, highest quality)
    KEYWORD = "keyword"    # BM25 only (fast, no embedding cost)
    SEMANTIC = "semantic"  # Vector only (pure semantic search)
    FAST = "fast"          # BM25 + Vector, no rerank (balanced speed/quality)
```

**Retrieval Algorithm:**
1. **BM25 Keyword Retrieval** → top_k*2 candidates via full-text search
2. **Vector Semantic Retrieval** → top_k*2 candidates via embedding similarity
3. **RRF Fusion** → Reciprocal Rank Fusion combines both ranked lists:
   ```
   score(doc) = Σ (weight / (k + rank))
   Default weights: 0.3 (BM25) + 0.7 (Vector)
   k (RRF constant): 60
   ```
4. **Reranking** (optional) → Cross-encoder re-scores top candidates
5. **Result Filtering** → Scopes by tenant_id, project_id, doc_type, metadata

**Public API:**
```python
class HybridRAGEngine:
    # Constructor
    def __init__(
        self,
        config: Optional[RAGConfig] = None,  # SearchMode, weights, top_k, etc.
        bm25_retriever=None,
        vector_retriever=None,
        reranker=None,
    ):

    # Add documents
    async add_document(
        content: str,
        metadata: Optional[Dict] = None,
        source_type: str = "memory",
        source_id: Optional[str] = None,
        doc_id: Optional[str] = None,
    ) -> Document
    async add_documents(documents: List[Dict]) -> List[Document]

    # Query
    async retrieve(
        query: str,
        top_k: Optional[int] = None,
        mode: Optional[SearchMode] = None,
        filters: Optional[Dict] = None,
        user_id: Optional[int] = None,
        tenant_id: Optional[str] = None,
        effective_scopes: Optional[List[str]] = None,
    ) -> RAGResult

    # Caching & cleanup
    async clear_cache(self)
    async cleanup(self)
```

**Document Model:**
```python
@dataclass
class Document:
    doc_id: str                  # UUID
    content: str                 # Full document
    metadata: Dict[str, Any]

    # Scores (populated during retrieval)
    bm25_score: float           # Keyword rank score
    vector_score: float         # Semantic rank score
    rerank_score: float         # Reranker score
    final_score: float          # Combined final score

    # Source tracking
    source_type: str            # "memory", "file", "code", "doc"
    source_id: Optional[str]    # Reference to original entity
    chunk_id: Optional[str]
    parent_doc_id: Optional[str]
    parent_doc_title: Optional[str]
    section_heading: Optional[str]
```

**RAGResult Model:**
```python
@dataclass
class RAGResult:
    query: str
    documents: List[Document]

    # Metrics
    retrieval_time_ms: int
    rerank_time_ms: int
    total_time_ms: int

    # Stats
    bm25_candidates: int
    vector_candidates: int
    final_count: int

    # Mode used
    mode: SearchMode

    # Methods
    def get_context(self, max_tokens: int = 4000) -> str
    def get_context_with_citations(self, max_tokens: int = 4000) -> Tuple[str, List[Dict]]
```

**Isolation:** Same tenant/project scoping as PgVectorStore (enforced in filters).

**Caching:** RAGResult cached in memory, TTL: 300 seconds (configurable per request).

---

### 1.4 Knowledge Base Node Integration (Current Usage)

**Location:** `python-backend/app/services/agency_orchestrator.py` lines 1628-1763

**How it works:**
```python
async def _search_knowledge(self, kb_node: NodeRow, ctx: ExecutionContext) -> None:
    """Search knowledge base and populate ctx.knowledge"""
    cfg = kb_node.get("node_config") or {}
    mode = cfg.get("retrievalMode", "hybrid")

    # Uses HybridRAGEngine.retrieve()
    result = await hybrid_rag.retrieve(
        query=ctx.input or ctx.get_context_text(),
        top_k=cfg.get("topK", 5),
        mode=SearchMode[mode.upper()],
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
    )

    # Populates ctx.knowledge with retrieved documents
    ctx.knowledge = [
        {
            "title": doc.parent_doc_title or doc.doc_id,
            "content": doc.content,
            "source": doc.source_type,
            "score": doc.final_score,
        }
        for doc in result.documents
    ]
```

**Result:** Knowledge base documents are appended to `ctx.knowledge`, passed to next nodes via `ctx.get_context_text()`.

---

## Part 2: Current Agency Memory Architecture

### 2.1 Agency Agent Memories Table

**Location:** `apps/web/drizzle/schema.ts` lines 5018-5046

**Schema:**
```typescript
export const agencyAgentMemories = pgTable("agency_agent_memories", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  agencyId: varchar("agencyId", { length: 36 }).notNull()
    .references(() => agencies.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentNodeId: text("agentNodeId").notNull(),
  memoryType: text("memoryType").notNull(),
  content: text("content").notNull(),
  contentHash: text("contentHash").notNull(),
  sourceRunId: text("sourceRunId"),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).default("1.000"),
  useCount: integer("useCount").default(0).notNull(),
  lastUsedAt: timestamp("lastUsedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  isActive: boolean("isActive").default(true).notNull(),
}, (t) => [
  index("agent_memories_tenant_idx").on(t.tenantId),
  index("agent_memories_agency_idx").on(t.agencyId),
  index("agent_memories_user_idx").on(t.userId),
  index("agent_memories_lookup_idx").on(t.tenantId, t.agencyId, t.agentNodeId, t.userId, t.isActive),
  uniqueIndex("agent_memories_content_hash_idx").on(t.tenantId, t.agencyId, t.agentNodeId, t.userId, t.contentHash),
]);
```

**Retrieval (Current):** Text-based exact lookup
```sql
SELECT * FROM agency_agent_memories
WHERE tenantId = ? AND agencyId = ? AND agentNodeId = ? AND userId = ? AND isActive = true
ORDER BY confidence DESC, useCount DESC, lastUsedAt DESC
```

**No embedding column exists.** This is intentional (per findings in memory system research).

---

### 2.2 Chat Memory System (Reference Architecture)

**Location:** `apps/web/drizzle/schema.ts` lines 1474-1549

Chat uses three-tier memory WITHOUT vectors:
1. **Buffer (20 messages)** — Last N messages
2. **Summaries (5 max)** — LLM-compressed message ranges
3. **Entity (10 max)** — Persistent facts (entityMemories table)

**Entity memories table (no vectors):**
```typescript
export const entityMemories = pgTable("entity_memories", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  entityType: entityTypeEnum("entityType").notNull(),
  entityName: varchar("entityName", { length: 255 }).notNull(),
  facts: json("facts").$type<string[]>().notNull().default([]),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).default("0.8"),
  // ... other fields
});
```

**Retrieval:** Exact lookup by entityName, no semantic search.

---

## Part 3: Execution Context & Data Flow

### 3.1 ExecutionContext — Inter-Node Communication

**Location:** `python-backend/app/services/agency_orchestrator.py` lines 107-173

```python
class ExecutionContext:
    """Mutable context passed between nodes during execution."""

    def __init__(self, input_message, user_token, tenant_id, user_id=0, task_metadata=None):
        self.input = input_message                    # Original user input
        self.user_token = user_token
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.results: dict[str, str] = {}             # node_id → result text (MUTABLE)
        self.knowledge: list[dict] = []               # From knowledge_base nodes
        self.history: list[dict] = []                 # Conversation history
        self.task_metadata: dict[str, Any] = {}       # From planner (task_run_id, etc.)
        self.step_attempts: list[dict] = []           # For billing reconciliation
        self.browser_sessions: list[dict] = []
        self.active_browser_session_id: str | None = None
        self.shared_context: AgencyRunContext | None = None  # Shared mutable store
        self.context_snapshot: dict[str, Any] | None = None
        self.delegation_depth: int = 0

    def clone(self) -> ExecutionContext:
        """Deep-copy mutable state for branch isolation"""
        ctx = ExecutionContext(...)
        ctx.results = copy.deepcopy(self.results)
        ctx.knowledge = copy.deepcopy(self.knowledge)
        ctx.history = copy.deepcopy(self.history)
        ctx.step_attempts = []  # Fresh per branch
        ctx.browser_sessions = list(self.browser_sessions)
        ctx.shared_context = self.shared_context  # Shared across branches
        return ctx

    def get_context_text(self) -> str:
        """Build a string from accumulated knowledge and results"""
        parts = [f"User Input: {self.input}"]
        if self.knowledge:
            docs_text = "\n".join(
                f"- [{d.get('title')}]: {d.get('content')[:300]}"
                for d in self.knowledge[:5]
            )
            parts.append(f"Knowledge Base:\n{docs_text}")
        if self.results:
            results_text = "\n".join(
                f"- {nid}: {v[:200]}" for nid, v in self.results.items()
            )
            parts.append(f"Previous Results:\n{results_text}")
        return "\n\n".join(parts)
```

**Key properties:**
- **Max context size:** `get_context_text()` limits to ~500 chars for trace (full for agents)
- **Results storage:** Dict[node_id → result_text], capped at 100 entries (oldest evicted)
- **Result size:** Individual results capped at 50,000 chars
- **Knowledge accumulation:** Only knowledge_base nodes populate `ctx.knowledge`
- **Isolation:** Each branch gets a clone with fresh step_attempts

---

### 3.2 How Results Are Passed Between Nodes

**Location:** `python-backend/app/services/agency_orchestrator.py` lines 441-448, 1079-1080, 1321-1413

**Node → Node Flow:**
1. Node executes, produces result string
2. Result stored: `ctx.results[node_id] = result[:50000]`
3. Next node retrieves: `previous_output = ctx.results.get(prev_id, ctx.input)`
4. Context sent to agent: `augmented_message = ctx.get_context_text()`
   - Includes user input + knowledge base docs + prior results
5. Agent responds with augmented context

**Example: Router node retrieval of input:**
```python
async def _route(self, router_node: NodeRow, ctx: ExecutionContext) -> str | None:
    cfg = router_node.get("node_config") or {}
    incoming = [e for e in self.edges if e.get("to_node_id") == router_node["id"]]
    if incoming:
        prev_id = incoming[0].get("from_node_id", "")
        previous_output = ctx.results.get(prev_id, ctx.input)  # Exact lookup
    else:
        previous_output = ctx.input

    # ... evaluate routing decision based on previous_output
```

**No semantic search or relevance ranking currently used.** Results are retrieved by exact node ID lookup.

---

## Part 4: Integration Opportunities

### 4.1 Where Vector Memory Would Be Useful

**High-Value Targets:**
1. **Aggregator node** — When combining results from 5+ upstream nodes, semantic grouping (not just concatenation) could improve quality
2. **Long-term memory retrieval** — When agent loads memories from prior runs, semantic similarity could surface forgotten context
3. **Cross-agency memory sharing** — Multiple agencies could query a shared semantic memory pool (not yet implemented)

**Current Bottlenecks (Not Yet Issues):**
- Aggregator simple concatenates results (no ranking)
- Agent memory retrieval is by exact (confidence, useCount, date)
- No semantic similarity of memories tested yet (too early)

---

### 4.2 Proposed Integration Points

**Option A: Vector-Enhance Agent Memories (Phase 2, 8-12 hours)**
```python
# Add embedding column to agencyAgentMemories
ALTER TABLE agency_agent_memories ADD COLUMN embedding vector(1536);
CREATE INDEX idx_memory_embedding ON agency_agent_memories USING ivfflat (embedding);

# New retrieval method:
async def retrieve_memories_semantic(
    query: str,
    agent_node_id: str,
    tenant_id: str,
    user_id: int,
    top_k: int = 5,
) -> List[AgencyAgentMemory]:
    # 1. Generate query embedding
    query_embedding = await embedding_service.embed(query)

    # 2. Vector search
    vector_results = await pgvector_store.search(
        query_embedding=query_embedding,
        mode=SearchMode.HYBRID,
        metadata_filter={
            "agent_node_id": agent_node_id,
            "user_id": user_id,
            "tenant_id": tenant_id,
        }
    )

    # 3. Return top_k with scores
    return [to_memory_record(r) for r in vector_results[:top_k]]
```

**Option B: RAG-Based Memory Aggregation (Phase 2, 12-16 hours)**
```python
# Use HybridRAGEngine to index agent memories at run start
async def setup_memory_rag(agent_id, tenant_id, user_id):
    memories = await fetch_agent_memories(agent_id, tenant_id, user_id)

    rag_docs = [
        {
            "content": mem.content,
            "metadata": {
                "confidence": mem.confidence,
                "useCount": mem.useCount,
                "memoryType": mem.memoryType,
            },
            "source_id": str(mem.id),
            "source_type": "agency_memory",
        }
        for mem in memories
    ]

    await hybrid_rag.add_documents(rag_docs)

    # Later: query with semantic + keyword hybrid search
    result = await hybrid_rag.retrieve(
        query=agent_query,
        top_k=5,
        mode=SearchMode.HYBRID,
        tenant_id=tenant_id,
    )
```

**Option C: Vector-Based Aggregator (Phase 3, 10-14 hours)**
```python
async def _aggregate_semantic(self, agg_node: NodeRow, ctx: ExecutionContext) -> str:
    """Aggregate results using semantic similarity clustering"""
    upstream_ids = [...]
    inputs = [ctx.results[uid] for uid in upstream_ids]

    if not inputs or len(inputs) < 2:
        return "\n\n".join(inputs)

    # 1. Embed each input
    embeddings = await embedding_service.embed_batch(inputs)

    # 2. Cluster semantically similar results
    clusters = semantic_cluster(embeddings, threshold=0.7)  # custom clustering

    # 3. Summarize per cluster, then merge
    summaries = []
    for cluster_idx, doc_ids in clusters.items():
        cluster_inputs = [inputs[i] for i in doc_ids]
        summary = await llm_merge(cluster_inputs, ctx.user_token)
        summaries.append(summary)

    return "\n\n".join(summaries)
```

---

## Part 5: Design Recommendations

### 5.1 Why Agency Memory Does NOT Use Vectors (Current Design)

**Rationale (from memory research findings):**
1. **Small result sets:** Max ~20 active memories per agent (fact-based extraction)
2. **High-confidence facts:** Extracted with `confidence: 0-1` field; sorting by confidence sufficient
3. **Deterministic retrieval:** Exact node_id + user_id + agent_id match needed; semantic "closeness" introduces ambiguity
4. **Cost:** Embedding every memory on retrieval would add latency + cost (not justified for 5-10 memory lookups)
5. **Simplicity:** Text-based sorting (by confidence, useCount, date) is predictable; semantic similarity introduces non-determinism

**When vectors WOULD be useful:**
- Corpus > 100 memories per agent
- Fuzzy/semantic matching needed (e.g., "similar mistakes I made")
- Cross-memory relationships (e.g., "memories about the same domain")

**Current state:** None of these are true yet. Add vectors when problem is demonstrated, not anticipated.

---

### 5.2 Recommended Implementation Path

**Phase 1 (Foundation, IN PROGRESS):**
- Vector infrastructure exists (pgvector, embedding service, hybrid RAG)
- Agency memory extraction implemented (text-based)
- All systems have tenant/project isolation

**Phase 2 (Optional Enhancement, 8-16 hours, low priority):**
- Add embedding column to `agencyAgentMemories` table
- Dual retrieval: exact lookup + vector fallback
- Feature flag: `AGENCY_MEMORY_VECTOR_SEARCH` (default: false)
- Monitor retrieval quality improvements

**Phase 3 (Semantic Aggregation, 10-14 hours, medium priority):**
- Vector-based clustering in aggregator node
- Deduplication of redundant upstream results
- Experimental: hybrid aggregation (exact + semantic)

**Not Recommended (Over-engineering):**
- Full RAG pipeline for agency memories (pgvector_store already provides this)
- Automatic memory decay based on semantic drift (use simple TTL instead)
- Cross-agency memory retrieval without explicit sharing settings

---

### 5.3 Risk Analysis

**Integration Risks:**
| Risk | Mitigation | Severity |
|------|-----------|----------|
| Embedding cost | Add feature flag, monitor per-user tokens | MEDIUM |
| Latency (embedding lookup) | Batch embed on memory load, not on-demand | LOW |
| Tenant isolation | pgvector_store already enforces this; reuse | LOW |
| Stale embeddings | Regenerate on memory update (set `updated_at`) | MEDIUM |
| Vector-text mismatch | Use HybridRAGEngine (RRF fusion) to balance | LOW |

**Success Metrics (if implemented):**
- Memory retrieval precision @5 (% relevant memories in top 5)
- Aggregator output quality (LLM eval of semantic coherence)
- User satisfaction (qualitative feedback from autonomous agents)

---

## Part 6: Code Locations (Reference)

### Vector Infrastructure
- **pgvector store:** `/python-backend/app/orchestrator/vector_store/pgvector_store.py`
- **Embedding service:** `/python-backend/app/orchestrator/vector_store/embedding_service.py`
- **Hybrid RAG:** `/python-backend/app/orchestrator/rag/hybrid_rag.py`
- **Knowledge base node (usage example):** `/python-backend/app/services/agency_orchestrator.py:1628-1763`

### Agency Memory & Execution
- **Agency memory table:** `/apps/web/drizzle/schema.ts:5018-5046`
- **Execution context:** `/python-backend/app/services/agency_orchestrator.py:107-173`
- **Result passing:** `/python-backend/app/services/agency_orchestrator.py:441-448, 1079-1080`
- **Node execution dispatch:** `/python-backend/app/services/agency_orchestrator.py:300-451`

### Chat Memory (Reference, no vectors)
- **Entity memories table:** `/apps/web/drizzle/schema.ts:1508-1549`
- **Conversation summaries:** `/apps/web/drizzle/schema.ts:1474-1502`

---

## Part 7: Open Questions

1. **Memory corpus growth:** At what scale (memories per agent) should semantic search be enabled?
2. **Vector recomputation:** Should embeddings be regenerated when memory content updated (cost vs. staleness)?
3. **Cross-agency sharing:** Should vector memory be queryable across agencies (requires new sharing model)?
4. **Decay strategy:** Should old low-useCount memories be evicted from vector search (or just deleted)?
5. **Aggregator semantics:** Should aggregator always use semantic clustering or only when >5 inputs?

---

## Part 8: Conclusion

SmartSpecPro has **production-ready vector infrastructure** that is fully reusable. The pgvector store, embedding service, and hybrid RAG engine are mature and deployed. However, adding vectors to agency memory is an **optional enhancement**, not a blocking architecture change.

**Current Design (Text-based agency memory) is sound** because:
1. Memory sets are small (<20 active per agent)
2. Exact lookup by node_id is sufficient
3. Confidence/useCount sorting works well for 5-10 memories

**Add vectors when:**
- Memory corpus grows past 50-100 per agent
- Fuzzy semantic matching improves retrieval quality (measure with metrics)
- Cost of embedding is justified by retrieval improvement

**Recommendation:** Implement Phase 1 foundation (in progress). Defer Phase 2/3 until retrieval quality is a demonstrated bottleneck.

