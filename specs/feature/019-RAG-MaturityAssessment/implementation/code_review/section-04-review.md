# Section 04: hybrid-search — Code Review

## Review Findings

### F-01: MULTI_QUERY alternatives are never used for retrieval [HIGH]
**File:** `hybrid_rag.py`
The implementation generates alternatives via `QueryProcessor._multi_query()` and stores them in `processed.alternatives`, but `retrieve()` never iterates over them. MULTI_QUERY is functionally identical to PASSTHROUGH.

### F-02: VectorRetriever._apply_filters missing `source` filter [MEDIUM]
**File:** `vector_retriever.py`
BM25 handles 4 filter types (tenant_id, allowed_scopes, doc_type, source). Vector only handles 3 — missing `source`.

### F-03: `date_range` filter specified in plan but not implemented [MEDIUM]
Plan specifies date_range filtering in both retrievers. Not implemented.

### F-04: PgVectorStore delegation path not implemented [MEDIUM]
Plan specifies Path B (PgVectorStore delegation for production). Only Path A (in-memory) was implemented.

### F-05: Cache TTL check uses `.seconds` instead of `.total_seconds()` [MEDIUM]
**File:** `hybrid_rag.py` (pre-existing bug)
`.seconds` wraps at 86400, so cache entries effectively never expire for TTLs < 1 day.

### F-06: RAGConfig.query_strategy default uses `type: ignore` hack [LOW]
Uses `None` + `# type: ignore` + `__post_init__` fixup instead of direct import.

### F-07: QueryProcessor created without `llm_client` [HIGH]
**File:** `hybrid_rag.py`
The lazy property always creates `QueryProcessor()` with no `llm_client`. Non-PASSTHROUGH strategies silently fall back to PASSTHROUGH.

### F-08: Scope filter intersection semantics — verify against ACL model [MEDIUM]
Intersection (OR) semantics: any matching scope grants access. Should verify this matches Section 01 ACL design.

### F-09: Empty `effective_scopes=[]` bypasses scope filtering [HIGH]
**File:** `hybrid_rag.py`
`if effective_scopes:` is falsy for `[]`, so a user with empty scopes bypasses scope filtering entirely.

### F-10: Weak test assertions in test_passthrough_mode_no_llm_call [LOW]
Test adds document without metadata but only asserts on `result.mode`, not on documents returned.

## Summary

| ID | Severity | Description |
|----|----------|-------------|
| F-01 | HIGH | MULTI_QUERY alternatives never used — dead code |
| F-07 | HIGH | QueryProcessor always created without LLM client |
| F-09 | HIGH | Empty effective_scopes=[] bypasses scope filtering |
| F-02 | MEDIUM | VectorRetriever missing `source` filter |
| F-03 | MEDIUM | date_range filter not implemented |
| F-04 | MEDIUM | PgVectorStore delegation not implemented |
| F-05 | MEDIUM | Cache TTL .seconds bug (pre-existing) |
| F-08 | MEDIUM | Scope intersection semantics verification |
| F-06 | LOW | type: ignore hack for query_strategy default |
| F-10 | LOW | Weak test assertions |
