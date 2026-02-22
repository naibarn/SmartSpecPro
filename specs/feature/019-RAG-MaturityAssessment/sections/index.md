<!-- PROJECT_CONFIG
runtime: python-pip
test_command: cd python-backend && pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-acl-schema-and-scopes
section-02-scope-propagation
section-03-smart-chunking
section-04-hybrid-search
section-05-reranking
section-06-guardrails-and-citations
section-07-rag-executor
section-08-evaluation-and-observability
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-acl-schema-and-scopes | - | 02, 03 | Yes (first) |
| section-02-scope-propagation | 01 | 04 | Yes (with 03) |
| section-03-smart-chunking | 01 | 04 | Yes (with 02) |
| section-04-hybrid-search | 02, 03 | 05 | No |
| section-05-reranking | 04 | 06 | No |
| section-06-guardrails-and-citations | 05 | 07 | No |
| section-07-rag-executor | 06 | 08 | No |
| section-08-evaluation-and-observability | 07 | - | No |

## Execution Order

1. **Batch 1**: section-01-acl-schema-and-scopes (no dependencies)
2. **Batch 2**: section-02-scope-propagation, section-03-smart-chunking (parallel — independent file sets after 01)
3. **Batch 3**: section-04-hybrid-search (requires both 02 AND 03)
4. **Batch 4**: section-05-reranking (requires 04)
5. **Batch 5**: section-06-guardrails-and-citations (requires 05)
6. **Batch 6**: section-07-rag-executor (requires 06)
7. **Batch 7**: section-08-evaluation-and-observability (requires 07)

## Section Summaries

### section-01-acl-schema-and-scopes
**Phase 0.1–0.3**: Multi-tenant ACL foundation. Adds `allowed_scopes` array column to `libraryItems` and `libraryChunks` in both Drizzle schema (TypeScript) and SQLAlchemy models (Python). Adds GIN index. Fixes the cache key in `HybridRAGEngine` to include `tenant_id` and scope hash (prevents cross-tenant cache pollution). Maps existing `groupMembers` table semantics (pending/active/removed) to scope rules. Implements `compute_effective_scopes()` utility and the `allowed_scopes` recomputation logic triggered by `library_permissions` changes. Includes unit tests for schema, cache key isolation, group scopes, and effective scopes computation.

**Key files created/modified:**
- `apps/web/drizzle/schema.ts` — add `allowedScopes` column to `libraryItems`, `libraryChunks`
- `python-backend/app/models/library.py` — add `allowed_scopes` to SQLAlchemy models
- `python-backend/app/orchestrator/rag/hybrid_rag.py` — fix cache key
- `python-backend/app/orchestrator/rag/scope_engine.py` — NEW: `compute_effective_scopes()`, `recompute_allowed_scopes()`
- `python-backend/tests/orchestrator/rag/test_allowed_scopes.py` — NEW
- `python-backend/tests/orchestrator/rag/test_effective_scopes.py` — NEW
- `python-backend/tests/orchestrator/rag/test_hybrid_rag.py` — extend with cache key tests

### section-02-scope-propagation
**Phase 0.4–0.6**: Scope propagation to vector stores and migration safety. When `library_permissions` change, propagates `allowed_scopes` updates to pgvector metadata, ChromaDB, and Cloudflare Vectorize. Integrates scope recomputation hooks into `libraryService.ts` (Node.js side). Implements migration for the `allowed_scopes` column with backfill of existing documents. Writes cross-tenant isolation integration tests.

**Key files created/modified:**
- `python-backend/app/orchestrator/rag/scope_engine.py` — add `propagate_scopes_to_vector_stores()`
- `apps/web/server/services/libraryService.ts` — add scope recomputation hooks on permission CRUD
- `python-backend/tests/orchestrator/rag/test_scope_propagation.py` — NEW
- `python-backend/tests/orchestrator/rag/test_tenant_isolation.py` — NEW (integration)

### section-03-smart-chunking
**Phase 1**: Smart chunking engine and indexing pipeline integration. Creates `chunker.py` with recursive/markdown/code strategies, parent-child chunk pattern, token-based sizing via tiktoken, and auto-detection. Adds `is_parent` and `parent_chunk_id` columns to both Drizzle and SQLAlchemy schemas. Integrates into `library_indexing_service.py`. Standardizes on 1536-dim embeddings. Creates Celery re-indexing batch task. Updates or delegates Node.js `vectorize.ts`.

**Key files created/modified:**
- `python-backend/app/orchestrator/rag/chunker.py` — NEW: `SmartChunker`, `ChunkStrategy`, `ChunkConfig`, `Chunk`
- `python-backend/app/models/library.py` — add `is_parent`, `parent_chunk_id`
- `apps/web/drizzle/schema.ts` — add `isParent`, `parentChunkId` to `libraryChunks`
- `python-backend/app/services/library_indexing_service.py` — integrate SmartChunker
- `apps/web/server/services/vectorize.ts` — delegate to Python chunker or keep for simple texts
- `python-backend/tests/orchestrator/rag/test_chunker.py` — NEW
- `python-backend/tests/orchestrator/rag/test_indexing_pipeline.py` — NEW
- `python-backend/tests/orchestrator/rag/test_reindex_task.py` — NEW

### section-04-hybrid-search
**Phase 2**: Hybrid search enhancements. Implements the `filters` parameter in `bm25_retriever.py` (pre-filter by `allowed_scopes` before scoring) and `vector_retriever.py` (delegate to `PgVectorStore` with scope metadata constraints). Creates `query_processor.py` with PASSTHROUGH, REWRITE, HyDE, MULTI_QUERY, and STEP_BACK strategies. Wires query processing as Step 0 in `HybridRAGEngine.retrieve()`. Ensures `retrieve()` always injects tenant_id + scope filters.

**Key files created/modified:**
- `python-backend/app/orchestrator/rag/bm25_retriever.py` — implement scope pre-filtering
- `python-backend/app/orchestrator/rag/vector_retriever.py` — delegate to PgVectorStore with scope filters
- `python-backend/app/orchestrator/rag/query_processor.py` — NEW: `QueryProcessor`, `QueryStrategy`, `ProcessedQuery`
- `python-backend/app/orchestrator/rag/hybrid_rag.py` — add query processing step, enforce scope injection
- `python-backend/tests/orchestrator/rag/test_scope_filtering.py` — NEW
- `python-backend/tests/orchestrator/rag/test_query_processor.py` — NEW
- `python-backend/tests/orchestrator/rag/test_hybrid_rag.py` — extend

### section-05-reranking
**Phase 3**: Reranking upgrade. Adds `RerankStrategy` enum with CROSS_ENCODER, COHERE, LLM, HEURISTIC options. Integrates `bge-reranker-v2-m3` cross-encoder via sentence-transformers with lazy loading, ProcessPoolExecutor, and 512-token truncation. Adds Cohere Rerank API as optional fallback. Implements strategy fallback chain (CROSS_ENCODER → COHERE → LLM → HEURISTIC). Adds post-reranking scope verification. Adds `cohere>=5.0.0` to requirements.txt.

**Key files created/modified:**
- `python-backend/app/orchestrator/rag/reranker.py` — major refactor: add strategies, cross-encoder, Cohere, fallback chain
- `python-backend/requirements.txt` — add `cohere>=5.0.0`
- `python-backend/tests/orchestrator/rag/test_reranker.py` — NEW/extend
- `python-backend/tests/orchestrator/rag/test_reranker_performance.py` — NEW (slow marker)

### section-06-guardrails-and-citations
**Phase 4.1–4.3, 4.5**: Production RAG hardening (guardrails layer). Creates `guardrails.py` with `RetrievalQuality` enum, `QualityAssessment`, and tenant-configurable failure modes (strict/permissive). Adds citation tracking to `Document` and `RAGResult` with inline `[Source N]` markers. Creates `QueryRouter` for intent classification (KNOWLEDGE/CONVERSATIONAL/CREATIVE). Implements metadata leakage prevention for FAILED/LOW quality responses.

**Key files created/modified:**
- `python-backend/app/orchestrator/rag/guardrails.py` — NEW: `RetrievalGuardrails`, `RetrievalQuality`, `QualityAssessment`
- `python-backend/app/orchestrator/rag/query_router.py` — NEW: `QueryRouter`, `QueryIntent`
- `python-backend/app/orchestrator/rag/hybrid_rag.py` — add citation fields to Document/RAGResult
- `python-backend/tests/orchestrator/rag/test_guardrails.py` — NEW
- `python-backend/tests/orchestrator/rag/test_citations.py` — NEW
- `python-backend/tests/orchestrator/rag/test_query_router.py` — NEW

### section-07-rag-executor
**Phase 4.4**: RAG executor integration. Replaces the stub in `rag_executor.py` with a real implementation that loads chunks from PostgreSQL, creates an `AsyncSession`, instantiates `HybridRAGEngine` with proper config, retrieves with scope filters from `extra_data["effective_scopes"]`, and returns real documents with citations, quality assessment, and metadata. Respects tenant `rag_failure_mode` setting. Wires together all components from previous sections into the production execution path.

**Key files created/modified:**
- `python-backend/app/orchestrator/node_executors/rag_executor.py` — replace stub with full implementation
- `python-backend/tests/orchestrator/rag/test_rag_executor.py` — NEW
- `python-backend/tests/orchestrator/rag/test_e2e_scope.py` — NEW (integration)

### section-08-evaluation-and-observability
**Phase 5**: Evaluation pipeline and observability. Creates `evaluator.py` with Precision@K, Recall@K, MRR, NDCG@K, and optional Faithfulness metrics. Creates `EvalDatasetGenerator` for auto-generating QA pairs from indexed documents. Extends `rag_retrieval_complete` structured log events with quality, confidence, strategy, and cache fields. Adds CLI evaluation command. Defines quality gate thresholds.

**Key files created/modified:**
- `python-backend/app/orchestrator/rag/evaluator.py` — NEW: `RAGEvaluator`, `EvalDatasetGenerator`, `EvalMetrics`
- `python-backend/app/orchestrator/rag/hybrid_rag.py` — extend structured log events
- `python-backend/tests/orchestrator/rag/test_evaluator.py` — NEW
- `python-backend/tests/orchestrator/rag/test_eval_dataset.py` — NEW
- `python-backend/tests/orchestrator/rag/test_observability.py` — NEW
- `python-backend/tests/orchestrator/rag/test_evaluator_cli.py` — NEW
