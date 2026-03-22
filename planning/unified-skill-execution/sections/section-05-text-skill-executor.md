# Section 05 — Text Skill Executor

## Overview

Implements `TextSkillExecutor`, a `CapabilityExecutor` that handles `writing.article` and `writing.review` capability families. It wraps the existing `executeSkillLlmWithFallback()` from `skillModelFallback.ts`, adding model selection priority logic, thinking mode support, and next-speaker hint parsing.

The executor is a pure execution unit. It does NOT handle skill resolution, context building, credit deduction, or message persistence.

**File to create:** `apps/web/server/services/executors/textSkillExecutor.ts`
**Test file:** `apps/web/server/services/__tests__/textSkillExecutor.test.ts`
**Estimated size:** ~120 lines

## Dependencies

| Dependency | Section | What it provides |
|---|---|---|
| `executors/types.ts` | section-01 | `CapabilityExecutor`, `ExecutorInput`, `ExecutorResult`, `CapabilityFamily`, `RouteDecision` |
| `skillModelFallback.ts` | existing | `executeSkillLlmWithFallback()`, `SkillLlmRequest`, `SkillLlmResult` |

## Blocks

- section-06 (orchestrator uses this executor)
- section-02 (registry registers this executor)

## Existing Code Reference

### `executeSkillLlmWithFallback` (from `skillModelFallback.ts`)

```typescript
export async function executeSkillLlmWithFallback(
  request: SkillLlmRequest,
): Promise<SkillLlmResult>;

interface SkillLlmRequest {
  messages: Array<{ role: string; content: string | unknown[] }>;
  skillSlug: string;
  userId: number;
  executionPolicy: SkillExecutionPolicyResult;
  maxTokens?: number;
  temperature?: number;
  extraBodyParams?: Record<string, unknown>;
  stream?: boolean;
  enableThinking?: boolean;
}

interface SkillLlmResult {
  success: boolean;
  content?: string;
  modelId?: string;
  provider?: ProviderCandidate;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  attempts: FallbackAttempt[];
  totalDurationMs: number;
}
```

### `parseNextSpeakerHint` (from `teamRunSkillExecutor.ts`)

```typescript
function parseNextSpeakerHint(content: string): { cleaned: string; hint?: string };
// Extracts [NEXT: <name>] tags from LLM output
```

This function must be duplicated or extracted into the text executor.

## Implementation Guidance

### Class: `TextSkillExecutor`

- `id`: `"text-skill-executor"`
- `capabilities`: `["writing.article", "writing.review"]`
- `canHandle(route)`: Returns `true` if `route.capability` is `"writing.article"` or `"writing.review"`

### `execute()` flow:

1. **Model selection priority**: If `input.dynamicModelOverride` is set (from planner or dynamic requirements), override `executionPolicy.modelId`. Otherwise use policy model as-is.

2. **Determine thinking mode**: Check `input.enableThinking` flag.

3. **Call `executeSkillLlmWithFallback()`** with messages, skillSlug, userId, executionPolicy, extraBodyParams, enableThinking, stream.

4. **Handle failure**: If `result.success === false`, return `ExecutorResult` with `success: false` and the error. Do NOT throw.

5. **Parse next-speaker hint**: Call `parseNextSpeakerHint()` on raw content.

6. **Return `ExecutorResult`**: Cleaned content, token counts, model, attempts, duration, optional nextSpeakerHint.

### Self-Registration

At module level:
```typescript
const textSkillExecutor = new TextSkillExecutor();
registerExecutor(textSkillExecutor);
export { textSkillExecutor };
```

## TDD Expectations

**File:** `apps/web/server/services/__tests__/textSkillExecutor.test.ts`

Mock `executeSkillLlmWithFallback` from `../skillModelFallback` using `vi.mock()`.

```
describe("TextSkillExecutor")

  describe("canHandle")
    # Test: returns true for writing.article capability
    # Test: returns true for writing.review capability
    # Test: returns false for media.image capability

  describe("execute")
    # Test: calls executeSkillLlmWithFallback with provided messages and policy
    # Test: model selection -- dynamicModelOverride overrides policy modelId
    # Test: model selection -- uses policy modelId when no override
    # Test: enables thinking mode when input.enableThinking is true
    # Test: passes extraBodyParams (web search tools) to LLM call
    # Test: parses next-speaker hint from output when present
    # Test: returns content unchanged when no next-speaker hint
    # Test: returns raw content, token counts, model used, fallback attempts
    # Test: handles LLM failure gracefully (returns error result, not throw)
    # Test: multimodal messages passed through correctly

  describe("parseNextSpeakerHint")
    # Test: extracts hint from [NEXT: agent-name] tag
    # Test: case-insensitive match
    # Test: trims whitespace from hint
    # Test: removes tag from content
    # Test: returns original content when no tag present
```

## Verification

```bash
cd apps/web && npx vitest run server/services/__tests__/textSkillExecutor.test.ts
```
