# Section 05: Backfill, Reindex, and Consistency

## Objective
Replace stubbed reindex workflows with production-capable, resumable campaigns that backfill gallery/library vectors, track progress, and enforce post-run consistency guarantees.

## Scope
- Implement scoped loaders for gallery and library source records.
- Implement campaign model/state for `queued`, `processed`, `succeeded`, `failed`, `skipped` counters.
- Add resumable execution with persisted cursor/checkpoint strategy.
- Add dedupe protections to avoid duplicate vectors during resume/retry.
- Add post-campaign source-vs-vector consistency checks and discrepancy reporting.

## Out of Scope
- Read-provider switch policy and rollback triggers (Section 06).
- Admin dashboards/alerts (Section 07).

## Dependencies
- section-02-api-enqueue-hooks-and-job-contract
- section-03-worker-dispatch-idempotency-and-retries
- section-04-pgvector-migration-and-tenant-rls

## Implementation Tasks
1. Build backfill record selection queries/loaders for gallery and library domains.
2. Define campaign persistence model and progress-update semantics.
3. Implement resumable processing that restarts from last successful checkpoint.
4. Apply dedupe keys and idempotent writes to prevent duplicate vectors.
5. Implement consistency validator comparing source counts against indexed vector counts by tenant/domain.
6. Emit campaign-level diagnostics for mismatches and unresolved failures.

## TDD-First Test Stubs
- Scoped loaders include intended domains only.
- Progress counters update atomically and accurately.
- Resume behavior restarts from checkpoint without duplicate writes.
- Dedupe/idempotency is preserved during retries and restarts.
- Consistency check fails with actionable diagnostics when divergence exceeds tolerance.

## Risk Controls
- Do not permit cutover readiness evaluation without completed consistency checks.
- Preserve campaign replayability by retaining intermediate progress metadata.
- Ensure tenant partitioning is preserved in loader and validation queries.

## Done Criteria
- Backfill campaign can run, pause, resume, and complete with deterministic accounting.
- Post-backfill consistency checks are automated and gating.
- Gallery/library coverage metrics are available for cutover gates.

## As-Built (2026-02-16)

### Actual files changed
- `python-backend/app/models/library.py`
- `python-backend/app/services/library_backfill_service.py`
- `python-backend/migrations/007_library_backfill_campaign.py`
- `python-backend/tests/unit/services/test_library_backfill_service.py`
- `python-backend/tests/unit/migrations/test_library_backfill_campaign_migration.py`
- `apps/web/server/__tests__/migrationOrdering.test.ts`
- `specs/feature/013-VectorDatabase/reviews/section-05-review.md`

### Deviations from plan
- Gallery and library source scoping currently uses `library_items.source` classification (`media_history` -> gallery) in the Python worker boundary to avoid coupling to separate gallery ORM models in this phase.

### Tests added/updated
- Added: `python-backend/tests/unit/services/test_library_backfill_service.py`
  - domain-scoped loader coverage (`library` vs `gallery`)
  - campaign checkpoint/counter persistence across resume
  - gallery enqueue parity in campaign batches
  - consistency divergence diagnostics with missing-entity sampling
- Added: `python-backend/tests/unit/migrations/test_library_backfill_campaign_migration.py`
  - migration 007 contract coverage for campaign persistence schema
- Updated: `apps/web/server/__tests__/migrationOrdering.test.ts`
  - migration ordering now expects `007_library_backfill_campaign.py` as latest Python migration
  - validates campaign migration contract markers

### Known follow-ups
- Execute migration 007 in staging/prod rollout automation before enabling campaign APIs operationally.
