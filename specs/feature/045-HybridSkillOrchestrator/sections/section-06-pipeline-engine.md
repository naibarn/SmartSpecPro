Now I have all the context needed. Here is the section content:

# Section 6: Pipeline Engine (COMPOUND Mode)

## Overview

This section implements `skillPipelineEngine.ts`, the execution engine for COMPOUND-level orchestrations. When the intent classifier identifies a user request that needs multiple skills executed in a defined order (e.g., "write an article then translate it"), the orchestrator routes to the pipeline engine. The pipeline engine handles topological sorting of steps, wave-based parallel execution, input mapping between steps, per-step error strategies, and async skill handling.

**File to create:** `apps/web/server/services/skillPipelineEngine.ts`
**Test file to create:** `apps/web/server/services/__tests__/skillPipelineEngine.test.ts`

## Dependencies

This section depends on:

- **Section 01 (Types & Config):** `PipelineStep`, `ErrorStrategy`, `OrchestrationResult` types from `apps/web/shared/orchestration/types.ts`
- **Section 05 (Orchestrator Main):** The orchestrator routes COMPOUND-level requests to `executePipeline()`
- **Existing code:** `executeSkill()` from `apps/web/server/services/skillExecutor.ts` (the function that actually runs individual skills)
- **Existing code:** `skillRegistry.ts` for looking up `SkillDefinition` by ID

This section blocks:

- **Section 08 (Result Merger):** Needs pipeline output to merge multi-step results
- **Section 11 (Frontend Integration):** Needs pipeline progress events for UI updates

## Key Types (from Section 01)

The pipeline engine uses these types defined in `apps/web/shared/orchestration/types.ts`. They are listed here so this section is self-contained:

```typescript
type ErrorStrategy = "fail-fast" | "continue" | "retry";

interface PipelineStep {
  id: string;               // unique step identifier, e.g. "step1"
  skillId: string;           // which skill to execute
  params: Record<string, unknown>;  // extracted parameters
  dependsOn: string[];       // step IDs that must complete first
  inputMapping?: Record<string, string>;  // maps from previous step outputs, e.g. { "content": "step1.content" }
  errorStrategy: ErrorStrategy;
}

interface PipelineStepResult {
  stepId: string;
  skillId: string;
  status: "completed" | "failed" | "skipped" | "pending_async";
  result?: SkillExecutionResult;  // from skillExecutor.ts
  error?: string;
  creditsUsed: number;
  durationMs: number;
}

interface PipelineResult {
  steps: PipelineStepResult[];
  totalCreditsUsed: number;
  totalDurationMs: number;
}
```

`SkillExecutionResult` is the existing type from `apps/web/server/services/skillExecutor.ts` with fields: `success`, `skillId`, `type`, `data`, `resultUrl`, `resultUrls`, `message`, `error`, `creditsUsed`, `taskId`, `isAsync`, `metadata`.

`SkillExecutionParams` is the existing type from the same file with fields: `prompt`, `conversationId`, `context`, `model`, `aspectRatio`, `quality`, `style`, `numImages`, `duration`, `voice`, `resolution`, `referenceImageUrls`, `referenceStyleUrl`, `apiConfig`, `extraParams`, `publicBaseUrl`, `traceId`.

## Tests First

Create `apps/web/server/services/__tests__/skillPipelineEngine.test.ts`.

All tests mock `executeSkill` from `skillExecutor.ts` and `getSkillById` (or equivalent) from `skillRegistry.ts`. The pipeline engine itself contains no LLM calls -- it orchestrates calls to `executeSkill()`.

### Test Structure

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock skillExecutor
vi.mock("../skillExecutor", () => ({
  executeSkill: vi.fn(),
}));

// Mock skillRegistry
vi.mock("../skillRegistry", () => ({
  getSkillDefinitionById: vi.fn(),
}));

import { executePipeline, resolveInputMapping } from "../skillPipelineEngine";
import { executeSkill } from "../skillExecutor";
import { getSkillDefinitionById } from "../skillRegistry";
import type { PipelineStep } from "@shared/orchestration/types";
```

### executePipeline() Tests

1. **Test: executes single-step pipeline successfully**
   - Input: one step with no dependencies
   - Mock `executeSkill` to return `{ success: true, type: "text", message: "result" }`
   - Assert: `PipelineResult.steps` has 1 entry with status "completed", totalCreditsUsed matches

2. **Test: executes 2-step sequential pipeline (step2 after step1)**
   - Input: step1 with no deps, step2 with `dependsOn: ["step1"]`
   - Mock `executeSkill` to resolve successfully for both
   - Assert: step2 starts only after step1 completes (verify call order via mock call indices)
   - Assert: both steps have status "completed"

3. **Test: executes 2-step parallel pipeline (both steps concurrently)**
   - Input: step1 and step2 both with `dependsOn: []`
   - Mock `executeSkill` with a delayed resolve to prove concurrency
   - Assert: total durationMs is closer to max(step1, step2) than sum (proving parallelism)

4. **Test: resolves inputMapping from previous step output**
   - Input: step1 produces `{ message: "article text" }`, step2 has `inputMapping: { "content": "step1.content" }`
   - Assert: step2's params include `content: "article text"` when `executeSkill` is called

5. **Test: handles fail-fast error strategy (aborts on first failure)**
   - Input: step1 with `errorStrategy: "fail-fast"`, step2 depends on step1
   - Mock step1 to fail
   - Assert: step1 status is "failed", step2 status is "skipped", pipeline returns early

6. **Test: handles continue error strategy (continues past failure)**
   - Input: step1 with `errorStrategy: "continue"` and no dependents, step2 independent
   - Mock step1 to fail, step2 to succeed
   - Assert: step1 status "failed", step2 status "completed"

7. **Test: handles retry error strategy (retries once on failure)**
   - Input: step1 with `errorStrategy: "retry"`
   - Mock `executeSkill` to fail first call, succeed second call
   - Assert: step1 status is "completed", `executeSkill` called twice for step1

8. **Test: tracks credits per step and total**
   - Input: two steps
   - Mock step1 to return `creditsUsed: 5`, step2 to return `creditsUsed: 3`
   - Assert: `totalCreditsUsed === 8`

9. **Test: handles mixed parallel + sequential steps (topological sort)**
   - Input: step1 (no deps), step2 (no deps), step3 (depends on step1 and step2)
   - Assert: step1 and step2 run in wave 1, step3 runs in wave 2 after both complete

### Input Mapping Resolution Tests

These test the exported `resolveInputMapping()` helper function directly.

10. **Test: resolves "step1.content" to step1's text content**
    - Previous results map: `{ step1: { message: "hello", type: "text" } }`
    - Mapping path: `"step1.content"`
    - Assert: returns `"hello"` (maps `.content` to the text message of the step)

11. **Test: resolves "step1.urls[0]" to first URL from step1**
    - Previous results map: `{ step1: { resultUrls: ["url1", "url2"] } }`
    - Mapping path: `"step1.urls[0]"`
    - Assert: returns `"url1"`

12. **Test: returns undefined for invalid mapping path**
    - Mapping path: `"nonexistent.field"`
    - Assert: returns `undefined`

13. **Test: handles nested field access with dot notation**
    - Previous results map: `{ step1: { metadata: { title: "Test" } } }`
    - Mapping path: `"step1.metadata.title"`
    - Assert: returns `"Test"`

### Async Skills in Pipeline Tests

14. **Test: marks async skill step as "pending_async" when no dependents**
    - Mock `executeSkill` to return `{ isAsync: true, taskId: "task-123" }`
    - Step has no dependents in the pipeline
    - Assert: step status is `"pending_async"`, result includes `taskId`

15. **Test: polls for async completion when step has dependents**
    - Mock `executeSkill` to return `{ isAsync: true, taskId: "task-456" }`
    - Step has a dependent step
    - Mock a polling mechanism that returns completed after 2 polls
    - Assert: dependent step executes with the async step's result

16. **Test: skips dependent steps on async timeout (60s)**
    - Mock `executeSkill` to return `{ isAsync: true, taskId: "task-789" }`
    - Mock polling to never resolve within timeout
    - Assert: dependent steps have status "skipped" with reason containing "timeout"

## Implementation Details

### File: `apps/web/server/services/skillPipelineEngine.ts`

#### Exported Functions

1. **`executePipeline(steps, options)`** -- main entry point
2. **`resolveInputMapping(mapping, completedResults)`** -- exported for testability

#### `executePipeline` Signature

```typescript
export async function executePipeline(
  steps: PipelineStep[],
  options: {
    userId: number;
    tenantId: string;
    userToken: string;
    traceId: string;
    budget?: number;
  }
): Promise<PipelineResult>
```

#### Topological Sort Algorithm

The pipeline engine must sort steps into execution waves based on `dependsOn` relationships.

Algorithm:
1. Build an adjacency map: for each step, which steps depend on it (reverse edges)
2. Build an in-degree map: for each step, how many dependencies it has
3. Start with all steps that have in-degree 0 (no dependencies) -- these form wave 1
4. After each wave completes, decrement in-degree for steps that depended on completed steps
5. Steps whose in-degree reaches 0 form the next wave
6. Repeat until all steps are scheduled
7. If any steps remain unscheduled after all waves, there is a cycle -- throw an error

This is a standard Kahn's algorithm for topological sorting, adapted to produce waves (groups) rather than a linear order.

#### Wave-based Execution

```
Wave 1: [step1, step2]  -- no dependencies, run in parallel
Wave 2: [step3]          -- depends on step1 and step2
Wave 3: [step4]          -- depends on step3
```

For each wave, use `Promise.allSettled()` to run all steps concurrently. This matches the existing codebase pattern (see `apps/web/server/services/redisClients.ts` and `apps/web/server/routers/services.ts`).

For each step within a wave:
1. Look up the `SkillDefinition` via `getSkillDefinitionById(step.skillId)`
2. If the step has `inputMapping`, call `resolveInputMapping()` to merge mapped values into `step.params`
3. Build `SkillExecutionParams` from the step's params (mapping step params to the `prompt`, `model`, `aspectRatio`, etc. fields, plus putting remaining params into `extraParams`)
4. Call `executeSkill(skillDef, execParams, options.userId, options.userToken, options.tenantId)`
5. Record the result in the `completedResults` map (keyed by step ID)
6. Track `creditsUsed` (from `result.creditsUsed ?? 0`) and `durationMs`

#### Input Mapping Resolution Logic

`resolveInputMapping(mapping, completedResults)` takes a mapping object like `{ "content": "step1.content", "targetLanguage": "en" }` and returns a resolved params object.

For each key-value pair in the mapping:
- If the value does not contain a dot, treat it as a literal value (e.g., `"en"`)
- If the value matches `"stepN.path..."`, split on the first dot to get `stepId` and `fieldPath`
- Look up `completedResults[stepId]` to get the `SkillExecutionResult`
- Map well-known field aliases:
  - `.content` or `.text` maps to `result.message`
  - `.url` maps to `result.resultUrl`
  - `.urls` maps to `result.resultUrls`
  - `.urls[N]` maps to `result.resultUrls[N]`
  - `.metadata.X` maps to `result.metadata?.X`
  - `.type` maps to `result.type`
- For nested access (multiple dots), traverse the object using each segment
- Return `undefined` for unresolvable paths (do not throw)

#### Error Strategy Handling

Per step, the `errorStrategy` field determines behavior on failure:

- **`fail-fast`**: If the step fails, immediately mark all remaining unstarted steps as "skipped" and return the pipeline result. Steps already running in the same wave continue to completion (because `Promise.allSettled` is used), but no new waves start.

- **`continue`**: Mark the step as "failed" and proceed. If other steps depend on this failed step, those dependent steps are marked as "skipped" (since their input data is unavailable).

- **`retry`**: Retry the step once with the same params. If the retry also fails, treat it as a regular failure (apply the implicit fallback of "continue" behavior). Track the retry in the step result metadata.

Implementation approach: maintain a `pipelineAborted` flag. After each wave, check if any step in that wave failed with `fail-fast` strategy. If so, set `pipelineAborted = true` and skip remaining waves.

#### Async Skill Handling

Some skills (video generation, audio generation) return `{ isAsync: true, taskId: "..." }` instead of immediate results.

Decision logic after receiving an async result:
1. Check if any subsequent step in the pipeline has this step's ID in its `dependsOn` array
2. **No dependents:** Mark step as `"pending_async"` and move on. The frontend will poll for completion separately.
3. **Has dependents:** Must wait for async completion. Implement a polling loop:
   - Poll interval: 3 seconds
   - Max wait: 60 seconds (configurable via constant `ASYNC_STEP_TIMEOUT_MS`)
   - Use the existing `getSkillTaskResult` pattern from the chat router to check task status
   - If completed within timeout: extract result and continue pipeline
   - If timeout: mark this step as "failed" with timeout error, mark dependent steps as "skipped"

The polling function should be extracted as a private helper `waitForAsyncStep(taskId, timeoutMs)` so it can be mocked in tests.

#### Building SkillExecutionParams from Step Params

The pipeline step's `params` is a free-form `Record<string, unknown>`. The `executeSkill` function expects a `SkillExecutionParams` object with specific named fields. The pipeline engine must map between them:

```typescript
function buildExecParams(
  stepParams: Record<string, unknown>,
  traceId: string
): SkillExecutionParams {
  // Extract known fields, put the rest into extraParams
  const { prompt, model, aspectRatio, quality, style, numImages,
          duration, voice, resolution, referenceImageUrls,
          referenceStyleUrl, ...rest } = stepParams as any;
  return {
    prompt: prompt ?? "",
    model, aspectRatio, quality, style, numImages,
    duration, voice, resolution, referenceImageUrls,
    referenceStyleUrl,
    extraParams: Object.keys(rest).length > 0 ? rest : undefined,
    traceId,
  };
}
```

#### Credit Budget Enforcement

If `options.budget` is provided, track cumulative credits used across all steps. Before starting each wave, check if remaining budget is sufficient (estimate based on completed steps). If budget would be exceeded, skip remaining waves and return with a budget warning in the result.

#### Timing

Track `totalDurationMs` as wall-clock time from pipeline start to pipeline end (not sum of step durations, since parallel steps overlap). Use `Date.now()` or `performance.now()` at start and end.

Per-step `durationMs` is measured individually around each `executeSkill` call.

### Constants

Define at the top of the file:

```typescript
const ASYNC_STEP_TIMEOUT_MS = 60_000;   // 60s max wait for async step
const ASYNC_POLL_INTERVAL_MS = 3_000;    // poll every 3s
const MAX_PIPELINE_STEPS = 10;           // safety limit
```

### Error Handling

- If `steps` array is empty, return an empty `PipelineResult` immediately
- If `steps` array exceeds `MAX_PIPELINE_STEPS`, throw an error
- If topological sort detects a cycle, throw an error with the involved step IDs
- If `getSkillDefinitionById` returns null for a step's skillId, mark that step as "failed" with error "Skill not found"
- Wrap each `executeSkill` call in try/catch -- any thrown exception counts as a step failure

### Logging

Use `console.log` with `[PipelineEngine]` prefix (matching existing codebase convention in `skillExecutor.ts`). Log:
- Pipeline start: number of steps, step IDs
- Each wave start: wave number, step IDs in wave
- Each step completion: step ID, status, credits, duration
- Pipeline end: total steps completed, total credits, total duration

Audit logging (`orchestration_pipeline` event) is handled by Section 10. This section only needs to return the `PipelineResult` -- the orchestrator in Section 05 will call the audit logger.

## Implementation Checklist

1. Create `apps/web/server/services/__tests__/skillPipelineEngine.test.ts` with all 16 test cases listed above
2. Create `apps/web/server/services/skillPipelineEngine.ts` with:
   - Constants (`ASYNC_STEP_TIMEOUT_MS`, `ASYNC_POLL_INTERVAL_MS`, `MAX_PIPELINE_STEPS`)
   - `resolveInputMapping()` -- exported helper for mapping resolution
   - `buildExecParams()` -- private helper to convert step params to `SkillExecutionParams`
   - `topologicalSort()` -- private helper that returns `PipelineStep[][]` (array of waves)
   - `waitForAsyncStep()` -- private helper for polling async task completion
   - `executePipeline()` -- main exported function
3. Verify all tests pass with `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/services/__tests__/skillPipelineEngine.test.ts`