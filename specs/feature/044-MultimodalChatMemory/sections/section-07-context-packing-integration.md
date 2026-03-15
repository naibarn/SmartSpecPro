# Section 07 -- Context Packing Integration

## Overview

This section wires the multimodal memory system into the existing `buildChatContext()` pipeline in `memoryService.ts`. It extends the `ChatContext` interface with two new fields, inserts a new step 4.5 (Visual Memory Assembly) into the context builder, migrates `contextToMessages()` to support multimodal content parts, adds an adaptive budget allocation scheme, and injects image-aware system instructions when visual context is present.

**Dependencies**: section-05 (visualStateService), section-06 (multimodalRetrievalService). Both must be implemented first -- this section consumes their public APIs but does not duplicate their internals.

**Blocks**: section-08 (ingestion hook and credits), which needs the extended `ChatContext` to flow image assets through the chat pipeline.

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/server/services/memoryService.ts` | Extend `ChatContext`, update `buildChatContext()`, update `contextToMessages()`, add `getTextContent()` helper |
| `apps/web/server/services/channelGateway.ts` | Update caller of `buildChatContext` / `contextToMessages` to handle new `MessageContent` union type |
| `apps/web/server/routers/memory.ts` | Update caller of `contextToMessages` to handle new return type |
| `apps/web/server/routers/chat.ts` | Update any direct `.content` access on context messages |

No new files are created in this section.

---

## Tests (Write First)

All tests go in `apps/web/server/services/__tests__/contextPackingIntegration.test.ts`.

```typescript
// apps/web/server/services/__tests__/contextPackingIntegration.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies: DB, Redis, retrieval service, visual state service
// vi.mock(...) for memoryService internals, visualStateService, multimodalRetrievalService

describe("ChatContext interface extension", () => {
  it("includes visualMemoryContext field (string | null)");
  it("includes imageAssets field (array of asset descriptors)");
});

describe("buildChatContext — visual memory assembly (step 4.5)", () => {
  it("returns original budget allocation when no visual context exists");
  it("allocates 15% to visual memory when images exist in conversation visual state");
  it("calls resolveVisualReferences with the current user message");
  it("populates imageAssets for vision-capable models");
  it("populates visualMemoryContext (text descriptions) for text-only models");
  it("adds image-aware system instructions when visual context is present");
  it("does NOT add image instructions when no visual context exists");
  it("respects max 5 image slot budget");
  it("skips visual assembly entirely when feature flag is off");
});

describe("contextToMessages — multimodal type migration", () => {
  it("handles string content unchanged (backward compatible)");
  it("handles ContentPart[] with image_url blocks for vision models");
  it("injects visualMemoryContext as system message before buffer messages");
  it("formats last user message as content parts array when imageAssets is non-empty");
  it("returns string content for all messages when no images are present");
});

describe("getTextContent helper", () => {
  it("returns string directly when content is a string");
  it("extracts text parts from ContentPart[] and joins them");
  it("returns empty string when content parts array has no text entries");
  it("handles mixed text and image_url parts correctly");
});

describe("adaptive budget allocation", () => {
  it("uses 40/60 entity/summary split when no images in scope");
  it("uses 20/15/25/40 entity/visual/summary/buffer split when images exist");
  it("never degrades non-visual conversations");
});
```

---

## Implementation Details

### 1. Extend the `ChatContext` Interface

In `apps/web/server/services/memoryService.ts` at approximately line 658, add two new fields to the existing interface:

```typescript
export interface ChatContext {
  systemPrompt?: string;
  entityContext: string | null;
  summaryContext: string | null;
  bufferMessages: Array<{ role: "user" | "assistant" | "system"; content: MessageContent }>;
  totalTokenEstimate: number;
  // NEW — section 07
  visualMemoryContext: string | null;
  imageAssets: Array<{
    assetId: number;
    fileUrl: string;   // signed URL (1h expiry)
    caption?: string;
    role: "memory" | "current";
  }>;
}
```

The `bufferMessages.content` type changes from `string` to `MessageContent` (see type definition below). This is the breaking change that must be carefully migrated across all callers.

### 2. Define the `MessageContent` Type

Add a new type alias near the top of `memoryService.ts` (or in a shared types file if preferred):

```typescript
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type MessageContent = string | ContentPart[];
```

This union matches the OpenAI multimodal message format, which is already the standard for vision-capable models (GPT-4o, Gemini, Claude).

### 3. Add the `getTextContent()` Helper

This utility extracts plain text from either format. It is needed by every caller that previously assumed `content` was a `string`.

```typescript
/**
 * Extract text from a MessageContent value.
 * - If string, returns it directly.
 * - If ContentPart[], joins all text parts with spaces.
 */
export function getTextContent(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}
```

### 4. Insert Step 4.5 in `buildChatContext()`

Between the existing step 4 (buffer messages, around line 828) and the return statement (line 830), insert the Visual Memory Assembly step.

**Pseudocode for step 4.5**:

1. Check whether the `MULTIMODAL_MEMORY_ENABLED` feature flag is active for the current tenant. If not, set `visualMemoryContext = null` and `imageAssets = []` and skip all visual work.

2. Import `visualStateService` (section-05) and call `getOrCreateState(conversationId)` to check whether the conversation has any images in scope. This is the boolean check that drives adaptive budgets.

3. If images exist in the visual state AND `options?.currentUserMessage` is provided:
   - Import `multimodalRetrievalService` (section-06) and call `resolveVisualReferences(currentUserMessage, conversationId, userId, tenantId)`.
   - If references resolved, call `retrieveRelevantAssets(query, scope)` to get the ranked asset list.
   - Call `buildImageContext(resolvedAssets, modelCapabilities, remainingBudget)` to produce either image URLs or text descriptions.

4. Determine model capabilities. The `options` parameter should accept an optional `modelCapabilities?: { supportsVision: boolean }` field. When the model supports vision, populate `imageAssets` with signed URLs (max 5). When text-only, populate `visualMemoryContext` with text descriptions from the analysis data.

5. If visual context is present, append image-aware system instructions to the system prompt (see section 5 below).

**Key points**:
- The visual assembly is entirely opt-in. If there are no images, no retrieval calls, no LLM calls, no budget changes -- the function returns exactly the same result as before.
- All retrieval service calls are wrapped in try/catch. Failures in visual memory must never block the chat pipeline. Log and continue with `visualMemoryContext = null`, `imageAssets = []`.
- The `resolveVisualReferences` call may itself make an LLM call (Gemini Flash). This latency is acceptable because it happens only when image-related keywords are detected in the user message (the keyword pre-filter from section-06 short-circuits quickly).

### 5. Adaptive Budget Allocation

The budget percentages change based on whether visual context is active:

**No visual context** (original behavior, zero regression):
- Entity context: 40% of budget
- Summary context: 60% of budget
- Buffer messages: fills remaining

**Visual context active** (images in conversation visual state):
- Entity context: 20% of budget
- Visual memory context: 15% of budget
- Summary context: 25% of budget
- Buffer messages: 40% of budget

Implementation approach: Before the existing entity budget calculation (line 755), check a boolean `hasVisualContext` derived from the visual state lookup in step 4.5. Use this boolean to select the percentage constants. The simplest pattern is:

```typescript
const entityPct = hasVisualContext ? 0.20 : 0.40;
const summaryPct = hasVisualContext ? 0.25 : 0.60;
const visualPct = hasVisualContext ? 0.15 : 0;
// Buffer fills remaining
```

Because step 4.5 runs after buffer messages are assembled in the current code, you will need to restructure slightly: move the visual state check earlier (it is a single DB/Redis read), compute the boolean, then use it for all budget calculations. The actual visual assembly (retrieval, LLM calls) still happens after the buffer step.

### 6. Update `contextToMessages()`

The existing function at line 842 returns `Array<{ role; content: string }>`. It must change to return `Array<{ role; content: MessageContent }>`.

Changes:
1. Update the return type to use `MessageContent`.
2. After assembling system parts and buffer messages (existing logic), inject `visualMemoryContext` as a system message if present. Place it after the main system message and before buffer messages.
3. When `imageAssets` is non-empty, transform the **last user message** in the buffer to use content parts format:

```typescript
// Pseudocode for transforming the last user message
if (context.imageAssets.length > 0) {
  const lastUserIdx = result.findLastIndex(m => m.role === "user");
  if (lastUserIdx >= 0) {
    const original = result[lastUserIdx];
    const textContent = getTextContent(original.content);
    const parts: ContentPart[] = [
      { type: "text", text: textContent },
      ...context.imageAssets.map(a => ({
        type: "image_url" as const,
        image_url: { url: a.fileUrl },
      })),
    ];
    result[lastUserIdx] = { role: "user", content: parts };
  }
}
```

### 7. Image-Aware System Instructions

When `visualMemoryContext` is non-null or `imageAssets` is non-empty, append to the system prompt the following instructions:

```
When the user refers to images, use ONLY the provided image references and memory cards.
Do NOT claim to remember images that are not in your current context.
When comparing images, cite specific visual differences from the provided analysis.
When referencing a specific image in your response, use the marker format [image:assetId:NNN] where NNN is the assetId from the provided image context. This enables the UI to render inline image preview chips. Example: "The modern house [image:assetId:42] has a glass facade, while the cabin [image:assetId:55] uses wood panels."
```

These are appended as a separate paragraph in the system message, after entity context and before buffer messages.

**Important**: The `[image:assetId:NNN]` marker format is consumed by Section 11 (Chat UI Gallery) to render inline image chips in assistant messages. Without this instruction, the LLM will not produce markers and the UI chips will never appear. The marker regex used by the frontend is `/\[image:assetId:(\d+)\]/g`.

### 8. Migrate All Callers of `contextToMessages()`

There are three callers that must be updated:

**`apps/web/server/routers/memory.ts` (line 192)**
Currently returns `messages: contextToMessages(context)` in a tRPC response. The response shape changes: `content` is now `MessageContent` instead of `string`. If the tRPC response type is inferred, this flows automatically. If there is an explicit Zod output schema for this procedure, it needs updating to accept the union type.

**`apps/web/server/services/channelGateway.ts` (line 530-540)**
Uses `context as any[]` to pass to `executeWithFallback`. This already bypasses type checking. However, verify that `executeWithFallback` (in `llmRouter.ts` or similar) can handle `MessageContent` unions. Most LLM SDK clients already accept content parts arrays natively.

**`apps/web/server/routers/chat.ts` (line 865)**
Returns `context` directly from `buildChatContext`. The caller must handle the new fields. Since the new fields (`visualMemoryContext`, `imageAssets`) are additive and the existing fields are unchanged, this is backward compatible.

Additionally, any code in `memoryService.ts` itself that reads `.content` as a string (e.g., the `estimateTokens` call on buffer messages at line 824, or summarization functions that concatenate content) must use `getTextContent()`:

```typescript
// Before (line 824)
const cost = estimateTokens(filtered[i].content);

// After
const cost = estimateTokens(getTextContent(filtered[i].content));
```

Search for all `.content` references within `memoryService.ts` and update each one to handle the union via `getTextContent()`.

### 9. Extending `buildChatContext` Options

Add an optional field to the `options` parameter:

```typescript
options?: {
  contextBudget?: number;
  currentUserMessage?: string;
  memoryMode?: "full" | "no_long" | "off";
  projectId?: string;
  tenantId?: string;
  // NEW — section 07
  modelCapabilities?: { supportsVision: boolean };
}
```

This allows the chat router (or any caller) to pass in whether the current model supports vision input, so the context packer can decide between sending image URLs vs text descriptions.

---

## Integration Checklist

1. Write all tests in `contextPackingIntegration.test.ts` (they will fail initially).
2. Add `MessageContent`, `ContentPart` types and `getTextContent()` helper to `memoryService.ts`.
3. Extend `ChatContext` interface with `visualMemoryContext` and `imageAssets`.
4. Update `buildChatContext()` options to accept `modelCapabilities`.
5. Add visual state check early in `buildChatContext()` (import from section-05's `visualStateService`).
6. Implement adaptive budget allocation based on `hasVisualContext` boolean.
7. Add step 4.5 after buffer assembly: resolve references, retrieve assets, build image context (import from section-06's `multimodalRetrievalService`).
8. Append image-aware system instructions when visual context is present.
9. Update `contextToMessages()` return type and inject visual memory / image content parts.
10. Migrate all callers: update `.content` reads to use `getTextContent()` throughout `memoryService.ts`, `memory.ts` router, `channelGateway.ts`, and `chat.ts`.
11. Run tests -- all new tests should pass, all existing `memoryService` tests should remain green (backward compatibility).

---

## Key Design Decisions

- **Adaptive budgets are boolean-gated**: The budget percentages switch based on a single boolean (`hasVisualContext`). There is no sliding scale. This keeps the logic simple and ensures non-visual conversations are never degraded.
- **Image slots are separate from text tokens**: Images count against a slot budget (max 5), not the token budget. This prevents large images from crowding out text context.
- **Failure isolation**: All visual memory code paths are wrapped in try/catch. A failure in the retrieval service, embedding provider, or visual state service causes the function to return the standard text-only context -- never an error.
- **Type migration is union-based**: `MessageContent = string | ContentPart[]` is a union, not a replacement. All existing code that passes `string` continues to work. Only code that reads `.content` needs the `getTextContent()` wrapper.