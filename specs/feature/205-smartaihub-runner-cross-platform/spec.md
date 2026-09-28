# Spec 205 — SmartAIHub Runner Cross-Platform Runtime

**Spec ID:** 205  
**Revision:** 6 — 2026-09-18 — adds SmartAIHub-owned release catalog, Dashboard distribution and verified local Runner update contract
**Status:** Runner runtime/control-plane and release-portal implementation complete in the repository; native-host, signing, deployment and provider/session acceptance remain external gates
**Target:** SmartAIHub Runner execution contract with local runtimes for Windows x86_64, macOS Intel (x64), macOS arm64 (Apple Silicon) and Linux x86_64, plus a shared Cloudflare Container Runner profile
**Suggested code path:** `apps/runner-app`  
**Release path:** GitHub Actions `workflow_dispatch` only; no automatic build or release on push/PR  
**Related specs:** Feature 195 Unified Async Job Control Plane; Feature 196 Goal Orchestration; Feature 197 Runner Adaptive Execution Fabric; Feature 198 Intelligent Chat, Universal Orchestration & Capability Evolution; Feature 199 External MCP Gateway & Upstream Management; Feature 200 Universal Coding Agent Control Plane; Feature 201 Content Provenance & Copyright Protection; Feature 202 AI Rough Cut Video Editor; Feature 203 AI Editor Director Shared Runtime; Feature 204 Cloudflare Container Runtime Control Plane; **Feature 206 A2A-First Hybrid External Agent Interoperability**

## 1. Decision

SmartAIHub SHALL add a dedicated Feature 205 implementation specification for
the concrete Runner product/runtime. Features 197 and 200 define the Runner
semantics, contracts and delegated Agent behavior, while Feature 204 defines
the Cloudflare Container infrastructure. The repository implementation now
contains the standalone cross-platform Runner foundation, separate Runner
gateway and registry projection, bounded discovery/execution contracts,
authenticated WSS/HTTPS transport with durable fallback, direct no-shell
process supervision, shared Container assignment lifecycle, combined Task
Control projection and manual release workflow. Provider-specific
auth/session acceptance, native host packaging, target Cloudflare bindings
and signing credentials remain explicit rollout gates; they are not inferred
from generic local probes or contract tests.

Feature 205 owns that implementation boundary. It MUST NOT turn Feature
197 or Feature 200 into another product-specific job system, and it MUST NOT
fold the Runner into the existing SmartAIHub Worker App.

## 2. Why Runner Is a Separate Product

The existing `apps/worker-app` is a Tauri desktop application with a media and
queue-worker lifecycle. It currently uses Worker registration, heartbeat and
HTTP job claim endpoints and contains media-specific sidecars, renderers and
local UI. That system remains supported for its existing responsibilities.

The SmartAIHub Runner is a different execution node:

```text
SmartAIHub Runner
= headless local execution host
= device identity + capability advertisement
= local runtime/tool discovery
= Agent/CLI/MCP supervision
= persistent control client + reconnect/replay
= workspace/process/resource/provenance enforcement

SmartAIHub Worker App
= existing Tauri application
= media/render/legacy worker lanes
= local desktop editor UI where already supported
= existing worker protocol and release lifecycle

Shared Cloudflare Container Runner
= managed shared execution node
= ephemeral per-Job workspace/process boundary
= no persistent user device identity
= canonical worker_jobs lease/outbox control
```

The Runner and Worker App MAY reuse versioned protocol types and small neutral
libraries, but they MUST have separate package identities, executable names,
configuration roots, credentials, process lifecycles, release artifacts and
runtime feature flags. The Runner MUST NOT register as the existing Worker
merely to obtain compatibility with legacy claim paths.

Where Features 197, 199 and 200 say that Runner capabilities share one
Control Channel, that means one versioned transport, registry and namespace
contract—not one socket, credential, configuration root or durable session.
When Runner and Worker App coexist, each remains a separately authenticated
execution node/connection; only explicitly neutral protocol types may be
shared.

The local Runner and Shared Container Runner MUST implement the same
provider-neutral execution, event, lease, artifact and verification contract.
They are different execution-node profiles, not two Job systems:

| Profile | Identity | State | Control | Isolation |
|---|---|---|---|---|
| `LOCAL_DEVICE_RUNNER` | persistent user/device-bound Runner identity | bounded local journal plus canonical Job state | persistent authenticated WSS with HTTPS durable fallback | approved local workspace and OS process boundary |
| `SHARED_CONTAINER_RUNNER` | managed pool/node identity; user identity comes from the authorized Job | ephemeral container state; durable truth remains canonical Job/outbox | worker/job lease and outbox control; no direct user-to-container command | fresh per-Job workspace, process boundary and scoped context |

## 3. Cross-Spec Ownership and Non-Overlap

| Concern | Canonical owner | Feature 205 responsibility |
|---|---|---|
| Goals, Plans and step semantics | Feature 196 | consume approved plan/task metadata |
| Durable Job, lease, attempt, outbox and event truth | Feature 195 | implement the Runner client against these contracts; no second ledger |
| Runner offer, capability fit and adaptive execution semantics | Feature 197 | provide the concrete runtime that satisfies the contract |
| Chat/Assistant intent and control surfaces | Feature 198 | expose Runner state through existing shared UI contracts |
| MCP upstream lifecycle and transport | Feature 199 | consume only approved gateway grants; never bypass it |
| External Agent sessions, provider-neutral task/event/result semantics | Feature 200 | host local provider processes through the approved adapter contract |
| Media evidence, edit intent and artifact provenance | Features 201–203 | execute authorized workloads and return evidence/artifacts through canonical Jobs |
| Cloudflare Container lifecycle, pool, autoscaling and deployment | Feature 204 | provide the managed execution-node pool and invoke the Feature 205 Container Runner entrypoint |
| Tool catalog, discovery and capability semantics | Feature 197 | provide the canonical Runner inventory/trust model; Feature 205 implements the concrete cross-platform scanners and adapter probes |
| Runner execution contract, local runtime and shared Container entrypoint | Feature 205 | own the common execution semantics, local executable, shared-container adapter and manual build artifacts |
| Runner release catalog, Dashboard download and local self-update | Feature 205 | own SmartAIHub public release distribution, native package/update assets and verified local Runner update lifecycle |

Feature 205 MUST NOT redefine any field that is authoritative in Features
195–204. Where an existing contract is incomplete for a real Runner boundary,
the plan MUST add a versioned additive contract and update the owning spec
instead of silently inventing a Runner-only meaning.

## 4. Scope

### 4.1 In scope

- a standalone headless Runner executable and development package;
- Windows x86_64 support;
- macOS x86_64 (Intel) support;
- macOS arm64 (aarch64, Apple Silicon) support;
- Linux x86_64 support;
- a `SHARED_CONTAINER_RUNNER` profile for Cloudflare Containers that can serve
  multiple users through isolated per-Job executions;
- authenticated device enrollment and persistent Runner identity;
- capability snapshot, revision, expiry and discovery reporting;
- known external tool/runtime scanning and registration with explicit trust and
  readiness states;
- persistent authenticated Runner Control Channel with reconnect and HTTPS
  durable fallback;
- canonical Job offer/claim/attempt/event/heartbeat/complete/fail integration;
- bounded local journal for unacknowledged control/events and reconciliation;
- OS-appropriate process supervision, cancellation and workspace confinement;
- host adapters for approved local Agent/CLI/MCP/runtime integrations;
- safe progress, event, artifact and provenance reporting;
- diagnostic CLI and redacted health/readiness evidence;
- manual GitHub build/package workflow and checksums/signatures/manifest;
- manual build/publishable artifact for the Cloudflare Container Runner image or
  equivalent Cloudflare runtime package, coordinated with Feature 204;
- SmartAIHub-owned Runner release catalog with platform/architecture/profile
  metadata, checksums, signatures and provenance;
- same-origin Dashboard download and version-check APIs that do not expose the
  GitHub repository or workflow to normal users;
- authenticated local Runner update command with bounded drain, verified
  atomic replacement, restart confirmation and rollback;
- compatibility tests against Features 195, 197, 199, 200 and 203;
- Web projection of Runner status through existing Task Control/connection
  surfaces without creating a new cluttering UI.
### 4.2 Out of scope

- replacing or renaming `apps/worker-app`;
- moving existing Worker media/render code into Runner in the first release;
- creating a second `runner_jobs`, coding-agent queue, task ledger or event truth;
- creating a second MCP upstream transport or direct provider-to-upstream path;
- implementing the retired Agency, work requests, workpacks, custom workflows,
  OpenSandbox, `sandbox_jobs` or Docker/OpenSandbox dispatch;
- storing provider API keys or raw user credentials on the Runner;
- full local project/editor UI;
- automatic installation of every provider/runtime;
- Cloudflare provisioning, autoscaling policy, Durable Object/Worker lifecycle
  and deployment orchestration; those remain Feature 204;
- automatic GitHub builds on push, pull request, tag, schedule or dependency
  update;
- claiming a provider result, workspace diff or copyright/provenance result as
  verified without the owning verification contract.

## 5. Runtime Architecture

The initial product SHALL be a headless Rust binary. It MAY expose a local CLI
for diagnostics and controlled lifecycle commands, but it MUST NOT require a
webview or Tauri UI to execute work. The same runner-core contract SHALL also be
usable by a Cloudflare Container Runner entrypoint. The Container profile may
use a separately packaged Linux runtime process, but it MUST NOT import the
Worker App's Tauri state or claim the local device identity model.

```text
apps/runner-app
├── runner-core
│   ├── lifecycle and shutdown
│   ├── device identity and enrollment
│   ├── control channel client
│   ├── durable local journal
│   ├── capability discovery and snapshot
│   ├── offer/lease/attempt coordinator
│   ├── process and workspace supervisor
│   ├── provider/CLI adapter host
│   ├── MCP grant client (through Spec 199 gateway only)
│   ├── artifact/provenance reporter
│   └── redacted diagnostics
├── runner-cli
│   ├── doctor
│   ├── status
│   ├── capabilities
│   ├── connect/reconnect
│   ├── run/rescan
│   └── safe shutdown/drain
└── platform packaging
    ├── Windows service/foreground package
    ├── macOS launch-agent/foreground package
    ├── Linux systemd/foreground package
    └── Cloudflare Container Runner entrypoint/package
```

The Runner MUST have one process supervisor and one control client. Provider
adapters MUST be plugins/modules behind the Runner adapter interface; they MUST
NOT open their own control channel, queue, credential store or job ledger.

For a local device, `run` is the foreground lifecycle loop: it performs the
initial discovery/control refresh and repeats it at a bounded configured
interval; `rescan` performs one explicit refresh. Both use the same
authenticated WSS path, HTTPS durable fallback and reconciliation semantics as
`connect`/`reconnect`. The shared Container `run` entrypoint remains an
assignment-scoped health/runtime process owned by Feature 204 scheduling.

For SmartAIHub-dispatched work, the Runner is the authenticated execution
gateway between the control plane and an external local tool/runtime:

```text
SmartAIHub Goal/Plan
  -> Feature 195 Job + Feature 200/197 policy
  -> authenticated Runner Control Channel
  -> Runner adapter and supervised external process/runtime
  -> bounded events, artifacts and verification
  -> canonical Job state and Task Control projection
```

This gateway boundary covers process launch, control, cancellation,
capability checks, workspace/resource policy and evidence reporting. It does
not claim to intercept every tool call made internally by an external agent's
own subscription, skill or MCP configuration. Such calls remain outside the
Runner observation boundary unless the selected adapter explicitly exposes
them or policy launches the agent with a mediated tool surface.

## 6. Control and Durable State Model

The control model is:

```text
SmartAIHub Backend Runner Gateway
          ⇅ persistent authenticated WSS fast path
          ⇅ HTTPS durable control fallback
Runner Control Client
          ⇅
Local bounded journal + reconciliation state
          ⇅
Runner process supervisor / provider adapter

Shared Container Runner
          ⇅ worker_jobs lease + outbox assignment
Ephemeral per-Job supervisor/workspace
```

The PostgreSQL control inbox or equivalent canonical Feature 195 control
record remains the durable source of truth. WSS is a low-latency delivery path,
not the only record. A disconnected Runner MUST preserve active process state
where safe, buffer only bounded redacted events, reconnect with backoff, replay
unacknowledged messages idempotently and reconcile before accepting unsafe new
work.

Every command/event MUST carry the versioned Runner protocol, runner identity,
job ID, attempt/lease identity, fencing version, correlation ID, sequence and
idempotency key where applicable. The Runner MUST distinguish accepted,
applied, rejected, unknown, duplicate and out-of-order states.

Tool-scoped offers, sessions and events MUST additionally carry the normalized
`toolId`, `adapterId` and capability snapshot revision. A tool identity is
metadata under one Runner node; it is not a second execution node or queue.

The local journal:

- stores only bounded control/event metadata and references;
- uses an OS-protected key or equivalent platform protection where available;
- never stores provider API keys, refresh tokens, raw prompt context or arbitrary
  upstream payloads;
- has a fixed byte/event retention limit and explicit overflow behavior;
- marks unknown state after corruption or incomplete replay;
- can be inspected through redacted diagnostics without exposing local secrets.

The Shared Container Runner MUST NOT depend on a container-local journal for
durability across instance replacement. It MAY use a bounded in-process buffer
while a Job is running, but every accepted event, heartbeat, artifact reference
and terminal transition MUST be acknowledged through the canonical
`worker_jobs`/`worker_job_events`/outbox path before the container is considered
complete. A container restart is reconciled by Feature 195 lease/fence rules.

## 7. Device Identity, Enrollment and Registry

The local Runner MUST enroll as a distinct execution-node kind, with a
persistent device identity and rotating short-lived access credentials.
Enrollment MUST bind the Runner to the authenticated tenant/user/device policy
and MUST support revocation, re-enrollment, key rotation and offboarding.

The Shared Container Runner is a managed execution-node profile rather than a
user device. Its pool/node identity is owned by SmartAIHub operations; each Job
still carries server-derived tenant/user authorization, lease, attempt and
fencing context. A container MUST NOT reuse one user's identity, workspace,
credential cache or context for another user's Job.

The implementation MUST reuse the shared Execution Node Registry contract from
Features 197/199/200. It MUST NOT create a Runner-only registry if an additive
extension of the canonical registry is sufficient. If the current schema cannot
represent both legacy Workers and Runner nodes safely, the plan MUST introduce
an additive node-kind projection/migration with explicit ownership and rollback;
the legacy `workers` identity and claim semantics MUST remain unchanged.

The server-derived principal is authoritative for tenant/user access. A
client-supplied tenant ID, hostname, machine name or queue value MUST never
grant scope.

### 7.1 Authentication alignment with Worker App

The local Runner MUST follow the same server-side authentication invariants as
the existing Worker App, while using a separate Runner credential namespace
and endpoint surface. The parity requirements are:

- signed bearer/JWT verification and revoked-token/JTI denial checks;
- distinct, Runner-namespaced audience and token-use values for
  enrollment/bootstrap, control or execution, artifact upload and refresh.
  Section 01 MUST freeze the minimum values
  `smartspec-runner-registration`, `smartspec-runner-control-plane`,
  `runner_registration`, `runner_execution`, `runner_upload` and
  `runner_refresh`;
- required operation scopes plus the durable connected-device effective policy;
- authenticated tenant binding and runtime/node binding, with `runnerId` and
  profile checked against the request;
- device proof and machine/public-key binding when the local Runner is enrolled
  as a user device;
- durable connection revocation, re-enrollment and credential rotation;
- short-lived operational credentials and refresh rotation with bounded replay
  grace, without accepting a browser/user session token;
- fail-closed behavior when a device authorization record is missing, revoked,
  expired or no longer matches the presented Runner identity.

Runner MUST reuse the established Worker authentication primitives and policy
semantics where safe, but MUST NOT reuse `worker_registration`,
`worker_execution`, `worker_upload` or `worker_refresh` tokens as a silent
compatibility path. The bootstrap token may be used only for the explicit
enrollment exchange; it MUST NOT authorize WSS control or Job execution.
WSS authentication MUST use an Authorization header or a single-use
handshake exchange and MUST NOT put bearer/refresh credentials in a WSS URL
query string. Device-proof headers/nonces MUST use a Runner-specific
namespace.
Runner endpoints MUST reject Worker tokens, and Worker endpoints MUST reject
Runner tokens, unless a future versioned migration explicitly defines the
boundary and its tests. Runner MUST NOT register through
`/api/workers/register` or claim through the legacy Worker endpoints.

The `SHARED_CONTAINER_RUNNER` profile is intentionally different from a local
Worker/Runner device: it uses a managed node credential plus a server-derived
per-Job delegated scope, lease, attempt and fencing context. It does not use
per-user device proof, but it MUST enforce the same signature, audience,
scope, revocation, tenant isolation and fail-closed principles before a Job
can execute.

## 8. Capability Discovery and Runtime Readiness

At startup and on material changes, the Runner MUST probe and report a bounded
capability snapshot containing:

- Runner protocol and binary version;
- OS, architecture and supported platform target;
- available CPU/memory/disk/resource class;
- approved workspace roots as opaque IDs or safe summaries;
- installed Agent/CLI/runtime adapters and versions;
- recognized tool inventory for the known catalog, including install,
  configuration, authentication and health states;
- local MCP availability only as discovered capability metadata;
- browser/media/GPU capabilities only when actually probed;
- readiness, auth state, health state, last probe time and expiry;
- capability revision and reason codes for unavailable capabilities.

Discovery MUST distinguish installed, configured, authenticated, healthy,
available and policy-allowed. It MUST fail closed for malformed probes and MUST
not advertise a capability merely because a binary name exists in PATH.

The normalized tool trust vocabulary MUST include `discovered`, `probed`,
`verified`, `ready`, `busy`, `degraded`, `auth_required`, `unsupported` and
`disabled`. `ready` is only a truthful execution state when the tool has a
valid approved adapter/manifest, a successful bounded probe, healthy required
dependencies and an `available` or `busy` availability state. `allowed` is a
separate server policy decision; a tool is selectable only when its trust,
availability and policy states all permit the requested operation.

### 8.1 Known external tool catalog

The initial local catalog MUST recognize these external agent/tool families
when their approved adapter and transport are available:

| Tool family | Normalized kind | Initial adapter boundary |
|---|---|---|
| Claude Code / Claude CLI | `agent_cli` | process/session adapter; native evidence preserved |
| Codex CLI | `agent_cli` | process/session adapter; native evidence preserved |
| DeepSeek Harness | `agent_harness` | process/session adapter; native evidence preserved |
| Google Antigravity | `agent_harness` | process/session adapter; native evidence preserved |
| Hermes CLI / Hermes Agents | `agent_runtime` | local CLI/session adapter; existing Worker endpoints are not reused |
| OpenClaw-compatible runtime | `agent_runtime` | manifest-driven compatibility adapter; no arbitrary binary execution |

The same discovery contract MUST also support non-agent tools that the system
knows how to use, including FFmpeg/FFprobe, Remotion, ComfyUI, browser or
desktop automation runtimes, local AI runtimes and approved local MCP
servers. Adding a name to the catalog does not make it executable: an adapter,
manifest or explicitly approved generic CLI profile is required.

### 8.2 Scan, normalize and registration lifecycle

For `LOCAL_DEVICE_RUNNER`, discovery MUST run at first start, Runner upgrade,
periodic refresh, explicit rescan, relevant PATH/configuration changes and
after an execution failure that may indicate stale metadata. The scan MAY use
only bounded, platform-aware sources:

- PATH and approved known install locations;
- platform application bundles and package-manager metadata;
- approved runtime/package manifests;
- version or health probes supplied by the adapter;
- approved MCP configuration and bounded `tools/list` metadata;
- local resource/authentication probes that do not export secrets.

The scanner MUST fingerprint a candidate before probing it, use the immutable
resolved executable/manifest for the probe, enforce timeouts and output limits,
and treat unknown executables as `discovered` but not executable. It MUST NOT
execute arbitrary files merely because they are present on disk or PATH.

Tool inventory and capability inventory are separate:

- **Tool inventory** records what was recognized on the machine: `toolId`, kind,
  display name, version, adapter ID/version, discovery source, install state,
  auth state, health state, fingerprint, last probe time, expiry and safe
  reason codes. Absolute paths, tokens, account secrets and raw config remain
  local or are reduced to opaque safe identifiers.
- **Capability inventory** records what SmartAIHub may request from that tool:
  capability ID/version, control profile, resource requirements, concurrency,
  availability, policy decision and capability confidence. It is derived from
  the tool inventory plus server policy and does not trust a client claim by
  itself.

The Runner MUST publish one bounded snapshot revision for the Runner node,
including the recognized tool and capability projections. Publication is an
idempotent upsert/tombstone operation: missing or revoked tools become stale
or unavailable rather than silently remaining ready. SmartAIHub stores only
the redacted projection, applies tenant/user/role/agent policy and Feature 196
resolution, then uses the snapshot revision and expiry for scheduling. A tool
must not register as its own Runner/device.

The local publication contract is `POST /api/runners/:runnerId/capabilities`
(or an equivalent versioned internal contract) with a server-authenticated
Runner identity and an idempotency key. Its bounded request MUST contain one
`snapshotRevision`, `observedAt`, `expiresAt`, legacy capability IDs, workspace
and resource summary, plus `toolInventory[]` and `capabilityInventory[]` using
the redacted shapes from Section 8.2. The response MUST return the accepted
revision/expiry and bounded per-entry rejection reason codes after server
policy projection. Repeating the same revision is a no-op; a newer revision
must tombstone or mark absent entries unavailable, and an older revision must
not roll the registry back.

For `SHARED_CONTAINER_RUNNER`, scanning is limited to the allowlisted tools,
adapters and manifests baked/configured for the immutable image and resource
profile. The Container MUST register image/runtime capabilities and health;
it MUST NOT scan or expose a host user's tools, use a local-user credential or
pretend that a shared image has per-user device capabilities.

The server MUST use the snapshot revision and expiry during offer/lease
selection. The Runner MUST reject stale offers, cross-tenant offers, missing
capabilities, revoked trust, expired leases and fencing mismatches.

Cloudflare Container capability snapshots MUST represent pool capacity and
image/runtime readiness, not a fabricated per-user local-device capability.
Feature 204 owns instance count, hard cost ceilings, queue burst policy and
container health gates; Feature 205 owns the execution contract that runs inside
an eligible instance.

## 9. Job, Lease and Agent Execution

Runner execution follows this sequence:

```text
approved Goal/Plan/Task
  → canonical worker_jobs admission/outbox
  → capability-aware offer or lease
  → Runner validates offer + lease + fence
  → isolated execution session/workspace
  → normalized progress/events + native evidence references
  → artifact/provenance/result verification
  → canonical terminal Job transition
```

The Runner MUST NOT browse arbitrary Jobs. It requests authorized compatible
work or receives a targeted offer for a pinned/affine device. It MUST report
decline reasons separately from execution failures.

For Feature 200 external agents, Feature 205 owns the local or container process
envelope, discovery, adapter host and gateway integration, while Feature 200
owns provider-neutral Agent Task, session, turn, event and result semantics.
Initial adapter targets are Codex, Claude Code, Google Antigravity, DeepSeek
Harness, Hermes Agents and OpenClaw-compatible runtimes where a supported
local transport is available. The adapter MUST preserve native evidence and
map it to the shared normalized event contract; it MUST NOT claim visibility
that the provider does not expose.

The Runner MUST supervise process trees, collect exit/crash state, enforce
workspace boundaries, apply resource limits where supported, and implement
cancel/pause/resume/steer only when the adapter declares support. Terminating a
process is not evidence that external side effects were undone.

For the Shared Container Runner, every Job execution MUST use a fresh isolated
workspace/process scope and MUST release all ephemeral state at terminal or
reconciled shutdown. Long external-provider waits MUST persist the provider task
identity and return control to the canonical Job/Workflow path; a Container
MUST NOT remain alive only to poll an external provider.

## 10. Workspace, Secrets and Safety

- Workspace access is limited to server-authorized opaque workspace references
  resolved by the Runner under local policy.
- Absolute paths, traversal, symlink escapes and unapproved roots MUST fail
  closed.
- Provider credentials remain provider-native and locally protected where
  allowed; the Runner MUST not send them to the Web UI, model context, event
  payload or logs.
- Spec 199 MCP access requires a scoped gateway grant and job/session identity;
  direct arbitrary upstream MCP URLs are rejected.
- Shell/process execution requires an adapter capability and Feature 195/200
  approval policy where the action is risky.
- Event, diagnostic and artifact metadata are bounded and redacted before
  transmission.
- Unknown/reconciled state MUST block unsafe completion and new claims when
  lease or process ownership cannot be proven.

## 11. Platform Contract

| Platform | Initial target | Packaging | Required runtime proof |
|---|---|---|---|
| Windows | x86_64 MSVC | signed `.zip`/installer artifact as selected by plan | clean install, enrollment, service/foreground start, process cancel, reconnect |
| macOS Intel | x86_64 Darwin | signed `.tar.gz`/`.pkg` or equivalent artifact | native launch, keychain protection, enrollment, reconnect |
| macOS arm64 (Apple Silicon) | aarch64 Darwin | signed `.tar.gz`/`.pkg` or equivalent artifact | native launch, keychain protection, enrollment, reconnect |
| Linux | x86_64 GNU | `.tar.gz` plus systemd/foreground instructions | clean host start, permissions, journal recovery, reconnect |
| Cloudflare Container | managed Linux pool | manually built/publishable Container Runner artifact | multi-tenant Job isolation, lease/fence, restart reconciliation, queue/cost gates |

The first release MUST produce native artifacts for both macOS architectures;
it MUST NOT silently cross-run an Intel binary on Apple Silicon or vice versa.
Linux arm64, Windows arm64 and universal macOS packaging are future extensions
unless the implementation plan proves them without weakening the four initial
native platform targets.

## 12. Web and Product UI Integration

Feature 205 does not create a separate Task Control page. Existing Feature 198
and 200 surfaces remain the product UI:

- the single `AI Chat & Feedback` launcher can show Runner connection/readiness
  and Task Control inline;
- `/chat` and the Universal Control Plane panel show the same canonical Job and
  Runner projection;
- Settings/`/workers/connect` remains the connection and enrollment entry point
  while it is extended to distinguish Worker App from Runner;
- Task Control shows Runner name, platform, capability readiness, active step,
  selected tool/adapter, recognized tool readiness, disconnect/reconciliation
  state and permitted controls without exposing local paths or secrets;
- no UI action writes local Runner state directly; all commands go through the
  authenticated control plane.

The UI MUST show “Runner unavailable”, “waiting for compatible Runner”,
“waiting for external provider”, “reconciling”, “provider running”,
“verification pending” and “completed” as distinct states. A `worker_jobs` row
alone MUST NOT be presented as proof that a local Runner or provider process is
alive.

## 13. Manual GitHub Build and Release Policy

Feature 205 SHALL add a dedicated workflow, tentatively
`.github/workflows/runner-release.yml`, with `workflow_dispatch` as its only
trigger. It MUST NOT trigger on `push`, `pull_request`, `release`, `schedule`,
dependency updates or automatic version changes. The workflow MAY produce both
native local Runner artifacts and the Cloudflare Container Runner artifact, but
publishing/deploying either requires an explicit manual input.

The manual workflow MUST accept explicit inputs for at least:

- git ref/commit;
- Runner version;
- target platform or `all`;
- target profile: local native, shared Container Runner, or `all`;
- whether to build artifacts only or publish a GitHub release;
- release notes or release identifier;
- signing mode/required secret availability (without printing secrets).

The workflow MUST:

1. verify the selected ref and clean source inputs;
2. build the exact native target matrix;
3. run focused Rust/protocol/security/package tests;
4. produce deterministic artifact names and a machine-readable manifest;
5. generate SHA-256 checksums and signed metadata where configured;
6. fail closed when signing/provenance requirements are missing; in particular,
   `publish=true` MUST require `required-secret` signing;
7. upload artifacts for operator review;
8. publish a GitHub release only when the explicit manual input requests it;
9. produce a Container artifact digest/manifest without exposing registry
   credentials and hand deployment to Feature 204's explicitly invoked path;
10. record platform, architecture/profile, source commit, toolchain and contract
    version;
11. avoid changing Worker App release workflows.

Local development MAY use `cargo run`, focused tests and a foreground Runner;
local development commands MUST NOT imply that a local unsigned build is a
production release.

## 14. SmartAIHub Release Catalog, Dashboard Distribution and Update

GitHub is an internal build/provenance source. SmartAIHub SHALL be the public
release surface for normal users. Feature 205 SHALL maintain a dedicated
Runner release catalog and storage namespace separate from Worker App releases,
Worker runtime packs and the Windows-only speaker-aware runner artifact.

Each published native release MUST register:

- Runner version and channel;
- platform, architecture and profile compatibility;
- user package asset and platform-specific raw update executable;
- byte size, SHA-256, signature/key identity and machine-readable manifest;
- source commit, protocol contract version, toolchain and release notes;
- publish/withdraw state and validation checks.

The server SHALL download and validate release assets before making them
available. It SHALL recompute hashes, verify the manifest/signature policy and
reject incomplete or incompatible release records. Public responses and
download URLs MUST be SmartAIHub same-origin paths; GitHub repository names,
workflow URLs and access tokens MUST NOT be returned to normal users.

The Dashboard SHALL provide one SmartAIHub Runner card, distinct from Worker
App, with platform-aware download, `ตรวจสอบเวอร์ชัน` and `อัปเดต Runner`
actions. It SHALL show the current Runner version from the authenticated
Runner snapshot, the latest compatible catalog version, last-check time and
explicit unavailable/offline/busy/reconciling/verification states. The UI MUST
not show executable absolute paths, credentials, raw provider payloads or
claim that a `worker_jobs` row proves a process is alive.

The local Runner update protocol SHALL use a server-queued command and a
dedicated `runner:update` scope. The Runner MUST:

1. accept only a tenant-authorized compatible release;
2. download the raw platform executable through the authenticated control
   plane URL;
3. verify SHA-256 and required signature before touching the installed binary;
4. refuse or defer the update while an active Job cannot be safely drained;
5. back up the current executable and perform an atomic replacement;
6. restart and report a bounded health confirmation;
7. restore the backup and report rollback when startup confirmation fails.

The update state MUST be idempotent and durable enough to recover after a
process or network restart. Browser code MUST never write local Runner state
directly. Shared Cloudflare Container updates are excluded from this local
self-update path: Feature 204 owns image/deployment rollout and receives the
versioned signed Container manifest through its explicit deployment path.

The release management API MUST include public latest/catalog/download
operations, tenant-scoped Runner summaries and update request/poll/ack
operations, plus admin-only build/sync/publish/withdraw/history operations.
Mutations require idempotency keys and all downloads retain safe content
headers, range handling where supported and no-store behavior for mutable
latest routes.

## 15. Repository Boundaries Established by Implementation

The implementation plan MUST evaluate and then establish this boundary:

```text
apps/runner-app/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── protocol.rs
│   ├── config.rs
│   ├── identity.rs
│   ├── control_channel.rs
│   ├── journal.rs
│   ├── discovery.rs
│   ├── leasing.rs
│   ├── supervisor.rs
│   ├── workspace.rs
│   ├── adapters.rs
│   ├── diagnostics.rs
│   ├── container.rs
│   └── execution.rs
├── tests/                    # focused Cargo tests are colocated for now
└── README.md

packages/runner-protocol/       # only if shared generation is justified
apps/web/server/services/runnerGateway.ts
apps/web/server/routes/runnerControl.ts
apps/web/server/services/runnerAuthService.ts
apps/web/server/routers/runnerNodes.ts
apps/web/drizzle/manual_smartaihub_runner_registry.sql
.github/workflows/runner-release.yml
```

The plan MUST first check whether `apps/web/server/services/runnerContracts.ts`
can be extracted into a neutral versioned protocol package without breaking
existing imports. A compatibility re-export is preferred over a broad rewrite.
The Runner MUST not import the Worker App's media executor or Tauri state.

## 16. Verification and Acceptance

Feature 205 is not complete when the binary merely compiles. Acceptance SHALL
include focused evidence for:

### Contract and security

- protocol version negotiation and malformed envelope rejection;
- known-tool scan, adapter/manifest recognition, version/auth/health probe,
  redacted tool registration and capability snapshot revision/expiry;
- tenant/user/device binding and revocation;
- Runner/Worker audience, token-use, scope, JTI, device-proof and endpoint
  separation, including bootstrap-only use and no credentials in WSS URL
  query parameters;
- stale offer, expired snapshot, expired lease and fencing rejection;
- duplicate/out-of-order command/event behavior;
- path confinement, symlink/traversal rejection and bounded payloads;
- credential/log/event redaction;
- direct MCP upstream bypass rejection;
- no use of retired execution systems.

### Runtime and recovery

- startup/enrollment/heartbeat/capability snapshot;
- capability change and expiry;
- WSS fast path and HTTPS durable fallback;
- disconnect during idle, offer, process execution and terminal reporting;
- bounded journal replay after clean restart and crash recovery;
- unknown state fencing and safe reconciliation;
- process tree cancellation and no orphaned child process where supported;
- artifact/result verification before terminal success.

### Platform and release

- Windows x86_64 build and install/start/stop proof;
- macOS Intel build and native launch proof;
- macOS arm64 (Apple Silicon) build and native launch proof;
- Linux x86_64 build and foreground/systemd proof;
- Shared Container Runner proof with two isolated tenants, concurrent Job lease,
  container restart and no cross-Job workspace/context/credential leakage;
- checksums/manifest/signature verification;
- manual workflow dispatch proof;
- explicit proof that Container publishing/deployment is not triggered by
  push/PR and remains an operator-dispatched Feature 204 action;
- negative proof that push/PR does not invoke the Runner release workflow;
- explicit proof that Worker App workflows/artifacts remain unchanged.

### Product integration

- Task Control distinguishes Worker from Runner;
- the single Feedback/Chat surface can reach Runner connection and active task
  state without opening a separate Chat URL;
- no raw local path, token, provider payload or unverified result is displayed;
- same Job/Runner state is visible from the inline panel and `/chat`.

### Release distribution and update

- manual workflow produces package, raw update binary, manifest, checksum and
  signature metadata for all four native targets;
- explicit publish creates a GitHub Release while artifact-only mode does not;
- server-side sync validates and stores the release without exposing GitHub to
  normal Dashboard users;
- Dashboard latest/download/version-check actions select the correct platform
  and architecture and distinguish Runner from Worker App;
- update requests enforce tenant ownership, Runner auth scope, idempotency,
  drain safety, hash/signature verification, restart confirmation and rollback;
- offline, busy, revoked, incompatible and withdrawn releases produce explicit
  safe states rather than invented progress;
- shared Container versioning is handed to Feature 204 and never performed by
  a local Runner self-update.

## 17. Migration and Rollback

The first rollout MUST be opt-in behind a Runner capability/feature gate. A
Runner that is unavailable, revoked, incompatible or disconnected MUST leave
canonical Job admission intact and allow an approved Worker, Cloudflare
Container or other eligible execution target to be selected when policy allows.

Rollback MUST be possible by disabling Runner eligibility and revoking Runner
credentials without deleting canonical Jobs, events, artifacts or Worker App
configuration. Any additive registry/schema migration requires selected
database verification, rollback SQL or an equivalent reversible path and an
explicit data-retention decision.

## 18. Definition of Done

Feature 205 is complete only when:

1. standalone local Runner artifacts exist for all four initial native platform
   targets, and a compatible Shared Container Runner artifact is available;
2. Runner and Worker App can be installed and run independently on the same
   user device without shared process/config/token collisions;
3. local Runner enrollment/discovery/control and Shared Container Runner
   pool/lease/execution paths are proven against the canonical control plane,
   including the Runner/Worker authentication boundary;
4. the known tool catalog can be scanned and registered as one redacted
   Runner snapshot, and at least one approved local Agent/CLI adapter executes
   a real authorized Job on each supported platform, or the platform is
   explicitly marked unavailable by capability evidence;
5. Task Control displays the real Runner state without inventing progress;
6. manual GitHub native/Container build and release succeeds only by explicit
   operator dispatch, with deployment still gated by Feature 204;
7. SmartAIHub Dashboard can discover/download the correct Runner release and a
   connected local Runner can complete a verified update or explicit rollback;
8. no retired path, duplicate ledger, direct MCP bypass or Worker regression is
   introduced; and
9. the focused cross-spec, security, Rust and platform evidence is recorded in
   the implementation completion/review documents.

**End of Spec 205**
