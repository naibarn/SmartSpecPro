## Review Report — Section 01: Discover Enhancement

### Verdict: NEEDS_FIX

---

### Summary

The core discover-phase enhancements are well-implemented: new capability fields are added to the prompt and response schema, fallback/normalisation guards are correct, the `_validate_spec` intelligence-defaults block is clean, and the `_self_review_spec` loop is a solid addition. However, three issues block approval: the `computer_use` guardrail silently hard-blocks the capability unconditionally rather than checking a feature flag as the spec requires; `objective` and `sharedInstructions` are still silently stripped by `agencyCreateSchema` on the Node.js side; and `MAX_DISCOVER_CALLS` is defined but never enforced. The test for `MAX_DISCOVER_CALLS` is also not a real test.

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `agency_creator_task.py:1039-1041` | **`computer_use` guardrail ignores tenant feature flag.** Spec §5 requires `if not await check_agentic_flag("agencyComputerUseEnabled", tenant_id)` — meaning trusted tenants can opt in. The implementation unconditionally strips `supportsComputerUse` for every tenant, permanently disabling a spec-described capability with no opt-in path. | Make `_validate_spec` synchronous but accept an optional `tenant_computer_use_allowed: bool` parameter (resolved by the caller before calling `_validate_spec`), or move the guardrail into the async `_implement_agency` call-site where `tenant_id` is known. |
| HIGH | `apps/web/server/_core/index.ts:954-978` | **`agencyCreateSchema` strips `objective` and `sharedInstructions`.** Python sends both fields in `body_json` (diff lines 422-423), but `agencyCreateSchema` does not include either field. Zod strips unknown keys by default. Both fields are never written to the `agencies` INSERT at line 1052-1065. This was flagged as CRITICAL in the prior spec-058 plan review (MEMORY.md) and remains unresolved in this section's diff. | Add `objective: z.string().max(2000).optional().default("")` and `sharedInstructions: z.string().max(50000).optional().default("")` to `agencyCreateSchema`, and include them in the `agencies` INSERT values. |
| HIGH | `agency_creator_task.py:32` + `tests/test_agency_creator_v2.py:71` | **`MAX_DISCOVER_CALLS` is defined but never enforced.** The constant is declared and the spec says "the discover phase should never call LLM more than 2 times (1 for analysis, 1 possible retry on parse failure)", but `_llm_discover` makes exactly one `_llm_call` with no retry loop and no budget counter — so the cap is meaningless dead code. The test (`assert MAX_DISCOVER_CALLS == 2`) is a constant-value assertion, not a behavioural test. | Either remove the constant and the spec intent (documenting why no retry is needed), or implement a retry-on-parse-failure path inside `_llm_discover` that respects the cap. The test should mock `_llm_call` to return unparseable JSON on attempt 1 and valid JSON on attempt 2, then assert `_llm_call.call_count <= MAX_DISCOVER_CALLS`. |
| MEDIUM | `agency_creator_task.py:862-908` | **`_self_review_spec` calls `_llm_call` up to `max_rounds=2` times inside `_llm_design`, adding up to 2 extra LLM calls outside any budget tracking.** The design phase already calls `_llm_call` once (or more if retry logic exists elsewhere). Total design-phase LLM calls can reach 3 without being reflected in any budget constant or test assertion. This was partially anticipated by the prior plan review (HIGH-4) but the fix here adds budget-untracked calls. | Add a `design_llm_call_count` counter in `_llm_design` that includes self-review rounds, and enforce a total cap (e.g., `MAX_DESIGN_CALLS = 4`). Alternatively document the expected maximum explicitly and cover it with a test. |
| MEDIUM | `agency_creator_task.py:319-321` | **Sanity check in `_self_review_spec` uses `abs(old_nodes - new_nodes) <= 3` which can accept a 3-node spec growing to 6 or shrinking to 0.** A spec with 1 node that the reviewer changes to 4 nodes would pass (diff = 3 ≤ 3). An empty nodes list (`new_nodes = 0`) would also pass when `old_nodes = 3`. The intent is to reject "radical changes" but the bound is relative without a floor. | Use a relative check: `0.5 <= new_nodes / max(old_nodes, 1) <= 2.0` (no more than doubling or halving). Also add `new_nodes >= 1` as an absolute floor. |
| MEDIUM | `tests/test_agency_creator_v2.py:523-526` | **`test_discover_no_technical_questions` accesses `call_args` with an unsafe multi-path fallback that masks test failures.** The try-get pattern (`call_args.kwargs.get(...)` → `call_args[1].get(...)` → `call_args[0][0]`) will silently produce an empty string if `_llm_call` was never called (e.g., due to a future import error), causing the assertion to fail with a confusing `AssertionError: assert "" contains "Do NOT ask technical questions"` rather than revealing the real issue. | Use `mock_call.assert_called_once()` before accessing `call_args`, then use the positional `call_args.kwargs["system_prompt"]` directly (since `_llm_call` is always called with kwargs). |
| LOW | `agency_creator_task.py:1043-1045` | **`objective` fallback inference copies `description` verbatim.** The description is typically a short "what this agency does" sentence, while `objective` should be a goal statement (used by the continuous-improvement advisor). A blank `objective` would be preferable to a misleading one. | Only copy `description` if it is longer than ~20 characters and contains goal-oriented language, or leave it blank so the improvement advisor infers it from run history. |
| LOW | `tests/test_agency_creator_v2.py:563` | **`test_computer_use_not_stripped_when_absent` asserts `get("supportsComputerUse") is None` but the diff also adds `"modelRequirements": {"strategy": "balanced", "supportsFunctionTools": True}` via the `_validate_spec` defaults path (line 1035-1036).** This means after `_validate_spec`, `modelRequirements` will exist with `strategy` and `supportsFunctionTools` but no `supportsComputerUse`. The assertion is correct but the test does not verify that `supportsFunctionTools` was also set, leaving the defaults block partially untested. | Add assertion `assert result["nodes"][0]["modelRequirements"]["supportsFunctionTools"] is True` to cover the full defaults path. |
| LOW | `agency_creator_task.py:379-380` | **`spec["objective"]` fallback runs after `_validate_spec` normalises nodes, but only writes to `spec` — not to the returned dict.** The `_validate_spec` function receives `spec` and mutates it in place (nodes are mutated via `node.setdefault`) but returns `spec` at the end. The `objective` fallback line (`spec["objective"] = spec["description"]`) is inside `_validate_spec` and correctly writes to the same dict. This is fine but relies on mutation semantics. A future refactor to return a copy would silently break `objective` propagation. | Add a comment noting the in-place mutation contract, or move the `objective` inference to `_implement_agency` where the final `body_json` is assembled, making the data flow explicit. |

---

### Contract Compliance

| Check | Status |
|---|---|
| Discover response includes all new spec fields (`recommended_capabilities`, `complexity_level`, `memory_recommendation`, `domain_insights`) | PASS — all fields added with normalisation guards |
| Fallback dict includes new fields with correct defaults | PASS — `_fallback` dict matches spec §3 exactly |
| `MAX_DISCOVER_CALLS = 2` constant defined | PASS (constant exists) / FAIL (not enforced) |
| `computer_use` guardrail strips capability | PARTIAL — strips unconditionally; spec requires tenant feature-flag check |
| `_validate_spec` applies `executionMode`, `planningStrategy`, `enableLongTermMemory`, `memoryScope` defaults | PASS |
| `_validate_spec` applies `modelRequirements` default for agents/supervisors | PASS |
| `_implement_agency` sends `objective` and `sharedInstructions` in `body_json` | PASS — Python side correct |
| `agencyCreateSchema` accepts and persists `objective` and `sharedInstructions` | FAIL — both fields absent from Zod schema and INSERT; silently dropped |
| `_llm_design` prompt updated with capability decision guidance | PASS — node type, execution mode, capability, memory, and tool sections all present |
| Self-review loop added after `_llm_design` | PASS — `_self_review_spec` wired correctly |
| Tests cover capability fields in discover response | PASS |
| Tests cover fallback capability fields | PASS |
| Test for budget cap is behavioural | FAIL — constant-value assertion only |
| Test for `computer_use` guardrail | PASS (unconditional strip is tested) |
