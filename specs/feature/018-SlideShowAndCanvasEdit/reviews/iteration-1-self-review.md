# Iteration 1 Self Review

Reviewed file: `implementation-plan.md`
Review mode: `self_review`
Date: `2026-02-22`

## High Severity Findings

### F1 - Export trigger abuse and duplicate enqueue risk
- severity: high
- impact: low-impact
- affected area: API behavior and operational stability (`3.3 Playback and Export`, `9 Operational Monitoring and Ownership`)
- rationale: The plan defines async export but does not explicitly require per-deck/user throttle and idempotent export trigger semantics. Rapid retries can flood queue capacity and create avoidable duplicate jobs.
- recommendation:
  - Add explicit export-trigger idempotency behavior (request key or dedupe window).
  - Add bounded per-user/per-deck enqueue rate limits and matching error contract.
  - Add tests for duplicate trigger retries and throttle responses.

## Medium Severity Findings

### F2 - Conflict payload evolution contract is implicit
- severity: medium
- impact: low-impact
- affected area: save conflict semantics (`3.2 Save and Conflict Semantics`, `8.1 Backend Tests`)
- rationale: Conflict responses are defined, but schema evolution/versioning is not explicit. Frontend handling can regress if payload evolves without compatibility signaling.
- recommendation:
  - Add explicit `conflict_schema_version` (or equivalent) in `409` contract.
  - Add compatibility test ensuring existing client parser behavior remains stable.

### F3 - Orphaned asset lifecycle checks are incomplete
- severity: medium
- impact: low-impact
- affected area: data consistency and cleanup (`5.5 Post-Migration Consistency Checks`, `8.3 Integration and Safety Checks`)
- rationale: Current checks validate references exist, but do not explicitly validate cleanup behavior for failed conversion/slide deletion flows.
- recommendation:
  - Add reconciliation rule for orphaned asset links and stale uploaded objects.
  - Add integration scenario for failed conversion rollback and slide delete cleanup.

## Low Severity Findings

### F4 - Permission drift regression scenario should be explicit
- severity: low
- impact: low-impact
- affected area: compatibility and security regression coverage (`4.3 Regression Prevention Strategy`, `8.3 Integration and Safety Checks`)
- rationale: Tenant isolation is covered, but lifecycle transitions (soft-delete/restore) can introduce subtle permission drift in editor/export endpoints.
- recommendation:
  - Add regression scenario for soft-deleted or restored library items to confirm expected deny/allow behavior for presentation routes.
