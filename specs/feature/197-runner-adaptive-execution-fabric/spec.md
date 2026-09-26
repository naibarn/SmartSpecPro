# Feature 197 — SmartAIHub Runner Adaptive Execution Fabric
## Runner-First Local Execution + Interactive Control + MCP Boundary + Quality/Retry + Provenance + Adaptive Planning

**Status:** Revised — Architecture Freeze Candidate aligned with revised Features 195 and 196  
**Date:** 2026-09-17  
**Scope:** SmartAIHub / SmartSpecPro / SmartAIHub Runner / Feature 195 / Feature 196  
**Priority:** Architecture foundation  
**Feature ID:** 197  
**Recommended path:** `specs/feature/197-runner-adaptive-execution-fabric/spec.md`  
**Related specifications:** Feature 198 — Intelligent Chat, Universal Orchestration & Capability Evolution; Feature 199 — External MCP Gateway & Upstream Management; Feature 200 — Universal External Agent Control Plane
**Shared cross-spec contracts:** `SAH-EXEC-1`, `SAH-CAP-1`, `SAH-RUNNER-1`, `SAH-CONTEXT-1`, `SAH-ASSET-1`; Feature 197 owns Runner/device/local execution semantics.
**Current codebase implementation status:** Partial; Web/desktop Runner building blocks and contract checks exist, while connected-runtime registration, reconnect and target-environment evidence remain release gates.
**Implementation rule:** Do not implement a competing local-executor path outside this specification without an explicit architecture revision.

---

# 0. Executive Decision

This specification defines the final target architecture for local and hybrid execution after reviewing the design issues discussed in the current architecture session.

The central decision is:

> **SmartAIHub Core orchestrates Goals, Jobs, policy, cost, quality and global scheduling. SmartAIHub Runner is the mandatory local execution gateway for tools installed on user/tenant Windows, macOS or Linux machines. Local tools do not register directly with SmartAIHub when Runner can host them.**

Runner is not merely a render worker. It is a **Local Execution Host + Local Capability Registry + Agent/CLI/MCP Supervisor + Resource Scheduler + Control Bridge + Provenance Reporter**.

Runner may host and invoke:

- Claude Code / Claude CLI
- Codex CLI
- Hermes CLI / Hermes Agent
- OpenClaw-compatible local runtimes
- FFmpeg / FFprobe
- Remotion
- ComfyUI
- local AI runtimes
- browser automation
- desktop/computer automation
- approved isolated server-side jobs delegated by Core to Cloudflare Containers; local Docker/OpenSandbox dispatch is prohibited
- local scripts
- local MCP servers
- future CLI/MCP tools discovered after Runner installation

However, Runner MUST NOT assume that an internal Agent such as Claude, Codex or Hermes will route every tool call through Runner. Agents retain their own skills, MCP servers, subscriptions and local tools unless an execution policy explicitly restricts them.

SmartAIHub therefore controls the **execution envelope**, not necessarily every internal reasoning/tool decision.

## 0.1 Retired execution boundaries

This specification MUST NOT reactivate or extend any retired execution system. In particular, it MUST NOT add callers, routes, schemas, migrations, compatibility paths or dispatch adapters for Agency, `work/request`, `work/requests`, `workpacks/*`, the legacy `/workflows` custom workflow engine, OpenSandbox, `sandbox_jobs`, or Docker/OpenSandbox dispatch.

The approved isolated server-side runtime boundary is Cloudflare Containers when a Feature 195 Job is admitted and authorized for it. The term “workflow” elsewhere in this document means a governed Goal/Plan or LangGraph flow; it does not refer to the retired `/workflows` engine.

---

# 1. Relationship to Existing Features

## 1.1 Feature 195 remains authoritative for execution truth

Feature 195 remains the authoritative Job Control Plane for:

- canonical Jobs
- queues and dispatch
- execution attempts
- leases/fencing
- node/pool capacity
- retries
- watchdog/recovery
- provider/runtime execution
- Job progress/events
- actual execution cost
- execution provenance

This specification extends Feature 195 with the Runner-first local execution model, durable control inbox, work leasing, quality/retry coordination and richer execution provenance.

## 1.2 Feature 196 remains authoritative for goal semantics

Feature 196 remains authoritative for:

- Goal interpretation
- Plan/DAG compilation
- Capability requirements
- quality expectations
- allowed Offer sets
- binding policy
- user/tenant execution preferences
- privacy/residency requirements
- budget envelope
- approval policy
- Plan revisions
- user intervention that changes semantics or future work

## 1.3 Feature 197 adds the missing execution fabric and learning loop

Feature 197 owns the architecture that spans:

1. Runner-first local execution
2. local capability discovery
3. global pool vs local tool resolution
4. work offer / claim / handoff
5. durable interactive control
6. progress normalization
7. quality gate and retry orchestration
8. execution journey/provenance
9. experience learning
10. adaptive planning feedback to Feature 196
11. strict separation of Runner and MCP communication paths

Feature 197 MUST NOT create a second canonical Job table or a second planner.

---

# 2. Architectural Invariants

The following are non-negotiable unless this architecture is revised.

## 2.1 PostgreSQL remains source of truth

Cloudflare Queues, WSS, MCP, Runner local journals and vendor sessions are transports/execution mechanisms, not canonical state.

Canonical state is persisted in SmartAIHub PostgreSQL.

## 2.2 Cloudflare Queue credentials never go to user devices

End-user Runner/Worker MUST NOT pull Cloudflare Queue directly.

Queue consumption remains SmartAIHub-controlled.

## 2.3 Local tools use Runner when Runner can be installed

If a tool is installed on a Windows/macOS/Linux host on which SmartAIHub Runner is supported, production execution MUST expose that tool through Runner rather than register the local tool directly as an independent SmartAIHub execution node.

Exceptions:

- explicit legacy migration mode
- development/debug mode
- unsupported Runner platform
- vendor architecture that is genuinely remote/cloud rather than host-local

## 2.4 SmartAIHub schedules capabilities, not executable names by default

Feature 196 SHOULD plan using capability contracts.

Example:

```text
code.refactor
research.deep
video.edit.semantic
image.generate
browser.control
```

A specific local implementation such as Codex, Claude or Hermes is pinned only when policy/user choice requires it.

## 2.5 Runner is authoritative for local reality

Runner owns the truth about:

- what is installed locally
- whether it is authenticated
- current version
- current health
- available slots
- resource availability
- process/session state
- local MCP connections
- local artifacts/checkpoints

Core does not infer this from stale configuration.

## 2.6 SmartAIHub is authoritative for global policy

Runner MUST NOT independently bypass:

- Plan allowed Offer/tool set
- tenant/user permissions
- privacy/residency policy
- cost ceilings
- approval gates
- pinned executor requirements
- prohibited tools

## 2.7 User-owned tools remain user-owned

SmartAIHub MUST NOT silently disable or replace a user's Claude/Codex/Hermes skills, MCP servers or subscriptions merely because SmartAIHub has an equivalent paid capability.

## 2.8 No fabricated progress

If an executor exposes only lifecycle status, show lifecycle status.

If it exposes stage/activity, show stage/activity.

Percentage/ETA MUST include provenance/confidence and MUST NOT be invented as native progress.

## 2.9 Completion requires quality acceptance when a quality gate exists

A process exit code of zero is not equivalent to Job completion.

The canonical rule is:

```text
execution succeeded
AND required artifact commit succeeded
AND mandatory quality gates passed
=> COMPLETED
```

## 2.10 Learning never overrides hard policy

Historical learning can prefer/deprioritize Offers and workflows, but cannot override:

- explicit user pinning
- privacy policy
- tenant policy
- permission limits
- budget hard limits
- required quality/security constraints

---

# 3. Three External Communication Paths — MUST Remain Distinct

This is a major architecture boundary.

```text
                         SmartAIHub Core
               ┌─────────────┼─────────────┐
               │             │             │
               ▼             ▲             ▼
        Runner Execution   MCP Inbound   MCP Outbound
             Plane          Command        Connector
                              Plane          Plane
```

## 3.1 Path A — Runner Execution Plane

Direction conceptually:

```text
SmartAIHub ↔ Runner
```

Purpose:

- SmartAIHub assigns/leases execution work to Runner
- Runner reports capability, health and progress
- SmartAIHub sends durable control commands
- Runner returns events/artifacts/results
- Runner may request SmartAIHub platform capabilities during a parent Job when allowed

Authority:

- SmartAIHub = global orchestrator
- Runner = local execution supervisor

Credential class:

```text
RunnerDeviceCredential
```

Runner privileges MUST NOT be granted to ordinary MCP clients.

## 3.2 Path B — Inbound SmartAIHub MCP Server

Direction:

```text
External MCP Client → SmartAIHub
```

Examples:

- Claude
- Codex
- Hermes
- OpenClaw
- external assistant
- developer IDE

Purpose:

External clients can invoke only SmartAIHub MCP tools/resources/prompts currently exposed by SmartAIHub.

Examples:

```text
library.search
library.list
image.generate
video.generate
job.status
goal.create
```

MCP access does NOT imply:

- Runner privilege
- local process control
- arbitrary Job claiming
- access to unexposed SmartAIHub APIs

Credential/principal class:

```text
MCPInboundPrincipal
```

## 3.3 Path C — Outbound MCP / Connector Plane

Direction:

```text
SmartAIHub → External MCP Server / Connector
```

Examples:

- Facebook MCP
- remote ComfyUI MCP
- enterprise ERP MCP
- browser service MCP
- third-party SaaS MCP

SmartAIHub acts as client.

Credential class:

```text
ConnectorCredential
```

## 3.4 Internal Runner MCP is a fourth internal topology, not a fourth external authority plane

Runner MAY connect to local MCP servers as part of its local tool inventory:

```text
SmartAIHub → Runner → Local MCP Server
```

Runner MAY also provision a Job-scoped SmartAIHub MCP endpoint/config to an internal Agent when supported:

```text
Claude/Codex/Hermes → Job-scoped SmartAIHub MCP → SmartAIHub
```

This is optional and policy-driven. It MUST NOT be assumed to be the only way an Agent accesses tools.

---

# 4. SmartAIHub Runner Definition

SmartAIHub Runner is defined as:

> **A user/tenant-controlled local execution host that exposes aggregate compute, agent, CLI, MCP, browser, desktop, media and AI capabilities through one SmartAIHub device identity, while supervising local execution, resources, controls, artifacts, checkpoints and provenance.**

Runner is intentionally broader than the legacy Worker.

## 4.1 Runner major components

```text
SmartAIHub Runner
│
├── Connection Manager
├── Device Identity Manager
├── Capability Discovery Engine
├── Local Tool Registry
├── Runtime Adapter Host
├── Local MCP Discovery/Client
├── Agent Session Manager
├── Local Scheduler
├── Resource Manager
├── Execution Supervisor
├── Control Inbox Client
├── Progress/Event Normalizer
├── Permission Broker
├── Optional Credential Broker
├── Artifact/Checkpoint Manager
├── Browser Runtime Adapter
├── Desktop Control Adapter
├── Local Journal
├── Update/Runtime Package Manager
└── Diagnostics
```

## 4.2 Runner registration model

Core registers one Runner device identity.

Core does not require separate node registration for every installed local CLI.

Example:

```text
Runner: Office-PC-03

Tools:
- Codex CLI
- Claude Code
- FFmpeg
- ComfyUI
- Chrome

Capabilities:
- code.modify
- code.test
- agent.general
- research.web
- video.render
- image.generate.local
- browser.control
```

## 4.3 Runner is not a mandatory internal tool broker

Runner supervises an Agent session but MUST NOT assume every internal tool call is routed through Runner.

Example:

```text
Claude session
├── user's FAL skill
├── user's GitHub MCP
├── user's browser MCP
└── optional SmartAIHub MCP
```

Runner may observe/control what the Agent integration surface supports, but user-owned capabilities remain available according to Plan policy.

---

# 5. Runner Capability Discovery and Learning

## 5.1 Objective

Runner SHOULD continuously improve its understanding of what the host machine can execute.

Discovery is not one-time installation inventory.

Triggers:

- Runner startup
- Runner upgrade
- periodic scan
- explicit rescan
- PATH/config change detection when available
- MCP config change
- local package/runtime install event when detectable
- execution failure indicating stale capability metadata

## 5.2 Discovery sources

Runner MAY discover:

- executable PATH
- known install locations
- package managers
- `--version` probes
- health/probe commands
- local services/ports when explicitly configured
- approved local runtime package manifests (not Docker/OpenSandbox dispatch)
- MCP configuration files
- MCP `tools/list`
- browser automation dependencies
- GPU/CPU/RAM/VRAM
- Python/Node/Rust/runtime availability
- ComfyUI workflow endpoint/config
- authenticated-state probe when safe

## 5.3 Tool inventory and capability inventory are separate

Tool inventory example:

```text
codex-cli  x.y.z
claude     x.y.z
hermes     x.y.z
ffmpeg     x.y.z
```

Capability inventory example:

```text
code.refactor
code.test
research.deep
browser.control
video.transcode
video.render
```

Planner MUST prefer capability semantics over vendor names.

## 5.4 Discovery trust states

```text
discovered
probed
verified
ready
busy
degraded
auth_required
unsupported
disabled
```

A newly discovered arbitrary executable MUST NOT automatically become a production-capable executor.

It requires an adapter/manifest or approved generic CLI profile.

## 5.5 Adapter model

Canonical interface:

```text
LocalRuntimeAdapter
```

Suggested contract:

```text
discover()
probe()
version()
capabilities()
auth_state()
health()
resource_requirements()
start()
status()
stream_events()
steer() optional
pause() optional
resume() optional
cancel()
checkpoint() optional
collect_artifacts()
cleanup()
```

Initial adapters:

```text
CodexCLIAdapter
ClaudeCLIAdapter
HermesCLIAdapter
FFmpegAdapter
RemotionAdapter
ComfyUIAdapter
BrowserAdapter
DesktopControlAdapter
LocalAIAdapter
MCPAdapter
GenericCLIAdapter
```

## 5.6 Generic CLI manifest

Future tools SHOULD be addable without changing SmartAIHub Core.

Example:

```yaml
runtime_id: example-agent-cli
kind: cli

discovery:
  executables: ["example-agent"]
  version_args: ["--version"]

provides:
  - research.deep
  - document.write

control:
  cancel: process
  steer: none
  checkpoint: filesystem
```

## 5.7 Runner local learning vs platform learning

Runner learns local operational facts:

- tool availability
- versions
- auth health
- launch command behavior
- local crash patterns
- resource use
- local runtime duration

SmartAIHub Experience Layer learns cross-run planning facts:

- which executor works best for which task/context
- failure patterns
- QC outcomes
- user intervention patterns
- latency/cost/reliability
- workflow improvements

Runner MUST NOT turn one machine's local observations into global routing policy by itself.

---

# 6. Global Scheduling vs Local Resolution

## 6.1 Two-level resolver

```text
Feature 196 Plan
      ↓
Feature 195 Global Resolver
      ↓
Runner / Cloud / Provider / External Service
      ↓
Runner Local Resolver
      ↓
Claude / Codex / Hermes / FFmpeg / MCP / other local tool
```

## 6.2 Global resolver responsibility

Global resolver selects or permits:

- Runner pool / execution backend
- tenant/user scope
- data locality
- cost/privacy policy
- required capabilities
- required control level
- specific tool only when pinned

## 6.3 Local resolver responsibility

Runner selects local implementation only within compiled policy.

Example:

```text
required capability: code.refactor
allowed local implementations: codex, claude, hermes
local_resolution_allowed: true
```

Runner can choose based on:

- ready state
- slot availability
- local resources
- adapter health
- local execution telemetry
- required control features

## 6.4 Pinned tool

If user/Plan explicitly requires Claude:

```text
required_runtime = claude_code
```

Runner MUST NOT silently substitute Codex.

## 6.5 Runner decline

Runner MAY decline work if current local conditions do not satisfy the Job:

```text
NO_COMPATIBLE_RUNTIME
RESOURCE_BUSY
AUTH_REQUIRED
TOOL_DEGRADED
POLICY_CONFLICT
LOCAL_STORAGE_UNAVAILABLE
```

Decline before work starts is not a full execution failure.

---

# 7. Pool-Based Work Leasing

## 7.1 Do not preassign a physical node by default

A Job should normally wait for an eligible **Execution Resource Pool**, not a hard-coded machine.

Before claim:

```text
assigned_node_id = null
```

## 7.2 Pool hierarchy

Possible order, depending on Plan:

```text
1. pinned Runner/device
2. user-owned Runner pool
3. tenant-shared Runner pool
4. SmartAIHub managed cloud runtime
5. other allowed managed/external runtime
```

## 7.3 Wake + pull

Recommended Runner pattern:

```text
Core/Dispatch → WSS work.available hint
Runner → lease_next(capability_snapshot, free_slots)
Core → atomic selection/claim
Runner → execution lease
```

HTTPS long-poll/poll is fallback when WSS is unavailable.

## 7.4 Runner does not browse arbitrary Jobs

Runner asks for compatible authorized work.

Core remains authoritative for:

- fairness
- priority
- tenant/user isolation
- Job aging
- budget/policy
- pool selection

## 7.5 Targeted assignment remains valid for affinity cases

Use targeted assignment when:

- user pinned device
- large local-only artifact exists on one device
- active interactive session affinity
- hardware/device exclusive dependency
- explicit local data residency

---

# 8. Work Offer, Claim and Execution Session

## 8.1 Work offer

Recommended entity:

```text
work_offers
```

Fields:

```text
work_offer_id
job_id
pool_id
candidate_node_id optional
offer_scope
created_at
expires_at
state
reason
```

States:

```text
offered
accepted
declined
expired
revoked
```

## 8.2 Execution attempt

Every accepted execution creates/updates a canonical attempt:

```text
execution_attempt_id
job_id
attempt_no
runner_id/backend_id
local_runtime_id optional
state
started_at
ended_at
fencing_token
```

## 8.3 Execution session

An accepted Job MUST have a durable execution session identity so Core can route subsequent control/status to the owner.

```text
execution_session_id
execution_attempt_id
owner_kind
owner_id
control_profile_id
lease_id
fencing_token
```

---

# 9. Local Agent Execution Modes

SmartAIHub MUST not assume all agent sessions are managed identically.

## 9.1 AUTONOMOUS

Agent keeps its own tools/skills/MCPs.

Runner controls primarily:

- process/session envelope
- working directory
- resources
- job lease
- cancellation where possible
- artifacts

SmartAIHub may have incomplete visibility into external tool usage/cost.

## 9.2 COOPERATIVE — recommended default

Agent keeps user-owned tools.

Runner may additionally provision:

- SmartAIHub MCP
- job instructions
- context files
- execution policy guidance

SmartAIHub capability is an additional option, not a mandatory replacement.

## 9.3 MANAGED

Used when enterprise/policy/workflow requires strict control.

Runner may, only when the agent/runtime supports it:

- filter allowed MCP tools
- inject approved MCP config
- enforce hooks/policies
- restrict network/tool surface
- require SmartAIHub capability for specific steps

Managed mode MUST be explicit in Plan/policy.

---

# 10. Tool Binding Policy Inside Agent Sessions

Feature 196 SHOULD compile one of:

```text
FREE
PREFERRED
REQUIRED
FORBIDDEN
```

## 10.1 FREE

Agent may select any allowed user-owned or platform tool.

## 10.2 PREFERRED

Planner recommends one tool/capability but alternatives remain allowed.

Example:

```text
prefer user-owned FAL skill
SmartAIHub image generation remains fallback
```

## 10.3 REQUIRED

The Plan requires a specific capability/provider/path.

Examples:

- professional workflow requires SmartAIHub Pro
- user pinned Seedance
- enterprise policy requires private local execution

## 10.4 FORBIDDEN

Specific tool/path may not be used for that Plan Step.

Reasons may include:

- user preference
- compliance
- privacy
- previous high-confidence negative experience rule
- explicit admin restriction

Learning MUST NOT create permanent FORBIDDEN policy without policy/user authority.

---

# 11. Optional Job-Scoped SmartAIHub MCP for Runner-Hosted Agents

## 11.1 Purpose

When supported, Runner may make SmartAIHub platform capabilities available to an Agent via MCP.

Examples:

```text
smartaihub.library.search
smartaihub.image.generate
smartaihub.video.generate
smartaihub.audio.generate
smartaihub.job.status
```

## 11.2 Important limitation

This is optional.

Runner MUST NOT assume Claude/Codex/Hermes will necessarily use it.

The Agent may choose its own user-owned Skill/MCP/tool if Plan policy allows.

## 11.3 Job-scoped delegated credential

Runner-hosted Agent MUST NOT receive a general Runner device credential.

Use a short-lived delegated token constrained by:

```text
user_id
tenant_id
parent_job_id
execution_attempt_id
allowed_mcp_tools
budget envelope
expiry
audience
```

## 11.4 Child Job lineage

If Agent invokes SmartAIHub generation during a parent Job:

```text
Parent Job J100
└── Child Job J101 image.generate
```

Child MUST inherit or explicitly derive:

- goal_run_id
- workflow_run_id
- parent_job_id
- budget context
- privacy context
- approval policy
- provenance

## 11.5 Platform capability invocation is not mandatory mediation

If Agent uses the user's existing FAL skill directly, SmartAIHub MAY observe that only to the level exposed by the agent/runtime.

SmartAIHub MUST represent external cost as unknown when it cannot know it.

---

# 12. Durable Execution Control Protocol

## 12.1 Queue and control are different planes

Queue/work leasing answers:

> What work should this executor run?

Control answers:

> What should happen to work already owned/running?

Do not use the dispatch queue as the sole control channel.

## 12.2 Durable control inbox

Recommended canonical table:

```text
execution_control_commands
```

Fields:

```text
command_id
job_id
execution_attempt_id
execution_session_id
runner_id optional
command_type
payload_json
requested_by_type
requested_by_id
plan_revision
sequence
created_at
expires_at
state
delivered_at
acknowledged_at
applied_at
error_code
error_message
idempotency_key
```

States:

```text
created
queued
delivered
acknowledged
applied
rejected
unsupported
expired
failed
```

## 12.3 Transport

Runner:

```text
WSS notification = fast path
HTTPS control.next(cursor) = durable fallback
PostgreSQL control inbox = source of truth
```

## 12.4 Command types

```text
STATUS_REQUEST
STEER_CURRENT
PATCH_CONTEXT
PAUSE
RESUME
CANCEL_EXECUTION
CHECKPOINT
HANDOFF_REQUEST
SWITCH_LOCAL_RUNTIME
DRAIN_AFTER_STEP
```

## 12.5 Desired vs observed state

Never report a control request as completed merely because it was issued.

Store:

```text
desired_state
observed_state
```

Example:

```text
desired_state = cancelled
observed_state = running
control_state = cancel_requested
```

---

# 13. Control Capability Profile

Every runtime adapter/execution backend MUST declare what it can actually do programmatically.

Example dimensions:

```text
observe_lifecycle
observe_stage
observe_activity
native_percent
status_query
steer
pause
resume
cancel
checkpoint
resume_from_checkpoint
handoff
```

Suggested control levels:

```text
L0 NONE
L1 LEASE_ONLY
L2 COOPERATIVE_POLL
L3 SESSION_CONTROL
L4 FULL_INTERACTIVE
```

Runner itself should provide L4 at the Runner envelope level, while a nested local tool may expose less.

Plan may require a minimum control level for highly interactive work.

---

# 14. User Intervention During Execution

User commands may arrive from:

- SmartAIHub Web
- SmartAIHub Mobile
- voice
- external MCP client
- Telegram/other approved channel

They enter the Universal Command Gateway and are classified before action.

## 14.1 STEER_CURRENT

Example:

```text
"เน้นเฉพาะข้อมูล 6 เดือนล่าสุด"
```

If current runtime supports steer, send control command.

If not, policy chooses:

- allow current step to finish and redo affected work
- cancel/restart
- create new Plan revision

## 14.2 PATCH_FUTURE

Example:

```text
"หลัง research เสร็จ ให้สรุปไม่เกิน 2 นาที"
```

Do not interrupt current work unnecessarily.

Feature 196 creates Plan revision affecting future step(s).

## 14.3 SWITCH_EXECUTOR

Example:

```text
"หยุด Codex ใช้ Claude แทน"
```

Preference order:

1. safe local handoff on same Runner if possible
2. checkpoint + return Job to pool
3. cross-Runner handoff
4. allowed cloud/managed fallback
5. approval/replan if cost/semantic boundary changes

## 14.4 CANCEL

Cancel root Goal or selected step.

Pending work stops immediately. Feature 196 maps Goal/Step cancellation to the affected Jobs, and Feature 195 issues `CANCEL_EXECUTION` to currently owned execution sessions according to actual executor capability.

Uncancelable upstream work becomes detached/ignored and MUST NOT resurrect the cancelled Goal.

---

# 15. Local Handoff vs Cross-Runner Handoff

## 15.1 Local handoff

Example:

```text
Runner Windows-01
Codex → Claude
```

Runner SHOULD attempt:

1. request safe checkpoint
2. collect files/artifacts/session summary
3. stop/release old runtime
4. start new allowed runtime
5. inject handoff package
6. continue under new local runtime
7. report provenance

## 15.2 Cross-Runner handoff

If target runtime unavailable locally:

```text
Runner A releases execution ownership
Job → waiting_resource
Runner B claims
Runner B consumes portable checkpoint/artifacts
```

## 15.3 Handoff package

Suggested:

```text
original_goal_ref
plan_step_contract
current_plan_revision
completed_work_summary
remaining_work
checkpoint_ref
artifact_refs
files_manifest
constraints
quality_contract
control_history_summary
```

Secrets MUST NOT be embedded.

---

# 16. Executor Decline, Partial Work and Return-to-Pool

Do not collapse everything into FAILED.

Required dispositions:

```text
ACCEPTED
DECLINED
COMPLETED
PARTIAL
CANNOT_CONTINUE
FAILED
CANCELLED
LOST
```

## 16.1 DECLINED

Work not materially started.

Examples:

```text
NO_CAPACITY
CAPABILITY_UNAVAILABLE
AUTH_REQUIRED
TOOL_MISSING
POLICY_BLOCKED
```

Return Job to eligible pool.

Do not consume a full execution retry budget.

## 16.2 CANNOT_CONTINUE / PARTIAL

Work started but executor cannot finish.

Executor/Runner SHOULD return:

```text
completed_capabilities
remaining_capabilities
checkpoint_ref
artifact_refs
side_effect_state
reason_code
recommended_next_action
```

Preserve useful completed work.

## 16.3 Example: Grok to Codex

```text
Plan: Grok preferred, Codex/Hermes fallback
↓
Grok accepted
↓
Grok cannot continue
↓
partial artifacts preserved
↓
Job `waiting_resource` (`awaiting_eligible_executor`)
↓
Codex available
↓
Codex claims remaining work
↓
QC
↓
complete
```

If a local Grok/Agent instance is hosted behind Runner, SmartAIHub talks to Runner, not the nested tool directly.

---

# 17. Progress and Live Monitoring

## 17.1 Observability levels

```text
OPAQUE
LIFECYCLE
STAGE
ACTIVITY
NATIVE_PROGRESS
FULL_TRACE
```

## 17.2 Normalized progress event

Suggested:

```text
execution_id
job_id
stage
activity
progress_percent optional
progress_source
progress_confidence
eta_seconds optional
message
native_event_ref optional
timestamp
```

`progress_source`:

```text
executor_native
runner_derived
workflow_derived
estimated
unknown
```

## 17.3 Example UI

```text
Research & Storyboard

Grok Bot
  stopped — required internal capability unavailable

Codex · Office-PC-02
  running
  stage: research
  activity: reviewing sources

Next:
  storyboard generation
```

## 17.4 Live control buttons are capability-aware

UI MUST not show Pause if current execution cannot pause.

Possible controls:

```text
Give instruction
Switch executor
Pause
Resume
Cancel step
Cancel workflow
```

---

# 18. Failure Taxonomy

Retry decisions require typed failures.

Minimum classes:

```text
DISPATCH_FAILURE
ASSIGNMENT_EXPIRED
NODE_LOST
RUNTIME_CRASH
RESOURCE_EXHAUSTED
AUTH_FAILURE
INPUT_INVALID
DEPENDENCY_FAILURE
PROVIDER_FAILURE
RATE_LIMIT
NETWORK_FAILURE
OUTPUT_INVALID
QUALITY_FAILED
POLICY_FAILED
SIDE_EFFECT_UNCERTAIN
USER_CANCELLED
USER_REJECTED
```

Failure classification MUST include source and confidence when inferred.

---

# 19. Retry Budget Model

Do not use a single undifferentiated attempt counter.

Recommended counters:

```text
dispatch_attempt
work_offer_attempt
execution_attempt
same_node_retry
quality_attempt
repair_attempt
replan_count
```

## 19.1 Default policy example

```yaml
retry_budget:
  dispatch_max: 5
  execution_max: 3
  same_node_max: 1
  quality_retries_max: 2
  repair_max: 1
  replan_max: 1
```

These are defaults only. Capability/Offer policy may override.

## 19.2 Cost-aware retry

Expensive media generation may use fewer automatic retries than local FFmpeg.

Retry controller evaluates:

```text
failure type
side effects
estimated repeat cost
remaining credit budget
deadline
quality requirement
provider/runtime health
same failure recurrence
```

## 19.3 Node loss

Heartbeat loss does not immediately duplicate work.

Flow:

```text
heartbeat missing
→ suspect
→ grace period
→ lease expiry
→ reconcile
→ invalidate old fencing token
→ retry/requeue only when safe
```

Late results from stale fencing token cannot become canonical result.

---

# 20. Quality Guardrails

## 20.1 Quality contract originates from Feature 196

Example:

```yaml
quality_contract:
  capability: video.edit.semantic
  profile: professional
  hard_gates:
    playable: true
    audio_required: true
  semantic_gates:
    preserve_key_context: true
    remove_repeated_speech: true
```

## 20.2 QC layers

```text
Deterministic QC
Domain QC
AI evaluator
Human approval when needed
```

Examples:

Video:

- file integrity
- codec/resolution
- duration
- audio presence
- subtitle alignment
- semantic edit quality

Code:

- compile
- lint
- tests
- acceptance test

Research:

- source freshness
- citation coverage
- required topics
- duplication

## 20.3 Quality state

```text
OUTPUT_PRODUCED
→ VALIDATING
→ QUALITY_PASS
or QUALITY_FAILED
```

Only pass becomes canonical completion when QC mandatory.

## 20.4 Structured QC feedback

QC failure SHOULD generate machine-readable feedback:

```text
failure_codes
severity
repairable
recommended_action
feedback_json
```

## 20.5 Repair before regenerate

If local repair is cheaper and semantically safe, repair partial output rather than regenerate all work.

## 20.6 Avoid ineffective repetition

Repeated same failure should cause strategy escalation:

```text
same runtime retry
→ different local runtime/node
→ fallback Offer
→ replan
→ human/user decision
```

---

# 21. Retry Scope and DAG Reuse

When one step fails, do not rerun unaffected upstream work.

Example:

```text
Research ✓
Script ✓
Storyboard ✓
Video ✕
Edit waiting
```

Retry/replan only invalidates the failed step and dependent descendants as required.

Paid or expensive outputs already valid SHOULD be reused.

Dynamic children remain tied to stable root Goal/Workflow identifiers.

---

# 22. Execution Journey and Provenance

Every Job MUST be reconstructable end-to-end.

Example:

```text
Goal
↓
Plan revision 4
↓
Step research.deep
↓
Runner pool user-owned
↓
Runner Office-PC-02
↓
Codex CLI
↓
Browser activity
↓
Codex handoff requested
↓
Claude CLI
↓
SmartAIHub child image.generate
↓
Provider result
↓
Runner FFmpeg
↓
QC
↓
Completed
```

## 22.1 Provenance events

Recommended normalized events extend existing Feature 195 events:

```text
execution.pool_selected
execution.work_offered
execution.work_declined
execution.work_claimed
execution.runner_selected
execution.local_runtime_selected
execution.local_runtime_changed
execution.control_requested
execution.control_acknowledged
execution.control_applied
execution.checkpoint_created
execution.handoff_started
execution.handoff_completed
execution.child_job_requested
execution.child_job_completed
execution.quality_started
execution.quality_failed
execution.repair_started
execution.quality_passed
execution.retry_scheduled
execution.retry_exhausted
execution.replan_required
```

## 22.2 Provenance must include versioning

When available:

```text
runner_version
adapter_version
local_tool_version
agent_version
model/version
MCP server identity/version
plan_revision
policy_version
capability_contract_version
```

This is required for learning validity.

---

# 23. Experience Learning and Adaptive Planning

## 23.1 Goal

SmartAIHub should improve future Plans from observed execution history without pretending to retrain vendor models.

Learning occurs through:

- telemetry
- experience memory
- procedural/workflow lessons
- offer performance profiles
- user/tenant preferences
- capability/version-aware evidence

## 23.2 Three storage levels

### Execution Ledger

Raw facts:

```text
who executed
what runtime
what version
latency
cost
failures
handoffs
QC
user interventions
```

### Experience Store

Derived observations:

```text
Codex slow for this task class
Grok frequently cannot continue for this capability
Claude successful but expensive external tooling unknown
```

### Planning Memory

Curated rules/preferences that Planner may consume:

```text
For tenant X and workflow Y, prefer Codex before Grok under Use-My-Tools profile.
```

Planner MUST NOT query unbounded raw logs on every Goal.

## 23.3 Learning levels

```text
operational temporary
capability/offer performance
user-specific
tenant-specific
workflow/procedural
platform-wide verified evidence
```

## 23.4 Evidence and confidence

A single failure does not create a hard rule.

Store:

```text
evidence_count
confidence
failure_context
applicable_task_class
applicable_domain
version_scope
created_at
last_confirmed_at
expires_at/time_decay
```

## 23.5 Version awareness

A major Claude/Codex/Hermes/Offer/runtime upgrade SHOULD reduce or invalidate prior performance assumptions.

Never keep permanent negative policy against a tool solely because an old version failed.

## 23.6 Recommendation strengths

Learning output SHOULD use:

```text
PREFER
RECOMMEND
DEPRIORITIZE
SOFT_AVOID
UNKNOWN
```

`HARD_BLOCK` requires explicit policy/security/user/admin authority, not autonomous performance learning alone.

## 23.7 Negative experience memory

Store not only what worked but:

```text
what was attempted
why it failed
what replaced it
what eventually worked
```

This is essential for adaptive planning.

## 23.8 Post-run analyzer

After Goal Run completion/final failure:

```text
Plan vs actual
expected vs actual duration
expected vs actual cost
fallbacks
executor declines
failures
QC failures
repairs
user interventions
manual corrections
final acceptance
```

Output may be:

```text
no durable lesson
experience candidate
planning preference candidate
workflow improvement candidate
adapter/capability re-evaluation candidate
```

## 23.9 Avoid self-reinforcing bias

If Planner always chooses one proven executor, alternatives never collect new evidence.

Controlled exploration MAY be allowed only when:

- low risk
- budget permits
- privacy policy permits
- user/tenant policy permits
- no explicit vendor pin

Exploration results must be labeled as such.

---

# 24. Runner Learning Feedback

Platform may send Runner non-sensitive learned operational hints, for example:

```text
adapter X has increased crash rate on version Y
avoid runtime Z for capability Q until re-probed
```

Runner may use local history for local tie-breaking.

Runner MUST NOT independently convert SmartAIHub experience into hidden hard policy.

All material routing restrictions remain visible/auditable at Core/Plan level.

---

# 25. Cost Governance

## 25.1 Distinguish SmartAIHub-managed cost and external user-owned cost

SmartAIHub can authoritatively meter:

- SmartAIHub credits
- SmartAIHub provider calls
- SmartAIHub child Jobs

SmartAIHub may not know exact cost of:

- user Claude subscription
- user Codex subscription
- user FAL account
- user-owned MCP services
- arbitrary local paid CLI/API

Represent unknown as unknown, not zero.

## 25.2 Agent autonomy must not create unlimited SmartAIHub spend

Job-scoped SmartAIHub delegated capability calls inherit:

- remaining Job/Goal credit budget
- capability count limits
- approval thresholds
- tenant spending policy

## 25.3 Retry charging class

Suggested:

```text
system_recovery
provider_failure
quality_remediation
user_refinement
user_requested_rerun
```

Platform-caused duplicate/recovery work SHOULD NOT automatically charge the same service fee again.

---

# 26. Security and Trust Boundaries

## 26.1 Credentials are distinct

Never reuse:

```text
RunnerDeviceCredential
MCPInboundPrincipal
ConnectorCredential
JobScopedDelegatedCredential
```

## 26.2 Runner device identity

Runner credential permits only scoped Runner protocol operations for that user/tenant/device.

## 26.3 Job-scoped delegated credential

Nested Agent receives the minimum SmartAIHub capability necessary for the parent Job.

## 26.4 Local user credentials stay local by default

Claude/Codex/Hermes/local MCP authentication SHOULD remain on the user's machine when possible.

Core only needs health metadata such as:

```text
authenticated = true/false
```

not the vendor secret itself.

## 26.5 Permission delegation is attenuating

Nested local Agent/tool cannot receive more permission than:

```text
user/tenant permission
∩ plan permission
∩ job permission
∩ runner policy
```

## 26.6 High-impact side effects

Publish/delete/payment/email-send/database destructive operations require stronger idempotency/reconciliation and approval policies.

---

# 27. MCP Design Requirements

## 27.1 Follow current MCP transport/auth semantics

SmartAIHub MCP implementation SHOULD track the current MCP specification and avoid custom assumptions that conflict with protocol evolution.

At time of this spec, MCP 2026-07-28 uses a stateless core and extensions, with long-running work represented through the Tasks extension rather than assuming a permanent bidirectional session.

Therefore SmartAIHub's own durable Job lifecycle remains canonical even when MCP Tasks are used as the client-facing representation.

## 27.2 Inbound MCP long-running tool call

For long operations, SmartAIHub SHOULD return a durable task/job handle rather than hold an HTTP request for the entire generation/render duration.

Mapping concept:

```text
MCP Task
↔ SmartAIHub Job/Goal Run
```

MCP lifecycle is an integration surface; SmartAIHub Job remains system of record.

## 27.3 MCP tool exposure is least privilege

Expose only intentional tools.

A client connected to SmartAIHub MCP does not automatically inherit Runner execution privileges.

---

# 28. Suggested Database Additions / Extensions

Reuse existing canonical tables where possible.

Recommended additions or normalized views:

```text
runner_tool_inventory
runner_capability_inventory
runner_runtime_health
runner_resource_snapshots

work_offers
execution_attempts
execution_sessions
execution_control_commands
execution_handoffs
execution_checkpoints

quality_evaluations
retry_budget_state

experience_observations
planning_lessons
workflow_learning_candidates
```

## 28.1 `runner_tool_inventory`

Suggested fields:

```text
runner_id
tool_id
tool_kind
display_name
version
adapter_id
adapter_version
discovery_source
installed_state
auth_state
health_state
last_probe_at
metadata_json
```

## 28.2 `runner_capability_inventory`

```text
runner_id
capability_id
contract_version
implementation_id
availability_state
control_profile_id
resource_profile_json
confidence
last_verified_at
```

## 28.3 `execution_handoffs`

```text
handoff_id
job_id
from_attempt_id
to_attempt_id optional
reason
checkpoint_ref
artifact_manifest_ref
completed_capabilities_json
remaining_capabilities_json
requested_by
state
created_at
completed_at
```

## 28.4 `experience_observations`

```text
observation_id
scope_type
scope_id
task_class
capability_id
offer_id optional
runtime_id optional
version_scope_json
observation_type
evidence_count
confidence
metrics_json
reason_codes_json
first_seen_at
last_seen_at
expires_at
```

## 28.5 `planning_lessons`

```text
lesson_id
scope_type
scope_id
applicability_json
recommendation_type
recommendation_json
evidence_refs
confidence
status
created_by
created_at
last_validated_at
expires_at
```

---

# 29. Suggested Runner Protocol Surface

Exact paths may change, but protocol semantics should include:

```text
POST /runner/session/connect or WSS connect
POST /runner/heartbeat
POST /runner/capabilities/snapshot
POST /runner/capabilities/delta
POST /runner/leases/next
POST /runner/executions/{id}/accepted
POST /runner/executions/{id}/declined
POST /runner/executions/{id}/events
POST /runner/executions/{id}/heartbeat
POST /runner/executions/{id}/checkpoint
POST /runner/executions/{id}/complete
POST /runner/executions/{id}/fail
POST /runner/executions/{id}/handoff
GET/POST /runner/control/next
POST /runner/control/{command_id}/ack
POST /runner/control/{command_id}/result
```

WSS messages are hints/fast-path delivery, not the sole durable record.

---

# 30. UI/UX Requirements

## 30.1 User — Execution / Work

User should see Goal-level state first, technical details progressively disclosed.

Example:

```text
Creating Product Video

✓ Research
⚠ First executor could not continue
● Codex · Office PC
  Researching sources
○ Storyboard
○ Generate video
○ Edit & QC
```

Available actions based on current capability:

```text
Give instruction
Change executor
Pause
Cancel
View history
```

## 30.2 Execution Journey

Timeline MUST show:

- Plan revisions
- executor changes
- Runner/device
- local runtime/tool
- retries
- quality failures
- handoffs
- user interventions
- child Jobs
- final result

## 30.3 Runner Devices UI

For each Runner:

```text
online/offline
platform/version
resources
current Jobs
installed recognized tools
capabilities
auth/health status
slots
last scan
rescan
runtime package status
```

Do not expose secrets.

## 30.4 Learning UI

User/tenant should be able to see significant learned preferences:

```text
For similar jobs, SmartAIHub currently prefers Codex before Grok.
Reason: 7/8 recent runs completed; Grok could not continue in 3/4 comparable runs.
```

Actions:

```text
Keep
Ignore for this task
Reset preference
Pin another tool
```

Learning UI SHOULD distinguish:

- user preference
- observed telemetry
- temporary health condition
- admin policy

---

# 31. Admin UI Requirements

Admin views:

```text
Execution Fabric
├── Jobs
├── Runner Fleet
├── Runner Capabilities
├── Runtime Adapters
├── Work Pools
├── Control Commands
├── Handoffs
├── Quality / Retry
├── Experience Learning
├── MCP Inbound
├── MCP Outbound Connectors
└── Audit / Diagnostics
```

Admin must be able to inspect why scheduler chose/rejected a Runner/tool without exposing unrelated tenant data.

---

# 32. End-to-End Case Study A — Multi-machine company pool

Tenant has:

```text
Runner Win-01: Codex + FFmpeg, busy
Runner Win-02: Codex + Claude, free
Runner Mac-01: Hermes + Claude, free
```

Goal requires `research.deep` and `document.write`, profile `Use My Tools First`.

Flow:

```text
196 compiles capability + allowed local implementation envelope
↓
195 creates ready Job
↓
Runner pool notified
↓
Win-02 lease_next()
↓
Core atomic claim
↓
Runner local resolver selects Codex
↓
Codex starts
↓
progress events
↓
QC
↓
complete
```

No direct Codex node registration required.

---

# 33. End-to-End Case Study B — Grok/Codex fallback

Plan:

```text
preferred = Grok-compatible Offer
fallback = Codex, Hermes
```

Grok path cannot continue.

Flow:

```text
attempt disposition = CANNOT_CONTINUE
partial artifacts/checkpoint preserved
lease released
Job = `waiting_resource` with reason `awaiting_eligible_executor`
↓
next allowed executor claims
↓
Codex executes remaining work
↓
QC
↓
complete
```

Execution Journey preserves the entire path.

Learning stores that Grok path could not continue for this task/version/context, but does not permanently ban Grok after one event.

---

# 34. End-to-End Case Study C — User changes executor while running

Current:

```text
Runner Office-PC
Codex running research
```

User:

```text
"หยุด Codex ใช้ Claude แทน"
```

Flow:

```text
Command Gateway
↓
SWITCH_EXECUTOR intent
↓
Feature 196 validates semantics/policy
↓
195 control command HANDOFF_REQUEST
↓
Runner ACK
↓
Codex checkpoint/stop
↓
Runner finds Claude locally
↓
local handoff
↓
Claude resumes from handoff package
↓
provenance + learning event
```

If Claude is not available locally, Runner releases to global pool.

---

# 35. End-to-End Case Study D — User changes future output only

Current research continues.

User:

```text
"พอ research เสร็จ สรุปให้ผลลัพธ์ไม่เกิน 2 นาที"
```

Flow:

```text
Command Gateway
↓
PATCH_FUTURE
↓
Feature 196 creates Plan revision N+1
↓
current research remains on revision N
↓
future summary uses revision N+1
```

Do not interrupt current executor unnecessarily.

---

# 36. End-to-End Case Study E — Agent uses user-owned image tool

Runner launches Claude in COOPERATIVE mode.

Claude already has user's FAL skill.

Plan:

```text
image capability binding = FREE/PREFERRED user-owned
SmartAIHub image = fallback
```

Claude chooses FAL skill.

Runner/Core record only telemetry actually observable.

External cost may remain unknown.

SmartAIHub does not force its own image provider.

---

# 37. End-to-End Case Study F — Agent invokes SmartAIHub generation

Same Runner/Agent, but user-owned video tool is unavailable or Plan requires SmartAIHub video.

Agent sees optional Job-scoped SmartAIHub MCP and calls:

```text
smartaihub.video.generate
```

Core:

```text
creates child Job
checks budget/policy
selects provider/backend
waits asynchronously
returns artifact handle
```

Agent continues parent workflow.

This is visible in provenance and billing.

---

# 38. End-to-End Case Study G — Quality failure and repair

Runner FFmpeg completes successfully.

QC detects bad semantic cuts.

Flow:

```text
OUTPUT_PRODUCED
↓
QUALITY_FAILED
↓
structured feedback
↓
repairable? yes
↓
repair child/attempt
↓
QC
↓
PASS
```

If repeated failure reaches quality budget:

```text
fallback / replan / user approval
```

Do not keep repeating identical strategy indefinitely.

---

# 39. End-to-End Case Study H — Runner disappears

```text
Runner claims Job
↓
heartbeat disappears
↓
suspect
↓
lease expires
↓
reconcile
```

If Runner returns with valid recoverable journal before replacement execution is committed, Core may resume according to fencing/recovery policy.

If ownership moved to another attempt, stale Runner output cannot overwrite canonical result.

---

# 40. Legacy Migration Strategy

## Phase 0 — Architecture freeze

Before implementation:

- approve this spec
- verify revised 195/196/197 contain no unresolved ownership/contract conflicts
- prohibit new direct-local executor integrations

## Phase 1 — Runner identity and capability inventory

Implement:

- Runner registration
- capability snapshots
- local tool registry
- basic adapters
- Runner UI inventory

Legacy Worker continues existing jobs.

## Phase 2 — Pool-based leasing

Implement:

- work offers
- lease_next
- atomic claim
- Runner pool scheduling
- targeted affinity

## Phase 3 — Execution sessions and control inbox

Implement:

- execution sessions
- WSS control fast path
- durable control inbox
- cancel/status/checkpoint

## Phase 4 — Agent adapters

Add native adapters for priority CLIs:

- Codex
- Claude
- Hermes

Support AUTONOMOUS and COOPERATIVE first.

Do not block release on full Managed mode.

## Phase 5 — Local handoff and cross-runner handoff

Implement:

- checkpoint packages
- local runtime switch
- global requeue/handoff

## Phase 6 — Quality/retry integration

Implement:

- failure taxonomy
- layered retry budgets
- QC contracts
- repair/fallback escalation

## Phase 7 — Provenance UI

Implement full execution journey.

## Phase 8 — Experience learning

Start with telemetry/statistics before autonomous planning rules.

Progression:

```text
observe
→ recommend
→ user-confirmed preference
→ bounded auto-routing
```

Avoid jumping directly to self-modifying hard policy.

## Phase 9 — MCP separation and advanced integration

Ensure:

- inbound SmartAIHub MCP scopes
- outbound MCP connectors
- Job-scoped SmartAIHub MCP delegation
- current MCP Tasks integration for long operations

## Phase 10 — Legacy worker retirement

Retire old local execution paths only after:

- equivalent capability exists
- reliability SLO met
- migration telemetry proves stability
- rollback path tested

---

# 41. Alignment Requirements Applied to Revised Feature 195

The revised Feature 195 produced with this architecture MUST include, and has been aligned to include:

1. Runner-first local execution invariant
2. capability-pool leasing rather than default node preassignment
3. targeted assignment only for affinity cases
4. work offer entity
5. execution session entity
6. durable control inbox
7. Runner local runtime topology/provenance
8. local decline / partial handoff dispositions
9. layered retry counters
10. QC as completion gate
11. local/cross-runner handoff
12. execution journey events introduced in this spec
13. Runner capability snapshots/deltas
14. local tool inventory is subordinate to Runner identity

Any remaining legacy text that models every local Agent as an independent execution node is subordinate to the revised Runner-first local-execution sections in Feature 195 and SHOULD be removed during implementation-document cleanup.

---

# 42. Alignment Requirements Applied to Revised Feature 196

The revised Feature 196 produced with this architecture MUST include, and has been aligned to include:

1. control requirement in Plan Step
2. local tool binding policy: FREE/PREFERRED/REQUIRED/FORBIDDEN
3. local_resolution_allowed
4. minimum control level when required
5. allowed local implementation set
6. Plan-revision semantics for user intervention
7. quality contract handed to Feature 195
8. experience/learning context input
9. user-owned-tool cost may be unknown
10. history-based preferences remain evidence/version aware
11. planner must distinguish tool pinning from Use-My-Tools profile

---

# 43. Feature 197 Ownership Boundary

Feature 197 owns:

```text
Runner capability discovery model
Runner local runtime topology
Runner local resolver contract
execution control protocol semantics
handoff protocol
provenance schema extension
experience learning model
adaptive planning feedback contract
```

Feature 197 does NOT own:

```text
canonical Job source of truth        → Feature 195
queue/capacity/provider accounting   → Feature 195
Goal semantics                       → Feature 196
Plan compilation                     → Feature 196
user credit ledger                   → existing Core/billing
public MCP product tool definitions  → MCP/API feature modules
```

---

# 44. Non-Goals

This feature does not require:

- retraining Claude/Codex/Hermes model weights
- intercepting every internal Agent tool call
- knowing exact cost of every user-owned subscription
- forcing SmartAIHub provider usage
- replacing MCP with Runner protocol
- making MCP clients equivalent to Runner devices
- direct Cloudflare Queue access from Runner
- perfect percent progress from opaque executors
- immediate autonomous self-modification of production workflows

---

# 45. Acceptance Criteria

Architecture is ready for implementation only when all are true:

## Runner

- [ ] one Runner identity can expose many local runtimes/capabilities
- [ ] local CLIs do not require direct Core registration
- [ ] capability rescan detects newly installed supported tools
- [ ] capability/auth/health changes reach Core
- [ ] local resolver obeys Plan policy
- [ ] Runner can decline incompatible work safely

## Leasing

- [ ] default local work can remain unassigned until an eligible Runner claims it
- [ ] competing Runner claims are atomic
- [ ] device affinity can force targeted routing
- [ ] tenant-shared pools are supported

## Control

- [ ] every running attempt has durable execution session identity
- [ ] control command survives WSS disconnect
- [ ] command has ACK/APPLIED/FAILED lifecycle
- [ ] stale fencing tokens cannot commit canonical output
- [ ] local and cross-runner handoff are distinguishable

## Agent autonomy

- [ ] existing user Skills/MCPs remain available in AUTONOMOUS/COOPERATIVE modes
- [ ] SmartAIHub capability exposure can be optional
- [ ] Planner can require SmartAIHub path when necessary
- [ ] unknown external cost is represented honestly

## Quality/retry

- [ ] execution success and quality pass are distinct
- [ ] retry counters are typed
- [ ] node loss uses reconciliation before duplicate execution
- [ ] repeated QC failure escalates strategy
- [ ] valid upstream artifacts are reused

## Monitoring

- [ ] user can see current executor and why it changed
- [ ] execution journey reconstructs all attempts/handoffs
- [ ] progress source/confidence is recorded
- [ ] unsupported controls are not shown as available

## Learning

- [ ] history can influence future planning without hard-blocking after one failure
- [ ] evidence is version/context aware
- [ ] user/tenant/global observations are separated
- [ ] user can override learned preference
- [ ] old evidence decays/revalidates after major runtime version change

## MCP boundaries

- [ ] Runner credentials cannot be used as MCP client credentials
- [ ] inbound MCP cannot claim arbitrary Runner Jobs
- [ ] outbound connector credentials remain separate
- [ ] long MCP operations map to durable SmartAIHub Jobs/Tasks rather than one blocking request

---

# 46. Pre-Implementation Test Matrix

At minimum create architecture tests for:

```text
1 user / 1 Runner / 1 CLI
1 user / 1 Runner / multiple CLIs
1 user / multiple Runners
1 tenant / shared Runner pool
local tool busy
local tool auth expired
Runner offline before claim
Runner lost after claim
same-machine Codex→Claude handoff
cross-machine handoff
opaque Agent progress
native detailed progress
user PATCH_FUTURE
user SWITCH_EXECUTOR
user CANCEL_GOAL_RUN
quality fail → repair
quality fail → fallback
expensive provider retry budget
user-owned tool cost unknown
SmartAIHub MCP child Job
inbound MCP long-running request
outbound MCP connector call
plan revision during active Goal
major tool version change invalidates old learning confidence
```

---

# 47. Observability / SLO Suggestions

Measure separately:

```text
job dispatch latency
work offer expiry rate
runner claim latency
runner reconnect rate
control delivery latency
control apply latency
heartbeat loss rate
handoff success rate
checkpoint reuse rate
quality first-pass rate
retry rate
fallback rate
replan rate
user intervention rate
planner recommendation acceptance
learned-rule override rate
```

Do not collapse all failures into one “Job success rate”.

---

# 48. Architecture Decision Summary

Final architecture decisions from this session:

1. **Runner-first local execution** — local Claude/Codex/Hermes/FFmpeg/etc. live behind Runner.
2. **Runner is one device identity with many capabilities** — not one Core registration per local tool.
3. **Runner continuously discovers and learns local capabilities** — new CLI/MCP installs can expand eligible work.
4. **Global scheduler chooses Runner/pool; Runner local resolver chooses local implementation when permitted.**
5. **Pool-based pull leasing is the default** — physical node is not pinned before claim unless affinity requires it.
6. **Queue and execution control are separate** — durable control inbox + WSS/HTTPS.
7. **Running work is interactive where capability allows** — steer, patch future plan, cancel, handoff.
8. **Runner supervises Agents but does not forcibly mediate every Agent tool call.**
9. **User-owned Skills/MCP/subscriptions remain first-class choices.**
10. **SmartAIHub MCP inside Runner-hosted Agent is optional/additional, or required only when Plan explicitly binds it.**
11. **MCP inbound, MCP outbound and Runner execution are different trust/authority paths.**
12. **Executor decline/partial/cannot-continue are distinct from failure.**
13. **Execution completion requires mandatory QC pass.**
14. **Retry is typed, budgeted and cost-aware.**
15. **Execution Journey is fully auditable.**
16. **History feeds an evidence/version-aware adaptive planning loop.**
17. **Learning recommends/deprioritizes; hard policy remains explicit.**
18. **SmartAIHub remains the global orchestrator while Runner becomes the local execution/control plane.**

---

# 49. Recommended Architecture Freeze

Before coding, treat this document as the architecture freeze candidate.

Recommended next engineering step after review:

```text
A. patch Feature 195 requirements
B. patch Feature 196 contracts
C. create Feature 197 implementation plan
D. audit current Worker/Runner code against this architecture
E. map existing tables/endpoints to reuse vs migration
F. only then begin implementation
```

Do not start by coding adapters for Claude/Codex/Hermes first. The control/session/lease/capability contracts must exist first or each adapter will accidentally create its own incompatible architecture.

---

# 50. External Standards / Reference Notes

Non-normative references checked while preparing this architecture:

- Model Context Protocol specification / authorization and current protocol evolution: https://modelcontextprotocol.io/
- MCP 2026-07-28 release notes: https://blog.modelcontextprotocol.io/posts/2026-07-28/
- Hermes MCP documentation: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
- Hermes Skills documentation: https://hermes-agent.nousresearch.com/docs/user-guide/features/skills

Vendor-specific runtime controls MUST still be implemented behind adapters and feature-detected at runtime; this specification intentionally does not assume every vendor exposes the same session/control API.

---

# 51. Final Principle

The architecture should optimize for this invariant:

> **A user should be able to add more capable machines, CLIs, agents, MCP servers and local tools over time without forcing SmartAIHub Core to gain a new bespoke execution architecture for every tool. Runner absorbs local diversity; Feature 195 controls execution truth; Feature 196 controls intent and planning; Feature 197 turns execution history into better future decisions.**


---

# 52. Cross-Spec Contract Map

The following map is normative for implementation ownership.

| Concern | Feature 195 | Feature 196 | Feature 197 |
|---|---|---|---|
| Canonical Job state | Authoritative | No | No |
| Queue/outbox/lease/fencing | Authoritative | No | Contract consumer only |
| Goal semantics | No | Authoritative | No |
| Plan/DAG compilation | No | Authoritative | Supplies capability/experience inputs |
| Offer eligibility / semantic binding | Enforces compiled set | Authoritative | No |
| Runner pool claim | Authoritative execution | Supplies topology policy | Defines Runner fabric semantics |
| Physical Runner selection | Authoritative at execution | Usually not pinned | Supplies capability/locality model |
| Local Claude/Codex/Hermes selection | Enforces/records | Defines allowed binding policy | Runner local resolver contract |
| Runner capability discovery | Stores/consumes canonical snapshot | Consumes snapshot | Defines discovery/probe model |
| Runtime control commands | Persists/enforces | Classifies semantic change | Defines protocol semantics |
| User live intervention | Applies execution effects | Authoritative semantic classification/revision | Defines handoff/control patterns |
| Retry/watchdog/recovery | Authoritative | Supplies policy envelope | Defines layered retry patterns |
| Quality requirement | Executes/evaluates | Defines acceptance contract | Defines QC/repair architecture |
| Provenance ledger | Authoritative execution events | Consumes for UI/plan history | Defines nested Runner provenance extension |
| Experience learning | Emits facts | Consumes curated evidence | Defines extraction/confidence/decay model |
| User-owned external cost | Records known/unknown actuals | Plans with known/estimated/unknown | Defines observability limitation |
| MCP inbound command | Executes resulting Jobs only | Command/Goal ingress semantics | Defines boundary relative to Runner |
| MCP outbound connector | Executes connector-backed Jobs | May select as capability implementation | Defines topology/boundary |

No implementation team should create a new source of truth merely because a concern appears in more than one spec.

---

# 53. Runner Job Bootstrap Profile

Runner-hosted general-purpose Agents need a deterministic way to understand the current Job without assuming they know SmartAIHub internals.

Runner SHOULD build a **Job Bootstrap Profile** from Feature 196 + Feature 195 contracts.

Suggested contents:

```text
job/goal identity references
human-readable objective
current Plan Step contract
input/artifact references
allowed/forbidden local implementations
local tool binding policy
agent execution mode
quality contract summary
budget/approval hints safe for the Agent
privacy/data constraints
required output schema
current retry/handoff context
optional SmartAIHub MCP availability
```

The profile MAY be injected through the mechanism appropriate to the Agent:

```text
CLI prompt/instruction
session system/context file
workspace instruction file
job-scoped MCP configuration
adapter-specific session metadata
```

Runner MUST NOT assume the Agent understands Runner-specific APIs unless the adapter explicitly supports them.

This solves the architecture problem where Claude/Codex/Hermes normally know only their own Skills/MCP/tools: SmartAIHub communicates Job intent/policy through the adapter/bootstrap layer, while optional SmartAIHub MCP remains just another capability available under policy.

---

# 54. Capability Discovery Confidence and Expiry

Dynamic discovery requires freshness controls so Planner does not rely on stale local capability state.

Each discovered capability SHOULD carry:

```text
runner_id
capability_id
implementation_id
adapter_id/version
discovery_source
verification_state
confidence
last_probed_at
last_successful_execution_at
expires_at / stale_after
current_slot_state
resource requirement snapshot
control_profile_id
```

Core MAY mark a capability `stale` when probe/heartbeat age exceeds policy.

A stale capability can remain visible for history but SHOULD NOT be treated as immediately executable unless revalidated.

Execution-time admission MUST re-check critical capability/auth/resource state before irreversible or expensive work.

---

# 55. Learning Data Governance

Experience learning MUST follow the same tenant/user/privacy boundaries as execution data.

Rules:

1. raw execution logs remain subject to retention policy
2. derived observations MUST retain source scope and evidence references
3. user-specific preferences are not promoted to tenant/global policy automatically
4. tenant-specific execution history MUST NOT leak into another tenant's explanations
5. secrets/prompts containing credentials MUST be redacted before durable learning extraction
6. deletion/retention requests MUST propagate to derived learning records where policy requires it
7. learning candidates derived from sensitive content SHOULD prefer aggregated metadata over raw content
8. planning-memory records MUST record provenance/evidence IDs sufficient for audit and revocation

Learning quality is not a justification to bypass privacy or retention requirements.

---

# 56. Learning Feedback States

A planning lesson SHOULD have an explicit lifecycle rather than becoming active immediately after extraction.

Suggested states:

```text
candidate
observing
active
challenged
stale
superseded
disabled
expired
```

Promotion to `active` SHOULD consider:

```text
minimum evidence count
confidence threshold
version consistency
failure-class relevance
recent contradictory evidence
user/admin feedback
```

A major tool/Agent/runtime version update SHOULD move affected lessons to `stale` or lower confidence until new evidence arrives.

---

# 57. Cross-Spec Event Correlation

All cross-spec execution/control/learning events MUST be correlatable without relying on free-text logs.

Recommended identifiers where applicable:

```text
event_id
schema_version
tenant_id
user_id
goal_id
goal_run_id
workflow_run_id
plan_id
plan_revision
plan_step_id
job_id
execution_attempt_id
execution_session_id
runner_id
local_runtime_session_id optional
parent_event_id / causation_id
correlation_id
sequence
occurred_at
```

Examples:

```text
User command
→ Plan revision
→ control command
→ Codex checkpoint
→ Claude local handoff
→ child image Job
→ QC result
→ planning lesson candidate
```

The complete causal chain MUST be reconstructable from stable IDs even if logs are archived separately.

---

# 58. Implementation Freeze Checklist

Before implementation begins, the combined 195/196/197 baseline MUST satisfy:

1. one canonical Job source of truth
2. one Plan/Goal semantic authority
3. Runner-first local execution with no parallel direct-local registration path by default
4. pool-first Runner work leasing
5. local resolver constrained by Plan policy
6. durable execution sessions and control inbox
7. truthful progress/observability levels
8. local and cross-Runner handoff
9. layered retry and typed failures
10. QC completion gate
11. user-owned tool freedom with explicit binding policies
12. optional job-scoped SmartAIHub MCP, not mandatory mediation
13. clear Runner/MCP inbound/MCP outbound boundaries
14. complete nested provenance
15. version/freshness-aware capability discovery
16. evidence/confidence/version-aware adaptive planning
17. learning privacy/retention governance
18. cross-spec contract tests for plan→job→runner→events→learning
19. backward-compatible migration from legacy Worker and existing queues
20. rollback path for each migration phase

Failure of any P0 item above blocks production architecture freeze.


---

# 59. Attempt, Session and Handoff Cardinality

To keep Feature 195 retry metrics correct, Feature 197 adopts the following cardinality:

```text
Job
└── Execution Attempt (canonical ownership lease)
    └── one or more Local Runtime Sessions
        └── tool/subagent activities
```

A local Codex→Claude handoff on the same Runner MAY stay inside one execution attempt if Runner retains the same canonical lease/fencing ownership and policy permits the switch.

It MUST create:

```text
new local_runtime_session_id
execution_handoff record
runtime_changed provenance event
```

A cross-Runner handoff, lease recovery or return-to-pool/new claim creates a new execution attempt and fencing generation.

This rule is normative across 195/197.

---

# 60. Outbound MCP / Connector Execution Semantics

SmartAIHub outbound MCP is a capability implementation, not a Runner identity.

For durable/async outbound MCP work:

```text
Feature 196 selects capability/Offer
→ Feature 195 creates/owns Job
→ outbound connector/MCP adapter invokes external service
→ task/request identifier persisted when available
→ waiting_external / polling/webhook continuation
→ result/artifact normalized back into Job
```

If the external MCP service itself runs locally behind Runner, use the Runner path instead of creating a duplicate direct connector identity unless architecture explicitly requires remote access.

Outbound MCP authentication is scoped as `ConnectorCredential`, never `RunnerDeviceCredential` or public MCP inbound principal.


---

# 61. Runner Adapter Catalog and Extensible Discovery

Runner capability growth depends on an adapter/manifest catalog rather than Core knowing every future CLI.

Recommended model:

```text
Runner Adapter Catalog
├── built-in signed adapters
├── signed runtime-package adapters
├── approved generic CLI manifests
└── tenant/admin-approved custom adapters
```

Adapter metadata SHOULD declare:

```text
adapter_id/version
supported OS/architecture
discovery rules
safe probe commands
capability mappings
control profile
artifact collection contract
resource model
minimum Runner protocol version
signature/provenance
```

Discovery engine matches local tools to known adapters. Unknown executables remain `discovered/unsupported` until an approved adapter/manifest exists.

Runner may update adapters independently of SmartAIHub Core when compatibility and signature policy permit, reducing Core integration churn.

---

# 62. Local Authentication and User Action

Runner may detect Claude/Codex/Hermes/MCP tooling but cannot assume authentication is usable.

Normalize:

```text
not_installed
installed_auth_unknown
auth_required
auth_expired
ready
```

Authentication remains local whenever possible.

Runner UI may guide the user to execute the vendor's normal login flow and then re-probe.

Core receives state, not the local secret.

A Job may wait/fallback/decline according to Plan policy when required auth is unavailable.

---

# 63. Runner Delegated SmartAIHub Capability Client

Runner itself, not only a nested Agent, may request SmartAIHub capabilities as part of a deterministic local flow.

Example:

```text
Runner-native storyboard/render flow
→ local analysis
→ request SmartAIHub image.generate
→ await child Job artifact
→ local FFmpeg composition
```

This uses a Runner protocol child-capability request bound to the current parent Job/execution session.

A nested Agent MAY alternatively use job-scoped SmartAIHub MCP when supported.

Both paths converge at the same Core policy, budget, approval, Job creation and provenance logic.

Therefore SmartAIHub MCP is an optional Agent integration surface, not a mandatory prerequisite for Runner bidirectionality.

---

# 64. Delegation Cycle, Depth and Resource Deadlock Guards

Dynamic child Jobs MUST carry a causation chain.

Suggested:

```text
delegation_depth
ancestor_job_ids
requested_capability
requesting_execution_session_id
```

Defaults:

```text
bounded max depth
same-capability recursive delegation denied unless explicitly allowed
same execution session cannot recursively recreate itself
```

Parent execution waiting on a child must not monopolize a resource the child requires when no alternative capacity exists.

Runner/Core SHOULD support a waiting policy that can:

```text
retain lightweight session state
release expensive CPU/GPU slots when safe
resume after child completion
```

Deadlock detection/failure produces structured provenance and replan/fallback opportunity.

---

# 65. Runner-Hosted Agent Artifact Contract

Agent autonomy does not remove the need for deterministic result collection.

Job Bootstrap Profile SHOULD tell the adapter/Agent:

```text
required outputs
workspace boundaries
artifact output location/manifest when applicable
result schema
quality expectations
```

Runner collects only Job-authorized artifacts.

Opaque Agent ecosystems may expose only a final text/result + workspace files; richer integrations may emit structured artifact events.

Observability level MUST be recorded so SmartAIHub does not claim complete internal provenance when only final outputs are visible.

---

# 66. Process Containment and Cancellation

For local processes started by Runner, Runner SHOULD supervise the process tree/session using OS-appropriate containment where possible.

Goals:

```text
know which processes belong to the Job
collect exit/crash state
avoid orphaned long-running children
implement cancellation/drain
apply resource policy
reconcile after Runner restart
```

Cancellation of a general Agent process may still leave external side effects already issued through user-owned tools. Runner process termination is not proof that external actions were undone.

Such cases require side-effect reconciliation under Feature 195 policy.

---

# 67. Parent/Child Cancellation Cascade

When a parent Goal/Job is cancelled:

```text
not-started child Jobs → cancelled
running SmartAIHub child Jobs → cancellation requested
uncancelable provider work → detached/ignored after reconciliation
parent Runner session → CANCEL_EXECUTION according to control profile
```

If only a child Job is cancelled, parent may continue when its workflow has a fallback or can tolerate missing output.

Cancel propagation MUST be policy-aware rather than blindly killing all ancestors/siblings.

---

# 68. Final Cross-Spec Architecture Baseline

The revised implementation baseline is:

```text
Feature 196
Goal / Plan / semantic policy / quality contract / intervention classification
        ↓
Feature 195
canonical Job / pool scheduling / lease / attempt / control inbox / retry / billing
        ↓
Feature 197 Runner Fabric
capability discovery / local resolver / Agent supervision / local handoff
        ↕
Runner delegated child-capability request / optional job-scoped SmartAIHub MCP
        ↓
Feature 195 child Jobs / providers / cloud / other Runner capacity
        ↓
execution provenance
        ↓
Feature 197 experience learning
        ↓
Feature 196 adaptive future planning
```

No component may shortcut these boundaries merely because a specific vendor tool exposes a convenient API/CLI.


---

# 69. Offer and Local Implementation Separation

Feature 197 treats `Offer` and `local implementation` as separate identities.

```text
Offer
= semantic/commercial implementation envelope visible to Feature 196

Local Implementation
= concrete Claude/Codex/Hermes/FFmpeg/MCP/etc. runtime selected by Runner
```

Learning may aggregate at either level, but MUST preserve both identifiers when known.

This allows SmartAIHub to learn, for example, that a generic user-owned local Offer is healthy overall while one specific Codex version is currently slow or degraded.

---

# 70. Resource Wait Experience vs Capability Experience

Learning MUST distinguish inability from temporary unavailability.

Examples:

```text
Codex busy for 20 minutes
→ capacity/latency observation
→ NOT evidence that Codex cannot perform the task

Grok accepted then repeatedly reports missing required capability
→ capability-fit evidence

Runner offline
→ device availability evidence
→ NOT quality evidence
```

Failure taxonomy/source is therefore mandatory input to adaptive planning.

---

# 71. Evidence Source Weighting

Experience evidence SHOULD retain source type because not all signals mean the same thing.

Possible sources:

```text
objective execution success/failure
QC result
human reviewer result
user explicit preference
user executor override
manual correction amount
runtime decline reason
provider/Runner health incident
estimated latency/cost
```

Example:

```text
User switches Codex→Claude because they personally prefer Claude
```

should not be interpreted identically to:

```text
Codex failed deterministic tests and Claude passed.
```

Planner may learn a user preference from the first and a task-performance observation from the second.

---

# 72. Capability Claim Trust Model

Runner capability/resource claims are treated as signed-by-device operational assertions, not authorization and not absolute truth.

Confidence may increase through:

```text
successful adapter probe
successful recent execution
signed/verified adapter package
enterprise-managed device policy
```

Confidence decreases through:

```text
stale heartbeat/probe
repeated launch failure
auth expiry
adapter mismatch
unexpected version change
```

Core authorization remains independent of these claims.

---

# 73. Cross-Spec Decision Provenance

End-to-end explanation SHOULD connect:

```text
planning_decision            # why 196 chose the initial strategy
execution_decision           # why 195 chose pool/node/runtime/fallback
local_resolution_decision    # why Runner chose Codex/Claude/etc.
control/intervention decision
quality/retry decision
learning lesson/evidence
```

A user/admin should be able to answer:

```text
Why was Grok attempted?
Why did it stop?
Why was Codex chosen next?
Why did it wait 2 minutes before cloud fallback?
Why does the next Plan recommend Claude?
```

without relying on model-generated guesswork.


---

# 74. Safe Runner Learning Boundary

Runner may learn operational facts, but MUST NOT autonomously invent trusted production execution behavior from model inference alone.

Allowed automatic local learning includes:

```text
last successful launch command for an already approved adapter
observed duration/resource usage
runtime health/crash statistics
capability freshness
auth readiness
known-safe probe results
```

Changes that alter executable behavior require an approved mechanism:

```text
signed adapter/runtime-package update
approved Generic CLI manifest
user/admin-confirmed custom adapter
verified MCP tool mapping
```

An LLM-generated adapter/command MAY be proposed as a candidate, but MUST NOT become production-trusted automatically.

---

# 75. Dual-Role External Tool Identity

A product such as Claude/Codex/Hermes may simultaneously be:

```text
MCP inbound client used interactively by the user
and
Runner-hosted local runtime used by a SmartAIHub Job
```

These are separate principals/sessions even if the binary and user are the same.

Every event/request SHOULD carry enough role context to prevent:

```text
public MCP authority being confused with Runner authority
Runner Job context leaking into unrelated user chat
learning attributing caller behavior to executor performance
```

---

# 76. Quality Evaluator Provenance

Feature 197 learning accepts quality evidence only with evaluator provenance.

Store/reference:

```text
quality_contract_version
evaluator_id/version
evaluation type (deterministic/AI/human/composite)
result
confidence where applicable
failure code
```

`QUALITY_EVALUATION_FAILED` contributes evaluator-reliability evidence, not producer-quality evidence.

---

# 77. Local Implementation Selector and New Tool Adoption

A newly installed compatible tool can become eligible without changing SmartAIHub Core when:

1. Runner discovers it
2. an approved adapter/manifest maps it to capability contracts
3. probe/auth/trust state is sufficient
4. Feature 196 local selector/binding policy permits it
5. execution-time authorization succeeds

This is the preferred mechanism for Runner to "learn it can do more" safely.

If the current Plan uses an open compatible selector, the new implementation may become eligible at execution time. If the Plan pins a fixed implementation set or named tool, a Plan revision is required to expand it.

---

# 78. High-Impact Local Capability Enablement

Runner may technically discover browser/computer/shell capabilities without making them automatically executable.

Represent separately:

```text
available
trusted
policy_enabled
eligible_for_job
```

Desktop control, authenticated-browser interaction, arbitrary process execution and destructive external effects require explicit policy/permission before Runner advertises them as eligible for matching.

---

# 79. Codebase Alignment Baseline — 2026-09-17

Feature 197 is a target Runner architecture, not a claim that the full Runner protocol is already implemented. The repository evidence is:

| Runner contract | Current repository evidence | Alignment status |
|---|---|---|
| Local runtime host | Worker App/Tauri surfaces including `apps/worker-app/src-tauri/src/worker_loop.rs`, `apps/worker-app/src-tauri/src/hermes_executor.rs`, `apps/worker-app/src-tauri/src/comfy_mcp_client.rs` and runtime-pack/release artifacts | Existing local runtime foundation; not yet the complete Feature 197 Runner identity |
| Worker UI/control surface | `CanonicalWorkerRouteScreen.tsx` and related Worker App routes | Existing Worker App behavior; must converge on the Runner protocol rather than create a parallel Job truth |
| Local discovery/capability inventory | No canonical Feature 197 Runner identity, capability snapshot/delta, work-offer, execution-session or durable control-inbox schema was found in the current audit | Target work |
| Canonical Job handoff | Feature 186 `worker_jobs`/attempts/leases/events/outbox and Feature 195 contracts | Reuse required; Runner MUST claim/report through Core control-plane contracts |
| Isolated server execution | Feature 195 Cloudflare Container adapter boundary | Approved target for isolated server-side execution |
| Retired-code residue | Existing repository code still contains legacy identifiers/routes or compatibility adapters, including public docs/social-tool surfaces and Python Docker/Kilo services | Not valid Runner implementation evidence; no new callers or dispatch paths may be added. Removal requires a separate authorized migration audit |

Runner MUST NOT add or use Agency, work requests/workpacks, the retired `/workflows` custom workflow engine, OpenSandbox, `sandbox_jobs`, or Docker/OpenSandbox dispatch. “Docker” in earlier draft text is therefore removed from the adapter/discovery model; local tools may be supervised only through an approved Runner adapter, while isolated server-side workloads use Cloudflare Containers.

The presence of Worker App runtime code, an MCP client, or a local executor is not proof of Runner readiness. Readiness requires a registered Runner identity, trusted capability snapshot, policy eligibility, authenticated work-offer claim, fenced execution session, durable control handling and provenance/QC evidence.

## Problem

Local tools and agents can exist on user machines without a shared identity, capability inventory, safe work-offer protocol, durable control path or trustworthy provenance. Treating each local tool as an independent worker would fragment execution state and weaken policy enforcement.

## Solution

Use one governed Runner identity to discover local capabilities, claim Feature 195 work offers, create fenced execution sessions, supervise approved adapters, handle interactive control and report provenance/QC/learning evidence back to Core. Runner remains subordinate to Feature 195 Job truth and Feature 196 Plan policy.

## Requirements

Functional requirements include discovery, trust/probe state, capability snapshots/deltas, work-offer claim/decline, local resolution, control ACK/APPLIED/FAILED, handoff, cancellation, retry/QC and provenance. Non-functional requirements include least privilege, tenant isolation, fencing, reconnect safety, bounded resource use, secret isolation, telemetry budgets and explicit high-impact enablement.

## Architecture

Core owns Goal, Job, policy, cost, quality and global scheduling. Runner owns local topology, capability discovery, local resolution, execution control and evidence. Cloudflare Containers are the approved isolated server-side runtime; local Docker/OpenSandbox dispatch and all retired execution boundaries are excluded.

## Implementation

Worker App/Tauri and local executor code provide a runtime foundation, but the repository audit did not find the complete canonical Runner identity, work-offer, execution-session, capability-snapshot or durable control-inbox surface. Implementation must extend the existing Feature 195 control plane rather than create a parallel Job/planner system.

## Assumptions

Runner may be offline, local tools may be opaque, agents may retain native tools unless policy restricts them, and capability discovery is advisory until trust, policy and execution-time authorization all succeed.

## Constraints

Runner cannot self-authorize, bypass Core, write canonical output with stale fencing, access unrelated tenant context, expose high-impact tools by discovery alone, or dispatch through Agency, work requests/workpacks, `/workflows`, OpenSandbox, `sandbox_jobs` or Docker/OpenSandbox.

## Risks

Key risks are stale capability claims, duplicate work after reconnect, local process loss, unsafe desktop/browser/shell exposure, confused MCP caller versus Runner identity, and learning feedback that overgeneralizes from one machine.

## Alternatives

Direct per-tool registration and independent local Agent workers are rejected because they duplicate control state and cannot provide one policy-aware Runner identity. Cloudflare Containers remain the server-side isolation alternative, not a local Runner replacement.

## User Stories

As a user, I can allow a trusted Runner to use an installed local tool while retaining control and visibility. As an operator, I can see why a Runner was eligible, revoke it, reconcile a lost session, and distinguish executor failure from evaluator failure.

## Acceptance Criteria

The feature is accepted only when one Runner can expose multiple approved capabilities, claims are atomic and fenced, controls survive reconnect, handoff and QC are durable, high-impact tools require explicit enablement, provenance is attributable, and no local path bypasses Feature 195/196 authority.
