# Synthesized Specification — Feature 145

## Source and status

This document synthesizes `spec.md`, `claude-research.md`, and
`claude-interview.md` for implementation planning. It is the planning input for
`claude-plan.md`; it is not an implementation and must not be read as proof that
the feature already exists.

## Problem

The existing Remotion execution path is coupled to the Worker App runtime for
desktop execution. That creates an unnecessary macOS Xcode/Tauri packaging
requirement and prevents Hermes Agents from requesting supported Remotion work
through a single, authenticated MCP surface. At the same time, MCP must not gain
arbitrary shell/provider/storage power, and all new media/artifact operations must
preserve tenant/user authorization and Worker App upload semantics.

## Required outcome

Create a standalone headless `remotion_executor` runtime for Windows 11 x64,
macOS Apple Silicon, macOS Intel, and separately declared WSL2/Linux packs. It is
a Node runtime/CLI/service that imports the existing
`@smartspec/remotion-render` contract and renderer. It uses the existing server
worker REST control plane for enrollment, registration, claim, lease, heartbeat,
progress, artifact initialization/upload/completion, and terminal reconciliation.
It does not require Tauri, Rust, Xcode, or the Worker App UI on the render host.

Add a server-owned authenticated Hermes MCP surface that can:

- explain available supported operations and limits;
- manage the existing Hermes connection-control state machine;
- submit supported image/video operations through the existing Hermes media
  scheduler and idempotency/credit flow;
- submit, inspect, and cancel Remotion jobs through server-owned services;
- list/read/download authorized Library assets and complete user-visible media
  history, including R2-backed images/videos and other registered MIME types.

MCP is the agent-facing protocol. Worker REST is the executor data plane. Binary
media never travels through MCP JSON. The server remains authoritative for auth,
ACL, billing, job transitions, artifact publication, and user-facing URLs.

## Hard constraints

1. Preserve the existing `remotion_render_video` job type, strict payload schema,
   contract version, progress stages, failure codes, artifact descriptors,
   idempotency, billing, and retry semantics.
2. Do not broaden `hermes_agent_gateway` into a renderer. Add a separate runtime
   identity and capability profile.
3. Do not execute arbitrary shell, Node, provider URL, local path, CLI command, or
   user-supplied Remotion JSON from MCP.
4. Reuse the canonical tenant/user/Library/media ACL and download services. A URL,
   object key, task ID, or library ID alone is never authorization.
5. Keep refresh tokens, provider credentials, device secrets, raw R2 keys, signed
   URLs, full prompts, and media bytes out of MCP output, logs, and Redis.
6. Existing Worker App jobs and tenants remain valid and unchanged when the new
   feature flag is disabled.
7. Redis is ephemeral coordination only. PostgreSQL and R2 are durable sources of
   truth. Every new Redis key has an owner, bounded payload, TTL, metric, and
   outage policy.

## Architecture contract

### Server

- Extend shared worker runtime types with `remotion_executor`, capability
  metadata, platform/architecture, readiness, and contract version.
- Add a default-off tenant flag `remotionDedicatedExecutorEnabled` plus an
  operator kill switch that only gates dedicated routing.
- Resolve the execution target before job insertion and make it immutable.
- Reuse worker authentication and proof/refresh/lease boundaries.
- Add high-level typed MCP registry tools under existing scope/family policies;
  handlers call server services, never subprocesses.
- Use existing Hermes connection/media services and one canonical download broker.

### Executor

- New Node package/runtime under `apps/remotion-executor` or repository-equivalent.
- Includes doctor/readiness, platform adapter, credential store, registration/
  refresh, worker loop, claim/heartbeat/event client, Remotion sidecar launcher,
  cancellation, artifact streaming/upload, checksum verification, and graceful
  shutdown.
- Uses Windows user/machine-protected secret storage and macOS Keychain adapter;
  headless launchd behavior is explicit and tested.
- Uses platform-specific runtime manifests/packs and refuses cross-architecture,
  stale-contract, missing-browser, missing-FFmpeg, missing-font, low-disk, or
  unsafe-path execution.

### Storage and media

- Library search/read/download, media-history list/read/download, render input
  resolution, and final artifact download all pass through canonical ACL logic.
- R2/S3 credentials stay server-side. MCP receives an opaque, short-lived,
  source-bound download reference or a bounded server stream.
- Range requests are permitted only under broker policy and remain bound to the
  authorized object/reference.

## API/MCP behavior

MCP tools must have strict schemas, scope requirements, size/rate limits,
idempotency declarations, sanitized error codes, and audit metadata. The proposed
surface includes capability discovery; connection authorize/status/probe/
disconnect; provider-neutral media execution and compatibility image/video tools;
Remotion submit/status/cancel; Library search/get/download; and media-history
list/get/download. The exact names must be reconciled against the current registry
before coding, preserving existing names and adding aliases only when they do not
broaden permissions.

The server must distinguish:

- user/session/API-key MCP auth;
- Hermes provider connection auth;
- executor worker auth;
- short-lived artifact upload/download authorization.

The first-run experience is a SmartAIHub Hermes Connector. It detects a
compatible Hermes CLI/Hermes One installation using a closed platform registry
and adopts it only after the full Remotion/Node/Chromium/FFmpeg/font/path/contract
doctor passes. If anything required is missing or incompatible, it automatically
installs the exact signed managed runtime pack beside the existing installation,
atomically activates it, and leaves the prior installation untouched. Windows 11
and macOS use this flow without an Xcode/Tauri build on the render host.

One browser approval creates separate worker credentials and an owner/device-bound
MCP `agent_pairing` session with exact consented scopes. Refresh/device material
is stored only in DPAPI or Keychain (and a supported Linux Secret Service for
Linux/WSL2). Hermes connects to `https://smartaihub.app/v1/mcp` through a dynamic
credential broker or fixed-origin compatibility proxy; it never receives worker,
provider, storage, or refresh credentials.

Old scope grants (`hermes:connect`, `hermes:read`, `hermes:write`) must not
silently gain new destructive or generation permissions. Additive scopes or an
explicit compatibility normalizer must be tested; missing scopes fail closed.

## Job and artifact lifecycle

1. Authenticated MCP submit resolves a server-owned job/reference and validates
   tenant, user, feature flag, capability, credits, idempotency, and input ACL.
2. Scheduler inserts durable job metadata with immutable target routing.
3. Executor authenticates, passes readiness/capability admission, claims one
   assignment, and sends heartbeats/events with the lease and assignment attempt.
4. Executor invokes the shared Remotion renderer locally and maps progress/failures
   to the shared contract.
5. Executor initializes a server-owned artifact upload, streams the MP4 to the
   exact presigned destination, verifies size/SHA-256, completes the artifact,
   and emits terminal metadata.
6. Server verifies publication, settles billing, resolves safe artifact refs, and
   exposes the result through existing UI/Library/media-history paths. Connector-
   generated images and videos use the same checksum/MIME, image decode, video
   `ffprobe`, publication, billing, history/Library and ACL/download gates as
   web/manual generation.
7. Expired leases, stale events, duplicate idempotency keys, upload expiry,
   cancellation, worker loss, and Redis outage follow explicit safe transitions;
   no duplicate render or charge is introduced.

## Platform acceptance

- Windows 11 native x64 passes a clean-machine doctor and short render without
  WSL2.
- Windows WSL2 is a separate pack with Linux-in-WSL path and dependency checks;
  mixed Windows/WSL paths are rejected.
- macOS arm64 and Intel each have native packs and smoke tests. The executor does
  not require an Xcode/Worker App build; packaging signing is separate.
- Runtime manifests, browser, FFmpeg, fonts, codecs, architecture, and contract
  version are never treated as interchangeable across packs.

## Security acceptance

The feature is not ready until the following are proven: no anonymous/static
internet-facing MCP identity fallback; user/tenant/role/scope checks on every
read/write/download; device binding and nonce replay protection; token-plane
separation; no credential or raw URL disclosure; profile/workspace/render-root
separation; traversal/symlink protection; rate limits and audit; capability
discovery fail-closed; artifact lease/checksum/assignment validation; and
cross-tenant indistinguishable denial for jobs, media, Library, R2, and history.

## Rollout and rollback

Feature flag defaults off. First validate contracts/doctor locally, then one
non-production executor, preview jobs, selected tenants, and finally production
auto-routing. Kill switch disables only new dedicated dispatch; in-flight jobs
finish/reconcile under existing safe rules or are requeued to an explicitly
compatible executor. Existing Worker App routing remains the fallback only when
the scheduler explicitly selects it and its capability contract matches.

## Test strategy

- Vitest: shared schemas, scheduler/claim gates, MCP auth/scopes/idempotency,
  ACL/download broker, media-history merge, Redis failure policy, and service
  adapters.
- Cargo: preserve and extend Worker App compatibility tests where shared protocol
  behavior is touched.
- Pytest: legacy media-task tenant scoping and MCP/media-history compatibility.
- Platform E2E: real Windows 11 native, macOS arm64, macOS Intel; separate WSL2
  matrix; deterministic fixture plus short real image/video render.
- Report focused proof separately from existing full-repo typecheck/test noise.
