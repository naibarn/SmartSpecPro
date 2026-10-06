## Review Report

### Verdict: REQUEST_CHANGES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `agency_creator_task.py:1468` | `_llm_suggest_improvements` calls `_llm_call` directly instead of `_budget_llm_call`. The suggestion phase adds one untracked LLM call per design run, bypassing the MAX_LLM_CALLS=18 budget guard entirely. | Replace `await _llm_call(...)` at line 1468 with `await _budget_llm_call(system_prompt, user_message, max_tokens=1500, timeout=60.0)`. `_budget_llm_call` is a closure inside `_design_async` and is already in scope at the call site in Phase 11. |
| HIGH | `agency_creator_task.py:41-52` | `check_rate_limit` has a check-then-act race condition. The `GET`→check→`INCR`→`EXPIRE` sequence is not atomic. Two concurrent requests from the same user arriving within microseconds both read the same counter value, both pass the check, both increment — allowing the limit to be exceeded. | Use Redis `INCR` atomically and check the returned value: `count = r.incr(rate_key); if count == 1: r.expire(rate_key, RATE_LIMIT_TTL); if count > RATE_LIMIT_MAX: raise ValueError(...)`. This is a single atomic increment; the `expire` is only set once on the first creation to establish a fixed window. |
| HIGH | `agency.ts:2880-2889` | Spec §4 (F09) explicitly requires the tRPC `autoCreateStatus` endpoint to validate suggestions with a Zod schema and strip the `change` field before returning to the frontend. The implementation does neither: `safeData` is returned with a bare `as` type cast, the return type annotation omits `hasSuggestions` and `suggestions`, and the raw LLM-generated `change` payload is never stripped. An attacker who controls an LLM response could embed arbitrary data in `change` that reaches the frontend unfiltered. | Add a Zod schema to `autoCreateStatus` that explicitly validates and strips fields. At minimum: `const { hasSuggestions, ...rest } = safeData` and never include the raw `change` field in the response. The frontend must fetch suggestions via a separate `getCreatorSuggestions` procedure that strips `change` (see MEDIUM-1). |
| MEDIUM | `agency_creator_task.py:532-538` / `agency.ts:2880-2889` | Spec §2 states suggestions must be embedded in the completed status dict (`"suggestions": suggestions`). The implementation instead puts only `"hasSuggestions": bool` in the main status and stores the suggestions array in a separate Redis key. No tRPC `getCreatorSuggestions` procedure exists to fetch that key, and `autoCreateStatus` does not read it. The frontend has no way to retrieve the actual suggestions — the feature is partially dead. | Either (a) embed the suggestions array in the completed status as the spec requires, or (b) implement the separate-key approach fully by adding a `getCreatorSuggestions` tRPC procedure that calls `get_suggestions(task_id)` via the Python API. Option (b) preserves the F09 isolation requirement. Whichever path is chosen, the tRPC layer must strip `change` from each suggestion before returning. |
| MEDIUM | `agency_creator_task.py:28-38` | `get_suggestions` has no error handling around the Redis call at line 30. A Redis connection failure raises an unhandled exception to the caller. By contrast, the sibling `store_suggestions` correctly wraps the Redis call in try/except. | Wrap `r.get(...)` in a try/except block identical to `store_suggestions`, returning `[]` on failure. |
| MEDIUM | `agency_creator_task.py:51-52` | `r.expire(rate_key, RATE_LIMIT_TTL)` is called unconditionally on every successful creation, resetting the 1-hour window each time. A user can keep sliding the window indefinitely by making a 5th creation just before expiry. This is a sliding-window limiter, not a fixed-window limiter as the spec intends. | Set the TTL only when `INCR` returns 1 (i.e., the key was just created), which establishes a fixed window. The corrected pattern from HIGH-2 above naturally achieves this. |
| MEDIUM | `tests/test_agency_creator_v2.py` | Spec §Tests explicitly requires `test_suggestions_in_completed_status`: "Mock full pipeline, assert final Redis status includes suggestions field." This test is absent from the diff. | Add an integration-style test that exercises the Phase 11 block inside `_design_async`, asserting that `_set_status` was called with a `completed` payload and that `store_suggestions` was called when the LLM returns valid suggestions. |
| LOW | `agency_creator_task.py:515` | Comment says "Phase 11: SUGGEST" but the spec names this "Phase 9" (after IMPLEMENT). The numbering diverges from the spec's phase model, causing confusion when cross-referencing. | Update the comment to "Phase 9: SUGGEST" to match `section-05-post-creation-suggestions.md §2`. |
| LOW | `agency_creator_task.py:1494-1502` | The `change` dict is forwarded verbatim from the LLM response with no structural validation against the typed action contract defined in spec §1 (add_capability requires `capability` key; add_tool requires `toolId`; upgrade_mode requires `executionMode`). Downstream `applySuggestion` will have to handle all malformed cases defensively. | Add per-category shape enforcement inside the validation loop: for `add_capability` assert `isinstance(item.get("change", {}).get("capability"), str)`; for `add_tool` assert `toolId` is present and matches `^builtin-[a-z-]+$`; for `upgrade_mode` assert `executionMode` is one of the known values. Reject items that fail validation rather than passing them through. |
| LOW | `tests/test_agency_creator_v2.py:290-297` | `test_suggest_fallback_on_bad_json` covers the non-JSON-string case but does not cover the case where `_safe_json_parse` returns a valid JSON object (dict, not list). The `not isinstance(parsed, list)` branch has no direct test. | Add a test: `mock_call.return_value = json.dumps({"category": "add_tool"})` and assert `result == []`. |

### Contract Compliance

| Check | Status |
|---|---|
| `_llm_suggest_improvements` registered and callable | PASS — function exists and is imported in tests |
| Suggestions stored in separate Redis key `agency-creator:{task_id}:suggestions` (F09) | PASS — key format matches spec |
| Suggestions NOT embedded directly in main status blob (F09 isolation) | PASS — `hasSuggestions` bool only in main status |
| tRPC `autoCreateStatus` strips `change` field from suggestions before response | FAIL — no stripping, no Zod validation |
| tRPC `getCreatorSuggestions` procedure exists to fetch suggestions separately | FAIL — procedure not implemented; no retrieval path for frontend |
| `_budget_llm_call` used for all LLM calls inside design budget | FAIL — `_llm_suggest_improvements` uses raw `_llm_call` |
| Rate limit enforced before any LLM calls in `create_agency_discover_task` | PASS — check placed correctly before `_set_status` processing call |
| Rate limit implementation is atomic | FAIL — GET + INCR + EXPIRE is not atomic; race window exists |
| Rate limit uses fixed window (not sliding) | FAIL — `expire` reset on every call slides the window |
| MAX_LLM_CALLS increased from 12 to 18 | PASS |
| `_llm_suggest_improvements` caps output at `MAX_SUGGESTIONS=5` | PASS |
| Category and impact fields validated before storing suggestions | PASS |
| Field-length truncation applied to `title` (50) and `description` (200) | PASS |
| `get_suggestions` gracefully handles Redis failures | FAIL — no error handling |
| `test_suggestions_in_completed_status` (spec-required test) | FAIL — missing |
| `test_suggest_max_5`, `test_suggest_returns_list`, `test_suggest_fallback_*` | PASS |
| `test_rate_limit_*` coverage (3 cases) | PASS |
| `TestSuggestionsRedisIsolation` (2 cases) | PASS |

### Summary

The core suggestion generation function (`_llm_suggest_improvements`) and Redis isolation key structure are correctly implemented. However, three issues together break the feature end-to-end: the suggestion LLM call bypasses the budget guard, the frontend has no retrieval path for the suggestions (only a boolean flag is surfaced and no `getCreatorSuggestions` endpoint exists), and the tRPC layer neither validates nor strips the raw LLM `change` field from suggestion payloads before returning them to the client (a security violation per F09). The rate limiter also has a race condition and a sliding-window bug that make it trivially bypassable under concurrent load. These issues collectively require changes before merge.
