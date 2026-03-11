# Section 03 — Task Planner and Billing

## Objective

Add the first central planner and normalize billing for planner-selected execution paths.

## Scope

1. create `TaskExecutionPlanner`
2. create execution-time `modelResolver`
3. create `task_runs` and step-attempt state
4. add route scoring/filtering over enabled models and available strategies
5. normalize billing metadata for task runtime and responses-based skill/task paths

## Actual files created/modified

### New files
- `apps/web/server/services/taskExecutionPlanner.ts` — task classification, plan builder, version validation
- `apps/web/server/services/taskExecutionPlanner.test.ts` — 27 tests
- `apps/web/server/services/modelResolver.ts` — runtime model resolution with strategy ranking
- `apps/web/server/services/modelResolver.test.ts` — 11 tests
- `apps/web/server/services/taskRunStore.ts` — persistence helpers (createTaskRun, createStepAttempt, completeStepAttempt, etc.)
- `apps/web/drizzle/0063_open_harrier.sql` — creates task_runs + task_step_attempts tables
- `apps/web/drizzle/0064_typical_dracula.sql` — adds updatedAt to task_runs, step_attempt_status enum

### Modified files
- `apps/web/drizzle/schema.ts` — added `taskRunStatusEnum`, `stepAttemptStatusEnum`, `taskRuns`, `taskStepAttempts` tables

## Planner behavior

Heuristic-first classification:

- **classifyTaskType**: maps source type → task type (chat, skill, media, responses, agency)
- **classifyComplexity**: heuristic based on task type, tools, multi-step flags
- **inferRequirements**: merges skill execution policy requirements + task-type-inferred requirements
- **buildExecutionPlan**: produces frozen (Object.freeze) immutable plan with version, requirements, strategy

## Model resolver

- `resolveModelFromPlan`: filters by capability requirements, ranks by strategy (cheapest/fastest/best)
- `buildModelResolutionSnapshot`: creates immutable snapshot per step-attempt for audit

## Plan and state contract

- `task_runs.planJson` is immutable (Object.freeze at creation, Readonly<> types)
- `validatePlanVersion()` provides fail-closed guard for incompatible stored plans
- Step attempts store `resolvedModelSnapshot` frozen at attempt start
- Retries within same attempt reuse the same snapshot
- Fallback attempts create new snapshot with `fallbackReason`

## Billing contract

`TaskBillingMetadata` interface ensures every execution path carries:
- `taskRunId`, `strategy`, `effectiveModel`, `provider`, `attemptIndex`, `sourceType`, `taskType`

`buildBillingMetadata()` helper produces this from plan + snapshot context.

**Route wiring deferred to sections 04/05** — persistence helpers are ready, routes will call them.

## Database tables

### task_runs
- id, userId, tenantId, taskType, sourceType, status (enum), planJson (immutable), skillSlug, conversationId, totalCreditsUsed, completedAt, errorMessage, createdAt, updatedAt

### task_step_attempts
- id, taskRunId (FK cascade), attemptIndex, resolvedModelSnapshot (jsonb), effectiveModel, provider, strategy, inputTokens, outputTokens, creditsUsed, costUsd, durationMs, status (enum), fallbackReason, errorMessage, createdAt

## Acceptance criteria status

1. ✅ planner can produce a requirement-first `TaskExecutionPlan`
2. ✅ model resolver can turn requirements into a concrete route at execution time
3. ⏳ billing captures task runtime metadata correctly (contract defined, route wiring in §04/05)
4. ⏳ responses-driven task paths reclassification (route wiring in §04)
5. ✅ retries/fallbacks remain auditable (snapshot + fallbackReason per attempt)
6. ✅ `planJson` immutability and step-attempt enrichment boundaries enforceable in tests

## Tests

- 38 tests total (27 planner + 11 resolver), all passing
- Covers classification, plan building, immutability, version validation, model resolution, strategy ranking, billing metadata
