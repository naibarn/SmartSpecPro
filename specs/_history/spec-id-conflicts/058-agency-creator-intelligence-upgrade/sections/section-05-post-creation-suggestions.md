# Section 05: Post-Creation Suggestions

## Goal
After agency creation succeeds, LLM analyzes the spec and generates 3-5 optional improvement suggestions. Stored in Redis for frontend display.

## File
`python-backend/app/tasks/agency_creator_task.py`, new function + modify design task Phase 9

## Implementation (Actual)

### 1. New function: `_llm_suggest_improvements()`

```python
async def _llm_suggest_improvements(spec: dict, model: str, user_id: int, llm_fn=None) -> list[dict]:
```

- Accepts optional `llm_fn` parameter for budget-tracked LLM calls (closure from `_design_async`)
- Falls back to `_llm_call` when `llm_fn` is None (for standalone testing)
- System prompt in module-level constant `SUGGEST_SYSTEM_PROMPT`
- Per-category change-field validation via `_validate_suggestion_change()`:
  - `add_capability`: requires `change.capability` (string)
  - `add_tool`: requires `change.toolId` (non-empty string)
  - `upgrade_mode`: requires `change.executionMode` (string)
  - `add_node`/`improve_flow`: no change validation needed
- Returns max 5 validated suggestions, empty list on failure

### 2. Phase 9: SUGGEST integrated into `_design_async()`

After DOCUMENT phase, calls `_llm_suggest_improvements(spec, model, user_id, llm_fn=_budget_llm_call)` — uses the budget-tracked closure.

Completed status includes `hasSuggestions: bool` flag (not raw suggestions). Suggestions stored separately via `store_suggestions()`.

### 3. MAX_LLM_CALLS increased from 12 to 18

### 4. Security: Redis isolation (F09)

- `store_suggestions(task_id, suggestions)` → Redis key `agency-creator:{task_id}:suggestions`
- `get_suggestions(task_id)` → reads from separate key, returns `[]` on any failure
- Main status dict contains only `hasSuggestions: bool`, never the raw array
- tRPC `change` field stripping deferred to section-07 (Internal API Update)

### 5. Security: Rate limiting (F10)

`check_rate_limit(user_id)` uses atomic Redis INCR pattern:
```python
count = r.incr(rate_key)
if count == 1:
    r.expire(rate_key, RATE_LIMIT_TTL)  # Fixed window, TTL set only once
if count > RATE_LIMIT_MAX:
    raise ValueError(...)
```
- Fixed-window (not sliding) — TTL set only on first increment
- Atomic — no check-then-act race condition
- Called at the top of `create_agency_discover_task` before any LLM calls

### Deviations from plan
- Rate limit implementation uses atomic INCR instead of GET→check→INCR (review finding: race condition)
- `_llm_suggest_improvements` takes `llm_fn` param to use `_budget_llm_call` closure (review finding: budget bypass)
- Completed status uses `hasSuggestions: bool` instead of embedding full suggestions array (F09 isolation)
- Per-category change validation added (review finding: malformed payloads)

## Tests (15 new, 55 total passing)

| Test | Class |
|------|-------|
| `test_suggest_returns_list` | TestSuggestImprovements |
| `test_suggest_max_5` | TestSuggestImprovements |
| `test_suggest_fallback_empty_on_failure` | TestSuggestImprovements |
| `test_suggest_fallback_on_bad_json` | TestSuggestImprovements |
| `test_suggest_fallback_on_dict_not_list` | TestSuggestImprovements |
| `test_suggest_uses_budget_llm_fn` | TestSuggestImprovements |
| `test_suggest_validates_change_field` | TestSuggestImprovements |
| `test_rate_limit_allows_under_threshold` | TestRateLimit |
| `test_rate_limit_blocks_over_threshold` | TestRateLimit |
| `test_rate_limit_sets_ttl_only_on_first_call` | TestRateLimit |
| `test_rate_limit_no_ttl_on_subsequent_calls` | TestRateLimit |
| `test_suggestions_stored_in_separate_key` | TestSuggestionsRedisIsolation |
| `test_get_suggestions_returns_list` | TestSuggestionsRedisIsolation |
| `test_get_suggestions_returns_empty_on_missing` | TestSuggestionsRedisIsolation |
| `test_get_suggestions_handles_redis_failure` | TestSuggestionsRedisIsolation |
| `test_completed_status_has_suggestions_flag` | TestSuggestionsInCompletedStatus |
