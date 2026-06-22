# Feature 124: Smart AI Hub Worker App

Version: 0.1.0
Date: 2026-06-22
Status: Proposed
Depends-on:
- Feature 113 Marketplace Capture Extension
- Feature 119 HyperFrames Marketplace Auto Review Render Adapter
- Feature 122 Video Segment Planner Multi Shot Storyboard Review
- Existing Marketplace Auto Review outbox/artifact persistence
- Existing Storyboard Review final composite render flow
- Existing Chrome extension pairing/scoped token/revocation model
- Existing storage, audit, credit, tenant access, and Media Library systems
External references:
- Tauri create-tauri-app: https://github.com/tauri-apps/create-tauri-app
- Tauri sidecar docs: https://v2.tauri.app/develop/sidecar/
- Tauri Node.js sidecar docs: https://v2.tauri.app/learn/sidecar-nodejs/
- Tauri capabilities and permissions: https://v2.tauri.app/security/capabilities/
- Tauri updater docs: https://v2.tauri.app/plugin/updater/
- Tauri Windows installer docs: https://v2.tauri.app/distribute/windows-installer/
Audience: Product, Desktop App, Web API, HyperFrames Runtime, Render Workers, Security, QA, DevOps

---

## 1. Executive Summary

Build a Windows-first desktop render worker named **Smart AI Hub Worker App**.

The app is the first step toward moving SmartAIHub video rendering out of the
web/server runtime and into worker-based render execution. SmartAIHub remains
the source of truth for job creation, scheduling, permission checks, artifact
storage, audit, billing, and final verification, but the server should not
perform HyperFrames final render work itself.

This feature must not move final render into the browser. It creates a trusted
worker render path:

1. User installs Smart AI Hub Worker App on Windows.
2. User connects the app using the same pairing and scoped token pattern as the
   Marketplace Capture Chrome extension, so they do not need to manually log in
   again inside the app.
3. Storyboard Review submits a final composite job to the SmartAIHub render
   queue. The user does not need to know which worker machine will run it.
4. Eligible desktop workers poll the server for work that belongs to their
   private, group, or tenant-shared worker pool.
5. The server atomically assigns and locks one job to one worker at a time.
6. The Tauri app downloads signed job assets, runs the official HyperFrames
   sidecar/runtime locally, uploads MP4 and verification metadata, and reports
   progress.
7. The server verifies hashes, runtime evidence, playback, template/timeline
   identity, tenant permissions, and final QA before marking the render complete.

The MVP targets Windows only. macOS and Linux support are intentionally deferred
until the Windows packaging, updater, security, and verification loop is stable.

Strategic direction:

- All HyperFrames final composite renders should run through workers, not inside
  the SmartAIHub web/server process.
- Server render fallback is not an acceptable quality or capacity path.
- Existing server-rendered video flows should be treated as legacy and migrated
  to worker execution in phases.
- Future video render features should target the worker queue/claim/upload/
  verification contract by default.
- The worker platform should remain extensible for non-render job types that
  need local compute, including future local AI jobs.

---

## 2. Product Goals

### 2.1 Primary Goals

- Eliminate web/server CPU/GPU/render load for HyperFrames final composite jobs
  by moving render execution to workers.
- Establish the worker queue as the standard render path for HyperFrames first,
  then for other SmartAIHub video render systems over time.
- Keep the worker architecture generic enough to support future job kinds beyond
  rendering, such as local AI inference through user-managed runtimes.
- Let users keep rendering long videos even if the web page is closed or
  refreshed, as long as the desktop worker app remains running.
- Preserve final output quality by using the official HyperFrames CLI or
  producer runtime, not browser-only canvas/MediaRecorder/ffmpeg.wasm output.
- Keep the UX simple: install the app, connect once, then users submit render
  jobs normally from Storyboard Review without needing to choose a machine.
- Reuse the Chrome extension auth model so the app can connect through an
  already logged-in browser session instead of asking the user to understand a
  separate credential flow.
- Show live render status in the desktop app and web UI.
- Let the server accept output only after server-side verification succeeds.
- Support private, group-shared, and tenant-shared desktop worker pools.
- Prevent silent fallback to server-side render when workers are unavailable;
  show queue/waiting/error states instead.

### 2.2 Non Goals For MVP

- No browser-tab final rendering.
- No arbitrary user-provided code execution.
- No direct inbound network access to the user's machine.
- No macOS/Linux installers in MVP.
- No marketplace capture inside this desktop app.
- No local-only outputs that bypass SmartAIHub storage, audit, credit, and QA.
- No use of ASS/FFmpeg overlay fallback as a user-facing quality path.
- No server-side final video render fallback after this worker path is enabled
  for a render type.

---

## 3. User Experience

### 3.1 Installation Options

The product should support two packaging profiles. The first Windows release may
ship either one, but the UX must hide dependency complexity from the user.

1. Complete installer
   - Installer includes the Tauri shell, worker UI, Node/HyperFrames sidecar,
     FFmpeg/FFprobe, Chromium or Playwright browser binary, and Thai-capable
     fonts required for final render.
   - Largest download, simplest first-run experience.
   - Recommended default for non-technical users if installer size is
     acceptable.

2. Lightweight installer with in-app runtime download
   - Installer includes the Tauri shell and minimal worker control UI.
   - On first launch, the app shows one clear action: `Download render runtime`.
   - Runtime pack download is signed, hash-verified, resumable, and extracted to
     the app data directory.
   - The user must not need to install Node, FFmpeg, Chrome, fonts, or
     HyperFrames manually.

Both profiles must end in the same state: the user can press a single readiness
button, pass doctor checks, and accept jobs.

Windows MVP recommendation:

- Prefer the complete installer for the first public Windows release unless the
  installer size becomes unacceptable.
- If the lightweight installer is used, the first-run UI must guide the user
  through runtime download with one primary action and no technical choices.
- The installed app must be usable without reading developer docs, editing
  `.env`, installing command line tools, or copying configuration values by hand.

### 3.2 First Run

Required flow:

1. Show app name: Smart AI Hub Worker App.
2. Show connection state: `Not connected`.
3. Primary action: `Connect to Smart AI Hub`.
4. App opens a SmartAIHub browser verification URL.
5. If the user is already logged in to SmartAIHub in that browser, they only
   approve the worker connection.
6. If not logged in, the normal web login flow runs in the browser, not inside
   the desktop app.
7. After approval, the desktop app receives a one-time callback or polls the
   token endpoint and stores a scoped worker token.
8. App runs local doctor checks and shows `Ready for render jobs` only when the
   runtime is complete.

### 3.3 Configuration UX

All worker configuration must be managed in the desktop UI or SmartAIHub web UI.
The Windows app must not require `.env` files for normal users.

Required desktop settings:

- SmartAIHub environment/server URL selected from safe presets or approved
  tenant-provided links.
- worker device label, editable by the user.
- accept jobs toggle.
- sharing mode:
  - private: only jobs submitted by the worker owner
  - group shared: jobs submitted by selected groups
  - tenant shared: jobs submitted by any allowed user in the tenant
- start with Windows toggle.
- minimize to tray toggle.
- max concurrent jobs, default `1` for MVP.
- local workspace/cache folder, with a safe default in app data.
- local cache size limit and cleanup action.
- runtime pack version and update channel.
- diagnostics level: normal or support bundle only.

Required behavior:

- Settings are stored in the app data directory and OS secure storage where
  appropriate.
- Tokens are stored in secure storage, never in plaintext config files.
- Advanced/debug fields may exist behind a diagnostics section, but the happy
  path must not expose raw URLs, tokens, command paths, or environment variable
  names.
- If required configuration is missing, the UI must show one clear next action,
  such as `Connect to Smart AI Hub` or `Download render runtime`.

### 3.4 Storyboard Review Web UX

Storyboard Review should treat final composite render as a normal job submit.
The user should not need to know which worker machine is online, where it runs,
or who owns it.

Normal user UI may show:

- render target policy:
  - `Auto`
  - `Worker pool`, when tenant policy allows worker rendering
  - `Queue only`, when no compatible worker is currently available but the job
    can wait
- queue status:
  - waiting for worker
  - assigned to worker
  - rendering
  - uploading
  - server verifying
  - completed
- clear disabled states:
  - no eligible desktop worker pool
  - runtime pack missing
  - all eligible workers busy
  - worker version unsupported for this job
  - tenant policy does not allow local render

Normal user UI must not require selecting a specific worker by machine name.
Advanced/admin screens may expose exact worker identity for operations.

The web UI must continue to work if no desktop worker exists.

### 3.5 User Job Monitor

Users must have a dedicated UI to monitor submitted worker jobs without going
back to the original submit page. Product navigation may call this `Render Jobs`
for the HyperFrames MVP, but the underlying UI should support future non-render
job kinds.

Required entry points:

- Dashboard navigation item, for example `Render Jobs`, `My Jobs`, or
  `My Render Jobs`.
- Link from Storyboard Review after submitting a render job.
- Link from project/storyboard render history.

The monitor must support many outstanding jobs per user. A user should be able
to submit more jobs into the queue without waiting for earlier jobs to finish,
subject to tenant credit, storage, quota, priority, and abuse-control policy.

Required columns or card fields:

- job id / short ref
- submitted at, shown in the user's timezone
- assigned at, when a worker has claimed the job
- project/storyboard name
- render type, for example HyperFrames final composite
- status:
  - waiting for worker
  - assigned to worker
  - worker downloading assets
  - rendering
  - uploading
  - server verifying
  - transfer requested
  - reassigned
  - stalled
  - completed
  - failed
  - cancelled
- current safe message or next step
- progress percentage when available
- estimated or elapsed time
- reassignment eligibility timer, when a worker attempt is slow
- attempt count and last reassignment safe reason
- assigned worker status, shown as a generic pool status for normal users
- result links when completed:
  - download MP4
  - view text/JSON output, for future local AI jobs
  - download generated files, for future non-video job types
  - open Media Library artifact
  - open project/storyboard result
  - optional thumbnail/preview

Required actions:

- cancel a job that is still waiting for worker assignment
- request another worker after the job has been assigned/running for at least
  15 minutes and has not reached upload/server verification
- open job detail
- retry failed transient job, when policy allows
- copy result link, when completed
- filter by status, project, date range, and render type
- search by job id or project/storyboard name

Cancellation rules:

- Users can cancel jobs that are queued and not yet claimed by a worker.
- Once a worker has claimed a job, normal user UI should show `Cancel requested`
  only if server policy supports cooperative cancellation. Otherwise it should
  explain that the job is already running.
- Cancelled queued jobs must release reserved queue slots and any refundable
  credit reservation according to billing policy.
- Cancelled jobs remain visible in job history with a safe reason.
- Reassignment requests remain visible in job history, including previous
  attempt id, previous attempt safe label that does not reveal machine identity,
  new queue state, and new worker status after another worker claims the job.

Normal user UI must not reveal worker machine names, owner names, raw signed
URLs, raw composition HTML, or private worker diagnostics. Admin UI can expose
worker identity separately.

### 3.6 Desktop Worker UI

The desktop app should show:

- connection state
- active tenant/user label
- worker online/offline toggle
- runtime readiness checklist
- available disk space and runtime pack version
- current job list:
  - eligible queued jobs, when shown
  - claimed by this worker
  - downloading assets
  - rendering
  - uploading
  - server verifying
  - completed
  - failed with safe reason
- current job progress:
  - job id short ref
  - project/storyboard name
  - render intent
  - duration
  - shot count
  - elapsed time
  - current phase
  - upload progress
- controls:
  - pause accepting new jobs
  - cancel current job, if server policy allows
  - retry failed transient local step
  - minimize to system tray
  - open app window from tray
  - open logs folder for local diagnostics
  - copy support bundle with redaction
- app/runtime update status

The UI must not show raw signed URLs, raw composition HTML, bearer tokens, or
unredacted server logs.

### 3.7 Admin Worker Monitor

Admin UI must provide an operational view of connected workers.

Required columns:

- worker connection id / short id
- device label
- owner user
- tenant
- worker kind: desktop app, managed worker node, or MCP agent worker
- sharing mode: private, group shared, tenant shared
- allowed groups, when applicable
- app version
- runtime pack version
- status: offline, idle, busy, paused, blocked, needs update, revoked
- current job id and project/storyboard, when busy
- current phase and progress
- current attempt number and lease expiry
- worker execution duration
- stall/reassignment status
- last heartbeat
- last progress event time
- connected at
- last error safe message

Required admin actions:

- revoke worker
- pause or resume worker eligibility
- change sharing policy, subject to tenant/admin permission
- require runtime update
- release a stale assignment
- requeue stalled job to another eligible worker
- open worker/job audit trail
- filter by owner, group, status, runtime version, and current job

### 3.8 Background And Tray Behavior

The Windows app must be able to keep working while minimized.

Required behavior:

- Minimize sends the app to the system tray when the user enables tray mode.
- Closing the main window should either minimize to tray or ask before stopping
  active work.
- Tray menu includes:
  - open Smart AI Hub Worker App
  - pause accepting jobs
  - resume accepting jobs
  - show current job/progress
  - quit after current job
  - quit now, if server policy allows cancellation/release
- While minimized, the app must continue heartbeats, job progress events,
  rendering, artifact uploads, and server verification polling.
- The tray icon or notification state should indicate idle, working, warning,
  or error.
- On app restart, the app reconciles with the server and resumes safe state:
  upload incomplete finished artifacts if possible, otherwise release or mark
  the assignment according to server policy.

---

## 4. Architecture

### 4.1 High-Level Shape

```text
Storyboard Review Web
  -> SmartAIHub API
      -> render job outbox / assignment / audit
      -> signed asset manifests
      -> artifact upload sessions
      -> server verification and QA

Smart AI Hub Worker App
  -> outbound HTTPS only
  -> pulls assigned jobs
  -> runs official HyperFrames sidecar
  -> uploads output and diagnostics
```

The desktop app must use outbound HTTPS only. The server must never require an
inbound port on the user's machine.

### 4.2 Proposed Repository Layout

```text
apps/worker-app/
  package.json
  src/
    main.tsx
    pages/
    components/
    worker-client/
  src-tauri/
    tauri.conf.json
    capabilities/
    src/
      main.rs
  sidecars/
    smartaihub-worker-node/
  runtime-pack/
    manifest.schema.json
```

The final implementation may choose a different workspace name, but the spec
uses `apps/worker-app` for planning.

### 4.3 Runtime Strategy

The desktop worker should run the same official HyperFrames runtime policy that
legacy server renders used, but outside the SmartAIHub web/server process:

- official HyperFrames CLI or `@hyperframes/producer`
- Node runtime pinned for the HyperFrames version
- Chromium/Playwright browser binary pinned
- FFmpeg and FFprobe pinned
- Thai-capable fonts pinned
- no ASS fallback for final user-facing output

The app must not depend on globally installed Node, FFmpeg, Chrome, or fonts.

### 4.4 Sidecar Strategy

Use Tauri sidecar capabilities to run an allowlisted worker executable only.

Recommended MVP:

- Tauri shell manages UI, config, secure token storage, updater, and sidecar
  lifecycle.
- Node-based sidecar owns HyperFrames job execution because the current
  HyperFrames runtime is Node/CLI oriented.
- The sidecar exposes a local IPC contract only to the Tauri app process, not to
  arbitrary local web pages.
- The sidecar receives structured job files, not shell command strings.

The sidecar must not expose a generic terminal, generic command runner, or
server-controlled shell arguments.

### 4.5 Worker-Only Render Migration Scope

This feature establishes the worker queue as the long-term rendering substrate
for SmartAIHub video output.

Migration policy:

- HyperFrames final composite render moves to worker execution first.
- After HyperFrames final composite is stable, other SmartAIHub video render
  systems should migrate to the same submit/claim/lock/render/upload/verify
  contract.
- New video render features should be designed for worker execution from the
  start.
- The SmartAIHub web/server process must not be treated as a render executor.
  It schedules work, signs manifests, verifies results, stores artifacts, and
  updates job state.
- Worker implementations may include user desktop workers first and future
  dedicated managed worker nodes later. They must still use the same worker
  claim/upload/verification contract and must not run inside the web request
  server.
- If no eligible worker is available, jobs should wait, surface a clear blocked
  state, or fail per policy. They should not silently fall back to server
  rendering.

### 4.6 Future Generic Worker Job Types

The worker app should be designed as a safe job execution platform, with
HyperFrames final composite as the first supported job type.

Future job kinds may include:

- `hyperframes_final_composite`
- `video_render`
- `local_ai_text`
- `local_ai_vision`
- `local_ai_multimodal`

Local AI future direction:

- SmartAIHub web UI submits a local AI job with text input, image/file input
  references, model/task options, and output expectations.
- Eligible workers claim the job through the same queue/lock/attempt/lease
  mechanism.
- The worker connects to a user-configured local AI runtime adapter such as
  LM Studio or Ollama.
- The worker sends the job input to the local AI runtime, receives text/JSON/
  file output, uploads the output to SmartAIHub, and marks the attempt complete.
- The user monitors the job from the same Render Job Monitor / Job Monitor
  pattern and opens the result when complete.

Design constraints:

- Local AI support is not part of the Windows HyperFrames MVP unless explicitly
  scheduled later.
- The generic job contract should reserve fields now so future non-render jobs
  do not require a second queue system.
- Provider configuration must be done through worker UI, not `.env`.
- Local AI provider adapters must be allowlisted. The worker must not expose a
  generic proxy to arbitrary local network services.
- Text, images, prompts, model responses, and generated files are sensitive job
  payloads and must follow tenant/user permission, storage, redaction, audit,
  and retention policies.
- Server verification for local AI differs from video verification: it should
  validate schema, content hash, artifact upload, size limits, allowed MIME
  types, and safety policy state, but it should not pretend to verify semantic
  correctness of AI answers.

### 4.7 Future MCP Agent Workers

The server should reserve a future worker integration path for MCP-capable
agents. This allows users or tenants to create their own worker agents with
Claude, Codex, Hermes, or other MCP clients that can authenticate to SmartAIHub,
pull jobs from the queue, execute them in their own environment, and submit
results back to SmartAIHub.

MCP agent worker direction:

- SmartAIHub exposes an MCP server dedicated to worker job execution.
- An MCP-capable client logs in or pairs with SmartAIHub and receives scoped
  worker credentials.
- The MCP client calls allowlisted tools to claim eligible jobs, fetch the
  structured job manifest, report progress, upload or attach results, and mark
  an attempt complete or failed.
- The server still owns queue state, tenant/user authorization, assignment
  lease, attempt number, artifact storage, verification, audit, and billing.
- MCP workers use the same `jobKind`, capability matching, attempt/lease, stale
  upload rejection, reassignment, and user job monitor contracts as desktop
  workers.

Candidate MCP tools:

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

Design constraints:

- MCP support is a future extension and not part of the first Windows desktop
  HyperFrames MVP.
- MCP tools must never expose raw queue database access, arbitrary project
  browsing, general admin APIs, or unrestricted file upload.
- Tool inputs and outputs must be structured and schema-validated.
- MCP agents may support render jobs, local AI jobs, or other future job kinds
  only when their registered capabilities and tenant policy allow it.
- Normal users still submit jobs from SmartAIHub UI and monitor them in the same
  job monitor. They do not need to know whether a desktop app, managed worker,
  or MCP agent completed the job.

---

## 5. Auth And Device Pairing

### 5.1 Requirement

Use the same security model as the Marketplace Capture Chrome extension so the
user does not need to understand a second login system.

This means reusing:

- one-time device/pairing code flow
- browser-based approval page
- scoped bearer access tokens
- rotating refresh tokens
- revocation by connection id and token `jti`
- exact client identity/audience checks
- device management UI
- audit events

### 5.2 Worker Token Shape

Do not reuse marketplace capture scopes for render execution.

Local AI scopes should be disabled by default until the local AI job type is
implemented and tenant policy allows it. A worker can support render jobs
without receiving local AI scopes.

Recommended token claims:

```json
{
  "type": "smartaihub_connected_device",
  "deviceKind": "desktop_worker",
  "aud": "smart-ai-hub-worker-app",
  "connectionId": "conn_...",
  "userId": 123,
  "tenantId": "tenant_...",
  "scopes": [
    "worker:render:read",
    "worker:render:claim",
    "worker:render:write",
    "worker:artifact:upload",
    "worker:status:write",
    "worker:local-ai:read",
    "worker:local-ai:write"
  ],
  "jti": "token_...",
  "iat": 1782000000,
  "exp": 1782000900
}
```

For MCP agent workers, use a separate audience and device kind:

```json
{
  "type": "smartaihub_connected_device",
  "deviceKind": "mcp_agent_worker",
  "aud": "smart-ai-hub-worker-mcp",
  "connectionId": "conn_...",
  "userId": 123,
  "tenantId": "tenant_...",
  "scopes": [
    "worker:job:read",
    "worker:job:claim",
    "worker:job:write",
    "worker:artifact:upload",
    "worker:status:write"
  ],
  "jti": "token_...",
  "iat": 1782000000,
  "exp": 1782000900
}
```

MCP scopes should be disabled by default until the MCP worker server and tenant
policy are ready.

If the current implementation only has `marketplace_extension_connections`,
extract a shared connected-device auth core rather than letting worker tokens be
accepted by marketplace capture endpoints.

### 5.3 Pairing Flow

```text
Worker App                         SmartAIHub Web/API
  POST /api/connected-devices/connect/start
    deviceKind=desktop_worker
    requestedScopes=worker:*
    -> device_code, user_code, verification_uri, expires_in

  open verification_uri
                                    user is already logged in or logs in
                                    user approves Smart AI Hub Worker App
                                    server records connection

  poll /api/connected-devices/connect/token
    -> access_token, refresh_token, connection metadata

  refresh /api/connected-devices/connect/refresh
    -> rotating token set
```

Alternative web-initiated flow:

- Storyboard Review shows `Connect this computer`.
- Web creates a one-time worker handoff code.
- Browser opens `smartaihub-worker://connect?code=...`.
- Tauri app exchanges the code for the same device token set.

Future MCP agent flow:

- User or tenant admin opens SmartAIHub connected worker settings.
- User creates an MCP worker connection and sees an MCP endpoint plus pairing
  instructions.
- MCP client performs OAuth/device-code style login or a short-lived pairing
  exchange.
- SmartAIHub records `deviceKind=mcp_agent_worker`, client label, owner,
  tenant, scopes, capability profile, and revocation state.
- MCP client calls only worker MCP tools, not normal web app APIs.

### 5.4 Security Requirements

- Access tokens expire quickly, recommended 15 minutes.
- Refresh tokens rotate on every use.
- Refresh token reuse revokes the worker connection.
- User can revoke the worker app from SmartAIHub settings.
- Tenant admins can disable worker execution globally, by worker kind, or by
  sharing policy.
- Worker tokens cannot call marketplace capture, admin, LLM, billing mutation,
  or unrelated media routes.
- Token storage must use Windows secure storage where practical. If a Tauri
  plugin is used, it must store secrets with OS-backed protection and never log
  tokens.

### 5.5 Worker Sharing Authorization

A worker connection has an owner user because a real user must pair and manage
the device. Claim eligibility is not limited to that owner when sharing is
enabled.

Supported sharing modes:

- `private_owner`: worker may claim only jobs submitted by the owner user.
- `group_pool`: worker may claim jobs submitted by users in selected groups.
- `tenant_pool`: worker may claim jobs submitted by any eligible user in the
  tenant.

Authorization rules:

- Tenant policy must explicitly allow desktop worker sharing before
  `group_pool` or `tenant_pool` can be enabled.
- Only the worker owner or a tenant admin can change a worker sharing policy.
- Tenant admins can override, pause, revoke, or reduce worker sharing scope.
- The worker token identifies the device connection; it does not grant the owner
  user broad read/write access to other users' projects.
- The server must authorize each claim against worker sharing policy, tenant,
  job owner, group membership, runtime compatibility, quota, and job state.
- The worker receives only the signed render manifest/assets required for the
  claimed job, not arbitrary project access.

---

## 6. Server Contracts

### 6.1 Worker Device Registry

The implementation may extend the existing extension connection table or create
a generalized connected-device table. The contract must support:

- connection id
- owner user id
- tenant id
- device kind: `desktop_worker`, `managed_worker_node`, `mcp_agent_worker`
- device label
- sharing mode: `private_owner`, `group_pool`, `tenant_pool`
- allowed group ids, when `group_pool`
- effective claim scope summary for admin display
- app version
- client kind/version, for MCP agents
- runtime pack version
- runtime profile hash
- supported job kinds
- capability flags: max duration, max resolution, supported presets/runtime,
  local AI providers, local AI model summaries, max input size, supported MIME
  types
- scopes
- status: offline, idle, busy, paused, revoked, expired, blocked, needs_update
- last heartbeat
- last job id
- current job id
- current job phase
- current job progress
- current job locked at / lease expires at
- revoked reason
- created/updated timestamps

### 6.2 Worker Job Assignment

Extend the HyperFrames render job projection and outbox metadata with generic
worker assignment fields that can be reused by future worker job types:

- `jobKind`:
  - `hyperframes_final_composite`
  - `video_render`
  - `local_ai_text`
  - `local_ai_vision`
  - `local_ai_multimodal`
- `executorPreference`: `worker_pool` | `auto`
- `assignedExecutor`: `desktop_worker` | `managed_worker_node` | `mcp_agent_worker`
- `assignedWorkerConnectionId`
- `assignmentAttempt`
- `assignmentLeaseId`
- `assignedAt`
- `assignmentExpiresAt`
- `workerHeartbeatAt`
- `workerProgressAt`
- `workerAppVersion`
- `workerRuntimeProfileHash`
- `serverVerificationStatus`
- `workerExecutionDeadlineAt`
- `userReassignmentAvailableAt`
- `reassignmentRequestedAt`
- `reassignmentRequestedByUserId`
- `reassignmentReason`
- `previousWorkerConnectionIds`
- `desktopClaimStrategy`:
  - `private_owner`
  - `group_pool`
  - `tenant_pool`
  - `selected_worker`, for explicit admin/operator assignment only
- `submittedByUserId`
- `submittedByGroupIds`
- `requiredCapabilities`
- `inputArtifactRefs`
- `outputArtifactRefs`
- `assignedByPolicy`: `auto` | `admin` | `retry`
- `lastDesktopWorkerEventAt`
- `lastDesktopWorkerSafeMessage`

MVP can keep these in `payloadJson`/metadata if migration scope must stay small,
but promotion criteria should move them into indexed columns if queue lookup,
operator tooling, or metrics become slow.

Worker assignment must preserve the same logical lifecycle that downstream
systems expect from completed renders:

- jobs are still created by SmartAIHub and stored in the central worker
  queue/outbox system
- a worker only claims eligible pending jobs
- the server remains the scheduler, owner of truth, verifier, and artifact store
- completed worker renders must be indistinguishable from legacy server renders
  to downstream Media Library, Storyboard Review, audit, and billing consumers
- no completed file may remain local-only
- assignment/claim must be atomic so two workers cannot run the same job

### 6.3 Worker APIs

Recommended REST endpoints because the desktop app is an external client and
needs streaming/file upload support:

```http
POST /api/worker-app/connect/start
POST /api/worker-app/connect/token
POST /api/worker-app/connect/refresh
POST /api/worker-app/heartbeat
GET  /api/worker-app/config
PATCH /api/worker-app/config
POST /api/worker-app/jobs/claim
POST /api/worker-app/jobs/:jobId/heartbeat
POST /api/worker-app/jobs/:jobId/events
POST /api/worker-app/jobs/:jobId/artifacts/init-upload
PUT  /api/worker-app/jobs/:jobId/artifacts/:artifactId/chunk
POST /api/worker-app/jobs/:jobId/artifacts/:artifactId/complete-upload
POST /api/worker-app/jobs/:jobId/complete
POST /api/worker-app/jobs/:jobId/fail
POST /api/worker-app/jobs/:jobId/cancel-ack
GET  /api/worker-app/runtime/manifest
GET  /api/worker-app/runtime/packs/:version
GET  /api/worker-app/capabilities
PATCH /api/worker-app/capabilities
```

All endpoints require bearer auth except connect start/token polling.

Configuration APIs must only expose user-safe settings. They must not return
server secrets, internal queue credentials, raw HyperFrames command lines, or
environment variable values.

Worker heartbeat responses may include server commands:

- `continue`
- `pause_after_current_job`
- `stop_current_attempt_for_reassignment`
- `stop_current_attempt_for_timeout`
- `runtime_update_required`
- `connection_revoked`

The worker must treat stop commands as cooperative cancellation for the current
attempt, terminate the HyperFrames sidecar safely, avoid uploading partial
artifacts, and send `cancel-ack` with the current `assignmentLeaseId`.

### 6.4 Web UI APIs

Add or extend authenticated web tRPC procedures:

- `submitWorkerJob`
- `submitHyperframesRenderJob`
- `submitLocalAiJob`, future/non-MVP
- `listMyRenderJobs`
- `getMyRenderJob`
- `cancelQueuedRenderJob`
- `requestRenderJobReassignment`
- `retryRenderJob`
- `listConnectedWorkerDevices`
- `listAdminWorkerDevices`
- `createWorkerDeviceHandoff`
- `revokeWorkerDevice`
- `updateWorkerDeviceConfig`
- `updateWorkerSharingPolicy`
- `pauseWorkerDevice`
- `resumeWorkerDevice`
- `releaseWorkerAssignment`
- `setWorkerRenderPreference`
- `getWorkerDeviceStatus`
- `getHyperframesRenderJob` includes executor fields and desktop worker phases

The web UI must never receive desktop worker refresh tokens.

`listMyRenderJobs` must be scoped to the authenticated user's accessible jobs
and support pagination, filtering by status/project/date/render type, and
sorting by submitted time. Completed rows include safe artifact links only after
server verification succeeds.

`cancelQueuedRenderJob` may cancel only jobs still in queued/waiting states
unless an explicit cooperative cancellation policy is implemented for running
jobs.

Future local AI job APIs should reuse the same list/detail/cancel/retry monitor
contracts. Local AI submit procedures must accept structured text/image input
or uploaded input artifact refs and return a job id, not a synchronous AI
response.

`requestRenderJobReassignment` may be called by the submitter or authorized
admin only after the job has been assigned to a worker for at least the
configured user handoff threshold, default 15 minutes, and before upload or
server verification has begun. The server must validate the current attempt and
return the true state if the job already completed, uploaded, failed, or moved
to verification.

### 6.5 Future MCP Worker Server Contract

SmartAIHub may expose a dedicated MCP server for worker-capable agents. The MCP
server must be a thin tool surface over the same worker queue APIs, not a second
queue implementation.

Required properties:

- MCP tools use the same connected-device auth, tenant policy, sharing policy,
  capability matching, attempt number, and lease id as REST worker clients.
- A claimed MCP job receives a structured manifest only for that job.
- MCP tools cannot list arbitrary projects, browse tenant files, or mutate
  unrelated app state.
- Result submission must create SmartAIHub artifacts or structured output refs,
  then call completion against the active lease.
- Stale MCP completions are rejected the same way stale worker uploads/results
  are rejected.
- MCP agent workers must appear in Admin Worker Monitor with owner, client
  label, status, current job, heartbeat/progress, and last error safe message.

### 6.6 Persistence Model

The implementation should use a durable worker queue model that can survive
server restart, browser refresh, worker reconnect, and future worker kinds.

Recommended logical records:

- `worker_connections`
  - connection id, tenant id, owner user id
  - worker kind: desktop, managed node, MCP agent
  - sharing policy and allowed groups
  - capability profile and supported job kinds
  - status, heartbeat, current job, current attempt
  - token revocation and audit metadata
- `worker_jobs`
  - user-visible job id
  - tenant id, submitter user id, project/storyboard refs
  - job kind, priority, status, safe message
  - input refs, output refs, result refs
  - quota/credit reservation refs
  - created, queued, completed, failed, cancelled timestamps
- `worker_job_attempts`
  - attempt id, job id, assignment attempt number
  - assigned worker connection id and worker kind
  - assignment lease id, assigned at, expires at
  - phase, progress, heartbeat/progress timestamps
  - stop/reassignment/stall reason
  - terminal state and safe failure reason
- `worker_job_events`
  - append-only safe event log for user/admin progress, audit, and debugging
- `worker_artifacts`
  - input/output artifact refs, content hashes, MIME types, size, upload status,
    retention policy, and verification state

Promotion criteria:

- MVP may keep some assignment metadata in JSON payloads.
- Queue lookup, admin monitoring, user job lists, stale watchdogs, or metrics
  that become slow should promote fields to indexed columns.
- Attempt and artifact identifiers should be first-class enough to reject stale
  worker uploads and MCP completions reliably.

---

## 7. Job Lifecycle

### 7.1 State Machine

```text
queued
  -> assigned_desktop_worker
  -> worker_downloading_assets
  -> worker_runtime_checking
  -> worker_rendering
  -> transfer_requested
  -> requeued_for_another_worker
  -> worker_uploading_artifacts
  -> server_verifying
  -> completed

terminal alternatives:
  -> failed_transient
  -> failed_permanent
  -> stalled
  -> cancelled
  -> dead_lettered
```

If the worker app disappears:

- no heartbeat within assignment timeout releases the job back to `retry`
- partial uploads are cleaned up or retained as incomplete artifacts
- server can reassign to another eligible worker if policy allows
- server must not fall back to rendering the job inside the web/server process

### 7.2 Automatic Job Pickup

The web UI submits render jobs to the server queue. The desktop app pulls
eligible pending work without the user manually copying a job id, choosing a
worker machine, or triggering a local render command.

Required behavior:

- When connected, ready, online, and `accept jobs` is enabled, the app polls or
  long-polls the claim endpoint for eligible jobs.
- The server decides which jobs are eligible for that worker based on tenant,
  queue policy, worker sharing mode, job submitter, group membership, worker
  status, runtime compatibility, and executor preference.
- The MVP default is `max concurrent jobs = 1`.
- The app claims one job, locks it with a server-issued assignment lease, and
  sends heartbeats until terminal state.
- Claim must be atomic, for example by updating a queued row only when it is
  still unassigned or its previous lease has expired.
- Once a job is locked to a live worker, other workers must not receive it from
  the claim endpoint.
- If no job is available, the app remains idle and continues heartbeat/status
  reporting.
- If the user starts a render in Storyboard Review with desktop workers allowed,
  that job becomes eligible for any worker whose sharing policy covers the
  submitter.
- If no compatible worker is available, the job remains queued, blocked, or
  failed with a clear safe reason according to policy. It must not silently
  switch to server rendering.
- The app must never scan local folders to invent jobs; all work originates from
  server job manifests.

The worker must always upload outputs back to SmartAIHub artifact storage. From
the product user's perspective, the result should appear exactly where a server
render would appear: Storyboard Review, project render history, Media Library,
audit timeline, and any final video link fields.

### 7.3 User Queue Visibility And Cancellation

Render and future worker job submission must be asynchronous from the user's
point of view.

Required behavior:

- Submitting a job creates a durable server-side queue record immediately.
- The submit action returns a job id and link to the user render job monitor.
- Users may submit additional jobs without keeping the submit page open and
  without waiting for previous jobs to complete.
- The queue should not serialize jobs per user unless tenant policy explicitly
  enforces a quota or credit limit.
- Each job remains visible in the user's render job monitor across refresh,
  browser close/reopen, worker reconnect, and server restart.
- Jobs move from `waiting for worker` to `assigned to worker` only after an
  atomic worker claim succeeds.
- Completed jobs expose verified result links after server verification passes.
- Failed jobs expose a safe failure reason and retry action when policy allows.
- Queued jobs that have not been claimed can be cancelled by the submitter or an
  authorized admin.
- Cancellation must update the queue record atomically so a worker cannot claim
  a job after cancellation succeeds.
- If cancellation races with worker claim, the server must return the true final
  state: either cancelled before claim, or already assigned/running.

### 7.4 Worker SLA, Reassignment, And Stale Watchdog

The system must detect worker attempts that are too slow or likely stuck and
provide a safe way to move the job to another worker.

Default thresholds for HyperFrames final composite MVP:

- User reassignment threshold: 15 minutes after `assignedAt` or
  `render_started`, whichever is later and recorded by the server.
- Worker execution watchdog: 30 minutes after assignment for worker-held phases
  that have not reached artifact upload completion.
- Heartbeat timeout remains shorter and separate; missed heartbeat releases or
  retries according to assignment lease policy.
- Server verification has its own timeout and is not counted as worker render
  time after artifact upload is completed.

User-initiated reassignment:

- After the 15-minute threshold, the user render job monitor may show
  `Request another worker`.
- The action does not expose worker identity to normal users.
- The server marks the current attempt as `transfer_requested` and returns a
  cooperative stop command in the current worker's next heartbeat response.
- The worker should stop the sidecar process, clean up temporary files, and send
  `cancel-ack` or `transfer-ack`.
- After ack or a short grace period, default 60-120 seconds, the server releases
  the assignment lease and requeues the job with `assignmentAttempt + 1`.
- The previous worker is placed on cooldown for that job so it cannot
  immediately reclaim the same job.

Automatic watchdog reassignment:

- If a worker-held attempt reaches 30 minutes without artifact upload
  completion, the server marks the attempt `stalled`.
- The server should first request cooperative stop if the worker is still
  heartbeating.
- If no ack arrives before the grace period or the lease expires, the server
  abandons the attempt and requeues the job for another eligible worker.
- The stalled worker receives a health penalty/cooldown and may be marked
  `blocked` or `needs_attention` if repeated stalls exceed policy.
- Admin UI must show stalled attempts, previous worker, duration, last progress
  event, and reassignment history.

Safety rules:

- Every claim gets a unique `assignmentAttempt` and `assignmentLeaseId`.
- Artifact upload, job completion, and server verification must validate the
  current lease id and attempt number.
- If an old worker uploads after its lease was abandoned, the server rejects the
  upload/completion as stale and keeps the newer queue state.
- A reassigned job must reuse the original job id for user tracking but create a
  new attempt record for audit and diagnostics.
- Credits should not be captured as successful output until the final active
  attempt passes server verification.
- The system must cap max attempts and move the job to `failed_transient` or
  `dead_lettered` with a safe reason when every eligible worker fails.

### 7.5 Claim Rules

A worker may claim a job only when:

- worker connection tenant matches the render job tenant
- tenant policy allows the worker kind
- job executor policy allows worker execution
- worker sharing mode covers the job submitter:
  - owner user for `private_owner`
  - selected group membership for `group_pool`
  - tenant eligibility for `tenant_pool`
- worker owner or tenant admin has not paused/revoked the worker
- worker is active and not paused
- worker runtime profile is compatible with job `runtimeProfileHash`
- job input hash is current
- job is not already running on another live worker
- credit/quota/reservation policy is satisfied

The claim response should include a server-issued lease id, lease expiry, signed
asset manifest, expected input hashes, upload session bootstrap, and a safe
display label. It must not include broad project permissions or unrelated user
data.

### 7.6 Progress Events

Worker sends normalized progress events:

- `worker_idle`
- `job_claim_poll_started`
- `job_claim_poll_empty`
- `job_claimed`
- `runtime_doctor_started`
- `runtime_doctor_passed`
- `asset_manifest_received`
- `asset_download_started`
- `asset_download_progress`
- `asset_download_completed`
- `local_ai_provider_check_started`
- `local_ai_provider_ready`
- `local_ai_inference_started`
- `local_ai_inference_progress`
- `local_ai_output_received`
- `local_ai_output_uploaded`
- `render_started`
- `render_progress`
- `transfer_requested`
- `transfer_acknowledged`
- `worker_attempt_stalled`
- `worker_attempt_abandoned`
- `job_requeued_for_another_worker`
- `render_completed_locally`
- `artifact_upload_started`
- `artifact_upload_progress`
- `artifact_upload_completed`
- `server_verification_pending`
- `server_verification_passed`
- `server_verification_failed`

Progress events must be safe to show in user UI.

Progress state must be durable enough for refresh/reopen behavior:

- Desktop app shows current local phase even when minimized.
- Storyboard Review shows the latest server-known phase after refresh.
- If the app reconnects, it must reconcile the active job before claiming a new
  job.
- The server must expose elapsed time, last event time, and safe next-action
  hints for running, stalled, failed, and verifying states.

### 7.7 Idempotency, Priority, And Queue Fairness

Worker jobs must be safe under retries, duplicate client requests, worker
reconnects, and concurrent claim attempts.

Required idempotency:

- Submit APIs accept an idempotency key and return the existing job when the
  same submit request is retried.
- Claim APIs are atomic and return only one active assignment lease per job.
- Heartbeat/progress events are idempotent by attempt id and event id.
- Artifact upload init/complete calls are idempotent by artifact id, upload id,
  content hash, attempt id, and lease id.
- Completion/failure calls are idempotent for the active attempt and reject
  stale attempts.

Priority and fairness:

- Jobs may include priority classes such as `normal`, `interactive`, `bulk`, or
  `admin`.
- Tenant policy may cap queued jobs, concurrent active jobs, total runtime,
  storage, and local AI usage.
- A user may submit many jobs, but queue policy must prevent one user or group
  from starving the tenant pool.
- Worker claim ordering should consider priority, submit time, compatible
  capabilities, retry count, and fairness across users/groups.
- Admin UI should expose queue depth, oldest waiting job, active attempts, and
  blocked reasons.

---

## 8. Runtime Pack And Updates

### 8.1 Runtime Pack Contents

Runtime pack for Windows should include:

- worker sidecar executable or Node runtime plus sidecar JS bundle
- pinned HyperFrames packages
- pinned Chromium/Playwright browser binary
- pinned FFmpeg and FFprobe
- Thai-capable font files
- runtime manifest
- license notices
- checksum file
- signature file

Future local AI extension may add provider adapters rather than bundling AI
models:

- LM Studio adapter configuration
- Ollama adapter configuration
- provider health checks
- model/capability discovery cache

The worker app should not bundle large AI models in the MVP installer. Local AI
models remain user-managed in their local AI runtime unless a later feature
explicitly defines model distribution.

### 8.2 Runtime Manifest

```json
{
  "schemaVersion": 1,
  "platform": "windows-x64",
  "runtimePackVersion": "2026.06.22.1",
  "hyperframesCliVersion": "0.6.95",
  "hyperframesProducerVersion": "0.6.95",
  "nodeVersion": "22.22.3",
  "chromiumVersion": "...",
  "ffmpegVersion": "...",
  "ffprobeVersion": "...",
  "thaiFontProfileHash": "hf_...",
  "runtimeProfileHash": "hf_...",
  "files": [
    {
      "path": "bin/ffmpeg.exe",
      "sha256": "...",
      "sizeBytes": 123
    }
  ],
  "signature": "..."
}
```

### 8.3 Update Policy

- App updates and runtime pack updates are separate.
- Runtime pack download must be resumable.
- Runtime packs are immutable by version.
- Server may reject jobs from unsupported runtime packs.
- A rollback manifest can mark a runtime version disabled.
- Worker app must show a clear action when update is required.

---

## 9. Server Verification

Server verification is mandatory. A worker upload/result is never accepted just
because the worker reports success.

Verification for HyperFrames/video jobs must check:

- job id, tenant id, user id, connection id, and assignment still match
- render job input hash is current
- template id/version/hash match
- platform preset id/version/hash match
- timeline hash and final composite config hash match
- runtime profile hash is allowed for this job
- artifact upload content hash matches worker manifest
- MP4 exists, is playable, and has expected duration tolerance
- audio stream presence matches `preserveNativeAudio` and audio policy
- subtitle sidecars are valid when present
- output was not produced by diagnostic smoke/fallback runtime
- final QA passes before status becomes `completed`

Verification for future local AI jobs must check:

- job id, tenant id, user id, connection id, assignment attempt, and lease match
- input artifact hashes match the submitted text/image/file inputs
- local AI provider type is allowlisted for the worker and tenant policy
- output schema matches the requested response format
- output artifact hashes and MIME types match the worker manifest
- output size and file count stay within policy limits
- safety/moderation state is recorded when the product requires it
- output is stored in SmartAIHub artifact storage before status becomes
  `completed`

Server stores:

- output MP4 artifact
- structured local AI output artifacts, when applicable
- optional thumbnail/snapshot
- runtime diagnostics
- sanitized worker log ref
- worker connection id
- app version
- runtime pack version
- server verification report

Normal user UI may show verification status and safe reason only.

### 9.1 Retention And Cleanup

Worker jobs may carry sensitive video, images, prompts, transcripts, subtitles,
model outputs, and diagnostics. Retention must be explicit.

Required policy:

- Input manifests and signed URLs expire quickly and are regenerated per active
  attempt.
- Worker local workspace files are deleted after successful upload/verification
  or after a failed/stale attempt cleanup window.
- Incomplete uploads expire and are garbage-collected.
- Stale attempt artifacts are rejected and may be deleted or quarantined for
  diagnostics according to policy.
- Verified output artifacts follow normal project/Media Library retention.
- Local AI prompts, images, and outputs follow tenant data retention and support
  deletion/export policies.
- Sanitized logs keep only safe metadata by default; raw payload capture requires
  explicit support mode and user/admin authorization.

---

## 10. Security And Privacy

### 10.1 Desktop Worker Security

- The app must not run arbitrary shell commands.
- Tauri capabilities must allow only the sidecar/runtime commands required.
- Server must send structured render job manifests, not command strings.
- Paths must be allocated under the app workspace directory.
- Worker must reject path traversal and absolute paths from server manifests.
- Worker must not expose local HTTP ports unless explicitly approved by a
  later security review.
- Tokens must never be written to logs.
- Support bundles must redact paths, tokens, signed URLs, and raw composition
  HTML.

### 10.2 Local AI Adapter Security, Future

- Local AI provider support must be opt-in per worker and per tenant policy.
- Provider endpoints must be configured through UI and constrained to safe local
  origins such as loopback addresses or explicitly approved local endpoints.
- The worker must not expose a generic HTTP proxy to LM Studio, Ollama, or any
  other local service.
- Provider adapters must use allowlisted request shapes and response parsers.
- The server sends structured local AI job manifests, not arbitrary prompts
  combined with arbitrary provider URLs.
- Text prompts, images, provider responses, model names, and generated files may
  contain sensitive data and must be redacted from logs/support bundles unless
  explicitly included by the user for support.
- Local AI output must be uploaded back to SmartAIHub as verified job output;
  it must not remain only inside the local provider UI.
- Local AI jobs must enforce tenant/user permission checks the same way render
  jobs do, especially when a shared worker processes another user's job.

### 10.3 MCP Agent Worker Security, Future

- MCP worker tools must be allowlisted and schema-validated.
- MCP workers must use a dedicated audience, device kind, and scopes.
- MCP worker auth must be revocable from connected worker settings and admin UI.
- MCP workers must not receive normal web session cookies or broad user tokens.
- MCP tools must not expose arbitrary SQL, filesystem, browser automation, shell
  command execution, project browsing, or admin mutation.
- MCP claim and completion tools must validate tenant, worker sharing policy,
  job kind, capability profile, attempt number, lease id, and current job state.
- MCP result payloads must be size-limited, MIME/type-checked, hash-verified,
  and stored as SmartAIHub artifacts or structured job outputs.
- MCP tool logs must redact prompts, images, result payloads, tokens, signed
  URLs, and raw manifests unless explicit support export policy allows them.

### 10.4 Server Security

- Worker token audience and scopes are mandatory.
- Endpoint CORS must not use wildcard origins for authenticated worker routes.
- Worker endpoints should accept bearer auth and reject cookie-only
  state-changing requests.
- Every job claim and completion is audited.
- Tenant/user access is checked on every claim, heartbeat, upload, completion,
  and failure event.
- Worker sharing policy and group membership are checked on every claim.
- A shared worker may process another user's job only through a server-issued
  render manifest for that specific job.
- A worker token must never become a general-purpose user impersonation token.
- Admin worker monitoring must show safe metadata by default and avoid exposing
  raw prompt, source asset signed URLs, composition HTML, or subtitles unless
  the admin already has permission to the underlying project.
- Uploads must be content-type checked, size-limited, hash-verified, and stored
  under tenant/run scoped paths.

### 10.5 Abuse And Cost Controls

- Limit active workers per user/tenant and by worker kind.
- Limit active MCP agent workers per user/tenant.
- Limit simultaneous jobs per worker, default 1.
- Rate-limit claim and heartbeat endpoints.
- Rate-limit MCP tool calls per connection and tenant.
- Enforce max local render duration per job using server policy.
- Do not allow a worker to claim jobs for another tenant.
- Do not allow tenant-shared workers unless tenant policy explicitly enables
  them.
- Require explicit user opt-in before using local worker for paid/final output.

---

## 11. Credits And Billing

The server remains responsible for credit estimate, reservation, capture, and
refund policy.

MVP recommendation:

- Worker render/execution may reduce server compute cost, but still reserves
  credits according to product policy until a separate pricing decision exists.
- Server should record executor type and job kind in credit metadata.
- If worker execution fails before upload/output completion, release/refund per existing transient
  render failure policy.
- If server verification fails because the worker output is invalid, do not mark
  render complete and do not charge final success credits.

---

## 12. Observability

Required metrics:

- connected desktop workers
- connected MCP agent workers
- active workers by tenant
- local worker job claims
- MCP worker job claims
- local worker render duration
- local worker upload duration
- server verification duration
- verification failures by reason
- runtime pack versions in use
- worker app versions in use
- heartbeat timeout count
- worker unavailable queue count
- blocked server-render fallback attempt count
- user reassignment request count
- automatic watchdog reassignment count
- stalled attempt count by worker/runtime version
- stale upload rejection count
- worker cooldown/block count

Required audit events:

- worker app connected
- MCP agent worker connected
- worker app refreshed token
- worker app revoked
- worker runtime doctor passed/failed
- worker job claimed
- worker job heartbeat missed
- worker job uploaded artifact
- worker job reassignment requested
- worker job attempt stalled
- worker job attempt abandoned
- worker job requeued for another worker
- stale worker upload rejected
- MCP worker tool call rejected
- server verification passed/failed
- worker job cancelled
- worker job failed

Do not audit raw composition HTML, tokens, signed URLs, or raw local logs.

---

## 13. Implementation Plan

### Phase 0: Research And Contracts

- Confirm Tauri v2 Windows packaging path.
- Confirm sidecar packaging for Node/HyperFrames on Windows.
- Identify legacy server render entry points for HyperFrames final composite and
  mark them for disablement after worker rollout.
- Define connected device token schema and scopes.
- Define worker sharing policy: private owner, group pool, tenant pool.
- Define worker job assignment fields.
- Define generic `jobKind` and capability matching so non-render jobs can reuse
  the same worker queue later.
- Define atomic claim/lease semantics.
- Define user reassignment threshold and worker execution watchdog thresholds.
- Define runtime pack manifest schema.
- Define server verification report schema.

### Phase 1: Connected Device Auth

- Extract shared connected-device auth from Marketplace Capture extension auth.
- Add desktop worker device kind and token audience.
- Add worker scopes and validation middleware.
- Add connect/start, token, refresh, revoke, and device list APIs.
- Add web management UI for connected worker devices.
- Add admin worker monitor APIs and worker sharing policy management.

### Phase 2: Tauri App Scaffold

- Scaffold `apps/worker-app` with Tauri v2 and React/Vite.
- Add Windows app metadata, app icon, and installer config.
- Add secure config/token storage.
- Add connection flow UI and status screen.
- Add UI-managed worker settings; normal setup must not require `.env`.
- Add tray/minimize behavior and background heartbeat loop.
- Add updater shell.

### Phase 3: Runtime Pack And Doctor

- Add sidecar runtime launcher.
- Package or download Node/HyperFrames/Chromium/FFmpeg/fonts.
- Add signed runtime manifest download.
- Add local doctor checks.
- Add runtime profile hash reporting.

### Phase 4: Job Claim And Render Execution

- Add worker job claim API.
- Add automatic claim loop for eligible pending jobs.
- Add atomic job lock/lease so only one worker can claim a job.
- Add attempt/lease validation for upload, complete, and verification.
- Add private/group/tenant pool eligibility checks.
- Add asset manifest download and workspace staging.
- Run official HyperFrames sidecar.
- Send progress events and heartbeats.
- Upload output artifacts with hash manifest.
- Reconcile active job state after app restart, network reconnect, or tray
  resume.

### Phase 5: Server Verification And Storyboard Review Integration

- Verify desktop worker outputs before completion.
- Add Storyboard Review job submit flow that does not require choosing a worker
  machine.
- Add user-facing Render Job Monitor with list/detail/result links/cancel queued
  action.
- Add user `Request another worker` action after 15 minutes on a running worker
  attempt.
- Add local worker status in final composite panel.
- Add Admin Worker Monitor for connected workers, owner, sharing policy, status,
  and current job.
- Show latest desktop worker job state after Storyboard Review refresh/reopen.
- Add retry/release logic for missed heartbeats.
- Add 30-minute worker execution watchdog that requeues stalled attempts to
  another eligible worker.
- Remove server render fallback from the HyperFrames final composite path once
  the worker path is enabled for that tenant/render type.
- Keep only server scheduling, verification, storage, audit, and billing paths.
- Document migration checklist for the next video render systems moving to the
  worker contract.

### Phase 6: Windows Release Gate

- Build signed Windows installer.
- Test install/uninstall/update.
- Test complete installer and runtime-download installer options.
- Run E2E render from Storyboard Review through desktop worker to verified
  final MP4.

### Phase 7: Future Local AI Worker Jobs

- Add local AI worker capability registration.
- Add UI-managed LM Studio/Ollama provider configuration.
- Add provider health checks and model/capability discovery.
- Add `submitLocalAiJob` for text/image input and structured output.
- Reuse the same queue, claim, lease, reassignment, upload, verification, and
  user job monitor contracts.
- Add local AI output artifact viewer for text/JSON/files.
- Keep local AI disabled by default until tenant policy and safety controls are
  ready.

### Phase 8: Future MCP Agent Worker Support

- Add SmartAIHub MCP server dedicated to worker job execution.
- Add MCP connected-device auth and pairing/login flow.
- Add MCP worker capability registration.
- Add MCP tools for claim, manifest fetch, progress, artifact upload, complete,
  fail, and release.
- Reuse the same queue, lease, attempt, stale result rejection, reassignment,
  verification, and job monitor contracts.
- Add Admin Worker Monitor support for MCP agents.
- Keep MCP worker support disabled by default until security review and tenant
  policy controls are ready.

---

## 14. Test Plan

### Unit Tests

- connected-device token validation
- worker scope enforcement
- worker-only render policy rejects server executor selection
- worker sharing policy validation
- group membership claim eligibility
- render job list visibility scoped to submitter/access policy
- queued job cancellation atomicity
- reassignment threshold eligibility
- watchdog stale attempt detection
- pairing code expiry and one-time use
- refresh token rotation and reuse revocation
- job claim eligibility
- atomic claim lock prevents duplicate worker assignment
- stale upload rejected after reassignment
- old worker completion rejected after lease abandonment
- lease expiry releases claimable job
- assignment timeout release
- runtime manifest hash validation
- server verification report validation
- generic job kind capability matching
- submit idempotency key returns existing job
- artifact upload idempotency rejects mismatched hashes
- queue priority/fairness ordering
- retention cleanup eligibility
- local AI provider config validation, future
- MCP worker token audience and scope validation, future
- MCP tool schema validation, future
- MCP lease/attempt validation, future

### Integration Tests

- connect desktop worker using browser-approved pairing
- claim a final composite job
- submit HyperFrames final composite and confirm no server render executor is
  invoked
- no eligible worker leaves the job queued/blocked instead of falling back to
  server render
- submit job from web without selecting a specific worker
- submit multiple jobs and list them in the user's render job monitor
- cancel a queued unclaimed job
- reject cancellation after a worker claim has already locked the job
- request reassignment after 15 minutes and confirm job is requeued for another
  worker
- reject reassignment request before the 15-minute threshold
- watchdog marks a 30-minute worker attempt stalled and requeues it
- stale first worker upload is rejected after another worker claims the job
- completed job exposes verified MP4/result links to the submitter
- private worker does not claim another user's job
- group-shared worker claims a job from an allowed group user
- group-shared worker rejects a job from a non-allowed group user
- tenant-shared worker claims an eligible tenant job
- reject claim from wrong tenant
- reject stale input hash
- upload artifact chunks and complete upload
- retry submit with the same idempotency key and confirm one durable job exists
- retry artifact upload completion and confirm no duplicate output is created
- queue fairness prevents one user from starving another user's eligible jobs
- incomplete upload expires and is garbage-collected
- reject wrong output hash
- reject unsupported runtime profile
- complete job only after server verification passes
- release job when heartbeat expires
- local AI job submits structured text/image input and returns result through
  job monitor, future
- local AI job rejects unsupported provider/model capability, future
- MCP agent logs in, registers capabilities, claims an eligible job, and submits
  verified output, future
- MCP agent cannot claim jobs outside tenant/sharing/capability policy, future
- stale MCP completion is rejected after lease reassignment, future
- MCP tool cannot access unrelated project/admin data, future

### Desktop Tests

- first-run connect flow
- UI-only configuration flow with no `.env`
- runtime download and resume
- doctor pass/fail display
- minimize to tray while job continues
- tray status and resume/open-window actions
- job status UI phases
- token redaction in logs
- app restart resumes safe state
- offline/online recovery
- automatic claim of an eligible queued job
- completed local render upload appears in project render history and Media
  Library surfaces
- local AI provider health check and disabled-by-default state, future
- MCP agent worker appears in Admin Worker Monitor, future

### E2E Windows Gate

- install Smart AI Hub Worker App on clean Windows VM
- connect to SmartAIHub using existing browser login
- configure worker through UI only
- set worker sharing policy through UI/admin UI
- download runtime pack if using lightweight installer
- start a fixture final composite from Storyboard Review and let the desktop app
  pick it up automatically
- confirm Storyboard Review does not require choosing a specific worker machine
- submit multiple jobs, navigate away from Storyboard Review, and monitor all
  jobs from the User Job Monitor
- cancel a waiting job from the monitor and confirm no worker claims it
- simulate a slow worker, request another worker after 15 minutes, and confirm a
  different eligible worker claims the same job id with a new attempt
- simulate a worker that exceeds 30 minutes and confirm automatic watchdog
  reassignment without server render fallback
- open a completed job from the monitor and download the verified MP4
- future local AI job result can be opened from the same job monitor without
  using a separate queue UI
- future MCP-completed job appears in the same user job monitor and result flow
  without exposing MCP client internals to normal users
- confirm server process performs scheduling/verification/storage only and does
  not execute HyperFrames render locally
- confirm Admin Worker Monitor shows connected worker, owner, sharing mode,
  idle/busy status, current job, and heartbeat
- minimize the app while render is running and confirm progress continues
- upload and server-verify output
- show completed status in both web and desktop UI
- refresh/reopen Storyboard Review during the job and confirm the running or
  completed job is still visible
- revoke worker device and confirm further claims fail

---

## 15. Acceptance Criteria

- Windows user can install Smart AI Hub Worker App and connect it through
  SmartAIHub browser approval without entering separate app credentials.
- App can become ready without manual Node/FFmpeg/Chrome/font installation.
- App can be configured completely through UI; normal users never edit `.env`.
- Installation path is simple enough for non-technical users: either one
  complete installer or a lightweight installer with one-click in-app runtime
  download.
- Storyboard Review can send a final composite render to the connected desktop
  worker.
- Users can submit multiple render jobs asynchronously without keeping the
  submit page open.
- Users can monitor queued/running/completed render jobs from a dedicated UI.
- Users can cancel jobs that are still waiting for worker assignment.
- Users can request another worker after a claimed job has been running too long
  according to the default 15-minute handoff threshold.
- The server automatically requeues stalled worker attempts after the default
  30-minute worker execution watchdog threshold.
- Reassigned jobs keep the same user-visible job id but create new attempt/lease
  records for audit.
- Old worker uploads/completions are rejected after lease abandonment or
  reassignment.
- Completed jobs show verified result links, including MP4 download and Media
  Library/project result links.
- HyperFrames final composite render executes only on workers, not inside the
  SmartAIHub web/server process.
- When no eligible worker is available, the job waits or shows a clear blocked
  state; it does not fall back to server render.
- The spec provides a migration direction for all future video render systems to
  move onto the same worker contract.
- The worker contract reserves `jobKind`, capability matching, input artifact,
  and output artifact fields so future local AI jobs can reuse the same platform.
- Submit, claim, progress, artifact upload, and completion operations are
  idempotent where retries are expected.
- Queue policy supports priority/fairness and tenant quota controls.
- Input manifests, incomplete uploads, stale attempts, logs, and support bundles
  follow explicit retention and cleanup rules.
- Future local AI jobs can submit text/images, run through a local provider
  adapter such as LM Studio or Ollama, upload output back to SmartAIHub, and
  report results through the same job monitor.
- Future MCP-capable agents can authenticate as worker connections, claim
  eligible jobs, report progress, submit results, and update job state through
  allowlisted MCP tools.
- MCP agent workers use the same queue/attempt/lease/verification/audit model as
  desktop workers.
- Connected worker automatically picks up eligible queued render jobs when
  online, ready, and accepting jobs.
- Web users can submit jobs without knowing which worker will run them.
- Worker sharing policies support owner-only, selected group, and tenant-wide
  pools.
- Atomic claim/lease prevents two workers from rendering the same job.
- Admin UI can inspect connected workers, owner user, sharing policy, current
  status, heartbeat, and active job.
- Desktop app can be minimized to tray and continues heartbeat, render, upload,
  and verification polling.
- Desktop app shows live job status from claim through server verification.
- Render runs via official HyperFrames sidecar/runtime.
- Render output is always uploaded to SmartAIHub and appears like a normal
  verified render artifact.
- Server verifies output before marking the job completed.
- Server rejects stale, mismatched, unsupported, or fallback outputs.
- If the app closes or misses heartbeat, the job becomes retryable and does not
  remain permanently stuck.
- User can revoke the worker app connection.
- Normal user UI never exposes tokens, raw signed URLs, raw composition HTML, or
  unredacted logs.

---

## 16. Rollout And Operational Gates

Rollout must be controlled because this feature removes server-side render
fallback for enabled render types.

Required rollout controls:

- Feature flags by tenant, user group, worker kind, and job kind.
- Kill switch to stop new worker claims while preserving existing job records.
- Tenant policy to enable desktop workers, managed worker nodes, MCP workers,
  group pools, tenant pools, and future local AI jobs independently.
- Runtime pack allowlist and denylist by version.
- Capability allowlist by job kind.
- Queue drain mode before disabling a worker kind or runtime version.
- Operator dashboard for queue depth, oldest waiting job, stuck attempts,
  reassignment counts, verification failures, and stale upload rejections.
- Safe rollback means disabling new worker claims and requeueing/pausing jobs;
  it does not mean falling back to web/server rendering for worker-only job
  kinds.

Operational readiness gates before enabling worker-only HyperFrames for a tenant:

- At least one compatible worker pool is online or the tenant accepts queued
  waiting behavior.
- User Job Monitor is available for submitted jobs.
- Admin Worker Monitor is available for connected workers and stuck attempts.
- Watchdog/reassignment behavior is enabled.
- Server verification rejects stale attempts and unsupported runtimes.
- Credits/refunds/queue cancellation behavior is tested.
- Artifact retention and cleanup jobs are enabled.
- Support bundle redaction is verified.

## 17. Open Decisions

1. Installer profile for first Windows release:
   - recommended: complete installer by default for the simplest user path
   - fallback: lightweight installer plus one-click in-app runtime download
   - optional: both as separate download options when release/support can handle
     two packages

2. Connected-device persistence:
   - extend existing extension connection table with `deviceKind`
   - create a new generalized connected-device table and migrate extension
     auth onto it later

3. Runtime sidecar packaging:
   - Node runtime plus JS sidecar and pinned `node_modules`
   - compiled worker executable wrapping Node/HyperFrames
   - producer server sidecar

4. Pricing:
   - same credit price as existing final render for MVP
   - discounted local worker render
   - free local worker render with only storage/verification quota

5. Release channel:
   - internal beta only
   - selected tenants
   - public Windows download from app settings

6. Desktop worker assignment policy defaults:
   - recommended MVP: private owner and group pool
   - tenant pool only when tenant admin explicitly enables it
   - selected worker assignment reserved for admin/operator override

7. Local AI future scope:
   - support LM Studio only first
   - support Ollama only first
   - support both through provider adapters
   - text-only MVP before image/multimodal jobs
   - shared-worker local AI allowed only for selected groups

8. MCP worker future scope:
   - support internal/admin-only MCP workers first
   - support user-created MCP workers after security review
   - support render job kinds first
   - support local AI/text jobs first
   - allow tenant admins to enable/disable MCP workers per group
