# Section 08: End-to-End Validation and Rollout

## Objective
Finalize feature readiness with integrated validation across API, worker, DB, and operations, then execute a controlled rollout with rollback rehearsals and acceptance checks.

## Scope
- Execute end-to-end tests for v1 domains (`gallery`, `library`) across index/delete/search flows.
- Validate provider switch/cutover and either-trigger rollback behavior in staging.
- Validate tenant isolation negatives across providers and DB policies.
- Execute canary rollout steps and post-deploy verification checklist.
- Confirm done criteria and ownership handoff for production support.

## Out of Scope
- Net-new core architecture changes from earlier sections.

## Dependencies
- section-05-backfill-reindex-and-consistency
- section-06-staged-cutover-and-rollback-governance
- section-07-observability-admin-and-alerting

## Implementation Tasks
1. Build/enable integration scenarios covering gallery/library create-index-search-delete paths.
2. Execute provider switch rehearsal with readiness gate evidence and parity checks.
3. Execute rollback drill for both trigger classes and capture restoration verification evidence.
4. Run cross-tenant negative tests for API + worker + DB path consistency.
5. Run operational validation checklist: queue lag, failure rate, latency p95, dead-letter size, campaign progression.
6. Gate production enablement on all done criteria and acceptance evidence artifacts.

## TDD-First Test Stubs
- Gallery and library auto-indexing acceptance tests pass.
- Delete acceptance tests confirm removed records are no longer searchable.
- Provider switch acceptance test enforces `coverage_95_plus_smoke` gate.
- Rollback acceptance tests pass for both trigger categories.
- pgvector + RLS acceptance checks pass on primary DB path.
- Observability acceptance checks confirm required health and alert signals.

## Risk Controls
- Roll out by tenant cohort and monitor canary metrics before broad enablement.
- Keep immediate rollback procedure pre-approved and documented.
- Block full rollout if parity, isolation, or latency checks fail.

## Done Criteria
- All acceptance stubs are implemented and passing.
- Rollout and rollback rehearsals complete without unresolved drift.
- Feature is production-ready with operational monitoring and ownership in place.

## As-Built (2026-02-16)

### Actual files changed
- `python-backend/app/services/library_indexing_service.py`
- `python-backend/tests/unit/services/test_library_rollout_validation.py`
- `specs/feature/013-VectorDatabase/rollout-canary-runbook.md`
- `specs/feature/013-VectorDatabase/reviews/section-08-review.md`

### Deviations from plan
- End-to-end validation is implemented as acceptance-style service tests in isolated DB fixtures rather than full staging environment smoke pipelines in this section.

### Tests added/updated
- Added: `python-backend/tests/unit/services/test_library_rollout_validation.py`
  - gallery/library auto-indexing acceptance
  - delete acceptance removes indexed vectors and preserves consistency
  - provider switch gate + both rollback trigger rehearsals
  - pgvector/RLS acceptance helper checks
  - observability/admin alert acceptance checks
- Updated: `python-backend/tests/unit/services/test_library_indexing_service.py`
  - verified no regression from delete acceptance helper integration

### Known follow-ups
- Add staging integration evidence capture for canary cohorts using live queue/search metrics.
