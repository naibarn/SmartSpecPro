# Section 06: Staged Cutover and Rollback Governance

## Objective
Implement controlled provider switching with readiness gating, drift reconciliation, and automated rollback triggers to prevent search quality/availability regressions.

## Scope
- Introduce switch-state model (`current_read_provider`, `target_provider`, campaign status/version).
- Enforce governance during active cutover (freeze non-emergency edits, optimistic-lock state updates).
- Define write policy during migration window (mirrored writes and reconciliation workflow).
- Enforce readiness gate `coverage_95_plus_smoke` before read cutover.
- Implement rollback triggers (`either`: indexing failure-rate breach OR search regression).

## Out of Scope
- Queue payload generation (Section 02).
- Alert endpoint/UI surface details (Section 07).

## Dependencies
- section-03-worker-dispatch-idempotency-and-retries
- section-04-pgvector-migration-and-tenant-rls
- section-05-backfill-reindex-and-consistency

## Implementation Tasks
1. Define switch-state persistence model and version-checked update flow.
2. Implement cutover initiation prechecks (target provider health/connectivity, campaign prerequisites).
3. Keep old read provider active through backfill; ensure mirrored writes are active until gate passes.
4. Add reconciliation step to detect/resolve drift before readiness evaluation.
5. Implement readiness gate evaluator combining coverage, smoke tests, and parity thresholds.
6. Implement rollback orchestrator for either-trigger conditions with restore verification steps.

## TDD-First Test Stubs
- Switch request fails when target connectivity check fails.
- Non-emergency config edits are blocked during active cutover.
- Optimistic-lock/version guard rejects stale concurrent updates.
- Read provider remains old provider until readiness gate passes.
- Readiness gate fails when any threshold is below required minimum.
- Either rollback trigger initiates rollback flow and restores stable provider state.
- Reconciliation detects mirrored-write drift before cutover approval.

## Risk Controls
- Treat cutover decision as high-impact and enforce hard, test-backed gates.
- Keep rollback path hot and rehearsed before production cutover.
- Prevent state drift from concurrent admin updates through version checks.

## Done Criteria
- Cutover only occurs after `coverage_95_plus_smoke` passes.
- Either rollback trigger path is automated and verified.
- Switch-state transitions are monotonic, auditable, and concurrency-safe.
