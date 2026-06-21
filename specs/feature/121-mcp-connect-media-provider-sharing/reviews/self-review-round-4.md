# Self Review Round 4: Ops And Recovery Readiness

## Review Focus

Reviewed the plan for operational rollout ownership, server-side flag enforcement, async recovery, idempotency, and alignment with existing media guard/limiter patterns.

## Findings Fixed

1. Admin/ops rollout ownership needed to be explicit.
   - Added that v1 uses existing tenant feature flags/admin configuration and does not add a new admin UI.
   - Clarified global, provider, surface, and group-sharing disable behavior.
   - Added tests that disabling group sharing preserves owner connections and personal eligibility.

2. MCP async job recovery was under-specified.
   - Added recovery/idempotency requirements for provider job IDs, tool/schema metadata, attempt counts, next poll hints, and local idempotency keys.
   - Added behavior for restart before/after provider execution and safe `provider_status_unknown` failure.
   - Added tests for restart polling, duplicate `tools/call` prevention, and bounded unrecoverable status.

3. Existing media safety controls needed to be carried into MCP.
   - Added requirements to apply existing abuse guard, prompt hashing, SSRF/reference validation, and provider/media rate limiting before MCP provider execution.
   - Added test coverage expectation for those safety checks.

## Verification

- `check-sections.py`: complete, 9/9 sections.
- `check-ui-contracts.py`: passed, 9 UI-affecting section files checked.
- Placeholder and open-item scan: clean.

## Residual Risk

No blocking plan gaps remain. Implementation must inspect the exact current media polling and rate limiter entry points before wiring MCP recovery into the existing async boundary.
