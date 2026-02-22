# Research Findings — RAG Maturity Upgrade

## Part A: Codebase Research

### 1. RAG Pipeline Architecture

**HybridRAGEngine** (`python-backend/app/orchestrator/rag/hybrid_rag.py`, 514 lines):
- 4 search modes: HYBRID, KEYWORD, SEMANTIC, FAST
- Retrieval pipeline: BM25 parallel with Vector → RRF Fusion → Optional Reranking
- RAGConfig defaults: `top_k=10`, `bm25_weight=0.3`, `vector_weight=0.7`, `rrf_k=60`, `rerank_top_k=5`, `cache_ttl=300s`
- Credit billing: 1 credit per semantic/hybrid/fast search, keyword is free
- In-memory document store + in-memory cache with TTL

**BM25Retriever** (`bm25_retriever.py`, 315 lines):
- Okapi BM25 algorithm: `k1=1.5`, `b=0.75`
- ~60 English stopwords, `min_token_length=2`
- Inverted index with document frequency tracking
- `filters` parameter exists but is **not implemented** (line 258: "not implemented yet")

**VectorRetriever** (`vector_retriever.py`, 256 lines):
- OpenAI embeddings (ada-002, 1536 dims) with hash-based fallback
- Cosine similarity with threshold=0.5
- MD5-based embedding cache
- `filters` parameter exists but is **not implemented** (line 218: "not implemented yet")

**Reranker** (`reranker.py`, 226 lines):
- LLM-based: GPT-4.1-nano, scores 0-10 per document, 1 API call per doc
- Heuristic fallback: weighted combination of bm25/vector scores + term overlap + length preference
- No cross-encoder support despite `sentence-transformers` in deps
- No Cohere Rerank support despite embedding service supporting Cohere

### 2. Current Chunking

**Node.js** (`apps/web/server/services/vectorize.ts`):
- Fixed sliding window: `CHUNK_SIZE=2000` chars, `CHUNK_OVERLAP=200` chars
- No semantic awareness — splits mid-sentence, mid-paragraph
- Embedding: Cloudflare Workers AI `@cf/baai/bge-base-en-v1.5` (768 dims)

**Python Backend**: No dedicated chunking module. Library indexing service receives chunks from Node.js or creates them from metadata concatenation.

**Database Storage** (`drizzle/schema.ts` lines 1617-1633):
- `libraryChunks` table: `id, libraryItemId, tenantId, chunkIndex, contentType, content, vectorRefId, contentHash, metadata_json`
- Unique constraint: `(libraryItemId, chunkIndex)`

### 3. Vector Store Infrastructure

**3 providers supported** via `vectorProvider.ts`:

| Provider | Dimensions | Max TopK | Status |
|----------|-----------|---------|--------|
| pgvector | 384/768/1024/1536 | 1000 | Production (IVFFlat + HNSW) |
| Cloudflare Vectorize | 768 | 100 | Production (REST API) |
| ChromaDB | 384/768 | 100 | Development/testing |

**PgVectorStore** (`pgvector_store.py`, 736 lines): Full production implementation with RLS, hybrid search, metadata filtering, in-memory fallback mode.

**EmbeddingService** (`embedding_service.py`, 405 lines): Supports OpenAI (3 models), Cohere (2 models), local sentence-transformers. Batch processing, caching, rate limiting.

### 4. RAG Executor

**`rag_executor.py`** (24 lines): **Complete stub**. Returns hardcoded mock data. Line 14: `# TODO: Integrate with HybridRAG service`

### 5. Testing Setup

**Python**: pytest + pytest-asyncio, 80% coverage enforced
- `test_hybrid_rag.py` (366 lines): Document/Result/Config/BM25/Vector/Reranker/Engine tests
- `test_rag_billing.py` (61 lines): Credit billing integration tests
- Patterns: `@pytest.mark.asyncio`, `AsyncMock()`, `@patch.object`
- Markers: `unit`, `integration`, `e2e`, `slow`, `auth`, `credits`, `llm`

**Node.js**: Vitest
- `vectorize-indexing.test.ts` (129 lines): Chunking, batching, image indexing, deletion
- Patterns: `vi.stubEnv()`, `vi.stubGlobal("fetch")`, `vi.mock()`

### 6. Key Patterns

- **Lazy loading**: Properties instantiate dependencies on first access
- **Graceful degradation**: OpenAI → hash fallback, LLM rerank → heuristic fallback
- **Multi-tenancy**: `tenant_id` filtering at vector store level, RLS on pgvector
- **Structured logging**: `structlog` throughout with event names and timing metrics

### 7. Known Gaps (from code review)

1. `filters` param in BM25 and Vector retrievers: accepted but ignored
2. RAG executor: stub only, returns mock data
3. No chunking in Python backend — relies on Node.js fixed-size chunker
4. No query preprocessing/rewriting
5. No retrieval quality assessment
6. No citation tracking
7. No grounding check
8. Token estimation uses rough `len(content) // 4` heuristic

---

## Part B: Web Research — Best Practices (2025-2026)

### Topic 1: Smart Chunking Strategies

**Key findings from Chroma Research (472 queries, 5 diverse corpora):**
- Smaller chunks (200-400 tokens) significantly outperform larger ones (800 tokens) in precision and IoU
- The common default of 800 tokens with 400 overlap produces "particularly poor recall-efficiency tradeoffs"
- Reducing overlap improved IoU scores by eliminating redundant tokens

**Recommended approach — Recursive Character Splitting as baseline:**
- LangChain's `RecursiveCharacterTextSplitter` with separator hierarchy: `["\n\n", "\n", ". ", " ", ""]`
- Tries paragraphs first → lines → sentences → words
- **Recommended chunk size:** 400-512 tokens
- **Recommended overlap:** 50-100 tokens (10-20%)
- Performance: 85-90% recall in benchmarks

**Semantic chunking (higher quality, higher cost):**
- Splits based on embedding similarity between consecutive sentences
- LLMSemanticChunker: 0.919 recall vs RecursiveCharacterTextSplitter's 0.881-0.895
- ~3-4% recall improvement but ~10x processing cost
- Worth it only for high-stakes domains (legal, medical, financial)

**Document-structure-aware splitting:**
- `MarkdownHeaderTextSplitter`: preserves heading hierarchy as metadata
- Code splitting: by function/class boundaries
- PDF page-level chunking: 0.648 accuracy (highest in NVIDIA benchmarks) with lowest variance

**Parent-child chunk relationships (small-to-big retrieval):**
- Child chunks (256 tokens) for retrieval — less noise, more precise matches
- Parent chunks (1024 tokens) for LLM context — broader context for generation
- Retrieval fetches children, then looks up parent via stored reference
- LlamaIndex `SentenceWindowRetriever` is a variant of this pattern

**Token-based sizing is essential** — character counts don't correspond to model limits. Use `tiktoken` for accurate token counting.

Sources:
- [Chroma Research: Evaluating Chunking](https://research.trychroma.com/evaluating-chunking)
- [Firecrawl: Best Chunking Strategies 2025](https://www.firecrawl.dev/blog/best-chunking-strategies-rag-2025)
- [Weaviate: Chunking Strategies](https://weaviate.io/blog/chunking-strategies-for-rag)
- [IBM: Chunking with LangChain](https://www.ibm.com/think/tutorials/chunking-strategies-for-rag-with-langchain-watsonx-ai)

---

### Topic 2: Cross-Encoder Reranking vs Cohere Rerank

**Industry consensus: Two-stage retrieval is mandatory.**
- Stage 1 (fast): Bi-encoder retrieves 25-100 candidates (<100ms)
- Stage 2 (accurate): Cross-encoder reranks to top 3-10 results
- Research: cross-encoder reranking improves RAG accuracy by 20-40%

**Model selection matrix:**

| Model | Latency | Cost | Quality | Multilingual |
|-------|---------|------|---------|-------------|
| ms-marco-MiniLM-L-6-v2 | Very low | Free | Good | English only |
| ms-marco-MiniLM-L-12-v2 | Low | Free | Better | English only |
| bge-reranker-v2-m3 | Medium | Free | SOTA open-source | 100+ languages |
| Cohere Rerank 3.5 | ~600ms | $2/1K searches | Enterprise | 100+ languages |
| Jina Reranker v2 | Medium | API fees | Good for long docs | 89 languages |
| FlashRank | Very low | Free | Good for CPU-only | Limited |

**Practical recommendation:**
- Start with `ms-marco-MiniLM-L-12-v2` for English-only (fast, accurate, well-tested)
- Upgrade to `bge-reranker-v2-m3` for multilingual needs
- Cohere Rerank for enterprise SLA requirements

**Important constraints:**
- Cross-encoders have 512-token max sequence length — truncate accordingly
- Retrieve 25-50 candidates, rerank to top 3-5 for the LLM
- Cross-encoders cannot be used for initial retrieval (too slow for full corpus)
- LLM-based reranking: 1-5s latency, ~10-100x more expensive than cross-encoders

Sources:
- [Pinecone: Rerankers and Two-Stage Retrieval](https://www.pinecone.io/learn/series/rag/rerankers/)
- [Analytics Vidhya: Top 7 Rerankers](https://www.analyticsvidhya.com/blog/2025/06/top-rerankers-for-rag/)
- [ZeroEntropy: Guide to Reranking Models 2026](https://www.zeroentropy.dev/articles/ultimate-guide-to-choosing-the-best-reranking-model-in-2025)
- [Cohere Rerank](https://cohere.com/rerank)

---

### Topic 3: RAG Guardrails and Grounding

**Three failure modes to handle:**

| Mode | Detection | Response |
|------|-----------|----------|
| Empty results | Retrieved set empty | "I don't have information on this" + suggest reformulation |
| Low-quality results | All scores below threshold | CRAG pattern: trigger supplementary retrieval or admit uncertainty |
| Irrelevant results | Reranker scores all low | Present caveated response or decline |

**CRAG (Corrective RAG) pattern — current SOTA:**
A lightweight evaluator scores each document's relevance. High-confidence docs used directly. Low-confidence triggers corrective action (additional retrieval, web search, query reformulation).

**Multi-signal confidence scoring:**
- Retrieval score (cosine similarity)
- Reranker score
- Coverage signal (how many of top-K are above threshold)
- Query specificity (vague queries → lower confidence)
- Thresholds: <0.3 discard, 0.3-0.5 low confidence/caveat, >0.5 normal

**Answer grounding — three approaches:**

1. **Prompt-based** (cheapest): Instruct LLM to only use context, cite sources, say "I don't know" when context insufficient
2. **Post-generation faithfulness** (medium): Extract claims from response, verify each against context. RAGAS Faithfulness metric at runtime.
3. **Multi-agent validation** (highest): Generate agent + verify agent + adjudicate. 35-60% error reduction.

**Layered defense model for hallucination prevention:**
1. Input filtering (query routing)
2. Retrieval quality gate (threshold check)
3. Prompt grounding (system prompt constraints)
4. Output moderation (post-generation check)

**Query routing strategies:**

| Strategy | Cost | When to Use |
|----------|------|-------------|
| Keyword routing (regex) | Free | Well-defined categories |
| Embedding routing | Cheap | Semantic nuance without LLM |
| LLM routing | Medium | Complex classification |
| Hierarchical (keywords → embeddings → LLM) | Optimized | Production systems |

Sources:
- [Maxim: RAG Evaluation Guide 2025](https://www.getmaxim.ai/articles/rag-evaluation-a-complete-guide-for-2025/)
- [SwiftFlutter: 12 Guardrails That Cut Risk 71-89%](https://swiftflutter.com/reducing-ai-hallucinations-12-guardrails-that-cut-risk-immediately)
- [arXiv: Self-Routing RAG](https://arxiv.org/html/2504.01018v1)
- [Amazon Bedrock: Contextual Grounding](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-contextual-grounding-check.html)

---

### Topic 4: RAG Evaluation (RAGAS Framework)

**RAGAS core metrics:**

| Metric | Type | What It Measures |
|--------|------|-----------------|
| Context Precision | Retrieval | Are relevant chunks ranked higher? |
| Context Recall | Retrieval | Does context contain all needed info? |
| Faithfulness | Generation | `supported_claims / total_claims` |
| Response Relevancy | Generation | Is response pertinent to query? |

**Faithfulness algorithm:**
1. Extract claims from response
2. Verify each claim against context (LLM or NLI model)
3. Score = supported / total (0.0-1.0)

**Traditional IR metrics to implement:**

- **Precision@K** = relevant in top-K / K
- **Recall@K** = relevant in top-K / total relevant
- **MRR** = mean(1 / rank_of_first_relevant)
- **NDCG@K** = DCG@K / IDCG@K (handles graded relevance)

NDCG is the primary metric on the MTEB Leaderboard. Recommended as primary retrieval metric because contexts have varying usefulness.

**Evaluation dataset creation:**
- Synthetic generation with LLM: load docs → chunk → generate questions per chunk → generate reference answers
- RAGAS has built-in `TestsetGenerator`
- Include: hard negatives, out-of-scope queries, ambiguous queries
- Minimum: 100-200 QA pairs, 500+ for production
- Synthetic generation reduces effort by ~90% vs manual curation

**Offline vs Online evaluation:**
- **Offline**: Before deployment, full metric suite, curated dataset, CI/CD integration
- **Online**: In production, sampling-based (5-10%), faithfulness spot-checks, user satisfaction

**Quality gates for deployment:**
- Context recall > 90%
- Faithfulness > 80%
- Answer correctness > 80%

**Framework comparison:**

| Framework | Best For |
|-----------|---------|
| RAGAS | RAG-specific metrics, reference-free |
| DeepEval | Pytest-style CI/CD integration |
| TruLens | Explainable evaluation, audit requirements |
| LangSmith | LangChain-based projects |

Sources:
- [RAGAS Docs](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/)
- [Confident AI: RAG Evaluation Metrics](https://www.confident-ai.com/blog/rag-evaluation-metrics-answer-relevancy-faithfulness-and-more)
- [Weaviate: Evaluation Metrics](https://weaviate.io/blog/retrieval-evaluation-metrics)
- [DeepEval: RAGAS Integration](https://deepeval.com/docs/metrics-ragas)
- [Pinecone: Offline Evaluation](https://www.pinecone.io/learn/offline-evaluation/)
