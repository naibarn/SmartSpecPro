# Vector DB Rollout Canary Runbook

Date: 2026-02-16
Feature: `013-VectorDatabase`

## Scope
- Validate staged provider rollout safety across indexing, search, and cutover controls.
- Define canary gates and rollback triggers before broad enablement.

## Canary Cohorts
1. Cohort A (internal/sandbox tenants): 5-10% traffic.
2. Cohort B (low-risk production tenants): 25% traffic.
3. Cohort C (broad production): 100% traffic only after all gates pass.

## Entry Preconditions
- `coverage_95_plus_smoke` gate passing for target provider.
- No unresolved reconciliation drift in mirrored-write checks.
- Queue lag and failure-rate baselines collected for previous stable provider.

## Gate Checklist (per cohort)
1. Indexing throughput stable and queue lag <= 10 minutes.
2. Indexing failure rate <= 5% over rolling 30 minutes.
3. Search latency p95 <= 1.5x baseline for rolling 15 minutes.
4. Dead-letter growth stable (no rapid increase within observation window).
5. Tenant isolation negatives remain passing.

## Rollback Triggers
- Indexing failure-rate breach (`>5%` over rolling 30 minutes).
- Search regression detected (quality mismatch or latency factor `>1.5x` baseline).

## Rollback Procedure
1. Set read provider back to previous stable provider.
2. Keep mirrored writes enabled until reconciliation confirms no data loss.
3. Pause new cutover changes and capture incident diagnostics.
4. Re-run smoke + tenant isolation checks on restored provider.
5. Record root cause and remediation before retrying rollout.

## Ownership
- Primary on-call: `vector-oncall`
- Runbook escalation path: `https://runbooks.smartaihub.app/vector`
