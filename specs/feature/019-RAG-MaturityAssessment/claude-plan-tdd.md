# TDD Plan — RAG Maturity Upgrade with Multi-Tenant Guardrails

Companion to `claude-plan.md`. Defines tests to write BEFORE implementing each section.

**Testing framework**: pytest + pytest-asyncio (Python), Vitest (TypeScript)
**Existing patterns**: `@pytest.mark.asyncio`, `AsyncMock()`, `@patch.object`, markers: `unit`, `integration`, `e2e`, `slow`, `auth`, `credits`, `llm`
**Coverage requirement**: 80% minimum on all new Python code

---

## Phase 0: Multi-Tenant ACL Foundation

### 0.1 Schema & allowed_scopes sync

```python
# test_allowed_scopes.py

# Test: adding a library_permissions record triggers allowed_scopes recomputation on the item
# Test: deleting a library_permissions record removes the corresponding scope from allowed_scopes
# Test: updating library_permissions permission_level below "read" removes scope
# Test: allowed_scopes propagates to all libraryChunks belonging to the item
# Test: default allowed_scopes for new item is ["u:<owner_user_id>"]
# Test: item with visibility="public" includes "p:global" in allowed_scopes
# Test: item with visibility="team" includes "t:<tenant_id>" in allowed_scopes
# Test: GIN index on allowed_scopes enables @> containment queries
```

### 0.1.2 Cache key fix

```python
# test_hybrid_rag.py (extend existing)

# Test: cache key includes tenant_id — different tenants get different cache entries
# Test: cache key includes scope hash — same query with different scopes misses cache
# Test: user A's cached result is not returned to user B with different scopes
```

### 0.2 Group membership

```python
# test_group_scopes.py

# Test: user with status="active" in group gets g:<group_id> in effective scopes
# Test: user with status="pending" does NOT get g:<group_id> in effective scopes
# Test: user with status="removed" does NOT get g:<group_id> in effective scopes
# Test: enterprise tenant rejects cross-tenant group invite
```

### 0.3 Effective scopes computation

```python
# test_effective_scopes.py

# Test: compute_effective_scopes always includes u:<user_id>
# Test: compute_effective_scopes always includes p:global
# Test: compute_effective_scopes includes g:<id> for each active group membership
# Test: compute_effective_scopes includes t:<tenant_id> when tenant has shared docs
# Test: user with no groups returns {u:<id>, p:global} only
# Test: user with 3 active groups and 1 pending group returns exactly 3 group scopes
```

### 0.4 Scope propagation

```python
# test_scope_propagation.py

# Test: sharing a document updates allowed_scopes on item AND all its chunks
# Test: unsharing a document removes scope from item AND all its chunks immediately
# Test: scope change invalidates cached RAG results for that item
# Test: pgvector metadata updated on scope change
# Test: ChromaDB metadata updated on scope change (mock collection.update)
# Test: Cloudflare Vectorize triggers delete + re-insert on scope change (mock API)
```

### 0.6 Cross-tenant isolation (integration)

```python
# test_tenant_isolation.py (@pytest.mark.integration)

# Test: user in tenant A cannot retrieve documents from tenant B
# Test: document shared with g:10 accessible only by active members of group 10
# Test: pending group member cannot access group documents
# Test: document unshared: immediately gone from retrieval results
```

---

## Phase 1: Smart Chunking

### 1.1 Chunker

```python
# test_chunker.py

# Test: RECURSIVE strategy splits on paragraphs first (\n\n)
# Test: RECURSIVE strategy falls back to sentences when paragraph too large
# Test: no chunk ends mid-sentence
# Test: all child chunks within [min_chunk_tokens, child_max_tokens] range (tiktoken verified)
# Test: all parent chunks within parent_max_tokens range
# Test: parent-child: each child has valid parent_chunk_id pointing to a parent
# Test: parent chunks have is_parent=True, children have is_parent=False
# Test: parent chunk has 2-4 children with overlap
# Test: MARKDOWN strategy splits on headings, preserves section_heading metadata
# Test: CODE strategy keeps functions/classes intact
# Test: strategy auto-detection: markdown headings → MARKDOWN
# Test: strategy auto-detection: Python def/class → CODE
# Test: strategy auto-detection: plain text → RECURSIVE
# Test: edge case: empty text returns empty list
# Test: edge case: text shorter than min_chunk_tokens returns single chunk
# Test: edge case: single-line text handled correctly
# Test: chunks inherit tenant_id and allowed_scopes from parent document
# Test: FIXED strategy produces same output as legacy chunker (backward compat)
```

### 1.2 Schema additions

```python
# test_library_model.py (extend existing)

# Test: LibraryChunk model has is_parent field (default False)
# Test: LibraryChunk model has parent_chunk_id field (nullable)
```

### 1.3 Indexing pipeline integration

```python
# test_indexing_pipeline.py

# Test: indexing a document creates both parent and child chunks in DB
# Test: only child chunks (is_parent=False) are embedded and sent to vector store
# Test: parent chunks stored in DB but NOT indexed in vector store
# Test: chunk content hashes are unique per item
# Test: re-indexing same document replaces old chunks
```

### 1.4 Embedding standardization

```python
# test_embedding_standardization.py

# Test: new chunks are embedded with 1536-dim model (OpenAI)
# Test: embedding dimension matches VectorRetriever.DEFAULT_DIMENSION
```

### 1.5 Re-indexing batch job

```python
# test_reindex_task.py

# Test: Celery task processes items in batches of 50
# Test: old chunks are deleted before new chunks are created
# Test: old vector store entries are cleaned up
# Test: re-indexing preserves allowed_scopes from original item
# Test: progress is tracked (items processed / total items)
```

---

## Phase 2: Hybrid Search Enhancements

### 2.1 Scope filtering

```python
# test_scope_filtering.py

# Test: BM25 pre-filters candidates by allowed_scopes before scoring
# Test: user with scopes {u:1, g:10} only gets docs with matching scopes
# Test: tenant_id filter is always applied (hard rule)
# Test: no cross-tenant results even if scopes somehow overlap
# Test: VectorRetriever delegates to PgVectorStore with scope filter
# Test: PgVectorStore receives allowed_scopes as metadata constraint
# Test: HybridRAGEngine.retrieve() injects tenant_id+scope filters even if caller omits them
# Test: metadata filter doc_type="code" returns only code chunks
# Test: metadata filter date_range returns only docs within range
```

### 2.2 Query processor

```python
# test_query_processor.py

# Test: PASSTHROUGH returns original query unchanged, no LLM call
# Test: REWRITE calls LLM and returns cleaned query
# Test: HYDE generates hypothetical document, returns it in hypothetical_doc field
# Test: HYDE embeds the hypothetical doc, not the original query
# Test: MULTI_QUERY generates 3-5 distinct query variations
# Test: MULTI_QUERY variations are deduplicated (no exact duplicates)
# Test: STEP_BACK produces a broader/abstracted version of the query
# Test: ProcessedQuery.strategy_used matches the strategy that was applied
# Test: LLM failure in HyDE falls back to PASSTHROUGH
```

### 2.3 HybridRAGEngine integration

```python
# test_hybrid_rag.py (extend existing)

# Test: query processing runs as Step 0 before BM25/Vector retrieval
# Test: multi-query merges results from all sub-queries via RRF
# Test: multi-query deduplicates documents across sub-query results
# Test: PASSTHROUGH mode has zero additional latency vs baseline
```

---

## Phase 3: Reranking Upgrade

### 3.1 Cross-encoder

```python
# test_reranker.py (extend existing)

# Test: CROSS_ENCODER strategy returns docs sorted by relevance score
# Test: cross-encoder scores are in [0, 1] range
# Test: cross-encoder truncates documents exceeding 300 tokens
# Test: cross-encoder uses ProcessPoolExecutor (not ThreadPoolExecutor)
# Test: cross-encoder lazy loads model on first call
# Test: cross-encoder handles model not found gracefully (falls back)
```

### 3.2 Cohere fallback

```python
# Test: COHERE strategy calls Cohere API and returns relevance_score
# Test: COHERE strategy skipped when no API key configured
# Test: COHERE strategy skipped when cohere package not installed
```

### 3.3 Fallback chain

```python
# Test: fallback chain: cross-encoder fails → tries cohere → tries LLM → heuristic succeeds
# Test: fallback chain: cross-encoder succeeds → does NOT try cohere
# Test: all strategies exhausted → raises clear error with context
```

### 3.4 Scope verification

```python
# Test: reranked results are strict subset of scope-filtered input
# Test: reranking does not re-introduce documents that failed scope check
```

### 3.5 Performance

```python
# test_reranker_performance.py (@pytest.mark.slow)

# Test: cross-encoder completes in <500ms for 20 documents on CPU
# Test: Thai content is correctly ranked by bge-reranker-v2-m3
```

---

## Phase 4: Production RAG Hardening

### 4.1 Guardrails

```python
# test_guardrails.py

# Test: empty RAGResult → FAILED quality assessment
# Test: all scores below 0.15 → FAILED
# Test: scores 0.15-0.4 → LOW quality
# Test: scores 0.4-0.7 → MEDIUM quality
# Test: scores >= 0.7 with multiple docs → HIGH quality
# Test: strict mode + LOW quality → recommended_action = "refuse_answer"
# Test: permissive mode + LOW quality → recommended_action = "warn_user"
# Test: strict mode + FAILED → recommended_action = "refuse_answer"
# Test: permissive mode + FAILED → recommended_action = "refuse_answer"
# Test: system prompt suffix varies by quality level (HIGH/MEDIUM/LOW/FAILED)
```

### 4.2 Citations

```python
# test_citations.py

# Test: Document.citation_ref() returns "[Title — § Section]" format
# Test: Document with no section_heading returns "[Title]" only
# Test: RAGResult.get_context_with_citations() includes [Source N: ...] markers
# Test: citations list has one entry per unique source document
# Test: citations are ordered by appearance in context
```

### 4.3 Query routing

```python
# test_query_router.py

# Test: "hello" / "hi" / "thanks" → CONVERSATIONAL (skip RAG)
# Test: "write me a poem" → CREATIVE (skip RAG)
# Test: "what does the policy say about X" → KNOWLEDGE (needs RAG)
# Test: ambiguous query falls back to LLM classification
# Test: LLM classification failure defaults to KNOWLEDGE (safe fallback)
```

### 4.4 RAG executor

```python
# test_rag_executor.py

# Test: executor queries libraryChunks from PostgreSQL (not mock data)
# Test: executor loads chunks into HybridRAGEngine for query lifecycle
# Test: executor uses effective_scopes from extra_data for filtering
# Test: executor returns real documents with citations and quality assessment
# Test: executor respects tenant's rag_failure_mode setting
# Test: executor creates AsyncSession scoped to request lifecycle
```

### 4.5 Metadata leakage

```python
# Test: FAILED quality response does not include document titles
# Test: LOW quality response in strict mode does not hint at document existence
# Test: audit log records attempted access even when response is refused
```

### 4.6 End-to-end scope enforcement

```python
# test_e2e_scope.py (@pytest.mark.integration)

# Test: full pipeline query through guardrails never returns cross-tenant docs
# Test: full pipeline with scope filtering + reranking + guardrails produces correct results
```

---

## Phase 5: Evaluation & Observability

### 5.1 Evaluator

```python
# test_evaluator.py

# Test: Precision@K with 3 relevant in top-5 → 0.6
# Test: Recall@K with 3 relevant in top-5 out of 10 total relevant → 0.3
# Test: MRR with first relevant at position 3 → 0.333
# Test: NDCG@K with graded relevance produces correct normalized score
# Test: Faithfulness extraction identifies claims and checks against context
# Test: evaluate() runs full dataset and returns EvalMetrics with all fields populated
# Test: evaluate_single() returns per-item breakdown
```

### 5.2 Dataset generation

```python
# test_eval_dataset.py

# Test: generator produces valid QA pairs from input documents
# Test: each QA pair has query, expected_answer, expected_doc_ids
# Test: hard negatives are included (questions with no matching docs)
# Test: generated dataset has at least num_pairs entries
```

### 5.3 Observability

```python
# test_observability.py

# Test: rag_retrieval_complete log event includes quality level
# Test: rag_retrieval_complete log event includes confidence score
# Test: rag_retrieval_complete log event includes query_strategy
# Test: rag_retrieval_complete log event includes rerank_strategy
# Test: rag_retrieval_complete log event includes scope_filter_count
# Test: rag_retrieval_complete log event includes cache_hit boolean
```

### 5.4 CLI

```python
# test_evaluator_cli.py

# Test: CLI runs without error with valid dataset
# Test: CLI produces output file at specified path
# Test: CLI output contains all metric categories
# Test: CLI with invalid dataset path shows clear error
```

### 5.5 Report generation

```python
# Test: generate_report() returns readable markdown with metric tables
# Test: report includes quality gate pass/fail status
```
