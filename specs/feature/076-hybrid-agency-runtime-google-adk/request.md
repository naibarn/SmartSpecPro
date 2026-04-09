## Request

Create a new feature spec under `specs/feature` that extends SmartSpecPro's existing ReactFlow-based agency authoring and Agency Swarm runtime so the platform can also support **Google ADK 2.0** as an opt-in execution engine.

The spec must stay grounded in the current repository structure and should not pretend the codebase is starting from scratch. In particular, it must:

- preserve existing Agency Builder behavior and Agency Swarm runtime defaults
- avoid breaking the separate Workflow Editor + LangGraph flow that already exists in the repo
- introduce a SmartSpecPro-owned canonical workflow/agency IR and compile boundary before engine-specific lowering
- support subgraph-style engine partitioning between `agency_swarm` and `adk2`
- define bridge contracts, compile diagnostics, rollout guardrails, and migration rules

## Repo-grounded assumptions

- The existing visual agent graph lives in the Agency Builder UI under `apps/web/client/src/components/agency/` and `apps/web/client/src/pages/AgencyBuilder.tsx`.
- The existing agency node catalog already includes many of the requested product semantics through node types such as `agent`, `supervisor`, `router`, `aggregator`, `knowledge_base`, `skill_call`, `human_approval`, `conditional_branch`, `parallel_fan_out`, `loop_retry`, `skill_discovery`, `data_transform`, and `autonomous_agent`.
- Agency persistence is currently normalized through `agencies`, `agency_agents`, `agency_communication_flows`, `agency_versions`, and `agency_run_traces` in `apps/web/drizzle/schema.ts`.
- The current Agency Swarm runtime is bridged through `apps/web/server/services/agencyBridge.ts` and Python services such as `python-backend/app/services/agency_swarm_adapter.py`.
- The generic workflow editor is a separate system that still compiles ReactFlow JSON to LangGraph via `apps/web/server/routers/workflow.ts`, `python-backend/app/orchestrator/workflow_compiler.py`, and `python-backend/app/orchestrator/langgraph_runtime.py`.
- The Python backend already requires Python `>=3.12`, which is compatible in principle with current ADK 2.0 Python requirements.

## Non-goals

- Do not rewrite the generic Workflow Editor to ADK.
- Do not replace Agency Swarm as the default runtime for existing agencies.
- Do not expose raw Google ADK internals directly in the SmartSpecPro UI.
- Do not assume ADK 2.0 Alpha is production-safe by default.
- Do not introduce a standalone tool-node model in phase 1 if attached tools on agency nodes remain the safer fit for the current codebase.
