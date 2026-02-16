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

## As-Built (2026-02-16)

### Actual files changed
- `python-backend/app/models/library.py`
- `python-backend/app/services/library_cutover_service.py`
- `python-backend/migrations/008_library_provider_switch_state.py`
- `python-backend/tests/unit/services/test_library_cutover_service.py`
- `python-backend/tests/unit/migrations/test_library_provider_switch_state_migration.py`
- `apps/web/server/__tests__/migrationOrdering.test.ts`
- `specs/feature/013-VectorDatabase/reviews/section-06-review.md`

### Deviations from plan
- Cutover governance is implemented as a Python service boundary with persistence and deterministic policy checks, but it is not yet wired to admin/router endpoints in this section.
- Readiness and rollback signals are service-level evaluators with explicit inputs; live telemetry feed integration is deferred to observability/admin work.

### Tests added/updated
- Added: `python-backend/tests/unit/services/test_library_cutover_service.py`
  - target connectivity precheck failure behavior
  - non-emergency edit freeze enforcement
  - optimistic-lock stale version rejection
  - readiness-gated read cutover sequencing
  - either-trigger rollback restoration (failure-rate/search regression)
  - reconciliation drift gate blocking
- Added: `python-backend/tests/unit/migrations/test_library_provider_switch_state_migration.py`
  - migration 008 contract coverage for switch-state persistence table
- Updated: `apps/web/server/__tests__/migrationOrdering.test.ts`
  - migration ordering now expects `008_library_provider_switch_state.py` as latest Python migration
  - validates migration 008 key schema markers

### Known follow-ups
- Integrate cutover service into runtime admin/API mutation handlers so governance is enforced on real provider switch operations.
- Add end-to-end cutover rehearsal tests against Postgres-backed state updates and real campaign telemetry.
