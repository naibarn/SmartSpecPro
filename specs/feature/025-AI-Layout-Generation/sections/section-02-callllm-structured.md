Now I have comprehensive understanding. Let me write the section content.

# Section 02: callLLMStructured Utility

## Overview

This section implements a thin wrapper around the existing LLM infrastructure (`executeWithFallback` from `llmRouter.ts`) that adds JSON parsing, Zod validation, and a single retry on parse/validation failure. The wrapper is used by the AI presentation pipeline's Phase 2 (article-to-slide split) and potentially other future structured-output needs.

**New file:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/callLLMStructured.ts`
**Test file:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/callLLMStructured.test.ts`

## Dependencies

- **Section 01 (shared types):** Uses Zod schemas from `shared/presentation/aiTypes.ts` (e.g., `AIPresentationSlideSchema`) as the `zodSchema` parameter in tests and downstream usage. However, `callLLMStructured` itself is generic -- it accepts any `z.ZodType<T>`.
- **Existing codebase:** `executeWithFallback` from `server/services/llmRouter.ts`, `deductCreditsForModel` from `server/services/creditService.ts`, `auditLogger` from `server/services/auditLogger.ts`.

## Background: Existing LLM Call Infrastructure

The codebase has two LLM invocation layers:

1. **`invokeLLM()`** in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/llm.ts` -- A low-level fetch wrapper that calls a single hardcoded API endpoint. It does NOT handle provider resolution, fallback, credit tracking, or audit logging.

2. **`executeWithFallback()`** in `/home/dev/projects/SmartSpecPro/apps/web/server/services/llmRouter.ts` -- The production-grade function that resolves providers from the database, tries fallback providers on failure, records health metrics, logs requests to the audit trail, and handles cost calculation. This is what the chat router and skills system use.

`callLLMStructured` must wrap **`executeWithFallback()`**, not the low-level `invokeLLM()`, because it needs provider resolution, fallback, audit logging, and cost tracking. Credit deduction is handled separately after `executeWithFallback` returns (following the same pattern as `handleChatWithRouter` in `llmRoutesHandler.ts`).

### Key types from `llmRouter.ts`:

```typescript
type ExecuteResult =
  | { type: "success"; response: any; providerId: number; providerName: string }
  | { type: "fallback_required"; from: ProviderCandidate; to: ProviderCandidate; estimatedCredits: number }
  | { type: "error"; error: string; statusCode: number };
```

The `response` in the success case follows the OpenAI chat completion format:
```typescript
{
  choices: [{ message: { content: string } }],
  usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number }
}
```

## Tests First

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/callLLMStructured.test.ts`

The test file mocks `executeWithFallback` from `llmRouter.ts` and `deductCreditsForModel` from `creditService.ts`. It uses `vi.hoisted()` + `vi.mock()` following the project's established pattern (see `llmRouter.test.ts` for reference).

### Test stubs:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const { mockExecuteWithFallback, mockDeductCreditsForModel } = vi.hoisted(() => ({
  mockExecuteWithFallback: vi.fn(),
  mockDeductCreditsForModel: vi.fn(),
}));

vi.mock("../llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
}));

vi.mock("../creditService", () => ({
  deductCreditsForModel: mockDeductCreditsForModel,
}));

vi.mock("../auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

import { callLLMStructured } from "../callLLMStructured";

// A simple Zod schema for testing
const TestSchema = z.object({
  title: z.string(),
  items: z.array(z.string()),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockDeductCreditsForModel.mockResolvedValue({ creditsUsed: 5, wasFree: false });
});

// --- Helpers ---

function makeSuccessResponse(content: string) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    },
    providerId: 1,
    providerName: "test-provider",
  };
}

describe("callLLMStructured", () => {
  it("returns parsed data when LLM returns valid JSON matching Zod schema", async () => {
    // Mock executeWithFallback to return valid JSON
    // Verify the returned data matches TestSchema parse
    // Verify tokensUsed and creditsUsed are extracted
  });

  it("extracts tokensUsed and creditsUsed from response metadata", async () => {
    // Mock specific token counts
    // Verify the returned tokensUsed equals prompt_tokens + completion_tokens
    // Verify creditsUsed comes from deductCreditsForModel return value
  });

  it("retries once when first response is invalid JSON, succeeds on retry", async () => {
    // First call returns non-JSON text
    // Second call returns valid JSON
    // Verify executeWithFallback called exactly 2 times
    // Verify the retry includes the original error in context
  });

  it("retries once when first response fails Zod validation, succeeds on retry", async () => {
    // First call returns valid JSON but wrong shape (missing required field)
    // Second call returns correct JSON
    // Verify executeWithFallback called exactly 2 times
  });

  it("throws after retry when both attempts return invalid JSON", async () => {
    // Both calls return non-JSON
    // Verify it throws with a descriptive error
    // Verify executeWithFallback called exactly 2 times (not more)
  });

  it("throws after retry when both attempts fail Zod validation", async () => {
    // Both calls return valid JSON but wrong shape
    // Verify it throws with Zod validation error details
  });

  it("passes systemPrompt with JSON instructions appended to messages", async () => {
    // Verify the messages array sent to executeWithFallback
    // System message should contain the original systemPrompt + JSON formatting instructions
  });

  it("passes userId and tenantId to executeWithFallback", async () => {
    // Verify executeWithFallback is called with correct userId
    // tenantId is not used by executeWithFallback directly, but documented for future use
  });

  it("uses default model when model param is omitted", async () => {
    // Call without model parameter
    // Verify executeWithFallback receives default model string
  });

  it("propagates executeWithFallback errors without wrapping", async () => {
    // Mock executeWithFallback to return type:"error"
    // Verify callLLMStructured throws the same error
  });

  it("handles maxRetries=0 to disable retry", async () => {
    // Call with maxRetries=0 and invalid JSON response
    // Verify only 1 call to executeWithFallback
    // Verify it throws immediately
  });
});
```

### Test count: 10 tests

The tests verify:
- Happy path: valid JSON matching schema returns parsed data
- Metadata extraction: tokens and credits correctly extracted
- Retry on invalid JSON: retries once, succeeds on second attempt
- Retry on Zod failure: retries once, succeeds on second attempt
- Exhausted retries (invalid JSON): throws after max retries
- Exhausted retries (Zod failure): throws with validation details
- System prompt augmentation: JSON instructions appended
- Parameter forwarding: userId passed through
- Default model: fallback model used when omitted
- Error propagation: provider/network errors pass through unchanged

## Implementation Details

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/callLLMStructured.ts`

### Function signature

```typescript
import { z } from "zod";

export interface CallLLMStructuredParams<T> {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  zodSchema: z.ZodType<T>;
  maxRetries?: number;  // default 1
  userId: number;
  tenantId: string;
}

export interface CallLLMStructuredResult<T> {
  data: T;
  tokensUsed: number;
  creditsUsed: number;
}

export async function callLLMStructured<T>(
  params: CallLLMStructuredParams<T>
): Promise<CallLLMStructuredResult<T>>
```

### Implementation approach

The function follows this logic:

1. **Build the augmented system prompt.** Append JSON formatting instructions to the provided `systemPrompt`. The instructions should tell the LLM to respond with ONLY a JSON object (no markdown fences, no prose) and describe the expected schema shape derived from the Zod schema. Use `zodToJsonSchema` or a manual description string based on the schema. A simple approach is to include the text:

   ```
   You MUST respond with ONLY a valid JSON object. No markdown code fences, no explanatory text.
   The JSON must conform to this structure: <schema description>
   ```

2. **Build the messages array.** Construct:
   ```typescript
   const messages = [
     { role: "system", content: augmentedSystemPrompt },
     { role: "user", content: params.userMessage },
   ];
   ```

3. **Call `executeWithFallback()`** with:
   ```typescript
   {
     model: params.model ?? "claude-sonnet-4-6",
     messages,
     stream: false,
     userId: params.userId,
   }
   ```
   The `stream: false` is critical -- structured output requires the full response, not streaming.

4. **Handle the `ExecuteResult`.**
   - If `type === "error"`: throw an error with the error message and status code. Do not retry provider/network errors.
   - If `type === "fallback_required"`: throw an error (the AI pipeline does not handle interactive fallback consent).
   - If `type === "success"`: proceed to parse the response content.

5. **Extract text content** from `result.response.choices[0].message.content`. Strip any markdown code fences (` ```json ... ``` `) the LLM might include despite instructions.

6. **Parse JSON** via `JSON.parse()`. If this throws a `SyntaxError`, this counts as a parse failure.

7. **Validate against Zod schema** via `params.zodSchema.safeParse(parsed)`. If `success === false`, this counts as a validation failure.

8. **On parse/validation failure** (and retries remaining):
   - Build a retry user message that includes: the original user message, the raw LLM response, and the specific error (JSON syntax error or Zod validation issues).
   - Call `executeWithFallback()` again with the augmented retry message.
   - Parse and validate again.
   - If retry also fails: throw a typed error (see error handling below).

9. **Deduct credits** by calling `deductCreditsForModel()` with the token usage from the response. This follows the same pattern as `handleChatWithRouter` in `/home/dev/projects/SmartSpecPro/apps/web/server/services/llmRoutesHandler.ts`. Sum credits from all attempts (initial + retry).

10. **Return** `{ data, tokensUsed, creditsUsed }` where:
    - `data` is the Zod-validated parsed object (type `T`)
    - `tokensUsed` is the sum of `prompt_tokens + completion_tokens` across all attempts
    - `creditsUsed` is the sum from all `deductCreditsForModel` calls

### Error handling

Define a custom error class for structured output failures:

```typescript
export class LLMStructuredOutputError extends Error {
  constructor(
    message: string,
    public readonly rawResponse: string,
    public readonly zodErrors?: z.ZodError,
  ) {
    super(message);
    this.name = "LLMStructuredOutputError";
  }
}
```

Error scenarios:
- **Provider/network error** from `executeWithFallback`: Propagate unchanged (do NOT catch and re-throw as `LLMStructuredOutputError`). The orchestrator (Section 06) handles these.
- **JSON parse failure after all retries**: Throw `LLMStructuredOutputError` with the raw response text and a message like `"LLM returned invalid JSON after N attempts"`.
- **Zod validation failure after all retries**: Throw `LLMStructuredOutputError` with the raw response text and the `ZodError` for detailed field-level error info.

### Stripping markdown fences

LLMs sometimes wrap JSON in markdown code fences despite instructions. The implementation should strip these before parsing:

```typescript
function stripMarkdownFences(text: string): string {
  // Remove ```json ... ``` or ``` ... ``` wrapping
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  return fenced ? fenced[1].trim() : text.trim();
}
```

### Default model

When `model` is omitted, use `"claude-sonnet-4-6"` as the default. This is the model specified in the plan for Phase 2 calls. The model string is passed to `executeWithFallback` which resolves it through the provider routing system.

### What this function does NOT do

- **Provider resolution** -- handled by `executeWithFallback`
- **Credit pre-check** -- handled by the orchestrator (Section 06) before the pipeline starts
- **Audit logging** -- handled by `executeWithFallback` internally (it calls `auditLogger.log` and `logRequest`)
- **Streaming** -- always uses `stream: false`
- **Tool calls / function calling** -- not used; structured output is via system prompt instructions + JSON parse
- **Fallback consent** -- if `executeWithFallback` returns `fallback_required`, the function throws (the AI pipeline does not support interactive provider selection)

### Integration with the orchestrator (Section 06)

The orchestrator calls `callLLMStructured` in Phase 2:

```typescript
// Phase 2 example usage (in aiPresentationService.ts, Section 06)
const splitResult = await callLLMStructured({
  systemPrompt: SLIDE_SPLIT_SYSTEM_PROMPT,
  userMessage: articleText,
  zodSchema: z.array(AIPresentationSlideSchema),
  userId: actor.userId,
  tenantId: actor.tenantId,
});
const slides = splitResult.data; // AIPresentationSlide[]
```

## File Structure Summary

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/callLLMStructured.ts` | CREATE | New utility: `callLLMStructured<T>()` function, `LLMStructuredOutputError` class, `stripMarkdownFences` helper |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/callLLMStructured.test.ts` | CREATE | 13 test cases covering happy path, retry, error propagation, parameter forwarding, fence stripping, credits on error |

## Implementation Checklist (COMPLETED)

All steps completed. 13 tests pass.

### Code Review Deviations from Plan
- `LLMStructuredOutputError` now includes `tokensUsed` and `creditsUsed` optional properties for orchestrator visibility on failures
- `costUsd` extracted from `response.usage.cost` and forwarded to `deductCreditsForModel` for more accurate billing
- Raw LLM response in retry prompts truncated to 500 chars to mitigate prompt injection risk
- Added tests: markdown fence stripping, credits-on-error attachment
- Total: 13 tests (was 10 in plan)