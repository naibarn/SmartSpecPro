# Section 04: hybrid-search — Code Review Interview

## Triage

| ID | Severity | Action | Rationale |
|----|----------|--------|-----------|
| F-09 | HIGH | **Auto-fix** | Security: empty scopes=[] bypasses filtering |
| F-02 | MEDIUM | **Auto-fix** | Consistency: add missing `source` filter to VectorRetriever |
| F-05 | MEDIUM | **Auto-fix** | Pre-existing bug: `.seconds` → `.total_seconds()` |
| F-06 | LOW | **Auto-fix** | Clean up type: ignore hack |
| F-10 | LOW | **Auto-fix** | Strengthen weak test assertion |
| F-01 | HIGH | **Let go** | MULTI_QUERY alternatives are framework scaffolding; section-07 wires LLM client |
| F-07 | HIGH | **Let go** | Same as F-01 — LLM client injection deferred to section-07 (rag-executor) |
| F-03 | MEDIUM | **Let go** | date_range not critical; can be added when needed |
| F-04 | MEDIUM | **Let go** | PgVectorStore delegation is production integration, out of scope |
| F-08 | MEDIUM | **Let go** | Intersection semantics match Section 01 ACL model (verified) |

## Auto-fixes Applied

### FIX-1: F-09 — Empty effective_scopes bypass (SECURITY)
**File:** `hybrid_rag.py`
Change `if effective_scopes:` to `if effective_scopes is not None:` so `[]` still injects the filter (returning 0 docs).

### FIX-2: F-02 — Add `source` filter to VectorRetriever
**File:** `vector_retriever.py`
Add `source` exact match filter to `_apply_filters()` for consistency with BM25.

### FIX-3: F-05 — Fix cache TTL check
**File:** `hybrid_rag.py`
Change `.seconds` to `.total_seconds()` in cache expiry check.

### FIX-4: F-06 — Fix query_strategy default
**File:** `hybrid_rag.py`
Import QueryStrategy at module level and set default directly.

### FIX-5: F-10 — Strengthen test assertion
**File:** `test_hybrid_rag.py`
Add metadata to test document and assert on `result.documents` or `result.bm25_candidates`.
