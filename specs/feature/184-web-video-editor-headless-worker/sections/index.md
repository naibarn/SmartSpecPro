<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-contracts
section-02-project-persistence
section-03-asset-ingest
section-04-worker-job-lifecycle
section-05-headless-worker-executor
section-06-browser-editor
section-07-worker-jobs-ux
section-08-render-results
section-09-rollout-operations
section-10-integration-proof
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-shared-contracts | — | 02, 03, 04, 05, 06 | Yes |
| section-02-project-persistence | 01 | 03, 04, 06, 08 | No |
| section-03-asset-ingest | 01, 02 | 05, 06, 08 | Yes after 02 |
| section-04-worker-job-lifecycle | 01, 02 | 05, 07, 08, 09 | Yes after 02 |
| section-05-headless-worker-executor | 01, 04 | 08, 09 | No |
| section-06-browser-editor | 01, 02, 03 | 07, 08 | No |
| section-07-worker-jobs-ux | 04, 06 | 08, 09 | No |
| section-08-render-results | 02, 04, 05, 06, 07 | 09, 10 | No |
| section-09-rollout-operations | 04, 05, 07, 08 | 10 | No |
| section-10-integration-proof | 01–09 | — | No |

## Execution Order

1. `section-01-shared-contracts`
2. `section-02-project-persistence`
3. `section-03-asset-ingest` and `section-04-worker-job-lifecycle` (parallel after 02)
4. `section-05-headless-worker-executor` and `section-06-browser-editor` (after their declared dependencies)
5. `section-07-worker-jobs-ux`
6. `section-08-render-results`
7. `section-09-rollout-operations`
8. `section-10-integration-proof`

## Section Summaries

### section-01-shared-contracts

Canonical NLE and media-job contracts, compatibility adapters, deterministic cross-language fixtures, and schema tests.

### section-02-project-persistence

Revisioned `video_editor_projects` persistence, companion relations, migration, tenant authorization, CAS, autosave, restore, and project-job pinning.

### section-03-asset-ingest

Managed asset import, Worker/legacy project migration, missing/relink handling, proxy/analysis artifacts, and authenticated range access.

### section-04-worker-job-lifecycle

Editor media-job procedures over existing `worker_jobs`, scheduler admission, capability freshness, leases/fencing, credit idempotency, and lifecycle tests.

### section-05-headless-worker-executor

Validated headless Rust execution with FFmpeg/Remotion providers, cancellation/heartbeat, artifact verification/upload, diagnostics, and replay.

### section-06-browser-editor

Worker editor core extraction, browser platform adapter, Web editor parity surface, autosave/conflict/recovery, and UI/UX/browser evidence.

### section-07-worker-jobs-ux

Canonical `/worker-jobs` queue surface, `/render-jobs` query-preserving alias, operation labels, navigation, accessibility, and historical job compatibility.

### section-08-render-results

Revision-pinned export submission, approval/credit, status/reconnect, cancel/retry/replay, stale-result review/apply, publication, and notifications.

### section-09-rollout-operations

Feature-flag cohorts, canary telemetry, retention/tombstones, support/runbooks, rollback, and alias/legacy retirement gates.

### section-10-integration-proof

Cross-section integration wiring and evidence for AC-01–AC-18, including environment-dependent proof and explicit blockers.
