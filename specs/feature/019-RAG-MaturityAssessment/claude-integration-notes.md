# Integration Notes — Opus Review Feedback

## Findings Integrated

### 1. CRITICAL: `library_permissions` ↔ `allowed_scopes` reconciliation (Review #1)
**Integrating.** The reviewer correctly identified that the existing `library_permissions` table is the authoritative permission system. The plan was written without awareness of it.

**Decision:** `allowed_scopes` will be a **denormalized cache derived from `library_permissions`** at write time (Option 1 from reviewer). When a permission record is inserted/updated/deleted, a trigger/hook computes the new `allowed_scopes` array and writes it to the item + all its chunks. `library_permissions` remains the source of truth for the UI/API; `allowed_scopes` is the fast-path for vector DB filtering.

### 2. CRITICAL: Group schema mismatch (Review #2)
**Integrating.** The reviewer correctly identified the existing `groupMembers` schema uses `"active" | "pending" | "removed"` status values, not `"invited" | "accepted" | "declined"`.

**Decision:** Map plan semantics to existing columns: `"pending"` = invited, `"active"` = accepted, `"removed"` = declined/revoked. Use `addedBy` instead of `invited_by`. Use `joinedAt` instead of `accepted_at`. No schema migration needed for groups.

### 3. CRITICAL: Embedding dimension mismatch (Review #3)
**Integrating.** Real issue — Node.js uses 768-dim (bge-base-en-v1.5) while Python uses 1536-dim (OpenAI ada-002).

**Decision:** Add a section specifying that the Python-side OpenAI embedding model (1536-dim) is the standard for the RAG pipeline. Documents indexed from Node.js via `vectorize.ts` should either: (a) call the Python embedding endpoint instead, or (b) be re-embedded during the smart chunking migration. Phase 1 already re-indexes documents with the new chunker, so re-embedding can happen simultaneously. Existing 768-dim vectors become stale once documents are re-chunked.

### 4. HIGH: In-memory retrievers vs. database-backed storage (Review #4)
**Integrating.** This is a significant architectural gap. The in-memory `_documents` dict in `HybridRAGEngine` means scope filtering on in-memory data is meaningless without loading tenant-specific documents first.

**Decision:** Phase 4 (RAG executor integration) must explicitly bridge this gap. The executor will: (a) query `libraryChunks` + `library_chunk_vectors` from PostgreSQL, (b) load relevant chunks into the in-memory engine for a single query lifecycle, or (c) refactor the retrievers to query the database directly. Option (c) is the proper fix for Phase 2; option (b) is the interim approach for Phase 4.4.

### 5. HIGH: Cache key missing scopes/tenant (Review #5)
**Integrating.** Confirmed — cache key is `f"{query}:{top_k}:{mode.value}"` with no tenant/scope information. Cross-tenant cache pollution is a real security risk.

**Decision:** Add to Phase 0 as a mandatory pre-requisite fix. Cache key must include `tenant_id` + hash of effective scopes.

### 6. HIGH: `text[]` column type in Drizzle (Review #6)
**Integrating.** The plan used Python syntax for the column type. Need to specify actual Drizzle syntax.

**Decision:** Add explicit Drizzle definition: `allowedScopes: text("allowed_scopes").array().default(sql\`'{}'\`)`. Also note that GIN indexing on array columns enables fast containment queries (`@>` operator).

### 7. MEDIUM: Cross-encoder memory/cold start (Review #7)
**Partially integrating.** Valid concerns about memory and cold start. The 200ms target for 20 docs on CPU may be optimistic.

**Decision:** Add notes about lazy loading on first use, dedicated ProcessPoolExecutor for inference, and revise performance target to <500ms for 20 docs (with a note to benchmark). If CPU inference is too slow, Cohere API becomes the primary strategy.

### 8. MEDIUM: Existing chunker migration (Review #8)
**Integrating.** Changing chunk sizes requires a re-indexing strategy. Plan said "no breaking changes" but didn't address existing chunk data.

**Decision:** Add a re-indexing sub-step to Phase 1 that processes existing documents through the new chunker. Old chunks are replaced (not kept alongside). This is a batch operation using Celery tasks.

### 9. MEDIUM: HyDE/multi-query credit costs (Review #9)
**Integrating.** Valid — LLM calls for query processing have cost implications.

**Decision:** Add cost section. HyDE uses the cheapest available model (gpt-4.1-nano). Credit cost is 1 additional credit per HyDE call. Multi-query: each sub-query uses the same retrieval credit as a single query. Total billed as a single query + processing overhead. Both are opt-in only.

### 10. MEDIUM: Scope propagation to vector stores (Review #10)
**Integrating.** Need to specify per-provider update mechanism.

**Decision:** Add per-provider update notes: pgvector → SQL UPDATE on metadata column; ChromaDB → `collection.update()`; Cloudflare Vectorize → delete + re-insert (no in-place metadata update).

### 11. MEDIUM: Missing Phase 1 schema columns (Review #11)
**Integrating.** `is_parent` and `parent_chunk_id` require schema changes in Phase 1, contradicting the "no other schema changes" claim.

**Decision:** Correct the Rollout section. Phase 0 has `allowed_scopes`, Phase 1 has `is_parent` + `parent_chunk_id`. Both require migrations.

### 12. MEDIUM: RAG executor database session (Review #12)
**Integrating.** `ExecutionContext` has no database session.

**Decision:** Pre-compute effective scopes in the calling code (the node executor framework) and pass them in `extra_data["effective_scopes"]`. This avoids giving the executor direct DB access and keeps scopes computation in the Node.js layer which already has the permission logic.

### 13. MEDIUM: BM25 filter-after-score efficiency (Review #13)
**Partially integrating.** Pre-filtering is more efficient for large corpora, but the in-memory BM25 is being addressed by Review #4.

**Decision:** When the retrievers are refactored to be database-backed (Phase 2/4), BM25 filtering will happen at the SQL level. For the interim in-memory approach, pre-filter by `allowed_scopes` before scoring.

## Findings NOT Integrated

### 14. LOW: Cohere dependency availability (Review #14)
**Not integrating as a plan change.** The plan already marks Cohere as optional. Implementation will check for API keys at runtime. No plan change needed.

### 15. LOW: Thai language query routing (Review #15)
**Not integrating.** Valid concern but too granular for this plan. The regex heuristics are a minor optimization; the LLM classification fallback handles all languages. Can be addressed as a follow-up.

### 16. LOW: Evaluation dataset security (Review #16)
**Not integrating as a plan change.** The evaluation pipeline is offline-only and admin-initiated. Enterprise tenants already control which LLM providers are enabled. A tenant-level opt-in flag is over-engineering for an admin tool. Can be addressed if enterprise customers request it.
