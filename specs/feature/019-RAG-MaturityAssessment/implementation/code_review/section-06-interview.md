# Section 06: guardrails-and-citations — Code Review Interview

## Triage

| ID | Severity | Action | Rationale |
|----|----------|--------|-----------|
| H-01 | HIGH | **Auto-fix** | Add ValueError validation for failure_mode to prevent silent security degradation |
| H-02 | HIGH | **Auto-fix** | Use TYPE_CHECKING import for proper type safety on assess() parameter |
| H-03 | HIGH | **Auto-fix** | Revert _classify_with_llm to return None — LLM integration deferred to section-07 |
| H-04 | HIGH | **Auto-fix** | Add word-count guard (<8 words) to prevent false positives on mixed queries |
| M-01 | MEDIUM | **Auto-fix** | Remove unused avg_score parameter from _build_explanation |
| M-02 | MEDIUM | **Auto-fix** | Remove unused List import (resolved by H-02 TYPE_CHECKING fix) |
| M-03 | MEDIUM | **Let go** | Minor wording difference between strict/permissive MEDIUM prompts — intentional nuance |
| M-04 | MEDIUM | **Auto-fix** | Add QueryRouteDecision to __init__.py exports |
| M-05 | MEDIUM | **Auto-fix** | Strengthen max_tokens test assertion (2500 char bound vs 10200) |
| L-01 | LOW | **Let go** | RAGResult.to_dict already tested in test_hybrid_rag.py |
| L-02 | LOW | **Let go** | Hardcoded confidence values acceptable for this stage |
| L-03 | LOW | **Let go** | Resolved by M-02/H-02 fix |

## Auto-fixes Applied

### FIX-1: H-01 — Add failure_mode validation
Added ValueError in __init__ if failure_mode not in ("strict", "permissive").

### FIX-2: H-02/M-02 — TYPE_CHECKING import
Replaced `from typing import Any, List` with `TYPE_CHECKING` guard importing `RAGResult`.
assess() now properly typed as `rag_result: RAGResult`.

### FIX-3: H-03 — Revert LLM stub
_classify_with_llm now returns None. Full LLM classification deferred to section-07.

### FIX-4: H-04 — Word-count guard
Added `word_count < 8` check before conversational pattern matching.
Prevents "Hi, what does the policy say about X" from skipping RAG.

### FIX-5: M-01 — Remove unused parameter
Removed avg_score from _build_explanation signature and caller.

### FIX-6: M-04 — Export QueryRouteDecision
Added QueryRouteDecision to __init__.py imports and __all__.

### FIX-7: M-05 — Stronger test assertion
Changed max_tokens test from `< len(long_content) + 200` to `< 2500`.
