# Section 01 — Planner Middleware + Core Chat/Service Wiring

## Objective

Create the `taskPlannerMiddleware.ts` orchestrator and wire it into all core LLM model resolution paths — chat routes, chat service, channel gateway, memory, translation, and scheduled messages.

## Scope

1. Create `taskPlannerMiddleware.ts` — the single orchestrator that calls planner modules in sequence
2. Wire into `llmRoutesHandler.ts` — the primary chat + stream entry point
3. Wire into all secondary `resolveEnabledLlmModelId()` callers
4. Implement shadow mode vs active mode branching
5. Add `completeStepAttempt()` calls after LLM execution completes

## Files to create

### `apps/web/server/services/taskPlannerMiddleware.ts`

The central orchestrator. All entry points call `runPlanner()` which returns a `PlannerResult`:

```typescript
import { buildExecutionPlan, type TaskExecutionPlan } from "./taskExecutionPlanner";
import { resolveModelFromPlan, buildModelResolutionSnapshot, type ModelResolutionSnapshot } from "./modelResolver";
import { createTaskRun, createStepAttempt, completeStepAttempt } from "./taskRunStore";
import { loadEnabledModelsWithCapabilities } from "./capabilityRegistry";
import { getTenantFeatureFlag } from "./featureFlags";
import { getTraceId } from "./traceContext";

export interface PlannerResult {
  taskRunId: number;
  plan: TaskExecutionPlan;
  resolvedModel: string | null;       // planner-selected model ID
  snapshot: ModelResolutionSnapshot | null;
  shadowMode: boolean;
}

export interface PlannerInput {
  sourceType: string;              // "chat" | "stream" | "channel" | "scheduled" | "translation" | "memory" | "skill" | "media" | "presentation" | "responses" | "agency" | "webhook"
  userId: number;
  tenantId: string;
  conversationModel?: string | null;
  skillSlug?: string;
  hasTools?: boolean;
  executionPolicy?: { modelId?: string; mode?: string };
}

/**
 * Run the task planner. Returns null if planner is disabled.
 * NEVER throws — wraps all errors and falls back gracefully.
 */
export async function runPlanner(input: PlannerInput): Promise<PlannerResult | null> {
  // 1. Check feature flag — zero overhead when disabled
  //    NOTE: Use getTenantFeatureFlag (not getFeatureFlag) for tenant-scoped control
  const enabled = await getTenantFeatureFlag("TASK_PLANNER_ENABLED", input.tenantId);
  if (!enabled) return null;

  const shadowMode = await getTenantFeatureFlag("TASK_PLANNER_SHADOW_MODE", input.tenantId);

  try {
    // 2. Build execution plan
    //    buildExecutionPlan accepts TaskClassificationInput:
    //    { sourceType, skillSlug?, userId?, tenantId?, conversationModel?, hasTools?, hasMultipleSteps?, executionPolicy? }
    const plan = buildExecutionPlan({
      sourceType: input.sourceType,
      skillSlug: input.skillSlug,
      userId: input.userId,
      tenantId: input.tenantId,
      conversationModel: input.conversationModel ?? undefined,
      hasTools: input.hasTools,
      executionPolicy: input.executionPolicy,
    });

    // 3. Create task_run record
    //    createTaskRun returns { id: number } — destructure to get taskRunId
    //    traceId is passed for correlation with provider_usage_log in telemetry (S04).
    //    PREREQUISITE: Add traceId column to task_runs schema (see "Schema change" below).
    const traceId = getTraceId();
    const { id: taskRunId } = await createTaskRun({
      userId: input.userId,
      tenantId: input.tenantId,
      plan,
      sourceType: input.sourceType,
      skillSlug: input.skillSlug,
      traceId: traceId ?? undefined,
    });

    // 4. Resolve model from plan
    //    loadEnabledModelsWithCapabilities() takes NO parameters — loads all enabled models globally
    const enabledModels = await loadEnabledModelsWithCapabilities();
    const resolved = resolveModelFromPlan(plan, enabledModels);
    //    buildModelResolutionSnapshot(model, attemptIndex, fallbackReason?) — NOT (model, plan)
    const snapshot = resolved ? buildModelResolutionSnapshot(resolved, 0) : null;

    return {
      taskRunId,
      plan,
      resolvedModel: resolved?.modelId ?? null,
      snapshot,
      shadowMode: shadowMode !== false, // default true
    };
  } catch (err) {
    // Planner failure must never block the request
    console.error("[taskPlannerMiddleware] planner failed, falling back to legacy", err);
    return null;
  }
}

/**
 * Record step attempt after LLM execution completes.
 * Call this in the "after completion" path.
 */
export async function recordStepAttempt(params: {
  taskRunId: number;
  model: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
  durationMs?: number;
  snapshot?: ModelResolutionSnapshot | null;
}): Promise<void> {
  try {
    const stepId = await createStepAttempt({
      taskRunId: params.taskRunId,
      effectiveModel: params.model,
      provider: params.provider,
      resolvedModelSnapshot: params.snapshot ?? undefined,
    });
    await completeStepAttempt({
      stepId,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      costUsd: params.costUsd,
      durationMs: params.durationMs,
    });
  } catch (err) {
    // Step attempt recording must never block the request
    console.error("[taskPlannerMiddleware] step attempt recording failed", err);
  }
}
```

### `apps/web/server/services/taskPlannerMiddleware.test.ts`

Tests:
1. `runPlanner()` returns null when `TASK_PLANNER_ENABLED=false`
2. `runPlanner()` returns PlannerResult with `shadowMode=true` when shadow flag is true
3. `runPlanner()` returns PlannerResult with `shadowMode=false` when shadow flag is false
4. `runPlanner()` returns null on internal error (never throws)
5. `runPlanner()` creates `task_runs` record via `createTaskRun()`
6. `runPlanner()` resolves model from plan via `resolveModelFromPlan()`
7. `recordStepAttempt()` calls `createStepAttempt()` + `completeStepAttempt()`
8. `recordStepAttempt()` silently catches errors (never throws)
9. `runPlanner()` passes `traceId` from trace context
10. `runPlanner()` passes `sourceType` correctly for each entry point type

## Files to modify

### `apps/web/server/_core/llmRoutesHandler.ts`

**Pre-requisite: Add `tenantId` to HandlerParams.**

The current `HandlerParams` interface does NOT include `tenantId`:
```typescript
// Current (line 14-21):
interface HandlerParams {
  model?: string;
  messages: Message[];
  userId: number;
  conversationId?: number;
  preferredProvider?: number;
  res: Response;
}
```

**Step 1: Add `tenantId` to HandlerParams:**
```typescript
interface HandlerParams {
  model?: string;
  messages: Message[];
  userId: number;
  tenantId: string;              // ADD — from req.tenantId (set by tenantMiddleware)
  conversationId?: number;
  preferredProvider?: number;
  res: Response;
}
```

**Step 2: Update callers in `llmRoutes.ts`** (lines 2276-2283, 2301-2308):

`req.tenantId` is available because `tenantMiddleware` sets it on every Express request. Pass it through:
```typescript
// In POST /api/llm/v2/chat handler:
await handleChatWithRouter({
  model: req.body?.model,
  messages: req.body?.messages || [],
  userId: check.userId,
  tenantId: (req as any).tenantId || "default",  // ADD — from tenantMiddleware
  conversationId: ...,
  preferredProvider: ...,
  res,
});
// Same for POST /api/llm/v2/stream → handleStreamWithRouter
```

**Step 3: Wire planner in handler functions:**

```typescript
import { runPlanner, recordStepAttempt, type PlannerResult } from "../services/taskPlannerMiddleware";

// Before resolveEnabledLlmModelId:
const plannerResult = await runPlanner({
  sourceType: isStream ? "stream" : "chat",
  userId,
  tenantId,                    // Now available from HandlerParams
  conversationModel: model,
});

// Model selection:
let effectiveModel: string | null;
if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
  // Active mode: use planner-selected model
  effectiveModel = plannerResult.resolvedModel;
} else {
  // Shadow mode or planner disabled: use legacy path
  effectiveModel = await resolveEnabledLlmModelId([model]);
}

// After LLM response (in success handler):
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

Apply to BOTH `handleChatWithRouter` (line 28) and `handleStreamWithRouter` (line 105).

### `apps/web/server/services/chatService.ts`

**Lines 75, 166**: `resolveEnabledLlmModelId()` calls for `createConversation` and `updateConversation`.

These are **model validation** calls (storing model ID in DB), NOT execution calls. The planner should NOT be wired here — these just validate the model exists. Keep as-is.

### `apps/web/server/services/channelGateway.ts`

**Line 441**: `processMessageServerSide` calls `resolveEnabledLlmModelId()` then `executeWithFallback()`.

Wire planner before model resolution:
```typescript
const plannerResult = await runPlanner({
  sourceType: "channel",
  userId: params.userId,
  tenantId: connection.tenantId,
  conversationModel: conversation.model,
});

let effectiveConversationModel: string | null;
if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
  effectiveConversationModel = plannerResult.resolvedModel;
} else {
  effectiveConversationModel = await resolveEnabledLlmModelId([conversation.model]);
}

// After executeWithFallback success:
if (plannerResult) {
  await recordStepAttempt({ taskRunId: plannerResult.taskRunId, model: effectiveConversationModel, ... });
}
```

### `apps/web/server/services/memoryService.ts`

**Line 22**: imports `resolveEnabledLlmModelId`. Wire planner for memory summarization:
```typescript
const plannerResult = await runPlanner({
  sourceType: "memory",
  userId,
  tenantId,
  conversationModel: memoryModel,
});
// Same shadow/active branching pattern
```

### `apps/web/server/services/translation.ts`

**Line 56**: `resolveEnabledLlmModelId([prefs.translationModel])`. Wire planner:
```typescript
const plannerResult = await runPlanner({
  sourceType: "translation",
  userId: ctx.user.id,
  tenantId: ctx.tenantId,
  conversationModel: prefs.translationModel,
});
// Same pattern
```

### `apps/web/server/routers/scheduledMessages.ts`

**Lines 99, 298, 508**: Three calls to `resolveEnabledLlmModelId()`.
- Lines 99 and 298 are **model validation** for storing in DB — keep as-is
- Line 508 (`parseIntent`): Wire planner before LLM execution

### `apps/web/server/routers/scheduler.ts`

**Lines 161, 246**: `resolveEnabledLlmModelId()` in `deliverScheduledMessage`.
Wire planner for both the skill execution branch (161) and LLM alert branch (246):
```typescript
const plannerResult = await runPlanner({
  sourceType: "scheduled",
  userId: schedule.userId,
  tenantId: schedule.tenantId,
  conversationModel: schedule.modelId,
});
```

### `apps/web/server/routers/users.ts`

**Line 748**: `resolveEnabledLlmModelId()` for `updatePreferences`. This is **model validation** — keep as-is.

## Schema change: `traceId` column (REQUIRED)

The `task_runs` table does **NOT** have a `traceId` column. This section MUST add it for telemetry correlation with `provider_usage_log` (S04).

**Step 1: Add to `task_runs` schema in `drizzle/schema.ts`:**
```typescript
traceId: varchar("traceId", { length: 64 }),
```

**Step 2: Add `traceId` to `CreateTaskRunInput` interface in `taskRunStore.ts`:**
```typescript
// Current CreateTaskRunInput does NOT have traceId — ADD it:
interface CreateTaskRunInput {
  userId: number;
  tenantId: string;
  plan: TaskExecutionPlan;
  sourceType: string;
  skillSlug?: string;
  traceId?: string;  // ADD — for telemetry correlation with provider_usage_log
}
```

**Step 3: Run migration:**
```bash
cd apps/web && pnpm db:push
```

This is a nullable column add — LOW risk. No data migration needed.

## Key design decisions

1. **`runPlanner()` NEVER throws** — all errors are caught and logged; returns null on failure so legacy path runs
2. **`recordStepAttempt()` NEVER throws** — billing recording is best-effort
3. **Model validation calls are NOT wired** — `chatService.ts`, `scheduledMessages.ts` (create/update), `users.ts` just validate model IDs exist; they don't execute LLM calls
4. **Shadow mode is default true** — when flag is missing, shadow mode is assumed
5. **Feature flag check uses `getTenantFeatureFlag()`** — not `getFeatureFlag()` — for tenant-scoped rollout
6. **`sourceType` is logged for telemetry** — allows filtering task_runs by entry point
7. **`createTaskRun()` returns `{ id: number }`** — destructure to get `taskRunId`
8. **`buildModelResolutionSnapshot(model, attemptIndex, fallbackReason?)`** — second param is attempt index (number), NOT the plan
9. **`loadEnabledModelsWithCapabilities()` takes NO parameters** — loads all enabled models globally
10. **`tenantId` must be added to `HandlerParams`** in `llmRoutesHandler.ts` and passed from `llmRoutes.ts` via `req.tenantId` (set by tenant middleware)

## Acceptance criteria

1. When `TASK_PLANNER_ENABLED=false`: zero overhead, no planner code runs
2. When enabled in shadow mode: `task_runs` row created, planner model logged but not used
3. When enabled in active mode: planner-selected model replaces `resolveEnabledLlmModelId()` result
4. `task_step_attempts` row created after LLM response with billing metadata
5. Fallback: if planner fails, falls back to legacy path with logged error
6. All LLM execution callers covered: llmRoutesHandler (×2), channelGateway, memoryService, translation, scheduledMessages (parseIntent), scheduler (×2)
7. Model validation callers NOT wired: chatService, scheduledMessages (create/update), users
8. Channel gateway creates `task_runs` with `sourceType: "channel"`

## Test plan

- Unit tests for `taskPlannerMiddleware.ts` (10 tests, mocking planner modules)
- Integration pattern: verify `runPlanner` → `createTaskRun` → `resolveModelFromPlan` call chain
- Verify `recordStepAttempt` → `createStepAttempt` + `completeStepAttempt` call chain
- Verify null return on disabled flag
- Verify null return on internal errors (never throws)

## Implementation Notes (Actual)

### Files created
- `apps/web/server/services/taskPlannerMiddleware.ts` — central orchestrator
- `apps/web/server/services/taskPlannerMiddleware.test.ts` — 11 unit tests (all passing)

### Files modified
- `apps/web/drizzle/schema.ts` — added `traceId` varchar(64) to `task_runs` table
- `apps/web/drizzle/0067_confused_bastion.sql` — migration (also includes `agency_run_artifacts` table from prior schema)
- `apps/web/server/services/taskRunStore.ts` — added `traceId` to `CreateTaskRunInput` and insert
- `apps/web/server/services/capabilityRegistry.ts` — added `loadEnabledModelsWithPricing()` (needed because `resolveModelFromPlan` expects `ModelWithPricing[]`)
- `apps/web/server/services/llmRoutesHandler.ts` — added `tenantId` to HandlerParams, wired planner + recordStepAttempt for both chat and stream
- `apps/web/server/_core/llmRoutes.ts` — passes `req.tenantId` to handler calls
- `apps/web/server/services/channelGateway.ts` — wired planner before model resolution + recordStepAttempt after success
- `apps/web/server/routers/translation.ts` — wired planner + recordStepAttempt
- `apps/web/server/routers/scheduledMessages.ts` — wired planner + recordStepAttempt for parseIntent
- `apps/web/server/services/scheduler.ts` — wired planner + recordStepAttempt for LLM-powered alert path

### Deviations from plan
1. **memoryService.ts NOT wired** — uses direct `fetch()` calls (not `executeWithFallback`), function signature has no `tenantId`. Low volume background process. Would require invasive changes to add tenantId to all callers.
2. **`loadEnabledModelsWithPricing()`** created instead of using `loadEnabledModelsWithCapabilities()` — plan instruction was incorrect; `resolveModelFromPlan` expects `ModelWithPricing[]` which includes pricing fields not in `EnabledModelWithCapabilities`.
3. **scheduler.ts skill branch (line 161)** — not wired because it's model validation (setting conversation model), not LLM execution.
4. **`recordStepAttempt` signature** differs from plan pseudo-code to match actual `CreateStepAttemptInput` and `CompleteStepAttemptInput` interfaces (e.g., `costUsd: string`, `plan` param for strategy extraction).

### Code review fixes applied
- Moved feature flag checks inside try/catch to maintain "never throws" guarantee
- Added missing `recordStepAttempt` import and call in `scheduledMessages.ts` parseIntent
