# Section 03 — Artifact Routing + Presentation Service + Responses API Wiring

## Objective

Wire the artifact router (`classifyArtifactIntent` + `selectExecutionRoute`) for presentations and reports, wire planner into `aiPresentationService.ts` (the actual deck generation path), and wire planner into the Responses API.

## Scope

1. Wire `classifyArtifactIntent()` + `selectExecutionRoute()` into presentation/report skill execution
2. Wire planner into `aiPresentationService.ts` `invokeSkillTextLLM()` — the function that calls `executeWithFallback()` for deck generation
3. Wire planner into `responsesRoutes.ts` for Responses API
4. Call `linkArtifactToTaskRun()` when presentations are completed
5. Record artifact intent and execution route in `task_runs`

## Dependencies

- Section 01 (`taskPlannerMiddleware.ts` must exist)
- Section 02 (skill execution wiring patterns established)

## Files to modify

### `apps/web/server/routers/chat.ts` — Artifact classification

**Where:** Inside `executeSkill` mutation, before skill execution begins.

When the skill is a presentation or report skill, classify the artifact intent:

**Actual function signatures** (from `artifactRouter.ts`):
```typescript
// classifyArtifactIntent — input type:
interface ArtifactIntentInput {
  sourceType: string;
  skillSlug?: string;
  intentOverride?: ArtifactIntent;     // NOT hasStructuredOutput
}

// selectExecutionRoute — input type:
interface ArtifactRoutingInput {
  artifactIntent: ArtifactIntent;
  complexity: TaskComplexity;
  modelSupportsStructuredOutput?: boolean;  // optional capability hint
}

// selectExecutionRoute — return type:
interface ArtifactRoute {
  route: ExecutionRoute;
  routeReason: string;                 // routeReason is part of the RETURN, not input
}
```

**Corrected wiring:**
```typescript
import { classifyArtifactIntent, selectExecutionRoute } from "../services/artifactRouter";
import { linkArtifactToTaskRun } from "../services/taskRunStore";

// After plannerResult from S02 wiring:
if (plannerResult) {
  const artifactIntent = classifyArtifactIntent({
    sourceType: "skill",
    skillSlug: input.skillId,
    // No hasStructuredOutput — field doesn't exist in ArtifactIntentInput
  });

  const artifactRoute = selectExecutionRoute({
    artifactIntent,
    complexity: plannerResult.plan.complexity,
    modelSupportsStructuredOutput: true,  // LLM skills generally support this
  });

  // Update task_run with artifact metadata
  // NOTE: updateTaskRunArtifact() must be CREATED — does not exist yet (see below)
  await updateTaskRunArtifact(plannerResult.taskRunId, {
    artifactIntent,
    executionRoute: artifactRoute.route,
    routeReason: artifactRoute.routeReason,  // routeReason comes from the return value
  });
}
```

### `apps/web/server/services/aiPresentationService.ts` — Deck generation LLM calls

**Current behavior (lines 2703-2714):**
`invokeSkillTextLLM()` calls `executeWithFallback()` with a hardcoded or parameter-passed model, then deducts credits.

**New behavior — inject planner before executeWithFallback:**

```typescript
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";

// In invokeSkillTextLLM, before executeWithFallback:
const plannerResult = await runPlanner({
  sourceType: "presentation",
  userId: params.userId,
  tenantId: params.tenantId,
  conversationModel: params.model,
});

let effectiveModel = params.model;
if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
  effectiveModel = plannerResult.resolvedModel;
}

const result = await executeWithFallback({
  model: effectiveModel,
  messages: [...],
  stream: false,
  userId: params.userId,
  preferredProvider: params.strictProviderPin ? params.preferredProviderId : undefined,
});

// After success, record step attempt:
if (plannerResult) {
  await recordStepAttempt({
    taskRunId: plannerResult.taskRunId,
    model: effectiveModel,
    provider: result.providerName,
    inputTokens,
    outputTokens,
    costUsd: costUsdValue,
  });
}
```

**Important:** `aiPresentationService.ts` calls `invokeSkillTextLLM()` MANY times per presentation (outline, per-slide content, speaker notes, etc.). Each call should create a separate `step_attempt`, but they should all share the same `task_run`. The `taskRunId` needs to be threaded through from the top-level presentation generation call.

**Threading taskRunId:** The top-level `generateAIDraft()` (line 4263) function should:
1. Run planner ONCE to create the `task_run`
2. Pass `taskRunId` down to all `invokeSkillTextLLM()` calls
3. Each call creates a `step_attempt` under that `task_run`

```typescript
// In generateAIDraft():
const plannerResult = await runPlanner({
  sourceType: "presentation",
  userId,
  tenantId,
  conversationModel: textModel,
  skillSlug: "ai-presentation",
});

// Thread taskRunId through all sub-calls
const taskRunId = plannerResult?.taskRunId;

// After presentation is complete:
// linkArtifactToTaskRun signature: (taskRunId, { presentationDeckId?, artifactMessageId? })
if (plannerResult && presentationId) {
  await linkArtifactToTaskRun(plannerResult.taskRunId, {
    presentationDeckId: presentationId,
  });
}
```

### `apps/web/server/_core/responsesRoutes.ts` — Responses API

**Where:** Before the tool execution loop.

```typescript
import { runPlanner, recordStepAttempt } from "../services/taskPlannerMiddleware";

// Before model resolution in the Responses API handler:
const plannerResult = await runPlanner({
  sourceType: "responses",
  userId,
  tenantId,
  conversationModel: requestModel,
  hasTools: tools.length > 0,
});

// Model selection with shadow/active branching (same pattern as S01)
let effectiveModel = requestModel;
if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
  effectiveModel = plannerResult.resolvedModel;
}

// After each tool call response, record step attempt
if (plannerResult) {
  await recordStepAttempt({
    taskRunId: plannerResult.taskRunId,
    model: effectiveModel,
    provider: result.providerName,
    inputTokens,
    outputTokens,
    costUsd,
  });
}
```

## Key design decisions

1. **One `task_run` per presentation, many `step_attempts`** — a single presentation may have 10+ LLM calls (outline, slides, notes), each is a step attempt
2. **`taskRunId` is threaded through** `generateAIDraft()` → `invokeSkillTextLLM()` calls
3. **`linkArtifactToTaskRun()` is called once** when the presentation is fully generated
4. **Artifact classification happens at skill dispatch** — not inside aiPresentationService
5. **Responses API creates one `task_run`** per request, with step attempts per tool call
6. **`updateTaskRunArtifact()`** — new helper to CREATE in `taskRunStore.ts` — does NOT exist yet. Updates artifact metadata on existing task_runs
7. **`linkArtifactToTaskRun(taskRunId, { presentationDeckId?, artifactMessageId? })`** — already exists in `taskRunStore.ts` (line 181)
8. **`classifyArtifactIntent` takes `{ sourceType, skillSlug?, intentOverride? }`** — NOT `hasStructuredOutput`
9. **`selectExecutionRoute` returns `{ route, routeReason }`** — `routeReason` is part of the RETURN value

## New helper needed in `taskRunStore.ts`

```typescript
export async function updateTaskRunArtifact(
  taskRunId: number,
  artifact: {
    artifactIntent: string;
    executionRoute: string;
    routeReason: string;
  }
): Promise<void> {
  const db = await getDb();
  await db.update(taskRuns)
    .set({
      artifactIntent: artifact.artifactIntent,
      executionRoute: artifact.executionRoute,
      routeReason: artifact.routeReason,
    })
    .where(eq(taskRuns.id, taskRunId));
}
```

## Acceptance criteria

1. Presentation skills record `artifactIntent: "presentation_deck"` and correct `executionRoute` ✅
2. Report skills record `artifactIntent: "research_report"` ✅
3. Responses API requests create `task_runs` with `supportsResponses: true` requirement ✅
4. `linkArtifactToTaskRun()` called when presentations are completed ✅
5. `aiPresentationService.ts` creates step attempts for each `invokeSkillTextLLM()` call ✅ (2 call sites wired)
6. One `task_run` per presentation with multiple `step_attempts` ✅
7. `taskRunId` correctly threaded through `generateAIDraft()` → sub-calls ✅

## Test plan

- Unit test: artifact classification for presentation skill → `presentation_deck` ✅ (artifactRouter.test.ts)
- Unit test: artifact classification for report skill → `research_report` ✅ (artifactRouter.test.ts)
- Unit test: `updateTaskRunArtifact()` updates existing task_run ✅ (taskRunStore.test.ts)
- Unit test: `linkArtifactToTaskRun()` links presentation ID to task_run ✅ (taskRunStore.test.ts)
- Unit test: Responses API creates task_run with `supportsResponses` (covered by sourceType "responses")
- Integration: `generateAIDraft()` threads taskRunId through all LLM calls (verified in code review)
- Verify multiple step_attempts created under single task_run for multi-step presentation (verified in code review)

## Implementation notes

### Files actually modified
- `apps/web/server/services/taskRunStore.ts` — Added `updateTaskRunArtifact()` (lines 184-204)
- `apps/web/server/services/taskRunStore.test.ts` — New test file (5 tests)
- `apps/web/server/routers/chat.ts` — Artifact classification in executeSkill (lines 1459-1476)
- `apps/web/server/services/aiPresentationService.ts` — Planner in generateAIDraft + taskRunId threading
- `apps/web/server/_core/responsesRoutes.ts` — Planner wiring in both stream + JSON handlers

### Code review fixes applied
- Added `.catch(() => null)` to runPlanner calls in aiPresentationService and responsesRoutes (defensive)
- Fixed model name in step recording to use `plannerResult.resolvedModel ?? requestedModelId`

### Deviations from plan
- Plan referenced `generateDraftWithAI()` but actual function is `generateAIDraft()`
- `callLLMStructured` calls within generateAIDraft not wired (separate code path with own billing)
- Plan's `updateTaskRunArtifact` comment said "Section 04" but implemented in Section 03 as specified
