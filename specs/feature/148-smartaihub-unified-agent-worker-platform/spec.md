# Feature 148: SmartAIHub Unified Agent and Worker Platform Architecture

**Status:** SPEC READY FOR REVIEW — additive architecture; implementation not started by this spec
**Version:** 1.1.0
**Created:** 2026-08-17
**Priority:** P1 — long-term platform foundation for MCP, Agents, Local Runtime, and distributed media execution
**Owner:** SmartAIHub Platform / MCP / Worker Fabric / Agent Runtime
**Depends-on:** Feature 145, Feature 146, Feature 147, Feature 077, existing Worker Control Plane, existing Remotion contracts, existing Library/Media ACL services
**Related:** Feature 081, Feature 093, Feature 094, Feature 124, Feature 135, Feature 144

This is a new architecture spec. It does not replace, rewrite, or silently
change Features 145–147 or the current Worker App. Those features remain the
compatibility baseline and are referenced by this document.

## 1. Executive decision

SmartAIHub should evolve from separate MCP, Hermes, Remotion, and Worker App
flows into one governed **Agent and Worker Platform** with shared contracts for:

- capability discovery;
- permission and workspace boundaries;
- safe local process execution;
- worker selection and job routing;
- context and skill discovery;
- audit, checkpoint, and recovery;
- Windows and macOS runtime parity;
- MCP client compatibility.

The implementation must be additive and phased. Existing web generation,
legacy MCP, OAuth, API-key fallback, Worker App, Hermes media jobs, and
Remotion Executor paths continue to work while each new capability is behind an
independent rollout gate.

The central architectural rule is:

```text
User / Hermes / Claude / Codex
          |
          v
Canonical SmartAIHub MCP + Web API
          |
          +--> Capability and permission policy
          |
          +--> Agent/context/skill orchestration
          |
          +--> Job scheduler and worker admission
          |
          +--> Windows Worker / macOS Worker / Linux Worker / Cloud Worker
                         |
                         +--> Remotion / FFmpeg / ComfyUI / Local AI
                         |
                         +--> Server-owned artifact upload, audit, billing
```

The server remains the authority for identity, tenant ACL, job state, billing,
artifact publication, and audit. Local runtimes execute only explicitly
admitted, typed, workspace-scoped operations.

## 2. Research input and adaptation decisions

The attached Architecture Enhancement Proposal was used as an input, not as an
implementation specification. The following ideas are adopted:

| Proposal idea               | Feature 148 decision                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Local Agent Gateway         | Adopt as a governed Worker Runtime capability layer, not as unrestricted computer control.                               |
| Worker Capability Discovery | Adopt as a versioned, signed/validated capability manifest used by scheduler and MCP discovery.                          |
| Intelligent Job Router      | Adopt after capability and permission contracts are stable; preserve current queue/claim semantics.                      |
| Permission Engine           | Adopt with deny-by-default operation classes and explicit user/tenant policies.                                          |
| Workspace Guard             | Adopt as mandatory for all local file operations; no arbitrary drive access.                                             |
| Process Manager             | Adopt as an allowlisted typed process runner; no arbitrary shell or arbitrary PID kill.                                  |
| MCP Capability Discovery    | Adopt through existing `server/discover`, `tools/list`, and capability projections; do not create a second MCP endpoint. |
| MCP-to-MCP Gateway          | Adopt only as an allowlisted, tenant-scoped connector registry; never proxy arbitrary URLs or caller-supplied headers.   |
| Skills Discovery            | Adopt through versioned skill manifests and ACL-checked selective loading.                                               |
| Context Economy             | Adopt as a versioned context ledger/resolver with bounded diffs and provenance.                                          |
| Project/Series Snapshot     | Adopt as a metadata-first, owner-scoped snapshot surface.                                                                |
| Parallel Workflow           | Adopt through existing job orchestration and bounded fan-out; no unbounded child-job creation.                           |
| Audit Log                   | Adopt by extending existing audit/telemetry surfaces; avoid a duplicate audit authority.                                 |
| Checkpoint/Rollback         | Adopt for supported drafts, plans, and workflow outputs with immutable version references.                               |
| Cloud Fallback              | Adopt as an explicit policy and credit reservation decision, never silent fallback.                                      |

The following proposal items are deliberately rejected in this feature:

- arbitrary PowerShell, CMD, Python, or Node execution from MCP;
- reading or writing an entire drive;
- arbitrary process termination such as `killPID(any_pid)`;
- generic mouse/keyboard/computer control;
- exposing `.env`, SSH keys, browser profiles, Windows credentials, or system folders;
- forwarding arbitrary external MCP servers without registration, policy, and audit;
- splitting production renders across workers before artifact identity,
  idempotency, and reconciliation are proven.

## 3. Codebase compatibility audit

The repository already contains substantial foundations. This spec must extend
those seams instead of introducing parallel contracts.

| Existing seam                   | Evidence in current codebase                                                                                                                                                                                                                                                                                | Compatibility requirement                                                                                                                                                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP transport                   | `apps/web/server/_core/mcpPublicServer.ts`, `mcpV2Protocol.ts`, `mcpRoutes.ts`                                                                                                                                                                                                                              | Keep `/v1/mcp` canonical. Preserve modern and legacy protocol handling, `server/discover`, `tools/list`, `tools/call`, `resources/list`, and `resources/read`.                                                                                                                                        |
| MCP registry                    | `apps/web/server/_core/mcpRegistry.ts`                                                                                                                                                                                                                                                                      | All new tools must be registered here with typed schemas, scope checks, idempotency policy, result limits, and audit metadata.                                                                                                                                                                        |
| OAuth/onboarding                | `mcpOAuthMetadata.ts`, `mcpOAuthServer.ts`, `ConnectedDevicesPanel`, Feature 147                                                                                                                                                                                                                            | OAuth remains the preferred browser path for Hermes, Claude, and Codex. Headless API-key fallback remains dedicated and user-owned.                                                                                                                                                                   |
| Hermes guide/manual             | `apps/worker-app/HERMES-GUIDE.md`, MCP resources/docs projection                                                                                                                                                                                                                                            | Treat the guide as versioned compatibility documentation, not a separate protocol. It must distinguish supported MCP methods from the separate Agent Session/Task Relay and must never advertise disabled `tasks`/`subscriptions` as available.                                                       |
| API-key fallback                | `apiKeyService.ts`, `apiKeys.ts`, `UserAPIKeysPanel.tsx`, MCP CLI purpose/quota contract                                                                                                                                                                                                                    | Do not create another key table or authentication path. Preserve one-time reveal, HMAC storage, scopes, revocation, and credit windows.                                                                                                                                                               |
| Worker runtime taxonomy         | `apps/web/shared/workerRuntime.ts`                                                                                                                                                                                                                                                                          | Extend versioned runtime/capability schemas rather than adding stringly-typed capability fields in individual routers.                                                                                                                                                                                |
| Worker control plane            | `workerRuntime.ts`, `workerRegistryService.ts`, `workerSchedulerService.ts`, `routes/workerRuntime.ts`                                                                                                                                                                                                      | Reuse register, heartbeat, claim, progress, artifact init/complete, lease, and reconciliation semantics.                                                                                                                                                                                              |
| Existing Hermes agent gateway   | `queueHermesWorkerJob`, `external_agent_task`, `hermesAgentRuntime`, `runEngine.ts` external-connector dispatch, and Hermes worker control-plane client                                                                                                                                                     | Treat this as the existing parent-task/dispatch lane. Extend its typed input, correlation, status projection, and relay transport where needed; do not create a second Hermes queue or silently merge it with the separate Hermes media namespace.                                                    |
| Remotion Executor               | Feature 145, `apps/remotion-executor`, `packages/remotion-render`, `apps/worker-app/runtime-sidecar-remotion`                                                                                                                                                                                               | Keep the same `remotion_render_video` payload, contract version, renderer policy, artifact protocol, and completion verification.                                                                                                                                                                     |
| Worker App                      | `apps/worker-app/src`, `src-tauri`, runtime update/doctor/connect flows                                                                                                                                                                                                                                     | Keep Windows Worker App as a supported executor. New platform/runtime abstractions must not make existing claims invalid.                                                                                                                                                                             |
| Runtime readiness/provisioning  | Worker App doctor/setup/update flows in `apps/worker-app/src/main.tsx` and platform code under `src-tauri`                                                                                                                                                                                                  | Extend the existing doctor/install/update UX with signed dependency profiles, claim-time readiness, repair/rollback, and actionable manual prerequisite instructions; do not replace it with undocumented shell commands.                                                                             |
| Runtime-pack serving            | `apps/web/server/routes/workerRuntime.ts`, `apps/worker-app/src-tauri/src/runtime_manifest.rs`, runtime-pack release scripts                                                                                                                                                                                | Reuse the existing signed/hash-checked runtime-pack manifest/download flow. Extend its schema rather than creating a second package catalog, and distinguish Hermes pack, Remotion pack, ComfyUI pack, and OS/vendor prerequisites explicitly.                                                        |
| macOS path                      | `apps/worker-app/MAC_BUILD.md`, runtime-pack/release workflows                                                                                                                                                                                                                                              | Treat macOS native packaging and runtime evidence as separate release gates. End users must not require Xcode to run a managed Node/Remotion executor.                                                                                                                                                |
| Device trust                    | `connected_devices`, worker access keys, device auth and pairing services                                                                                                                                                                                                                                   | Keep device/user/tenant binding and revocation separate from MCP session tokens and worker execution tokens.                                                                                                                                                                                          |
| Artifact publication            | worker artifact init/complete, storage authorization, MCP download broker                                                                                                                                                                                                                                   | All image/video/file outputs must use server-owned storage references, checksum/MIME/size verification, publication, history, and ACL-checked download.                                                                                                                                               |
| MCP media task persistence      | `mcp_media_tasks`, `mcpMediaAdapter.ts`, MCP media status/list/download tools                                                                                                                                                                                                                               | Reuse this authority for provider/media task status and results. Do not create a second media task table for ComfyUI/Hermes generation; link local worker jobs and Agent Tasks to it only when the existing media-task contract is the owning flow.                                                   |
| Existing local AI contracts     | `workerRuntime.ts` local AI and Comfy/job contract schemas                                                                                                                                                                                                                                                  | Extend typed local job families only after capability, workspace, process, and safety policies are available.                                                                                                                                                                                         |
| Hermes media namespace          | `hermes_media_*` job types, `hermesMediaAdapter.ts`, `hermesConnectionService.ts`, and `hermesMedia` feature flag                                                                                                                                                                                           | Keep provider-account image/video generation and its shared Hermes media worker contract separate from the agent gateway. Local ComfyUI/Remotion work uses typed local worker jobs; an Agent Task may reference either path but must not duplicate billing, result, or connection state.              |
| Existing ComfyUI contracts      | `apps/web/shared/workerRuntime.ts` defines `comfy_image_generation`, `comfy_workflow_run`, Comfy stages/failure codes, service binding, and artifact event payloads; `workerSchedulerService.ts` already queues both typed job families; `workflowWorkerRuntimeService.ts` admits them for desktop dispatch | Preserve these schemas, scheduler, and failure taxonomy. Add the missing concrete Worker App/standalone execution adapter, Comfy service discovery, workflow submission/polling, output validation, and end-to-end upload/publication proof. Do not create a second Comfy queue or artifact protocol. |
| Existing Vertical Drama context | `verticalDramaSeries`, draft ledger, memory/QC contracts                                                                                                                                                                                                                                                    | Context resolver must consume existing canonical projections and never create a second story authority.                                                                                                                                                                                               |

### 3.1 Current implementation truth and non-claims

The current codebase already has meaningful runtime foundations: signed/hash
checked runtime manifests, Windows runtime-pack download/install/update paths,
managed WSL2 setup/doctor checks, Hermes runtime-pack IDs, Worker connect and
claim flow, and ComfyUI enqueue-time contracts. These are compatibility seams,
not proof that every capability is production-ready.

The following must remain explicit until the corresponding implementation and
machine evidence exist:

- the current runtime-pack catalog distinguishes Windows/WSL2 and Hermes
  Apple-Silicon packs; a generic “Windows and Mac full runtime” label is not
  sufficient;
- the current macOS build documentation describes a source/native build path
  and states that a complete Remotion render sidecar is still separate work;
- the current Worker App doctor/runtime setup primarily proves the installed
  runtime pack and its declared checks, not every ComfyUI model, custom node,
  GPU driver/backend, video profile, or future Local AI dependency;
- the current Hermes guide records that MCP tasks/subscriptions/list-change
  notifications are not generally enabled. The new relay must not claim those
  MCP features are available; it uses a separate authenticated agent session
  with polling fallback until the relevant MCP capabilities are actually
  enabled and verified;
- the current guide's broad macOS wording must not be copied into capability
  claims: Hermes runtime availability is Apple Silicon-only in the current
  catalog, while the standalone Remotion executor has separate conditional
  arm64/x64 pack IDs. The guide/UI must distinguish those products;
- an MCP client connection is client-to-server. It cannot by itself push a new
  conversational task into a local Hermes process. SmartAIHub-to-Hermes delivery
  therefore requires an outbound Hermes Agent Session/Task Relay, while MCP
  remains the tool/discovery channel.
- the codebase already has a Hermes agent-gateway lane: `external_agent_task`
  is admitted by `queueHermesWorkerJob`, guarded by `hermesAgentRuntime`, and
  used by external-connector dispatch in `runEngine.ts`. The new relay must
  project or extend this lane rather than create a parallel queue. It must also
  keep the separate `hermes_media_*` provider-generation namespace distinct.
- `external_agent_task` is an orchestration/parent task, not a license to put
  raw ComfyUI, Remotion, FFmpeg, shell, or provider instructions into a job.
  Any child operation must be created through the existing typed scheduler and
  remain a normal `worker_jobs` record with its own capability admission,
  lease, credit/idempotency, artifact, and audit lineage.

Any UI, guide, `tools/list`, or capability manifest that describes a feature
must derive its availability from the same runtime/capability evidence. It must
not show “ready” because a package is downloadable when the required post-
install health checks or platform artifact are missing.

### 3.2 ComfyUI implementation-gap statement

The current codebase is not starting from zero: the typed enqueue contracts,
tenant/credit/idempotency checks, desktop dispatch admission, Comfy progress and
failure taxonomies, and worker artifact init/complete endpoints already exist.
The remaining production-critical gap is the local execution half. The current
Worker App/Hermes worker search does not yet provide a complete ComfyUI adapter
that discovers a registered service, submits a workflow, polls the ComfyUI
history, interrupts a running prompt, collects image/video outputs, validates
them, and drives the artifact upload/publication sequence.

Therefore this spec treats the adapter and its real-machine acceptance lane as a
hard implementation gate. Deep-implement must extend the existing worker claim
loop and `apps/web/server/hermesWorker/controlPlaneClient.ts` artifact protocol;
it must not solve the gap by adding a second queue, direct browser-to-ComfyUI
connection, or a separate upload/storage authority.

### 3.3 Non-regression rules

1. Feature flags default to off for new behavior.
2. An old Worker App can continue to register and claim jobs supported by its
   reported contract version.
3. A worker that does not report the new capability manifest receives a reduced
   eligibility profile, not an automatic rejection, unless the job explicitly
   requires a capability it cannot prove.
4. Existing MCP aliases remain available until telemetry proves safe removal.
5. Existing API-key, OAuth, pairing, and Worker App revocation controls remain
   valid and are not silently migrated to a new token lineage.
6. No migration may reinterpret old `metadata`, `runtimeType`, job payload, or
   storage references in a way that changes ownership or billing.

## 4. Goals

### G1 — One capability vocabulary

Represent worker, local runtime, MCP, and agent capabilities through a shared
versioned vocabulary with platform requirements, permission requirements,
health/readiness, provenance, and expiration.

### G2 — Safe local execution

Allow approved local operations such as Remotion, FFmpeg, ComfyUI, Ollama, and
future local adapters without exposing arbitrary shell, unrestricted paths, or
cross-user process control.

### G3 — MCP client parity

Hermes, Claude, Codex, and compatible MCP clients must discover the same
principal-scoped capability catalog and receive truthful explanations when a
tool is unavailable because of tenant policy, scopes, device state, worker
readiness, or platform constraints.

### G4 — Intelligent but explainable routing

Select a compatible local, remote, or cloud execution target using explicit
capability, policy, cost, queue, reliability, and user-preference inputs. The
selected target and fallback decision must be inspectable and auditable.

### G5 — Context and skill efficiency

Let agents load only the skills and project context needed for the current
operation, using versioned references and bounded diffs rather than sending an
entire project or Story Bible on every call.

### G6 — Recovery and supportability

Provide snapshots, audit events, checkpoints, process logs, job lineage, and
reconciliation data sufficient to answer why a job failed and what safe next
actions are available.

### G7 — Windows/macOS operational parity

Use one server protocol and one artifact contract on Windows 11 and macOS while
allowing platform adapters for DPAPI/Keychain, process startup, paths, signals,
GPU probing, and runtime packaging.

### G8 — Runtime completeness and guided recovery

Ensure a Worker can prove readiness before accepting work. Pack and manage what
can be safely managed, explain and guide the user through everything else, and
make install, repair, verification, rollback, and claim blocking observable.

### G9 — Chat-first agent orchestration

Let a user issue a task from SmartAIHub and receive a Hermes response or media
result in the same conversation, with explicit target selection, progress,
confirmation, offline/reconnect, and recovery states. Hermes must match Worker
App capabilities while gaining safe planning and extension abilities.

## 5. Non-goals and hard boundaries

- Replace Features 145, 146, or 147.
- Replace the current Worker App with a second desktop product.
- Require Xcode to be installed by end users on macOS.
- Run Chromium, FFmpeg, ComfyUI, or local-model processes inside `smartspec-web`.
- Allow an MCP caller to submit raw executable paths, shell text, arbitrary
  environment variables, arbitrary storage keys, or arbitrary callback URLs.
- Treat a capability claim from a client as proof without server admission,
  runtime identity, and health evidence.
- Make cloud fallback automatic when policy or credit approval is absent.
- Introduce Redis as the durable source of jobs, artifacts, credentials, or
  audit history. Redis remains ephemeral enforcement/cache state only.

## 6. Target architecture

### 6.1 Planes and trust boundaries

| Plane                 | Responsibility                                                           | Must not do                                   |
| --------------------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| Web/API control plane | identity, tenant ACL, billing, jobs, policy, publication, audit          | run local render/processes                    |
| MCP/Agent plane       | discovery, typed intent, status, manual guidance, bounded orchestration  | bypass ACL or execute shell                   |
| Scheduler plane       | capability matching, admission, queue, retry, fallback                   | trust stale/unverified capability claims      |
| Worker runtime plane  | execute admitted typed jobs, report progress, upload artifacts           | choose a different job or storage destination |
| Local adapter plane   | Remotion, FFmpeg, ComfyUI, Ollama, future providers                      | expose raw process/file APIs to agents        |
| Storage/media plane   | signed references, checksums, MIME/size/probe, publication, download ACL | expose permanent R2 keys as authority         |

### 6.2 Canonical flow

```text
MCP initialize/discover/tools/list
        |
        v
Principal-scoped capability catalog
        |
        v
Typed tool call + idempotency key
        |
        v
Server ACL + permission + credit + job validation
        |
        v
Scheduler capability match and admission
        |
        v
Worker lease -> typed process plan -> progress
        |
        v
Artifact init -> upload -> checksum/probe verification
        |
        v
Publish -> media history/library -> audit -> MCP result reference
```

## 7. Unified capability contract

### 7.1 Capability manifest

Add a shared schema, preferably adjacent to `workerRuntime.ts`, with:

```ts
type CapabilityManifest = {
  schemaVersion: string;
  runtimeType: WorkerRuntimeType;
  runtimeVersion: string;
  platform: "windows" | "macos" | "linux";
  architecture: "x64" | "arm64" | "universal" | "unknown";
  source: "existing_install" | "managed_pack" | "container" | "remote_service";
  capabilities: Array<{
    id: string;
    version: string;
    family: string;
    operations: string[];
    permissionClass: "read" | "write" | "execute" | "dangerous";
    requirements: Record<string, unknown>;
    health: "unknown" | "ready" | "degraded" | "blocked" | "unavailable";
    expiresAt: string | null;
  }>;
  resources: {
    cpu: number | null;
    memoryBytes: number | null;
    gpu: Array<{
      model: string;
      vramBytes: number | null;
      driver: string | null;
    }>;
    freeDiskBytes: number | null;
  };
  provenance: {
    manifestHash: string;
    detectedAt: string;
    signatureKeyId: string | null;
  };
};
```

The exact schema must be implemented as Zod/shared types and versioned. The
manifest is evidence for admission, not a permission grant. Sensitive local
details such as usernames, full paths, tokens, installed browser profiles, and
environment variables must never be included.

### 7.2 Capability families

Initial families are:

- `remotion.render`;
- `media.ffmpeg`;
- `media.ffprobe`;
- `comfyui.service`;
- `local_ai.ollama`;
- `local_ai.lm_studio`;
- `workspace.files`;
- `worker.diagnostics`;
- `mcp.connector`;
- `skills.runtime`.

Each family must define supported operations, input/output schemas, required
permissions, resource requirements, failure codes, and test fixtures. Adding a
new capability must not implicitly expose it through MCP until its server-side
policy and catalog entry exist.

### 7.3 Discovery projection

The same server-owned capability facts must be projected to:

- MCP `server/discover`;
- MCP `tools/list` annotations and schemas;
- a capability-list/describe MCP family;
- Worker UI status and diagnostics;
- scheduler admission explanations;
- REST/admin observability where permitted.

`tools/list` remains principal-scoped. Capability discovery may be paginated or
family-filtered to avoid tool overload, but it must never hide a denied
capability as if it did not exist when the user needs an actionable reason.

## 8. Permission, workspace, and process security

### 8.1 Operation classes

| Class       | Examples                                                                               | Default                         |
| ----------- | -------------------------------------------------------------------------------------- | ------------------------------- |
| `read`      | GPU status, render status, model list, project snapshot                                | allow within scope              |
| `write`     | save workflow, write generated output, update a project draft                          | policy-controlled               |
| `execute`   | start Remotion, run an allowlisted FFmpeg operation, execute registered Comfy workflow | explicit capability + policy    |
| `dangerous` | delete project/model/source, shutdown worker, change roots, kill a managed process     | explicit confirmation and audit |

Permission profiles:

- `safe`: read plus server-approved generated outputs;
- `balanced`: safe plus approved execute operations;
- `advanced`: broader registered operations with explicit confirmation;
- `custom`: tenant/user policy-defined allowlist.

The default profile for a new device and a new MCP connection is `safe`.

The following operations require an explicit approval policy in addition to
scope authorization:

| Operation                                 | Default behavior                              | Required confirmation                                             |
| ----------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| inspect/readiness/logs                    | allow within the user's device scope          | none unless logs may contain sensitive content                    |
| install/repair a signed managed component | allow only when the user initiated the action | confirm before first install, admin/reboot, or license acceptance |
| start/stop/drain a worker                 | allow for the device owner with audit         | confirm for stop/drain when active jobs exist                     |
| generate/render/upload media              | validate scope, quota, credit, and capability | confirm when the operation is billable or writes durable media    |
| download/read local or library files      | ACL and workspace policy                      | confirm for bulk/large downloads or sensitive classes             |
| delete/revoke/offboard                    | deny by default in agent plans                | explicit confirmation and step-up auth                            |

An agent may prepare a plan and request approval, but may not treat a natural
language acknowledgement from an unrelated message as approval. Approval is a
server-issued, short-lived record bound to task id, operation hash, target
device, scope set, and user session. Any change to those fields invalidates the
approval.

### 8.2 Workspace guard

All local file access must pass a server-issued workspace policy and local
runtime validation:

- canonicalize paths before authorization;
- reject traversal, junction/symlink escapes, alternate data streams, UNC
  paths outside the policy, and case-folding bypasses;
- allow only approved roots, job staging directories, and app-data temp areas;
- deny `.env`, SSH keys, browser profiles, credential stores, system folders,
  OS configuration, and unrelated user folders by default;
- never return raw local paths to MCP unless the path is a user-approved display
  label; return opaque workspace/file references instead;
- use `workspace_scoped` as the only supported agent mode in the first release;
  `team_drive` and `full_machine` remain future/admin-gated modes.

### 8.3 Typed Process Manager

The local runtime must expose a process manager with typed operations:

- `startRegisteredProcess(jobId, capabilityId, inputRef)`;
- `getProcessStatus(processRef)`;
- `getProcessLogs(processRef, cursor)`;
- `stopManagedProcess(processRef, reason)`;
- `cleanupJobProcesses(jobId)`.

Every process record includes an opaque process reference, job ID, runtime
identity, capability ID/version, approved executable identity, normalized
arguments hash, start/finish times, timeout, exit code, resource summary, and
log reference. The agent cannot submit an executable path or shell string.

Process control is limited to processes created by the same runtime identity and
job lineage. Graceful stop is attempted first; force termination is bounded,
audited, and never accepts an arbitrary PID from an MCP caller.

The process foundation must also expose a managed readiness/provisioning
boundary. It may inspect, install, repair, update, and verify only dependencies
declared by a signed runtime profile; it must not become a general package
manager or arbitrary shell bridge. Its typed operations include:

```text
inspectRuntimeProfile(profileId)
installManagedComponent(componentId)
repairManagedComponent(componentId)
verifyRuntimeReadiness(profileId)
```

Install and repair actions are device-scoped, user-visible, auditable, and
reversible where practical. A component that is not in the profile cannot be
installed through an MCP/agent request.

### 8.4 Agent relay security and prompt boundaries

SmartAIHub must treat user prompts, imported files, project text, ComfyUI
workflow metadata, and third-party MCP results as untrusted data. They may
describe an operation but cannot grant permission, change the target device,
alter the runtime profile, reveal secrets, or rewrite the task's approval.

Before delivery to Hermes, the server normalizes the task into a typed plan and
separates instruction, data, and authorization fields. Hermes receives only the
scoped input references and context needed for the plan. The server revalidates
every child operation at execution time; a plan generated by Hermes is not an
authorization token.

The relay must enforce:

- device-bound session and tenant/user binding on every message;
- nonce/cursor/idempotency protection against replay and duplicate completion;
- maximum task size, context size, event rate, log size, and result size;
- redaction of secrets and sensitive prompt/file content in telemetry;
- no credential, cookie, private URL, local path, raw storage key, or arbitrary
  header in task/result payloads;
- explicit separation between read, write, execute, install, download, and
  destructive actions;
- step-up authentication for revoke, delete, bulk download, admin prerequisite,
  or policy changes;
- immediate server-side denial after device/session revoke, even if the local
  agent still has a queued command;
- safe handling of malicious or malformed workflow files and prompt-injection
  text without silently escalating the operation.

### 8.5 Data locality and privacy consent

Before a task leaves the web/API boundary, the server records and, where
material, shows the user:

- which prompt/context/input files will be sent to the selected Hermes/device;
- which tenant-owned storage references will be downloaded locally;
- whether an external provider, cloud fallback, or third-party MCP connector
  receives any content;
- the storage region/retention class and whether the output becomes Media
  History/Library content;
- the redaction policy for logs, previews, diagnostics, and Hermes replies.

The default is tenant-owned server storage plus the approved local workspace;
external egress and cloud fallback require policy and consent. TLS protects all
transport, device storage uses the platform secure store, temporary workspaces
are encrypted where the OS/runtime supports it, and cleanup removes decrypted
inputs according to the job retention policy. A user may cancel before transfer
or choose a different target when the data-locality policy does not match.

## 9. MCP and agent contract

### 9.1 Canonical endpoint and authentication

- Canonical endpoint remains `https://smartaihub.app/v1/mcp`.
- OAuth/PKCE is the preferred path for browser-capable Hermes, Claude, and
  Codex clients.
- Dedicated MCP CLI API keys remain the browserless fallback and are created
  only in the user-owned API Keys UI.
- Worker execution tokens, MCP access tokens, API keys, and provider tokens are
  separate lineages and must not be exchanged or copied between clients.
- All calls are re-authorized against tenant, user, device, scopes, feature
  flags, object ownership, job state, and current capability policy.

#### 9.1.1 Browser-capable and browserless onboarding

The Settings UI is the authority for connection setup. It must provide one
client-neutral **Connect MCP** action and client-specific copyable instructions
generated from the selected client/transport/version. The generated flow must
prefer OAuth/PKCE and open the SmartAIHub authorization page in a browser; the
user approves the displayed tenant, origin, scopes, quota, and expiry, then the
client stores the resulting credential in its own secure store.

For a machine without a browser, the onboarding contract is:

1. If the selected CLI supports OAuth device authorization, the CLI requests a
   short-lived device code, shows a verification URL and one-time code, and
   polls only the matching authorization transaction. The user may approve it
   in a browser on another device. Codes are single-use, rate-limited, bound to
   the client/device transaction, and expire quickly.
2. If the client does not support device authorization, the user creates a
   dedicated **MCP CLI key** in SmartAIHub Settings/API Keys, choosing name,
   client purpose, scopes, quota windows, and expiry. The secret is revealed
   once, then entered through the client-supported secure prompt/keychain or
   environment mechanism. Documentation must never suggest using a Worker
   token, provider key, refresh token, or an unrelated API key.
3. Both paths create the same Connected Device/connection record and expose
   the same tenant, origin, scopes, last-used time, expiry, quota, and Revoke
   controls. Revocation must deny the next request even if the client is still
   holding a cached credential.

The server must not require users to edit `.env` on the production server.
CLI examples may show an environment variable only as a client-local secret
injection option, and must also document the OS keychain/config alternative.
No command or generated config may print the secret after the one-time reveal.

### 9.2 Capability and manual-use tools

The following are target families, not permission bypasses:

```text
smartspec.capabilities.list
smartspec.capabilities.describe
smartspec.worker.status
smartspec.worker.capabilities
smartspec.worker.diagnostics
smartspec.workspace.list
smartspec.workspace.describe
smartspec.process.status
smartspec.process.logs
smartspec.skills.list
smartspec.skills.search
smartspec.skills.describe
smartspec.project.snapshot
smartspec.series.snapshot
smartspec.render.snapshot
```

Existing canonical tools must be reused when they already provide the same
operation. New aliases must resolve to one server handler and must expose a
truthful `requires`, `blockedReason`, `nextAction`, and `availability` result.

### 9.3 MCP-to-MCP gateway boundary

The gateway is an optional, later wave. It must support only:

- tenant/admin-registered connector records;
- allowlisted HTTPS origins and MCP transport modes;
- per-connector scopes, timeout, result size, rate, and credit policy;
- outbound SSRF protection, DNS/IP validation, redirect policy, and secret
  isolation;
- tool name namespace isolation and audit correlation;
- connector health, disable, rotate, and revoke controls.

It must not accept a URL, bearer token, arbitrary header, or stdio command from
an MCP tool call. A disabled/unknown connector fails closed.

### 9.4 Resources and files

MCP resources remain suitable for documentation and safe static manifests.
Library, R2, and Media History files remain ACL-checked tools that return
short-lived download references. No raw storage key, permanent signed URL,
local path, or credential is exposed as authority.

### 9.5 Cross-client functional parity

Hermes One, Hermes CLI/Agent, Claude, Claude Code, Codex, and compatible MCP
clients use the same server contract. The UI/configuration differs by client,
but the server must expose the same authorized functional groups:

- image generation and image result publication;
- video generation and video result publication;
- Remotion job submit, status, progress, cancel, and final download;
- Media History list/get/download;
- Library search/read/download for every authorized registered file type;
- worker status, capability, readiness, and actionable diagnostics;
- skills/project/series/render snapshots where the principal is authorized;
- manual documentation through `resources/list` and `resources/read`;
- OAuth, dedicated headless key fallback, device visibility, expiry, and revoke.

When a client or runtime cannot support a function, the result must identify the
unsupported layer (`client`, `transport`, `scope`, `tenant policy`, `worker
capability`, or `runtime readiness`) and provide the supported next action. A
client-specific adapter may change command syntax or login UX, but it must not
create a separate business rule, billing path, storage path, or permission
decision.

#### 9.5.1 Client onboarding matrix and generated instructions

The server manual and Settings UI must render a client-specific onboarding
card from one versioned connection descriptor. Static prose copied from an old
Hermes guide is not sufficient. The descriptor records endpoint, transport,
authentication options, supported OAuth/device flow, minimum client version,
required scopes, callback/redirect rules, and the exact verification action.

| Client             | Browser-capable path                                                                                    | No-browser path                                                                                    | Verification                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Hermes One         | Click **Connect**, open SmartAIHub OAuth approval, then return to the app                               | Create a dedicated MCP/agent key in SmartAIHub UI or use device authorization from another browser | `initialize` + `tools/list` + a read-only capability/status call         |
| Hermes CLI/Agent   | CLI starts OAuth/device flow and opens or prints the approval URL                                       | Dedicated UI-created MCP CLI key stored in the CLI secure store/config mechanism                   | CLI test command generated for the installed client version              |
| Claude/Claude Code | Add remote MCP from the generated endpoint and complete browser OAuth when supported                    | UI-created scoped key through the client-supported secret input; never a Worker token              | `initialize` + `tools/list` and a safe read-only call                    |
| Codex CLI          | Add the remote MCP server using the generated client instructions and approve in browser when supported | UI-created scoped key supplied through the documented Codex credential mechanism                   | `initialize` + `tools/list` and a safe read-only call                    |
| Other MCP client   | Use standards-based OAuth/PKCE discovery if supported                                                   | Use a scoped UI-created API key only when the client cannot complete OAuth                         | `server/discover`, `initialize`, protocol baseline, and a read-only call |

The UI must detect the selected client/version where possible and show only
compatible steps. It must clearly separate **MCP connected** from **Hermes
device connected** and **Remotion/Comfy runtime ready**; an MCP connection alone
does not make a local renderer available. When OAuth is unsupported, the card
must explain the fallback, link directly to API Keys/Connections, show the
requested scopes and expiry before creation, and provide a revoke/check status
path. Verification failures must show the actual failed layer and next action,
not instruct the user to paste another secret.

The initial interoperability baseline is `server/discover`, `initialize`,
`tools/list`, `tools/call`, `resources/list`, `resources/read`, `ping`, and the
existing session/error behavior. MCP `tasks`, `subscriptions`, resource
subscriptions, and `tools/listChanged` remain optional gates. The Hermes relay
must work without them through the Agent Session/Task Relay; when those MCP
features are later enabled, they must map to the same task/event authority and
must not create duplicate task state.

### 9.6 SmartAIHub-to-Hermes agent relay

SmartAIHub must support a server-mediated conversation flow in which the user
starts a task from the SmartAIHub web UI and selects a Hermes Agent/Hermes One
device as the execution target. This is intentionally similar to Telegram's
message-and-reply experience, but the server remains the authority for
identity, permissions, job state, billing, and media publication.

The relay is an adapter/projection over the existing Hermes agent-gateway
control plane wherever that contract is sufficient. The durable execution
authority remains `worker_jobs` and the existing worker event/artifact services;
an additive Agent Task record is permitted only for conversation correlation,
approval, cursor, and user-facing state that those authorities cannot store.
The implementation must extend `queueHermesWorkerJob`/`external_agent_task` or
an equivalent existing service boundary, not add an independent Hermes queue.

The relay is outbound-only from the device perspective. Hermes One maintains an
authenticated reconnectable session to SmartAIHub using the approved agent
session/control protocol; a long-polling fallback is required for environments
where WebSocket/SSE is unavailable. SmartAIHub must never require an inbound
port on the user's machine. The relay carries typed task envelopes, not shell
text or arbitrary tool calls.

The task envelope must contain:

```text
taskId
tenantId / userId
conversationId / messageId
targetDeviceId or capability selector
requestedOperation and schemaVersion
input references and bounded text/context
required scopes/capabilities
credit and quota reservation
approval/confirmation state
idempotency key
reply policy and expiration
```

The server may ask Hermes to plan, execute, inspect readiness, install a
profile component, render, generate media, upload an artifact, or return a
diagnostic. The operation must resolve to one of the registered capability
contracts. Hermes may compose multiple registered operations into a bounded
plan, but it may not invent a new permission, bypass a worker gate, or run
arbitrary local code.

The relay lifecycle is:

```text
user message in SmartAIHub
  -> classify intent and identify target/capability
  -> show plan, required device, estimated credits, and approval needs
  -> create durable task envelope and reserve quota/credits
  -> deliver to Hermes One/Agent over authenticated outbound session
  -> Hermes acknowledges and reports readiness/install blockers
  -> user confirms sensitive or billable actions when required
  -> Hermes executes registered steps and streams progress
  -> worker/artifact services upload and publish outputs
  -> Hermes returns structured answer + media/file references
  -> SmartAIHub posts the result back into the conversation and audit trail
```

The relay must support offline and reconnect behavior. If Hermes is offline,
the UI shows `waiting_for_device` with last-seen time and lets the user cancel,
change target, or keep the task queued according to policy. A reconnect must
resume by `taskId` and idempotency key, not duplicate the operation. Every task
has one terminal outcome: `completed`, `failed`, `canceled`, or `expired`.

#### 9.6.1 Agent Session/Task Relay wire contract

The relay is a separate control protocol from remote MCP, but it is not
necessarily a new network transport. If the existing Hermes worker register,
heartbeat, claim, event, lease, and artifact endpoints can carry the contract,
the first implementation should expose a session/task projection over those
endpoints. A new WebSocket/SSE route is justified only when the existing
control-plane polling cannot meet the required latency or user-visible
progress contract. In either case, WebSocket, SSE plus HTTPS acknowledgements,
and long polling must expose the same messages and semantics:

```text
session.hello       Hermes -> SmartAIHub (protocol range, device, runtime, manifest hash)
session.accepted    SmartAIHub -> Hermes (session id, negotiated version, lease, heartbeat interval)
session.heartbeat   Hermes -> SmartAIHub (health, readiness, active task ids)
task.offer          SmartAIHub -> Hermes (typed task envelope, expiresAt)
task.accepted       Hermes -> SmartAIHub (task id, execution idempotency key)
task.progress       Hermes -> SmartAIHub (state, stage, percent, safe message)
task.awaiting_input Hermes -> SmartAIHub (bounded question/next action)
task.result         Hermes -> SmartAIHub (text/structured/artifact references)
task.failed         Hermes -> SmartAIHub (failure code, retryability, next action)
task.cancel         SmartAIHub -> Hermes (task id, reason, deadline)
session.revoked     SmartAIHub -> Hermes (close and discard credentials)
```

The task state machine is:

```text
draft -> awaiting_approval -> queued -> offered -> accepted -> running
running -> awaiting_input -> accepted
running -> uploading -> publishing -> completed
queued/offered/accepted/running -> cancel_requested -> canceled
any non-terminal state -> failed | expired
```

Handshake negotiation must include protocol version, minimum compatible server
version, runtime contract version, supported transport/features, and manifest
hash. If negotiation fails, the server returns a stable compatibility error and
the UI points to the correct Hermes/Worker update; it must not downgrade to an
unsafe legacy task format silently.

Each transition is authorized, versioned, idempotent, and appended to the
existing audit/event authority. `task.accepted`, `task.result`, and terminal
events must include the last acknowledged event cursor so reconnect can replay
only missing events. An expired session may not accept a new task; a revoked
session may not acknowledge or complete one.

The session credential is a device-bound worker/agent credential, not an MCP
access token, refresh token, API key, or provider key. It is scoped to one
tenant/user/device, has a short lease with rotation, is stored in DPAPI/Keychain
or equivalent protected storage, and can be revoked from Connected Devices.
The server must authenticate the device before accepting `session.hello` and
must re-check tenant, user, device, capability, quota, and task ownership on
every state-changing message.

Session bootstrap supports two user paths:

- browser-capable Hermes One uses OAuth/PKCE or the existing device approval
  flow opened from SmartAIHub;
- browserless Hermes CLI uses a dedicated user-created headless credential from
  the API Keys/Connections UI with an explicit agent/session scope and expiry.

The CLI must not ask the user to type a worker token, MCP refresh token, or
provider key. A key-based bootstrap displays the same device name, origin,
tenant, scopes, expiry, and revoke controls as OAuth, and the key is never
returned again after its one-time reveal.

For transport fallback, the client first attempts the preferred persistent
channel, then switches to HTTPS polling with a cursor and backoff. The server
must not treat a lost channel as a failed task. The UI shows transport state
separately from task state, and a task may continue while the agent is
temporarily disconnected. Poll and push delivery are both at-least-once;
idempotency and cursors provide exactly-once state transitions and publication.

`task.result` uses a typed result envelope rather than an unbounded chat blob:

```text
resultSchemaVersion
summaryText
structuredData (schema id + bounded JSON)
artifacts[] (opaque artifact id, media type, filename, size, checksum, status)
followUpActions[] (registered operation id, required scope, confirmation state)
usage (credits, duration, quota windows)
```

Images, videos, and files are always server-published artifact references. Large
binary data, raw local paths, provider URLs, and access tokens are invalid in a
task result. If a result is produced locally but publication is pending, the
conversation shows `result_pending_publication` and does not present a broken
download link as completed.

The server must not put durable tasks, results, or event history only in Redis.
Redis may accelerate leases, presence, and delivery hints; the durable task,
event cursor, approval, and result records remain in the existing PostgreSQL/
application authorities or an explicitly approved additive table.

#### 9.6.2 Parent task and typed child-job boundary

The parent Hermes task and its child work are deliberately separate:

```text
conversation message
  -> external_agent_task / Agent Task correlation
  -> typed child worker job(s)
       -> remotion_render_video | comfy_* | ffmpeg_* | local_ai_* | provider media flow
  -> worker events and artifact publication
  -> parent task result projection
```

The parent record contains the user intent, target device, plan, approval,
quota/credit aggregate, and child-job references. It does not contain raw
workflow execution instructions, local paths, arbitrary commands, or copied
provider credentials. Each child job is independently validated, authorized,
idempotent, leased, cancellable, and auditable. A child may be retried without
recreating the parent conversation message or charging the parent twice.

The server must define an explicit aggregate policy for mixed plans: whether
child jobs run sequentially or in parallel, the maximum fan-out, how a partial
result is represented, and when the parent is `completed`, `failed`,
`canceled`, or `awaiting_input`. The parent must not report success until all
required child artifacts are server-published. Optional child failures must be
shown separately and may not be hidden in a generic successful text response.

The following existing lanes must remain distinct:

| Request type                             | Owning path                                                                | Required rule                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Hermes conversation/connector follow-up  | `external_agent_task` through the Hermes agent gateway                     | Parent orchestration only; use typed child jobs for side effects               |
| Local ComfyUI image/video                | existing `comfy_image_generation` / `comfy_workflow_run` contracts         | Worker-local execution, one artifact protocol, no direct MCP-to-ComfyUI call   |
| Local Remotion/FFmpeg                    | existing typed render/assembly contracts                                   | Reuse current Remotion/FFmpeg billing, lease, probe, and publication authority |
| Provider-account Hermes media generation | `hermes_media_*` and existing Hermes media connection service              | Do not reinterpret a provider connection as a local Hermes agent session       |
| MCP provider/media task                  | existing `mcp_media_tasks`/`mcpMediaAdapter.ts` authority where applicable | Link to worker/artifact lineage without duplicate result or credit state       |

The relay implementation must first prove which existing conversation, team
run, worker job, notification, and artifact records can carry these fields. A
new route or table is a gap only when the existing authority cannot represent
the required state; a new route/table must include migration, authorization,
retention, and rollback evidence.

### 9.7 Hermes functional parity and safe extension

Hermes One/Agent must be able to perform every user-facing function that the
Worker App exposes for its approved device and capabilities, including:

| Worker App function           | Hermes/Agent equivalent                                        | Required result                                       |
| ----------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| connect/authenticate device   | browser OAuth/PKCE, device approval, or dedicated headless key | device/session identity and expiry                    |
| doctor/readiness              | capability and dependency inspection                           | component-by-component status and next action         |
| install/repair/update runtime | managed install request or guided OS instruction               | progress, logs, verification, rollback state          |
| start/stop/pause/drain queue  | typed control request with confirmation policy                 | updated lifecycle state and audit event               |
| claim/render/generate         | typed job submission and execution                             | job id, progress, retryability, terminal result       |
| ComfyUI image/video           | approved workflow execution                                    | verified image/video artifact references              |
| Remotion/FFmpeg               | registered render/media operation                              | same artifact and publication contract                |
| upload/download               | server-owned artifact protocol and ACL broker                  | checksum, publication, short-lived download reference |
| logs/diagnostics              | redacted paginated diagnostic tools                            | actionable evidence without secrets or raw paths      |
| revoke/offboard               | device/session revoke request                                  | immediate server-side denial and cleanup state        |

The parity contract is server-owned. Worker App and Hermes may present different
controls, but they must call the same handlers, schemas, quota rules, device
ACL, artifact authority, and audit lineage. Hermes can be more capable by
planning, explaining, batching independent typed jobs, detecting blockers early,
and suggesting the exact repair action; it cannot be more privileged merely
because it is an agent.

The extension model is open-ended at the capability level: future providers,
media operations, local services, and project workflows can be added without
redesigning the Hermes conversation protocol. “Unlimited extension” means a new
registered capability can be discovered and orchestrated through the same
contracts; it does not mean an agent may execute unregistered code or bypass
the install, permission, quota, and artifact gates.

Every new Hermes capability requires:

1. a versioned capability manifest entry;
2. a typed input/output schema and permission class;
3. a worker/runtime readiness probe and install/repair policy if dependencies
   are needed;
4. a server handler or existing handler mapping;
5. UI/MCP documentation and a human-readable `nextAction` on failure;
6. audit, quota, idempotency, cancellation, and recovery behavior; and
7. Hermes, Worker App, web UI, and generic MCP compatibility tests.

Hermes documentation must be discoverable through the same server-owned manual
resources and capability tools. A request such as “ทำอะไรได้บ้าง”, “ติดตั้ง
ComfyUI”, “ตรวจเครื่อง”, “สร้างภาพ”, or “เรนเดอร์วิดีโอ” must produce an
actionable plan based on the actual device manifest, not a static promise.

### 9.8 SmartAIHub user flow and UX contract

The web UI must make the execution target and readiness state visible before
the user commits a task. The minimum flow is:

1. **Choose target** — `SmartAIHub`, a named Hermes One device, a Hermes Agent
   session, or `Any eligible device`. Show online/offline, OS, runtime version,
   capability summary, queue depth, and last-seen time.
2. **Describe task** — one chat/composer supports natural-language requests and
   structured actions such as generate image, generate video, render Remotion,
   inspect machine, install dependency, or retrieve a file.
3. **Explain before execution** — show the interpreted operation, selected
   device, required capabilities, estimated credits/quota, files to be read or
   written, and whether confirmation is required.
4. **Resolve blockers** — if the device is not ready, show the exact component
   and an `Install`, `Repair`, `Verify`, or `Follow manual steps` action. The
   user must not be sent to a generic error page or told only to “check logs”.
5. **Confirm and send** — create one conversation message and one correlated
   task/job id. Disable duplicate submission while the idempotency request is
   pending.
6. **Track progress** — show a compact timeline: queued, device accepted,
   preparing, running, uploading, publishing, completed/failed/canceled. Each
   failure includes cause, whether retry is safe, and one recommended next
   action.
7. **Receive result** — return the Hermes text response, structured data, and
   image/video/file result cards in the same conversation. Media cards use the
   existing ACL/download path and show processing metadata where useful.
8. **Continue or recover** — offer `Ask Hermes to continue`, `Retry safely`,
   `Change device`, `Install/repair`, `View details`, and `Cancel` according to
   the task state. Do not expose raw tokens, local paths, or unredacted logs.

The UI must distinguish these concepts:

| User-facing item     | Meaning                                                             |
| -------------------- | ------------------------------------------------------------------- |
| Conversation message | what the user asked and what Hermes answered                        |
| Agent task           | an asynchronous Hermes plan/execution correlated to the message     |
| Worker job           | a typed render/generation/upload unit owned by the task or web flow |
| Device               | the approved Windows/macOS Hermes/Worker runtime receiving work     |
| Artifact             | a server-published image/video/file with ACL and download status    |

A task detail view must show these relationships without making the user infer
them from opaque ids. The default view is simple; advanced details can reveal
worker, runtime, prompt/execution id, retry, checksum, and audit correlation.

The UI must remain usable if the user closes the browser. On return, the server
re-hydrates task/job state and displays the latest result or blocker. Browser
disconnect must not cancel a task unless the user explicitly chooses cancel.

## 10. Worker platform contract

### 10.1 Shared worker lifecycle

Windows and macOS use the same server lifecycle:

```text
device approval
  -> runtime registration
  -> capability manifest
  -> heartbeat + health
  -> claim typed job
  -> stage workspace
  -> run registered adapter
  -> report progress
  -> init/upload/complete artifacts
  -> server verify/publish
  -> cleanup/reconcile
```

Existing Worker App and standalone Remotion Executor remain valid executors.
The new architecture adds shared contracts around them; it does not require
the Worker App to become an arbitrary agent host.

### 10.2 Windows 11 requirements

The first Windows target must support:

- x64 Windows 11 release validation;
- native process adapter and managed WSL2 adapter where the runtime requires it;
- DPAPI/Windows secure storage for device/worker credentials;
- ConPTY/PTY failure-safe behavior with no embedded-agent shell dependency;
- safe Windows path, junction, UNC, and process-tree handling;
- signed runtime/installer verification and rollback;
- Remotion, FFmpeg/ffprobe, fonts, and optional Comfy/Ollama doctor checks;
- automatic cleanup after cancel, failure, timeout, and restart;
- upload resume/retry with checksum and server completion verification.

Windows native evidence must include a real claim, render, upload, cancel,
restart, reconnect, and revoked-device test. Build success alone is not enough.

### 10.3 macOS requirements

The current release-approved macOS target is Apple Silicon `arm64`. Intel
`x86_64` must remain `unsupported` until a separately signed runtime pack,
native sidecar, and machine acceptance lane exist; the manifest must not claim
Intel support merely because the source can compile on that machine. The target
must provide:

- Keychain credential storage;
- native process/signal and path handling;
- managed Node/Remotion/Chromium/FFmpeg runtime provisioning;
- no end-user Xcode requirement for the managed executor path;
- notarized/signed app or CLI distribution where applicable;
- Gatekeeper/quarantine-aware installation and rollback;
- Apple Silicon/Intel capability reporting, not guessed architecture;
- sleep/network interruption recovery and upload resume;
- the same artifact MIME, checksum, duration, frame, and publication checks as Windows.

macOS Worker App packaging and standalone executor packaging are separate
release artifacts. A Mac build passing on a developer machine does not prove
production readiness until a clean-user install and real render evidence pass.
The current source-bundle/Xcode workflow is a developer/build path, not proof of
an end-user managed Remotion runtime. The packaged arm64 runtime must carry the
required sidecar or explicitly block Remotion jobs with a guided remediation.

### 10.3.1 Runtime completeness and guided installation

Windows Worker and macOS Worker must ship with a versioned runtime profile and
must never discover a missing dependency only after a user has submitted a
production job. The profile is evaluated during install, startup, doctor,
capability refresh, and before claim admission.

The baseline profile must account for the complete execution chain, including:

| Runtime area                   | Must be bundled/managed when possible                                                                              | May require user/OS action                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Worker host and control client | signed Worker runtime, platform adapter, secure credential store integration, updater, rollback metadata           | OS permission/notification approval if required                                                    |
| JavaScript media runtime       | pinned Node/runtime pack, package lock, Remotion renderer, Chromium/browser binary, fonts                          | platform security approval if a browser binary is quarantined                                      |
| Media tools                    | pinned FFmpeg and `ffprobe` with supported codecs                                                                  | GPU driver/codec support that is owned by the OS/vendor                                            |
| ComfyUI                        | pinned ComfyUI runtime, compatible Python environment, approved workflow/profile registry, required server adapter | GPU driver, CUDA/ROCm/Metal capability, large model/checkpoint downloads, license/terms acceptance |
| Local AI                       | approved Ollama/LM Studio adapter and health probe                                                                 | model weights, GPU driver, OS virtualization or vendor runtime                                     |
| Upload/security                | TLS trust, signed manifest verification, per-device credential storage, workspace roots                            | firewall/proxy or enterprise policy that blocks outbound HTTPS                                     |

“Bundled” means shipped in the signed runtime pack or installed by the Worker
using a server-approved package manifest. “May require user/OS action” must not
be represented as a generic `runtime_error`; it requires an actionable
diagnostic with the exact component, detected state, reason, next action, and
verification command or UI action.

The Worker UI must provide a single readiness view with these states per
component:

```text
ready | installing | needs_user_action | blocked | failed | outdated | repairing
```

For a managed component the UI provides **Install**, **Repair**, **Update**,
**Verify**, and **View logs** as applicable. The action must:

1. obtain the signed versioned package/profile from SmartAIHub over TLS;
2. verify signature, hash, platform, architecture, version, and disk space;
3. install into an app-owned or user-owned path without requiring admin rights
   unless the component genuinely requires it;
4. show progress, current step, cancellability, and a safe retry action;
5. run post-install health/version/API checks;
6. atomically activate the verified version and retain rollback metadata; and
7. refresh the capability manifest only after all checks pass.

If a dependency cannot be packed or safely auto-installed, the UI must show a
guided card containing:

- why it cannot be managed automatically;
- the exact missing prerequisite and supported versions;
- the OS-specific manual steps or copyable PowerShell/Terminal commands;
- whether administrator rights, reboot, driver installation, or model download
  is required;
- a **Check again** button that runs the same readiness probe;
- a link to the matching SmartAIHub guide and a downloadable diagnostic bundle.

Commands shown to users must be generated from the current signed runtime
profile, be copyable without hidden placeholders, and never contain access
tokens, cookies, private URLs, or secrets. The UI must explain when the command
is only for a local prerequisite and does not replace device approval/auth.

The worker must refuse new jobs while a required component is `installing`,
`needs_user_action`, `blocked`, `failed`, or `outdated`. It must return a
structured readiness failure before claim or at the admission boundary, with a
specific remediation path. An already-running job must not be allowed to fail
midway merely because a dependency was discovered late; readiness is rechecked
before claim and before starting each managed process.

The same profile model applies to Windows 11 and macOS. Platform-specific
differences belong in signed profile entries and adapters, not in duplicated
business rules or undocumented setup instructions.

### 10.3.2 Runtime profile schema and state machine

The runtime profile is a server-owned, signed, versioned contract. At minimum it
contains:

```text
profileId / schemaVersion / runtimeId / runtimeVersion
platform / architecture / installationMode
components[]:
  componentId / kind / version / source / archiveUrl
  sha256 / signature / sizeBytes / license
  installScope / requiresAdmin / requiresReboot
  dependencies[] / capabilityBindings[] / healthChecks[]
  manualPrerequisite / remediationGuideId
profileHash / signingKeyId / issuedAt / expiresAt
```

`source` is one of `bundled`, `managed_download`, `system`, `user_provided`,
or `vendor_runtime`. `kind` identifies the component without relying on a
display label, for example `node`, `chromium`, `ffmpeg`, `ffprobe`, `fonts`,
`python`, `comfyui`, `comfy_model`, `comfy_custom_nodes`, `ollama`,
`gpu_driver`, `wsl2`, `keychain`, or `credential_store`.

The installer evaluates dependencies as a graph and persists a transaction
record per component. The allowed transitions are:

```text
unknown -> checking -> missing
missing -> installing -> verifying -> ready
ready -> outdated -> installing
ready -> repairing -> verifying -> ready
installing/verifying/repairing -> failed | needs_user_action | blocked
failed -> retrying -> installing
installing/verifying -> rolling_back -> previous_ready | failed
```

Only the signed profile may select an archive, install root, executable, or
health check. An install transaction uses a per-device lock, staged directory,
atomic activation, crash recovery marker, and previous-version rollback. A
second UI click or a second Hermes request must attach to the existing
transaction rather than start a concurrent installer.

Every component result includes:

```text
componentId, state, detectedVersion, requiredVersion,
blocking, reasonCode, humanMessage, nextAction,
manualCommandId, logRef, checkedAt, retryable
```

`manualCommandId` resolves to a server-owned, platform-specific instruction
template. The rendered command is never allowed to contain credentials or
untrusted user input. The worker reports command completion only after the same
readiness probe passes; a successful process exit alone is insufficient.

The profile must also declare which capabilities are blocked by each component.
For example, missing `ffprobe` blocks video publication verification, missing
Comfy model blocks only the workflow profiles requiring that model, and missing
GPU driver blocks GPU-required workflows but may leave CPU-safe diagnostics
available. This prevents one missing optional component from falsely marking
the entire Worker unavailable.

Large ComfyUI models, checkpoints, LoRAs, and custom-node bundles are managed
content rather than arbitrary packages. They require an approved catalog entry,
content hash, license/terms state, target workflow binding, disk-space
preflight, resumable download, quarantine scan where applicable, and atomic
activation. A workflow may not download a model or custom node from an arbitrary
URL supplied in the prompt or JSON. The readiness result must distinguish
`model_not_installed`, `model_installing`, `model_incompatible`, and
`model_blocked_by_policy`.

Windows WSL2 profiles must separately check virtualization, WSL feature/version,
the managed distribution, distro disk space, Linux dependencies, and the
Windows-to-WSL path boundary. A WSL2 setup requiring administrator rights or a
reboot must pause in `needs_user_action` and resume after the user completes it;
it must not fail later during a render.

macOS profiles must separately check architecture, Gatekeeper/quarantine,
notarization/signature, Keychain access, executable permissions, supported
macOS version, sleep/network recovery, and any Metal/backend requirement. A
source checkout with Xcode is never accepted as the packaged end-user proof.

The initial release matrix must be explicit rather than inferred:

| Runtime target                    | Initial status                                                                                                                | Release evidence required                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `windows-x64` native              | supported when the signed pack and doctor pass                                                                                | clean Windows 11 x64 install, claim, media job, upload, recovery              |
| `hyperframes-wsl2` / managed WSL2 | supported only when WSL2 prerequisites and managed distro pass                                                                | clean Windows 11 WSL2 setup, admin/reboot branch, render and recovery         |
| `hermes-windows-x64`              | supported for the Hermes runtime pack when manifest checks pass                                                               | Hermes session, task, result, revoke, and runtime update                      |
| `hermes-macos-arm64`              | current macOS supported target                                                                                                | clean Apple Silicon install, Keychain, Hermes task, media result              |
| macOS Remotion arm64              | blocked until the native/managed Remotion sidecar pack exists                                                                 | real Remotion render and artifact verification on Apple Silicon               |
| `hermes-macos-x64` / Hermes Intel | unsupported because no Hermes Intel pack is in the current catalog                                                            | no capability advertisement; actionable unsupported-platform message          |
| `remotion-executor-macos-x64`     | conditional; usable only when an allowed signed archive contains the required sidecar and passes manifest/architecture checks | advertise only after the runtime manifest and real Intel acceptance lane pass |

### 10.3.3 Runtime and relay failure/remediation contract

Generic messages such as “runtime error”, “worker failed”, or “Hermes did not
respond” are not sufficient for a production path. The server, Worker UI,
Hermes, and MCP result must preserve a stable code and safe remediation data:

| Code                               | Meaning                                                  | User-visible next action                                            |
| ---------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| `runtime_profile_missing`          | no compatible signed profile                             | refresh releases or select a supported target                       |
| `runtime_signature_invalid`        | package/profile verification failed                      | stop activation, retry download, contact support with diagnostic id |
| `runtime_component_missing`        | required component absent                                | Install the named component                                         |
| `runtime_component_outdated`       | installed version outside policy                         | Update or select a compatible job profile                           |
| `runtime_verification_failed`      | post-install health check failed                         | View failed check, Repair, or follow manual guide                   |
| `runtime_admin_required`           | OS privilege is required                                 | approve the OS prompt or follow the exact admin step                |
| `runtime_reboot_required`          | OS restart required                                      | restart and press Check again                                       |
| `runtime_gpu_driver_missing`       | required GPU backend unavailable                         | install/update vendor driver and Check again                        |
| `runtime_model_missing`            | required model/checkpoint absent                         | install the named approved model or choose another profile          |
| `runtime_sidecar_missing`          | Remotion/Comfy adapter not present                       | Install the compatible sidecar or choose another target             |
| `runtime_unsupported_architecture` | no pack for the device architecture                      | use a supported device or wait for a signed pack                    |
| `runtime_network_blocked`          | release/control-plane access blocked                     | check proxy/firewall and retry the probe                            |
| `agent_session_revoked`            | device/session was revoked                               | reconnect and approve the device again                              |
| `agent_protocol_unsupported`       | no safe common Agent Relay protocol/version              | update Hermes/Worker or use the supported fallback client           |
| `agent_offline`                    | no live agent session                                    | wake/reconnect Hermes or change target                              |
| `agent_transport_resync_required`  | event cursor is behind/invalid                           | resume from the server cursor; do not rerun automatically           |
| `agent_approval_required`          | operation needs explicit approval                        | show plan and ask the user to confirm                               |
| `agent_task_expired`               | task exceeded its expiry/lease policy                    | create a new task after reviewing the reason                        |
| `agent_result_publish_failed`      | result produced but server publication failed            | reconcile/upload again; do not regenerate blindly                   |
| `result_pending_publication`       | local result exists but server publication is incomplete | wait/reconcile upload; do not expose a completed download link      |

Error responses include `code`, `category`, `retryable`, `blocking`,
`correlationId`, `taskId/jobId` where available, `nextAction`, and a redacted
`diagnosticRef`. They must not include executable shell text unless it came from
the signed manual-command catalog and is explicitly marked as a local
prerequisite instruction.

### 10.3.4 Runtime supply-chain and update safety

Runtime packs and managed components are executable supply-chain artifacts. The
release path must provide, before a pack becomes `allowed`:

- a reproducible/attested build record or trusted CI provenance;
- SBOM and third-party license notices, including model/custom-node terms where
  applicable;
- archive hash, per-component hash, signature, supported platform/architecture,
  runtime contract version, and release channel;
- malware/security scanning and a human/audited approval transition to allowed;
- signing-key rotation and revocation procedure;
- a deny/revoke mechanism that prevents new activation or new job claims for a
  compromised/outdated pack while preserving recovery diagnostics;
- retention of the previous known-good pack and a rollback test.

The download endpoint may serve only server-registered, allowlisted filenames
and release records. It must reject path traversal, symlinked release files,
unapproved placeholder/mock/diagnostic packs, and a manifest whose archive,
profile hash, signature, or architecture does not agree with the selected
runtime id. Resume/range downloads must verify the final whole-archive hash
before activation. The Worker must never execute a partially downloaded or
unverified archive.

Updates are drain-aware: the Worker stops new claims, waits for active jobs or
offers an explicit cancel/recovery decision, then installs the staged version.
If update verification fails, it restores the prior version and keeps the
device out of claim admission until doctor passes. Hermes may request an update
but cannot force-kill active work or bypass the user's/admin's maintenance
approval.

### 10.4 Capability admission

A job is eligible only when all of the following are true:

- runtime type and contract version are supported;
- worker/device is active, approved, and not revoked/draining;
- capability manifest is fresh and healthy;
- required OS/architecture/GPU/VRAM/disk/runtime features match;
- workspace policy allows all inputs and outputs;
- permission profile allows the operation;
- user/tenant/cloud/credit policy allows the selected execution mode;
- job idempotency and lease conditions pass.

If no worker qualifies, the server returns an explicit waiting, blocked, or
fallback decision. It must not silently run on the server or silently move to
cloud.

### 10.5 ComfyUI real execution contract

ComfyUI is a first-class typed worker capability, not only a capability label.
The implementation must make a generation requested from the SmartAIHub web
UI or an authorized MCP client follow the same durable job and artifact path as
other worker jobs:

```text
web/MCP request
  -> validate workflow/profile, ACL, credits, limits, and idempotency
  -> create worker_jobs row (queued)
  -> eligible worker claims a lease
  -> stage authorized inputs in an isolated workspace
  -> ensure registered ComfyUI service is ready
  -> submit typed workflow and receive prompt/execution id
  -> poll progress and report worker events
  -> collect and validate image/video outputs
  -> init artifact upload -> upload -> checksum/probe verification
  -> complete job -> publish Media History/Library references
  -> return authorized short-lived download references to the caller
```

#### 10.5.1 Supported job families

The first release supports the existing versioned contracts:

- `comfy_image_generation` for one or more allowlisted image outputs;
- `comfy_workflow_run` for an allowlisted workflow that may produce image or
  video outputs.

Each contract must identify the workflow/profile version, required models or
custom nodes by stable identifiers, input asset references, output types,
resource limits, timeout, requested quality/format, idempotency key, and
tenant/user ownership. Raw executable paths, arbitrary filesystem paths,
arbitrary callback URLs, arbitrary HTTP headers, and unbounded workflow JSON
are invalid inputs.

The server must validate the workflow against a registered workflow/profile
policy before queueing. A worker may reject a job when its reported ComfyUI
version, models, custom nodes, GPU/VRAM, disk, or output support does not
match; it must never silently substitute a different workflow or model.

#### 10.5.2 Web and MCP submission path

The web UI remains a supported producer, not a separate execution path:

1. The user selects an approved ComfyUI image/video operation, workflow/profile,
   inputs, and output settings in the existing generation UI.
2. The server resolves tenant/user ownership, feature flags, MCP/device policy
   where applicable, credit reservation, file ACLs, idempotency, and size/time
   limits before creating the job.
3. The server writes one typed `worker_jobs` record with required capability
   `comfyui.service`, requested output class, contract version, and input
   references. The initial response contains `jobId`, `status: queued`, and an
   explainable queue/worker decision; it does not wait for a local process.
4. MCP tools use the same server handler and return the same job contract and
   status model. MCP must not submit directly to a local ComfyUI HTTP port.
5. The UI and MCP status/read tools expose `queued`, `preparing`, `running`,
   `uploading`, `publishing`, `completed`, `failed`, and `canceled`, with
   progress, safe failure code, retryability, and next action.

#### 10.5.3 Worker-side execution sequence

An eligible Windows or macOS worker must perform these steps in order:

1. Advertise a fresh ComfyUI capability manifest containing readiness, API
   compatibility, registered workflow/profile versions, supported output types,
   concurrency, GPU/VRAM, and free disk. Do not expose local secrets or full
   paths.
2. Claim the job through the existing Worker Control Plane and verify the lease,
   tenant/user/job contract, and input references before execution.
3. Download or materialize inputs only through authorized short-lived server
   references into a per-job workspace. Verify size and checksum before use.
4. Resolve the registered local ComfyUI service. The default binding is
   loopback; a non-loopback service requires explicit registration,
   authentication, and the same device/tenant policy. The worker must not scan
   or connect to arbitrary LAN addresses.
5. Start or reuse ComfyUI only through a registered process-manager profile.
   Readiness must include health/API check, version check, model/custom-node
   compatibility, and available resource check. The worker must not install or
   execute arbitrary nodes from a job payload.
6. Submit the normalized typed workflow through the ComfyUI API, record the
   returned prompt/execution identifier in the job lineage, and never infer
   completion from a client-side timeout.
7. Poll with bounded backoff and report stage/progress events using the existing
   worker event contract. Long jobs must heartbeat and renew the lease. The
   poller must detect rejected, interrupted, orphaned, and timed-out executions.
8. Collect outputs only from the registered ComfyUI output root for this job.
   Reject path traversal, symlink/junction escape, unexpected filenames,
   unsupported MIME types, empty files, and outputs exceeding policy limits.
9. Validate every image with MIME, extension, byte size, checksum, and image
   dimensions. Validate every video with MIME, extension, byte size, checksum,
   duration, dimensions, frame rate, codec/container, and `ffprobe` evidence.
   The accepted formats and limits are configuration/policy data, not guesses
   in the adapter.
10. Initialize an artifact upload through the existing worker control-plane
    endpoint, upload each artifact to the server-owned presigned destination
    with bounded retry/resume behavior, and complete the upload with checksum,
    size, MIME, and job/artifact correlation.
11. The server re-reads and verifies the upload, publishes the artifact to the
    existing Media History/Library authority, queues indexing where required,
    and returns only tenant/user-authorized short-lived download references.
12. The worker reports terminal completion only after server publication has
    been acknowledged, then removes temporary inputs, outputs, logs, and
    process state according to retention policy. Cleanup is also required on
    cancel, failure, lease loss, and restart recovery.

The ComfyUI adapter boundary must be explicit and testable. At minimum it
provides typed methods equivalent to:

```text
detectRegisteredService()
checkReadiness(profile)
submitWorkflow(workflow, inputRefs)
readExecution(promptId)
interruptExecution(promptId)
collectApprovedOutputs(promptId, workspace)
```

These methods are called by the managed worker job handler and return sanitized
typed results. They must not be exposed as generic MCP tools. The adapter owns
ComfyUI API-version differences and path normalization; the worker handler owns
lease/heartbeat/progress, process-manager lifecycle, artifact upload, and
terminal job transitions. This separation keeps ComfyUI-specific changes from
leaking into server billing, ACL, or storage code.

#### 10.5.4 Image and video requirements

Image generation must support the workflow's declared output set, including
multiple images when the contract requests a batch. Each output receives a
stable artifact identity and remains independently verifiable and downloadable
through the existing ACL path.

Video generation must not be treated as a renamed image job. The adapter must
support the registered ComfyUI video workflow/output profile, collect the final
video rather than an intermediate frame, run `ffprobe`, and publish duration,
dimensions, frame rate, codec/container, byte size, and checksum. If a workflow
produces both preview images and a final video, the contract must label them and
the server must publish them as separate artifacts with one job lineage.

#### 10.5.5 Sequential queue and concurrency semantics

The default concurrency for one ComfyUI runtime is `1`. A worker must not claim
more ComfyUI jobs than its admitted slots and must finish the current job's
upload/publication/cleanup before starting the next job. Therefore three jobs
queued from the web UI must be processed as `A -> B -> C` on one runtime with
no lost, duplicated, or out-of-order publication. A future profile may declare
greater concurrency only when GPU/VRAM isolation and artifact accounting are
proven.

Multiple independent workers may claim different jobs concurrently, but each
claim still requires a lease and capability admission. Queue depth, active
slots, estimated wait, and worker selection must be visible to authorized UI
and status tools without exposing sensitive machine details.

Graceful drain stops new claims and finishes the active job. Queued cancel
prevents execution. Running cancel records the request, sends an interrupt to
the matching ComfyUI execution id, waits for bounded termination, cleans the
workspace, and reaches a single terminal `canceled` state. A late completion
must not publish an artifact after cancellation unless the server's explicit
race policy permits it and preserves idempotency.

#### 10.5.6 Retry, restart, and recovery

The current Comfy failure taxonomy must be used and extended only compatibly:

| Failure class        | Examples                                                                    | Required behavior                                                       |
| -------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Transient service    | `service_unreachable`, temporary health failure                             | bounded retry or requeue after lease release; no duplicate billing      |
| Input/workflow       | `workflow_rejected`, invalid profile, missing model/node                    | terminal failure with actionable correction; no automatic retry         |
| Runtime              | `execution_timeout`, GPU/VRAM/disk exhaustion, process crash                | interrupt/cleanup, bounded retry only when classified recoverable       |
| Output               | `unsupported_output`, missing/empty/corrupt output                          | terminal failure and quarantine/cleanup; never publish unverified media |
| Transfer/publication | `artifact_upload_failed`, `artifact_publish_failed`, `index_enqueue_failed` | resumable upload/reconciliation; publication is idempotent              |
| Contract             | `adapter_contract_violation`                                                | fail closed, alert/audit, disable incompatible capability               |

If the worker disconnects, the server lease expires and reconciliation decides
whether to requeue or fail the job. A restarted worker must recover only its
own managed process/workspace records, detect orphaned ComfyUI executions, and
avoid duplicate publication by reusing the job/artifact idempotency records.
Stale temporary workspaces and incomplete uploads require a retention-based
reconciliation task; they must not accumulate indefinitely.

#### 10.5.7 ComfyUI security boundary

- The server never connects directly to a user's local ComfyUI port.
- The worker never accepts an inbound MCP command or arbitrary remote shell.
- Only registered workflow/profile versions, models, custom nodes, output roots,
  and service bindings are executable.
- Network fetches from ComfyUI workflows are denied by default; any permitted
  provider/model endpoint must be an explicit allowlist with tenant policy and
  audit coverage.
- The output collector uses an isolated directory and verifies real paths,
  symlinks, junctions, file ownership, and file size before upload.
- Every artifact, credit reservation, job status transition, and download is
  tied to tenant, user, device, job, and artifact lineage.

The same contract applies on Windows 11 and macOS. Platform adapters may differ
for process launch, signals, paths, secure storage, and GPU probing, but they
must produce the same server-visible job, progress, artifact, checksum, and
publication evidence.

## 11. Scheduler and execution policy

### 11.1 Selection factors

The scheduler may score eligible workers using:

- capability and contract match;
- runtime readiness and reliability;
- queue depth and estimated duration;
- GPU/VRAM/CPU/memory/free disk;
- local model/service availability;
- network and asset download cost;
- user/tenant preference;
- cloud cost and credit policy;
- data locality and workspace policy.

The score and rejected-worker reasons must be available to authorized support
and audit views. The scheduler must not expose sensitive machine details to
ordinary MCP callers beyond an actionable capability summary.

### 11.2 Retry and fallback

- Retry only idempotent/recoverable failures with bounded attempts.
- Reassignment requires lease expiry/release and a new assignment attempt.
- A fallback target must revalidate inputs, permissions, billing, and artifact
  contract; it cannot reuse an authorization decision blindly.
- Cloud fallback requires explicit tenant/user policy and credit reservation.
- A failed local render must not be charged twice; reservation commit/release
  and provider billing must remain idempotent.

### 11.3 Parallel workflow boundary

The first implementation supports bounded child jobs for independent typed
operations and a parent workflow lineage. It must define:

- maximum fan-out and depth;
- parent cancellation propagation;
- partial failure policy;
- child idempotency keys;
- aggregate credit and artifact accounting;
- deterministic finalization order.

Distributed shot splitting for a single Remotion composition is future-gated
until timeline identity, ordering, fonts, assets, and reconciliation are
proven equivalent to the current single-worker render.

### 11.4 Agent and worker quota guard

Every web, MCP, Hermes relay, and Worker-originated operation uses one server
quota/credit decision. The default policy must include independent rolling
windows for:

- five hours;
- one calendar/rolling day according to the existing billing policy; and
- seven days.

The policy may meter credits, wall-clock execution, output bytes, job count,
concurrency, or a combination. Credits are the primary billing meter when a
provider/job already has a credit estimate. The server reserves before queueing,
commits only after the billable operation is verified, and releases/refunds
according to the existing idempotent billing rules. A retry or relay reconnect
must not create another reservation for the same idempotency key.

Default limits are conservative and configurable by the user only within the
tenant/admin policy. `unlimited` is an explicit policy value with a visible
warning, audit event, and optional admin restriction; it is not represented by
an accidental missing limit. The UI and Hermes response show current usage,
remaining allowance, reset time, estimated cost, and the exact limit that
blocked a task. A quota denial is a normal recoverable state with `nextAction`,
not a generic worker failure.

Quota scope must include tenant, user, device/agent, capability family, and task
lineage as applicable. One task with multiple child jobs shares the parent
reservation and aggregate limit. The quota ledger remains durable; Redis may
provide short-lived atomic counters/locks but cannot be the only record of
usage or create an unmetered path during an outage.

### 11.5 Backpressure, fairness, clock, and outage behavior

The scheduler and Agent Relay must define finite limits instead of allowing an
agent to create unbounded work:

- maximum offered/accepted tasks per device and per Hermes session;
- maximum worker claims based on admitted slots, not just queue depth;
- maximum queued bytes, input references, child-job fan-out, event rate, and
  diagnostic/log volume;
- per-tenant/user fairness and priority rules so one tenant cannot starve the
  rest of the queue;
- explicit queue-full response with estimated retry time or target change;
- dead-letter/quarantine handling for jobs that exceed retry or lease policy;
- bounded cleanup for abandoned tasks, orphaned processes, incomplete uploads,
  and stale install transactions.

The worker obtains server time during connect/heartbeat and records clock skew.
If skew exceeds the signed policy tolerance, it must enter `needs_user_action`
and explain how to correct the OS clock before accepting tokens, leases, signed
profiles, quota windows, or billable work. Local monotonic clocks may measure
durations but may not replace server time for expiry or authorization.

During a temporary server outage, an active admitted process may finish only if
its lease and local policy permit it, but it cannot claim another job or report
publication as complete without server acknowledgement. Outputs may be held in
an encrypted, bounded per-job spool with a retention deadline; once the
deadline expires the UI must explain that the result was discarded or requires
safe reconciliation. The worker must never continue unlimited offline work or
silently fall back to a different tenant/storage destination.

## 12. Context economy, skills, and snapshots

### 12.1 Skill discovery

Skills must expose versioned metadata before full content:

```text
skillId
version
domain
inputSchema
outputSchema
requiredScopes
requiredCapabilities
estimatedContextCost
compatibility
```

Target operations are `list`, `search`, `describe`, `read`, and `version`.
The agent loads only approved skill sections required by the current task. Skill
content remains server-owned and must not become arbitrary local code execution.

### 12.2 Context ledger

The context resolver must use existing canonical project/series/draft data and
return a bounded, provenance-aware bundle containing:

- snapshot/version identifiers;
- global summary;
- relevant characters/locations/assets;
- prior episode/shot dependencies;
- unresolved continuity/QC items;
- changed-field diffs from the caller's known versions;
- source freshness and trust labels.

It must support cacheable snapshots and diffs but must never treat a stale agent
summary as authoritative over persisted project data.

### 12.3 Project/series snapshots

Snapshots are metadata-first and owner/tenant scoped. They may summarize counts,
job states, render states, worker readiness, and unresolved errors. They must
not include unauthorized file contents, provider secrets, or unbounded story
payloads.

## 13. Audit, checkpoint, and observability

### 13.1 Audit event minimum

Every security or billable action records, where applicable:

- tenant, user, team, device, MCP client, and runtime identity;
- agent/session/request/job/workflow/parent lineage;
- tool/capability/operation and schema versions;
- selected worker and rejected-worker reason summary;
- permission profile and approval decision;
- provider/model/runtime identifiers;
- credits reserved/committed/released;
- artifact references/checksums without raw secrets;
- status, failure code, duration, retry/assignment attempt;
- relay transport, session id, event cursor, task transition, approval id, and
  runtime component remediation code where applicable;
- correlation and trace IDs.

Logs must redact bearer tokens, API keys, refresh tokens, local secrets,
provider credentials, raw prompts where policy requires, and full local paths.

### 13.2 Checkpoints and rollback

Supported durable outputs should use immutable version/checkpoint references.
Restore must create a new version or explicit restore event; it must never
silently overwrite an unrelated current state. Checkpoint scope must identify
the project, episode/draft/workflow, owner, source version, schema version, and
retention policy.

## 14. Persistence and service boundaries

The implementation must prefer existing tables/services and add normalized
tables only where durable state is genuinely new.

Potential additive persistence surfaces:

- `worker_capability_snapshots` for durable latest/previous manifests and hashes;
- `worker_process_runs` for managed process lineage and cleanup;
- `worker_workspace_policies` for approved roots and profile policy;
- `agent_capability_connectors` for registered external MCP connectors;
- `agent_task_envelopes`/task-event projection only if existing conversation or
  automation job authorities cannot persist target, approval, relay, and
  terminal-state correlation;
- `workflow_checkpoints` for immutable workflow/draft restore points.

The exact migration must be confirmed during deep-plan against the live Drizzle
schema and migration journal. Do not add duplicate tables for connected devices,
API keys, Remotion jobs, artifacts, audit, or media history where existing
authorities already exist.

### 14.1 Durable state, idempotency, and index requirements

Before adding an Agent Task table, deep-plan must prove whether the existing
conversation/task/automation authority can persist the required relay fields.
If an additive table is necessary, its minimum durable records are:

| Record                      | Required fields                                                                                                                                                                                                                                  | Required uniqueness/index behavior                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Agent task                  | tenant, user, conversation/message, target device, operation/schema, status, approval, quota/credit reservation, idempotency key, expiry, current cursor, existing `external_agent_task`/worker-job correlation, child-job ids, aggregate policy | unique `(tenant,user,idempotencyKey)`; indexes for `(tenant,user,status,updatedAt)`, target/lease, expiry, parent/child correlation |
| Agent task event            | task, monotonic cursor, event type/schema, redacted payload, actor/runtime, created time, source worker-job/artifact reference where applicable                                                                                                  | unique `(task,cursor)`; append-only; cursor query must be ordered and bounded                                                       |
| Agent session lease         | existing device/connection identity, session id, protocol version, last seen, lease expiry, transport, manifest hash                                                                                                                             | one active lease per device/session policy; revoke lookup must be indexed                                                           |
| Runtime install transaction | device, profile/component, version, state, transaction id, progress, log ref, previous version, failure/remediation                                                                                                                              | unique active transaction per device/component; stale transaction recovery index                                                    |

Media result records must link to the existing `mcp_media_tasks` or artifact/
`worker_jobs` authority instead of copying prompt/result URLs into Agent Task
events. The parent Agent Task must retain a typed relation to every child
`worker_jobs` record and its final artifact ids, but Agent Task events may
contain only opaque references and bounded summaries. A child job must not be
counted as a second user request or receive a second credit reservation merely
because it is projected into the conversation.
All state-changing writes use compare-and-swap/version checks so an old relay
event, duplicate poll, expired lease, or reconnect cannot overwrite a newer
terminal state.

Durable retention must be explicit: task metadata and audit lineage may outlive
large logs and raw intermediate files; event payloads are redacted and compacted
by policy; artifact retention follows Media History/Library policy; incomplete
installer transactions and upload workspaces have separate cleanup jobs. No
cleanup job may delete a still-referenced published artifact or an audit record
needed to explain a billable action.

Redis may hold short-lived locks, rate limits, pairing state, capability cache,
and ephemeral admission state. PostgreSQL/object storage/control-plane records
remain the durable source for jobs, artifacts, credentials metadata, audit,
checkpoints, and reconciliation. Redis failure must fail closed for
security-sensitive admission; it must never create an unmetered execution path.

## 15. Feature flags and rollout

Each capability has an independent gate. Suggested names must be reconciled with
the existing feature-flag registry before implementation:

| Gate                             | Default | Enables                                                           |
| -------------------------------- | ------: | ----------------------------------------------------------------- |
| `unifiedAgentWorkerArchitecture` |     off | shared capability schema and projections                          |
| `workerCapabilityDiscovery`      |     off | manifest registration/refresh and scheduler matching              |
| `workerPermissionProfiles`       |     off | safe/balanced/advanced/custom policy enforcement                  |
| `workerWorkspaceGuard`           |     off | local path policy and workspace-scoped file operations            |
| `workerProcessManager`           |     off | typed Remotion/FFmpeg/Comfy/local-AI process adapters             |
| `workerRuntimeReadiness`         |     off | signed profile checks, doctor, and claim-time admission           |
| `workerRuntimeProvisioning`      |     off | managed install/repair/update and guided prerequisite actions     |
| `mcpCapabilityDiscovery`         |     off | family discovery and capability explanations                      |
| `hermesAgentRelay`               |     off | SmartAIHub conversation-to-Hermes task delivery and result return |
| `hermesCapabilityParity`         |     off | Hermes access to Worker-equivalent typed controls                 |
| `mcpExternalConnectorGateway`    |     off | registered external MCP connectors                                |
| `agentContextEconomy`            |     off | skill/context ledger and bounded resolver                         |
| `workflowCheckpoints`            |     off | immutable checkpoint/restore surfaces                             |
| `intelligentWorkerRouting`       |     off | capability-aware target scoring and fallback policy               |
| `macosManagedExecutor`           |     off | macOS executor registration/dispatch                              |

The existing Feature 145/146/147 flags remain authoritative for their own
behavior. New gates may only widen behavior after the old path is proven
compatible. Rollout order:

Feature enablement for tenant/user-facing production behavior must be stored in
the existing server-side feature-flag/tenant policy authority and controlled by
the appropriate Settings/admin UI with audit history. It must not require a
user to edit production `.env` or restart the server. Environment variables may
provide an emergency deployment-wide kill switch or a server secret, but they
are not the normal tenant rollout/configuration mechanism. Every flag surface
must show current state, scope, who changed it, dependent gates, and the
rollback action. A flag cannot advertise a capability before its runtime,
profile, and production gates pass.

1. internal contract fixtures and read-only discovery;
2. one-user/one-device capability and runtime-readiness observation;
3. managed install/repair on a disposable test device with rollback proof;
4. typed Remotion/ComfyUI and artifact path on Windows;
5. macOS clean-install, guided prerequisite, and render cohort;
6. permission/process enforcement and Hermes parity in read-only mode;
7. SmartAIHub-to-Hermes relay with a one-user/one-device task cohort;
8. scheduler/routing and explicit fallback;
9. context/skills/checkpoints;
10. external MCP gateway, only after security review.

## 16. Implementation waves and ownership

### Wave 0 — Contract and compatibility foundation

Likely surfaces:

- `apps/web/shared/workerRuntime.ts`;
- `apps/web/shared/workerDelegation.ts`;
- `apps/web/shared/featureFlags.ts`;
- Remotion shared schemas;
- MCP discovery/registry/result types;
- runtime profile, component result, agent session/task/event schemas;
- migration journal and contract fixtures.

Deliverable: versioned schemas, compatibility evaluation, fixtures, and no
behavior change when flags are off.

Wave 0 must also publish a truthful support matrix so unavailable platform
packs, disabled MCP task features, and missing relay transports cannot be
advertised as ready.

### Wave 1 — Capability, permission, workspace, process foundation

Likely surfaces:

- worker registry and scheduler services/routes;
- new capability snapshot, workspace policy, and process-run services;
- Worker App Rust/TypeScript platform adapters;
- Windows and macOS secure credential/path/process test harnesses.
- signed runtime profile resolver, package transaction/rollback state, and
  guided prerequisite catalog;

Deliverable: read-only capability doctor plus typed process execution for one
existing Remotion path; arbitrary shell remains unavailable.

ComfyUI is an explicit Wave 1/2 implementation track, not a deferred example.
It must deliver a concrete registered-service adapter with capability detection,
loopback/readiness checks, workflow/profile validation, prompt submission,
progress polling, image/video output collection, `ffprobe` validation, and
per-job workspace cleanup. The adapter must call the existing control-plane
claim/progress/artifact APIs rather than inventing a local queue or upload API.

Runtime completeness is part of this deliverable. It must include the signed
runtime profile, dependency detector, managed installer/repairer, post-install
verification, rollback, guided manual prerequisite cards, diagnostic bundle,
and claim-time readiness gate for both Windows and macOS. A green Worker UI
status must mean that the exact runtime required by the admitted job is ready.

### Wave 2 — MCP capability and manual-operation surface

Likely surfaces:

- `mcpRegistry.ts`, `mcpPublicServer.ts`, `mcpResources.ts`;
- MCP OAuth/API-key scope mapping;
- client onboarding/docs and Connected Devices UI;
- MCP protocol/security tests.
- Agent Session/Task Relay transport, task correlation/status projection, and
  SmartAIHub conversation UI integration;

Deliverable: Hermes/Claude/Codex see one truthful, principal-scoped catalog and
can inspect status, readiness, permissions, and next actions.

The web generation handlers and MCP tools must both enqueue the same typed
ComfyUI image/video job contracts. This wave must include a user-visible job
status projection so a job submitted from the web can be followed from
`queued` through upload/publication without requiring the MCP client to stay
connected.

This wave also owns Hermes functional parity: typed doctor/install/repair,
queue control, ComfyUI/Remotion/FFmpeg operations, artifact results, logs,
diagnostics, and revoke must use the same server handlers as Worker App. The
SmartAIHub-to-Hermes relay UI must show target selection, plan/confirmation,
readiness blockers, progress, offline/reconnect, and result cards.

### Wave 3 — Scheduler, routing, retry, and fallback

Likely surfaces:

- worker scheduler/admission/reconciliation;
- typed job adapters and credit reservation;
- worker/admin/user status projections;
- queue, failure, and cross-worker tests.

Deliverable: explicit local/remote/cloud decision with no silent fallback.

### Wave 4 — Skills, context, snapshots, and bounded workflows

Likely surfaces:

- skill manifest/index service;
- context ledger/resolver;
- project/series/render snapshot adapters;
- bounded workflow parent/child lineage.

Deliverable: agent can ask what is available and load only relevant context.

### Wave 5 — Audit, checkpoints, and external connector gateway

Likely surfaces:

- audit/telemetry projection and support views;
- checkpoint persistence and restore service;
- allowlisted MCP connector registry and SSRF policy;
- retention, revocation, incident-response controls.

Deliverable: auditable, reversible workflows and optional controlled MCP
aggregation. This wave must not be required for the initial MCP/Remotion path.

## 17. Testing and acceptance matrix

### 17.1 Shared contract tests

- schema round-trip and version compatibility;
- old Worker App registration/heartbeat/claim remains valid;
- stale/invalid capability manifests are rejected or downgraded;
- capability hash/provenance and expiration behavior;
- all job adapters preserve existing payload/artifact contracts.

### 17.1.1 ComfyUI execution tests

The ComfyUI test suite must include both a deterministic fixture API and a
real-machine acceptance lane. Fixture tests cover:

- image workflow submission, progress, multiple outputs, and metadata;
- video workflow submission, final-output selection, and `ffprobe` metadata;
- service-unavailable, rejected-workflow, timeout, cancel, missing-output, and
  malformed-output behavior;
- three jobs submitted through the web handler and processed sequentially by
  one worker with exactly-once artifact publication;
- two workers claiming independent jobs without duplicate claims;
- upload retry/resume, checksum mismatch, publication retry, lease expiry,
  worker restart, orphan execution cleanup, and stale workspace cleanup;
- the same result contract when submitted through MCP tools;
- ACL denial for another user/tenant and no leakage of local paths or storage
  keys.
- when the operation is an MCP media-generation flow, the existing
  `mcp_media_tasks` record remains the status/result authority and links to the
  local `worker_jobs`/artifact lineage without duplicate result URLs.

Fixture tests are not production proof. The acceptance lane must run a real
approved ComfyUI installation with one image workflow and one video workflow,
and verify the actual server-side Media History/Library records and downloads.

### 17.1.2 Runtime readiness and installation tests

- signed runtime profile verification, unsupported platform/architecture, hash
  mismatch, expired manifest, and insufficient disk handling;
- clean Windows 11 and macOS install with every required managed component;
- missing driver, blocked firewall/proxy, quarantined browser binary, missing
  model, missing custom node, and insufficient VRAM scenarios;
- Install, Repair, Update, Verify, Cancel, Retry, and rollback behavior;
- manual-prerequisite card contains an OS-correct command, version, privilege
  note, link, and successful Check again result;
- no token/cookie/private URL/secret appears in command text, logs, or bundles;
- worker refuses claim while a required component is not ready and exposes a
  structured remediation code instead of failing after job start;
- runtime refresh cannot downgrade a healthy active version without explicit
  policy and rollback metadata.
- runtime-pack IDs and architecture claims match the actual release catalog;
  a macOS Intel capability request is rejected when that capability has no
  signed `macos-x64` pack;
- the source/Xcode build path is not counted as packaged end-user evidence;
- missing Remotion sidecar, ComfyUI runtime, model, custom node, or video
  verifier blocks only the affected capability with a specific next action.
- release provenance/SBOM/license/allow-list/deny-list checks, signing-key
  rotation, compromised-pack revocation, and drain-aware update/rollback;
- resumable large-model download, hash/license/catalog validation, quarantine,
  atomic activation, and cleanup of interrupted installer transactions;
- clock-skew rejection, bounded encrypted offline spool, server outage, and
  resume after reconnect without unauthorized offline claims.

### 17.2 Security tests

- tenant/user/device isolation;
- scope and permission profile enforcement;
- workspace traversal, symlink/junction, UNC, case-folding, ADS, and secret-path denial;
- process ownership and arbitrary-PID denial;
- command/argument/env injection denial;
- OAuth/API-key/worker-token lineage separation;
- API-key quota, revocation, expiry, and Redis fail-closed behavior;
- external MCP SSRF, redirect, DNS rebinding, and secret-isolation tests.
- prompt-injection/task-plan privilege escalation, replayed cursor/event, stale
  approval, clock-skew, package substitution, and runtime rollback tests;
- data-locality, external-egress consent, third-party connector isolation, and
  redaction of result/log/diagnostic payloads.

### 17.3 MCP client tests

- Hermes One OAuth connection and reconnect;
- Hermes CLI OAuth and browserless dedicated key;
- Claude remote connector and Claude Code CLI;
- Codex CLI OAuth and bearer environment-variable fallback;
- generic client discovery fallback;
- generated onboarding descriptor selects the correct Hermes/Claude/Codex
  instructions, browser OAuth/device authorization, or UI-created key fallback;
- browserless device-code expiry/replay/rate-limit behavior and one-time key
  reveal/storage/revoke behavior;
- `server/discover`, `tools/list`, `tools/call`, `resources/list`,
  `resources/read`, session behavior, errors, pagination, and idempotency;
- truthful blocked/unavailable capability explanations.

### 17.3.1 Hermes relay and parity tests

- SmartAIHub web message creates one task envelope correlated to one
  conversation message and, when applicable, one or more typed worker jobs;
- target selection, offline device, stale last-seen, capability mismatch, and
  runtime-install blocker show actionable UI states;
- Hermes One receives a task over the authenticated outbound session, reports
  acknowledgement/readiness/progress, and returns text plus media/file results;
- WebSocket/SSE interruption resumes through polling without duplicate work;
- duplicate clicks, browser close/reopen, worker reconnect, task expiry, cancel,
  and terminal-state idempotency are covered;
- Hermes doctor/install/repair, queue control, ComfyUI image/video, Remotion,
  FFmpeg, artifact download, diagnostics, and revoke call the same handlers and
  permissions as Worker App;
- sensitive, billable, destructive, and device-changing operations require the
  configured confirmation step;
- output cards show server ACL/download references and never expose local paths,
  worker credentials, or raw storage keys.
- Agent Session/Task Relay is tested separately from MCP: hello/accepted,
  heartbeat, offer/accept, progress, cursor replay, cancel, revoke, and
  WebSocket/SSE-to-poll fallback all produce the same durable state.
- protocol-range negotiation, runtime contract mismatch, unsupported transport,
  safe update guidance, and no unsafe legacy downgrade are covered.
- typed result envelope, pending-publication state, artifact ACL, quota/usage,
  data-locality consent, prompt-injection input, and provider/cloud egress
  denial are tested.

### 17.4 Windows tests

- clean Windows 11 x64 install;
- existing-install adoption and managed runtime provisioning;
- DPAPI credential storage and revocation;
- ConPTY/embedded-shell failure safety;
- doctor/capability refresh;
- Remotion render, FFmpeg probe, artifact upload, resume, cancel, restart,
  cleanup, and reconnect;
- worker update rollback and unsupported runtime contract behavior.
- real web-submitted ComfyUI image and video jobs on Windows 11;
- sequential queue of at least three ComfyUI jobs, cancel, restart/reconnect,
  and verified image/video publication.
- native `windows-x64` and managed WSL2 profile branches, including missing WSL2,
  admin approval, reboot, distro disk pressure, and Windows/WSL path checks;
- runtime-pack signature/hash mismatch, staged-install crash, rollback, and
  antivirus/quarantine/manual-remediation behavior.

### 17.5 macOS tests

- clean Apple Silicon arm64 install; add x64 only when the selected capability
  has an allowed signed x64 pack;
- Keychain storage and revocation;
- Gatekeeper/notarization/quarantine behavior;
- managed Node/Remotion/Chromium/FFmpeg provisioning without end-user Xcode;
- sleep/network interruption, process signals, upload resume, cleanup;
- real render and server-side artifact verification equivalent to Windows.
- real web-submitted ComfyUI image and video jobs on each release-supported
  architecture lane;
- sequential queue of at least three ComfyUI jobs, sleep/network interruption,
  cancel, restart/reconnect, and verified image/video publication.
- clean Apple Silicon `arm64` packaged runtime without Xcode;
- explicit Intel/macOS-x64 unsupported response for capabilities without a
  signed pack;
- Keychain, Gatekeeper/quarantine, notarization, executable permission, Metal
  backend, sleep/wake, and missing Remotion sidecar remediation behavior.

### 17.6 Scheduler/context/audit tests

- capability filters and explainable rejection reasons;
- no eligible worker, busy worker, stale worker, and cloud-policy denial;
- bounded retry/reassignment and no double billing;
- context version/diff/ACL/freshness behavior;
- skill manifest filtering and schema mismatch;
- checkpoint create/compare/restore without silent overwrite;
- audit redaction, lineage, retention, and support query performance.
- queue-full, per-tenant fairness, session/task backpressure, dead-letter,
  orphan cleanup, and no-starvation behavior;
- server outage, worker outage, clock skew, lease expiry, and bounded local
  spool reconciliation.

## 18. Production gates

No new behavior is production-ready merely because TypeScript, Rust, or an
installer build passes.

Required gates for each wave:

1. focused unit/integration tests;
2. changed-file type/syntax/build verification;
3. migration preflight and rollback proof where applicable;
4. local protocol smoke tests;
5. real authenticated MCP client evidence;
6. real Windows/macOS machine evidence for platform-specific claims;
7. telemetry for endpoint/client/version/runtime/capability/failure;
8. feature-flag cohort rollout and revoke/offboarding test;
9. production health and artifact/download verification;
10. compatibility review against Features 145–147 before widening rollout.

For the ComfyUI capability specifically, the gate is not closed until all of
the following are evidenced:

- a real web request creates the typed `worker_jobs` record;
- an approved worker claims it and the local ComfyUI service executes it;
- one image and one video are uploaded through the existing artifact protocol;
- server-side checksum/probe/publication and Media History/Library ACL download
  checks pass;
- three queued jobs complete sequentially on one runtime without duplicate or
  missing artifacts;
- cancel, worker disconnect/reconnect, lease recovery, upload retry, and
  revoked-device behavior are verified;
- Windows 11 and the release-approved macOS matrix each have machine evidence.

For runtime and Hermes readiness, the gate is not closed until:

- a clean Windows 11 device and a clean macOS device can reach `ready` using
  the Worker UI without undocumented setup;
- every packable dependency can be installed or repaired from the Worker UI;
- every non-packable dependency displays a correct OS-specific instruction and
  Check again flow that has been executed successfully;
- an unready device cannot claim a job and the user sees the exact remediation;
- Hermes can inspect the same readiness state, request managed installation or
  guide the user through the manual prerequisite, then retry safely;
- a web-originated Hermes task can survive browser close, device reconnect, and
  session transport fallback, and return a verified text/media result;
- the parity matrix has evidence for both Worker App and Hermes, with no
  privilege expansion through the agent path.

Documentation is also a production gate. The published Hermes/Worker guide,
MCP resources, settings UI, `tools/list`, and runtime readiness cards must agree
on the same support matrix. A disabled or unverified feature must be labeled
unsupported/coming soon with its supported alternative; stale instructions are
treated as a release defect because they can cause users to run unsafe or
impossible commands. The gate also requires generated onboarding instructions
for Hermes One, Hermes CLI, Claude/Claude Code, Codex CLI, generic MCP, and
browserless machines to be tested against the currently supported client
versions; the Settings UI must remain the source of truth for connection setup,
scope, quota, expiry, and revoke actions.

Additional gates cover the less-visible failure paths:

- the durable task/event/install model has the required unique constraints,
  cursor ordering, lease/version checks, retention, and migration rollback;
- package provenance, SBOM, license notices, signing-key rotation, allow/deny
  release state, and compromised-pack recovery are exercised;
- queue-full/fairness/backpressure, clock skew, server outage, bounded offline
  spool, and update-while-running behavior are measured and user-visible;
- data-locality/egress consent and result publication pending states are proven
  through the actual UI and not only unit tests.

The implementation must report focused proof separately from known dirty-worktree
or repository-wide baseline failures. No unauthenticated HTTP 200, build pass,
or mocked worker test may be reported as end-to-end production proof.

## 19. Definition of Done

Feature 148 is complete only when:

- shared capability, permission, workspace, and process contracts are versioned;
- existing MCP and Worker App contracts remain compatible with flags off;
- Hermes, Claude, Codex, and generic MCP paths expose truthful discovery;
- Windows 11 and the release-approved macOS matrix pass real executor evidence;
- Remotion and future typed local operations use the same server-owned artifact,
  billing, media history, and ACL/download authority;
- ComfyUI image and video jobs can be requested from the web UI and authorized
  MCP clients, pulled by an approved local worker, executed through a registered
  ComfyUI service, and returned as verified Media History/Library artifacts;
- one ComfyUI runtime processes at least three queued jobs sequentially with
  bounded retry, cancel, restart/reconnect, lease recovery, and exactly-once
  publication behavior;
- Windows and macOS Workers have a complete signed runtime profile, claim-time
  readiness gate, UI install/repair/update/verify flow, rollback, and explicit
  manual instructions for prerequisites that cannot be packed;
- no required dependency is first discovered after a production job starts,
  and every blocked state has a reason, next action, logs, and Check again path;
- SmartAIHub can send a typed task to Hermes One/Agent, show plan/approval and
  readiness state, survive browser/device/session disconnect, and display the
  returned text, image, video, or file result in the originating conversation;
- Hermes has Worker-equivalent access to approved diagnostics, installation,
  queue control, generation/render, artifact, and revoke functions through the
  same server authority, with bounded agent extension points;
- the Agent Session/Task Relay has a versioned wire contract, durable cursor and
  idempotency behavior, reconnect/poll fallback, approval binding, and separate
  device credential lineage from MCP;
- quota/credit limits apply identically to web, MCP, Hermes relay, and Worker
  paths across five-hour, one-day, and seven-day windows;
- the published manual, UI, capability catalog, and runtime manifest do not
  promise an unsupported platform, missing sidecar, disabled MCP feature, or
  unverified OAuth/relay path;
- durable task/event/install state has tenant-safe uniqueness, cursor ordering,
  lease/version guards, retention, migration rollback, and no Redis-only source
  of truth;
- runtime packages have provenance, SBOM/license records, signature rotation,
  revocation, allow/deny release state, and drain-aware rollback;
- queue fairness, backpressure, clock-skew, server outage, bounded offline
  recovery, data-locality consent, and pending-publication states are visible
  and tested;
- no arbitrary shell, unrestricted filesystem, arbitrary PID kill, or raw token
  forwarding is reachable from MCP;
- scheduler decisions, fallbacks, retries, and costs are explainable and audited;
- context/skills/snapshot surfaces are ACL-correct and bounded;
- checkpoints and rollback are immutable and recoverable;
- Redis is only ephemeral enforcement/cache state and outages fail closed where
  required;
- feature flags, telemetry, rollback, and deprecation gates are documented;
- all production claims have platform/client evidence rather than code-only assumptions.

## 20. Expected user value and cost/benefit

If developed fully, users gain:

| User need                                             | New capability                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| Ask Hermes/Claude/Codex what the system can do        | Principal-scoped capability discovery and manual-operation guidance               |
| Render using an existing Windows or Mac machine       | Capability-aware local executor with secure auto-readiness                        |
| Use local GPU/ComfyUI/FFmpeg/Remotion safely          | Typed process adapters and workspace guard                                        |
| Generate local ComfyUI images and videos from web/MCP | Durable queue, local execution, verified upload, Media History, and ACL downloads |
| Avoid setup errors on Windows/Mac                     | Runtime doctor, one-click managed install, guided prerequisite commands, rollback |
| Use Hermes like a familiar chat assistant             | SmartAIHub conversation relay, progress, reconnect, and result cards              |
| Extend Hermes safely in the future                    | Versioned capability/skill contracts with shared permissions and audit            |
| Avoid waiting for one busy worker                     | Explainable multi-worker routing and controlled fallback                          |
| Recover from failures                                 | Job lineage, process logs, retry/reassignment, checkpoint, and rollback           |
| Work with large series/projects                       | Project snapshots, skill discovery, context diffs, and bounded context loading    |
| Trust file/media access                               | Tenant/user/device ACL plus short-lived artifact/download references              |
| Understand costs and actions                          | Credit reservation/commit/release and detailed audit lineage                      |
| Use Windows and Mac consistently                      | Shared protocol/artifact contract with platform-specific adapters                 |

### 20.1 Value assessment

The highest-return investments are capability discovery, workspace/process
security, audit/recovery, and context economy. They reduce future integration
cost and prevent every new MCP or worker feature from inventing its own auth,
filesystem, process, and artifact rules.

The scheduler, cloud fallback, and external MCP gateway have high strategic
value but higher operational/security cost. They should follow the foundation,
not be implemented as an initial mega-release.

The architecture is worthwhile if implemented in phases because:

- existing Worker App and Remotion work is reused rather than replaced;
- Windows and macOS share contracts while retaining native adapters;
- every later capability gains the same permission, audit, and artifact rules;
- feature flags keep incomplete future capabilities away from production users;
- failure in a future wave does not disable the current web/MCP/render paths.

## 21. Deep-plan prerequisites

Before implementation planning begins, deep-plan must:

1. verify the live Drizzle schema and migration journal for every proposed durable table;
2. map each proposed capability to an existing MCP registry handler or identify
   the smallest new handler;
3. run impact analysis before changing shared worker schemas, routes, or exported types;
4. confirm the exact supported Windows/macOS release matrix from current
   packaging/runtime manifests;
5. produce a migration order and feature-flag dependency graph;
6. define test fixtures for old Worker App, standalone executor, OAuth clients,
   browserless API-key clients, and capability/version mismatch;
7. inspect and implement the concrete ComfyUI adapter boundary, including the
   existing `comfyImageGenerationJobContractSchema`,
   `comfyWorkflowRunJobContractSchema`, `comfyServiceBindingSchema`, current
   Comfy stages/failure codes, and worker artifact event payloads. Deep-plan
   must explicitly identify the web generation handler, the `worker_jobs`
   enqueue path, the Worker App/standalone claim loop, the Comfy service API
   adapter, the output collector, and the server publication path;
8. define the real ComfyUI image/video workflow fixtures, accepted output
   profiles, model/custom-node compatibility evidence, GPU/VRAM/disk limits,
   queue slot policy, cancel/interrupt behavior, and ffprobe validation
   contract for Windows 11 and macOS;
9. produce an end-to-end test runbook that starts with a web request, follows
   the durable job through claim, Comfy execution, progress, artifact upload,
   Media History/Library publication, and ACL download. It must include three
   sequential jobs, failure/retry, cancel, disconnect/reconnect, and real
   machine evidence; mocks alone cannot close the gate;
10. inventory every Windows/macOS runtime dependency and classify it as bundled,
    managed-installable, user/OS prerequisite, or unsupported. Define the
    signed manifest, install/repair/rollback state machine, exact manual
    commands, privilege/reboot requirements, and claim-time readiness behavior;
11. map the Hermes relay to existing conversation, agent-session, worker-job,
    notification, and artifact authorities before adding persistence. Define
    outbound session transport, polling fallback, task envelope, correlation,
    approval, offline/reconnect, terminal-state idempotency, and UI state
    contracts. Do not create a second chat or media authority accidentally;
    explicitly inspect `queueHermesWorkerJob`, `external_agent_task`,
    `hermesAgentRuntime`, and the existing `runEngine.ts` external-connector
    dispatch before choosing a route or table;
12. produce the Worker App/Hermes functional parity matrix and prove that every
    new Hermes extension has a capability schema, readiness probe, permission,
    quota, audit, cancellation, recovery, and documentation contract;
13. map the Agent Session/Task Relay to the current worker connect/device
    identity, event/SSE, notification, conversation, and artifact authorities.
    Decide which existing route/service can be extended and which minimal
    additive contract is needed; do not assume remote MCP can push into Hermes;
    prove whether worker claim polling already satisfies delivery before adding
    WebSocket/SSE, and define the parent/typed-child job relation;
14. define the runtime-profile release catalog and exact support matrix from
    the actual manifest IDs/artifacts. Prove the Windows native/WSL2 branches,
    Hermes Windows pack, Hermes macOS arm64 pack, and the current absence or
    presence of a macOS Remotion sidecar separately;
15. define stable runtime/relay error codes, diagnostic retention/redaction,
    task/event cursor storage, quota ledger behavior, and support runbooks for
    every state that can block a user;
16. verify whether the existing `mcp_media_tasks`/`mcpMediaAdapter.ts` authority
    owns each MCP image/video result and define the exact link to `worker_jobs`,
    artifact publication, Media History, and download broker without duplicating
    result state or charging/reconciling twice;
17. define package provenance, SBOM/license release records, signing-key
    rotation/revocation, allowed/denied release transitions, drain-aware update,
    compromised-pack recovery, and resumable model/package transfer behavior;
18. define queue fairness, per-device/session backpressure, clock-skew policy,
    server-outage/offline spool behavior, dead-letter cleanup, and measurable
    recovery/retention limits;
19. define the versioned client onboarding descriptor and generated instructions
    for Hermes One, Hermes CLI, Claude/Claude Code, Codex CLI, and generic MCP,
    including OAuth/device authorization, UI-created headless key fallback,
    secure storage, and exact verification calls;
20. separate implementation gates from external production gates;
21. preserve all existing specs and keep the implementation scope explicitly
    additive.

## 22. Spec audit conclusion

This revision closes the previously identified specification gaps for:

- complete Windows/macOS runtime readiness and dependency provisioning;
- packable versus user/OS-managed prerequisites;
- actionable install, repair, rollback, manual command, and error flows;
- ComfyUI model/custom-node/GPU/video readiness boundaries;
- Hermes Worker-equivalent capability access and safe future extension;
- SmartAIHub conversation-to-Hermes task delivery and result return;
- Agent Session/Task Relay transport, state, cursor, reconnect, approval, quota,
  and credential boundaries;
- reuse of the existing Hermes `external_agent_task` gateway lane, with an
  explicit parent/typed-child job boundary and separation from `hermes_media_*`;
- browser-capable and browserless onboarding for Hermes, Claude, Codex, and
  generic MCP clients, including UI-created scoped keys and device authorization;
- UI/UX states that distinguish conversation, task, worker job, device, and
  artifact;
- durable task/event/install persistence, idempotency, cursor, retention, and
  compatibility with existing `mcp_media_tasks`;
- package supply-chain provenance, signing/revocation, large model transfer,
  update drain/rollback, queue fairness, backpressure, clock skew, outage
  recovery, privacy, and data-locality consent;
- documentation truthfulness and platform/client production gates.

The implementation slice now includes the shared onboarding descriptor, bounded
Hermes correlation contract, ComfyUI Worker adapter/readiness gate, Worker App
ComfyUI settings, UI/resource wiring, and the matching regression coverage.
Remaining items are explicit external or follow-up gates rather than unstated
requirements: signed runtime profiles/packs, a macOS Remotion sidecar where the
release catalog does not yet provide one, full relay task projection, real
Windows/macOS acceptance runs, real ComfyUI model/custom-node/GPU image-video
runs, production OAuth/client verification, telemetry observation, and the
30–90-day legacy deprecation decision. Deep-implement must not mark these gates
complete from mocked tests or package availability alone.
