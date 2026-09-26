# Spec 211 — SmartAIHub External Agent Runtime Fabric
## ACP Structured Agent Protocol + Gas City Session Runtime & Multi-Agent Execution Integration

**Status:** Architecture Freeze Candidate / Ready for implementation planning  
**Spec ID:** 211  
**Revision:** 7 — repository-convergence hardening after 20 additional codebase review passes; effective-session-config, provider-child, authoritative-read and runtime-handoff safeguards remain normative, with explicit ACP/Gas City implementation-status, Feature 195 status mapping and cross-spec release gates  
**Date:** 2026-09-19  
**Suggested repository path:** `specs/feature/211-external-agent-runtime-fabric-acp-gascity/spec.md`  
**Primary owner:** Spec 200 — Universal External Agent Control Plane  
**Protocol routing owner:** Spec 206 — A2A-First Hybrid External Agent Interoperability  
**CLI runtime profile:** Spec 210 — Orca Runtime Adapter & CLI Agent Execution Bridge  
**Workflow owner:** Spec 209 — AI Workflow Studio  
**Durable execution truth:** existing `worker_jobs` / `worker_job_events` / shared Job Control Plane  
**Capability/tool owner:** Capability Registry/Resolver + Spec 199 External MCP Gateway  
**Computer-use owner:** Spec 208 Hybrid Computer Use Engine  
**Economic owner:** Spec 207 / shared billing-credit-usage ledger  
**Execution node owner:** SmartAIHub Runner / shared Execution Node Registry  
**Repository implementation status:** Target architecture; the inspected repository contains shared External Agent Job/Runner building blocks and `external_agent_task` admission, but no ACP adapter, Gas City bridge, ACP/Gas City dependency, Spec 211 migration, route or conformance implementation.  
**Product horizon:** Q4 2026 foundation, designed for 2027+ protocol/runtime/provider evolution without binding SmartAIHub to ACP, Gas City, Orca, Claude, Codex, or any single orchestration implementation.

---

# 0. Executive Decision

SmartAIHub SHALL implement an **External Agent Runtime Fabric** under Spec 200 with two independent routing dimensions:

```text
agent_protocol
  ├── a2a
  ├── acp_v1
  ├── native_structured
  └── cli_tui

session_runtime
  ├── direct_runner
  ├── gascity
  ├── orca
  ├── generic_pty
  └── future_runtime
```

This spec SHALL add:

1. a first-class **ACP Client Adapter** to SmartAIHub Runner;
2. support for ACP-compatible agent implementations such as:
   - Claude Agent ACP;
   - Codex ACP;
   - future ACP agents discovered/certified by SmartAIHub;
3. a first-class **Gas City Runtime Adapter** for provider/session lifecycle;
4. an optional **bounded Gas City Managed City execution mode** for tasks that genuinely benefit from Gas City's multi-agent controller, pools, crash adoption, Kubernetes/subprocess/tmux/ACP runtime providers and local software-factory execution;
5. unified route selection across ACP, provider-native structured APIs, Gas City, Orca and generic PTY;
6. one canonical SmartAIHub job/session/event/result/approval/audit/billing model regardless of runtime route.

The core rule is:

> **ACP standardizes how SmartAIHub talks to an agent. Gas City standardizes/supervises how agent sessions may run. They are complementary layers, not competing top-level orchestrators.**

SmartAIHub SHALL remain:

- the product control plane;
- durable job source of truth;
- tenant/user authorization authority;
- workflow owner;
- capability/tool gateway;
- billing owner;
- audit owner;
- artifact owner;
- final verification owner.

ACP SHALL NOT become the job database.

Gas City SHALL NOT become the canonical SmartAIHub workflow/job/task database.

---

# 1. Why Spec 211 Exists

Spec 210 proved that terminal/TUI-based external-agent execution can be made reliable, but it also demonstrated the operational cost of doing so:

```text
readiness heuristics
prompt delivery proof
Enter/submission recovery
PTY incarnation fencing
TUI state ambiguity
terminal surface/process divergence
resume CWD/model/account verification
provider dialog detection
cleanup postcondition verification
```

ACP removes a substantial portion of this ambiguity for agents that expose a structured ACP interface.

Current ACP defines structured lifecycle concepts such as:

```text
initialize
authentication
session/new
session/load or session/resume
session/prompt
session/update
permission requests
session/cancel
file operations
terminal operations
```

For Claude and Codex, maintained ACP adapters already expose rich provider behavior through a structured interface.

At the same time, Gas City provides a reusable session/runtime substrate with:

```text
runtime.Provider
tmux
subprocess
exec
ACP
Kubernetes
Herdr
auto/hybrid routing
session start/stop/interrupt
process liveness
crash adoption
controller reconciliation
pools
multi-project rigs
```

Therefore SmartAIHub can reduce provider-specific execution plumbing while preserving its existing architectural ownership.

---

# 2. Current Research Baseline

This spec is based on public upstream state verified on 2026-09-19.

## 2.1 ACP

Current stable ACP wire protocol:

```text
protocolVersion = 1
```

Production baseline SHALL be ACP v1.

ACP v2 currently exists as a draft/experimental protocol and SDK surface.

SmartAIHub SHALL NOT make ACP v2 a production requirement in Revision 1.

ACP v2 features MAY be implemented behind explicit capability/feature gates and SHALL NOT be assumed stable.

Relevant current upstream releases/baselines verified for this revision include:

```text
ACP stable protocol family: v1
ACP v2: unstable/experimental
Codex ACP 1.12.0 — 2026-09-15
Claude Agent ACP 0.79.0 — 2026-09-17
Gas City latest stable verified from the public release page: v1.4.1
Beads latest independently verified release: v1.3.0
Gas City ↔ Beads compatibility: MUST be independently certified
```

Exact ACP schema/SDK patch versions SHALL be discovered and pinned during implementation certification rather than copied from this prose as permanent constraints.

Exact versions SHALL be re-probed and certified before implementation rollout.

## 2.2 Gas City

Gas City is a composable orchestration/runtime toolkit with:

```text
declarative city configuration
runtime providers
session lifecycle
work routing
controller/supervisor reconciliation
pools
packs
formulas/orders
Beads-backed work tracking
```

Current public Gas City release page verified for Revision 5 shows:

```text
stable release family: v1.4.x
latest stable verified: v1.4.1
rolling edge build: available but non-production
```

Beads has an independently released v1.3.0 line. SmartAIHub SHALL NOT infer that the latest Gas City stable release and the latest Beads release are automatically a supported pair.

The certified deployment MUST pin an explicitly tested compatibility tuple:

```text
Gas City version
Beads/bd version when used
Dolt version when used
store schema/version
bridge version
OS/arch
```

SmartAIHub SHALL pin and certify a stable Gas City release and its actual supported toolchain rather than copy mutable `latest` versions into runtime policy.

## 2.3 Licensing

ACP core and official ACP adapters referenced here are Apache-2.0 licensed.

Gas City is MIT licensed.

Third-party/provider SDK licensing remains independently applicable.

The upstream versions, licensing statements and feature descriptions in this
research baseline are planning inputs only. They are not repository
implementation evidence. Each selected dependency, adapter and provider tuple
MUST be re-probed, license-reviewed and conformance-certified before production
admission; a mutable upstream release or registry entry MUST NOT silently
change an active or certified route.

---

# 3. Primary Architectural Decision

The runtime fabric SHALL model protocol and execution substrate independently.

Canonical route object:

```json
{
  "agent_protocol": "acp_v1",
  "session_runtime": "direct_runner",
  "agent_implementation": "codex_acp",
  "logical_agent": "codex",
  "runner_id": "runner_123"
}
```

Another valid route:

```json
{
  "agent_protocol": "acp_v1",
  "session_runtime": "gascity",
  "agent_implementation": "claude_agent_acp",
  "logical_agent": "claude",
  "runner_id": "runner_123"
}
```

Another:

```json
{
  "agent_protocol": "cli_tui",
  "session_runtime": "orca",
  "agent_implementation": "antigravity",
  "logical_agent": "antigravity",
  "runner_id": "runner_123"
}
```

This model prevents false architectural choices such as:

```text
ACP OR Gas City
```

because the correct relationship can be:

```text
ACP OVER Gas City
```

---

# 4. Canonical Architecture

```text
User / API / Universal Assistant / AI Workflow Studio
                         │
                         ▼
                Goal / Workflow Orchestrator
                         │
                         ▼
                Capability Resolver
                         │
                         ▼
                 Spec 206 Router
               ┌─────────┴─────────┐
               │                   │
             A2A              Spec 200 Native
               │                   │
               │                   ▼
               │          Spec 211 Runtime Fabric
               │                   │
               │        Agent Protocol Resolver
               │      ┌────────────┼──────────────┐
               │      │            │              │
               │     ACP       Native RPC       CLI/TUI
               │      │            │              │
               │      └────────────┼──────────────┘
               │                   │
               │          Session Runtime Resolver
               │      ┌────────────┼──────────────┬─────────┐
               │      │            │              │         │
               │   Direct       Gas City        Orca     Generic PTY
               │   Runner          │           Spec 210
               │                  │
               │           runtime.Provider
               │      ┌──────┬────┼─────┬───────┐
               │      │      │    │     │       │
               │     ACP    tmux subprocess exec k8s/herdr
               │
               └───────────────────┬──────────────────────────
                                   │
                            Shared SmartAIHub Plane
             ┌─────────────────────┼──────────────────────┐
             ▼                     ▼                      ▼
        worker_jobs         Capability Gateway         Library
             │               / Spec 199                  │
             └──── Approval / Billing / Audit / Verification ┘
```

---

# 5. Ownership Contract

| Concern | Owner | Spec 211 Rule |
|---|---|---|
| user intent / workflow | Spec 196 / 209 | consume, do not duplicate |
| durable job state | `worker_jobs` | always authoritative |
| external-agent canonical contract | Spec 200 | reuse |
| A2A routing | Spec 206 | A2A remains first protocol decision |
| ACP transport | Spec 211 | own ACP client integration |
| Gas City runtime integration | Spec 211 | own bounded adapter |
| Orca CLI runtime | Spec 210 | remain sibling runtime adapter |
| MCP upstream transport | Spec 199 | never bypass |
| Computer Use | Spec 208 | use governed capabilities |
| economic authorization | Spec 207/shared | emit facts only |
| Skills | Capability Gateway | centrally hosted |
| assets | Library/Asset Gateway | canonical AssetRefs |
| approvals | shared Approval Service | one approval authority |
| job scheduling/leases | shared Job Control Plane | Gas City does not replace |
| telemetry/audit | shared platform | normalize ACP/Gas City evidence |

## 5.1 Repository Baseline and Implementation Boundary — 2026-09-19

The architecture in this document is not proof that ACP or Gas City is already
installed or callable. A targeted search of the inspected Web, Python and
Runner source trees and package manifests found no ACP/Gas City adapter,
dependency, migration, route or conformance harness. The current codebase
therefore remains the compatibility substrate that Spec 211 must integrate
with, not an existing implementation of this feature.

| Concern | Current repository evidence | Normative interpretation for Spec 211 |
|---|---|---|
| External-agent admission | `apps/web/server/services/agentControlPlaneContracts.ts` builds `external_agent_task` with `contractVersion: "feature-186-v1"`; `workerSchedulerService.ts` and `runEngine.ts` contain current admission/scheduling paths | Reuse the existing Spec 200/Feature 195 admission and executor registry. Do not infer ACP/Gas City support from the generic job type. |
| Durable Job truth | `workerJobs`, `workerJobAttempts`, `workerJobEvents`, `workerJobDispatches`, `workerJobOutbox`, `workerJobSettlements` in `apps/web/drizzle/schema.ts`; `jobControlPlaneGateway.ts` is the producer boundary | ACP session IDs, Gas City IDs, provider child IDs and delegation IDs are subordinate metadata. They MUST NOT replace `worker_job_id`, attempt, lease, fencing, event, outbox or settlement truth. |
| Job contract version | Current agent definition and adapters still use `feature-186-v1`; no Spec 211 contract version or migration was found | Implementation planning MUST define compatibility/version migration and mixed-version behavior before claiming Feature 195-native ACP/Gas City execution. |
| Canonical Job status | `jobControlPlaneTypes.ts` currently exposes `pending`, `queued`, `leased`, `running`, `waiting_external`, `retry_scheduled`, `succeeded`, `failed`, `cancelled`, `expired` | Spec 211 phase names MUST map to this existing canonical vocabulary. No ACP/Gas City vendor state may become a new top-level Job status without an explicit shared contract change. |
| Runner boundary | `runnerContracts.ts`, `runnerControl.ts` and `apps/runner-app/src/protocol.rs` define `sah-runner-v1`, identity, sequence, idempotency and fencing; no Spec 211 route command implementation was found | ACP/Gas City commands MUST be added through the authenticated Runner control boundary and capability registry, not through a public or direct provider channel. |
| Orca sibling | Spec 210 repository baseline records no `orca.v1` adapter in inspected Runner/Web/Python paths | Spec 211 may compose the Spec 210 profile only after its own certified handoff; it MUST NOT assume an Orca fallback is already available. |
| A2A routing | Spec 206 remains the routing owner; no current ACP/A2A adapter implementation was found in the inspected source paths | A2A-first remains a target routing rule. ACP is an internal native-plane protocol and does not prove remote A2A interoperability. |
| Workflow integration | Spec 209 defines target workflow nodes; canonical `workflow_definitions`, `workflow_apps` and `marketplace_listings` source tables/routes were not found in the inspected application trees | Workflow nodes may declare requirements only. They MUST NOT persist transient ACP/Gas City identities or claim Marketplace execution before Spec 209 implementation exists. |
| Capability, Computer Use and economics | Spec 199/208/207 own MCP, Computer Use and economic authority; current code contains partial/gated rails | ACP/Gas City agents receive only job-scoped governed capabilities. Runtime access does not grant unrestricted MCP, browser/desktop, wallet, payout or settlement authority. |
| Retired systems | Project boundaries prohibit Agency, work requests/workpacks, legacy `/workflows`, OpenSandbox, `sandbox_jobs` and Docker/OpenSandbox dispatch | No adapter, fallback, test, compatibility path or installation workflow may reintroduce a retired system. |

The first implementation slice is therefore a contract/inventory task under
Spec 200 + Runner, not a provider installation performed from this spec. It
must add source, dependency manifests, migrations (if needed), focused tests,
capability publication and rollback evidence together.

---

# 6. Non-Goals

Spec 211 SHALL NOT:

- replace Spec 200;
- replace Spec 206;
- replace Spec 210;
- replace `worker_jobs`;
- make Gas City Beads the SmartAIHub job source of truth;
- make Gas City Formulas the canonical SmartAIHub workflow language;
- make Gas City Orders the canonical SmartAIHub scheduler;
- expose unrestricted Gas City configuration to ordinary users;
- expose unrestricted ACP file/terminal capabilities to agents;
- use ACP v2 experimental behavior without negotiated gating;
- assume all ACP agents implement identical optional capabilities;
- assume Gas City runtime providers have identical security/recovery semantics;
- route every Claude/Codex task through Gas City when direct ACP is simpler;
- silently double-wrap an agent through ACP → Gas City → ACP → another provider;
- allow nested orchestrators to create unbounded agents;
- let a runtime retry reset cost/security/approval budgets.

---

# 7. Runtime Fabric Abstractions

Implement three separate interfaces.

## 7.1 AgentProtocolAdapter

```ts
interface AgentProtocolAdapter {
  probe(): Promise<ProtocolProbe>;
  initialize(req: InitializeRequest): Promise<ProtocolSession>;
  createSession(req: CreateAgentSession): Promise<SessionHandle>;
  resumeSession(req: ResumeAgentSession): Promise<SessionHandle>;
  submitPrompt(req: SubmitAgentPrompt): Promise<PromptReceipt>;
  observe(req: ObserveAgentSession): AsyncIterable<AgentEvent>;
  cancel(req: CancelAgentTurn): Promise<CancelReceipt>;
  close(req: CloseAgentSession): Promise<CloseReceipt>;
}
```

Implementations:

```text
ACPProtocolAdapter
NativeStructuredProtocolAdapter
CliTuiProtocolAdapter
```

## 7.2 SessionRuntimeProvider

```ts
interface SessionRuntimeProvider {
  probe(): Promise<RuntimeProbe>;
  start(req: RuntimeStartRequest): Promise<RuntimeHandle>;
  stop(req: RuntimeStopRequest): Promise<RuntimeEffectReceipt>;
  interrupt(req: RuntimeInterruptRequest): Promise<RuntimeEffectReceipt>;
  isRunning(req: RuntimeIdentity): Promise<ObservedBool>;
  processAlive(req: RuntimeIdentity): Promise<ObservedBool>;
  observe(req: RuntimeIdentity): AsyncIterable<RuntimeObservation>;
  reconcile(req: RuntimeReconcileRequest): Promise<RuntimeReconcileResult>;
  cleanup(req: RuntimeCleanupRequest): Promise<CleanupResult>;
}
```

Implementations:

```text
DirectRunnerRuntime
GasCityRuntimeProvider
OrcaRuntimeProvider
GenericPtyRuntimeProvider
```

## 7.3 ExternalAgentRuntimeRoute

A route combines both interfaces:

```text
AgentProtocolAdapter
+
SessionRuntimeProvider
+
logical agent implementation
+
workspace binding
+
credential/account binding
+
policy snapshot
```

---

# 8. Route Selection

Canonical selection:

```text
1. Spec 206 evaluates A2A.
2. If eligible A2A route satisfies task/policy, use A2A.
3. Otherwise enter Spec 200 native plane.
4. Resolve best AgentProtocolAdapter.
5. Resolve best SessionRuntimeProvider.
6. Validate the protocol/runtime tuple.
7. Reserve capacity.
8. snapshot route policy.
9. dispatch.
```

Preference SHOULD generally be:

```text
structured protocol
before
terminal inference
```

but not universally.

Example logical preference for Codex:

```text
ACP direct
→ native Codex structured adapter
→ ACP over Gas City when Gas City supervision is useful
→ Orca
→ Generic PTY
```

Example Claude:

```text
ACP direct
→ native Claude Agent SDK adapter
→ ACP over Gas City
→ Orca
→ Generic PTY
```

Example Antigravity:

```text
certified structured protocol if/when available
→ Orca
→ native adapter
→ Generic PTY
```

Task requirements and health can reorder eligible routes.

---

# 9. Why Direct ACP Is Preferred for Simple Single-Agent Work

For a single Claude/Codex session where SmartAIHub already owns:

```text
worker job
workspace
approval
asset context
capability gateway
verification
```

adding Gas City may create an unnecessary failure/operational layer.

Direct ACP path:

```text
SmartAIHub Runner
      ↓
ACP Client
      ↓ stdio
claude-agent-acp / codex-acp
      ↓
provider SDK/App Server
```

Benefits:

- structured session lifecycle;
- structured permissions;
- structured progress;
- explicit protocol/capability negotiation;
- less terminal/TUI ambiguity;
- fewer reconciliation owners;
- lower latency and operational complexity.

Therefore:

> **Gas City SHALL be selected for value it adds, not merely because it is installed.**

---

# 10. When Gas City Is Preferred

Gas City is useful when task requirements include one or more:

```text
multi-agent local fleet
elastic pools
provider-agnostic session supervision
crash adoption
session restart/reconciliation
Kubernetes execution
tmux/subprocess/exec provider portability
long-running software-factory execution
multi-project rig topology
bounded autonomous local orchestration
provider failover/hybrid runtime
```

Gas City SHOULD NOT be inserted for a trivial single agent turn unless policy/operations require it.

---

# 11. Gas City Integration Modes

Spec 211 SHALL support two clearly separated modes.

## 11.1 Mode A — Gas City Session Provider Bridge

Preferred initial production integration.

SmartAIHub uses only Gas City's reusable session/runtime primitives.

```text
SmartAIHub Runner
    ↓
GasCity Runtime Bridge
    ↓
runtime.Provider
    ├ tmux
    ├ subprocess
    ├ exec
    ├ ACP
    ├ k8s
    └ future certified provider
```

SmartAIHub does NOT delegate top-level work tracking/workflow ownership.

## 11.2 Mode B — Bounded Managed City

Optional advanced mode.

```text
one SmartAIHub worker_job
      ↓
delegation lease
      ↓
Gas City Managed City
      ↓
bounded internal sessions/work/formula execution
      ↓
normalized child evidence/result
      ↓
SmartAIHub verification
```

Full Gas City may use its own internal:

```text
Beads
formulas
orders
mail
controller
pools
```

inside the delegated scope.

But those are subordinate execution internals.

They do not become canonical SmartAIHub job/workflow records.

---

# 12. Gas City Bridge Implementation Strategy

Preferred implementation:

```text
SmartAIHub Runner
   ↓ local IPC
SmartAIHub Gas City Bridge Sidecar
   ↓
pinned Gas City runtime/session APIs
```

The bridge SHOULD be implemented as a small Go service/binary built against a pinned certified Gas City version.

Why a bridge:

- isolates Go dependency from Runner language/runtime;
- prevents SmartAIHub backend from depending on internal Gas City Go packages;
- gives SmartAIHub its own stable contract;
- permits controlled upgrades;
- limits exposed functionality;
- makes replacement possible later.

Alternative CLI integration MAY exist for diagnostics/bootstrap.

Production request handling SHOULD NOT scatter direct `gc` shell invocations throughout Runner code.

---

# 13. Gas City Bridge API

Local-only API, preferably:

```text
Unix domain socket
Windows named pipe
or authenticated loopback
```

Conceptual operations:

```text
runtime.probe
runtime.capabilities
session.start
session.stop
session.interrupt
session.is_running
session.process_alive
session.observe
session.nudge
session.set_meta
session.get_meta
session.list
session.reconcile
session.cleanup
```

Optional managed-city operations:

```text
city.prepare
city.delegate
city.status
city.drain
city.reconcile
city.collect_result
city.cleanup
```

The bridge SHALL expose SmartAIHub-owned schemas, not raw internal Go structs.

---

# 14. Gas City `runtime.Provider` Mapping

Gas City's provider capabilities conceptually map:

```text
Start          → session.start
Stop           → session.stop
Interrupt      → session.interrupt
IsRunning      → session.is_running
ProcessAlive   → session.process_alive
Attach         → diagnostics/interactive attach
Nudge          → session.nudge
SetMeta        → bounded SmartAIHub metadata
GetMeta        → bounded metadata lookup
Peek           → diagnostic stream/tail
ListRunning    → scoped runtime inventory
LastActivity   → health/activity observation
```

Provider feature support SHALL be capability-probed.

No caller may assume every provider implements equivalent semantics.

---

# 15. Gas City Provider Selection

Gas City currently exposes provider types including:

```text
tmux
subprocess
exec
ACP
Kubernetes
Herdr
auto
hybrid
```

SmartAIHub SHALL model them as nested provider capability:

```text
session_runtime = gascity
gascity_provider = acp | tmux | subprocess | exec | k8s | herdr | auto | hybrid
```

Policy may constrain allowed providers.

Examples:

```text
local desktop
→ gascity/tmux

managed Linux Runner
→ gascity/subprocess

cluster execution
→ gascity/k8s

structured agent
→ gascity/acp
```

---

# 16. Gas City Auto/Hybrid Routing

Gas City auto/hybrid provider selection SHALL NOT silently override SmartAIHub route policy.

If SmartAIHub permits Gas City to choose internally:

```text
session_runtime = gascity
gascity_provider = auto
```

the delegation policy SHALL define:

```text
allowed providers
forbidden providers
required isolation
max cost
required structured protocol
network policy
workspace policy
```

Gas City provider resolution SHALL be observed and recorded.

Actual selected provider becomes part of authoritative route evidence.

---

# 17. Gas City Controller Ownership Boundary

Gas City's controller reconciles desired state to actual runtime state.

SmartAIHub also has desired/observed execution state.

To avoid dueling controllers:

```text
SmartAIHub controller
owns:
  job
  route attempt
  delegation lease
  runner assignment
  user cancellation
  security policy
  cost budget
  approval
  final result

Gas City controller
may own inside lease:
  local child session existence
  pool size
  internal crash recovery
  local provider lifecycle
  internal child routing
```

Gas City MUST NOT resurrect a session after SmartAIHub revokes/settles the delegation lease.

---

# 18. Delegation Lease for Managed City Mode

Every Managed City execution SHALL receive:

```text
delegation_id
worker_job_id
route_attempt_id
generation
tenant_id
project_id
workspace scope
allowed agent types
allowed runtime providers
max child sessions
max nesting
max runtime
max cost/usage
capability profile
approval profile
expiry
```

Gas City work outside the lease is not SmartAIHub-authoritative execution.

On revocation:

```text
stop new work
drain/cancel according to policy
revoke SmartAIHub capabilities
collect evidence
reconcile side effects
```

---

# 19. Beads Ownership Boundary

Gas City Beads MAY be used internally in Managed City mode.

Rules:

- `worker_jobs` remains authoritative;
- every SmartAIHub-originated Gas City root work item stores `worker_job_id`;
- Gas City internal child bead IDs are subordinate references;
- SmartAIHub does not mirror every bead into a worker job automatically;
- only child tasks requiring platform-level accounting/approval/artifact ownership become explicit SmartAIHub child jobs;
- Gas City bead status cannot settle SmartAIHub job without result verification;
- SmartAIHub cancellation/revocation supersedes Gas City desired work.

---


## 19A. Managed Child Work Lineage

Every Gas City internal child unit that materially contributes to a SmartAIHub result SHALL be traceable to:

```text
delegation_id
parent worker_job_id
route_attempt_id
Gas City run/formula/order/work id
session id
logical child role
attempt/retry generation
artifact/output lineage
```

Retries/fan-out MUST NOT lose the root SmartAIHub lineage.

A child identifier reused or resurrected after close cannot be accepted without generation-aware binding verification.

When an internal child produces a platform-visible artifact or billable SmartAIHub capability call, the lineage is included in the usage/artifact event even if no explicit SmartAIHub child job exists.


# 20. Formulas and Orders Boundary

Gas City Formulas/Orders are useful for local software-factory patterns.

But Spec 209 remains workflow owner.

Therefore:

```text
Spec 209 workflow
  may invoke
Gas City Managed City node
  which may internally run
Gas City formula/order
```

Not:

```text
Gas City formula
becomes SmartAIHub workflow source of truth
```

A Gas City formula SHALL be treated as a versioned runtime asset:

```text
formula_id
pack/version/digest
input contract
output contract
declared capabilities
runtime budget
```

---


## 20A. Graph / Store / Dispatcher Affinity

For Managed City workflows/formulas whose graph/work state belongs to a specific city/rig store, any Gas City control-dispatcher used by the delegated execution SHALL be bound to the same graph-owning store scope.

Record:

```text
graph/work root identity
store/profile identity
dispatcher identity
dispatcher Dir/scope
delegation id
```

SmartAIHub SHALL NOT allow a fallback dispatcher that cannot read the graph-owning store to instantiate or mutate the work.

If no matching dispatcher exists:

```text
GASCITY_DISPATCHER_SCOPE_MISMATCH
```

and the delegated workflow fails before execution rather than falling back to the wrong scope.

## 20B. Dispatcher Generation

Dispatcher restart/replacement receives a generation.

Late dispatcher events from a prior generation cannot mutate current child-work authority.

The dispatcher generation is included in internal child lineage for operations that materially affect a SmartAIHub result.


# 21. Gas City Packs

Packs MAY be used in Managed City mode.

Production rules:

- pin pack version/commit/digest;
- do not pull mutable HEAD silently;
- record provenance;
- scan/validate scripts/hooks;
- treat pack code/prompts/hooks as untrusted supply-chain input;
- tenant-installed packs require policy/approval;
- pack updates do not affect in-flight jobs;
- rollback remains possible.

Pack registry is not SmartAIHub Marketplace.

Future integration may map SmartAIHub marketplace metadata onto approved Gas City packs, but this is out of scope for Revision 1.

---

# 22. Gas City Rigs / SmartAIHub Projects

Gas City rig identity SHALL NOT become SmartAIHub project identity.

Mapping:

```text
SmartAIHub project_id
SmartAIHub repo_id
SmartAIHub workspace_binding_id
      ↓
Gas City rig runtime binding
```

Gas City rig name/path is subordinate.

Repository rename/transfer/path changes follow SmartAIHub stable repository identity rules from Spec 210.

---

# 23. ACP Client Role in SmartAIHub

SmartAIHub Runner SHALL implement an ACP Client.

The Runner acts as:

```text
ACP Client
```

and the external coding implementation acts as:

```text
ACP Agent
```

Examples:

```text
SmartAIHub Runner ACP Client
→ claude-agent-acp
→ Claude Agent SDK
```

```text
SmartAIHub Runner ACP Client
→ codex-acp
→ Codex App Server
```

---

# 24. ACP Version Policy

Production baseline:

```text
ACP wire protocol v1
```

Experimental:

```text
ACP v2
```

Handshake MUST negotiate `protocolVersion`.

SmartAIHub SHALL NOT infer wire compatibility from:

```text
SDK package version
schema artifact version
adapter package version
```

Route certification key includes all of them separately.

Example:

```text
protocol_version = 1
schema_artifact = 1.20.0
sdk = 1.4.0
agent_adapter = codex-acp 1.12.0
```

---


## 24A. ACP v1 Stable Lifecycle Clarification

ACP v1 production support SHALL include the stable lifecycle methods available in the current protocol baseline, including:

```text
session/new
session/resume
session/close
session/prompt
session/cancel
```

and compatibility with `session/load` where the selected v1 agent implementation still exposes/supports that surface.

`session/resume` and `session/close` MUST NOT be treated as ACP v2-only features.

ACP v2 remains experimental because it changes and extends the session/config/content model, including v2-specific schema evolution and lifecycle consolidation.

The adapter SHALL capability-negotiate the actual method surface rather than derive support solely from documentation age or SDK package version.


# 25. ACP Capability Negotiation

Every session SHALL snapshot initialize response.

Capability categories include, where applicable:

```text
authentication
session load/resume
session config
file read
file write
terminal
permission request
MCP
elicitation
subagents/extensions
usage
background tasks
```

Optional capability absence SHALL produce:

```text
capability unavailable
```

not protocol failure.

---

# 26. ACP v1 Compatibility

Spec 211 SHALL implement stable ACP v1 first.

Important v1 lifecycle:

```text
initialize
authenticate where applicable
session/new
session/resume
session/close
session/load where exposed by the selected implementation
session/prompt
session/update
permission/file/terminal operations
session/cancel
prompt response / stop reason
```

SmartAIHub SHALL normalize v1 semantics to Spec 200 canonical lifecycle.

---

# 27. ACP v2 Experimental Gating

ACP v2 SHALL be disabled in normal production routing by default in Revision 1.

Optional development/canary mode MAY test v2-specific or materially changed surfaces such as:

```text
reworked auth/login/logout semantics
session/list
v2 resume/history replay semantics
v2 session state updates
structured elicitation
updated permission semantics
typed configuration/content changes
session injection / future negotiated extensions
other v2-only or v2-changed capabilities
```

Requirements before production:

```text
official stable protocol declaration
SDK support
schema stabilization
conformance suite
Claude/Codex adapter compatibility
SmartAIHub regression suite
canary
rollback
```

No workflow may require v2-only semantics unless route policy explicitly declares experimental dependency.

---

# 28. ACP Transport

Primary Revision 1 transport:

```text
local stdio subprocess
```

Benefits:

- local process ownership;
- no exposed listener;
- straightforward lifecycle;
- simple credential boundary;
- easier process supervision.

Future ACP HTTP/SSE/WebSocket transports MAY be added only after independent certification and security review.

Remote-agent interoperability still prefers A2A where appropriate.

---


## 28A. ACP Framing, Message Bounds and Backpressure

ACP stdio uses long-lived structured message streams. SmartAIHub SHALL treat framing/resource bounds as part of the security boundary.

Requirements:

```text
max single frame bytes
max decoded JSON bytes
max metadata bytes
max text/tool delta bytes
max pending request count
max outstanding client callbacks
max buffered output bytes
bounded line/newline-delimited framing
read/write deadlines
```

The ACP reader MUST NOT allocate unbounded memory while waiting for a newline/frame terminator.

If the selected official SDK does not yet provide certified frame bounds, SmartAIHub SHALL wrap/patch the transport in a maintained compatibility layer or keep the tuple uncertified.

Backpressure policy SHALL separate:

```text
AUTHORITATIVE_CONTROL
INTERACTIVE_REQUEST
DURABLE_PROGRESS
EPHEMERAL_STREAM
```

Low-priority text/terminal deltas may be sampled/coalesced before permission/cancel/session-completion messages are allowed to starve.

## 28B. ACP Stdout Protocol Purity

For stdio ACP, stdout is a protocol channel.

ACP agent implementations SHALL be certified so that:

```text
JSON-RPC/protocol frames → stdout
diagnostics/logging → stderr or separate sink
```

Unexpected non-protocol bytes on stdout become:

```text
ACP_PROTOCOL_CHANNEL_CONTAMINATED
```

The client MAY attempt bounded diagnostic capture but SHALL NOT silently skip arbitrary bytes and continue a security-sensitive session unless the certified framing contract explicitly supports resynchronization.

This prevents banners, update notices, shell/profile output or debug logs from being mistaken for protocol messages.



## 28C. JSON-RPC Batch Policy

ACP transport/SDKs may accept JSON-RPC batches.

SmartAIHub Revision 4 SHALL default to:

```text
receive batches only if supported by certified SDK
do not originate effect-bearing batches
```

until batch semantics are independently tested.

If incoming batch support is enabled:

- every request id remains unique within connection/incarnation;
- response correlation is per batch member;
- one malformed member does not silently authorize/settle another member;
- batch size/count are bounded;
- cancellation/permission messages are not hidden behind an oversized batch;
- replay/deduplication applies to each semantic intent independently.

Effect-bearing SmartAIHub operations SHOULD remain individually attributable even if transported in a batch.


# 29. ACP Initialization

Runner SHALL send initialize with:

```text
supported protocol version
client identity
client capabilities
extension capabilities
```

Runner stores:

```text
negotiated protocolVersion
agent capabilities
auth methods
adapter identity/version
extension metadata
```

Initialization response becomes immutable route-attempt evidence.

---


## 29A. ACP Process / Connection Topology Policy

An ACP server process may support multiple sessions, but SmartAIHub SHALL NOT assume that one process provides independent concurrency for all sessions.

Known adapter behavior has demonstrated that a pending permission/user-interaction flow in one session can block unrelated session operations on the same ACP process/connection.

Production topology modes:

```text
ONE_PROCESS_PER_ACTIVE_SESSION
SHARED_PROCESS_MULTIPLEXED
SHARED_PROCESS_READ_ONLY_CONTROL
```

Initial safe default for write-capable interactive agents SHOULD be:

```text
ONE_PROCESS_PER_ACTIVE_SESSION
```

unless the exact adapter/version has passed multiplexing certification.

`SHARED_PROCESS_MULTIPLEXED` requires tests proving that one session waiting on:

```text
permission
elicitation
plan review
long-running callback
background task
```

does not block:

```text
session/new
session/resume
session/list
session/close
session/cancel
other-session updates
```

Resource savings from process reuse MUST NOT override isolation/correctness.

## 29B. ACP Connection-Level Head-of-Line Blocking Detection

Runner SHALL measure:

```text
connection request queue age
oldest outstanding request
session-specific vs connection-wide latency
permission-wait state
reader-loop progress
writer-loop progress
```

If unrelated requests stall behind one session interaction beyond the certified threshold:

```text
ACP_CONNECTION_HOL_BLOCKED
```

The route stops admitting new sessions to that process.

Recovery may:

```text
complete/deny the blocking interaction
open a new ACP process/connection
migrate only sessions certified resumable
drain the old process
```

SmartAIHub SHALL NOT kill all sessions blindly if a narrower recovery is possible.


# 30. ACP Session Identity

Canonical mapping:

```text
SmartAIHub worker_job_id
→ route_attempt_id
→ ACP process incarnation
→ ACP session_id
```

An ACP `session_id` is not globally authoritative.

It must be scoped to:

```text
agent implementation
account binding
runtime process/incarnation
workspace binding
tenant/user
```

---


## 30A. ACP Session Origin Classification

An ACP/provider session list may contain:

```text
human-created top-level sessions
SmartAIHub-created sessions
provider-spawned subagent/sidechain sessions
agent-team worker sessions
internal/background sessions
unknown-origin sessions
```

SmartAIHub SHALL NOT present every discovered provider session as a user-resumable conversation.

Normalize:

```text
SMARTAIHUB_TOP_LEVEL
EXTERNAL_USER_TOP_LEVEL
PROVIDER_CHILD_SESSION
BACKGROUND_INTERNAL
UNKNOWN_ORIGIN
```

User-facing resume lists default to top-level sessions only.

Child/sidechain sessions remain visible in diagnostics/lineage where useful.

A provider child session MUST NOT be adopted as a new SmartAIHub top-level job solely because it appears in `session/list`.

## 30B. Session Discovery Provenance

Each discovered session records:

```text
discovery_source
provider metadata used for classification
parent/team/sidechain markers where exposed
cwd/repository evidence
account binding
last activity
classification confidence
```

If origin cannot be determined safely, the session is `UNKNOWN_ORIGIN` and is not automatically resumable for write-capable execution.


# 31. ACP Session Creation

Before `session/new`:

```text
workspace binding verified
cwd absolute and canonical
additional directories authorized
account/auth binding verified
capabilities negotiated
SmartAIHub MCP/capability projection prepared
assets/context ready
approval policy snapshot ready
```

Then:

```text
session/new
```

The returned session becomes bound to that exact workspace/account/profile.

---

# 32. ACP Session Resume/Load

Resume/load SHALL never rely on session id alone.

Preflight:

```text
tenant/user ownership
agent implementation
account identity
cwd / effective root
additional directories
model/profile where exposed
capability policy
session state
previous route generation
```

Mismatch requires:

```text
new controlled session
or explicit recovery
```

not silent resume.

---


## 32A. ACP History / Resume Completeness Contract

Session resume success does not guarantee complete conversation/history reconstruction.

For agents that expose history replay/list/load semantics, certification SHALL define:

```text
history source
pagination/cursor model
maximum page/window
ordering
message identity
tool-call/file-change replay
image/resource replay
compaction/truncation behavior
```

SmartAIHub SHALL distinguish:

```text
SESSION_CONTEXT_RESUMED
HISTORY_REPLAY_COMPLETE
HISTORY_REPLAY_PARTIAL
HISTORY_REPLAY_UNAVAILABLE
```

A large historical session MUST NOT be presented as fully reconstructed merely because `session/resume` succeeded.

If the current task depends on earlier conversation evidence that was not replayed, route eligibility requires either:

```text
explicit Context Package rehydration
provider-native complete history fetch
or new controlled session
```

## 32B. Session Replay Cursor / Snapshot Integrity

Where replay cursors, snapshots, forks, rewinds or compaction markers exist:

- snapshot/cursor belongs to exact session generation;
- stale cursor cannot be applied after destructive rewind/compaction;
- cursor provenance is recorded;
- replay notifications received before the resume response are not lost;
- duplicate replay events are deduplicated by message/tool/update identity where available.

Future ACP cursor/RFD features are capability-gated until stable and certified.



## 32C. Context-Limit Resume Preflight

Before resuming a large persisted ACP session, SmartAIHub SHALL evaluate available context evidence:

```text
history size / replay volume
provider context usage where exposed
last compaction/reset marker
adapter/provider warning
estimated Context Package additions
```

If a resumed session is already at or beyond usable provider context and the adapter cannot successfully compact:

```text
SESSION_CONTEXT_EXHAUSTED
```

Do not loop prompts that repeatedly fail with context-length errors.

Recovery policy may choose:

```text
certified compaction
provider-native rewind/fork
new session + summarized/context package handoff
user choice
```

The original session remains preserved for evidence unless retention policy says otherwise.

## 32D. Conversation / Continuation Epoch

ACP session id and provider conversation id are separate identities where the adapter exposes both.

SmartAIHub SHALL maintain:

```text
acp_session_id
provider_conversation_id
continuation_epoch
reset_reason
```

A provider-side conversation reset/new conversation MUST increment/change the continuation epoch and update the provider conversation binding.

After Runner/adapter restart, a stale provider conversation id from the previous epoch MUST NOT silently resume.

Session forks/rewinds/resets create new lineage edges:

```text
parent session/conversation
operation
new session/conversation
generation
```

rather than mutating history identity invisibly.



## 32E. Effective Session Configuration Fingerprint

Resume/load eligibility SHALL compare more than `cwd` and MCP server names.

SmartAIHub SHALL compute an **effective session configuration fingerprint** over all execution-relevant inputs available for the adapter, including where applicable:

```text
cwd / workspace binding
additional directories
MCP server definitions + environment projections
selected Skills / provider skill configuration
model
reasoning/effort
permission mode
sandbox/write policy
account/auth epoch
provider-specific options
SmartAIHub capability projection version
system/developer instructions that are session-bound
environment/config profile digest
```

If a resumed adapter reuses an underlying provider query/process while the requested fingerprint changed, SmartAIHub SHALL classify:

```text
SESSION_EFFECTIVE_CONFIG_MISMATCH
```

and require one of:

```text
recreate provider query/session
new controlled session with context handoff
adapter-specific certified live reconfiguration
```

A successful `session/resume` response does not prove the new effective configuration took effect.

## 32F. Session Configuration Epoch

Every accepted effective session configuration receives:

```text
session_config_epoch
session_config_digest
```

Background tasks/subagents inherit the epoch they were created under.

Changing material configuration while old background work remains active SHALL NOT silently rebind that old work to the new policy.

If the product allows reconfiguration mid-session, new and existing work must have explicit epoch lineage.


# 33. ACP Prompt Lifecycle

ACP structured prompt submission reduces Spec 210 TUI ambiguity.

Canonical translation:

```text
session/prompt request issued
→ TURN_SUBMITTED

agent begins structured update/tool/progress state
→ TURN_STARTED

updates
→ RUNNING

permission request
→ WAITING_FOR_APPROVAL

elicitation/user question
→ WAITING_FOR_USER

prompt response / idle stop reason
→ RESULT_STAGED / VERIFYING
```

Transport disconnect before proof follows reconciliation semantics.

---


## 33A. ACP Turn State vs Session Activity State

SmartAIHub SHALL model foreground turn lifecycle separately from session-level background activity.

Canonical dimensions:

```text
turn_state:
  IDLE
  SUBMITTED
  RUNNING
  WAITING_FOR_APPROVAL
  WAITING_FOR_USER
  SETTLED

session_activity:
  QUIESCENT
  FOREGROUND_ACTIVE
  BACKGROUND_ACTIVE
  BACKGROUND_WAITING_FOR_APPROVAL
  BACKGROUND_WAITING_FOR_USER
  UNKNOWN
```

A `session/prompt` response or foreground `end_turn` MAY settle `turn_state` while:

```text
background subagent
background shell
provider-native async task
post-turn continuation
```

remains active.

Therefore:

> **TURN_SETTLED does not imply SESSION_QUIESCENT.**

Job/session UI and reconciliation SHALL preserve this distinction.

## 33B. Session-Level Activity Evidence

Session-level activity may be derived from:

```text
native background-task notifications
subagent lifecycle updates
terminal/process custody
provider task registry
known pending permission/user-input request
adapter-specific active/idle extension
```

No single optional signal is universally authoritative.

If the adapter lacks sufficient evidence:

```text
SESSION_ACTIVITY_UNKNOWN
```

and SmartAIHub SHALL NOT falsely report the session idle when background work may still exist.

A session-level idle/active extension, if later standardized, can become a stronger signal only after certification.


# 34. ACP Event Normalization

ACP updates SHALL map into canonical events such as:

```text
agent.turn.started
agent.text.delta
agent.reasoning.delta
agent.plan.updated
agent.tool.started
agent.tool.updated
agent.permission.required
agent.file.changed
agent.terminal.started
agent.terminal.output
agent.terminal.completed
agent.background_task
agent.subagent.started
agent.subagent.updated
agent.subagent.completed
agent.usage
agent.warning
agent.turn.completed
agent.failed
```

Unknown extension fields are preserved in bounded/redacted raw metadata.

---


## 34A. ACP Request/Response Correlation and Receipt Ledger

Every outbound ACP request SHALL have a local durable/ephemeral receipt record appropriate to its risk:

```text
jsonrpc_request_id
worker_job_id
route_attempt_id
session_id
method
semantic_intent_id
sent_at
response_received_at
response_classification
generation
```

For mutation-like or effect-bearing operations, reconnect/recovery SHALL first reconcile the existing request/semantic intent before issuing a replacement.

A JSON-RPC response proves only that the ACP peer replied; it does not automatically prove:

```text
external side effect completed
background task terminated
file state persisted
terminal descendants exited
```

Those remain subject to effect/postcondition semantics.

Duplicate/late responses from an older route generation are diagnostic evidence and cannot advance authoritative job state.



## 34B. ACP Session Update Variant Policy

ACP documentation and schema evolve, and the schema may contain more `SessionUpdate` variants than an older client UI/documentation enumerates.

SmartAIHub SHALL classify unknown updates:

```text
KNOWN_AUTHORITATIVE
KNOWN_PROGRESS
KNOWN_EPHEMERAL
UNKNOWN_NONCRITICAL
UNKNOWN_SECURITY_RELEVANT
```

Rules:

- unknown additive progress updates may be retained as bounded opaque evidence;
- unknown update types MUST NOT automatically settle a turn/job;
- unknown updates that could represent permission/effect/file/terminal/session-state changes require conservative handling;
- parser forward compatibility MUST NOT become authorization forward compatibility;
- certification records the complete update-variant set understood by the client implementation.

If a negotiated adapter begins emitting a new security-relevant variant after upgrade:

```text
ACP_UPDATE_VARIANT_UNCERTIFIED
```

and the affected capability is degraded/quarantined until reviewed.



## 34C. Response Ordering / Duplicate Output Guard

SmartAIHub SHALL rely on JSON-RPC request ids and canonical event identities, not arrival timing alone.

For each ACP connection:

```text
request id → expected method/session/generation
response arrival sequence
notification sequence
turn/message/tool identities where available
```

If an adapter/API failure causes delayed or out-of-order responses, a response is matched only to its request id and current generation.

An old response MUST NOT be consumed by a newer logical request.

## 34D. Duplicate Semantic Output Suppression

Provider/adapter bugs or reconnect replay can emit semantically duplicate final answers or updates.

SmartAIHub SHALL deduplicate at the normalization boundary using the strongest available identity:

```text
provider message id
turn/update id
tool call id
background task id
replay cursor
```

When no stable provider id exists, a bounded diagnostic hash window MAY suppress exact duplicates but MUST NOT hide legitimate repeated user-requested content.

Duplicate suppression affects presentation/event duplication only; raw evidence may be retained with duplicate markers.

A duplicate final response MUST NOT:

```text
double-complete a worker_job
double-upload an artifact
double-charge usage
double-trigger downstream workflow nodes
```


# 35. ACP Permission Requests

ACP permission request is not itself SmartAIHub authorization.

Canonical flow:

```text
ACP Agent
→ session/request_permission
→ Runner ACP Client
→ SmartAIHub Approval Service
→ policy / human
→ ACP permission response
```

SmartAIHub risk policy remains authoritative.

Provider-specific permission modes MAY constrain further but cannot relax SmartAIHub policy.

---


## 35A. Approval Context Integrity / Fail-Closed Permission Binding

ACP permission requests can carry display/tool-call fields whose malformed optional values may be defaulted or omitted by a tolerant schema implementation.

For any permission that could authorize a side effect, SmartAIHub SHALL NOT approve solely from:

```text
toolCallId
title
display name
missing/defaulted rawInput
```

The Approval Service requires an **approval evidence envelope**:

```text
tool_call_id
normalized tool name
normalized arguments or an explicit "arguments unavailable" marker
argument/source hash
workspace binding
account binding
capability/tool identity
risk classification
route generation
requested permission options
```

If required execution arguments/context cannot be reconstructed with sufficient confidence:

```text
APPROVAL_CONTEXT_INCOMPLETE
```

and high-risk approval fails closed.

Approval decisions SHALL bind to a digest of the normalized evidence envelope.

If the agent changes material arguments, workspace, account, target, or route generation after approval, the old approval is stale and MUST NOT authorize the changed action.

UI SHALL visibly distinguish:

```text
no arguments were supplied
vs
arguments were supplied but could not be safely decoded
```

where such evidence is available.

This rule is stricter than merely rendering the ACP permission request and protects against context loss in tolerant deserialization paths.



## 35B. Out-of-Turn Permission and User-Input Channel

Permission/user-input handling SHALL remain live at the **session/connection level**, not only while a foreground `session/prompt` request is unresolved.

Background work may legitimately produce:

```text
session/request_permission
structured elicitation / user question
tool confirmation
```

after the launching foreground turn has settled.

SmartAIHub SHALL:

- retain a session-scoped request router while background work is active/unknown;
- surface the originating background task/subagent when known;
- bind the request to route/session/generation lineage;
- reject stale requests from settled/replaced generations;
- never drop a request merely because no foreground prompt RPC is pending.

If the product cannot safely present an out-of-turn high-risk request:

```text
deny with explicit reason
or
pause/cancel the originating background unit
```

rather than leave it deadlocked indefinitely.

## 35C. Permission Request Lineage and Correlation

Concurrent parent/subagent/background tool calls SHALL NOT share a single implicit "expected permission request" slot.

Every permission request is correlated using the strongest available lineage:

```text
session_id
tool_call_id
provider task/subagent id
parent tool-use id
turn id when applicable
route generation
```

If a permission response cannot be unambiguously matched:

```text
ACP_PERMISSION_LINEAGE_AMBIGUOUS
```

and the request fails closed.

A mismatched `toolCallId` MUST NOT consume the decision intended for another concurrent tool call.


# 36. ACP Filesystem Capability

ACP clients may expose file read/write operations.

SmartAIHub Runner SHALL expose only a virtualized/scoped filesystem view.

Requirements:

```text
allowed roots
canonical path
symlink escape prevention
tenant/project binding
read/write scopes
maximum sizes
audit
```

ACP path being absolute does not imply it is authorized.

---

# 37. ACP Terminal Capability

If Runner exposes terminal capability to ACP Agent:

```text
terminal/create
terminal/output
terminal/wait
terminal/kill
terminal/release
```

shall map onto shared Runner process/terminal supervision.

The ACP Agent SHALL NOT receive an unbounded arbitrary terminal outside the configured execution trust profile.

Terminal child processes are tracked and cleaned using Spec 210-compatible process custody/effect verification.

---

# 38. ACP Authentication

ACP authentication methods are agent-specific.

Runner SHALL maintain:

```text
auth_method_id
account_binding_id
auth_identity where safely exposed
credential_owner
runtime profile
```

Credentials remain provider-native whenever possible.

SmartAIHub SHALL NOT scrape or upload provider secrets simply because ACP supports authentication.

---


## 38A. Authentication Epoch and Session Revalidation

ACP authentication/account state may expire or change independently of an ACP session identifier.

SmartAIHub SHALL maintain:

```text
account_binding_id
auth_epoch
auth_method_id
last_verified_at
session_auth_epoch
```

A session created under one account/auth epoch MUST NOT silently continue under another account merely because the adapter process refreshed/switched credentials.

On:

```text
AUTH_REQUIRED
credential refresh
account switch
provider logout/login
credential owner change
```

the route enters revalidation.

Write-capable resume requires confirmation that the effective account binding still satisfies the attempt policy.

Expired authentication SHALL map to `AUTH_REQUIRED`, not be collapsed into generic ACP internal failure where SmartAIHub can distinguish it.


# 39. Claude Agent ACP Profile

Claude Agent ACP SHALL be a first-class certified implementation.

Current public implementation exposes features including:

```text
context mentions
images
tool calls
permission requests
edit review
TODO
nested subagents
interactive terminals
background terminals
slash commands
client MCP servers
usage/model/effort-related features
```

Certification SHALL pin:

```text
claude-agent-acp version
ACP protocol/schema/SDK compatibility
Claude Agent SDK version
Node runtime version
OS/arch
provider account mode
```

---


## 39A. Claude Agent ACP Route-Specific Hardening

Claude Agent ACP updates frequently and can contain breaking changes independent of the ACP wire protocol.

Certification SHALL pin and regression-test:

```text
claude-agent-acp version
Claude Agent SDK version
ACP SDK/schema version
Node runtime
OS/arch
permission rendering/command evidence
checkpoint/file-change reporting
session load/resume
background terminals
nested subagents
MCP configuration
model/effort configuration
```

Breaking adapter changes such as renamed/removed agent-selection/config surfaces SHALL invalidate the previous certification fingerprint.

Experimental features such as session compaction updates SHALL remain disabled unless separately feature-gated and tested.

SmartAIHub SHALL NOT assume that a successful ACP initialize means the adapter's provider-specific configuration contract remained backward-compatible.


# 40. Codex ACP Profile

Codex ACP SHALL be a first-class certified implementation.

Current public implementation uses:

```text
ACP stdio agent
→ Codex App Server
```

and exposes features including:

```text
ChatGPT/API/custom gateway authentication
model
reasoning effort
fast mode
approval/sandbox mode
text
images
additional workspace directories
shell commands
file changes
permission requests
MCP calls
terminal output
reasoning
plans
web search
image generation/view
token usage
review events
subagent sessions
background tasks
```

Certification SHALL pin:

```text
codex-acp version
ACP protocol/schema/SDK compatibility
Codex version
OS/arch
account mode
sandbox/approval mode
```

---




## 40C. Codex ACP Executable / Login Resolution

Codex ACP installation/login SHALL bind to an explicit certified Codex executable identity.

SmartAIHub MUST NOT assume that an arbitrary `codex` found on ambient `PATH` is the same binary/version bundled or certified with the selected Codex ACP adapter.

Record:

```text
codex_acp executable/digest
resolved Codex executable/digest
resolution source:
  bundled
  configured absolute path
  managed install
provider version
```

Login/auth bootstrap failure before ACP `initialize` SHALL be diagnosed separately from protocol incompatibility.

On Windows, executable resolution/quoting/process creation is included in certification.

An update of either executable invalidates the compound tuple until re-probed.


## 40A. Codex ACP Route-Specific Hardening

Codex ACP has a rapidly evolving implementation surface. Production certification SHALL explicitly regression-test known risk classes rather than assuming ACP structure eliminates provider-adapter bugs.

Required checks include:

```text
requested writable roots are preserved
requested sandbox/approval mode is preserved
read-only/restricted mode remains enforceable
WSL /mnt/<drive> and native Windows path normalization
session list/load/resume finds sessions created under normalized cwd
auth expiration maps to AUTH_REQUIRED rather than generic failure
model + reasoning effort persist across turns/resume when claimed
MCP configuration overrides are preserved
image/history replay restores required content
prompt completion occurs even when provider emits sparse/no deltas
usage semantics are labeled per-turn vs cumulative correctly
```

The adapter SHALL independently attest effective:

```text
cwd
additional roots
sandbox mode
approval mode
account/auth identity where exposed
model
reasoning effort
```

after session creation/resume when the implementation exposes sufficient evidence.

A Codex ACP prompt/template that broadens writable roots or sandbox permissions beyond the SmartAIHub workspace policy is a **route security failure**, not a harmless provider preference.


## 40B. ACP Registry Discovery and Trust Boundary

The official ACP Registry MAY be used as a discovery/catalog source.

Registry inclusion proves only the properties enforced by the registry's current publication/CI rules; it does **not** automatically grant SmartAIHub production trust.

SmartAIHub SHALL snapshot and pin:

```text
registry snapshot/release identity
agent id
declared version
distribution type
download/source location
declared license
platform target
artifact digest where supplied/verified
preview vs stable channel
authentication methods returned during ACP initialize
```

Rules:

- the registry's hourly automatic version updates MUST NOT flow directly into production;
- preview entries are never production-certified by default;
- a registry-listed agent still passes SmartAIHub supply-chain, protocol, security and runtime conformance;
- registry removal/change does not mutate an in-flight certified attempt;
- administrator-installed ACP agents outside the registry remain possible but require equivalent evidence;
- SmartAIHub caches a signed/content-addressed registry snapshot or equivalent provenance rather than depending on mutable `latest` at execution time.


# 41. Future ACP Agent Registry

SmartAIHub MAY discover potential ACP agents from:

```text
administrator registration
ACP ecosystem registry
installed binaries
Gas City provider configuration
marketplace metadata
```

Discovery never equals trust.

States:

```text
DISCOVERED
PROBING
CERTIFIED
DEGRADED
BLOCKED
QUARANTINED
```

---


## 41A. Antigravity ACP Candidate Profile

A third-party `antigravity-acp` implementation currently exists and exposes Antigravity SDK behavior over ACP stdio, including session creation/load/resume, prompt streaming, tool-call updates, scoped file operations, subagents and model configuration.

It SHALL be treated as:

```text
THIRD_PARTY_CANDIDATE
```

not as an official Google/Antigravity-supported ACP route unless that status changes.

Initial policy:

```text
Antigravity:
  certified official structured route, if available
  → certified third-party ACP candidate, if independently approved
  → Orca / Spec 210
  → native / PTY
```

Certification SHALL additionally verify:

- repository/package publisher provenance;
- package digest;
- license;
- Python/runtime dependencies;
- Antigravity SDK provenance/version;
- environment/API-key handling;
- file-root enforcement;
- subagent budget/permission behavior;
- transcript/debug logging privacy;
- session resume correctness.

Third-party ACP availability MUST NOT cause SmartAIHub to remove the already-audited Orca fallback.


# 42. ACP Extension Policy

ACP supports extensibility through metadata/custom capabilities/methods.

SmartAIHub SHALL namespace its own extensions:

```text
_smartaihub.*
```

Use extensions only when:

- standard ACP lacks required semantics;
- fallback exists;
- capability is negotiated;
- raw extension data is bounded;
- version is explicit.

Do not create provider-specific extension sprawl when canonical SmartAIHub normalization can solve the problem.

---

# 43. MCP Through ACP

ACP-compatible agents may accept MCP server configurations.

SmartAIHub rule remains:

```text
Agent
→ SmartAIHub governed capability endpoint
→ Capability Resolver
→ Skill / Workflow / Internal / Spec 199 External MCP
```

Do not pass arbitrary upstream MCP credentials.

Revision 1 production SHOULD prefer a SmartAIHub job-scoped local capability proxy/endpoint as defined by Spec 210.

ACP MCP-over-ACP experimental features remain gated.

---


## 43A. ACP MCP Effective-Configuration Reconstruction

When a session adds or changes MCP servers, SmartAIHub SHALL construct the **full effective MCP configuration** for that session rather than assume incremental adapter merges preserve:

```text
environment overrides
authentication references
command/args
cwd
transport options
SmartAIHub capability proxy
provider-native configured MCP servers
```

The effective MCP digest is included in `session_config_digest`.

If adapter behavior drops environment overrides or other material fields during an incremental merge:

```text
ACP_MCP_EFFECTIVE_CONFIG_MISMATCH
```

and the route must recreate/reconfigure using a certified full configuration path.

No MCP server is considered active merely because its name appears in session metadata; tool discovery/connectivity must be verified where required.


# 44. SmartAIHub Capability Projection

Per-job projection includes:

```text
capability.search
capability.describe
capability.invoke
capability.status
capability.result
```

with token constraints:

```text
tenant
user
job
session
allowed capabilities
max invocation count
max spend
expiry
revocation epoch
```

Gas City child sessions receive derived least-privilege grants.

---

# 45. ACP Elicitation / User Input

Where ACP adapter supports structured user input:

```text
ACP request
→ normalized Agent Question
→ SmartAIHub Web / workflow wait
→ validated response
→ ACP
```

Input schema must be validated.

Late/stale user replies are rejected by route generation/session identity.

---


## 45A. User-Input Delivery Finality

A provider/ACP response such as:

```text
accepted: true
```

is not sufficient proof that an asynchronous user answer reached the active agent turn.

For user-input/elicitation delivery SmartAIHub SHALL track:

```text
question_id
response_id
session_id
turn/background-task identity
delivery_intent_id
accepted_by_adapter
observed_by_agent
consumed_by_turn
```

Normalized states:

```text
USER_RESPONSE_PENDING
USER_RESPONSE_ACCEPTED_UNPROVEN
USER_RESPONSE_DELIVERED
USER_RESPONSE_CONSUMED
USER_RESPONSE_DELIVERY_UNKNOWN
```

A timed-out or disconnected response path SHALL reconcile before re-sending an answer that could be interpreted twice.

If the adapter cannot expose delivery proof, the UI SHALL not claim "agent received your response" merely from transport acceptance.


# 46. ACP Subagents

Native ACP subagent support is evolving and may be extension/draft dependent.

SmartAIHub SHALL model:

```text
root ACP session
child provider session(s)
```

only when negotiated.

Otherwise subagent activity remains provider tool-call evidence.

Subagents do not automatically become SmartAIHub child jobs.

Create child jobs only when platform-level:

```text
billing
approval
artifact ownership
independent retry
workflow dependency
```

requires it.

---

# 47. Background ACP Tasks

Provider background terminals/tasks can outlive one foreground turn.

SmartAIHub SHALL track:

```text
task identity
parent session
process custody
started
running
settled
cancelled
cleanup
```

Job completion policy specifies whether background tasks:

```text
must finish
may detach under custody
must be cancelled
```

No hidden process should remain unowned after job settlement.

---


## 47A. Background Task Cancellation Tree

ACP/provider background work may outlive the foreground prompt and may not support fine-grained per-task cancellation on every adapter version.

SmartAIHub SHALL maintain a task/process ownership tree:

```text
ACP session
├ foreground turn
├ background task A
│  └ process/terminal children
├ background task B
└ provider-native subagent(s)
```

Cancellation capability is recorded per node:

```text
INDIVIDUAL_CANCEL
SESSION_WIDE_CANCEL_ONLY
PROCESS_KILL_ONLY
NOT_OBSERVABLE
```

If individual background cancellation is unavailable, UI/API MUST NOT claim that one background task was cancelled independently.

Policy chooses among:

```text
wait
cancel entire ACP session
kill/recreate provider process
detach under explicit custody
```

Job settlement requires all non-detached background nodes to be settled or classified unknown.

A provider request for future fine-grained cancellation support MUST NOT be assumed implemented merely because background tasks are observable.



## 47B. Follow-Up Prompt vs Background-Task Policy

Sending a new user prompt SHALL NOT implicitly mean:

```text
cancel every background subagent/task from the previous turn
```

unless product policy explicitly defines that behavior.

Before a follow-up prompt, SmartAIHub classifies existing work:

```text
foreground still generating
background child intentionally continuing
background child awaiting permission/input
detachable background service/task
unknown
```

Policy choices:

```text
QUEUE_FOLLOWUP
STEER_CURRENT_TURN
SEND_WHILE_BACKGROUND_CONTINUES
CANCEL_FOREGROUND_ONLY_THEN_SEND
CANCEL_ALL_SESSION_WORK_THEN_SEND
ASK_USER
```

The selected behavior is adapter-capability aware.

A generic client implementation that blindly calls `session/cancel` before every follow-up MUST NOT be used for adapters where cancel tears down background children that are meant to survive.

## 47C. Background Task Stop Capability

SmartAIHub SHALL capability-detect whether the adapter supports:

```text
stop one background subagent
stop selected task ids
stop all background subagents
stop background shell
session-wide cancel only
```

An experimental/provider-specific stop extension is never assumed present.

If fine-grained stop is unavailable, the UI shall present the real alternatives rather than a fake per-task Stop button.


# 48. ACP Cancellation

`session/cancel` is a request/notification, not proof that all provider side effects stopped.

SmartAIHub SHALL still verify:

```text
foreground turn settled
terminal/background tasks
capability calls
filesystem changes
external effects
```

Unknown external side effects retain `UNKNOWN_OUTCOME`.

---


## 48A. ACP Cancellation Escalation Ladder

ACP `session/cancel` is the first cancellation mechanism when supported, but adapters may become stuck in provider-native blocking calls.

Cancellation policy SHALL define bounded escalation:

```text
L1  ACP session/cancel
L2  provider/adapter-specific interrupt if certified
L3  terminate owned background task/process subtree
L4  terminate/restart ACP adapter process
L5  runtime/container termination
```

At every level:

```text
record effect intent
fence generation
preserve evidence
verify process/background-task postconditions
classify external side effects
```

Escalation occurs only when the narrower method fails or cannot make progress within its bound.

Killing the ACP adapter process is not considered rollback of file/network/tool side effects.

If a pending `session/prompt` never resolves after cancel:

```text
ACP_CANCEL_STUCK
```

and the route follows this escalation ladder.


# 49. ACP Process Supervision

The ACP server process itself is Runner-owned.

Runner tracks:

```text
pid/process identity
binary digest
version
start time
workspace
account binding
protocol version
session ids
stdout/stderr bounds
exit status
```

Unexpected process exit triggers session reconciliation.

---


## 49A. ACP Process Admission / Session Density

Each certified ACP adapter SHALL declare:

```text
max_sessions_per_process
max_concurrent_foreground_turns
max_pending_permission_requests
max_background_tasks
max_terminal children
```

Initial defaults SHOULD be conservative.

If `ONE_PROCESS_PER_ACTIVE_SESSION` is selected, process capacity is reserved before session creation.

If a shared process is selected, admission accounts for connection-wide failure blast radius: process crash or blocked dispatch can affect all sessions sharing it.

The scheduler MAY prefer more processes with fewer sessions when reliability isolation outweighs memory savings.



## 49B. Provider Child Process Uniqueness / Resume Leak Guard

A long-lived ACP adapter process may spawn provider CLI/SDK child processes while sessions are loaded/resumed.

SmartAIHub SHALL track, where observable:

```text
ACP adapter process incarnation
ACP session id
provider child pid/process identity
provider conversation id
session_config_epoch
child start time
child role
```

For adapters certified as one-provider-child-per-active-session/query, repeated resume/load MUST NOT accumulate multiple live provider children for the same authoritative session generation.

If multiple unexplained provider children are observed:

```text
ACP_PROVIDER_CHILD_LEAK
```

The affected process stops admitting new work until reconciled.

Cleanup/recovery SHALL determine whether each child is:

```text
authoritative
stale
background-owned
detached intentionally
unknown
```

before killing it.

Memory/process-count growth from repeated resume is part of soak certification.

## 49C. ACP Adapter Soak / Resume-Churn Certification

Certification SHALL include:

```text
hundreds of create/resume/load/close cycles
client disconnect/reconnect
auth refresh
workspace/config epoch changes
background child activity
process-count/RSS/file-descriptor tracking
```

The test passes only if resource growth reaches a bounded steady state or every retained resource has an explicit owner/retention reason.


# 50. ACP Adapter Upgrade Policy

ACP server adapters update rapidly.

SmartAIHub SHALL use:

```text
stable-certified
candidate
development
```

Promotion:

```text
release discovered
→ supply-chain verification
→ protocol/schema compatibility
→ conformance
→ provider regression
→ canary
→ stable-certified
```

In-flight sessions stay on their bound version when possible.

---


## 50A. ACP SDK / Client Implementation Path Certification

Wire-protocol capability and a specific SDK/client implementation capability are separate.

Example risk:

```text
ACP method exists in protocol
but selected client SDK cannot correctly restore an ActiveSession
```

Therefore certification key SHALL include:

```text
client SDK implementation
SDK version
transport implementation
agent adapter version
protocol version
feature/method
OS/runtime
```

For critical methods such as:

```text
session/resume
session/load
session/close
permission callbacks
terminal operations
```

SmartAIHub SHALL run end-to-end conformance through the exact client SDK path used in production.

If a protocol method is stable but the chosen SDK path is broken:

```text
PROTOCOL_SUPPORTED_SDK_PATH_UNCERTIFIED
```

and route selection must use another certified SDK/client implementation or another runtime route.


# 51. ACP Conformance Harness

SmartAIHub SHALL build a protocol-level fake ACP Agent.

It MUST simulate:

```text
valid v1
unsupported protocol
capability changes
malformed JSON-RPC
late response
duplicate notification
out-of-order updates
permission requests
file read/write
terminal lifecycle
disconnect mid-turn
cancel ignored
session load mismatch
large content
unknown extensions
```

Testing must not depend only on Claude/Codex real services.

---

# 52. Gas City Managed Installation

Runner states:

```text
NOT_INSTALLED
DETECTED
INSTALLABLE
INSTALLING
READY
UPDATE_AVAILABLE
UPDATING
DEGRADED
REPAIR_REQUIRED
BLOCKED
```

Managed installation records:

```text
version
binary digest
source
checksums/signature/attestation where available
SBOM where available
install date
bridge compatibility
provider availability
```

Rolling edge builds are development-only by default.

---

# 53. Gas City Dependency Boundary

Gas City may depend on components such as:

```text
git
tmux
jq
pgrep
lsof
Dolt
bd / Beads
flock
gh (optional)
Kubernetes tooling depending on provider
```

Mode A Provider Bridge SHOULD minimize required dependencies and avoid installing full work-tracking stack when unnecessary.

Mode B Managed City may install its required stack in a dedicated managed profile.

---


## 53A. Dedicated Managed Registry/Profile

Gas City startup can be affected by stale registered cities, older supervisor binaries, invalid bundled-pack caches and machine-global state from previous installations.

SmartAIHub-managed Gas City SHOULD therefore use a dedicated managed profile/registry/state root where supported rather than sharing arbitrary user-global Gas City state.

Upgrade preflight SHALL verify:

```text
active supervisor executable/version
registered cities in the managed profile
provider catalog validity
pack cache validity
store compatibility
project identity
required dispatcher configuration
```

`gc doctor --fix` or equivalent repair commands MUST NOT be run blindly across unrelated user-managed cities.

Repairs occur only inside the SmartAIHub-managed profile after snapshot/evidence capture.

On macOS and other environments where automatic binary-drift restart is unreliable, SmartAIHub performs an explicit drain/stop/start/version verification under the runtime maintenance lease.



## 53B. Gas City Store Backend Strategy

Gas City supports more than one work-store backend. SmartAIHub SHALL choose the narrowest store footprint required by the integration mode.

Current upstream behavior includes:

```text
bd/Beads + Dolt = default managed work store
file-based store = supported alternative for simpler deployments
```

Mode A — Session Provider Bridge:

```text
SHOULD avoid full Beads/Dolt state when the selected Gas City integration path does not require Managed City work tracking.
```

Mode B — Managed City:

```text
store backend selected explicitly:
  file
  bd/dolt
  future certified store
```

Store choice is part of the certification tuple.

SmartAIHub SHALL NOT install Dolt merely because Gas City is present when the selected execution mode can safely operate without it.

## 53C. Required Runtime Dependencies Are Capability-Specific

Gas City currently treats `tmux` as a default/fallback session backend and may require it even when another provider is selected.

Managed installation SHALL discover and record the **actual upstream prerequisite set** for the pinned Gas City version rather than infer dependencies from the selected provider name.

Examples:

```text
Gas City core:
  git
  jq
  pgrep
  lsof
  tmux according to current upstream requirement

bd/dolt store:
  bd
  supported Dolt version
  flock / platform equivalent

k8s:
  cluster/client dependencies

specific agent:
  provider executable/runtime
```

A future upstream release may relax/change these requirements; certification is version-scoped.



## 53D. Managed Pack/Provider Cache Generation

Gas City may maintain bundled-pack/provider catalogs or synthetic caches whose invalid-but-present state does not necessarily self-heal.

SmartAIHub-managed profile SHALL record:

```text
cache_generation
source Gas City version/digest
pack/provider catalog digest
created_at
validation status
```

Upgrade/repair flow:

```text
validate current cache
→ snapshot evidence
→ reseed/rebuild only managed profile cache
→ validate
→ publish new cache generation atomically
```

A stale/invalid cache must not be silently accepted because the directory exists.

## 53E. Supervisor Executable Attestation

After install/upgrade SmartAIHub SHALL attest the **running** supervisor executable, not only the binary located at the intended install path.

Record:

```text
expected executable path/digest
running pid
running executable path/digest where OS permits
service-manager unit/launch identity
runtime version reported
supervisor generation
```

If an older/shadowed binary remains running:

```text
GASCITY_SUPERVISOR_BINARY_MISMATCH
```

No production admission until drained/restarted/re-attested.

Platforms that cannot reliably resolve a running executable require explicit stop/start/version verification under maintenance mode.


# 54. Gas City State Isolation

Gas City state SHALL live in a SmartAIHub-managed runtime profile when installed by SmartAIHub.

Isolation key:

```text
runner
tenant trust domain
managed city/profile
```

Do not share one mutable Gas City city/profile between mutually untrusted tenants unless isolation is actually enforced.

---

# 55. Gas City Metadata Namespacing

SmartAIHub metadata SHALL use stable namespace:

```text
smartaihub.worker_job_id
smartaihub.route_attempt_id
smartaihub.delegation_id
smartaihub.generation
smartaihub.tenant_id
smartaihub.project_id
```

No human label is automation identity.

---

# 56. Gas City Session Adoption

Gas City can recover/adopt sessions.

SmartAIHub adoption requires:

```text
delegation/job mapping
workspace identity
agent implementation
provider
process identity
account binding
generation
current SmartAIHub job state
```

An orphan Gas City session cannot self-claim a SmartAIHub job.

---


## 56A. Session Freshness / Wake Mode Policy

Gas City/provider session restart semantics SHALL be explicit:

```text
RESUME_EXISTING_CONTEXT
START_FRESH_CONTEXT
ADOPT_EXISTING_PROCESS
```

Recommended defaults:

```text
long-lived conversational specialist:
  RESUME_EXISTING_CONTEXT if context/budget policy allows

ephemeral pool worker / patrol / repetitive maintenance agent:
  START_FRESH_CONTEXT unless task explicitly requires continuation
```

This prevents context/token accumulation from repeated resume cycles.

`wake_mode = fresh` or equivalent MUST produce a genuinely new provider conversation/session identity, not merely change metadata while reusing stale provider context.

SmartAIHub verifies continuation epoch/provider conversation binding after wake.

## 56B. Stale Runtime Metadata After Kill/Wake

A runtime process being killed/stopped does not prove persisted session metadata transitioned to stopped/asleep.

After kill/reset/wake operations, the Bridge SHALL verify both:

```text
runtime/process postcondition
AND
Gas City session metadata/state postcondition
```

If runtime is gone but metadata still says active/awake:

```text
GASCITY_SESSION_METADATA_STALE
```

A subsequent wake MUST reconcile metadata before deciding that no new process is needed.


# 57. Gas City Crash Recovery

Gas City internal crash adoption MAY restart/recover a session only while:

```text
delegation lease active
desired SmartAIHub state allows execution
budget remains
runtime provider eligible
workspace binding valid
```

If SmartAIHub job is cancelled/revoked/settled:

```text
no resurrection
```

---


## 57A. Provider Start Lease / Desired-State Revision

Starting a Gas City runtime child SHALL be protected by a start lease tied to the current desired-state revision.

Conceptual:

```text
session_id
provider_start_lease_id
desired_revision
delegation_generation
workspace_binding_id
expires_at
```

A stale cached/projected `creating` record MUST NOT overwrite or supersede an active provider-start lease from a newer revision.

Before provider start commit:

```text
compare expected desired_revision
compare session/delegation generation
compare active start lease
```

Mismatch becomes:

```text
GASCITY_START_LEASE_CONFLICT
```

and is reconciled rather than launching a second process.

This protects against stale creating projections racing a provider start already in flight.


# 58. Gas City Drain

SmartAIHub cancellation/scaling may request Gas City drain.

Drain states SHOULD normalize:

```text
DRAIN_REQUESTED
DRAINING
DRAINED
DRAIN_INCOMPLETE
```

Work assignment left on dead sessions must be detectable.

SmartAIHub SHALL reconcile child work/session mapping before considering a managed-city execution settled.

---


## 58A. Gas City Work Assignment Lease / Ownership Epoch

Gas City internal work assignment SHALL NOT be considered valid indefinitely merely because a bead/work item still contains an assignee string.

For Managed City mode, SmartAIHub Bridge SHALL project/observe an ownership epoch concept:

```text
internal_work_id
assigned_session_id
assigned_session_generation
assignment_observed_at
live_session_observation
delegation_generation
```

When a session is confirmed dead/drained:

- its assignment becomes stale;
- work is not hidden from demand merely because the stale assignee remains;
- reassignment/adoption requires a fresh ownership generation;
- two live sessions MUST NOT simultaneously treat the same SmartAIHub-significant internal unit as exclusively owned.

Gas City native fixes may improve this behavior, but SmartAIHub certification SHALL still test the invariant.

If ownership cannot be resolved:

```text
GASCITY_WORK_OWNERSHIP_AMBIGUOUS
```

and the parent route reconciles instead of spawning uncontrolled duplicate workers.



## 58B. Internal Work Claim Compare-and-Swap

For SmartAIHub-significant Managed City work, assignment SHALL use an atomic/lease-like claim contract where the selected store/runtime supports it.

Conceptual claim:

```text
internal_work_id
expected_state
expected_owner
new_owner_session
owner_generation
claim_epoch
lease_expiry
```

Two concurrent pool sessions MUST NOT both successfully claim one exclusive work unit.

If native Gas City/Beads work leases are available in the certified tuple, prefer those primitives.

Otherwise the Bridge SHALL add a bounded external ownership guard for SmartAIHub-significant work.

Duplicate claim evidence becomes:

```text
GASCITY_DUPLICATE_WORK_CLAIM
```

and both writers are fenced from publishing authoritative platform results until reconciled.


# 59. Gas City Pool Semantics

Pool use is optional.

SmartAIHub SHALL define:

```text
min
max
scale policy
idle/drain timeout
provider constraints
budget
```

Gas City's pool desired count is subordinate.

SmartAIHub top-level capacity/admission remains authoritative.

---


## 59A. Pool Demand Identity / Deduplication

Pool scaling SHALL count logical executable work, not raw child-record cardinality.

A formula/molecule fan-out can create:

```text
parent work
child bookkeeping records
routed executable children
retry records
completed/blocked children
```

The demand adapter SHALL define a stable `demand_identity` and status predicate so the same logical unit is not counted multiple times.

Scaling inputs SHOULD include:

```text
ready executable work
orphaned resumable work
stale-owner work requiring adoption
```

and exclude:

```text
completed
blocked
bookkeeping-only
duplicate retry representation
already-owned live work
```

## 59B. Multi-Rig / Multi-Project Demand Scope

For pools intentionally serving multiple rigs/projects, demand evaluation SHALL match the declared service scope.

A pool advertised as serving:

```text
rig A + rig B + rig C
```

MUST NOT compute desired capacity only from one rig-local store/query.

The configured scope becomes part of the pool certification and observability:

```text
demand_scope
sources_checked
freshness
deduplicated_count
```

If some demand sources are unavailable:

```text
POOL_DEMAND_PARTIAL
```

rather than silently treating missing rigs as zero demand.


# 60. Gas City Pool Failure Guard

A dead child session with assigned internal work must not make demand invisible.

The bridge/managed-city health adapter SHALL detect:

```text
work assigned to non-live session
creating session stuck
drain left stale assignee
pool demand > live capacity
```

and surface:

```text
GASCITY_WORK_ORPHANED
GASCITY_SESSION_CREATING_STUCK
GASCITY_POOL_ASSIGNMENT_STALE
```

before parent job can stall silently.

---


## 60A. Long-Lived Pool Soak Certification

Gas City pool behavior SHALL be certified under long-lived supervisor uptime, not only short functional tests.

Required soak scenarios:

```text
continuous supervisor uptime
repeated scale-up/scale-down
idle → demand → spawn cycles
controller reload without full restart
store latency/fault injection
session create/drain churn
```

The Bridge SHALL detect the pathological condition:

```text
pool demand exists
+
new session records enter creating/pending state
+
no provider start enqueue/call occurs within bounded window
```

and surface:

```text
GASCITY_POOL_START_PIPELINE_STALLED
```

A supervisor process being alive/healthy is insufficient proof that the pool spawn path is making progress.



## 60B. Failed-Create / Unknown-State Escape Contract

No Gas City session state may remain forever in a reconciler skip loop without bounded escalation.

States such as:

```text
creating
failed-create
unknown_state
unknown metadata state
```

SHALL have:

```text
entered_at
last_progress_at
reason/evidence
bounded retry budget
repair path
terminal/quarantine path
```

If no legal native transition exists within the certified runtime version, the Bridge SHALL quarantine/fence the session record and prevent it from consuming an active pool slot indefinitely.

## 60C. Reconcile Spin / Hot-Loop Guard

An invalid/stuck Gas City session MUST NOT cause a high-frequency no-progress reconciliation loop.

The Bridge/runtime health layer SHALL detect:

```text
same session/state repeatedly evaluated
no state/effect progress
cycle frequency exceeds threshold
store operations repeat without useful mutation
```

and apply:

```text
backoff
quarantine
circuit breaker
operator diagnostic evidence
```

rather than allowing CPU/store saturation.

Session-name generation and other locally predictable inputs SHALL be validated before persistence/start so invalid identities do not enter repeated reconciliation.


# 61. Gas City Store Failure Guard

Gas City persistence/control-store failure SHALL NOT trigger uncontrolled restart of every delegated session without SmartAIHub observing the transition.

The adapter SHALL classify:

```text
STORE_HEALTHY
STORE_DEGRADED
STORE_UNAVAILABLE
```

and distinguish:

```text
read failure
write failure
corruption
dependency version mismatch
network/transient database failure
```

Global restart must be bounded and reported.

---


## 61A. Gas City Read Projection vs Authoritative Store

Gas City v1.4.x exposes typed/paginated reads and warm projections for operational efficiency.

SmartAIHub SHALL classify Gas City reads as either:

```text
AUTHORITATIVE_STORE_READ
PROJECTED/CACHED_READ
RUNTIME_OBSERVATION
```

A cached/warm projection is suitable for UI and health trends, but destructive reconciliation/adoption decisions that could create duplicate execution require a fresh authoritative observation or a bounded consistency proof.

If projection freshness is unknown:

```text
GASCITY_OBSERVATION_STALE
```

and SmartAIHub MUST NOT infer that an absent child/session is dead.



## 61B. Transient Store Failure Blast-Radius Policy

A transient Gas City store read/write/network error SHALL NOT automatically justify interruption/restart of every delegated child session.

The SmartAIHub Bridge SHALL classify store failures:

```text
TRANSIENT_READ
TRANSIENT_WRITE
CONNECTION_RESET
STORE_UNAVAILABLE
CORRUPTION_SUSPECTED
SCHEMA_INCOMPATIBLE
```

Response policy is graduated:

```text
retry bounded read
→ mark observation stale
→ pause new placement
→ preserve currently running child processes where safe
→ reconcile
→ restart/drain only the affected scope when possible
```

City-wide restart is reserved for conditions where correctness cannot otherwise be recovered and MUST be surfaced as a high-impact effect.

This prevents one transient metadata/store fault from unnecessarily terminating unrelated in-flight agent sessions.



## 61C. Managed Store Process Custody / Singleton Fencing

When SmartAIHub uses a managed Dolt-backed store, store process lifecycle SHALL be treated as a single-writer data-plane resource.

Canonical identity:

```text
store_profile_id
data_dir canonical identity
store_process_generation
pid/process identity
listener endpoint
lock ownership
schema version
```

Before starting/restarting a store server:

1. acquire SmartAIHub/Gas City maintenance/process lease;
2. verify no prior generation still holds the store/data-dir lock;
3. request graceful stop of the prior generation if needed;
4. wait for process exit and lock release;
5. verify journal/store readiness;
6. only then start the next generation;
7. publish the new endpoint/generation atomically.

A TCP port becoming free/ready is **not** sufficient proof that the previous store process flushed and released its storage lock.

Fail closed rather than race two store servers against the same data directory.

## 61D. Store Endpoint Generation / Environment Propagation

Long-lived agent sessions may retain stale store host/port environment after the managed store restarts.

Every runtime child that uses the managed store SHALL know:

```text
store_endpoint_generation
host
port
profile/store identity
```

Before a store-dependent mutation:

- compare the child's endpoint generation to the current authoritative endpoint;
- refresh/rebind through supported mechanisms when possible;
- otherwise mark session `STORE_ENDPOINT_STALE` and restart/reconcile safely.

Ambient legacy environment variables MUST NOT override the current managed-profile endpoint silently.

Endpoint changes are propagated through SmartAIHub/Gas City controlled state, not human shell profile assumptions.



## 61E. Control-Decision Read Provenance / No Silent Defaults

A failed store/config lookup SHALL NOT be converted silently into a meaningful policy default.

For control decisions such as:

```text
merge strategy
provider selection
approval policy
routing target
ownership/assignee
retry policy
workspace binding
```

SmartAIHub/Gas City Bridge SHALL distinguish:

```text
VALUE_EXPLICIT
VALUE_DEFAULTED_BECAUSE_ABSENT
VALUE_UNKNOWN_BECAUSE_READ_FAILED
```

`VALUE_UNKNOWN_BECAUSE_READ_FAILED` fails closed for destructive or materially different execution choices.

Example prohibited behavior:

```text
store unavailable
→ cannot read requested local-only merge strategy
→ silently use normal merge queue/default remote behavior
```

Decision evidence records the source and freshness of every policy-critical value.



## 61F. Authoritative Read Barrier Before Mutating Decisions

Gas City/Beads operational read paths may serve cached/projected state that lags the live store.

Before a decision that can create duplicate execution or destroy state, the Bridge SHALL cross an **authoritative read barrier**.

Examples requiring fresh authoritative evidence:

```text
claim/reassign work
declare owner dead
start replacement session
delete/drain session
publish final internal work state
destructive cleanup
merge/release ownership
```

A UI/dashboard/REST/cache/list snapshot alone is insufficient if its freshness/authority is not guaranteed.

The Bridge records:

```text
read_source
store revision/sequence when available
observed_at
freshness bound
```

If only stale/projected reads are available:

```text
AUTHORITATIVE_READ_UNAVAILABLE
```

and destructive/duplicate-producing transitions fail closed or reconcile.

## 61G. Projection Lag SLO

Projected/cache-backed reads may still be useful for UI and capacity trends.

SmartAIHub SHALL measure:

```text
projection_lag_seconds
projection_vs_authoritative mismatch rate
stale-ready/stale-in-progress observations
```

If lag exceeds the certified envelope, projected state is removed from route-authority decisions and the runtime health becomes:

```text
READY_WITH_LIMITATIONS
or
DEGRADED
```


# 62. Gas City Beads/Dolt Version Compatibility

If Managed City mode uses Beads/Dolt:

- pin compatible versions;
- validate tool/library version match;
- run storage preflight;
- protect against known withdrawn/corrupt versions;
- maintain backup/recovery policy;
- upgrade under maintenance lease;
- prevent automatic production promotion without conformance.

SmartAIHub SHALL not assume Gas City upgrade implies storage dependency upgrade is safe.

---


## 62A. Gas City / Beads Storage Migration Boundary

Gas City and Beads release independently. A newer Beads binary may introduce schema/API behavior that the current Gas City stable line has not certified.

SmartAIHub SHALL maintain a compatibility matrix instead of assuming:

```text
latest Gas City
+
latest Beads
=
supported
```

Before changing any Gas City/Beads/Dolt component against an existing store:

```text
identify every client using the store
drain or quiesce writers
verify backup/snapshot
record current binary + schema versions
verify target compatibility tuple
acquire store maintenance lease
perform migration only if explicitly required/supported
run post-migration integrity + read/write probes
only then admit writers
```

If a migration advances store/schema state beyond what the previous client can read, older incompatible clients MUST remain blocked.

Rollback policy MUST distinguish:

```text
binary rollback with unchanged compatible schema
vs
binary rollback after schema/data migration
```

The latter requires a tested data restore/downgrade procedure; reinstalling an older `gc`, `bd`, or Dolt binary is insufficient.

Fresh SmartAIHub-managed profiles SHOULD prefer dedicated stores to minimize unrelated-client coordination risk.

## 62B. Store Growth / Compaction / Retention SLO

A managed Gas City work store SHALL have explicit growth budgets.

Monitor at minimum:

```text
database/data-dir bytes
event rows
closed/ephemeral work rows
session rows
commit/history growth where applicable
query p50/p95/p99
compaction age
backup age
```

Define thresholds:

```text
warning
admission_degraded
maintenance_required
write_blocked_if_integrity_at_risk
```

Closed ephemeral orchestration/session history SHALL have a documented retention policy.

A store is not considered healthy merely because the process answers TCP/queries; unbounded growth causing discovery/reconcile queries to exceed control-loop SLO is a degraded control plane.

Compaction/pruning MUST preserve the SmartAIHub evidence/audit records SmartAIHub owns; Gas City local history is not the sole canonical audit source.

## 62C. Store Backup / Restore / Recovery Contract

Managed Dolt/Beads deployments SHALL define:

```text
RPO
RTO
backup cadence
backup destination
backup encryption/ACL
integrity verification
restore drill cadence
```

Before destructive compaction/schema migration:

```text
verified backup
restore point id
store generation
schema version
```

are captured.

Restore requires:

```text
drain/quiesce writers
verify no competing store process
restore to isolated path where practical
integrity/schema check
publish new generation/endpoint
reconcile child sessions
```

A backup that has never passed a restore test does not satisfy production recovery readiness.

## 62D. Empty / Missing Store Fail-Closed Recovery

If a configured managed store unexpectedly appears empty/missing/corrupt while backup/history indicates prior state existed, SmartAIHub SHALL NOT silently start a long auto-import/reinitialize path during ordinary job dispatch.

Classify:

```text
STORE_STATE_MISSING
STORE_IMPORT_REQUIRED
STORE_RECOVERY_REQUIRED
```

Pause new Managed City placement and require a bounded recovery workflow.

Existing running agents that do not need the unavailable metadata MAY continue only if correctness policy permits.

This prevents repeated multi-minute auto-import attempts from making every dispatch appear hung.


# 63. Gas City Full-City Restart Semantics

A full controller/city restart is a high-impact runtime event.

SmartAIHub SHALL receive:

```text
city_restart_requested
city_restart_started
affected_sessions
city_restart_completed
reconciliation_result
```

The parent route attempt is not automatically failed if all child sessions reconcile safely.

---

# 64. Gas City Intentional Stop vs Crash

SmartAIHub SHALL explicitly mark intentional stop intent.

Otherwise a controller may interpret a dead session as crash and resurrect it.

Every stop carries:

```text
effect_intent_id
generation
reason
no_resurrect flag/policy
```

Postcondition verification follows Spec 210 semantics.

---

# 65. Gas City Provider Health

Health is multidimensional:

```text
bridge_health
controller_health
store_health
provider_health
session_start_health
process_liveness_health
prompt_transport_health
reconcile_health
cleanup_health
```

Composite:

```text
READY
READY_WITH_LIMITATIONS
DEGRADED
UNAVAILABLE
BLOCKED
```

---


## 65A. Gas City Metrics / Telemetry Policy

Gas City releases may include privacy-scoped command-usage telemetry and local controls/environment opt-outs.

SmartAIHub managed deployment SHALL:

- document whether Gas City telemetry is enabled;
- apply organization/user privacy policy using supported Gas City controls;
- prefer deterministic managed configuration rather than relying on interactive disclosure state;
- never infer SmartAIHub telemetry consent from Gas City telemetry consent or vice versa;
- not forward SmartAIHub prompts, paths, file contents or secrets through custom telemetry hooks;
- record the effective telemetry mode in runtime diagnostics.

Where policy requires no vendor telemetry, the managed profile SHALL apply the supported opt-out controls and verify them during certification.



## 65B. Canonical Runtime Observation Adapter

Gas City upstream may have multiple process-introspection code paths with different platform behavior.

SmartAIHub Bridge SHALL normalize process/runtime observation into one certified interface:

```text
runtime_exists
provider_process_alive
pid/process identity
start time / incarnation
command/executable digest where available
cwd
descendant summary
surface/attach state
observation source
observation timestamp
confidence/freshness
```

Provider-specific `IsRunning`, OS process scans, tmux panes, Kubernetes pod state and other sources are observations into this model.

No destructive reconciliation rule may use a platform-specific process probe whose semantics have not passed the target OS/provider conformance matrix.


# 66. Gas City Session Runtime Certification

Certification tuple includes:

```text
gas_city_version
bridge_version
provider type/version
OS/arch
agent implementation
agent version
ACP version if used
store mode/version if used
workspace mode
```

Do not certify “Gas City” globally.

Certify tuples.

---

# 67. Gas City `exec` Provider

Gas City's exec provider can delegate runtime operations to an external script.

SmartAIHub MAY use this in either direction:

## 67.1 Gas City → SmartAIHub Runtime

A Gas City managed city may invoke a controlled SmartAIHub-provided session script.

This can allow Gas City formulas/pools to use existing Runner adapters without duplicating provider launch logic.

## 67.2 SmartAIHub → Gas City Runtime

SmartAIHub generally SHOULD use the Bridge API rather than wrapping every call through exec provider.

Use exec provider when it improves portability or avoids a custom Go integration for a provider.

All scripts use structured stdin/stdout and strict argument/path validation.

---

# 68. Gas City Kubernetes Provider

Kubernetes execution MAY be enabled for managed enterprise/cloud environments.

Requirements:

```text
namespace isolation
service account
pod security
resource requests/limits
network policy
secret projection
workspace volume policy
artifact ingress/egress
pod identity
cleanup TTL
job/attempt labels
```

Gas City Kubernetes provider does not replace SmartAIHub cloud scheduling policy.

---


## 68A. Kubernetes Prompt-Delivery Proof

Gas City Kubernetes-provider session creation SHALL separate:

```text
pod/process started
from
initial task prompt delivered
```

A healthy pod/session does not prove `PromptFlag` / `PromptSuffix` / equivalent initial work payload reached the agent.

The Bridge SHALL require prompt-delivery evidence appropriate to the certified provider/agent combination before reporting `TURN_SUBMITTED` / work claimed.

If startup succeeds but initial prompt evidence is absent:

```text
GASCITY_PROMPT_DELIVERY_UNPROVEN
```

The system reconciles/retries only under duplicate-safe rules.

This guard is mandatory for Kubernetes provider tuples until their certified regression suite proves the relevant prompt-delivery path.



## 68B. Kubernetes Persistence / Eviction Contract

Gas City Kubernetes execution SHALL explicitly classify every runtime surface as:

```text
EPHEMERAL
RECONSTRUCTIBLE
PERSISTENT_REQUIRED
```

At minimum evaluate:

```text
Gas City/Beads store
workspace/worktree
ACP/provider session metadata
context package
artifacts/results
temporary terminal/process state
logs/evidence required for reconciliation
provider credentials/secrets
```

Pod restart/eviction semantics SHALL be tested.

A pod disappearing means:

```text
runtime observation lost
```

not automatically:

```text
task failed
work unclaimed
safe to launch duplicate writer
```

The controller must reconcile persistent store/workspace/provider side effects before replacement.

## 68C. Kubernetes Pod Identity / Restart Generation

Record:

```text
pod UID
pod/container restart count
runtime generation
workspace volume identity
delegation generation
```

A replacement pod using the same human-readable name is a new runtime incarnation.

Late events/logs/results from an old pod UID cannot settle the current route.

## 68D. Kubernetes Credential Rotation

Provider/API/MCP credentials projected into pods SHALL have explicit rotation semantics.

If a credential changes:

```text
new pods receive new epoch
existing pods either refresh through certified path
or drain/restart
```

Never assume mounted/injected credentials refresh inside a long-running process unless verified.

Credential epoch is included in route/session binding.


# 69. Gas City tmux Provider

tmux is suitable for local/headless Unix development environments.

Requirements:

```text
session namespace
no human-label identity
process liveness independent from pane visibility
controlled shell bootstrap
bounded logs
cleanup verification
```

Windows native Runner SHALL not assume tmux availability.

---


## 69A. Runtime Startup Blocker Classification

A terminal/session process being present is not equivalent to an agent being ready.

Gas City tmux/subprocess routes SHALL detect typed startup blockers such as:

```text
AUTH_REQUIRED
WORKSPACE_TRUST_REQUIRED
MCP_TRUST_REQUIRED
TERMS_OR_LICENSE_REQUIRED
UPDATE_PROMPT
MODEL_UNAVAILABLE
PERMISSION_DIALOG
```

A project-scoped MCP trust prompt or equivalent interactive blocker MUST NOT be auto-accepted by generic "dismiss startup dialog" logic.

Default managed behavior for new MCP trust:

```text
pause / fail closed
→ surface exact MCP server identity + provenance to SmartAIHub
→ obtain policy/user approval
→ configure trusted path using supported provider mechanism
→ restart/resume safely
```

Repeated `failed-create → recreate` loops caused by an interactive blocker SHALL trip a startup circuit breaker rather than continuously respawn the agent.


# 70. Gas City Subprocess Provider

Subprocess provider is attractive for managed single-host server execution.

Use when:

```text
interactive tmux not needed
process supervision sufficient
agent supports structured/headless mode
```

Runner/Gas City must still distinguish process exit from logical task completion.

---

# 71. Gas City ACP Provider

Gas City ACP provider can host ACP-based sessions.

Valid architecture:

```text
SmartAIHub
→ Gas City Runtime Adapter
→ Gas City ACP Provider
→ ACP Agent
```

Use when Gas City supervision/pooling/reconciliation benefits justify the layer.

For simple direct sessions prefer:

```text
SmartAIHub
→ ACP Agent
```

to reduce failure surface.

---


## 71A. Gas City ACP Provider Process-Custody Guard

Current Gas City ACP provider implementations have had failure modes where a pool session is logically drained/closed while the underlying ACP provider process remains alive and idle.

Therefore a Gas City `drain-ack`, bead/session closure, or logical session settlement SHALL NOT by itself prove provider process cleanup.

The Bridge SHALL maintain and verify:

```text
Gas City session id
ACP provider process identity
process incarnation/generation
child/descendant process tree
active ACP session(s)
last activity
drain/close intent
postcondition
```

After drain/close:

```text
logical session settled
+
ACP/provider process terminated or explicitly re-owned
+
background tasks/terminals settled
```

is required before the runtime slot is considered physically free.

A leaked provider process becomes:

```text
GASCITY_PROVIDER_PROCESS_LEAK
```

and consumes capacity until remediated.


# 72. Double-Wrapping Prevention

Route resolver SHALL detect redundant composition.

Disallowed unless explicitly justified:

```text
SmartAIHub ACP Client
→ Gas City ACP bridge
→ another ACP proxy
→ agent
```

Each layer must add declared value.

Route snapshot records all proxy layers.

Max proxy depth SHALL be bounded.

---

# 73. Workspace Model

Every route receives:

```text
workspace_binding_id
project_id
repo_id where applicable
cwd
additional directories
write mode
base revision
asset mount
```

ACP effective filesystem roots and Gas City rig/session roots SHALL be derived from this canonical workspace binding.

---


## 73A. Pool Slot Workspace Uniqueness

Concurrent Gas City pool instances MUST NOT derive their writable workspace/worktree path from template base name alone.

Canonical workspace allocation SHALL include a unique SmartAIHub/Gas City session or slot identity:

```text
workspace_binding_id
delegation_id
pool/template identity
pool slot/session generation
```

Before starting a second writer, Runner/Bridge verifies:

```text
canonical path unique
Git worktree registry unique
no active writer ownership conflict
no stale symlink/path alias collision
```

Two live agent sessions resolving to the same writable worktree path is a hard route failure:

```text
GASCITY_WORKSPACE_COLLISION
```

This invariant applies even if the upstream template variable system later fixes a known collision class.


# 74. Non-Git Tasks

Spec 211 SHALL support non-code/non-Git tasks.

Examples:

```text
media edit
document transformation
research processing
data analysis
asset generation orchestration
```

Use:

```text
job scratch workspace
asset materialization
ACP agent or managed runtime
SmartAIHub Skills
artifact verification
Library upload
```

Gas City Managed City SHOULD be used only when its multi-agent runtime provides actual value.

---

# 75. Context Package

Reuse Spec 210 Context Package:

```text
manifest
task
selected specs
retrieved context
assets
policy instructions
```

ACP prompts SHOULD reference scoped local context rather than duplicate huge text payloads when practical.

---

# 76. Asset Handling

Canonical:

```text
AssetRef
→ authorization
→ Runner materialization
→ workspace/ACP content reference
→ agent
→ output
→ verification
→ Library
```

ACP embedded images/resources MAY be used when size/policy permit.

Large media stays file/AssetRef based.

---

# 77. Result Normalization

Regardless of route:

```json
{
  "outcome": "succeeded",
  "summary": "...",
  "artifacts": [],
  "workspace_result": {},
  "verification": {},
  "usage": {},
  "runtime_route": {},
  "provider_result_ref": null
}
```

Gas City internal task completion or ACP prompt response does not alone mean SmartAIHub job completed.

---

# 78. Canonical State Machine

Reuse shared Spec 200 state model.

Typical structured ACP path:

```text
QUEUED
ASSIGNED
RUNTIME_PREPARING
RUNTIME_READY
AGENT_STARTING
AGENT_READY
TURN_SUBMITTED
TURN_STARTED
RUNNING
WAITING_FOR_USER / APPROVAL
RESULT_STAGED
VERIFYING
COMPLETED
```

Recovery:

```text
DEGRADED
RECONCILING
CANCEL_REQUESTED
CANCEL_CONFIRMED
UNKNOWN_OUTCOME
FAILED
TIMED_OUT
QUARANTINED
```

Gas City-specific details belong in `phase_detail`.

---

The labels above are Spec 211 attempt/phase details, not a replacement Job
state machine. They MUST be stored or projected as bounded phase metadata while
the canonical Feature 195 Job status remains one of:

```text
pending
queued
leased
running
waiting_external
retry_scheduled
succeeded
failed
cancelled
expired
```

For example, `RUNTIME_PREPARING`, `AGENT_READY`, `RESULT_STAGED`,
`VERIFYING`, `TIMED_OUT` and `UNKNOWN_OUTCOME` MUST map to the existing Job
status plus attempt/phase detail and error/reconciliation fields. They MUST NOT
be added to `CANONICAL_JOB_STATUSES` implicitly, and a vendor/runtime phase
MUST NOT settle a SmartAIHub Job without the shared Job transition and effect
receipt.

# 79. Durable Job Binding

`worker_jobs` remains source of truth.

Conceptual runtime metadata:

```json
{
  "agent_protocol": "acp_v1",
  "session_runtime": "gascity",
  "agent_implementation": "claude_agent_acp",
  "acp": {
    "protocol_version": 1,
    "session_id": "..."
  },
  "gascity": {
    "city_runtime_id": "...",
    "session_id": "...",
    "provider": "acp"
  }
}
```

No ACP/Gas City id replaces `worker_job_id`.

---

# 80. Event Ordering

All normalized events use:

```text
worker_job_id
route_attempt_id
event_id
sequence
generation
timestamp
protocol/runtime identity
```

ACP notification order and Gas City event order are observations.

SmartAIHub durable event sequence remains authoritative.

---


## 80A. Cross-Layer Event Priority Lanes

ACP and Gas City can both generate high-volume streams.

The unified Runner event pipeline SHALL reserve capacity for:

```text
P0 AUTHORITATIVE:
  generation/state settlement
  cancellation/revocation
  approval request/result
  capability side-effect receipt
  artifact commit
  final result/failure

P1 CONTROL_PROGRESS:
  session created
  task claimed/released
  child started/stopped
  runtime degraded

P2 USER_PROGRESS:
  plan/status/text summaries

P3 EPHEMERAL:
  token/text deltas
  terminal chunks
  debug traces
```

P3 congestion MUST NOT block P0/P1 admission.

Dropped/coalesced lower-priority events expose counters so diagnostics can distinguish "no event occurred" from "event stream sampled".


# 81. Reconciliation Authority

Order of authority:

```text
1. SmartAIHub durable desired state + fencing generation
2. current active route/delegation record
3. verified runtime/process/session observations
4. ACP/Gas City local metadata
5. transcript/UI heuristic
```

A vendor/runtime local state cannot resurrect a stale attempt.

---

# 82. Restart/Reconnect

On Runner restart:

```text
load local durable state
fetch server desired state
probe ACP agent processes
probe Gas City bridge/controller
discover sessions
match canonical bindings
adopt/fence/quarantine
replay/summarize missing events
resume
```

No blind recreation.

---

# 83. Protocol/Runtime Crash Matrix

Examples:

```text
ACP agent process dies, Gas City alive
→ Gas City/Runner reconcile agent session

Gas City bridge dies, ACP child alive
→ fence/control recovery before replacement

Gas City controller dies, child processes alive
→ adopt according to delegation lease

Runner disconnects, Gas City + ACP continue
→ server marks unverifiable; reconnect/reconcile

SmartAIHub backend restarts
→ durable worker_jobs + Runner reconciliation
```

---

# 84. Cancellation Ownership

SmartAIHub cancellation is authoritative intent.

Sequence:

```text
mark CANCEL_REQUESTED
revoke new child work
send ACP cancel if active
ask Gas City drain/interrupt/stop if applicable
verify processes/background tasks
revoke capability authority
reconcile external effects
settle
```

---

# 85. Duplicate Execution Prevention

A route change is allowed immediately only before execution is proven to have begun.

If ACP/Gas City state is ambiguous:

```text
RECONCILE_REQUIRED
```

before fallback.

Do not launch a second writer merely because:

```text
ACP connection dropped
Gas City session list is stale
controller restarted
prompt response timed out
```

---


## 85A. Cross-Runtime Ownership Handoff

Fallback/migration between:

```text
direct ACP
Gas City ACP
Orca
Native Structured
Generic PTY
```

SHALL NOT reuse the same logical provider session concurrently unless the handoff is explicitly certified.

Canonical handoff:

```text
freeze old route input
→ fence old route generation
→ collect session/process/background-task state
→ settle/cancel/detach old execution authority
→ verify workspace writer ownership
→ build handoff context
→ create/adopt new route
→ publish new generation
```

If the old route still owns a writer/background task and cannot be fenced:

```text
RUNTIME_HANDOFF_BLOCKED
```

and fallback waits/reconciles.

A provider conversation id alone does not transfer execution ownership.

## 85B. Handoff Context Integrity

When cross-runtime continuation cannot preserve provider-native session state, SmartAIHub SHALL generate a bounded handoff package containing:

```text
task goal
completed work summary
workspace/base/current revision
uncommitted changes inventory
artifacts
pending approvals/questions
known external side effects
verification state
remaining work
```

The package is evidence-backed and versioned.

The new route must not be told that uncertain/unknown work definitely completed.


# 86. Idempotency

Stable identities:

```text
job intent id
route attempt id
prompt turn id
capability invocation id
artifact commit id
approval id
effect intent id
delegation id
```

Retries reuse identities where semantically the same operation is being recovered.

---

# 87. Approval

One shared Approval Service.

Sources may include:

```text
ACP permission request
provider-native permission
Gas City formula step
SmartAIHub capability
Git side effect
Computer Use
deployment
publish
financial operation
```

Runtime permission confirmation cannot bypass SmartAIHub denial.

---


## 87A. Approval Revalidation at Effect Boundary

Approval is not permanently valid merely because the user clicked Allow.

Immediately before executing the approved side effect, SmartAIHub SHALL revalidate:

```text
approval digest
route generation
session/account binding
workspace binding
tool/capability identity
normalized arguments hash
current policy/revocation epoch
expiry
```

If any material input changed:

```text
APPROVAL_STALE
```

and execution requires a new approval or policy decision.

This protects ACP/Gas City flows where a tool call may remain queued while state changes elsewhere.


# 88. Security Trust Profiles

Reuse Spec 210:

```text
USER_MANAGED_TRUSTED
SMARTAIHUB_MANAGED_RESTRICTED
SMARTAIHUB_MANAGED_ISOLATED
```

Route resolver considers whether ACP/Gas City provider satisfies required isolation.

---

# 89. Multi-Tenant Isolation

Shared runtime requirements:

```text
workspace isolation
provider credential isolation
ACP session isolation
Gas City state/profile isolation
capability token isolation
asset/cache namespace isolation
logs/audit ACL
```

A Gas City city/profile is not by itself a tenant security boundary.

---


## 89A. Tenant-Scoped Runtime Temporary State / Cache

SmartAIHub-managed ACP/Gas City execution SHALL namespace temporary/runtime caches by the appropriate isolation domain.

Examples:

```text
context-package temp files
ACP transcript/cache mirrors
provider session indexes
Gas City pack/provider cache
downloaded agent adapters
worktree temp metadata
MCP capability-proxy config
diagnostic bundles
```

Shared immutable binary/package caches MAY be reused across tenants only when content-addressed and free of tenant credentials/content.

Mutable caches containing:

```text
paths
session ids
prompts
tenant/project metadata
credentials
provider account state
```

must be tenant/profile scoped.

GC/cleanup verifies that one tenant cannot enumerate another tenant's cached session/context metadata.


# 90. Network Policy

Direct ACP stdio requires no public listener.

Gas City bridge defaults local-only.

Kubernetes/remote execution uses controlled private networking.

Agent network egress is governed by trust profile.

---

# 91. Secret Policy

Secrets SHALL NOT appear in:

```text
ACP prompt
Gas City bead description
formula prompt
runtime labels
ordinary logs
UI diagnostics
```

Credentials use:

```text
provider-native store
secret reference
environment injection
scoped proxy
```

depending on provider.

---

# 92. Supply Chain

Pin/record:

```text
ACP SDK
ACP schema artifact
claude-agent-acp
codex-acp
provider SDK/CLI
Gas City
Gas City Bridge
packs
runtime scripts
Kubernetes images
```

For each:

```text
source
version
digest
license
signature/attestation where available
SBOM where available
certification state
```

---

# 93. Upgrade Coordination

A runtime upgrade SHALL acquire maintenance lease.

No in-place replacement under active bound attempts unless supported and certified.

ACP adapter and Gas City upgrades are independent.

A compatible Gas City upgrade does not imply ACP adapter compatibility and vice versa.

---


## 93A. Upgrade Drain vs Session Compatibility

ACP adapter/Gas City upgrades SHALL classify active sessions as:

```text
FINISH_ON_OLD_RUNTIME
RESUMABLE_ON_NEW_RUNTIME
MUST_DRAIN
MUST_CANCEL_WITH_APPROVAL
```

Do not assume a persisted ACP/Gas City session can be adopted by the new binary/SDK merely because both versions support the same protocol number.

Compatibility tests SHALL cover:

```text
old process + new Runner
new process + old persisted metadata
resume/session history compatibility
store/schema compatibility
account/model configuration compatibility
```

If adoption is not certified, the old runtime remains available until bounded drain or explicit operator action.



## 93B. Runtime / Store Maintenance Mode

SmartAIHub SHALL expose a durable maintenance state for ACP/Gas City managed infrastructure.

Modes:

```text
NORMAL
DRAINING
MAINTENANCE_READ_ONLY
MAINTENANCE_OFFLINE
RECOVERING
```

While draining/maintenance:

- no new route is admitted to affected runtime/store;
- existing jobs follow the declared drain policy;
- approval/cancel/reconcile traffic remains available where safe;
- upgrade/migration/restore/compaction actions record effect intents;
- completion of maintenance requires health + compatibility revalidation before returning to `NORMAL`.

Maintenance state is visible in route eligibility and UI; it is not merely an operator convention.



## 93C. Scoped Repair / Doctor Convergence Contract

Automated repair such as `gc doctor --fix` or equivalent SHALL be treated as a bounded mutation workflow.

SmartAIHub SHALL:

1. scope repair to the managed profile/city;
2. snapshot pre-repair diagnostics;
3. preview or record expected mutations where possible;
4. execute under maintenance lease;
5. run diagnostics again;
6. compare remaining/new findings;
7. limit repair passes;
8. require operator action if convergence is not achieved.

Repair success means:

```text
post-repair invariants pass
```

not merely `doctor --fix` exiting zero once.

Never run repair against unrelated user-managed cities simply to make the SmartAIHub city start.


# 94. Capability Registry

Runner publishes:

```json
{
  "agent_protocols": {
    "acp_v1": {
      "status": "ready",
      "agents": {
        "claude": {"implementation": "claude-agent-acp"},
        "codex": {"implementation": "codex-acp"}
      }
    }
  },
  "session_runtimes": {
    "direct_runner": {"status": "ready"},
    "gascity": {
      "status": "ready",
      "providers": ["acp", "subprocess", "tmux"]
    },
    "orca": {"status": "ready"}
  }
}
```

Advertisement never grants tenant permission.

---

# 95. Runtime Route Scoring

Candidate route scoring MAY consider:

```text
required features
structure/reliability
isolation
health
latency
startup cost
resource footprint
account availability
provider limits
resume compatibility
workspace constraints
user preference
economic policy
```

Example:

```text
single Codex session
ACP direct scores higher than Gas City+ACP

20-agent code review fleet
Gas City+ACP may score higher

Antigravity local
Orca may be only certified route
```

---

# 96. User Route Policy

User-visible choices:

```text
Auto
SmartAIHub
Claude
Codex
Antigravity
Other registered agent
```

Advanced settings:

```text
Prefer structured protocol
Prefer local
Prefer isolated
Prefer Gas City fleet
Prefer Orca
Require specific Runner
```

Ordinary users SHOULD NOT need to understand ACP protocol or Gas City provider names.

---

# 97. AI Workflow Studio Integration

Spec 209 External Agent node gains:

```text
logical_agent
execution_strategy
parallelism/fleet policy
runtime preference
model/effort
workspace mode
budget
approval
fallback
```

Possible strategy:

```text
single_agent
parallel_review
managed_agent_fleet
bounded_software_factory
```

`bounded_software_factory` may select Gas City Managed City.

---

# 98. Managed Agent Fleet Node

For - https://github.com/agentclientprotocol/agent-client-protocol/issues/1979
- https://github.com/agentclientprotocol/rust-sdk/issues/323
- https://github.com/agentclientprotocol/rust-sdk/pull/341
- https://github.com/agentclientprotocol/rust-sdk/pull/338
- https://github.com/agentclientprotocol/codex-acp/issues/492
- https://github.com/agentclientprotocol/codex-acp/issues/495
- https://github.com/agentclientprotocol/codex-acp/issues/459

- https://github.com/agentclientprotocol/claude-agent-acp/issues/830
- https://github.com/agentclientprotocol/codex-acp/issues/516
- https://github.com/agentclientprotocol/codex-acp/issues/506
- https://github.com/agentclientprotocol/agent-client-protocol/issues/1694
- https://github.com/agentclientprotocol/agent-client-protocol/pull/2114

- https://github.com/agentclientprotocol/claude-agent-acp/issues/976
- https://github.com/agentclientprotocol/claude-agent-acp/issues/994
- https://github.com/agentclientprotocol/claude-agent-acp/issues/876
- https://github.com/agentclientprotocol/claude-agent-acp/issues/866
- https://github.com/agentclientprotocol/claude-agent-acp/issues/851
- https://github.com/agentclientprotocol/claude-agent-acp/issues/1024

- https://github.com/agentclientprotocol/claude-agent-acp/issues/955
- https://github.com/agentclientprotocol/claude-agent-acp/issues/1011
- https://github.com/agentclientprotocol/claude-agent-acp/issues/1014
- https://github.com/agentclientprotocol/claude-agent-acp/issues/680
- https://github.com/agentclientprotocol/claude-agent-acp/issues/654
- https://github.com/agentclientprotocol/claude-agent-acp/issues/902
- https://github.com/agentclientprotocol/codex-acp/issues/489

Gas City:

```text
Workflow Node
→ one parent worker_job
→ Gas City delegation
→ bounded child sessions
→ synthesis/result
→ verifier
```

UI SHALL expose:

```text
fleet size
agents/providers
active sessions
work summary
attention
cost
artifacts
verification
```

not internal Beads by default.

---

# 99. Cross-Spec Amendments

## 99.1 Spec 200

Add:

> Spec 211 owns protocol/runtime composition inside the native External Agent execution plane. ACP, Gas City, Native Structured, Orca and Generic PTY normalize into Spec 200 Agent Task/session/event/result contracts.

## 99.2 Spec 206

Add:

> A2A remains the first interoperability routing decision. ACP is a local/client-to-agent structured protocol used inside the Spec 200 native route and does not replace A2A for remote agent interoperability.

## 99.3 Spec 210

Add:

> Spec 210 remains the Orca/CLI runtime profile. Spec 211 lifts route composition into a broader Runtime Fabric and may prefer ACP or Gas City when their structured/session semantics better satisfy the task. All Spec 210 reliability invariants remain applicable to CLI/PTY/process/workspace/cleanup boundaries.

## 99.4 Spec 209

Add:

> Workflow nodes select logical execution requirements; they do not persist ACP session IDs, Gas City session/bead IDs, Orca pane IDs or other transient runtime identities.

## 99.5 Spec 199

Add:

> ACP/Gas City agents receive SmartAIHub-governed capabilities; external MCP upstream access remains owned by Spec 199.

## 99.6 Spec 208

Add:

> Computer Use requested by ACP/Gas City agents remains governed by Spec 208. Runtime local terminal capability does not grant unrestricted GUI/browser control.

---

# 100. Database / Durable Model

Prefer extending existing execution-attempt structures.

Conceptual route attempt fields:

```text
agent_protocol
protocol_version
session_runtime
runtime_provider
agent_implementation
agent_version
account_binding_id
workspace_binding_id
route_policy_snapshot
runtime_metadata
certification_snapshot
```

Optional subordinate records:

```text
agent_protocol_sessions
runtime_session_bindings
managed_runtime_delegations
```

All reference:

```text
worker_job_id
route_attempt_id
```

No second job table is created.

---

# 101. Managed Delegation Record

Conceptual:

```json
{
  "delegation_id": "dlg_...",
  "worker_job_id": "job_...",
  "route_attempt_id": "rat_...",
  "runtime": "gascity",
  "generation": 4,
  "state": "ACTIVE",
  "limits": {
    "max_sessions": 8,
    "max_depth": 2,
    "expires_at": "..."
  }
}
```

Transitions:

```text
PENDING
ACTIVE
DRAINING
REVOKED
SETTLED
RECONCILING
UNKNOWN
```

---

# 102. Runner Module Layout

Recommended conceptual structure:

```text
runner/
  agent_runtime/
    protocol/
      adapter
      acp/
        client
        process
        initialize
        capabilities
        auth
        session
        prompt
        permissions
        filesystem
        terminal
        events
        extensions
        diagnostics
      native/
      cli/
    session_runtime/
      provider
      direct/
      gascity/
        bridge_client
        install
        probe
        provider_registry
        session_binding
        managed_city
        delegation
        reconcile
        health
        diagnostics
      orca/
      pty/
    routing/
      route_matrix
      eligibility
      scoring
      reservations
    shared/
      workspace
      context_package
      assets
      capability_proxy
      approvals
      verification
      evidence
```

---

# 103. Gas City Bridge Packaging

Suggested:

```text
smartaihub-gascity-bridge
```

Properties:

```text
small local binary/service
Go
pinned Gas City dependency
SmartAIHub-owned IPC schema
no public listener
least privilege
structured logs
health endpoint/message
version negotiation
```

Runner and bridge handshake:

```text
bridge_contract_version
gascity_version
provider capabilities
feature flags
```

---

# 104. ACP Client SDK Choice

SmartAIHub Runner implementation SHOULD use an official ACP SDK appropriate to Runner language.

If Runner is Rust:

```text
official Rust ACP SDK
```

is preferred.

If integration resides in Node/TypeScript sidecar:

```text
@agentclientprotocol/sdk
```

is acceptable.

Do not introduce a second language runtime merely for ACP unless operational benefits justify it.

---

# 105. ACP Schema Handling

Pin generated schema/SDK versions.

Protocol parser SHALL:

```text
reject malformed required fields
accept permitted extensibility
bound message size
bound metadata
validate JSON-RPC ids/methods
prevent unbounded buffering
```

Unknown negotiated-safe extension fields may be preserved.

---

# 106. Backpressure

ACP streaming/session updates can be high-volume.

Classify:

```text
AUTHORITATIVE
DURABLE_PROGRESS
EPHEMERAL_STREAM
```

Terminal/output/text deltas should not saturate durable `worker_job_events`.

Aggregate/sample noisy streams.

Never drop:

```text
permission requests
terminal lifecycle
file-change finalization
turn completion
failures
usage settlement
```

---

# 107. Usage and Cost

Spec 211 emits:

```text
route attempt duration
agent/provider/model where known
token/usage where exposed
Gas City child session runtime
Runner compute
capability calls
verification
storage/transfer
```

Billing remains shared-platform responsibility.

Gas City child session usage must roll up to parent route attempt without double-counting.

---


## 107A. Usage Settlement / Counter Semantics

Provider and ACP adapters may report:

```text
per-request usage
per-turn usage
session cumulative usage
rolling/background-task usage
```

SmartAIHub SHALL record the semantic kind with every usage sample.

Usage ledger normalization uses stable sample identity:

```text
route_attempt_id
session_id
turn_id/background_task_id
provider usage sequence/timestamp
usage_semantics
```

A cumulative counter is converted to a delta only against the previous trusted counter in the same generation/account/model context.

Counter reset, resume under a new process, model/account switch or out-of-order sample becomes:

```text
USAGE_RECONCILIATION_REQUIRED
```

rather than double charging or subtracting the wrong baseline.


# 108. Budget Enforcement

Aggregate budget includes:

```text
all route attempts
all managed child sessions
all SmartAIHub capability calls
all model/media/API usage
verification
compute/storage
```

Gas City internal retry/respawn cannot reset budget.

ACP subagents/background tasks consume the same delegated budget.

---

# 109. Observability

Correlate:

```text
chat_run_id
workflow_run_id
worker_job_id
route_attempt_id
runner_id
ACP process/session
Gas City bridge/city/session/provider
Gas City delegation
Orca ids if used
capability call
artifact
```

Metrics:

```text
acp_initialize_seconds
acp_session_start_seconds
acp_turn_seconds
acp_cancel_seconds
acp_protocol_error_total
gascity_session_start_seconds
gascity_reconcile_seconds
gascity_orphan_work_total
gascity_store_failure_total
runtime_fallback_total
route_reconcile_total
```

---

# 110. Evidence

High-risk execution bundle SHOULD include:

```text
route decision
protocol initialize snapshot
agent/runtime versions/digests
workspace binding
permission decisions
child-session census
capability calls
file/artifact hashes
cancel/cleanup effects
verification
```

---

# 111. UI — External Agent Runtime

Settings:

```text
AI Connections / External Agents
├ Claude
│  ├ ACP status
│  ├ direct/native status
│  └ Orca status
├ Codex
│  ├ ACP status
│  ├ native status
│  └ Orca status
├ Antigravity
│  └ Orca/native status
└ Runtime Infrastructure
   ├ ACP
   ├ Gas City
   └ Orca
```

---

# 112. UI — Gas City

Advanced Runtime Infrastructure card:

```text
Gas City
Status
Version
Bridge status
Available providers
Store health
Certified provider tuples
Managed City enabled?
Active delegated cities
Update
Repair
Diagnostics
```

Ordinary user does not edit `city.toml` directly.

---


## 112A. Gas City Store Operations UI

Advanced Runtime Infrastructure SHALL expose, when a managed store is in use:

```text
store backend
schema/client versions
store generation
size/growth trend
query latency health
last compaction/prune
last verified backup
maintenance state
recovery required flag
```

Actions such as:

```text
compact
migrate
restore
repair
switch backend
```

require scoped operator authority and preview the affected cities/sessions.

Ordinary users should see a concise health state, not raw Dolt internals.


# 113. UI — Runtime Decision Explanation

Job detail may show:

```text
Executor: Claude
Protocol: ACP
Runtime: Direct Runner
Reason: structured protocol available; single-agent task
```

or:

```text
Executor: Claude fleet
Protocol: ACP
Runtime: Gas City / Kubernetes
Reason: parallel 8-agent bounded review requested
```

Advanced details remain collapsible.

---

# 114. UI — Attention

Normalize:

```text
AUTH_REQUIRED
USER_INPUT_REQUIRED
APPROVAL_REQUIRED
RUNTIME_REPAIR_REQUIRED
STORE_DEGRADED
SESSION_ORPHANED
BUDGET_EXHAUSTED
NO_COMPLIANT_ROUTE
```

Avoid exposing raw Gas City/ACP exception text as the only explanation.

---

# 115. Error Taxonomy

Recommended additions:

```text
ACP_PROTOCOL_UNSUPPORTED
ACP_INITIALIZE_FAILED
ACP_CAPABILITY_MISSING
ACP_AUTH_REQUIRED
ACP_SESSION_NOT_FOUND
ACP_SESSION_BINDING_MISMATCH
ACP_MALFORMED_MESSAGE
ACP_AGENT_EXITED
ACP_PERMISSION_TIMEOUT
ACP_CANCEL_UNCONFIRMED

GASCITY_NOT_INSTALLED
GASCITY_BRIDGE_UNAVAILABLE
GASCITY_VERSION_UNCERTIFIED
GASCITY_PROVIDER_UNAVAILABLE
GASCITY_STORE_DEGRADED
GASCITY_STORE_UNAVAILABLE
GASCITY_SESSION_CREATING_STUCK
GASCITY_WORK_ORPHANED
GASCITY_POOL_ASSIGNMENT_STALE
GASCITY_RECONCILE_REQUIRED
GASCITY_DELEGATION_REVOKED
GASCITY_PROVIDER_EFFECT_UNPROVEN
GASCITY_PROVIDER_PROCESS_LEAK
GASCITY_PROMPT_DELIVERY_UNPROVEN
GASCITY_POOL_START_PIPELINE_STALLED
GASCITY_OBSERVATION_STALE
GASCITY_STORAGE_MIGRATION_REQUIRED
GASCITY_STORAGE_DOWNGRADE_UNSAFE

ACP_EFFECTIVE_POLICY_MISMATCH
ACP_REGISTRY_PROVENANCE_UNVERIFIED
ACP_ADAPTER_BREAKING_CHANGE
ACP_USAGE_SEMANTICS_UNKNOWN
ACP_PROTOCOL_CHANNEL_CONTAMINATED
ACP_FRAME_TOO_LARGE
ACP_BACKPRESSURE_EXCEEDED
ACP_REQUEST_RECEIPT_UNKNOWN
ACP_AUTH_EPOCH_MISMATCH
APPROVAL_CONTEXT_INCOMPLETE
APPROVAL_STALE
PROTOCOL_SUPPORTED_SDK_PATH_UNCERTIFIED
USAGE_RECONCILIATION_REQUIRED

GASCITY_WORK_OWNERSHIP_AMBIGUOUS
GASCITY_WORKSPACE_COLLISION
GASCITY_UNKNOWN_STATE_STUCK
GASCITY_RECONCILE_SPIN
GASCITY_STARTUP_BLOCKED
GASCITY_MCP_TRUST_REQUIRED
DEGRADED_CONTROL_LOOP
ACP_CONNECTION_HOL_BLOCKED
ACP_UPDATE_VARIANT_UNCERTIFIED
ACP_HISTORY_REPLAY_PARTIAL
ACP_USER_RESPONSE_DELIVERY_UNKNOWN
STORE_ENDPOINT_STALE
STORE_STATE_MISSING
STORE_IMPORT_REQUIRED
STORE_RECOVERY_REQUIRED
STORE_GROWTH_LIMIT_EXCEEDED
STORE_COMPACTION_OVERDUE
STORE_BACKUP_STALE
STORE_PROCESS_LOCK_CONFLICT
STORE_POLICY_VALUE_UNKNOWN
MAINTENANCE_IN_PROGRESS
SESSION_ACTIVITY_UNKNOWN
SESSION_CONTEXT_EXHAUSTED
ACP_PERMISSION_LINEAGE_AMBIGUOUS
ACP_BACKGROUND_STOP_UNSUPPORTED
GASCITY_START_LEASE_CONFLICT
GASCITY_DUPLICATE_WORK_CLAIM
POOL_DEMAND_PARTIAL
GASCITY_SESSION_METADATA_STALE
SESSION_EFFECTIVE_CONFIG_MISMATCH
ACP_PROVIDER_CHILD_LEAK
ACP_SESSION_ORIGIN_UNKNOWN
ACP_RESPONSE_ORDER_VIOLATION
ACP_DUPLICATE_SEMANTIC_OUTPUT
ACP_CANCEL_STUCK
ACP_MCP_EFFECTIVE_CONFIG_MISMATCH
AUTHORITATIVE_READ_UNAVAILABLE
GASCITY_DISPATCHER_SCOPE_MISMATCH
GASCITY_SUPERVISOR_BINARY_MISMATCH
RUNTIME_HANDOFF_BLOCKED
K8S_RUNTIME_INCARNATION_CHANGED

ROUTE_COMPOSITION_UNSUPPORTED
ROUTE_PROXY_DEPTH_EXCEEDED
NO_COMPLIANT_ROUTE
```

---

# 116. Circuit Breakers

Breaker keys are narrow:

```text
ACP:
agent implementation + version + OS + protocol feature

Gas City:
version + provider + store mode + OS + feature

Route:
protocol/runtime tuple
```

Do not disable all Gas City because one provider fails.

Do not disable all ACP because one adapter version regresses.

---

# 117. Incident Overlay

SmartAIHub operations SHALL support runtime incident policies without code deploy:

```text
block codex-acp 1.12.0 on one OS
disable ACP session load
block Gas City k8s provider version
disable Gas City Managed City mode
force direct ACP for Claude
force Orca fallback for a specific agent
```

Overlay is audited, signed/authorized and expiry-aware.

---

# 118. Conformance Matrix

Required dimensions:

```text
Protocol:
  ACP v1
  optional ACP v2 experimental

ACP Agents:
  fake agent
  claude-agent-acp
  codex-acp

Runtime:
  direct_runner
  gascity/acp
  gascity/subprocess
  gascity/tmux where supported
  orca
  generic_pty

OS:
  Windows
  macOS
  Linux

Workspace:
  Git
  non-Git scratch
  additional directories
  large context
  assets

Lifecycle:
  new
  resume/load
  cancel
  restart
  reconcile
  cleanup
  user input
  permission
```

---

# 119. ACP Protocol Tests

Must test:

1. successful v1 initialize;
2. unsupported protocol;
3. capability negotiation;
4. auth-required;
5. session/new;
6. session/load when supported;
7. prompt and updates;
8. permission;
9. file read/write denial;
10. terminal lifecycle;
11. cancel;
12. agent crash;
13. malformed JSON-RPC;
14. duplicate ids/messages;
15. message size limits;
16. extension metadata;
17. workspace root enforcement;
18. session/account mismatch;
19. background tasks;
20. subagent extension fallback.
21. multi-session permission wait does not block unrelated session control on a certified shared-process tuple.
22. process/session density limits are enforced.
23. large-session resume reports replay completeness/partiality accurately.
24. replay notifications arriving before resume response are not lost.
25. async user response transport acceptance is not confused with agent consumption.
26. unknown SessionUpdate variant cannot settle a job or authorize an effect.
27. incoming JSON-RPC batch is bounded and member-correlated.
28. process crash blast radius matches declared multi-session topology.
29. connection HOL blocking is detected and stops new admission.
30. session replay after compaction/rewind rejects stale cursor/snapshot where applicable.
31. foreground turn settles while background subagent remains active; session remains non-quiescent.
32. out-of-turn permission from background shell/subagent is surfaced or explicitly denied rather than dropped.
33. concurrent parent/subagent permission requests are routed by tool/task lineage without ID desync.
34. follow-up prompt does not unintentionally cancel surviving background subagents under KEEP_BACKGROUND policy.
35. explicit cancel-all stops/fences background descendants or reports unsupported granularity.
36. resumed over-limit session enters context recovery rather than infinite prompt-too-long loop.
37. provider conversation reset increments continuation epoch and stale prior conversation is not resumed after restart.
38. process-level crash blast radius matches the certified session topology.
39. session completion UI does not show quiescent while known background work remains.
40. session-level request router remains alive for out-of-turn user/permission interactions.
41. resume with changed Skills/session-bound options changes session_config_epoch or recreates the provider query.
42. MCP environment/config fields survive full effective configuration reconstruction.
43. repeated resume/load does not accumulate unexplained provider child processes.
44. user session list excludes provider child/sidechain sessions by default.
45. API error/out-of-order response cannot be consumed by a newer request id/generation.
46. duplicate final provider response cannot double-complete or double-trigger downstream work.
47. stuck cancel escalates through bounded cancellation levels with postcondition verification.
48. adapter soak test reaches bounded process/RSS/file-descriptor steady state.
49. unknown-origin session is not automatically adopted for write-capable work.
50. cross-runtime handoff fences the prior route before the new route becomes authoritative.

---

# 120. Gas City Runtime Tests

Must test:

1. bridge startup;
2. provider discovery;
3. session start;
4. stop/interrupt;
5. process alive;
6. metadata;
7. reconcile;
8. controller restart;
9. orphan session;
10. intentional stop not resurrected;
11. stuck creating detection;
12. stale pool assignment;
13. store transient failure;
14. store corruption/version mismatch;
15. drain;
16. max pool;
17. delegation revocation;
18. provider switch under allowed policy;
19. unallowed provider rejected;
20. cleanup.
21. file-store profile runs without Dolt/Beads-specific dependencies where supported.
22. current-version required tmux/default-fallback dependencies are detected before admission.
23. two Dolt processes cannot acquire/start against one managed data dir.
24. store restart increments endpoint generation and stale child endpoint is detected.
25. compaction/retention thresholds degrade admission before query collapse.
26. verified backup can be restored in a drill.
27. unexpectedly empty/missing store fails closed instead of hidden auto-import loop.
28. policy-critical read failure is distinguishable from an absent/default value.
29. maintenance mode drains and prevents new route admission.
30. certification tests cannot reach production store through inherited environment.
31. active provider-start lease cannot be overwritten by stale creating projection.
32. concurrent workers cannot both claim the same exclusive work item.
33. fan-out child/bookkeeping records do not inflate pool demand incorrectly.
34. multi-rig pool demand includes all declared source rigs or reports partial demand.
35. fresh wake creates a new provider conversation/continuation epoch when configured.
36. killed runtime with stale active metadata is detected before wake short-circuits.
37. canonical process observation behaves consistently across certified OS/provider tuples.
38. pool assignment/admission is fenced when process liveness is unknown.
39. provider start lease expiry cannot resurrect a stale generation.
40. session reset/kill/wake postconditions include both runtime and persistent metadata state.
41. stale bd/REST projection cannot authorize reassignment without authoritative read barrier.
42. projection lag health degrades before cached state is used for destructive control.
43. graph-owned work cannot fall through to a dispatcher bound to the wrong store/rig.
44. managed pack/provider cache is validated/reseeded by generation after upgrade.
45. running supervisor executable digest/version matches the intended managed binary.
46. scoped doctor/repair converges or escalates after bounded passes.
47. Kubernetes pod eviction/restart does not launch a duplicate writer without reconciliation.
48. replacement pod UID is treated as new runtime incarnation.
49. Kubernetes credential rotation changes credential epoch and drains/reloads unsupported long-lived processes.
50. Gas City/Beads/Dolt release tuple is revalidated without assuming independently latest versions are compatible.

---

# 121. Cross-Layer Tests

Required:

```text
ACP direct Claude
ACP direct Codex
ACP via Gas City
CLI via Orca
Gas City child uses SmartAIHub Skill
Gas City child requests approval
Runner restart with Gas City child alive
ACP agent crash inside Gas City
Gas City bridge crash with agent alive
fallback before execution
fallback after ambiguous execution → reconciliation required
budget exhaustion during fleet
workflow cancel drains fleet
```

---

# 122. Fault Injection

Inject:

```text
ACP malformed packet
ACP pipe closes
ACP cancel ignored
ACP permission hangs
ACP server crashes
Gas City bridge crashes
Gas City controller crashes
store fails
provider start hangs
session stuck creating
dead session keeps assignment
Kubernetes pod disappears
network partition
Runner disconnect
backend restart
duplicate events
stale generation
disk full
clock skew
```

---

# 123. Security Tests

Required:

```text
ACP path traversal
symlink escape
unauthorized additional directory
permission bypass
malicious ACP extension metadata
malicious Gas City pack
malicious exec provider script
cross-tenant city/profile access
capability token reuse by child
child session exceeds delegation
secret printed to transcript
Kubernetes secret leakage
ambient SSH/Git credential access
direct upstream MCP bypass
runtime incident overlay unauthorized modification
```

---


## 123A. Test / Certification Environment Isolation

Gas City/Gas Town upstream history demonstrates that inherited store endpoint environment can cause tests or helper processes to connect to a live production store.

SmartAIHub conformance/fault/security tests SHALL therefore run with an explicit sanitized environment.

Requirements:

```text
dedicated temporary HOME/profile
dedicated workspace
dedicated Gas City registry/profile
dedicated store backend
production store endpoint variables scrubbed
production provider credentials absent unless test explicitly requires them
network policy preventing accidental production-store access
```

A test process MUST NOT be able to mutate a production Gas City/Dolt store merely by inheriting ambient endpoint variables.

Certification evidence records the isolated test-store identity.


# 124. Performance

Targets SHALL be defined by implementation SLOs.

Measure:

```text
ACP initialize latency
session startup
first agent event
Gas City bridge overhead
pool scaling
controller reconcile loop
event throughput
memory/session
CPU/session
store latency
cleanup
```

Direct ACP SHOULD demonstrably avoid unnecessary Gas City overhead for simple work.

---


## 124A. Gas City Control-Loop SLO and Backpressure

Managed City admission SHALL define control-loop health SLOs such as:

```text
desired-state build duration
store query latency
reconcile cycle duration
pool demand evaluation duration
session start queue delay
```

When city/rig/pool scale causes reconcile latency beyond the certified envelope:

```text
do not keep adding uncontrolled work
reduce admission / shed optional observation
surface DEGRADED_CONTROL_LOOP
```

SmartAIHub SHOULD prefer bounded/batched typed store reads over per-pool shell fan-out where the Bridge exposes such APIs.

## 124B. Progress-Aware Deadline Model

Long Gas City sweeps/orders and large reconciliation tasks SHALL distinguish:

```text
absolute_max_duration
idle/no-progress_timeout
per-operation timeout
```

A long-running operation that emits verifiable forward progress should not be killed solely because a city-size-dependent short wall-clock timeout expired.

Conversely, progress events that do not advance a bounded progress cursor cannot keep work alive forever.

Progress evidence SHALL be machine-verifiable where possible:

```text
items scanned
items settled
cursor advanced
child states changed
```


# 125. Scale

Design target:

```text
many Runners
multiple runtime types per Runner
many concurrent ACP sessions
bounded Gas City fleets
multi-project work
long-running jobs
```

Server must not persist raw streaming terminal/text deltas at full fidelity by default.

---

# 126. Capacity Admission

Before route start:

```text
Runner capacity
protocol adapter ready
agent implementation ready
runtime provider ready
workspace available
provider account usable
Gas City store/bridge healthy if selected
required isolation available
budget reserved
```

Managed City reserves aggregate child capacity or a bounded elastic envelope.

---

# 127. Fair Scheduling

Gas City internal pool scaling cannot bypass SmartAIHub tenant fairness.

Child capacity is charged against parent delegation.

Global fairness remains SmartAIHub scheduler responsibility.

---

# 128. Economic Isolation

A Gas City fleet from one tenant cannot consume another tenant's reserved runtime capacity or provider account unless policy explicitly allows shared pool semantics.

Per-account provider limits are scoped.

---

# 129. Artifact Lifecycle

Child agents produce:

```text
local files
patches
reports
media
logs
```

Only canonical verified outputs are committed to Library/project result.

Temporary child artifacts remain runtime-local until promoted.

---

# 130. Verification

Result verification may include:

```text
schema
tests
build
lint
typecheck
secret scan
diff review
artifact media validation
cross-agent review
human approval
```

Gas City controller or ACP stop reason does not bypass verification.

---

# 131. Git Safety

Reuse Spec 210 rules:

```text
isolated worktrees
stable repo identity
unpublished commit rescue
stash isolation
ref CAS
merge approval
cleanup transactions
```

Gas City rig/session lifecycle SHALL not weaken them.

---

# 132. Computer Use

ACP/Gas City agent request for GUI/browser interaction goes:

```text
Agent
→ SmartAIHub capability
→ Spec 208
```

unless an explicitly certified Spec 208 runtime adapter exists.

No runtime gains unrestricted desktop authority merely because it can launch a terminal.

---

# 133. SmartAIHub Skill Use

Agents invoke Skills remotely.

Do not install/download Skill package into Gas City agent by default.

Canonical:

```text
Agent
→ job-scoped Capability Gateway
→ Skill runtime
```

Billing/revenue attribution remains central.

---

# 134. Local Provider Accounts

A Runner may have multiple Claude/Codex accounts.

Route binding includes:

```text
provider
account_binding_id
credential owner
runtime profile
```

Gas City provider auto-routing cannot silently switch account if SmartAIHub account binding is pinned.

---

# 135. Model and Effort

Requested model/effort become attempt snapshot.

ACP configuration capability is preferred when available.

If adapter/provider cannot prove actual model:

```text
MODEL_BINDING_UNVERIFIED
```

and route eligibility depends on policy.

---

# 136. User Subscription Auth

Where official adapters reuse user subscription auth:

- keep credentials provider-native;
- do not upload secrets;
- do not promise per-task provider cost if unavailable;
- report usage facts exposed by adapter separately from SmartAIHub charges.

---

# 137. Remote / Cloud Execution

Gas City Kubernetes/subprocess or future providers may run remotely.

SmartAIHub must know canonical execution node identity.

Unregistered remote host/pod cannot become a trusted execution target solely because Gas City can start it.

---

# 138. Runner Control Protocol

Provider-neutral commands:

```text
runner.agent.route.probe
runner.agent.session.prepare
runner.agent.session.start
runner.agent.session.input
runner.agent.session.cancel
runner.agent.session.close
runner.agent.session.reconcile
runner.agent.fleet.delegate
runner.agent.fleet.drain
runner.agent.runtime.install
runner.agent.runtime.update
runner.agent.runtime.repair
```

Payload carries selected protocol/runtime.

---

# 139. Command ACK vs Effect

ACK means command accepted by Runner.

It does not prove:

```text
ACP session started
Gas City child started
cancel completed
runtime cleaned
```

Effect receipts/reconciliation remain separate.

---

# 140. Transactional Outbox

Authoritative route/session state changes use shared transactional outbox.

Never allow:

```text
session started but durable event lost
job completed but usage/artifact event lost
delegation revoked but child authority remains
```

---

# 141. Local Durable State

Runner stores enough to recover:

```text
route attempt
ACP process/session
Gas City bridge/city/session/delegation
runtime generations
workspace
account
last sequence
effect intents
```

Crash-safe atomic writes/transactions per shared Runner architecture.

---

# 142. Cleanup

Cleanup covers:

```text
ACP processes
ACP terminals/background tasks
Gas City sessions
Gas City bridge temporary state
managed city child sessions
delegated capability tokens
context/assets
worktrees
runtime routes
```

Metadata-last cleanup and postcondition verification from Spec 210 apply.

---

# 143. Garbage Collection

GC SHALL NOT delete:

```text
active
reconciling
unknown-outcome
pending-review
```

resources.

Stale Gas City state must be reconciled before destructive GC.

---

# 144. Development / Feature Flags

Suggested flags:

```text
agent_runtime_fabric_enabled
acp_enabled
acp_v2_experimental
claude_acp_enabled
codex_acp_enabled
gascity_bridge_enabled
gascity_managed_city_enabled
gascity_k8s_enabled
```

Flags are tenant/environment scoped where useful.

---

# 145. Rollout

Phase 1:

```text
ACP Client + fake ACP agent
```

Phase 2:

```text
Codex ACP direct
Claude ACP direct
```

Phase 3:

```text
Runtime Fabric route resolver
```

Phase 4:

```text
Gas City Bridge
subprocess/tmux provider
```

Phase 5:

```text
Gas City ACP provider
```

Phase 6:

```text
Managed City bounded delegation
```

Phase 7:

```text
Kubernetes / advanced providers
```

ACP v2 remains experimental until stable.

---

# 146. Migration From Spec 210

No destructive migration.

Existing:

```text
Spec 200
→ Spec 210 Orca / direct / PTY
```

Becomes:

```text
Spec 200
→ Spec 211 Runtime Fabric
    ├ ACP
    ├ Native Structured
    ├ Gas City
    ├ Spec 210 Orca
    └ PTY
```

Spec 210 reliability and Orca implementation remain valid.

Spec 211 becomes the composition layer above Spec 210.

---

# 147. Recommended Default Routing at Initial GA

Initial safe defaults:

```text
Claude:
  1. certified direct ACP
  2. certified native structured
  3. Orca
  4. PTY

Codex:
  1. certified direct ACP
  2. native structured
  3. Orca
  4. PTY

Antigravity:
  1. certified official structured route if available
  2. independently certified third-party ACP adapter if policy allows
  3. Orca
  4. native/PTY

Multi-agent software factory:
  Gas City only when explicitly selected by strategy/policy
```

Gas City is not default for every task.

---

# 148. Acceptance Criteria

Implementation is complete when:

1. Runner negotiates ACP v1 with a fake agent.
2. Unsupported ACP protocol is rejected cleanly.
3. Capability negotiation controls optional feature use.
4. Runner starts Codex ACP and receives structured turn events.
5. Runner starts Claude Agent ACP and receives structured turn events.
6. ACP permission request maps to shared Approval Service.
7. ACP file requests cannot escape workspace roots.
8. ACP terminal processes are supervised and cleaned.
9. ACP session resume/load verifies workspace/account binding.
10. ACP agent crash reconciles without duplicate execution.
11. ACP cancel does not falsely imply external rollback.
12. ACP v2 is not selected for production by default.
13. Runtime Fabric models protocol and session runtime separately.
14. Direct ACP route does not require Gas City.
15. ACP over Gas City is supported as a distinct certified tuple.
16. Gas City Bridge starts and negotiates contract/version.
17. Gas City provider capabilities are discovered.
18. Gas City subprocess session can be started/stopped/reconciled.
19. Gas City tmux route works on certified Unix Runner.
20. Gas City session identifiers remain subordinate to worker_job.
21. Gas City controller cannot resurrect work after delegation revocation.
22. Managed City receives bounded delegation lease.
23. Managed City cannot exceed max child sessions.
24. Gas City internal child work does not become canonical worker_jobs automatically.
25. Platform-significant child work can be promoted to explicit child job.
26. Gas City orphaned/stale assigned work is detected.
27. Stuck `creating` child session is detected/escalated.
28. Gas City store degraded state is surfaced.
29. Full city restart is visible/reconciled.
30. Intentional SmartAIHub stop is not treated as crash-resume.
31. Gas City auto/hybrid provider cannot choose forbidden provider.
32. Actual selected provider is recorded.
33. Gas City Pack update cannot change an in-flight execution.
34. Gas City dependency/storage versions are compatibility checked.
35. Kubernetes provider obeys namespace/resource/network policy.
36. Shared tenant execution is isolated.
37. Route fallback before execution works safely.
38. Ambiguous execution reconciles before fallback.
39. Aggregate budget spans ACP subagents/Gas City child sessions/retries.
40. Capability tokens are scoped to child session/delegation.
41. SmartAIHub Skills are invoked remotely, not installed locally.
42. External MCP still flows through Spec 199.
43. Computer Use remains Spec 208-governed.
44. Non-Git scratch task works through ACP.
45. Asset input/output works and returns canonical AssetRef.
46. Workflow External Agent node can request single_agent.
47. Workflow node can request managed_agent_fleet.
48. UI explains selected logical agent/protocol/runtime.
49. Runtime diagnostics show ACP/Gas City versions and certification.
50. Incident overlay can disable one broken protocol/runtime tuple.
51. Runtime update does not replace active bound sessions unexpectedly.
52. Rolling backend/Runner/bridge versions remain contract compatible.
53. Restart/reconnect recovers ACP direct session where supported.
54. Restart/reconnect reconciles Gas City child sessions.
55. Stale generation cannot publish job completion.
56. Event replay does not duplicate billing/artifacts/approvals.
57. Background ACP tasks remain under process custody.
58. ACP native subagents do not bypass delegation/budget policy.
59. Gas City pool scaling remains within SmartAIHub capacity envelope.
60. One tenant cannot enumerate another tenant's Gas City state.
61. Secrets are absent from routine ACP/Gas City logs.
62. Supply-chain digest/version evidence exists.
63. Verification gate remains required after runtime reports success.
64. Orca Spec 210 route remains functional after Spec 211 introduction.
65. Direct native provider adapter remains functional.
66. Generic PTY remains emergency compatibility fallback.
67. Route selection can prefer ACP because it is structured without declaring terminal route unhealthy.
68. Route selection can choose Gas City because fleet/session supervision is required.
69. User-pinned route fails clearly rather than silently changing runtime.
70. `worker_jobs` remains authoritative in every demonstrated route.

71. ACP v1 `session/resume` and `session/close` are supported/capability-tested as stable lifecycle operations rather than treated as v2-only.
72. A mutable ACP Registry `latest` update cannot change an in-flight or production-certified agent binary.
73. Preview registry artifacts are not promoted to production without SmartAIHub certification.
74. Codex ACP cannot broaden writable roots/sandbox/approval policy beyond the SmartAIHub route snapshot.
75. Codex ACP path normalization is tested for native Windows and WSL-mounted paths.
76. Codex ACP usage is labeled correctly as per-turn/session-cumulative according to observed adapter semantics.
77. Claude Agent ACP breaking provider-config changes invalidate the prior certification fingerprint.
78. Experimental Claude ACP compaction/update behavior remains feature-gated.
79. Third-party Antigravity ACP, if enabled, is distinguishable from an official provider-supported ACP implementation.
80. Gas City managed deployment verifies the pinned Gas City/Beads/Dolt compatibility tuple before production admission.
81. Beads schema migration acquires a store maintenance lease and blocks incompatible old clients afterward.
82. Binary rollback alone is rejected as an unsafe rollback after an incompatible store schema migration.
83. SmartAIHub-managed Gas City startup is isolated from unrelated stale user cities/registries where supported.
84. Gas City telemetry mode is explicit and follows SmartAIHub organization privacy policy.
85. Gas City ACP pool session logical close cannot free capacity while its provider process remains leaked.
86. Gas City Kubernetes session cannot claim task start until initial prompt-delivery evidence exists.
87. Long-lived Gas City pool soak test detects a live supervisor whose start pipeline stopped dispatching provider starts.
88. Gas City warm/cached projection absence cannot alone prove a session/process is dead for destructive reconciliation.
89. Managed child retry/fan-out retains root SmartAIHub delegation/job lineage.
90. Platform-visible artifacts/capability calls from Gas City internal children carry child/session lineage.
91. Gas City store/client compatibility is recorded in certification tuple.
92. Route incident overlay can quarantine only Gas City Kubernetes prompt delivery or ACP-process cleanup without disabling unrelated Gas City providers.
93. ACP registry provenance failure can block a candidate while locally pinned certified agents continue working.
94. Revision 2 regression suite passes all newly documented ACP/Gas City upstream failure classes.

95. ACP stdio frames are bounded; an unterminated/oversized frame cannot allocate unbounded Runner memory.
96. Diagnostic/banner output contaminating ACP stdout is detected rather than silently parsed around.
97. ACP P0 control/approval/completion traffic cannot be starved by terminal/text delta backpressure.
98. Every mutation-like ACP request has a request/semantic-intent receipt suitable for reconnect reconciliation.
99. A late JSON-RPC response from a stale generation cannot advance authoritative job state.
100. High-risk ACP permission fails closed when tool arguments/context are missing because they could not be decoded.
101. Approval is bound to normalized tool/arguments/workspace/account/generation evidence, not just toolCallId.
102. Material tool arguments changing after approval invalidate the approval before effect execution.
103. ACP auth refresh/account switch cannot silently continue a write-capable session under a different account binding.
104. Expired provider credentials surface as AUTH_REQUIRED where distinguishable.
105. Background ACP tasks expose their cancellation granularity; unsupported individual cancellation is not falsely reported successful.
106. Stable ACP protocol support is not considered production support until the exact client SDK path passes resume/close/permission conformance.
107. Codex ACP login/runtime resolves an explicit certified Codex executable rather than an arbitrary ambient PATH binary.
108. Gas City stale assignee metadata cannot hide remaining work after the assigned session is confirmed dead.
109. Gas City internal work reassignment uses a new ownership generation and prevents two exclusive owners.
110. `failed-create` / `unknown_state` sessions have bounded escape/quarantine behavior.
111. An invalid/stuck Gas City session cannot hot-loop the reconciler/store indefinitely.
112. A transient Gas City store EOF/read fault does not automatically terminate all unrelated child agents.
113. Project MCP trust prompt is surfaced as a typed startup blocker and is not auto-accepted by generic dialog dismissal.
114. Repeated startup blocker failures trip a circuit breaker instead of infinite `failed-create` respawn.
115. Two Gas City pool sessions cannot resolve to the same writable worktree/workspace path.
116. Cross-layer event backpressure preserves authoritative state/approval/cancel/result traffic under stream flood.
117. Large Gas City reconcile/order work uses absolute + no-progress deadlines rather than only a fixed wall-clock timeout.
118. Usage samples distinguish per-turn versus cumulative counters and cannot double-charge after restart/resume.
119. Runtime upgrade keeps old binaries available when active sessions are not certified resumable on the new runtime.
120. Revision 3 regression suite passes all 24 newly audited protocol/runtime failure dimensions.

121. One ACP session waiting on permission cannot block unrelated session creation/control unless the exact shared-process tuple is explicitly certified for that behavior and policy accepts it.
122. ACP process/session density limits are enforced before session creation.
123. A large ACP session can report `HISTORY_REPLAY_PARTIAL` rather than falsely claiming complete history.
124. Resume/load replay notifications emitted before the response are retained/deduplicated correctly.
125. Async user response acceptance is distinguishable from delivery/consumption by the agent.
126. Unknown ACP SessionUpdate variants cannot independently complete, authorize or mutate SmartAIHub job state.
127. JSON-RPC batch size/count are bounded and each effect-bearing member retains independent semantic identity.
128. An ACP process crash affects only the sessions declared in its certified process-topology blast radius.
129. Connection-level HOL blocking stops further admission and triggers bounded recovery.
130. Mode A Gas City Bridge does not require a Dolt/Beads store when the selected certified integration path does not use Managed City work tracking.
131. Managed installation verifies current Gas City core/fallback prerequisites such as tmux rather than assuming the selected provider removes them.
132. A managed Dolt store cannot start a second server generation while a prior generation still owns the data-dir lock.
133. Store endpoint generation changes are propagated; stale long-lived child sessions are detected before mutation.
134. Gas City store growth/latency exceeding threshold degrades admission before the control loop becomes unusable.
135. Store compaction/retention does not delete canonical SmartAIHub audit evidence.
136. A managed store has a tested backup/restore path with explicit RPO/RTO.
137. Unexpectedly empty/missing Gas City store enters recovery state instead of silently reinitializing/importing during job dispatch.
138. Policy-critical store read failure cannot silently become a default merge/provider/routing decision.
139. Control decisions record value provenance and freshness.
140. Test/conformance processes cannot mutate production Gas City/Dolt state through inherited endpoint environment.
141. Store restart waits for prior process exit/lock release rather than relying only on TCP readiness.
142. Store corruption/lock conflict blocks Managed City admission and preserves unaffected external agent routes.
143. Runtime/store maintenance mode prevents new affected route admission while keeping safe reconciliation/cancellation available.
144. Store compaction/migration/restore runs under maintenance/effect intents and revalidates health before NORMAL.
145. Gas City operations UI exposes backend/schema/generation/growth/backup/maintenance status without exposing secrets.
146. Session replay/context incompleteness can force Context Package rehydration or a new controlled session.
147. The file-store versus Dolt/Beads backend choice is explicit in certification and diagnostics.
148. Revision 4 regression suite passes all 24 newly audited session-topology/store-resilience dimensions.

149. Foreground ACP turn completion cannot mark a session quiescent while certified background work remains active.
150. Out-of-turn permission/user-input requests from background ACP work remain routable after the launching turn settles.
151. Concurrent parent/subagent permission requests are correlated by explicit tool/task lineage and cannot consume each other's decisions.
152. A normal follow-up prompt does not implicitly cancel background subagents unless route policy explicitly selects that behavior.
153. Fine-grained background Stop is exposed only when the exact adapter supports it.
154. A resumed ACP session at/over context capacity enters compaction/fork/new-session recovery rather than an infinite prompt failure loop.
155. Conversation reset/fork/rewind changes continuation lineage and stale conversation IDs cannot be silently resumed after restart.
156. ACP session history incompleteness plus context exhaustion cannot be hidden by a successful `session/resume`.
157. Gas City stable-release metadata in SmartAIHub is sourced from verified releases; mutable/unsupported v1.4.2 assumptions are removed.
158. Gas City and Beads versions are certified independently as a compatibility tuple rather than `latest + latest`.
159. A stale Gas City `creating` projection cannot overwrite an active provider-start lease from a newer desired-state revision.
160. Two concurrent pool sessions cannot both publish authoritative output from one exclusive internal work claim.
161. Formula fan-out bookkeeping/retry records cannot incorrectly multiply executable pool demand.
162. A pool serving multiple rigs/projects reports partial demand rather than silently ignoring unavailable declared sources.
163. Ephemeral/patrol pool agents can be configured fresh-by-default without preserving unwanted historical provider context.
164. `wake_mode=fresh` or equivalent is verified to produce a new provider conversation/continuation epoch.
165. Killing a Gas City runtime verifies persistent session metadata state before a later wake decision.
166. Platform-specific process liveness probes normalize through one certified observation contract.
167. A failed/ambiguous process probe cannot be interpreted as proof of death for destructive reconciliation.
168. Background ACP permission requests can be denied/cancelled safely if the product cannot surface them out of turn.
169. Session/process topology defines and tests failure blast radius for shared ACP processes.
170. Cancellation policy distinguishes foreground-only, background-only when supported, and whole-session cancellation.
171. Gas City work claim ownership is generation/lease aware even when stale assignee metadata exists.
172. Provider-start lease expiry/retry cannot start a stale generation after delegation cancellation.
173. Runtime release information is periodically revalidated without changing in-flight certified tuples.
174. Store/toolchain migration policy no longer depends on an unverified Gas City v1.4.2 pairing claim.
175. Revision 5 cross-layer tests cover ACP background lifecycle and Gas City start/claim races.
176. Revision 5 regression suite passes all 24 newly audited session-activity/ownership/version-baseline dimensions.

177. ACP resume/load with changed Skills, MCP environment, model, policy or other session-bound options cannot silently reuse an old effective configuration.
178. Every authoritative ACP session exposes a session_config_epoch/digest that changes when material session configuration changes.
179. Repeated ACP resume/load cycles cannot accumulate unexplained provider child processes under one authoritative session generation.
180. ACP session discovery distinguishes top-level user sessions from provider child/sidechain/team sessions.
181. Unknown-origin provider sessions are not automatically resumable for write-capable SmartAIHub work.
182. Out-of-order/delayed ACP responses are matched only by request id/session/generation and cannot advance newer logical requests.
183. Duplicate semantic final output cannot double-complete, double-upload, double-charge or double-trigger workflow continuation.
184. A stuck ACP cancellation can escalate from protocol cancel to process/runtime termination while preserving side-effect uncertainty.
185. Effective ACP MCP configuration reconstructs material environment/auth/transport fields rather than relying on lossy incremental merges.
186. Gas City cached/REST/projected state cannot authorize claim/reassign/delete/replace transitions without a fresh authoritative read barrier.
187. Projection lag is measured and can remove cached state from authority decisions.
188. Managed City graph/formula work cannot execute through a dispatcher bound to the wrong graph-owning store/rig.
189. Managed pack/provider cache generation is validated after upgrade and invalid-but-present cache is explicitly reseeded.
190. The running Gas City supervisor executable/version is attested after upgrade; a stale shadow binary blocks admission.
191. Automated doctor/repair is scoped to the managed profile and must converge through post-repair invariant checks.
192. Cross-runtime fallback/handoff fences the previous writer/session authority before the replacement route becomes authoritative.
193. Cross-runtime handoff package preserves uncertain side effects and pending approvals instead of claiming uncertain work completed.
194. Mutable ACP/Gas City temp/session caches are tenant/profile scoped; shared caches are immutable content-addressed only.
195. Kubernetes execution has explicit persistence classification for store, workspace, session metadata, artifacts and reconciliation evidence.
196. Kubernetes pod replacement is identified by pod UID/runtime generation, not reused pod name.
197. Kubernetes eviction/restart reconciles existing persistent effects before launching a replacement writer.
198. Provider/MCP credential rotation inside Kubernetes has explicit credential epochs and drain/refresh behavior.
199. Gas City, Beads and Dolt compatibility is revalidated from verified releases/toolchain evidence without assuming independent latest releases are compatible.
200. Revision 6 regression suite passes all 24 newly audited effective-config/authoritative-read/handoff/deployment dimensions.

---

# 149. Definition of Done Scenarios

## Case A — Direct Codex ACP

```text
User asks Codex to modify project
→ Spec 206 has no eligible A2A route
→ Spec 211 selects ACP + Direct Runner
→ codex-acp
→ structured progress/permissions/files
→ verifier
→ worker_job completed
```

## Case B — Direct Claude ACP

```text
User selects Claude
→ ACP certified
→ claude-agent-acp
→ permission/user-input mapped to SmartAIHub
→ verified result
```

## Case C — Gas City ACP Fleet

```text
Workflow requests parallel 8-agent review
→ one parent worker_job
→ bounded Gas City delegation
→ Gas City ACP sessions
→ Claude/Codex child sessions
→ internal runtime reconciliation
→ normalized result
→ SmartAIHub verification
```

## Case D — Gas City Crash Recovery

```text
child session/process dies
→ Gas City detects
→ delegation still valid
→ bounded recovery/adoption
→ SmartAIHub observes
→ no duplicate canonical job
```

## Case E — Delegation Revoked

```text
user cancels job
→ delegation revoked
→ no new Gas City work
→ active ACP turns cancelled/drained
→ capabilities revoked
→ postconditions verified
```

## Case F — Gas City Store Failure

```text
store becomes unavailable
→ runtime health degraded
→ no uncontrolled hidden global restart
→ SmartAIHub sees impacted sessions
→ reconcile/recover/fail by policy
```

## Case G — ACP Adapter Regression

```text
new codex-acp version fails conformance
→ narrow tuple quarantined
→ native/Orca route remains available
```

## Case H — ACP v2 Future

```text
ACP v2 becomes stable
→ feature flag/certification
→ protocol negotiation
→ production canary
→ no workflow migration required
```


## Case I — Gas City Store Migration

```text
Gas City/Beads upgrade requires schema migration
→ drain writers
→ snapshot
→ maintenance lease
→ coordinated migration
→ integrity check
→ old incompatible clients remain blocked
```

## Case J — Gas City ACP Process Leak

```text
pool child logically drains
→ provider process still alive
→ capacity not released
→ leak surfaced/quarantined
→ effect cleanup verified
```

## Case K — Kubernetes Prompt Delivery Failure

```text
pod/session starts
→ initial task prompt evidence missing
→ work not marked started
→ duplicate-safe reconcile/retry
```

## Case L — Third-Party Antigravity ACP

```text
candidate ACP adapter discovered
→ provenance + protocol + security certification
→ policy opt-in
→ Orca remains fallback
```


## Case M — ACP Approval Context Loss

```text
permission request arrives
→ raw/optional argument field cannot be decoded
→ approval evidence marked incomplete
→ destructive approval fails closed
→ user sees why
```

## Case N — Gas City Stale Ownership

```text
pool child dies with assigned work
→ ownership/session generation checked
→ stale assignment released/adopted safely
→ demand remains visible
→ no duplicate exclusive worker
```

## Case O — Gas City Startup Blocker

```text
tmux process starts
→ provider displays project MCP trust prompt
→ agent not READY
→ SmartAIHub surfaces typed approval/blocker
→ no crash-respawn loop
```

## Case P — Control Loop Degrades at Scale

```text
reconcile/store fan-out exceeds SLO
→ admission reduced
→ progress-aware deadline used
→ running child work preserved where safe
→ operator sees DEGRADED_CONTROL_LOOP
```

## Case Q — ACP Stream Flood

```text
agent emits huge text/terminal stream
→ low-priority deltas coalesced
→ permission/cancel/final-result lane remains live
→ durable job correctness preserved
```


## Case R — ACP Permission Blocks Shared Process

```text
session A waits for approval
→ shared ACP connection begins blocking unrelated session B
→ HOL detector fires
→ no new sessions admitted to that process
→ session B uses isolated process/certified recovery
```

## Case S — Partial History Resume

```text
large historical ACP session resumes
→ only partial history available
→ SmartAIHub marks replay partial
→ required context rehydrated through Context Package
→ task does not reason from falsely complete history
```

## Case T — Gas City Store Growth

```text
store size/query latency crosses threshold
→ control plane DEGRADED
→ new Managed City admission reduced/paused
→ compaction/retention maintenance
→ health revalidated
```

## Case U — Dolt Process Race

```text
store restart requested
→ old process still owns data-dir lock
→ new generation refuses start
→ wait/graceful recovery
→ no two writers corrupt journal
```

## Case V — Missing Store State

```text
configured store unexpectedly empty/missing
→ STORE_RECOVERY_REQUIRED
→ no hidden 2-minute import on each dispatch
→ operator/recovery workflow restores or reinitializes explicitly
```

## Case W — Policy Read Fails

```text
runtime cannot read merge/routing policy
→ VALUE_UNKNOWN_BECAUSE_READ_FAILED
→ fail closed
→ never silently choose materially different default
```


## Case X — Background ACP Work After Turn

```text
foreground prompt settles
→ background subagent still active
→ session remains BACKGROUND_ACTIVE
→ later permission is still routed
→ UI does not falsely report full idle
```

## Case Y — Follow-Up Without Destructive Cancel

```text
background subagent is intentionally running
→ user sends follow-up
→ route policy keeps background work
→ no unconditional session/cancel
→ both lineages remain observable
```

## Case Z — ACP Session Context Exhausted

```text
resume succeeds
→ provider context is over limit
→ repeated prompt would fail
→ SESSION_CONTEXT_EXHAUSTED
→ compact/fork/new-session handoff
```

## Case AA — Gas City Provider Start Race

```text
provider start lease generation N active
→ stale creating projection from N-1 arrives
→ CAS/lease check rejects stale mutation
→ one runtime starts
```

## Case AB — Duplicate Work Claim

```text
two pool sessions race for one internal work unit
→ atomic/lease claim
→ one owner wins
→ losing writer cannot publish authoritative result
```

## Case AC — Fresh Wake Semantics

```text
ephemeral worker requests START_FRESH_CONTEXT
→ old provider conversation not resumed
→ continuation epoch increments
→ token/context history does not leak into next cycle
```


## Case AD — Resume With Changed Skills

```text
ACP session exists
→ requested Skills/config changes
→ effective config digest differs
→ old provider query is not silently reused
→ recreate/reconfigure through certified path
```

## Case AE — Resume Child Leak

```text
same ACP session is resumed repeatedly
→ provider child census detects multiple unexplained children
→ admission stops
→ authoritative/stale children reconciled
→ bounded resource state restored
```

## Case AF — Stale Gas City Projection

```text
cached bd/REST view says worker/session absent
→ mutation would start replacement
→ authoritative read barrier shows live owner
→ replacement suppressed
```

## Case AG — Runtime Handoff

```text
Gas City ACP degrades
→ direct ACP candidate available
→ old route input frozen/fenced
→ writer/background ownership settled
→ context handoff built
→ new route generation starts
```

## Case AH — Kubernetes Eviction

```text
agent pod evicted
→ pod UID disappears
→ persistent workspace/store inspected
→ old execution authority reconciled
→ replacement pod receives new generation
→ no duplicate writer
```

## Case AI — Stale Supervisor After Upgrade

```text
new gc binary installed
→ old supervisor still running
→ executable attestation fails
→ no new jobs admitted
→ drain/stop/start
→ new supervisor digest/version verified
```

---

# 150. Sixteen-Pass Initial Gap Audit

Revision 1 was reviewed through 16 focused architecture/completeness passes. Gaps found were incorporated before this record.

| Pass | Audit dimension | Gap found | Correction |
|---:|---|---|---|
| 1 | Layering | ACP and Gas City could be treated incorrectly as competing alternatives | Separate `agent_protocol` from `session_runtime` |
| 2 | Cross-spec ownership | Gas City could duplicate worker_jobs/Spec 209 | Explicit ownership and subordinate Beads/Formulas/Orders |
| 3 | ACP stability | Draft ACP v2 could be mistaken for stable | v1 production baseline; v2 gated |
| 4 | Single-agent overhead | Gas City could be inserted into every ACP call | Direct ACP preferred when Gas City adds no value |
| 5 | Gas City integration | Full Gas City controller would create excessive coupling | Add minimal Provider Bridge Mode plus optional Managed City |
| 6 | Dueling reconcilers | SmartAIHub and Gas City could both own same desired state | Delegation lease defines nested ownership |
| 7 | Runtime resurrection | Gas City crash recovery could restart cancelled SmartAIHub job | Lease/state revocation blocks resurrection |
| 8 | Internal work model | Every Gas City Bead could explode into duplicate SmartAIHub jobs | Child work subordinate unless platform-significant |
| 9 | ACP security | Structured protocol could still expose unsafe filesystem/terminal capability | Scoped virtual filesystem/process supervision |
| 10 | ACP session resume | Session ID alone could cross workspace/account boundary | Resume binding preflight |
| 11 | Budget | ACP subagents/Gas City pools could create hidden unbounded spend | Aggregate delegation/job budget |
| 12 | Store failure | Gas City control-store faults could create global opaque runtime effects | Explicit store health and restart/reconcile evidence |
| 13 | Provider auto-routing | Gas City auto/hybrid could violate SmartAIHub policy | Allowed-provider envelope + actual-provider evidence |
| 14 | Supply chain | Packs/adapters/runtime binaries update independently | Version/digest/certification matrix |
| 15 | Migration | Spec 211 could invalidate heavily audited Spec 210 | Spec 210 retained as sibling runtime profile |
| 16 | UX | Protocol/runtime details could overwhelm ordinary users | logical-agent UX; runtime details only in diagnostics |

All sixteen gaps are already reflected in normative sections.

---


## 150A. Revision 2 — Additional 24-Pass Gap Audit

Revision 2 performed **24 additional focused review passes** against current ACP and Gas City upstream protocol/release/issue evidence. Every gap below was corrected in the normative sections before this audit record.

| Pass | Audit dimension | Gap found | Revision 2 correction |
|---:|---|---|---|
| 1 | ACP stable lifecycle | Revision 1 understated v1 by treating resume/close too close to v2-only behavior | 24A/26 now make stable v1 resume/close explicit |
| 2 | ACP v2 boundary | v2 changed semantics needed separation from v1 stable methods | 27 now lists v2-specific/changed surfaces rather than duplicating v1 |
| 3 | ACP registry | Mutable hourly registry updates could become an implicit production updater | 40B snapshots registry provenance and separates discovery from trust |
| 4 | Registry preview | Preview channel may be unverified yet discoverable | 40B blocks automatic production promotion |
| 5 | Codex writable-root policy | Adapter/provider prompt/config can drift from requested sandbox roots | 40A requires effective-policy attestation and route failure on broadening |
| 6 | Codex cwd normalization | WSL/native path normalization can break session discovery/resume | 40A adds Windows/WSL conformance |
| 7 | Codex auth/session semantics | Expired auth/history replay/model-effort behavior evolves independently | 40A adds targeted regression certification |
| 8 | Codex usage semantics | Turn vs cumulative usage may differ/regress | 40A + error taxonomy require labeled semantics |
| 9 | Claude adapter breakage | ACP wire stability does not prevent provider-adapter breaking config changes | 39A makes adapter+SDK config part of certification fingerprint |
| 10 | Claude experimental features | Compaction/other experimental updates could enter production implicitly | 39A requires feature gates |
| 11 | Antigravity structured route | Third-party ACP adapter now exists but is not official provider support | 41A adds candidate route with provenance/security gating |
| 12 | Gas City latest baseline | Latest stable was v1.4.2, not v1.4.1 | 2.2 updated |
| 13 | Beads migration | v1.4.2 migration can make store unreadable by older clients | 62A adds coordinated migration/downgrade boundary |
| 14 | Gas City global state | Stale registered cities/supervisor/bundled cache can affect startup | 53A recommends dedicated managed profile and scoped repair |
| 15 | Gas City telemetry | Vendor telemetry settings were not represented in managed privacy policy | 65A adds explicit telemetry governance |
| 16 | ACP provider cleanup | Gas City ACP pool can logically drain while provider process leaks | 71A requires process-custody postconditions |
| 17 | Kubernetes prompt delivery | Session/pod start can occur without initial task prompt | 68A adds prompt-delivery proof |
| 18 | Pool long-uptime liveness | Supervisor can stay alive while pool start pipeline stops firing | 60A adds soak certification + stalled-pipeline detection |
| 19 | Warm projections | Typed/warm projected reads can be stale for destructive reconciliation | 61A classifies authoritative vs projected observations |
| 20 | Child lineage | Internal retries/fan-out can lose SmartAIHub root lineage | 19A adds generation-aware child lineage |
| 21 | Route isolation | One Gas City provider regression should not disable all Gas City | error/circuit/incident tuple requirements strengthened |
| 22 | Storage rollback | Binary rollback after migrated schema is not necessarily safe | 62A differentiates binary vs data/schema rollback |
| 23 | Release certification | Gas City/ACP versions move independently and need compound tuple evidence | acceptance/certification requirements strengthened |
| 24 | Executable regression coverage | Newly observed upstream incidents needed explicit release gates | Acceptance Criteria 71–94 + DoD Cases I–L added |

Revision 2 adds **24 more passes**, bringing Spec 211's recorded focused audit history to **40 passes** (16 + 24).



## 150B. Revision 3 — Additional 24-Pass Gap Audit

Revision 3 performed **24 additional focused review passes** against current ACP protocol/SDK issues, current Codex/Claude ACP behavior, and Gas City runtime/reconciler failure evidence. Every discovered gap was incorporated normatively before this record.

| Pass | Audit dimension | Gap found | Revision 3 correction |
|---:|---|---|---|
| 1 | ACP frame memory safety | Long newline-delimited/stdin frames could cause unbounded buffering | 28A adds hard frame/message/backpressure bounds |
| 2 | ACP protocol-channel purity | Shell/banner/debug stdout can corrupt JSON-RPC framing | 28B requires stdout protocol purity |
| 3 | ACP reconnect receipts | JSON-RPC response alone was not tied strongly enough to semantic effect/retry identity | 34A adds request/semantic-intent receipt ledger |
| 4 | ACP permission context | Tolerant deserialization can silently drop malformed tool rawInput/display context | 35A adds fail-closed approval evidence envelope |
| 5 | Approval TOCTOU | Tool arguments/workspace/account may change after approval | 87A revalidates digest immediately before effect |
| 6 | ACP authentication epochs | Credential refresh/account switching could silently rebind a session | 38A adds auth epochs and session revalidation |
| 7 | ACP background cancellation | Observable background task does not guarantee individual cancel support | 47A adds cancellation tree/capability semantics |
| 8 | ACP SDK-path mismatch | Stable protocol method can still be broken in the selected client SDK path | 50A requires exact SDK-path certification |
| 9 | Codex executable resolution | ACP login/startup can resolve an unintended/missing ambient Codex executable | 40C pins resolved executable identity |
| 10 | ACP event flood | Text/terminal deltas could starve approvals/cancel/completion | 80A adds priority event lanes |
| 11 | Gas City stale assignee | Dead pool worker can leave work assigned and invisible to demand | 58A adds ownership generation/assignment reconciliation |
| 12 | Gas City failed-create | Invalid/failed-create/unknown sessions can become permanently stuck | 60B adds bounded escape/quarantine |
| 13 | Gas City reconcile hot loop | One invalid state can cause no-progress high-CPU/store spin | 60C adds progress/spin breaker |
| 14 | Gas City transient store fault | Store read/network errors can have excessive city-wide blast radius | 61B adds graduated fault response |
| 15 | Startup trust dialogs | MCP/project trust prompts can prevent READY while process exists | 69A adds typed startup blockers/fail-closed trust |
| 16 | Startup respawn loop | always-on session can repeatedly recreate behind same interactive blocker | 69A adds startup circuit breaker |
| 17 | Pool workspace collision | pool instances can derive same writable worktree path | 73A requires slot/session-unique workspace |
| 18 | Control-loop scalability | per-pool/store fan-out can make reconcile cycles exceed useful latency | 124A adds control-loop SLO/admission degradation |
| 19 | Timeout semantics | fixed wall-clock sweep timeout can kill progressing large-city work | 124B adds absolute + no-progress deadlines |
| 20 | Usage semantics | ACP/provider usage may be per-turn or cumulative, risking double charge | 107A adds typed counter semantics/delta reconciliation |
| 21 | Upgrade active-session safety | same protocol version does not prove cross-version session adoption | 93A adds session compatibility/drain classes |
| 22 | Gas City assignment exclusivity | stale/resurrected child identity can create duplicate ownership | 58A adds assignment epoch/generation |
| 23 | Upstream regression executability | Historical/fixed upstream bugs still need permanent regression tests | Acceptance Criteria 95–119 make invariants executable |
| 24 | Cross-layer completion confidence | protocol/runtime health could look green while correctness lane is blocked | DoD Cases M–Q + priority/backpressure/SLO rules close the gap |

Revision 3 adds **24 more focused passes**, bringing Spec 211's recorded audit history to **64 focused passes** (16 + 24 + 24).



## 150C. Revision 4 — Additional 24-Pass Gap Audit

Revision 4 performed **24 additional focused review passes** against current ACP session/SDK behavior and Gas City store/runtime failure evidence. All identified gaps were integrated before this record.

| Pass | Audit dimension | Gap found | Revision 4 correction |
|---:|---|---|---|
| 1 | ACP multi-session process topology | One pending permission can block unrelated operations on a shared ACP process | 29A defines safe process/session topology |
| 2 | Connection HOL detection | Shared-process blockage needed runtime detection, not just certification | 29B adds queue/reader/writer latency detection |
| 3 | ACP process blast radius | Scheduler lacked explicit session-density/process-failure envelope | 49A adds per-process admission limits |
| 4 | Large-session history | Successful resume can still replay only partial history | 32A adds replay-completeness states |
| 5 | Replay ordering | Notifications can precede resume response and cursors may become stale | 32B adds snapshot/cursor integrity |
| 6 | Async user input finality | Adapter acceptance does not prove user answer reached/was consumed by agent | 45A adds delivery-finality states |
| 7 | SessionUpdate evolution | Schema may expose variants older client logic does not understand | 34B adds unknown-update security policy |
| 8 | JSON-RPC batches | Batch transport could blur attribution/backpressure | 28C bounds batches and preserves per-intent identity |
| 9 | Gas City store backend scope | Revision 3 could still imply Dolt/Beads is intrinsic to all Gas City modes | 53B makes store choice explicit and minimal |
| 10 | Gas City prerequisites | Selecting ACP/subprocess does not necessarily remove current tmux/core dependency | 53C makes dependencies version/capability scoped |
| 11 | Dolt singleton ownership | TCP readiness cannot prove prior server released data-dir lock | 61C adds store process generation/lock fencing |
| 12 | Store endpoint drift | Long-lived sessions may retain stale store host/port after restart | 61D adds endpoint generation |
| 13 | Store growth | Unbounded Dolt history/events can eventually make orchestration queries time out | 62B adds growth/compaction/retention SLO |
| 14 | Backup readiness | Backup existence alone does not prove recoverability | 62C adds RPO/RTO + restore drills |
| 15 | Missing store state | Silent auto-import/reinitialization can turn every dispatch into long timeout | 62D adds fail-closed recovery state |
| 16 | Policy read ambiguity | Failed control-store lookup could be mistaken for absent/default config | 61E adds value provenance/fail-closed semantics |
| 17 | Store process race | Concurrent/restarted Dolt processes can corrupt journal/data plane | 61C requires lock-release proof before next generation |
| 18 | Production test leakage | Ambient endpoint env can redirect tests into live shared store | 123A isolates test environment/store |
| 19 | Maintenance semantics | Upgrade/compaction/restore needed durable admission state | 93B adds maintenance modes |
| 20 | Operations UX | Store degradation/backup/maintenance lacked one operator surface | 112A adds store operations diagnostics |
| 21 | Audit retention boundary | Gas City local pruning could be confused with canonical SmartAIHub audit retention | 62B separates local history from platform evidence |
| 22 | Store backend certification | file vs bd/dolt behavior/dependencies need independent certification | acceptance/conformance expanded |
| 23 | Failure isolation | Store corruption must not unnecessarily disable direct ACP/Orca sibling routes | route/store health remains tuple-scoped and Acceptance 142 verifies |
| 24 | Executable regression | New topology/store invariants needed release-gating scenarios | Acceptance 121–148 + DoD R–W added |

Revision 4 adds **24 focused passes**, bringing Spec 211's recorded audit history to **88 focused passes** (16 + 24 + 24 + 24).



## 150D. Revision 5 — Additional 24-Pass Gap Audit

Revision 5 performed **24 additional focused review passes** against current ACP background-task/session behavior, current Gas City runtime/store evidence, and verified public release metadata. All identified gaps were integrated before this record.

| Pass | Audit dimension | Gap found | Revision 5 correction |
|---:|---|---|---|
| 1 | Release-baseline verification | Revision 4 carried an unverified Gas City v1.4.2 assumption; public Releases currently verifies v1.4.1 as latest stable | 2.2/62A corrected to verified release + compatibility-matrix policy |
| 2 | Independent dependency versions | Latest Beads release does not imply latest Gas City stable supports it | Gas City/Beads/Dolt tuple now independently certified |
| 3 | Turn vs session finality | Foreground prompt can settle while background agents/shells remain live | 33A separates turn and session activity |
| 4 | Background activity observability | Adapter may lack one canonical active/idle signal | 33B introduces multi-signal evidence + UNKNOWN state |
| 5 | Out-of-turn approval/input | Background work can request permission after prompt settlement | 35B keeps session-scoped request routing alive |
| 6 | Permission ID concurrency | Parent/background tool permission IDs can desynchronize | 35C binds decisions to explicit lineage |
| 7 | Follow-up semantics | Generic pre-prompt cancel can kill background subagents unintentionally | 47B adds explicit follow-up policy |
| 8 | Background stop granularity | `session/cancel` and per-task stop have different capabilities | 47C exposes real stop capabilities only |
| 9 | Resume context exhaustion | Resumed large session can be permanently over context limit | 32C adds preflight + bounded recovery |
| 10 | Conversation reset identity | ACP session id can outlive/reset provider conversation identity | 32D adds continuation epoch |
| 11 | Session history + context | Resume success can mask incomplete history and unusable context | Acceptance 154–156 combines both checks |
| 12 | Provider-start race | Stale creating projection can race/overwrite newer start lease | 57A adds desired-revision/start-lease CAS |
| 13 | Duplicate work claim | Concurrent pool sessions can execute same bead/work unit | 58B adds claim lease/CAS |
| 14 | Demand double count | Formula fan-out child/bookkeeping records can over-scale pools | 59A introduces demand identity/dedup |
| 15 | Multi-rig pool scope | Rig-local scale checks can ignore work in other declared rigs | 59B requires explicit demand scope |
| 16 | Context/token accumulation | Repeated resume of patrol/ephemeral agents can waste tokens and stale context | 56A adds fresh/resume policy |
| 17 | Fresh wake correctness | `fresh` must mean new provider conversation, not metadata-only reset | 56A verifies continuation epoch |
| 18 | Kill/wake metadata drift | Runtime may die while persisted session still says awake/active | 56B verifies both runtime + metadata postconditions |
| 19 | Process introspection variance | Multiple platform-specific process checks can disagree | 65B normalizes observations |
| 20 | Liveness ambiguity | Failed process probe could be mistaken for dead process | 65B + Acceptance 167 fail closed |
| 21 | Cancellation blast radius | Session-level cancel may have wider effect than intended foreground cancel | 47B/47C make cancellation scope explicit |
| 22 | Stale owner after death | Assignee strings alone are insufficient ownership authority | 58A/58B combine liveness generation + CAS |
| 23 | In-flight version stability | Release revalidation must not mutate existing route tuple | Acceptance 173 locks active attempts |
| 24 | Executable regression coverage | New session/background/start/claim invariants required release gates | Acceptance 149–176 + DoD X–AC added |

Revision 5 adds **24 focused passes**, bringing Spec 211's recorded audit history to **112 focused passes** (16 + 24 + 24 + 24 + 24).



## 150E. Revision 6 — Additional 24-Pass Gap Audit

Revision 6 performed **24 additional focused review passes** against current ACP adapter issues/protocol behavior, current Gas City release/issue evidence, and SmartAIHub cross-runtime ownership requirements. Every discovered gap was incorporated normatively before this record.

| Pass | Audit dimension | Gap found | Revision 6 correction |
|---:|---|---|---|
| 1 | ACP resume configuration | Adapter may reuse provider query when Skills change but cwd/MCP fingerprint does not | 32E/32F add complete effective config fingerprint/epoch |
| 2 | MCP config merge | Incremental session MCP changes can drop environment/material config | 43A reconstructs/verifies full effective MCP configuration |
| 3 | Provider child leakage | Long-lived adapter can accumulate provider children after repeated resume/load | 49B/49C add child ownership census + soak certification |
| 4 | Session discovery pollution | Provider sidechain/team sessions can appear as ordinary resumable sessions | 30A/30B classify origin and filter user resume list |
| 5 | Response ordering | API errors can produce delayed/out-of-order response handling | 34C binds responses strictly to request/session/generation |
| 6 | Duplicate answers/events | Adapter/replay bugs can duplicate final semantic output | 34D adds semantic dedup + idempotent settlement |
| 7 | Cancellation deadlock | `session/cancel` can fail to resolve provider-native blocking task | 48A adds bounded cancellation escalation ladder |
| 8 | Resume resource growth | Functional resume tests do not catch RSS/FD/process accumulation | 49C adds churn/soak resource gate |
| 9 | Gas City stale cached reads | bd/list/REST projections can lag live store under write load | 61F requires authoritative read barrier |
| 10 | Projection health | Cache lag needed an explicit health/SLO signal | 61G adds lag/mismatch metrics |
| 11 | Graph/store dispatcher scope | Control dispatcher may be unable to read the graph-owning rig/store | 20A/20B bind dispatcher to store scope/generation |
| 12 | Managed cache after upgrade | Invalid-but-present pack/provider cache may not self-heal | 53D adds cache generation/reseed |
| 13 | Stale supervisor binary | New install can leave prior supervisor executable active | 53E attests running binary, not installed path |
| 14 | Repair convergence | One `doctor --fix` pass may not converge and can affect wrong registered city | 93C scopes repair + post-checks + bounded passes |
| 15 | Cross-runtime fallback ownership | Direct ACP/Gas City/Orca fallback could create simultaneous writers | 85A adds explicit authority handoff |
| 16 | Handoff context correctness | Runtime replacement can overstate uncertain prior side effects | 85B adds evidence-backed handoff package |
| 17 | Tenant cache isolation | Runtime temporary/session caches can contain tenant paths/content/state | 89A namespaces mutable cache and restricts shared caches |
| 18 | Kubernetes persistence | Upstream deployment docs do not define full persistence surface | 68B makes persistence classification mandatory |
| 19 | Kubernetes eviction | Pod disappearance is not proof work is unowned/safe to retry | 68B reconciles persistent effects before replacement |
| 20 | Pod incarnation | Human pod names can be reused across restart | 68C uses pod UID + runtime generation |
| 21 | Credential rotation | Long-lived Kubernetes processes may not observe projected credential changes | 68D adds credential epoch/refresh-or-drain |
| 22 | Version-pair assumptions | Gas City/Beads/Dolt release independently and need verified compatibility | existing tuple policy reinforced in Acceptance 199 |
| 23 | Runtime evidence | Upgrade/repair/handoff needed stronger executable regression scenarios | DoD AD–AI added |
| 24 | Executable release gating | New config/read/handoff/deployment rules needed testable acceptance criteria | Acceptance 177–200 added |

Revision 6 adds **24 focused passes**, bringing Spec 211's recorded audit history to **136 focused passes** (16 + 24 + 24 + 24 + 24 + 24).


## 150F. Revision 7 — 20-Round Repository-Convergence Audit

Revision 7 performed **20 additional repository-first passes** on 2026-09-19.
The detailed evidence ledger is recorded in
`specs/feature/211-external-agent-runtime-fabric-acp-gascity/audit-revision-7.md`.
This pass deliberately separates architecture/research claims from source,
dependency, migration, route and test evidence.

| Pass | Audit dimension | Finding | Revision 7 correction |
|---:|---|---|---|
| 1 | Package/inventory | Spec 211 is the only current 211 package and its previous Revision 6 audit was historical | Started a fresh repository-convergence audit and advanced the revision |
| 2 | ACP source proof | No ACP adapter, dependency, route or conformance source was found | Added explicit target/absent implementation status |
| 3 | Gas City source proof | No Gas City bridge, provider, Beads/Dolt integration or dependency was found | Added an installed-runtime proof gate |
| 4 | Spec 200 ownership | Spec 200 remains external-agent owner and current agent contracts are reusable | Kept Spec 211 as composition layer, not replacement control plane |
| 5 | Spec 206 routing | A2A remains first routing decision; current A2A implementation was not proven | ACP is explicitly internal native-plane protocol, not A2A proof |
| 6 | Spec 210 sibling | Orca remains a sibling profile and its adapter is not implemented in current paths | Spec 211 cannot assume Orca fallback availability |
| 7 | Spec 209 workflow | Workflow canonical tables/routes are target-only | Transient runtime IDs cannot become workflow persistence |
| 8 | Feature 195 tables | Jobs, attempts, events, dispatches, outbox and settlements are canonical | Runtime/provider identities remain subordinate metadata |
| 9 | Contract version | Current agent definition still uses `feature-186-v1` | Added mixed-version migration gate |
| 10 | Job status vocabulary | Spec 211 phase names differ from `CANONICAL_JOB_STATUSES` | Added explicit phase-detail mapping and no-new-top-level-status rule |
| 11 | Feature 196 handoff | Approved-plan → Job handoff exists | Prohibited a parallel planner/queue |
| 12 | Feature 197 Runner | `sah-runner-v1` is the current authenticated boundary | ACP/Gas City must use Runner/capability publication |
| 13 | Spec 199 MCP | MCP gateway owns upstream lifecycle and auth | Runtime terminal cannot bypass MCP policy |
| 14 | Spec 208 Computer Use | Computer Use is partial/gated and separately owned | Terminal/runtime access does not grant GUI/browser authority |
| 15 | Spec 207 economics | Current credits/reservations/settlements are partial relative to target ledger | Runtime emits facts; it does not own wallet/payout/finality |
| 16 | Tenant/auth/secrets | Server-derived Job/Runner authority exists | Client provider/tenant/runner values and raw secrets remain non-authoritative |
| 17 | Persistence/migration | Proposed route-attempt fields have no current migration | Added explicit shared migration/subordinate-record gate |
| 18 | Lifecycle/effect | ACK, provider session state and cleanup are not equivalent effects | Required effect receipts, outbox and reconciliation proof |
| 19 | Release/conformance | Upstream versions/licenses are not local implementation proof | Required re-probe, pin, license, isolation, conformance and rollback gates |
| 20 | Final convergence | No duplicate authority should be added; implementation is absent | Closed documentation gaps and recorded remaining implementation gates |

Revision 7 adds **20 repository-focused passes**, bringing the recorded audit
history to **156 focused passes** (136 prior passes + 20 repository passes).


# 151. Implementation Order

Recommended order:

```text
Phase 1 — Runtime Fabric interfaces
  AgentProtocolAdapter
  SessionRuntimeProvider
  route tuple
  route resolver

Phase 2 — ACP core
  v1 client
  bounded framing/backpressure
  request receipt ledger
  process/connection topology policy
  HOL detection
  history replay completeness
  effective session config fingerprint/epoch
  session-origin classification
  provider-child process custody
  turn-vs-session activity model
  out-of-turn request router
  background-task policy/custody
  context-limit resume recovery
  duplicate/ordering guard
  fake ACP agent
  initialize/capabilities
  session/prompt/events
  permission evidence binding
  filesystem/terminal
  auth/continuation epochs
  cancellation escalation/reconcile

Phase 3 — ACP agent profiles
  Codex ACP
  Claude Agent ACP
  optional third-party Antigravity ACP candidate
  ACP Registry snapshot/provenance
  certification matrix

Phase 4 — Gas City Bridge
  install/probe
  local IPC
  dedicated managed profile
  supervisor executable attestation
  managed cache generation
  runtime.Provider mapping
  subprocess provider
  tmux provider
  authoritative read barrier
  store-backend selection
  store process/endpoint generation
  store/version migration guard
  scoped repair convergence
  maintenance/recovery state
  reconcile

Phase 5 — ACP over Gas City
  Gas City ACP provider
  provider-process custody
  route composition
  long-lived pool soak
  comparison vs direct ACP

Phase 6 — Managed City
  delegation lease
  provider-start lease / desired revision
  bounded pools
  ownership/assignee epochs
  work-claim CAS
  demand identity/dedup + multi-rig scope
  unique pool workspaces
  fresh/resume continuation policy
  internal work projection
  startup blocker handling
  control-loop SLOs
  store growth/compaction/backup SLOs
  drain/reconcile
  health/store recovery handling

Phase 7 — Advanced
  Kubernetes provider
  pack/formula bounded execution
  fleet UX
  enterprise isolation

Phase 8 — ACP v2
  only after stable
```

---

# 152. P0 / P1 / P2

## P0

```text
Runtime Fabric contracts
ACP v1 direct including resume/close
Codex ACP
Claude Agent ACP
ACP registry provenance snapshot
worker_jobs normalization
approval bridge
workspace security
cancel/reconcile
Spec 210 interoperability
```

## P1

```text
Gas City Bridge
dedicated managed profile
subprocess/tmux
ACP-over-Gas-City
provider process-custody verification
Beads/store compatibility guard
delegation records
pool soak/health/reconcile
UI diagnostics
```

## P2

```text
Managed City fleet
pools
Kubernetes
formulas/packs
ACP v2 future
additional ACP agents
```

---

# 153. Architecture Decisions

1. ACP and Gas City are complementary layers.
2. ACP v1 is production baseline.
3. ACP v2 is experimental until officially stable and certified.
4. SmartAIHub implements an ACP Client in Runner.
5. Claude Agent ACP and Codex ACP are first-class profiles.
6. Direct ACP is preferred for simple single-agent work when eligible.
7. Gas City is selected only when it adds session/fleet/runtime value.
8. Gas City Provider Bridge is the preferred initial integration.
9. Full Managed City is optional and bounded.
10. Gas City Beads never replace `worker_jobs`.
11. Gas City Formulas/Orders never replace Spec 209 workflows.
12. Gas City controller owns only delegated child runtime state.
13. SmartAIHub cancellation/revocation prevents runtime resurrection.
14. Route selection is two-dimensional: protocol + session runtime.
15. Spec 210 Orca remains a valid sibling runtime.
16. Structured protocols are preferred when they satisfy requirements, but no route is globally mandatory.
17. ACP permissions never override SmartAIHub approval policy.
18. SmartAIHub capabilities/MCP remain centrally governed.
19. Child agents/subagents consume parent delegation budget.
20. Every runtime/provider tuple requires independent certification.
21. Supply-chain/runtime versions are pinned and evidenced.
22. `worker_jobs` remains durable truth.
23. Final SmartAIHub verification remains mandatory.
24. The architecture can remove/replace Gas City or ACP adapters without changing product-domain job/workflow contracts.
25. ACP Registry is discovery/provenance input, not an automatic production update channel.
26. Stable ACP v1 resume/close are supported without waiting for ACP v2.
27. Provider-adapter effective sandbox/workspace policy is attested after creation/resume where possible.
28. Third-party Antigravity ACP remains independently certified and never silently replaces Orca.
29. Gas City logical session settlement is separate from provider-process cleanup.
30. Gas City store schema migration is a coordinated data migration with explicit rollback limits.
31. Warm/projected Gas City reads are not sufficient evidence for destructive reconciliation.
32. Long-lived pool health requires progress/soak evidence, not only a live supervisor process.
33. ACP permission approval binds to complete normalized effect context and fails closed when material context is undecodable.
34. ACP transport/resource bounds are part of the security boundary.
35. Protocol support and SDK-path support are independently certified.
36. Gas City work ownership uses liveness/generation evidence, not stale assignee strings.
37. Unknown/failed-create runtime states require bounded escape and cannot hot-loop indefinitely.
38. Gas City startup trust prompts are policy/approval events, not generic dialogs to auto-dismiss.
39. Pool writers require unique workspace identity per live slot/session.
40. Runtime control-loop health is part of admission eligibility.
41. Usage counter semantics are explicit before economic settlement.
42. Active-session migration across runtime upgrades requires its own compatibility proof.
43. ACP process multiplexing is an independently certified optimization, not the default assumption.
44. Session resume success is distinct from complete history replay.
45. Async user-response transport acceptance is distinct from agent consumption.
46. Unknown ACP updates may be forward-compatible data but never forward-compatible authorization.
47. Gas City store backend is explicitly selected; Dolt/Beads is not required merely because Gas City is installed.
48. Managed store process generations are fenced by storage-lock ownership, not TCP readiness alone.
49. Store growth, compaction and backup health are part of route eligibility.
50. Policy-critical store read failure never silently becomes a meaningful default.
51. Test environments are cryptographically/operationally isolated from production stores and credentials.
52. Infrastructure maintenance is a durable platform state, not an informal operator procedure.
53. ACP foreground turn settlement and ACP session quiescence are independent state dimensions.
54. Background permission/input channels remain live outside foreground prompt lifetime.
55. Follow-up user messages do not imply blanket cancellation of background work.
56. Provider conversation identity has its own continuation epoch beyond ACP session id.
57. Gas City provider start and internal work claim are generation/lease fenced.
58. Pool demand counts logical executable work, not raw record cardinality.
59. Fresh wake semantics are verified at provider conversation identity, not inferred from metadata.
60. Runtime liveness observations are normalized and confidence/freshness aware.
61. Public release metadata is revalidated; unverified future versions are never normative baselines.
62. Gas City, Beads and Dolt compatibility is an explicit tuple, never `latest + latest`.
63. Resuming an ACP session is valid only if its effective execution configuration fingerprint is still satisfied.
64. Provider child processes are explicitly owned; repeated resume cannot create unbounded hidden children.
65. Provider session discovery is classified by origin; child/sidechain sessions are not user top-level sessions.
66. ACP response arrival order is never authority; request id + generation is.
67. Runtime projections/caches never authorize duplicate-producing or destructive Gas City transitions without an authoritative read barrier.
68. Graph-owning store scope and dispatcher scope must match.
69. Running supervisor binary identity is part of post-upgrade readiness.
70. Cross-runtime fallback is an ownership handoff, not merely a new adapter start.
71. Kubernetes pod identity is incarnation-based and eviction is reconciled before replacement.
72. Mutable runtime caches are tenant/profile scoped by default.

---

# 154. References

ACP:

- https://github.com/agentclientprotocol
- https://github.com/agentclientprotocol/agent-client-protocol
- https://github.com/agentclientprotocol/agent-client-protocol/releases
- https://github.com/agentclientprotocol/typescript-sdk
- https://github.com/agentclientprotocol/rust-sdk
- https://github.com/agentclientprotocol/claude-agent-acp
- https://github.com/agentclientprotocol/codex-acp
- https://github.com/agentclientprotocol/registry
- https://github.com/chicagobuss/antigravity-acp
- https://agentclientprotocol.com/

Gas City:

- https://github.com/gastownhall/gascity
- https://github.com/gastownhall/gascity/releases
- https://github.com/gastownhall/gascity/wiki
- https://github.com/gastownhall/gascity/blob/main/engdocs/architecture/nine-concepts.md
- https://github.com/gastownhall/gascity/blob/main/engdocs/architecture/glossary.md
- https://github.com/gastownhall/gascity/blob/main/docs/reference/exec-session-provider.md

Relevant Gas City reliability evidence considered during design:

- https://github.com/gastownhall/gascity/issues/2987
- https://github.com/gastownhall/gascity/issues/3387
- https://github.com/gastownhall/gascity/issues/816

- https://github.com/gastownhall/gascity/issues/1052
- https://github.com/gastownhall/gascity/issues/112
- https://github.com/gastownhall/gascity/issues/2983
- https://github.com/gastownhall/gascity/issues/3629
- https://github.com/gastownhall/gascity/issues/2987
- https://github.com/gastownhall/gascity/issues/773
- https://github.com/gastownhall/gascity/issues/1056

- https://github.com/gastownhall/gascity/issues/2740
- https://github.com/gastownhall/gascity/issues/3174
- https://github.com/gastownhall/gascity/issues/3176
- https://github.com/gastownhall/gascity/issues/1930
- https://github.com/gastownhall/gascity/issues/245
- https://github.com/gastownhall/gascity/issues/3754

- https://github.com/gastownhall/gascity/issues/2205
- https://github.com/gastownhall/gascity/issues/3466
- https://github.com/gastownhall/gascity/issues/774
- https://github.com/gastownhall/gascity/issues/469
- https://github.com/gastownhall/gascity/issues/3101

- https://github.com/gastownhall/gascity/issues/2408
- https://github.com/gastownhall/gascity/issues/4895
- https://github.com/gastownhall/gascity/issues/5218

- https://github.com/gastownhall/gascity/issues/663
- https://github.com/gastownhall/gascity/issues/1424
- https://github.com/gastownhall/gascity/issues/1542
- https://github.com/gastownhall/gascity/issues/76
- https://github.com/gastownhall/gascity/issues/482

Companion SmartAIHub specifications:

- Spec 186 — Unified Job Control Plane
- Spec 196 — Universal AI Assistant / shared orchestrator
- Spec 199 — External MCP Gateway
- Spec 200 — Universal External Agent Control Plane
- Spec 206 — A2A-First Hybrid External Agent Interoperability
- Spec 207 — Economic Control Plane
- Spec 208 — Hybrid Computer Use Engine
- Spec 209 — AI Workflow Studio
- Spec 210 — Orca Runtime Adapter & CLI Agent Execution Bridge

---

# 155. Final Architecture Snapshot

```text
                         SmartAIHub
                  Web / Assistant / Workflow
                              │
                              ▼
                     Shared Orchestrator
                              │
                              ▼
                     Capability Resolver
                              │
                              ▼
                       Spec 206 Router
                   ┌──────────┴──────────┐
                   │                     │
                  A2A             Spec 200 Native
                   │                     │
                   │                     ▼
                   │            Spec 211 Runtime Fabric
                   │                     │
                   │           ┌─────────┴─────────┐
                   │           │ Agent Protocol     │
                   │           ├ ACP v1             │
                   │           ├ Native Structured  │
                   │           └ CLI/TUI            │
                   │                     │
                   │           ┌─────────┴─────────┐
                   │           │ Session Runtime    │
                   │           ├ Direct Runner      │
                   │           ├ Gas City           │
                   │           ├ Orca / Spec 210    │
                   │           └ Generic PTY        │
                   │                     │
                   │              SmartAIHub Runner
                   │                     │
                   │       ┌─────────────┼───────────────┐
                   │       ▼             ▼               ▼
                   │   Claude ACP     Codex ACP      Antigravity/CLI
                   │       │             │               │
                   │       └──────┬──────┘               │
                   │              │                      │
                   │      Optional Gas City              │
                   │     runtime.Provider/fleet          │
                   │       │   │   │   │                 │
                   │      ACP tmux subproc k8s           │
                   │                                      │
                   └──────────────────┬───────────────────┘
                                      │
                            Shared SmartAIHub Services
             ┌────────────────────────┼────────────────────────┐
             ▼                        ▼                        ▼
        worker_jobs            Capability Gateway           Library
                                   │
                              Skill / Spec 199
             │                        │                        │
             └──── Approval / Billing / Audit / Verification ─┘
```

The system is successful when SmartAIHub can choose the least-fragile, policy-compliant execution route for each task without forcing users to understand the underlying protocol/runtime and without surrendering durable control to any external framework.
