# Review Integration Notes

Source summary: `reviews/iteration-1-summary.md`
Decision mode: `smart_auto`
Date: `2026-02-22`

## Accepted Suggestions

### F1 - Export trigger abuse and duplicate enqueue risk
- decision: accepted
- decision_mode: auto
- rationale: High severity but implementation impact is low because the plan already routes export through centralized job enqueue; adding dedupe/throttle policy is additive hardening.
- applied changes:
  - Added export-trigger idempotency/dedupe requirement.
  - Added per-user/per-deck enqueue throttle requirement.
  - Added test and monitoring requirements for duplicate suppression and throttle events.

### F2 - Conflict payload evolution contract is implicit
- decision: accepted
- decision_mode: auto
- rationale: Low-risk plan clarification with clear compatibility benefit for frontend conflict handlers.
- applied changes:
  - Added `conflict_schema_version` to `409` response requirements.
  - Added compatibility contract tests for stable parser fields.

### F3 - Orphaned asset lifecycle checks are incomplete
- decision: accepted
- decision_mode: auto
- rationale: Additive data-integrity safeguard that reduces cleanup regressions without altering architecture.
- applied changes:
  - Added explicit consistency checks for orphaned asset links and stale uploaded objects.
  - Added lifecycle cleanup integration scenario for failed conversion/slide delete paths.

### F4 - Permission drift regression scenario should be explicit
- decision: accepted
- decision_mode: auto
- rationale: Extends existing tenant-isolation validation to lifecycle edges and improves regression confidence.
- applied changes:
  - Added soft-delete/restore presentation access regression scenario in tests.

## Rejected Suggestions
- None.

## Deferred Suggestions
- None.
