# Spec 215 — Workflow Compiler & Runtime Execution Architecture v4
## Compile, Resolve, Schedule, Execute, Resume, Recover & Verify Canonical Workflows

**Status:** Proposed / Implementation Specification  
**Spec ID:** 215  
**Revision:** 4 — Spec 229 Retrieval Broker runtime binding and retrieval evidence finality
**Date:** 2026-09-22  
**Suggested repository path:** `specs/feature/215-workflow-compiler-runtime-execution-architecture/spec.md`  
**Primary purpose:** Own canonical workflow compilation and runtime execution for Node Types defined by Spec 214.  
**Companion specs:** Spec 209, Spec 212, Spec 214, Feature 195, Specs 199/200/206/207/208/211.

---

## 0.1 Codebase alignment snapshot — 2026-09-22

`apps/web/server/services/workflowCompilerRuntimeContracts.ts` currently provides the partial WorkflowDefinition v2, typed bindings/scopes/policies/instrumentation, deterministic Spec 215 plan v3, logical run/node-attempt types and a Feature 195 job-definition handoff. `workflowStudioRuntime.ts` and the Workflow Studio router consume related slices, but persistence and run control still include the existing Studio path; durable scheduling, leases, checkpoints, provider adapters and full R20 execution certification are not proven by these contracts.

The physical handoff remains the existing `JobDefinition`/Feature 195 shape (`feature-186-v1`), not a second queue or a new settlement ledger. Persisted Workflow Studio data exists through migration `0341_feature_209_workflow_studio.sql`; migration and rollback gates must not be replaced by a clean-slate assumption.

# 0. Executive Decision

Spec 215 SHALL be the canonical owner of **Workflow Definition execution structure, compilation and runtime execution semantics**.

Revision 2 defined the clean semantic contract aligned with the Spec 214 manifest schema v4. The current repository does not prove that deployed persisted workflows are absent, so compatibility inventory and rollback remain implementation gates for the 112 pre-canonical `nodeType` names.

```text
Spec 209 AI Builder / Workflow Studio
       ↓
WorkflowDefinition
       ├─ WorkflowInterface
       ├─ 16 Spec 214 Node Types
       ├─ WorkflowBindings
       ├─ Edges
       ├─ ExecutionScopes
       ├─ PolicyAttachments
       └─ InstrumentationAttachments
       ↓
Spec 215 Compiler
       ↓
Immutable ExecutionPlan
       ↓
WorkflowRun
       ↓
NodeRun / NodeAttempt
       ↓
Capability + Placement Resolver
       ↓
server / browser / Runner / cloud / external
       ↓
Feature 195 worker_jobs where physical async work is required
       ↓
validated commit / downstream dispatch
```

Spec 215 MUST NOT create:

- a second Node Type registry;
- fake Node Types for inputs/outputs, retry, checkpoint, parallel forks, observability or context binding;
- a second durable worker-job source of truth;
- a second Marketplace/Capability Lab.

The engine SHALL compile the clean semantic model directly rather than normalizing legacy node IDs through compatibility aliases.

---

# 1. Ownership Boundary

| Concern | Owner |
|---|---|
| Authoring UX / AI Builder / Canvas | Spec 209 |
| Marketplace / Use Case / Variants / certification | Spec 212 |
| Node Type semantics / manifest / registry / lifecycle | Spec 214 |
| Workflow compiler / plan / logical runtime | **Spec 215** |
| Physical durable worker job lifecycle | Feature 195 / `worker_jobs` |
| External Agent gateway | Spec 200 |
| A2A | Spec 206 |
| Computer Use engine | Spec 208 |
| ACP/runtime fabric | Spec 211 |
| Billing/economic authorization | Spec 207 |

---

# 2. Objectives

Spec 215 MUST support:

- typed `WorkflowInterface` inputs/outputs without executable input/output nodes;
- typed non-edge bindings for literal/context/config/secret/artifact/previous-run sources;
- synchronous/asynchronous/streaming/long-running work;
- suspend/resume and human-in-the-loop;
- triggers/schedules/webhooks/events;
- deterministic routing, implicit graph fan-out, concurrency scopes, joins, loops and subflows;
- model/agent/capability/retrieval/artifact/verifier execution;
- Server, Browser, Runner, cloud-container and external execution;
- MCP/A2A/ACP/external-agent adapters;
- retry, timeout, checkpoint, cancellation and compensation as policies/runtime behavior;
- error boundaries and transaction/saga scopes;
- idempotency and uncertain external outcomes;
- partial rerun/backfill/fork/repair;
- artifacts, provenance and lineage;
- security, live policy, credentials and data-governance checks;
- quotas, fairness, cost and admission control;
- trace/audit/metrics through instrumentation declarations;
- rolling upgrades, disaster recovery and historical replay;
- all current Spec 212 use cases without inventing node types for runtime/control-plane concerns.

---

# 3. Canonical Lifecycle

```text
Author / AI Builder
  ↓
WorkflowDefinition
  ↓
Validate WorkflowInterface + non-node constructs
  ↓
Resolve/pin Spec 214 manifests and NodeBindingRefs
  ↓
Static graph / scope / policy validation
  ↓
Compile
  ↓
Immutable ExecutionPlan + lock
  ↓
Deploy Revision
  ↓
Trigger / manual invocation
  ↓
WorkflowRun
  ↓
Resolve initial WorkflowBindings
  ↓
Ready NodeRuns
  ↓
NodeAttempt(s)
  ↓
Resolve concrete binding + placement + live policy
  ↓
Invoke runtime adapter / worker_job
  ↓
Validate result
  ↓
Atomic commit + outbox
  ↓
Advance data/control/error/event flow
  ↓
Complete / suspend / fail / cancel / compensate
  ↓
Resolve WorkflowInterface outputs
```

---

# 4. WorkflowDefinition

```ts
interface WorkflowDefinition {
  schemaVersion: "2";
  workflowId: string;
  version: string;

  interface: WorkflowInterface;

  nodes: NodeInstance[];          // Spec 214 v4
  edges: WorkflowEdge[];

  bindings?: WorkflowBinding[];
  scopes?: ExecutionScope[];
  policies?: PolicyAttachment[];
  instrumentation?: InstrumentationAttachment[];

  variables?: VariableDefinition[];
  metadata?: Record<string, unknown>;
}
```

Saved authoring state MAY contain layout metadata in Spec 209, but executable semantics MUST normalize to this contract.

## 4.1 WorkflowInterface — input/output are not Node Types

```ts
interface WorkflowInterface {
  inputs: Record<string, WorkflowInputDefinition>;
  outputs: Record<string, WorkflowOutputDefinition>;
}

interface WorkflowInputDefinition {
  schema: JsonSchema202012;
  required?: boolean;
  default?: unknown;
  artifactMode?: boolean;
  uiHints?: Record<string, unknown>;
}

interface WorkflowOutputDefinition {
  schema: JsonSchema202012;
  source: WorkflowOutputSource;
  uiHints?: Record<string, unknown>;
}
```

Spec 209 MAY render virtual Input/Output cards, but they MUST NOT have Spec 214 `typeId`s or create `NodeRun`s.

## 4.2 WorkflowBinding — non-edge data sources

Edges are reserved for node-to-node graph relationships. Values that do not come from another node use a typed binding.

```ts
type NonEdgeValueSource =
  | { kind: "workflow-input"; inputId: string }
  | { kind: "literal"; value: unknown }
  | { kind: "variable"; variableId: string }
  | { kind: "context"; scope: "tenant" | "user" | "workspace" | "project"; key?: string }
  | { kind: "config"; key: string }
  | { kind: "secret-ref"; secretRef: string }
  | { kind: "artifact-ref"; artifactRef: string }
  | { kind: "previous-run"; workflowId: string; outputId: string; selector: string };

type WorkflowOutputSource =
  | NonEdgeValueSource
  | { kind: "node-output"; nodeId: string; portId: string };

interface WorkflowBinding {
  id: string;
  targetNodeId: string;
  targetPortId: string;
  source: NonEdgeValueSource;
}
```

Rules:

- node-output to node-input is represented by `WorkflowEdge`, not duplicated as a binding;
- a target port MUST NOT receive both an edge and a non-edge binding unless the port is `cardinality=many` and the manifest explicitly permits mixed sources;
- `WorkflowOutputSource.node-output` is allowed only for the workflow's external output mapping;
- secret values are never persisted, only `secretRef`;
- connector/provider credentials SHOULD normally resolve through node security/credential requirements rather than ordinary data ports; `secret-ref` data binding is allowed only when the target contract explicitly accepts secret-classified data and runtime redaction rules apply;
- context/config/previous-run bindings declare freshness and authorization semantics at compile/run policy level;
- bindings that can vary at run time MUST be captured in the replay envelope when material to reproducibility.

## 4.3 ExecutionScope — graph semantics that are not nodes

```ts
type ExecutionScopeKind =
  | "concurrency"
  | "error-boundary"
  | "transaction-saga"
  | "isolation";

interface ExecutionScope {
  scopeId: string;
  kind: ExecutionScopeKind;
  contractVersion: string;
  nodeIds: string[];
  parentScopeId?: string;
  config: unknown; // MUST validate against the versioned scope-kind schema
}
```

Required profiles include:

```text
ConcurrencyScope:
  maxParallel
  fairness/priority
  failFast / continue
  cancellation propagation

ErrorBoundaryScope:
  handled categories
  catch route
  finally route
  propagation rule

TransactionSagaScope:
  commit boundary
  compensation order/policy
  uncertain-outcome handling
```

A static parallel fork is represented by multiple enabled outgoing branches plus optional `ConcurrencyScope`; no `flow.parallel` Node Type exists.

Scope rules:

- structural scopes MAY nest;
- partial overlap of two scopes of the same structural kind is forbidden unless the descriptor explicitly defines deterministic overlap semantics;
- dynamic loop/subflow activations inherit applicable ancestor scopes unless the compiled child contract explicitly establishes a new boundary;
- budget/quota/residency concerns are policies targeted to a workflow/node/scope, not additional scope kinds.

## 4.4 PolicyAttachment — operational behavior, not semantic nodes

```ts
type RuntimePolicyKind =
  | "retry"
  | "timeout"
  | "checkpoint"
  | "cache"
  | "fallback"
  | "circuit-breaker"
  | "budget"
  | "quota"
  | "admission"
  | "retention"
  | "residency";

interface PolicyAttachment {
  policyId: string;
  kind: RuntimePolicyKind;
  policyVersion: string;
  target:
    | { kind: "workflow" }
    | { kind: "node"; nodeId: string }
    | { kind: "scope"; scopeId: string };
  config: unknown; // MUST validate against PolicyDescriptor(kind, policyVersion)
}
```

A semantic business retry such as “revise until verifier passes” is modeled explicitly with `flow.loop`. Engine retry for transient failure is a retry policy.

## 4.5 InstrumentationAttachment — observability is not a node

```ts
type InstrumentationKind = "trace" | "log" | "metric" | "audit-annotation" | "status-projection";

interface InstrumentationAttachment {
  id: string;
  kind: InstrumentationKind;
  instrumentationVersion: string;
  target:
    | { kind: "workflow" }
    | { kind: "node"; nodeId: string }
    | { kind: "scope"; scopeId: string };
  config: unknown; // MUST validate against the instrumentation descriptor schema
}
```

Instrumentation MUST NOT alter graph business semantics or create fake workflow dependencies.

## 4.5.1 Versioned non-node descriptor registries

`ExecutionScope`, `PolicyAttachment` and `InstrumentationAttachment` MUST NOT become new untyped JSON escape hatches.

Spec 215 SHALL maintain versioned descriptors/schemas for:

```text
scope kind + contractVersion
policy kind + policyVersion
instrumentation kind + instrumentationVersion
```

Registration/compilation MUST reject unknown or schema-invalid configurations.

Each policy descriptor MUST also declare how multiple applicable policies combine:

```ts
type PolicyMergeStrategy =
  | "replace-by-specificity"
  | "most-restrictive"
  | "compose"
  | "forbid-overlap";

interface PolicyDescriptor {
  kind: RuntimePolicyKind;
  version: string;
  schema: JsonSchema202012;
  mergeStrategy: PolicyMergeStrategy;
}
```

Compiler computes an effective policy deterministically from workflow → outer scope → inner scope → node, following the descriptor's merge strategy. Security/governance policy MAY further restrict the compiled result at runtime; it cannot be weakened by a more specific authoring attachment.

## 4.6 Workflow variables — immutable by default

Generic mutable shared variables create race conditions under parallel execution and replay.

```ts
interface VariableDefinition {
  variableId: string;
  schema: JsonSchema202012;
  source: NonEdgeValueSource;
}
```

Workflow variables are resolved once for a `WorkflowRun` and are immutable thereafter.

State that evolves across iterations belongs to explicit `flow.loop` state. Durable external state belongs to a capability/artifact/state service with its own concurrency contract.

This rule eliminates hidden shared-memory semantics from the workflow graph.

## 4.7 Control-plane/runtime services are not authorable nodes

The following are engine/control-plane APIs unless deliberately exposed as a real business capability:

```text
capability search / describe / status / result
Runner/worker job status and lease operations
browser observe/action low-level primitives
agent fleet/session administration
SmartAIHub economic reserve/capture/release/status internals
cache/queue/circuit-breaker administration
```

AI Builder SHALL NOT place these services into normal user workflows.

---

# 5. Edge Contract

```ts
interface WorkflowEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  channel: "data" | "control" | "error" | "event";
  condition?: string;
  metadata?: Record<string, unknown>;
}
```

Rules:

- edges are the canonical source of truth for node-to-node dependency;
- `WorkflowBinding` is the canonical source for non-node values;
- compiler-generated input bindings are execution-plan output, not authoring truth;
- multiple enabled outgoing branches create graph fan-out naturally;
- route choice is controlled by `flow.router`;
- synchronization is controlled by `flow.join`;
- error routes may cross an `ErrorBoundaryScope` only according to scope policy.

---

# 6. Compiler Responsibilities

Compiler MUST:

1. validate the `WorkflowInterface`;
2. resolve exact Spec 214 v4 Node Type versions/manifests;
3. validate `NodeBindingRef` kind and concrete descriptor compatibility;
4. project binding-derived port/config schemas deterministically;
5. validate NodeInstance config;
6. validate edges/ports/channel semantics;
7. validate `WorkflowBinding` targets/sources and secret/context policy requirements;
8. validate schema compatibility/nullability;
9. resolve defaults/overrides deterministically;
10. build control-flow and data dependency graphs;
11. validate `ExecutionScope` nesting and policy attachments;
12. treat multiple ready branches as concurrent work without requiring a fork node;
13. validate router/join/loop/subflow semantics;
14. reject uncontrolled cycles;
15. validate structured loop termination/bounds;
16. validate subflow recursion/bounds;
17. detect unreachable nodes, impossible joins and scope deadlocks where analyzable;
18. validate error-boundary and transaction/saga semantics;
19. resolve runtime requirements from Spec 214 manifests;
20. validate capability/model/agent/workflow/retrieval bindings against pinned registry snapshots;
21. validate protocol/runtime adapter compatibility;
22. validate static security/data-governance constraints;
23. identify human/external/time/session waits;
24. resolve fixed/compile-time derived effects and mark runtime-preflight effects;
25. compile operational policies separately from semantic nodes;
26. compile instrumentation separately from semantic nodes;
27. canonicalize definition/config/bindings/scopes/policies before hashing;
28. produce immutable `ExecutionPlan`.

Compiler MUST NOT:

- execute material side effects;
- reintroduce any of the removed 112 node IDs;
- synthesize hidden retry/checkpoint/parallel/input/output nodes;
- infer provider-specific semantic node types.

---

# 7. CompiledNode

```ts
interface CompiledNode {
  nodeId: string;
  typeId: string;              // one of Spec 214 canonical/approved extension types
  typeVersion: string;
  manifestDigest: string;

  binding?: ResolvedNodeBinding;
  resolvedConfig: Record<string, unknown>;

  inputBindings: CompiledInputBinding[];
  controlRoutes: CompiledControlRoute[];

  runtimeRequirement: RuntimeRequirementContract;
  executionDeclaration: ExecutionDeclaration;
  securityRequirement: SecurityRequirementContract;
  dataGovernance?: DataGovernanceDeclaration;

  resolvedEffects?: EffectContract;
}
```

`CompiledNode.inputBindings` may combine edge-derived data and normalized non-edge `WorkflowBinding` sources, but the compiler MUST retain provenance of which authoring construct produced each binding.

---

# 8. Immutable ExecutionPlan

```ts
interface ExecutionPlan {
  planId: string;
  workflowId: string;
  workflowVersion: string;
  planVersion: string;

  interface: CompiledWorkflowInterface;
  nodes: CompiledNode[];
  dependencies: ExecutionDependency[];

  scopes: CompiledExecutionScope[];
  policies: CompiledPolicyAttachment[];
  instrumentation: CompiledInstrumentationAttachment[];

  activationSources: CompiledTriggerSource[];
  directEntryNodes: string[];
  exitConditions: CompiledExitCondition[];

  lock: ExecutionPlanLock;
  createdAt: string;
}
```

`ExecutionPlanLock` MUST pin at least:

```text
workflow definition hash
compiler contract version
NodeTypeManifest digests
binding descriptor versions/digests
capability/model/agent/workflow registry snapshots or immutable refs
runtime adapter compatibility requirements
expression language version
schema dialect/version
policy contract versions
scope contract versions
```

Pinned semantics provide reproducibility. **Live security/governance/revocation is re-evaluated at run time** and is not frozen merely because the plan is pinned.

---

# 9. DeploymentRevision

```ts
interface DeploymentRevision {
  deploymentRevisionId: string;
  workflowId: string;
  planId: string;
  state: "draft" | "canary" | "active" | "shadow" | "paused" | "retired";
  cohortPolicyRef?: string;
  createdAt: string;
}
```

Deployment activation MUST materialize/refresh the plan's trigger subscriptions atomically enough that one logical deployment revision has a known trigger set.

Rollback changes which plan new runs receive. In-flight runs continue using their pinned plan unless an explicit migration/kill policy applies.

---

# 10. WorkflowRun

A run may be created by a deployed trigger, direct UI/API invocation, subflow invocation, replay/backfill or administrative repair.

```ts
type RunActivationContext =
  | { kind: "trigger"; triggerActivationId: string }
  | { kind: "manual"; invocationId: string }
  | { kind: "api"; invocationId: string; callerRef?: string }
  | { kind: "subflow"; parentWorkflowRunId: string; parentNodeRunId: string }
  | { kind: "replay"; sourceWorkflowRunId: string; replayMode: string }
  | { kind: "backfill"; backfillId: string }
  | { kind: "repair"; sourceWorkflowRunId: string; reasonRef: string };

interface WorkflowRun {
  workflowRunId: string;
  workflowId: string;
  planId: string;
  deploymentRevisionId?: string;

  activationContext: RunActivationContext;
  inputSnapshotRef: string;

  status:
    | "pending" | "running" | "waiting" | "suspended"
    | "completed" | "failed" | "cancelled" | "compensating";

  principalContext: ExecutionPrincipalContext;
  policySnapshotRefs: string[];

  startedAt?: string;
  completedAt?: string;
}
```

For trigger-created runs, `TriggerActivation` is the durable source evidence. For direct/manual/API invocation, the run starts from the validated `WorkflowInterface` input snapshot without synthesizing a trigger node.

---

# 11. NodeRun and NodeAttempt

`NodeRun` = one logical activation of a **non-trigger execution node**.

`NodeAttempt` = one physical attempt/retry/failover for that activation.

`core.trigger` uses `TriggerActivation` instead of `NodeRun`/`NodeAttempt`.

```ts
interface NodeRun {
  nodeRunId: string;
  activationId: string;
  workflowRunId: string;
  nodeId: string;
  scopePath: string;
  iteration?: number;

  status:
    | "pending" | "ready" | "running" | "waiting"
    | "completed" | "failed" | "cancelled" | "skipped";

  committedAttemptId?: string;
  outputSnapshotRef?: string;
  finalError?: NodeExecutionError;
}

interface NodeAttempt {
  attemptId: string;
  nodeRunId: string;
  attemptNumber: number;

  inputSnapshotRef: string;
  outputSnapshotRef?: string;
  error?: NodeExecutionError;

  jobId?: string;
  runnerId?: string;
  leaseFencingToken?: string;

  resolvedRuntime?: RuntimeIdentity;
  resolvedBindingRef?: string;
  resolvedEffects?: EffectContract;

  checkpointRef?: string;
  usageRef?: string;
  costRef?: string;
  traceId?: string;

  startedAt?: string;
  completedAt?: string;
}
```

Rules:

- retries MUST NOT overwrite prior attempt history;
- only one attempt may become the committed attempt for a logical NodeRun;
- failed/abandoned attempts remain queryable for diagnosis, cost reconciliation and audit;
- output commit is separate from provider completion and follows the atomic-completion rules later in this spec.

---

# 12. Feature 195 / worker_jobs Integration

Spec 215 owns logical workflow/runtime semantics. Feature 195 owns durable physical worker jobs.

Rule:

```text
NodeAttempt requiring async/heavy/remote physical work
          ↓
create/lease Feature 195 worker_job
          ↓
Runner/worker executes
          ↓
worker_job events/progress
          ↓
Spec 215 adapter translates result into NodeAttempt completion
```

No new `jobs` table/system may be created as an alternate source of truth for physical jobs.

---

# 13. Capability Resolver

For `ai.model`, `ai.agent`, `core.capability`, `data.retrieval`, `automation.computer_use` and verifier implementations, resolution MAY involve a capability.

```text
Compiled requirement
  ↓
Capability Registry candidates
  ↓
compatibility
  ↓
tenant/user entitlement
  ↓
policy / residency / data classification
  ↓
health / rate limit / quota
  ↓
cost / preference / quality
  ↓
selected capability binding
```

Existence of a capability does not imply runtime availability.

---

# 14. Placement Resolver

Candidate placements:

```text
server
browser
SmartAIHub Runner
cloud container
external runtime
```

Placement MUST consider:

```text
OS/GPU/RAM/VRAM requirements
network/local filesystem/browser requirements
data residency/classification
runtime health/capacity
user/tenant policy
artifact data locality
cost/budget
trust level
```

---

# 15. Runtime Adapter Contract

All adapters SHALL expose a normalized contract such as:

```ts
interface RuntimeAdapter {
  describeCapabilities(): Promise<RuntimeCapabilityAdvertisement>;
  preflight(req: PreflightRequest): Promise<PreflightResult>;
  invoke(req: InvocationRequest): Promise<InvocationHandle>;
  cancel(handle: InvocationHandle): Promise<CancelResult>;
  query(handle: InvocationHandle): Promise<InvocationStatus>;
  resume?(req: ResumeRequest): Promise<InvocationHandle>;
}
```

MCP, A2A, ACP, external agents, HTTP, Runner, browser and internal executors remain adapters beneath canonical semantics.

---

# 16. Live Policy Revalidation

Pinned plans MUST NOT freeze authorization.

Before material execution, revalidate where relevant:

```text
principal/session validity
scopes/grants
credential status/rotation/revocation
entitlements/license
current policy
approval freshness
budget/quota
package/runtime revocation
provider/capability health
residency/data classification
kill switch / incident state
```

A historical plan cannot resurrect revoked authority.

---

# 17. Trigger Runtime

`core.trigger` is an **activation semantic**, not a normal scheduled compute node.

At deployment, Spec 215 materializes subscriptions/schedules/endpoints from the compiled `TriggerDescriptor`.

When an external trigger fires:

```text
source event
  ↓
authenticate / verify source
  ↓
deduplicate / replay-protect
  ↓
normalize EventEnvelope
  ↓
persist TriggerActivation
  ↓
create WorkflowRun + activationContext(kind=trigger)
  ↓
make trigger output available to downstream edges
```

```ts
interface TriggerActivation {
  triggerActivationId: string;
  deploymentRevisionId: string;
  triggerNodeId: string;

  event: EventEnvelope;
  dedupeKey?: string;
  authEvidenceRef?: string;

  acceptedAt: string;
  workflowRunId: string;
}
```

A `core.trigger` activation does **not** create a normal `NodeAttempt`. Its external activation record is the source-of-truth evidence for the trigger output.

Supported trigger descriptor classes include:

```text
schedule / cron / calendar
webhook
chat / email event
Library asset-created
job completed
provider callback
MCP/A2A invocation
Runner state
approval resolved
custom registered trigger source
```

Manual/API/UI invocation creates a `WorkflowRun` directly from `WorkflowInterface` and does not synthesize a trigger node.

Requirements:

- authorization/source authenticity;
- deduplication and idempotency;
- timezone/DST handling;
- missed trigger/misfire policy;
- callback authenticity;
- replay protection;
- correlation/causation IDs;
- durable subscription identity;
- payload schema validation before run creation.

---

# 18. Event Envelope

```ts
interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  source: string;
  occurredAt: string;
  receivedAt: string;
  correlationId?: string;
  causationId?: string;
  partitionKey?: string;
  sequence?: string | number;
  schemaVersion: string;
  payload: T;
}
```

Late/duplicate/out-of-order events MUST have explicit handling.

---

# 19. Time Semantics

Distinguish:

```text
wall clock
monotonic duration
scheduled time
trigger event time
processing time
deadline
```

Timeouts SHOULD use monotonic duration. Schedule/calendar behavior MUST use explicit timezone and DST policy.

---

# 20. Router Runtime

`flow.router` selects routes deterministically from compiled rules/predicates/model-classification outputs as declared.

The runtime MUST record:

```text
input snapshot reference
rule/expression version
selected route(s)
reason/evidence where available
```

---

# 21. Fan-Out, Concurrency and Join Runtime

There is no `flow.parallel` Node Type.

## 21.1 Fan-out

After a durable upstream commit, every downstream branch whose dependencies are satisfied becomes independently ready.

Scheduler MAY run ready branches concurrently subject to:

```text
ConcurrencyScope
tenant/workspace quotas
priority/fairness
resource availability
budget reservations
data residency / placement
```

No synthetic fork `NodeRun` is created.

## 21.2 Dynamic fan-out

Per-item/dynamic expansion belongs to `flow.loop`, which creates deterministic iteration activations under compiled bounds.

## 21.3 Join

`flow.join` is the explicit fan-in synchronization primitive.

Supported semantics include:

```text
all
any
n-of-m
barrier
race
```

Data-record merging after synchronization is a separate `data.transform` responsibility.

Compiler MUST reject impossible join requirements where statically provable. Runtime MUST handle cancellation/late branch completion according to compiled join policy.

---

# 22. Loop Runtime

`flow.loop` MUST be structured and bounded.

Policies may include:

```text
maxIterations
maxConcurrency
timeout
budget
terminationCondition
onLimit
```

Dynamic map keys/activation IDs MUST be deterministic for replay.

---

# 23. Subflow Runtime

`flow.subflow` resolves a published workflow/subflow version/range to a pinned compiled plan.

Runtime MUST enforce:

```text
input/output contracts
recursion depth
nested run budgets
cancellation propagation
trace causality
permission delegation
```

---

# 24. Durable Execution

Long-running runs MUST survive:

```text
process restart
server deployment
Runner disconnect
network failure
provider callback delay
human approval delay
browser closure
temporary infrastructure outage
```

Checkpoint state requires versioned compatibility and migration policy.

---

# 25. Checkpoint Contract

```ts
interface NodeCheckpoint {
  checkpointId: string;
  workflowRunId: string;
  nodeRunId: string;
  checkpointSchemaVersion: string;
  stateRef: string;
  reason: "interval" | "before-side-effect" | "after-side-effect" | "human-wait" | "external-wait" | "manual";
  createdAt: string;
}
```

Resume MUST revalidate live authority/policy/secrets/effects before continuing material work.

---

# 26. Retry and Idempotency

Retries MUST distinguish:

```text
transient provider/runtime failure
rate limit
infrastructure failure
validation failure
user correction required
policy block
unknown external outcome
non-retryable side effect
```

At-least-once delivery is the safe baseline for distributed work. Exactly-once business effect MUST be achieved through idempotency/receipt/reconciliation rather than assumed transport guarantees.

---

# 27. Lease and Fencing

Remote/worker attempts MUST use leases with fencing tokens so a stale worker cannot commit after another worker has taken ownership.

Atomic commit MUST reject stale fencing tokens.

---

# 28. Side Effects and Effect Resolution

Node manifest declares fixed/derived effect potential; runtime resolves the actual effect before credential delegation/approval consumption.

```ts
interface EffectContract {
  mutation: "none" | "read" | "write";
  boundary: "internal" | "external";
  reversible?: boolean;
}
```

Generic HTTP/Skill/agent nodes may require runtime preflight to determine conservative effects.

---

# 29. Uncertain External Outcome

For non-idempotent external writes, connection loss after dispatch may create an unknown outcome.

Runtime MUST support:

```text
SideEffectReceipt
external correlation/idempotency key
reconciliation query
UNKNOWN_EXTERNAL_OUTCOME state
manual repair/escalation
```

Blind retry is forbidden when duplication could be consequential.

---

# 30. Atomic Completion

A successful attempt is not complete until result commit is durable.

Recommended logical transaction:

```text
validate output
stage artifacts
validate policy/effect receipt
persist NodeAttempt completion
transition NodeRun
persist output references
write transactional outbox
commit
then dispatch downstream
```

Inbox/outbox/deduplication SHALL prevent duplicate downstream activation.

---

# 31. Human Approval Runtime

`human.approval` approval MUST bind to the exact material operation, including where applicable:

```text
plan hash
node/type/version
resolved effect
target/resource
material input digest
cost/budget scope
expiry
approval policy/quorum
```

Material changes invalidate approval and require re-approval.

Quorum/four-eyes independence rules must be enforceable for Spec 212 Revision 20 cases.

---

# 32. Human Input / Handoff

`human.input` supports wait/resume with a typed resume payload.

Requirements:

```text
actor/role validation
expiry/SLA
escalation/delegation
single-commit decision/input semantics
cancellation handling
audit trail
```

---

# 33. Streaming and Backpressure

Streaming runtimes MUST declare/control:

```text
ordering
chunk/event schema
bounded buffering
backpressure
consumer cancellation
cursor/checkpoint
partial failure
finalization
```

Unbounded in-memory buffering is forbidden.

---

# 34. Artifact Runtime

Artifacts SHOULD use references rather than workflow-state bytes.

```ts
interface ArtifactRef {
  artifactId: string;
  versionId?: string;
  mediaType?: string;
  sizeBytes?: number;
  integrity?: { algorithm: string; digest: string };
  storageClass?: string;
  classification?: string;
}
```

Materialization must enforce integrity, path safety, archive limits, access grants and residency.

---

# 35. Provenance and Lineage

For material outputs record enough lineage to answer:

```text
which WorkflowRun/NodeRun/Attempt created it
which source artifacts/data were used
which model/agent/capability/runtime was resolved
which versions/digests were active
which approval/policy allowed the operation
which cost was attributed
```

This is required for Spec 212 verification, replay, audit and copyright/evidence workflows.

---

# 36. Model Reproducibility

Record when material:

```text
model family
resolved provider/model
provider revision if available
prompt/instruction digest
structured output schema version
tool-set version
sampling parameters
```

Pinned metadata does not guarantee identical output from nondeterministic external models; it guarantees auditable resolution semantics.

---

# 37. Agent Runtime

`ai.agent` MAY bind to internal or external harnesses.

Runtime MUST separate:

```text
agent identity
model identity
runtime identity
protocol identity
tool/capability grants
memory scope
session/checkpoint identity
```

Do not equate Agent ≠ Model ≠ Runtime ≠ Protocol.

External sessions require recovery/reconciliation semantics.

---

# 38. Agent Memory

Memory scopes MUST be explicit, e.g.:

```text
node-run
workflow-run
conversation
project
user
tenant
external-session
```

Policy must prevent accidental cross-tenant/user leakage and define fork/replay behavior.

---

# 39. Computer Use Runtime

`automation.computer_use` may choose a strategy ladder, e.g.:

```text
WebMCP
→ accessibility/DOM deterministic action
→ Jev executor
→ vision/LLM fallback
→ desktop Runner / browser companion
```

The selected strategy is runtime policy/adapter detail. Safety approvals, observation/action traces, target identity and takeover must be recorded.

---

# 40. Capability Freshness and Drift

Resolver decisions MUST account for:

```text
capability health
adapter version
provider account availability
schema/capability drift
model retirement
rate-limit state
Runner capability freshness
package revocation
```

A stale cached resolution cannot override live critical safety/readiness information.

---

# 41. Scheduler, Priority, Fairness and Concurrency Scopes

Scheduler MUST consider:

```text
ready dependency state
ConcurrencyScope limits
tenant/workspace/user fairness
interactive vs bulk workload
aging / starvation prevention
priority inversion mitigation
resource class / GPU class
placement constraints
cost/budget reservation
provider/runtime health
```

A `ConcurrencyScope` is semantic execution structure compiled from WorkflowDefinition, while scheduler fairness is platform policy. The scheduler MUST NOT require a `flow.parallel` node to recognize concurrent ready work.

Admission control MAY reject/defer work before resource exhaustion rather than accepting unlimited work that will time out later.

---

# 42. Cost and Budget

Before expensive/side-effecting work, runtime SHOULD estimate/reserve budget where applicable.

Support hierarchical accounting:

```text
workflow budget
subflow budget
parallel branch budget
node attempt reservation
actual reconciliation/refund
```

Concurrent children must not independently overspend the same parent budget.

---

# 43. Cache Correctness

Caches require explicit scope:

```text
user
tenant
workspace
global/public
```

Cache keys MUST include all semantics material to correctness/security. Cache/stale-read behavior cannot bypass live authorization, revocation, policy or readiness checks.

Stampede control may use single-flight/prewarm/jitter where appropriate.

---

# 44. Error Contract

```ts
interface NodeExecutionError {
  code: string;
  category:
    | "validation" | "auth" | "permission" | "policy"
    | "rate_limit" | "timeout" | "provider" | "runtime"
    | "runner" | "user_input" | "external_outcome" | "internal";
  retryable: boolean;
  recoverable: boolean;
  message: string;
  detailsRef?: string;
}
```

Error-route precedence and failure policy must be deterministic.

---

# 45. Circuit Breaker and Fallback

Provider/capability health MAY use circuit breakers and failover.

Fallback is valid only when:

```text
semantic capability remains compatible
security/residency policy permits it
budget/quality constraints permit it
approval remains valid for material effect
output schema remains compatible
```

Fallback must be auditable.

---

# 46. Partial Execution

Support policy-controlled:

```text
run single node in safe test mode
run until node
run from node
rerun node
rerun from node
replay recorded inputs
backfill
fork run
repair run
```

Reusing committed outputs is allowed only when contracts/policy/data freshness make it safe.

---

# 47. Deterministic Replay Envelope

Replay metadata may include:

```text
planId
manifest/capability/runtime versions
recorded trigger/input/event data
nondeterministic input snapshots
artifact versions/digests
clock/random seeds when applicable
policy/approval evidence refs
```

Replay modes MUST distinguish exact recorded-input replay from “rerun now with live dependencies”.

---

# 48. Dynamic Expansion Policy

Agents MUST NOT arbitrarily mutate the canonical in-flight graph.

Dynamic work is allowed only through compiled contracts such as:

```text
flow.loop/map dynamic activations
approved subflow invocation
dynamic capability/tool selection within declared bounds
agent tool loop within ai.agent contract
```

Expansion limits MUST propagate hierarchically to prevent fan-out explosions.

---

# 49. Runtime Identity and Stable IDs

Dynamic activations require deterministic/stable identity components such as:

```text
workflowRunId
nodeId
scopePath
iteration/map key
activationId
attemptNumber
```

Collisions must fail rather than alias two logical activations.

---

# 50. Cancellation

Cancellation MUST propagate through:

```text
WorkflowRun
subflows
parallel children
NodeRuns
NodeAttempts
worker_jobs
stream consumers
external sessions where supported
```

Support graceful cancel deadline followed by kill escalation when allowed.

---

# 51. Observability

Record at minimum:

```text
trace/correlation/causation IDs
workflow/node/attempt IDs
resolved capability/runtime/provider
latency/progress
retry/fallback
cost/usage
artifact/evidence refs
policy/approval decisions
errors
```

Trace context is not an authorization token.

High-cardinality telemetry must be governed/sampled without losing critical audit evidence.

---

# 52. Audit Integrity

Security/financial/material side effects require tamper-evident audit capabilities appropriate to risk.

Audit retention, legal hold and privacy erasure/redaction are distinct concerns and MUST be modeled independently.

---

# 53. Data Classification and Purpose

Classification/trust/purpose metadata SHOULD propagate through node boundaries when material.

Placement/egress/provider use must respect:

```text
data classification
residency
purpose limitation
consent/policy
minimum necessary data
```

Untrusted retrieved/web/model content MUST NOT elevate tool privileges.

---

# 54. Credentials and Workload Identity

Credential material is resolved at runtime using short-lived/scoped grants where possible.

Support:

```text
rotation
expiry
revocation
least privilege
workload identity
mutual authentication where required
secret redaction
```

Credentials are never persisted in WorkflowDefinition.

---

# 55. Protocol Version Negotiation

MCP/A2A/ACP/external adapters MUST negotiate supported protocol versions/capabilities and fail closed on incompatible contracts.

Protocol evolution MUST NOT change canonical Node Type identity.

---

# 56. Runtime Environment Pinning

For reproducibility/diagnosis record material runtime identity, e.g.:

```text
container/package digest
OS/arch
Runner version
GPU runtime where relevant
ffmpeg/toolchain version
plugin/adapter version
```

---

# 57. Package/Runtime Revocation

A pinned historical plan may reference a package that is later revoked for security.

Runtime MUST prioritize live revocation/kill policy over reproducibility and refuse unsafe execution, while retaining enough metadata for diagnosis/migration.

---

# 58. Region / Residency / Failover

Cross-region failover is permitted only when current data-residency/security/certification policy allows it.

Control-plane availability and data-plane execution region are separate concepts.

---

# 59. Rolling Engine Upgrade

Long-running workflows require read-old/write-new compatibility or explicit migration.

A new engine version MUST NOT silently reinterpret persisted run/checkpoint state.

---

# 60. Suspended Run Liveness

Suspended runs need:

```text
wake-up subscription/condition identity
expiry/retention
watchdog
stale wait detection
callback/auth state
migration compatibility
```

A run may not remain silently suspended forever without observable state/policy.

---

# 61. Cleanup and Orphan Detection

Finalization/GC must cover:

```text
temporary artifacts
staged outputs
orphan worker_jobs
expired callbacks/subscriptions
agent sessions
leases
partial uploads
cache reservations
```

GC must respect lineage, legal hold and active references.

---

# 62. Administrative Intervention

Authorized operators MAY need:

```text
pause/resume
cancel
retry/reconcile
force-fail
repair state
release stuck lease
quarantine capability/runtime
break-glass override
```

All intervention is permissioned, reasoned and auditable.

---

# 63. Disaster Recovery

Backup/recovery scope includes more than workflow JSON:

```text
WorkflowRun
NodeRun
NodeAttempt
inbox/outbox/dedup
checkpoints
artifact metadata/references
side-effect receipts
trigger/suspended subscriptions
plan/deployment identity
```

Recovery drills SHALL test safe resume, not just data restoration.

---

# 64. Spec 212 End-to-End Coverage Pipeline

For each canonical use case:

```text
Spec 212 prompt
  ↓
Spec 209 AI Builder
  ↓
Spec 214 v4 real Node Type + binding selection
  ↓
WorkflowDefinition
  ├─ WorkflowInterface
  ├─ 16 canonical nodes
  ├─ bindings
  ├─ scopes
  ├─ policies
  └─ instrumentation
  ↓
Spec 215 compile/static validate
  ↓
binding/capability/runtime/protocol resolve
  ↓
policy/security/approval validate
  ↓
dry-run/mock/sandbox/E2E execution
  ↓
independent verification
  ↓
Spec 212 grading/certification
```

Failure attribution MUST distinguish at least:

```text
authoring failure
unknown Node Type
missing workflow construct
manifest/config/port failure
binding resolution failure
missing capability/model/agent/workflow descriptor
missing runtime/adapter
scope/policy compile failure
placement/residency block
permission/policy block
approval omission/expiry
runtime failure
provider failure
side-effect uncertainty
verification failure
```

A gap in a non-node construct MUST NOT be misreported as `MISSING_NODE_TYPE`.

---

# 65. Conformance Against the 16 Canonical Node Types

Spec 215 SHALL maintain compiler/runtime conformance tests for all Spec 214 v4 types:

```text
core.trigger
data.transform
ai.model
ai.agent
core.capability
data.retrieval
flow.subflow
flow.router
flow.join
flow.loop
human.approval
human.input
flow.wait
automation.computer_use
data.artifact
quality.verifier
```

Conformance suites MUST also cover the non-node contracts:

```text
WorkflowInterface
WorkflowBinding / SecretBinding / ContextBinding
ConcurrencyScope
ErrorBoundaryScope
TransactionSagaScope
PolicyAttachment
InstrumentationAttachment
```

A semantic type is not implemented merely because Studio can render it.

---

# 66. Core Node Runtime Semantics Matrix

| Spec 214 type | Compiler responsibility | Runtime responsibility |
|---|---|---|
| `core.trigger` | validate trigger descriptor/payload/security | ingest/dedupe/schedule and create WorkflowRun |
| `data.transform` | validate pure transform/expression/schema | execute bounded transform; cache only when safe |
| `ai.model` | validate model binding/output contract | resolve provider/model and invoke/stream |
| `ai.agent` | validate agent/tool/memory/grant requirements | establish/restore agent session and goal/tool loop |
| `core.capability` | project capability schemas/effects | resolve binding, preflight effects, invoke adapter |
| `data.retrieval` | validate source/query/provenance contract | retrieve/rank and record provenance |
| `flow.subflow` | resolve/pin child plan/interface | create nested logical execution and propagate lifecycle |
| `flow.router` | compile deterministic routes/predicates | select route(s) and record decision |
| `flow.join` | validate join satisfiability | synchronize/race according to join mode |
| `flow.loop` | validate structured bounds/body | create deterministic iteration activations |
| `human.approval` | compile exact approval subject/schema/policy refs | create task, suspend, validate decision, resume |
| `human.input` | compile response schema/actor constraints | create task/handoff, suspend and resume |
| `flow.wait` | compile time/event/callback wait | persist timer/subscription and wake safely |
| `automation.computer_use` | validate target/session/safety requirements | choose strategy/Runner and execute observation-action loop |
| `data.artifact` | validate artifact operation/policy | materialize/persist/export with integrity/access controls |
| `quality.verifier` | validate rubric/evidence/verdict contract | execute verifier and produce auditable evidence |

Non-node runtime semantics:

| Construct | Compiler responsibility | Runtime responsibility |
|---|---|---|
| `WorkflowInterface` | validate input/output schemas/mappings | snapshot invocation input and resolve final outputs |
| `WorkflowBinding` | validate source/target types and authority | resolve live context/secret/artifact/previous-run values |
| `ConcurrencyScope` | validate membership/nesting/bounds | constrain ready-work concurrency |
| `ErrorBoundaryScope` | validate catch/finally routes | intercept/propagate errors deterministically |
| `TransactionSagaScope` | validate effect/compensation ordering | commit/compensate/reconcile |
| `PolicyAttachment` | validate policy applicability | enforce retry/timeout/checkpoint/cache/budget/etc. |
| `InstrumentationAttachment` | validate target/config | emit trace/log/metric/audit/status data without changing business flow |

Compiler/runtime MAY optimize structural work only if observable semantics, auditability and replay remain equivalent.

---

# 67. Release Gates

Minimum release gates:

- NodeTypeManifest + binding projection integrity;
- WorkflowInterface/binding/output-mapping correctness;
- schema/edge compatibility;
- scope nesting/deadlock/transaction correctness;
- policy/instrumentation conformance;
- critical security/policy checks;
- runtime adapter conformance;
- trigger/event correctness;
- retry/idempotency/side-effect tests;
- Runner disconnect/recovery;
- scheduler fairness/concurrency-scope overload tests;
- artifact integrity/lineage;
- rejection of all removed pre-canonical node IDs in new workflows;
- Spec 212 critical/full corpus pass according to release tier;
- TH/EN authoring parity where required;
- performance SLO/error-budget checks;
- open critical incident/kill-switch checks.

---

# 68. Clean-Slate Runtime Cutover

There are existing implementation branches and persisted Workflow Studio structures. Whether deployed data requires old graph semantics must be determined by data inventory before cutover.

Implementation SHOULD therefore replace rather than normalize the old taxonomy:

1. implement Spec 214 v4 manifests and descriptor registries;
2. implement WorkflowInterface, bindings, scopes, policies and instrumentation first-class contracts;
3. make compiler reject all 112 removed pre-canonical type IDs in new WorkflowDefinitions;
4. move reusable implementation code behind model/agent/capability/retrieval/artifact/computer-use/verifier adapters;
5. remove node-type-specific retry/checkpoint/logging/billing/browser-session branches from authoring semantics;
6. preserve Feature 195 `worker_jobs` as durable physical job control;
7. cut Spec 209 AI Builder/Studio over to v4 in one canonical schema version;
8. run Spec 212 regression and 112-disposition tests;
9. delete dead compatibility dispatch code.

This is a code refactor/cutover, not workflow-data migration.

---

# 69. Acceptance Criteria

Spec 215 v2 is complete when:

- [ ] it consumes Spec 214 v4 manifests without redefining semantic Node Types;
- [ ] WorkflowInterface replaces executable input/output nodes;
- [ ] non-node bindings replace tenant/user/project/config/secret/previous-run nodes;
- [ ] graph fan-out + ConcurrencyScope replace a fork-only parallel node;
- [ ] retry/checkpoint/budget/cache/fallback behavior is policy-driven;
- [ ] trace/log/metric/status behavior is instrumentation-driven;
- [ ] WorkflowDefinition compiles to an immutable plan with pinned semantic/binding contracts;
- [ ] live security/policy/revocation is revalidated at execution time;
- [ ] all 16 core types compile and have at least one executable adapter/path or deterministic in-engine implementation;
- [ ] Feature 195 remains canonical durable physical job control;
- [ ] sync, async, streaming, suspendable and long-running execution are supported;
- [ ] trigger/schedule/webhook/event behavior is durable and replay-safe;
- [ ] fan-out/join/loop/subflow semantics are structured and bounded;
- [ ] error-boundary and transaction/saga scopes are enforceable;
- [ ] NodeRun and NodeAttempt are separate;
- [ ] remote execution uses lease fencing;
- [ ] retry/idempotency policies avoid duplicate consequential effects;
- [ ] unknown external outcomes are reconciled rather than blindly retried;
- [ ] atomic result commit prevents duplicate downstream activation;
- [ ] human approval binds to the exact material operation;
- [ ] artifacts have integrity/provenance/lineage;
- [ ] cost/quota/fairness/admission controls exist;
- [ ] partial run/replay/backfill/fork/repair are policy controlled;
- [ ] rolling upgrades/checkpoint migrations are safe for workflows created under v2+;
- [ ] disaster recovery can restore and safely resume active/suspended runs;
- [ ] all 112 removed names are rejected as new semantic node IDs;
- [ ] Spec 212 can attribute failures to the correct owner.

---

# 70. Mandatory Invariants

1. Spec 215 never invents Node Types; it consumes Spec 214.
2. WorkflowInterface is not a Node Type.
3. WorkflowBinding/SecretBinding/ContextBinding are not Node Types.
4. Static fan-out requires no fork node; concurrency is graph/scope/scheduler semantics.
5. Retry/checkpoint/cache/budget/fallback are policies, not hidden nodes.
6. Trace/log/metric/status are instrumentation, not hidden nodes.
7. Control-plane/runtime internal operations are not authorable nodes unless intentionally exposed as registered business capabilities.
8. Spec 215 never creates a second physical durable job system; it uses Feature 195.
9. Runtime/provider/protocol identity is separate from semantic Node Type.
10. Pinned plan semantics do not freeze revoked permissions/security policy.
11. NodeRun != NodeAttempt.
12. Every material side effect has explicit idempotency/reconciliation semantics.
13. Stale leased workers cannot commit after fencing changes.
14. Downstream activation occurs only after durable upstream commit.
15. Arbitrary runtime graph mutation is forbidden.
16. Dynamic work remains within compiled bounds.
17. Credential material is runtime-scoped and not stored in definitions.
18. Cross-tenant/cache/memory leakage is forbidden.
19. Cross-region failover obeys residency/policy.
20. In-flight runs preserve pinned semantic plan identity through deployments.
21. No newly authored workflow may contain any of the 112 removed pre-canonical IDs.
22. Spec 212 validation remains independent enough to catch plausible-but-nonexecuting workflows.

---

# 71. Definition of Done

Spec 215 is done when a workflow authored from any supported Spec 212 use case can be represented using Spec 214 v4 semantic nodes plus first-class interface/binding/scope/policy/instrumentation constructs, compiled without legacy aliases or hidden node types, resolved to real runtimes, executed durably and safely, and explained/recovered afterward.

---

# 72. Revision 2 — Thirty-Pass Clean-Slate Audit

| Pass | Focus | Result / correction |
|---:|---|---|
| 1 | Clean-slate premise | Removed compiler alias normalization and workflow-data migration requirements. |
| 2 | Workflow I/O | Made input/output typed WorkflowInterface rather than Node Types. |
| 3 | Non-edge values | Added first-class WorkflowBinding and secret/context/previous-run source semantics. |
| 4 | Fan-out | Removed fork-node dependency; ready branches + ConcurrencyScope. |
| 5 | Join | Retained explicit synchronization only. |
| 6 | Map/loop distinction | Collection transforms stay transforms; workflow-body iteration stays loop. |
| 7 | Retry | Engine retries moved to PolicyAttachment; semantic repair loops remain flow.loop. |
| 8 | Checkpoint | Checkpoint is runtime policy/state, not authored node. |
| 9 | Error handling | Added ErrorBoundaryScope instead of error-handler node. |
| 10 | Transaction/compensation | Added TransactionSagaScope. |
| 11 | Observability | Added InstrumentationAttachment instead of trace/log/metric nodes. |
| 12 | Capability control plane | Registry search/describe/status/result excluded from authorable graph. |
| 13 | Computer Use internals | Low-level browser observe/action/session operations kept inside runtime. |
| 14 | Agent administration | Fleet/session operations kept control-plane unless explicit business capability. |
| 15 | Platform economics | SmartAIHub reserve/capture/release kept Spec 207/runtime policy. |
| 16 | Typed generic nodes | Compiler projects binding-derived port/config schemas. |
| 17 | Execution/effect preflight | Preserved conservative effect resolution before authority/side effect. |
| 18 | Immutable plan | Plan now pins bindings/scopes/policies, not only node manifests. |
| 19 | Scheduler semantics | Concurrency scope integrated with fairness/admission/resource placement. |
| 20 | Atomic commit | Preserved outbox/validated commit boundary. |
| 21 | Recovery | Preserved lease fencing/checkpoint/DR and suspended-run liveness. |
| 22 | 112-name rejection | Added clean-slate CI/runtime rejection of removed IDs. |
| 23 | Spec 212 attribution | Added missing-construct/binding/policy categories, not only missing-node. |
| 24 | Cross-spec invariant | Spec 215 cannot create hidden semantic nodes for implementation convenience. |
| 25 | Run activation model | Replaced mandatory trigger context with a union for trigger/manual/API/subflow/replay/backfill/repair. |
| 26 | Trigger lifecycle | Added durable `TriggerActivation`; trigger sources do not create fake NodeAttempts. |
| 27 | Output-source truth | Added `WorkflowOutputSource.node-output` while forbidding node-output duplication in normal bindings. |
| 28 | Non-node schema safety | Added versioned descriptor schemas for scopes, policies and instrumentation. |
| 29 | Policy composition | Added explicit merge strategies and deterministic workflow→scope→node precedence. |
| 30 | Shared state concurrency | Made workflow variables immutable; evolving state belongs to loop/external state contracts. |

The audit found no need for additional runtime-specific Node Types. The major gaps were missing first-class **non-node** contracts.

---

# 73. Required Clean-Slate Rejection Tests

The compiler/Studio integration SHALL reject the 112 old IDs as semantic `typeId`s.

Representative assertions:

```text
retry            -> reject as node; require RetryPolicyAttachment
checkpoint       -> reject as node; require CheckpointPolicyAttachment
parallel         -> reject as node; use graph fan-out / ConcurrencyScope
secret-reference -> reject as node; require SecretBinding
trace-event/log/metric -> reject as nodes; require InstrumentationAttachment
browser_action   -> reject as node; internal Computer Use runtime primitive
economic-reserve -> reject as node; internal Spec 207/runtime operation
result-view      -> reject as node; Studio/UI + WorkflowInterface output
```

The full list is defined by Spec 214 Appendix A and its machine-readable disposition artifact.

# 74. Revision 3 — Mini App Runtime Context

Mini App invocation SHALL reuse the normal Spec 215 run path. A Mini App is an activation surface, not a distinct runtime.

```ts
interface MiniAppRunContext {
  miniAppId: string;
  miniAppVersion: string;
  listingId?: string;
  workflowId: string;
  workflowVersionId: string;
  consumerPrincipalId: string;
  quoteId?: string;
  reservationId?: string;
  publicationSnapshotHash: string;
}
```

The context SHALL be attached to WorkflowRun attribution but MUST NOT change pinned workflow semantics.

---

# 75. Mini App Pre-Run Economic Gate

For a paid Mini App run, Spec 215 SHALL accept material execution only when the required Spec 207 quote/authorization/reservation context is valid according to policy.

Spec 215 does not calculate creator revenue or maintain balances. It records the immutable run attribution/finality/usage evidence required by Spec 207 settlement.

Live policy, entitlement and economic authorization MUST be revalidated where required before material side effects.

---

# 76. Consumer Run Projection

Spec 215 SHALL expose a safe run-event projection usable by Spec 209 Mini Apps.

```text
QUEUED
STARTED
PROGRESS_STAGE
WAITING_FOR_APPROVAL
WAITING_FOR_HUMAN_INPUT
ARTIFACT_AVAILABLE
COMPLETED
FAILED
CANCELLED
RECONCILING_UNKNOWN_OUTCOME
```

The consumer projection MUST be derived from canonical WorkflowRun/NodeRun state and SHALL NOT create a second Mini App status store. Internal traces/tool arguments/secrets remain hidden unless the principal has explicit debug authority.

---

# 77. Secure Human Interaction Resume

Approval and mid-run input actions exposed through a Mini App SHALL use canonical Spec 215 human-task state and secure scoped action tokens.

A Mini App UI response MUST NOT directly modify NodeRun state. It submits an authenticated decision/input payload; Spec 215 validates actor, schema, expiry, exact task identity and policy before resuming the WorkflowRun.

---

# 78. Mini App Finality and Settlement Evidence

WorkflowRun finality SHALL distinguish success, failure, cancellation and unknown/reconciliation states sufficiently for Spec 207 to settle or release reservations correctly.

Runtime evidence SHALL include references to:

```text
miniAppId / miniAppVersion
workflowId / workflowVersion
workflowRunId
quote/reservation where applicable
actual usage/cost attribution
finality
side-effect reconciliation state
refund/release-relevant reason class
```

Spec 215 SHALL NOT emit a successful Mini App fee settlement signal while a material external outcome remains unknown.

---

# 79. Revision 3 Acceptance Criteria — Mini App Runtime

- [ ] Mini App uses the canonical WorkflowRun path.
- [ ] MiniAppRunContext is attribution metadata, not alternate execution semantics.
- [ ] Required Spec 207 authorization is checked before material paid execution.
- [ ] Consumer progress derives from canonical run state.
- [ ] Human approval/input resume uses authenticated canonical tasks.
- [ ] Consumer visibility cannot expose internal traces/secrets by default.
- [ ] Run finality provides sufficient settlement/release evidence.
- [ ] Unknown external outcomes cannot be reported as successful paid completion.
- [ ] There is no Mini-App-only queue, scheduler or state machine.



## Shared Retrieval Contract Family — `SAH-RETRIEVAL-2`

All production consumers in Specs 214–230 that require semantic/document/entity search SHALL use the canonical Spec 229 Retrieval Broker contract rather than provider-specific search APIs.

The shared request MUST carry at least:

```text
request_id
principal / tenant / project / environment
purpose
query_class
query_text or structured selector
source_classes
required_visibility / ACL scope
language hints
exact identifiers if present
maximum evidence budget
freshness requirement
consumer spec / run / workflow references
```

The normalized response MUST carry at least:

```text
retrieval_trace_id
provider/profile/version
query plan
EvidenceRef[]
source identity + source revision/digest
ACL/provenance/freshness state
retrieval/rerank scores as non-authoritative evidence
quality-gate result
partial/degraded indicators
```

`EvidenceRef` SHALL be a reference to authorized canonical content; retrieved text/vector similarity SHALL NOT become lifecycle state, authorization, approval, identity or source-of-truth data.


---

# Revision 4 — Retrieval Runtime Binding and Evidence Contract

For every `data.retrieval` execution, Spec 215 SHALL invoke Spec 229 Retrieval Broker V2 or an explicitly certified local/offline test adapter. Runtime code SHALL NOT call Vectorize, AI Search, pgvector or a provider-specific hybrid ranker directly.

Canonical runtime path:

```text
WorkflowRun / NodeRun(data.retrieval)
   ↓
Spec 220 authorization/scope
   ↓
Spec 229 Retrieval Broker
   ↓
normalized RetrievalEvidence
   ↓
NodeRun output + provenance
```

`NodeAttempt` evidence SHALL persist the retrieval trace/profile/version and source references needed for reproducibility without copying private retrieved content unnecessarily.

Retry/resume MUST revalidate authorization and freshness when policy requires. Cached/stale evidence MUST NOT bypass revocation, tenant ACL changes or source deletion.

For Skill discovery, Workflow runtime returns **Skill candidate refs/evidence only**. Invocation remains a separate capability/Skill-resolution step governed by Spec 221/220 and the caller's authority.

Unknown/degraded provider outcome must be represented explicitly; a retrieval provider outage SHALL NOT be converted into an empty-success result when the workflow requires grounded evidence.
