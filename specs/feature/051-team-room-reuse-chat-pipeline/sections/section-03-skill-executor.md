I have all the context needed. Now I will produce the section content.

# Section 03 — Skill Executor Refactor

## Section ID
`section-03-skill-executor`

## Overview

Refactor `executeTeamRunSkillTurn()` in `teamRunSkillExecutor.ts` to always use the Node.js LLM path. Remove the Python bridge routes (agency route, non-LLM skill route), the `formatPromptMessagesForAgent()` flattener, and the `team-discussion-assistant` fallback. Use the detected skill's prompt from `route.selectedSkillId` and pass multi-turn messages from `composePrompt()` directly to `executeSkillLlmWithFallback()`.

## Dependencies

- **section-01-skill-detection**: `routeRoomIntent()` now populates `route.selectedSkillId` with an actual detected skill (not `team-discussion-assistant`).
- **section-02-prompt-composer**: `composePrompt()` now returns enriched messages with full persona segments, entity memories, and display-name-prefixed multi-turn history.

## MANDATORY: Add Node.js Rate Limit in This Section (NEW-1)

**This must be in the same commit as the executor refactor.** Once the executor stops calling `executeAgentTurn` (Python bridge), the Python rate limiter is no longer in the execution path. The Node.js replacement MUST be live before that happens.

**File:** `apps/web/server/routers/teamRun.ts`

Add rate limit to the `advance` procedure using existing `createRateLimitMiddleware`:

```typescript
const advanceRateLimit = createRateLimitMiddleware({ windowMs: 60_000, max: 30 });

advance: protectedProcedure
  .use(advanceRateLimit)
  .input(z.object({ runId: z.string().min(1), maxTurns: z.number().int().min(1).max(5).default(1) }))
  .mutation(async ({ input, ctx }) => { ... })
```

This closes the deployment window gap where neither Python nor Node.js rate limiting is active.

## File to Modify

`/home/dev/projects/SmartSpecPro/apps/web/server/services/teamRunSkillExecutor.ts`

## Current State (Reference)

The file currently has three execution branches:

1. **Agency route** (lines 87-123): Calls `executeAgentTurn()` from `teamOrchestrationBridge.ts` (Python HTTP bridge). Messages are flattened via `formatPromptMessagesForAgent()`.
2. **Non-LLM skill route** (lines 125-161): Also calls `executeAgentTurn()` with flattened messages when the skill is not an LLM-style skill.
3. **LLM skill route** (lines 163-242): Uses `executeSkillLlmWithFallback()` (Node.js). Already passes multi-turn messages correctly, but resolves to `team-discussion-assistant` via `resolveTeamRunSkill()`.

Key functions and imports to remove:
- `import { executeAgentTurn } from "./teamOrchestrationBridge"` -- Python bridge
- `import { TEAM_DISCUSSION_SKILL_ID } from "./internalSkills"` -- deprecated skill
- `formatPromptMessagesForAgent()` function -- message flattener
- `isTeamRunEligibleSkill()` function -- gating function that restricts which skills can run in Team Room

## Target State

A single execution path:

1. Resolve skill from `route.selectedSkillId` (any skill, not just "team-run-eligible" ones). If not found, try a general fallback. If still not found, throw.
2. Call `composePrompt()` (enhanced by section-02) to get multi-turn messages with persona, memories, and display-name history.
3. Prepend the skill's `systemPrompt` as the first system message.
4. Pass the full messages array to `executeSkillLlmWithFallback()`.
5. Return flat `inputTokens`/`outputTokens` fields and include `skillId` in metadata.

## Tests First

### File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks must be set up before importing the module under test
vi.mock("../skillRegistry", () => ({
  getSkillByIdAsync: vi.fn(),
}));
vi.mock("../skillModelFallback", () => ({
  executeSkillLlmWithFallback: vi.fn(),
}));
vi.mock("../promptComposer", () => ({
  composePrompt: vi.fn(),
}));
vi.mock("../skillExecutionPolicy", () => ({
  resolveSkillExecutionPolicy: vi.fn(),
}));
vi.mock("../taskPlannerMiddleware", () => ({
  runPlanner: vi.fn().mockResolvedValue(null),
  recordStepAttempt: vi.fn().mockResolvedValue(undefined),
}));

describe("executeTeamRunSkillTurn", () => {
  // --- Setup helpers: build valid input, mock return values ---

  it("should call executeSkillLlmWithFallback (not Python bridge)");
  // Verify executeSkillLlmWithFallback is called.
  // Verify executeAgentTurn is NOT imported/called.

  it("should use detected skill's systemPrompt in messages");
  // Mock getSkillByIdAsync to return a skill with systemPrompt = "You are a Thai article writer..."
  // Verify the first element in the messages array passed to executeSkillLlmWithFallback
  // has role: "system" and content equal to the skill's systemPrompt.

  it("should pass multi-turn messages array (not flattened string)");
  // Mock composePrompt to return messages = [{role: "system", content: "persona..."}, {role: "assistant", content: "[Agent A] ..."}]
  // Verify executeSkillLlmWithFallback receives an array with length > 2
  // and each element has role and content properties (not a single flat string).

  it("should return inputTokens and outputTokens as flat fields");
  // Verify the return shape has inputTokens: number and outputTokens: number at top level.

  it("should include skillId in result metadata");
  // Verify result.skillId equals the detected skill's id.
  // Verify result.metadata.selectedSkillId equals the same.
});

describe("executeTeamRunSkillTurn — skill resolution", () => {
  it("should use route.selectedSkillId when available");
  // Pass route.selectedSkillId = "lifestyle-article-writer"
  // Mock getSkillByIdAsync("lifestyle-article-writer") to return a valid skill
  // Verify that skill is used (check messages[0].content).

  it("should fall back to general skill when selectedSkillId not found");
  // Pass route.selectedSkillId = "nonexistent-skill"
  // Mock getSkillByIdAsync("nonexistent-skill") to return undefined
  // Mock getSkillByIdAsync with a known fallback skill id
  // Verify the fallback skill is used instead.

  it("should throw when no skill can be resolved");
  // Mock getSkillByIdAsync to always return undefined
  // Expect the function to throw with a descriptive error.
});

describe("executeTeamRunSkillTurn — no Python dependency", () => {
  it("should not import teamOrchestrationBridge");
  // Read the source file content (or use a static analysis approach)
  // and verify it does not contain 'teamOrchestrationBridge' import.
  // Alternatively: verify that no mock for teamOrchestrationBridge is needed.

  it("should not call executeAgentTurn");
  // Run executeTeamRunSkillTurn with any valid input
  // Verify that executeAgentTurn mock (if set up) was never called.
  // This is a safety check that the agency/non-LLM routes were removed.
});
```

**Mocking strategy**: Mock `composePrompt`, `executeSkillLlmWithFallback`, `getSkillByIdAsync`, `resolveSkillExecutionPolicy`, and `runPlanner`. The tests verify call arguments and return shapes, not the internals of composed prompts (those are tested in section-02).

## Implementation Guidance

### Step 1: Remove imports and functions

Remove the following from `teamRunSkillExecutor.ts`:

- **Import**: `import { executeAgentTurn } from "./teamOrchestrationBridge"`
- **Import**: `import { TEAM_DISCUSSION_SKILL_ID } from "./internalSkills"`
- **Function**: `formatPromptMessagesForAgent()` (lines 61-65)
- **Function**: `isTeamRunEligibleSkill()` (lines 57-59)
- **Function**: `isLlmStyleSkill()` (lines 44-55) -- no longer needed since all skills go through the LLM path

### Step 2: Simplify `resolveTeamRunSkill()`

The current function checks `isTeamRunEligibleSkill()` and falls back to `TEAM_DISCUSSION_SKILL_ID`. Change to:

```
async function resolveTeamRunSkill(selectedSkillId?: string): Promise<SkillDefinition>
```

Logic:
1. If `selectedSkillId` is provided, call `getSkillByIdAsync(selectedSkillId)`. If found, return it. No eligibility check needed -- any detected skill is valid for team runs.
2. If not found or not provided, try a general fallback skill id (e.g., `"general-article-writer"`).
3. If fallback also not found, throw `Error("No skill resolved for team run: ...")`.

Do NOT reference `TEAM_DISCUSSION_SKILL_ID` or `isTeamRunEligibleSkill`.

### Step 3: Collapse to single execution path

Remove the `if (input.route.route === "agency")` branch (lines 87-123) and the `if (!isLlmStyleSkill(skill))` branch (lines 125-161) entirely. The remaining LLM skill path (lines 163-242) becomes the only path.

### Step 4: Ensure message assembly is correct

The existing LLM path already does this correctly (lines 188-197):

```
const messages = [];
if (skill.systemPrompt) {
  messages.push({ role: "system", content: skill.systemPrompt });
}
for (const msg of composed.messages) {
  messages.push({ role: msg.role, content: msg.content });
}
```

This is the correct pattern. The skill's system prompt goes first, then the composed messages (which include persona, memories, team context, objective, and multi-turn history from section-02's enhanced `composePrompt()`).

### Step 5: Keep planner and execution policy

The task planner middleware (`runPlanner`, `recordStepAttempt`) and execution policy resolution (`resolveSkillExecutionPolicy`) remain unchanged. They work correctly with any skill.

### Step 6: Keep return shape unchanged

The `TeamRunSkillExecutionResult` interface stays the same:
- `content: string`
- `inputTokens: number` (flat, from `fallback.inputTokens`)
- `outputTokens: number` (flat, from `fallback.outputTokens`)
- `costCredits: number`
- `metadata: Record<string, unknown>` (includes `selectedSkillId`, `route`, planner info)
- `skillId: string`

### Step 7: Update metadata route field

Since there is only one route now, set `metadata.route` to `"skill"` always. Remove any `"agency"` route references.

## Interface Contracts

### Input (unchanged)

The `TeamRunSkillExecutionInput` interface does not change. It still receives `route.selectedSkillId` from `routeRoomIntent()` (section-01), and `route.route` will always be `"skill"` or `"chat"` (never `"agency"` after section-01 changes).

### Output (unchanged)

`TeamRunSkillExecutionResult` shape is preserved for backward compatibility with `runEngine.ts` callers.

### Dependencies on other modules

| Module | Function Used | Changed? |
|--------|--------------|----------|
| `skillRegistry.ts` | `getSkillByIdAsync(id)` | No |
| `skillModelFallback.ts` | `executeSkillLlmWithFallback(request)` | No |
| `promptComposer.ts` | `composePrompt(input)` | Yes (section-02 enhances it) |
| `skillExecutionPolicy.ts` | `resolveSkillExecutionPolicy(input)` | No |
| `taskPlannerMiddleware.ts` | `runPlanner(input)`, `recordStepAttempt(input)` | No |
| `teamOrchestrationBridge.ts` | `executeAgentTurn(params)` | **REMOVED** (import deleted) |
| `internalSkills.ts` | `TEAM_DISCUSSION_SKILL_ID` | **REMOVED** (import deleted) |

## Fallback Skill ID Constant

Define a module-level constant for the general fallback skill:

```
const GENERAL_FALLBACK_SKILL_ID = "general-article-writer";
```

This replaces `TEAM_DISCUSSION_SKILL_ID`. The actual skill ID should match an existing skill in the registry. If `general-article-writer` does not exist, use another content-appropriate general skill. The exact ID should be verified against the skill registry at implementation time.

## costCredits Calculation

The `TeamRunSkillExecutionResult.costCredits` field must NOT be hardcoded to `0`. The `executeSkillLlmWithFallback` result already contains the information needed to calculate it.

`executeSkillLlmWithFallback` returns a `SkillLlmFallbackResult` which includes:
- `inputTokens: number`
- `outputTokens: number`
- `modelId: string` (the model that was actually used, after fallback resolution)

Use these to derive `costCredits`:

```typescript
// After executeSkillLlmWithFallback returns:
const fallback = await executeSkillLlmWithFallback(request);

// Derive credit cost from actual token usage and model used
const { estimateCreditCost } = await import("./creditService");
const costCredits = estimateCreditCost({
  modelId: fallback.modelId,
  inputTokens: fallback.inputTokens,
  outputTokens: fallback.outputTokens,
});
```

If `estimateCreditCost` is not already exported from `creditService.ts`, check `skillModelFallback.ts` -- it may already compute credits internally and expose them on the result object. Inspect the actual `SkillLlmFallbackResult` type before implementing: if it already has a `costCredits` field, use it directly. If not, derive it from `inputTokens + outputTokens` using the model pricing map.

**Under no circumstances should `costCredits: 0` be hardcoded.** This causes `runEngine.ts` to accumulate zero budget usage, breaking the per-run credit limit enforcement.

### Test for costCredits

Add to the executor test suite:

```typescript
it("should calculate costCredits from executeSkillLlmWithFallback result (not hardcoded 0)")
// Mock executeSkillLlmWithFallback to return { inputTokens: 500, outputTokens: 300, modelId: "gpt-4o" }
// Assert: result.costCredits > 0
// Assert: result.costCredits is computed (not literally 0)
```

## nextSpeakerHint in Result

The `TeamRunSkillExecutionResult` interface should include `nextSpeakerHint?: string` to allow the LLM response to signal which agent should speak next in the turn order.

### Interface Addition

```typescript
export interface TeamRunSkillExecutionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  costCredits: number;
  metadata: Record<string, unknown>;
  skillId: string;
  nextSpeakerHint?: string;  // NEW: parsed from LLM response metadata
}
```

### Parsing Logic

After `executeSkillLlmWithFallback` returns, check the response for a speaker hint. The LLM may embed a hint in:
1. The `metadata` field of the fallback result (if the model supports structured output)
2. The response content itself, via a pattern like `[NEXT: AgentName]` at the end

Implement a lightweight parser:

```typescript
function parseNextSpeakerHint(content: string): string | undefined {
  const match = content.match(/\[NEXT:\s*([^\]]+)\]/i);
  return match ? match[1].trim() : undefined;
}
```

Strip the `[NEXT: ...]` marker from the returned `content` before including it in the result -- it is metadata, not part of the agent's actual message.

Include the hint in `metadata` as well for observability:

```typescript
return {
  content: contentWithoutHint,
  inputTokens: fallback.inputTokens,
  outputTokens: fallback.outputTokens,
  costCredits,
  metadata: { selectedSkillId: skill.id, route: "skill", nextSpeakerHint },
  skillId: skill.id,
  nextSpeakerHint,
};
```

### Test for nextSpeakerHint

```typescript
it("should parse nextSpeakerHint from LLM response content")
// Mock executeSkillLlmWithFallback to return content: "Great analysis. [NEXT: Content Director]"
// Assert: result.nextSpeakerHint === "Content Director"
// Assert: result.content does NOT contain "[NEXT: Content Director]"

it("should return undefined nextSpeakerHint when no hint in content")
// Mock executeSkillLlmWithFallback to return content: "Great analysis."
// Assert: result.nextSpeakerHint === undefined
```

## Verification Checklist

1. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/services/__tests__/teamRunSkillExecutor.test.ts`
2. Run type check: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`
3. Verify no remaining imports of `teamOrchestrationBridge` in this file
4. Verify no remaining references to `TEAM_DISCUSSION_SKILL_ID` in this file
5. Verify no remaining references to `formatPromptMessagesForAgent` in this file
6. Verify `executeSkillLlmWithFallback` receives an array of `{role, content}` objects (not a string)
7. Verify `costCredits` is derived from `fallback.inputTokens` + `fallback.outputTokens` + model pricing (not hardcoded `0`)
8. Verify `nextSpeakerHint` is parsed from response content and stripped from returned `content`
9. Run existing related tests to check for regressions: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/services/__tests__/runEngine.test.ts`

## Implementation Notes (Actual)

### Files Modified
- `apps/web/server/services/teamRunSkillExecutor.ts` — Full refactor: single execution path, removed all Python bridge code
- `apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts` — New test file with 16 tests
- `apps/web/server/routers/teamRun.ts` — Added rate limit to `advance` procedure

### Deviations from Plan
- **Route type**: Kept `"agency"` in the `route` union type for backwards compatibility with `roomIntentRouter.ts` which still returns `"agency"` in some cases. All routes go through the single Node.js LLM path regardless.
- **Regex pattern**: Changed from end-anchored (`$`) to unanchored per code review — matches `[NEXT:]` anywhere in content and strips it.
- **Cost calculation ordering**: Moved `calculateCreditsForLLMDynamic` before `recordStepAttempt` call so planner gets actual cost data instead of `0`.
- **composePrompt**: Added `tenantId` parameter (required by enhanced ComposePromptInput from section-02).

### Test Count
16 tests across 3 describe blocks:
- Main executor behavior (7 tests)
- Skill resolution (3 tests)
- No Python dependency source scans (5 tests + 1 basic check)