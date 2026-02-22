# Section 05: reranking — Code Review Interview

## Triage

| ID | Severity | Action | Rationale |
|----|----------|--------|-----------|
| F-01 | HIGH | **Auto-fix** | Use run_in_executor with ThreadPoolExecutor (simpler, avoids model duplication) |
| F-02 | MEDIUM | **Auto-fix** | Add cohere>=5.0.0 to requirements.txt |
| F-10 | LOW | **Auto-fix** | use_llm=False should only use HEURISTIC |
| F-03 | MEDIUM | **Let go** | Performance tests need 1.1GB model download — deferred to manual |
| F-04 | MEDIUM | **Let go** | Naive char truncation works for English; tiktoken is optimization |
| F-05 | MEDIUM | **Let go** | Sync Cohere client acceptable in fallback context |
| F-06 | LOW | **Let go** | Expected behavior: docs <= top_k don't need scoring |
| F-07 | MEDIUM | **Let go** | 18 tests provide good coverage |
| F-08 | LOW | **Auto-fix** | Resolved by F-01 fix (no in-process model needed) |
| F-09 | LOW | **Let go** | In-memory only, not persisted |
| F-11 | LOW | **Let go** | Standard pattern in codebase |

## Auto-fixes Applied

### FIX-1: F-01/F-08 — Use run_in_executor for cross-encoder inference
Remove redundant in-process model. Use ThreadPoolExecutor + run_in_executor.

### FIX-2: F-02 — Add cohere to requirements.txt

### FIX-3: F-10 — Fix use_llm=False backward compatibility
