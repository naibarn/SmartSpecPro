# Implementation Plan — Spec 205 SmartAIHub Runner

## 1. Objective and non-negotiable boundaries

Build a standalone headless Rust Runner under apps/runner-app for four local
targets:

- x86_64-pc-windows-msvc;
- x86_64-apple-darwin;
- aarch64-apple-darwin;
- x86_64-unknown-linux-gnu.

The same provider-neutral core must also run as a SHARED_CONTAINER_RUNNER
entrypoint inside the Cloudflare Container runtime. This shared profile is a
managed, ephemeral execution node serving multiple users. Every Job is
authorized, leased, fenced and observed through Feature 195 worker_jobs,
worker_job_events and outbox contracts.

The existing apps/worker-app remains a separate Tauri/media/render product.
The plan must not rename it, make Runner register through its legacy Worker
endpoints, move its media code, or alter its release workflows. Feature 204
remains the owner of Cloudflare provisioning, scheduling/pool, autoscaling,
cost ceilings, rollout and deployment. Feature 205 owns the execution
entrypoint and process/workspace isolation inside an eligible Container.

No implementation section may introduce Agency, work requests, workpacks,
retired custom workflows, OpenSandbox, sandbox_jobs or Docker/OpenSandbox
dispatch. A Container image may be built as an artifact for Cloudflare, but
the production deployment path remains the Feature 204 Cloudflare path.

## 2. Existing code and compatibility strategy

Before changing shared types, inspect:

- apps/web/server/services/runnerContracts.ts;
- apps/web/server/services/jobControlPlaneTypes.ts;
- apps/web/server/services/jobControlPlane.ts;
- apps/web/server/services/jobOutboxPublisher.ts;
- apps/web/server/services/cloudflareRuntimeTarget.ts;
- apps/web/server/services/cloudflareJobAdapters.ts;
- apps/web/server/routes/workerRuntime.ts;
- apps/cloudflare and its wrangler configuration/contracts;
- the relevant Feature 195, 197, 199, 200, 203 and 204 spec sections.

Use the existing runnerContracts validation style and existing Job Control
Plane repository/transaction boundaries. Prefer an additive versioned
execution-node/profile extension with compatibility re-exports. Do not mutate
the meaning of legacy Worker runtime values or make a local Runner appear as a
Worker solely to reuse /api/workers/register, heartbeat or jobs/claim.

The design has two profiles under one execution contract:

| Profile | Authority and state | Transport |
|---|---|---|
| LOCAL_DEVICE_RUNNER | persistent enrolled device; bounded protected local journal | authenticated persistent control channel plus durable HTTPS fallback |
| SHARED_CONTAINER_RUNNER | managed pool/node; fresh per-Job process/workspace; durable state outside Container | Feature 195 job lease/outbox assignment; no direct user-to-container channel |

The compatibility decision, field ownership, migration need and rollback
strategy must be recorded before implementation. If no schema change is
needed, document the projection choice and its isolation tests.

## 3. Repository and protocol foundation

Create the standalone Rust package:

    apps/runner-app/
      Cargo.toml
      src/main.rs
      src/protocol.rs
      src/config.rs
      src/identity.rs
      src/control_channel.rs
      src/journal.rs
      src/discovery.rs
      src/leasing.rs
      src/supervisor.rs
      src/workspace.rs
      src/adapters.rs
      src/diagnostics.rs
      src/container.rs
      src/execution.rs
      tests/                 # focused tests are colocated until integration fixtures grow
      README.md

Keep runner-core usable by both the local executable and a non-Tauri
Container entrypoint. Keep runner-cli commands separate from runtime behavior.
The first usable commands are doctor, status, capabilities, connect,
reconnect and safe shutdown/drain. Configuration must distinguish local and
shared profiles, reject ambiguous profile combinations and never accept
credentials from arbitrary Job payload fields.

Define the normalized envelope fields once: protocol version, node/profile
identity, Job ID, attempt/lease identity, fencing version, correlation ID,
sequence and idempotency key. Define explicit ACK outcomes:
accepted, applied, rejected, unknown, duplicate and out-of-order. Keep
provider-native payloads behind adapters and transmit only bounded/redacted
event summaries plus artifact/provenance references.

If a neutral TypeScript package is justified, extract only versioned pure
contract types from runnerContracts.ts and leave a compatibility re-export at
the current import path. Do not make Rust depend on generated Web code at
runtime; use a documented protocol fixture or schema source that can be
validated independently.

## 4. Backend registry and control-plane boundary

Add or extend the backend Runner boundary only after the contract foundation
is stable. Candidate locations are:

- apps/web/server/services/runnerGateway.ts;
- apps/web/server/services/runnerControl.ts;
- apps/web/server/routes/runnerControl.ts;
- existing execution-node registry and Job Control Plane modules.

The initial API/internal-contract surface must be explicit:

| Operation | Contract boundary | Durable effect |
|---|---|---|
| local enrollment | POST /api/runners/:runnerId/enroll | creates or idempotently returns a local execution-node identity |
| capability publication | POST /api/runners/:runnerId/capabilities | records the latest bounded tool/capability revision/expiry projection |
| local reconnect/reconcile | authenticated WSS /api/runners/:runnerId/control with HTTPS reconciliation fallback | ACKs/replays canonical commands/events |
| redacted diagnostics | Runner CLI plus bounded gateway status response | exposes no credential/path/prompt material |
| shared Container assignment | Feature 204 adapter over the Feature 195 outbox | leases one canonical Job with attempt/fence context |

The exact route names may reuse an existing route convention only if the
request/response and authorization semantics remain equivalent. Enrollment
must use a one-time or short-lived authenticated bootstrap, and subsequent
messages must use rotated Runner credentials rather than a user session token.

The gateway must support local Runner enrollment, revocation, key rotation,
capability snapshot publication, authenticated control-channel handshake,
heartbeat/reconciliation and redacted diagnostics. It must not create a
second jobs table, Runner-only outbox or direct provider transport.

The shared Container path must be represented as an eligible managed execution
node selected by Feature 204. A user request must never carry enough client
input to address another tenant's Container. Container assignment must include
the canonical Job, attempt, lease token/reference, fencing version, approved
workspace/context references and profile/resource constraints. The server
must validate the assignment before dispatch and reject stale/revoked/missing
authority.

Specify routes or internal service contracts with request/response shapes
before implementation. Every mutation is tenant-scoped and idempotent. Keep
interactive local Runner commands on the authenticated control channel; keep
durable recovery in PostgreSQL/outbox. Shared Containers receive only the
durable assignment path and lifecycle signals needed for a leased Job.

Gateway and Runner control paths must apply bounded payload sizes, heartbeat
cadence, reconnect backoff, per-node concurrency and rate limits. Backpressure
must leave the canonical outbox recoverable rather than dropping an event or
creating an unbounded in-memory queue.

## 5. Local Runner identity, discovery and control channel

Implement local device enrollment as a distinct execution-node kind:

- generated persistent device identity stored in OS-protected storage where
  available;
- short-lived access credentials with rotation and revocation;
- tenant/user/device binding derived from server authorization;
- explicit offboarding and re-enrollment behavior;
- capability revision, observed time and expiry.

Authentication must align with the existing Worker App security invariants but
must not reuse its token namespace or legacy endpoints. Reuse the established
server-side bearer/JWT verification, JTI revocation, scope/effective-policy,
tenant/runtime binding and device-proof primitives where safe. Define separate
Runner-namespaced audience and token-use values. Section 01 freezes at least
`smartspec-runner-registration`, `smartspec-runner-control-plane`,
`runner_registration`, `runner_execution`, `runner_upload` and
`runner_refresh`. Use short-lived operational tokens, refresh rotation with
bounded replay grace, and fail closed when the durable connected-device
authorization is missing or revoked. The bootstrap token is limited to the
explicit enrollment exchange, never WSS control or Job execution. WSS uses an
Authorization header or single-use handshake exchange, never bearer/refresh
credentials in a WSS URL query string; device-proof headers/nonces use a
Runner-specific namespace. The Runner must reject worker_registration,
worker_execution, worker_upload and worker_refresh tokens, while Worker routes
reject Runner tokens. Shared Containers use a managed node credential plus
server-derived per-Job delegated scope/lease/attempt/fence rather than
per-user device proof.

Implement a single outbound authenticated control client with WSS as the
low-latency path and HTTPS durable fallback. The client must handle handshake,
version negotiation, command ACK, event ACK, sequence ordering, bounded
backoff, reconnect and reconciliation. It must preserve safe active process
state during transient disconnect, but must block unsafe new claims or false
completion while ownership is unknown.

Capability discovery must probe actual installed/configured/authenticated/
healthy/policy-allowed runtimes. The initial known catalog includes Claude
Code/Claude CLI, Codex CLI, DeepSeek Harness, Google Antigravity, Hermes
CLI/Agents and OpenClaw-compatible runtimes, plus approved FFmpeg/FFprobe,
Remotion, ComfyUI, browser/desktop automation, local AI and local MCP tools.
Report a separate bounded tool inventory and capability inventory with tool ID,
kind, version, adapter/manifest identity, discovery source, install/auth/
health/availability state, control profile, resource requirements, concurrency,
reason codes, observed time, expiry and a fingerprint. Absolute paths,
credentials, raw configs and account identifiers remain local or opaque.

Use the normalized trust states `discovered`, `probed`, `verified`, `ready`,
`busy`, `degraded`, `auth_required`, `unsupported` and `disabled`. `ready`
requires an approved adapter/manifest and a successful bounded probe; server
policy `allowed` remains a separate prerequisite for selection. The capability
publication contract is a bounded idempotent
`POST /api/runners/:runnerId/capabilities` request carrying one snapshot
revision/expiry, `toolInventory[]` and `capabilityInventory[]`; the response
returns accepted revision/expiry and bounded rejection reasons. Older
revisions cannot roll the registry back and missing entries are tombstoned or
marked unavailable.

Scan only bounded platform-aware sources: PATH and approved known locations,
application bundles/package metadata, approved manifests, adapter version/
health probes, approved MCP configuration and bounded `tools/list`, and safe
resource/auth probes. Fingerprint before probing, enforce timeout/output
limits, and never execute an arbitrary file merely because it is present.
An unknown candidate may be reported as discovered but cannot become
executable without an adapter, manifest or approved generic CLI profile.

On every material change, the Runner publishes one idempotent snapshot revision
for the node. Missing/revoked tools become stale or unavailable; they are not
silently retained as ready. Feature 196/server policy and the Capability
Registry/Resolver decide what is selectable. A tool never registers as its own
Runner/device. Shared Containers advertise only the allowlisted tools and
image capabilities baked/configured for the immutable image; they do not scan
or expose a user's local tools.

Capability changes invalidate old offer assumptions where required. The Runner
is the gateway for SmartAIHub-dispatched process launch/control and evidence,
but it must not claim visibility into an agent's private internal tools unless
the selected adapter exposes or explicitly mediates them. MCP invocations
remain governed by Feature 199.

The local journal stores only bounded redacted control/event metadata and
references. It has fixed byte/event limits, overflow behavior, corruption
handling and replay idempotency. It never stores provider API keys, refresh
tokens, raw prompts or arbitrary upstream payloads.

## 6. Shared Container Runner entrypoint and isolation

Implement a non-Tauri Container entrypoint that invokes the same provider-
neutral runner-core execution contract but uses SHARED_CONTAINER_RUNNER
semantics:

The current concrete layout is apps/runner-app/src/container.rs and the
Cloudflare adapter in apps/cloudflare/src/runnerContainer.ts (or the repository's approved image
equivalent), with apps/cloudflare containing only the Worker/Container
adapter and binding configuration. The existing
apps/web/server/services/cloudflareRuntimeTarget.ts and
cloudflareJobAdapters.ts remain the integration points for canonical outbox
dispatch. If the existing Cloudflare layout requires another path, record the
mapping before implementation; do not place the Container entrypoint inside
apps/worker-app.

- derive tenant/user authority from the server assignment, never from
  untrusted Container request data;
- accept only one validated Job/attempt/lease/fence scope per execution;
- allocate a fresh per-Job workspace and process supervisor scope;
- prohibit reuse of credential caches, context, workspace or child processes;
- emit heartbeats/events/artifact references through the canonical path before
  acknowledging terminal success;
- treat Container filesystem as disposable;
- handle SIGTERM, cancellation, lease expiry and instance replacement by
  stopping safely and leaving reconciliation to Feature 195;
- do not wait in-process for an external provider after its task identity is
  persisted; return the Job to the durable provider-poll/resume path.

Feature 204 integration must expose only the adapter needed to start/select,
health-check, drain and recycle the Container. Feature 205 must not add
Cloudflare autoscaling or deployment logic. The plan must define the
Container artifact contract (entrypoint, environment allowlist, health signal,
manifest/digest and supported instance/resource profile) without embedding
long-lived Cloudflare credentials.

Isolation tests must run concurrent Jobs from at least two tenants, force a
restart/replacement between events, and prove no cross-Job workspace,
credential, process or context leakage. A job row alone is not proof that the
Container process is alive.

## 7. Job execution, adapters, artifacts and recovery

Implement one supervisor abstraction for process trees, timeouts, cancellation,
pause/resume/steer capability declarations, exit/crash collection and orphan
cleanup where supported. The supervisor must distinguish command delivery from
observed effect; terminating a process is not proof external side effects were
undone.

Adapters for Codex, Claude Code, Google Antigravity, DeepSeek Harness, Hermes
Agents and OpenClaw-compatible runtimes are provider-specific modules behind
one interface. Start with the adapters that have a supported local transport.
Feature 200 owns Agent Task/session/turn/event/result semantics; Feature 205
owns process envelope, discovery, registration and host/gateway mechanics.
Feature 199 grants are required for MCP access, and arbitrary upstream URLs are
rejected.

Every event and artifact reference is bounded, redacted and tied to the active
attempt/fence. Completion requires result/artifact verification and canonical
terminal transition. Unknown, stale, duplicated or late messages must not
overwrite a newer fenced attempt.

Implement reconciliation for:

- idle disconnect;
- disconnect during offer or execution;
- clean restart;
- crash/restart with an incomplete journal;
- backend restart;
- lease expiry and reclaim;
- provider task submitted but response lost;
- Container replacement during terminal reporting.

The recovery result must be explicit: resumed, queued, reconciled, unknown,
failed or safely abandoned. Never silently retry an irreversible external
action.

## 8. Web projection and user flow

Do not create a new Runner page. Extend the existing combined Feedback/Chat
launcher and Universal Control Plane/Task Control projection owned by Features
198/200. /workers/connect remains the local enrollment entry point and must
label Runner separately from Worker App. /chat and the inline panel must
project the same canonical state.

### UI/UX contract

- **Target/JTBD:** a user can enroll a local Runner, see whether a shared
  Container or local Runner is executing a multi-step request, and inspect
  active steps without leaving the current page.
- **Surfaces/ownership:** combined launcher, Universal Control Plane panel,
  /chat and /workers/connect; Feature 198/200 owns presentation and the
  Feature 205/204 contracts supply state.
- **Component map:** launcher opens the existing panel; panel renders
  connection summary, execution target, Task Control group/step tree and
  safe action controls; connection form calls the backend enrollment contract;
  no component writes local state directly.
- **State matrix:** loading; empty/no eligible Runner; connected/ready;
  waiting-for-lease; running; provider-running; waiting-external;
  reconnecting; reconciling; paused; failed; verification-pending; completed;
  revoked; permission denied. Each state needs safe copy and disabled/action
  behavior.
- **Responsive matrix:** mobile uses compact launcher and stacked step detail;
  tablet uses expandable group and connection cards; laptop/desktop may show
  target/capability columns and diagnostics. Paths, tokens and raw provider
  payloads are never added at any size.
- **Accessibility:** keyboard launcher and step expansion, visible focus,
  semantic disclosure/tree relationships, labelled status/action controls,
  screen-reader status updates, contrast and reduced-motion support.
- **Visual/copy:** reuse existing tokens/components and localization patterns;
  distinguish Runner, Worker App and Cloudflare shared Runner in Thai and
  English. Do not add a global CSS reset.
- **Browser evidence:** Playwright proof for the combined launcher, panel,
  connection states, multi-step expansion, Runner/Worker labels and redacted
  rendering. A browser pass does not replace native or Container runtime proof.

## 9. Manual GitHub release workflow

Add .github/workflows/runner-release.yml with workflow_dispatch as the only
trigger. Inputs must include ref/commit, version, platform, profile (local,
shared-container or all), artifact-only versus GitHub release, release notes
and signing mode/secret availability.

Build jobs must produce deterministic native artifacts for all requested local
targets and a separate Cloudflare Container artifact/image manifest. The jobs
must run focused Rust/protocol/security/package tests, generate checksums and
machine-readable source/toolchain/contract metadata, and fail closed when
required signing/provenance inputs are absent.

Publishing is a separate explicit branch of the workflow. Container image
digest/manifest generation may upload an artifact for review, but deployment
must remain an explicitly invoked Feature 204 operation. The workflow must
prove that push, pull_request, schedule, tag, release and dependency updates
do not trigger it. It must not change desktop-release.yml or
worker-app-macos-release.yml.

The plan must include workflow-static tests that parse the YAML and verify
trigger policy, target matrix, profile inputs, no Worker workflow mutation and
secret redaction. Use current npm/Rust conventions only where needed; do not
invoke repository-wide TypeScript typecheck.

## 10. Verification and rollout

Use test-first implementation. The focused test inventory is:

1. Rust unit tests for config/profile parsing, envelope validation, identity,
   capability freshness, sequence/ACK state, journal bounds/replay,
   workspace confinement, supervisor cancellation and adapter event mapping.
2. Rust integration tests for lease/fence acceptance/rejection, disconnect and
   restart reconciliation, provider-task handoff and Container per-Job
   isolation.
3. Web/Vitest tests for backend contracts, tenant scope, registry projection,
   gateway handshake/control authorization and Task Control projection.
4. Static workflow tests for manual-only dispatch, matrix/profile inputs,
   deterministic manifest/checksum and explicit deployment handoff.
5. Focused Playwright tests for the existing combined launcher/panel and
   /workers/connect Runner-versus-Worker flow.
6. Environment gates on native Windows, macOS Intel (x64), macOS arm64
   (Apple Silicon) and
   Linux x86_64 install/start/stop/reconnect, plus a real Cloudflare staging
   Container run with concurrent tenant isolation and restart evidence.

Do not run npm run typecheck, npm --workspace @smartspec/web run check or any
whole-repository TypeScript typecheck. Run only changed-file/static checks,
focused Vitest/Playwright specs, and apps/runner-app Cargo tests.

Roll out behind Runner eligibility and profile gates. First enable local Runner
in diagnostics/opt-in mode, then controlled shared Container staging, then
production profiles after lease/fence, cost and isolation evidence. Rollback
disables eligibility and revokes credentials; it does not delete canonical
Jobs/events/artifacts or alter Worker App configuration.

## 11. Ordered implementation waves

1. **Contracts and ownership:** freeze profile/node vocabulary, protocol
   envelope, compatibility projection and test fixtures.
2. **Backend control boundary:** add registry/gateway/control contracts and
   tenant/lease/fence tests without enabling new execution.
3. **Runner foundation:** create Rust package, config, identity, diagnostics,
   protocol client and journal.
4. **Local runtime:** discovery, capability snapshots, control channel,
   supervisor, workspace and one vertical-slice adapter.
5. **Canonical Job integration:** offer/lease/attempt/heartbeat/event/artifact/
   terminal and reconciliation paths.
6. **Shared Container profile:** entrypoint, fresh workspace/process scope,
   external durable handoff, SIGTERM/restart and multi-tenant isolation.
7. **UI projection:** connect flow and shared Task Control/launcher states,
   localization/accessibility and browser evidence.
8. **Manual release:** native matrix plus Container artifact, manifest,
   checksum/signing and no-auto-trigger tests.
9. **Platform/staging gates:** native and Cloudflare evidence, rollout/rollback
   drill and completion/review records.

Waves 1–2 must precede runtime code. Within the local runtime, discovery and
diagnostics can proceed in parallel after the foundation; Job integration must
follow the contract. The Container profile follows the canonical Job boundary
and must not be implemented as a shortcut around it.

## 12. Risks and explicit blockers

- **Existing contract ambiguity:** block implementation until the additive
  profile/node mapping and backward compatibility tests are decided.
- **Worker protocol collision:** block release if Runner calls legacy Worker
  registration/claim semantics or shares config/token roots.
- **Cloudflare lifecycle drift:** revalidate current Container API, limits and
  rollout semantics at implementation time; do not treat documentation as
  production proof.
- **Lost lease or duplicate provider action:** block terminal success until
  fencing and idempotency evidence exists.
- **Container cross-tenant leakage:** zero tolerance; block shared profile
  enablement until concurrent restart isolation tests pass.
- **Release automation drift:** block release if any non-manual workflow trigger
  or implicit deployment is present.
- **Memory constraints:** whole-repo TypeScript typecheck is an explicit
  prohibited verification path; preserve focused evidence instead.
