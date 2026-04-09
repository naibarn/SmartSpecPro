# 076 - Hybrid Agency Runtime with Google ADK 2.0

Version: 1.1
Date: 2026-04-08
Status: Proposed
Depends-on: 027-AgencySwarm, 052-agency-swarm-full-capability, 059-external-worker-provider-framework, 071-openclaw-external-runtime-integration
Audience: Agency Builder, Web Control Plane, Python Runtime, QA, Platform
References:
- https://adk.dev/2.0/
- https://adk.dev/workflows/graph-routes/
- https://adk.dev/workflows/dynamic/
- https://adk.dev/workflows/human-input/
- https://github.com/google/adk-python

---

## 1. Executive summary

SmartSpecPro already has a ReactFlow-based **Agency Builder** plus an existing **Agency Swarm** runtime path. The next platform step is to let new agency graphs opt into **Google ADK 2.0** where ADK's graph and workflow primitives are a better fit, while preserving the current Agency Swarm behavior for existing agencies.

This feature introduces:

- a SmartSpecPro-owned **Agency Document v2**
- a **Canonical Agency Workflow IR**
- explicit **subgraph boundaries**
- a compile/lowering pipeline that targets:
  - `agency_swarm`
  - `adk2`
- a hybrid runtime orchestrator that keeps state, trace, contracts, and policy ownership inside SmartSpecPro

This feature does **not** rewrite the generic Workflow Editor or replace the current LangGraph workflow runtime. It extends the agency/agentic runtime stack only.

---

## 2. Repo-grounded interpretation

The user's requested architecture maps most closely to the **Agency Builder** system already present in this repo, not the generic Workflow Editor.

### 2.1 What already exists today

- Agency authoring UI:
  - `apps/web/client/src/components/agency/`
  - `apps/web/client/src/pages/AgencyBuilder.tsx`
- Existing agency node catalog:
  - `apps/web/client/src/components/agency/nodes/types.ts`
  - `apps/web/drizzle/schema.ts` via `agency_agents.nodeType`
- Existing agency persistence:
  - `agencies`
  - `agency_agents`
  - `agency_communication_flows`
  - `agency_versions`
  - `agency_run_traces`
- Existing Agency Swarm runtime boundary:
  - `apps/web/server/services/agencyBridge.ts`
  - `python-backend/app/services/agency_swarm_adapter.py`

### 2.2 What must remain outside this feature's blast radius

- The generic Workflow Editor in `apps/web/server/routers/workflow.ts`
- The LangGraph compiler/runtime in:
  - `python-backend/app/orchestrator/workflow_compiler.py`
  - `python-backend/app/orchestrator/langgraph_runtime.py`

### 2.3 Consequence for this spec

This feature introduces hybrid execution for **agency graphs**. It does not redefine SmartSpecPro's general-purpose workflow runtime. The platform will therefore have:

- existing generic workflows backed by LangGraph
- existing legacy agencies backed by Agency Swarm
- new hybrid agencies backed by Agency Swarm plus ADK 2.0 subgraphs

---

## 3. Problem statement

Agency Builder today is strongly shaped around Agency Swarm semantics, even though SmartSpecPro already owns many orchestration behaviors itself:

- routing rules
- branch handling
- loop handling
- data transforms
- guardrails
- trace collection

At the same time, Google ADK 2.0 now offers official support for:

- graph-based workflows
- parallel fan-out/join
- nested workflows
- human input
- dynamic workflows for loops and richer control flow

This creates an opportunity:

- keep Agency Swarm where it already works well
- add ADK where graph-native or dynamic workflow semantics are stronger
- do both without forcing a rewrite or migration of all existing agencies

The current codebase is missing the abstraction layers needed to do this safely:

- no canonical IR
- no explicit engine binding at subgraph level
- no cross-engine boundary contract
- no compile diagnostics explaining what lowers to which runtime

---

## 4. Goals

### 4.1 Functional goals

- Keep Agency Builder as the primary visual authoring UI.
- Preserve existing Agency Swarm agency behavior by default.
- Allow a new agency version to opt into ADK 2.0 at workflow or subgraph level.
- Support explicit subgraph partitioning between `agency_swarm` and `adk2`.
- Add compile-time validation, capability checks, and lowering diagnostics.
- Support bridge contracts for cross-engine execution.
- Preserve current tool assignment semantics on nodes.
- Support trace visibility down to subgraph and bridge level.

### 4.2 Non-functional goals

- Backward compatibility first.
- Deterministic compile behavior with explicit errors.
- Incremental rollout through feature flags.
- Minimal disruption to current agency storage and UI.
- Strong golden testing for legacy agencies.

---

## 5. Non-goals

- Do not replace the generic Workflow Editor with ADK.
- Do not replace Agency Swarm as the default runtime for existing agencies.
- Do not expose raw ADK APIs or authoring details directly in the UI.
- Do not introduce a standalone tool node in phase 1.
- Do not add a separate `join` node in phase 1 when `aggregator` already exists and can own merge semantics.
- Do not make ADK 2.0 a production default while official docs still mark it Alpha.

---

## 6. Design principles

1. Backward compatibility first.
2. ReactFlow UI stays SmartSpecPro-owned.
3. Canonical IR before engine binding.
4. Explicit boundaries over implicit magic.
5. SmartSpecPro owns state, trace, and policy across engines.
6. ADK 2.0 is opt-in, not a silent migration target.
7. Prefer additive schema changes over persistence rewrites.

---

## 7. Current-codebase fit

### 7.1 Agency Builder baseline

The current agency graph model already covers most of the requested semantics:

| Current repo node type | Existing fit |
|---|---|
| `agent` | direct |
| `supervisor` | direct |
| `autonomous_agent` | direct |
| `router` | direct |
| `aggregator` | direct |
| `knowledge_base` | direct |
| `skill_call` | direct |
| `skill_discovery` | direct |
| `human_approval` | direct |
| `conditional_branch` | direct |
| `parallel_fan_out` | direct |
| `loop_retry` | direct |
| `data_transform` | direct |

This means the safest product path is to extend the agency system rather than invent a second graph UI.

### 7.2 Tool model baseline

Tools are currently attached to nodes through:

- `agency_tools`
- `agency_agent_tools`
- node-level tool configuration

This feature keeps that model. A standalone tool node may be considered later, but is not required for hybrid runtime phase 1.

### 7.3 Runtime baseline

Agency Swarm already sits behind a Python adapter boundary, which makes the following design feasible:

- SmartSpecPro canonical IR
- engine-specific lowering
- engine-specific adapters
- SmartSpecPro-managed bridge runner

### 7.4 Python runtime baseline

The current Python backend already requires Python `>=3.12`, while ADK 2.0 docs require Python `>=3.11`. This means runtime language version is not the blocker. The blocker is product safety and adapter maturity.

---

## 8. Proposed architecture

```text
ReactFlow Agency Builder
  -> Agency Document Assembler
  -> Canonical Agency Workflow IR
  -> Validator / Capability Matrix / Linter
  -> Compile Planner
       -> Agency Swarm Adapter
       -> ADK 2.0 Adapter
       -> Hybrid Bridge Planner
  -> Hybrid Agency Runner
  -> Trace / Diagnostics / Compile Preview
```

### 8.1 Logical layers

- Authoring layer:
  - existing Agency Builder canvas, palette, node property panels
- Model layer:
  - Agency Document v2
  - Canonical IR
- Compile layer:
  - validation
  - capability checks
  - subgraph partitioning
  - engine lowering
- Execution layer:
  - engine-specific subgraph runners
  - bridge runner
  - SmartSpecPro-owned state envelope
- Observability layer:
  - compile diagnostics
  - run traces
  - boundary payload inspection

### 8.2 Important platform boundary

The generic Workflow Editor remains a separate runtime system and does not compile through this architecture in phase 1.

---

## 9. Agency Document v2

Agency persistence may remain normalized in the database, but the compile pipeline needs an assembled UI/service-layer document with explicit hybrid metadata.

### 9.1 Proposed assembled document shape

```json
{
  "agencyId": "ag_123",
  "name": "Content Factory Agency",
  "documentVersion": "2.0",
  "defaultEngine": "agency_swarm",
  "nodes": [],
  "edges": [],
  "subgraphs": [],
  "settings": {
    "compileMode": "strict",
    "compatibilityMode": "preserve_agency_swarm",
    "traceLevel": "standard"
  }
}
```

### 9.2 Persistence strategy

This document is a SmartSpecPro service-layer contract. It does not require replacing current normalized tables. Instead:

- existing `agency_agents` rows still back node storage
- existing `agency_communication_flows` rows still back edge storage
- `agency_versions.snapshotJson` stores version snapshots
- new hybrid metadata is added through additive columns/tables only where necessary

For agencies with `documentVersion >= 2.0`, `agency_versions.snapshotJson` should store the full assembled Agency Document v2, not only `{ name, nodes, edges }`. Legacy snapshots remain readable and are normalized into Document v2 in memory.

### 9.3 Recommended additive persistence changes

- Extend `agencies` with:
  - `documentVersion`
  - `defaultEngine`
  - `compileMode`
  - `compatibilityMode`
- Extend `agency_versions.snapshotJson` contract so hybrid versions persist:
  - `documentVersion`
  - `defaultEngine`
  - `nodes`
  - `edges`
  - `subgraphs`
  - `settings`
- Extend `agency_agents` with:
  - `subgraphId`
  - `engineHint`
  - `runtimeConfig`
- Add `agency_subgraphs`
- Add `agency_compile_artifacts`

### 9.4 Why additive persistence is preferred

- minimizes migration risk
- preserves existing routers and version history patterns
- allows existing agencies to remain valid without immediate rewrites

---

## 10. Canonical Agency Workflow IR

### 10.1 IR shape

```json
{
  "irVersion": "1.0",
  "agency": {
    "id": "ag_123",
    "name": "Content Factory Agency"
  },
  "graph": {
    "nodes": [],
    "edges": [],
    "entryNodes": [],
    "exitNodes": []
  },
  "subgraphs": [],
  "policies": {},
  "bindings": {},
  "metadata": {}
}
```

### 10.2 Canonical node shape

```json
{
  "id": "node_1",
  "type": "agent",
  "label": "Research Lead",
  "subgraphId": "sg_root",
  "engineHint": null,
  "config": {},
  "runtime": {
    "timeoutMs": 120000,
    "retryPolicy": null,
    "concurrencyKey": null
  },
  "toolBindings": [],
  "ui": {
    "position": { "x": 100, "y": 100 }
  }
}
```

### 10.3 IR responsibilities

- normalize current row-based agency data into one graph representation
- hide engine-specific details from the UI
- allow deterministic validation before lowering
- support compile preview and future diffing

---

## 11. Engine model

### 11.1 Supported engines

- `agency_swarm`
- `adk2`

### 11.2 Binding modes

1. Agency-level binding
2. Subgraph-level binding
3. Legacy forced binding
4. Compile-target override for dev/test only

### 11.3 Default behavior

- Existing agencies remain `agency_swarm`.
- New agencies remain `agency_swarm` unless the hybrid ADK feature flag is enabled.
- ADK 2.0 is opt-in only.

### 11.4 Feature flag posture

Recommended new tenant flag:

- `agencyHybridAdk`

Default:

- `false`

### 11.5 Runtime deployment posture

- Phase 1 `adk2` executes as an in-process Python backend engine managed by the existing agency runtime boundary.
- This feature reuses SmartSpecPro control-plane ownership patterns from specs 059 and 071 for flags, idempotency, artifact publication, audit, and policy, but does **not** introduce ADK as a generic worker-runtime family in phase 1.
- If ADK is externalized later, the Agency Document v2, Canonical IR, bridge contracts, and run/result contracts defined here remain stable.

---

## 12. Node catalog and capability matrix

### 12.1 Phase-1 persisted node catalog

- `agent`
- `supervisor`
- `autonomous_agent`
- `router`
- `aggregator`
- `knowledge_base`
- `skill_call`
- `skill_discovery`
- `human_approval`
- `conditional_branch`
- `parallel_fan_out`
- `loop_retry`
- `data_transform`
- `error_handler`
- `engine_boundary`

### 12.2 Structural semantics and non-node constructs

- `subgraph` is a document/container concept in phase 1, not a persisted `agency_agents.nodeType`.
- Existing `isEntryPoint` on agency nodes remains the canonical persisted entry semantic; the compiler projects it into IR `entryNodes`.
- `start` and `end` are compile-time or preview-time structural markers only. They are not stored as new phase-1 node rows.
- Terminal semantics are derived from leaf nodes, explicit output bindings, or boundary exits.
- `engine_boundary` is the only new phase-1 structural node that must persist explicitly when a user bridges engines.

### 12.3 Product adaptation choices

- `aggregator` is the phase-1 join/merge node.
- tools remain attached to nodes, not separate nodes.
- `human_approval` is the phase-1 human-input/approval semantic in the current repo vocabulary.

### 12.4 Capability matrix

| Node type | Agency Swarm | ADK 2.0 | Notes |
|---|---|---|---|
| `agent` | Native | Native | both engines support agent nodes |
| `supervisor` | Native | Lower to coordinator/collaborative agent | ADK lowering required |
| `autonomous_agent` | Compatible | Lower to agent + policies | semantics differ |
| `router` | Compatible/emulated | Native-ish graph route | ADK fit is stronger |
| `aggregator` | Adapter-managed | Native-ish join/merge | phase-1 join semantic |
| `knowledge_base` | Native wrapper | Native wrapper | keep platform-owned retrieval contract |
| `skill_call` | Native wrapper | Native wrapper | keep platform-owned skill bridge |
| `skill_discovery` | Platform layer | Platform layer | not engine-owned |
| `human_approval` | Pause/resume via SmartSpecPro | Native-ish via ADK request input | UI stays SmartSpec-owned |
| `conditional_branch` | Existing platform logic | Graph route / dynamic workflow | depends on complexity |
| `parallel_fan_out` | Adapter-managed | Graph route or dynamic parallel | ADK fit is stronger |
| `loop_retry` | Existing loop handler | Dynamic workflow | not a static-graph-first fit |
| `data_transform` | Native local op | Native local op | deterministic platform code |
| `error_handler` | Platform layer | Platform layer | keep outside engine internals |
| `engine_boundary` | Adapter-managed | Adapter-managed | SmartSpecPro first-class concept |

`subgraph`, `start`, and `end` may appear in compile preview, diagnostics, or import/export tooling, but they are not phase-1 persisted node rows.

### 12.5 Status vocabulary

- Native
- Compatible
- Emulated
- Unsupported

---

## 13. Subgraph model

### 13.1 Why subgraphs are required

Subgraphs are the explicit boundary that makes multi-engine execution readable and safe. Without them:

- engine capabilities become ambiguous
- compile errors become hard to explain
- cross-engine data contracts become implicit and fragile

### 13.2 Subgraph object

```json
{
  "id": "sg_creative",
  "name": "Creative Rewrite Cluster",
  "engine": "adk2",
  "entryNodeIds": ["n7"],
  "exitNodeIds": ["n11"],
  "nodeIds": ["n7", "n8", "n9", "n10", "n11"],
  "boundaryPolicy": {
    "inputContract": "creative_input_v1",
    "outputContract": "creative_output_v1",
    "bridgeMode": "sync"
  }
}
```

### 13.3 Rules

- Every node belongs to exactly one subgraph.
- Every agency document has at least one subgraph.
- Cross-engine edges are forbidden unless they pass through `engine_boundary`.
- Entry and exit nodes must be explicit.
- Cross-engine boundaries require input/output contracts.

---

## 14. Boundary and bridge contracts

### 14.1 `engine_boundary` semantics

`engine_boundary` is a SmartSpecPro-owned node that:

- receives source payload from one subgraph
- validates payload schema
- transforms payload where needed
- propagates trace and provenance metadata
- forwards validated input to the next subgraph

### 14.2 Bridge contract requirements

Each bridge must define:

- payload schema
- artifact references
- serialization format
- trace propagation
- retry policy
- timeout policy
- compensation policy if relevant
- approval ownership if human review is required

### 14.3 Unsupported cross-engine patterns in phase 1

- implicit cross-engine edges without boundary nodes
- shared mutable state across engines without explicit contract
- multi-branch cross-engine joins without explicit aggregator semantics
- human approval ownership that is not clearly assigned to a SmartSpecPro runtime boundary

---

## 15. Compile architecture

### 15.1 Compile phases

1. Load normalized agency graph and assemble Agency Document v2
2. Normalize into Canonical IR
3. Validate graph shape
4. Validate subgraph assignments
5. Validate engine capabilities
6. Build or verify boundary contracts
7. Partition IR into engine-specific subgraphs
8. Lower each subgraph to runtime-specific artifacts
9. Build top-level hybrid execution plan
10. Emit diagnostics and preview metadata
11. Cache compiled artifacts

### 15.2 Compile modes

#### Strict

- no unsafe implicit conversions
- no implicit cross-engine edges
- fail when semantics are ambiguous

#### Assist

- compiler may suggest or preview boundary insertion
- changes remain preview-only until user confirms

#### Legacy agency

- existing agencies compile through Agency Swarm compatibility mode only
- unsupported new hybrid semantics fail clearly

### 15.3 Compile output shape

```json
{
  "compileId": "cmp_001",
  "status": "success",
  "diagnostics": [],
  "planSummary": {
    "engineMix": ["agency_swarm", "adk2"],
    "subgraphCount": 3,
    "bridgeCount": 2
  },
  "executionPlan": {},
  "compiledSubgraphs": [],
  "bridges": []
}
```

---

## 16. Lowering rules: Agency Swarm

### 16.1 Objective

Preserve current Agency Swarm behavior for legacy agencies and keep Agency Swarm a strong runtime option for compatible subgraphs.

### 16.2 Lowering strategy

- `agent` -> current Agency Swarm agent path
- `supervisor` -> current top-level coordinating agent path
- `autonomous_agent` -> current autonomous policy stack
- `router` / `conditional_branch` -> existing SmartSpecPro routing services around Agency Swarm
- `aggregator` -> adapter-managed merge gate
- `parallel_fan_out` -> adapter-managed branch orchestration plus merge
- `human_approval` -> SmartSpecPro pause/resume checkpoint around Agency Swarm
- `data_transform` -> deterministic local SmartSpecPro function
- `knowledge_base`, `skill_call`, tool bindings -> existing SmartSpecPro bridge contracts
- `subgraph(engine=agency_swarm)` -> one Agency Swarm execution unit

### 16.3 Compatibility mode guarantees

Legacy agencies must preserve:

- prompt construction
- communication flow ordering
- tool attachment behavior
- current branch and loop semantics where already shipped
- trace correlation shape where practical

---

## 17. Lowering rules: Google ADK 2.0

### 17.1 Official constraint

ADK 2.0 is currently documented as an Alpha release. SmartSpecPro must therefore treat this runtime as opt-in and experimental until later rollout phases.

### 17.2 Repo-grounded lowering strategy

Based on the current official ADK 2.0 documentation:

- Use **graph-based workflows** when the subgraph is primarily:
  - sequential
  - routed
  - fan-out/join
  - nested
  - deterministic human-input aware
- Use **dynamic workflows** when the subgraph requires:
  - iterative loops
  - complex branching
  - richer async orchestration
  - explicit resume behavior beyond static graph comfort

This is an implementation inference from the official docs, not a claim that ADK natively mirrors every SmartSpecPro node one-to-one.

### 17.3 Lowering examples

- `agent` -> ADK agent node
- `router` -> ADK graph route
- `aggregator` -> ADK join/merge wrapper
- `parallel_fan_out` -> ADK graph parallel fan-out or dynamic async wrapper
- `human_approval` -> ADK request-input backed node, with SmartSpecPro owning UX and resume payload formatting
- `loop_retry` -> ADK dynamic workflow wrapper
- `subgraph(engine=adk2)` -> compiled SmartSpecPro-managed ADK artifact

### 17.4 Wrapper contract

SmartSpecPro must expose ADK through a stable internal wrapper, not raw ADK internals:

- stable compile artifact
- SmartSpecPro state envelope
- SmartSpecPro trace IDs
- SmartSpecPro bridge contracts

---

## 18. Runtime orchestration

### 18.1 Components

- `AgencyHybridRunner`
- `AgencyCompileArtifactStore`
- `AgencySubgraphRunnerSwarm`
- `AgencySubgraphRunnerAdk`
- `AgencyBridgeRunner`
- `AgencyCostReconciler`
- `AgencyArtifactPublisher`
- `AgencyCheckpointStore`
- `AgencyTraceEmitter`

### 18.2 Shared context envelope

```json
{
  "runId": "run_001",
  "agencyId": "ag_123",
  "tenantId": "tenant_001",
  "userId": "user_001",
  "traceId": "trace_123",
  "billing": {
    "idempotencyKey": "bill_run_001",
    "creditsReserved": 0
  },
  "inputs": {},
  "artifacts": [],
  "state": {},
  "metadata": {}
}
```

### 18.3 Rules

- Cross-engine state belongs to SmartSpecPro. Engines may read or write only through declared contracts.
- Existing agency run-result surfaces remain the source of truth for user-visible outputs, usage, and artifacts.
- Every subgraph and bridge attempt must emit normalized trace and usage events with stable idempotency keys.

### 18.4 Execution lifecycle

1. Load compile artifact
2. Initialize context envelope
3. Run subgraph A
4. Persist checkpoint
5. Run bridge contract
6. Run subgraph B
7. Continue until done
8. Emit final outputs and trace summary

### 18.5 Failure handling

- subgraph failure stops at subgraph boundary
- bridge failure preserves source outputs and blocks downstream engine execution
- human approval timeout follows declared boundary policy
- retries happen per node, boundary, or subgraph policy

### 18.6 Runtime placement and control-plane alignment

- `AgencySubgraphRunnerAdk` runs inside the Python backend beside the Agency Swarm adapter in phase 1.
- The hybrid runner remains under the agency runtime/service boundary and is not registered through the worker registration/claim APIs from specs 059 and 071.
- Compile artifacts, checkpoints, artifact publication, billing normalization, and audit remain SmartSpecPro-owned control-plane concerns.
- If ADK is workerized later, it must preserve the same IR, bridge, trace, and billing contracts rather than inventing a second hybrid protocol.

### 18.7 Billing and cost reconciliation

- SmartSpecPro must normalize Agency Swarm, ADK, and bridge usage into the existing user-facing run contracts already exposed by `agencyBridge.ts`, including `creditsUsed`, `stepAttemptSnapshots`, structured outputs, preview artifacts, and trace `totalCost`.
- Every engine-originated usage event should normalize to:
  - `runId`
  - `subgraphId`
  - `engine`
  - `sourceEventId`
  - `provider`
  - `model`
  - `tokensIn`
  - `tokensOut`
  - `costUsd`
  - `creditsUsed`
- Billing idempotency should be keyed by `(runId, subgraphId, engine, sourceEventId)` so retries, resumes, or duplicate callbacks do not double-charge.
- Boundary-only schema validation and payload transformation are zero-credit by default. If a boundary invokes an existing billed tool, media service, or storage workflow, that cost must flow through the existing SmartSpecPro billing path for that service rather than a second hybrid-only ledger.
- Compile preview and runtime trace should make subgraph-level and boundary-level cost attribution inspectable for debugging and support.

### 18.8 Artifact publication contract

- Boundary payloads must use `payload + artifactRefs + metadata`; large blobs are passed by reference, not inlined into trace or bridge payloads.
- Runtime-generated files from any subgraph are recorded under `agency_run_artifacts` or a strictly compatible successor contract with origin metadata such as `runId`, `subgraphId`, `boundaryId`, and logical artifact key.
- If an artifact is publishable beyond the run, SmartSpecPro must create or link the corresponding `library_items` and `library_links` records through the existing publication/indexing pipeline aligned with spec 071.
- Upload initialization and completion must use SmartSpecPro-issued signed upload targets or equivalent managed storage helpers. ADK subgraphs must not publish directly to uncontrolled third-party storage and then hand back raw URLs as the source of truth.
- Artifact completion must be idempotent on `(runId, subgraphId, logicalArtifactKey, checksum)`.
- Boundary-transient artifacts remain internal unless explicitly marked publishable by node policy or user action.

---

## 19. UI and UX requirements

### 19.1 Keep as-is

- existing Agency Builder canvas
- existing drag-connect authoring
- current node palette and property panels
- current version history pattern

### 19.2 Add

- engine badges on nodes and subgraphs
- subgraph containers on canvas
- `engine_boundary` visual node
- compile diagnostics drawer
- compile preview panel
- legacy compatibility banner
- capability warnings panel

### 19.3 UX rules

- legacy agencies hide hybrid controls by default
- dragging edges across subgraphs with different engines should suggest a boundary node
- unsupported engine-node combinations must show lint warnings immediately
- compile-invalid graphs may save as draft but cannot run
- upgrade to hybrid requires explicit user action that creates a new agency version

---

## 20. Backward compatibility and migration

### 20.1 Compatibility guarantees

1. Existing agencies continue to run on Agency Swarm by default.
2. Existing normalized agency rows remain readable.
3. Agencies without subgraph metadata auto-wrap into one root Agency Swarm subgraph.
4. Existing agency versions remain restorable.
5. The generic Workflow Editor + LangGraph runtime remains untouched.
6. New hybrid agency versions snapshot the full Agency Document v2 while remaining compatible with existing normalized storage.

### 20.2 No-regression requirements

- do not reorder existing Agency Swarm communication flows
- do not change prompt assembly for legacy agencies without explicit migration
- do not change tool schemas or attached tool semantics for legacy agencies
- do not surface ADK-only authoring prompts inside legacy agency mode

### 20.3 Legacy loading behavior

When loading a current agency into the hybrid-aware compiler:

- set `defaultEngine = agency_swarm`
- create implicit `sg_root_legacy`
- map all existing nodes into that subgraph
- set `compatibilityMode = preserve_agency_swarm`
- if the historical snapshot only contains `{ name, nodes, edges }`, synthesize the missing Document v2 fields in memory without mutating the stored historical record

### 20.4 Upgrade path

The user must explicitly choose an upgrade action such as:

- `Upgrade to Hybrid Agency`

That action should:

- enable subgraph editing
- enable engine badges
- run migration analysis
- preview compile differences
- write a full Agency Document v2 snapshot into `agency_versions.snapshotJson`
- save as a new agency version only after confirmation

---

## 21. Security and governance

### 21.1 Required controls

- validate every boundary crossing with schema and artifact-reference checks
- keep tool authorization and approval policies in SmartSpecPro layers
- keep tenant isolation above both engines
- store unified audit/trace data in SmartSpecPro
- do not let ADK or Agency Swarm become the source of truth for cross-engine state
- do not mix ADK 2.0 storage with ADK 1.x storage if either is introduced

### 21.2 Additional hardening for hybrid and ADK execution

- All outbound tool, OpenAPI, and MCP targets used through hybrid agencies remain subject to SmartSpecPro SSRF protection, DNS re-validation, and egress-policy enforcement already required by the agency platform.
- MCP, OpenAPI, and ADK-related secrets must be encrypted at rest and never written in plaintext into compile artifacts, snapshots, checkpoints, or traces.
- Trace payloads, boundary inspectors, and error logs must scrub bearer tokens, API keys, internal URLs, email addresses, and oversized tool outputs before persistence.
- ADK subgraphs may call only SmartSpecPro-registered tool adapters and approved platform bridges; no raw arbitrary outbound execution bypassing platform policy is allowed.
- Artifact publication must use SmartSpecPro-issued signed uploads or managed storage helpers and remain fully auditable.
- The `agencyHybridAdk` feature flag plus an operational kill switch must gate compile, save-as-hybrid, and run paths.
- ADK package/runtime versions must be pinned to an allowlisted deployment environment because ADK 2.0 is Alpha.
- Unified audit logs must record engine selection, compile artifact version, boundary transitions, artifact publication, and any policy-denied external target attempts.

---

## 22. Performance and observability

### 22.1 Performance targets

- compile time for a medium agency graph under 2 seconds on happy path
- incremental validation while editing
- cache compiled artifacts by normalized document hash
- avoid blob-copying large artifacts across boundaries when references suffice

### 22.2 Trace hierarchy

- agency run
- subgraph run
- node execution
- boundary execution
- billing reconciliation event
- artifact publication event
- tool call
- human approval checkpoint

### 22.3 Required trace visibility

- which engine executed each subgraph
- how a UI node lowered into runtime-specific artifacts
- compile errors vs runtime errors
- payload shape at boundaries
- cost attribution by subgraph and boundary
- artifact publication state and resulting library linkage

---

## 23. Testing strategy

### 23.1 Test classes

1. unit tests for IR assembly and lowering
2. contract tests for bridge schemas
3. compile snapshot tests
4. golden tests for legacy Agency Swarm agencies
5. hybrid integration tests across both engines
6. pause/resume tests for human approval
7. trace integrity tests
8. feature-flag and migration tests
9. billing and credit-normalization tests
10. artifact publication and idempotency tests
11. security guardrail tests

### 23.2 Legacy golden suite

Use representative current agencies such as:

- supervisor + worker chain
- router + skill call
- knowledge base + summarization
- loop/retry agency
- long-form content agency

Compare:

- compile signature
- communication ordering
- structured outputs
- trace shape

### 23.3 Generic workflow protection tests

This feature must also explicitly prove that:

- existing `workflow.ts` compile behavior remains unchanged
- existing `langgraph_runtime.py` tests still pass
- the hybrid agency work does not silently alter generic workflow APIs

### 23.4 Security, billing, and artifact regression checks

- retries or resume paths do not double-charge `creditsUsed`
- ADK and hybrid artifacts publish through the same SmartSpecPro library/indexing lifecycle used by other runtimes
- unsafe MCP/OpenAPI/tool endpoints are blocked by SSRF and egress policy enforcement
- traces and boundary payload inspectors do not persist secrets in plaintext
- feature flag and kill-switch paths block ADK compile/save/run surfaces deterministically

---

## 24. Rollout plan

### Phase 0 - Foundations

- canonical IR
- hybrid capability validation
- Agency Swarm compatibility compiler path
- full Agency Document v2 snapshot contract
- baseline security hardening for secrets, SSRF, and trace scrubbing
- no ADK UI exposure

### Phase 1 - Internal ADK alpha

- subgraphs
- boundary nodes
- initial ADK adapter
- billing reconciliation and artifact publication wiring
- internal agency-only usage

### Phase 2 - Design partner beta

- compile preview
- diagnostics
- migration wizard
- golden compatibility checks

### Phase 3 - Controlled GA

- opt-in tenant rollout
- Agency Swarm remains legacy default
- ADK-enabled templates only for opted tenants

---

## 25. API and interface contracts

### 25.1 Compile preview API

Recommended new procedure:

```json
POST /api/agencies/{id}/compile-preview
{
  "mode": "strict",
  "target": "saved_engines"
}
```

### 25.2 Run API

Existing agency run routes remain the user-facing entry point, but internally the runtime may execute:

- a pure Agency Swarm plan
- a pure ADK plan
- a hybrid plan

Hybrid internals must still resolve to the existing agency run-result contract exposed by Node services, rather than returning a second ADK-specific public run shape.

### 25.3 Trace API

Reuse existing trace persistence/query patterns while extending trace payload shape for:

- subgraph runs
- boundary runs
- compile source mappings

---

## 26. Acceptance criteria

### Must-have

- existing agencies still load and run through Agency Swarm
- hybrid-aware compiler can auto-wrap legacy agencies into one Agency Swarm subgraph
- a new agency version can contain two subgraphs with different engines
- cross-engine execution requires explicit boundary contracts
- compile diagnostics explain unsupported patterns clearly
- traces expose engine and subgraph boundaries
- hybrid cost events reconcile into existing `creditsUsed`, `stepAttemptSnapshots`, and trace `totalCost` surfaces without double-charging retries
- hybrid artifacts publish through SmartSpecPro-owned artifact and library pipelines
- ADK compile/save/run paths are gated by feature flag and kill switch
- security controls cover secret scrubbing plus SSRF/egress enforcement for tool-backed hybrid flows

### Should-have

- compile preview
- migration wizard
- capability lint while editing

### Nice-to-have

- auto-suggested subgraph grouping
- assist-mode preview of implied boundaries
- compile diff between legacy and hybrid plans

---

## 27. Open questions

1. Should `aggregator` remain the long-term merge node, or should a distinct `join` node be added later?
2. How much of ADK dynamic workflow lowering should be visible in compile preview versus abstracted away?
3. In which phase, if any, should ADK move from the in-process backend runtime into the generic worker-runtime family while preserving the same contracts?
4. In which phase, if any, should A2A-based remote agent handoffs become a supported bridge mechanism?
