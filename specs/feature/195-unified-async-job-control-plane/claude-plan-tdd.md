# Feature 195 TDD Plan

Tests are written before production changes and run with `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --workspace apps/web run test -- <focused files>`. Database tests use the repository’s existing opt-in integration conventions. Whole-repository typecheck is excluded.

## section-01-contracts

Test legal/illegal lifecycle transitions, terminal immutability, idempotency scope, tenant authorization, retry classification and stale fence rejection.

## section-02-persistence

Test additive migration SQL, required indexes/unique constraints, nullable backfill, append-only events and no destructive SQL.

## section-03-publication-and-capacity

Test atomic Job+outbox admission, publication retry/reconciliation, redacted envelopes, capacity races, fair lanes, reservation release and DLQ classification.

## section-04-lifecycle-and-control

Test claim/heartbeat/expiry/fencing, cancel/pause/resume/steer races, child lineage/budgets, approval propagation, compensation and quality-gate terminal semantics.

## section-05-monitoring-and-integrations

Test monitor projections, pagination, event hydration, reconnect, truthful unknown/degraded states and contract adapters for 196/197/198/199/200.

## section-06-migration-and-release-gates

Test mixed-version envelopes, replay/restore fixture, retention/redaction, SLO/degraded gates and cross-spec contract matrix.

