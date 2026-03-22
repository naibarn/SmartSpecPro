# Section 18 — Parallel Fan-Out Node: Code Review

**Date:** 2026-03-23
**Reviewer:** CMD-8 SSP Reviewer Agent
**Spec:** `specs/feature/052-agency-swarm-full-capability/sections/section-18-parallel-fanout-node.md`
**Diff:** `section-18-diff.md` + bundled shared-file changes from section-17 commit

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `agency_orchestrator.py:848` | `custom_prompt` merge creates a fresh `httpx.AsyncClient` per call, identical to the `_route()` anti-pattern flagged in section-14/15 reviews. Shared worker — one fan-out with `custom_prompt` per request opens and immediately discards a connection pool. | Follow the pattern established in the rest of the file: inject or reuse a module-level or constructor-injected async client rather than opening one per call. |
| HIGH | `agency.ts:1155-1179` | `saveBuilder` validates `branches.length >= 2`, `mergeStrategy`, `mergePrompt`, `maxConcurrent`, and `timeoutMs` — but **never cross-validates `branch.targetNodeId` against the sibling node list**. A branch can point to a non-existent or deleted node and the save will succeed. Runtime falls back to `[Branch X: target not found]`, silently producing a degraded run. Spec §2 (Zod cross-validation) and the Vitest spec both require this check. | Collect the set of node IDs from `input.agents` in the `superRefine` block (same pattern needed for section-17's `defaultTargetNodeId` — see prior review) and verify each `branch.targetNodeId` is a member. |
| HIGH | `agency.ts:1155-1179` | **Circular-reference check absent.** Spec §4 (Edge Cases table) explicitly requires detecting and rejecting a branch whose `targetNodeId` equals the fan-out node's own ID. Currently a fan-out node can point a branch at itself, producing infinite recursion at runtime. | In the `saveBuilder` `superRefine` block, reject any branch where `branch.targetNodeId === data.nodeId` (or `data.name` if ID is not available in that scope). |
| HIGH | `parallelFanOutValidation.test.ts` | **Vitest test for `targetNodeId` cross-validation is entirely absent.** Spec §TDD explicitly requires: "saveBuilder validates branch targetNodeId references exist — Branch with targetNodeId not in agency nodes → validation error". This is one of the 6 specified Vitest tests; 5 of 6 are present. | Add a test that calls `saveBuilder` (or the inline schema) with a `targetNodeId` that is not in `input.agents` and asserts a validation error. Note: until the cross-validation is added to `agency.ts`, this test will fail by design. |
| MEDIUM | `test_parallel_fan_out.py` | **4 of 11 spec-required pytest tests are absent:** (1) `first_complete` returns on first branch completion and cancels pending tasks; (2) `continueOnError=false` propagates exception; (3) `custom_prompt` merge calls LLM Gateway with all branch results; (4) budget exceeded mid-branch cancels remaining branches. The `first_complete` execution path in the orchestrator (`asyncio.wait(FIRST_COMPLETED)`) is completely untested. | Implement the four missing pytest cases. The `first_complete` test is especially important — it exercises the `asyncio.wait` path that is distinct from all other merge strategies and has task-cancellation responsibility. |
| MEDIUM | `agency_orchestrator.py:798-813` | **`first_complete` silently falls back to an error string when all done tasks have error prefixes.** The inner loop breaks on the first non-error result (`not r.startswith("[Branch")`) but if the only completed branch produced an error, `result` ends up as the error string with no indication that more branches are pending. The `finally` block then cancels those pending branches. For `continueOnError=True`, this discards potentially good results from branches that were still running. | After cancelling pending tasks in the `finally` block, if `result` still starts with `[Branch`, await the cancelled tasks with `return_exceptions=True` and collect any non-error result from the set. |
| MEDIUM | `agency_orchestrator.py:871-875` | **`branch_contexts` index diverges from `branches` index when dynamic branching replaces the original branches list.** `branch_contexts` is built from the resolved (potentially-replaced) `branches` list at line 793, but the credit-copy loop at line 872 re-indexes against `branches[i]` — which by that point still references the resolved list. This is correct today but only because `branches` is reassigned before the task loop. If the order of the two loops ever changes, credit labels will be wrong. | Zip `branch_contexts` with the resolved `branches` list in one place rather than relying on index alignment: `for branch, branch_ctx in zip(branches, branch_contexts)`. |
| MEDIUM | `ParallelFanOutNodeCard.tsx:66-68` | **Single-branch handle position is hard-coded to 50% but the offset formula divides by `branches.length - 1`.** When `branches.length === 1`, the formula `(i / (branches.length - 1))` produces `0 / 0 = NaN`, so `left` becomes `NaN%`. The ternary guard (`branches.length > 1 ? ... : 50`) correctly catches this, but there is a deeper issue: a fan-out with exactly 1 branch can be saved (the Zod validation in `saveBuilder` requires ≥ 2 branches, but the card renders in read-only mode from stored data). If validation is bypassed or a migration produces a 1-branch record, the card renders with a broken handle. | Guard is acceptable. Document the assumption that 1-branch fan-out nodes cannot be created through the UI; the card's single-branch fallback is only a rendering safety net. No code change required, but add a comment. |
| LOW | `NodePropertyPanel.tsx` | **Dynamic branch source UI (spec §6, "Dynamic branch source" collapsible) is not implemented.** The form covers all static fields but the `dynamicBranchSource` section (source node dropdown, output field, task template) is absent. The orchestrator does support `dynamicBranchSource` at runtime. | Implement the collapsible advanced panel section as described in spec §6. Until then, dynamic branches can only be set via direct API, not through the UI. |
| LOW | `parallelFanOutValidation.test.ts:106-124` | **Tests redefine the schema inline rather than importing from `agency.ts`.** All 5 implemented tests exercise a locally-declared `parallelFanOutSchema`, not the actual `saveBuilder` superRefine path. If the `agency.ts` validation diverges, these tests will not catch it. Identical issue to what was flagged in section-17. | Import a named exported `validateParallelFanOutConfig` helper from `agency.ts`, or write the tests as tRPC procedure calls so they exercise the real path. |
| LOW | `agency_orchestrator.py:847` | **`LLM_GATEWAY_URL` env var used for `custom_prompt` merge; other internal LLM calls use `PYTHON_BACKEND_INTERNAL_URL`.** The two env vars point to different services — `custom_prompt` calls the Node.js gateway directly rather than going through the Python backend's `/api/v1/llm/simple` route. This inconsistency makes the merge call bypass existing rate-limit middleware on the Python backend. | Use `PYTHON_BACKEND_INTERNAL_URL + /api/v1/llm/simple` (same as `_route`, `_aggregate`, `_call_skill`) to stay on the established and rate-limited path. |
| LOW | `agency_orchestrator.py:858-862` | **`custom_prompt` merge silently returns empty string when LLM response has neither `choices[0].message.content` nor `content`.** The chained `.get()` calls produce `""`, which then gets `.strip()`-ped to `""`. The caller has no way to distinguish an empty LLM response from a response-parsing failure. | Log a structured warning when `result` is empty after the LLM call before falling back, and consider including a `[MergeWarning: LLM returned empty response — using concatenation fallback]` prefix in the returned string. |

---

### Contract Compliance

| Requirement | Status | Notes |
|---|---|---|
| `"parallel_fan_out"` added to `AgencyNodeType` union in `types.ts` | PASS | Line 11 |
| `BaseAgencyNode` dispatches `ParallelFanOutNodeCard` | PASS | Lines 13, 40-41 |
| `ParallelFanOutNodeCard` — cyan color theme, Split icon, per-branch handles | PASS | All present; handle spread formula correct for ≥2 branches |
| `ParallelFanOutNodeCard` — single target handle at top | PASS | |
| `ParallelFanOutNodeCard` — validation error indicator | PASS | `AlertCircle` rendered when `validationErrors.length > 0` |
| `ParallelFanOutForm` — branch list with add/remove, min 2 enforced in UI | PASS | Remove disabled when `branches.length <= 2` |
| `ParallelFanOutForm` — merge strategy dropdown with 4 options | PASS | |
| `ParallelFanOutForm` — merge prompt shown only for `custom_prompt` | PASS | |
| `ParallelFanOutForm` — advanced section (timeout, maxConcurrent, continueOnError) | PASS | Collapsible `showAdvanced` gate |
| `ParallelFanOutForm` — dynamic branch source section | FAIL | Not implemented |
| `saveBuilder` validates `branches >= 2` | PASS | |
| `saveBuilder` validates `mergeStrategy` enum (4 values) | PASS | |
| `saveBuilder` validates `mergePrompt` required for `custom_prompt` | PASS | |
| `saveBuilder` validates `maxConcurrent` 1-10 | PASS | |
| `saveBuilder` validates `timeoutMs` 1000-600000 | PASS | |
| `saveBuilder` cross-validates `branch.targetNodeId` against sibling nodes | FAIL | Not implemented — HIGH finding |
| `saveBuilder` rejects circular self-reference (`targetNodeId == node.id`) | FAIL | Not implemented — HIGH finding |
| `ExecutionContext.clone()` deep-copies `results`, `knowledge`, `history` | PASS | `copy.deepcopy()` used correctly |
| `ExecutionContext.clone()` shares `shared_context` (AgencyRunContext) | PASS | Shallow reference |
| `ExecutionContext.clone()` initializes fresh `step_attempts` | PASS | |
| `_execute_node()` dispatches `parallel_fan_out` and returns early | PASS | Line 311-313; excluded from edge-follow at line 330 |
| `_execute_parallel_fan_out()` clamps `maxConcurrent` to 10 | PASS | `min(cfg.get("maxConcurrent", 5), 10)` |
| `_execute_parallel_fan_out()` semaphore controls concurrency | PASS | `asyncio.Semaphore(max_concurrent)` |
| `_execute_parallel_fan_out()` per-branch `asyncio.wait_for` timeout | PASS | `asyncio.TimeoutError` caught and converted to error string |
| `_execute_parallel_fan_out()` `continueOnError=False` propagates exception | PASS | `raise` in `except Exception` block when `not continue_on_error` |
| `_execute_parallel_fan_out()` `wait_all` merge with branch labels | PASS | Formatted with `**label**:` markers |
| `_execute_parallel_fan_out()` `first_complete` uses `asyncio.wait(FIRST_COMPLETED)` and cancels pending | PASS | Lines 800-813 |
| `_execute_parallel_fan_out()` `majority` vote by string equality | PASS | `Counter` on valid (non-error) results |
| `_execute_parallel_fan_out()` `custom_prompt` calls LLM, falls back on error | PASS (with LOW caveat) | Uses wrong gateway URL — see LOW finding |
| `_execute_parallel_fan_out()` dynamic branch resolution, capped at 10 | PASS | `items[:10]` |
| `_execute_parallel_fan_out()` credit tracking with `branch_id` labels | PASS | `step_attempts` merged back to parent |
| Budget exceeded mid-branch cancellation | FAIL | `ctx.budget_exceeded` flag not implemented; no cancellation between branches |
| `parallel_fan_out` added to `AGENT_NODE_TYPES` exclusion (orchestrator activation) | PASS | Node type not in `AGENT_NODE_TYPES` — orchestrator correctly triggered |
| Vitest: branches >= 2 | PASS | |
| Vitest: mergeStrategy enum | PASS | |
| Vitest: maxConcurrent 1-10 | PASS | |
| Vitest: mergePrompt required for custom_prompt | PASS | |
| Vitest: timeoutMs bounds | PASS | |
| Vitest: branch targetNodeId cross-validation | FAIL | Test absent — MEDIUM finding |
| pytest: wait_all merges all branches | PASS | |
| pytest: first_complete returns on first completion | FAIL | Test absent — MEDIUM finding |
| pytest: custom_prompt calls LLM Gateway | FAIL | Test absent — MEDIUM finding |
| pytest: timeout per branch enforced | PASS | |
| pytest: continueOnError=true continues past failure | PASS | |
| pytest: continueOnError=false propagates exception | FAIL | Test absent — MEDIUM finding |
| pytest: maxConcurrent clamped at 10 | PASS | |
| pytest: credits tracked per branch with branch_id | PASS | |
| pytest: ExecutionContext.clone() deep-copies results | PASS | |
| pytest: budget exceeded cancels remaining branches | FAIL | Test absent AND feature not implemented — MEDIUM finding |

---

### Summary

The core parallel fan-out implementation is structurally sound: `asyncio.gather` with semaphore-based concurrency control, `asyncio.wait(FIRST_COMPLETED)` for the `first_complete` strategy, all four merge strategies implemented, per-branch `ExecutionContext.clone()` with correct deep-copy semantics, and credit tracking via `branch_id` labels all work as specified. The frontend card and property panel are complete and match the spec's visual requirements with the exception of the dynamic branch source UI section.

Three correctness gaps block approval: `saveBuilder` does not cross-validate `branch.targetNodeId` against the agency's node list (letting invalid targets save silently), the circular self-reference guard is absent, and budget-exceeded mid-branch cancellation is entirely unimplemented despite being a spec requirement. The `custom_prompt` merge also opens a fresh `httpx.AsyncClient` per call and calls the wrong internal gateway URL.

Four of 11 specified pytest cases are missing — particularly the `first_complete` and `continueOnError=false` paths, which cover the two execution branches that differ most from the default `asyncio.gather` path.
