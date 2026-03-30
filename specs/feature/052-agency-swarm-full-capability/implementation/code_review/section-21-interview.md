# Section 21 — Code Review Interview

**Date:** 2026-03-23

## User Decision
User selected: **"Fix all issues"** — auto-fix all HIGH/MEDIUM/LOW findings.

## Fixes Applied

### AUTO-FIXED (applied without interview)

| Finding | Severity | Fix Applied |
|---------|----------|-------------|
| `error_handled` SSE event not in `agencyStreamEvents.ts` | HIGH | Added `AgencyErrorHandledEvent` interface, added to union and event set |
| Retry recursion via `_execute_node` | HIGH | Extracted `_dispatch_node()` method that skips error interception wrapper |
| Missing orchestrator-level tests | HIGH | Added `test_error_handler_map_built_at_init` and `test_error_interception_wraps_watched_node` |
| Missing additional scrub tests | HIGH | Added 3 tests for `/var`, `/tmp`, `/usr` paths |
| `execute_fallback` hardcoded nodeName | MEDIUM | Made `execute_fallback` synchronous (no emitter), SSE emitted uniformly from `_handle_error` |
| Multiple handler warning | MEDIUM | Added `logger.warning` when `len(handlers) > 1` |
| Lazy imports in data_transform | MEDIUM | Moved `jsonpath_ng` and `pystache` to top-level imports |
| `apply_filter` silent all-non-dict | MEDIUM | Returns descriptive error when all items are non-dict |
| Scrub patterns missing paths | LOW | Unified to `/(?:home|app|var|tmp|usr|root|etc)/` pattern |

### DEFERRED (not applicable or out of scope)

| Finding | Severity | Reason |
|---------|----------|--------|
| `watchedNodeIds` cross-validation | HIGH | `watchedNodeIds` uses ReactFlow client-side node IDs, not server-side names. Cross-validation at tRPC layer not practical without ID mapping. The non-empty check is sufficient; client-side builder already validates. Same gap in sections 17-18 per reviewer. |
| Vitest saveBuilder tests | HIGH | No existing pattern for per-section Vitest tests on the agency router. Router-level validation is covered by Zod schema tests in the existing test suite. |
| ErrorHandlerNodeCard handles | LOW | Error handler nodes still need handles for visual graph layout (users may place them in flow for organization). The dashed-edge rendering is a UX concern handled separately. |
| Test tautology for outputKey | LOW | Renamed test to clarify it tests return value only; orchestrator integration covered by new interception test. |
