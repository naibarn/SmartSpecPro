# Feature 148 Deep Implementation Plan

## 1. Implementation boundary and strategy

Feature 148 is an additive platform slice over the existing MCP, OAuth,
Connected Devices, Worker Control Plane, Remotion, Hermes media, billing, and
Media ACL paths. The implementation must first make the existing production
contract truthful and usable, then add the smallest missing bridge for Hermes
parent tasks and ComfyUI execution. It must not replace legacy routes, delete
the three existing integration panels, or create a second queue/storage/key
authority.

The work is organized into seven sections. Sections 01–03 establish shared
contracts and onboarding. Section 04 implements the concrete ComfyUI worker
adapter. Section 05 completes readiness/process safety. Section 06 updates UI,
manual projections, and observability. Section 07 runs integration/gate proof.
External machine/provider gates remain explicitly blocked when the required
artifact or hardware is unavailable; code must surface a truthful blocked state
instead of faking readiness.

## 2. Current authority map

| Concern             | Existing authority                                                                          | Plan rule                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| MCP HTTP            | `mcpPublicServer.ts`, `mcpRoutes.ts`, `mcpV2Protocol.ts`                                    | Extend canonical `/v1/mcp`; preserve compatibility routes                            |
| OAuth               | `mcpOAuthMetadata.ts`, `mcpOAuthServer.ts`, OAuth services                                  | Use existing PRM/AS/token/consent implementation; add missing production checks only |
| Browserless auth    | `deviceAuthRoutes.ts`, pairing/device services, API-key routers                             | Reuse device flow and UI-created scoped keys; no new secret store                    |
| MCP UI              | `ConnectedDevicesPanel`, `McpConnectPanel`, `HermesConnectPanel`, `McpServersSettingsPanel` | Add shared descriptor/helper; retain panel boundaries                                |
| Tenant flags/config | `tenantFeatureFlagService`, `mcpRuntimeConfig`, admin settings                              | DB/UI in production; flags off by default and audited                                |
| Worker jobs         | `workerSchedulerService`, `workerRuntime`, `workflowWorkerRuntimeService`                   | Use typed contracts and existing claim/lease/event/artifact flow                     |
| Hermes parent       | `queueHermesWorkerJob`, `external_agent_task`, `runEngine.ts`                               | Add typed correlation/status projection; no second Hermes queue                      |
| Comfy contracts     | `comfyImageGenerationJobContractSchema`, `comfyWorkflowRunJobContractSchema`                | Implement local adapter only; no new job family                                      |
| Media task          | `mcp_media_tasks`, `mcpMediaAdapter`                                                        | Reuse only for MCP provider/media ownership; link worker artifacts                   |
| Artifact/download   | worker artifacts + storage publication + MCP download broker                                | Validate checksum/MIME/ACL and issue short-lived refs                                |
| Quota/billing       | worker billing, API-key quota, credit ledger                                                | One idempotent reservation/commit/refund lineage; Redis is not authority             |

## 3. Section 01 — Protocol, OAuth, and production discovery hardening

### Objective

Make `/v1/mcp` and OAuth discovery production-correct for Hermes, Claude,
Codex, and generic MCP clients without claiming support when DB-backed issuer,
JWKS, audience, resource, scopes, or tenant gates are not ready.

### Files and symbols

- `apps/web/server/_core/mcpOAuthMetadata.ts`
- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/_core/mcpOAuthServer.ts`
- `apps/web/server/_core/mcpV2Protocol.ts`
- `apps/web/server/_core/mcpRoutes.ts`
- `apps/web/server/services/mcpRuntimeConfig.ts`
- `apps/web/server/services/mcpRolloutPolicy.ts`
- `apps/web/server/_core/__tests__/mcpOAuthMetadata.test.ts`
- `apps/web/server/_core/__tests__/mcpPublicServer.test.ts`
- `apps/web/server/_core/__tests__/mcpV2Protocol.test.ts`

### Implementation

1. Verify and normalize PRM fields for the canonical resource URI
   `https://smartaihub.app/v1/mcp`, authorization server list, bearer header,
   and human-readable resource name. Preserve path-specific and root fallback
   discovery behavior.
2. Ensure every protected `/v1/mcp` 401 includes a safe `WWW-Authenticate`
   challenge with `resource_metadata` and only the required scope challenge.
   Do not include credentials or dynamic tenant secrets in metadata.
3. Enforce audience/resource validation and reject expired, wrong-issuer,
   wrong-audience, revoked, or insufficient-scope OAuth tokens before JSON-RPC
   dispatch. Preserve API-key/pairing compatibility only on their existing
   paths.
4. Keep production runtime config DB-backed. Add a safe admin/UI readiness
   projection if missing, showing source, enabled surfaces, issuer/resource,
   key configured status, and the exact missing prerequisite; never expose the
   private JWK.
5. Keep MCP `tasks`, subscriptions, and `tools/listChanged` disabled unless
   their existing feature flags and durable authority are actually implemented.
   Discovery must report `false` rather than an aspirational capability.

### Acceptance

- Unconfigured production returns a safe 404/401 and no false OAuth metadata.
- Configured production exposes PRM/AS metadata and a valid challenge without
  exposing secrets.
- `server/discover`, `initialize`, `tools/list`, `tools/call`,
  `resources/list`, `resources/read`, `ping`, and DELETE session behavior remain
  compatible.
- Wrong audience/scope/revoked token tests fail closed.

## 4. Section 02 — Client-neutral onboarding and browserless credentials

### Objective

Give users one UI-driven setup that works for Hermes One, Hermes CLI/Agent,
Claude/Claude Code, Codex CLI, and generic MCP clients, including a machine
without a browser. The server must never require production `.env` editing.

### Files and symbols

- `apps/web/client/src/lib/mcpClientOnboarding.ts`
- `apps/web/client/src/components/settings/ConnectedDevicesPanel.tsx`
- `apps/web/client/src/components/settings/McpConnectPanel.tsx`
- `apps/web/client/src/components/settings/HermesConnectPanel.tsx`
- `apps/web/client/src/components/settings/McpServersSettingsPanel.tsx`
- `apps/web/server/_core/deviceAuthRoutes.ts`
- `apps/web/server/routers/apiKeys.ts`
- `apps/web/server/services/apiKeyService.ts`
- `apps/web/client/src/locales/en/settings.json`
- `apps/web/client/src/locales/th/settings.json`

### Contract

Add a versioned client onboarding descriptor containing endpoint, transport,
auth modes, OAuth/device support, minimum client version, required scopes,
verification calls, and fallback instructions. It must be generated from the
server/UI rather than copied from a stale manual.

Browser-capable clients use OAuth/PKCE. Browserless clients first use the
existing `/auth/device/*` flow when supported: print a short-lived URL/code,
authorize in another browser, poll with bounded interval, and store the result
in the client secure store. If a client cannot use device authorization, show a
link to create a dedicated MCP CLI key in Settings/API Keys. The key has a
client purpose, explicit scopes, five-hour/day/seven-day quota, expiry, one-time
reveal, and revoke status. It is never a Worker token, provider key, OAuth
refresh token, or server secret.

The generated instructions must support endpoint copy, Hermes deep link, CLI
setup, Claude/Codex settings/config paths, and a safe verification sequence.
The UI must show tenant, origin, scopes by human name, quota, expiry, and the
separate statuses of MCP connection, Hermes device, and local runtime.

### UI/UX Contract

- Target user/job: an end user connecting an existing AI client with minimal
  setup and no secret confusion.
- Surfaces: Settings → MCP and Devices; existing MCP/Hermes/server panels;
  connected-device detail/revoke; API Keys create/reveal form; `/v1/docs`.
- Components: shared descriptor hook/helper, client selector, auth-mode cards,
  scope/quota preview, browserless device-code card, one-time-key reveal card,
  verification result card, and device list. Do not merge existing panels.
- State matrix: loading/checking, OAuth ready, OAuth unavailable with fallback,
  device code pending/expired/approved, key reveal once/hidden-after-copy,
  connected/expired/revoked, runtime unavailable, and verification failure.
- Responsive: cards stack on mobile, two-column setup on tablet/laptop, full
  detail table on desktop; no horizontal scrolling for commands or scope lists.
- Accessibility: keyboard activation, visible focus, labelled client/auth
  controls, semantic status text, no color-only state, confirmation for revoke,
  reduced-motion-safe polling.
- Visual/copy: reuse existing dashboard/card/button/badge tokens. Thai and
  English copy must explain OAuth, device approval, scope, quota, expiry, and
  fallback in plain language; never show technical scope codes alone.
- Browser evidence: focused Playwright or existing settings browser harness
  must cover setup, fallback, one-time reveal, verification, and revoke.

### Acceptance

- A user can copy correct setup for all listed clients without editing server
  environment files.
- Browserless flow expires, rejects replay, and recovers after approval.
- Key secret is never rendered again after one-time reveal and never appears in
  logs/URL/telemetry.
- Revocation immediately blocks cached credentials and the UI reflects it.

## 5. Section 03 — Hermes parent task and typed child-job correlation

### Objective

Allow SmartAIHub chat/UI to send work to an approved Hermes device while
reusing `external_agent_task` and typed worker jobs. Keep MCP as a tool channel;
the device-facing relay is outbound/pollable and does not open inbound ports.

### Files and symbols

- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/runEngine.ts`
- `apps/web/server/hermesWorker/controlPlaneClient.ts`
- `apps/web/shared/workerRuntime.ts`
- existing conversation/team/work-status services discovered during impact
  analysis
- `apps/web/server/services/__tests__/workerSchedulerService.test.ts`
- new focused parent/child contract tests beside the owning service

### Implementation

1. Define a versioned, redacted parent correlation envelope for conversation
   id/message id, target worker, operation, approval, reservation, expiry,
   child ids, and result summary. Validate it with the existing shared schemas.
   The first storage projection is the existing bounded `metadataJson`/
   `instructionsJson` on `worker_jobs` using a shared Zod schema in
   `apps/web/shared/workerRuntime.ts`; fields are capped and may contain only
   opaque ids, enum states, timestamps, and bounded summaries. It must never
   contain tokens, local paths, binary data, provider URLs, or arbitrary prompt
   text.
2. Extend the input/instructions projection used by `queueHermesWorkerJob`
   without changing the existing `external_agent_task` job type or bypassing
   preferred-worker/readiness/feature-flag checks.
3. Add a typed child-job creation helper that calls the existing scheduler for
   `comfy_*`, Remotion, FFmpeg, or Local AI contracts. Enforce parent idempotency,
   bounded fan-out, aggregate quota, and no duplicate reservation.
4. Project worker events/artifacts into the existing conversation/status path;
   do not put binary data, local paths, tokens, or permanent URLs in agent
   events. Parent success requires required child publication acknowledgement.
5. Use existing claim/heartbeat/events first. Add only a minimal polling/cursor
   projection if existing worker APIs cannot represent browser-close/reconnect
   behavior. Persist durable state in existing job/conversation records. A
   migration is allowed only when the owning records cannot query/retain the
   bounded correlation fields; if required, it must add explicit tenant-safe
   parent/child indexes and rollback SQL rather than a duplicate task queue.

### Acceptance

- One chat request produces one parent correlation and typed child jobs.
- Duplicate submission/reconnect does not duplicate jobs or credits.
- Parent remains recoverable across browser close/device reconnect and reports
  partial/failed/pending-publication results clearly.
- Hermes cannot use the parent envelope for arbitrary shell/process/file access.

## 6. Section 04 — Concrete ComfyUI adapter and artifact path

### Objective

Make web/MCP ComfyUI image/video requests execute on an eligible Windows/macOS
worker, process sequential jobs, upload verified artifacts, and publish them to
Media History/Library through existing authorities.

### Files and symbols

- `apps/web/shared/workerRuntime.ts` existing Comfy schemas/stages/failures
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/workflowWorkerRuntimeService.ts`
- `apps/web/server/hermesWorker/controlPlaneClient.ts`
- `apps/worker-app/src-tauri/src` worker claim/handler/process modules
- `apps/worker-app/runtime-pack` and runtime profile code
- existing worker artifact/output collector and ffprobe helpers
- focused web/worker tests plus a real-machine fixture adapter test

### Implementation

1. Define a registered Comfy service binding with loopback default, auth,
   version, API root, workspace/output root, health checks, model/custom-node
   catalog, and resource limits. Reject arbitrary job-supplied URLs or paths.
2. Implement the worker adapter boundary: detect service, check readiness,
   submit normalized workflow to `/prompt`, observe queue/WebSocket/history,
   interrupt by prompt id, and collect approved outputs. Isolate Comfy API
   version details from scheduler/billing/storage.
3. Use per-job workspace and authorized short-lived input references. Validate
   path/symlink/junction boundaries and output allowlists.
4. Validate image MIME/size/dimensions/checksum and video MIME/size/checksum,
   duration/dimensions/framerate/codec/container with `ffprobe` before upload.
5. Use existing artifact init/upload/complete and publication. Support bounded
   resumable transfer, checksum reconciliation, cleanup, lease renewal, and
   exactly-once artifact identity.
6. Enforce default concurrency one per Comfy runtime, A→B→C queue order,
   bounded cancel/interrupt, retry taxonomy, orphan recovery, and no duplicate
   billing/publication.

### Acceptance

- Fixture tests cover image, video, progress, cancel, rejection, timeout,
  missing model/node, malformed output, upload retry, and restart.
- A web request and an MCP request use the same typed contract and status model.
- Real approved ComfyUI acceptance remains a production gate until run on
  Windows 11 and the release-approved macOS target.

## 7. Section 05 — Runtime readiness and process safety

### Objective

Ensure workers never claim a job that will fail because Node/Chromium/FFmpeg/
Comfy/Python/model/custom-node/GPU/Metal/WSL2/Keychain prerequisites are
missing, and ensure all managed processes are typed and owned.

### Files and symbols

- `apps/worker-app/src/main.tsx`
- `apps/worker-app/src-tauri/src/runtime_manifest.rs`
- `apps/worker-app/src-tauri/src/hermes_runtime.rs`
- runtime pack preparation/release scripts
- `apps/web/server/routes/workerRuntime.ts`
- shared worker readiness schemas and tests

### Implementation

- Extend the signed runtime profile with component provenance, platform/arch,
  health checks, models/custom nodes, license/disk/admin/reboot requirements,
  capability bindings, and manual command ids.
- Make Install/Repair/Update/Verify/rollback atomic and drain-aware. A second
  request attaches to an existing install transaction.
- Add process-manager profiles for ComfyUI, Remotion, FFmpeg, and Local AI with
  owned process identity, bounded stdout/stderr, cancellation, graceful drain,
  no arbitrary PID kill, and cleanup/recovery.
- Keep current runtime IDs truthful: Hermes macOS arm64 is supported only when
  its pack passes; Remotion macOS remains blocked without a signed sidecar;
  Intel remains unsupported without a signed pack.

### Acceptance

- Unit tests cover signature/hash/arch checks, missing dependencies, rollback,
  WSL2/admin/reboot, macOS Gatekeeper/Keychain, process ownership, and claim
  blocking. Clean-machine tests remain external gates.

## 8. Section 06 — UI, docs, telemetry, and rollout controls

### Objective

Make production status and support instructions truthful, measurable, and
recoverable for users and operators.

### Implementation

- Add telemetry dimensions endpoint, transport, client family/version,
  auth-mode, tenant-safe device/runtime id, capability, status, failure code,
  latency, quota window, and publication state; redact tokens, prompts where
  policy requires, local paths, and provider secrets.
- Update `/v1/docs`, MCP resources, Settings UI, Hermes manual, and generated
  setup cards from shared descriptors. Clearly separate Hermes CLI, Hermes One,
  Claude, Codex, generic MCP, browserless flow, MCP connection, device, and
  renderer readiness.
- Add UI for tenant/device/origin/scopes/quota/expiry/revoke and no-browser
  fallback. Preserve legacy pairing/REST as compatibility fallback and track
  deprecation telemetry for 30–90 days before removal.
- Add operator rollout report for feature flags and runtime config; production
  values are DB/UI controlled, feature flags remain off until their gates pass.

### UI acceptance

Use the UI/UX contract from Section 02. Add browser evidence for settings,
OAuth/PRM readiness, fallback, device revoke, task status, and blocked runtime.

## 9. Section 07 — Verification, gates, and handoff

### Implementation verification

- Run focused Vitest suites for changed MCP/OAuth/worker/client modules.
- Run web typecheck for touched contracts and Worker App Cargo/type checks for
  touched runtime code.
- Run MCP protocol smoke/readiness/failure harness with safe test credentials.
- Run `git diff --check` on explicitly changed files and compare generated docs
  against runtime descriptors.
- Run database migration checker and inspect live migration journal before any
  migration; never assume a migration applied because a script printed success.

### Production gates that cannot be closed in code-only work

- real authenticated Hermes/Claude/Codex clients;
- clean Windows 11 native/WSL2 and Apple-Silicon macOS install;
- signed runtime release and macOS Remotion sidecar;
- real ComfyUI image/video workflows with models/custom nodes/GPU;
- artifact publication/download in production and telemetry cohort evidence.

The final handoff must distinguish implemented code, focused test proof,
repository-wide baseline failures, and external gates. No mock or package
availability is allowed to be reported as real render/upload proof.

## 10. Git/worktree policy

The checkout is dirty with unrelated user changes. Implementation must stage
only files created or intentionally modified by Feature 148; never use broad
`git add -u`, reset, checkout, or destructive cleanup. Planning artifacts may
remain alongside the spec. Commits, if the implementation workflow creates
them, must contain only explicit Feature 148 paths and preserve unrelated work.
