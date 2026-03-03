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
