# Section 02 — Skill Execution + Structured LLM Wiring

## Objective

Wire the planner into skill execution (`executeSkill` in `chat.ts`) for LLM-only skills, into `skillExecutor.ts` for media skills, and into `callLLMStructured.ts` for JSON-mode structured LLM calls.

## Scope

1. Wire planner into `chat.ts` `executeSkill` mutation (LLM-only skill path)
2. Wire planner into `skillExecutor.ts` for image/video/audio generation
3. Wire planner into `callLLMStructured.ts` for structured output calls
4. Pass skill execution policy as planner input
5. Record `task_step_attempts` after skill/media execution

## Dependencies

- Section 01 (`taskPlannerMiddleware.ts` must exist)

## Files to modify

### `apps/web/server/routers/chat.ts` — `executeSkill` mutation

**Current behavior (lines 1437-1441):**
```typescript
const executionPolicy = await resolveSkillExecutionPolicy({ skill, conversationModel });
const llmModel = executionPolicy.modelId;
```

**Context availability:**
- `ctx.user.id` — available from `protectedProcedure` ✓
- `ctx.tenantId` — available from tRPC context (set by `context.ts:53-55` from `tenantMiddleware`) ✓
- The LLM call uses **raw `fetch()`** via `getProviderForModel()` (NOT `executeWithFallback`) — planner wiring at model selection level

**`SkillExecutionPolicyResult` type** (from `skillExecutionPolicy.ts`):
```typescript
interface SkillExecutionPolicyResult {
  modelId: string | null;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
  modelSource: "skill_llmModelId" | "skill_defaultModel" | "conversation" | "system_default";
}
```
Note: `mode` field does NOT exist in the result. Use `modelSource` instead.

**New behavior — inject planner before skill execution:**
```typescript
import { runPlanner, recordStepAttempt } from "../services/taskPlannerMiddleware";

// After resolveSkillExecutionPolicy:
const executionPolicy = await resolveSkillExecutionPolicy({ skill, conversationModel });

const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");

const plannerResult = await runPlanner({
  sourceType: "skill",
  userId: ctx.user.id,
  tenantId,
  conversationModel,
  skillSlug: input.skillId,
  executionPolicy: {
    modelId: executionPolicy.modelId ?? undefined,
    mode: executionPolicy.modelSource,  // Use modelSource, not mode
  },
});

// Model selection:
let llmModel: string | null;
if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
  llmModel = plannerResult.resolvedModel;
} else {
  llmModel = executionPolicy.modelId;
}

// After LLM response (in success handler, ~line 1520):
if (plannerResult) {
  await recordStepAttempt({
    taskRunId: plannerResult.taskRunId,
    model: llmModel ?? "unknown",
    provider: provider.providerName,
    inputTokens,
    outputTokens,
    costUsd,
  });
}
```

**Key detail:** The `executeSkill` path uses `getProviderForModel()` + raw `fetch()` (not `executeWithFallback`), so planner wiring happens at model selection level, not at the execution level.

### `apps/web/server/services/skillExecutor.ts` — Media skills

**Current behavior:** Each media function (image/video/audio) resolves its model via:
```typescript
const modelInput = params.model || skill.defaultModel;
let model = modelInput ? mapToApiModelId(modelInput) : getDefaultModel("image").id;
```

**New behavior — inject planner before model resolution:**

For `executeImageGeneration` (line 426), `executeVideoGeneration` (line 535), `executeAudioGeneration` (line 656):

```typescript
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";

// At the start of each function, after model cache load:
const plannerResult = await runPlanner({
  sourceType: "media",
  userId,
  tenantId,  // need to thread tenantId through to these functions
  skillSlug: skill.id,
});

// Model resolution remains unchanged (media models aren't in LLM model table)
// But task_run is still created for tracking

// After generation result:
if (plannerResult) {
  await recordStepAttempt({
    taskRunId: plannerResult.taskRunId,
    model: model,
    inputTokens: 0,
    outputTokens: 0,
    // Media skills don't have token counts — record cost if available
  });
}
```

**Important note:** Media model resolution uses a different registry (`modelRegistry.ts` with `getModelById/getDefaultModel`) than LLM model resolution (`resolveEnabledLlmModelId`). The planner's model selection may not apply to media models in shadow mode. The planner creates a `task_run` for tracking purposes, but media model selection stays with the existing registry for now.

**Threading `tenantId` — BREAKING CHANGE required:**

The top-level `executeSkill()` in `skillExecutor.ts` already receives `tenantId` (line 304):
```typescript
export async function executeSkill(
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userId: number,
  userToken: string,
  tenantId?: string,  // Already exists!
): Promise<SkillExecutionResult>
```

But the internal media functions do NOT pass it through:
```typescript
// Current (line 384):
return executeImageGeneration(skill, params, userId, userToken);
// Missing tenantId! ↑
```

**Fix: Add `tenantId?` parameter to internal media functions and pass through:**

```typescript
// executeImageGeneration signature change:
async function executeImageGeneration(
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userId: number,
  userToken: string,
  tenantId?: string,       // ADD
): Promise<SkillExecutionResult>

// Same for executeVideoGeneration and executeAudioGeneration

// Update callers (lines 384, 388, 396):
return executeImageGeneration(skill, params, userId, userToken, tenantId);
return executeVideoGeneration(skill, params, userId, userToken, tenantId);
return executeAudioGeneration(params, userId, userToken, tenantId);
```

Note: `executeAudioGeneration` has a different signature (no `skill` param). Keep its existing signature and just add `tenantId?` at the end.

### `apps/web/server/services/callLLMStructured.ts`

**Function signature** (already has tenantId):
```typescript
interface CallLLMStructuredParams<T> {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
  zodSchema: z.ZodType<T>;
  maxRetries?: number;
  userId: number;
  tenantId: string;                          // ✓ Already present
  billingDescription?: string;
  billingMetadata?: Record<string, unknown>;  // ✓ Already present (generic Record, not typed)
}
```

**Current behavior (lines 103-111):**
```typescript
const result = await executeWithFallback({
  model,
  messages,
  stream: false,
  userId,
  preferredProvider: strictProviderPin ? preferredProviderId : undefined,
});
```

**New behavior — inject planner ONCE before the retry loop:**
```typescript
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";

// Before the retry loop (run planner ONCE, not per attempt):
const plannerResult = await runPlanner({
  sourceType: "skill",
  userId: params.userId,
  tenantId: params.tenantId,
  conversationModel: model,
  // billingMetadata is Record<string, unknown> — extract skillSlug if present
  skillSlug: (params.billingMetadata?.skillSlug as string) ?? undefined,
});

let effectiveModel = model;
if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
  effectiveModel = plannerResult.resolvedModel;
}

const result = await executeWithFallback({
  model: effectiveModel,
  messages,
  stream: false,
  userId,
  preferredProvider: strictProviderPin ? preferredProviderId : undefined,
});

// After result processing (inside success path):
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

**Important:** `callLLMStructured` has a retry loop (up to 3 attempts for JSON parse failures). The planner should run ONCE before the loop, not per-attempt. Each retry attempt should create a separate `step_attempt` record.

## Key design decisions

1. **Planner runs once per skill execution** — not per retry attempt
2. **Each retry creates a separate `step_attempt`** — for accurate billing tracking
3. **Media skills create `task_runs` for tracking** — but model selection stays with media registry
4. **`tenantId` must be threaded through to media execution functions** — add parameter
5. **Structured output calls add `structuredOutput` requirement** — planner filters to models supporting JSON mode
6. **Skill slug is passed to planner** — recorded in `planJson` for skill-level analytics

## Acceptance criteria

1. Every skill execution (LLM-only) creates a `task_runs` record
2. Skill execution policy requirements are reflected in the plan
3. Media skills create `task_runs` for tracking (model selection unchanged for now)
4. Structured LLM calls (`callLLMStructured.ts`) create `task_runs`
5. Legacy `resolveSkillExecutionPolicy()` still works as fallback
6. Retry attempts in structured calls create separate `step_attempt` records
7. `tenantId` threaded through media execution functions

## Test plan

- Unit test: `executeSkill` with planner enabled creates `task_runs`
- Unit test: `executeSkill` with planner disabled uses legacy path
- Unit test: `callLLMStructured` runs planner once, records per-attempt step attempts
- Unit test: `executeImageGeneration` creates `task_runs` for tracking
- Unit test: planner failure doesn't block skill execution
- Verify `tenantId` is correctly passed to media execution functions

## Implementation Notes (Actual)

### Files created
- `apps/web/server/services/callLLMStructured.test.ts` — 6 unit tests for structured LLM planner wiring

### Files modified
- `apps/web/server/routers/chat.ts` — Added planner wiring in `executeSkill` mutation (import + runPlanner + shadow/active branching + recordStepAttempt)
- `apps/web/server/services/skillExecutor.ts` — Added planner to `executeImageGeneration`, `executeVideoGeneration`, `executeAudioGeneration`; threaded `tenantId` through all media function signatures and callers
- `apps/web/server/services/callLLMStructured.ts` — Added planner before retry loop with `effectiveModel` substitution; `recordStepAttempt` per attempt with correct `attemptIndex`

### Deviations from plan
- **Per-attempt attemptIndex**: Plan didn't address incrementing `attemptIndex` across retries. Fixed by creating per-attempt snapshot copy: `{ ...plannerResult.snapshot, attemptIndex: attempt }`.
- **Media provider field**: Media `recordStepAttempt` calls don't pass `provider` because the Python backend provider isn't available at Node.js call site. Records `"unknown"`.
- **callLLMStructured doesn't pass executionPolicy**: Plan's pseudocode omits it too. Often invoked from non-skill contexts.

### Code review fixes
- Added `?? "unknown"` null-safety fallback for `llmModel` in chat.ts recordStepAttempt
- Fixed per-attempt snapshot with correct attemptIndex in callLLMStructured retry loop

### Test count: 6 tests (all passing)
