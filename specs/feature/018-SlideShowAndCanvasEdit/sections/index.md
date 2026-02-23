<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: cd apps/web && npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-foundation-and-routing
section-02-schema-and-persistence
section-03-backend-api-and-services
section-04-conflict-and-concurrency-hardening
section-05-frontend-editor-and-document-integration
section-06-import-conversion-and-compatibility
section-07-playback-and-export-pipeline
section-08-observability-rollout-and-operations
section-09-validation-and-regression-suite
section-10-release-readiness-and-handoff
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-foundation-and-routing | - | 02, 03 | No |
| section-02-schema-and-persistence | 01 | 03, 04, 06 | No |
| section-03-backend-api-and-services | 01, 02 | 04, 05, 06, 07 | No |
| section-04-conflict-and-concurrency-hardening | 02, 03 | 08, 09 | Yes |
| section-05-frontend-editor-and-document-integration | 03 | 07, 09 | Yes |
| section-06-import-conversion-and-compatibility | 02, 03 | 08, 09 | Yes |
| section-07-playback-and-export-pipeline | 03, 05 | 08, 09 | No |
| section-08-observability-rollout-and-operations | 04, 06, 07 | 10 | Yes |
| section-09-validation-and-regression-suite | 04, 05, 06, 07 | 10 | Yes |
| section-10-release-readiness-and-handoff | 08, 09 | - | No |

## Execution Order

1. `section-01-foundation-and-routing`
2. `section-02-schema-and-persistence`
3. `section-03-backend-api-and-services`
4. `section-04-conflict-and-concurrency-hardening`, `section-05-frontend-editor-and-document-integration`, `section-06-import-conversion-and-compatibility`
5. `section-07-playback-and-export-pipeline`
6. `section-08-observability-rollout-and-operations`, `section-09-validation-and-regression-suite`
7. `section-10-release-readiness-and-handoff`

## Section Summaries

### section-01-foundation-and-routing
Establishes presentation feature boundaries, route registration, and shared contracts/constants needed by all downstream sections.

### section-02-schema-and-persistence
Implements additive presentation schema, ordering invariants, and authoritative deck byte accounting.

### section-03-backend-api-and-services
Builds presentation router endpoints and service orchestration for CRUD, slide operations, assets, and lifecycle actions.

### section-04-conflict-and-concurrency-hardening
Adds optimistic versioning, `409` conflict schema contract, and reorder/concurrency safeguards.

### section-05-frontend-editor-and-document-integration
Delivers editor route/page/components and Document Management integration for presentation items.

### section-06-import-conversion-and-compatibility
Implements read-only office path, one-time conversion pipeline, source fidelity metadata, and `.ppt` guidance.

### section-07-playback-and-export-pipeline
Adds slideshow payload resolution and PNG/MP4 export trigger pipeline with dedupe, throttling, and worker contract versioning.

### section-08-observability-rollout-and-operations
Adds logs/metrics/alerts, rollout guardrails, and rollback runbook wiring.

### section-09-validation-and-regression-suite
Implements comprehensive backend/frontend/integration coverage for regressions, security, lifecycle, and cleanup scenarios.

### section-10-release-readiness-and-handoff
Final verification, post-migration consistency checks, launch checklist, and ownership handoff criteria.
