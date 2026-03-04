# Section 06: Stream E Warning Contract

## Objective
Replace legacy unsupported-element warning behavior with capability-aware taxonomy and mixed-version-safe compatibility rules.

## Scope
- Separate warning categories: unsupported, fallback-degraded, timeout/deferred.
- Keep backward compatibility for existing consumers.
- Version warning contract and tolerate unknown future codes.
- Enforce mixed-version deployment matrix and promotion gate.

## Dependencies
- Requires Sections 03, 04, and 05 outputs.

## Target Files
- `apps/web/server/services/presentationExportDegradation.ts`
- `apps/web/server/services/presentationPlaybackExport.ts`
- shared contract/status mapping files in `packages/shared` and client mapping surfaces
- related service and contract tests

## TDD First (Stubs)
- Stub: no false `SLIDE_ELEMENT_UNSUPPORTED` for supported video/SVG paths.
- Stub: category mapping tests for unsupported vs degraded vs timeout/deferred.
- Stub: forward-compatible handling for unknown warning codes.
- Stub: mixed-version matrix tests (`old reader/new writer`, `new reader/old writer`).
- Stub: promotion gate fails when matrix coverage is incomplete.
- Stub: idempotent retry/dedupe behavior for repeated export triggers.

## Implementation Tasks
1. Refactor degradation classifier to capability-aware taxonomy.
2. Add additive warning contract version metadata and consumer tolerance behavior.
3. Implement tolerant-reader-first release-order rule in rollout checks.
4. Update status mappers to preserve success-with-warning semantics.
5. Verify idempotent export trigger behavior across retries.

## Validation
- Contract tests pass for legacy and new warning payloads.
- Mixed-version matrix passes in both directions.
- Retry/idempotency tests prevent duplicate artifact generation.

## Risks and Rollback
- Risk: payload shape drift breaks clients during partial deploy.
- Rollback: block promotion and revert writer behavior until compatibility matrix is fully green.

## Done Criteria
- Warning taxonomy and compatibility gates are fully validated.

## As-Built (2026-03-04)

### Actual Files Changed
- `apps/web/shared/presentation/exportWarnings.ts`
- `apps/web/shared/presentation/exportWarnings.test.ts`
- `apps/web/shared/presentation/constants.ts`
- `apps/web/shared/presentation/contracts.ts`
- `apps/web/server/services/presentationExportDegradation.ts`
- `apps/web/server/services/presentationExportDegradation.test.ts`
- `apps/web/server/services/presentationPlaybackExport.ts`
- `apps/web/server/services/presentationPlaybackExport.test.ts`
- `apps/web/server/services/__fixtures__/export-degradation/unsupported-constructs.expected.json`
- `specs/feature/030-PresentationEditAdditional/reviews/section-06-review.md`
- `specs/feature/030-PresentationEditAdditional/sections/section-06-stream-e-warning-contract.md`

### Deviations from Plan
- Warning-category representation is additive and computed by code mapping helper (`categorizePresentationExportWarningCode`) rather than forcing category values to be supplied by upstream producers.
- Mixed-version compatibility gate is currently enforced at export-trigger time using an explicit matrix dependency contract (`oldReaderNewWriter`, `newReaderOldWriter`).

### Tests Added/Updated
- Added forward-compat warning contract tests:
  - `shared/presentation/exportWarnings.test.ts`
- Added coverage for supported video/SVG not being misclassified as unsupported:
  - `server/services/presentationExportDegradation.test.ts`
- Added compatibility-matrix gate and warning-contract-version checks:
  - `server/services/presentationPlaybackExport.test.ts`
- Updated deterministic fixture expectations for new warning schema shape:
  - `server/services/__fixtures__/export-degradation/unsupported-constructs.expected.json`
- Executed section verification:
  - `npm --prefix apps/web test -- server/services/presentationExportDegradation.test.ts server/services/presentationPlaybackExport.test.ts shared/presentation/exportWarnings.test.ts` (pass 33/33)

### Known Follow-ups
- `W_SLIDE_READY_TIMEOUT` category mapping is in place for route/worker timeout-deferred semantics, but end-to-end aggregation into persisted export status warnings remains a later stream integration task.
