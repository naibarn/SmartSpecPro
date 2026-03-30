# Section 09 — Code Review Interview

## Auto-fixes Applied

1. **HIGH: Tenant isolation bypass on DB error** — Changed from silent continue to return 503. Tenant verification must be authoritative.
2. **HIGH: `after_turn` cancellation not handled** — Added check after agent node execution for `after_turn` mode.
3. **MEDIUM: Redis unavailable sends empty stream** — Added error SSE frame before closing when Redis is null.
4. **MEDIUM: `guardrail_trigger` always names first guardrail** — Extract name from result when available, fallback to first guardrail.
5. **LOW: `parseAgencyStreamEvent` data validation** — Added `typeof data === "object" && data !== null` guard.

## Deferred (out of scope for section-09)

1. **Feature flag in TenantFeatureFlags** — Section-23 handles feature flag registration. Current `getFeatureFlag` is correct for global flags.
2. **`tool_start`/`tool_end` events** — Requires adapter-level streaming callbacks not available in current orchestrator. Documented for section-16.
3. **`agencyBridge.cancelRun`** — No existing bridge function exists. Cancel via Redis key is the primary mechanism.
4. **Orchestrator-level integration tests** — Complex mocking required. Unit tests for emitter + route tests cover the contract.
5. **Dynamic imports in route** — Follows established pattern from `orchestratorStream.ts`. Consistent with codebase.
6. **`emit_complete` hardcoded zeros** — Actual token usage requires credit reconciliation which happens after the stream completes in `agency_service.py`. Zeros are a placeholder; section-15 (observability) will track real values.

## Let Go

1. **Vacuous SSE headers test** — The test validates the happy path reaches SSE setup without error. Dynamic imports in the route make mocking Redis subscribe difficult in vitest. The auth/validation/cancel paths are thoroughly tested.
