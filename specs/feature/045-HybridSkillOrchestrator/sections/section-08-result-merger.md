Now I have all the context needed. Let me produce the section content.

# Section 8: Result Merger

## Overview

This section implements `skillResultMerger.ts`, a service that combines outputs from multiple skill executions (COMPOUND pipelines, COMPLEX agent loops) into a unified `OrchestrationResult`. For SIMPLE single-skill results, the merger passes through unchanged. For multi-skill results, it applies merge strategies based on output type combinations (text+text, text+images, mixed media) and aggregates metadata (credits, timing).

**File to create:** `apps/web/server/services/skillResultMerger.ts`
**Test file to create:** `apps/web/server/services/__tests__/skillResultMerger.test.ts`

## Dependencies

- **Section 01 (types-config):** Uses `OrchestrationResult`, `OrchestrationLevel` types from `apps/web/shared/orchestration/types.ts`
- **Section 05 (orchestrator-main):** Called by the orchestrator after pipeline engine or agent loop completes
- **Section 06 (pipeline-engine):** Receives `PipelineResult` step outputs as input
- **Section 07 (agent-loop):** Receives agent loop collected results as input

The merger also makes an LLM call for text combination, using the existing `llmRouter.ts` service and `taskExecutionPlanner` for model selection.

## Tests FIRST

Create `apps/web/server/services/__tests__/skillResultMerger.test.ts` with the following test structure. All LLM calls should be mocked.

### Test File Structure

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM router before importing the module under test
vi.mock("../../services/llmRouter", () => ({
  getProviderForModel: vi.fn(),
}));
vi.mock("../../services/taskPlannerMiddleware", () => ({
  runPlanner: vi.fn(),
}));

import { mergeResults } from "../skillResultMerger";
```

### Test Cases

**describe("mergeResults")**

1. **"passes through single SIMPLE result unchanged"**
   - Input: array with one result containing text content
   - Expected: the `OrchestrationResult.sections` has exactly one entry, `summary` equals the single result's content, `totalCreditsUsed` and `totalDurationMs` match the single result's values
   - No LLM call should be made

2. **"combines multiple text results into structured document"**
   - Input: two results both containing text content (e.g., article text + translation text)
   - Mock LLM to return a combined document with section headers
   - Expected: `summary` contains the LLM-merged text, `sections` array preserves both individual results, LLM was called once

3. **"combines text + image URLs with inline placement"**
   - Input: one result with text content, one result with image URLs array
   - Expected: `summary` contains the text content, `sections` preserves both, image URLs appear in a dedicated section or inline. No LLM call needed for this simple case (text is used as-is, images appended)

4. **"combines text + video URL (text first, media after)"**
   - Input: one text result, one result with a video URL
   - Expected: `sections[0]` is the text section, `sections[1]` is the video section, ordering is preserved

5. **"combines multiple image URLs into gallery format"**
   - Input: two results each with image URLs
   - Expected: all image URLs collected into a single gallery-style section, `summary` is null or minimal

6. **"preserves individual section metadata (creditsUsed, durationMs per skill)"**
   - Input: two results with different `creditsUsed` and `durationMs` values
   - Expected: each entry in `sections` retains its own `creditsUsed` and `durationMs`

7. **"calculates correct totalCreditsUsed and totalDurationMs"**
   - Input: three results with credits [2, 3, 5] and durations [100, 200, 300]
   - Expected: `totalCreditsUsed === 10`, `totalDurationMs` is the max of individual durations (parallel) or sum (sequential) depending on strategy. For the default case, use sum: `600`

### Mock Data Helpers

Define helper functions at the top of the test file to create mock skill result objects:

- `makeTextResult(content, credits, durationMs)` -- returns a result object with `type: "text"`, `content`, `creditsUsed`, `durationMs`
- `makeImageResult(urls, credits, durationMs)` -- returns a result object with `type: "image"`, `urls` array, `creditsUsed`, `durationMs`
- `makeVideoResult(url, credits, durationMs)` -- returns a result object with `type: "video"`, `urls: [url]`, `creditsUsed`, `durationMs`

## Implementation Details

### File: `apps/web/server/services/skillResultMerger.ts`

#### Input Type

The merger receives an array of individual skill execution results. Each result should conform to a `SkillStepResult` interface:

```typescript
interface SkillStepResult {
  skillId: string;
  type: "text" | "image" | "video" | "audio" | "structured_json";
  content?: string;       // text content (markdown)
  urls?: string[];         // media URLs
  metadata?: Record<string, unknown>;
  creditsUsed: number;
  durationMs: number;
}
```

#### Main Function Signature

```typescript
export async function mergeResults(
  results: SkillStepResult[],
  originalMessage: string,
  options?: {
    traceId?: string;
    orchestrationLevel?: OrchestrationLevel;
  }
): Promise<OrchestrationResult>
```

#### Merge Logic (Core Algorithm)

The function should follow this decision tree:

1. **Single result (length === 1):** Return immediately. Build an `OrchestrationResult` with one section, set `summary` to the single result's content, copy credits and duration directly. No LLM call.

2. **Multiple results:** Classify the combination of output types and apply the appropriate strategy:

   a. **All text:** Call a helper `combineTextResults(results, originalMessage)` which uses a cheap LLM call to merge multiple text outputs into a structured document with headers and transitions. The LLM prompt should instruct: "Combine these outputs into a coherent document. Preserve all content. Add section headers and transitions. The original user request was: {originalMessage}."

   b. **Text + image URLs:** Use the text content as-is for the summary. Append image URLs as a separate gallery section. No LLM call needed.

   c. **Text + video/audio URL:** Place text section first, media section after. No LLM call needed.

   d. **Multiple image URLs only:** Collect all URLs into a single gallery section. Set summary to a brief description like "Generated {n} images."

   e. **Mixed (text + images + video/audio):** Build structured sections in order: text content first, then image gallery, then video/audio attachments. Use LLM to combine text portions only if there are multiple text results.

#### Metadata Aggregation

For every merge path:

- `totalCreditsUsed`: Sum of all individual `creditsUsed` values
- `totalDurationMs`: Sum of all individual `durationMs` values (represents serial cost; the orchestrator tracks actual wall-clock time separately)
- `traceId`: Pass through from options
- `orchestrationLevel`: Pass through from options
- `sections`: Array preserving each individual result with its own metadata intact

#### LLM Text Combination Helper

```typescript
async function combineTextResults(
  textResults: SkillStepResult[],
  originalMessage: string
): Promise<string>
```

This helper:
1. Uses `taskExecutionPlanner` with `strategy: "cheapest"` to select the model
2. Sends a system prompt explaining the combination task
3. Includes all text contents as numbered sections in the user message
4. Sets `maxTokens` to approximately the sum of input text lengths (capped at 2000)
5. Returns the combined text string

If the LLM call fails, fall back to simple concatenation: join all text contents with `\n\n---\n\n` separators.

#### Output Type Detection Helper

```typescript
function classifyOutputTypes(results: SkillStepResult[]): {
  hasText: boolean;
  hasImages: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
  textResults: SkillStepResult[];
  mediaResults: SkillStepResult[];
}
```

This helper categorizes the results array to determine which merge strategy to apply.

### Error Handling

- If the results array is empty, return an `OrchestrationResult` with empty sections, zero credits, zero duration
- If the LLM text combination call fails, fall back to concatenation (never throw)
- Individual result entries with missing `content` and missing `urls` should be preserved in sections but excluded from merge logic

### Integration Point

The merger is called by the orchestrator (`skillOrchestrator.ts`) after execution completes:

- For SIMPLE: called with a single-element array (pass-through)
- For COMPOUND: called with the `PipelineResult.steps` mapped to `SkillStepResult[]` (only completed steps)
- For COMPLEX: called with the agent loop's collected results array

The orchestrator maps execution results to `SkillStepResult[]` before calling `mergeResults()`. Failed or skipped steps are filtered out before merging.

## Implementation Checklist

1. Create the test file with all 7 test cases and mock helpers
2. Create `skillResultMerger.ts` with the `mergeResults` function
3. Implement `classifyOutputTypes` helper
4. Implement `combineTextResults` LLM helper with fallback
5. Implement metadata aggregation logic
6. Ensure all tests pass with mocked LLM calls
7. Export the function for use by the orchestrator (Section 05)