# Feature 037 Implementation Plan

## Objective

Implement the first production-grade version of Task-First Execution Intelligence so SmartSpecPro can choose execution strategy and resolve concrete models from capability requirements at execution time, while keeping skill behavior predictable and billing correct.

## Current-codebase fit

The codebase already contains strong building blocks:

- multi-provider model routing
- model/provider mapping with pricing and context
- Responses API proxy
- skill routing metadata
- AgencySwarm orchestration
- AI presentation deterministic pipeline
- centralized credit deduction

The missing layer is a planner/policy layer above those systems.
It must be capability-first rather than model-name-first.

## High-level approach

Deliver in five sections:

1. runtime correction and execution-policy enforcement
2. model capability registry and skill policy schema
3. planner, model resolver, plan persistence, and billing normalization
4. direct artifact execution for high-value completed tasks
5. AgencySwarm integration and rollout controls

## Affected modules

### Node.js / web backend

- `apps/web/server/routers/chat.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/services/creditService.ts`
- `apps/web/server/services/llmRouter.ts`
- `apps/web/server/routers/llmProviders.ts`
- `apps/web/server/services/skillRegistry.ts`
- `apps/web/server/services/taskExecutionPlanner.ts`
- `apps/web/server/services/modelResolver.ts`
- `apps/web/server/services/aiPresentationService.ts`
- `apps/web/server/routers/agency.ts`

### Shared skill/model types

- `packages/skills/src/types.ts`
- `packages/skills/src/parser.ts`
- `packages/shared/src/types/chat.ts`

### Database

- `apps/web/drizzle/schema.ts`
- new migration(s) for model capabilities, skill policy fields, and `task_runs`
- new migration(s) for step-attempt state and resolved model snapshots if split from `task_runs`

### Python backend

- `python-backend/app/services/agency_orchestrator.py`
- `python-backend/app/services/agency_tools.py`
- likely new planner-adjacent integration service if routing into AgencySwarm is initiated from Python-side runs

## Rollout philosophy

### Phase A

Correct unsafe current behavior:

- stop chat skill invocation from being overridden by conversation model
- normalize billing metadata for responses/task/skill routes
- define explicit entrypoint precedence rules

### Phase B

Add planner inputs:

- model capability registry
- skill execution policy expressed as requirements/profile
- enabled-model introspection for planning
- provider-route capability semantics

### Phase C

Add planner outputs:

- `TaskExecutionPlan`
- `task_runs`
- execution-time model resolver
- task strategy scoring and selection
- canonical plan metadata for precedence, approval, and reservation behavior
- immutable run-level plan contract plus step-attempt execution enrichments
- resolved model/pricing snapshots at step-attempt scope
- catalog/capability snapshot identifiers for deterministic replay and audit
- explicit incompatible-plan handling and retained snapshot history for support/audit
- task state machine and idempotency model
- reservation/settlement accounting

### Phase D

Integrate artifact-producing runtime paths:

- presentation/report direct completion strategy
- deterministic pipeline routing
- minimum artifact contract validation

### Phase E

Integrate AgencySwarm as a planner-selected strategy and add rollout controls, including approval gates.

## Risks and mitigations

### Risk: routing mistakes increase cost

- Mitigation: start heuristic-first, add routeReason logging, keep manual overrides

### Risk: billing drift

- Mitigation: centralize charge metadata and classify every new runtime path before planner rollout

### Risk: duplicate work in async/retry paths

- Mitigation: task state machine, idempotency keys, and reservation/settlement reconciliation

### Risk: model resolution changes across retry/resume

- Mitigation: resolve at execution time, then snapshot per step attempt and reuse on started-step resume

### Risk: catalog drift changes resolution outcomes invisibly

- Mitigation: persist catalog/capability snapshot identifiers alongside each resolved model snapshot

### Risk: plan contract drifts during execution

- Mitigation: treat `planJson` as immutable intent, store enrichments in step-attempt and billing records

### Risk: unsupported stored plan versions strand background runs

- Mitigation: define fail-closed incompatible-plan handling and require explicit regeneration/migration

### Risk: unsupported provider route selected for a capability-sensitive strategy

- Mitigation: store capability metadata at provider-route level and validate before execution

### Risk: planner or fallback loops

- Mitigation: attempted-model tracking, max escalation caps, visited strategy guards, and same-skill re-entry rules

### Risk: capability metadata becomes stale

- Mitigation: store normalized flags plus admin override and provenance metadata

### Risk: direct completion produces lower-fidelity artifacts than deterministic pipelines

- Mitigation: keep deterministic pipelines preferred for fidelity-critical outputs

## Acceptance criteria

1. Skill invocation in chat uses skill execution policy by default.
2. Skills declare model requirements/profile by default instead of hard-pinning a model name.
3. Planner can inspect only enabled models and score them by capability/cost.
4. Execution resolves a concrete model/provider route from requirements and persists an immutable snapshot for each started step attempt.
5. Resolved snapshots include catalog/capability and pricing identifiers needed for replay, audit, and billing.
6. Billing is correct and auditable across all new runtime paths using pricing and credit-rate snapshots.
7. `task_runs.planJson` remains a stable intent contract while execution enrichments are persisted separately.
8. Incompatible stored plan versions fail closed and surface a regeneration/migration path instead of being silently rewritten.
9. Presentation/report tasks can be represented as artifact-oriented task runs rather than only chat replies.
10. Planner respects precedence, approval gates, and tenant allow/block policy.
11. Approval policy is stored at plan level while approval decisions are stored at attempt level.
12. Async and retried runs remain idempotent and reuse persisted snapshots correctly after worker reclaim.
13. Runtime can choose among direct completion, Responses/tools, skill execution, deterministic pipeline, and AgencySwarm.

## Testing and rollout notes

- Use feature flags for planner rollout and direct artifact routing.
- Keep per-strategy telemetry and routeReason logs.
- Validate billing in integration tests before enabling auto planner for end users.
