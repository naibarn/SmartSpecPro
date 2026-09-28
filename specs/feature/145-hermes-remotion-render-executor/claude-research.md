# Deep-plan Research — Hermes Remotion Render Executor

## Research decision

- **Codebase: yes.** This is an existing monorepo and the requested feature must be
  compatible with the current worker-app, MCP registry, worker-runtime contracts,
  Remotion package, tenant authorization, and media-history implementations.
- **Web research: yes.** The design depends on platform credential storage and
  Redis expiry/eviction behavior. The selected topics were Windows DPAPI, macOS
  Keychain/launchd behavior, Redis TTL/expiry/eviction, and the portability limits
  of Remotion rendering.
- **Testing: existing setup.** TypeScript uses Vitest through the web workspace;
  the Rust worker-app has Cargo tests; the Python backend uses pytest through its
  local `.venv`. The plan must use focused tests for each changed package and must
  not claim a repository-wide clean typecheck when baseline failures remain.

## Research execution note

SocratiCode was requested by the repository instructions but its MCP transport was
not available in this session. Research therefore used targeted `rg`, file reads,
package manifests, and existing test/configuration files. This fallback is recorded
explicitly so the plan does not imply that an indexed symbol graph was available.

## Codebase findings

### Existing runtime and Remotion boundaries

1. `apps/web/shared/workerRuntime.ts` is the shared worker protocol. It currently
   declares runtime types including `hermes_agent_gateway`, validates worker
   registration/claims/completion, and re-exports the existing Remotion render
   contract from `@smartspec/remotion-render`. There is no `remotion_executor`
   runtime identity yet.
2. `apps/web/server/routes/workerRuntime.ts` owns runtime-pack discovery,
   authenticated connect/approve/refresh/proof flows, job claim/heartbeat/finalize,
   and Hermes media finalization. The current Hermes pack allowlist is limited to
   `hermes-windows-x64` and `hermes-macos-arm64`; this is a control-plane boundary,
   not a standalone Remotion executor.
3. `packages/remotion-render/` contains the portable render contract and the
   current Remotion composition/render helpers (`renderVideoJob.ts`,
   `renderVideoJobEntry.ts`, `remotionRenderVideoSchema.ts`, composition registry,
   FFmpeg and hardware-acceleration helpers). The new executor should consume this
   package rather than duplicate render semantics.
4. `apps/worker-app/src-tauri/` contains the existing desktop executor, control
   plane, credentials, runtime manifest, Hermes executor, and platform packaging.
   It is the compatibility reference for claim/heartbeat/finalize behavior, but
   the requested executor must not require building the Tauri app or rebuilding
   through Xcode on macOS.
5. `apps/worker-app/runtime-sidecar-remotion/render.mjs` is an existing sidecar
   boundary that can inform process invocation and artifact handling. It is not
   itself a server-addressable Hermes MCP executor and must not be treated as the
   new control plane.

### Feature flags and worker identity

1. `apps/web/shared/featureFlags.ts` has `hermesAgentRuntime`, `hermesMediaWorker`,
   and `remotionRenderVideoJobEnabled`, but no dedicated flag for a standalone
   Hermes Remotion executor. The plan therefore adds a typed, default-off,
   tenant-scoped rollout gate and keeps existing Hermes media and in-process
   Remotion gates independent.
2. The shared runtime contract already validates runtime-specific metadata and
   capability families. The new runtime identity, platform/architecture matrix,
   protocol version, and capability family must be added there first so server,
   executor, and tests use one schema.

### MCP surface and media access

1. `apps/web/server/_core/mcpRegistry.ts` currently exposes authenticated
   library/media-history/media-generation/job tools and uses Redis for selected
   short-lived state. It does not yet expose the high-level Hermes executor tools
   or a first-class Remotion render command.
2. Existing MCP media-history and library tools are the compatibility surface for
   browsing and downloading user-authorized assets. The new render tools must accept
   references resolved through the canonical tenant/user ACL services rather than
   arbitrary URLs or storage keys.
3. Existing download/storage work spans
   `managedStorageAuthorizationService.ts`, `managedMediaAccessService.ts`, and
   `mcpDownloadBrokerService.ts`. The implementation plan must designate one
   canonical authorization path and make every MCP download, render input fetch,
   and final artifact download use it. Raw R2 URLs must not be returned to an
   untrusted client unless the existing signed-download policy explicitly permits
   it.
4. Current scope vocabulary includes `hermes:connect`, `hermes:read`,
   `hermes:write`, `library:download`, `media:read`, `media:download`,
   `jobs:create`, and `jobs:read`. The spec's proposed disconnect/generate
   capabilities need a compatibility mapping or additive scope migration; the
   executor must fail closed when a scope is missing.

### Durable state, queues, and Redis

1. `apps/web/server/services/redisClients.ts` separates cache and realtime/queue
   concerns, while the older `apps/web/server/services/redis.ts` still provides a
   singleton used by existing routes and MCP code. The feature must not introduce
   a third Redis abstraction or put durable media/job payloads in Redis.
2. PostgreSQL remains the source of truth for worker jobs, media tasks, tenant
   ownership, billing/usage, audit events, and artifact metadata. R2/object storage
   remains the source of truth for media bytes. Redis is appropriate only for
   bounded, short-lived coordination: device-code sessions, MCP session state,
   idempotency keys, proof nonces, refresh grace, queue locks, and bounded progress
   hints.
3. Queue/render admission must distinguish Redis unavailability from durable job
   failure. If Redis is unavailable, new claims/heartbeats/idempotency operations
   fail closed or enter a bounded retry state; the system must not silently create
   duplicate renders or mark a job complete without durable finalization.
4. Existing media-history compatibility includes
   `python-backend/app/models/media_task.py` and migration
   `python-backend/migrations/013_add_media_task_tenant_id.py`. The new path must
   preserve tenant scoping for legacy rows and must not make unscoped legacy media
   discoverable through MCP.

### Authentication and platform credential storage

1. The worker connect flow already includes device-code approval, refresh, proof,
   runtime-pack allowlisting, and Redis-backed short-lived state in
   `workerRuntime.ts`. The new executor should reuse these endpoints and contracts,
   not invent a second login protocol.
2. Windows credentials should use a user-scoped protected secret mechanism such as
   DPAPI and keep refresh material out of logs, command lines, job payloads, and
   plaintext config. The server must continue to authenticate the worker on every
   privileged operation and bind the token to tenant/user/device identity.
3. macOS credentials should use Keychain-backed storage. A launchd/system-daemon
   deployment must account for the distinction between a user login-session
   keychain and a daemon-accessible keychain; headless operation must be an explicit
   supported mode with least-privilege access and documented installation checks.
4. The executor is a Node runtime/CLI or packaged headless runtime. It does not
   require a Tauri binary, Xcode build, or Mac App Store signing path. Platform
   installers may still need code signing/notarization in production, but that is
   release packaging—not a runtime dependency for local development.

## Web research findings

### Windows protected credentials

Microsoft documents `CryptProtectData` as the Windows Data Protection API for
protecting data tied to the current user or machine context. This supports the
plan's decision to keep refresh credentials in a user/machine-protected store and
to reject portable plaintext credential files:

- https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata
- https://learn.microsoft.com/en-us/windows/apps/develop/security/data-protection

### macOS Keychain and launchd

Apple's keychain guidance notes that keychain access behavior differs between
interactive user processes and daemon-style processes. The plan therefore treats
Keychain access as a platform adapter with an explicit launchd/headless test and
does not assume that a background daemon automatically inherits the interactive
login keychain:

- https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains

### Redis expiry and eviction

Redis key expiration is suitable for bounded coordination state, but TTL is not a
durability guarantee. Redis documents `EXPIRE`/`TTL` semantics and separately
documents eviction behavior; the plan therefore requires explicit TTLs, keyspace
metrics, bounded payloads, and PostgreSQL/R2 durability for jobs and artifacts:

- https://redis.io/docs/latest/commands/expire/
- https://redis.io/docs/latest/commands/ttl/
- https://redis.io/docs/latest/operate/rc/databases/configuration/data-eviction-policies/

### Remotion portability

The repository's `@smartspec/remotion-render` package and existing runtime pack are
the authoritative compatibility sources for this project. The plan avoids making
an unsupported claim that all Remotion compositions are platform-independent:
browser/Chromium, FFmpeg, fonts, native codecs, hardware acceleration, and local
asset access must be capability-checked by the executor before admission. A
platform-specific render smoke test is required for Windows 11 and supported macOS
arm64; macOS Intel is explicitly not in the initial supported matrix unless the
existing pack proves otherwise.

## Testing evidence

- TypeScript/web tests use Vitest and existing service/route test conventions.
- `packages/remotion-render` has package-local TypeScript/build configuration and
  must receive deterministic contract/render-admission tests without requiring a
  real browser for every unit test.
- `apps/worker-app/src-tauri` uses Rust/Cargo tests for control-plane and executor
  behavior; those tests are the compatibility reference and should remain green.
- Python backend tests use pytest through `python-backend/.venv`; media-history
  tenant isolation tests must cover legacy rows and deny unscoped access.
- End-to-end acceptance needs a real Windows 11 runner and supported macOS arm64
  runner. Linux/WSL2 can be a development/CI target if the runtime pack and browser
  dependencies are available, but cannot substitute for the two requested desktop
  platforms.

## Planning implications and decisions

1. Use one server control plane and one shared job contract. The Hermes MCP layer
   creates/reads/cancels/inspects jobs; the executor claims and renders jobs through
   authenticated worker APIs; artifact finalization is server-side and ACL-checked.
2. Keep MCP as the agent-facing protocol and HTTP APIs as the worker-facing
   protocol. MCP tools must not tunnel arbitrary HTTP or expose server credentials.
3. Build the executor as a standalone Node package/runtime that imports
   `@smartspec/remotion-render`; do not extend the Tauri/Xcode build just to make
   Hermes rendering possible.
4. Reconcile current scope names before implementation. Preferred compatibility
   mapping is additive: retain existing connect/read/write scopes, add explicit
   render/generate/download/cancel scopes only where required, and support a
   migration/normalizer so old approved connections do not gain unintended powers.
5. Treat Redis as an ephemeral coordination dependency. Document exact keys/TTLs,
   maximum payloads, failure behavior, and observability. Never store refresh
   tokens, media bytes, full prompts, or final artifacts in Redis.
6. Add a platform capability handshake before a job is claimed: OS, architecture,
   executor version, Remotion contract version, browser/FFmpeg availability,
   fonts, maximum render dimensions/duration, and supported codec/container.
7. Do not mark the feature implementation-ready until the deep-plan sections name
   exact files/symbols, migration order, TDD acceptance, rollback behavior, and
   cross-section interfaces for all eight workstreams in `spec.md` section 16.

## Open items resolved by architecture (not stakeholder questions)

- **Redis vs database:** Redis remains only for ephemeral coordination; durable
  state stays in PostgreSQL/R2.
- **MCP vs direct API:** MCP is the Hermes/user-facing tool surface; worker runtime
  uses authenticated HTTP APIs; both converge on the same server services.
- **Tauri/Xcode dependency:** no dependency for the executor runtime; packaging
  signing is a separate release concern.
- **Input and output authorization:** all media references pass through the same
  tenant/user ACL service; output finalization rechecks ownership and job binding.
- **Windows/macOS parity:** parity means the same server contract, auth, claim,
  progress, finalization, retry, and download semantics—not identical installers.
