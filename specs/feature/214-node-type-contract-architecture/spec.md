# Spec 214 — Canonical Node Type Contract Architecture v6
## Future-Proof Node Taxonomy, Registry, Contracts, AI-Builder Discovery & Spec 212 Coverage

**Status:** Proposed / Partial canonical contract slice present; runtime and corpus certification pending
**Spec ID:** 214  
**Revision:** 6 — Spec 229 Retrieval Broker alignment for data.retrieval and capability-neutral search
**Date:** 2026-09-22
**Suggested repository path:** `specs/feature/214-node-type-contract-architecture/spec.md`  
**Primary purpose:** Define what a canonical Workflow Node Type is, which core Node Types SmartAIHub must provide, how they are discovered/validated/versioned, and how the catalog remains complete without duplication.  
**Companion specs:** Spec 209 (Workflow Studio / AI Builder UX), Spec 212 (Marketplace + Capability Lab + continuous validation), Spec 215 (Workflow Compiler & Runtime Execution), Feature 195 (`worker_jobs` durable physical job control), Specs 199/200/206/208/211 and capability/runtime registries.

---

## 0.1 Codebase alignment snapshot — 2026-09-22

Current source evidence is limited to the canonical contract slice. `apps/web/server/services/workflowNodeContracts.ts` exposes manifest schema v4, 16 core node IDs, digest validation, exact lookup/search and `NodeInstance` validation. `workflowStudioCanonicalAdapter.ts`, `workflowBuilderCompiler.ts` and `routers/workflowStudio.ts` consume parts of this contract, with focused tests.

This does not prove a complete Studio/runtime cutover or Spec 212 R20 certification. The existing Workflow Studio persistence migration (`0341_feature_209_workflow_studio.sql`) means production-data inventory, compatibility handling and rollback remain required before a destructive clean-slate cutover. Spec 229 retrieval-broker integration is a target boundary; no canonical Retrieval Broker V2 implementation was found in the current source tree.

# 0. Executive Decision

Spec 214 SHALL be the canonical owner of **Node Type semantics and contracts**, not workflow execution.

The architecture is:

```text
Spec 212 Use Case / Template / Capability Lab
              │
              ▼
Spec 209 Workflow Studio / AI Builder
              │ selects only real registered node contracts
              ▼
Spec 214 Node Type Registry + Contracts
              │
              │ WorkflowDefinition references typeId + version
              ▼
Spec 215 Workflow Compiler & Runtime Execution
              │
              ▼
Feature 195 worker_jobs / Runner / server / browser / external runtime
              │
              ▼
Spec 212 verification / certification / regression
```

Spec 214 MUST answer one question precisely:

> **“What does a node declare, and which semantic Node Types exist?”**

Spec 215 answers:

> **“How does the engine compile, schedule, execute, retry, resume and recover those nodes?”**

Spec 214 SHALL NOT own `WorkflowRun`, `NodeRun`, `NodeAttempt`, scheduler internals, queue semantics, runtime leases, checkpoint persistence, DLQ, disaster recovery or executor state machines. Those belong to Spec 215 / Feature 195.

---

# 1. Cross-Spec Ownership

| Concern | Canonical owner | Notes |
|---|---|---|
| Workflow Studio UI / Canvas / AI Builder conversation / change preview | Spec 209 | Authoring experience |
| Use Case catalog / Solution Variants / Marketplace / Capability Lab / certification | Spec 212 | Black-box validation and product layer |
| Node Type taxonomy / manifest / ports / config / UI descriptor / registry / aliases | **Spec 214** | This spec |
| WorkflowDefinition execution semantics / compiler / ExecutionPlan / runs | **Spec 215** | Companion runtime spec |
| Physical durable worker job source of truth | Feature 195 | `worker_jobs` remains canonical physical job control |
| External Agent gateway | Spec 200 | Invoked through `ai.agent` binding |
| A2A | Spec 206 | Adapter/protocol, not a new core Node Type |
| Computer Use | Spec 208 | Bound to `automation.computer_use` |
| ACP / runtime fabric | Spec 211 | Adapter/runtime path, not a new core Node Type |
| Billing/economic authority | Spec 207 | Runtime policy/cost authority |

Historical references in Spec 209/212 that describe the compiler/runtime as owned entirely by Spec 209 SHALL be interpreted after this split as:

```text
Spec 209 = authoring-facing API/UX façade
Spec 214 = canonical node contract owner
Spec 215 = canonical compiler/runtime owner
```

No duplicate Workflow Definition, registry, resolver, queue or Runner control plane may be created by this split.

---

# 2. Spec 212 Is the Coverage Source of Truth

Spec 212 Revision 20 contains **2,930 language-independent Use Case identities**, with required Thai and English localizations, producing **5,860 canonical prompt executions**.

Spec 214 SHALL NOT assume that a small demo node set is sufficient. Its taxonomy MUST be able to represent workflows generated for the entire Spec 212 corpus, including:

- web/search/browser automation;
- email/office/CRM/support/finance/HR/e-commerce/social;
- media generation/editing/drama/storyboard/audio/video;
- coding agents, QA and multi-agent work;
- Skills, MCP, A2A, ACP and external agents;
- Computer Use / Runner/local execution;
- Library/RAG/vector/R2/artifact workflows;
- human approval, human input and takeover;
- triggers/schedules/webhooks/events;
- loops, branching, parallelism, joins and subflows;
- marketplace/template/variant/dependency/certification flows;
- billing, quotas, cost, entitlement and governance;
- privacy, residency, retention, deletion, BYOK and policy;
- retries, fallback, replay, checkpoint/resume and recovery;
- localization, bilingual verification and accessibility;
- provenance, audit, evidence, release gates and performance.

**Important:** Spec 212 explicitly allows multiple valid graphs. Therefore Spec 214 MUST NOT encode one “golden node list” per use case. Coverage is semantic: every executable node in any accepted graph must resolve to a real canonical Node Type and registered capability.

---

# 3. Core Design Rule — Node Type ≠ Product Feature ≠ Provider ≠ Protocol

A Node Type represents **stable workflow semantics**.

The following MUST NOT become separate core Node Types merely because they are different products/providers/protocols:

```text
OpenAI / Anthropic / Gemini / local model
Gmail / Slack / CRM / Shopify
MCP / A2A / ACP
Codex / Claude / external harness
FFmpeg / ComfyUI / Seedance / Veo / Kling
HTTP GET / REST vendor endpoint
SmartAIHub Skill names
storyboard.generate / media.image.generate / video.render
```

These belong in one or more of:

```text
capabilityId
provider/runtime binding
protocol adapter
preset
config
policy
model selection
runtime profile
```

A new product capability should normally register a **capability**, not invent a new Node Type.

---

# 4. Canonical Core Node Taxonomy

SmartAIHub SHALL standardize on **16 canonical semantic Node Types**.

The clean-slate taxonomy intentionally excludes concepts that belong to workflow interfaces, graph structure, policies, instrumentation, control-plane services, provider bindings or runtime internals.

| # | Canonical `typeId` | Semantic role | Typical modes/bindings |
|---:|---|---|---|
| 1 | `core.trigger` | External/time/event activation source that starts a top-level workflow path | webhook, schedule, event, chat, email, provider callback, asset/job event |
| 2 | `data.transform` | Pure/bounded transformation of already-available typed values | template, parse, select, filter, map-value, reduce-value, split-value, merge-value |
| 3 | `ai.model` | Direct model inference without autonomous tool orchestration | text, structured, vision, multimodal, embedding, image/video/audio generation |
| 4 | `ai.agent` | Goal-directed autonomous/semi-autonomous agent or harness | internal agent, external agent, Codex/Claude-style harness, A2A/ACP-bound agent |
| 5 | `core.capability` | One registered non-agent operation/Skill/tool/API/business capability | HTTP/MCP/connector/database/Git/media/render/notification |
| 6 | `data.retrieval` | Retrieve/search/rank context or assets with provenance | Library, vector, keyword, hybrid, web-search results, rerank |
| 7 | `flow.subflow` | Invoke a reusable workflow/subflow with a typed interface | pinned/ranged workflow version |
| 8 | `flow.router` | Deterministic choice of one or more outgoing routes from existing values | condition, switch, rules, multi-route |
| 9 | `flow.join` | Explicit synchronization of concurrent execution branches | all, any, n-of-m, barrier, race |
| 10 | `flow.loop` | Structured bounded repetition of workflow work | foreach, while, until, semantic evaluation/repair loop |
| 11 | `human.approval` | Human authorization/decision gate | single, quorum, four-eyes, role/group, escalation |
| 12 | `human.input` | Mid-run human data collection, correction or takeover | form, choice, correction, handoff |
| 13 | `flow.wait` | Durable suspension until time/event/callback condition | timer, delay, external callback/event |
| 14 | `automation.computer_use` | Goal-level browser/desktop UI interaction session | DOM/accessibility/WebMCP/Jev/vision fallback/Runner |
| 15 | `data.artifact` | Explicit artifact lifecycle/materialization boundary | persist, materialize, package, export, representation conversion, Library publish |
| 16 | `quality.verifier` | Produce typed verification/evaluation evidence | schema/assertion, tests, QC, judge, moderation, factual/evidence checks |

## 4.1 Intentionally **not** Node Types

The following are first-class architecture constructs but MUST NOT be executable Node Types:

```text
WorkflowInterface inputs/outputs
WorkflowBinding / SecretBinding / ContextBinding
Graph fan-out / branch concurrency
ExecutionScope
PolicyAttachment
InstrumentationAttachment
Capability Registry search/describe/status APIs
Runner/worker job lifecycle
Browser low-level observe/action primitives
Agent fleet/session administration
SmartAIHub billing reserve/capture/release internals
Studio preview/result-view UI
```

### Workflow input/output

Initial inputs and final outputs belong to the typed `WorkflowInterface` owned by Spec 215.  
Spec 209 MAY render virtual “Workflow Inputs” / “Workflow Outputs” cards on Canvas, but they are not registry Node Types and do not create `NodeRun`s.

### Parallel fan-out

A dedicated `flow.parallel` fork node is unnecessary. When a committed node enables multiple downstream branches, all ready branches MAY execute concurrently subject to Spec 215 `ConcurrencyScope` / scheduler policy. Dynamic fan-out belongs to `flow.loop`; synchronization belongs to `flow.join`.

## 4.2 Why 16

This taxonomy preserves stable workflow semantics while collapsing implementation/product concepts:

```text
condition + switch                         -> flow.router
static parallel fork                       -> graph fan-out + ConcurrencyScope
notification / HTTP / MCP / connector      -> core.capability
prompt / summarize / translate / classify -> ai.model presets
external-agent-task                        -> ai.agent
schedule / webhook / event                 -> core.trigger modes
foreach / while / run-until                -> flow.loop
retry                                      -> RetryPolicyAttachment
checkpoint                                 -> CheckpointPolicyAttachment
trace / log / metric / run-status          -> InstrumentationAttachment
tenant/user/project/config/secret context  -> WorkflowBinding family
```

The absence of a legacy Node Type does **not** mean the use case is unsupported; it means the responsibility has been placed in the correct architectural layer.

---

# 5. Node-Type Admission Test — Prevent Duplicate Types

A proposed new core or extension Node Type MUST pass all mandatory checks below.

1. **Semantic uniqueness** — the operation represents workflow semantics that cannot be expressed by an existing type plus binding/config/profile.
2. **Graph-semantic impact** — the primitive changes meaningful control/data/human/artifact lifecycle, not merely vendor/provider behavior.
3. **Contract uniqueness** — it requires materially distinct port/config/security/execution semantics.
4. **Authoring value** — AI Builder/Studio gains a stable conceptual primitive rather than another preset.
5. **Provider neutrality** — the type remains meaningful across vendors and protocol implementations.
6. **Stable meaning** — the concept is expected to remain valid as tools/providers change.
7. **Use-case evidence** — real Spec 212 cases require the primitive; speculative convenience is insufficient.
8. **No capability substitution** — a registered `CapabilityDescriptor` cannot adequately represent it.
9. **No binding/policy/scope substitution** — the requirement is not actually context, secret, retry, checkpoint, concurrency, transaction, instrumentation or another non-node construct.
10. **No composition substitution** — a small, comprehensible composition of existing semantic types is insufficient.

If checks 1–6 or 8–10 fail, the proposal MUST NOT become a new Node Type.

Legacy implementation names receive no canonical admission privilege. Existing code and persisted Workflow Studio data remain migration evidence; a production-data inventory and rollback plan are required before removing or rewriting old identifiers.

---

# 6. Canonical Domain Separation

```text
NodeTypeManifest       = semantic contract for one canonical node type
NodePreset             = convenient authoring template/defaults
NodeInstance           = one semantic node placed in a WorkflowDefinition
NodeBindingRef         = model/agent/capability/workflow/source binding selected for a node
CapabilityDescriptor   = concrete callable non-agent capability
WorkflowInterface      = typed workflow inputs/outputs (Spec 215, non-node)
WorkflowBinding        = literal/context/secret/artifact/previous-run bindings (Spec 215, non-node)
ExecutionScope         = concurrency/error/transaction/budget structure (Spec 215, non-node)
PolicyAttachment       = retry/timeout/checkpoint/cache/etc. (Spec 215, non-node)
Instrumentation        = trace/log/metric/status declarations (Spec 215, non-node)
CompiledNode           = compiler output (Spec 215)
NodeRun / NodeAttempt  = runtime state (Spec 215)
RuntimeAdapter         = concrete execution implementation (Spec 215)
```

These objects MUST NOT be collapsed into one data structure. In particular:

- context and secret resolution are bindings, not nodes;
- retry/checkpoint/budget guards are policies, not nodes;
- trace/log/metrics are instrumentation, not nodes;
- low-level provider/browser/agent lifecycle operations are runtime/control-plane services, not nodes.

---

# 7. NodeTypeManifest v4

```ts
interface NodeTypeManifest {
  schemaVersion: "4";

  identity: NodeTypeIdentity;
  semantic: SemanticDescriptor;

  ports: PortContract;
  config: ConfigContract;
  resolution: NodeResolutionContract;

  runtimeRequirement: RuntimeRequirementContract;
  execution: ExecutionDeclaration;
  security: SecurityRequirementContract;
  dataGovernance?: DataGovernanceDeclaration;

  ui: NodeUIDescriptor;
  aiBuilder: AIBuilderDescriptor;

  compatibility: NodeCompatibilityContract;
  lifecycle: NodeLifecycleContract;

  presets?: string[];
  tags?: string[];
}
```

Spec 214 owns this manifest. Spec 215 consumes it.

The manifest MUST have one authoritative field for each semantic concern. Duplicate declarations that can disagree — for example side effects in both `semantic` and `execution`, or streaming in both `runtimeRequirement` and `execution` — are forbidden.

---

# 8. Node Type Identity

```ts
interface NodeTypeIdentity {
  typeId: string;            // e.g. "ai.agent"
  version: string;           // SemVer
  namespace: "core" | "plugin" | "tenant" | "marketplace";
  publisher: string;
  displayNameKey: string;
  descriptionKey: string;
  manifestDigest: string;
}
```

Rules:

- `typeId` MUST be stable and language-neutral.
- labels/descriptions MUST be localized separately;
- vendor names MUST NOT appear in a core `typeId`;
- a breaking contract change requires a major version;
- future saved workflows MUST pin a compatible type version/range according to publish policy;
- this revision does **not** require aliases for the 112 pre-canonical implementation names because no workflow data depends on them.

---

# 9. Semantic Descriptor

```ts
interface SemanticDescriptor {
  family:
    | "trigger" | "transform" | "model" | "agent"
    | "capability" | "retrieval" | "subflow" | "router"
    | "join" | "loop" | "human-approval" | "human-input"
    | "wait" | "computer-use" | "artifact" | "verifier";

  executionClass:
    | "activation"
    | "compute"
    | "orchestration"
    | "human"
    | "suspension"
    | "boundary"
    | "verification";

  summary: string;
  composable: boolean;
}
```

`semantic` answers only **what the node means**.

Determinism, side effects, idempotency, suspension and streaming are execution properties and MUST live only in `ExecutionDeclaration`.

---

# 10. Port Contract

Generic semantic node types must still remain strongly typed. Ports therefore support fixed and binding-derived schemas.

```ts
interface PortDefinition {
  id: string;
  direction: "input" | "output";
  channel: "data" | "control" | "error" | "event";
  schema?: JsonSchema202012;
  required?: boolean;
  cardinality?: "one" | "many";
  connectionPolicy?: "single" | "multi";
  payloadMode?: "value" | "artifact-ref" | "stream" | "event-envelope";
}

interface PortDerivationContract {
  mode: "fixed" | "binding-derived" | "config-derived";
  resolverRef?: string;                // registered pure schema resolver
  resolverVersion?: string;
  stablePortIdStrategy?: string;
}

interface PortContract {
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  derivation?: PortDerivationContract;
}
```

Rules:

- use JSON Schema Draft 2020-12 for value payloads;
- binary/media payloads SHOULD pass by `ArtifactRef`;
- data/control/error/event semantics remain distinguishable;
- binding/config-derived ports MUST be generated deterministically before publish/compile;
- derived port IDs MUST remain stable for an unchanged bound contract;
- a schema resolver MUST be pure and side-effect-free;
- missing and explicit `null` MUST NOT be silently conflated;
- `core.capability`, `flow.subflow`, `ai.model`, `ai.agent`, retrieval and verifier nodes MAY project ports from the bound descriptor rather than invent loose `any` ports.

---

# 11. Config Contract

```ts
interface ConfigContract {
  schema: JsonSchema202012;
  defaults?: Record<string, unknown>;
  uiHints?: Record<string, unknown>;
  canonicalizationVersion: string;

  derivation?: {
    mode: "fixed" | "binding-derived";
    resolverRef?: string;
    resolverVersion?: string;
  };
}
```

Configuration MUST be schema validated.

Secret values are never configuration fields. A config may reference a logical `SecretBinding` identifier only where the manifest/security contract permits it; material secret resolution belongs to Spec 215.

Published Node Types MUST NOT rely on unconstrained `Record<string, unknown>` configuration.

---

# 12. UI Descriptor

```ts
interface NodeUIDescriptor {
  icon?: string;
  category: string;
  accentRole?: string;
  compactLabelKey: string;
  propertyGroups?: UIPropertyGroup[];
  customEditor?: {
    packageRef: string;
    sandboxed: true;
    hostApiVersion: string;
  };
}
```

Core semantics MUST remain usable without custom UI. Custom editors are presentation extensions and MUST NOT define hidden execution semantics.

---

# 13. Runtime Requirement Contract — Declaration Only

Spec 214 declares **where/with what dependencies** a node may execute. Invocation lifecycle traits belong to `ExecutionDeclaration`.

```ts
interface RuntimeRequirementContract {
  capabilityClasses?: string[];
  protocolFamilies?: ("native" | "skill" | "mcp" | "a2a" | "acp" | "http" | "custom")[];

  placements?: ("server" | "browser" | "runner" | "cloud-container" | "external")[];

  resources?: {
    os?: ("windows" | "macos" | "linux")[];
    gpu?: boolean;
    minMemoryMb?: number;
    minVramMb?: number;
    browser?: boolean;
    localFilesystem?: boolean;
    network?: boolean;
  };
}
```

This contract does not select a concrete executor and does not repeat streaming/suspension/long-running declarations.

---

# 14. Execution Declaration — One Source of Truth

```ts
interface EffectContract {
  mutation: "none" | "read" | "write";
  boundary: "internal" | "external";
  reversible?: boolean;
}

type EffectDeclaration =
  | ({ mode: "fixed" } & EffectContract)
  | {
      mode: "derived";
      conservative: EffectContract;
      resolverRef: string;
      resolveAt: "compile" | "runtime-preflight";
    };

interface ExecutionDeclaration {
  invocation: "inline" | "job" | "either";
  streaming: "none" | "optional" | "required";
  longRunning?: boolean;

  suspension:
    | "none"
    | "timer"
    | "human"
    | "external"
    | "session"
    | "derived";

  determinism: "deterministic" | "nondeterministic" | "provider-dependent";

  cancellable?: boolean;
  continuation?: "none" | "checkpoint" | "external-handle" | "session";

  idempotencyClass:
    | "naturally-idempotent"
    | "requires-key"
    | "non-idempotent"
    | "derived";

  effects: EffectDeclaration;
}
```

Spec 215 owns implementation of retry/checkpoint/cancellation/compensation.

A generic capability whose effect depends on the bound operation MUST use `effects.mode="derived"` and a conservative preflight declaration. Runtime authorization MUST occur after effect resolution and before credential delegation/material side effect.

---

# 15. Security Requirement Contract

```ts
interface SecurityRequirementContract {
  requiredScopes?: string[];
  credentialClasses?: string[];
  requiresSandbox?: boolean;
  networkEgress?: "none" | "allowlisted" | "internet" | "derived";
  filesystem?: "none" | "read" | "write" | "derived";
  approvalClass?: string;
  minimumTrustLevel?: string;
}
```

Node config MUST reference credentials indirectly. Secret material MUST NOT be persisted in WorkflowDefinition or NodeInstance.

---

# 16. Data Governance Declaration

```ts
interface DataGovernanceDeclaration {
  acceptedClassifications?: string[];
  outputClassificationRule?: "inherit-max" | "derive" | "fixed";
  residencySensitivity?: boolean;
  purposeTags?: string[];
  minimizationStrategy?: string;
}
```

This allows Spec 215 to enforce live placement/egress/purpose policy without embedding governance engines inside node implementations.

---

# 17. AI Builder Descriptor

AI Builder is a primary consumer of Spec 214.

```ts
interface AIBuilderDescriptor {
  capabilities: string[];
  intents: string[];
  inputConcepts: string[];
  outputConcepts: string[];
  examples?: string[];
  contraindications?: string[];
  compositionHints?: string[];
  retrievalSummary: string;
}
```

The registry MUST support compact semantic retrieval so the AI Builder does not load every manifest into context.

Selection process:

```text
user intent
  ↓
retrieve semantic Node Type candidates
  +
retrieve binding candidates (trigger/model/agent/capability/workflow/retrieval/verifier)
  ↓
rank compatible <NodeType, Binding> pairs
  ↓
fetch full manifest + bound descriptor for top candidates
  ↓
project typed ports/config schema
  ↓
compose WorkflowDefinition
  ↓
Spec 215 compile
```

AI Builder MUST reason over the pair, not over `typeId` alone. For example `core.capability` without a real compatible capability descriptor is not an executable plan.

---

# 18. Node Preset

```ts
interface NodePreset {
  presetId: string;
  typeId: string;
  compatibleVersionRange: string;
  labelKey: string;
  descriptionKey?: string;
  configOverrides?: Record<string, unknown>;
  bindingHint?: NodeBindingRef;
  tags?: string[];
}
```

Presets MAY be numerous. Node Types SHOULD remain few and stable.

Examples:

```text
"Send Slack message"      = core.capability preset
"Send Gmail email"        = core.capability preset
"Generate image"          = ai.model or core.capability preset depending binding semantics
"Webhook trigger"         = core.trigger preset
"Every weekday 08:00"     = core.trigger preset
"Claude coding agent"     = ai.agent preset + external-agent binding
```

---

# 19. Node Instance

```ts
interface NodeInstance {
  id: string;
  typeId: string;
  typeVersion: string;
  presetId?: string;

  label?: string;

  binding?: NodeBindingRef;
  config: Record<string, unknown>;

  position?: { x: number; y: number };
  size?: { width: number; height: number };

  metadata?: Record<string, unknown>;
}
```

Runtime output/status/attempt data MUST NOT be stored in NodeInstance.

---

# 20. Node Binding and Resolution Contract

Provider/tool/model/workflow identity MUST NOT be encoded into `typeId`.

```ts
type NodeBindingKind =
  | "none"
  | "trigger-source"
  | "capability"
  | "model"
  | "agent"
  | "workflow"
  | "retrieval-source"
  | "computer-use-profile"
  | "verifier";

interface NodeResolutionContract {
  allowedBindings: NodeBindingKind[];
  required: boolean;
  selection: ("author" | "auto" | "policy")[];
  schemaProjection?: "none" | "input-output" | "full";
}

interface NodeBindingRef {
  kind: Exclude<NodeBindingKind, "none">;
  ref: string;
  versionPolicy?: { mode: "exact" | "range" | "latest-compatible"; value?: string };
  selection?: "pinned" | "auto";
  constraints?: Record<string, unknown>;
}
```

`NodeInstance` MAY carry one `binding?: NodeBindingRef` when permitted by the type manifest.

Examples:

```text
core.trigger    -> TriggerDescriptor binding
ai.model        -> ModelDescriptor binding
ai.agent        -> AgentProfile / ExternalAgentDescriptor binding
core.capability -> CapabilityDescriptor binding
flow.subflow    -> WorkflowVersion binding
data.retrieval  -> RetrievalSource/Profile binding
```

A binding may change concrete implementation without changing semantic Node Type.

## 20.1 Capability Descriptor minimum contract

```ts
interface CapabilityDescriptor {
  capabilityId: string;
  version: string;
  inputSchema: JsonSchema202012;
  outputSchema: JsonSchema202012;

  effects: EffectDeclaration;
  protocolFamilies: string[];
  placements?: string[];

  authoringVisibility: "public" | "advanced" | "system-only";
  trust?: { publisher: string; packageDigest?: string; status?: string };
}
```

System-only control-plane/runtime capabilities MUST NOT be surfaced by AI Builder as normal workflow nodes.

## 20.2 Trigger Descriptor minimum contract

`core.trigger` SHOULD bind to a registered typed trigger descriptor rather than encode every source shape in one config union.

```ts
interface TriggerDescriptor {
  triggerId: string;
  version: string;
  kind: "schedule" | "webhook" | "chat" | "email-event" | "asset-event" | "job-event" | "callback" | "external-invocation" | "runner-state" | "custom";
  outputSchema: JsonSchema202012;
  configSchema: JsonSchema202012;
  securityClass?: string;
  runtimeRequirement?: RuntimeRequirementContract;
}
```

Manual/API/UI invocation does not use a TriggerDescriptor because it starts from `WorkflowInterface` directly.

---

# 21. Model vs Agent vs Capability — Hard Boundary

## `ai.model`
Use when one model invocation transforms inputs to outputs without autonomous tool orchestration.

## `ai.agent`
Use when an agent/harness owns a goal-directed loop, can select tools/capabilities, maintain agent state or delegate.

## `core.capability`
Use when invoking a concrete registered operation/Skill/tool/API without giving that operation autonomous agent semantics.

Examples:

```text
LLM summarize                      -> ai.model
Claude/Codex implement+test loop   -> ai.agent
MCP search tool                    -> core.capability
A2A external coding agent          -> ai.agent + A2A adapter
FFmpeg render                      -> core.capability
ComfyUI workflow                   -> core.capability
```

Default authoring rule for media/AI product operations:

- use `ai.model` when **model identity and model-level inference parameters are the semantic contract**;
- use `core.capability` when SmartAIHub exposes a **stable operation schema** and provider/model may be selected behind that capability;
- use `ai.agent` when the operation owns an autonomous goal/tool/delegation loop.

---

# 22. Router, Join, Loop and Concurrency — Hard Boundary

`flow.router` owns **deterministic choice** using values already present in workflow state.

`flow.join` owns **fan-in synchronization** of execution branches.

`flow.loop` owns **structured bounded repetition**.

Static fan-out requires no fork node: multiple enabled outgoing branches become ready independently and Spec 215 schedules them concurrently according to `ConcurrencyScope`.

Hard rules:

- AI/model classification is `ai.model`; routing on its class value is `flow.router`.
- collection-value `map/filter/reduce/merge` is `data.transform`;
- workflow-item iteration is `flow.loop`;
- relational/data join is `data.transform`;
- branch synchronization is `flow.join`;
- engine retry is `RetryPolicyAttachment`; business/evaluation repetition is `flow.loop`;
- arbitrary cyclic edges are forbidden.

---

# 23. Trigger Modes Required by Spec 212

`core.trigger` MUST support descriptors for at least:

```text
schedule
cron/calendar
webhook
email/event
Library asset created
job completed
provider callback
external MCP invocation
external A2A invocation
Runner online/offline
approval resolved
```

Manual/API/UI invocation without an external trigger uses `WorkflowInterface` directly and does not require a `core.trigger` node.

Trigger security, deduplication, timezone/DST, ordering and missed-event recovery are executed by Spec 215.

---

# 24. Human Nodes Required by Spec 212

## `human.approval`
Must represent:

```text
single approver
role/group approver
quorum
four-eyes / independent approvers
expiry
escalation
revoke/reapprove policy declaration
```

## `human.input`
Must represent:

```text
missing-data request
form/question
choice/selection
correction
human takeover/handoff
resume payload schema
```

Execution/wait lifecycle belongs to Spec 215.

---

# 25. Computer Use Node

`automation.computer_use` remains a separate semantic type because it has materially distinct interaction-loop, target, observation/action and safety semantics that are not adequately represented as a normal one-shot capability call.

It MAY bind to:

```text
WebMCP
Accessibility / DOM
Jev deterministic executor
Vision/LLM fallback
browser companion
SmartAIHub Runner desktop automation
Spec 208 Computer Use engine
```

Those are adapters/strategies, not new Node Types.

---

# 26. Artifact Node

`data.artifact` represents explicit artifact lifecycle boundaries such as:

```text
persist
materialize
copy/export
package
convert representation
attach provenance
publish into Library
resolve ArtifactRef
```

Media generation/editing remains model/capability work; the artifact node is for artifact lifecycle semantics.

---

# 27. Verifier Node

`quality.verifier` is first-class because Spec 212 requires independent verification rather than accepting a plausible workflow/output.

Verifier modes may include:

```text
schema/assertion
unit/integration test
LLM judge
media QC
policy check
moderation
fact/evidence validation
bilingual parity
performance/SLO check
release gate
```

A verifier MUST emit evidence/score/status through a typed contract. The runtime MAY execute the implementation using models, Skills, external agents or deterministic code.

---

# 28. Clean-Slate Review of the 112 Implemented `nodeType` Names

The 112 implemented names from the pre-canonical codebase are **reference evidence only**. The repository contains persisted Workflow Studio structures, so whether any deployed workflow still uses those IDs must be established by inventory rather than assumed away.

The audit found that preserving all 112 as Node Types would encode several different architectural concepts into one registry:

```text
true semantic nodes
provider/product presets
workflow inputs/outputs
context/secret bindings
runtime policies
instrumentation
control-plane APIs
browser/agent runtime primitives
platform billing internals
Studio-only UI surfaces
ambiguous names with two incompatible meanings
```

Therefore v4 performs a clean semantic cutover.

Summary disposition of all 112 names:

| Disposition | Count | Rule |
|---|---:|---|
| Direct canonical semantic node | 54 | Re-express using one of the 16 canonical types |
| Remove as Node Type | 26 | Becomes interface/binding/policy/instrumentation/UI |
| Runtime-internal primitive | 11 | Owned by Spec 215 / Spec 207 / Spec 208 runtime |
| Preset or binding choice | 9 | Concrete semantics determine model/agent/capability binding |
| Control-plane service | 6 | Registry/runtime/admin API, not authored graph node |
| Composition | 5 | Requires two canonical primitives rather than a fake combined type |
| Ambiguous legacy name removed | 1 | `join` must be re-authored explicitly as data transform or flow join |
| **Total** | **112** | Every implemented name is accounted for |

No alias or workflow migration layer is required for these names.

The detailed 112-name disposition appears in Appendix A and is also emitted as a machine-readable audit artifact.

---

# 29. Spec 212 Canonical Family Reconciliation

Spec 212 names conceptual families for black-box validation. They do not require one executable Node Type per family label.

| Spec 212 conceptual family | Canonical representation |
|---|---|
| Trigger | `core.trigger` |
| Input | `WorkflowInterface` / `WorkflowBinding` |
| Deterministic Transform | `data.transform` |
| Model | `ai.model` |
| Agent | `ai.agent` |
| Tool / Capability / Notification | `core.capability` |
| Retrieval | `data.retrieval` |
| Subflow | `flow.subflow` |
| Condition / Router | `flow.router` |
| Parallel / Fan-Out | graph fan-out + `ConcurrencyScope` |
| Join / Merge (execution) | `flow.join` |
| Merge (data values) | `data.transform` |
| Loop / Iteration | `flow.loop` |
| Human Approval | `human.approval` |
| Human Input | `human.input` |
| Wait / Timer | `flow.wait` |
| Computer Use | `automation.computer_use` |
| Artifact | `data.artifact` |
| Verifier / Evaluator | `quality.verifier` |
| Output | `WorkflowInterface.outputs` + output binding |
| Observability | `InstrumentationAttachment` |

This reconciliation is normative for Spec 212 validation.

---

# 30. Spec 212 Coverage Gate — All 2,930 Use Cases

A taxonomy is not complete merely because its schemas look elegant.

Release SHALL run the full current Spec 212 corpus:

```text
2,930 semantic use cases
× required TH + EN prompts
= 5,860 canonical AI Builder generations
```

For every generated workflow:

1. every executable node resolves to one of the **16** canonical types or an approved extension;
2. initial/final data is represented by `WorkflowInterface`, not fake input/output nodes;
3. context/config/secret/previous-run data uses typed bindings;
4. retry/checkpoint/budget/cache/fallback concerns use policy attachments;
5. trace/log/metric/status concerns use instrumentation;
6. parallel fan-out is graph/scope semantics, not a fork-only node;
7. every capability/model/agent/workflow binding exists and is compatible;
8. node config/ports validate after binding-derived schema projection;
9. Spec 215 can compile the workflow with no hidden node semantics;
10. required runtime/security/governance conditions resolve or produce an accurately attributed block/gap;
11. required human approval/verifier semantics are explicit;
12. execution at the Spec 212-required level succeeds or returns a correctly classified failure;
13. independent verification determines semantic success.

Required gap attribution includes:

```text
MISSING_NODE_TYPE
MISSING_BINDING_KIND
MISSING_CAPABILITY
MISSING_RUNTIME_ADAPTER
MISSING_WORKFLOW_CONSTRUCT
MISSING_POLICY
MISSING_PERMISSION
MISSING_APPROVAL
MISSING_VERIFIER
SCHEMA_MISMATCH
UNSUPPORTED_EXECUTION_SEMANTICS
POLICY_BLOCKED
ENVIRONMENT_BLOCKED
```

A failure MUST NOT automatically create a new Node Type.

---

# 31. Gap-to-Node Decision Algorithm

When Spec 212 discovers an unsupported case:

```text
Gap
 ↓
Is it workflow input/output/context/secret?
 ├─ yes → WorkflowInterface / WorkflowBinding
 └─ no
     ↓
Is it retry/timeout/checkpoint/cache/budget/fallback/concurrency/error boundary?
 ├─ yes → PolicyAttachment / ExecutionScope
 └─ no
     ↓
Is it trace/log/metric/status/audit projection?
 ├─ yes → InstrumentationAttachment
 └─ no
     ↓
Can an existing Node Type + new capability/model/agent/workflow binding express it?
 ├─ yes → register binding/capability, NOT Node Type
 └─ no
     ↓
Can existing Node Type + versioned mode/config express it?
 ├─ yes → evolve existing manifest
 └─ no
     ↓
Can a small composition of existing canonical types express it clearly?
 ├─ yes → improve AI Builder/template
 └─ no
     ↓
Run Node-Type Admission Test
     ↓
Only then propose a new semantic type
```

This ordering is mandatory.

---

# 32. Spec 212 Coverage by Composition — Representative Patterns

Examples are illustrative, not golden graphs.

```text
Web research
WorkflowInterface input
→ data.retrieval / automation.computer_use
→ ai.model
→ quality.verifier
→ WorkflowInterface output binding

Coding agent
WorkflowInterface input
→ ai.agent
→ core.capability(test/build)
→ quality.verifier
→ human.approval
→ core.capability(PR)
→ output binding

Media production
input ArtifactRefs
→ data.retrieval
→ ai.model/core.capability
→ multiple ready branches under ConcurrencyScope
→ flow.join
→ data.artifact
→ quality.verifier
→ core.capability(render/publish)
→ output binding

Scheduled enterprise automation
core.trigger(schedule)
→ data.retrieval
→ flow.router
→ core.capability
→ human.approval when required
→ quality.verifier

Computer Use fallback
core.capability(WebMCP attempt)
→ flow.router(success?)
→ automation.computer_use
→ quality.verifier

Multi-agent
input binding
→ several ai.agent nodes activated concurrently
→ flow.join
→ quality.verifier
→ flow.router(repair?)
→ flow.loop around repair path
```

---

# 33. Registry API

Minimum logical APIs:

```text
registerNodeType(manifest)
getNodeType(typeId, exactVersion/range)
searchNodeTypes(query, semanticFamily, intent)
validateNodeInstance(instance)
getCompatiblePresets(typeId)
getBindingRequirements(typeId)
getCoverageMetadata(typeId)
getHistoricalManifest(typeId, version)
```

Capability/model/agent/workflow registries remain separate registries with their own search/resolve APIs.

Because this is a clean-slate semantic cutover, the Node Type Registry SHALL NOT expose compatibility aliases for the 112 pre-canonical implementation names.

---

# 34. Registry Scale for AI Builder

AI Builder SHALL use layered retrieval across separate indexes:

```text
Semantic Node index:
  typeId / family / retrievalSummary / intents / concepts

Binding indexes:
  TriggerDescriptor
  ModelDescriptor
  AgentDescriptor
  CapabilityDescriptor
  WorkflowDescriptor
  RetrievalProfile
  VerifierDescriptor

Compatibility filter:
  NodeResolutionContract
  schema projection
  trust/lifecycle/policy
```

Only the top compatible pairs should load full manifests/descriptors into context. This prevents context growth while preserving typed execution reality.

---

# 35. Extension Node Types

Plugins/tenants/marketplace MAY register extension semantic types only when the Node-Type Admission Test passes.

Recommended IDs:

```text
plugin.<pluginId>.<semanticType>
tenant.<tenantId>.<semanticType>
marketplace.<publisher>.<semanticType>
```

A provider-specific operation almost always belongs in a capability/model/agent binding under a core type, not an extension Node Type.

Extension types MUST declare:

```text
publisher
package digest/signature
host API version
trust status
compatibility
UI isolation
runtime requirement
security requirement
```

AI Builder SHALL prefer core semantic types plus registered bindings whenever both can represent the same semantics.

---

# 36. Versioning and Future Evolution

```ts
interface NodeCompatibilityContract {
  minStudioVersion?: string;
  minCompilerContractVersion?: string;
  configSchemaCompatibility?: "backward" | "forward" | "full" | "none";
  portCompatibility?: "backward" | "forward" | "full" | "none";
}

interface NodeLifecycleContract {
  status: "experimental" | "active" | "deprecated" | "retired" | "quarantined";
  replacementTypeId?: string;
  deprecatedAt?: string;
  retiredAt?: string;
}
```

There is **no requirement to migrate existing user workflows into v4**, because none exist at this design stage.

Future published workflows created after v4 adoption MUST, however, have explicit compatibility/migration behavior for breaking manifest changes. Historical manifests referenced by published workflow versions or resumable runs MUST remain retrievable according to retention policy.

Future breaking changes MAY register a deterministic migration descriptor:

```ts
interface NodeMigrationDescriptor {
  typeId: string;
  fromVersionRange: string;
  toVersion: string;

  configMigratorRef?: string;
  portMap?: Record<string, string | null>;
  bindingMigratorRef?: string;

  deterministic: true;
  packageDigest: string;
}
```

Migration descriptors apply only to workflows created under canonical v4+ contracts. They MUST NOT be used to resurrect the 112 pre-canonical IDs.

---

# 37. Validation Layers

## Registration
- manifest schema valid;
- `typeId` unique/alias-safe;
- no forbidden core-provider naming;
- ports/config/security contracts valid;
- package/trust checks pass.

## Authoring
- AI Builder chooses registered type;
- preset compatible;
- config and ports valid;
- capability IDs resolvable or clearly unresolved setup dependency.

## Compile — Spec 215
- versions pinned;
- bindings/edges valid;
- runtime requirements satisfiable or explicit blocked state;
- security/governance preconditions valid.

## Runtime — Spec 215
- live capability/runtime/credential/policy revalidation;
- no stale/revoked dependency is silently executed.

---

# 38. AI Builder Guardrails

AI Builder MUST NOT:

- invent Node Type IDs;
- turn provider/model/tool names into Node Types;
- duplicate equivalent nodes under different display labels;
- bypass required approval/verifier nodes;
- embed credentials in config;
- create arbitrary graph cycles;
- assume runtime availability from capability existence;
- treat an MCP/A2A/ACP protocol as a semantic Node Type;
- treat a Marketplace Template as a Node Type when it is a workflow/subflow/template composition.

AI Builder SHOULD explain why it selected each semantic node family when requested.

---

# 39. Node Catalog Conformance Tests

For every core type, maintain tests for:

```text
manifest validation
fixed and binding-derived port/schema projection
config defaults/canonicalization
AI retrieval/discovery
invalid config rejection
security/governance declaration validation
Spec 215 compile compatibility
mock runtime compatibility
TH/EN display metadata
duplicate-semantic rejection
extension admission rejection/acceptance
```

Cross-family tests MUST explicitly exercise:

```text
data map vs workflow loop
data join vs flow join
model classifier vs router
model call vs agent loop
capability vs agent
artifact lifecycle vs capability
retrieval vs generic capability
engine retry vs semantic loop
context/secret binding vs node
instrumentation vs node
parallel graph fan-out vs join
```

---

# 40. Spec 214 ↔ Spec 215 Contract Boundary

Spec 214 owns:

```text
NodeTypeManifest
NodePreset
NodeInstance semantic schema
NodeBindingRef contract
Port/Config/UI contracts
RuntimeRequirementContract
ExecutionDeclaration
SecurityRequirementContract
DataGovernanceDeclaration
AIBuilderDescriptor
future type version/lifecycle metadata
```

Spec 215 owns:

```text
WorkflowInterface
WorkflowDefinition
WorkflowBinding / SecretBinding / ContextBinding
ExecutionScope / ConcurrencyScope / ErrorBoundary / transaction-saga scope
PolicyAttachment
InstrumentationAttachment
edge graph + output mappings
CompiledNode
ExecutionPlan
WorkflowRun
NodeRun
NodeAttempt
scheduler/dispatcher
capability + placement resolution
runtime adapter invocation
lease/fencing
checkpoint/resume
retry/cancel/timeout
stream/event delivery
side-effect commit/compensation
DLQ/recovery/DR
```

Spec 215 MUST NOT invent semantic Node Types or hidden type-specific behavior absent from manifests.

Spec 214 MUST NOT turn runtime policies, bindings, instrumentation or graph scopes into Node Types merely because they appear visually in Studio.

---

# 41. Clean-Slate Implementation Cutover

There are implemented node classes and persisted Workflow Studio structures. Semantic compatibility and migration must therefore be decided by deployment inventory before the canonical cutover.

Implementation SHALL therefore favor a **single canonical cutover** over compatibility layers:

1. implement the 16 v4 core manifests;
2. implement Spec 215 non-node constructs (`WorkflowInterface`, bindings, scopes, policies, instrumentation);
3. update Spec 209 AI Builder/Studio to author only v4 semantic nodes and non-node constructs;
4. replace 112 old `nodeType` registrations rather than aliasing them;
5. refactor reusable code from old implementations behind new model/agent/capability/runtime adapters;
6. delete runtime branches that key directly on the 112 old names;
7. regenerate presets from semantic types + binding descriptors;
8. run the entire Spec 212 corpus and 112-name disposition conformance tests;
9. fail CI if a removed old type reappears in newly authored WorkflowDefinitions.

Code reuse is encouraged. Semantic-ID compatibility is not required.

---

# 42. Spec 212 Continuous Coverage Workflow

```text
Spec 212 corpus / real user holdout
       ↓
Spec 209 AI Builder
       ↓
Spec 214 registry search
       ↓
WorkflowDefinition with canonical typeIds
       ↓
Spec 215 compile + validate + resolve
       ↓
dry-run / sandbox / E2E
       ↓
quality.verifier / independent verifier
       ↓
Spec 212 grading
       ↓
Gap attribution
       ↓
Capability / Runtime / AI Builder / Node Type / Policy owner
```

This loop is the mechanism that keeps the 16-type taxonomy honest as new use cases appear.

---


# 43. Core Node Contract Profiles — Minimum Implementable Surface

| `typeId` | Minimum semantic input/output | Required contract concepts |
|---|---|---|
| `core.trigger` | external event/time source → typed trigger payload | trigger source descriptor, payload schema, auth/dedupe hints |
| `data.transform` | typed value(s) → typed transformed value(s) | pure bounded operation/expression/template/parser |
| `ai.model` | prompt/context/media refs → model output/usage | model binding, instructions/prompt, output schema, generation params |
| `ai.agent` | goal/context/artifacts → result/session/evidence | agent binding, tool grants, stop/budget policy references, memory declaration |
| `core.capability` | bound-operation input → bound-operation output | capability binding, projected schemas, effect preflight |
| `data.retrieval` | query/filter/context → ranked items + provenance | retrieval source/profile, ranking mode, provenance |
| `flow.subflow` | child interface inputs → child outputs | workflow binding/version policy, mappings |
| `flow.router` | existing value/context → named route activation(s) | deterministic predicates/rules, default/multi-route policy |
| `flow.join` | branch completion/results → joined completion/result | all/any/n-of-m/barrier/race, timeout/partial policy |
| `flow.loop` | collection/state/control → iteration/final values | foreach/while/until, deterministic bounds, concurrency, termination |
| `human.approval` | material operation summary → decision evidence | actor/role/quorum, exact approval subject, expiry/escalation |
| `human.input` | request/context → typed response | response schema, actor/role, expiry/handoff |
| `flow.wait` | time/event/callback descriptor → resume signal | wait kind, correlation, expiry |
| `automation.computer_use` | goal/target/context → result/evidence/artifacts | target/session profile, allowed strategies, takeover/safety |
| `data.artifact` | ArtifactRef/value → ArtifactRef/manifest | persist/materialize/package/export/representation policy |
| `quality.verifier` | subject/evidence/rubric → verdict + evidence | verifier binding/mode, rubric/schema, thresholds |

## 43.1 Semantic boundary tests

### WorkflowInterface vs `human.input`
Initial invocation fields belong to `WorkflowInterface`. Data requested after execution starts is `human.input`.

### `data.transform` vs `flow.loop`
Transforming items already present in one in-memory value is `data.transform`. Executing a workflow body per item/iteration is `flow.loop`.

### `data.transform` vs `flow.join`
Joining/merging data records is `data.transform`. Waiting for concurrent branches is `flow.join`.

### `ai.model` vs `flow.router`
Model classification produces a class/value. `flow.router` deterministically selects route(s) from that value; it does not call the model itself.

### `ai.model` vs `ai.agent`
One inference request is `ai.model`; a goal-directed tool/delegation loop is `ai.agent`.

### `ai.agent` vs `flow.loop`
Agent internal reasoning/tool iteration belongs inside `ai.agent`. Repeating workflow graph work under explicit bounds is `flow.loop`.

### `core.capability` vs `data.transform`
Pure bounded value transformation is `data.transform`; tool/API/sidecar/provider operations are `core.capability`.

### `data.retrieval` vs `core.capability`
Retrieval has standardized ranked-result/provenance semantics; generic operations do not.

### `data.artifact` vs `core.capability`
Artifact lifecycle/integrity/storage boundary is `data.artifact`; external publication/business actions are capabilities.

### `quality.verifier` vs `ai.model`
A verifier owns a typed verdict/evidence contract even when a model implements it.

### Graph fan-out vs `flow.join`
Fan-out is graph readiness/concurrency scope; `flow.join` is an explicit synchronization point.

## 43.2 Anti-duplication examples

```text
webhook-trigger            -> core.trigger preset
schedule-trigger           -> core.trigger preset
llm-prompt/summarizer      -> ai.model presets
skill/http/mcp-tool        -> core.capability bindings
notification               -> core.capability binding
condition/switch           -> flow.router presets
parallel                   -> graph fan-out + ConcurrencyScope
retry                      -> RetryPolicyAttachment
checkpoint                 -> CheckpointPolicyAttachment
trace/log/metric           -> InstrumentationAttachment
secret-reference           -> SecretBinding
tenant/user/project context-> WorkflowBinding
result-view/preview         -> Studio UI
browser_observe/action      -> Computer Use runtime internals
```

---

# 44. Acceptance Criteria

Spec 214 v4 is complete when:

- [ ] exactly 16 core semantic Node Types are registered unless a later admitted type passes the formal admission test;
- [ ] all 112 implemented pre-canonical names are accounted for without requiring aliases;
- [ ] WorkflowInterface/input/output are not executable Node Types;
- [ ] graph fan-out/concurrency is not represented by a fork-only Node Type;
- [ ] context/config/secret/previous-run values use typed bindings rather than nodes;
- [ ] retry/checkpoint/budget/cache/fallback concerns use Spec 215 policies/scopes rather than nodes;
- [ ] trace/log/metric/status use instrumentation rather than nodes;
- [ ] generic semantic types retain strong typed ports through binding-derived schema projection;
- [ ] side effects and execution lifecycle have one authoritative contract;
- [ ] provider/product/protocol names do not fragment the core taxonomy;
- [ ] AI Builder cannot invent or select system-only control-plane primitives as Node Types;
- [ ] all 16 types compile through Spec 215 conformance tests;
- [ ] Spec 212 can run 5,860 TH/EN canonical generations and attribute gaps correctly;
- [ ] extension types are rejected when an existing type + binding/profile/composition is sufficient.

---

# 45. Mandatory Invariants

1. Node Type expresses stable workflow semantics, not provider/product identity.
2. Spec 214 contains no scheduler/queue/run state machine.
3. Workflow inputs/outputs are interface contracts, not nodes.
4. Context, config, secrets and previous-run values are bindings, not nodes.
5. Retry, timeout, checkpoint, cache, budget and fallback are runtime policies unless represented as explicit business logic using canonical nodes.
6. Trace/log/metric/status are instrumentation, not nodes.
7. Static fan-out requires no fork-only node; explicit synchronization uses `flow.join`.
8. Data collection `map/join/merge` semantics are not confused with workflow loop/join semantics.
9. Model classification is not hidden inside router semantics.
10. Generic capability/model/agent/subflow nodes remain strongly typed through descriptor/schema projection.
11. `ExecutionDeclaration` is the sole source of node execution/effect semantics.
12. Runtime/provider/protocol binding never changes semantic `typeId`.
13. System-only capability/control-plane operations are not ordinary authoring nodes.
14. Computer-use low-level primitives are internal to the Computer Use runtime unless deliberately exposed as independent registered capabilities.
15. Every new semantic type must pass the admission test.
16. Spec 212 coverage may reveal a gap but cannot bypass admission rules.
17. Spec 215 may optimize structural execution but may not invent hidden semantic types.
18. No pre-canonical `nodeType` name is preserved solely because code already exists.

---

# 46. Implementation Priority

## Phase A — Canonical contracts
- register 16 v4 manifests;
- implement descriptor/binding schema projection;
- define extension admission/conformance tests.

## Phase B — Non-node architecture bridge
- implement Spec 215 WorkflowInterface, bindings, scopes, policies and instrumentation;
- remove assumptions that every Canvas card must be a Node Type.

## Phase C — Studio / AI Builder cutover
- replace old 112-type palette/selection logic;
- render virtual workflow input/output surfaces;
- drive presets from semantic type + descriptor binding.

## Phase D — Runtime cutover
- make Spec 215 compile only v4 WorkflowDefinitions;
- remove old type-switch runtime branches after reusable code is adapterized.

## Phase E — Coverage
- execute Spec 212 full corpus;
- run all 112 disposition tests;
- admit additional type only when evidence passes Section 5.

---

# 47. Definition of Done

Spec 214 is done when SmartAIHub can represent every supported Spec 212 workflow using a small, non-overlapping semantic vocabulary; AI Builder can select only real typed nodes/bindings; Spec 215 can compile them without hidden node-specific exceptions; and none of the 112 previous implementation names must survive as a Node Type merely for compatibility.

---

# 48. Revision 4 — Thirty-Pass Clean-Slate Audit

| Pass | Focus | Result / correction |
|---:|---|---|
| 1 | 112-name semantic coverage | All 112 names accounted for; none force compatibility. |
| 2 | Workflow interface boundary | Removed `core.input` and `core.output` as executable Node Types. |
| 3 | Parallelism semantics | Removed `flow.parallel`; fan-out is graph readiness + ConcurrencyScope. |
| 4 | Data join vs control join | Defined relational/data join as transform; branch synchronization as `flow.join`. |
| 5 | Data map vs workflow iteration | Defined bounded value map as transform; body execution per item as `flow.loop`. |
| 6 | AI classification vs routing | Classifier is model inference; router is deterministic choice. |
| 7 | Prompt templating | Moved deterministic prompt-template behavior to `data.transform`. |
| 8 | Context/config/secret handling | Moved tenant/user/project/config/secret/previous-run concerns to bindings. |
| 9 | Retry/checkpoint semantics | Moved engine retry/checkpoint to PolicyAttachment. |
| 10 | Error handling | Moved catch/finally/transaction concerns to error edges/ExecutionScope. |
| 11 | Observability | Moved trace/log/metric/run-status to InstrumentationAttachment. |
| 12 | Capability control plane | Search/describe/status/result are services, not workflow nodes. |
| 13 | Computer Use | Collapsed browser session/observe/action primitives behind `automation.computer_use`. |
| 14 | Platform economics | Budget guard and reserve/capture lifecycle are Spec 207/runtime policy, not nodes. |
| 15 | Media taxonomy | Collapsed model/provider-specific media names into model/capability presets/bindings. |
| 16 | Artifact boundary | Separated artifact lifecycle from generic file/tool operations. |
| 17 | Generic typing | Added binding/config-derived port and config schema projection. |
| 18 | Binding identity | Added `NodeResolutionContract` + `NodeBindingRef`. |
| 19 | Execution contract duplication | Removed side-effect/streaming duplicate sources of truth. |
| 20 | Extension governance | Strengthened admission test so plugin/provider operations remain capabilities. |
| 21 | Compatibility boundary | Kept old IDs non-canonical while requiring deployment inventory and rollback evidence before cutover. |
| 22 | Spec 212 coverage | Retained the current R20 2,930-case / 5,860-prompt regression requirement. |
| 23 | AI Builder safety | Blocked system-only/control-plane primitives from normal node selection. |
| 24 | Cross-spec ownership | Moved interface/bindings/scopes/policies/instrumentation ownership to Spec 215. |
| 25 | Manual invocation | Removed the need for a synthetic manual trigger; direct invocation starts from WorkflowInterface. |
| 26 | Trigger typing | Added `TriggerDescriptor` binding so trigger config/output schemas remain strongly typed. |
| 27 | Output mapping | Confirmed Workflow outputs are interface mappings rather than output nodes. |
| 28 | Non-node schema discipline | Required versioned typed descriptors for policies/scopes/instrumentation in Spec 215. |
| 29 | Policy precedence | Required deterministic merge/inheritance rules so node/scope/workflow policies cannot conflict silently. |
| 30 | Mutable state | Required immutable workflow variables; evolving state must be explicit loop/external state semantics. |

No audit pass found a justified need to add a seventeenth core Node Type. The important gaps were architectural constructs incorrectly modeled as nodes.

---

# Appendix A — Disposition of All 112 Implemented `nodeType` Names

This appendix is design evidence, not a compatibility map. The old names SHALL NOT be registered as aliases merely because they were implemented.


## A.1 Trigger/Input

| Old implemented name | Disposition | Canonical target |
|---|---|---|
| `manual-input` | remove-node | WorkflowInterface + manual invocation |
| `form-input` | remove-node | WorkflowInterface / human.input |
| `webhook-trigger` | canonical-node | core.trigger |
| `schedule-trigger` | canonical-node | core.trigger |
| `chat-trigger` | canonical-node | core.trigger |
| `library-input` | remove-node | WorkflowBinding(artifact/library) or data.retrieval |
| `file-input` | remove-node | WorkflowInterface(ArtifactRef) |
| `project-input` | remove-node | WorkflowBinding(project-context) |
| `previous-run-input` | remove-node | WorkflowBinding(previous-run) |

## A.2 Data/Document

| Old implemented name | Disposition | Canonical target |
|---|---|---|
| `document-parser` | canonical-node | data.transform |
| `ocr` | preset-or-binding | ai.model / core.capability |
| `document-extractor` | preset-or-binding | ai.model / core.capability |
| `document-classifier` | composition | ai.model + flow.router |
| `chunker` | canonical-node | data.transform |
| `structured-parser` | canonical-node | data.transform |
| `data-transform` | canonical-node | data.transform |
| `filter` | canonical-node | data.transform |
| `map` | canonical-node | data.transform |
| `reduce` | canonical-node | data.transform |
| `join` | ambiguous-remove | data.transform OR flow.join |
| `split` | canonical-node | data.transform |
| `merge` | canonical-node | data.transform |

## A.3 Search/Memory/System

| Old implemented name | Disposition | Canonical target |
|---|---|---|
| `library-search` | canonical-node | data.retrieval |
| `vector-search` | canonical-node | data.retrieval |
| `rerank` | canonical-node | data.retrieval |
| `citation-builder` | canonical-node | data.transform |
| `embedding` | canonical-node | ai.model |
| `tenant-context` | remove-node | WorkflowBinding |
| `user-context` | remove-node | WorkflowBinding |
| `project-context` | remove-node | WorkflowBinding |
| `config-value` | remove-node | WorkflowBinding |
| `secret-reference` | remove-node | SecretBinding |

## A.4 AI/Agent

| Old implemented name | Disposition | Canonical target |
|---|---|---|
| `llm-prompt` | canonical-node | ai.model |
| `llm-structured` | canonical-node | ai.model |
| `classifier` | canonical-node | ai.model |
| `summarizer` | canonical-node | ai.model |
| `translator` | canonical-node | ai.model |
| `prompt-template` | canonical-node | data.transform |
| `ai-agent` | canonical-node | ai.agent |
| `skill` | canonical-node | core.capability |
| `external-agent` | canonical-node | ai.agent |
| `subflow-call` | canonical-node | flow.subflow |

## A.5 Tool/Integration

| Old implemented name | Disposition | Canonical target |
|---|---|---|
| `http-request` | canonical-node | core.capability |
| `mcp-tool` | canonical-node | core.capability |
| `connector-action` | canonical-node | core.capability |
| `database-query` | canonical-node | core.capability |
| `database-write` | canonical-node | core.capability |
| `notification` | canonical-node | core.capability |
| `file-transform` | canonical-node | core.capability |
| `artifact-store` | canonical-node | data.artifact |
| `artifact-publish` | canonical-node | data.artifact |
| `browser_session_start` | runtime-internal | automation.computer_use runtime/session state |
| `browser_session_instruction` | runtime-internal | automation.computer_use runtime/session state |
| `browser_session_wait_for_user` | composition | automation.computer_use + human.input |
| `browser_session_review_gate` | composition | automation.computer_use + human.approval |

## A.6 Media/Production

| Old implemented name | Disposition | Canonical target |
|---|---|---|
| `image-generate` | preset-or-binding | ai.model / core.capability |
| `video-generate` | preset-or-binding | ai.model / core.capability |
| `audio-generate` | preset-or-binding | ai.model / core.capability |
| `tts` | preset-or-binding | ai.model / core.capability |
| `transcription` | preset-or-binding | ai.model / core.capability |
| `storyboard` | preset-or-binding | ai.agent / core.capability |
| `media-compose` | canonical-node | core.capability |
| `media-qc` | canonical-node | quality.verifier |
| `render` | canonical-node | core.capability |
| `preview` | remove-node | Studio UI / Artifact preview |

## A.7 Control/Human

| Old implemented name | Disposition | Canonical target |
|---|---|---|
| `condition` | canonical-node | flow.router |
| `switch` | canonical-node | flow.router |
| `parallel` | remove-node | Graph fan-out + ConcurrencyScope |
| `loop` | canonical-node | flow.loop |
| `foreach` | canonical-node | flow.loop |
| `delay` | canonical-node | flow.wait |
| `retry` | remove-node | RetryPolicyAttachment |
| `human-approval` | canonical-node | human.approval |
| `human-input` | canonical-node | human.input |
| `checkpoint` | remove-node | CheckpointPolicyAttachment |
| `error-handler` | remove-node | ErrorBoundaryScope + error edges |
| `subflow` | canonical-node | flow.subflow |
| `run-until` | canonical-node | flow.loop |

## A.8 Output/Observability

| Old implemented name | Disposition | Canonical target |
|---|---|---|
| `result-view` | remove-node | WorkflowInterface output + Studio UI |
| `output-mapper` | remove-node | WorkflowOutputBinding / data.transform |
| `trace-event` | remove-node | InstrumentationAttachment / runtime projection |
| `log` | remove-node | InstrumentationAttachment / runtime projection |
| `metric` | remove-node | InstrumentationAttachment / runtime projection |
| `run-status` | remove-node | InstrumentationAttachment / runtime projection |

## A.9 Cross-spec Capability/Execution

| Old implemented name | Disposition | Canonical target |
|---|---|---|
| `external-agent-task` | canonical-node | ai.agent |
| `capability-search` | control-plane | Capability Registry service |
| `capability-describe` | control-plane | Capability Registry service |
| `capability-invoke` | canonical-node | core.capability |
| `capability-status` | control-plane | Runtime/Capability status service |
| `capability-result` | control-plane | Runtime/Capability status service |
| `asset-select` | composition | data.retrieval / human.input |
| `asset-preview` | remove-node | Studio UI / Artifact preview |
| `context-package` | remove-node | WorkflowBinding / data.transform |
| `workspace-bind` | remove-node | WorkflowBinding(workspace) |
| `git-operation` | canonical-node | core.capability |
| `verification` | canonical-node | quality.verifier |
| `code-task` | preset-or-binding | ai.agent / core.capability |
| `economic-quote` | canonical-node | core.capability |
| `budget-guard` | remove-node | BudgetPolicyAttachment |
| `economic-reserve` | runtime-internal | Spec 207 economic runtime/control plane |
| `economic-authorization` | runtime-internal | Spec 207 economic runtime/control plane |
| `economic-capture` | runtime-internal | Spec 207 economic runtime/control plane |
| `economic-release` | runtime-internal | Spec 207 economic runtime/control plane |
| `economic-status` | runtime-internal | Spec 207 economic runtime/control plane |
| `settlement-report` | canonical-node | core.capability |
| `browser_observe` | runtime-internal | automation.computer_use strategy/runtime primitive |
| `browser_action` | runtime-internal | automation.computer_use strategy/runtime primitive |
| `browser_file_transfer` | runtime-internal | automation.computer_use strategy/runtime primitive |
| `browser_verify` | runtime-internal | automation.computer_use strategy/runtime primitive |
| `browser_takeover` | composition | automation.computer_use + human.input |
| `managed-agent-fleet` | control-plane | Agent runtime/fleet service |
| `agent-session-control` | control-plane | Agent runtime/fleet service |

---

# Appendix B — Clean-Slate CI Guard

After the v4 cutover, CI SHOULD scan authored workflow fixtures, presets and runtime dispatch code for the 112 removed IDs.

Allowed occurrences:

```text
audit fixtures
historical design evidence
tests proving rejection
migration-free code comments/documents
```

Forbidden occurrences:

```text
new WorkflowDefinition.typeId
new palette registrations
runtime dispatch switch/case
new presets whose semantic ID is an old type
```

The goal is to reuse implementations behind adapters, not to reintroduce the old taxonomy.

---

# 70. Revision 5 — Spec 225/226 Device-Independent Access Alignment

**Status of this spec:** not yet implemented at the time of this amendment; therefore this requirement is incorporated directly before implementation.

Spec 214 SHALL remain device/UI neutral. Node Type contracts MUST NOT encode `web`, `desktop`, `mobile`, `tablet`, `telegram`, or any specific control surface as execution semantics.

Human-facing node contracts such as `human.input`, `human.approval` and interaction-capable nodes SHALL describe required **interaction capabilities**, not a client implementation. Examples:

```text
interaction.text
interaction.choice
interaction.file_upload
interaction.image_capture
interaction.video_capture
interaction.voice
interaction.preview
interaction.approval
interaction.remote_handoff
```

Spec 225 chooses an eligible user control surface. Spec 226 bridges those interactions into the already-implemented baseline.

`automation.computer_use` remains one canonical Node Type and continues to resolve through Spec 208; a mobile client MUST NOT create a `mobile.browser_use` or `mobile.computer_use` Node Type.

Acceptance additions:

- Node manifests are control-surface independent;
- human interaction requirements are machine-readable capabilities;
- workflows authored once can be initiated from Web/PWA/mobile/tablet where the required interaction contract is satisfiable;
- lack of a mobile UI for an authoring feature does not change workflow execution semantics.


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

# Revision 6 — Canonical Retrieval Node Alignment

This revision aligns `data.retrieval` with Spec 229 while preserving Spec 214 ownership of Node Type semantics.

`data.retrieval` SHALL remain provider-neutral. Its manifest MAY declare retrieval intent such as:

```text
DOCUMENT_RAG
EXACT_IDENTIFIER
SEMANTIC_ENTITY
SKILL_DISCOVERY
CAPABILITY_DISCOVERY
SIMILAR_CASE
HYBRID_SEARCH
```

but MUST NOT encode `pgvector`, `Vectorize`, `AI Search`, embedding model, reranker or provider credentials as semantic Node Type identity.

Runtime bindings SHALL resolve through Spec 215 into Spec 229 Retrieval Broker. Search providers/profiles remain runtime/configuration concerns.

A `data.retrieval` output MUST expose normalized provenance/evidence references and degradation state. A high similarity score is not an authorization decision and cannot satisfy a human approval, policy rule or verifier requirement by itself.

Skill discovery remains `data.retrieval`/capability behavior; **no `skill.vector_search`, `skill.retrieval` or provider-specific Node Type SHALL be introduced.**

Required conformance tests:

1. Vector provider changes do not mutate WorkflowDefinition semantics.
2. Exact Spec/Skill IDs take the deterministic exact lane when supplied.
3. ACL-denied evidence is never emitted to the node output.
4. `SKILL_DISCOVERY` returns candidate references, not executable authority.
5. degraded/insufficient retrieval is visible and never silently reported as grounded success.
