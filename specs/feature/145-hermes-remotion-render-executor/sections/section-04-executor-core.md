# Section 04 — Standalone Remotion Executor Core

## Purpose and implementation outcome

This workstream creates a standalone, headless Node.js executor under
`apps/remotion-executor`. The executor is the dedicated data-plane process for
jobs whose resolved execution target is `remotion_executor`. It enrolls through
the existing Worker Connect flow, advertises a verified Remotion capability,
claims only compatible `remotion_render_video` assignments, executes the shared
Remotion sidecar in an isolated child process, uploads the resulting MP4 through
the existing worker artifact protocol, and reports progress and terminal state
through authenticated worker REST routes.

The package must run without Tauri, Rust, the Worker App UI, or an Xcode build.
It does not expose an inbound server and it does not receive commands from MCP.
Hermes MCP submits and monitors work through server-owned services; this executor
communicates only with the worker REST control plane and the exact object-storage
upload URL issued for its current artifact.

This section owns the portable executor core and its unit/integration tests. It
does not own server scheduling, database migrations, MCP tools, artifact ACLs,
or release archive production. Those are delivered by Sections 01, 02, 03, 05,
and 06. Section 06 consumes the package and the platform interfaces established
here to build signed Windows, WSL2/Linux, and macOS runtime packs.

## Required existing contracts

Implementation starts only after Sections 01 and 02 have made the following
contracts importable and stable:

- `workerRuntimeType = "remotion_executor"` and its runtime metadata,
  platform, architecture, readiness, capability, and resource-limit schemas;
- the immutable resolved execution target and exact claim-admission rules;
- `REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION`,
  `REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION`,
  `REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY`, and
  `REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES` from
  `@smartspec/remotion-render`;
- the strict `remotionRenderVideoWorkerInputSchema`, progress stages, failure
  codes, artifact descriptors, claim response, lease owner token, assignment
  attempt, and worker event schemas;
- the authenticated control endpoint added by Section 02 and the existing
  connect, refresh, register, heartbeat, claim, event, artifact-init, and
  artifact-complete routes;
- a worker contract entrypoint that a package under `apps/` can import without
  importing `apps/web` server code.

If Section 01 leaves a needed schema only in `apps/web/shared`, extract or expose
that schema through the shared contract package selected by Section 01 before
starting this workstream. Do not copy the schema into the executor and do not
create a second runtime protocol version. The executor may import the portable
Remotion package and the shared worker contracts, but it must not import web
routes, database code, storage credentials, tenant services, or Worker App/Tauri
modules.

The canonical worker routes are:

- `POST /api/workers/connect/start`;
- `GET /api/workers/connect/status` for browser/operator status only where the
  current flow requires it;
- `POST /api/workers/connect/token`;
- `POST /api/workers/connect/refresh`;
- `POST /api/workers/register`;
- `POST /api/workers/:workerId/heartbeat`;
- `POST /api/workers/:workerId/jobs/claim`;
- `GET /api/worker-jobs/:jobId/control` from Section 02;
- `POST /api/worker-jobs/:jobId/events`;
- `POST /api/worker-jobs/:jobId/artifacts/init-upload`;
- `POST /api/worker-jobs/:jobId/artifacts/complete`.

The executor must not use the non-canonical helper paths
`/api/workers/heartbeat` or `/api/worker-jobs/claim`, write application tables
directly, or use MCP as a worker transport.

## Package and workspace registration

Create the following package surface. File names may be split further when a
single module becomes difficult to test, but their ownership and dependency
direction must remain the same.

```text
apps/remotion-executor/
  package.json
  tsconfig.json
  src/
    index.ts
    cli.ts
    config.ts
    doctor.ts
    logging.ts
    runtimeManifest.ts
    hermesInstallDiscovery.ts
    runtimeProvisioner.ts
    mcpAgentSession.ts
    mcpCompatibilityProxy.ts
    controlPlane/
      client.ts
      auth.ts
      schemas.ts
    platform/
      credentialStore.ts
      windowsDpapiCredentialStore.ts
      macosKeychainCredentialStore.ts
      unsupportedCredentialStore.ts
      processSupervisor.ts
      paths.ts
    workerLoop.ts
    remotionRunner.ts
    sidecarProtocol.ts
    artifacts.ts
    workspace.ts
    errors.ts
  test/
    fixtures/
    helpers/
    unit and integration test files
```

## Existing Hermes Install Fast Path

The executor distribution includes a small signed SmartAIHub Hermes Connector
bootstrap. It is the only component allowed to inspect a local Hermes CLI or
Hermes One installation. The Connector uses a closed, platform-specific
discovery registry (known per-user install locations, executable names, and
manifest files); it does not search arbitrary disks, execute shell profiles, or
trust a path supplied by MCP/Hermes.

Discovery returns a sanitized candidate record containing only source kind,
platform/architecture, version, manifest hash, and safe readiness codes. Before
adoption it verifies Hermes compatibility, Node, Remotion, Chromium/Chrome for
Testing, FFmpeg/ffprobe, required fonts, free disk, path ownership, symlink or
junction containment, executable hashes, and the exact Remotion/worker contract.
The Connector may set `runtimeSource: existing_hermes_install` only after every
check passes. Existing Hermes files are never modified in place, and a plain
`hermes_agent_gateway` registration is never upgraded implicitly into a renderer.

If any required component is absent, stale, wrong-architecture, untrusted, or
fails doctor, setup automatically downloads the exact signed managed runtime
pack, verifies the external and archive signatures/checksums/entry allowlist,
extracts to a new version directory, runs doctor, and atomically activates it
beside the existing Hermes installation. It never falls back to `npm`, `pip`,
`uv`, Homebrew, PowerShell, or an arbitrary command to install dependencies, and
it never overwrites the user's Hermes installation. A failed install leaves the
previous verified version untouched and returns a safe `not_ready` next action.

The first-run Connector flow is:

1. Detect and verify an existing Hermes install, or provision the missing signed
   managed components automatically.
2. Open the SmartAIHub browser approval/device flow once; create separate
   owner/device-bound worker credentials and an MCP `agent_pairing` session with
   the exact consented scopes.
3. Store refresh/device material only in Windows DPAPI or macOS Keychain (and a
   supported Linux Secret Service for Linux/WSL2); configure the remote MCP
   endpoint through a credential broker, or a fixed-origin loopback compatibility
   proxy only when the Hermes build cannot use a dynamic credential provider.
4. Register the worker, run admission doctor, and expose `Connected`,
   `Remotion ready`, `Installing missing components`, `Needs login`, or `Blocked`
   with one safe next action through CLI and `smartspec.hermes.connector.status`.

The optional compatibility proxy prefers a Windows named pipe or a Unix-domain
socket with the executor user's OS ACL. If a Hermes build requires TCP, it binds
only to `127.0.0.1`, requires a per-device secret retrieved from DPAPI/Keychain,
checks the caller origin, rejects redirects, and forwards only to the exact
SmartAIHub MCP origin. It never becomes an unauthenticated localhost proxy or a
general SSRF/port-forwarding service.

`setup` and `connect --existing-hermes` are idempotent. Re-running them repairs a
missing component or expired pairing without displaying or asking the user to
copy a token, API key, raw path, or provider credential. The Connector sends
only HTTPS requests to the configured SmartAIHub origin; it has no inbound
internet listener and no general MCP forwarding mode.

The root already declares `apps/*` as an npm workspace, so adding the package
directory and a valid package manifest registers it automatically. Do not add a
second workspace mechanism. Run the repository's pinned npm version so the root
`package-lock.json` records `@smartspec/remotion-executor` and its workspace
dependencies. A root `package.json` edit is unnecessary unless the implementer
adds an explicitly approved convenience script; the package must be usable
through npm's `--workspace` form regardless.

Use package name `@smartspec/remotion-executor`, set `private: true`, set
`type: "module"`, and enforce the repository Node range `>=22.22.0 <23`. Expose
scripts for `build`, `typecheck`, `test`, `doctor`, `setup`,
`connect --existing-hermes`, `start`, and the
pack-staging command consumed by Section 06. Build TypeScript into `dist/`; do
not execute source TypeScript in the production service. Turbo can discover the
package through its normal workspace script graph, so do not create a separate
build orchestrator.

Runtime dependencies should remain narrow:

- `@smartspec/remotion-render` for the strict job contract and portable render
  entrypoint;
- the shared worker contract package/entrypoint delivered by Section 01;
- `zod` only where the shared entrypoint does not already expose the required
  runtime parsers;
- an audited OS credential backend only if Node's standard library and a fixed
  system interface cannot meet the DPAPI/Keychain contract.

Use Node 22 standard APIs for HTTP, streams, hashing, filesystem access, aborts,
and child-process execution where practical. Do not add a general command runner,
shell wrapper, HTTP client, queue client, database client, AWS SDK, or Redis
client to this package. A native credential or process-supervision dependency
must have Node 22 prebuilds for every declared architecture, a maintained release
history, license review, checksum/signature treatment in Section 06, and tests on
the native target. If no acceptable protected-storage backend exists for a
platform, that platform remains `not_ready`; plaintext files, command-line
secrets, PowerShell scripts, and interactive prompts are not fallback paths.

## Configuration and local state model

`src/config.ts` defines and validates non-secret configuration. It should accept
an explicit config file and bounded environment overrides for values such as the
server base URL, state root, render workspace root, active runtime-pack root,
log level, claim interval, heartbeat interval, disk reserve, and maximum local
concurrency. CLI flags may select a config profile or command behavior but must
not accept refresh tokens, execution tokens, upload tokens, private keys, raw job
payloads, arbitrary composition paths, or arbitrary child commands.

Use secure platform defaults:

- Windows native: a dedicated directory below the executor service account's
  `%LOCALAPPDATA%`, with a separately configured render root when large local
  storage is required;
- macOS: the executor user's `~/Library/Application Support/SmartSpecPro/`
  state directory and a separate cache/workspace directory owned by that user;
- WSL2/Linux: XDG-style state/cache roots owned by the service user, governed by
  the separate platform pack in Section 06.

Resolve every configured path to an absolute canonical path during startup.
State, credential metadata, active pack, logs, and render workspaces are distinct
roots. None may be nested inside another root in a way that allows job cleanup to
delete credentials, packs, or logs. Reject filesystem root directories, user
home directories, network shares unless explicitly supported by a later policy,
Windows/WSL mixed paths, device names, path traversal, and roots owned or writable
by an unexpected identity.

Secret values never enter the parsed config object. The config may store opaque
credential slot names, device ID, public key, worker ID, executor version, and
last known non-sensitive readiness summary. Execution and upload access tokens
live in memory only. The rotated refresh credential and device private key live
only behind `CredentialStore`.

`src/logging.ts` provides structured, redacted logging. The logger accepts safe
identifiers such as worker ID, job ID, trace ID, stage, attempt, status, duration,
and error code. It must redact authorization headers, cookies, refresh/access
tokens, device codes, private keys, device signatures, presigned URLs, raw object
keys, full job payloads, user prompts, asset URLs, and absolute workspace paths.
Error objects from fetch, child processes, and operating-system credential APIs
must pass through the same redaction before reaching stdout, stderr, or files.

## Doctor and readiness contract

`src/doctor.ts` produces a strict, machine-readable report and a sanitized human
summary. Each check has an identifier, status (`pass`, `warn`, or `fail`), safe
observations, and a corrective action. The final report includes executor version,
OS, architecture, runtime-pack ID, shared contract versions, capability families,
resource limits, and `readyForClaims`. It contains no secrets or full local paths.

Separate doctor checks into two phases:

1. Bootstrap readiness runs before connect and proves that configuration, secure
   credential storage, local paths, the runtime pack, and required executables
   are usable.
2. Admission readiness runs after enrollment and additionally verifies server
   compatibility, runtime allowlisting, worker binding, clock sanity, and the
   exact capability/contract metadata that will be registered and heartbeated.

Both phases are fail closed. `connect` may run after bootstrap readiness succeeds,
but registration, ready heartbeat, and claim are prohibited until admission
readiness succeeds. A failed recheck changes the worker to unhealthy/not-ready,
stops new claims, and allows the current assignment only to follow the lease and
reconciliation policy from Section 02.

The doctor must check at least:

- Node version is inside `>=22.22.0 <23` and the process architecture matches the
  runtime manifest;
- OS and architecture are an exact declared target; Rosetta or another
  cross-architecture translation cannot report native readiness;
- active pack ID, manifest version, minimum OS, archive/entry checksums, signer
  metadata, and the Remotion platform/renderer contract all match;
- the sidecar entrypoint and every executable resolve beneath the verified active
  pack and match their manifest hashes;
- Chromium/Chrome for Testing can launch in a bounded probe, and FFmpeg and
  ffprobe report the expected versions/codecs;
- required Thai and fallback fonts can be resolved by the render process;
- state, pack, and workspace roots pass ownership, permission, overlap,
  canonicalization, traversal, symlink, free-space, write, rename, and cleanup
  probes;
- the service is non-admin/non-root and a second executor instance cannot use the
  same identity/workspace root concurrently;
- the platform credential backend can create, read, update, and remove a
  disposable probe secret without exposing it;
- the configured server uses HTTPS, except an explicit localhost development
  profile, and server time remains within the device-proof skew bound;
- maximum width, height, duration, codecs, concurrency, temporary disk, and
  hardware-acceleration declarations are internally consistent.

Doctor must distinguish a missing optional optimization from an unsafe or
incompatible runtime. Hardware acceleration may become a warning with a CPU
fallback only when the shared capability policy permits it. Missing protected
credential storage, sidecar, browser, FFmpeg/ffprobe, required font, disk reserve,
contract match, pack verification, secure path, or native architecture is fatal.

`status` reads local non-secret state and the last readiness result. It may make a
bounded authenticated heartbeat/status request when credentials are healthy, but
it must remain useful offline and must never print stored credentials.

## Protected credential adapters

Define a small asynchronous `CredentialStore` contract in
`src/platform/credentialStore.ts`. It owns named secret slots for the device
private key and rotated worker refresh credential and supports create/update,
read, delete, and health-probe operations. Public device metadata is stored
separately from the secret values. The production factory selects exactly one
backend from the detected native platform; the in-memory backend exists only in
test helpers and must be impossible to select through production configuration.

Credential writes are replace-safe: write the new rotated refresh value before
acknowledging rotation, verify it can be read, then retire the prior value under
the server's bounded refresh-grace contract. A crash between server rotation and
local persistence must lead to reconnect/recovery, not token printing or an
unbounded stale-token loop. Credential deletion occurs only through an explicit
`logout`/disconnect workflow or an operator uninstall action; normal shutdown,
feature rollback, and transient credential errors do not delete bindings.

### Windows DPAPI adapter

`windowsDpapiCredentialStore.ts` uses current-user DPAPI protection under the
dedicated non-admin executor account. The encrypted blob and non-secret metadata
may be stored under the protected state root, but the unprotected value may exist
only in process memory for the shortest required operation. Bind DPAPI entropy to
a stable application namespace and secret slot without making that entropy a
password. Apply a restrictive DACL to the state directory and encrypted blob.

Do not default to machine-scope DPAPI: it broadens which local identities can
decrypt the material and weakens service-account separation. Do not run as
LocalSystem or Administrator. The Windows service profile must be loaded so the
same dedicated account that enrolled the executor decrypts the credential after
restart. Copying the encrypted blob to another account or machine must fail.

The adapter must call an audited native API binding or a signed fixed-purpose
helper with fixed arguments. It must not use `cmd.exe`, PowerShell, WSH, the
registry as plaintext storage, or a command argument/environment variable to
carry a secret. Failure to load or validate the protected backend is a fatal
doctor result.

### macOS Keychain adapter

`macosKeychainCredentialStore.ts` stores secrets as generic-password items in a
dedicated service namespace and executor-account label. The executor process must
access Keychain as the same fixed, non-admin user that enrolled it. Keychain item
access should be constrained to the installed executor identity where the chosen
backend supports access control. Secrets must not appear in argv, environment,
plist files, logs, or a plaintext compatibility file.

The supported first-release headless mode is a per-user LaunchAgent running in
the executor user's login/bootstrap session with an available, unlocked Keychain.
The doctor must perform a non-destructive Keychain probe in that exact launch
context. A LaunchDaemon or session without usable Keychain access is not ready
unless Section 06 later introduces and proves a dedicated daemon keychain design
with equivalent least-privilege controls. The executor must not silently switch
to an interactive prompt, login-shell assumption, or plaintext file when Keychain
returns interaction-not-allowed, locked, missing-entitlement, or access-denied.

An implementation that uses `/usr/bin/security` must spawn that absolute binary
with a fixed operation/argument list and a secret channel that does not expose the
secret in process arguments or logs. If the system tool cannot satisfy that rule,
use an audited prebuilt native backend or fail the platform release gate. No Xcode
or Tauri build is required on the render machine; signing/notarization and any
prebuilt native credential component are release concerns for Section 06.

### Unsupported platforms

`unsupportedCredentialStore.ts` returns a typed, fatal readiness error. It never
falls back to in-memory or plaintext storage. WSL2/Linux credential policy belongs
to Section 06 and must be added as a separate adapter and pack proof before those
targets become production-ready.

## Device identity and control-plane client

`src/controlPlane/auth.ts` owns device-key generation, stable JSON/body hashing,
JWT `jti` extraction, nonce generation, clock handling, and request proof signing.
It must reproduce the server's existing canonical proof input exactly: uppercase
HTTP method, exact path, access-token `jti`, RFC 3339 timestamp, unique nonce, and
SHA-256 of the canonical request body separated by newlines. It emits the current
`X-Worker-Device-*` and `X-Worker-Body-Sha256` headers defined by the shared
contract. Query ordering and body serialization are fixed before hashing; a body
must not be reserialized differently after the proof is made.

`src/controlPlane/client.ts` is a typed HTTP adapter around the canonical routes.
Every request validates its outgoing payload and incoming response against shared
schemas, has a timeout and maximum response size, uses HTTPS except for explicit
localhost development, rejects unexpected redirects, and returns typed sanitized
errors. It must never accept a caller-supplied tenant ID, user ID, Authorization
header, proof header, object-storage host, or arbitrary route.

Keep token planes separate:

- the refresh token is read from protected storage only for a refresh operation;
- `worker_execution` tokens remain in memory and can call only heartbeat, claim,
  control, and event operations with their required scopes;
- `worker_upload` tokens remain in memory and can call only artifact init and
  complete operations;
- no Smart AI Hub bearer token is sent to the presigned object-storage URL;
- MCP/session/API-key/Hermes-provider credentials never enter this process.

Connect reuses the current device-code flow. The executor first creates its device
identity, submits only public device/runtime metadata to `connect/start`, shows the
one-time user code and verification URI, polls `connect/token` at the server-provided
interval, verifies the approved worker/runtime binding, and stores only the device
private key and rotated refresh credential in protected storage. It must not start
a second connect session while one is active or poll faster than instructed.

Refresh is single-flight. A 401/expired execution or upload token pauses claims,
performs one bounded device-proved refresh, atomically replaces the token set, and
retries only operations that are safe under their idempotency contract. A proof
replay, machine mismatch, runtime mismatch, revoked binding, refresh reuse, or
cross-tenant response blocks the connection and requires explicit reconnect.

Use bounded exponential backoff with jitter for transient network and 5xx errors.
Do not retry schema/contract errors, 4xx authorization failures, stale lease or
assignment conflicts, invalid artifact metadata, or permanent input failures.
Claim, event, and artifact calls are retried only according to the idempotency and
conflict behavior established by Section 02; the client must not assume that an
ambiguous POST failed before the server committed it.

## Worker loop and lifecycle

`src/workerLoop.ts` is a state machine, not an unbounded polling script. Its
observable states are `booting`, `not_connected`, `connecting`, `checking`,
`ready`, `claiming`, `assigned`, `rendering`, `uploading`, `reconciling`,
`draining`, `blocked`, and `stopped`. State transitions are serialized and carry
a cancellation signal. A single-instance lock prevents two local processes from
using one worker identity and workspace root.

Startup order is fixed:

1. Parse non-secret config and acquire the single-instance lock.
2. Select the native credential adapter and run bootstrap doctor, including the
   closed Hermes discovery/adoption or signed managed-pack provisioning flow.
3. Load or create the device identity; if no valid worker or MCP pairing exists,
   enter the single browser approval flow instead of claiming or mutating.
4. Exchange the approved handoff into separate worker and owner-bound MCP
   `agent_pairing` sessions; refresh in-memory worker execution/upload tokens and
   verify worker/runtime binding.
5. Run admission doctor and register/report the exact readiness/capability profile
   including `runtimeSource`.
6. Start heartbeat, MCP connector-status, and control loops, then begin bounded
   claims.

Default local concurrency is one because the shared Remotion package already
serializes `executeRemotionRenderVideoJob` in-process and Chromium/FFmpeg memory
pressure is significant. Any future value above one requires both a declared
resource profile and independent sidecar/workspace processes; it remains bounded
by doctor and server-advertised capacity. The claim request uses `maxJobs` and
capability hints from readiness, including the exact
`REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY`, never a caller-provided list.

For each assignment, the loop validates runtime type, job type, immutable target,
payload schema, contract versions, capability families, lease owner token,
assignment attempt, and tenant/worker binding before creating a workspace. It
keeps lease and assignment values in an immutable assignment context used by
control polls, progress events, artifact operations, and terminal reconciliation.
No payload field can replace those values.

Heartbeat and control polling continue while the sidecar runs. A cancellation
signal, expired lease, changed assignment attempt, disabled worker, failed doctor,
or operator drain stops new claims immediately. Cancellation terminates the
sidecar process tree, emits the typed canceled outcome only while the lease is
still authoritative, and never sends a late completion. Lease loss or stale
assignment moves the loop to reconciliation and treats any later local output as
unpublishable.

Graceful shutdown handles SIGINT/SIGTERM and service-stop signals. It stops new
claims, marks the worker draining where the server contract permits, gives the
active assignment a bounded grace period, cancels and reaps remaining child
processes, performs only lease-valid reconciliation, closes HTTP resources,
releases the single-instance lock, and exits non-zero when safe shutdown could not
be confirmed. Shutdown must never report success before artifact completion and
server terminal acceptance.

Local retry is bounded by the shared Remotion constants and classification. A
transient sidecar/browser/network failure may retry within the same job,
reservation, lease, and assignment. Contract, checksum, unauthorized asset,
invalid output, stale lease, cancellation, or permanent input failures do not
start a fresh assignment. Server restart or temporary loss enters bounded backoff;
durable job state remains server-owned.

## Workspace and path isolation

`src/workspace.ts` creates one unpredictable directory beneath the configured
render root for each assignment. The directory is derived from a locally generated
opaque name, not directly from a user string or supplied path. Store a small
sanitized metadata file containing job ID, assignment attempt, creation time, and
cleanup state; never store bearer/refresh tokens, signed URLs after use, provider
credentials, or unredacted prompts as diagnostic metadata.

Before every read, write, rename, upload, and cleanup operation:

- resolve the candidate against the canonical job root;
- reject absolute payload paths, `..`, alternate separators, Windows device/UNC
  syntax, null bytes, case-folding collisions, and mixed WSL/Windows paths;
- reject symlinks, junctions, reparse points, hard-link escapes, and files whose
  canonical parent is outside the job root;
- create files exclusively with restrictive permissions and no-follow/exclusive
  semantics where supported;
- enforce per-file, total input, total output, and free-space limits before and
  during staging;
- verify every downloaded asset against the server-provided SHA-256 and bounded
  byte length before making it visible to the renderer.

The executor accepts only the shared payload's server-minted asset references.
Asset staging must use the established trusted download rules and rewrite inputs
to job-local materialized files where the shared renderer expects that behavior.
It must not follow arbitrary URLs, redirects to unapproved schemes/hosts, local
file URLs, SMB paths, or payload-supplied headers. Server authorization is the
authority for asset access; the local checksum and path policy is defense in
depth, not an ACL replacement.

Cleanup receives the exact job-root handle/context created for the assignment,
never a path reconstructed from remote input. Successful/canceled/permanent-failure
workspaces are removed after required diagnostics are safely emitted. A bounded
quarantine retention may preserve sanitized diagnostics for transient failures,
but MP4s, payloads, and asset files must have an explicit short retention and disk
cap. Startup janitor logic may remove only recognizable, expired executor job
directories beneath the canonical render root and must never traverse into the
state, credential, pack, or log roots.

## Renderer and sidecar boundary

`src/remotionRunner.ts` uses the existing sidecar model as the production process
boundary. The coordinator must not run Chromium/FFmpeg inside the worker-loop
process. The verified sidecar is built from the shared
`@smartspec/remotion-render/render-video-job` entrypoint and preserves the frozen
invocation shape:

```text
<verified-node> <verified-sidecar> render-video
  --payload <job-local-payload-file>
  --workspace <job-local-workspace>
  --output-dir <job-local-output-directory>
```

This is a protocol description, not a shell command. `ProcessSupervisor` invokes
the absolute verified Node executable with a fixed argument array, `shell: false`,
the job root as the working directory, a minimal environment allowlist, closed or
explicit stdio, and no detached orphan. It never invokes `cmd.exe`, PowerShell, a
login shell, or `/bin/sh`; never accepts an executable, argument, composition
module, output path, or environment variable from the job; and never searches
`PATH` for production executables.

The child environment contains only values required by the verified renderer,
such as fixed executable paths, locale/font settings, bounded temp/cache roots,
and non-secret render settings. Remove inherited auth, cloud, database, npm,
proxy, debugging, and dynamic-loader variables unless a reviewed runtime manifest
explicitly requires a safe value. The payload is written to a restrictive
job-local file and validated before spawn; passing the payload body in argv or an
environment variable is prohibited.

`src/sidecarProtocol.ts` parses line-delimited `SMARTAIHUB_EVENT` records with a
strict maximum line size and shared event schemas. It maps all ten stages in
order: `resolve_inputs`, `stage_assets`, `bundle_composition`,
`select_composition`, `render_frames`, `run_post_passes`, `verify_outputs`,
`upload_artifacts`, `server_verify_artifacts`, and `publish_artifacts`. Repeated
progress is allowed only when monotonic and contract-valid. Unknown event types,
invalid JSON, out-of-order terminal events, oversized output, or a completed path
outside the output root fails the attempt. Ordinary stdout/stderr becomes bounded,
redacted diagnostic output, not a worker event.

The coordinator supplies the sidecar's local storage callback semantics: the
sidecar writes/copies the final MP4 beneath the assignment output directory and
reports its local path. It never uploads directly and never receives Smart AI Hub
or object-storage credentials. The coordinator independently opens the output,
checks it is a regular non-linked file beneath the output root, probes the MP4,
validates bounded size and expected MIME/container, and computes the final hash.
The sidecar's claimed path, size, hash, and completion event are never trusted
without this verification.

`ProcessSupervisor` must terminate the complete render process tree. On Windows,
use a Job Object-capable fixed-purpose backend or an equivalently verified
process-tree mechanism packaged by Section 06; on macOS/Linux, use an isolated
process group with bounded TERM then KILL escalation. Failure to provide reliable
tree cleanup makes doctor fail. Timeouts, cancellation, lease loss, and shutdown
all use this same supervisor so Chromium or FFmpeg grandchildren cannot survive
the executor.

Map shared renderer errors without flattening them. Preserve known
`RemotionRenderVideoJobError` failure codes, classify timeout and cancellation as
worker lifecycle outcomes defined by Section 02, classify malformed sidecar
output as a permanent protocol failure, and redact raw stderr before reporting a
safe message. A process exit of zero is insufficient for success: the expected
completed event and verified output must both exist.

## Artifact client and terminal reconciliation

`src/artifacts.ts` owns local artifact verification and the existing three-step
publication protocol: init, binary PUT, and complete. It does not select a bucket,
storage key, public URL, or publication destination.

Open the final MP4 as a stream, calculate SHA-256 and byte size without loading the
whole video into memory, and retain file identity/stat information so mutation
between verification and upload is detected. Artifact init sends the fixed
artifact type `remotion_render_mp4`, sanitized filename, `video/mp4`, byte size,
checksum, lease owner token, and assignment attempt using only a `worker_upload`
token. The response is schema-validated and bound to the same job, worker, lease,
assignment, size, and checksum.

For the presigned PUT:

- require HTTPS except an explicit localhost test profile;
- use the server-provided URL exactly and reject redirects;
- send no Smart AI Hub Authorization, cookie, device-proof, or tenant headers;
- send only the required `Content-Type`, exact content length, and headers
  explicitly returned by the artifact-init contract;
- stream from the already validated file with backpressure and an upload timeout;
- never log the URL, query string, response body containing storage details, or
  request headers.

Retry a transient PUT at most three times against the exact same URL and immutable
file. If the URL has expired, first confirm that control state, lease, assignment,
file identity, size, and checksum are unchanged, then request a new init for the
same artifact metadata. Never silently rehash a changed file into the same
assignment or accept a different object chosen locally.

Artifact complete sends the returned opaque `storageRef`, SHA-256, size, content
type, sanitized metadata, lease owner token, and assignment attempt using the
upload token. A size/checksum/storage-ref/lease/assignment conflict is permanent
for that local attempt and enters server reconciliation; it is not worked around
with another storage key.

After server artifact completion succeeds, emit the terminal worker completion
using the existing Worker App Lane B output shape: the MP4 artifact descriptor
plus inline `remotion_render_manifest`, `remotion_render_log`, and
`remotion_render_probe_report` descriptors. Inline descriptors are bounded and
redacted. The executor does not invent a playback URL. Success is acknowledged
only after the server accepts terminal completion/publication. If upload succeeds
but completion or the terminal event is ambiguous, query the Section 02 control
and reconciliation seam before retrying; never start a second render or reserve a
second charge.

## Windows 11 headless security requirements

The Windows native service runs under one dedicated local non-admin account with
its user profile loaded. The service account owns the state, workspace, and DPAPI
material and has no interactive admin rights, database credentials, R2 keys, MCP
credentials, or access to unrelated user profiles. Installer/service ACLs grant
write access only to the state/workspace locations that require it; executable and
active-pack files are not writable by the runtime identity.

Native Windows and WSL2 are separate modes. The native process must not discover
or call WSL, translate paths, accept UNC/device paths, or claim a WSL2 capability.
WSL2 support is enabled only by its own Linux pack and tests in Section 06. Child
processes use absolute verified `.exe` paths, no shell, hidden windows, fixed
working directories, restricted environment, and process-tree containment. The
doctor proves DPAPI can decrypt after a service restart under the same account and
that copying the encrypted blob to a different user context fails.

## macOS headless security requirements

The macOS executor runs as a fixed non-admin user LaunchAgent for the initial
release. Its plist contains only fixed executable/config paths and non-secret
settings; it does not contain tokens, private keys, signed URLs, shell snippets,
or user-controlled arguments. Program binaries and the active pack are
signed/notarized and non-writable by the runtime identity according to Section 06;
state and workspace roots are writable only where required.

The LaunchAgent must run the same native architecture as its pack. Apple Silicon
and Intel have independent readiness identities; Rosetta cannot turn an x64 pack
into arm64 readiness or vice versa. The admission doctor is executed in the
actual LaunchAgent context and proves Keychain access, browser launch, FFmpeg,
fonts, paths, process-tree termination, and restart persistence. A locked or
interaction-required Keychain blocks claims and emits a sanitized corrective
status. No interactive terminal, Worker App, Tauri, Xcode, inbound listener, or
login-shell initialization is required at runtime.

## Error taxonomy and observability

`src/errors.ts` distinguishes configuration, readiness, authentication,
authorization, contract, lease, cancellation, timeout, transient network,
sidecar protocol, render, output verification, and artifact publication errors.
Every error records whether retry is allowed within the current assignment and
whether the worker must become blocked/unhealthy. Raw server bodies and child
stderr are never exposed as the public message.

Metrics and safe logs should cover doctor check outcomes, current loop state,
connect/refresh result, heartbeat latency, claim result, lease time remaining,
render stage/duration, sidecar exit classification, cancellation latency,
workspace bytes, artifact bytes/hash-prefix, upload attempts, reconciliation
result, and child cleanup result. Hash-prefix logging is optional and must not
become an object identifier or authorization mechanism. Metrics must not contain
tenant content, filenames, URLs, secrets, prompts, or unbounded high-cardinality
labels.

## TDD implementation sequence and test stubs

Write tests before production modules. Use Vitest in the executor workspace and
Node's temporary-directory/test utilities. Unit tests run on Linux CI with fake
platform adapters; native DPAPI, Keychain, service-context, browser, and process-
tree tests are tagged platform integration tests and are mandatory release proof
for Section 06. No unit test may write real user credentials or use the developer's
actual Keychain/DPAPI slots.

### Wave 1 — Package, configuration, paths, and doctor

Create tests such as:

- `test/config.test.ts`: accepts only known non-secret fields; rejects malformed
  URL, unsupported Node range, invalid concurrency, secret-like CLI/env fields,
  unsafe roots, and production HTTP;
- `test/workspace.test.ts`: creates unpredictable job roots and rejects traversal,
  absolute payload paths, symlink/junction/reparse escape, root overlap, mixed
  Windows/WSL paths, hard-link replacement, quota overflow, and cleanup outside
  the exact assignment root;
- `test/doctor.test.ts`: table-driven failures for Node, OS/architecture,
  manifest/contract/hash, sidecar, browser, FFmpeg, ffprobe, fonts, credential
  backend, permissions, single-instance lock, disk reserve, process-tree support,
  TLS, and clock skew;
- `test/runtimeManifest.test.ts`: wrong platform/architecture/version/hash/path
  and unsigned/unallowed manifests cannot become ready; the detailed archive
  signature/activation tests remain owned by Section 06.
- `test/hermesInstallDiscovery.test.ts`: only allowlisted existing Hermes
  locations are inspected; compatible installs are adopted, unsafe/ambiguous
  candidates are rejected, and the result contains no raw path or command.
- `test/runtimeProvisioner.test.ts`: a missing/incompatible component selects
  the signed pack, verifies it before extraction, activates atomically beside an
  existing install, and leaves the previous version untouched on failure.

Implement only enough package/config/path/doctor behavior to make each test pass,
then run workspace typecheck before moving to the next wave.

### Wave 2 — Credential stores and device proof

Create a reusable credential-store contract suite and run it against the memory
test adapter. Add platform-gated suites for DPAPI and Keychain that use disposable
namespaces and clean up only those namespaces. Assert create/read/rotate/delete,
crash-safe replacement, permission denial, locked store, wrong user/machine,
restart persistence, and no secret in captured logs/stdout/stderr/argv/env.

Add `test/controlPlaneAuth.test.ts` with golden vectors matching the server/Worker
App proof canonicalization: method, exact path, stable body hash, JWT `jti`,
timestamp, nonce, signature headers, escaped public key, and rejection of replayed
or malformed inputs. Golden vectors must be shared or generated from the Section
01 contract so TypeScript executor and existing Worker App semantics cannot drift.

Add `test/mcpAgentSession.test.ts` for one-time browser/device pairing, exact
scope consent, refresh rotation, device mismatch, revocation, replay, and the
rule that worker/provider credentials cannot be used as an MCP agent session.

### Wave 3 — Typed control-plane client

Use a loopback fake HTTP server and strict fixture schemas in
`test/controlPlaneClient.test.ts`. Cover connect polling interval, approved binding,
single-flight refresh/rotation, correct token plane and scopes, device proof on
every Smart AI Hub request, timeout, response-size cap, redirect rejection,
transient backoff, ambiguous POST handling, stale lease conflict, and sanitized
errors. Assert that tenant/user/proof/Authorization headers cannot be injected by
callers and that no Smart AI Hub token reaches the fake object-storage endpoint.

### Wave 4 — Worker-loop state machine

`test/workerLoop.test.ts` uses a fake clock, fake doctor, fake credential store,
fake control plane, and fake runner. Cover every declared state and at least these
scenarios:

- first connect, approved connect, restart with refresh, revoked binding, and
  blocked proof mismatch;
- ready heartbeat and exact capability claim with default concurrency one;
- schema/target/contract rejection before workspace or sidecar creation;
- heartbeat timeout without duplicate claim;
- cancellation during each long-running stage;
- lease expiry or assignment replacement while rendering/uploading;
- transient retry within one job/lease/reservation and permanent no-retry;
- SIGINT/SIGTERM drain, bounded grace, process cleanup, and no duplicate terminal
  event;
- server restart and ambiguous terminal response reconciled without rerender.

### Wave 5 — Sidecar and process isolation

`test/sidecarProtocol.test.ts` feeds bounded fixture lines for all ten stages,
duplicate/monotonic progress, invalid JSON, unknown event, oversized line,
out-of-order stage, missing completion, outside-root output, and redacted stderr.

`test/remotionRunner.test.ts` and `test/processSupervisor.test.ts` spawn only a
repository-owned fake sidecar. Assert absolute executable/entrypoint paths, fixed
argument arrays, `shell: false`, fixed cwd, environment allowlist, payload-file
permissions, timeout/cancel tree termination, output regular-file checks, and
typed failure mapping. Include injection strings containing spaces, quotes,
newlines, shell metacharacters, Windows separators, and macOS paths and prove they
are treated as data or rejected, never executed.

A focused integration test may run the real tracked sidecar with a deterministic
minimal fixture after unit tests pass. Real Chromium renders remain platform smoke
evidence in Sections 06 and 08.

### Wave 6 — Artifact upload and reconciliation

`test/artifacts.test.ts` streams a generated bounded file through fake init,
object-store, complete, and event endpoints. Cover size/SHA-256, mutation after
hashing, content type, no redirect, no bearer leakage, upload backpressure,
transient PUT retries, expired URL re-init with identical metadata, stale lease,
assignment mismatch, storage-ref mismatch, ambiguous completion, and Worker App
Lane B descriptor parity.

`test/executorFlow.integration.test.ts` proves doctor → refresh → register →
heartbeat → claim → ten progress stages → cancellation/control checks → local
artifact → init → streamed PUT → complete → terminal acceptance with a fake
control plane. Duplicate responses and restart checkpoints must not create a
second render, artifact, or completion event.

### Focused verification commands

The completed package must support focused commands equivalent to:

```text
npm run typecheck --workspace @smartspec/remotion-executor
npm test --workspace @smartspec/remotion-executor
npm run build --workspace @smartspec/remotion-executor
npm run doctor --workspace @smartspec/remotion-executor -- --format json
```

Section 06 adds native Windows/macOS doctor and pack commands. Section 08 adds the
server-integrated end-to-end command. Report focused executor results separately
from unrelated repository-wide baseline failures.

## Dependency order and ownership boundaries

Implement in this order:

1. Section 01 publishes runtime identity, schemas, capability/readiness metadata,
   and importable shared contracts.
2. Section 02 finalizes claim admission, `GET .../control`, token-plane behavior,
   lease/assignment validation, artifact init/complete, and reconciliation.
3. Build this section in the six TDD waves above, using a fake control plane until
   Section 02 routes are ready.
4. Section 06 packages the built executor, verified sidecar, browser, FFmpeg,
   fonts, credential/process native components, manifests, signatures, services,
   LaunchAgent, and atomic update/rollback mechanics.
5. Section 07 performs the cross-boundary security/resilience gate; the executor
   itself does not connect to Redis.
6. Section 08 runs deterministic server integration and real Windows 11/macOS
   platform acceptance before production routing.

This section owns only `apps/remotion-executor/**` and the root lockfile entry
needed to register that workspace. It may consume but must not modify
`packages/remotion-render` behavior unless a separately reviewed compatibility
bug is proven. It must not change server routes, shared schemas, migrations,
MCP registry, storage authorization, Worker App runtime code, or platform release
scripts; route/contract changes go back to Sections 01–02 and packaging changes
go to Section 06.

## Rollback and failure containment

The package ships behind the server's default-off
`remotionDedicatedExecutorEnabled` tenant flag and operator dispatch kill switch.
Rollback proceeds by disabling new dedicated target selection, draining/stopping
the executor service, and removing its runtime pack from the allowed release
manifest. Existing Worker App routing and already durable jobs remain intact.

Rollback must not delete database enum values, jobs, artifacts, user media,
worker bindings, DPAPI/Keychain credentials, active pack files, or quarantined
workspaces automatically. An explicit logout/uninstall command may revoke and
remove the local credential slots after server reconciliation, but feature-flag
rollback preserves them so the same worker can be safely re-enabled. Section 06
keeps the previous verified pack for local binary rollback.

If an executor is stopped while assigned, Section 02 lease expiry and durable
reconciliation determine retryability. Operators must not manually alter job rows
or copy output into storage. Any retained workspace is non-authoritative and may
be cleaned only by the bounded janitor after the lease is no longer active.

## Definition of done

This section is complete when:

- npm recognizes `@smartspec/remotion-executor` through the existing `apps/*`
  workspace and the root lockfile is updated without unrelated dependency churn;
- package build, typecheck, and all fake-platform/unit integration tests pass;
- the executor imports shared schemas rather than duplicating them and has no
  Tauri, Rust, web-server, database, R2 credential, Redis, or MCP dependency;
- bootstrap/admission doctor fails closed for every unsafe or incompatible
  condition and emits a safe structured report;
- DPAPI and Keychain adapters satisfy the protected-storage contract with no
  plaintext or interactive fallback;
- the typed client proves Worker Connect/device proof/token-plane separation and
  exact lease/assignment binding;
- the worker loop claims at bounded concurrency, handles cancellation/shutdown,
  and cannot duplicate render or terminal completion after ambiguity;
- sidecar execution uses verified fixed paths/arguments, isolated workspaces,
  bounded output parsing, and reliable process-tree cleanup;
- artifact upload is streamed, checksum/size/assignment-bound, redirect-safe, and
  produces the established Worker App Lane B terminal descriptor shape;
- Windows native and macOS core adapters are ready for Section 06 native pack and
  service-context proof, with unsupported platform modes remaining not-ready;
- rollback can stop dedicated dispatch without changing legacy Worker App behavior
  or deleting durable/security state.

## UI/UX Contract

### Target User / JTBD
N/A — headless executor and CLI/runtime behavior; no browser task is changed.

### Surface Inventory
N/A — no browser route or component is introduced.

### Component Map
N/A — no frontend ownership changes.

### State Matrix
N/A — state is represented by doctor/CLI output and worker control-plane status.

### Responsive Matrix
N/A — no responsive layout is changed.

### Accessibility Acceptance
N/A — no browser interaction is introduced; CLI output remains bounded and sanitized.

### Copy Contract
N/A — no browser copy is added.

### Browser Evidence Required
N/A — native platform evidence belongs to Sections 06 and 08.
