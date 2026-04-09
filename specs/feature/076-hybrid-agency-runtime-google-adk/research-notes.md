## Codebase scan

### Agency Builder is the closest existing surface

- `apps/web/client/src/components/agency/`
  - Existing ReactFlow-based authoring surface for agentic graphs.
  - Already has node cards and property panels for the requested semantics:
    - `agent`
    - `supervisor`
    - `router`
    - `aggregator`
    - `knowledge_base`
    - `skill_call`
    - `human_approval`
    - `conditional_branch`
    - `parallel_fan_out`
    - `loop_retry`
    - `skill_discovery`
    - `data_transform`
    - `autonomous_agent`
- `apps/web/client/src/components/agency/nodes/types.ts`
  - Confirms the current product-visible node catalog is already agency-graph oriented.
- `apps/web/client/src/pages/AgencyBuilder.tsx`
  - Existing top-level page for the authoring experience.

### Agency persistence is normalized, not stored as one big ReactFlow JSON blob

- `apps/web/drizzle/schema.ts`
  - `agency_agents` already stores non-agent node types through `nodeType` and flexible `nodeConfig`.
  - `agency_communication_flows` stores directional graph edges.
  - `agency_versions.snapshotJson` already captures versioned graph snapshots.
  - `agency_run_traces` already stores structured execution traces.
- Implication:
  - A hybrid spec should not require replacing current normalized persistence wholesale.
  - The safer fit is a SmartSpecPro-owned assembled document/IR in the service layer, while persistence remains additive and backward-compatible.

### Current agency runtime is already adapter-shaped

- `apps/web/server/services/agencyBridge.ts`
  - Node-side HTTP bridge to Python agency execution.
- `python-backend/app/services/agency_swarm_adapter.py`
  - Existing single-responsibility adapter boundary for Agency Swarm.
- Additional current Python agency services show product semantics already implemented outside raw Agency Swarm:
  - `agency_communication_flows.py`
  - `agency_conditional_branch.py`
  - `agency_loop_handler.py`
  - `agency_data_transform.py`
  - `agency_guardrails.py`
  - `agency_trace_collector.py`
- Implication:
  - SmartSpecPro already owns orchestration semantics around Agency Swarm.
  - Adding another runtime adapter is architecturally plausible if compile/lowering boundaries are made explicit.

### Generic Workflow Editor is separate and must remain untouched by default

- `apps/web/server/routers/workflow.ts`
  - Saves generic `workflowJson`.
  - Compiles through Python `/api/v1/workflows/compile`.
- `python-backend/app/orchestrator/workflow_compiler.py`
  - Compiles ReactFlow workflow JSON into LangGraph.
- `python-backend/app/orchestrator/langgraph_runtime.py`
  - Executes compiled LangGraph graphs with checkpointing and resume support.
- Implication:
  - The requested ADK work should be framed as an extension of the agency/agentic runtime stack, not a rewrite of the existing generic workflow system.

### Existing versioning, trace, and rollout patterns are reusable

- `agency_versions` already supports version history.
- `agencyRunTraces` and `apps/web/server/services/agencyTraceService.ts` already support trace persistence.
- `apps/web/shared/featureFlags.ts` and `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts` already provide a rollout pattern for tenant-gated runtime features.
- `workflowBrowserSessionNodes` gating provides a good precedent for hiding advanced node/runtime features until explicitly enabled.

### Existing billing and artifact contracts should be reused, not replaced

- `apps/web/server/services/agencyBridge.ts`
  - Current run results already normalize `creditsUsed`, `stepAttemptSnapshots`, structured outputs, and preview artifacts.
- `apps/web/server/services/agencyTraceService.ts`
  - Current trace persistence already has a `totalCost` surface.
- `apps/web/drizzle/schema.ts`
  - `agency_run_artifacts` already exists for run-scoped runtime outputs.
  - `agency_versions.snapshotJson` is currently too narrow for hybrid document restore and needs an explicit uplift in the spec.
- Implication:
  - Hybrid ADK work should reconcile into the current run, trace, version, and artifact contracts rather than creating ADK-only public data paths.

## Web research: official Google ADK sources

### ADK 2.0 release posture

Sources:

- `https://adk.dev/2.0/`
- `https://github.com/google/adk-python`

Observed:

- ADK 2.0 is currently documented as an **Alpha** release.
- Official installation guidance for ADK 2.0 uses `pip install google-adk --pre`.
- ADK 2.0 docs warn against expecting backwards compatibility during the pre-GA period.
- ADK 2.0 docs explicitly warn not to mix ADK 2.0 and ADK 1.0 storage systems.
- The ADK Python docs say ADK 2.0 requires Python 3.11 or later.

Implication:

- SmartSpecPro should treat ADK 2.0 as opt-in and feature-flagged.
- ADK 2.0 must not become the default runtime for existing agencies.
- Any persistent ADK-owned session or memory storage must be isolated from older ADK storage systems.

### ADK 2.0 graph-based workflows

Source:

- `https://adk.dev/workflows/graph-routes/`

Observed:

- ADK 2.0 graph-based workflows are designed for deterministic execution graphs.
- Official docs say graph workflows can encapsulate:
  - code functions
  - AI-powered agents
  - tools
  - human input
- The docs explicitly mention:
  - route sequences
  - route branches
  - parallel tasks with fan-out and join
  - nested workflows

Implication:

- ADK graph workflows are a strong fit for SmartSpecPro subgraphs that are static and graph-shaped.
- Product semantics such as router, parallel fan-out, join/aggregator, nested subgraph, and human input can be mapped into ADK graph mode when the graph is deterministic enough.

### ADK 2.0 dynamic workflows

Source:

- `https://adk.dev/workflows/dynamic/`

Observed:

- Dynamic workflows are positioned as the more flexible alternative to static graph routes.
- Official benefits include:
  - loops
  - complex branching
  - async control flow
  - resumable execution with checkpointing
- Docs show:
  - iterative workflow loops
  - parallel execution via `asyncio`
  - human input interruption and resume
  - deterministic execution IDs for resume/retry behavior

Implication:

- `loop_retry` and similar semantics are better lowered to ADK dynamic workflow wrappers than forced into static graph routes.
- This is the cleanest way to keep SmartSpecPro's current node catalog while still taking advantage of ADK where it fits.

### ADK human input

Source:

- `https://adk.dev/workflows/human-input/`

Observed:

- ADK human input uses `RequestInput`.
- It supports:
  - `message`
  - `payload`
  - `response_schema`
- Docs note the response schema is not automatically reformatted from free-form user text.

Implication:

- SmartSpecPro should keep owning the UX for human approval/input collection.
- Bridge contracts and UI forms should shape data before resuming ADK, instead of relying on ADK alone to coerce arbitrary user responses.

### ADK multi-agent positioning

Source:

- `https://github.com/google/adk-python`

Observed:

- ADK highlights modular multi-agent systems, collaborative agents, tools, OpenAPI integration, MCP tools, and HITL/tool confirmation.

Implication:

- ADK is viable as a second engine for SmartSpecPro's agency-style graphs, but only if SmartSpecPro keeps the top-level product model, policies, and observability under its own control.

## Synthesis for this spec

### Best architectural fit

- Extend the **Agency Builder** system, not the generic Workflow Editor, because the agency side already matches the requested node vocabulary and execution model.
- Preserve the generic Workflow Editor and LangGraph runtime as a separate legacy-compatible surface.

### Best initial runtime boundary

- Introduce a SmartSpecPro-owned canonical agency workflow IR.
- Lower each subgraph to one engine:
  - `agency_swarm`
  - `adk2`
- Keep all cross-engine bridging, state transfer, trace IDs, and human approval ownership in SmartSpecPro code.

### Best phase-1 product constraints

- Keep tools attached to nodes rather than introducing standalone tool nodes.
- Keep `aggregator` as the product-visible join/merge node in phase 1 instead of adding a separate `join` node immediately.
- Keep ADK hidden behind an upgrade flow and tenant feature flag because official docs still mark ADK 2.0 as Alpha.
- Keep phase-1 ADK execution inside the existing Python backend agency runtime boundary; align with worker-runtime specs on control-plane ownership, but do not introduce ADK as a generic worker runtime yet.

## Testing context

- Web tests:
  - `apps/web/server/routers/__tests__/agency.test.ts`
  - `apps/web/server/routers/__tests__/agencyConditionalBranch.test.ts`
  - `apps/web/server/routers/__tests__/agencyLoopRetry.test.ts`
  - `apps/web/client/src/components/agency/__tests__/AgencyBuilder.test.tsx`
- Python tests:
  - `python-backend/tests/unit/test_agency_adapter.py`
  - `python-backend/tests/unit/test_agency_communication_flows.py`
  - `python-backend/tests/unit/test_agency_loop_handler.py`
  - `python-backend/tests/unit/test_agency_data_transform.py`
  - `python-backend/tests/test_langgraph_runtime.py`
- Implication:
  - A strong test-first implementation path exists for both web and Python layers.
  - The spec should demand explicit golden tests for legacy Agency Swarm agencies and non-regression checks for the separate LangGraph workflow runtime.
