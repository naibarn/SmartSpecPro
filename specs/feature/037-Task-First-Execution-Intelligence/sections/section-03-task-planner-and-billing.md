# Section 03 — Task Planner and Billing

## Objective

Add the first central planner and normalize billing for planner-selected execution paths.

## Scope

1. create `TaskExecutionPlanner`
2. create execution-time `modelResolver`
3. create `task_runs` and step-attempt state
4. add route scoring/filtering over enabled models and available strategies
5. normalize billing metadata for task runtime and responses-based skill/task paths

## Primary files

- new planner service under `apps/web/server/services/`
- `apps/web/server/services/creditService.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/drizzle/schema.ts`

## Planner behavior

First version should be heuristic-first:

- classify task type
- classify complexity
- filter candidate strategies
- emit requirements/profile intent
- resolve the concrete route at execution time
- choose lowest-cost viable option above confidence threshold

## Plan and state contract

- `task_runs.planJson` is immutable run intent
- started step attempts persist `resolvedModelSnapshot`
- resolved snapshots persist catalog/capability identifiers
- retries within the same attempt reuse the same snapshot
- fallback attempts write a new snapshot with reason
- approval policy stays at plan scope while approval decisions are recorded per attempt
- incompatible stored plans fail closed and require regeneration or explicit migration

## Billing requirements

Every execution path must carry:

- `taskRunId`
- `strategy`
- `effectiveModel`
- `provider`
- `attemptIndex`
- source type that matches task runtime semantics
- pricing and credit-conversion snapshots
- catalog/capability snapshot identifiers when resolution depends on mutable provider metadata
- retention policy for historical snapshot records used by audit and support

## Acceptance criteria

1. planner can produce a requirement-first `TaskExecutionPlan`
2. model resolver can turn requirements into a concrete route at execution time
3. billing captures task runtime metadata correctly
4. responses-driven task paths are no longer misclassified as browser-only where inappropriate
5. retries/fallbacks remain auditable
6. `planJson` immutability and step-attempt enrichment boundaries are enforceable in tests
