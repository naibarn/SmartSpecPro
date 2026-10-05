# Spec 278 — SmartAIHub Durable Runner Execution Sessions & Recovery Fabric
## Restart-Safe Execution Hosts, Reattachment, Fenced Recovery, Ordered Session Control & Resource-Aware Runner Capability Advertisement

**Status:** Proposed / Additive implementation-ready architecture specification
**Spec ID:** 278
**Revision:** 1.4 — commercial execution grant, metering evidence integrity, outage behavior, capability-release pinning and commerce-recovery hardening; preserves all R1.2/R1.3 durability and authority semantics (2026-10-04)
**Date:** 2026-10-04
**Target repository path:** `specs/feature/278-durable-runner-execution-sessions-recovery-fabric/spec.md`
**Primary owner:** SmartAIHub Runner / Worker Execution Runtime
**Canonical execution authority:** existing `worker_jobs` / `worker_job_events` and their lease/fencing/approval contracts
**Primary integration:** existing Runner Control / Worker App, Spec 224 Development Orchestrator Runtime, Spec 277 Task Control Experience
**Core dependencies:** Spec 186 / canonical worker job control plane; existing Runner Control / Feature 195 where applicable; Spec 200 external-agent adapters; shared Approval, Capability, Audit, Billing, Identity, Policy and Secret-Broker infrastructure
**Companion integrations:** Specs 206, 215, 224, 226, 256, 267, 269, 272 where deployed, 277, and later execution-placement / Cloudflare runtime work
**Reference inspiration:** AgentsMesh Runner architecture, especially restart-surviving per-session process ownership, runner recovery, capability/capacity advertisement, per-pod command serialization, supervision and control/data-plane separation. SmartAIHub SHALL implement these concepts independently and SHALL NOT copy BSL-licensed AgentsMesh production source code.

---

# 0. Executive Decision

SmartAIHub SHALL add a **Durable Runner Execution Session layer** beneath the existing durable orchestration and `worker_jobs` control plane.

The central invariant is:

> **A Runner restart MUST NOT automatically mean a task restart.**

Two additional safety invariants are equally mandatory:

> **A process that survives MUST NOT outlive its execution authority.**

> **A completed process MUST leave enough durable terminal evidence for the control plane to reconcile the result after the Worker returns.**

For execution modes capable of local process continuity, the long-running process SHALL be owned by a per-session execution host whose lifecycle is independent of the main Worker/Runner process. After Worker restart, upgrade, crash, temporary disconnection, or control-channel reconnection, the Worker SHALL be able to discover, authenticate, reconcile and reattach to the surviving execution session.

For execution environments that cannot preserve the exact operating-system process across host replacement, the same abstraction SHALL provide the strongest available continuity semantics:

```text
process continuity
    OR
reattachment to an externally durable session
    OR
checkpoint + resume
    OR
deterministic reconstruction
    OR
explicit LOST / unrecoverable finality
```

This Spec does **not** create a second job system, scheduler, approval engine, orchestration runtime, or source of execution authority.

`worker_jobs` remains authoritative for:

- whether work may execute;
- who currently owns execution;
- lease validity;
- fencing / authority epoch;
- approval state;
- cancellation;
- retry/recovery policy;
- billing/settlement authority;
- terminal job status.

The new execution-session layer owns only:

- local/remote execution continuity;
- attachment/detachment;
- process/session identity;
- ordered execution commands;
- workspace/session handles;
- runtime resource visibility;
- checkpoint/reattach mechanics;
- execution-stream attachment;
- recovery evidence.

The result is:

```text
SmartAIHub durable orchestration
        │
        │ worker_job + authority
        ▼
Runner Control / Placement
        │
        │ execution intent
        ▼
Durable Execution Session Manager
        │
        ├── Local PTY Session Host
        ├── ACP / JSON-RPC Session Host
        ├── Cloudflare Container Adapter
        ├── Cloudflare Sandbox Adapter
        ├── External Harness Session Adapter
        └── Future execution drivers
                │
                ▼
        actual long-running workload
```

---

# 1. Why This Spec Exists

SmartAIHub already has durable orchestration above execution:

- `worker_jobs`;
- job events;
- leases;
- idempotency;
- retries;
- approvals;
- development orchestration;
- external agent adapters;
- local Worker execution;
- cloud execution plans.

However, durability above the Runner does not by itself make the **actual operating process** durable.

A typical failure path today can be:

```text
worker_job = RUNNING
        │
        ▼
Worker launches Codex / Claude / build / ComfyUI process
        │
        ▼
Worker process restarts / updates / crashes
        │
        ▼
child process is lost
        │
        ▼
orchestrator must retry or reconstruct work
```

For expensive or long-running execution this creates avoidable loss:

- agent context/session loss;
- duplicate work;
- repeated LLM/API cost;
- partial repository mutations;
- repeated downloads/builds;
- incomplete artifacts;
- inconsistent terminal state;
- unnecessary user intervention;
- difficult diagnosis after Worker upgrades;
- increased risk during unattended runs.

Spec 278 introduces an explicit **execution continuity boundary**.

---

# 2. Scope

## 2.1 In scope

Spec 278 covers:

1. Durable Execution Session identity and lifecycle.
2. Per-session execution host abstraction.
3. Restart-safe local PTY/process sessions.
4. Reattachment after Worker/Runner restart.
5. Recovery inventory and reconciliation.
6. Fencing-safe adoption of surviving sessions.
7. Per-session ordered command lanes.
8. Duplicate-command idempotency.
9. Runner supervision/watchdog/reconciliation.
10. Resource/capability advertisement.
11. Session-aware Worker update/drain behavior.
12. Workspace continuity hooks.
13. Streaming attachment abstraction.
14. Checkpoint/reconstruction contracts for non-process-durable environments.
15. Task Control projection of recovery/continuity.
16. Security and secret-handling boundaries.
17. Multi-platform support:
    - Windows;
    - macOS;
    - Linux;
    - Cloudflare Container;
    - Cloudflare Sandbox;
    - future remote execution targets.

## 2.2 Explicitly out of scope

Spec 278 SHALL NOT:

- replace `worker_jobs`;
- create another canonical task table;
- replace Spec 224;
- replace the existing Capability Resolver;
- replace external-agent adapters;
- replace MCP;
- make Git worktree isolation a security sandbox;
- mandate gRPC;
- mandate X.509/mTLS if the existing SmartAIHub Runner authentication model provides equivalent authenticated control;
- require a dedicated terminal Relay in the first milestone;
- expose implementation terms such as `session daemon` to normal users;
- make all workloads process-durable when the execution substrate cannot support that guarantee.

---

# 3. Architectural Principle: Durable Job != Durable Process

SmartAIHub SHALL distinguish three durability layers.

```text
Layer A — Orchestration durability
worker_jobs / workflow / development run survives process restarts.

Layer B — Execution-session durability
Runner can rediscover and reattach to the same execution session.

Layer C — Process durability
The exact OS process / PTY / remote agent session remains alive.
```

These are not equivalent.

Example:

```text
Local Windows Worker:
A = yes
B = yes
C = yes, where Session Host survives Worker restart

Cloudflare Sandbox replaced:
A = yes
B = yes
C = usually no
=> resume by checkpoint/reconstruction

Remote provider session:
A = yes
B = yes
C = provider-dependent
=> reattach by provider session handle where supported
```

The API SHALL therefore express **continuity capability**, not a simple `durable=true/false`.

---

# 4. Relationship to Existing SmartAIHub Architecture

## 4.1 Spec 186 / worker_jobs

`worker_jobs` remains the source of truth for execution authority.

Spec 278 MAY introduce a session projection/table but SHALL NOT allow that table to determine whether execution is authorized.

Required relationship:

```text
worker_job
   │ 1
   │
   └──── 0..N execution_session generations
```

A job may have multiple execution-session generations over its lifetime because:

- the session was reconstructed;
- placement changed;
- a cloud container was replaced;
- a stale session was fenced;
- recovery required a new execution host.

Only one generation may hold active mutation authority at a time unless the job contract explicitly permits parallel execution.

## 4.2 Spec 224

Spec 224 remains the development lifecycle owner:

```text
PLAN
IMPLEMENT
BUILD
TEST
DEBUG
REVIEW
VERIFY
FINAL_VERIFY
```

Spec 278 sits below it:

```text
Spec 224:
"Run this implementation/test/review step"

        ↓

worker_job

        ↓

Spec 278:
"Keep the execution session alive,
reattachable, fenced and observable"
```

Spec 224 SHALL NOT need to know whether a step is currently backed by:

- a direct local process;
- detached session host;
- Cloudflare Container;
- Sandbox;
- ACP session;
- remote harness.

It consumes normalized execution state.

## 4.3 Spec 200 / external agents

Spec 278 provides session continuity primitives for:

- Codex;
- Claude Code;
- Gemini CLI;
- Antigravity;
- Hermes;
- ZCode;
- Kimi Code;
- future harnesses.

Provider adapters remain responsible for provider-specific launch/resume semantics.

## 4.4 Spec 256

Spec 256 chooses capabilities/tools/skills.

Spec 278 reports:

- which execution capabilities physically exist on a Runner;
- resource availability;
- supported session drivers;
- whether an execution mode is restart-safe / checkpointable / interactive.

Spec 256 SHALL NOT become a machine scheduler.

## 4.5 Spec 267

Cloudflare placement SHALL consume the same normalized execution-session contract but may implement continuity differently.

## 4.6 Spec 269

Assistant/orchestration behavior may request work and monitor it, but MUST NOT bypass the canonical authority or session fencing defined here.

## 4.7 Spec 277

Spec 277 Task Control SHALL display user-facing execution continuity and recovery state derived from Spec 278 without exposing low-level daemon/process jargon by default.

---

# 5. Canonical Invariants

The following invariants are mandatory.

## INV-001 — worker_jobs authority

An execution session SHALL NOT authorize itself.

## INV-002 — fencing

A surviving process with a stale authority epoch SHALL NOT continue privileged mutation merely because it is still alive.

## INV-003 — no silent double execution

Two session generations SHALL NOT simultaneously mutate the same protected job scope unless explicitly permitted by the job's execution contract.

## INV-004 — recovery is reconciliation

Worker startup SHALL not blindly attach to every surviving process. It SHALL reconcile local evidence with canonical server authority first.

## INV-005 — restart-safe does not imply reboot-safe

A local per-session host may survive Worker restart but may not survive host reboot. The system SHALL report the actual continuity class.

## INV-006 — no persistent raw secrets

Session manifests SHALL NOT contain plaintext provider/API secrets.

## INV-007 — ordered per-session control

Commands affecting one execution session SHALL be serialized through a monotonic session command lane.

## INV-008 — idempotent commands

Duplicate delivery of the same command SHALL NOT produce duplicate side effects.

## INV-009 — evidence of recovery

Every recovery/adoption/fencing decision SHALL produce an auditable event.

## INV-010 — security isolation is separate

Workspace isolation, Git worktree isolation and process continuity SHALL NOT be represented as equivalent to OS/container security isolation.

---

# 6. Terminology

| Term | Meaning |
|---|---|
| Worker / Runner | SmartAIHub execution host process registered with the control plane |
| Runner Instance | one specific boot/lifecycle of the Worker process |
| Execution Session | normalized durable execution identity associated with a worker job |
| Session Generation | incarnation number of an Execution Session |
| Session Host | process/runtime that owns the actual workload independently of the main Worker |
| Session Driver | adapter implementing execution semantics for one substrate |
| Attach | connect Worker control to an already existing session |
| Detach | remove Worker control while allowing eligible session execution to remain alive |
| Adoption | server-authorized transition allowing a new Runner Instance to control a surviving session |
| Authority Epoch | monotonic fencing generation proving current execution authority |
| Placement Epoch | generation representing where the job is currently assigned |
| Recovery Inventory | set of locally/externally discoverable sessions reported after Worker startup |
| Continuity Class | process-survival / reattach / checkpoint / reconstruct semantics |
| Command Sequence | monotonic per-session ordered control number |

---

# 7. Target Architecture

```text
┌────────────────────────────────────────────────────────────┐
│ SmartAIHub Control Plane                                   │
│                                                            │
│ worker_jobs / events / leases / fencing / approval / audit │
│ placement / capability resolver / billing                  │
└───────────────────────┬────────────────────────────────────┘
                        │
                  authenticated control
                        │
                        ▼
┌────────────────────────────────────────────────────────────┐
│ SmartAIHub Worker / Runner                                 │
│                                                            │
│  Runner Supervisor                                         │
│  ├─ Control Channel                                        │
│  ├─ Heartbeat / Resource Advertisement                     │
│  ├─ Session Manager                                        │
│  ├─ Recovery Reconciler                                    │
│  ├─ Per-Session Command Lanes                              │
│  ├─ Stream Broker Adapter                                  │
│  ├─ Workspace Manager                                      │
│  └─ Watchdog                                               │
│                                                            │
│        ┌──────────────────────────────┐                    │
│        │ Session Driver Registry      │                    │
│        └─┬─────────┬─────────┬────────┘                    │
│          │         │         │                             │
│          ▼         ▼         ▼                             │
│      PTY Host   ACP Host   Cloud Adapter ...               │
└──────────┼─────────┼─────────┼─────────────────────────────┘
           │         │         │
           ▼         ▼         ▼
       Codex CLI   Agent RPC  Container/Sandbox
       Claude Code
       builds/tests
```

---

# 8. Execution Session Data Model

## 8.1 Server-side projection

A new table MAY be introduced:

`execution_sessions`

Recommended fields:

```text
id                         uuid primary key
tenant_id                  tenant scope
worker_job_id              canonical job FK
run_id                     nullable higher-level run reference
runner_id                  registered Runner
runner_instance_id         specific Worker lifecycle
session_driver             pty | acp | process | container | sandbox | remote
execution_location         local | edge | cloud | provider
continuity_class           process_persistent | reattachable | checkpointable |
                           reconstructable | ephemeral
session_generation         monotonic integer
authority_epoch            canonical fencing epoch observed by session
placement_epoch            placement generation
state                      normalized session state
desired_state              desired control-plane state
resource_class             lightweight | cpu | memory | gpu | interactive | custom
workspace_ref              opaque reference
checkpoint_ref             opaque reference
external_session_ref       provider/container opaque handle
process_identity_digest    nullable
session_host_version       nullable
driver_protocol_version    nullable
authority_grant_id         nullable opaque grant id
authority_grant_key_id      nullable signing/verification key id
authority_not_after         nullable hard authority deadline
authority_enforcement      command_only | process_pause | mediated_effects | sandbox_enforced
job_control_revision       canonical control-plane revision observed by session
last_recovery_operation_id nullable idempotent recovery/adoption operation
workspace_generation       nullable monotonic workspace-writer generation
checkpoint_manifest_ref    nullable committed checkpoint-manifest reference
checkpoint_manifest_digest nullable integrity digest
driver_trust_tier          platform_signed | admin_trusted | user_untrusted
resource_enforcement       advisory | os_limited | sandbox_limited | container_limited
required_safety_features   bounded required-feature set / bitset
input_authority_epoch      nullable interactive-input ownership generation
command_seq_applied        monotonic integer
session_event_seq_applied  monotonic integer
output_spool_seq           monotonic stream/spool sequence
exit_receipt_ref           nullable opaque receipt reference
last_seen_at
last_output_at
created_at
updated_at
terminated_at
exit_code
exit_reason
recovery_policy_json
metadata_json              non-secret bounded metadata only
```

## 8.2 Event ownership

Canonical execution decisions SHALL continue to emit into `worker_job_events`.

Recommended additional event types:

```text
execution_session.created
execution_session.starting
execution_session.running
execution_session.detached
execution_session.attach_requested
execution_session.attached
execution_session.orphaned
execution_session.recovery_inventory_seen
execution_session.recovery_authorized
execution_session.recovered
execution_session.adopted
execution_session.fence_advanced
execution_session.stale_session_quiesced
execution_session.checkpoint_created
execution_session.reconstruction_started
execution_session.reconstruction_completed
execution_session.lost
execution_session.terminated
execution_session.force_killed
execution_session.stream_attached
execution_session.stream_detached
execution_session.command_replayed
execution_session.command_rejected_stale
execution_session.authority_grant_issued
execution_session.authority_expired
execution_session.exit_receipt_recorded
execution_session.local_outbox_flushed
execution_session.protocol_incompatible
execution_session.workspace_quarantined
execution_session.admission_rejected
```

A second competing canonical event stream SHALL NOT be created.

High-volume metrics/terminal telemetry MAY use separate non-authoritative storage.

---

# 9. Session State Machine

Canonical normalized session states:

```text
REQUESTED
  ↓
PROVISIONING
  ↓
STARTING
  ↓
RUNNING
  ├──→ PAUSED
  ├──→ WAITING_APPROVAL
  ├──→ WAITING_CREDENTIAL_REISSUE
  ├──→ DETACHED
  ├──→ QUIESCING
  ├──→ DRAINING
  └──→ TERMINATING

PAUSED
  ├──→ RUNNING
  ├──→ RECOVERING
  ├──→ DRAINING
  └──→ TERMINATING

WAITING_APPROVAL
  ├──→ RUNNING                 only after canonical approval
  ├──→ QUIESCING
  └──→ TERMINATING

WAITING_CREDENTIAL_REISSUE
  ├──→ RUNNING                 only after a fresh authorized credential grant
  ├──→ QUIESCING
  └──→ TERMINATING

DETACHED
  ├──→ RECOVERING
  ├──→ QUIESCING
  └──→ LOST

ORPHANED
  ├──→ RECOVERING
  ├──→ QUIESCING
  ├──→ RECONSTRUCTING
  └──→ LOST

RECOVERING
  ├──→ RUNNING                 only after recovery decision + authority proof
  ├──→ PAUSED
  ├──→ WAITING_APPROVAL
  ├──→ WAITING_CREDENTIAL_REISSUE
  ├──→ INCOMPATIBLE
  ├──→ QUIESCING
  ├──→ RECONSTRUCTING
  └──→ LOST

INCOMPATIBLE
  ├──→ RECOVERING              after a compatible Worker/driver becomes available
  ├──→ CHECKPOINTING           if compatible checkpoint path exists
  ├──→ QUIESCED
  └──→ TERMINATING

QUIESCING
  ├──→ QUIESCED
  └──→ TERMINATING             when safe pause cannot be established

QUIESCED
  ├──→ RECOVERING
  ├──→ RECONSTRUCTING
  └──→ TERMINATING

DRAINING
  ├──→ DETACHED                process-persistent handoff
  ├──→ CHECKPOINTING
  ├──→ QUIESCING
  └──→ TERMINATING

CHECKPOINTING
  ├──→ QUIESCED
  ├──→ RECONSTRUCTING
  └──→ LOST                    only after checkpoint failure is reconciled

RECONSTRUCTING
  ├──→ RUNNING                 only as a new session generation
  ├──→ WAITING_CREDENTIAL_REISSUE
  └──→ LOST

TERMINATING
  └──→ TERMINATED
```

`COMPLETED`, `FAILED`, `CANCELLED` remain job-level outcomes. Session termination is not automatically job finality.

## 9.1 Transition guards

The transition graph is normative. Implementations SHALL reject state changes that do not satisfy the following guards:

1. `RUNNING` after recovery/adoption requires:
   - a current canonical `worker_job` that is non-terminal;
   - matching `session_generation`;
   - matching `placement_epoch`;
   - accepted `authority_epoch`;
   - a non-expired Execution Authority Grant where the workload requires authority;
   - required approval/credential gates satisfied.
2. `WAITING_APPROVAL → RUNNING` SHALL require the exact canonical approval decision; attach/restart is never approval.
3. `WAITING_CREDENTIAL_REISSUE → RUNNING` SHALL require freshly authorized credentials; presence of old inherited process secrets is insufficient.
4. `RECONSTRUCTING → RUNNING` SHALL create a new `session_generation`.
5. `QUIESCED → RUNNING` SHALL pass through `RECOVERING` unless the original control connection never lost canonical authority.
6. `INCOMPATIBLE` SHALL be fail-safe: an older Worker MUST NOT attach in a mode that silently omits a safety feature required by the session.
7. Canonical cancellation/revocation may transition any non-terminal session toward `QUIESCING` or `TERMINATING`.
8. Job terminality SHALL prevent any later stale recovery inventory, delayed event, or old command from returning a session to `RUNNING`.

## 9.2 Desired state vs observed state

`desired_state` is control-plane intent; `state` is observed/reconciled execution state.

The Worker SHALL NOT set `desired_state` locally. The control plane SHALL NOT assume `state=RUNNING` merely because the desired state is RUNNING.

Examples:

```text
desired_state = TERMINATED
state         = DETACHED
→ UI: Stop requested / awaiting Runner enforcement

desired_state = RUNNING
state         = RECOVERING
→ UI: Reconnecting to execution

desired_state = PAUSED
state         = QUIESCING
→ UI: Pausing safely
```

A monotonically increasing `job_control_revision` SHALL accompany canonical desired-state changes so stale recovery or delayed control-plane responses cannot resurrect older intent.

---

# 10. Continuity Classes

Each Session Driver SHALL declare one of:

## 10.1 PROCESS_PERSISTENT

The actual process can survive Worker restart.

Examples:

- detached local session host;
- persistent local PTY broker.

Guarantee:

```text
Worker restart
  ≠ process restart
```

## 10.2 REATTACHABLE

The underlying runtime/provider maintains a session independently and gives an attach handle.

Examples:

- remote agent server;
- durable provider-managed session;
- future persistent container handle.

## 10.3 CHECKPOINTABLE

Exact process may disappear, but runtime can restore from a checkpoint.

## 10.4 RECONSTRUCTABLE

Session can be rebuilt from durable workspace/state but not continued exactly.

## 10.5 EPHEMERAL

No reliable continuation mechanism.

The scheduler MAY prefer stronger continuity for expensive/long-running workloads.

## 10.6 Explicit continuity guarantee vector

The summary class above SHALL be accompanied by explicit guarantees so the product does not overclaim durability. A driver SHOULD report:

```text
survives_viewer_disconnect
survives_control_disconnect
survives_worker_restart
survives_user_logout
survives_host_reboot
survives_runtime_instance_replacement
supports_same_host_reattach
supports_cross_host_resume
checkpoint_durability
maximum_detached_duration
external_handle_expires_at
```

`PROCESS_PERSISTENT` therefore means the process may survive the Worker lifecycle under the declared scope; it does **not** imply survival across OS reboot, user logout, machine loss or cross-host migration unless those guarantees are separately certified.

---

# 11. Session Driver Interface

A normalized interface SHALL exist.

Illustrative contract:

```ts
interface ExecutionSessionDriver {
  describeCapabilities(): SessionDriverCapabilities;

  create(input: CreateSessionInput): Promise<CreateSessionResult>;

  probe(handle: SessionHandle): Promise<SessionProbe>;

  attach(input: AttachSessionInput): Promise<AttachedSession>;

  detach(session: AttachedSession): Promise<void>;

  sendCommand(
    session: AttachedSession,
    command: OrderedSessionCommand
  ): Promise<CommandReceipt>;

  snapshot?(
    session: AttachedSession,
    options: SnapshotOptions
  ): Promise<SessionSnapshot>;

  checkpoint?(
    session: AttachedSession,
    options: CheckpointOptions
  ): Promise<CheckpointReceipt>;

  pause?(session: AttachedSession): Promise<void>;

  resume?(session: AttachedSession): Promise<void>;

  terminate(
    session: AttachedSession,
    mode: "graceful" | "force"
  ): Promise<TerminationReceipt>;
}
```

Drivers SHALL NOT decide canonical job success/failure.

---

# 12. Local Durable Session Host

## 12.1 Purpose

For Windows/macOS/Linux Worker installations, SmartAIHub SHOULD implement a small per-session host process.

Target:

```text
Worker process
     │
     ├─ starts Session Host
     │
     ▼
Session Host
     │ owns
     ├─ PTY / ConPTY
     ├─ child process
     ├─ bounded terminal history
     ├─ local session state
     └─ authenticated IPC endpoint
```

The Session Host SHALL be able to continue after the main Worker exits unexpectedly.

### 12.1.1 OS lifecycle contract

A Session Host is only useful if the operating system actually allows it to outlive the Worker. Each supported platform SHALL have an explicit certified launch/containment strategy.

**Windows**

- Session Host SHALL not be accidentally terminated by a Worker Job Object configured with `KILL_ON_JOB_CLOSE`.
- Session Host SHOULD own the child process tree through its own Job Object or equivalent containment primitive so cancellation can terminate descendants deterministically.
- Named Pipe security descriptors SHALL restrict attach access to the intended OS identity.
- Worker/Desktop update logic SHALL account for Windows executable replacement rules. A versioned Session Host binary or equivalent safe deployment strategy SHOULD be used so an in-use helper is never overwritten underneath a surviving session.

**Linux/macOS**

- Session Host SHALL run in an independent process session/process group as required by the platform.
- Parent-death behavior SHALL NOT kill the Session Host when the Worker exits.
- The Session Host SHALL own the child process group so graceful and force termination can cover descendants.
- Unix Domain Socket directory/file modes SHALL restrict access to the intended OS identity.

The platform implementation MUST prove these properties with real-process integration tests; unit mocks are insufficient.

## 12.1.2 Process-tree termination

Termination SHALL target the owned execution tree rather than a single PID. The normalized termination policy SHOULD support:

```text
interrupt / polite stop
  → configurable grace period
terminate process tree
  → configurable grace period
force kill process tree
```

A successful termination receipt SHALL identify which escalation stage completed.

## 12.2 IPC

Preferred IPC:

```text
Linux/macOS → Unix Domain Socket
Windows     → Named Pipe
fallback    → authenticated loopback TCP
```

IPC MUST be local-only unless a future remote-control feature explicitly changes the threat model.

Every IPC attach SHALL negotiate:

```text
session_host_protocol_version
worker_supported_protocol_range
session_id
session_generation
runner identity
authority grant / epoch
nonce or channel freshness proof
```

An incompatible Worker SHALL place the session in `INCOMPATIBLE` / safe-detached state and SHALL NOT kill the workload merely because attachment failed. Attach credentials SHOULD rotate after successful recovery/adoption so a copied stale local credential cannot remain indefinitely useful.

## 12.3 Session Host responsibilities

The host SHALL own only session-level mechanics:

- child process;
- PTY / ConPTY;
- stdin/stdout;
- resize;
- bounded output buffer;
- process-exit detection;
- local session manifest updates;
- attach authentication;
- graceful termination.

The host SHALL NOT:

- schedule work;
- renew canonical job authority independently;
- approve privileged operations;
- change billing state;
- mark the worker job completed.

## 12.4 Session Host trust / privilege boundary

The child workload is not automatically trusted merely because it was launched by SmartAIHub. A child process that can rewrite Session Host state, steal attach credentials, replace helper binaries, or kill the authority-enforcing host can defeat recovery/fencing semantics.

Local implementations SHALL therefore separate **mutable workload state** from **execution-control state**.

Requirements:

- Session Registry, authority grants, attach credentials and host journals MUST live outside the mutable repository/worktree;
- workload-controlled paths MUST NOT determine the Session Host binary path, IPC endpoint path, registry database path or trust-root path;
- registry/IPC paths SHALL be canonicalized and protected against path traversal, symlink/junction/reparse-point substitution and tenant-crossing aliases;
- child processes SHALL receive no write permission to execution-control state where the OS can enforce that separation;
- platform installation SHOULD run the Worker/Session Host under a protected service identity or equivalent privileged helper when high-assurance fencing is required;
- if Worker, Session Host and child necessarily share the same unrestricted OS identity, the driver SHALL report the weaker enforcement/trust level and policy MUST NOT advertise `SANDBOX_ENFORCED`;
- Session Host death caused by the child or local user SHALL be treated as an execution-control failure and reconciled, never interpreted as successful job completion.

For multi-tenant/shared Runners, OS/container isolation between tenants is REQUIRED; filesystem naming alone is insufficient.

---

# 13. Local Session Manifest

Each local durable session SHALL have a versioned manifest.

Example:

```json
{
  "schema_version": 1,
  "session_id": "ses_...",
  "worker_job_id": "job_...",
  "runner_id": "runner_...",
  "session_generation": 3,
  "authority_epoch": 18,
  "placement_epoch": 5,
  "driver": "pty",
  "continuity_class": "process_persistent",
  "session_host_version": "...",
  "driver_protocol_version": 1,
  "authority_grant_id": "grant_...",
  "authority_not_after": "2026-10-04T12:00:45Z",
  "workspace_generation": 3,
  "process": {
    "pid": 12345,
    "started_at": "2026-10-04T12:00:00Z",
    "host_boot_id": "...",
    "identity_digest": "..."
  },
  "ipc": {
    "kind": "named_pipe",
    "endpoint": "opaque-local-reference"
  },
  "workspace_ref": "workspace_...",
  "started_at": "2026-10-04T12:00:00Z",
  "last_state": "RUNNING"
}
```

The manifest MUST NOT include:

- API keys;
- OAuth refresh tokens;
- private keys;
- plaintext Secret Broker material;
- long-lived bearer tokens.

Attach credentials SHALL be stored separately with strict permissions or derived through an OS-protected secret mechanism.

## 13.1 Crash-consistent local session registry

Per-session JSON alone is not sufficient unless update semantics are crash-safe. The local implementation SHALL provide a crash-consistent Session Registry using either an embedded transactional store or atomic file/journal primitives. It MUST provide:

- atomic create/update/terminal transitions;
- write-to-temp + fsync + atomic rename or equivalent transactional durability;
- checksum/schema validation;
- exclusive session ownership lock for metadata mutation;
- monotonic `command_seq` and `session_event_seq` watermarks;
- bounded durable command-receipt dedupe history;
- terminal exit receipt persistence;
- safe recovery from a partially written update;
- versioned schema migration.

A corrupt record SHALL be quarantined, not silently overwritten.

## 13.2 Durable terminal exit receipt and local outbox

A Session Host may finish while the Worker or control plane is unavailable. Before the host exits, it SHALL durably record a terminal receipt containing at minimum:

```text
session_id
session_generation
process identity
started_at
finished_at
exit_code / termination reason
last accepted authority epoch
last command sequence
last session-event sequence
usage summary where available
output/artifact digests or refs
```

The receipt does **not** mark the canonical job completed. On reattachment/recovery the Worker forwards the receipt through a durable local outbox and the control plane reconciles it against current `worker_jobs` authority and completion contracts.

Runner-originated critical events SHALL use at-least-once delivery with server-side deduplication by stable event id/session event sequence. A control disconnect MUST NOT make exit, cancellation acknowledgement, recovery or usage events disappear.

---

# 14. Process Identity & PID Reuse Defense

PID alone SHALL NOT identify a surviving session.

A process identity SHALL include enough material to distinguish PID reuse.

Recommended tuple:

```text
host_boot_id
process_id
process_start_time
session_id
session_generation
random process nonce
```

A digest MAY be stored.

Recovery SHALL reject a process if identity evidence does not match the durable session record.

---

# 15. Recovery Inventory Protocol

After Worker startup/restart:

```text
Worker starts
   ↓
creates new runner_instance_id
   ↓
scans local/external session handles
   ↓
probes each handle
   ↓
builds RecoveryInventory
   ↓
sends inventory to control plane
   ↓
control plane reconciles with worker_jobs
   ↓
returns per-session recovery decision
```

Inventory entry:

```text
session_id
worker_job_id
session_generation
authority_epoch_observed
placement_epoch_observed
driver
continuity_class
process_identity_digest
local_state
alive
attachable
checkpoint_ref
last_output_at
session_host_version
driver_protocol_version
authority_not_after
last_command_seq_applied
last_session_event_seq
terminal_receipt_present
```

## 15.1 Concurrent recovery / adoption CAS

Recovery may be processed by multiple control-plane instances, retries, or duplicate inventories. Adoption SHALL therefore be a database-atomic compare-and-swap operation, not a best-effort application-layer check.

Every recovery request/decision SHALL bind:

```text
recovery_operation_id
worker_job_id
session_id
session_generation
expected_job_control_revision
expected_authority_epoch
expected_placement_epoch
target_runner_id
target_runner_instance_id
```

The control plane SHALL atomically verify the expected revision/epochs and perform any authority/placement transition in one transaction or equivalent linearizable operation.

Rules:

- only one competing adoption may advance the same canonical execution slot;
- duplicate `recovery_operation_id` returns the same decision/receipt;
- a losing concurrent recovery receives `STALE_DECISION` / fresh canonical state and MUST NOT attach with mutation authority;
- a delayed recovery decision whose `job_control_revision` is no longer current is invalid even if its authority epoch once matched;
- canonical job terminality wins over any in-flight adoption;
- recovery decisions SHOULD include an expiry/deadline so an unconsumed old decision cannot be replayed indefinitely.

A server cluster SHALL NOT rely on "single active API instance" for correctness.

---

# 16. Recovery Decision Matrix

The control plane SHALL return one of:

| Decision | Meaning |
|---|---|
| `REATTACH` | same Runner authority remains valid |
| `ADOPT_WITH_NEW_FENCE` | surviving execution may continue only after authority epoch is advanced |
| `PAUSE_AND_ATTACH` | attach but do not continue mutation |
| `QUIESCE` | stop accepting mutation; preserve state |
| `CHECKPOINT_AND_STOP` | preserve recovery point, then stop |
| `RECONSTRUCT` | old process/session cannot be reused; create new generation |
| `TERMINATE_STALE` | surviving process is no longer authoritative |
| `MARK_LOST` | no valid recovery exists |
| `IGNORE_FOREIGN` | session does not belong to this Runner/tenant/control plane |

The Worker SHALL NOT infer `ADOPT_WITH_NEW_FENCE` locally.

---

# 17. Fencing & Split-Brain Prevention

This is a mandatory difference between simple session persistence and SmartAIHub production execution.

Consider:

```text
Runner A loses network
  │
  └─ process remains alive

Control plane lease expires
  │
  └─ job assigned to Runner B

Runner A reconnects
```

Without fencing:

```text
Runner A mutates repo
Runner B mutates repo
=> split brain
```

Required behavior:

```text
authority_epoch = monotonic

Runner A owns epoch 17
lease expires

Runner B receives epoch 18

Runner A reconnects with epoch 17
        ↓
mutation commands rejected
        ↓
session quiesced / checkpointed / terminated
```

Every privileged session command SHALL carry:

```text
worker_job_id
session_id
session_generation
authority_epoch
authority_grant_id
job_control_revision
input_authority_epoch?
command_seq
idempotency_key
```

The session host SHALL reject stale authority where locally enforceable.

## 17.1 Execution Authority Grant

Fencing on incoming commands alone is insufficient because an autonomous child process can continue mutating files or external systems without receiving another command. Every mutation-capable durable session SHALL therefore receive a bounded **Execution Authority Grant**.

The grant SHALL bind at minimum:

```text
grant_id
worker_job_id
session_id
session_generation
runner_id / runner_instance scope
authority_epoch
placement_epoch
allowed effect class
issued_at
authority_duration / not_after
```

Grant integrity MUST be authenticated. A control-plane-signed grant verifiable by the Session Host is preferred; an equivalent design is acceptable if a stale Worker cannot manufacture a later authority epoch/deadline by itself.

The Session Host SHALL convert the granted duration into a monotonic local deadline and SHALL NOT depend only on wall-clock time. Clock offset/skew SHALL be measured or bounded during grant issuance/renewal.

Before the hard authority deadline, the Worker renews the grant while the canonical lease remains valid. If renewal stops, the Session Host SHALL execute the session's disconnected policy at or before the deadline.

## 17.2 Authority enforcement levels

Each driver SHALL report the strongest enforcement it can provide:

```text
COMMAND_ONLY       rejects stale Worker commands only
PROCESS_PAUSE      can stop the whole child process tree at authority expiry
MEDIATED_EFFECTS   external side effects pass through a broker that validates authority per call
SANDBOX_ENFORCED   runtime/sandbox enforces policy around process effects
```

Mutation-heavy development SHOULD require at least `PROCESS_PAUSE`; high-risk external effects SHOULD use `MEDIATED_EFFECTS` or stronger where practical. A session using only `COMMAND_ONLY` SHALL NOT be advertised as strongly fenced while an autonomous process can continue unmediated mutation.

## 17.3 In-flight effect limitation

No design can retroactively cancel an external side effect that already crossed its commit boundary before authority expired. Therefore:

- privileged side effects SHOULD be mediated through SmartAIHub capability/MCP/API gateways where feasible;
- the gateway SHALL validate current authority/approval at the side-effect boundary;
- direct unrestricted network/shell access lowers the enforceable authority level and MUST be reflected in policy/capability metadata.

## 17.4 Authority-grant trust root, rotation and anti-rollback

A "signed grant" is not sufficient unless Session Hosts have a deterministic trust-root lifecycle.

Execution Authority Grants SHALL include:

```text
grant_id
key_id
signature_algorithm
issued_at
not_after / bounded duration
authority_epoch
placement_epoch
job_control_revision
required_safety_features
signature / MAC proof
```

Normative requirements:

- verification keys/trust roots SHALL be provisioned through an authenticated SmartAIHub installation/registration path, not fetched from the untrusted child process or mutable workspace;
- Session Hosts SHALL pin an allowed trust-root/key set and reject unknown signing keys unless introduced by an authenticated rotation chain;
- key rotation SHALL support a bounded overlap window so old live Session Hosts can verify newly issued grants during controlled upgrade;
- revoked/retired keys SHALL not be accepted after the configured overlap/retirement boundary;
- the Worker SHALL NOT be able to extend authority by editing grant payload fields;
- accepted `(authority_epoch, job_control_revision, not_after)` SHALL be monotonic-safe: an older grant can never lower the fence or extend authority;
- grant verification failure SHALL cause fail-safe quiesce/termination according to policy.

For a local-only keyed-MAC design, the key MUST be unavailable to the child workload and SHOULD be stored with OS-protected credentials. A platform signature verified by the Session Host is preferred when feasible.

## 17.5 Suspend/resume-safe authority expiry

A simple process-monotonic clock may stop advancing during system sleep/suspend on some platforms. That could unintentionally extend an authority grant for hours after a laptop resumes.

Therefore the authority deadline implementation SHALL be **suspend-safe**:

- use a platform elapsed-time source that includes suspend where available; or
- combine a signed absolute `not_after` with bounded clock-skew evidence and a monotonic timer; and
- on resume/wake, require fresh authority confirmation before mutation if the system cannot prove that the previous grant remains inside its valid interval.

The Session Host SHALL treat long sleep/resume, hibernation, VM snapshot restore, or material clock discontinuity as an authority-risk event.

Default behavior after an ambiguous time discontinuity:

```text
mutation-capable session
    → QUIESCING / QUIESCED
    → obtain fresh authority
    → RECOVERING
    → RUNNING only after validation
```

Changing the wall clock backwards MUST NOT extend execution authority.

---

# 18. Disconnected Execution Policy

Not all workloads should behave identically during control-plane disconnection.

Each job/session SHALL resolve a `disconnected_execution_policy`.

Supported policy classes:

## 18.1 `PAUSE_ON_LEASE_RISK`

Default for mutation-heavy development work.

When canonical authority can no longer be proven within the allowed lease window:

- stop sending new agent instructions;
- pause if supported;
- otherwise quiesce at the safest boundary;
- preserve workspace;
- await recovery.

## 18.2 `TERMINATE_ON_LEASE_EXPIRY`

For high-risk execution where split brain is unacceptable and pause is unavailable.

## 18.3 `CONTINUE_BOUNDED`

For safe deterministic compute that has no external mutations.

Requires:

- local deadline;
- no privileged external side effects;
- output settlement withheld until canonical reconciliation.

## 18.4 `CONTINUE_READ_ONLY`

For observation/research/read-only tasks where side effects are prohibited.

Default policy MUST be conservative.

Every disconnected policy SHALL include a bounded `authority_grant_ttl` / hard local `authority_not_after`. "Continue" never means indefinite offline execution. Mutation-heavy jobs SHOULD use a short grant window; read-only or deterministic compute MAY receive a longer bounded window according to policy.

If the driver cannot safely pause at authority expiry, the resolved policy SHALL degrade to terminate or to a sandbox/capability mode that can enforce the boundary.

User-requested cancellation while a Runner is offline is considered accepted by the control plane immediately, but the UI MUST distinguish `Stop requested` from `Stopped`. The durable Session Host shall stop no later than the applicable authority deadline unless an earlier local control channel can reach it.

---

# 19. Per-Session Ordered Command Lane

Each session SHALL have a serialized command stream.

Examples:

```text
CREATE
ATTACH
SEND_PROMPT
RESIZE
PAUSE
APPROVE_CONTINUATION
RESUME
CHECKPOINT
CANCEL
TERMINATE
```

Commands SHALL contain:

```text
command_id
command_seq
session_id
session_generation
authority_epoch
idempotency_key
issued_at
deadline
payload
```

Rules:

1. `command_seq` is monotonic per active session generation.
2. A duplicate `command_id` returns the existing receipt.
3. A lower-than-applied `command_seq` SHALL NOT replay side effects.
4. Gaps MAY be buffered briefly or rejected according to command type.
5. `TERMINATE` / emergency revoke MAY use a priority path but MUST still be auditable.
6. Commands to different sessions may execute concurrently.
7. The applied command watermark and bounded dedupe receipts SHALL survive Worker restart.
8. Transport semantics are at-least-once; exactly-once side effects are achieved by idempotent application, not assumed from the network.
9. A terminal/cancel tombstone SHALL prevent an old delayed `START`, `RESUME` or prompt command from resurrecting a terminated generation.
10. On sequence disagreement after reconnect, Worker and Session Host SHALL run an explicit resynchronization handshake; they SHALL NOT guess missing commands.

---

# 20. Command Receipt

Every side-effecting session command SHALL return a normalized receipt.

```text
command_id
session_id
session_generation
command_seq
authority_epoch
status:
  applied
  duplicate
  rejected_stale_authority
  rejected_wrong_generation
  rejected_invalid_state
  timed_out
  failed
applied_at
result_digest
error_code
```

This receipt MAY feed Spec 277 evidence/provenance presentation.

---

# 21. Runner Instance Identity

A registered Runner and a running Worker process are not the same identity.

Required:

```text
runner_id            stable machine/registration identity
runner_instance_id   new UUID per Worker process lifecycle
host_boot_id         OS boot identity where available
```

This permits the system to distinguish:

```text
same machine + Worker restarted
same machine + OS rebooted
different Worker claiming old session
cloned disk/image
stale Runner process
```

---

# 22. Runner Capability Advertisement

The existing simple concurrent-job notion SHALL be extended into a normalized resource/capability advertisement.

Example:

```json
{
  "runner_id": "runner_...",
  "runner_instance_id": "ri_...",
  "platform": {
    "os": "windows",
    "arch": "x86_64"
  },
  "observation": {
    "snapshot_seq": 1042,
    "observed_at": "2026-10-04T12:00:00Z",
    "expires_at": "2026-10-04T12:00:30Z"
  },
  "resources": {
    "cpu_logical": 16,
    "memory_total_mb": 65536,
    "memory_available_mb": 32768,
    "disk_available_mb": 500000,
    "gpu": [
      {
        "vendor": "nvidia",
        "model": "RTX ...",
        "vram_total_mb": 16384,
        "vram_available_mb": 12000
      }
    ]
  },
  "capacity": {
    "max_sessions": 8,
    "active_sessions": 3,
    "max_gpu_sessions": 2
  },
  "session_drivers": [
    "pty",
    "acp",
    "process"
  ],
  "capabilities": [
    "git",
    "docker",
    "browser",
    "comfyui",
    "ollama"
  ],
  "agents": [
    "codex",
    "claude-code"
  ],
  "isolation_classes": [
    "host_process",
    "git_worktree"
  ]
}
```

Secrets or sensitive local inventory SHALL NOT be advertised unnecessarily.

Resource/capability advertisements SHALL carry freshness metadata. Placement SHALL reject or downgrade stale snapshots rather than assuming old free-memory/VRAM values remain valid. For shared/managed runners, the control plane MAY require stronger runner attestation than for a user's personal runner.

---

# 23. Resource-Aware Placement Integration

Spec 278 SHALL expose data to the existing placement mechanism.

It SHALL NOT become a second scheduler.

Placement MAY consider:

```text
required capability
required agent/harness
CPU
RAM
GPU/VRAM
disk
interactive terminal requirement
workspace locality
repository locality
existing session affinity
user preference
execution cost
security/isolation class
network policy
continuity requirement
current load
```

## 23.1 Two-phase placement and local admission

A control-plane placement decision is not sufficient to reserve rapidly changing host resources. Launch SHOULD use:

```text
1. Select candidate Runner from fresh advertisement
2. PREPARE / ADMISSION request with required resource envelope
3. Runner atomically reserves local capacity and returns reservation_id + expiry
4. Control plane binds placement epoch to that reservation
5. CREATE session consumes the reservation exactly once
6. Failed/expired reservation is released and placement retries elsewhere
```

This closes the race where two jobs are scheduled using the same stale free-memory/VRAM snapshot. Local admission SHALL be authoritative for host resource availability, while the control plane remains authoritative for which job is allowed to execute.

Reservation records SHALL have TTL, idempotency and explicit release semantics.

Example:

```text
Job:
  requires = codex + git + >=16GB RAM
  prefers = repository already cached
  continuity = process_persistent preferred

Candidate A:
  32GB free
  codex installed
  repo cached
  1/6 active
        ↓
preferred

Candidate B:
  8GB free
        ↓
ineligible
```

---

# 24. Workspace Continuity

Execution Session and Workspace SHALL be separate concepts.

Possible workspace types:

```text
none
host_directory
git_worktree
container_filesystem
sandbox_filesystem
remote_workspace
```

For development runs:

```text
shared repository cache
        │
        ├─ session A → worktree A
        └─ session B → worktree B
```

Git worktree provides mutation separation between agents, not security isolation.

Workspace recovery metadata SHOULD include:

```text
workspace_ref
workspace_generation
writer_session_id
writer_authority_epoch
repository_ref
branch
base_commit
current_commit
dirty_state_digest
artifact_refs
checkpoint_refs
```

## 24.1 Workspace writer fencing

A surviving stale process and a replacement session MUST NOT both receive write authority to the same mutable workspace. Before a new generation writes, the system SHALL prove one of:

1. previous writer is quiesced/terminated; or
2. workspace-level exclusive writer lease/fence has advanced and is enforceable; or
3. the new generation receives a new isolated workspace/worktree reconstructed from a safe snapshot.

If exclusivity cannot be proven, the previous workspace SHALL be quarantined read-only for salvage/evidence and the replacement SHALL use a new workspace generation.

Uncommitted work from a fenced session MAY be harvested as a patch/snapshot only after it is treated as untrusted recovery evidence; it SHALL NOT be silently merged into the authoritative branch.

## 24.2 Workspace cleanup and retention

Session/workspace cleanup SHALL occur only after canonical terminality, required artifact/evidence capture and retention policy allow it. Abandoned session directories SHALL have bounded retention and disk quotas. Cleanup SHALL never delete an active or unreconciled workspace solely because its Worker process disappeared.

## 24.3 Checkpoint publication, integrity and restore lineage

`checkpoint_ref` SHALL refer only to a **committed** checkpoint. A partially uploaded archive or mutable directory is not a valid recovery checkpoint.

Each checkpoint SHALL have a versioned manifest containing at minimum:

```text
checkpoint_id
schema_version
worker_job_id
session_id
source_session_generation
workspace_generation
authority_epoch_at_capture
base_repository_commit / source revision where applicable
parent_checkpoint_id?
created_at
driver/runtime identity
environment/toolchain fingerprint where required
content object refs
content digests
manifest digest
encryption/storage metadata ref
restore requirements / required_safety_features
```

Checkpoint publication SHALL use a prepare/commit protocol:

```text
PREPARING
  → write immutable content objects
  → calculate/verify digests
  → durably store manifest
  → COMMITTED
```

Only `COMMITTED` checkpoints are eligible for reconstruction.

Restore SHALL verify:

- tenant/job/session scope;
- manifest schema and required features;
- manifest/content digest integrity;
- checkpoint lineage;
- expected source/base revision;
- driver/toolchain compatibility where material;
- storage-object completeness;
- decryption/access authorization.

A corrupt or incomplete checkpoint SHALL be quarantined and SHALL NOT silently fall back to "best effort" restore. If a stale checkpoint is intentionally used, the reconstruction event MUST record the rollback point and any discarded work.

Checkpoint and artifact content SHALL use the existing approved encrypted storage/retention mechanisms; Spec 278 does not create a parallel secret/artifact store.

---

# 25. Session-Aware Runner Upgrade

Runner update flow SHALL become:

```text
ONLINE
  ↓
DRAINING
  ↓
reject new sessions
  ↓
classify existing sessions

PROCESS_PERSISTENT
  → detach
  → update Worker
  → restart Worker
  → recovery inventory
  → reattach

CHECKPOINTABLE
  → checkpoint
  → stop
  → update
  → restore

EPHEMERAL
  → wait for completion
  OR explicit approved interruption
```

A Worker SHALL NOT silently terminate active non-recoverable sessions solely to self-update.

## 25.1 Session Host protocol compatibility

Worker and Session Host SHALL publish protocol versions and compatible ranges. Before upgrade or rollback, the updater MUST determine whether the new Worker can reattach to every surviving host.

Rules:

- existing Session Hosts MAY continue running an older compatible host binary;
- Worker rollback SHALL NOT proceed if it would strand active hosts without an attach path;
- incompatible sessions SHALL remain safely detached/quiesced and surface an actionable diagnostic rather than being killed automatically;
- versioned Session Host binaries SHALL be garbage-collected only after no active/recoverable session references them.

This requirement is especially important on Windows, where an in-use helper executable may not be safely replaced in place.

## 25.2 Required safety-feature negotiation and downgrade prevention

Protocol-version overlap alone is insufficient: an older Worker may understand the wire format while lacking a newly required safety control.

Each durable session SHALL persist a bounded `required_safety_features` set, for example:

```text
AUTHORITY_GRANT_V1
SUSPEND_SAFE_EXPIRY
WORKSPACE_WRITER_FENCE
DURABLE_COMMAND_DEDUPE
INPUT_AUTHORITY_V1
CHECKPOINT_MANIFEST_V1
```

On attach/recovery:

```text
required_safety_features
    ⊆ Worker supported features
    ∩ Session Host supported features
    ∩ Driver certified features
```

MUST hold.

If not, the session transitions to `INCOMPATIBLE` / safe-detached state.

Rules:

- unknown **required** feature bits fail closed;
- unknown optional feature bits may be ignored;
- manifest/schema migration SHALL preserve the original until the new version is durably committed;
- rollback SHALL not migrate durable session state destructively to an older schema;
- capability negotiation receipts SHOULD be persisted for diagnostics/audit;
- no compatibility shim may silently downgrade an authority, isolation, approval or credential-revocation requirement.

---

# 26. Runner Supervisor

The Worker SHALL supervise its internal services independently where feasible.

Recommended supervision tree:

```text
Runner Supervisor
├─ Control Connection
├─ Heartbeat / Advertisement
├─ Session Manager
├─ Recovery Reconciler
├─ Workspace Manager
├─ Stream Broker Adapter
├─ Capability Probe
├─ Watchdog
└─ Session Reconciler
```

Failure of one service SHOULD NOT automatically kill healthy execution sessions.

---

# 27. Watchdog

The Worker Watchdog SHOULD monitor:

- control-channel liveness;
- command queue stalls;
- event-loop/goroutine/thread growth as appropriate;
- Worker memory;
- disk pressure;
- session-host count;
- unreconciled session count;
- dead session-host processes;
- stale IPC endpoints;
- stream backlog;
- credential refresh failures;
- heartbeat lag;
- time since canonical authority confirmation.

Watchdog failure SHALL trigger controlled service restart or Worker restart according to policy, not uncontrolled termination of durable session hosts.

---

# 28. Session Reconciler

A periodic reconciler SHALL compare:

```text
canonical expected sessions
vs
Worker attached sessions
vs
locally discoverable session hosts
vs
actual process/runtime liveness
```

It SHALL detect:

- zombie session record;
- live host missing from Worker memory;
- dead process with RUNNING projection;
- duplicate active generation;
- stale authority;
- missing workspace;
- missing attach endpoint;
- abandoned stream;
- completed process whose exit event was lost.

---

# 29. Control Plane vs Data Plane

Spec 278 adopts the principle:

> High-volume execution data SHALL NOT be allowed to starve execution control.

Control-plane messages include:

```text
heartbeat
lease/fence
start
cancel
pause
resume
approval
recovery
checkpoint
terminate
placement
```

Data-plane messages include:

```text
stdout/stderr
PTY bytes
terminal snapshots
screen previews
large progress frames
artifact chunks
video/audio previews
```

Initial implementation MAY reuse current transport.

However, interfaces SHALL permit later separation into:

```text
Control Channel
+
Execution Stream Broker
```

without changing job/session semantics.

---

# 30. Execution Stream Broker Interface

A normalized stream attachment contract SHOULD exist even before a dedicated relay is deployed.

```ts
interface ExecutionStreamBroker {
  open(sessionId: string, streamType: StreamType): Promise<StreamHandle>;
  attach(streamHandle: StreamHandle, consumer: ConsumerIdentity): Promise<void>;
  detach(streamHandle: StreamHandle, consumer: ConsumerIdentity): Promise<void>;
  snapshot?(streamHandle: StreamHandle): Promise<StreamSnapshot>;
}
```

Supported stream types:

```text
terminal
stdout
stderr
structured_events
progress
preview
```

The stream layer SHALL NOT determine job authority.

## 30.1 Detached-output spool and backpressure contract

A detached agent may emit unbounded stdout/PTY data while no viewer is connected. "Bounded terminal history" SHALL therefore be enforced by explicit quotas rather than implementation convention.

Each driver/stream SHALL define:

```text
memory_buffer_max_bytes
disk_spool_max_bytes
max_event_rate
overflow_policy
critical_event_reserved_capacity
truncation_marker_format
retention_ttl
```

Requirements:

- high-volume output SHALL NOT starve cancel/revoke/heartbeat/recovery messages;
- non-critical terminal output MAY be truncated/ring-buffered after quota, but truncation MUST be explicit and sequence-addressable;
- terminal exit receipts, approval requests, cancellation acknowledgements and recovery events MUST use reserved durable capacity and SHALL NOT be dropped because stdout filled the spool;
- disk-pressure handling SHALL stop growing the spool before exhausting the host filesystem;
- a stream gap SHALL return a `truncated_before_seq` / equivalent marker so clients do not mistake incomplete replay for complete history;
- output-spool cleanup SHALL obey terminal-receipt acknowledgement/retention rules;
- sensitive output redaction policy, if available in the current platform, SHOULD be applied before durable storage.

A workload that requires lossless output beyond local quotas SHALL use an approved external artifact/log sink rather than an unbounded Runner spool.

---

# 31. PTY / Virtual Terminal Recovery

For interactive CLI agents the system SHOULD retain bounded terminal state independently of browser attachment.

Capabilities:

- recent scrollback;
- current screen;
- cursor position;
- terminal dimensions;
- OSC/title notifications where supported;
- resize after reattach;
- forced redraw if required by the application.

UI reconnection SHALL not require restarting the agent.

Terminal history is potentially sensitive. Any disk-backed terminal spool SHALL be bounded, access-restricted, tenant/user-scoped, encrypted where platform facilities allow, and subject to retention cleanup. Raw terminal contents SHOULD remain memory-only unless durable replay is explicitly required. The terminal exit receipt may store digests/refs instead of raw output.

## 31.1 Interactive input ownership and human takeover

Streaming terminal output may be multi-viewer, but terminal **input** is a side effect and MUST NOT bypass ordered session control.

Each interactive session SHALL have an `input_authority_epoch` and one normalized input owner mode:

```text
AUTONOMOUS_AGENT
USER_TAKEOVER
CONTROL_AGENT
NO_INPUT
```

Requirements:

- raw WebSocket/viewer connections SHALL NOT write directly to PTY/ACP stdin outside the Session Manager command path;
- user takeover atomically advances input authority and suspends autonomous prompt injection before user keystrokes are accepted;
- handback atomically returns input ownership and records the last accepted input sequence;
- concurrent viewers are read-only unless one holds explicit input authority;
- stale browser tabs/clients cannot regain input merely by reconnecting;
- input commands carry session generation, authority epoch, input authority epoch, command sequence and idempotency identity;
- pending approval/credential gates continue to apply during takeover;
- takeover/handback is auditable and visible in Task Control advanced detail.

This prevents human keystrokes, autonomous agent prompts and control-agent instructions from racing on the same terminal.

---

# 32. ACP / Structured Agent Session Support

PTY is not the only interaction model.

For ACP / JSON-RPC / app-server agents, the session driver SHALL preserve:

```text
provider process/session handle
protocol session id
working directory
MCP/capability bindings
pending permission/approval state
last acknowledged request
ordered command position
```

A structured protocol driver SHOULD be preferred over terminal scraping when the agent supports an appropriate protocol.

---

# 33. External Harness Session Adapter

External agents that maintain their own session identity MAY map:

```text
SmartAIHub Execution Session
        │
        └─ external_session_ref
               │
               └─ provider/harness session
```

The adapter SHALL expose whether provider-side resume is:

- exact;
- best effort;
- checkpoint-based;
- unsupported.

---

# 34. Cloudflare Container Semantics

Cloudflare Container execution SHALL implement the same normalized Session Driver API.

Spec 278 SHALL NOT assume that an exact process always survives container replacement.

Possible continuity:

```text
container still alive
  → reattach

container replaced
  → recover durable workspace/checkpoint
  → create new session_generation
  → advance authority fence
```

Container instance identity SHALL be treated as an execution handle, not canonical authority.

---

# 35. Cloudflare Sandbox Semantics

Sandbox execution is expected to be more ephemeral.

The driver SHOULD support:

```text
workspace snapshot
artifact checkpoint
command/result receipts
reconstruction metadata
```

If process continuity is unavailable, `continuity_class` SHALL accurately report:

```text
CHECKPOINTABLE
or
RECONSTRUCTABLE
```

rather than falsely claiming process durability.

## 35.1 Driver continuity certification matrix

Every cloud/provider driver SHALL ship a tested continuity profile rather than inheriting assumptions from another substrate. Certification SHALL record:

```text
driver version
provider/runtime version
exact-process survival guarantee
reattach guarantee
external handle TTL
checkpoint mechanism and integrity verification
workspace durability scope
network/disconnect behavior
maximum recovery window
known non-recoverable transitions
```

A provider capability change SHALL invalidate or re-run the affected certification before stronger continuity claims are exposed to placement or UI.

---

# 36. Host Reboot Behavior

A host reboot is different from Worker restart.

After reboot:

```text
Runner starts
  ↓
host_boot_id changed
  ↓
old process identity invalid
```

The system SHALL:

1. reject process reattachment to stale host-boot identity;
2. inspect workspace/checkpoint;
3. reconcile canonical job state;
4. reconstruct a new session generation if policy allows;
5. otherwise mark execution lost/recoverable according to job policy.

---

# 37. Secret Handling

Secrets SHALL be injected through the existing Secret Broker / secure credential path.

Session persistence SHALL NOT persist plaintext secrets in:

- session manifest;
- logs;
- command receipts;
- recovery inventory;
- terminal snapshot metadata.

For recovery:

```text
old process still alive
  → may retain process memory/env according to existing execution model

new process required
  → obtain fresh authorized secret grant
```

If a secret cannot be reissued:

```text
WAITING_CREDENTIAL_REISSUE
```

is preferable to silently using stale credentials.

A surviving process may still hold credentials in memory/environment. For security-sensitive revocation, credential revocation SHALL be coupled to one or more enforceable controls: short-lived scoped credentials, broker-mediated provider access, process pause/termination, or sandbox/network revocation. Merely deleting a secret from the Worker store does not revoke a copy already inherited by a child process.

---

# 38. Approval Recovery

A Worker restart SHALL NOT lose an approval boundary.

Example:

```text
agent requests privileged action
      ↓
worker_job = WAITING_APPROVAL
      ↓
Worker restarts
      ↓
session survives
      ↓
Worker reattaches
      ↓
still WAITING_APPROVAL
```

The session SHALL NOT interpret reattachment as approval.

Approval IDs and authority snapshots SHALL remain canonical server-side.

---

# 39. Cancellation Recovery

Cancellation is authoritative even if the Worker is temporarily disconnected.

When Worker reconnects:

```text
local session alive
canonical job CANCELLED
        ↓
TERMINATE_STALE / TERMINATE
```

A stale surviving process SHALL not resurrect a cancelled job.

---

# 40. Billing & Settlement

Execution continuity SHALL not duplicate billing.

Rules:

- retries caused only by Worker restart SHOULD NOT double-count work already acknowledged;
- command receipts SHOULD enable deduplication;
- session generation changes SHALL be visible to settlement logic;
- token/resource usage MUST be associated with job/session generation;
- un-authoritative disconnected work MUST NOT automatically settle as billable success;
- final settlement remains governed by existing billing/worker-job contracts.

---

# 41. Runtime Capability Manifest Integration

Spec 277's Runtime Capability Manifest MAY consume Spec 278 Runner/session facts.

Examples:

```text
Execution location: Local PC
Continuity: Restart-safe
Isolation: Git worktree / host process
Agent: Codex
GPU: not required
Runner state: Healthy
```

This is presentation/projection only.

---

# 42. Task Control UX Integration

Normal users SHOULD see:

```text
Running on your PC
Work continues if the Worker app restarts
```

During restart:

```text
Reconnecting to execution…
Your task is still running.
```

After successful recovery, only after process/runtime liveness and canonical authority have both been confirmed:

```text
Execution recovered
No task restart was required.
```

If canonical authority changed:

```text
Paused for safety
SmartAIHub detected an execution ownership change and prevented duplicate work.
```

If process continuity is lost:

```text
Restoring from the latest safe checkpoint…
```

The UI MUST NOT say "Your task is still running" solely because a stale local manifest exists. User-facing continuity claims SHALL be backed by fresh liveness/recovery evidence. When stop is requested while the Runner is unreachable, show `Stop requested` until a terminal receipt or authority-expiry guarantee confirms stop.

Developer/Admin detail MAY show:

```text
session_id
generation
runner_id
runner_instance_id
authority_epoch
placement_epoch
driver
continuity_class
last heartbeat
last output
recovery decision
process identity digest
```

Normal User mode SHALL NOT show:

```text
poddaemon
PID
named pipe
Unix socket
fence token
```

unless explicitly expanded under diagnostics.

---

# 43. User-Facing Status Vocabulary

Recommended status mapping:

| Internal | User-facing |
|---|---|
| RUNNING | Running |
| DETACHED | Running — reconnecting control |
| ORPHANED | Connection interrupted |
| RECOVERING | Reconnecting to execution |
| RECONSTRUCTING | Restoring execution |
| PAUSED | Paused |
| WAITING_APPROVAL | Needs your approval |
| WAITING_CREDENTIAL_REISSUE | Needs access to continue |
| QUIESCED | Paused for safety |
| LOST | Execution interrupted |
| TERMINATED | Stopped |

---

# 44. Security Model

## 44.1 Session attach authentication

Every attach operation MUST authenticate:

```text
Runner identity
session identity
session generation
authority epoch
local IPC credential
```

## 44.2 Local IPC permissions

Local endpoints SHALL be restricted to the Worker/session-host OS identity where possible.

## 44.3 Stale attach defense

A valid local attach token alone SHALL NOT grant mutation authority after canonical fencing changes.

## 44.4 Replay defense

Attach/control requests SHOULD include nonce/timestamp or use a channel providing replay protection. Authority grants SHALL have unique grant IDs and bounded validity; replay of an older grant MUST NOT reduce the accepted fencing epoch or extend an expired authority deadline.

## 44.5 Least privilege

Session hosts SHOULD receive only:

- required environment;
- required filesystem access;
- required credentials;
- required network capability.

## 44.6 Control-state namespace, tenant isolation and path safety

Local execution-control state SHALL use a dedicated protected root, separate from repositories and user-generated workspace content.

The namespace SHALL bind at least:

```text
control_plane_instance / environment
tenant_id
runner_id
session_id
session_generation
```

Requirements:

- user-supplied repository names, branch names, task titles or artifact names SHALL NOT be used directly as trusted filesystem path components;
- canonical path validation SHALL prevent `..`, symlink, junction and reparse-point escape;
- recovery inventory SHALL reject records whose tenant/runner binding does not match the authenticated Runner registration;
- shared Runners SHALL isolate local state, IPC and workspaces by tenant using enforceable OS/container boundaries;
- a copied Session Registry from another machine/tenant SHALL not become adoptable merely because IDs match.

## 44.7 Session Host / driver binary provenance

Before launching or reattaching to a Session Host binary or privileged driver, the Worker SHALL verify that the executable/module is an approved build for the deployment trust policy.

Preferred evidence:

```text
platform signature / code signature
package signature
trusted release digest
approved plugin manifest digest
```

A durable session SHALL record the executable/driver identity digest needed for later recovery diagnostics.

Driver trust tiers:

```text
PLATFORM_SIGNED
ADMIN_TRUSTED
USER_UNTRUSTED
```

High-risk authority enforcement, shared/multi-tenant execution, or privileged Secret Broker access SHALL require an adequately trusted/certified driver. A user-installed driver may still run under policy, but MUST NOT self-assert stronger fencing/isolation guarantees than its certification permits.

## 44.8 No security overclaim

`host_process + git_worktree` MUST NOT be labeled "sandboxed" in security-sensitive UI unless an actual sandbox is present.

---

# 45. Failure Scenarios

The implementation SHALL explicitly handle:

1. Worker crash while session is running.
2. Worker graceful restart.
3. Worker auto-update.
4. Control connection drops.
5. Internet disconnect.
6. Server restart.
7. session host crash.
8. child agent crash.
9. host reboot.
10. duplicate start command.
11. duplicate cancel command.
12. start arrives after cancel.
13. stale Runner reconnects.
14. two Runner Instances see the same session files.
15. PID reuse.
16. corrupted local manifest.
17. missing workspace.
18. expired secret.
19. revoked credential.
20. approval pending during restart.
21. cancellation during disconnection.
22. terminal viewer disconnect.
23. terminal stream congestion.
24. disk full.
25. memory pressure.
26. GPU OOM.
27. Cloudflare container replacement.
28. sandbox expiry.
29. provider session lost.
30. checkpoint corruption.
31. two control-plane nodes concurrently attempt to adopt the same session.
32. laptop/host sleeps beyond authority TTL and resumes.
33. wall clock is moved backwards/forwards across an active grant.
34. child process attempts to tamper with Session Registry/IPC/helper binary.
35. checkpoint upload succeeds partially but commit manifest is absent.
36. multiple viewers race terminal input and user takeover.
37. detached terminal output exceeds memory/disk spool quota.
38. reserved workload exceeds its memory/process/disk envelope.
39. older Worker understands protocol version but lacks a required safety feature.
40. unsigned/tampered Session Host or user plugin claims privileged enforcement.
31. Worker rolls back to a version incompatible with surviving Session Hosts.
32. system clock jumps forward/backward during a lease.
33. Worker is hard-killed immediately after applying a command but before acknowledging it.
34. Session Host records process exit while control plane is unreachable.
35. two placement attempts race for the same free GPU/RAM capacity.
36. stale process continues autonomous writes without receiving new commands.
37. credential is revoked while the child process still holds an inherited copy.
38. old session host binary remains active across Worker upgrade.
39. recovery of hundreds of sessions causes a reconnect storm.
40. cleanup/GC races with a late recovery attempt.

---

# 46. Recovery Precedence Rules

When facts conflict, precedence SHALL be:

```text
1. explicit cancellation / revocation
2. canonical worker_job terminality
3. canonical authority epoch / lease ownership
4. approved recovery decision
5. durable server session projection
6. verified external/local session liveness
7. local manifest
8. in-memory Worker state
```

Local process liveness NEVER outranks canonical revocation.

---

# 47. Recovery Algorithm

Pseudo-flow:

```text
on Worker start:
    runner_instance_id = new UUID

    inventory = discover_sessions()

    for each session:
        verify registry/manifest schema + checksum
        verify Session Host protocol compatibility
        verify tenant/runner ownership metadata
        probe actual runtime
        verify process identity
        verify local authority deadline has not been bypassed
        collect durable command/event watermarks + terminal receipt
        mark local evidence

    send RecoveryInventory(inventory)

    decisions = control_plane.reconcile(inventory)

    for decision in decisions:
        if REATTACH:
            validate/renew bounded authority grant
            attach()
            restore ordered command/event watermarks
            flush durable local outbox
            register stream
            emit recovered event

        if ADOPT_WITH_NEW_FENCE:
            apply new authority epoch
            attach()
            prove host accepted new fence
            emit adopted event

        if PAUSE_AND_ATTACH:
            attach()
            ensure no mutation continues

        if CHECKPOINT_AND_STOP:
            checkpoint()
            terminate()

        if RECONSTRUCT:
            create new generation

        if TERMINATE_STALE:
            terminate immediately

        if MARK_LOST:
            close local projection
```

---

# 48. Session Host Authority Handshake

For locally enforceable drivers, adoption SHOULD use a handshake:

```text
Control Plane
  issues authenticated grant for epoch 18 + bounded deadline
      ↓
Worker
  Attach(session, epoch 18)
      ↓
Session Host
  verifies valid attach credential
  verifies grant integrity + deadline
  sees epoch 18 > epoch 17
  atomically updates accepted epoch/grant/deadline
      ↓
Host returns FenceAcceptedReceipt
      ↓
Worker reports adoption complete
```

Commands with epoch 17 are rejected thereafter.

---

# 49. Session Generation Rules

Generation increments when:

- exact old execution session is not reused;
- process is reconstructed;
- placement moves to a new substrate;
- checkpoint restore creates a new process;
- old session is fenced and replaced.

Generation does NOT increment merely because:

- Worker process restarts;
- terminal viewer reconnects;
- control transport reconnects.

---

# 50. Idempotent Start

`CreateExecutionSession` MUST be idempotent over:

```text
worker_job_id
placement_epoch
session_generation
idempotency_key
```

A duplicate start SHALL return the existing session where safe.

It SHALL NOT launch a second agent process.

---

# 51. Runner Draining

Runner states SHOULD support:

```text
ONLINE
DRAINING
MAINTENANCE
OFFLINE
UNHEALTHY
```

DRAINING means:

- no new jobs;
- existing sessions continue;
- session continuity plan is calculated;
- update/shutdown occurs only after policy permits.

---

# 52. Resource Reservations

Placement SHOULD reserve resources before session launch.

Example:

```text
Job needs:
  RAM 24GB
  VRAM 12GB

Runner reports:
  RAM free 32GB
  VRAM free 16GB

reservation accepted
   ↓
session starts
```

Reservation state MUST expire if launch fails.

This avoids scheduling multiple large jobs based on the same stale free-memory snapshot.

## 52.1 Resource reservation vs resource enforcement

A reservation prevents scheduler overcommit; it does not necessarily stop a child process from exceeding the reserved envelope.

Each Session Driver SHALL declare `resource_enforcement`:

```text
ADVISORY_ONLY
OS_PROCESS_LIMIT
CGROUP_OR_JOB_LIMIT
SANDBOX_LIMIT
CONTAINER_LIMIT
PROVIDER_ENFORCED
```

The capability report SHALL specify which dimensions are actually enforceable:

```text
cpu
memory
process_count
open_files
disk_bytes
disk_iops
network
gpu_device
gpu_vram
wall_time
```

Requirements:

- policy SHALL NOT present a reservation as a hard limit when the platform cannot enforce it;
- shared/multi-tenant cloud execution MUST use enforceable memory/process/disk boundaries appropriate to the substrate;
- local personal Workers MAY use advisory limits, but resource pressure and risk level must be surfaced accurately;
- process-count / child-spawn bounds SHOULD exist for untrusted workloads to reduce fork/process storms;
- GPU/VRAM limits are frequently advisory; the driver MUST report that explicitly when hard partitioning is unavailable;
- OOM/resource-limit termination SHALL produce a normalized exit reason distinct from user cancellation or application failure.

Resource enforcement state SHALL participate in driver certification and placement policy.

---

# 53. Resource Pressure Handling

Worker SHOULD emit pressure events:

```text
memory_pressure
disk_pressure
gpu_pressure
session_capacity_pressure
```

Policy MAY:

- prevent new sessions;
- checkpoint low-priority work;
- move reconstructable jobs;
- ask orchestrator to defer heavy validation;
- preserve interactive/high-priority sessions.

The Worker SHALL NOT arbitrarily kill jobs without canonical policy.

---

# 54. Development Workload Policy

Default for Spec 224 development runs:

```text
session_driver:
  ACP if provider supports required semantics
  otherwise PTY/process

workspace:
  per-run worktree

continuity:
  PROCESS_PERSISTENT preferred on local Worker
  CHECKPOINTABLE/RECONSTRUCTABLE in cloud

disconnected_execution_policy:
  PAUSE_ON_LEASE_RISK

authority:
  strict fencing

parallel mutation:
  forbidden unless run plan explicitly partitions ownership
```

---

# 55. Non-Development Workloads

Spec 278 MUST remain generic.

Examples:

## Media

```text
ComfyUI render
video encode
audio processing
```

## Research

```text
long crawler/research process
document indexing
embedding ingestion
```

## Local AI

```text
Ollama/vLLM inference service task
large model conversion
batch generation
```

## Automation

```text
browser workflow
device-connected task
scheduled agent
```

Each workload chooses its own driver and continuity class.

---

# 56. Cloud / Local Placement Compatibility

A job SHOULD express requirements, not implementation-specific target names.

Example:

```json
{
  "execution_requirements": {
    "capabilities": ["git", "codex"],
    "memory_mb_min": 16384,
    "continuity": "reattachable_or_better",
    "interactive": true,
    "security_class": "trusted_workspace"
  }
}
```

Placement resolves:

```text
Local Worker
or
Cloudflare Container
or
Cloudflare Sandbox
or
other execution host
```

---

# 57. API / Protocol Additions

Illustrative messages:

## RunnerHeartbeatV2

```text
runner_id
runner_instance_id
host_boot_id
resource_snapshot
capacity
available_agents
capabilities
session_drivers
active_session_summaries
```

## RecoveryInventory

```text
runner_id
runner_instance_id
sessions[]
```

## RecoveryDecision

```text
recovery_operation_id
session_id
session_generation
decision
expected_job_control_revision
expected_authority_epoch
expected_placement_epoch
new_job_control_revision?
new_authority_epoch?
new_placement_epoch?
reason_code
decision_expires_at
```

## ExecutionAuthorityGrant

```text
grant_id
worker_job_id
session_id
session_generation
runner_scope
authority_epoch
placement_epoch
allowed_effect_class
issued_at
duration / not_after
key_id
signature_algorithm
required_safety_features
integrity_proof
```

## PrepareExecution / AdmissionReceipt

```text
worker_job_id
placement_epoch
resource_requirements
idempotency_key

→ reservation_id
  reservation_expires_at
  accepted_resource_envelope
  admission_snapshot_seq
```

## CheckpointManifest

```text
checkpoint_id
schema_version
worker_job_id
session_id
source_session_generation
workspace_generation
authority_epoch_at_capture
parent_checkpoint_id?
base_revision?
runtime_fingerprint?
content_refs[]
content_digests[]
required_safety_features[]
manifest_digest
commit_state
```

## InputAuthorityUpdate

```text
session_id
session_generation
authority_epoch
previous_input_authority_epoch
new_input_authority_epoch
owner_mode
idempotency_key
```

## OrderedSessionCommand

```text
command_id
session_id
session_generation
authority_epoch
authority_grant_id
command_seq
idempotency_key
type
payload
```

## SessionCommandReceipt

as defined earlier.

Protocol transport may be HTTP/WebSocket/gRPC/other existing channel. The semantic contract is normative; transport is not.

---

# 58. Database Migration Strategy

Migration MUST be additive.

Recommended sequence:

1. add `execution_sessions` projection table;
2. add indexes/constraints:
   - `worker_job_id`;
   - `runner_id, state`;
   - unique `(session_id, session_generation)`;
   - active-session uniqueness per canonical execution slot where the job contract is single-owner;
   - `authority_epoch`;
   - `last_seen_at`;
3. introduce new event types;
4. no destructive changes to `worker_jobs`;
5. deploy read/write path dark;
6. dual-observe existing direct execution;
7. enable durable Session Driver for beta Runner only;
8. promote after restart/recovery certification.

---

# 59. Backward Compatibility

Existing direct-execution Workers SHALL remain supported.

Fallback:

```text
driver = direct_process
continuity_class = EPHEMERAL
```

A job that does not request durable continuity may run unchanged.

Spec 278 MUST NOT make all existing Workers incompatible in one deployment.

---

# 60. Feature Flags

Recommended:

```text
durable_execution_sessions.enabled
durable_execution_sessions.write_projection
durable_execution_sessions.local_session_host
durable_execution_sessions.recovery_inventory
durable_execution_sessions.strict_fencing
durable_execution_sessions.authority_grants
durable_execution_sessions.local_event_outbox
durable_execution_sessions.ordered_command_lane
durable_execution_sessions.recovery_cas
durable_execution_sessions.suspend_safe_authority
durable_execution_sessions.required_safety_features
durable_execution_sessions.checkpoint_manifest_v1
durable_execution_sessions.input_authority
durable_execution_sessions.driver_provenance
runner.resource_advertisement_v2
runner.resource_enforcement
runner.session_aware_upgrade
execution_stream_broker.enabled
task_control.execution_continuity_ui
```

Strict fencing SHOULD become mandatory before broad production enablement.

---

# 61. Observability

Required metrics:

```text
execution_sessions_active
execution_sessions_by_driver
execution_sessions_by_continuity_class

session_create_duration_ms
session_attach_duration_ms
session_recovery_duration_ms
session_checkpoint_duration_ms

runner_restarts_total
sessions_survived_runner_restart_total
sessions_reconstructed_total
sessions_lost_total

stale_authority_rejections_total
authority_deadline_expirations_total
process_pause_on_authority_expiry_total
duplicate_command_receipts_total
command_sequence_gap_total

runner_control_disconnect_duration_ms
runner_unreconciled_sessions
local_outbox_pending_events
terminal_receipts_pending_reconciliation
protocol_incompatible_sessions
workspace_quarantines_total
admission_rejections_total

resource_memory_available
resource_gpu_vram_available
resource_disk_available

session_stream_backlog
output_spool_bytes
output_spool_truncations_total
critical_event_spool_pressure
recovery_cas_conflicts_total
authority_grant_signature_failures_total
authority_resume_revalidation_total
checkpoint_integrity_failures_total
input_authority_conflicts_total
resource_limit_terminations_total
driver_provenance_failures_total
```

---

# 62. Tracing

Trace context SHOULD propagate:

```text
user request
 → orchestrator run
 → worker_job
 → placement
 → session create/attach
 → agent process
 → tool calls where supported
 → verification
```

Runner restart SHALL not destroy the logical trace relationship.

A new span/segment MAY be created with links to the previous execution segment.

---

# 63. Audit

Audit events MUST include:

```text
who/what initiated recovery
old runner_instance_id
new runner_instance_id
session_id
generation
old authority epoch
new authority epoch
decision
reason
process continuity result
workspace/checkpoint used
```

No secrets in audit payloads.

---

# 64. Testing Strategy

## 64.1 Unit

Test:

- state transitions;
- command ordering;
- duplicate commands;
- fencing comparisons;
- manifest validation;
- process identity;
- recovery decision application;
- secret redaction;
- resource eligibility;
- authority grant expiry using monotonic time;
- local command/event journal crash recovery;
- terminal receipt persistence;
- protocol-version compatibility;
- workspace writer fencing;
- reservation expiry/idempotency.

## 64.2 Local integration

Must test:

```text
launch long-running fake agent
kill Worker process
assert agent still alive
restart Worker
discover session
reconcile
reattach
send command
receive output
terminate cleanly
```

## 64.3 Windows

Must test real:

- ConPTY;
- Named Pipe;
- service restart;
- desktop Worker restart;
- PID reuse defense where feasible.

## 64.4 Linux/macOS

Must test UDS and detached host behavior.

## 64.5 Network partition

Must prove stale authority cannot mutate after re-placement. For mutation-capable autonomous processes, the test MUST continue without sending new Worker commands and verify that the local authority deadline causes pause/termination or mediated-effect rejection. Command rejection alone is insufficient.

## 64.6 Approval

Must prove session restart/recovery does not auto-approve.

## 64.7 Cancellation

Must prove cancelled canonical job terminates surviving stale session.

## 64.8 Cloud

Test container replacement and Sandbox expiry using reconstruction/checkpoint semantics.

## 64.9 Crash consistency

Hard-kill Worker/Session Host at each persistence boundary: before local command apply, after apply before ack, during manifest/journal update, and after process exit before server reporting. Recovery MUST converge without duplicate side effects or lost terminal receipt.

## 64.10 Upgrade / rollback compatibility

Keep live sessions across Worker upgrade and safe rollback. Test at least one compatible old Session Host, one intentionally incompatible protocol, and versioned-helper garbage collection after terminality.

## 64.11 Resource admission race

Issue concurrent heavy jobs against the same Runner and verify local admission prevents double reservation of the same RAM/VRAM capacity.

## 64.12 Recovery CAS / HA

Run two or more control-plane instances against the same recovery inventory and prove that only one atomic adoption advances the canonical authority/placement revision.

## 64.13 Suspend / resume authority

Suspend/hibernate the host past the grant TTL. On resume, mutation MUST remain blocked until fresh authority is proven. Repeat with wall-clock jumps.

## 64.14 Session Host tamper boundary

From the child workload, attempt to:

- rewrite Session Registry;
- steal/replace attach endpoint;
- overwrite helper binary;
- alter trust-root/grant data;
- traverse/symlink into control-state paths.

The certified enforcement level SHALL match what the OS actually prevents.

## 64.15 Checkpoint integrity

Test partial upload, missing object, digest mismatch, wrong tenant/job, incompatible schema and stale base revision. None may restore silently.

## 64.16 Interactive input race

Race autonomous prompt injection, two browser viewers, takeover and handback. Only the current input owner/epoch may write.

## 64.17 Output spool quota

Generate output beyond spool quota while detached. Critical receipts/events remain durable, disk stays bounded, and replay exposes an explicit truncation boundary.

## 64.18 Resource enforcement

Exceed memory/process/disk limits and verify normalized resource-limit termination. Where hard enforcement is unsupported, verify the driver reports advisory-only rather than passing the hard-limit certification.

## 64.19 Downgrade / required safety feature

Attempt recovery with an older Worker that lacks a persisted required safety feature. It must enter `INCOMPATIBLE` rather than attach in degraded mutation mode.

## 64.20 Driver provenance

Attempt to launch/reattach a tampered or unsigned privileged Session Host/driver. Policy must reject or downgrade it according to trust tier.


---

# 65. Mandatory Chaos Tests

Before production certification, run at minimum:

1. kill Worker during active Codex-like process;
2. kill Worker during terminal output burst;
3. restart Worker during pending approval;
4. disconnect network until lease expires;
5. assign replacement Runner;
6. reconnect stale original Runner;
7. verify old session is fenced;
8. corrupt local session manifest;
9. delete workspace while process survives;
10. expire credential during recovery;
11. send duplicate start;
12. send duplicate terminate;
13. reorder pause/resume commands;
14. reboot host;
15. replace cloud container instance;
16. exhaust disk;
17. induce Worker memory pressure;
18. crash session host;
19. lose terminal viewer but keep process;
20. restart control-plane service while Runner remains alive;
21. let authority grant expire while an autonomous agent receives no further commands;
22. hard-kill Worker after command side effect but before command receipt reaches server;
23. finish child process while Worker is down, then recover its terminal receipt;
24. roll Worker backward across an incompatible Session Host protocol version;
25. skew wall clock while a monotonic authority deadline is active;
26. race two resource admissions for one GPU reservation;
27. restore a stale workspace while an old writer is still alive;
28. revoke an inherited credential and verify configured process/broker enforcement;
29. reconnect a large inventory in bounded batches/concurrency;
30. run GC while a session is unreconciled and verify active/recoverable state is retained;
31. race two control-plane instances attempting the same adoption;
32. suspend/hibernate past authority expiry and resume;
33. jump wall clock backward/forward during a grant;
34. attempt child-to-control-state tampering/path escape;
35. interrupt checkpoint publication between content upload and manifest commit;
36. race two viewers plus autonomous agent for terminal input;
37. overflow detached terminal output spool while preserving critical receipts;
38. exceed enforced resource envelope / process count;
39. attach with protocol-compatible but safety-feature-incomplete older Worker;
40. replace privileged Session Host/driver binary with untrusted/tampered build.

---

# 66. Acceptance Criteria

Spec 278 is not production-ready until all are true:

## AC-01

A supported local session can survive Worker restart without restarting the child workload.

## AC-02

New Worker instance can rediscover and reattach to that session.

## AC-03

Recovery is reconciled against canonical `worker_jobs` before mutation resumes.

## AC-04

Stale authority is rejected after lease/fence transition.

## AC-05

Duplicate start does not create duplicate execution.

## AC-06

Per-session command order is deterministic.

## AC-07

Pending approval survives Worker restart.

## AC-08

Canonical cancellation terminates/quiesces a surviving stale session.

## AC-09

No plaintext secrets appear in persistent session manifest.

## AC-10

PID reuse cannot produce false recovery.

## AC-11

Runner update does not silently destroy durable sessions.

## AC-12

Existing ephemeral Worker path continues to operate during migration.

## AC-13

Cloud execution accurately reports weaker continuity instead of claiming process persistence.

## AC-14

Task Control shows meaningful recovery state without exposing low-level jargon by default.

## AC-15

Recovery/adoption/fencing actions are auditable.

## AC-16

An autonomous mutation-capable session is locally paused/terminated or effect-blocked when its bounded Execution Authority Grant expires even if no new Worker command arrives.

## AC-17

Authority deadline enforcement uses a monotonic local deadline and remains safe under wall-clock skew.

## AC-18

A child process that exits while Worker/control plane is unavailable leaves a durable terminal receipt that is reconciled later without declaring job success locally.

## AC-19

Command/event watermarks and dedupe survive Worker restart; an ack-loss replay cannot duplicate a side effect.

## AC-20

Windows and Unix implementations prove Session Host survival and full process-tree termination with real processes.

## AC-21

Worker upgrade/rollback cannot strand a live Session Host silently; protocol compatibility is checked before transition.

## AC-22

A replacement session cannot write to the same mutable workspace until previous-writer exclusion is proven or a new workspace generation is created.

## AC-23

Resource placement uses fresh advertisement plus atomic local admission; concurrent jobs cannot consume the same reserved RAM/VRAM allocation.

## AC-24

Security-sensitive credential revocation has an enforceable path for already-running child processes; deleting stored secret material alone is not considered revocation.

## AC-25

Cloud/provider continuity claims are backed by a driver certification profile and do not exceed tested provider guarantees.

## AC-26

User-facing `Recovered` / `Still running` messages require fresh liveness plus canonical authority evidence.

## AC-27

Unreconciled active sessions and workspaces are protected from cleanup/GC.

## AC-28

Recovery of a large session inventory is bounded by batching/concurrency controls and does not create a reconnect storm.

## AC-29

Local session registry corruption is quarantined and cannot cause silent session takeover or duplicate launch.

## AC-30

At-least-once Runner event delivery plus server deduplication prevents loss or duplication of critical terminal/recovery events.

## AC-31

Concurrent recovery/adoption across multiple control-plane instances is linearizable: exactly one operation advances the canonical execution slot, and losers cannot obtain mutation authority.

## AC-32

Authority expiry remains safe across suspend/hibernate and material clock discontinuities; resuming the machine cannot silently extend a stale grant.

## AC-33

A child workload cannot modify protected Session Registry/trust-root/attach-control state under the claimed enforcement tier; weaker local configurations are reported honestly.

## AC-34

Only a fully committed, integrity-verified checkpoint with valid scope/lineage may be restored.

## AC-35

Terminal input has explicit ownership. User takeover/handback and autonomous input cannot race through direct viewer-to-PTY writes.

## AC-36

Detached output remains bounded by configured memory/disk quotas, exposes explicit truncation markers, and cannot starve critical control/terminal receipts.

## AC-37

Resource reservation and resource enforcement are represented separately; shared/multi-tenant execution meets the configured hard-enforcement policy.

## AC-38

A Worker/Session Host lacking any persisted required safety feature fails closed into `INCOMPATIBLE` rather than silently downgrading execution safety.

## AC-39

Privileged Session Host/driver binaries are verified against deployment trust policy; an untrusted plugin cannot self-certify stronger fencing/isolation than allowed.

## AC-40

Stale recovery/control responses are rejected by `job_control_revision` and cannot resurrect a canonically terminal or newer desired state.

---

# 67. Implementation Milestones

## M0 — Contracts & Dark Projection

Deliver:

- session schema;
- complete normalized state machine + transition guards;
- canonical `job_control_revision`;
- continuity classes;
- Session Driver interface;
- execution-session projection;
- events;
- telemetry;
- feature flags.

No execution behavior change.

## M1 — Local Durable PTY Session Host

Deliver:

- per-session host;
- PTY/ConPTY ownership;
- UDS/Named Pipe IPC;
- local manifest;
- bounded terminal state;
- attach/detach;
- OS-specific process-tree containment;
- versioned Session Host protocol/binary;
- protected control-state root;
- Session Host binary provenance verification;
- crash-consistent local registry;
- durable terminal exit receipt;
- real integration tests.

## M2 — Recovery + Fencing

Deliver:

- Runner Instance ID;
- host boot identity;
- Recovery Inventory;
- server reconciliation;
- authenticated bounded Execution Authority Grant;
- monotonic authority deadline enforcement;
- authority handshake;
- recovery/adoption CAS across control-plane instances;
- signed/MAC grant trust-root + key rotation contract;
- suspend/resume-safe authority expiry;
- stale-session quiesce;
- cancellation/approval recovery.

M2 is eligible for **internal recovery/fencing soak testing only**. It is not yet the user-facing durable-session beta gate because input ownership, required-safety-feature downgrade protection and bounded detached-output handling land in M3.

## M3 — Ordered Command Lane + Session-Aware Upgrade

Deliver:

- monotonic commands;
- idempotent receipts;
- durable local command/event watermarks and outbox;
- terminal tombstones / sequence resync;
- Worker drain;
- restart/update reattach flow;
- required-safety-feature negotiation / downgrade prevention;
- terminal input authority/takeover lane;
- bounded detached-output spool;
- session reconciler.

After M3, a **single-tenant local durable-session limited beta** MAY begin only after the relevant certification gate in §67A passes. Shared/multi-tenant Runner production remains gated on stronger isolation/resource enforcement and driver provenance requirements.

## M4 — Resource / Capability Advertisement V2

Deliver:

- CPU/RAM/GPU/VRAM/disk snapshot;
- agent/capability inventory;
- continuity capability;
- placement integration;
- two-phase prepare/admission reservation;
- snapshot freshness/TTL;
- reservation/pressure hooks;
- resource-enforcement capability matrix;
- process/memory/disk enforcement on certified substrates.

## M5 — Structured / External Session Drivers

Deliver:

- ACP driver;
- provider/harness reattach adapter;
- remote session handles;
- driver trust/provenance certification;
- committed checkpoint manifest + integrity validation.

## M6 — Cloudflare Drivers

Deliver:

- Container adapter;
- Sandbox adapter;
- checkpoint/reconstruct semantics;
- recovery tests across instance replacement.

## M7 — Stream Separation

If scale justifies it:

- execution stream broker;
- terminal/data-plane isolation from control traffic;
- reconnectable viewers;
- backpressure.

## M8 — Task Control Completion

Deliver Spec 277 projections:

- execution location;
- continuity;
- recovering/recovered;
- safety pause;
- advanced diagnostics.

# 67A. Release Certification Gates & Traceability

Milestone completion is not equivalent to production certification. The following gates define the minimum evidence required for each rollout tier.

## 67A.1 Tier A — Internal durability soak

Scope:

```text
single machine
single tenant/user
local PTY/process driver
no shared untrusted workloads
no cross-host reconstruction claim
```

Required milestones:

```text
M0 + M1 + M2
```

Required proof includes:

- Worker crash → exact process survives → recovery inventory → safe reattach;
- bounded authority expiry and stale-fence rejection;
- crash-consistent registry and terminal receipt;
- Session Host process-tree containment;
- protected control-state root and helper provenance;
- concurrent recovery/adoption CAS;
- suspend/resume authority revalidation.

This tier is engineering/internal only.

## 67A.2 Tier B — Limited local user beta

Required milestones:

```text
M0 + M1 + M2 + M3
```

Additional mandatory controls:

- durable ordered-command dedupe;
- required-safety-feature negotiation;
- input-authority/takeover sequencing;
- bounded output spool/backpressure;
- session-aware update/rollback;
- recovery/command event reconciliation.

Minimum acceptance focus:

```text
AC-01..AC-22
AC-26..AC-33
AC-35..AC-36
AC-38..AC-40
```

Any acceptance criterion not applicable to the enabled driver/substrate SHALL be marked `N/A` with written justification rather than silently skipped.

## 67A.3 Tier C — Shared / multi-tenant Runner

In addition to Tier B:

- enforceable tenant isolation;
- protected IPC/control state;
- certified driver/helper provenance;
- resource-enforcement policy appropriate to the substrate;
- process-count/disk/memory containment;
- Secret Broker access scoped to the session/tenant;
- security review of child→host escape/tamper attempts.

Relevant mandatory acceptance includes `AC-23`, `AC-24`, `AC-33`, `AC-37`, `AC-39`.

## 67A.4 Tier D — Checkpoint/reconstruction beta

Requires the checkpoint-manifest/restore integrity work from M5 or an earlier independently certified implementation.

Mandatory:

```text
AC-14
AC-25 where provider-dependent
AC-34
```

Chaos coverage SHALL include partial publication, corrupt object, stale lineage/base revision and wrong tenant/job scope.

## 67A.5 Tier E — Cloudflare execution beta

Requires M6 plus provider-specific certification.

Cloud drivers SHALL pass their own guarantee vector. A Cloudflare Container/Sandbox path MUST NOT inherit the local PTY driver's `PROCESS_PERSISTENT` certification.

## 67A.6 Control-to-test traceability

| Safety property | Primary milestone | Acceptance | Minimum chaos/integration evidence |
|---|---|---|---|
| Exact local process survives Worker restart | M1/M2 | AC-01, AC-02 | kill/restart Worker, reattach same process |
| Canonical recovery/fencing | M2 | AC-03, AC-04, AC-16, AC-31, AC-40 | network partition, replacement Runner, concurrent adoption |
| Suspend-safe authority | M2 | AC-17, AC-32 | sleep/hibernate past TTL, wall-clock jump |
| Crash-consistent evidence | M1/M3 | AC-18, AC-19, AC-30 | child exits while Worker down; ack-loss replay |
| OS lifecycle/process tree | M1 | AC-20 | real ConPTY/Unix process-tree stop/recovery |
| Upgrade/rollback compatibility | M3 | AC-21, AC-38 | incompatible old/new Worker/Host recovery |
| Workspace writer exclusion | M2/M3 | AC-22 | stale old writer + replacement generation |
| Resource admission/enforcement | M4 | AC-23, AC-37 | concurrent reservation + hard-limit tests |
| Credential/effect revocation | M2+policy | AC-24 | revoke while child remains alive |
| Provider continuity truthfulness | M5/M6 | AC-25 | certified driver/provider lifecycle tests |
| User recovery truthfulness | M8 | AC-26 | stale liveness/authority UI suppression |
| GC safety | M3 | AC-27 | GC during unreconciled session |
| Recovery backpressure | M3 | AC-28 | large inventory reconnect |
| Registry corruption | M1 | AC-29 | corrupt/partial registry quarantine |
| Checkpoint integrity | M5 | AC-34 | partial/corrupt/wrong-scope restore |
| Input ownership | M3 | AC-35 | viewer/autonomous takeover race |
| Output spool bounds | M3 | AC-36 | detached flood with critical receipt survival |
| Driver/helper provenance | M1/M5 | AC-39 | tampered/unsigned helper/plugin |

---

# 68. Recommended Initial Implementation Slice

The first implementation SHOULD deliberately stay narrow:

```text
Platform:
Windows + Linux local Worker

Deployment boundary:
single-tenant / single-user local Runner for the first beta;
shared multi-tenant execution is explicitly not part of the first slice

Workload:
PTY-based coding agent

Continuity:
survive Worker process restart

Workspace:
existing per-run worktree path

Authority:
existing worker_job lease + authority epoch
+ bounded signed/MAC authority grant
+ suspend-safe expiry

IPC:
Windows Named Pipe / Linux UDS

Recovery:
Worker restart only

Required safety subset:
protected control-state root + helper provenance
recovery CAS + bounded authority grant
suspend-safe authority expiry
durable command/event dedupe
required-safety-feature negotiation
input authority for interactive terminal
bounded output spool

UI:
simple "Reconnecting / Recovered" Task Control state
```

Do NOT start with:

- every cloud driver;
- dedicated Relay;
- all agent protocols;
- cross-machine live process migration.

Prove the execution continuity primitive first.

---

# 69. Non-Goals for Initial Release

Initial Spec 278 implementation SHALL NOT attempt live process migration from one physical machine to another.

Instead:

```text
same host
  → reattach exact process where supported

different host
  → checkpoint/reconstruct/new generation
```

Cross-host process migration may be researched separately if a real workload requires it.

---

# 70. Clean-Room / License Boundary

AgentsMesh is an architectural reference.

SmartAIHub implementation SHALL:

- use SmartAIHub naming, contracts and code;
- design from documented behavior/concepts;
- not vendor/copy AgentsMesh BSL-covered production code;
- not depend on AgentsMesh runtime;
- not create source-level derivative coupling;
- record external inspiration in engineering notes where useful.

This is especially important because AgentsMesh's repository root is licensed under BSL 1.1 with production-use restrictions before its change date.

---

# 71. Design Decisions

## DD-01

Use **Execution Session**, not `Pod`, as the SmartAIHub generic concept.

Reason: SmartAIHub executes far more than coding agents.

## DD-02

Keep canonical authority in `worker_jobs`.

Reason: avoids duplicated state machines and split ownership.

## DD-03

Session durability is capability-based.

Reason: local processes, containers, sandboxes and remote providers have different guarantees.

## DD-04

Strict fencing is required before broad durable-session rollout.

Reason: process persistence without authority safety can make reliability worse by preserving stale mutation.

## DD-05

Do not mandate gRPC.

Reason: transport is secondary to the semantic contract and SmartAIHub already has existing control-plane infrastructure.

## DD-06

Do not mandate a dedicated terminal relay in M1.

Reason: continuity can be proven without adding unnecessary infrastructure.

## DD-07

Separate workspace isolation from security isolation.

Reason: Git worktree solves concurrency, not hostile-code containment.

## DD-08

Expose resources as placement input, not orchestration authority.

Reason: execution host should advertise; control plane decides.

---

# 72. Implementation Guardrails

The implementation team MUST NOT:

- create `execution_jobs` as a competing canonical job table;
- let session host renew job authority directly;
- let session host approve actions;
- treat "process is alive" as permission to continue;
- store secrets in `session.json`;
- rely on PID only;
- auto-kill durable sessions during Worker update;
- mark a job successful because a session exited with code 0 without existing completion/verification contracts;
- claim a cloud session is restart-safe if it is only reconstructable;
- expose raw infrastructure complexity to normal users;
- treat protocol-version compatibility as permission to ignore a required safety feature;
- restore a checkpoint that lacks a committed integrity manifest;
- permit browser/viewer connections to bypass input-authority sequencing;
- place Session Registry/trust-root/attach credentials inside mutable workspaces;
- advertise a resource hard limit or driver trust/enforcement tier that the substrate cannot actually enforce.

---

# 73. Implementation Checklist

## Data

- [ ] `execution_sessions` projection
- [ ] indexes
- [ ] new worker-job event types
- [ ] migration is additive
- [ ] canonical job_control_revision / stale-decision CAS constraints
- [ ] checkpoint manifest schema + committed-state integrity indexes/refs

## Worker

- [ ] runner_instance_id
- [ ] host_boot_id
- [ ] Session Manager
- [ ] Session Driver Registry
- [ ] local Session Host
- [ ] attach authentication
- [ ] manifest
- [ ] process identity
- [ ] versioned Session Host binary/protocol
- [ ] crash-consistent local Session Registry
- [ ] durable terminal receipt + local event outbox
- [ ] ordered command lane
- [ ] Watchdog
- [ ] Session Reconciler
- [ ] resource probe
- [ ] protected control-state root / tenant namespace
- [ ] Session Host binary provenance verification
- [ ] suspend/resume authority revalidation
- [ ] bounded output spool + truncation sequence
- [ ] interactive input authority / takeover

## Control Plane

- [ ] Recovery Inventory endpoint/message
- [ ] recovery reconciliation
- [ ] authority epoch validation
- [ ] bounded authenticated Execution Authority Grant
- [ ] monotonic local authority deadline
- [ ] recovery decisions
- [ ] placement resource integration
- [ ] two-phase Runner resource admission/reservation
- [ ] session-aware Runner drain
- [ ] linearizable recovery/adoption CAS
- [ ] grant signing/MAC trust-root + rotation
- [ ] required-safety-feature negotiation
- [ ] checkpoint commit/restore authorization

## Security

- [ ] no persistent plaintext secrets
- [ ] IPC permission test
- [ ] stale authority rejection
- [ ] autonomous-process expiry enforcement
- [ ] inherited-secret revocation strategy
- [ ] replay/idempotency tests
- [ ] tenant isolation
- [ ] child cannot write execution-control state under certified tier
- [ ] path traversal/symlink/junction/reparse defense
- [ ] driver/helper provenance policy

## UI

- [ ] reconnecting
- [ ] recovered
- [ ] safety pause
- [ ] reconstruction
- [ ] execution location
- [ ] continuity detail
- [ ] admin diagnostics

## QA

- [ ] Worker crash test
- [ ] Worker update test
- [ ] network partition test
- [ ] split-brain test
- [ ] approval test
- [ ] cancellation test
- [ ] reboot test
- [ ] corrupted-manifest test
- [ ] duplicate-command test
- [ ] Cloudflare replacement test
- [ ] control-plane concurrent-adoption test
- [ ] suspend/hibernate expiry test
- [ ] checkpoint partial-commit/integrity test
- [ ] multi-viewer input race test
- [ ] output spool overflow test
- [ ] resource hard-limit test
- [ ] downgrade/required-feature test
- [ ] driver tamper/provenance test
- [ ] §67A rollout-tier certification matrix completed with N/A justifications where applicable

---

# 73A. Recovery Scaling & Backpressure

A Worker may recover many sessions after restart. Recovery SHALL be bounded rather than reconnecting every session simultaneously.

Requirements:

- inventory messages support batching/chunking;
- attachment concurrency is capped;
- retries use bounded backoff/jitter;
- control-plane recovery decisions are idempotent;
- terminal/data stream attachment is deferred until control reconciliation succeeds;
- high-priority cancellation/revocation is not starved by bulk recovery;
- metrics expose recovery backlog and oldest unreconciled session age.

---

# 73B. Garbage Collection & Orphan Retention

Local state SHALL distinguish:

```text
ACTIVE
RECOVERABLE_UNRECONCILED
TERMINAL_AWAITING_ACK
TERMINAL_RETAINED
GC_ELIGIBLE
QUARANTINED
```

GC SHALL require canonical evidence or an explicit retention policy decision. Time alone SHALL NOT make an `ACTIVE` or `RECOVERABLE_UNRECONCILED` session deletable.

Cleanup SHOULD remove, in dependency order:

1. stream spool / transient snapshots;
2. terminal receipt after server acknowledgement and retention expiry;
3. attach credentials;
4. session metadata/journal;
5. workspace only after its own evidence/retention rules permit;
6. unused versioned Session Host binaries only when no remaining session references them.

---

# 73C. Ten-Pass Production Gap Audit — Revision 1.1

Revision 1.1 was produced after ten distinct architecture/failure-domain review passes. Each discovered material gap was incorporated directly into the normative specification rather than left as review commentary.

| Pass | Review domain | Material gap found | R1.1 correction |
|---|---|---|---|
| 1 | Authority / split brain | Epoch rejection only acts when a new command arrives; autonomous child could keep mutating while detached | Added bounded authenticated Execution Authority Grant, monotonic local authority deadline and enforcement levels |
| 2 | Crash consistency | Process could finish while Worker is down and terminal result could disappear | Added crash-consistent Session Registry, durable terminal exit receipt and local at-least-once event outbox |
| 3 | OS process lifecycle | "Detached process" did not define Windows Job Object / Unix process-group behavior or descendant termination | Added platform lifecycle contract, process-tree containment and termination escalation |
| 4 | IPC / version safety | Attach token alone lacked protocol compatibility, replay/downgrade and helper-version handling | Added attach protocol negotiation, grant freshness, token rotation and versioned Session Host compatibility |
| 5 | Workspace mutation safety | New generation could race a stale writer in the same worktree/workspace | Added workspace generation, writer fencing, quarantine and safe patch/snapshot salvage |
| 6 | Secrets / side effects | Revoking a stored secret does not revoke a copy already inherited by a running child; direct external effects bypass command fencing | Added credential-revocation enforcement requirements plus mediated-effect/sandbox authority levels |
| 7 | Resource placement | Fresh-looking server placement can still overbook the same RAM/VRAM due to concurrent assignments | Added advertisement freshness plus two-phase Runner-local admission/reservation with TTL/idempotency |
| 8 | Command/event ordering | In-memory dedupe/watermarks could be lost on Worker restart; ack loss could replay side effects | Added durable command/event watermarks, local dedupe journal, terminal tombstones and sequence resynchronization |
| 9 | Cloud/provider continuity | Summary continuity classes could overclaim provider guarantees | Added explicit guarantee vector and driver continuity certification matrix with handle TTL/checkpoint scope |
| 10 | Upgrade/rollback/operations | Live old Session Hosts could be stranded by Worker rollback; unreconciled sessions could be GC'd; mass recovery could stampede | Added protocol compatibility gating, versioned-host GC, orphan retention states and bounded recovery/backpressure |

## 73C.1 Audit conclusion

After the ten-pass review, the architectural center of gravity is intentionally stronger than "process survives Runner restart":

```text
continuity
+ bounded authority
+ crash-consistent evidence
+ deterministic recovery
+ workspace exclusion
+ resource admission
+ version compatibility
```

A durable process without those controls is not considered a production-safe durable execution session.

# 73D. Second Ten-Pass Production Gap Audit — Revision 1.2

Revision 1.2 performed ten additional distinct passes over R1.1. Total targeted production-gap review count: **20 passes**.

| Pass | Review domain | Material gap found | R1.2 correction |
|---|---|---|---|
| 11 | State-machine / finality | Several referenced states lacked complete transition/guard semantics; stale recovery could be interpreted differently by implementers | Replaced state graph with guarded transitions, desired-vs-observed semantics and canonical `job_control_revision` |
| 12 | Control-plane HA / recovery race | Duplicate inventories or two backend instances could both authorize adoption | Added atomic recovery/adoption CAS, `recovery_operation_id`, expected revisions/epochs and stale-decision rejection |
| 13 | Authority cryptography | Signed-grant concept lacked trust-root provisioning, key rotation and anti-rollback rules | Added grant `key_id`, trust-root pinning, bounded key overlap/retirement and monotonic accepted grant semantics |
| 14 | Time / suspend safety | A monotonic source that pauses during sleep could accidentally extend a lease/grant after laptop resume | Added suspend/hibernate-safe elapsed-time rules and mandatory revalidation after ambiguous time discontinuity |
| 15 | Session Host privilege boundary | Child could potentially tamper with registry/IPC/helper state when all files/processes share one unrestricted identity | Added protected control-state root, child-write prohibition, high-assurance service identity guidance and truthful enforcement downgrade |
| 16 | Checkpoint integrity | `checkpoint_ref` did not prove atomic completeness, lineage, digest integrity or compatible restore | Added versioned checkpoint manifest, PREPARING→COMMITTED publication, digest/scope/lineage validation and quarantine |
| 17 | Interactive input race | Multi-viewer terminal output was defined, but user keystrokes could race autonomous/control-agent input | Added `input_authority_epoch`, single input owner, takeover/handback and prohibition on direct viewer→PTY writes |
| 18 | Output/backpressure | Detached workloads could fill disk/memory with terminal output and starve critical receipts | Added bounded spool quotas, reserved critical capacity, explicit truncation sequence and disk-pressure behavior |
| 19 | Resource enforcement | Reservation/admission avoided overbooking but did not distinguish enforceable limits from advisory estimates | Added enforcement capability matrix, hard-limit requirements for shared runtimes and normalized limit exits |
| 20 | Downgrade / provenance | Protocol-compatible older Workers or untrusted plugins could claim safety features they do not actually implement | Added persisted required-safety-feature negotiation, fail-closed downgrade prevention, driver trust tiers and binary provenance verification |

## 73D.1 R1.2 architecture conclusion

Production-safe durable execution now requires all of:

```text
canonical job authority
+ guarded session state machine
+ linearizable recovery/adoption
+ bounded cryptographically verifiable authority
+ suspend-safe expiry
+ protected execution-control state
+ crash-consistent receipts/journals
+ workspace writer exclusion
+ committed checkpoint integrity
+ ordered command + input ownership
+ bounded stream storage
+ honest resource enforcement
+ safety-feature downgrade prevention
+ trusted/certified driver provenance
```

A feature may be implemented incrementally, but the product MUST NOT claim the corresponding continuity/fencing/isolation guarantee until the required controls for that guarantee are certified.

---

# 74. Final Architecture After Spec 278

```text
User / Assistant / Workflow / Spec 224
                │
                ▼
        Durable Orchestration
                │
          worker_jobs SSOT
                │
     lease / fence / approval
                │
                ▼
       Placement / Runner Control
                │
                ▼
┌────────────────────────────────────┐
│ SmartAIHub Worker                  │
│                                    │
│ Supervisor                         │
│ Session Manager                    │
│ Recovery Reconciler                │
│ Ordered Command Lanes              │
│ Capability / Resource Probe        │
│ Workspace Manager                  │
│ Stream Adapter                     │
└───────────────┬────────────────────┘
                │
        Session Driver API
                │
     ┌──────────┼───────────┬──────────────┐
     ▼          ▼           ▼              ▼
Local Host     ACP       CF Container   CF Sandbox
     │          │           │              │
     ▼          ▼           ▼              ▼
Codex/Claude  Agent RPC   workload       workload
Build/Test
ComfyUI
etc.
```

The key semantic change is:

```text
BEFORE

Worker lifecycle
      =
execution lifecycle


AFTER

Worker lifecycle
      ≠
execution-session lifecycle
      ≠
canonical job lifecycle
```

Each layer can recover independently without violating authority. A surviving process is useful only while its bounded authority remains valid or while it is safely quiesced; liveness alone is never sufficient execution permission. Recovery also requires a compatible safety-feature set, trusted/certified driver path and atomic control-plane adoption.

---

# 75. Final Product Outcome

After Spec 278, SmartAIHub can truthfully provide the following behavior:

> A long-running task may continue even if the Worker app restarts. SmartAIHub reconnects to the existing execution when safe, prevents stale duplicate execution through fencing, and falls back to checkpoint/reconstruction when the underlying runtime cannot preserve the exact process.

For users, this appears simple:

```text
Running
   ↓
Worker reconnecting…
   ↓
Recovered
   ↓
Running
```

For the platform, it creates a durable execution substrate suitable for:

- autonomous development;
- local agents;
- remote harnesses;
- long builds/tests;
- media generation;
- GPU jobs;
- research;
- browser/device automation;
- Cloudflare execution;
- scheduled/background assistants;
- future multi-runner placement.

**Spec 278 is therefore an additive durability layer under SmartAIHub's existing orchestration kernel, not a replacement for it.**

---

# 76. Revision 1.3 Addendum — Metered Capability Execution Correlation

Revision 1.3 is deliberately narrow.

It does **not** move commerce logic into the Runner.

It adds only the execution correlation required so Spec 278 can safely execute/recover a paid SmartAIHub Skill, Mini App, Workflow or Agent-service invocation governed by Spec 280 without duplicate charging or loss of commercial identity.

## 76.1 New optional session bindings

`execution_sessions` MAY add opaque references:

```text
commercial_invocation_id      nullable
root_commercial_invocation_id nullable
skill_lease_id                nullable
offering_id                   nullable
payer_policy_ref              nullable
revenue_policy_version_ref    nullable
tenant_economic_context_ref   nullable
commercial_budget_ref         nullable
```

These are correlation fields only.

Spec 278 SHALL NOT:

- calculate product price;
- choose revenue split;
- mutate creator earnings;
- mutate tenant earnings;
- settle credits independently;
- expose proprietary Skill implementation.

## 76.2 Commercial invocation invariant

```text
commercial invocation
    ≠ execution session generation
```

One paid invocation MAY span:

```text
session generation 1
→ Worker restart
→ recovery
→ session generation 1 continues
```

or:

```text
generation 1 lost
→ reconstruct
→ generation 2
```

without automatically creating a new commercial invocation.

The `commercial_invocation_id` remains stable until Spec 280 declares the commercial invocation terminal/replaced.

## 76.3 Skill lease recovery

On recovery, the Runner/Session Manager SHALL NOT locally decide that a Skill lease is still commercially valid.

It SHALL query/receive the applicable authoritative commercial/entitlement state.

Recovery decision classes MAY include:

```text
COMMERCIAL_BINDING_VALID
COMMERCIAL_REAUTH_REQUIRED
COMMERCIAL_BUDGET_EXHAUSTED
COMMERCIAL_INVOCATION_CANCELLED
COMMERCIAL_INVOCATION_TERMINAL
```

These states influence whether paid capability work may continue, but canonical execution authority remains `worker_jobs`.

## 76.4 Tenant-aware execution correlation

Multi-tenant economic context SHALL travel as an opaque reference.

The Runner SHALL know enough to preserve:

```text
tenant_id
deployment/offering context ref
commercial invocation ref
```

but SHALL NOT need to know or compute:

```text
SmartAIHub share
Tenant Admin share
Creator share
Nested Skill creator share
```

This keeps white-label economics out of the execution host.

## 76.5 Usage/evidence receipts

Spec 278 MAY emit normalized execution usage evidence for Spec 280:

```text
execution started
execution resumed
execution reconstructed
provider/tool usage
resource usage
artifact produced
terminal result
non-billable platform failure
user cancellation
```

Usage evidence SHALL be idempotent and correlated by:

```text
commercial_invocation_id
worker_job_id
session_id
session_generation
event_seq
```

Spec 280 decides whether/what is billable.

## 76.6 Paid Skill IP boundary

A Session Host MAY receive:

- opaque Skill lease;
- public input/output schema;
- bounded local action plan;
- temporary adapter/helper;
- encrypted/opaque artifact refs;
- provider/harness task instructions.

It SHOULD NOT receive the complete proprietary hosted Skill source unless that Skill's licensing/distribution class explicitly permits local materialization.

## 76.7 Acceptance criteria

R1.3 is satisfied when:

1. paid invocation ID survives Worker restart;
2. reconstruction to a new session generation does not duplicate the commercial invocation;
3. Skill lease validity is rechecked authoritatively;
4. commercial cancellation prevents continuation;
5. opaque tenant economic context survives recovery;
6. Runner cannot calculate/alter revenue shares;
7. execution usage evidence is idempotent;
8. existing non-commercial jobs run unchanged;
9. proprietary hosted Skill source is not required on the Runner;
10. Spec 280 remains the commercial runtime and the existing ledger remains canonical.

---

# 77. R1.3 Relationship to Specs 279/280

```text
Spec 279
  receives external command
      ↓
Spec 224 / 269 / runtime owner
      ↓
Spec 256
  resolves capability
      ↓
Spec 280
  creates commercial invocation / Skill lease
      ↓
worker_job
      ↓
Spec 278
  executes and preserves correlation across recovery
```

This addendum is intentionally additive and SHALL NOT require rewriting the core R1.2 durability implementation.

---

# 78. Revision 1.4 Addendum — Commercial Execution Safety & Metering Evidence Integrity

Revision 1.4 hardens the narrow Spec-280 integration introduced in R1.3.

It remains **execution-only and additive**.

Spec 278 still does not:

- price a Skill/Mini App;
- determine whether a usage event is billable;
- allocate revenue;
- maintain creator/tenant balances;
- replace the canonical billing/credit ledger.

Its job is to preserve trustworthy commercial correlation and execution evidence across restart, detach, reconstruction and temporary control-plane failure.

## 78.1 Commercial Binding Snapshot

A paid execution session MAY bind one immutable commercial snapshot:

```text
commercial_binding_id
commercial_binding_digest
commercial_invocation_id
root_commercial_invocation_id
parent_commercial_invocation_id?
offering_id
capability_id
capability_release_id
capability_release_digest
skill_lease_id?
commercial_authority_grant_id?
commercial_authority_not_after?
commercial_meter_epoch
root_budget_ref
tenant_economic_context_ref
price_policy_version_ref
revenue_policy_version_ref
```

The Runner treats these values as opaque execution constraints.

The binding digest SHALL prevent a stale or compromised local process from silently replacing:

- the capability release;
- the invocation identity;
- the commercial tenant context;
- the meter epoch;
- the budget reference.

Revenue percentages and payout amounts SHALL NOT be embedded in the Runner binding.

## 78.2 Commercial Execution Grant

A paid hosted capability MAY receive a bounded `CommercialExecutionGrant` issued by the authoritative commerce/billing path defined by Spec 280.

Illustrative grant:

```text
grant_id
commercial_binding_id
commercial_binding_digest
commercial_invocation_id
capability_release_digest
worker_job_id
session_id / allowed session generation range
commercial_meter_epoch
allowed_usage_classes[]
max_usage_envelope?
issued_at
not_after
key_id
integrity_proof
```

The grant SHALL be:

- integrity protected;
- bounded in time;
- bounded in capability/release scope;
- unavailable for modification by the child workload;
- independently verifiable by the Session Host where the deployment supports local verification.

A Commercial Execution Grant is **not** a substitute for the normal Spec-278 Execution Authority Grant. Both applicable gates MUST be valid.

```text
job authority valid
AND
commercial execution gate valid
→ paid capability may continue
```

## 78.3 Commerce-Service Disconnect Policy

The Session Host SHALL NOT require a network round trip for every local step of a paid Skill.

Instead:

```text
valid bounded CommercialExecutionGrant
        ↓
continue only inside granted envelope

grant expires / revoked / cannot be proven
        ↓
stop new metered side effects
        ↓
request authoritative revalidation
```

If revalidation is unavailable after the local grant boundary:

- no new paid external side effect may begin;
- no new billable child capability may be spawned;
- the workload SHOULD quiesce at the next safe boundary;
- the canonical runtime MAY remain recoverable rather than terminal;
- already-produced evidence/artifacts SHALL be preserved.

The platform MAY define a prepaid/grace window only when it is explicitly represented by the signed bounded grant.

A local Runner MUST NOT invent a commercial grace period.

## 78.4 Orthogonal Commercial Gate State

Commercial gate state is orthogonal to execution-session state.

```text
VALID
REAUTH_REQUIRED
BUDGET_EXHAUSTED
REVOKED
INVOCATION_TERMINAL
UNKNOWN
```

The Session Host reports this state to the control plane.

Spec 280 / the canonical runtime decides the resulting user/job action through existing authority paths.

A Runner SHALL NOT mark a canonical job `FAILED` merely because commerce reauthorization is temporarily unavailable.

## 78.5 Metering Evidence Receipt

Execution MAY produce normalized `UsageMeterReceipt` records:

```yaml
usage_meter_receipt:
  receipt_id: ...
  commercial_invocation_id: ...
  commercial_meter_epoch: ...
  worker_job_id: ...
  execution_session_id: ...
  session_generation: ...
  event_seq: ...
  capability_release_digest: ...
  usage_class: ...
  quantity: ...
  unit: ...
  interval_start: ...
  interval_end: ...
  producer:
    runner_id: ...
    runner_instance_id: ...
    driver_identity_digest: ...
  evidence_digest: ...
  integrity_proof: ...
```

Delivery semantics are:

> **at-least-once receipt delivery + idempotent economic consumption**

not distributed "exactly once".

Spec 280 SHALL deduplicate by stable receipt identity/sequence.

## 78.6 Metering Evidence Is Not a Charge

The Runner MAY state:

```text
process ran for N seconds
provider returned usage X
artifact Y was produced
operation Z failed before provider admission
```

The Runner MUST NOT state:

```text
user owes N credits
creator earned N credits
tenant gets X%
```

Billability, pricing, refunds and revenue allocation remain Spec-280/existing-ledger concerns.

## 78.7 Failure Attribution Evidence

Execution receipts SHOULD classify operational failure origin without deciding billing:

```text
PLATFORM_CONTROL_FAILURE
RUNNER_FAILURE
HOST_RESOURCE_FAILURE
USER_HARNESS_AUTH_FAILURE
USER_HARNESS_QUOTA_FAILURE
EXTERNAL_PROVIDER_FAILURE
CAPABILITY_LOGIC_FAILURE
USER_CANCELLED
POLICY_REVOKED
COMMERCIAL_GATE_EXPIRED
UNKNOWN
```

This provides evidence for Spec 280's billability matrix.

## 78.8 Capability Release Pinning

A paid invocation SHALL remain pinned to the declared:

```text
capability_release_id
capability_release_digest
```

across:

- Worker restart;
- same-session reattach;
- session reconstruction;
- provider reconnection.

If the exact release can no longer be executed:

```text
do not silently upgrade
→ report RELEASE_UNAVAILABLE / REAUTH_REQUIRED
→ let canonical runtime/Spec 280 decide replacement or a new invocation
```

A replacement release that changes the commercial contract SHALL NOT reuse the old invocation silently.

## 78.9 Commercial Cancellation / Budget Exhaustion

Commercial revocation is not a local kill authority by itself.

Correct path:

```text
Spec 280 / canonical economic authority
    ↓
canonical runtime / worker_job policy update
    ↓
Spec 278 desired state / authority update
    ↓
Session Host quiesce/terminate
```

For urgent safety/cost containment, a validated commercial grant expiry may block further metered effects locally while canonical cancellation propagates.

## 78.10 Nested Invocation Correlation

When paid capability A calls paid capability B, the execution layer MAY preserve:

```text
root_commercial_invocation_id
parent_commercial_invocation_id
commercial_invocation_id
```

It MUST NOT infer the nested revenue split.

Child execution SHALL receive its own bounded commercial binding/grant when required.

## 78.11 Tenant Economic Context Integrity

`tenant_economic_context_ref` SHALL be immutable for the lifetime of one commercial invocation unless Spec 280 explicitly creates a new versioned commercial binding.

A Worker reconnecting through another tenant-branded surface MUST NOT rewrite the tenant beneficiary context.

UI tenant, execution tenant and economic-attribution tenant MAY differ and SHALL remain separate concepts.

## 78.12 Proprietary Skill Data at Rest

When a hosted Skill sends bounded instructions/action plans to a local Runner:

- persist only the minimum required for recovery/audit;
- avoid persisting hidden system prompts/full proprietary Skill source;
- encrypt protected transient material according to existing storage policy;
- apply bounded retention;
- redact it from ordinary terminal logs/Task Control;
- exclude protected Skill logic from checkpoints unless the commercial license explicitly permits it.

A checkpoint that contains protected Skill material SHALL preserve the applicable confidentiality/entitlement policy.

## 78.13 Commercial Evidence Retention & GC

Metering/terminal evidence needed for settlement reconciliation SHALL NOT be deleted merely because the process ended.

Local states MAY distinguish:

```text
COMMERCIAL_EVIDENCE_PENDING_ACK
COMMERCIAL_EVIDENCE_ACKED
COMMERCIAL_EVIDENCE_RETENTION
COMMERCIAL_EVIDENCE_GC_ELIGIBLE
```

Retention MUST be bounded and privacy-aware.

If the authoritative service remains unreachable beyond local retention capacity, the Runner SHALL preserve critical compact receipts before disposable high-volume output.

## 78.14 Security / Replay

Commercial grants and usage receipts SHALL bind enough context to prevent replay across:

- tenant;
- invocation;
- capability release;
- meter epoch;
- worker job;
- session generation where applicable.

A receipt from one invocation SHALL not be reusable to manufacture revenue in another.

## 78.15 R1.4 Acceptance Criteria

1. A valid bounded Commercial Execution Grant permits temporary disconnected execution only within its declared envelope.
2. Expiry prevents new metered effects without allowing the Runner to invent additional grace.
3. Commercial reauthorization failure does not become false job terminality.
4. Meter receipts are delivered at least once and deduplicated economically.
5. Runner usage evidence never directly mutates balances.
6. Failure origin is evidence, not a Runner billing decision.
7. Paid capability release digest remains pinned across recovery.
8. A missing release cannot silently upgrade inside the same paid invocation.
9. Nested invocation ancestry survives session recovery.
10. Reconnecting through another branded tenant cannot rewrite economic attribution.
11. Protected hosted Skill source is not required in ordinary Runner checkpoints.
12. Critical commercial receipts survive ordinary output-spool pressure.
13. Revocation/budget exhaustion flows through canonical job authority.
14. Non-commercial jobs remain byte/behavior compatible with the optional binding fields.
15. Spec 280 and the existing ledger remain the only commercial decision/balance authorities.

---

# 79. R1.4 Cross-Spec Review Notes

R1.4 was produced together with Spec 279 R1.1 and Spec 280 R1.1.

The controlling boundary is:

```text
279 = who asked / where command came from / where result returns
224/269/etc. = who owns orchestration semantics
256 = what capability is relevant
280 = whether/how a capability is commercially authorized and settled
278 = how authorized execution survives and emits trustworthy evidence
ledger = final balance authority
```

No layer may silently absorb another layer's authority.
