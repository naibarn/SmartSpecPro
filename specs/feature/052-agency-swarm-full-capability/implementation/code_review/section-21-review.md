# Section 21 — Error Handler & Data Transform Nodes
## Code Review Report

**Reviewer:** CMD-8 SmartSpecPro Reviewer Agent
**Date:** 2026-03-23
**Spec:** `specs/feature/052-agency-swarm-full-capability/sections/section-21-error-handler-data-transform.md`
**Diff:** `specs/feature/052-agency-swarm-full-capability/implementation/code_review/section-21-diff.md`

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `apps/web/shared/agencyStreamEvents.ts` — entire file | `error_handled` event type is emitted by the Python orchestrator and both error handler modules, but is **never registered** in `agencyStreamEvents.ts`. `AGENCY_STREAM_EVENT_TYPES` does not include `"error_handled"`, `AgencyStreamEvent` has no `AgencyErrorHandledEvent` interface, and `parseAgencyStreamEvent()` returns `null` for it. Every retry/fallback/skip/terminate SSE notification is silently dropped on the frontend. | Add `AgencyErrorHandledEvent` interface (matching the spec shape: `nodeName`, `watchedNodeName`, `strategy`, `attempt?`, `errorSummary`, `timestamp`), add it to `AgencyStreamEvent` union, and add `"error_handled"` to `AGENCY_STREAM_EVENT_TYPES`. |
| HIGH | `apps/web/server/routers/agency.ts:1248–1268` | `watchedNodeIds` cross-validation against submitted agent IDs is absent. The `superRefine` block checks that `watchedNodeIds` is a non-empty array but never verifies each ID exists in `input.agents`. This is the same gap flagged in section-17 and section-18. An error_handler watching a non-existent node silently saves, builds an `error_handler_map` entry with a dead key, and the guard is never triggered at runtime. | Inside the `error_handler` superRefine block, collect `new Set(input.agents.map(a => a.id))` (the outer `input` is accessible via closure in the per-element `.superRefine`). Note: the per-element superRefine only receives `data` (the single agent object) — the cross-check must be moved to the top-level array `.superRefine` where `input.agents` is accessible, following the same pattern as section-17's `defaultTargetNodeId` fix. Similarly, `fallbackNodeId` cross-validation is also missing. |
| HIGH | `python-backend/app/services/agency_orchestrator.py:1293–1298` | Retry executor selection is incorrect for non-agent node types. `_handle_error` passes `self._execute_agent_node` for agent/supervisor nodes and `self._execute_node` for all others. However `_execute_node` is the full dispatcher that includes the new `try/except` error-interception wrapper — retrying via `_execute_node` on the same watched node will re-enter the error interception path and call `_handle_error` recursively if the node fails again. This can cause unbounded recursion during retry exhaustion (each retry triggers a new handler dispatch). | Pass `self._execute_node_inner` (the unwrapped inner dispatch logic) for retry, or strip the error wrapper before retrying by calling the specific node handler directly. The cleanest fix: extract the inner `match node_type:` block into a separate `_dispatch_node(node, ctx)` method and have retry call that instead of `_execute_node`. |
| HIGH | `python-backend/tests/unit/test_agency_error_handler.py` — missing | Spec requires 8 pytest tests; 2 are absent: **(1)** `error_handler_map built at graph load time` (construct a full `AgencyOrchestrator` with an error_handler node and assert `error_handler_map` keys) and **(2)** `error interception wraps watched node execution` (end-to-end test mocking `_execute_agent_node` to raise, verifying skip result in `ctx.results`). The `execute_retry` tests use `backoffMs=1` to avoid real sleep but never assert delay timing even approximately — the spec requires verifying the exponential pattern. | Add the two missing orchestrator-level tests. Add a test that patches `asyncio.sleep` with `AsyncMock` and asserts the call arguments match `100/1000=0.1s` and `200/1000=0.2s` for the default multiplier. |
| HIGH | `apps/web/server/routers/agency.ts` — no Vitest test file in diff | All 6 spec-required Vitest `saveBuilder` validation tests are absent. No test file for section-21 appears in the diff (no `section-21` or `error_handler`/`data_transform` test file). The contract coverage is zero at the TypeScript layer. | Create `apps/web/server/agency.section21.test.ts` with the 6 tests from the spec: watchedNodeIds references non-existent node, maxRetries > 5 rejected, fallback requires fallbackNodeId or fallbackMessage, invalid transformMode rejected, valid error_handler accepted, valid data_transform accepted. |
| MEDIUM | `python-backend/app/services/agency_error_handler.py:912–925` | `execute_fallback` emits the SSE event with `nodeName: "fallback"` hardcoded, losing the actual failed node name. The spec's `ErrorHandledEvent` shape requires `nodeName` (the failed node) and `watchedNodeName` (the node being watched) to be distinct fields. All three SSE-emitting call sites in `_handle_error` (fallback, skip, terminate) pass `failed_name` correctly, but `execute_fallback` itself has the hardcoded literal. | Change `execute_fallback` signature to accept `failed_node_name: str` (or pass it through the `emitter` call from `_handle_error` instead of inside `execute_fallback`). The simplest fix: remove the `emitter.emit` call from `execute_fallback` entirely and have `_handle_error` emit it uniformly for all strategies (as it already does for skip/terminate). |
| MEDIUM | `python-backend/app/services/agency_orchestrator.py:1136` | Multiple registered handlers are silently ignored. `error_handler_map` is a `dict[str, list[NodeRow]]` — multiple error handlers can watch the same node — but `_execute_node` only ever dispatches to `handlers[0]`. The spec does not prohibit multiple handlers on the same node, and the data model supports it. If a second handler uses a different strategy (e.g., handler-1: retry, handler-2: terminate), only handler-1 is applied. | Either document this as intentional (only first handler wins, UX enforces single handler per node), or iterate through handlers in priority order. At minimum, log a warning if `len(handlers) > 1`. |
| MEDIUM | `python-backend/app/services/agency_data_transform.py:696–701` | `apply_template` imports `pystache` inside the function body. If `pystache` is not installed (e.g., fresh environment without `pip install pystache`), this raises `ImportError` at call time — not at startup — and the error propagates as an unhandled exception rather than a descriptive error string. The `except Exception` on line 700 will catch it only if the import itself is wrapped in try/except; currently the import is *outside* the try block at line 697. | Move `import pystache` to the top of the file (module-level) alongside the other imports, so the missing dependency is caught at import time with a clear `ModuleNotFoundError`. Alternatively, wrap the entire `try` block to include the import. Same applies to `jsonpath_ng` in `apply_jsonpath`. |
| MEDIUM | `python-backend/app/services/agency_data_transform.py:741–755` | `apply_filter` silently skips array items that are not `dict` (the `if not isinstance(item, dict): continue` branch on line 736). This is usually correct but gives no indication that non-dict items were dropped. If the entire array is non-dict (e.g., `[1, 2, 3]`), the result is an empty array `[]` with no error — indistinguishable from a legitimate zero-match filter. Callers cannot tell whether the transform produced zero matches or silently rejected all input. | Return a descriptive error string when _all_ items in the array are non-dict (e.g., `"Error: Filter requires an array of objects; received primitive values"`). |
| LOW | `python-backend/app/services/agency_error_handler.py:820–821` | SCRUB_PATTERNS does not cover `/var/`, `/tmp/`, `/usr/`, or `/root/` path prefixes — only `/home/` and `/app/` are matched. Container deployments with paths like `/var/task/app.py` (AWS Lambda) or `/tmp/cached_model.py` would leak file paths. The spec explicitly required generic filesystem path coverage. | Add `re.compile(r"/(?:var|tmp|usr|root|etc)/[^\s\"']+")` to `SCRUB_PATTERNS`, or use a broader pattern like `re.compile(r"/[a-z]+/[^\s\"']+(?:\.py|\.js|\.ts)")` to catch any absolute path to code files. |
| LOW | `apps/web/client/src/components/agency/nodes/ErrorHandlerNodeCard.tsx` | `ErrorHandlerNodeCard` has a Target handle (top) and Source handle (bottom), implying it sits in the normal sequential graph flow. However, per the spec and the orchestrator implementation, error handler nodes are NOT part of the normal graph traversal — they are side-channel nodes wired via `watchedNodeIds`, not via edges. The bidirectional handles mislead users into thinking they can chain flow through the error handler. | Consider using only a Source handle (or removing both), since error_handler nodes do not receive execution flow from an upstream edge. The dashed-edge rendering in AgencyBuilder.tsx (from error_handler to watchedNodeIds) is the correct visual representation per spec §7. The handles on the card contradict this intent. |
| LOW | `python-backend/tests/unit/test_agency_data_transform.py:1398–1408` | The `test_stores_output_key_in_context` test only asserts the return value of `execute_data_transform` — it does not actually verify that context storage (`ctx.shared_context.set()`) was called. The `outputKey` processing is done in `_execute_data_transform` in the orchestrator, not in `execute_data_transform` itself. The test's docstring acknowledges this but still passes `outputKey` in the config — which `execute_data_transform` ignores entirely. The test is a tautology as written. | Either: (a) remove `outputKey` from the config dict in this test (it tests nothing extra here), or (b) add an orchestrator-level integration test that verifies `ctx.shared_context.set()` is called when `outputKey` is set, mocking `_execute_data_transform`. |

---

### Contract Compliance

#### Python API Contracts
- [x] `scrub_error_payload()` strips all 5 required sensitive pattern categories (file paths, DB URLs, API keys, Bearer tokens, stack traces)
- [x] `MAX_RETRIES_CAP = 5` enforced server-side in `execute_retry`
- [x] `execute_retry` uses exponential backoff formula: `backoffMs * (backoffMultiplier ^ attempt) / 1000`
- [x] `execute_fallback` returns `(None, fallback_node_id)` or `(message, None)` — correct tuple contract
- [x] `execute_skip` returns message or default — correct
- [x] `execute_terminate` raises `RunTerminatedError` — correct
- [x] `apply_jsonpath` length guard at 500 chars — present
- [x] `apply_template` uses custom `_html_escape` function — correct (avoids triple-mustache)
- [x] `apply_filter` coerces `gt`/`lt` values to `float`, uses `str` for `equals`/`contains` — correct
- [ ] `execute_fallback` SSE event uses hardcoded `nodeName: "fallback"` — FAILS spec shape requirement
- [ ] `error_handled` event not registered in `agencyStreamEvents.ts` — FAILS frontend contract

#### tRPC Zod Validation
- [x] `nodeType` enum extended with `data_transform` and `error_handler` in both `createAgency` and `saveBuilder` schemas
- [x] `onError` validated as `retry | fallback | skip | terminate`
- [x] `retryConfig.maxRetries` validated as `<= 5` at the tRPC layer (defense in depth with Python cap)
- [x] `fallback` strategy requires `fallbackNodeId` OR `fallbackMessage` — correct OR logic
- [x] `transformMode` validated as `jsonpath | template | filter`
- [x] Mode-specific conditional validation present for all three transform modes
- [ ] `watchedNodeIds` not cross-validated against submitted agent IDs — FAILS spec §4
- [ ] `fallbackNodeId` not cross-validated against submitted agent IDs — FAILS spec §4
- [ ] 6 Vitest tests absent — FAILS spec verification checklist

#### Frontend Contracts
- [x] `AgencyNodeType` union updated with `"data_transform" | "error_handler"` in `types.ts`
- [x] `BaseAgencyNode.tsx` dispatches to new card components
- [x] `ErrorHandlerNodeCard` — red border, ShieldAlert icon, strategy badge, watched node count — matches spec §7
- [x] `DataTransformNodeCard` — slate border, Braces icon, mode badge, info line — matches spec §8
- [x] `ErrorHandlerForm` — watchableNodes excludes self and other error_handlers — correct
- [x] `ErrorHandlerForm` — retry/fallback/skip config sections conditional on strategy — correct
- [x] `DataTransformForm` — mode-conditional sections for jsonpath/template/filter — correct
- [x] `maxRetries` clamped to `Math.min(5, Math.max(1, Number(...)))` in UI — correct
- [ ] `error_handled` event not in `agencyStreamEvents.ts` — frontend drops all handler notifications

#### Auth & Tenant Isolation
- [x] No new tRPC procedures — error_handler and data_transform are node types within existing `saveBuilder`/`createAgency`, which use `protectedProcedure` and tenant-scoped validation — no isolation gap introduced
- [x] `_execute_data_transform` reads `self.edges` (bound to the loaded agency) — no cross-tenant edge leakage

#### Python Dependencies
- [x] `pystache>=0.6.0` added to `requirements.txt`
- [x] `jsonpath-ng` already present from section-17 — no duplicate added

---

### Summary

The core implementation is structurally sound: `agency_error_handler.py` and `agency_data_transform.py` are well-isolated pure-function modules with good error recovery, the orchestrator integration is clean, and the frontend card components correctly follow established patterns. However, five issues require fixes before merge: the `error_handled` SSE event is completely missing from the shared event registry (silently dropped by the frontend), `watchedNodeIds` and `fallbackNodeId` are not cross-validated against submitted node IDs at the tRPC layer (spec-required, same gap as sections 17-18), the retry executor dispatch creates a recursive interception risk via `_execute_node`, all 6 Vitest router tests are absent, and 2 of 8 spec-required pytest tests are missing. The data transform module has an additional risk: lazy imports inside function bodies will silently fail at runtime if `pystache` is not installed rather than at startup.
