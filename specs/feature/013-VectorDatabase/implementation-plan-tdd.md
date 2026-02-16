# Implementation Plan (TDD): Vector Database Productionization (Feature 013)

Date: 2026-02-16
Primary Inputs: `implementation-plan.md`, `research-notes.md`, `interview-notes.md`

## Test Execution Conventions
- Node/API tests: `npm --workspace @smartspec/web test`
- Python worker tests: `cd python-backend && pytest`
- DB integration checks (when needed): `npm --workspace @smartspec/web run test:db-integration`

## 1. Delivery Strategy
Test stubs to enforce phased delivery safety before implementation begins.
- Test stub: phase gate fails when provider abstraction contract tests are red.
- Test stub: phase gate blocks cutover logic unless reindex readiness tests exist.
- Test stub: phase gate blocks pgvector rollout unless migration verification suite exists.

Verification criteria:
- Every planned phase has at least one automated test gate.
- CI task ordering ensures core safety suites execute before deployment-oriented suites.

## 2. Phase Plan

### Phase A: Provider Abstraction and Routing
Write these tests first:
- Test stub: provider resolver returns active provider from effective vectordb settings.
- Test stub: provider resolver falls back deterministically when config is partially missing.
- Test stub: abstraction dispatches `index`, `delete`, and `search` to selected adapter only.
- Test stub: adapter contract conformance for Vectorize, pgvector, and Chroma (shape, error normalization).
- Test stub: provider capability metadata includes dimensions/filter limits and rejects invalid requests.

Verification criteria:
- Search/index entrypoints never call provider-specific clients directly after refactor.
- Unsupported capability paths return controlled, test-covered errors.

### Phase B: Async Indexing Integration (Celery Primary)
Write these tests first:
- Test stub: gallery create/update/delete flows enqueue job payload with tenant/domain/operation/dedupe fields.
- Test stub: library create/upload/delete flows enqueue equivalent payload schema.
- Test stub: ingestion path writes enqueue payload with source metadata when library artifacts are produced.
- Test stub: worker handler is idempotent (duplicate job key does not create duplicate vectors).
- Test stub: retry path preserves payload integrity and increments retry metadata.
- Test stub: dead-letter path is hit after terminal retry exhaustion and event is auditable.
- Test stub: backpressure policy throttles enqueue when lag/failure thresholds exceed configured bounds.

Verification criteria:
- Payload parser remains backward compatible with legacy in-flight job versions.
- Retry and terminal-failure behaviors are deterministic and observable.

### Phase C: Provider Switch and Staged Cutover
Write these tests first:
- Test stub: switch request validates target connectivity before campaign start.
- Test stub: read provider remains old provider during backfill until readiness gate passes.
- Test stub: readiness gate `coverage_95_plus_smoke` fails when any required metric is below threshold.
- Test stub: cutover toggles read provider only after readiness gate success.
- Test stub: rollback triggers fire on either failure-rate breach or search regression.
- Test stub: cutover governance rejects non-emergency config edits during active cutover window.
- Test stub: optimistic-lock/version guard rejects stale switch-state writes.
- Test stub: reconciliation pass detects and reports mirrored-write drift before cutover approval.

Verification criteria:
- Provider state transitions are monotonic and replay-safe.
- Concurrent admin edits cannot silently override campaign state.

### Phase D: pgvector Single-DB Migration + RLS
Write these tests first:
- Test stub: migration installs/validates `vector` extension and required tables/indexes.
- Test stub: migration verification fails fast when extension privileges are missing.
- Test stub: RLS allow-case queries succeed for same-tenant data.
- Test stub: RLS deny-case queries reject cross-tenant read/write/update/delete attempts.
- Test stub: migration rollback script restores pre-migration schema state when verification fails.

Verification criteria:
- Extension/index/policy checks are automated and repeatable.
- Tenant isolation negative tests pass for each CRUD operation type.

### Phase E: Backfill and Reindex Operations
Write these tests first:
- Test stub: backfill loader emits scoped gallery/library records only.
- Test stub: campaign progress counters (`queued/processed/succeeded/failed/skipped`) update atomically.
- Test stub: resumable campaign restarts from persisted cursor without duplicate vector writes.
- Test stub: post-backfill consistency check fails when source-vs-vector counts diverge beyond tolerance.

Verification criteria:
- Campaign resume logic is deterministic across process restarts.
- Data consistency checks produce actionable mismatch diagnostics.

### Phase F: Observability and Admin Operations
Write these tests first:
- Test stub: vector audit event records operation type, tenant, provider, outcome, and correlation ids.
- Test stub: admin health endpoint returns provider status, queue lag, campaign progress, and recent failures.
- Test stub: alert policy emits on queue lag >10m/15m window.
- Test stub: alert policy emits on indexing failure rate >5% over rolling 30m.
- Test stub: alert policy emits on search latency p95 >1.5x baseline for 15m.
- Test stub: admin settings response masks credentials while preserving connection status signals.

Verification criteria:
- Required observability metrics are queryable and alertable.
- Admin diagnostics expose health without leaking secrets.

## 3. Impact Map (Regression-Sensitive Areas)
Write these tests first:
- Test stub: search API continues returning stable response contract during provider transition.
- Test stub: gallery CRUD latency budget does not regress beyond threshold after enqueue hooks.
- Test stub: library worker can consume both legacy and new payload versions.
- Test stub: admin settings cache invalidation updates provider state consistently after save/switch.

Verification criteria:
- High-risk integration boundaries have targeted regression coverage.

## 4. Regression Prevention Strategy
Write these tests first:
- Test stub: feature flag disables new provider dispatch while preserving existing behavior.
- Test stub: canary tenant cohort routing applies only to selected cohort.
- Test stub: post-deploy checklist query detects queue lag/dead-letter/search-latency anomalies.

Verification criteria:
- Rollout controls are test-verified prior to production enablement.

## 5. Data Safety Strategy

### Risk Classification
Write these tests first:
- Test stub: high-risk classification is enforced when provider switch + reindex path is enabled.

Verification criteria:
- Deployment workflow requires explicit acknowledgment of high-risk path.

### Pre-Migration Backup Plan
Write these tests first:
- Test stub: pre-migration backup job creates snapshot artifacts before pgvector schema changes.
- Test stub: settings snapshot is persisted before cutover campaign begins.

Verification criteria:
- Migration/cutover cannot start without backup snapshot success signal.

### Preflight Checklist (Required Before Migration/Cutover)
Write these tests first:
- Test stub: preflight fails when extension privileges are absent.
- Test stub: preflight fails when DB capacity headroom check is below configured floor.
- Test stub: preflight fails when RLS dry-run deny-case unexpectedly allows cross-tenant access.
- Test stub: preflight fails when provider health checks or smoke harness are unavailable.

Verification criteria:
- Every preflight checkpoint is machine-verifiable and blocking.

### Restore/Rollback Runbook
Write these tests first:
- Test stub: rollback flow resets read provider to previous stable value.
- Test stub: rollback pauses campaign writes to failing target provider.
- Test stub: rollback verification confirms queue error rate normalization and tenant isolation.
- Test stub: rollback verification checks vectordb config snapshot/version/hash parity with baseline.

Verification criteria:
- Rollback is automatable and validates both data-plane and control-plane correctness.

### Non-Destructive Migration-First Approach
Write these tests first:
- Test stub: expand phase adds schema/provider plumbing without disabling old read path.
- Test stub: migrate/backfill phase keeps mirrored writes active and reports drift.
- Test stub: contract phase is blocked until stability-window checks pass.

Verification criteria:
- Contract/cleanup changes are impossible before stability criteria pass.

### Automated Migration/Backfill Checks
Write these tests first:
- Test stub: extension/schema existence check suite passes on expected DB state and fails on missing objects.
- Test stub: coverage accounting computes per-tenant and per-domain totals correctly.
- Test stub: parity evaluator compares representative query corpus against baseline provider thresholds.

Verification criteria:
- Automated checks catch structural drift and relevance regressions before cutover.

## 6. Compatibility Notes
Write these tests first:
- Test stub: Cloudflare Vectorize legacy behavior remains intact through abstraction layer.
- Test stub: in-flight legacy job payloads are parsed successfully during transition period.
- Test stub: unsupported provider-specific features degrade with explicit, stable error semantics.

Verification criteria:
- Client-visible API contracts remain stable unless versioned explicitly.

### Provider Capability Compatibility Matrix
Write these tests first:
- Test stub: dimension validation rejects incompatible index/model combinations.
- Test stub: tenant-filter behavior is enforced consistently for each provider adapter.
- Test stub: topK clamping applies to provider-safe bounds.
- Test stub: metadata filter behavior works for indexed/unsupported cases with explicit fallback.

Verification criteria:
- Capability normalization is enforced at service boundary for all providers.

## 7. Test and Verification Plan

### Unit Coverage Priorities
Write these tests first:
- Test stub: resolver picks provider from settings + cutover state.
- Test stub: each adapter satisfies normalized contract for success/error paths.
- Test stub: queue dedupe/idempotency keys are stable across retries.

Verification criteria:
- Critical pure-logic modules meet unit coverage targets.

### Integration Coverage Priorities
Write these tests first:
- Test stub: gallery create -> indexed -> searchable end-to-end.
- Test stub: gallery delete -> vector removed from search results.
- Test stub: library upload -> indexed -> searchable.
- Test stub: library delete -> vector removed.
- Test stub: provider switch campaign reaches gate and cuts over reads.
- Test stub: rollback executes correctly for both trigger classes.
- Test stub: cross-tenant search queries cannot access other-tenant vectors.

Verification criteria:
- All v1 acceptance paths and failure paths are covered by integration tests.

### Operational Validation
Write these tests first:
- Test stub: staging reindex dry-run reaches target coverage within expected window.
- Test stub: provider outage simulation during campaign triggers alerts + rollback handling.
- Test stub: cutover rehearsal + rollback drill complete with no residual state drift.

Verification criteria:
- Staging rehearsal evidence exists for both steady-state and failure scenarios.

## 8. Execution Order and Dependencies
Write these tests first:
- Test stub: dependency guard blocks queue schema rollout before abstraction foundation tests pass.
- Test stub: dependency guard blocks cutover logic before migration and backfill validation suites pass.

Verification criteria:
- Implementation order is enforceable through failing tests when prerequisites are unmet.

## 9. Ownership and Operational Readiness
Write these tests first:
- Test stub: ownership map validation ensures every alert/checklist item has an assigned team.
- Test stub: on-call runbook link/metadata is present for switch, rollback, and migration incidents.

Verification criteria:
- Operational responsibilities are explicit and test-auditable.

## 10. Done Criteria
Write these tests first:
- Test stub: v1 domain auto-indexing acceptance tests pass for gallery and library.
- Test stub: deletion acceptance tests confirm removed content is not searchable.
- Test stub: provider switch acceptance test enforces `coverage_95_plus_smoke` gate.
- Test stub: rollback acceptance test verifies either-trigger behavior.
- Test stub: pgvector + RLS acceptance tests pass on primary DB.
- Test stub: observability acceptance checks confirm required health/alert signals are present.

Verification criteria:
- Feature is complete only when all done-criteria acceptance stubs are implemented and passing.
