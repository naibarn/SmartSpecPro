# Section 05 Code Review Interview

## Review Findings Triage

### Auto-fixed (no user input needed)
1. **HIGH: Rate limit race condition** — Replaced GET→check→INCR with atomic INCR→check pattern. TTL set only on count==1 (fixed window).
2. **HIGH: Budget bypass** — Refactored `_llm_suggest_improvements` to accept `llm_fn` parameter. `_design_async` passes `_budget_llm_call` closure.
3. **MEDIUM: `get_suggestions` missing error handling** — Added try/except wrapping Redis call.
4. **MEDIUM: Sliding window bug** — Fixed as part of rate limit atomic fix.
5. **MEDIUM: Missing `test_suggestions_in_completed_status`** — Added integration-style test exercising Phase 9 inside `_design_async`.
6. **LOW: Phase numbering** — Changed comment from "Phase 11" to "Phase 9".
7. **LOW: Change field validation** — Added per-category validation (`_validate_suggestion_change`). Rejects items missing required keys.
8. **LOW: Missing dict-not-list test** — Added `test_suggest_fallback_on_dict_not_list`.

### Deferred to later sections
- **HIGH: tRPC `autoCreateStatus` Zod validation + `change` field stripping** — Belongs in section-07 (Internal API Update) which adds tRPC procedures.
- **MEDIUM: Missing `getCreatorSuggestions` tRPC procedure** — Also section-07.

### Let go
- None — all findings were actionable.

## Test Results After Fixes
- 55 tests pass (49 existing + 6 new)
- New tests: TestSuggestImprovements (6), TestRateLimit (4), TestSuggestionsRedisIsolation (4), TestSuggestionsInCompletedStatus (1)
