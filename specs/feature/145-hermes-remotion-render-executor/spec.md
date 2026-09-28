# Feature 145: Hermes-triggered Dedicated Remotion Render Executor

**Status:** CODE-LEVEL IMPLEMENTATION COMPLETE — NATIVE PLATFORM RELEASE GATES PENDING
**Version:** 0.9.0
**Created:** 2026-08-16
**Priority:** P1 — remove the requirement for end users to install/build the Tauri Worker App for supported Remotion renders
**Owner:** Render Platform / Hermes Agent Runtime / Worker Fabric
**Depends-on:** Feature 133 (`remotion_render_video`), Feature 077 (distributed worker fabric), Feature 081 (Hermes Agent Runtime Gateway)
**Related:** Feature 135 Hermes media worker, Feature 144 Vertical Drama procedural motion contract

## 1. Executive decision

Add a dedicated, headless **Remotion Executor** runtime plus an
**Existing Hermes Install Fast Path**. The fast path is the default onboarding
for standalone Hermes CLI/agent and Hermes One installations on Windows 11 and
macOS. It adopts an already-working local Hermes/Remotion installation when it
passes the server contract checks, and automatically provisions a signed
managed runtime when any required component is missing or incompatible.

The user-facing product is a small signed **SmartAIHub Hermes Connector**. It is
not a second renderer and does not replace Hermes CLI/Hermes One. It performs
local discovery, doctor/provisioning, device pairing, secure credential storage,
MCP connection setup, and starts the same headless Remotion Executor worker.
The connector reduces first-time setup to one connect action and one browser
approval without asking the user to copy a worker token, MCP token, API key, or
filesystem path.

Hermes Agent is the **control interface**, not the renderer:

1. Hermes calls a server-owned MCP tool to request, inspect, or cancel a
   Remotion render.
2. The server authenticates the request, validates ownership and job state, and
   enqueues or routes the existing `remotion_render_video` job.
3. The Connector/Remotion Executor registers as a worker and communicates with
   the server through the existing REST Worker Control Plane.
4. The executor runs the existing Remotion sidecar locally with Node,
   Chromium, FFmpeg/ffprobe, and required fonts.
5. The executor reports progress and uploads artifacts through the existing
   worker APIs. The server remains the only authority that changes job state,
   billing, and application-level render references.

This feature also defines the complete, authenticated Hermes MCP surface for
image generation, video generation, connection management, capability
discovery, manual operation queries, and Remotion rendering. MCP is the single
Hermes-to-server intent/status boundary; the existing Worker REST protocol remains
the only Hermes/Executor-to-server data plane for leases, progress, and binary
artifact upload. For standalone Hermes clients, the Connector owns the secure
MCP agent session and forwards requests over HTTPS to `smartaihub.app`; Hermes
never receives a worker refresh token or provider credential.

The feature must not turn the general `hermes_agent_gateway` into an
unrestricted renderer. It introduces a separate runtime identity,
`remotion_executor`, and a separate capability profile. An adopted standalone
Hermes installation is represented by that identity only after Connector doctor
and server admission pass. Existing Worker App and Hermes media jobs remain
compatible and continue to use their current runtime types.

### 1.1 Simplified user journey

The normal first-time journey is:

```text
Install/open SmartAIHub Hermes Connector
  → Connect to SmartAIHub
  → detect Hermes CLI or Hermes One
  → detect and verify Remotion/Node/Chromium/FFmpeg/fonts
  → auto-install missing/incompatible components from a signed runtime pack
  → open SmartAIHub login/consent once
  → store device/refresh material in DPAPI or Keychain
  → configure the Hermes MCP connection to smartaihub.app
  → register the worker and publish Ready
```

After first approval, startup and refresh are automatic. The user-facing state
is limited to `Connected`, `Remotion ready`, `Installing missing components`,
`Needs login`, or `Blocked with next action`. The UI never requires the user to
understand worker claims, leases, Redis, presigned URLs, or scope strings.

## 2. Current codebase compatibility audit

The proposed design is additive and fits existing seams:

| Existing seam | Current behavior | Compatibility decision |
|---|---|---|
| Remotion payload | `remotion_render_video` has a strict shared schema and contract version | Reuse the payload unchanged; executor must parse the same schema. |
| Portable renderer | `@smartspec/remotion-render` owns the environment-agnostic 10-stage orchestration | Reuse it; do not create a Hermes-specific renderer implementation. |
| Worker claim | `workerJobMatchesSelection` checks the Remotion contract version and exact claim capability | Extend runtime registration/selection while preserving the exact gate. |
| Job creation | `queueRemotionRenderVideoJob` currently writes `runtimeType: desktop_zeroclaw_managed` | Add an explicit execution target resolved by the server; preserve the current default when the new flag is off. |
| Worker API | Claim, events, artifact init, and artifact complete REST routes already exist | Reuse these routes; add only runtime/profile admission and any missing generic status surface. |
| MCP vocabulary | Existing MCP registry owns the typed `smartspec.*` catalog, scope filtering, idempotency, and safe result projection | Keep worker-level contracts separate; register Hermes/media/Remotion tools in the existing catalog rather than creating a second MCP route. |
| Hermes media contract | `hermesMedia.ts`, `hermesMediaScheduler.ts`, and `hermesMediaAdapter.ts` already define provider-neutral operations, connection capability manifests, idempotency, credit handling, and safe task projections | Reuse these contracts for MCP image/video calls; do not create a second Hermes media queue or result/upload contract. |
| Hermes connection control | `hermes_connection_authorize`, `_probe`, and `_disconnect` are durable worker jobs with device-code events and typed failure reasons | Expose the existing owner-scoped service through typed MCP tools; never run `hermes auth` directly inside an MCP request. |
| Standalone Hermes CLI/Hermes One | Existing Hermes installations are local agent/provider runtimes and are not automatically registered as SmartAIHub Remotion workers | Add the signed SmartAIHub Hermes Connector fast path: discover/adopt a compatible install, auto-provision missing runtime components, pair once in the browser, and register a separate `remotion_executor` identity. |
| MCP authentication | `/v1/mcp` normalizes OAuth bearer, session, API-key, and delegated-worker context into tenant/user-scoped MCP sessions | Canonical Hermes setup uses browser OAuth/PKCE with no copied API key; retain scoped API-key/pairing only as compatibility fallback. Never trust caller-supplied tenant/user headers or pass MCP credentials to a worker. |
| Manual Hermes usage | Hermes CLI capabilities are discovered after auth through `auth status`, `tools`, version, and optional bounded generation tests | Publish a server-owned capability manifest and expose every supported operation through typed MCP tools; unsupported or unavailable CLI functions must be reported explicitly, never guessed or executed as shell. |
| Library MCP access | `smartspec.knowledge.library.search/get` already use the Library permission engine, but the current MCP surface has no complete file-download contract | Extend visible-library reads and add an ACL-checked download broker for every registered file type, including R2-backed objects. |
| Storage proxy | `/api/storage/files/*` streams a managed key and supports video ranges, but the route is not the user permission decision point | MCP must never expose a raw storage key/proxy path as a download grant; authorize the Library/media object first, then mint a short-lived download reference. |
| Media history | `media.listTasks` merges provider, deferred, HyperFrames, MCP, and Hermes sources for the logged-in UI user | Add MCP history list/get/download tools backed by the same merged sources and enforce user/tenant scope at every source. |
| MCP server | `mcpRegistry.ts` owns the tool catalog, scope filtering, idempotency, delegated-worker policy, and `/v1/mcp` execution | Register render tools in the existing `jobs` family; do not create an ad-hoc MCP route or add render tools to the worker protocol list. |
| Hermes gateway | `hermes_agent_gateway` currently supports external agent tasks and network-oriented profiles | Do not add Remotion to its general job allowlist. |
| Worker App | Tauri/Rust dispatches Remotion through the installed runtime pack | Leave it as a supported legacy/desktop executor. No Worker App or Xcode dependency is added to the new path. |
| Mac runtime | Current Worker App Mac documentation says the Remotion native sidecar/runtime is not packaged | The new standalone executor may run on Mac, but its Node runtime pack must be provisioned separately. |
| Worker authentication | Worker registration, execution, upload, refresh tokens, device proof, nonce replay protection, and tenant/runtime binding already exist | The executor must use the same connect/approve flow and proof headers; it must not use a long-lived user token or bypass device binding. |
| Artifact publication | `initWorkerArtifactUpload` creates a server-owned storage ref and presigned PUT; `completeWorkerArtifact` records checksum/size/lease and terminal publication resolves safe URLs | Match the Worker App Remotion flow exactly: upload the MP4 through the artifact protocol and send the metadata artifact descriptors in the terminal completion event. |
| Hermes Connector media upload | Existing web/manual flows already publish generated media through server-owned artifact/task finalization | Connector and adopted Hermes runtimes must use the same init/upload/complete, checksum, MIME/probe, publication, billing, history, and ACL/download path for both images and videos; MCP returns references, never raw bytes. |

Authoritative references:

- [shared worker runtime contracts](../../../apps/web/shared/workerRuntime.ts)
- [Remotion worker schema](../../../packages/remotion-render/src/remotionRenderVideoSchema.ts)
- [portable Remotion job](../../../packages/remotion-render/src/renderVideoJob.ts)
- [Remotion scheduler](../../../apps/web/server/services/workerSchedulerService.ts)
- [worker claim service](../../../apps/web/server/services/workerRegistryService.ts)
- [worker runtime routes](../../../apps/web/server/routes/workerRuntime.ts)
- [Worker App Remotion executor](../../../apps/worker-app/src-tauri/src/worker_loop.rs)

### 2.1 Implementation baseline and explicit gap register

The initial implementation is now present in the worktree. The existing
Remotion schema/orchestrator, Worker App executor, MCP registry, worker
authentication family, and ACL-checked storage/download foundation remain the
authoritative compatibility paths. The new implementation adds the dedicated
runtime identity, target-aware scheduling, owner/device-bound MCP pairing,
high-level Remotion MCP tools, browser approval, runtime-pack distribution
hooks, and the standalone Node executor package. Native release signing and
real Windows/macOS render evidence remain deployment gates, not assumptions.

The following rows are the implementation/rollout ledger. Code-level rows are
implemented in the shared worktree; release rows remain deployment gates and
must not be silently treated as native-platform evidence:

| Gap | Current evidence | Required plan outcome |
|---|---|---|
| Dedicated runtime identity | Implemented in shared runtime enum/definitions, Drizzle enum, migration, registration validation, scheduler routing, and tests. | Keep the flag off until signed native packs and platform evidence pass. |
| Standalone executor | Implemented at `apps/remotion-executor/` with connect, doctor, worker loop, lease/event client, artifact client, runtime provisioning, device proof, and platform credential adapters. | Native Windows/macOS packaging and real render evidence remain external production gates. |
| Existing-install adoption | Implemented as a closed known-path Hermes discovery registry and managed-pack fallback; runtime provenance is recorded in registration metadata. | Expand platform-specific executable/manifest probes in the release hardening wave. |
| Standalone MCP pairing | Implemented with Redis-only short-lived pairing state, PKCE, browser approval, exact scopes, device binding, refresh rotation, device revocation through `smartspec.hermes.agent.disconnect`, and DPAPI/Keychain storage. | Add native OS integration tests; browser approval remains the consent UI and MCP disconnect is the revocation control. |
| High-level Hermes MCP | Implemented in the existing registry: capabilities/status/authorize/probe/disconnect/test-generation/media-execute, connector status/agent disconnect, Remotion submit/status/cancel, and existing media/library/history/download tools. | Keep the catalog typed and deny-by-default; no shell bridge is permitted. |
| Hermes scope vocabulary | Additive least-privilege scopes are implemented as `hermes:connect`, `hermes:read`, `hermes:disconnect`, and `hermes:generate`; pairing rejects unsupported/widened scopes. | Preserve deny-by-default behavior for old keys and require explicit consent for authorization. |
| Dedicated-executor feature flag | `remotionDedicatedExecutorEnabled` is implemented, default-off, allowlisted, and Redis-synced for admin flag propagation. | Keep default false until native proof. |
| Download service naming | Existing code uses `managedMediaAccessService.ts`, `managedStorageAuthorizationService.ts`, and `mcpDownloadBrokerService.ts` | Reconcile these names in the implementation plan and keep one canonical authorization path; do not create a fourth download policy. |
| Legacy provider media history | Legacy Python `media_tasks` now needs tenant-scoped migration `013_add_media_task_tenant_id.py` and request-tenant propagation | Include migration ordering, legacy-null-row behavior, API filters, and MCP adapter compatibility in the data-safety wave. |
| Redis topology | Feature 145 ephemeral auth/connect/session/download-grant state uses the split cache client; the legacy client remains for unrelated legacy/BullMQ paths. | Redis outage fails closed for auth-sensitive state; render queue, payloads, media bytes, credentials, leases, and artifacts remain PostgreSQL/worker-control-plane state. |
| Remote MCP device management | Implemented in section 09 with a durable owner-scoped connected-device record, safe token-expiry metadata, Settings inventory, audit logging, and idempotent revoke wired to MCP and worker credential lineages. | Keep Remote MCP no-download as the default; require signed native release evidence before exposing local executor installation. |

Deep-plan must close each row with exact files, symbols, migration order,
tests, and rollout gates before deep-implement is allowed to start.

## 3. Goals

### G1 — Render without Tauri/Xcode

Allow a supported Remotion render to execute through a standalone Node
executor. A Mac deployment may use a Node service/CLI and must not require
building a `.app`/`.dmg` with Xcode.

### G2 — Keep Hermes as a safe control plane

Expose high-level render tools to Hermes Agent while keeping job authorization,
payload construction, billing, state transitions, and artifact publication in
server-owned code.

### G3 — Preserve the existing Remotion contract

Use the existing `remotion_render_video` job type, strict payload schema,
contract version, renderer policy version, progress stages, failure codes,
artifact shape, idempotency, and bounded retry behavior.

### G4 — Preserve existing executors

The Worker App remains a valid executor for Windows/WSL2 and future native Mac
deployments. Existing jobs and tenants must not be silently migrated.

### G5 — Keep the server out of the Chromium render process

The executor, not `smartspec-web`, owns the Chromium/FFmpeg process and its
memory pressure. The server only schedules, authenticates, observes, and
reconciles.

### G6 — Make Hermes MCP functionally complete for supported media operations

An authenticated Hermes user must be able to discover available functions,
inspect the connected account and model/operation limits, authorize/probe/
disconnect the provider connection, submit every supported image/video
operation, read progress, cancel work, and receive the published result through
MCP. “Complete” means complete for the server-published capability manifest,
not arbitrary execution of every command present in a local CLI installation.

### G7 — Make MCP login and worker connection security equivalent to Worker App

The MCP caller, Hermes worker, provider account, and Remotion executor are
separate security principals. Each must authenticate through the existing
server-owned flow, remain bound to tenant/user/runtime scope, and use the
minimum token and permission surface required for its next operation.

### G8 — Provide permission-correct Library, R2, and media-history downloads

Hermes MCP must be able to search/read every Library item visible to the
authenticated user and download any registered file type that the user is
authorized to read, including images, videos, audio, documents, archives, and
future MIME types. It must also list, inspect, and download the user's complete
media history across all existing task sources. A download is granted only
after server-side ACL/ownership checks; knowing a URL, storage key, task ID, or
library item ID is never sufficient.

### G9 — Make existing Hermes onboarding one-action and self-healing

Standalone Hermes CLI/agent and Hermes One users must not install a second
renderer or manually copy credentials when their existing installation is
compatible. The Connector must detect the installation, adopt it when safe,
automatically install missing/incompatible components from the signed managed
pack, and expose one corrective next action when installation cannot proceed.
Once connected, generated images and videos must follow the exact server-side
artifact, publication, billing, media-history, and ACL/download path used by
web/manual generation.

## 4. Non-goals

- Do not make Hermes Agent execute arbitrary shell commands or arbitrary Node
  scripts.
- Do not allow Hermes to submit arbitrary `inputJson` for a Remotion job.
- Do not replace the existing `remotion_render_video` contract with a new job
  type.
- Do not remove or rewrite the Tauri Worker App.
- Do not make the general `hermes_agent_gateway` claim every Remotion job.
- Do not move database access into the executor.
- Do not use MCP for binary artifact transfer or long-running worker heartbeats.
- Do not treat a natural-language request for “any function” as permission to
  execute an unregistered Hermes CLI command, shell command, provider URL, or
  local file operation. Only the published typed capability catalog is callable.
- Do not give MCP direct bucket listing, arbitrary R2 object access, local
  filesystem access, or a raw storage-key-to-URL conversion tool.
- Do not change the existing Lane A/Lane B policy for Vertical Drama or
  Marketplace without a separate approval and memory-capacity review.

## 5. Runtime and ownership model

### 5.1 Runtime types

Add `remotion_executor` to the shared worker runtime type contract. It is a
service identity, not a user-facing Hermes model.

The runtime must advertise:

```text
runtimeType: remotion_executor
runtimeMode: native_constrained | docker_isolated | external_managed
executionIdentityMode: service_identity
resourceProfile: cpu_heavy or long_running
runtimeSource: existing_hermes_install | managed_runtime_pack
```

The exact runtime mode is deployment-specific, but the executor must report a
doctor/readiness record before it can claim work. `runtimeSource` is server-
visible provenance, not a trust grant: an existing Hermes installation is
eligible only after the same manifest, contract, checksum/probe, path, and
capability checks as a managed pack. If adoption fails, the Connector
automatically provisions the managed pack and retries doctor before presenting
an actionable failure.

### 5.2 Capability profile

The executor must claim only when it advertises all of:

```text
remotion-render
chromium-render
ffmpeg-probe
remotion-render-contract-2026-08-04.2
```

The contract token must be derived from the shared
`REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION`; it must not be typed as an
independent mutable string in the executor.

The server must reject a claim when:

- the runtime type is not `remotion_executor` or an explicitly supported
  legacy executor;
- the contract token is missing or stale;
- the doctor/readiness state is not healthy;
- the executor does not advertise all required Remotion families;
- the executor is already at its render concurrency limit.

### 5.3 Ownership boundaries

| Responsibility | Owner |
|---|---|
| User/agent intent and conversational response | Hermes Agent |
| MCP authentication and tool authorization | Server Hermes/MCP adapter |
| Job payload, idempotency, credit reservation | Server scheduler |
| Claim lease and worker scope | Server worker registry |
| Chromium/FFmpeg/Remotion process | Dedicated Remotion Executor |
| Progress and artifact upload | Executor through server REST APIs |
| Terminal state, reconciliation, billing settlement | Server |
| UI status projection | Server application API/UI |

### 5.4 Supported platform matrix and fail-closed rules

The first implementation must support the native Windows 11 and macOS targets
below. These are separate runtime packs; binaries, native Node modules, browser
builds, and manifests must never be reused across rows. WSL2 remains an explicit
compatibility target for a future Linux pack (or the existing Worker App); it is
not advertised by the current standalone executor because `runtimePackId()`
fail-closes on Linux rather than mixing Windows and Linux assets.

| Target | Runtime pack ID | Process model | Required platform assets | Support rule |
|---|---|---|---|---|
| Windows 11 x64 native | `remotion-executor-windows-x64` | Native Node service/CLI; no WSL dependency | `node.exe`, Windows Chrome for Testing, `ffmpeg.exe`, `ffprobe.exe`, Thai/fallback fonts, Remotion sidecar and Windows native dependencies | First-class Windows 11 target; runs as a non-admin user/service and claims only when the Windows doctor passes. |
| Windows 11 + WSL2 | future `remotion-executor-wsl2-linux-x64` | Not enabled in the current standalone package; use the existing Worker App or a separately published Linux pack | Linux Node, Linux Chrome, Linux FFmpeg/ffprobe, Linux native modules, fonts, Remotion sidecar | Not claimable by the current standalone executor. A future pack must be launched inside WSL2 and must never mix Windows and Linux paths. |
| macOS Apple Silicon | `remotion-executor-macos-arm64` | Native Node service/CLI; no Tauri/Xcode requirement on the user machine | arm64 Node, arm64 Chrome for Testing, arm64 FFmpeg/ffprobe, fonts, Remotion sidecar and arm64 native dependencies | First-class macOS target; the release must be signed/notarized where distribution policy requires it and must pass the arm64 doctor. |
| macOS Intel | `remotion-executor-macos-x64` | Native Node service/CLI; no Tauri/Xcode requirement on the user machine | x64 Node, x64 Chrome for Testing, x64 FFmpeg/ffprobe, fonts, Remotion sidecar and x64 native dependencies | Must have a separate verified pack. It is never allowed to consume the Apple Silicon pack. |

The server must publish `runtimePlatform`, `architecture`, `minimumOsVersion`,
`nodePath`, `browserPath`, `ffmpegPath`, `ffprobePath`, native dependency
identifiers, and the Remotion contract in every manifest. An executor must
compare those fields with its actual host before registration and must report
`ready: false` when any required asset, architecture, checksum, contract, font,
disk, browser launch, FFmpeg probe, or native dependency check fails.

Windows 11 support means native Windows support in the first-class row above;
the user must not be required to install WSL2 for that target. WSL2 is an
explicit separate mode for operators who choose it. macOS support means both
Apple Silicon and Intel have independent release/doctor paths; an unsupported
architecture must be rejected before claim rather than falling back to a
foreign binary.

## 6. Hermes MCP interface

### 6.0 Unified media and Hermes MCP contract

The MCP surface has three layers with one shared task/result envelope:

| Layer | Canonical tools | Responsibility |
|---|---|---|
| Provider-neutral media | Existing `smartspec.media.generate_image`, `smartspec.media.generate_video`, `smartspec.media.status`, plus `smartspec.media.cancel` | Submit and observe image/video work. An optional, validated `provider: "hermes"` and `connection_id` route the request through `queueHermesMediaJob`; existing callers without these fields remain compatible. |
| Hermes manual control | `smartspec.hermes.capabilities`, `smartspec.hermes.connection_status`, `connection_authorize`, `connection_probe`, `connection_disconnect`, `connection_test_generation`, and `media_execute` | Discover and operate every server-published Hermes media function without shell access. |
| Remotion render control | `smartspec.remotion.render_video`, `smartspec.remotion.job.status`, `smartspec.remotion.job.cancel` | Route a server-compiled existing Remotion project to the ready per-user executor. |
| Connector readiness | `smartspec.hermes.connector.status` and `smartspec.hermes.agent.disconnect` | Read paired local Connector readiness and revoke the current MCP device session. Never return local paths or credentials. |

The existing `smartspec.media.*` names remain stable. New Hermes-specific tools
are explicit control and capability tools, not a second hidden media stack.
All asynchronous media tools return the same safe envelope:

```json
{
  "taskId": "string",
  "kind": "image | video | remotion",
  "status": "queued | claimed | running | uploading | completed | failed | canceled | expired",
  "progress": { "stage": "string", "percent": 0 },
  "result": { "artifactRefs": [] },
  "error": { "code": "string", "message": "string", "retryable": false }
}
```

The envelope never contains bearer tokens, worker refresh tokens, private
keys, filesystem paths, raw provider responses, storage references as public
URLs, or unredacted signed URLs.

### 6.0.1 Capability discovery and “ถามการใช้งาน”

`smartspec.hermes.capabilities` is the authoritative MCP answer to questions
such as “Hermes ใช้งานอะไรได้บ้าง?”, “บัญชีนี้สร้างภาพ/วิดีโอได้หรือไม่?” and
“ต้องใช้ reference กี่ภาพ?”. It returns only the intersection of:

1. server policy and enabled model catalog;
2. the authenticated user's tenant/team/connection grants; and
3. the latest authorized Hermes connection manifest.

The result must include the connection state, Hermes version, supported
operations, models, reference/output limits, required scopes, feature flags,
last probe time, and last bounded image/video generation-test result. It must
also include an explicit `unavailableReason` for every known operation that is
disabled, unsupported, unauthorized, or missing from the installed Hermes
tool list. This prevents the agent from guessing a function that the runtime
cannot perform.

The MCP `tools/list` catalog must contain descriptions, input schemas, safe
examples, required scopes, and idempotency requirements for every implemented
Hermes tool. A natural-language question is answered by reading this catalog
and calling the capability tool; it is never converted into a raw CLI command.

### 6.0.2 Complete supported Hermes operation set

`smartspec.hermes.media_execute` accepts a strict operation enum matching
`HERMES_MEDIA_OPERATIONS`:

```text
image.generate
image.edit
video.generate
video.image_to_video
video.reference_to_video
```

Its input is limited to the typed prompt, model/settings, ordered asset IDs
and SHA-256 references, optional entity/storage metadata, and an idempotency
key. URLs, local paths, arbitrary headers, provider tokens, shell arguments,
and free-form CLI flags are rejected. The server validates operation-specific
reference bounds and capability intersection before creating the same
`hermes_media_*` job used by the existing UI/tRPC path.

The existing generic image/video tools are compatibility wrappers around this
same service when `provider: "hermes"` is selected. They must not have a
separate credit, retry, status, cancellation, or upload implementation.

### 6.0.3 Hermes connection-control tools

| MCP tool | Backing operation | Required behavior |
|---|---|---|
| `smartspec.hermes.connection_status` | Read connection and latest manifest | Owner-scoped status only; never returns credentials or raw CLI output. |
| `smartspec.hermes.connection_authorize` | `hermes_connection_authorize` | Creates a durable control job and returns a sanitized device URL/code only to the authenticated owner; never executes the CLI in the MCP request. |
| `smartspec.hermes.connection_probe` | `hermes_connection_probe` | Runs auth status, tools/version discovery, and optional bounded liveness test; persists the manifest and typed failure. |
| `smartspec.hermes.connection_disconnect` | `hermes_connection_disconnect` | Revokes the provider session and removes only the connection's isolated profile; requires explicit write authorization. |
| `smartspec.hermes.connection_test_generation` | Probe test mode | Allows only `image` or `video`, uses the fixed minimal test prompt, bounds time/output, discards the test artifact, and records the result in the manifest. |

The MCP response for authorization must include the next action and polling
identifier, for example: “Open the displayed verification URL and approve the
code, then call `connection_status`.” Device codes are never written to logs,
audit metadata, worker diagnostics, or generic error messages.

### 6.0.4 Existing Hermes Install Fast Path

The SmartAIHub Hermes Connector is the only component allowed to inspect and
adopt a local standalone Hermes CLI/agent or Hermes One installation. It uses a
closed platform-specific discovery registry, not a caller-supplied shell path:

1. Detect known Hermes CLI/Hermes One installation records and ask the user to
   select only among safe, user-owned candidates when more than one is found.
2. Verify executable provenance, version, architecture, installation root,
   runtime-pack manifest, Node, Chromium, FFmpeg/ffprobe, fonts, disk, and the
   exact Remotion contract. The Connector never trusts a binary merely because
   a file named `hermes` or `ffmpeg` exists.
3. If all checks pass, adopt the installation with
   `runtimeSource: existing_hermes_install` and reuse its verified Remotion
   assets. No duplicate runtime pack is downloaded.
4. If any mandatory check fails, download the exact signed platform pack from
   the public release manifest, verify Ed25519 signature/SHA-256/archive
   entries, install it atomically beside the existing Hermes installation, and
   rerun doctor. The Connector never overwrites or modifies the user's Hermes
   installation in place.
5. Start the one-time device pairing flow. The browser approval grants two
   separate, owner-bound credential families: worker control credentials for
   lease/progress/artifact calls and an MCP agent session for typed user-facing
   tools. Neither credential is interchangeable with the other or with a
   Hermes provider credential.
6. Configure the Hermes client to use `https://smartaihub.app/v1/mcp` through
   the Connector-managed credential broker. If a Hermes client cannot safely
   consume a dynamic credential callback, the Connector provides a local MCP
   compatibility proxy using an OS-protected named pipe/Unix socket where
   supported. A TCP fallback binds only to `127.0.0.1`, requires a per-device
   secret from DPAPI/Keychain, enforces an origin allowlist, rejects redirects,
   and forwards only to the same HTTPS MCP endpoint; it never becomes an
   arbitrary proxy and the server-side auth/scope policy is unchanged.
7. Register/report readiness and expose `smartspec.hermes.connector.status`. The Connector
   automatically refreshes credentials, restarts after updates, and retries
   only bounded transient failures. It stops and shows one corrective action
   for auth revocation, contract mismatch, unsafe path, signature failure, or
   missing OS credential access.

The user never receives a raw worker token, MCP refresh token, provider token,
presigned upload URL, local executable path, or R2/storage key. Connector
telemetry reports only safe status, version, platform, runtime source, and
stable error codes.

Add high-level, server-owned tools. These are not replacements for the
existing `smartaihub.worker.*` worker protocol names.

### 6.1 `smartspec.remotion.render_video`

Input:

```json
{
  "renderJobId": "string",
  "executionTarget": "auto | remotion_executor | desktop_worker"
}
```

Rules:

- `renderJobId` is required and must identify an existing server-created
  `remotion_render_video` job.
- `executionTarget` is optional. `auto` is the default and is resolved by the
  server, not by the model.
- The tool may not accept arbitrary Remotion templates, URLs, shell commands,
  output paths, credit amounts, or worker tokens.
- The server verifies tenant, user, team, project, and episode ownership before
  routing.
- This is an **ensure/route existing job** operation, not a generic job creator.
  It must not create a second `worker_jobs` row or credit reservation.
- The persisted routing target is immutable after job creation. `auto` reads the
  persisted target. An explicit target that differs from the persisted target
  returns `409 execution_target_immutable`.
- A legacy job with no routing metadata is treated as
  `desktop_worker` when its runtime type is `desktop_zeroclaw_managed`; Hermes
  cannot silently retarget that legacy job to the dedicated executor.
- All new callers that need the dedicated executor must pass the target to the
  server-owned Remotion queue function before the row is inserted.

Output:

```json
{
  "renderJobId": "string",
  "status": "queued | claimed | running | uploading | completed | failed | canceled | expired",
  "executionTarget": "remotion_executor | desktop_worker",
  "message": "safe user-facing status"
}
```

No access token, filesystem path, raw provider URL, internal stack trace, or
unredacted database row may be returned.

### 6.2 `smartspec.remotion.job.status`

Input:

```json
{
  "renderJobId": "string"
}
```

Output is an owner-scoped status projection containing the current state,
progress stage, safe failure code/message, output artifact references, and
timestamps. It must not expose worker credentials or internal workspace paths.

### 6.3 `smartspec.remotion.job.cancel`

Input:

```json
{
  "renderJobId": "string",
  "reason": "optional short reason"
}
```

The server performs the existing owner/admin authorization and terminal-state
guard. Cancellation must not be implemented as a direct database update from
Hermes.

### 6.4 MCP transport rule

MCP is used only for the Hermes-to-server intent/status boundary. The Hermes
tool handler must call a server service function in-process when hosted by the
same application; it must not make a loopback HTTP call to its own API unless
the runtime deployment requires a separate process.

### 6.5 MCP registry contract

The three tools must be added to `apps/web/server/_core/mcpRegistry.ts` and
therefore automatically appear in the canonical `/v1/mcp` catalog. They must
use the existing `video_projects` family and `video_generation` group:

| Tool | Family/group | Required scope | Write mode | Idempotency | Delegated-worker eligibility |
|---|---|---|---|---|---|
| `smartspec.remotion.render_video` | `video_projects` / `video_generation` | `remotion:submit` | Write | Optional | false |
| `smartspec.remotion.job.status` | `video_projects` / `video_generation` | `remotion:read` | Read | None | false |
| `smartspec.remotion.job.cancel` | `video_projects` / `video_generation` | `remotion:cancel` | Write | Optional | false |

The handlers must call server-owned services that operate on `worker_jobs` and
the owner-scoped worker-job projection. They must not call the generic
`createJob/getJob/cancelJob` automation table functions, must not make a
loopback HTTP request to `/v1/mcp`, and must not expose worker tokens,
`storageRef` values as public URLs, filesystem paths, or raw database rows.
The idempotency key is the MCP request key; the Remotion job's existing server
computed idempotency key remains authoritative for job creation.

The same registry must contain the unified Hermes tools. The exact scope names
are part of the implementation contract and must be added to the existing
scope catalog, API-key grant validation, session policy, and MCP tool filtering:

| Tool | Family/group | Required scope | Write mode | Idempotency | Delegated-worker eligibility |
|---|---|---|---|---|---|
| `smartspec.hermes.capabilities` | `media` / `media_generation` | `hermes:read` | Read | None | false |
| `smartspec.hermes.connection_status` | `media` / `media_generation` | `hermes:read` | Read | None | false |
| `smartspec.hermes.connection_authorize` | `media` / `media_generation` | `hermes:connect` | Write | Required | false |
| `smartspec.hermes.connection_probe` | `media` / `media_generation` | `hermes:connect` | Write | Required | false |
| `smartspec.hermes.connection_disconnect` | `media` / `media_generation` | `hermes:disconnect` | Write | Required | false |
| `smartspec.hermes.connection_test_generation` | `media` / `media_generation` | `hermes:generate` | Write | Required | false |
| `smartspec.hermes.media_execute` | `media` / `media_generation` | `hermes:generate` | Write | Required | false |
| `smartspec.media.cancel` | `media` / `media_generation` | `media:generate` | Write | Required | false |
| `smartspec.knowledge.library.download` | `knowledge` / `knowledge_read` | `library:download` | Read | None | true, only with explicit Library grant |
| `smartspec.media.history.list` | `media` / `media_generation` | `media:read` | Read | None | true, only with explicit history grant |
| `smartspec.media.history.get` | `media` / `media_generation` | `media:read` | Read | None | true, only with explicit history grant |
| `smartspec.media.history.download` | `media` / `media_generation` | `media:download` | Read | None | true, only with explicit history-download grant |

`smartspec.media.generate_image` and `smartspec.media.generate_video` retain
their existing `media:generate` scope and become compatibility wrappers. When
their validated provider selector is `hermes`, they call the same Hermes media
service and are subject to the same connection ownership, capability, quota,
idempotency, cancellation, and artifact rules. Adding `hermes:*` scopes must
not silently broaden an existing key; grants are opt-in and denied by default.

### 6.6 MCP login, tenant context, and authentication contract

MCP authentication and Worker App authentication are related but not
interchangeable:

| Principal | Authentication | Allowed use |
|---|---|---|
| Human/agent MCP caller | Authenticated `/v1/mcp` session or tenant-scoped API key with explicit MCP/Hermes scopes | Call catalog, connection, media, and Remotion tools within the caller's tenant/user/team grants. |
| SmartAIHub Hermes Connector | One-time browser/device approval yielding owner/device-bound `agent_pairing` session plus separate worker credential family | Configure an existing/provisioned local Hermes runtime and call the same MCP catalog within exact consented scopes; it cannot use worker/provider credentials interchangeably. |
| Hermes gateway worker | Existing Worker Connect start → browser login/approval → registration token → short-lived execution/refresh tokens, device proof, nonce protection, runtime/tenant/worker binding | Claim Hermes jobs, run the managed Hermes CLI, report progress, and upload results. It cannot call high-level MCP as a privileged bypass. |
| Connected provider account | Hermes device-code/OAuth flow inside an isolated per-connection profile | Generate media only for the owner-scoped connection after the server records `authorized` and a capability probe. |
| Remotion executor | Same Worker Connect/device-proof/token family with runtime type `remotion_executor` | Claim only compatible Remotion jobs and use only worker control/artifact routes. |

The `/v1/mcp` session must derive `tenantId`, `userId`, optional `teamId`,
auth mode, and scopes from the verified authentication result. The server must
reject missing context, anonymous requests, expired sessions, revoked API
keys, insufficient scopes, and cross-tenant `connection_id`/job IDs. Caller
headers such as `x-tenant-id` or `x-user-id` are never authoritative for a
normal session or API-key request.

MCP never accepts or returns a Worker App refresh token, provider OAuth token,
MCP bearer token, private key, or session cookie. In the first implementation,
browser-cookie MCP sessions are read/download-only; starting a provider
authorization job or any other MCP mutation requires a browser-approved OAuth
bearer with the exact operation scope and `mcp:write` (or a scoped API-key/
Connector-issued owner/device-bound `agent_pairing` compatibility session carrying
the exact operation scope and `mcp:write`. The provider
credential is stored only in the isolated Hermes profile and is never copied
into MCP arguments, `worker_jobs.inputJson`, logs, or artifact metadata.

### 6.7 MCP-to-Hermes connection flow

The complete connect path is:

1. The user logs in to Smart AI Hub through the normal browser session for the
   approval UI and status visibility. The Connector uses the one-time
   owner/device consent flow to obtain `agent_pairing`; non-Connector mutating
   MCP clients use browser-approved OAuth/PKCE or a tenant-scoped API-key
   compatibility fallback with
   `hermes:connect` and `mcp:write`.
2. MCP calls `smartspec.hermes.connection_authorize` with an owned connection ID or requests a
   new connection through the server-owned connection service; a cookie-backed
   MCP session cannot invoke this mutating operation in the first release.
   The Connector's `agent_pairing` is the supported low-friction authenticated
   mutation path for an existing Hermes installation.
3. The server creates `hermes_connection_authorize` with tenant/user and
   connection affinity; it does not spawn Hermes from the HTTP/MCP handler.
4. The paired Hermes worker claims the control job using its worker execution
   token and device proof, creates/uses the isolated profile, and executes the
   existing authorization state machine.
5. A device-code event is stored only in the scoped job event projection and
   returned to the authenticated owner as a sanitized next action. It is
   never logged or returned to another tenant/user.
6. The user completes provider approval outside MCP. MCP polls
   `smartspec.hermes.connection_status` or `smartspec.hermes.connection_probe` with bounded requests.
7. The server records `authorized`, runs capability discovery, and publishes
   only the supported operation/model intersection.
8. A media call is accepted only after this server-side state and capability
   gate succeeds.

If authorization expires, is revoked, or the provider entitlement is missing,
MCP returns the existing typed Hermes error and a corrective next action. It
must not retry authorization indefinitely or silently use another user's
connection.

### 6.8 Library and media-history MCP access

The following tools are required for Hermes to work with files already
available to the user. MCP does not transfer binary bytes inside a JSON-RPC
response; it returns a short-lived, server-issued `download_ref` that the
authenticated client can fetch.

| Tool | Scope | Required behavior |
|---|---|---|
| `smartspec.knowledge.library.search` | `library:search` | For a normal user session/API key, search the full permission-visible Library scope: owned/private, team, direct user share, group share, role share, and public items. Delegated workers remain restricted to their explicit Library grants. |
| `smartspec.knowledge.library.get` | `library:read` | Return metadata and a `downloadable` flag only after `getLibraryItemById`/the canonical Library permission engine confirms access. Never treat `sourceUrl` alone as authorization. |
| `smartspec.knowledge.library.download` | `library:download` | Resolve one authorized `library_item_id` to a short-lived download reference for the stored file, preserving the original filename and MIME type. Supports every registered Library file type, not only text/images. |
| `smartspec.media.history.list` | `media:read` | Return the same merged history domain as `media.listTasks`: provider, deferred, HyperFrames, MCP, and Hermes tasks, with owner/tenant filters, media type/status/date/series filters, pagination, and no cross-user rows. |
| `smartspec.media.history.get` | `media:read` | Return one owner-scoped task projection, safe status/error metadata, final artifact metadata, and whether a download is available. |
| `smartspec.media.history.download` | `media:download` | Resolve a completed image/video/audio task to a short-lived download reference only after task ownership, tenant, terminal status, artifact publication, and object ownership are verified. |

The existing `smartspec.media.status` may expose the same safe
`downloadable/download_ref` fields for backward compatibility, but the new
history tools are the canonical way to browse and download historical results.

#### 6.8.1 Download reference contract

Inputs accept only a Library item ID or media task ID. They reject raw URLs,
R2 keys, bucket names, local paths, provider URLs, and arbitrary filenames.
The server returns:

```json
{
  "download_ref": "opaque-server-issued-reference",
  "download_url": "https://.../api/mcp/downloads/...",
  "file_name": "original-name.ext",
  "mime_type": "stored-content-type",
  "size_bytes": 123,
  "expires_at": "2026-08-16T12:00:00.000Z",
  "supports_range": true
}
```

The reference is bound to tenant, user, source type, object ID, object key,
MIME type, filename, and expiry. It is opaque, non-guessable, short-lived,
single-purpose, and revocable. The download endpoint rechecks the reference
binding and source authorization before streaming or redirecting. It supports
HTTP Range for video/audio seeking, `Content-Disposition: attachment`,
`X-Content-Type-Options: nosniff`, bounded rate/byte limits, and safe filename
normalization. The MCP JSON result never returns a long-lived public R2 URL.

#### 6.8.2 Library permission and R2 resolution

For a Library download the server must:

1. Load the item under the authenticated tenant and reject deleted/archived
   content according to the existing Library policy.
2. Call the canonical permission engine (`getLibraryItemById`/
   `canReadLibraryItem`) so private-vault, owner, team, public, direct-share,
   group-share, role-share, expiry, and admin rules are identical to the UI.
3. Resolve the stored object from the Library's managed storage metadata. If
   the item points to R2, call `storagePresignGet` only after the ACL decision;
   never presign a caller-supplied key.
4. Verify that the resolved object key belongs to the authorized Library item
   and tenant. A URL in `sourceUrl` that is external, stale, or not linked to
   the item cannot be promoted into a download grant automatically.
5. Return the download reference or a typed `file_unavailable` result without
   exposing bucket credentials, raw storage keys, or internal paths.

For a delegated Hermes worker, MCP visibility must be the intersection of the
user's Library permission and the worker job's explicit Library grant. A
delegated worker never receives tenant-wide Library access merely because the
human owner can see an item.

#### 6.8.3 Media history source and ownership rules

`media.history.list` must reuse the server's unified history composition rather
than querying only the generic provider table. It must include the same source
families currently merged by `media.listTasks`, while every adapter applies:

- authenticated `tenantId` and `userId` filtering;
- source-specific ownership checks for MCP/Hermes/worker jobs;
- completed artifact/publication checks before marking a result downloadable;
- consistent deduplication and ordering by creation time; and
- the existing date, media type, status, pagination, and Vertical Drama series
  filters.

Media history is owner-scoped by default. If a result is shared with another
user, that user accesses it through the Library/share permission path; the
owner's private task history is not made tenant-wide by MCP.

## 7. Server scheduling and job contract

### 7.1 Execution target resolution

Add a queue-level, non-payload field:

```text
executionTarget: auto | remotion_executor | desktop_worker
```

This field is not inserted into the strict Remotion payload. It is stored only
in routing metadata such as `runtimeType`,
`capabilityRequirementsJson`, and `instructionsJson`.

Resolution rules:

1. Explicit `desktop_worker` preserves the current Worker App path.
2. Explicit `remotion_executor` requires the tenant feature flag, the operator
   dispatch gate, and a healthy compatible executor pool. If those checks fail,
   return an actionable `executor_unavailable` error before creating a new job.
3. `auto` selects the dedicated executor when enabled and healthy, otherwise
   falls back to the existing desktop Worker App route.
4. Existing callers that do not pass the new field retain their current
   behavior while the feature flag is disabled.

The existing `DESKTOP_ZEROCLAW_WORKER_DISPATCH_ENABLED` kill switch applies to
the `desktop_worker` target only. The dedicated executor has its own operator
kill switch and readiness gate; enabling one target must not accidentally
disable or enable the other.

The selected target must be persisted on the job so a retry or page refresh
does not silently switch execution environments. It is immutable after insert.
The queue function must resolve the target before reserving credits and before
inserting `worker_jobs`, and all Vertical Drama, Video Project, and Marketplace
Remotion entry points must pass through that target-aware server function.

`desktop_worker` is an API-facing alias only. When selected, the durable
`worker_jobs.runtimeType` value remains `desktop_zeroclaw_managed`; only the
dedicated path persists `remotion_executor`. `auto` is never persisted as a
runtime type and is resolved exactly once before credit reservation/insertion.

### 7.2 Job row

For the new target, the row remains:

```text
jobType: remotion_render_video
runtimeType: remotion_executor
status: queued
resourceProfile: cpu_heavy or long_running
```

`inputJson` remains the existing strict `RemotionRenderVideoWorkerInput`.
`capabilityRequirementsJson` must contain:

```json
{
  "executionTarget": "remotion_executor",
  "capabilityFamilies": [
    "remotion-render",
    "chromium-render",
    "ffmpeg-probe"
  ],
  "requiredClaimCapability": "remotion-render-contract-2026-08-04.2",
  "preferredWorkerId": null,
  "renderProfile": "preview | final"
}
```

`preferredWorkerId` remains null for a healthy executor pool. A tenant may
optionally pin a job to a specific executor through an administrator-owned
routing policy, never through Hermes free-form input.

### 7.3 Billing and idempotency

The new target must reuse the existing Remotion idempotency key and one credit
reservation per render job. Executor retries must not insert a new
`worker_jobs` row or reserve credits again.

The existing policy remains authoritative:

- at most three sidecar attempts;
- 20-second and 60-second retry backoff;
- 10-minute per-attempt timeout;
- up to 60 minutes of queue tolerance;
- permanent contract, authorization, checksum, invalid-output, and 4xx asset
  failures are not retried.

### 7.4 Redis dependency and failure policy

Feature 145 must not introduce a new Redis abstraction or put media payloads in
Redis. It must use the repository's split Redis clients as follows:

| State | Client | Allowed contents | Required TTL/failure behavior |
|---|---|---|---|
| MCP session, MCP idempotency result, device-code state, proof nonce, refresh grace | `getCacheClient()` from `apps/web/server/services/redisClients.ts` | Small JSON/control values only; never MP4/image/audio bytes, prompts, provider credentials, storage keys, or signed URLs | Every key has an explicit bounded TTL. Missing/unavailable Redis fails closed for authentication/session-sensitive operations and returns a typed transient error; it must not silently grant access. |
| BullMQ queue state, worker queue locks, realtime/pub-sub and concurrency coordination | `getRealtimeClient()` from `redisClients.ts` or the existing queue adapter required by that queue | Queue metadata and bounded job-control state | Queue initialization/readiness must fail visibly. Cloud Tasks-backed paths remain independent and must not be migrated back to Redis by this feature. |
| Render job source of truth, billing, terminal state, artifact metadata, audit | PostgreSQL and R2/S3 through existing services | Full job payload, billing records, checksums, artifact publication metadata and media files | Durable database/storage policy applies; Redis loss must not delete or redefine terminal state. |

The implementation must document and test the following current/new bounds:

- MCP session TTL: 30 minutes;
- MCP download reference TTL: 5 minutes;
- worker proof nonce TTL: the existing proof window, never longer than the
  accepted timestamp skew;
- refresh-token grace TTL: 60 seconds;
- idempotency results and queue-control records: explicit per-operation TTL,
  with a maximum serialized value size and no unbounded prompt/result caching;
- all Redis keys include a feature namespace and tenant-safe identifier where
  the state is tenant-owned.

The two existing Node Redis connection families must not be mixed casually:
new security/cache code uses `redisClients.ts`; existing BullMQ modules may
continue using their established connection adapter until a separate
consolidation task. The deep-plan must include observability for Redis command
latency, connection errors, rejected fail-closed requests, key cardinality,
and queue backlog so a provider request/quota problem is not misdiagnosed as a
Remotion rendering problem.

## 8. Dedicated Remotion Executor

### 8.1 Packaging

Create a standalone Node-based executor package/service, for example:

```text
apps/remotion-executor/
```

It must not depend on Tauri, Rust, Xcode, or the Worker App UI.

The package must be a normal npm workspace package compatible with the repo's
Node requirement (`>=22.22.0 <23`) and must expose bounded commands equivalent
to:

```text
npm run build --workspace @smartspec/remotion-executor
npm run doctor --workspace @smartspec/remotion-executor
npm run connect --workspace @smartspec/remotion-executor
npm run setup --workspace @smartspec/remotion-executor
npm run start --workspace @smartspec/remotion-executor
npm run pack --workspace @smartspec/remotion-executor
```

The executor must launch child processes with fixed argument arrays and an
explicit working directory. It must never use shell interpolation, accept a
composition module path from Hermes, or execute a command supplied by a job
payload.

The executor runtime pack must contain or resolve:

- the pinned Node runtime or a documented Node prerequisite;
- the tracked Remotion sidecar and its dependencies, copied from the shared
  source contract and verified against the generated runtime pack;
- Chromium/Chrome suitable for Remotion;
- FFmpeg and ffprobe;
- required Thai and fallback fonts;
- a manifest with versions, checksums, platform, architecture, minimum OS,
  executable paths, native dependency identifiers, contract version, and doctor
  results;
- `SHA256SUMS`, a detached signature, third-party notices, and an archive
  checksum.

Windows native and macOS Intel/Apple Silicon are separate current runtime
targets. Windows WSL2/Linux is a future separate runtime target and is not
silently inferred from a native Windows installation. A runtime must never claim
a job for a platform it has not positively validated.

Runtime installation must follow the existing Worker App safety model: fetch
the manifest over HTTPS, verify the archive SHA-256, verify the signed checksum
file with a pinned release public key, reject path traversal/symlink escapes,
extract into a staging directory, run the full doctor, and atomically replace
the active pack only after doctor success. Keep the previous allowed pack for
rollback. The executor must never run an archive that is present locally but
not allowed by the server manifest.

### 8.2 Worker loop

The executor loop is:

```text
load server URL and local device identity
  → start connect session when no valid worker credential exists
  → operator approves the one-time code in the Smart AI Hub web UI
  → poll connect token and persist the worker binding
  → register or refresh worker credentials
  → run doctor and publish readiness metadata
  → report doctor/readiness
  → heartbeat
  → claim with Remotion capability hints
  → stage job payload/assets into a job-scoped workspace
  → execute render-video sidecar
  → translate SMARTAIHUB_EVENT lines to worker progress events
  → initialize MP4 artifact upload
  → upload the MP4 with the presigned PUT
  → complete artifact upload
  → report terminal completion/failure with the output/artifact descriptor payload
  → remove workspace according to retention policy
```

The executor must never write directly to `worker_jobs` or application tables.

### 8.3 REST control-plane calls

Reuse the existing authenticated worker API and use these canonical current
routes. The legacy Worker App helper paths `/api/workers/heartbeat` and
`/api/worker-jobs/claim` are not valid routes for the new executor.

```text
POST /api/workers/connect/start
GET  /api/workers/connect/status
POST /api/workers/connect/token
POST /api/workers/connect/refresh
POST /api/workers/register
POST /api/workers/:workerId/heartbeat
POST /api/workers/:workerId/jobs/claim
GET  /api/worker-jobs/:jobId/control
POST /api/worker-jobs/:jobId/events
POST /api/worker-jobs/:jobId/artifacts/init-upload
POST /api/worker-jobs/:jobId/artifacts/complete
GET  /api/workers/runtime-pack/manifest
GET  /api/workers/runtime-pack/download/:fileName
```

The new `GET /api/worker-jobs/:jobId/control` route is a small server-owned
control/readiness seam. It returns only the job status, cancellation signal,
lease expiry, assignment attempt, and server time after worker/runtime/lease
scope checks. It does not return input secrets or storage credentials.

The executor uses the existing token refresh, heartbeat, diagnostics, and lease
mechanisms. Every request carries the correct short-lived token and scope:

| Request | Token use | Required scope |
|---|---|---|
| connect refresh | `worker_refresh` | device proof required when bound |
| heartbeat, claim, control, events | `worker_execution` | `workers:heartbeat`, `workers:claim`, or `workers:report` as appropriate |
| artifact init/complete | `worker_upload` | `workers:report` |
| presigned binary PUT | no Smart AI Hub bearer token | server-issued single-purpose URL only |

Refresh tokens are single-use and must never be logged or returned to Hermes.
The executor must preserve the device proof headers on every Smart AI Hub
request, including refresh and artifact init/complete.

The executor must use the lease owner token and assignment attempt returned by
the claim response for all events and artifact operations. A late executor
must receive a safe conflict and must not overwrite a newer assignment.

## 9. End-to-end data flow

### 9.1 Submit

1. A user asks Hermes to render a known render job.
2. Hermes calls `smartspec.remotion.render_video`.
3. Server authenticates the MCP request and verifies tenant/project/episode
   ownership.
4. Server reads the existing job and confirms `jobType` and state.
5. Server reads the immutable persisted `executionTarget` and verifies the
   feature/readiness policy; it does not retarget the existing row.
6. Server returns the idempotent job projection.

### 9.2 Claim and render

1. Executor calls the worker claim API with the exact contract capability.
2. Server filters by tenant, runtime type, readiness, capability, contract
   version, lease availability, and concurrency.
3. Server atomically claims one job and returns the validated payload.
4. Executor runs the shared Remotion pipeline and local sidecar.
5. Executor emits the ten existing progress stages.

### 9.3 Publish and reconcile

1. Executor requests artifact upload authorization for
   `remotion_render_mp4` from the server.
2. Executor computes SHA-256 and size, then uploads the MP4 bytes to the
   server-issued presigned URL with the exact content type.
3. Executor completes the MP4 artifact with checksum, size, lease owner token,
   assignment attempt, and sanitized metadata.
4. Executor sends `job.completed` through the events route. The completion
   payload contains the field-compatible Remotion output shape and inline
   manifest/log/probe descriptors, matching the current Worker App Lane B
   behavior.
5. Server verifies/publishes the artifact and writes terminal job state.
6. Existing application reconciliation links the output to the originating
   video project, marketplace run, or Vertical Drama run.
7. UI and Hermes status tools read the safe server projection.

### 9.4 Hermes image/video MCP execution and upload parity

For `image.generate`, `image.edit`, `video.generate`,
`video.image_to_video`, and `video.reference_to_video`, the flow is:

1. MCP authenticates the caller and validates connection ownership, operation
   capability, references, quota, idempotency, and input schema.
2. `queueHermesMediaJob` creates the same `hermes_media_*` worker job used by
   the existing UI/manual path. One request produces one durable job and one
   credit reservation.
3. The Hermes worker claims the job, receives claim-time server-minted
   reference URLs, and runs the bounded provider operation in the isolated
   connection profile.
4. The worker collects the generated image/video into a job-scoped workspace,
   computes SHA-256 and byte size, and calls the existing server artifact
   init/upload/complete protocol. Provider URLs are not treated as final
   application artifacts.
5. The server verifies tenant, job lease, assignment, checksum, MIME type,
   size, and artifact type. Images must decode as the declared image type and
   satisfy the bounded dimension/size policy. Videos must pass the same
   ffprobe/container/codec/duration/track checks as the web/manual path. Invalid
   output is rejected as a permanent artifact failure.
6. Only after verification does the server publish the object, settle the
   reservation, register the Library/media-history record, and expose the
   canonical ACL-protected artifact reference. A successful upload alone is not
   a completed media result.
7. MCP returns only the safe task envelope and published artifact reference;
   binary bytes are retrieved through the same authorized download broker as
   web/manual results.

The MCP path must be behaviorally equivalent to the existing UI/manual Hermes
path for authorization, model selection, reference mapping, progress, retry
classification, cancellation, upload, library registration, credit
settlement, and error copy. No MCP-only shortcut may bypass a server gate.

## 10. Failure and recovery behavior

| Failure | Required behavior |
|---|---|
| No executor online | `auto` falls back to the legacy desktop Worker App before job insertion; explicit executor target returns `executor_unavailable` before a new job is inserted. An already-created executor-targeted job remains visibly queued and is not retargeted. |
| Executor crashes before claim | Job remains queued or lease recovery returns it to queue. |
| Executor crashes after claim | Lease expiry/recovery makes the job retryable without duplicate billing. |
| Sidecar transient network/browser/upload failure | Retry inside the same job and reservation. |
| Contract/version mismatch | Fail closed with typed failure; do not retry indefinitely. |
| Asset checksum mismatch or unauthorized URL | Permanent failure; do not render arbitrary URLs. |
| Artifact upload succeeds but process exits | Server-side artifact/terminal reconciliation remains the source of truth. |
| Server restart | Job remains durable in `worker_jobs`; executor reconnects and resumes claim polling. |
| Hermes timeout | Render continues in the background; Hermes can poll status later. |
| User cancellation | Server changes state through the normal cancellation guard; executor polls the control route between stages and during long renders, stops its local process, and does not send a late completion event. |

The executor must use a bounded local workspace and clean it after terminal
state. Logs must redact tokens, signed URLs after expiry, and user secrets.

## 11. Security requirements

### 11.1 Enrollment and server connection

- Separate `remotion_executor` worker identity from `hermes_agent_gateway`.
- First enrollment is started by the SmartAIHub Hermes Connector and reuses the
  existing `/api/workers/connect/start` → browser approval →
  `/api/workers/connect/token` flow. The same consent screen creates a separate
  owner-bound MCP agent session using a device authorization/PKCE-protected
  exchange. The Connector must not receive a user's session cookie, and the
  user must not copy a worker token, MCP token, API key, or long-lived
  registration token.
- The executor generates and persists a device identity and key pair before
  pairing. Every Smart AI Hub request carries the existing device proof headers
  covering HTTP method, exact path, JWT `jti`, timestamp, nonce, and body hash.
- Server-side proof validation remains authoritative: five-minute clock-skew
  bound, nonce replay rejection, public-key/device/machine binding, connection
  blocking on mismatch, tenant binding, runtime binding, and worker-id binding.
- Windows 11 stores the device private key and worker refresh credential using
  the current-user DPAPI/credential store under a dedicated non-admin service
  account. macOS stores them in the login Keychain for the executor user. A
  Linux/WSL2 deployment requires the approved Secret Service adapter; if it is
  unavailable, doctor leaves the target `not_ready`. A `0600` plaintext or
  configuration-key file is not an accepted production fallback. Plaintext
  tokens/private keys in `.env`, command arguments, logs, or the runtime pack
  are prohibited.
- All server requests use HTTPS. HTTP is allowed only for an explicit
  localhost development profile. The executor opens outbound connections only;
  it does not expose an inbound listener, tunnel, or port-forwarding endpoint.

### 11.2 Token and lease separation

- Use short-lived `worker_execution` tokens for heartbeat, claim, control, and
  event calls, and short-lived `worker_upload` tokens only for artifact init and
  complete. The server's existing scopes are mandatory:
  `workers:heartbeat`, `workers:claim`, and `workers:report`.
- Refresh tokens are single-use, device-bound, rotated by the existing refresh
  service, and retried only through its bounded grace behavior. A failed refresh
  must not cause the executor to print or reuse a stale replacement token.
- Every claim response supplies `leaseOwnerToken` and `assignmentAttempt`.
  Events, control polling, artifact init, and artifact complete must carry both.
  A stale/expired lease or mismatched assignment must terminate local work and
  must never be retried as a new job.
- The server verifies tenant, team, runtime type, worker ID, job ID, lease, and
  assignment attempt on every report/upload operation. The executor never
  trusts a job's input JSON to grant authority.

### 11.3 Runtime and process isolation

- Validate the job type and Remotion contract on both server and executor.
- Keep `requiredClaimCapability` tied to the shared platform contract version.
- Do not accept shell commands, local paths, arbitrary composition modules, or
  arbitrary remote URLs from Hermes.
- Preserve the server asset allowlist, checksum verification, and reference URL
  minting rules. Asset URLs are server-created and scoped to the job; they are
  never accepted as arbitrary executor configuration.
- The executor uses a job-scoped workspace under a configured root, rejects
  symlink/path escapes, applies a disk quota, removes the workspace after
  terminal state, and runs as a non-admin/non-root service identity.
- Windows native process creation must not use `cmd.exe`/PowerShell for render
  commands. WSL2 commands must use a fixed executable and validated translated
  workspace path. macOS launchd execution must use a fixed user service and
  signed release binaries; no user-facing Xcode build is required.

### 11.4 Artifact upload security and parity

- The executor first calls `init-upload` with artifact type, file name, MIME
  type, byte size, checksum, lease token, and assignment attempt using the
  upload token.
- The server returns the storage reference and a presigned URL. The executor
  validates that it is HTTPS (except localhost development), uses the
  server-provided URL without rewriting its host/path, sends only the expected
  `Content-Type`, and never logs or returns the URL. No Smart AI Hub bearer
  token is sent to object storage.
- The executor uploads `remotion_render_mp4` as a bounded/streamed binary and
  retries transient PUT failures at most three times against the exact
  server-provided URL. If the presigned URL expires, it re-runs init with the
  same job, checksum, size, lease, and assignment; it never changes the file or
  storage key silently.
- The executor calls `complete` with the returned `storageRef`, SHA-256, size,
  content type, sanitized metadata, lease token, and assignment attempt. A
  checksum or size mismatch is a permanent failure.
- The terminal `job.completed` event carries the same output shape as the
  existing Worker App Lane B path: MP4 artifact descriptor plus inline
  `remotion_render_manifest`, `remotion_render_log`, and
  `remotion_render_probe_report` descriptors. The executor does not invent a
  public playback URL; server publication resolves `publishedArtifacts[].sourceUrl`
  and existing VD/Marketplace fallback resolution remains authoritative.
- The server must verify/publish the artifact before credit settlement and must
  preserve the existing one-job/one-reservation invariant. Artifact rows are
  idempotent by job/storage reference and reject a reused reference with a
  different checksum.

### 11.5 Disclosure, logging, and audit

- Do not expose worker tokens, storage credentials, signed URLs, private keys,
  internal paths, or raw provider URLs in MCP output, UI error text, logs, or
  audit metadata.
- Redact query strings from runtime-pack and presigned URLs in diagnostics.
- Rate-limit MCP submit/cancel independently from worker claim and artifact
  endpoints.
- Audit enrollment approval, registration, refresh failure, device mismatch,
  runtime readiness, submit, route selection, claim, terminal state,
  cancellation, artifact init, artifact complete, and publication with tenant,
  actor, job, worker, runtime, and executor identifiers.

### 11.6 Hermes MCP and login security parity

- Public `/v1/mcp` must use the same production auth verification path as the
  rest of the server. Anonymous MCP calls, expired browser sessions, revoked
  API keys, missing tenant/user context, and missing Hermes scopes fail closed
  with `401`/`403`; public callers must not fall back to static or
  header-derived identity. Existing static/internal auth may remain only for
  explicitly isolated server-to-server deployments and test fixtures, never
  for an internet-facing user MCP session.
- In the first implementation, browser cookie sessions remain read/download
  only, matching the current `normalizeMcpSessionAuth` behavior. Mutating Hermes,
  Remotion submit, and cancel tools require a browser-approved OAuth bearer,
  or a compatibility API-key/Connector-issued `agent_pairing` session carrying
  the exact new scopes plus `mcp:write`. The Connector session is created only through explicit browser
  consent/device pairing, is owner/device-bound, rotates refresh material, and
  cannot be created from a worker or delegated-worker token. This is the
  standalone-agent consent flow; it does not silently grant write scopes to a
  browser cookie session.
- Session-authenticated MCP calls must be bound to the current logged-in user
  and selected tenant. API-key calls must carry an explicit tenant, owner, and
  scope grant. A connection, media task, render job, artifact, or download
  reference must be checked against that identity on every read and mutation.
- MCP authorization does not authorize the Worker App. The worker still uses
  the existing browser approval, registration, device proof, short-lived
  execution token, refresh rotation, nonce replay protection, and runtime/
  worker/tenant binding. A token valid for one plane must be rejected by the
  other plane.
- Provider login uses the existing Hermes connection-control state machine and
  isolated profile strategy. MCP may expose a sanitized device URL/code and
  status, but never stores or forwards provider credentials.
- The connection profile root, worker workspace root, and executor render root
  must remain disjoint. Profile deletion is allowed only for the requested
  connection and must reject traversal, symlink escape, and cross-tenant
  profile references.
- Capability discovery is fail-closed. If `auth status`, `tools`, version,
  entitlement, or the optional liveness test cannot prove an operation, that
  operation is unavailable in the MCP catalog/result and cannot be invoked by
  guessing its name.
- All high-level MCP handlers must be server-service calls. They may not call
  `hermes`, `hermes auth`, arbitrary subprocesses, or provider APIs directly.
- MCP audit records include actor, tenant, connection, tool, operation,
  idempotency key hash, task/job ID, auth mode, and outcome, but never include
  prompt secrets, device codes, access tokens, signed URLs, raw provider
  output, or local paths.
- The existing generic `/api/storage/files/*` proxy must not be used as the
  authorization boundary for MCP downloads. Preserve it for compatible
  internal/server-render use where required, but MCP downloads must use the
  new ACL-checked download broker and opaque reference.
- A raw `/api/storage/files/<key>` path, a guessed R2 key, a `storage://` URI,
  an external `sourceUrl`, or a task/library ID from another user must never
  yield a download response. Cross-tenant and same-tenant-no-permission cases
  must be indistinguishable from not found.
- R2/S3 credentials remain server-only. The client receives only a bounded
  signed download or server stream created after ACL evaluation. Presigned
  expiry must be no longer than the MCP reference expiry and must not be
  extendable by the client.
- Download audit records include actor, tenant, source type, object ID, task or
  Library item ID, MIME class, byte count, range usage, and outcome; they never
  include raw object keys, credentials, or complete signed URLs.

## 12. Feature flags and rollout

Add this tenant/operator-controlled flag:

```text
remotionDedicatedExecutorEnabled: false
```

The implementation must add the flag to the typed tenant flag interface,
allowlist, defaults, admin update validation, runtime feature-flag tests, and
any Redis-synced flag list. The flag is a tenant policy decision; it must not
be read from an untrusted MCP argument or worker registration payload.
The operator kill switch must be the separate environment setting
`REMOTION_EXECUTOR_DISPATCH_ENABLED=false`, and must gate only
`remotion_executor`. The existing desktop kill switch must remain independent.

Rollout stages:

1. Contract and executor doctor tests with no production routing change.
2. Register one executor in a non-production or test tenant.
3. Enable explicit `remotion_executor` target for preview jobs only.
4. Compare output duration, audio, subtitles, overlays, checksums, and terminal
   reconciliation with the Worker App path.
5. Enable `auto` routing for selected tenants.
6. Enable final renders after queue, lease, artifact, and memory evidence is
   stable.

The default flag is off. Existing Worker App routing remains unchanged when the
flag is off.

## 13. Testing and acceptance criteria

### 13.1 Shared contract and scheduler

- `remotion_render_video` payload remains byte-compatible with the existing
  golden fixtures.
- New execution target is queue metadata only and cannot enter the strict
  payload accidentally.
- Existing desktop routing tests remain green.
- Dedicated executor jobs require the complete capability superset and exact
  contract token.
- A stale executor cannot claim a current job.
- Idempotent submit does not create a second job or credit reservation.
- Tenant/user scope prevents cross-tenant job lookup and cancellation.

### 13.2 MCP

- Submit accepts only an existing owned Remotion job.
- Submit rejects arbitrary payload, URL, command, path, token, or credit fields.
- Status output is safe and owner-scoped.
- Cancel obeys terminal-state and role authorization.
- Hermes timeout does not cancel the render.
- Registry listing exposes the tools only with the required existing MCP scopes.
- The handlers use `worker_jobs` owner scoping, not the generic automation-job
  table.
- `tools/list` exposes every implemented Hermes function with a strict schema,
  scope, idempotency mode, and safe example; no implemented operation is
  reachable only through an undocumented raw CLI command.
- `smartspec.hermes.capabilities` reports the exact operation/model/limit
  intersection and an explicit reason for every unavailable operation.
- A natural-language “what can Hermes do?” flow calls capability discovery and
  does not execute an unknown tool name or subprocess.
- `connection_authorize` returns a sanitized device-code next action only to
  the authenticated owner; the code is absent from logs/audit/diagnostics.
- `connection_status`, `connection_probe`, `connection_disconnect`, and
  `connection_test_generation` map to the existing durable control jobs and
  preserve their typed failure/status semantics.
- All five `HERMES_MEDIA_OPERATIONS` are covered through
  `smartspec.hermes.media_execute` with operation-specific reference limits,
  model capability checks, idempotency, cancellation, upload, library
  registration, and credit settlement.
- Existing `smartspec.media.generate_image/video` Hermes compatibility calls
  produce the same task/result as the explicit Hermes tool.
- Anonymous, wrong-tenant, wrong-user, revoked-key, expired-session,
  insufficient-scope, and delegated-worker attempts are rejected before any
  provider or worker job is created.
- MCP tools cannot access worker refresh tokens, device private keys, provider
  credentials, raw URLs, local paths, or arbitrary subprocess execution.
- Library search/get/download return only items visible under the canonical
  Library permission engine; team/shared/public visibility is included only
  where the authenticated user is entitled.
- Library download works for R2-backed images, videos, audio, documents,
  archives, and future registered MIME types without adding a per-extension
  bypass. It rejects deleted, missing, unlinked, or non-downloadable objects.
- Media history list/get/download covers every merged source used by the UI,
  including Hermes and MCP tasks, and never returns another user's task or
  artifact.
- Download references are opaque, short-lived, source-bound, expiry-bound,
  range-safe, and revoked/denied after authorization changes.
- A guessed `/api/storage/files/*` path, storage key, external URL, or task ID
  cannot produce a downloadable file through MCP.

### 13.3 Executor

- Doctor rejects missing Node, sidecar, Chromium, FFmpeg, ffprobe, fonts, disk,
  or contract version.
- Claim uses exact capability hints and worker scopes.
- Sidecar progress maps to all ten known Remotion stages.
- Transient retry retains one job ID and one reservation.
- Permanent failures become typed terminal failures.
- Artifact checksum and assignment attempt are verified.
- Late events from an expired lease cannot change the newer job assignment.
- Windows, Linux, macOS Apple Silicon, and macOS Intel runtime manifests are
  not interchangeable.
- Windows 11 native doctor passes on a clean x64 machine without WSL2.
- Windows 11 WSL2 doctor passes only inside the declared Linux distribution and
  rejects Windows-native path mixing.
- macOS Apple Silicon and Intel doctor/packaging tests each pass on their native
  architecture; Rosetta or cross-architecture execution cannot mark a pack
  ready.
- Enrollment proves device binding; a replayed nonce, wrong machine proof,
  wrong runtime token, expired token, or cross-tenant token is rejected and the
  connection is blocked according to the existing auth service.
- Execution tokens cannot call artifact init/complete; upload tokens cannot
  claim jobs; stale lease/assignment events and artifact completes return safe
  conflicts.

### 13.4 End-to-end

- MCP submit → server queue → executor claim → Remotion render → artifact
  upload → server reconciliation is covered with a deterministic fixture.
- MCP login → Hermes connection authorize → device approval → capability probe
  → image generation is covered with a deterministic fixture.
- The same fixture covers video generation, image edit, image-to-video, and
  reference-to-video with valid and invalid reference counts.
- A real short image and video are generated through the MCP path and the
  published artifact is retrievable through the same library/media path as the
  existing manual/UI Hermes path.
- Provider auth expiry, denied OAuth, missing entitlement, unsupported model,
  worker offline, upload failure, cancellation, duplicate idempotency key, and
  cross-tenant access each produce the documented safe error and no duplicate
  charge.
- Library search/get/download tests cover owner, private-vault, team,
  public, direct-user-share, group-share, role-share, expired-share,
  deleted-item, cross-tenant, and no-permission cases.
- R2-backed files and local/legacy managed files of image, video, audio,
  document, archive, and unknown-but-registered MIME types download through
  the broker with correct filename, content type, byte size, attachment
  disposition, and video/audio Range behavior.
- Media history tests prove merged provider/deferred/HyperFrames/MCP/Hermes
  results are paginated, deduplicated, owner-scoped, and downloadable only
  when a published artifact exists.
- Download references expire, cannot be replayed for another object/user,
  cannot be extended by input, and do not expose R2 keys or signed URLs in
  MCP output/audit logs.
- A real short preview is rendered on the first supported executor platform.
- A real short preview is rendered on Windows 11 native and both macOS Apple
  Silicon and Intel; WSL2 is a separate matrix case before that compatibility
  target is marked allowed in production manifests.
- The uploaded MP4 is retrievable through the same server publication path as a
  Worker App render, and VD/Marketplace reconciliation consumes it without a
  lane-specific special case.
- A Mac standalone executor proof demonstrates that no Xcode/Worker App build
  is required.
- Existing Worker App render remains independently verifiable.
- No repository-wide typecheck cleanliness may be claimed from focused tests;
  unrelated dirty-worktree baseline diagnostics must be reported separately.

## 14. Implementation surface

Expected implementation areas, subject to final code reconnaissance before
coding:

| Area | Expected change |
|---|---|
| `apps/web/shared/workerRuntime.ts` | Add runtime type, execution-target schema, readiness metadata, and any executor-specific contract types; update runtime definitions and metadata validation. |
| `apps/web/shared/featureFlags.ts` | Add the dedicated-executor tenant flag with default off. |
| `apps/web/drizzle/schema.ts` + migration | Add `remotion_executor` to the PostgreSQL `worker_runtime_type` enum and keep all existing enum values valid. |
| `apps/web/server/services/workerSchedulerService.ts` | Resolve target, preserve idempotency/billing, and write executor routing metadata. |
| `apps/web/server/services/workerRegistryService.ts` | Admit/register executor workers and preserve strict Remotion claim checks. |
| `apps/web/server/routes/workerRuntime.ts` | Extend runtime-pack IDs/manifest validation and add the owner/worker-scoped job control route. |
| `apps/web/server/services/workerAuthService.ts` | Reuse pairing, device proof, token rotation, scopes, and connection blocking for the new runtime. |
| `apps/web/shared/workerAccessKeys.ts` | Add/validate the runtime's registration and execution permission surfaces without broadening Hermes permissions. |
| `apps/web/server/_core/mcpRegistry.ts` | Register Remotion and unified Hermes capability/connection/media/cancel tools in the existing families with exact scope/idempotency policy. |
| `apps/web/server/_core/mcpPublicServer.ts` and authz | Enforce authenticated MCP session/API-key context, tenant/user binding, scope checks, result limits, audit, and no header-derived identity fallback. |
| `apps/web/server/services/hermesAgentPairingService.ts` (new) and MCP auth/session normalization | Implement the one-time Connector consent/device exchange, owner-bound MCP agent session, exact scope grant, refresh rotation, revocation, and subject separation from worker/provider credentials. |
| `apps/web/shared/hermesMedia.ts` | Reuse/extend provider-neutral operation, capability, error, reference, and safe task-envelope contracts without creating a second Hermes namespace. |
| `apps/web/server/services/hermesMediaScheduler.ts` | Route MCP Hermes image/video calls through the existing queue, idempotency, credit, connection-state, and capability gates. |
| `apps/web/server/services/hermesMediaAdapter.ts` and `media.ts` | Provide shared owner-scoped status/cancel/result projection for MCP, UI, and manual flows. |
| `apps/web/server/services/libraryService.ts` | Reuse the canonical Library ACL/visibility engine for MCP visible search, item reads, and download authorization; do not duplicate permission rules in the MCP handler. |
| `apps/web/server/services/mediaAssetService.ts` and unified media history adapters | Resolve authorized media assets and published outputs to download references without exposing raw storage keys. |
| `apps/web/server/services/managedMediaAccessService.ts`, `managedStorageAuthorizationService.ts`, `mcpDownloadBrokerService.ts`, and `apps/web/server/_core/index.ts` | Integrate one canonical ACL-checked MCP download broker while preserving existing internal storage-proxy compatibility; no handler may implement a second storage-key authorization rule. |
| `apps/web/server/storage.ts` | Presign/stream managed R2/S3 objects only after the source ACL has passed; support bounded expiry, content disposition, and range-safe responses. |
| `apps/web/server/services/hermesConnectionService.ts` and `hermesConnectionJobs.ts` | Expose owner-scoped connection status and durable authorize/probe/disconnect control-job services. |
| `apps/web/server/hermesWorker/connectionControlHandlers.ts` and `jobHandlers.ts` | Preserve device-code, auth status, tool discovery, liveness-test, profile isolation, progress, error redaction, and artifact upload behavior for the MCP-triggered path. |
| Hermes/MCP adapter | Add `smartspec.hermes.*`, `smartspec.media.cancel`, and provider-selectable compatibility behavior with owner-scoped server service calls. |
| `packages/remotion-render` | Reuse existing orchestration; modify only if a portable executor adapter/export is required. |
| `apps/remotion-executor` | New standalone Node worker loop plus the SmartAIHub Hermes Connector commands: existing-install discovery/adoption, signed auto-provisioning, pairing client, MCP credential broker/proxy, OS credential store, doctor, runtime manifest verifier, sidecar launcher, event mapper, cancellation poller, and artifact client. |
| Runtime release tooling | Publish and serve Windows native and macOS arm64/x64 manifests/archives with signed checksums and rollback metadata. Windows WSL2/Linux remain on the existing Worker App compatibility path and are not advertised by the standalone first-release connector. |
| `apps/worker-app` | No required change for the first slice; preserve the existing desktop executor. |
| Focused tests | Scheduler, claim gate, MCP authorization, Library ACL/download broker, media-history merge/download, executor loop, sidecar mapping, artifact/lease recovery, and end-to-end fixture. |

The database migration is required because `workerRuntimeTypeEnum` is backed by
the PostgreSQL `worker_runtime_type` enum and is used by runtime profiles,
workers, heartbeats, worker jobs, and access keys. The migration must be
additive (`ALTER TYPE ... ADD VALUE IF NOT EXISTS 'remotion_executor'` or the
repository-equivalent generated migration), preserve every existing enum
value, and be applied before registering or routing the new executor. In the
current checkout the next migration is
`apps/web/drizzle/0224_remotion_executor_runtime.sql` with journal index `210`,
subject to rechecking the migration head immediately before implementation. No data
backfill is required for existing rows.

## 15. Fixed implementation decisions

The following decisions are fixed for the first implementation and must not be
left to individual implementers:

1. The executor is a standalone Node workspace package and CLI/service. It does
   not require Tauri, Rust, Xcode, or the Worker App UI on the render host.
2. Windows 11 native x64 and both macOS arm64/x64 are mandatory first release
   proof targets. Windows WSL2/Linux are explicitly deferred for the standalone
   connector and remain served by the existing Worker App path.
3. The existing runtime-pack manifest/download endpoint is the distribution
   contract for the first slice; a separate release channel is deferred.
4. Target selection occurs before job insertion and is immutable afterward.
   Existing legacy desktop jobs are never silently retargeted.
5. `smartspec.remotion.*` is a normal authenticated MCP session surface, not a
   delegated-worker surface. Worker REST calls remain the only executor data
   plane.
6. The existing owner-scoped worker-job projection is the status source. A
   shared new projection is added only if the current projection cannot carry
   the required safe fields.
7. The first Remotion upload parity slice uploads the MP4 binary through the
   existing artifact protocol and sends manifest/log/probe metadata inline in
   the completion event, matching the current Worker App Lane B contract.
8. `smartspec.media.*` remains the compatibility namespace; Hermes-specific
   connection/capability/manual operations use `smartspec.hermes.*`, and
   Remotion-specific routing keeps `smartspec.remotion.*`. All three surfaces
   share the server-owned task/result/auth policy and must not create parallel
   worker or artifact protocols.
9. Every function advertised by the Hermes capability manifest must have a
   typed MCP path or be explicitly marked unavailable. MCP never maps unknown
   natural-language requests to arbitrary Hermes CLI commands.
10. MCP user authentication, Hermes provider authorization, and Worker App /
    Remotion executor authentication remain separate credentials and trust
    boundaries. Successful login in one plane never grants access to another.
11. The existing `hermes_agent_gateway` worker continues to be the execution
    owner for Hermes media/control jobs; MCP submits and observes through the
    server and never claims those jobs as a delegated worker.
12. Library and media-history downloads use an ACL-checked server download
    broker. MCP never treats a storage key, `sourceUrl`, or public proxy path
    as an authorization grant.
13. “All file types” means every file type registered in an authorized Library
    item or published media artifact, including image/video/audio/documents/
    archives and future MIME types; it does not mean arbitrary filesystem or
    bucket access.
14. Media history remains owner-scoped by default. Cross-user access requires
    the existing Library/share permission path and is never inferred from
    tenant membership alone.
15. Existing standalone Hermes CLI/agent and Hermes One installations use the
    Connector fast path first. Adoption is allowed only after doctor/provenance
    checks; missing or incompatible dependencies trigger automatic signed-pack
    provisioning beside the existing installation, never an in-place overwrite.
16. The Connector's MCP agent session is owner-bound and separately scoped from
    worker execution/upload credentials and Hermes provider credentials. A
    delegated worker token can never be upgraded into a user MCP session.
17. Image and video outputs are not considered complete at upload time. The
    server must validate checksum, type, dimensions/size, video probe metadata,
    lease/assignment, publication, billing settlement, media-history/library
    registration, and ACL visibility before returning a successful result.

These choices must not change the core boundary: MCP for Hermes intent,
server-owned scheduling, REST worker control plane for the executor, and shared
Remotion contract/orchestration.

## 16. Deep-plan deliverables and implementation gate

`deep-plan` must create a sectionized, TDD-oriented plan under this feature
directory. The minimum section manifest is:

| Section | Deliverable | Must be green before implementation continues |
|---|---|---|
| 01 Shared contracts and schema | `remotion_executor` runtime type, execution target, readiness manifest, feature flag, PostgreSQL enum migration, scope migration | Type/schema tests, migration validation, existing runtime compatibility tests |
| 02 Scheduler and worker admission | Target resolution, immutable routing metadata, claim capability, readiness, lease/control route, billing/idempotency preservation | Scheduler, claim, cross-tenant, stale-lease and feature-flag tests |
| 03 Hermes MCP surface | Capability/connection/media/cancel/render tools, exact schemas, scope filtering, owner/tenant checks, idempotency and safe projections | MCP catalog, authz, CSRF/session, scope, negative ownership and unavailable-capability tests |
| 04 Standalone executor core | Node package, connect/pairing, credential store interface, doctor, heartbeat, claim loop, cancellation and event mapping | Unit tests with fake server, replay/expiry/lease tests, no-shell-injection tests |
| 05 Artifact and media access | Artifact init/PUT/complete parity, checksum/size/range behavior, Library/media history download broker, legacy Python tenant migration | ACL matrix, cross-tenant tests, retry/reconciliation tests, Python compile/API tests |
| 06 Platform packs | Windows native, Windows WSL2, Linux, macOS arm64, macOS x64 manifests, path/process/service adapters, signing/checksum/rollback | Native doctor fixtures and at least one real short render per mandatory platform |
| 07 Redis and operational resilience | Cache/realtime topology, TTL/value limits, outage behavior, metrics, queue backlog and rate-limit observability | Redis unavailable/slow tests, bounded-state tests, no media bytes in Redis assertions |
| 08 Rollout and end-to-end acceptance | Staged flags, kill switches, migration/runbook, MCP-to-job-to-claim-to-render-to-upload-to-publication fixture | Full deterministic E2E plus manual Windows/macOS evidence and rollback drill |

Deep-implement is permitted only when every section has an implementation
file list, test-first acceptance criteria, dependency order, rollback notes,
and a completed self-review. A focused test pass must not be reported as a
repository-wide typecheck pass while unrelated baseline diagnostics remain.
