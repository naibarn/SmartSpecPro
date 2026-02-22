# Section 09: Validation and Regression Suite

## Objective
Implement comprehensive automated test coverage that protects existing functionality and validates all MVP presentation guarantees.

## Dependencies
- `section-04-conflict-and-concurrency-hardening`
- `section-05-frontend-editor-and-document-integration`
- `section-06-import-conversion-and-compatibility`
- `section-07-playback-and-export-pipeline`

## Implementation Scope
- Backend router/service tests for CRUD, permissions, limits, conflict contracts, and conversion behavior.
- Frontend component tests for editor interactions, conflict UX hooks, playback controls, and accessibility baseline.
- Integration tests for end-to-end create/edit/export/reopen and compatibility conversion flows.
- Security/lifecycle regression tests for tenant isolation and soft-delete/restore permission behavior.
- Cleanup consistency tests for orphaned asset-link and stale-object detection.

## Test-First Stubs (Write Before Implementation)
- Test: create -> edit -> export -> reopen scenario succeeds end-to-end.
- Test: read-only pptx -> convert -> edit flow preserves source linkage and fidelity warnings.
- Test: cross-tenant deck/asset access is denied across router and service paths.
- Test: soft-delete/restore transitions enforce expected deny/allow behavior.
- Test: failed conversion and asset-delete cleanup leaves no orphaned links or stale objects.
- Test: conflict `409` contract remains parser-compatible with `conflict_schema_version`.

## Implementation Tasks
1. Add backend unit/contract suites following existing Vitest layout.
2. Add frontend component/integration tests with Testing Library.
3. Add integration scenarios spanning routing, conversion, and export enqueue.
4. Add migration/post-migration consistency check tests.
5. Ensure all new tests are deterministic and CI-friendly.

## Acceptance Criteria
- Regression suite covers all high-risk blast-radius areas in implementation plan.
- Existing document/media/video-editor baselines stay green.
- Security and lifecycle edge cases are explicitly validated.
- Cleanup and consistency guarantees are tested.

## Risks and Mitigations
- Risk: flaky tests reduce release confidence.
- Mitigation: deterministic fixtures, explicit async boundaries, minimal external dependencies.

## Out of Scope
- Performance benchmarking harnesses beyond MVP functional validation.

## As-Built Implementation Notes
- status: `implemented`
- implemented_on: `2026-02-22`

### Files Changed
- `apps/web/server/services/presentationPersistence.ts`
- `apps/web/server/services/presentationPersistence.test.ts`
- `apps/web/server/services/presentationService.test.ts`
- `apps/web/server/services/presentationPlaybackExport.test.ts`
- `apps/web/server/services/presentationWorkflowRegression.test.ts`

### Deviations From Plan
- End-to-end regression coverage was implemented as deterministic service-level workflow tests (conversion/export/reopen) rather than browser-driven E2E to keep CI runtime and flake risk low for this section.

### Tests Added/Updated
- `apps/web/server/services/presentationWorkflowRegression.test.ts`
- `apps/web/server/services/presentationPlaybackExport.test.ts`
- `apps/web/server/services/presentationService.test.ts`
- `apps/web/server/services/presentationPersistence.test.ts`

### Known Follow-Ups
- Add full UI/browser integration tests that execute the same create/edit/export/reopen journey across real router/API boundaries.
- Add DB-backed consistency sweep job wiring for orphan-link and stale-object checks beyond pure helper validation.
