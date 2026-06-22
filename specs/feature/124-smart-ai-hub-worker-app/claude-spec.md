# Synthesized Specification: Feature 124 Smart AI Hub Worker App

## Objective

Build **Smart AI Hub Worker App**, a Windows-first Tauri desktop worker that
runs HyperFrames final composite rendering outside the SmartAIHub web/server
process, uploads results to SmartAIHub storage, and lets the server verify and
publish final artifacts.

The worker platform must become the default direction for HyperFrames render
execution and a future foundation for other render and local-compute job types.

## Core Product Requirements

### Worker-Only HyperFrames Final Composite

- Storyboard Review final composite submissions must create worker jobs, not
  start normal server-side render execution.
- The server may build manifests, validate permissions, reserve credits,
  provide signed URLs, verify uploads, and publish results.
- The server must not perform the official HyperFrames final render work for the
  worker-enabled path.
- Server-side ASS/FFmpeg overlay fallback must not be accepted as the
  user-facing quality path for final composite.
- If official HyperFrames runtime is not ready, show an actionable blocker
  instead of silently falling back.

### Reuse Existing Worker Control Plane

- Use the existing worker runtime architecture:
  - `worker_jobs`
  - `workers`
  - `worker_heartbeats`
  - `worker_job_events`
  - `worker_artifacts`
  - `/api/workers/*`
  - `/api/worker-jobs/*`
- Add HyperFrames final composite as a first-class desktop worker job type.
- Reuse lease-based claim and ordered progress events, extending them only where
  required for long-running render safety.

### Tauri Desktop Worker

- Target Windows first.
- App name: **Smart AI Hub Worker App**.
- Implement as a separate lightweight Tauri workspace, `apps/worker-app`, not
  as the full `apps/tauri-shell` product.
- Existing `apps/tauri-shell` worker code may be reused only by extracting or
  copying narrow worker-control-plane/runtime helpers with tests.
- Support minimize/tray/background processing.
- Show connection state, runtime readiness, current job, progress, queue/idle
  state, last error, and diagnostics.
- Configuration must be UI-based, not `.env`-based for normal users.
- Runtime may be bundled in the installer or downloaded in app, but the user
  must not install Node, FFmpeg, browser, fonts, or HyperFrames manually.
- Runtime readiness must be checked before the worker accepts HyperFrames jobs.

### Worker Sharing And Assignment

- Workers may operate in private owner, group pool, or tenant pool mode.
- Normal users submit jobs without selecting a worker.
- The server atomically assigns one job to one eligible worker.
- Eligibility must enforce tenant, owner/group/shared policy, runtime
  compatibility, feature flags, worker status, and credit/quota policy.
- Queue policy must support priority, retry count, quota, and fairness metadata
  so one user/group cannot starve shared worker pools.
- Admins can inspect online/offline workers, owner, sharing scope, version,
  readiness, current job, warnings, and last heartbeat.

### Long-Running Reliability

- Workers can run jobs for long periods without web pages staying open.
- Storyboard Review and the standalone job monitor must show persisted state
  after refresh/reopen.
- Assignment state must include a stale-attempt guard so old uploads cannot
  complete a job after reassignment.
- After about 15 minutes, users can request another worker when a job appears
  slow.
- After about 30 minutes without completion or meaningful progress/heartbeat,
  the server watchdog should mark the attempt stalled and requeue or surface an
  operator-required state according to policy.
- Heartbeat responses may command cooperative stop/reassignment/timeout, and the
  worker must acknowledge the active attempt before the server requeues when
  possible.
- Repeated failures must stop infinite requeue loops through max-attempt and
  dead-letter policy.

### User Job Monitor

- Users need a web UI to monitor jobs across submit surfaces.
- It must show queued, assigned, running, uploading, verifying, completed,
  failed, canceled, and stalled states.
- It must show worker assignment state when available.
- It must provide download/open links for completed verified outputs.
- It must allow canceling queued jobs.
- It should link back to source contexts such as Storyboard Review when useful,
  but the monitor must not require opening the original submit page.

### Storyboard Review Integration

- `Render Final Composite` should submit a worker job and immediately return a
  trackable render/job projection.
- Existing `getHyperframesRenderJob` style polling should continue to work.
- A refresh or reopening `/storyboard-review/:id` must recover the latest
  associated job status and output link.
- Custom/manual storyboard jobs that are not bound to marketplace products must
  be allowed when the user owns the project.
- Projection copy must be user-readable in Thai/English, with actionable next
  steps and elapsed/started/updated local time.

### Server Verification

Before marking final composite completed, the server must verify:

- job id, tenant id, requester id, worker id, lease/attempt identity;
- composition input hash and timeline hash;
- runtime profile and HyperFrames runtime evidence;
- output file exists, hash matches, media probes, duration/aspect/fps sane;
- expected subtitles/audio tracks are present according to manifest;
- uploaded artifacts match expected MIME types and size limits;
- no stale worker attempt is completing the job;
- result can be persisted to normal artifact/Media Library paths.

Retention and cleanup are part of verification: signed input manifests expire,
incomplete uploads are garbage-collected, stale attempt artifacts are rejected
and deleted or quarantined, and support logs are sanitized before storage.

### Auth And Connection

- Use the same user-facing connect pattern as the Chrome extension: desktop app
  opens a browser approval URL, and an already logged-in web session approves
  the device.
- The Worker App must not show a SmartAIHub username/password login form, ask
  for API keys, or require manual token copy/paste. If the user is not logged in,
  login happens in the normal SmartAIHub browser session, and the app only sees
  device-code approval state and issued worker tokens.
- After approval, the app receives a short-lived worker access token and a
  rotating refresh token, stores them in OS secure storage, refreshes them
  automatically, and reconnects only when approval is revoked/expired or refresh
  rotation fails.
- One approved worker token set must be bound to exactly one Worker App
  installation/device. The app must generate or store a per-install device key
  in OS secure storage, and the server must bind the connection/token set to
  that key/device identity. If the same token or refresh token is replayed from
  another device/key, the server must reject it, revoke/block that token set, and
  require a fresh browser approval.
- Worker auth must use worker-specific token type/audience/scopes and revocation
  records.
- Extension tokens must not be accepted for worker routes.
- Worker tokens must not call unrelated marketplace/media/admin APIs.
- Users/admins must be able to revoke worker connections.
- Route enforcement should align with the existing worker bearer-token control
  plane while keeping desktop worker tokens separate from extension tokens.

### Observability And Operations

- Track connected workers, queue depth, oldest waiting job, claim counts,
  render/upload/verification duration, verification failures, heartbeat
  timeouts, reassignment requests, watchdog requeues, stale upload rejections,
  and worker cooldown/block counts.
- Audit connect/refresh/revoke, runtime doctor pass/fail, claim, reassign,
  stall, requeue, upload, verification pass/fail, cancel, fail, and complete.
- Admin monitor must expose operational health without raw tokens, signed URLs,
  local paths, or unredacted logs.
- Windows release gate must cover install, uninstall, update, first-run browser
  pairing, UI-only config, runtime doctor, minimize-to-tray, and fixture
  Storyboard Review render.

### Future Local AI Jobs

Plan for future worker job types that call local AI runtimes such as LM Studio
or Ollama.

Requirements to reserve:

- loopback-only provider adapters;
- provider/model readiness checks;
- input text/image/file artifacts;
- structured output schemas;
- output upload and server verification;
- tenant policy controls and size/safety limits.

Full local AI implementation is not required in the first HyperFrames MVP, but
the job type model must not block it.

### Future MCP Agent Workers

Plan for MCP-capable agents such as Claude, Codex, Hermes, and others to claim
and complete SmartAIHub jobs through MCP.

The future MCP server should expose branded public tools for:

- `smartaihub.worker.get_capabilities`;
- `smartaihub.worker.register_capabilities`;
- `smartaihub.worker.claim_job`;
- `smartaihub.worker.get_job_manifest`;
- `smartaihub.worker.report_progress`;
- `smartaihub.worker.init_artifact_upload`;
- `smartaihub.worker.complete_artifact_upload`;
- `smartaihub.worker.complete_job`;
- `smartaihub.worker.fail_job`;
- `smartaihub.worker.release_job`.

MCP workers must use the same tenant/auth/lease/attempt/artifact verification
model as desktop workers.

## Non-Goals

- Do not move final render into the browser tab.
- Do not require users to configure `.env` files.
- Do not require manual installation of command-line dependencies for normal
  users.
- Do not accept preview-divergent fallback output as final composite.
- Do not build a second queue when the existing worker queue can be extended.
- Do not implement full macOS/Linux support in the first release.
- Do not implement arbitrary local code execution.
- Do not bypass SmartAIHub storage, audit, billing, and verification.

## Primary Deliverables

1. Shared HyperFrames worker job contracts in `apps/web/shared/workerRuntime.ts`
   or focused shared modules imported by it.
2. Server scheduler support for `hyperframes_final_composite` worker jobs.
3. Worker registry/claim/event/artifact extensions for long-running
   HyperFrames attempts and stale-attempt protection.
4. HyperFrames render projection bridge from `worker_jobs` to
   `HyperframesRenderStatusProjection`.
5. Storyboard Review final composite submission routed to worker queue.
6. User job monitor UI and admin worker monitor UI.
7. Separate `apps/worker-app` Tauri Smart AI Hub Worker App for connection,
   settings, background loop, runtime doctor, HyperFrames sidecar execution,
   upload, and progress.
8. Server-side verification and publish path for worker-rendered HyperFrames
   artifacts.
9. Rollout flags and migration safeguards that prevent server render fallback
   after the worker path is enabled.
10. Future-facing contracts for local AI and MCP worker job families.

## Acceptance Criteria

- A user can submit a Storyboard Review final composite job and close/refresh
  the page without losing job visibility.
- An eligible Windows Smart AI Hub Worker App claims the job, runs official
  HyperFrames runtime locally, uploads artifacts, and reports progress.
- Server verification marks the job completed only after artifact and manifest
  validation passes.
- Completed jobs show a download/open link in both Storyboard Review and the
  user job monitor.
- Queued jobs can be canceled by the requester.
- Admin can see worker fleet state and current job assignment.
- A stalled assignment can be requeued without accepting stale uploads from the
  old worker.
- Runtime-not-ready states are clear and actionable, not silent fallback.
- Existing extension tokens cannot authenticate worker routes.
- Existing worker route tests, HyperFrames tests, Storyboard Review tests, and
  Tauri worker tests cover the new path.
