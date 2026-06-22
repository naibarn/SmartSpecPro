<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-and-flags
section-02-worker-queue-scheduler
section-03-lease-attempt-watchdog
section-04-artifact-verification
section-05-hyperframes-projection-storyboard
section-06-worker-connect-auth
section-07-worker-app-runtime-pack
section-08-tauri-hyperframes-executor
section-09-user-job-monitor-ui
section-10-admin-worker-monitor-ui
section-11-future-local-ai-mcp-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
| --- | --- | --- | --- |
| section-01-contracts-and-flags | - | 02, 03, 04, 05, 07, 08, 09, 10, 11 | No |
| section-02-worker-queue-scheduler | 01 | 03, 04, 05, 09, 10 | Partly |
| section-03-lease-attempt-watchdog | 01, 02 | 04, 05, 08, 09, 10 | Partly |
| section-04-artifact-verification | 01, 02, 03 | 05, 08, 09, 10 | No |
| section-05-hyperframes-projection-storyboard | 01, 02, 03, 04 | 09 | No |
| section-06-worker-connect-auth | 01 | 07, 08, 10 | Partly |
| section-07-worker-app-runtime-pack | 01, 06 | 08 | Partly |
| section-08-tauri-hyperframes-executor | 01, 03, 04, 06, 07 | 09 | No |
| section-09-user-job-monitor-ui | 01, 02, 03, 04, 05, 08 | - | Partly |
| section-10-admin-worker-monitor-ui | 01, 02, 03, 04, 06 | - | Partly |
| section-11-future-local-ai-mcp-rollout | 01 | later feature work | Yes |

## Execution Order

1. `section-01-contracts-and-flags`
2. `section-02-worker-queue-scheduler` and `section-06-worker-connect-auth`
3. `section-03-lease-attempt-watchdog` and `section-07-worker-app-runtime-pack`
4. `section-04-artifact-verification`
5. `section-05-hyperframes-projection-storyboard`
6. `section-08-tauri-hyperframes-executor`
7. `section-09-user-job-monitor-ui` and `section-10-admin-worker-monitor-ui`
8. `section-11-future-local-ai-mcp-rollout`

## Section Summaries

### section-01-contracts-and-flags

Add shared HyperFrames worker job contracts, progress/failure vocabularies,
capability hints, and fail-closed feature flags.

### section-02-worker-queue-scheduler

Queue HyperFrames final composite into existing `worker_jobs` with idempotency,
credit/priority/fairness metadata, manual storyboard support, and no server
render kick.

### section-03-lease-attempt-watchdog

Add assignment attempt semantics, lease renewal, cooperative stop/ack, user
reassign, stale upload guarding, and stalled attempt watchdog behavior.

### section-04-artifact-verification

Implement HyperFrames worker artifact expectations and server verification before
publish/completion, including retention and cleanup policy.

### section-05-hyperframes-projection-storyboard

Bridge worker job, watchdog, and verification state into
`HyperframesRenderStatusProjection` and wire Storyboard Review final composite
submission/polling to worker jobs.

### section-06-worker-connect-auth

Create worker-specific pairing/auth modeled after Chrome extension pairing but
with worker-specific token type, scopes, revocation, and management.

### section-07-worker-app-runtime-pack

Create the separate lightweight `apps/worker-app` Tauri product with UI
settings, runtime pack manifest, runtime doctor, tray/minimize behavior, and
safe capabilities.

### section-08-tauri-hyperframes-executor

Add the `apps/worker-app` Tauri/Rust HyperFrames final composite executor that
claims jobs, runs official runtime sidecar, uploads artifacts, reports progress,
and cleans up.

### section-09-user-job-monitor-ui

Build user job monitor UI for queued/running/completed/failed jobs, executor
progress, cancel, reassign, source links, and output links.

### section-10-admin-worker-monitor-ui

Build admin worker fleet/job monitor UI for worker readiness, sharing, current
job, verification diagnostics, pause/drain/revoke, and queue visibility.

### section-11-future-local-ai-mcp-rollout

Reserve future local AI and branded MCP worker contracts and document
rollout/observability/migration guards for broader video render migration.
