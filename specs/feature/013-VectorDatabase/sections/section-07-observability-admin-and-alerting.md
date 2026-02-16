# Section 07: Observability, Admin, and Alerting

## Objective
Provide operational visibility and controls required to run multi-provider vector indexing and cutover safely in production.

## Scope
- Emit vector audit events for index/delete/search/switch/reindex outcomes.
- Expose admin diagnostics for provider health, queue status, and campaign progress.
- Implement alert thresholds for queue lag, failure rates, and search latency regression.
- Ensure settings diagnostics mask secrets while preserving actionable health state.

## Out of Scope
- Core provider abstraction logic (Section 01).
- Final canary rollout checklist execution (Section 08).

## Dependencies
- section-02-api-enqueue-hooks-and-job-contract
- section-03-worker-dispatch-idempotency-and-retries
- section-06-staged-cutover-and-rollback-governance

## Implementation Tasks
1. Define audit event schema with tenant/provider/operation/outcome/correlation fields.
2. Instrument API and worker flows to emit audit records at critical boundaries.
3. Add admin-facing endpoints or service aggregators for provider, queue, and campaign status.
4. Implement alert evaluators for lag >10m/15m, failure-rate >5% over 30m, latency p95 >1.5x baseline for 15m.
5. Add credential-masking and capability diagnostic payloads in admin settings responses.
6. Ensure on-call runbook links/ownership metadata are associated with alerts.

## TDD-First Test Stubs
- Audit event records include required fields for each operation type.
- Admin health endpoint returns provider status, queue lag, campaign progress, and recent failures.
- Queue lag alert fires under threshold breach scenario.
- Failure-rate alert fires under rolling-window breach scenario.
- Latency regression alert fires when baseline factor threshold is exceeded.
- Admin settings responses mask credentials while exposing connection health.

## Risk Controls
- Make observability fields stable and versioned to avoid dashboard/runbook drift.
- Avoid leaking credentials or cross-tenant information in diagnostics.
- Ensure alert noise is bounded with clear trigger windows and ownership.

## Done Criteria
- Required audit trails and admin diagnostics are available.
- Alert policies are active and test-verified.
- Operational ownership for incidents is explicit and documented.
