I now have enough context to write the section. Here is the output:

# Section 11: Frontend Integration

## Overview

This section adds two new React components and a tRPC mutation to the chat interface, enabling the frontend to render multi-skill orchestration results and parameter confirmation forms. It also adds a pipeline progress indicator for COMPOUND orchestrations. All new components live alongside existing chat components and follow the same patterns used by `ScheduleConfirmCard`, `ComparisonPreviewCard`, and the skill execution flow.

## Dependencies

- **Section 01 (Types & Config):** The shared types in `apps/web/shared/orchestration/types.ts` (specifically `OrchestrationResult`, `ClassificationResult`, and related types) must exist before these components can be built.
- **Section 05 (Orchestrator Main):** The `orchestrateSkill()` function and the `chat.confirmOrchestration` tRPC mutation endpoint must exist on the server side.
- **Section 08 (Result Merger):** The merged result shape (`OrchestrationResult.sections`) determines what `OrchestrationResultView` renders.

## Tests First

All test files go in `apps/web/client/src/components/chat/__tests__/`. Use Vitest with `@testing-library/react`.

### File: `apps/web/client/src/components/chat/__tests__/OrchestrationConfirmForm.test.tsx`

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * OrchestrationConfirmForm component tests.
 *
 * Tests:
 * 1. renders pre-filled fields from extractedParams
 * 2. highlights missing required fields (red border / required badge)
 * 3. submits form with merged params via confirmOrchestration mutation
 * 4. "Skip" button executes with defaults only (no user-edited values)
 */

describe("OrchestrationConfirmForm", () => {
  it("renders pre-filled fields from extractedParams", () => {
    // Render component with extractedParams = { topic: "มาม่า", review_angle: "comparison" }
    // Expect input fields to display those values
  });

  it("highlights missing required fields", () => {
    // Render component with missingFields = ["topic"]
    // Expect the "topic" field to have visual emphasis (ring-red or required badge)
  });

  it("submits form with merged params via confirmOrchestration mutation", () => {
    // Render component, fill in a missing field, click Confirm
    // Expect the tRPC mutation to be called with merged params (prefilled + user input)
  });

  it("Skip button executes with defaults only", () => {
    // Render component, click Skip
    // Expect the tRPC mutation to be called with only the pre-filled/default params
  });
});
```

### File: `apps/web/client/src/components/chat/__tests__/OrchestrationResultView.test.tsx`

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * OrchestrationResultView component tests.
 *
 * Tests:
 * 1. renders single-skill result same as current chat message
 * 2. renders multi-skill result with section headers
 * 3. shows collapsible orchestration details footer
 * 4. shows progress indicator for COMPOUND pipelines
 */

describe("OrchestrationResultView", () => {
  it("renders single-skill result same as current chat message", () => {
    // Provide OrchestrationResult with 1 section (text only)
    // Expect markdown content rendered, no section headers
  });

  it("renders multi-skill result with section headers", () => {
    // Provide OrchestrationResult with 2+ sections
    // Expect each section to have a header with skill name and icon
  });

  it("shows collapsible orchestration details footer", () => {
    // Provide OrchestrationResult with orchestrationLevel, totalCreditsUsed, totalDurationMs
    // Expect a collapsible footer showing these details
    // Click to expand → shows per-skill breakdown
  });

  it("shows progress indicator for COMPOUND pipelines", () => {
    // Provide a partial result with pipelineProgress = { completed: 1, total: 3, currentSkill: "image-creator" }
    // Expect a progress bar or step indicator
  });
});
```

## Implementation Details

### New Files to Create

1. **`apps/web/client/src/components/chat/orchestration/OrchestrationConfirmForm.tsx`**
2. **`apps/web/client/src/components/chat/orchestration/OrchestrationResultView.tsx`**
3. **`apps/web/client/src/components/chat/orchestration/PipelineProgressIndicator.tsx`**
4. **`apps/web/client/src/components/chat/orchestration/index.ts`** (barrel export)

### Files to Modify

1. **`apps/web/client/src/components/chat/ChatView.tsx`** -- add rendering logic for `orchestration_result` and `orchestration_confirm` message types
2. **`apps/web/server/routers/chat.ts`** -- add `confirmOrchestration` mutation

---

### 1. OrchestrationConfirmForm Component

**File:** `apps/web/client/src/components/chat/orchestration/OrchestrationConfirmForm.tsx`

This component renders an inline parameter confirmation form within the chat, following the same card pattern as `ScheduleConfirmCard`. It is rendered when the orchestrator returns a response of type `"orchestration_confirm"`.

**Props interface:**

```typescript
interface OrchestrationConfirmFormProps {
  skillId: string;
  skillName: string;
  prefilledParams: Record<string, unknown>;
  missingFields: string[];
  /**
   * Server-side projection of the skill's input.schema.json — safe to send to
   * the client.  The raw JSON Schema object is NEVER sent to the client;
   * doing so would disclose internal skill structure (field names, validation
   * rules, enum lists) that the client has no need to know about in full.
   *
   * The server computes this array from `loadInputSchema()` and includes only
   * the fields required to render the confirmation form.
   */
  formFields: Array<{
    name: string;
    label: string;       // from schema property "title" (or "name" if absent)
    type: "text" | "number" | "select" | "boolean";
    options?: string[];  // from "enum" values — only present when type === "select"
    required: boolean;
    defaultValue?: unknown;
  }>;
  conversationId: number;
  traceId: string;
  onConfirmed: () => void;
  onSkipped: () => void;
}
```

**Server-side `formFields` projection (in `chat.ts` router / orchestrator confirm path):**

The server builds `formFields` from the raw schema before including it in the confirm response:

```typescript
// Pseudocode — runs server-side, never on the client
function projectSchemaToFormFields(schema: InputSchema): FormField[] {
  return Object.entries(schema.properties ?? {}).map(([name, prop]) => ({
    name,
    label: prop.title ?? name,
    type: prop.enum ? "select"
        : prop.type === "boolean" ? "boolean"
        : prop.type === "number" || prop.type === "integer" ? "number"
        : "text",
    options: prop.enum as string[] | undefined,
    required: (schema.required ?? []).includes(name),
    defaultValue: prop.default,
  }));
}
```

**Behavior:**

- Renders a card with the skill name as header and a small icon.
- For each entry in `formFields`:
  - If the field's `name` is in `prefilledParams`, render it as a pre-filled input (editable).
  - If the field's `name` is in `missingFields`, render it with a red ring and "Required" badge.
  - If `field.type === "select"`, render a select dropdown using `field.options`.
  - If `field.type === "boolean"`, render a checkbox.
  - If `field.type === "number"`, render a numeric input.
  - Optional fields (`field.required === false`) not in `missingFields` start collapsed (expandable section).
- **Confirm button:** Calls the `chat.confirmOrchestration` tRPC mutation with the merged params (prefilled values overridden by any user edits). Disables while loading.
- **Skip button:** Calls the same mutation but sends only the `prefilledParams` as-is (no user edits, signaling "use defaults").
- Uses existing UI primitives: `Button`, `Input`, `Label`, `Badge`, `Select` from `@/components/ui/`.
- Follows the `ScheduleConfirmCard` pattern: local form state via `useState`, mutation via `trpc.chat.confirmOrchestration.useMutation()`.

**Key interaction pattern (data flow):**

1. Server returns `{ type: "orchestration_confirm", skillId, prefilledParams, missingFields, formFields, traceId }` as part of the chat response. The server computes `formFields` via `projectSchemaToFormFields()` — the raw `input.schema.json` is never sent to the client.
2. `ChatView.tsx` detects this type and renders `<OrchestrationConfirmForm>`.
3. User fills/edits fields, clicks Confirm.
4. `confirmOrchestration` mutation sends `{ skillId, params, traceId, conversationId }` to server.
5. Server orchestrator receives confirmed params, skips classifier, executes skill directly.
6. Response comes back as a normal `orchestration_result` message.

---

### 2. OrchestrationResultView Component

**File:** `apps/web/client/src/components/chat/orchestration/OrchestrationResultView.tsx`

This component renders the result of a multi-skill orchestration within the chat message area. It handles both single-skill and multi-skill results.

**Props interface:**

```typescript
interface OrchestrationResultViewProps {
  result: {
    sections: Array<{
      skillId: string;
      skillName: string;
      type: "text" | "image" | "video" | "audio";
      content?: string;         // markdown text
      urls?: string[];           // media URLs
      creditsUsed: number;
      durationMs: number;
    }>;
    summary?: string;
    totalCreditsUsed: number;
    totalDurationMs: number;
    orchestrationLevel: "simple" | "compound" | "complex";
    traceId: string;
  };
  pipelineProgress?: {
    completed: number;
    total: number;
    currentSkill?: string;
  };
}
```

**Rendering logic:**

- **Single section (SIMPLE):** Render identically to the current chat message format. Text content via `SafeMarkdown`, images as inline markdown images, video/audio as media links. No section headers -- keeps the UI identical to the existing experience.
- **Multiple sections (COMPOUND/COMPLEX):** Render each section with:
  - A small header showing the skill icon (from `skillIconMap` already in `ChatView.tsx`) and skill name.
  - Text sections rendered with `SafeMarkdown`.
  - Image sections rendered as a gallery (array of `<img>` elements with lightbox support via existing `ImageLightbox`).
  - Video/audio sections rendered as media player links.
- **Summary:** If `result.summary` is present (from the merger), render it at the top as a brief overview before the individual sections.
- **Collapsible details footer:** A small `ChevronDown` toggle at the bottom of the result. When expanded, shows:
  - Orchestration level badge (`SIMPLE`, `COMPOUND`, `COMPLEX`).
  - Total credits used.
  - Total duration.
  - Per-skill breakdown table (skill name, credits, duration).
  - Trace ID (small monospace text for debugging).

**Existing component reuse:**
- `SafeMarkdown` (from `apps/web/client/src/components/chat/SafeMarkdown.tsx`) for text rendering.
- `ImageLightbox` (from `apps/web/client/src/components/chat/media/ImageLightbox.tsx`) for image galleries.
- `Badge` for status/level display.
- `Collapsible` from Radix UI for the details footer.

---

### 3. PipelineProgressIndicator Component

**File:** `apps/web/client/src/components/chat/orchestration/PipelineProgressIndicator.tsx`

A small progress indicator shown during COMPOUND pipeline execution, similar to how `GenerationProgress` works for media generation tasks.

**Props interface:**

```typescript
interface PipelineProgressIndicatorProps {
  completed: number;
  total: number;
  currentSkill?: string;
  steps?: Array<{
    skillId: string;
    skillName: string;
    status: "pending" | "running" | "completed" | "failed" | "skipped";
  }>;
}
```

**Rendering:**
- A horizontal step indicator showing dots or small circles for each pipeline step.
- Completed steps show a check icon (green).
- Running step shows a spinner/pulse animation.
- Failed steps show an X icon (red).
- Pending steps show a gray dot.
- Below the dots, a text line: "Running {currentSkill}... ({completed}/{total})".
- Uses Tailwind animations (`animate-pulse`) for the running state.

---

### 4. ChatView.tsx Modifications

**File:** `apps/web/client/src/components/chat/ChatView.tsx`

Add handling for two new message response types within the message rendering logic.

**Import additions** (at the top of the file):

```typescript
import {
  OrchestrationConfirmForm,
  OrchestrationResultView,
  PipelineProgressIndicator,
} from "./orchestration";
```

**Message rendering additions** (within the message loop, near where `ScheduleConfirmCard` and `ComparisonPreviewCard` are rendered, around line 2510-2530):

For messages that contain orchestration data, add conditional rendering:

- If the message has `orchestrationConfirm` data (type `orchestration_confirm`):
  ```
  Render <OrchestrationConfirmForm> with the confirm data, passing onConfirmed
  and onSkipped callbacks that invalidate the messages query and update local state.
  ```

- If the message has `orchestrationResult` data (type `orchestration_result`):
  ```
  Render <OrchestrationResultView> with the result data. If the result has
  multiple sections, use this component instead of the standard SafeMarkdown
  rendering.
  ```

- If there is an active pipeline in progress (tracked via local state):
  ```
  Render <PipelineProgressIndicator> as a temporary message bubble at the
  bottom of the chat, updated as skills complete.
  ```

**Detection logic:** The orchestrator response should include a field like `orchestrationType` on the message object. Check for it in the rendering logic:

```typescript
// Pseudocode within the message rendering loop
if (m.orchestrationConfirm) {
  return <OrchestrationConfirmForm {...m.orchestrationConfirm} />;
}
if (m.orchestrationResult && m.orchestrationResult.sections.length > 1) {
  return <OrchestrationResultView result={m.orchestrationResult} />;
}
// Otherwise fall through to existing SafeMarkdown rendering
```

**Pipeline progress state:** Add a `useState` for tracking active pipeline progress. This can be updated via polling or SSE events from the server. Pattern to follow: the existing `pendingPresentationTask` state and its polling via `trpc.chat.getSkillTaskResult.useQuery`.

---

### 5. confirmOrchestration tRPC Mutation

**File:** `apps/web/server/routers/chat.ts`

Add a new mutation to the chat router.

**Mutation definition:**

```typescript
confirmOrchestration: protectedProcedure
  .input(
    z.object({
      conversationId: z.number(),
      skillId: z.string(),
      params: z.record(z.unknown()),
      traceId: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    // 1. Verify conversation ownership (same pattern as sendMessage)
    // 2. Call orchestrateSkill() with confirmed params, skipping classifier
    //    - Pass the traceId for audit correlation
    //    - Pass params directly as extracted params (no re-extraction needed)
    // 3. Return the OrchestrationResult
  })
```

This mutation is called by `OrchestrationConfirmForm` after the user confirms or skips the parameter form. The server-side orchestrator recognizes confirmed params and bypasses the classification and extraction stages, routing directly to skill execution.

**Input validation:** The `params` field uses `z.record(z.unknown())` with the following refinements (Fix 3 — params size limit):

```typescript
params: z.record(z.unknown())
  .refine(
    v => JSON.stringify(v).length < 50_000,
    "Params payload too large (max 50 KB)"
  )
  .refine(
    v => maxNestingDepth(v) <= 3,
    "Params nesting depth exceeds limit of 3"
  ),
```

Where `maxNestingDepth` is a small helper that recursively computes the depth of a plain object (returns 0 for primitives). Server-side schema validation against the skill's `input.schema.json` happens inside the orchestrator (Section 04 / Section 05).

`maxNestingDepth` helper (define at the top of `chat.ts` or a shared utility):

```typescript
function maxNestingDepth(value: unknown, current = 0): number {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return current;
  const depths = Object.values(value as Record<string, unknown>).map(v =>
    maxNestingDepth(v, current + 1)
  );
  return depths.length > 0 ? Math.max(...depths) : current;
}
```

---

### 6. Messages Table Storage Format

Orchestration results are persisted in the `messages` table alongside regular chat messages. The storage format varies by orchestration level to balance readability with query efficiency.

**Single-skill (SIMPLE):**
Store result in the `content` column as markdown — identical to how non-orchestrated skill results are stored today. No breaking change to existing message rendering.

**Multi-skill (COMPOUND / COMPLEX):**
Store a JSON object in the `content` column with the following shape:

```json
{
  "type": "orchestration_result",
  "orchestrationLevel": "compound",
  "sections": [
    {
      "skillId": "food-grocery-reviewer",
      "skillName": "Food & Grocery Reviewer",
      "type": "text",
      "message": "บทความอาหารไทย...",
      "creditsUsed": 2,
      "durationMs": 1200
    },
    {
      "skillId": "image-creator",
      "skillName": "Image Creator",
      "type": "image",
      "resultUrls": ["https://img.example.com/thai-food.png"],
      "creditsUsed": 3,
      "durationMs": 4500
    }
  ],
  "summary": "บทความอาหารไทยพร้อมภาพประกอบ",
  "totalCreditsUsed": 5,
  "totalDurationMs": 5700,
  "traceId": "abc123"
}
```

**Field naming conventions for section entries:**
- Text content is stored as `message` (not `content`) to avoid collision with the outer `content` column name.
- Media URLs are stored as `resultUrls` (not `urls`) for clarity and consistency with the skill executor output shape.

**Confirmation messages (ephemeral):**
Store as:

```json
{
  "type": "orchestration_confirm",
  "skillId": "food-grocery-reviewer",
  "prefilledParams": { "topic": "มาม่า" },
  "missingFields": ["review_angle"],
  "formFields": [...],
  "traceId": "abc123"
}
```

Confirmation messages are **ephemeral** — they are marked with a boolean column `isEphemeral: true` (or an equivalent flag in the message metadata) and are excluded from conversation history sent to the LLM. The `buildChatContext()` function must filter them out when constructing the messages array for subsequent LLM calls.

**`buildChatContext()` handling for COMPOUND/COMPLEX results:**
When serializing conversation history for LLM context, multi-skill results must be summarized rather than included in full (which would waste tokens). Use the following logic:

```typescript
// Pseudocode in buildChatContext()
if (message.content && isOrchestrationResult(message.content)) {
  const parsed = JSON.parse(message.content);
  // Use the summary field if present; otherwise concatenate section messages,
  // truncated to 500 characters total.
  const contextText = parsed.summary
    ?? parsed.sections
         .map((s: { message?: string; resultUrls?: string[] }) =>
           s.message ?? `[${s.type} result]`
         )
         .join(" ")
         .slice(0, 500);
  return { role: "assistant", content: contextText };
}
```

---

### 7. Message Type Extensions

The existing message type (used by `setMessages` in `ChatView.tsx`) needs to accommodate orchestration data. The messages are currently stored as plain objects with `id`, `role`, `content`, `createdAt`, `skillUsed`, etc.

Add optional fields to the message shape used in local state:

```typescript
// Extend the local message type in ChatView.tsx
interface ChatMessage {
  // ... existing fields ...
  orchestrationResult?: OrchestrationResultViewProps["result"];
  orchestrationConfirm?: Omit<OrchestrationConfirmFormProps, "onConfirmed" | "onSkipped">;
}
```

These fields are populated when the server returns an orchestration response. The `sendMessage` handler in `ChatView.tsx` checks the response type and stores the orchestration data on the message object.

---

### Streaming Considerations for COMPOUND/COMPLEX

For COMPOUND and COMPLEX orchestrations, the response is not streamed token-by-token from a single LLM call. Instead, results arrive skill-by-skill. The recommended approach:

1. The `sendMessage` mutation returns immediately with a `"processing"` status and a `traceId`.
2. The client polls `chat.getOrchestrationProgress({ traceId })` (a new query, or reuse the existing `getSkillTaskResult` pattern) at 2-second intervals.
3. Each poll returns the current pipeline state: which steps are complete, which are running, partial results.
4. When all steps complete, the final merged result is returned.
5. The client renders `PipelineProgressIndicator` during polling and swaps to `OrchestrationResultView` when complete.

This mirrors the existing pattern used for presentation generation (`pendingPresentationTask` polling via `useQuery` with `refetchInterval`).

---

### Barrel Export

**File:** `apps/web/client/src/components/chat/orchestration/index.ts`

```typescript
export { OrchestrationConfirmForm } from "./OrchestrationConfirmForm";
export { OrchestrationResultView } from "./OrchestrationResultView";
export { PipelineProgressIndicator } from "./PipelineProgressIndicator";
```

## Summary of Files

| File | Action |
|------|--------|
| `apps/web/client/src/components/chat/orchestration/OrchestrationConfirmForm.tsx` | Create |
| `apps/web/client/src/components/chat/orchestration/OrchestrationResultView.tsx` | Create |
| `apps/web/client/src/components/chat/orchestration/PipelineProgressIndicator.tsx` | Create |
| `apps/web/client/src/components/chat/orchestration/index.ts` | Create |
| `apps/web/client/src/components/chat/__tests__/OrchestrationConfirmForm.test.tsx` | Create |
| `apps/web/client/src/components/chat/__tests__/OrchestrationResultView.test.tsx` | Create |
| `apps/web/client/src/components/chat/ChatView.tsx` | Modify (add orchestration rendering) |
| `apps/web/server/routers/chat.ts` | Modify (add `confirmOrchestration` mutation) |

## Implementation Checklist

1. Create test files with stubs described above.
2. Create the `orchestration/` directory and barrel export.
3. Implement `OrchestrationConfirmForm` following the `ScheduleConfirmCard` pattern: local form state, tRPC mutation, card-style UI with Radix primitives.
4. Implement `OrchestrationResultView` with conditional rendering for single vs. multi-section results, reusing `SafeMarkdown` and `ImageLightbox`.
5. Implement `PipelineProgressIndicator` as a small step-based progress component.
6. Add `confirmOrchestration` mutation to `apps/web/server/routers/chat.ts`.
7. Modify `ChatView.tsx` to detect and render orchestration message types.
8. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`.