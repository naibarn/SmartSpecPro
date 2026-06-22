# Implementation Plan: Feature 124 Smart AI Hub Worker App

## Purpose

Build **Smart AI Hub Worker App** and migrate HyperFrames final composite
rendering from the SmartAIHub server/background worker path to the existing
generic worker runtime. SmartAIHub remains the source of truth for job
submission, permission checks, queueing, status projection, artifact storage,
billing, audit, and verification. The desktop worker performs official
HyperFrames render execution locally and uploads artifacts for server
verification.

The central implementation principle is:

> Extend the existing `worker_jobs` control plane and keep Storyboard Review's
> HyperFrames projection API stable. Do not create a second render queue or
> silently fall back to server render output.

## Existing System To Reuse

### Worker Runtime

Reuse and extend:

- `apps/web/shared/workerRuntime.ts`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerPolicyService.ts`
- `apps/web/server/services/workerArtifactService.ts`
- `apps/web/server/services/workerBillingService.ts`
- `apps/web/drizzle/schema.ts`
- new lightweight desktop workspace `apps/worker-app/**`
- existing `apps/tauri-shell/src-tauri/src/desktop_worker_executor.rs` and
  `apps/tauri-shell/src-tauri/src/desktop_worker_control_plane.rs` as reference
  or extraction sources only

The existing queue already supports registration, heartbeat, claim, lease token,
ordered events, artifact upload, billing reconciliation, and worker artifacts.
The implementation should add HyperFrames as a new job type within this system.

The desktop product must be a separate **Smart AI Hub Worker App** workspace,
not a renamed full `tauri-shell` install. The worker app should stay small and
focused on pairing, queue polling, runtime doctor, execution, upload, tray
state, and diagnostics. If existing `tauri-shell` worker modules are useful,
extract a narrow shared Rust/TypeScript library or copy the minimal code with
tests; do not make users install the full shell to run render work.

### HyperFrames UI/API Surface

Preserve these web contracts:

- `marketplaceCapture.createHyperframesFinalComposite`
- `marketplaceCapture.getHyperframesRenderJob`
- `HyperframesRenderStatusProjection`
- Storyboard Review URL/query recovery via `hyperframesRenderJobId`
- existing Library save flow where possible

The backend implementation can change from outbox to worker jobs, but the
client should keep receiving a HyperFrames render projection.

## Target Architecture

### Submission Flow

1. User clicks `Render Final Composite` in Storyboard Review.
2. Server validates product/manual storyboard access and final composite config.
3. Server builds a deterministic HyperFrames final composite composition input.
4. Server creates a `worker_jobs` row with `jobType:
   "hyperframes_final_composite"` and runtime type `desktop_zeroclaw_managed`.
5. Server returns a `HyperframesRenderStatusProjection` containing a stable
   render/job id, status `queued`, polling guidance, and user-readable message.
6. Eligible desktop workers poll `/api/workers/:workerId/jobs/claim`.
7. Server atomically assigns the job and returns a signed manifest with assets,
   expected hashes, output requirements, and an assignment attempt identity.
8. Worker downloads assets, runs official HyperFrames sidecar/runtime, uploads
   artifacts, and reports ordered progress.
9. Server verifies artifacts and marks the worker job completed.
10. Storyboard Review and Job Monitor show verified output links.

### Runtime Execution Boundary

The worker does:

- runtime doctor checks;
- asset download into a scoped workspace;
- official HyperFrames render sidecar execution;
- progress reporting;
- local media probing;
- artifact upload through server-issued upload sessions;
- cleanup after completion/failure.

The server does:

- permission checks;
- queueing and assignment;
- signed asset manifests;
- credit reservation/reconciliation;
- artifact storage session creation;
- output verification;
- status projection;
- audit logs;
- user/admin monitor APIs.

The server must not run final composite render execution for the worker-enabled
path.

## Data Model Plan

### Extend Shared Worker Contracts

Add a HyperFrames final composite job contract to shared worker runtime modules.
Keep it close to `workerRuntime.ts` unless the file becomes too large; a focused
module such as `apps/web/shared/workerRuntimeHyperframes.ts` is acceptable if it
is imported and re-exported from `workerRuntime.ts`.

Required contract concepts:

- job type: `hyperframes_final_composite`
- progress stages:
  - `runtime_doctor`
  - `resolve_manifest`
  - `download_assets`
  - `prepare_workspace`
  - `render_hyperframes`
  - `probe_output`
  - `upload_artifacts`
  - `server_verification`
  - `publish_result`
- failure codes:
  - `runtime_not_ready`
  - `asset_download_failed`
  - `template_contract_invalid`
  - `composition_hash_mismatch`
  - `hyperframes_render_failed`
  - `browser_runtime_failed`
  - `font_missing`
  - `artifact_upload_failed`
  - `server_verification_failed`
  - `stale_assignment`
  - `worker_reassigned`
- capability families:
  - `hyperframes-final-composite`
  - `official-hyperframes-runtime`
  - `browser-render`
  - `thai-fonts`
  - `ffmpeg-probe`

Job input shape should include fields only, not implementation:

```ts
type HyperframesFinalCompositeWorkerInput = {
  contractVersion: string;
  tenantId: string;
  productId: string;
  runId: string;
  renderJobId: string;
  compositionInputHash: string;
  timelineHash: string;
  templateId: string;
  templateVersion: string;
  platformPresetId: string;
  finalCompositeConfig: Record<string, unknown>;
  assetManifest: HyperframesWorkerAssetManifest;
  outputRequirements: HyperframesWorkerOutputRequirements;
  verificationPolicy: HyperframesWorkerVerificationPolicy;
};
```

### Worker Job Table Extensions

Prefer minimal schema additions. Use existing JSON fields when safe, but add
columns if an invariant must be queryable or concurrency-safe.

Required durable state:

- source domain: HyperFrames final composite;
- source render job id;
- composition input hash;
- assignment attempt id;
- assignment lease id or current lease owner token;
- current worker id;
- user-requested reassign time/reason;
- stalled/requeued attempt history;
- verified output artifact refs;
- verification report.

Recommended approach:

1. Store domain-specific values in `worker_jobs.inputJson`,
   `worker_jobs.instructionsJson`, and `worker_jobs.outputJson` for MVP.
2. Add indexes only if monitor query performance needs them after implementation
   tests.
3. If stale attempt rejection cannot be safely expressed with the existing
   `leaseOwnerToken`, add explicit `assignmentAttempt` metadata in job JSON and
   require every event/upload/complete payload to echo it.

### Backward Compatibility

Existing HyperFrames outbox records may remain readable for previously submitted
jobs. New final composite submissions should route to `worker_jobs` behind a
feature flag. The projection layer should handle both sources during migration:

- legacy outbox jobs: existing projection path;
- worker final composite jobs: new projection bridge.

### Persistence Mapping And Promotion Criteria

The raw feature spec describes logical records such as `worker_connections`,
`worker_jobs`, `worker_job_attempts`, `worker_job_events`, and
`worker_artifacts`. The codebase already has `workers`, `worker_heartbeats`,
`worker_jobs`, `worker_job_events`, `worker_artifacts`, delegated sessions, and
job grants, so the implementation should map the logical model onto existing
tables first and add new tables/columns only where correctness or query
performance requires it.

| Spec logical record | MVP storage target | Promotion trigger |
| --- | --- | --- |
| worker connection/device | existing `workers` plus worker-specific auth/connection metadata | add generalized connected-device table if extension and worker pairing must share revoke/device UI |
| worker job | existing `worker_jobs` | add indexed columns for fields that list/claim/watchdog queries need frequently |
| worker job attempt | `worker_jobs.instructionsJson`/`outputJson` attempt history, or a new `worker_job_attempts` table if lease safety cannot stay atomic in JSON | promote immediately if stale upload rejection, reassignment history, or admin filters need first-class attempt ids |
| worker job events | existing `worker_job_events` append-only safe events | keep as primary event log |
| worker artifacts | existing `worker_artifacts` plus verification metadata | add indexes only for verification/cleanup queries that become slow |

`assignmentAttempt` and `assignmentLeaseId` must be first-class enough in the
service layer to reject stale progress, upload, completion, and future MCP
result submissions even if the physical storage remains JSON in the first pass.

### Queue Policy, Priority, And Fairness

Scheduler and claim logic must preserve asynchronous submission without letting
one user or group starve a shared worker pool.

Required policy hooks:

- priority classes such as `interactive`, `normal`, `bulk`, and `admin`;
- tenant/user/group queue depth caps;
- max active jobs per worker, default `1`;
- max active worker attempts per tenant/job kind;
- retry count and max-attempt/dead-letter policy;
- compatible capability and runtime profile ordering;
- fair ordering by priority, submit time, retry count, and user/group spread.

The first implementation can start with existing queue ordering if tests prove
it is deterministic and safe, but the scheduler API must preserve fields needed
for priority/fairness so later tuning does not require another contract break.

## Server Implementation Plan

### 1. Shared Contracts And Feature Flags

Files:

- `apps/web/shared/workerRuntime.ts`
- optional `apps/web/shared/workerRuntimeHyperframes.ts`
- `apps/web/shared/featureFlags.ts`
- `apps/web/shared/hyperframes/contracts.ts`
- `apps/web/shared/hyperframes/runtimeApiSchemas.ts`
- tests in `apps/web/shared/**/__tests__`

Tasks:

- Add HyperFrames worker job contract schemas.
- Add progress/failure vocabularies.
- Add a feature flag such as `hyperframesWorkerFinalComposite`.
- Add status mapping helpers from worker job state to HyperFrames render
  statuses.
- Ensure schema limits still enforce 300s final length and 30s shot max where
  applicable.

### 2. Scheduler

Files:

- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/__tests__/workerSchedulerService.test.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/server/services/__tests__/hyperframesRuntimeApiService.test.ts`

Tasks:

- Add `queueDesktopHyperframesFinalCompositeJob`.
- Validate tenant feature flag and operator kill switch.
- Validate preferred worker only for admin/debug paths; normal Storyboard
  Review should not require a preferred worker.
- Reserve credits using the same estimate currently produced for final
  composite, but account for full final duration and number of shots.
- Record priority, quota, credit reservation, and fairness metadata so user job
  monitor/admin monitor can explain why a job is waiting.
- Use a deterministic idempotency key derived from:
  - tenant id;
  - run id;
  - render intent;
  - composition input hash;
  - template/runtime profile;
  - platform preset;
  - final composite config hash.
- Return the existing job if idempotency matches and the job is still current.
- If a job failed permanently, require new input hash or explicit retry action.
- Do not serialize all jobs for one user unless tenant quota policy explicitly
  requires it.

### 3. Claim, Lease, Attempt, And Watchdog

Files:

- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- optional new `apps/web/server/services/workerStallWatchdogService.ts`
- `apps/web/server/routes/workerRuntime.ts`
- tests in worker service/route test files

Tasks:

- Extend runtime-specific job event contract for
  `hyperframes_final_composite`.
- Include `assignmentAttempt` in claim response or job manifest.
- Require `assignmentAttempt` and `leaseOwnerToken` on HyperFrames progress,
  upload, complete, and fail events.
- Add lease renewal semantics for long render jobs. The worker should report
  progress/heartbeat frequently enough that the server can distinguish slow
  render from abandoned render.
- Add user-requested reassign:
  - allowed after 15 minutes or configured threshold;
  - records reason and marks current assignment as transfer requested;
  - prevents stale completion from old worker once a new assignment is active.
- Heartbeat responses for active workers may include cooperative commands:
  `continue`, `pause_after_current_job`, `stop_current_attempt_for_reassignment`,
  `stop_current_attempt_for_timeout`, `runtime_update_required`, and
  `connection_revoked`.
- Add `cancel-ack` or `transfer-ack` semantics through a dedicated route or
  worker event so the server can distinguish cooperative stop from crashed
  workers.
- Add watchdog:
  - detects no heartbeat/progress or not completed after 30 minutes;
  - marks attempt stalled;
  - requeues when safe;
  - surfaces operator-required state for unsafe/stale uploads or repeated
    failures.
- Cap max attempts and move jobs to `failed_transient`, `failed_permanent`, or
  `dead_lettered` according to policy when every eligible worker fails.

### 4. Artifact Upload And Server Verification

Files:

- `apps/web/server/services/workerArtifactService.ts`
- `apps/web/server/services/workerRegistryService.ts`
- new `apps/web/server/services/hyperframesWorkerVerificationService.ts`
- `apps/web/server/services/hyperframesLibraryFinalizeService.ts`
- `apps/web/server/services/__tests__/workerArtifactService.test.ts`
- new tests for HyperFrames worker verification

Tasks:

- Define expected artifact types:
  - `hyperframes_final_video`
  - `hyperframes_render_manifest`
  - `hyperframes_runtime_doctor`
  - `hyperframes_probe_report`
  - `hyperframes_snapshot`
  - optional `subtitle_file`
  - optional `transcript_file`
  - optional sanitized log bundle
- Verify all expected artifacts before completing final projection.
- Verify file hashes, MIME types, size, duration, aspect ratio, fps, audio track,
  and subtitle policy.
- Verify composition/timeline/template/runtime hashes against job input.
- Reject outputs produced by diagnostic smoke runs, ASS/FFmpeg overlay fallback,
  or any runtime profile not explicitly allowed for the job.
- Store verification report in worker job output and in HyperFrames projection
  metadata.
- Publish to Media Library only after verification passes and permissions allow.
- Reject artifact completion from stale attempts.
- Apply retention/cleanup policy:
  - signed input URLs expire quickly and are regenerated per active attempt;
  - incomplete uploads expire and are garbage-collected;
  - stale attempt artifacts are rejected and deleted or quarantined for support;
  - local workspace cleanup is required after success/failure;
  - sanitized log bundles must not contain tokens, signed URLs, local paths, or
    raw composition HTML unless explicit support mode allows it.

### 4.1 Credits And Billing

Files:

- `apps/web/server/services/workerBillingService.ts`
- `apps/web/server/services/hyperframesFeatureAccessService.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- billing/feature-access tests

Tasks:

- Reserve credits when the durable worker job is queued, using full final
  duration and shot count.
- Store executor type, job kind, expected duration, shot count, retry count, and
  reservation id in worker job metadata.
- Do not capture final success credits until server verification passes.
- Release/refund reservation for queued cancellation before claim according to
  existing policy.
- For worker/runtime/upload/verification failures, reconcile as transient or
  permanent failure according to existing render billing rules.
- Show user-safe billing state in job monitor/error copy: reserved, released,
  captured, or pending support review.

### 5. HyperFrames Projection Bridge

Files:

- `apps/web/server/services/hyperframesRenderService.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- tests in HyperFrames render/runtime API service tests

Tasks:

- Add helper that reads worker job by source render id or latest product/run
  final composite.
- Map `worker_jobs.status`, events, and output into
  `HyperframesRenderStatusProjection`.
- Keep old outbox projection readable.
- Prefer worker job projection for new final composite jobs.
- Add safe user messages:
  - queued and waiting for worker;
  - assigned to worker;
  - rendering locally;
  - uploading;
  - server verifying;
  - completed;
  - blocked with next action;
  - stalled/requeued.
- Include local-time friendly `createdAt`, `updatedAt`, `startedAt`, elapsed
  fields using ISO timestamps for client formatting.

### 6. Storyboard Review Submission

Files:

- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- `apps/web/client/src/pages/StoryboardReviewPage.hyperframesText.test.ts`

Tasks:

- Change `createHyperframesFinalCompositeForApi` to submit a worker job when
  the feature flag is enabled.
- Remove server worker kick from the worker-enabled path.
- Preserve manual/custom storyboard render support.
- Preserve current UI controls, but ensure the final render button returns a
  trackable projection even if no worker has claimed it yet.
- On page refresh, recover latest render state by render job id or product/run.
- Add link from render status panel to the standalone job monitor.
- Show actionable runtime/worker blockers instead of raw command traces.

## API Contract Plan

### Endpoint Namespace Decision And Compatibility

The raw spec proposes `/api/worker-app/*` as a desktop-oriented namespace. The
codebase already has the worker control plane under `/api/workers/*` and
`/api/worker-jobs/*`, and previous worker specs explicitly choose those routes.
This plan keeps the existing routes as canonical to avoid creating a second
queue/control plane.

If product/download docs need the friendlier `worker-app` naming later, add thin
aliases that call the same handlers and produce the same audit events. Do not
implement separate persistence, auth, scheduler, or upload logic under an alias.

Conceptual mapping:

| Raw spec endpoint | Canonical implementation |
| --- | --- |
| `/api/worker-app/heartbeat` | `/api/workers/:workerId/heartbeat` |
| `/api/worker-app/jobs/claim` | `/api/workers/:workerId/jobs/claim` |
| `/api/worker-app/jobs/:jobId/events` | `/api/worker-jobs/:jobId/events` |
| `/api/worker-app/jobs/:jobId/artifacts/init-upload` | `/api/worker-jobs/:jobId/artifacts/init-upload` |
| `/api/worker-app/jobs/:jobId/artifacts/:artifactId/complete-upload` | `/api/worker-jobs/:jobId/artifacts/complete` |
| `/api/worker-app/runtime/manifest` | runtime pack endpoint or static signed runtime manifest route |
| `/api/worker-app/connect/*` | `/api/worker-connect/*` pairing endpoints |

### Worker Runtime REST Extensions

Extend existing REST routes instead of creating a second worker API namespace.

Routes to extend or add:

- `POST /api/workers/register`
  - accepts HyperFrames readiness metadata in `runtimeMetadataJson`;
  - returns execution/upload tokens as today.
- `POST /api/workers/:workerId/heartbeat`
  - includes HyperFrames runtime doctor summary and current job phase.
  - returns server commands such as continue, pause after current job,
    cooperative stop for reassignment/timeout, runtime update required, or
    connection revoked.
- `GET /api/workers/:workerId/policy`
  - returns safe worker policy snapshot, sharing mode, queue settings, runtime
    allowlist, and max concurrent jobs.
- `POST /api/workers/:workerId/jobs/claim`
  - returns `hyperframes_final_composite` jobs when the worker advertises the
    required capability hints and passes sharing policy;
  - includes `leaseOwnerToken`, `assignmentAttempt`, signed asset manifest,
    output requirements, and safe display label.
- `POST /api/worker-jobs/:jobId/events`
  - requires `sequenceNumber`, `leaseOwnerToken`, and `assignmentAttempt` for
    HyperFrames jobs.
- `POST /api/worker-jobs/:jobId/artifacts/init-upload`
  - requires artifact type, checksum when known, lease token, and assignment
    attempt.
- `POST /api/worker-jobs/:jobId/artifacts/complete`
  - validates stale attempt before recording artifact completion.
- `POST /api/worker-jobs/:jobId/release`
  - lets a worker safely abandon a claimed job with a cleanup reason.
- `POST /api/worker-jobs/:jobId/cancel-ack` or equivalent event
  - records cooperative stop acknowledgement for reassignment/cancellation.
- `POST /api/workers/:workerId/diagnostics`
  - accepts sanitized support/doctor metadata only.

### Web tRPC/API Procedures

Add or extend tRPC procedures under the existing marketplace/media/admin router
style used by the app.

User-facing procedures:

- `marketplaceCapture.createHyperframesFinalComposite`
  - returns worker-backed `HyperframesRenderStatusProjection`.
- `marketplaceCapture.getHyperframesRenderJob`
  - reads both legacy outbox and worker-backed final composite jobs.
- `workerJobs.listMyJobs`
  - filters by status/source/date/job type.
- `workerJobs.getMyJob`
  - returns job, events, assignment, artifacts, and source links.
- `workerJobs.cancelMyQueuedJob`
  - allowed only for requester-owned queued jobs.
- `workerJobs.requestReassign`
  - allowed after threshold and only for active requester-owned jobs.

Admin procedures:

- `adminWorkers.listWorkers`
  - worker fleet, owner, sharing scope, heartbeat, readiness, current job.
- `adminWorkers.getWorker`
  - worker detail, recent jobs, diagnostics, policy.
- `adminWorkers.updateWorkerPolicy`
  - pause, drain, sharing mode, revoke, runtime channel.
- `adminWorkers.listWorkerJobs`
  - fleet-wide queue/history view with filters.

### Worker Pairing Procedures

Add worker-specific pairing endpoints modeled after extension pairing:

- `POST /api/worker-connect/start`
  - creates short-lived device/user code.
- `GET /worker-connect/approve`
  - browser approval page using normal web session.
- `POST /api/worker-connect/token`
  - device polls/exchanges after approval.
- `POST /api/worker-connect/refresh`
  - rotates refresh token when used.
- `POST /api/worker-connect/revoke`
  - user/admin revokes one worker connection.

These endpoints must issue worker-specific token audience/type and must not
accept or emit marketplace extension tokens.

## Desktop Worker App Plan

### Product Shell

Architecture decision:

- Create a new Tauri v2 workspace at `apps/worker-app`.
- Product name, installer name, window title, tray title, and updater channel
  are **Smart AI Hub Worker App**.
- Keep the app intentionally small: no full SmartAIHub desktop shell, no
  marketplace capture UI, no general webview launcher, and no unrelated tools.
- Existing `apps/tauri-shell` can be reviewed for working worker-control-plane
  code, but it remains a separate product. Shared code must be extracted behind
  narrow interfaces instead of coupling the worker app to the full shell.

Files:

- `apps/worker-app/package.json`
- `apps/worker-app/src/**`
- `apps/worker-app/src-tauri/tauri.conf.json`
- `apps/worker-app/src-tauri/capabilities/*.json`
- `apps/worker-app/src-tauri/src/**`
- `apps/worker-app/src-tauri/tests/**`
- `apps/worker-app/sidecars/**`
- `apps/worker-app/runtime-pack/**`
- desktop release catalog files for the worker app

Tasks:

- Scaffold the separate **Smart AI Hub Worker App** workspace.
- Keep Windows as MVP target.
- Add tray/minimize behavior if not already present.
- Add UI screens:
  - Connect to Smart AI Hub;
  - Worker readiness;
  - Runtime download/update;
  - Settings;
  - Current job/progress;
  - Recent jobs;
  - Diagnostics.
- Keep installer/start menu/download copy clear that this is a lightweight
  helper worker, not the full SmartAIHub desktop shell.
- Narrow Tauri capabilities to the smallest feasible command/file/network
  surface. Sidecar execution should be allowlisted.

### Pairing And Settings

Files:

- existing worker auth services/routes, or new worker pairing service/routes
- `apps/worker-app/src-tauri/src/worker_credentials.rs`
- `apps/worker-app/src-tauri/src/worker_control_plane.rs`
- Tauri frontend settings UI

Tasks:

- Implement device-code/browser approval flow modeled after extension pairing.
- Support browser-to-app handoff with
  `smartaihub-worker://connect?code=...` when protocol registration is
  available, with device-code polling as the reliable fallback.
- Do not build an in-app SmartAIHub login form. The Worker App opens the normal
  SmartAIHub browser approval page; if login is required, it happens there, and
  the Worker App never sees user passwords, one-time login codes, session
  cookies, API keys, or manually copied bearer tokens.
- Token exchange should mirror the Chrome extension pattern: connect start
  returns `device_code`, `user_code`, `verification_uri`, and expiry; token
  polling after browser approval returns a worker access token plus rotating
  refresh token; refresh is automatic until revocation, expiry, or reuse failure.
- Before connect start or token exchange, Worker App must create a per-install
  device key pair or equivalent proof-of-possession secret in OS secure storage.
  The server binds the approved connection, access token, refresh token, and
  future refreshes to this one device key/installation.
- Store worker tokens in secure storage, not plaintext config.
- Support UI-managed settings:
  - SmartAIHub server URL from safe presets or approved tenant link;
  - worker label;
  - accept jobs toggle;
  - sharing mode;
  - start with Windows;
  - minimize to tray;
  - max concurrent jobs, default 1;
  - cache/workspace folder;
  - cache limit/cleanup;
  - runtime channel/version;
  - diagnostics level.

### HyperFrames Runtime Pack

Files:

- Tauri sidecar/resources scripts under `apps/worker-app/scripts`
- sidecar bundle under `apps/worker-app/sidecars/smartaihub-worker-node`
- runtime pack manifests/assets under `apps/worker-app/runtime-pack`
- new runtime manifest module in Rust
- desktop release/runtime pack server endpoints if needed

Tasks:

- Define runtime manifest:
  - HyperFrames package version;
  - sidecar command path;
  - browser binary or Playwright/Chromium readiness;
  - FFmpeg/FFprobe path;
  - Thai-capable fonts;
  - SHA256 hashes;
  - license notices;
  - checksum file;
  - signature file;
  - supported contract versions.
- Implement runtime doctor checks.
- If using lightweight installer, implement signed runtime pack download with
  hash verification and resumable/retryable extraction.
- Support runtime allowlist/denylist/rollback manifest so the server can block
  broken runtime pack versions before claim.
- Worker should only advertise `hyperframes-final-composite` capability after
  doctor passes.

### HyperFrames Executor

Files:

- `apps/worker-app/src-tauri/src/worker_executor.rs`
- optional `apps/worker-app/src-tauri/src/hyperframes_executor.rs`
- Rust tests under `apps/worker-app/src-tauri/tests`
- optional shared worker client crate/module extracted from `apps/tauri-shell`

Tasks:

- Add executor branch for `hyperframes_final_composite`.
- Claim job and prepare workspace.
- Download signed input assets.
- Write composition manifest/files required by official HyperFrames sidecar.
- Run sidecar with safe, allowlisted arguments.
- Keep the sidecar boundary local to the Tauri process: structured manifest
  files/stdin/stdout or equivalent local IPC only. Do not expose a local HTTP
  port or LAN service unless a later security review explicitly approves it.
- Stream progress events.
- Probe output media.
- Upload artifacts through existing upload API or server-issued signed
  direct/multipart/chunk upload sessions for large videos.
- Report `job.completed` only after all required artifacts are uploaded and
  local validation passes.
- Cleanup workspace files after success/failure according to retention policy.

## Web UI Plan

### User Job Monitor

Surfaces:

- New route such as `/render-jobs` or `/worker-jobs`.
- Optional compact panel from Storyboard Review.

Core UI:

- Job list with filters: all, queued, running, completed, failed, canceled.
- Job detail drawer/page:
  - source surface;
  - submitted time;
  - current state;
  - assigned worker if available;
  - elapsed time;
  - progress events;
  - output/download links;
  - cancel queued action;
  - request another worker action when eligible;
  - error/repair guidance.

### Admin Worker Monitor

Surface:

- Admin route or existing admin desktop/worker page.

Core UI:

- Worker table:
  - name;
  - owner;
  - tenant/group sharing scope;
  - status;
  - version;
  - runtime readiness;
  - current job;
  - last heartbeat;
  - warnings;
  - actions: pause/drain/revoke/view diagnostics.
- Job queue view:
  - waiting jobs;
  - assigned/running jobs;
  - stalled/requeued attempts;
  - completed/failed recent jobs.

### UI/UX Contract

#### Target User / JTBD

- Role: Storyboard Review user, worker owner, tenant admin.
- Goal: submit render work without waiting on the page, monitor progress, and
  recover/download completed outputs.
- Entry point: Storyboard Review render button, global/job monitor navigation,
  admin worker monitor.
- Success outcome: user can see whether a worker picked up the job, what it is
  doing, and where to download verified output.

#### Surface Inventory

| Surface | File/Route | Change |
| --- | --- | --- |
| Storyboard Review | `apps/web/client/src/pages/StoryboardReviewPage.tsx` | Submit worker job, show persisted worker-backed projection, link job monitor |
| User Job Monitor | new route/component | List user render jobs and job details |
| Admin Worker Monitor | admin route/component | Inspect workers, readiness, sharing, active jobs |
| Desktop Worker App | `apps/worker-app` Tauri frontend | Connection, settings, runtime doctor, current job |

#### Component Map

| Component | Owns | Consumes |
| --- | --- | --- |
| Render status panel | per-render status and actions | HyperFrames projection |
| Job list/table | queue history filters | job monitor API |
| Job detail drawer/page | events, artifacts, actions | job detail API |
| Worker fleet table | admin worker state | admin worker API |
| Desktop readiness panel | worker local state | Tauri commands and policy snapshot |

#### State Matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| loading | skeleton/spinner with stable layout | component tests and browser evidence |
| empty | "ยังไม่มีงาน render" / "No render jobs yet" | component tests |
| queued | waiting for worker, cancel action | service + UI tests |
| assigned/running | worker label, progress stage, elapsed | service + UI tests |
| uploading/verifying | upload/verify copy, no duplicate submit | service + UI tests |
| completed | output link and source context link | integration tests |
| failed/stalled | readable error, next action, retry/reassign when allowed | service + UI tests |
| disabled/focus/hover | visible disabled reason and focus ring | browser evidence |

#### Responsive Matrix

| Viewport | Expected Behavior | Evidence |
| --- | --- | --- |
| mobile 390x844 | stacked filters, cards, sticky primary action where needed | Playwright/manual screenshot |
| tablet 768x1024 | table or card list with detail drawer below/side | Playwright/manual screenshot |
| desktop 1440x900 | dense table + detail side panel | Playwright/manual screenshot |
| small-mobile 360x800 | no horizontal overflow for job titles/errors | extended evidence |
| laptop 1024x768 | admin table remains usable with horizontal containment | extended evidence |
| wide-desktop 1280x800 | dense admin/user monitor uses width without card nesting | extended evidence |

#### Accessibility Acceptance

- Keyboard path: submit, cancel, reassign, download, filter, and close drawer are
  reachable by keyboard.
- Focus visibility: all icon buttons and table actions have visible focus.
- Labels/semantics: icon-only controls have accessible names; tables use proper
  headings or ARIA labels.
- Contrast: status badges and error panels meet readable contrast.
- Reduced motion: progress/refresh animations respect reduced-motion settings.

#### Visual Direction

- Use existing SmartAIHub operational UI density.
- Avoid decorative hero/card-heavy layouts for monitors.
- Use existing status colors and control styles from Storyboard/Admin surfaces.
- Job monitor should be scannable and utilitarian: compact rows, clear status,
  readable Thai copy.

#### Copy Contract

- Primary language: Thai UI with English fallback where existing page does so.
- Error copy must say:
  - what happened;
  - whether credits were charged/reserved;
  - whether the job is queued/running/stalled/completed;
  - what the user can do next.
- Avoid raw command output unless under diagnostics/admin details.

#### Browser Evidence Required

Record evidence in
`specs/feature/124-smart-ai-hub-worker-app/implementation/ui-browser-evidence.md`
or the implementation section if no implementation directory exists. Required
viewports: mobile 390x844, tablet 768x1024, desktop 1440x900. Add small-mobile,
laptop, and wide desktop for admin/job tables.

## Auth And Security Plan

### Worker Pairing

Add worker-specific pairing based on the extension flow:

- start connection from desktop app;
- browser approval URL;
- approval page uses normal logged-in web session;
- no username/password/API-key/manual-token entry inside the desktop app;
- if login is needed, the browser handles normal SmartAIHub login before
  approval;
- optional custom protocol handoff back to `smartaihub-worker://connect` with
  device-code polling fallback;
- desktop app polls/exchanges device code;
- server issues worker registration token or directly registers worker and
  returns short-lived execution/upload tokens;
- refresh/rotation and revocation records are stored server-side.
- Worker App stores issued tokens in OS secure storage, refreshes them
  automatically, and clears them when connection is revoked, refresh token reuse
  is detected, or the user disconnects the app.
- One connection/token set is valid for one device key only. A copied access
  token or refresh token presented without the original device proof must be
  rejected; a copied refresh token or repeated device-key mismatch should revoke
  and block the token set so another machine cannot continue using it.

Token requirements:

- token type/audience must be worker-specific;
- access token payload must include at least `type:
  "smartaihub_connected_device"`, `deviceKind: "desktop_worker"`, `aud:
  "smart-ai-hub-worker-app"`, `connectionId`, `tenantId`, `userId`, `scopes`,
  `iss`, `jti`, `iat`, and `exp`;
- access tokens should be short-lived, and refresh tokens should rotate on every
  use with server-side hashed storage, matching the Chrome extension pairing
  pattern unless tenant policy is stricter;
- tokens must be device-bound. Each authenticated worker request should include
  a proof bound to the stored device key, such as a signed nonce/timestamp,
  request id, method, path, and token `jti`. The server must reject missing,
  invalid, stale, or wrong-device proofs before accepting heartbeat, claim,
  upload, complete, or refresh operations;
- route scopes should align with existing worker route conventions such as
  `workers:register`, `workers:heartbeat`, `workers:claim`, `workers:report`,
  and `workers:diagnostics`;
- product capability scopes from the spec, such as `worker:render:*`,
  `worker:artifact:upload`, `worker:status:write`, and future
  `worker:local-ai:*`, may be stored as worker capability/policy claims when
  useful, but must not let the token call unrelated APIs;
- tenant/user/team/sharing scope embedded or resolvable server-side;
- revocation by connection/device and automatic block on token replay,
  refresh-token reuse, or device proof mismatch;
- old extension token type rejected.

Worker-authenticated REST routes must use bearer authentication, reject
cookie-only state-changing requests, avoid wildcard CORS for authenticated
routes, and rate-limit connect polling, heartbeat, claim, diagnostics, artifact
upload init/complete, and future MCP tool calls.

### Desktop Security

- Do not run arbitrary shell commands.
- Sidecar command and arguments must be allowlisted.
- Downloaded runtime packs must be signed or hash-pinned.
- Workspace paths must be scoped to app data or configured safe folder.
- Logs must redact tokens, signed URLs, user secrets, prompts beyond support
  policy, and local paths where required.
- Local AI future adapters must be loopback-only unless a tenant-admin audited
  exception exists.

## Future Local AI Worker Plan

Add only contract stubs and extension points during this feature unless needed
by existing code:

- job families: `local_ai_text`, `local_ai_vision`, `local_ai_multimodal`;
- provider adapters: `ollama`, `lm_studio`;
- readiness: provider reachable on loopback, model available, modality support;
- inputs: text, images, files, expected output schema;
- outputs: structured JSON, text, image/file artifacts;
- server verification: schema, file hashes, size, MIME, safety metadata.

This should be designed as another worker job type sharing the same queue,
lease, artifact, and verification model.

## Future MCP Worker Plan

Add planning-level contracts and avoid blocking HyperFrames MVP on full MCP
implementation.

Future public MCP tools should use branded names so external agent clients do
not collide with other MCP servers:

- `smartaihub.worker.get_capabilities`
- `smartaihub.worker.register_capabilities`
- `smartaihub.worker.claim_job`
- `smartaihub.worker.get_job_manifest`
- `smartaihub.worker.report_progress`
- `smartaihub.worker.init_artifact_upload`
- `smartaihub.worker.complete_artifact_upload`
- `smartaihub.worker.complete_job`
- `smartaihub.worker.fail_job`
- `smartaihub.worker.release_job`

MCP workers must use the same assignment attempt model and server verification
as desktop workers.

Internal short names such as `worker.jobs.claim` may be used in code comments or
tests only if they map unambiguously to the public MCP tool names above.

## Observability, Audit, And Retention Plan

Add structured metrics and audit events as part of the worker rollout, not as a
post-launch afterthought.

Required metrics:

- connected desktop workers and MCP agent workers;
- active workers by tenant, kind, version, and runtime pack;
- queue depth, oldest waiting job, and no-eligible-worker count;
- job claim count and claim rejection reasons;
- render duration, upload duration, verification duration;
- verification failures by reason;
- heartbeat timeout count;
- user reassignment request count;
- automatic watchdog reassignment count;
- stale upload rejection count;
- worker token replay/device proof mismatch count;
- worker cooldown/block count.

Required audit events:

- worker connected/refreshed/revoked;
- worker token replay detected, device proof mismatch, refresh-token reuse, and
  connection auto-blocked for suspected copied token use;
- runtime doctor passed/failed;
- job claimed, reassignment requested, attempt stalled/abandoned/requeued;
- artifact uploaded;
- stale upload rejected;
- server verification passed/failed;
- job canceled/failed/completed.

Retention requirements:

- input manifests and signed URLs expire per active attempt;
- incomplete uploads expire and are garbage-collected;
- stale artifacts are rejected and cleaned/quarantined according to support
  policy;
- verified artifacts follow normal Media Library/project retention;
- sanitized logs are retained only as safe metadata unless explicit support mode
  is enabled.

## Rollout Plan

### Phase 1: Dark Launch Contracts

- Add shared contracts, server queue helper, projection bridge, and tests.
- Keep existing server render path as default.

### Phase 2: Worker App Readiness

- Add desktop runtime doctor and HyperFrames executor behind capability flag.
- Allow internal workers to register and claim HyperFrames jobs in staging.
- Produce a signed Windows installer or runtime-download package candidate for
  internal testing.

### Phase 3: Tenant-Gated Final Composite

- Enable `hyperframesWorkerFinalComposite` for selected tenants.
- Storyboard Review submits final composite to `worker_jobs`.
- Server render fallback disabled for those tenants.

### Phase 4: Production Cutover

- New final composite jobs use workers by default.
- Legacy outbox projection remains read-only for old jobs.
- Operator dashboard tracks queue depth, worker availability, stalled attempts,
  verification failures, and render duration.
- Windows release gate must pass install/uninstall/update, first-run connect,
  runtime doctor, minimize-to-tray, and fixture Storyboard Review render tests.

### Phase 5: Broader Render Migration

- Move other video render systems to worker queue one by one.
- Use the same artifact verification and monitor surfaces.

## Failure Modes And Handling

| Failure | Handling |
| --- | --- |
| no eligible worker | job remains queued with clear status and no server render fallback |
| runtime doctor fails | worker does not advertise capability; UI shows runtime blocker |
| worker crashes | lease expires; watchdog requeues if safe |
| user requests another worker | mark current attempt transfer requested and requeue after stale guard |
| stale worker uploads after reassignment | reject by assignment attempt/lease mismatch |
| upload succeeds but verification fails | mark failed/verifying failed; do not publish |
| worker reports invalid progress stage | reject event as invalid contract |
| credits reserved but job canceled before claim | release/refund reservation according to billing policy |
| manual/custom storyboard has no product | use manual storyboard access path; do not require marketplace product |
| MCP/local AI future job abuses scope | reject by worker token scopes, tenant policy, and job grants |

## Verification Strategy

Run tests incrementally by layer:

1. Shared contract tests for schemas/status mapping.
2. Scheduler tests for job creation, idempotency, feature flags, credit metadata.
3. Registry tests for claim/lease/attempt/event/upload/stale rejection.
4. HyperFrames runtime API tests for Storyboard Review submission/projection.
5. Server verification tests for artifacts and stale attempts.
6. Tauri Rust tests for claim/execute/upload event ordering.
7. Retention/cleanup tests for expired manifests, incomplete uploads, stale
   artifacts, and sanitized logs.
8. Observability/audit tests for key state transitions.
9. UI component tests for Storyboard Review, job monitor, admin monitor.
10. Browser evidence for responsive/accessibility states.
11. Windows smoke test with a sample HyperFrames render pack before production
   release.

## Out Of Scope For First Implementation

- Full macOS/Linux packaging.
- Full local AI job execution.
- Full MCP worker implementation beyond contracts/placeholders if not needed by
  current code.
- Complete migration of every existing video render system.
- Arbitrary custom command execution from worker jobs.
