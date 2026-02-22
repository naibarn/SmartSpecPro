# 019 — RAG Maturity Upgrade: Five Levels to Production

**Status:** Draft
**Created:** 2026-02-22
**Author:** AI Conductor
**Priority:** High
**Estimated Scope:** 5 phases, ~35 tasks

---

## 1. Executive Summary

SmartSpecPro's current RAG system has strong foundations (Hybrid Search, basic Reranking) but critical gaps prevent production-grade reliability. This spec defines a complete upgrade path across all 5 RAG maturity levels — from smart chunking to production hardening — so the system never lets the LLM improvise when retrieval fails.

### Current Maturity Scorecard

| Level | Current Score | Target Score |
|-------|--------------|-------------|
| 1. Naive RAG | 100% | 100% (done) |
| 2. Smart Chunking | 60% | 95% |
| 3. Hybrid Search | 85% | 95% |
| 4. Reranking | 75% | 95% |
| 5. Production RAG | 40% | 90% |

---

## 2. Affected Files

### Python Backend (primary changes)

| File | Change Type |
|------|-------------|
| `python-backend/app/orchestrator/rag/hybrid_rag.py` | Major — add failure handling, confidence scoring, query routing |
| `python-backend/app/orchestrator/rag/reranker.py` | Major — add cross-encoder, Cohere Rerank |
| `python-backend/app/orchestrator/rag/bm25_retriever.py` | Minor — add metadata filter support |
| `python-backend/app/orchestrator/rag/vector_retriever.py` | Minor — add metadata filter support |
| `python-backend/app/orchestrator/rag/chunker.py` | **New** — smart chunking strategies |
| `python-backend/app/orchestrator/rag/query_processor.py` | **New** — query rewriting, HyDE, multi-query |
| `python-backend/app/orchestrator/rag/guardrails.py` | **New** — confidence scoring, grounding check, failure handling |
| `python-backend/app/orchestrator/rag/evaluator.py` | **New** — offline RAG evaluation pipeline |
| `python-backend/app/orchestrator/node_executors/rag_executor.py` | Major — replace mock with real HybridRAGEngine |
| `python-backend/app/services/library_indexing_service.py` | Medium — integrate smart chunking |
| `python-backend/app/orchestrator/vector_store/embedding_service.py` | Minor — add embedding model routing per doc type |
| `python-backend/requirements.txt` | Minor — add new dependencies |

### Node.js / TypeScript (secondary changes)

| File | Change Type |
|------|-------------|
| `apps/web/server/services/vectorize.ts` | Medium — replace fixed chunking with smart chunking call |
| `apps/web/server/services/vectorProvider.ts` | Minor — add metadata filter passthrough |

### Tests

| File | Change Type |
|------|-------------|
| `python-backend/tests/orchestrator/rag/test_chunker.py` | **New** |
| `python-backend/tests/orchestrator/rag/test_query_processor.py` | **New** |
| `python-backend/tests/orchestrator/rag/test_guardrails.py` | **New** |
| `python-backend/tests/orchestrator/rag/test_evaluator.py` | **New** |
| `python-backend/tests/orchestrator/rag/test_hybrid_rag.py` | Medium — add failure handling tests |
| `python-backend/tests/orchestrator/rag/test_reranker.py` | Medium — add cross-encoder tests |
| `python-backend/tests/orchestrator/node_executors/test_rag_executor.py` | **New** |

---

## 3. Phase 1 — Smart Chunking (Level 2)

### Problem

Current chunking in `vectorize.ts:27-37` uses fixed 2000-char windows with 200-char overlap. This splits mid-sentence, mid-paragraph, and mid-section — destroying semantic boundaries. A chunk that starts mid-paragraph loses context about what it's describing.

```typescript
// CURRENT — naive fixed-size chunking (vectorize.ts)
const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;
for (let i = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
}
```

### 3.1 Create `chunker.py` — Multi-Strategy Document Chunker

**File:** `python-backend/app/orchestrator/rag/chunker.py`

```python
class ChunkStrategy(str, Enum):
    FIXED = "fixed"              # Current behavior (backward compat)
    RECURSIVE = "recursive"      # Split by paragraph > sentence > word
    MARKDOWN = "markdown"        # Split by headings, preserve structure
    CODE = "code"                # Split by function/class boundaries
    SEMANTIC = "semantic"        # Split by embedding similarity threshold
    HTML = "html"                # Split by DOM structure

class ChunkConfig:
    strategy: ChunkStrategy = ChunkStrategy.RECURSIVE
    max_chunk_size: int = 1500        # tokens (not chars)
    min_chunk_size: int = 100         # tokens
    overlap_size: int = 150           # tokens
    preserve_metadata: bool = True    # carry parent doc metadata into chunk

class SmartChunker:
    async def chunk(self, text: str, config: ChunkConfig, doc_type: str = "text") -> list[Chunk]
    def _detect_strategy(self, text: str, doc_type: str) -> ChunkStrategy
    def _recursive_split(self, text: str, config: ChunkConfig) -> list[Chunk]
    def _markdown_split(self, text: str, config: ChunkConfig) -> list[Chunk]
    def _code_split(self, text: str, config: ChunkConfig) -> list[Chunk]
    def _semantic_split(self, text: str, config: ChunkConfig) -> list[Chunk]
```

**Key design decisions:**

1. **Token-based sizing** — Use `tiktoken` (already in deps) to count tokens instead of characters. A 1500-token chunk is predictable for LLM context windows.

2. **Recursive splitting hierarchy:**
   - Try split by `\n\n` (paragraphs) first
   - If chunk too large, split by `\n` (lines)
   - If still too large, split by `. ` (sentences)
   - Last resort: split by ` ` (words)
   - Never split mid-word

3. **Strategy auto-detection** via `_detect_strategy()`:
   - Content starts with `#` or contains `##` → `MARKDOWN`
   - Content contains `def `, `class `, `function ` → `CODE`
   - Content contains `<html>`, `<div>` → `HTML`
   - Default → `RECURSIVE`

4. **Parent-child context** — Each `Chunk` dataclass carries:
   ```python
   @dataclass
   class Chunk:
       chunk_id: str
       content: str
       index: int
       parent_doc_id: str
       parent_title: str           # from parent doc metadata
       section_heading: str        # nearest heading above this chunk
       token_count: int
       start_char: int             # position in original document
       end_char: int
       metadata: dict[str, Any]    # inherited from parent + chunk-specific
   ```

### 3.2 Integrate Smart Chunking into Indexing Pipeline

**File:** `python-backend/app/services/library_indexing_service.py`

Replace the direct chunk creation with `SmartChunker`:

```python
# BEFORE: Chunks created externally, passed as raw dicts
# AFTER:
from app.orchestrator.rag.chunker import SmartChunker, ChunkConfig

chunker = SmartChunker()
config = ChunkConfig(strategy=chunker._detect_strategy(content, item_type))
chunks = await chunker.chunk(content, config, doc_type=item_type)
```

### 3.3 Update Node.js Chunking to Delegate to Python

**File:** `apps/web/server/services/vectorize.ts`

The Node.js `chunkDocument()` function should call the Python backend's chunker for consistency, OR replicate the recursive strategy. Recommended: call Python backend via internal HTTP for documents processed server-side, keep simple chunking for real-time embedding of short texts.

### 3.4 Tests

- **Strategy detection**: Given markdown text → picks MARKDOWN strategy
- **Boundary preservation**: No chunk ends mid-sentence
- **Token counting**: All chunks are within `[min_chunk_size, max_chunk_size]` token range
- **Parent context**: Every chunk carries `parent_doc_id` and `section_heading`
- **Code splitting**: Python/JS functions are not split across chunks
- **Edge cases**: Empty text, single-line text, text shorter than min_chunk_size

---

## 4. Phase 2 — Hybrid Search Enhancements (Level 3)

### Problem

Hybrid search infrastructure exists but two critical pieces are missing:
1. **Metadata-aware filtering** — `bm25_retriever.py:258` and `vector_retriever.py:211` both accept `filters` parameter but ignore it (`# not implemented yet`)
2. **Query understanding** — Raw user queries go directly to retrieval without preprocessing

### 4.1 Implement Metadata Filtering

**File:** `python-backend/app/orchestrator/rag/bm25_retriever.py`

```python
# bm25_retriever.py — add to retrieve() method
async def retrieve(self, query: str, top_k: int = 10, filters: Optional[Dict] = None) -> List[Any]:
    ...
    # After scoring, before returning:
    if filters:
        scored_docs = [
            (score, doc) for score, doc in scored_docs
            if self._matches_filters(doc, filters)
        ]

def _matches_filters(self, doc: Any, filters: Dict) -> bool:
    """Check if document metadata matches all filter criteria."""
    for key, value in filters.items():
        doc_value = doc.metadata.get(key)
        if isinstance(value, list):
            if doc_value not in value      # IN filter
        elif isinstance(value, dict):
            # Range filter: {"gte": 10, "lte": 100}
            ...
        else:
            if doc_value != value:         # Exact match
                return False
    return True
```

Apply the same pattern to `vector_retriever.py`.

### 4.2 Create `query_processor.py` — Query Understanding & Rewriting

**File:** `python-backend/app/orchestrator/rag/query_processor.py`

```python
class QueryProcessingStrategy(str, Enum):
    PASSTHROUGH = "passthrough"    # No processing (current behavior)
    REWRITE = "rewrite"            # LLM rewrites for clarity
    HYDE = "hyde"                   # Hypothetical Document Embeddings
    MULTI_QUERY = "multi_query"    # Generate multiple query variations
    STEP_BACK = "step_back"        # Abstract the query for broader context

class QueryProcessor:
    async def process(
        self,
        query: str,
        strategy: QueryProcessingStrategy = QueryProcessingStrategy.REWRITE,
        context: Optional[dict] = None,
    ) -> ProcessedQuery:
        """Process and optionally expand a user query."""

    async def _rewrite(self, query: str) -> str:
        """Use LLM to rewrite query for better retrieval."""
        # Prompt: "Rewrite this search query to be more specific and clear
        #          for document retrieval. Keep the same intent."

    async def _hyde(self, query: str) -> str:
        """Generate hypothetical document that would answer the query."""
        # Prompt: "Write a short paragraph that would be the ideal answer
        #          to this question: {query}"
        # Then embed this hypothetical doc instead of the query

    async def _multi_query(self, query: str) -> list[str]:
        """Generate 3-5 query variations for broader recall."""
        # Prompt: "Generate 3 alternative phrasings of this search query,
        #          each emphasizing a different aspect"

    async def _step_back(self, query: str) -> str:
        """Generate a more abstract version of the query."""
        # Prompt: "What broader topic or concept does this question relate to?"
```

**`ProcessedQuery` dataclass:**
```python
@dataclass
class ProcessedQuery:
    original: str
    processed: str                # Main rewritten query
    alternatives: list[str]       # Additional query variations (for multi_query)
    strategy_used: str
    hypothetical_doc: Optional[str]  # For HyDE
```

### 4.3 Integrate Query Processing into HybridRAGEngine

**File:** `python-backend/app/orchestrator/rag/hybrid_rag.py`

Add query processing as the first step in `retrieve()`:

```python
async def retrieve(self, query: str, ...) -> RAGResult:
    # NEW — Step 0: Process query
    if self.config.query_processing != QueryProcessingStrategy.PASSTHROUGH:
        processed = await self.query_processor.process(query, self.config.query_processing)
        search_query = processed.processed
        # For multi_query: run retrieval for each alternative, merge results
    else:
        search_query = query

    # Existing Step 1: Retrieve candidates (use search_query instead of query)
    ...
```

### 4.4 Add to RAGConfig

```python
@dataclass
class RAGConfig:
    # ... existing fields ...

    # NEW — Query processing
    query_processing: QueryProcessingStrategy = QueryProcessingStrategy.PASSTHROUGH
    hyde_model: str = "gpt-4.1-nano"
    max_query_alternatives: int = 3

    # NEW — Metadata filtering
    default_filters: Optional[Dict[str, Any]] = None  # Applied to every search
```

### 4.5 Tests

- **Query rewriting**: "how do i fix the login bug" → cleaner retrieval query
- **HyDE**: generates plausible hypothetical document, embedding is used for search
- **Multi-query**: produces 3-5 distinct variations
- **Metadata filtering**: filter by `doc_type="code"` returns only code chunks
- **Filter + search**: combined metadata + keyword/vector search
- **Passthrough mode**: no processing overhead when disabled

---

## 5. Phase 3 — Reranking Upgrade (Level 4)

### Problem

Current reranker (`reranker.py`) relies on LLM API calls per document (GPT-4.1-nano). This is:
- **Slow**: ~200-500ms per document × 10 docs = 2-5 seconds
- **Expensive**: LLM call per document adds up
- **Fragile**: if OpenAI is down, falls back to weak heuristic

### 5.1 Add Cross-Encoder Reranking

**File:** `python-backend/app/orchestrator/rag/reranker.py`

Add a `sentence-transformers` cross-encoder strategy (already in `requirements.txt`):

```python
class RerankStrategy(str, Enum):
    LLM = "llm"                   # Current: GPT-4.1-nano per doc
    CROSS_ENCODER = "cross_encoder"  # NEW: Local ms-marco model
    COHERE = "cohere"             # NEW: Cohere Rerank API
    HEURISTIC = "heuristic"       # Current fallback

class Reranker:
    def __init__(
        self,
        strategy: RerankStrategy = RerankStrategy.CROSS_ENCODER,  # NEW default
        model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
        cohere_model: str = "rerank-english-v3.0",
        ...
    ):
        self.strategy = strategy
        self._cross_encoder = None  # Lazy loaded

    async def _cross_encoder_rerank(self, query: str, documents: list, top_k: int) -> list:
        """Rerank using sentence-transformers cross-encoder."""
        if self._cross_encoder is None:
            from sentence_transformers import CrossEncoder
            self._cross_encoder = CrossEncoder(self.model)

        pairs = [(query, doc.content[:512]) for doc in documents]

        # Run in executor to avoid blocking event loop
        loop = asyncio.get_event_loop()
        scores = await loop.run_in_executor(
            None,
            self._cross_encoder.predict,
            pairs,
        )

        for doc, score in zip(documents, scores):
            doc.rerank_score = float(score)

        documents.sort(key=lambda d: d.rerank_score, reverse=True)
        return documents[:top_k]

    async def _cohere_rerank(self, query: str, documents: list, top_k: int) -> list:
        """Rerank using Cohere Rerank API."""
        import cohere
        client = cohere.AsyncClientV2()

        response = await client.rerank(
            model=self.cohere_model,
            query=query,
            documents=[doc.content[:4096] for doc in documents],
            top_n=top_k,
        )

        reranked = []
        for result in response.results:
            doc = documents[result.index]
            doc.rerank_score = result.relevance_score
            reranked.append(doc)
        return reranked
```

### 5.2 Strategy Fallback Chain

```
CROSS_ENCODER → COHERE → LLM → HEURISTIC
```

If the preferred strategy fails, automatically fall through to the next:

```python
async def rerank(self, query, documents, top_k):
    strategies = [self.strategy, RerankStrategy.HEURISTIC]  # always end with heuristic

    for strategy in strategies:
        try:
            if strategy == RerankStrategy.CROSS_ENCODER:
                return await self._cross_encoder_rerank(query, documents, top_k)
            elif strategy == RerankStrategy.COHERE:
                return await self._cohere_rerank(query, documents, top_k)
            elif strategy == RerankStrategy.LLM:
                return await self._llm_rerank(query, documents, top_k)
            else:
                return self._heuristic_rerank(query, documents, top_k)
        except Exception as e:
            logger.warning("rerank_strategy_failed", strategy=strategy.value, error=str(e))
            continue

    return documents[:top_k]  # absolute fallback
```

### 5.3 Performance Comparison (Expected)

| Strategy | Latency (10 docs) | Cost | Quality |
|----------|-------------------|------|---------|
| Cross-Encoder (local) | ~50-100ms | $0 | High |
| Cohere Rerank API | ~100-200ms | ~$0.001/query | Very High |
| LLM (current) | ~2000-5000ms | ~$0.01/query | High |
| Heuristic (current) | ~1ms | $0 | Low |

### 5.4 Tests

- **Cross-encoder**: returns documents sorted by relevance score
- **Cohere**: returns documents with relevance_score from API
- **Fallback chain**: cross-encoder fails → cohere fails → heuristic succeeds
- **Performance**: cross-encoder completes in <200ms for 20 documents
- **Score normalization**: all strategies produce scores in [0, 1] range

---

## 6. Phase 4 — Production RAG Hardening (Level 5)

This is the most critical phase. Without it, every other improvement is undermined.

### Problem

When retrieval returns empty or low-quality results, the current system passes whatever it has (or nothing) to the LLM, which then **hallucinates an answer**. There is no mechanism to:
- Detect retrieval failure
- Signal low confidence to the user
- Prevent the LLM from making up information
- Track which chunks were actually used in the answer

### 6.1 Create `guardrails.py` — Retrieval Quality Gate

**File:** `python-backend/app/orchestrator/rag/guardrails.py`

```python
class RetrievalQuality(str, Enum):
    HIGH = "high"          # Score >= 0.7, multiple relevant docs
    MEDIUM = "medium"      # Score 0.4-0.7, some relevant docs
    LOW = "low"            # Score < 0.4 or very few docs
    FAILED = "failed"      # No docs or all below threshold

@dataclass
class QualityAssessment:
    quality: RetrievalQuality
    confidence_score: float       # 0.0 - 1.0
    top_score: float              # highest document score
    avg_score: float              # average across returned docs
    doc_count: int                # number of documents returned
    score_spread: float           # std deviation of scores
    has_high_relevance: bool      # any doc above 0.7
    recommended_action: str       # "proceed", "warn_user", "refuse_answer", "fallback"
    explanation: str              # human-readable explanation

class RetrievalGuardrails:
    """Evaluates retrieval quality and decides how to handle the LLM response."""

    def __init__(
        self,
        min_confidence: float = 0.3,
        min_docs: int = 1,
        high_confidence_threshold: float = 0.7,
        refuse_threshold: float = 0.15,
    ):
        ...

    def assess(self, rag_result: RAGResult) -> QualityAssessment:
        """Assess the quality of retrieval results."""
        if not rag_result.documents:
            return QualityAssessment(
                quality=RetrievalQuality.FAILED,
                recommended_action="refuse_answer",
                explanation="No relevant documents found",
                ...
            )

        scores = [d.final_score for d in rag_result.documents]
        top_score = max(scores)
        avg_score = sum(scores) / len(scores)

        if top_score >= self.high_confidence_threshold:
            quality = RetrievalQuality.HIGH
            action = "proceed"
        elif top_score >= self.min_confidence:
            quality = RetrievalQuality.MEDIUM
            action = "warn_user"
        elif top_score >= self.refuse_threshold:
            quality = RetrievalQuality.LOW
            action = "warn_user"
        else:
            quality = RetrievalQuality.FAILED
            action = "refuse_answer"

        return QualityAssessment(
            quality=quality,
            confidence_score=top_score,
            top_score=top_score,
            avg_score=avg_score,
            doc_count=len(rag_result.documents),
            score_spread=np.std(scores),
            has_high_relevance=top_score >= self.high_confidence_threshold,
            recommended_action=action,
            explanation=self._build_explanation(quality, top_score, len(scores)),
        )

    def build_system_prompt_suffix(self, assessment: QualityAssessment) -> str:
        """Generate a system prompt suffix that constrains the LLM based on retrieval quality."""
        if assessment.quality == RetrievalQuality.HIGH:
            return (
                "Answer based ONLY on the provided context. "
                "Cite the relevant section when possible."
            )
        elif assessment.quality in (RetrievalQuality.MEDIUM, RetrievalQuality.LOW):
            return (
                "The retrieved context may be incomplete or partially relevant. "
                "Answer based on the context provided but clearly state when you are uncertain. "
                "Prefix uncertain parts with 'Based on limited information: ...'"
            )
        else:  # FAILED
            return (
                "No relevant documents were found for this query. "
                "Do NOT attempt to answer from your training data. "
                "Respond with: 'I could not find relevant information in the knowledge base "
                "for this query. Please try rephrasing or check that the relevant documents "
                "have been indexed.'"
            )
```

### 6.2 Citation & Attribution Tracking

Add source tracking to `RAGResult` and `Document`:

**File:** `python-backend/app/orchestrator/rag/hybrid_rag.py`

```python
@dataclass
class Document:
    # ... existing fields ...

    # NEW — Citation support
    chunk_id: Optional[str] = None        # ID of the source chunk
    parent_doc_id: Optional[str] = None   # ID of the parent document
    parent_doc_title: Optional[str] = None
    section_heading: Optional[str] = None  # from smart chunking
    page_number: Optional[int] = None

    def citation_ref(self) -> str:
        """Generate a citation reference string."""
        parts = []
        if self.parent_doc_title:
            parts.append(self.parent_doc_title)
        if self.section_heading:
            parts.append(f"§ {self.section_heading}")
        if self.page_number:
            parts.append(f"p.{self.page_number}")
        return " — ".join(parts) if parts else f"[{self.doc_id[:8]}]"

@dataclass
class RAGResult:
    # ... existing fields ...

    # NEW — Quality & citations
    quality: Optional[QualityAssessment] = None
    citations: list[str] = field(default_factory=list)

    def get_context_with_citations(self, max_tokens: int = 4000) -> str:
        """Get context with inline citation markers."""
        context_parts = []
        current_tokens = 0

        for i, doc in enumerate(self.documents):
            doc_tokens = len(doc.content) // 4
            if current_tokens + doc_tokens > max_tokens:
                break

            ref = doc.citation_ref()
            self.citations.append(ref)
            context_parts.append(f"[Source {i+1}: {ref}]\n{doc.content}")
            current_tokens += doc_tokens

        return "\n\n---\n\n".join(context_parts)
```

### 6.3 Answer Grounding Check

Post-generation validation that the LLM's answer is grounded in the retrieved context:

```python
class GroundingChecker:
    """Verify LLM responses are grounded in retrieved context."""

    async def check(
        self,
        answer: str,
        context_docs: list[Document],
        query: str,
    ) -> GroundingResult:
        """
        Check if answer is grounded in context.

        Returns GroundingResult with:
        - grounded: bool — is the answer supported by context?
        - grounding_score: float — 0-1 how well grounded
        - unsupported_claims: list[str] — claims not found in context
        - supporting_docs: list[str] — doc_ids that support the answer
        """
        # Strategy 1: NLI-based (fast, cheap)
        # Compare each answer sentence against context using entailment

        # Strategy 2: LLM-based (slower, more accurate)
        # Ask LLM: "Which claims in this answer are NOT supported by the context?"
```

### 6.4 Query Router — Should This Query Use RAG?

Not every query needs RAG. "What time is it?" or "Summarize our chat" should skip retrieval entirely.

```python
class QueryIntent(str, Enum):
    KNOWLEDGE = "knowledge"      # Needs RAG: factual questions about indexed content
    CONVERSATIONAL = "conversational"  # No RAG: greetings, meta-questions
    CREATIVE = "creative"        # No RAG: writing tasks, brainstorming
    ANALYTICAL = "analytical"    # Maybe RAG: depends on whether analysis needs context

class QueryRouter:
    """Classify whether a query needs RAG retrieval."""

    async def route(self, query: str, chat_history: Optional[list] = None) -> QueryRouteDecision:
        """
        Decide if query needs RAG.

        Returns QueryRouteDecision:
        - intent: QueryIntent
        - needs_rag: bool
        - confidence: float
        - suggested_mode: SearchMode (if needs_rag)
        - reason: str
        """
        # Fast heuristic check first
        if self._is_greeting(query):
            return QueryRouteDecision(intent=QueryIntent.CONVERSATIONAL, needs_rag=False, ...)

        # LLM classification for ambiguous queries
        ...

    def _is_greeting(self, query: str) -> bool:
        """Fast regex check for greetings and meta-questions."""
        greetings = ["hi", "hello", "hey", "thanks", "thank you", "bye"]
        return query.strip().lower().rstrip("!.?") in greetings
```

### 6.5 Wire the Full Production Pipeline

Update `HybridRAGEngine.retrieve()` to use all guardrails:

```python
async def retrieve(self, query: str, ...) -> RAGResult:
    # Step 0: Query routing (NEW)
    if self.config.enable_query_routing:
        route = await self.query_router.route(query)
        if not route.needs_rag:
            return RAGResult(query=query, mode=SearchMode.KEYWORD,
                             quality=QualityAssessment(quality=RetrievalQuality.FAILED,
                                                       recommended_action="skip_rag"))

    # Step 0.5: Query processing (Phase 2)
    ...

    # Step 1-3: Existing retrieval + fusion + reranking
    ...

    # Step 4: Quality assessment (NEW)
    assessment = self.guardrails.assess(result)
    result.quality = assessment

    # Step 5: Build context with citations (NEW)
    result.citations = []  # populated by get_context_with_citations()

    return result
```

### 6.6 Connect RAG Executor to Real Engine

**File:** `python-backend/app/orchestrator/node_executors/rag_executor.py`

Replace the current stub:

```python
class RAGExecutor:
    """Executor for RAG Query nodes."""

    def __init__(self):
        self._engine: Optional[HybridRAGEngine] = None

    async def _get_engine(self) -> HybridRAGEngine:
        if self._engine is None:
            from app.orchestrator.rag import HybridRAGEngine, RAGConfig
            self._engine = HybridRAGEngine(config=RAGConfig(
                mode=SearchMode.HYBRID,
                use_rerank=True,
            ))
        return self._engine

    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict:
        engine = await self._get_engine()
        query = data.inputs.get("query", "")
        top_k = data.inputs.get("top_k", 5)
        filters = data.inputs.get("filters")

        result = await engine.retrieve(
            query=query,
            top_k=top_k,
            filters=filters,
            user_id=context.user_id,
        )

        return {
            "documents": [d.to_dict() for d in result.documents],
            "context": result.get_context_with_citations(),
            "citations": result.citations,
            "quality": result.quality.to_dict() if result.quality else None,
            "metadata": {
                "total_results": result.final_count,
                "search_mode": result.mode.value,
                "retrieval_time_ms": result.retrieval_time_ms,
                "confidence": result.quality.confidence_score if result.quality else None,
            },
        }
```

### 6.7 Tests

- **Quality assessment**: empty results → FAILED, low scores → LOW, high scores → HIGH
- **System prompt suffix**: FAILED quality → "do not answer" prompt, HIGH → "cite sources"
- **Citation tracking**: each document gets a citation ref, context includes `[Source N]` markers
- **Query routing**: "hello" → skip RAG, "what does the policy say about X" → needs RAG
- **Grounding check**: answer with fabricated claims → flagged as ungrounded
- **RAG executor**: real engine call returns actual results instead of mock
- **End-to-end**: query → route → process → retrieve → rerank → assess → cite → return

---

## 7. Phase 5 — Evaluation & Observability

### Problem

There is no way to measure RAG quality over time. Without metrics, improvements are guesswork.

### 7.1 Create `evaluator.py` — Offline RAG Evaluation

**File:** `python-backend/app/orchestrator/rag/evaluator.py`

```python
@dataclass
class EvalDataset:
    """A set of query-answer-context triples for evaluation."""
    items: list[EvalItem]

@dataclass
class EvalItem:
    query: str
    expected_answer: str              # ground truth
    expected_doc_ids: list[str]       # which docs should be retrieved
    tags: list[str] = field(default_factory=list)  # e.g., ["code", "faq"]

@dataclass
class EvalMetrics:
    # Retrieval metrics
    precision_at_k: float             # relevant docs in top-k / k
    recall_at_k: float                # relevant docs in top-k / total relevant
    mrr: float                        # Mean Reciprocal Rank
    ndcg_at_k: float                  # Normalized Discounted Cumulative Gain

    # Generation metrics (if answer provided)
    faithfulness: Optional[float]     # is answer grounded in context?
    answer_relevancy: Optional[float] # does answer address the query?
    context_precision: Optional[float]  # are retrieved docs relevant?

    # Latency metrics
    avg_retrieval_ms: float
    avg_rerank_ms: float
    p95_total_ms: float

class RAGEvaluator:
    """Evaluate RAG pipeline quality using standardized metrics."""

    async def evaluate(
        self,
        engine: HybridRAGEngine,
        dataset: EvalDataset,
        k: int = 5,
    ) -> EvalMetrics:
        """Run evaluation over a dataset."""
        ...

    async def evaluate_single(
        self,
        engine: HybridRAGEngine,
        item: EvalItem,
        k: int = 5,
    ) -> dict:
        """Evaluate a single query."""
        result = await engine.retrieve(item.query, top_k=k)

        retrieved_ids = [d.doc_id for d in result.documents]
        relevant_ids = set(item.expected_doc_ids)

        # Precision@K
        hits = sum(1 for doc_id in retrieved_ids[:k] if doc_id in relevant_ids)
        precision = hits / k

        # Recall@K
        recall = hits / len(relevant_ids) if relevant_ids else 0

        # MRR
        mrr = 0.0
        for i, doc_id in enumerate(retrieved_ids):
            if doc_id in relevant_ids:
                mrr = 1.0 / (i + 1)
                break

        return {"precision": precision, "recall": recall, "mrr": mrr, ...}

    def generate_report(self, metrics: EvalMetrics) -> str:
        """Generate human-readable evaluation report."""
        ...
```

### 7.2 Observability Enhancements

Add structured metrics to existing audit logging:

**File:** `python-backend/app/orchestrator/rag/hybrid_rag.py`

Extend the `rag_retrieval_complete` log event:

```python
logger.info(
    "rag_retrieval_complete",
    query=query[:50],
    mode=mode.value,
    results=result.final_count,
    total_ms=result.total_time_ms,
    # NEW metrics
    quality=assessment.quality.value,
    confidence=assessment.confidence_score,
    top_score=assessment.top_score,
    avg_score=assessment.avg_score,
    query_strategy=processed.strategy_used if processed else "passthrough",
    rerank_strategy=self.reranker.strategy.value if self.config.use_rerank else "none",
    cache_hit=cache_hit,
)
```

### 7.3 Evaluation CLI Command

Add a management command to run evaluation:

```bash
# Run RAG evaluation against a test dataset
python -m app.orchestrator.rag.evaluator --dataset tests/fixtures/rag_eval_dataset.json --k 5
```

### 7.4 Tests

- **Precision@K**: known relevant docs → correct precision calculation
- **MRR**: first relevant doc at position 3 → MRR = 0.333
- **Report generation**: metrics → readable markdown report
- **Integration**: full pipeline evaluation with test dataset

---

## 8. Dependencies

### New Python Packages

```
# requirements.txt additions
cohere>=5.0.0                    # Cohere Rerank API (Phase 3)
```

No new packages needed — `sentence-transformers` (cross-encoder) and `tiktoken` (token counting) are already in `requirements.txt`.

### Verify Existing Dependencies

```
sentence-transformers>=2.2.0    # Already present — used for cross-encoder
tiktoken>=0.5.0                 # Already present — used for token counting
rank_bm25>=0.2.2                # Already present
chromadb>=0.5.0                 # Already present
pgvector>=0.2.4                 # Already present
```

---

## 9. Migration & Backward Compatibility

### No Breaking Changes

All upgrades are **additive**:

1. **Smart Chunking** — New `ChunkStrategy.RECURSIVE` becomes default; existing `FIXED` strategy preserved for backward compat. Old chunks remain valid.

2. **Query Processing** — Default is `PASSTHROUGH` (no processing). Opt-in via `RAGConfig.query_processing`.

3. **Cross-Encoder Reranking** — New default strategy; LLM and heuristic remain as fallbacks. Existing behavior unchanged if cross-encoder fails.

4. **Guardrails** — New quality assessment is appended to `RAGResult`. Existing consumers ignore new fields.

5. **RAG Executor** — Replaces mock with real engine. Existing workflow nodes get real results instead of fake ones.

### Data Migration

No database schema changes required. Smart chunking improves future chunks; existing chunks remain functional.

**Optional**: Re-index existing library items with smart chunking for better quality:

```bash
# Queue re-indexing job for all library items (async, background)
python -m app.services.library_reindex --strategy recursive --batch-size 100
```

---

## 10. Rollout Order

Phases should be implemented **in order** because each builds on the previous:

```
Phase 1: Smart Chunking
  └── Foundation for all other phases (better chunks = better everything)

Phase 2: Hybrid Search Enhancements
  ├── Metadata filtering (enables Phase 4 query routing)
  └── Query processing (improves retrieval quality for Phase 3)

Phase 3: Reranking Upgrade
  └── Better reranking makes Phase 4 confidence scoring more meaningful

Phase 4: Production RAG Hardening  ← HIGHEST BUSINESS VALUE
  ├── Guardrails (prevents hallucination)
  ├── Citations (builds user trust)
  ├── Query routing (saves cost)
  └── RAG executor integration (makes workflows functional)

Phase 5: Evaluation & Observability
  └── Measures impact of all previous phases
```

### Phase Dependencies

```
Phase 1 ─────┐
              ├──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5
Phase 1 ─────┘
```

Phase 4 can start partially in parallel with Phase 3 (guardrails don't depend on cross-encoder).

---

## 11. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Cross-encoder model download slow on server | Medium | Medium | Pre-download model in Docker build or use Cohere API as primary |
| Smart chunking changes retrieval quality (regression) | High | Low | Keep FIXED strategy as fallback; run evaluation before/after |
| Query processing adds latency | Medium | High | Make it configurable, default to PASSTHROUGH in FAST mode |
| Cohere Rerank API costs | Low | Certain | Cross-encoder is free and local; Cohere is optional upgrade |
| Guardrails too aggressive (refuses valid queries) | Medium | Medium | Tunable thresholds; start conservative then relax |
| Re-indexing existing library takes time | Low | Certain | Background async job; no downtime |

---

## 12. Success Criteria

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Chunking: mid-sentence splits | ~40% of chunks | <5% | Run chunker on test corpus, count split sentences |
| Retrieval: Precision@5 | Unknown | >0.7 | RAG evaluation pipeline (Phase 5) |
| Retrieval: MRR | Unknown | >0.6 | RAG evaluation pipeline |
| Reranking latency (10 docs) | ~2-5s (LLM) | <200ms (cross-encoder) | Structured logs |
| Hallucination rate | Unknown (no detection) | <10% of RAG responses flagged | Grounding check |
| Retrieval failure handling | 0% (LLM always answers) | 100% (quality gate active) | QualityAssessment in logs |
| RAG executor | Mock data | Real retrieval | Test with actual query |
| Cost per rerank | ~$0.01/query | ~$0/query (local) | Credit billing logs |

---

## 13. Open Questions

1. **Re-index existing data?** — Should we queue a background job to re-chunk all existing library items with the new smart chunker? This improves retrieval quality for existing data but takes compute time.

2. **Query processing default** — Should `REWRITE` be the default instead of `PASSTHROUGH`? It adds ~200ms latency but improves retrieval quality for poorly-formed queries.

3. **Grounding check in production** — Should every RAG response be grounding-checked (adds latency) or only sampled (cheaper but misses some hallucinations)?

4. **Cross-encoder model choice** — `ms-marco-MiniLM-L-6-v2` (fast, 80MB) vs `ms-marco-MiniLM-L-12-v2` (slower, better quality, 120MB)?

5. **Evaluation dataset** — Who creates the ground-truth dataset for RAG evaluation? Manual curation needed.
