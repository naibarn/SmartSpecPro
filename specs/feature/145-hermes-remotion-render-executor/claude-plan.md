# Implementation Plan — Hermes-triggered Dedicated Remotion Render Executor

## 0. Implementation contract

This plan turns Feature 145 into an additive, test-first implementation. The
server remains authoritative; Hermes MCP is a typed control surface; the
SmartAIHub Hermes Connector is the one-action onboarding/auth broker; the new
executor is a standalone Node runtime that can adopt an existing Hermes
CLI/Hermes One installation or provision a signed managed runtime;
`apps/worker-app` remains a supported legacy executor. The implementer must
preserve unrelated dirty-worktree changes and make focused edits only in the
files listed below or their verified direct dependencies.

The implementation is ordered so shared contracts and authorization are stable
before routing, MCP, executor, and platform packaging are enabled. No production
flag is enabled until the final section's end-to-end gates pass.

## 1. Current seams and invariants to preserve

The implementation starts from these real seams:

- `apps/web/shared/workerRuntime.ts`: runtime enum/schema, worker registration,
  claim/completion contracts, runtime definitions, and Remotion contract exports.
- `apps/web/shared/featureFlags.ts`: typed tenant flag interface, allowlist,
  defaults, validation and rollout helpers.
- `packages/remotion-render/src/remotionRenderVideoSchema.ts`: exact contract
  version, claim capability, progress/failure enums, limits and payload schema.
- `packages/remotion-render/src/renderVideoJob.ts`: portable stage orchestration,
  asset preparation, rendering and failure classification.
- `apps/web/server/services/workerSchedulerService.ts`: dispatch gates,
  `workerJobMatchesSelection`, `queueRemotionRenderVideoJob`, and
  `queueWorkerJobByRuntime`.
- `apps/web/server/services/workerRegistryService.ts`: `registerWorker`,
  `claimWorkerJob`, heartbeat/events, `initWorkerArtifactUpload`, and
  `completeWorkerArtifact`.
- `apps/web/server/routes/workerRuntime.ts`: existing runtime-pack distribution
  and authenticated worker control-plane routes, connect/approve/refresh/proof,
  claim, events and artifact endpoints. Runtime packs remain public signed
  release artifacts; worker control-plane and artifact routes remain
  authenticated.
- `apps/web/server/_core/mcpRegistry.ts`: existing media/library/history tools,
  session scope filtering, idempotency, delegated-worker policy and tool execution.
- `apps/web/server/services/hermesAgentPairingService.ts` (new): owner-bound
  Connector MCP pairing, exact consent scopes, refresh/revocation and token-plane
  separation.
- `apps/web/shared/hermesMedia.ts`,
  `apps/web/server/services/hermesMediaScheduler.ts`, and Hermes adapters: the
  existing provider-neutral image/video operation contract and queue.
- `apps/web/server/services/managedStorageAuthorizationService.ts`,
  `managedMediaAccessService.ts`, and `mcpDownloadBrokerService.ts`: the current
  storage/download security foundation that must become one canonical path.
- `apps/web/server/services/redisClients.ts` plus legacy
  `apps/web/server/services/redis.ts`: existing Redis topology; no third client
  abstraction is introduced.

Invariant: existing Worker App/Desktop routing, Hermes media jobs, MCP tool names,
scope grants, publication URLs, and database enum values remain compatible when
the dedicated flag is false. Existing standalone Hermes installs are never
modified in place; adoption is reversible and managed provisioning is atomic.

## 2. Workstream 01 — Shared contracts, runtime identity, flags, and migration

### Files and symbols

- Modify `apps/web/shared/workerRuntime.ts`:
  - add `remotion_executor` to `workerRuntimeTypeValues` and the runtime schema;
  - add the executor registration/readiness/platform capability shape;
  - add `runtimeSource: existing_hermes_install | managed_runtime_pack` and
    provenance/doctor summary fields without storing local paths or secrets;
  - add a canonical required-capability constant derived from
    `REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES`,
    `REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY`, and
    `REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION`;
  - add validation for platform/architecture, runtime mode, executor version,
    browser/FFmpeg readiness and concurrency declaration;
  - add runtime definition metadata and update all exhaustive maps/switches.
- Modify `apps/web/shared/featureFlags.ts`:
  - add `remotionDedicatedExecutorEnabled` to the typed interface, allowlist,
    defaults (false), admin validation, serialization and any synced flag list;
  - keep `hermesAgentRuntime`, `hermesMediaWorker`, and
    `remotionRenderVideoJobEnabled` independent;
  - ensure MCP arguments and worker registration cannot set the flag.
- Add the next sequential Drizzle migration under `apps/web/drizzle/` (the
  current checkout ends at `0223` with journal index `209`; use `0224` unless a
  newer migration lands before implementation) for `worker_runtime_type`:
  - add `remotion_executor` with the repo's additive enum migration convention;
  - do not rename/remove/reorder current enum values;
  - verify runtime profile, worker, heartbeat, job, and access-key tables accept
    the new value before routing is enabled.
- Update shared public access-key/scope types in
  `apps/web/shared/publicApiTypes.ts` and its existing scope-normalization
  consumers:
  - preserve `hermes:connect`, `hermes:read`, `hermes:write`;
  - add least-privilege render/generation/disconnect/download scopes only if the
    current normalizer requires them;
  - define explicit old-key behavior so old grants do not silently gain power.
- Add the Connector MCP-agent auth contract:
  - owner-bound `agent_pairing` auth mode with exact consented scopes;
  - separate access/refresh credential family from `worker_execution`,
    `worker_upload`, and Hermes provider credentials;
  - device authorization/PKCE exchange, refresh rotation, revocation and
    replay detection;
  - no automatic grant of mutation scopes to browser cookie sessions or
    delegated workers.

### Behavior

The schema is the source of truth for server and executor. Unknown platforms,
architectures, contract versions, capability aliases, or readiness claims fail
closed. The migration is applied before runtime registration. A disabled flag
prevents new target selection but does not invalidate existing Worker App rows.

### TDD acceptance

- schema accepts the new runtime and rejects unknown/incomplete capability data;
- all old runtime values remain accepted;
- migration is additive and idempotent under the project's migration runner;
- flag defaults false and admin updates validate as expected;
- old scope grants cannot call newly privileged operations;
- Connector pairing grants only the consented MCP scopes and cannot be replayed
  for another tenant, user, worker, or provider connection;
- shared contract fixtures serialize identically for server and executor consumers.

### Dependencies and rollback

This workstream blocks every later workstream. Rollback is safe before routing:
leave the additive enum/value and flag in place, disable the flag, and stop using
the new runtime. Do not roll back the enum with destructive SQL after rows exist.

## 3. Workstream 02 — Scheduler, worker admission, lease, and artifact protocol

### Files and symbols

- Modify `apps/web/server/services/workerSchedulerService.ts`:
  - add a dedicated dispatch gate beside `isDesktopWorkerDispatchEnabled`;
  - extend `queueRemotionRenderVideoJob` with an immutable execution-target
    decision made before insertion;
  - resolve `auto` to a persisted `desktop_zeroclaw_managed` or
    `remotion_executor` runtime target
    before credit reservation and before insertion; preserve existing idempotency,
    credit reservation, payload schema and legacy default when the flag/target
    does not select the dedicated runtime;
  - extend `workerJobMatchesSelection` so exact contract/capability/runtime
    matching is required for `remotion_executor`;
  - ensure `queueWorkerJobByRuntime` cannot route arbitrary job types to the new
    runtime.
- Modify `apps/web/server/services/workerRegistryService.ts`:
  - admit `remotion_executor` through existing registration/proof/tenant binding;
  - validate readiness and concurrency before claim;
  - preserve lease token, assignment attempt, stale-event and worker-scope checks;
  - keep execution, upload, and operator scopes separate.
- Modify `apps/web/server/routes/workerRuntime.ts` only where the existing generic
  worker API needs the new runtime metadata or route admission; reuse existing
  authenticated connect/approve/refresh/proof, claim, heartbeat, event, artifact
  init and artifact complete routes.
- Add/modify focused scheduler and registry tests beside existing tests.

### Job target contract

The queue input may request `executionTarget: auto | desktop_worker |
remotion_executor`. `desktop_worker` is an API alias only. The durable job row
stores only the resolved immutable runtime target
(`desktop_zeroclaw_managed` or `remotion_executor`) plus a normalized target
reason/version. It does not store the full executor readiness payload or secrets.
The target is resolved from tenant flag, operator kill switch, job type, platform
requirements and legacy compatibility before credit reservation. A later worker
registration cannot change the target; it can only claim if its contract matches.

### Failure behavior

No eligible executor leaves the durable job queued with a bounded retry/reconcile
state. Redis outage prevents unsafe claim/idempotency/lease operations rather than
creating a second job. A lease-expired worker cannot complete or mutate a newer
assignment. Artifact completion rejects mismatched checksum, size, storage ref,
lease, or assignment attempt.

### TDD acceptance

- flag-off jobs remain desktop-compatible;
- flag-on jobs select the dedicated target before insert;
- stale/missing capability and wrong runtime cannot claim;
- one idempotency key creates one job/reservation;
- lease expiry, late event, cancellation and worker loss are safe;
- artifact init/complete enforce job/lease/assignment/checksum binding;
- Redis failure returns a bounded safe status and never duplicates a charge.

### Dependencies and rollback

Depends on Workstream 01. Can be deployed dark because no executor is yet
registered. Rollback is the operator kill switch plus defaulting new jobs to the
legacy target; do not mutate existing target metadata.

## 4. Workstream 03 — Authenticated Hermes MCP surface

### Files and symbols

- Modify `apps/web/server/_core/mcpRegistry.ts`:
  - add strict typed tools to the existing catalog/family mechanism;
  - use `listMcpToolsForSession` and `executeMcpToolByName` scope/idempotency
    filtering rather than an ad-hoc route;
  - add capability discovery, connection control, Remotion submit/status/cancel,
    provider media compatibility, Library and history download references;
  - route handlers to existing server services and safe projections;
  - enforce limits for prompt/reference counts, output size, polling and download
    references; never accept arbitrary payload/URL/path/command/token fields.
- Modify `apps/web/server/_core/mcpPublicServer.ts` and its existing auth/session
  normalization path to ensure authenticated session/API-key context is mandatory
  for these tools; reject header-derived identity and anonymous fallback; add the
  owner-bound `agent_pairing` session issued by the Connector without treating it
  as a worker/delegated session.
- Add `apps/web/server/services/hermesAgentPairingService.ts`:
  - create/approve/exchange/revoke Connector pairings through the existing
    browser approval boundary;
  - use exact consent scopes and bind the session to tenant, owner, Connector
    device key and client instance;
  - rotate refresh material and reject replay, device mismatch, scope widening,
    stale consent, and cross-tenant use;
  - expose only safe pairing/connector readiness projections.
- Modify `apps/web/shared/hermesMedia.ts` only for additive operation/capability/
  error/reference contracts; preserve `HERMES_MEDIA_OPERATIONS` and bounds.
- Modify `apps/web/server/services/hermesMediaScheduler.ts`, Hermes adapters and
  connection services to expose owner-scoped calls already used by UI/manual flow.

### Tool contract

The first catalog must cover:

1. `smartspec.hermes.capabilities` — exact published operation/model/limit
   intersection and unavailable reasons;
2. owner-scoped connection authorize/status/probe/disconnect/test-generation
   tools mapped to existing durable control jobs;
3. `smartspec.hermes.connector.status` — adopted/provisioned runtime source,
   doctor state, MCP pairing state, and one next action;
4. `smartspec.remotion.render_video`, status and cancel;
5. `smartspec.hermes.media_execute` over the existing operation enum, plus
   compatibility with existing `smartspec.media.generate_image/video`;
6. existing Library search/get/download and media history list/get/download,
   upgraded to the canonical opaque download reference if not already so.

Each tool declares required scope(s), idempotency mode, response projection,
rate/size limit, and sanitized error mapping. Connection secrets/device codes
are returned only as the minimal owner action and are never persisted in logs.

### Authorization flow

Normalize MCP session/API-key/delegated context once, derive tenant/user/role,
then authorize tool scope and object ownership before calling scheduler/provider
services. A delegated worker is not automatically allowed to call user-facing
Hermes generation/render/download tools. Every read/mutation repeats object scope
at the service boundary; tool handler checks are not the sole defense.

For the first release, browser cookie MCP sessions remain read/download-only,
matching the current session normalizer. Hermes connection mutations, Hermes
generation, Remotion submit/cancel, and media cancellation require an API key,
verified bearer, or Connector-issued owner/device-bound `agent_pairing` session
with the exact new operation scope and `mcp:write`. Pairing is created only
through explicit browser/device consent, rotates refresh material, rejects replay
and scope widening, and never shares worker/provider credentials. New
Hermes/Remotion/download tools reject `sub=static`, `sub=internal`, and
header-derived tenant/user fallback; isolated server-to-server compatibility
calls use a separately allowlisted service path. Existing legacy static/internal
fixtures remain isolated and are not widened by this feature.

### TDD acceptance

- `tools/list` is scope-filtered and schemas reject unknown fields;
- Connector pairing is one-time, owner-consented, device-bound and exposes a
  safe status/next-action projection without returning any token;
- anonymous, expired, revoked, wrong-tenant/user, insufficient-scope and
  delegated-worker calls fail before job/provider creation;
- capability discovery never executes unknown CLI commands;
- connection tools map to existing durable state/failure codes;
- all supported media operations share idempotency/credit/upload behavior;
- Remotion submit accepts only server-owned valid inputs;
- status/cancel are owner/role/terminal-state safe;
- no secrets, raw URLs, local paths, signed URLs or credentials appear in output;
- rate limits and audit fields are asserted.

### Dependencies and rollback

Depends on Workstream 01 and existing auth/services. Register tools behind
existing MCP/tenant flags and keep the new dedicated render tool hidden until
executor readiness exists. Rollback removes catalog visibility and disables target
selection; existing tools continue unchanged.

## 5. Workstream 04 — Standalone Node executor core

### Files and symbols

Create a new package under `apps/remotion-executor/` following the repository's
workspace/package conventions:

- `package.json`, `tsconfig.json`, build/entrypoint files;
- `src/config.ts`: validated environment/config with no plaintext token logging;
- `src/hermesInstallDiscovery.ts`: closed Windows/macOS Hermes CLI/Hermes One
  discovery registry, candidate selection, provenance checks and safe adoption;
- `src/runtimeProvisioner.ts`: signed manifest download, Ed25519/SHA-256/archive
  verification, atomic staging/activation and rollback when adoption fails;
- `src/doctor.ts`: dependency, version, architecture, disk, font, path and
  capability readiness report;
- `src/platform/credentialStore.ts` plus Windows DPAPI and macOS Keychain
  adapters, with a test-memory adapter only for unit tests;
- `src/controlPlane/client.ts`: authenticated connect/register/refresh/claim/
  heartbeat/event/artifact API client using existing routes/contracts;
- `src/mcpAgentSession.ts`: Connector-owned MCP device pairing, exact scope
  consent, refresh rotation and HTTPS forwarding to `smartaihub.app`;
- `src/mcpCompatibilityProxy.ts`: optional loopback compatibility proxy only
  for Hermes clients that cannot consume a dynamic credential callback; prefer an
  OS-protected named pipe/Unix socket, and if TCP is unavoidable bind only to
  `127.0.0.1`, require a DPAPI/Keychain-backed per-device secret, enforce origin
  and fixed outbound destination, reject redirects, and provide no general
  proxy behavior;
- `src/workerLoop.ts`: bounded concurrency claim loop, lease heartbeat,
  cancellation polling, graceful shutdown and retry/reconcile state machine;
- `src/remotionRunner.ts`: adapter around `executeRemotionRenderVideoJob` or the
  package's portable entrypoint, with sidecar process isolation and stage mapping;
- `src/artifacts.ts`: streamed file size/SHA-256, init/upload/complete and exact
  assignment binding;
- `src/runtimeManifest.ts`: signed/hashed pack verification and platform matrix;
- `src/cli.ts`: `doctor`, `connect`, `run`, `status`, `logout` with sanitized
  human output plus `connect --existing-hermes`/`setup`; no arbitrary command
  passthrough;
- package tests and fixtures.

Register the package in the root workspace configuration and lockfile using the
repository's existing package-manager command. The package must not import Tauri
or Rust bindings; it may import `@smartspec/remotion-render` and shared contract
packages only through declared workspace dependencies.

### Execution protocol

1. `setup` performs discovery and bootstrap doctor. If the existing Hermes
   installation passes, adopt it; otherwise download and activate the signed
   managed pack beside it, then rerun doctor. Never overwrite the existing
   Hermes installation in place.
2. `connect` reuses device-code approval and creates both separate worker and
   owner-bound MCP agent sessions. Refresh material is stored in the OS
   credential store; no user bearer/API/MCP token is saved in job config.
3. Registration advertises runtime identity, runtime source,
   platform/architecture, contract,
   capabilities, resource limits, executor version and readiness.
4. Claim uses exact capability hints and assignment/lease tokens.
5. Runner validates the server payload with the shared schema, materializes only
   authorized server-provided inputs into a per-job isolated directory, invokes
   the portable Remotion package, and maps all ten progress stages.
6. Cancellation stops the render process, reports a typed cancellation, removes
   only the job directory, and does not delete shared credentials or packs.
7. Artifact upload is streamed and checksum-bound; presigned URL expiry retries
   init only with the same job/assignment/checksum, never with a changed object.
8. Shutdown stops claiming, drains/marks the current assignment according to the
   existing lease policy, closes child processes, and never reports success early.

### Security and resource policy

Use OS credential protection, restrictive file permissions, path canonicalization,
symlink escape checks, bounded input/output/disk/time/concurrency limits, child
process environment allowlisting, redacted logs, and no shell interpolation. On
macOS, a headless launchd process must either use the explicitly supported
Keychain access mode or fail doctor; it must never silently fall back to a
plaintext file or an interactive-only credential assumption.
The executor has no database credentials and cannot choose arbitrary storage keys.

### TDD acceptance

- doctor detects each missing/incompatible dependency;
- credential stores round-trip without logging or exposing secrets;
- registration/refresh/claim use correct scopes and headers;
- lease heartbeat and cancellation handle network timeout safely;
- stale assignment events are rejected locally and by server;
- runner maps success, transient, permanent, cancellation and timeout states;
- artifact checksum/size/expiry/retry behavior is deterministic;
- existing-install detection/adoption and missing-component auto-provisioning
  are deterministic, atomic, rollback-safe, and never execute arbitrary paths;
- MCP agent pairing cannot mint worker/provider credentials or widen scopes;
- generated image and video artifacts pass the same server publication and
  history/Library registration path as web/manual generation;
- graceful shutdown does not orphan child processes or duplicate completion.

### Dependencies and rollback

Depends on Workstreams 01–02 and the existing Remotion package. It can be tested
locally with a fake control-plane adapter before server routing is enabled. Remove
the package from release manifests or disable registration to roll back; do not
delete user credentials or durable jobs as part of rollback.

## 6. Workstream 05 — Artifact, Library, R2, and media-history access parity

### Files and symbols

- Audit and modify `managedStorageAuthorizationService.ts`,
  `managedMediaAccessService.ts`, and `mcpDownloadBrokerService.ts` so one
  canonical authorization decision covers Library assets, media-history outputs,
  render input references, and published artifacts.
- Modify `apps/web/server/_core/mcpRegistry.ts` existing tools:
  `smartspec.knowledge.library.search/get/download` and
  `smartspec.media.history.list/get/download` to return safe projections and
  opaque references only.
- Modify `apps/web/server/storage.ts` and
  `apps/web/server/_core/index.ts` only where broker streaming/presigning,
  content disposition, expiry, range, deletion and audit need integration.
- Verify `apps/web/server/services/mediaAssetService.ts`, unified history adapters,
  and `python-backend/app/models/media_task.py`/migration 013 preserve tenant
  scoping for legacy provider rows.

### Canonical download decision

Resolve a requested source to a server-owned descriptor containing tenant, owner,
source type, object/task/library ID, storage reference, MIME/size metadata,
downloadability and policy version. Run ACL/role/share/expiry/deletion checks,
then mint an opaque short-lived broker reference. At redemption, recheck reference
signature/expiry/replay/source binding and ACL; stream or presign only the exact
object. Never accept a raw R2 key, storage URL, external URL, filesystem path, or
client-supplied content type as authorization.

Cover image/video/audio/document/archive and any future registered MIME type by
policy metadata, not extension allowlists. Preserve video/audio Range semantics
within bounded limits. Cross-tenant and no-permission errors are indistinguishable.

### Generated image/video publication parity

The artifact service must treat Connector/Hermes output exactly like web/manual
output. Before publication and credit settlement it must verify job/tenant,
lease/assignment, SHA-256, byte size, registered MIME, and artifact type. Images
must decode and satisfy bounded dimensions; videos must pass the existing
ffprobe/container/codec/duration/track policy. A successful presigned upload is
not a completed media result. Only the server may publish the object, register
the Library/media-history record, settle the reservation, and issue the same
ACL-protected download reference used by the UI. MCP never returns binary media
or a raw provider/storage URL.

### Media-history compatibility

Use the same merged source projection as the UI (`media.listTasks` and existing
Hermes/MCP/deferred/HyperFrames adapters), paginate/deduplicate by canonical task
identity, and enforce user/tenant at each adapter. Legacy rows with null tenant
must remain inaccessible to tenant-scoped MCP until ownership is safely resolved;
do not “guess” tenant from a task ID.

### TDD acceptance

- ACL matrix covers owner/private/team/public/direct/group/role/expired/deleted/
  cross-tenant/no-permission;
- all registered MIME classes download correctly;
- R2 and managed/local sources use the same broker policy;
- references are opaque, short-lived, source-bound, range-safe and not extendable;
- revocation/ACL changes deny redemption;
- media history merges every UI source without cross-tenant leakage;
- legacy Python rows are tenant-filtered and unscoped rows are denied;
- logs/audit omit raw keys, complete URLs, secrets and private prompts.
- image decode/dimension and video ffprobe/container/codec/duration/track checks
  match the web/manual publication path;
- upload-before-publication, partial upload, checksum mismatch, wrong MIME,
  stale lease, and duplicate completion never expose or register an artifact;
- published Connector image/video outputs appear in the same history/Library
  projections and download through the same ACL broker as web/manual output.

### Dependencies and rollback

Depends on Workstream 01 for scopes/contracts and can run parallel to 02–04 after
the canonical service boundary is agreed. Preserve existing internal storage proxy
behavior during rollout; hide the new MCP download path if broker proof fails.

## 7. Workstream 06 — Platform packs and release/install parity

### Files and symbols

- Extend `apps/web/scripts/build-hermes-runtime-pack.ts`,
  `apps/worker-app/scripts/package-runtime-release.mjs`, and the directly shared
  runtime-pack manifest/signing helper identified by their current imports to
  publish standalone executor packs without changing Worker App pack semantics.
- Add executor pack manifests for:
  - `remotion-executor-windows-x64` (Windows 11 native);
  - `remotion-executor-windows-wsl2` (separate Linux-in-WSL contract);
  - `remotion-executor-macos-arm64`;
  - `remotion-executor-macos-x64`;
  - `remotion-executor-linux-x64` if the existing deployment needs it.
- Reuse existing runtime-pack download/allowlist/checksum signing boundary in
  `apps/web/server/routes/workerRuntime.ts`, adding exact ID/manifest validation.
- Add platform install/doctor documentation beside `apps/worker-app/MAC_BUILD.md`
  and `HERMES-GUIDE.md`, clearly separating standalone executor from Tauri/Xcode.
- Add the Connector's adoption/provisioning release contract:
  - a closed Windows 11/macOS discovery registry for Hermes CLI and Hermes One;
  - existing-install provenance/manifest checks and a `runtimeSource` value;
  - automatic fallback to the exact signed managed pack when any mandatory
    component is absent/incompatible;
  - atomic side-by-side activation, previous-version retention and rollback;
  - no in-place overwrite of the user's Hermes installation and no arbitrary
    executable/path execution.

### Platform rules

Windows native must not depend on WSL. WSL2 uses Linux paths/dependencies only and
rejects mixed path assumptions. macOS arm64/x64 packs are architecture-specific;
Rosetta/cross-architecture execution cannot mark a pack ready. Browser/Chromium,
FFmpeg/ffprobe, fonts, codecs, Node, sidecar, disk and contract versions are
manifested and checked by `doctor`. Mac launchd installation must document whether
the process runs in a user session or daemon context and test the corresponding
Keychain access path.

No Xcode build is part of executor runtime setup. Production signing/notarization
is a release pipeline concern and must not introduce a Tauri dependency.

### TDD/acceptance

- manifest archive/hash/signature checks reject tampering and wrong platform;
- clean Windows 11 native doctor/render passes;
- WSL2 rejects Windows-native path mixing;
- macOS arm64/x64 each pass native doctor/render and credential access;
- pack distribution is public but signed/allowlisted, uses exact filenames, and
  cannot traverse paths or accept query/cookie credentials; worker connect and
  all control-plane/artifact operations remain authenticated;
- existing Hermes adoption skips a duplicate pack only after full doctor and
  provenance checks; missing components trigger automatic signed provisioning;
- rollback can disable a pack without deleting existing Worker App packs.

## 8. Workstream 07 — Redis, resilience, observability, and security hardening

### Files and symbols

- Use `apps/web/server/services/redisClients.ts` purpose-specific clients for new
  cache/session and realtime/queue concerns. Do not add another singleton.
- Migrate only touched new code away from `getRedisClient()` where the split client
  contract already applies; leave unrelated legacy usage unchanged unless a
  focused compatibility fix is proven.
- Define a key registry for MCP session, download reference, device-code/proof,
  idempotency, refresh grace, queue lock and bounded progress keys. Each entry
  specifies owner, namespace, TTL, max bytes, serialization, redaction and outage
  behavior.
- Add metrics/log fields for Redis operation latency/errors, key expiry, eviction,
  claim conflict, duplicate idempotency, lease expiry, artifact retry, and MCP
  authorization denial without logging values.
- Extend security tests/audit checks across `mcpPublicServer`, worker auth,
  download broker, runtime route and executor client.

### Fixed Redis policy

Redis stores no media bytes, artifact bodies, refresh tokens, full prompts,
durable job payloads, or ownership truth. PostgreSQL/R2 remains authoritative.
Use explicit TTLs such as MCP session 30 minutes, download reference 5 minutes,
refresh grace 60 seconds, proof nonce bounded by clock-skew window, and existing
job/queue TTLs from the owning contract. Values must be bounded and namespaced.

On Redis outage: fail closed for new claim/proof/idempotency/download redemption
operations where safety depends on Redis; retry bounded read-only status where
safe; reconcile durable rows from PostgreSQL; never silently fall back to an
unbounded in-memory map in multi-instance production.

### Security gates

Threat-model SSRF/external URLs, path traversal/symlink escape, token-plane
confusion, scope escalation, replay, stale assignment, presigned URL leakage,
MCP tool injection, provider credential disclosure, R2 key guessing, tenant ID
spoofing, Redis eviction/poisoning, and child-process injection. Each threat must
have a test or operational control before rollout.

### TDD/acceptance

- every key has TTL/size/metric and no forbidden payload;
- Redis unavailable/evicted/expired behavior is deterministic and safe;
- no auth/secret/storage URL leakage appears in MCP/log/audit snapshots;
- replay, scope escalation, cross-tenant, traversal, SSRF and stale lease tests
  fail closed;
- rate limits/backpressure prevent MCP submit/download abuse;
- audit events identify actor/tenant/job/worker/result without sensitive values.

## 9. Workstream 08 — End-to-end proof, rollout, and rollback

### Files and operational assets

- Add deterministic Vitest integration fixtures under existing web service test
  conventions for MCP → scheduler → claim → render stub → artifact publication.
- Add executor integration fixtures and platform smoke commands under
  `apps/remotion-executor`.
- Add Connector fixtures for Hermes CLI/Hermes One discovery, adoption,
  missing-component auto-provisioning, browser consent, MCP agent pairing,
  refresh/revoke, and safe next-action projections.
- Add/extend pytest media-history tenant fixtures and Cargo compatibility tests.
- Add CI/release matrix documentation and a runbook for Windows 11 native,
  WSL2, macOS arm64, macOS x64, and Linux where enabled.

### Required evidence sequence

1. Shared contract/migration tests pass with flag off.
2. MCP auth/scope/ACL/download tests pass without an executor.
3. Executor doctor and fake-control-plane loop pass on all declared platforms.
4. Existing Hermes fast-path fixture proves detect → adopt when compatible and
   detect → signed provision → doctor → activate when a component is missing.
5. One deterministic end-to-end fixture proves idempotency, lease, progress,
   image/video artifact checksum and media validation, publication, status and
   ACL-protected download.
6. Real short image/video/Remotion previews pass on Windows 11 native and both
   macOS architectures; WSL2 is separately proven before production manifest
   enablement.
7. Compare Worker App and dedicated output duration, audio, subtitles, overlays,
   checksum, failure/retry and media-history publication.
8. Enable one non-production tenant, then preview-only, then selected production
   tenants. Monitor queue wait, render time, memory, upload failures, lease loss,
   Redis errors, auth denials, ACL denials and duplicate-charge invariants.

### Rollback

Set the operator dedicated-dispatch kill switch false and hide dedicated MCP
submit/connection tools if necessary. Stop new dedicated claims; allow safe
reconciliation or explicit requeue only when the replacement executor satisfies
the same contract. Do not delete durable jobs, artifacts, credentials or enum
values. Existing Worker App routing remains the controlled fallback, not an
implicit cross-target migration.

## 10. Cross-workstream API and data contracts

The following names are canonical for implementation planning:

| Contract | Producer | Consumers |
|---|---|---|
| `workerRuntimeType = remotion_executor` | shared runtime contract | scheduler, registry, executor |
| `remotionDedicatedExecutorEnabled` | typed tenant flags | scheduler/admin/rollout |
| `REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION` | Remotion schema package | scheduler, claim gate, executor doctor |
| requested `executionTarget` plus resolved runtime target/policy envelope | scheduler | registry, status, reconciliation |
| capability/readiness profile | executor | registration/claim gate |
| `remotion_render_video` payload | scheduler/shared schema | executor/renderer |
| artifact init/upload/complete descriptors | worker services/routes | executor/server publication |
| Hermes capability/media operation envelope | shared Hermes media contract | MCP/UI/scheduler/adapters |
| opaque download reference | canonical broker | MCP client/download redemption |
| tenant/user-scoped media-history projection | media adapters | MCP/UI/download broker |

Any implementation change to these names requires updating every producer,
consumer, test fixture and section file in the same change. No section may invent
a second version of a shared contract.

## 11. Dependency and execution order

1. Workstream 01: contracts, scopes, flags, enum migration.
2. Workstream 02 and 05 in parallel after shared contracts: scheduler/admission
   and canonical media/download authorization.
3. Workstream 03 after 01 and alongside 02/05: MCP tools call stable services.
4. Workstream 04 after 01/02 and Remotion package verification: standalone loop.
5. Workstream 06 after 04: platform packs and runtime distribution.
6. Workstream 07 throughout, with final security/resilience gate before rollout.
7. Workstream 08 after all prior workstreams: cross-platform E2E and release.

## 12. Definition of ready for deep-implement

Deep-implement may start only when:

- all eight section files exist and pass `check-sections.py`;
- each section has exact file/symbol ownership, TDD acceptance, dependencies,
  rollback and error paths;
- shared names above are identical across sections;
- migration ordering and old-scope compatibility are explicit;
- Windows native, WSL2, macOS arm64 and macOS x64 support rules are explicit;
- MCP/worker/API/Redis boundaries are explicit;
- canonical Library/R2/history download authorization is covered;
- Phase A, adversarial review, section cross-consistency and final quality pass
  have no unresolved critical issues.
