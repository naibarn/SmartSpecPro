# Implementation Plan — RAG Maturity Upgrade with Multi-Tenant Guardrails

## Overview

SmartSpecPro has a working RAG pipeline (HybridRAGEngine with BM25 + Vector retrieval, LLM-based reranking, credit billing, multi-provider vector stores). This plan upgrades it from ~72% maturity to 90%+ across five RAG quality levels, while adding a new foundational layer: **multi-tenant scope-based access control** that enforces data isolation throughout every retrieval step.

The system serves two tenant types:
- **Enterprise tenants** (companies): strict data isolation, tenant-wide policy documents
- **General tenants** (individual users): personal documents with optional group sharing

### Current State (what already works)

- `HybridRAGEngine` in `python-backend/app/orchestrator/rag/hybrid_rag.py` — 4 search modes (HYBRID, KEYWORD, SEMANTIC, FAST), RRF fusion (bm25_weight=0.3, vector_weight=0.7)
- `BM25Retriever` — Okapi BM25 with inverted index, stopwords, k1=1.5, b=0.75
- `VectorRetriever` — OpenAI embeddings (1536 dims), cosine similarity, threshold=0.5, hash-based fallback
- `Reranker` — LLM-based (GPT-4.1-nano per document) with heuristic fallback
- `PgVectorStore` — pgvector with IVFFlat/HNSW, multi-tenant `tenant_id` filtering, RLS
- `EmbeddingService` — OpenAI, Cohere, local sentence-transformers, batch + cache
- Node.js chunking in `vectorize.ts` — fixed 2000-char / 200-char overlap
- Library items/chunks in PostgreSQL with vector store references
- `rag_executor.py` — **stub only** (returns mock data)
- `filters` param in BM25/Vector retrievers — accepted but **not implemented**
- `library_permissions` table — existing permission system with `subject_type`, `subject_id`, `permission_level`, `expires_at`
- `getPermissionLevelForItem()` in `libraryService.ts` — resolves effective permissions from direct shares, tenant role shares, and group shares
- `groupMembers` table — existing group membership with `status` (`active`/`pending`/`removed`), `addedBy`, `joinedAt`
- **In-memory retrievers** — BM25 and Vector retrievers use `self._documents: Dict` (not database-backed)
- **Cache key gap** — `cache_key = f"{query}:{top_k}:{mode.value}"` (no tenant/scope isolation)
- **Embedding dimension mismatch** — Node.js uses 768-dim (bge-base-en-v1.5 via Cloudflare), Python uses 1536-dim (OpenAI ada-002)

### What this plan adds

Six phases, each building on the previous:

```
Phase 0: Multi-Tenant ACL Foundation
  └─ allowed_scopes[], effective_scopes, group invite+accept
Phase 1: Smart Chunking
  └─ Token-based, recursive/markdown/code, parent-child (256/1024 tokens)
Phase 2: Hybrid Search Enhancements
  └─ Scope-aware metadata filtering, query rewriting (HyDE, multi-query)
Phase 3: Reranking Upgrade
  └─ bge-reranker-v2-m3 cross-encoder, Cohere fallback, strategy chain
Phase 4: Production RAG Hardening
  └─ Configurable guardrails per tenant, citations, grounding, query routing, RAG executor
Phase 5: Evaluation & Observability
  └─ Auto-generated eval dataset, Precision@K/MRR/NDCG/Faithfulness, CLI
```

---

## Phase 0: Multi-Tenant ACL Foundation

### Why this comes first

Every phase that follows — chunking, retrieval, reranking, guardrails — must be tenant-aware. If we build smart chunking without `allowed_scopes`, we'd need to retrofit it later. Building the ACL foundation first means every subsequent component naturally enforces isolation.

### 0.1 Schema additions

**Add `allowed_scopes` to existing tables.** The `libraryItems` and `libraryChunks` tables in `apps/web/drizzle/schema.ts` need a new column:

```typescript
// Drizzle ORM syntax
allowedScopes: text("allowed_scopes").array().default(sql`'{}'`),
```

This is a **denormalized cache** of the existing `library_permissions` table. The `library_permissions` table remains the authoritative source of truth for access control. `allowed_scopes` is computed from `library_permissions` records and stored on items/chunks for fast vector DB filtering without joins.

Default value for new documents: `["u:<owner_user_id>"]` (private).

Also add to the Python-side `LibraryChunk` model (`python-backend/app/models/library.py`) as `Column(ARRAY(Text), default=[])` and to the pgvector metadata in `library_chunk_vectors`.

Add a GIN index on `allowed_scopes` for fast array containment queries (`@>` operator).

**Denormalize `allowed_scopes` into chunks** — when a document's scopes change, propagate to all its chunks. This enables fast vector DB filtering without joins.

### 0.1.1 Synchronization with `library_permissions`

`allowed_scopes` must stay in sync with the `library_permissions` table at all times:

1. **On permission create/update/delete**: Recompute `allowed_scopes` for the affected `libraryItem` from its `library_permissions` records, the item's `visibility` setting, and the owner's `user_id`
2. **Propagate to chunks**: Update `allowed_scopes` on all `libraryChunks` belonging to that item
3. **Propagate to vector stores**: Update metadata in the vector store (see section 0.4)
4. **Hook point**: Add scope recomputation as a post-commit hook or service call wherever `library_permissions` are modified (in `libraryService.ts`)

The computation logic:
- Start with `["u:<owner_user_id>"]`
- For each `library_permissions` record with `permission_level >= "read"`: add `"u:<subject_id>"` (if user), `"g:<subject_id>"` (if group), `"t:<subject_id>"` (if tenant)
- If `visibility = "public"`: add `"p:global"`
- If `visibility = "team"`: add `"t:<tenant_id>"`

### 0.1.2 Fix cache key for tenant isolation

**Pre-requisite fix**: The `HybridRAGEngine` cache key at `hybrid_rag.py:313` is `f"{query}:{top_k}:{mode.value}"` — it lacks tenant/scope information, making cross-tenant cache pollution possible. Fix immediately:

```python
scope_hash = hashlib.md5(str(sorted(effective_scopes)).encode()).hexdigest()[:8]
cache_key = f"{tenant_id}:{scope_hash}:{query}:{top_k}:{mode.value}"
```

### 0.2 Group membership (invite + accept)

The `groups` and `groupMembers` tables already exist with the following schema:

```typescript
// Existing schema — DO NOT modify columns
role: varchar("role").default("member"),     // "admin" | "member"
status: varchar("status").default("active"), // "active" | "pending" | "removed"
addedBy: integer("added_by"),               // Who invited this member
joinedAt: timestamp("joined_at"),           // When they joined/were invited
removedAt: timestamp("removed_at"),         // When they were removed
```

**Mapping plan semantics to existing columns:**
- `"pending"` = invited (not yet accepted)
- `"active"` = accepted (has group scope rights)
- `"removed"` = declined/revoked (no access)
- `addedBy` = invited_by
- `joinedAt` = when the invite was created (or when they accepted)

**Key rules:**
- Only `active` members gain `g:<group_id>` in their effective scopes
- Enterprise tenants: members must belong to same tenant — reject cross-tenant invites
- Rate limits: max groups per user, max invites per day, max members per group (configurable in system_settings)

### 0.3 Effective scopes computation

Create a utility function that computes a user's effective scopes at query time:

```python
def compute_effective_scopes(user_id: int, tenant_id: str) -> set[str]:
    """Return the set of scopes this user can access."""
    # Always includes: u:<user_id>, p:global
    # Plus: g:<group_id> for each group where status = "active"
    # Plus: t:<tenant_id> if tenant has shared docs
```

This function queries `groupMembers` (filtering for `status = "active"`) and returns the full scope set. It is called at the start of every RAG retrieval to build the scope filter.

### 0.4 Scope propagation on sharing changes

When a `library_permissions` record is created, updated, or deleted:
1. Recompute `libraryItems.allowed_scopes` from the full set of permissions (see 0.1.1)
2. Propagate to all `libraryChunks` for that item
3. Propagate to vector store metadata per provider:
   - **pgvector**: SQL `UPDATE` on the metadata JSONB column
   - **ChromaDB**: `collection.update()` with new metadata
   - **Cloudflare Vectorize**: delete + re-insert (no in-place metadata update supported)
4. Invalidate any cached RAG results for this item (clear from `_cache` dict)
5. Revoke must take effect immediately — no stale cache

### 0.5 Migration safety

Follow the Database Safety Protocol from CLAUDE.md:
- Backup affected tables before migration
- `allowed_scopes` is a nullable column with default `[]` — safe ADD COLUMN
- Backfill existing documents: set `allowed_scopes = ["u:<owner_user_id>"]` for all existing items
- Verify row counts post-migration

### 0.6 Tests for Phase 0

- User in tenant A cannot retrieve documents from tenant B
- User with `g:10` scope can retrieve docs shared with `g:10`
- User with `pending` status (not `active`) cannot access group docs
- Document shared then unshared: retrieval immediately reflects removal
- Enterprise: cross-tenant group invite is rejected
- Default scope for new documents is `["u:<owner>"]`
- Effective scopes computation includes all `active` group memberships
- `allowed_scopes` stays in sync when `library_permissions` records change
- Cache key includes tenant_id and scope hash — no cross-tenant cache pollution
- `library_permissions` delete triggers `allowed_scopes` recomputation

---

## Phase 1: Smart Chunking

### Why the current approach breaks

The `chunkDocument()` function in `vectorize.ts` uses fixed 2000-character windows. This:
- Splits mid-sentence (destroying semantic coherence)
- Splits mid-paragraph (losing context about what's being described)
- Uses character counts instead of tokens (unpredictable for LLM context windows)
- Applies the same strategy to markdown, code, and prose

Research shows smaller chunks (400-512 tokens) outperform 800+ token chunks in precision. The parent-child pattern retrieves small chunks for precision but sends larger context to the LLM.

### 1.1 New file: `chunker.py`

Create `python-backend/app/orchestrator/rag/chunker.py` with:

```python
class ChunkStrategy(str, Enum):
    FIXED = "fixed"          # Legacy backward-compat
    RECURSIVE = "recursive"  # Default: paragraph > line > sentence > word
    MARKDOWN = "markdown"    # Split by headings, preserve structure
    CODE = "code"            # Split by function/class boundaries
    SEMANTIC = "semantic"    # Split by embedding similarity (future)

@dataclass
class ChunkConfig:
    strategy: ChunkStrategy
    child_max_tokens: int = 400      # Retrieval chunks
    child_overlap_tokens: int = 80   # 20% overlap
    parent_max_tokens: int = 1024    # LLM context chunks
    min_chunk_tokens: int = 50       # Don't create tiny chunks
```

```python
@dataclass
class Chunk:
    chunk_id: str
    content: str
    index: int
    parent_chunk_id: str | None     # For child→parent lookup
    parent_doc_id: str
    parent_doc_title: str
    section_heading: str            # Nearest heading above this chunk
    token_count: int
    start_char: int
    end_char: int
    is_parent: bool                 # True for parent chunks, False for children
    tenant_id: str
    allowed_scopes: list[str]       # Inherited from parent document
    metadata: dict
```

**Strategy auto-detection**: Examine the first 500 chars of the document. If it contains markdown headings (`#`, `##`), use MARKDOWN. If it contains `def `, `class `, `function `, use CODE. Otherwise, RECURSIVE.

**Recursive splitting hierarchy**: Try `\n\n` (paragraphs) → `\n` (lines) → `. ` (sentences) → ` ` (words). Never split mid-word. Use `tiktoken` for accurate token counting.

**Parent-child relationship**: For each parent chunk (1024 tokens), generate 2-4 child chunks (400 tokens each with overlap). Children store `parent_chunk_id`. Retrieval searches children; context expansion fetches the parent.

### 1.2 Schema additions for parent-child chunks

Add two columns to `libraryChunks` in Drizzle schema:

```typescript
isParent: boolean("is_parent").default(false).notNull(),
parentChunkId: text("parent_chunk_id"),  // References another chunk's ID
```

Also add to the Python-side `LibraryChunk` model. These are required for the parent-child pattern.

### 1.3 Integrate into indexing pipeline

In `library_indexing_service.py`, replace direct chunk creation with the new `SmartChunker`. The chunker receives document content + item_type and returns `Chunk` objects with both parent and child chunks. Both are stored in `libraryChunks` — parents with `is_parent=True`, children with `is_parent=False` + `parent_chunk_id`.

Only child chunks are embedded and indexed in the vector store. Parent chunks are stored for context expansion but not searchable.

### 1.4 Embedding model standardization

The Python-side OpenAI embedding model (1536-dim, ada-002/text-embedding-3-small) is the standard for the RAG pipeline. During the smart chunking re-indexing:
- All new chunks are embedded using the Python `EmbeddingService` (1536-dim)
- Existing 768-dim vectors from Node.js `vectorize.ts` (bge-base-en-v1.5) are replaced when their parent documents are re-chunked
- After full re-indexing, all vectors in the RAG pipeline are 1536-dim

### 1.5 Re-indexing existing documents

Existing documents must be re-chunked and re-embedded with the new chunker. This is a batch operation:
1. Create a Celery task that iterates over all `libraryItems` in a tenant
2. For each item: delete old chunks, run through `SmartChunker`, embed child chunks, store new chunks + vectors
3. Process in batches of 50 items to limit memory usage
4. Track progress in a `reindex_status` field or log table
5. Old chunks with stale `vector_ref_id` references are cleaned up

### 1.6 Node.js chunking update

The `chunkDocument()` in `vectorize.ts` is used for real-time document indexing from the web app. Two options:
- **Option A (recommended)**: Call Python backend's chunker via internal HTTP for documents being indexed
- **Option B**: Keep simple fixed chunking in Node.js for real-time short text embedding (chat messages, quick notes) and use Python chunker for library items

### 1.7 Tests for Phase 1

- Recursive splitting: no chunk ends mid-sentence
- Token counting: all chunks within `[min_chunk_tokens, child_max_tokens]` range
- Parent-child: each child has valid `parent_chunk_id`, parent has `is_parent=True`
- Markdown splitting: headings preserved in `section_heading` metadata
- Code splitting: functions/classes are not split across chunks
- Strategy detection: markdown → MARKDOWN, Python code → CODE, plain text → RECURSIVE
- Edge cases: empty text, single-line text, text shorter than min_chunk_tokens
- Scopes inheritance: chunks inherit `tenant_id` and `allowed_scopes` from parent doc

---

## Phase 2: Hybrid Search Enhancements

### 2.1 Implement metadata + scope filtering

Both `bm25_retriever.py` and `vector_retriever.py` accept a `filters` parameter but ignore it (comment: "not implemented yet"). Implement filtering:

The `filters` dict supports:
- `tenant_id`: exact match (REQUIRED — hard rule)
- `allowed_scopes`: intersection with user's effective scopes (REQUIRED)
- `doc_type`: exact match or list of allowed types
- `source`: exact match
- `date_range`: `{"gte": datetime, "lte": datetime}`

**Architectural note**: The current BM25 and Vector retrievers are **in-memory** (`self._documents: Dict`), not database-backed. For proper scope filtering:

**For BM25 (in-memory)**: Pre-filter candidates by `allowed_scopes` intersection BEFORE scoring. This is more efficient than scoring all documents first. When the pipeline is refactored to database-backed (Phase 4), BM25 filtering moves to SQL WHERE clauses.

**For Vector**: The `PgVectorStore` is database-backed and supports metadata filtering. Refactor `VectorRetriever` to delegate to `PgVectorStore.search()` with scope filters, rather than using its in-memory document dict. Pass the scope filter as a metadata constraint on the `allowed_scopes` array column (using `@>` containment operator).

**Critical guardrail**: The `HybridRAGEngine.retrieve()` method must ALWAYS inject `tenant_id` and scope filters, even if the caller doesn't provide them. This is the server-side enforcement point.

### 2.2 New file: `query_processor.py`

Create `python-backend/app/orchestrator/rag/query_processor.py` with strategies:

```python
class QueryStrategy(str, Enum):
    PASSTHROUGH = "passthrough"   # Default: no processing
    REWRITE = "rewrite"           # LLM cleans up query for retrieval
    HYDE = "hyde"                  # Generate hypothetical answer, embed that
    MULTI_QUERY = "multi_query"   # Generate 3-5 query variations
    STEP_BACK = "step_back"       # Abstract the query for broader context
```

```python
@dataclass
class ProcessedQuery:
    original: str
    processed: str
    alternatives: list[str]
    strategy_used: str
    hypothetical_doc: str | None
```

**HyDE** (Hypothetical Document Embeddings): Ask the LLM to write a short paragraph that would answer the query. Embed that hypothetical document instead of the raw query. This produces better vector matches because the embedding of an "answer" is closer to actual answer chunks than the embedding of a "question."

**Multi-query**: Generate 3-5 alternative phrasings of the query. Run retrieval for each, merge and deduplicate results. This improves recall for ambiguous queries.

Default is PASSTHROUGH for zero overhead. Query processing is opt-in via `RAGConfig.query_strategy`.

**Credit/cost implications**: HyDE uses the cheapest available model (gpt-4.1-nano) for hypothetical document generation — approximately 1 additional credit per query. Multi-query generates 3-5 sub-queries, each running through the same retrieval pipeline. Total is billed as a single query plus LLM processing overhead. Both strategies are opt-in only; default PASSTHROUGH has zero additional cost.

### 2.3 Wire into HybridRAGEngine

Add query processing as Step 0 in `retrieve()`, before BM25/Vector retrieval. For multi-query, run retrieval for each alternative query in parallel, then merge results via RRF before reranking.

### 2.4 Tests for Phase 2

- Scope filtering: user with scopes `{u:1, g:10}` only gets docs with matching scopes
- Tenant filtering: hard rule — no cross-tenant results even if scopes overlap
- HyDE: generates plausible hypothetical document, used for embedding
- Multi-query: produces 3-5 distinct variations, merged results are deduplicated
- Metadata filtering: filter by `doc_type="code"` returns only code chunks
- PASSTHROUGH mode: zero processing overhead, same behavior as before

---

## Phase 3: Reranking Upgrade

### Why the current reranker is problematic

The current `Reranker` calls GPT-4.1-nano per document (1 API call each). For 10 documents, that's 10 API calls × ~300ms = ~3 seconds, plus ~$0.01 per query. The heuristic fallback uses only term overlap and length preference, which is too simplistic.

### 3.1 Add cross-encoder reranking

The `sentence-transformers` package is already in `requirements.txt`. Add cross-encoder support to `reranker.py`:

```python
class RerankStrategy(str, Enum):
    CROSS_ENCODER = "cross_encoder"  # New default
    COHERE = "cohere"                # API fallback
    LLM = "llm"                      # Existing GPT-4.1-nano
    HEURISTIC = "heuristic"          # Existing fallback

class Reranker:
    def __init__(self, strategy=RerankStrategy.CROSS_ENCODER,
                 model="BAAI/bge-reranker-v2-m3", ...):
```

**bge-reranker-v2-m3**: SOTA open-source cross-encoder, supports 100+ languages (including Thai), free self-hosted. The model runs locally via `sentence_transformers.CrossEncoder`. It processes query-document pairs in batch and returns relevance scores.

Run inference in a **dedicated `ProcessPoolExecutor`** (not the default `ThreadPoolExecutor`) to avoid GIL contention with other async operations. The model is CPU-bound and benefits from true parallelism.

**Operational considerations:**
- Model size: ~1.1GB on disk, ~1.5GB in memory with overhead
- Load strategy: **lazy loading** on first rerank call (not at startup) to avoid slowing server boot
- First inference takes 5-10 seconds (model warmup); subsequent calls are fast
- Server must have at least 2GB free RAM beyond current usage
- Add a health check endpoint that reports whether the model is loaded

**Important**: Cross-encoders have a 512-token max sequence length. Truncate document content to ~300 tokens (leaving ~200 for the query). For the parent-child pattern, rerank using child chunk content (which is already 400 tokens max).

### 3.2 Cohere Rerank as API fallback

Add Cohere Rerank API support as an optional fallback. Cohere Rerank costs $2/1K searches and supports multilingual content. The `cohere` package is optional — if not installed or no API key is configured, this strategy is skipped in the fallback chain.

### 3.3 Strategy fallback chain

```
CROSS_ENCODER → COHERE → LLM → HEURISTIC
```

If the primary strategy fails (model not loaded, API down), automatically fall through to the next. The heuristic is always available as the last resort.

### 3.4 Scope verification after reranking

After reranking, verify that all returned documents still pass scope checks. This is a defense-in-depth measure — the retrieval step already filters, but reranking should not inadvertently re-introduce unauthorized documents.

### 3.5 Tests for Phase 3

- Cross-encoder: returns documents sorted by relevance, scores in [0, 1]
- Cohere: API call returns results with relevance_score
- Fallback chain: cross-encoder fails → cohere → heuristic succeeds
- Performance: cross-encoder completes in <500ms for 20 documents on CPU (benchmark; if too slow, Cohere API becomes primary)
- Scope preservation: reranked results are subset of scope-filtered input
- Thai content: bge-reranker-v2-m3 correctly ranks Thai documents

---

## Phase 4: Production RAG Hardening

### 4.1 New file: `guardrails.py`

Create `python-backend/app/orchestrator/rag/guardrails.py`:

```python
class RetrievalQuality(str, Enum):
    HIGH = "high"        # Score >= 0.7, multiple relevant docs
    MEDIUM = "medium"    # Score 0.4-0.7
    LOW = "low"          # Score 0.15-0.4
    FAILED = "failed"    # No docs or all below 0.15

@dataclass
class QualityAssessment:
    quality: RetrievalQuality
    confidence_score: float
    top_score: float
    avg_score: float
    doc_count: int
    recommended_action: str   # "proceed", "warn_user", "refuse_answer"
    explanation: str

class RetrievalGuardrails:
    def assess(self, rag_result: RAGResult) -> QualityAssessment: ...
    def build_system_prompt_suffix(self, assessment: QualityAssessment) -> str: ...
```

**Tenant-configurable failure mode**: Store `rag_failure_mode` in tenant settings:
- `"strict"` (default for enterprise): refuse when quality is LOW or FAILED
- `"permissive"` (default for general): caveat + partial answer when quality is LOW; refuse only when FAILED
- Thresholds are configurable per tenant

**System prompt suffix by quality:**
- HIGH: "Answer based ONLY on the provided context. Cite sources."
- MEDIUM (permissive mode): "Context may be incomplete. Clearly state uncertainty."
- LOW (permissive mode): "Very limited information found. Prefix uncertain parts with 'Based on limited information:'"
- FAILED or LOW (strict mode): "No relevant information found. Do NOT answer from training data."

### 4.2 Citation and attribution

Add citation fields to `Document` and `RAGResult`:

```python
@dataclass
class Document:
    # Existing fields...
    chunk_id: str | None = None
    parent_doc_id: str | None = None
    parent_doc_title: str | None = None
    section_heading: str | None = None

    def citation_ref(self) -> str:
        """Generate '[Title — § Section]' citation string."""
```

`RAGResult.get_context_with_citations()` returns context with inline `[Source N: Title — § Section]` markers. The `citations` list is included in the response for frontend display.

### 4.3 Query routing

Not every query needs RAG. Create a lightweight router:

```python
class QueryIntent(str, Enum):
    KNOWLEDGE = "knowledge"          # Needs RAG
    CONVERSATIONAL = "conversational" # Skip RAG (greetings, meta-questions)
    CREATIVE = "creative"            # Skip RAG (writing tasks)

class QueryRouter:
    async def route(self, query: str) -> QueryRouteDecision: ...
```

Use fast heuristics first (regex for greetings/thanks), then LLM classification for ambiguous queries. Default: assume KNOWLEDGE (safe fallback — extra RAG retrieval is cheaper than missing relevant context).

### 4.4 RAG executor integration

Replace the stub in `rag_executor.py` with a real implementation that bridges the in-memory `HybridRAGEngine` with the database-backed storage:

1. **Load chunks from database**: Query `libraryChunks` + `library_chunk_vectors` from PostgreSQL, filtered by `tenant_id`, to load relevant documents into the engine for the query lifecycle
2. **Effective scopes**: The calling code (node executor framework) pre-computes effective scopes and passes them via `extra_data["effective_scopes"]` — the executor does not need a database session for this
3. **Instantiate engine**: Create `HybridRAGEngine` with proper config, add loaded documents
4. **Retrieve with filters**: Call `retrieve()` with scope filters derived from effective scopes
5. **Return results**: Real documents, context with citations, quality assessment, and metadata
6. **Respect tenant settings**: Check `rag_failure_mode` from tenant config

**Database access**: The executor creates an `AsyncSession` via the existing session factory (`get_async_session()`) to query chunks. This is scoped to the request lifecycle.

### 4.5 Metadata leakage prevention

When quality is FAILED or LOW:
- Do NOT include document titles in the "no information found" response
- Do NOT hint at the existence of inaccessible documents
- Log the attempted access for audit, but surface nothing to the user

### 4.6 Tests for Phase 4

- Quality assessment: empty results → FAILED, low scores → LOW, high scores → HIGH
- Tenant failure mode: enterprise with strict → refuses on LOW; general with permissive → caveats on LOW
- Citation tracking: each document gets citation ref, context includes `[Source N]` markers
- Query routing: "hello" → skip RAG, "what does the policy say" → needs RAG
- RAG executor: returns real results instead of mock data
- Metadata leakage: FAILED response does not mention doc titles
- Scope enforcement: end-to-end query through guardrails never returns cross-tenant docs

---

## Phase 5: Evaluation & Observability

### 5.1 New file: `evaluator.py`

Create `python-backend/app/orchestrator/rag/evaluator.py`:

```python
@dataclass
class EvalItem:
    query: str
    expected_answer: str
    expected_doc_ids: list[str]
    tags: list[str]

@dataclass
class EvalMetrics:
    precision_at_k: float
    recall_at_k: float
    mrr: float
    ndcg_at_k: float
    faithfulness: float | None
    avg_retrieval_ms: float
    p95_total_ms: float

class RAGEvaluator:
    async def evaluate(self, engine: HybridRAGEngine, dataset: EvalDataset, k: int = 5) -> EvalMetrics: ...
    async def evaluate_single(self, engine: HybridRAGEngine, item: EvalItem, k: int = 5) -> dict: ...
    def generate_report(self, metrics: EvalMetrics) -> str: ...
```

**Metrics implemented:**
- **Precision@K** = relevant docs in top-K / K
- **Recall@K** = relevant docs in top-K / total relevant
- **MRR** = mean(1 / rank_of_first_relevant)
- **NDCG@K** = DCG@K / IDCG@K (handles graded relevance)
- **Faithfulness** (optional, requires LLM call): extract claims from answer, verify each against context

### 5.2 Auto-generated evaluation dataset

Create a utility that generates QA pairs from existing indexed documents:

```python
class EvalDatasetGenerator:
    async def generate(self, documents: list[Document], num_pairs: int = 200) -> EvalDataset: ...
```

For each document chunk:
1. Use LLM to generate 1-3 questions that the chunk can answer
2. Use the chunk content as the reference answer
3. Record the chunk ID as `expected_doc_ids`
4. Include hard negatives: questions about topics NOT in the knowledge base

Target: 200+ QA pairs per tenant for meaningful evaluation.

### 5.3 Observability enhancements

Extend the `rag_retrieval_complete` structured log event in `hybrid_rag.py` with:
- `quality`: assessment quality level
- `confidence`: confidence score
- `query_strategy`: which query processing was used
- `rerank_strategy`: which reranker strategy succeeded
- `scope_filter_count`: how many scopes were in the filter
- `cache_hit`: whether cache was used

### 5.4 CLI evaluation command

```bash
python -m app.orchestrator.rag.evaluator \
  --dataset tests/fixtures/rag_eval_dataset.json \
  --k 5 \
  --output evaluation-report.md
```

### 5.5 Quality gates

Recommended thresholds for deployment:
- Context recall > 90%
- Faithfulness > 80%
- MRR > 0.6
- P95 latency < 2000ms

### 5.6 Tests for Phase 5

- Precision@K: known relevant docs → correct calculation
- MRR: first relevant doc at position 3 → MRR = 0.333
- NDCG: graded relevance produces correct normalized score
- Dataset generation: produces valid QA pairs from input documents
- Report generation: metrics → readable markdown
- CLI: runs without error, produces output file

---

## Dependencies

### New Python packages
```
cohere>=5.0.0    # Cohere Rerank API (Phase 3, optional)
```

### Already available (no changes needed)
```
sentence-transformers>=2.2.0   # Cross-encoder (Phase 3)
tiktoken>=0.5.0                # Token counting (Phase 1)
rank_bm25>=0.2.2               # BM25 (existing)
pgvector>=0.2.4                # Vector store (existing)
```

### Model downloads (first run)
- `BAAI/bge-reranker-v2-m3` — ~1.1GB, downloaded by sentence-transformers on first use
- Consider pre-downloading in Docker build for production

---

## File Map

### New files
```
python-backend/app/orchestrator/rag/
  chunker.py            # Phase 1: Smart chunking
  query_processor.py    # Phase 2: Query rewriting
  guardrails.py         # Phase 4: Quality gate + confidence scoring
  evaluator.py          # Phase 5: Evaluation pipeline

python-backend/tests/orchestrator/rag/
  test_chunker.py
  test_query_processor.py
  test_guardrails.py
  test_evaluator.py
  test_rag_executor.py
```

### Modified files
```
python-backend/app/orchestrator/rag/
  hybrid_rag.py          # All phases: cache key fix, scope filtering, query processing, guardrails
  bm25_retriever.py      # Phase 2: scope pre-filtering + metadata filtering
  vector_retriever.py    # Phase 2: delegate to PgVectorStore with scope filters
  reranker.py            # Phase 3: cross-encoder + Cohere + fallback chain
  __init__.py            # Export new classes

python-backend/app/orchestrator/node_executors/
  rag_executor.py        # Phase 4: Replace stub with DB-backed implementation

python-backend/app/services/
  library_indexing_service.py  # Phase 1: Smart chunking integration + re-indexing

python-backend/app/models/
  library.py             # Phase 0: allowed_scopes; Phase 1: is_parent, parent_chunk_id

apps/web/drizzle/
  schema.ts              # Phase 0: allowedScopes on libraryItems/libraryChunks
                         # Phase 1: isParent, parentChunkId on libraryChunks

apps/web/server/services/
  libraryService.ts      # Phase 0: Scope recomputation hooks on permission changes
  vectorize.ts           # Phase 1: Delegate to Python chunker or keep for simple texts

python-backend/requirements.txt  # Phase 3: Add cohere>=5.0.0 (optional)
```

---

## Rollout & Migration

### Phase order is strict
Each phase builds on the previous. Phase 0 must complete before Phase 1 starts. The only parallelism: Phase 4 guardrails can start while Phase 3 reranking is being tested.

### No breaking changes
All changes are additive. Existing functionality continues to work throughout:
- Phase 0: `allowed_scopes` defaults to `["u:<owner>"]` — existing docs become private (safe default)
- Phase 1: `ChunkStrategy.FIXED` preserved for backward compat
- Phase 2: `QueryStrategy.PASSTHROUGH` is the default
- Phase 3: Cross-encoder is the new default; LLM and heuristic remain as fallbacks
- Phase 4: Guardrails add quality metadata to RAGResult; existing consumers ignore new fields
- Phase 5: Evaluation is offline only — no production path changes

### Database migrations

**Phase 0** adds `allowed_scopes` column (nullable, default `[]`). This is a LOW-MEDIUM risk migration:
1. Backup affected tables (`libraryItems`, `libraryChunks`)
2. Add column with default
3. Backfill existing docs: compute `allowed_scopes` from `library_permissions` records for each item
4. Verify row counts

**Phase 1** adds `is_parent` (boolean, default false) and `parent_chunk_id` (text, nullable) to `libraryChunks`. This is a LOW risk migration (additive columns with safe defaults). Also triggers a re-indexing batch job to re-chunk existing documents.

---

## Risk Assessment

| Risk | Phase | Mitigation |
|------|-------|-----------|
| `allowed_scopes` drifts from `library_permissions` | 0 | Synchronization hooks on every permission change; integration tests verify consistency |
| Cross-tenant cache pollution | 0 | Cache key includes `tenant_id` + scope hash (pre-requisite fix) |
| bge-reranker-v2-m3 download slow on server | 3 | Pre-download in Docker build; Cohere API as immediate fallback |
| Cross-encoder memory usage (~1.5GB) | 3 | Lazy loading, dedicated ProcessPoolExecutor, memory monitoring |
| Cross-encoder CPU inference too slow | 3 | Benchmark first; if >500ms for 20 docs, Cohere API becomes primary strategy |
| Smart chunking changes retrieval quality (regression) | 1 | Keep FIXED strategy; run Phase 5 evaluation before/after |
| Re-indexing existing documents takes time | 1 | Celery batch job, process in batches of 50, track progress |
| Embedding dimension mismatch during re-indexing | 1 | Standardize on 1536-dim; old 768-dim vectors replaced during re-chunk |
| Query processing adds latency | 2 | Default is PASSTHROUGH; FAST mode skips entirely |
| HyDE/multi-query credit cost | 2 | Opt-in only; gpt-4.1-nano for HyDE (~1 credit per query) |
| In-memory retrievers don't scale | 2/4 | Refactor VectorRetriever to delegate to PgVectorStore; load-per-query in executor |
| Scope filtering reduces recall | 0 | Expected — users should only see authorized content; evaluation will measure impact |
| Parent-child expansion leaks scopes | 1 | Re-verify scopes on parent (defense in depth, per multi-tenant rules) |
| Guardrails too aggressive | 4 | Configurable per tenant; start with permissive, tighten based on feedback |
| Cloudflare Vectorize scope update requires re-insert | 0 | Delete + re-insert; batch for large collections |
