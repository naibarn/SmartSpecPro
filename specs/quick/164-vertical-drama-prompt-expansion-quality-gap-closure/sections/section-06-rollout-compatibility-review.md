# Section 06: Rollout, Compatibility, and Final Review

## Objective

Release the contract repair safely and close the implementation loop against
all requirements, including legacy data and release-only boundaries.

## Owned paths

- feature flag/config location discovered during implementation
- migration and migration test only if section 03 proves it necessary
- planning/review evidence; no unrelated cleanup

## Implementation contract

Use the existing prompt-expansion flag if present; otherwise add a narrowly
scoped default-off flag. Keep legacy v1 runs readable, but do not re-enable the
old fallback behavior. If a migration is required, make it additive, run
migration-state checks, and verify before/after row counts and JSON readability.
Do not deploy or mutate production as part of local implementation without an
explicit release scope.

Review the final diff against every acceptance criterion: no false success,
distinct treatment/Draft contracts, profile-specific gates, stale/tenant/CAS
safety, bounded retry/credit semantics, UI accessibility/responsiveness,
privacy-safe telemetry, real-LLM smoke evidence, focused tests, and browser
proof.

## TDD stubs

Test flag-off legacy behavior, flag-on v2 flow, legacy run adaptation, migration
presence/absence handling, and release checklist evidence. Verify no unrelated
dirty files were changed.

## Completion gate

All implementation and focused proof gates pass. Remaining items are explicitly
classified as deployment/live-provider/authenticated-production release gates,
not hidden implementation gaps.
