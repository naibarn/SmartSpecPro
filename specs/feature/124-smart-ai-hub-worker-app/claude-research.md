# Research: Feature 124 Smart AI Hub Worker App

Date: 2026-06-22
Planning directory: `specs/feature/124-smart-ai-hub-worker-app`

## Research Decision

Codebase research was required because the feature changes the render execution
architecture, queue semantics, auth, storage/artifacts, Storyboard Review UI, and
desktop worker app. Web research was required for current Tauri, MCP, OAuth
device-flow, Ollama, LM Studio, and HyperFrames sidecar/runtime constraints.

## Codebase Findings

### Existing Generic Worker Runtime Exists

The repo already has a generic worker control plane. The plan should extend it
instead of creating a parallel queue.

Important files:

- `apps/web/shared/workerRuntime.ts`
  - Defines worker runtime protocol versions, runtime types, worker status,
    job status, scopes, progress/failure vocabularies, runtime metadata schemas,
    registration, heartbeat, claim, event, artifact upload, and diagnostics
    payloads.
  - Current runtime type values include:
    - `openclaw_gateway`
    - `desktop_zeroclaw_managed`
    - `nemoclaw_sandbox`
    - `hiclaw_cluster`
    - `hermes_agent_gateway`
  - Current desktop job contracts include `video_assembly`, `local_folder_ingest`,
    `comfy_image_generation`, and `comfy_workflow_run`.
  - Missing for this feature: a first-class HyperFrames final composite job
    contract, progress stages, failure codes, capability family, and runtime
    metadata for HyperFrames readiness.

- `apps/web/drizzle/schema.ts`
  - Existing tables:
    - `workers`
    - `worker_heartbeats`
    - `worker_jobs`
    - `worker_job_events`
    - `worker_artifacts`
    - `worker_delegated_sessions`
    - `worker_job_grants`
  - Existing `worker_jobs` fields already support tenant/team/requester,
    runtime type, job type, status, priority, resource profile, input/instruction
    JSON, output JSON, timeout, retry policy, idempotency key, lease owner token,
    lease expiry, and timestamps.
  - Missing for this feature:
    - richer assignment attempt identity if stale uploads must be rejected after
      reassignment;
    - explicit user-requested reassign/cancel metadata;
    - search/projection indexes for job monitor surfaces if current indexes are
      not enough for user history;
    - optional source-domain fields linking worker jobs back to HyperFrames
      render projections.

- `apps/web/server/routes/workerRuntime.ts`
  - Existing REST endpoints:
    - `POST /api/workers/register`
    - `POST /api/workers/:workerId/heartbeat`
    - `GET /api/workers/:workerId/policy`
    - `POST /api/workers/:workerId/jobs/claim`
    - `POST /api/worker-jobs/:jobId/events`
    - `POST /api/worker-jobs/:jobId/artifacts/init-upload`
    - `POST /api/worker-jobs/:jobId/artifacts/complete`
    - `POST /api/workers/:workerId/diagnostics`
    - delegated worker session/callback endpoints
  - Existing auth uses worker registration/execution/upload bearer tokens and
    scope checks.
  - Missing for this feature: HyperFrames-specific claim contract, final
    verification endpoint or worker-completed verifier handoff, user/admin job
    monitor APIs, user cancel/reassign APIs, and MCP worker-facing equivalents.

- `apps/web/server/services/workerRegistryService.ts`
  - Existing claim flow validates worker scope, worker status, candidate jobs,
    capability hints, assigns a `leaseOwnerToken`, and returns a lease.
  - Existing event flow enforces lease token, ordered positive `sequenceNumber`,
    runtime-specific progress/failure vocabularies for known job types, and
    terminal publishing/billing reconciliation.
  - Existing artifact flow creates storage refs and presigned upload targets,
    then records artifacts.
  - Missing for this feature:
    - lease renewal or long-running heartbeat semantics tied to one job attempt;
    - stalled-at-15m/30m policy;
    - stale-attempt rejection based on assignment attempt as well as lease token;
    - HyperFrames post-upload verification before marking final render complete.

- `apps/web/server/services/workerSchedulerService.ts`
  - Existing queue helpers insert desktop worker jobs and reserve credits.
  - `queueDesktopVideoAssemblyJob` is the closest existing pattern for a
    long-running desktop render job.
  - Missing for this feature: `queueDesktopHyperframesFinalCompositeJob` or a
    generalized `queueDesktopRenderJob` branch that accepts a HyperFrames
    composition envelope and creates a `worker_jobs` row.

### Current HyperFrames Final Composite Still Uses Outbox And Server Worker

Important files:

- `apps/web/server/services/hyperframesRuntimeApiService.ts`
  - `createHyperframesFinalCompositeForApi` builds final composite composition,
    validates source videos and audio assets, checks runtime readiness, queues a
    HyperFrames render job, and then calls `dispatchHyperframesFinalCompositeWorker`.
  - `dispatchHyperframesFinalCompositeWorker` enqueues Cloud Tasks when
    configured or starts a detached local Node worker fallback.
  - This is the behavior the new plan must replace for final composite:
    Storyboard Review should submit to the worker queue, not start server render
    execution.

- `apps/web/server/services/hyperframesRenderService.ts`
  - `queueHyperframesRenderJob` writes to `marketplaceAutoReviewOutboxJobs` and
    uses an idempotent render job id based on composition hash/runtime profile.
  - It also supports manual storyboard identities by inserting synthetic
    Marketplace product/run parents.
  - `getHyperframesRenderProjection` reads outbox jobs and maps status into
    user-facing HyperFrames projection.
  - Missing for this feature: a projection bridge from `worker_jobs` to
    `HyperframesRenderStatusProjection`, preserving current UI contracts while
    changing execution backend.

- `apps/web/server/workers/hyperframesRenderWorker.ts`
  - Current server/background worker locks `marketplaceAutoReviewOutboxJobs`,
    heartbeats locks, runs official HyperFrames CLI/producer runtime, can fall
    back to FFmpeg/ASS behavior in some cases, and writes artifacts/storage.
  - This code contains useful render-runtime logic and verification ideas, but
    it must stop being the normal execution path once final composite moves to
    desktop workers.
  - The deep implementation should carefully extract/share render input,
    runtime doctor, and verification helpers rather than duplicating all logic.

### Storyboard Review UI Is Already Coupled To HyperFrames Render Projection

Important files:

- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
  - Uses `marketplaceCapture.createHyperframesFinalComposite` and
    `marketplaceCapture.getHyperframesRenderJob`.
  - Stores/renderJobId in URL and page state.
  - Polls current render projection and shows status, elapsed/started/updated
    local time, errors, output video URL, repair actions, and Library save state.
  - Has advanced final composite controls, shot splitting, preview/playback,
    subtitle/transcribe tools, hook/supporting text, per-shot overlay text, and
    autosave/edit-state complexity.
  - The worker migration should preserve `getHyperframesRenderJob` as the
    canonical polling contract so refresh/reopen keeps seeing submitted jobs.

### Existing Tauri Shell Is A Reference, Not The Worker Product

Important files:

- `apps/tauri-shell/src-tauri/tauri.conf.json`
  - Product currently named `SmartAIHub Desktop`, identifier
    `com.smartspec.pro`.
  - Bundles external FFmpeg/FFprobe sidecars and LiteRT resources.
  - Current CSP allows self, HTTPS/WSS connects, inline style, and shell
    execute/open via capabilities.

- `apps/tauri-shell/src-tauri/capabilities/default.json`
  - Grants broad defaults including `shell:allow-execute` and `fs:default`.
  - The separate `apps/worker-app` must use narrower command allowlists and
    sidecar-specific permissions; do not copy the broad shell capability set.

- `apps/tauri-shell/src-tauri/src/desktop_worker_executor.rs`
  - Existing loop claims worker jobs, executes job-specific local actions,
    reports ordered events, uploads local artifacts, and supports multiple job
    types.
  - Current known executors include video assembly, local folder ingest, Comfy
    image generation, and Comfy workflow run.
  - Missing for this feature: HyperFrames final composite executor that runs an
    official HyperFrames sidecar/runtime pack, streams progress, produces MP4,
    manifest, snapshots, logs, runtime doctor report, and uploads all outputs.

- `apps/tauri-shell/src-tauri/src/desktop_worker_control_plane.rs` and tests
  - Existing functions build worker registration/heartbeat payloads, claim jobs,
    report events, and upload artifacts.
  - Existing tests already mock control plane paths and validate job claim and
    upload behavior.

### Existing Desktop Host / Release Surfaces

Important files:

- `apps/web/server/routes/desktopHost.ts`
- `apps/web/shared/desktopHost.ts`
- `apps/web/server/routes/desktopReleases.ts`
- `apps/web/client/src/features/desktop-releases/DesktopReleasePanel.tsx`

These surfaces already support desktop host policy and release download
patterns. The Worker App installation/download UX should reuse these surfaces
where possible and add a specific “Smart AI Hub Worker App” product/channel
rather than inventing a separate release catalog.

### Existing Extension Pairing Pattern

Important files:

- `apps/web/server/services/marketplaceExtensionAuthService.ts`
- `apps/web/server/routes/marketplaceCapture.ts`
- `apps/web/client/src/pages/MarketplaceCaptureConnect.tsx`
- `specs/feature/113-marketplace-capture-extension/spec.md`
- `specs/feature/113-marketplace-capture-extension/sections/section-03-extension-auth-cors.md`

The extension auth model issues scoped bearer tokens with device binding,
pairing records, `jti`, tenant/user, revocation, expiry, and origin/device
checks. Worker App auth should follow the same user-facing connect/approve
pattern, but token use and scopes must be worker-specific:

- token type should not be `marketplace_extension`;
- scopes should include worker registration/heartbeat/claim/report/diagnostics;
- paired worker management should be visible and revocable like extension
  connections;
- worker tokens must not call marketplace capture APIs.

### MCP Worker Support Already Has Some Foundation

Important files:

- `apps/web/server/_core/mcpRoutes.ts`
- `apps/web/server/_core/mcpRoutes.delegatedWorker.test.ts`
- `apps/web/shared/workerDelegation.ts`
- `apps/web/server/services/workerDelegationService.ts`

The repo already distinguishes delegated worker access and MCP route policy.
The feature should plan an MCP worker surface as an extension of the worker job
queue, not as a replacement for desktop workers. MCP tools should claim jobs,
read manifests, report progress, upload results, and complete/fail jobs under
the same lease/attempt model.

## Web Research Findings

### Tauri 2

Primary sources:

- Tauri sidecars: https://v2.tauri.app/develop/sidecar/
- Tauri Node.js sidecars: https://v2.tauri.app/learn/sidecar-nodejs/
- Tauri updater plugin: https://v2.tauri.app/plugin/updater/
- Tauri Windows installer: https://v2.tauri.app/distribute/windows-installer/
- Tauri capabilities: https://v2.tauri.app/security/capabilities/
- create-tauri-app: https://github.com/tauri-apps/create-tauri-app

Implications:

- Official sidecars are the right primitive for bundling or launching the
  HyperFrames runtime and FFmpeg/FFprobe binaries from a desktop app.
- A Windows-first worker app should be a separate lightweight `apps/worker-app`
  workspace. Existing Tauri shell code is useful only as a reference/extraction
  source for narrow worker helpers; the shipped worker product should not be the
  full shell with renamed metadata.
- Runtime pack download/update should use signed manifests and hash checks. If
  using a lightweight installer, the app should download the render runtime from
  the web release catalog and verify it before accepting jobs.
- Capabilities should explicitly permit only needed commands/files/network
  surfaces. A broad `shell:allow-execute` must be treated as a security risk for
  a worker that handles tenant assets.

### OAuth Device Authorization Flow

Primary source:

- RFC 8628 OAuth 2.0 Device Authorization Grant:
  https://www.rfc-editor.org/rfc/rfc8628

Implications:

- The desired “connect from desktop, approve in browser, no extra login inside
  app” flow is a standard device authorization pattern.
- Worker pairing should use short-lived device/user codes, polling interval,
  expiry, rate limiting, approval screen, refresh token rotation, and revocation.
- This maps well to the existing Chrome extension pairing UX but should use a
  worker-specific token audience/type and scopes.

### Model Context Protocol

Primary source:

- MCP official documentation: https://modelcontextprotocol.io/

Implications:

- MCP support should expose stable tools around worker queue actions instead of
  asking agents to call internal DB or tRPC directly.
- Required future tools:
  - list/claim eligible jobs
  - get job manifest/assets
  - report progress
  - request artifact upload
  - complete/fail/release assignment
- MCP workers must still honor tenant/user scopes, assignment lease, and
  artifact verification.

### Ollama And LM Studio

Primary sources:

- Ollama API docs: https://github.com/ollama/ollama/blob/main/docs/api.md
- Ollama docs: https://docs.ollama.com/
- LM Studio local server docs: https://lmstudio.ai/docs

Implications:

- Future local AI worker jobs should integrate through loopback-only HTTP
  adapters with explicit provider health/model discovery.
- The server must not assume one provider. Job contracts should specify provider
  family, required modality, model constraints, expected output schema, timeout,
  and artifact limits.
- The desktop app should treat local AI as a future capability family, separate
  from HyperFrames render readiness.

### HyperFrames Runtime

Primary sources:

- HyperFrames docs: https://hyperframes.heygen.com/introduction
- HyperFrames CLI docs: https://hyperframes.heygen.com/packages/cli
- HyperFrames producer docs: https://hyperframes.heygen.com/packages/producer
- HyperFrames GitHub: https://github.com/heygen-com/hyperframes

Implications:

- The desired quality path should use official HyperFrames CLI/producer/browser
  runtime.
- Server-side ASS/FFmpeg overlay fallback is not acceptable for final composite
  quality because it can diverge from preview.
- Worker runtime doctor must verify official runtime readiness before claiming
  HyperFrames jobs: Node/runtime availability, browser readiness, fonts, FFmpeg,
  FFprobe, package version, sample CSS/browser render readiness, and Thai text
  rendering.

## Testing

Existing repo conventions:

- Web/server/client TypeScript tests are run through the repo package scripts
  and existing test files under `apps/web/server/.../__tests__`,
  `apps/web/server/routes/__tests__`, `apps/web/client/src/pages/*.test.tsx`,
  and `apps/web/shared/**/__tests__`.
- Tauri/Rust tests use:
  - `npm --workspace apps/tauri-shell test`
  - which maps to `cargo test --manifest-path src-tauri/Cargo.toml`
- Existing worker runtime tests:
  - `apps/web/server/routes/__tests__/workerRuntime.test.ts`
  - `apps/web/server/services/__tests__/workerRegistryService.test.ts`
  - `apps/web/server/services/__tests__/workerSchedulerService.test.ts`
  - `apps/tauri-shell/src-tauri/tests/desktop_worker_control_plane_tests.rs`
  - `apps/tauri-shell/src-tauri/tests/desktop_worker_runtime_tests.rs`
  - `apps/tauri-shell/src-tauri/src/desktop_worker_executor.rs` internal tests
- Existing HyperFrames tests:
  - `apps/web/server/services/__tests__/hyperframesRenderService.test.ts`
  - `apps/web/server/services/__tests__/hyperframesRuntimeApiService.test.ts`
  - `apps/web/server/services/__tests__/hyperframesRuntimeAdapter.test.ts`
  - `apps/web/server/services/__tests__/hyperframesCompositionService.test.ts`
  - `apps/web/client/src/pages/StoryboardReviewPage.hyperframesText.test.ts`

Recommended verification commands for implementers:

- `npm test -- --runInBand apps/web/server/services/__tests__/workerSchedulerService.test.ts`
- `npm test -- --runInBand apps/web/server/services/__tests__/workerRegistryService.test.ts`
- `npm test -- --runInBand apps/web/server/services/__tests__/hyperframesRuntimeApiService.test.ts`
- `npm test -- --runInBand apps/web/server/routes/__tests__/workerRuntime.test.ts`
- `npm test -- --runInBand apps/web/client/src/pages/StoryboardReviewPage.hyperframesText.test.ts`
- `npm --workspace apps/tauri-shell test`

The exact command may need adjustment to the repo's package scripts during
implementation; use the existing closest commands if these names differ.

## Architecture Decision From Research

The implementation should not build a new worker queue. It should:

1. Add HyperFrames final composite as a first-class desktop worker job type in
   the existing `worker_jobs` system.
2. Keep the existing HyperFrames render projection API as the UI-facing
   compatibility layer, but back final composite status from `worker_jobs`.
3. Disable server/background render execution for final composite once the
   worker feature flag is active.
4. Reuse Tauri shell worker loop and add a HyperFrames sidecar executor.
5. Reuse extension-style pairing UX, but issue worker-specific tokens and
   connection records.
6. Plan MCP/local AI as future capability families on the same queue/lease/
   artifact/verification contract.
