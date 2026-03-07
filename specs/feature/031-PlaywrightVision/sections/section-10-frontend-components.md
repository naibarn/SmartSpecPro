Now I have enough context to write the section. Let me generate the content.

# Section 10: Frontend Components

## Overview

This section covers the three React components that form the Automation Copilot user interface:

1. **AutomationChatModal** -- Chat-style modal for building and monitoring automations (state machine with 7 states)
2. **AutomationPreviewPanel** -- Step list display showing the automation plan before execution
3. **AutomationStepTracker** -- Real-time progress tracker during script generation and execution

All three components live under `apps/web/client/src/components/automation/`. They depend on the tRPC router from section 09 (`automationCopilot` router with `analyze`, `execute`, `getStatus`, and `cancel` procedures) and use existing UI primitives from `@smartspec/ui` (Radix Dialog, Button, Input, etc.).

**Dependencies:** Section 09 (tRPC router and DB schema) must be complete. The tRPC procedures `automationCopilot.analyze`, `automationCopilot.execute`, `automationCopilot.getStatus`, and `automationCopilot.cancel` must be registered and functional.

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/client/src/components/automation/AutomationChatModal.tsx` | Main modal with state machine |
| `apps/web/client/src/components/automation/AutomationPreviewPanel.tsx` | Plan preview before execution |
| `apps/web/client/src/components/automation/AutomationStepTracker.tsx` | Real-time execution progress |
| `apps/web/client/src/components/automation/__tests__/AutomationChatModal.test.tsx` | Tests for chat modal |
| `apps/web/client/src/components/automation/__tests__/AutomationPreviewPanel.test.tsx` | Tests for preview panel |
| `apps/web/client/src/components/automation/__tests__/AutomationStepTracker.test.tsx` | Tests for step tracker |

---

## Tests (Write First)

All tests use Vitest and React Testing Library. The test file path is `apps/web/client/src/components/automation/__tests__/`.

### AutomationChatModal Tests

File: `apps/web/client/src/components/automation/__tests__/AutomationChatModal.test.tsx`

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Mock the tRPC client. The modal uses:
 *   - trpc.automationCopilot.analyze.useMutation()
 *   - trpc.automationCopilot.execute.useMutation()
 *   - trpc.automationCopilot.cancel.useMutation()
 *   - trpc.automationCopilot.getStatus via useUtils().automationCopilot.getStatus.fetch()
 *
 * Set up vi.mock("@/lib/trpc") returning mock mutation hooks.
 */

describe("AutomationChatModal", () => {
  it("renders idle state with prompt input and submit button", () => {
    // Render modal with open=true
    // Assert: text input visible, submit button visible, no spinner
  });

  it("submits prompt and enters analyzing state", async () => {
    // Type a prompt, click submit
    // Assert: analyze mutation called with { prompt }
    // Assert: spinner / "Understanding your request..." text visible
  });

  it("renders clarification questions when received from getStatus", async () => {
    // Mock getStatus to return { status: "needs_clarification", questions: [...] }
    // Assert: question text rendered, input fields for answers visible
  });

  it("renders preview panel when intent is ready", async () => {
    // Mock getStatus to return { status: "preview_ready", planSummary: {...} }
    // Assert: AutomationPreviewPanel rendered with step list
  });

  it("cancel button calls cancel mutation and resets to idle", async () => {
    // Enter executing state, click cancel
    // Assert: cancel mutation called with { taskId }
    // Assert: modal returns to idle state
  });
});
```

### AutomationPreviewPanel Tests

File: `apps/web/client/src/components/automation/__tests__/AutomationPreviewPanel.test.tsx`

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("AutomationPreviewPanel", () => {
  it("renders step list with correct icons and type badges", () => {
    // Pass planSummary with steps array
    // Assert: each step description rendered
    // Assert: type badges (e.g., "click", "fill", "extract") visible
  });

  it("shows confidence color coding (green >= 0.8, yellow 0.6-0.8, red < 0.6)", () => {
    // Pass steps with varying confidence values
    // Assert: green pill for confidence 0.9
    // Assert: yellow pill for confidence 0.7
    // Assert: red pill for confidence 0.4
  });

  it("shows estimated credits", () => {
    // Pass planSummary with estimatedCredits = 25
    // Assert: "25 credits" text visible
  });
});
```

### AutomationStepTracker Tests

File: `apps/web/client/src/components/automation/__tests__/AutomationStepTracker.test.tsx`

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("AutomationStepTracker", () => {
  it("renders phase indicators correctly for generating state", () => {
    // Pass status = { status: "generating", currentStep: 2, totalSteps: 5 }
    // Assert: "Generating script..." text visible
    // Assert: step 2 of 5 indicator shown
  });

  it("highlights heal events in amber", () => {
    // Pass status with healEvent = { attempt: 2, oldSelector: "...", newSelector: "..." }
    // Assert: amber-colored heal event element present
    // Assert: "Healing selector (attempt 2/3)" text visible
  });
});
```

---

## Implementation Details

### Shared Types

The components consume types returned by the tRPC `getStatus` query. Key shapes used across all three components (defined in `apps/web/shared/automation/contracts.ts` from section 09, or inline if that file does not yet exist):

```typescript
/** State machine states for AutomationChatModal */
type AutomationModalState =
  | "idle"
  | "analyzing"
  | "needs_clarification"
  | "preview_ready"
  | "executing"
  | "success"
  | "failed";

/** A single step in the automation plan */
interface AutomationPlanStep {
  description: string;
  actionType: string; // "click" | "fill" | "select" | "extract_data" | "navigate" | "wait"
  url?: string;
  selectorConfidence: number; // 0.0 to 1.0
}

/** Summary returned by analyze, displayed in preview */
interface AutomationPlanSummary {
  steps: AutomationPlanStep[];
  estimatedCredits: number;
  estimatedDurationSeconds: number;
}

/** Clarification question from the orchestrator */
interface ClarificationQuestion {
  id: string;
  question: string;
  type: "text" | "choice";
  options?: string[];
}

/** Execution status from getStatus polling */
interface AutomationExecutionStatus {
  status: string; // "generating" | "running" | "healing_attempt_N" | "success" | "failed"
  currentStep?: number;
  totalSteps?: number;
  completedActions?: string[];
  healEvent?: {
    attempt: number;
    maxAttempts: number;
    oldSelector: string;
    newSelector: string;
  };
  extractedData?: Record<string, unknown>;
  screenshots?: string[]; // base64 thumbnails
  error?: string;
  actualCreditsUsed?: number;
}
```

### AutomationChatModal

File: `apps/web/client/src/components/automation/AutomationChatModal.tsx`

This is a Radix Dialog modal following the same pattern as `AutoCreateAgencyModal.tsx` in `apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx`. Key architectural decisions:

**Props interface:**
```typescript
interface AutomationChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

**State machine:** Use a single `useState<AutomationModalState>` to drive which sub-view renders. State transitions:

- `idle` -- User sees a text input and submit button. On submit, call `trpc.automationCopilot.analyze.useMutation()` with `{ prompt }`, transition to `analyzing`.
- `analyzing` -- Show spinner with "Understanding your request..." text. Start polling `getStatus` via `trpc.useUtils().automationCopilot.getStatus.fetch({ taskId })` every 2 seconds using `setInterval` (matching the polling pattern in `AutoCreateAgencyModal`). When status returns `needs_clarification`, transition to that state. When status returns `preview_ready`, transition to `preview_ready`.
- `needs_clarification` -- Render a list of `ClarificationQuestion` objects with input fields. On submit, call `analyze` again with the original prompt plus answers appended. Transition back to `analyzing`.
- `preview_ready` -- Render `<AutomationPreviewPanel>` with the `planSummary` from the status response. Show "Run Automation" confirm button and "Cancel" link. On confirm, call `trpc.automationCopilot.execute.useMutation()`, transition to `executing`.
- `executing` -- Render `<AutomationStepTracker>` with the current execution status. Continue polling `getStatus` every 2 seconds. When status reaches `success` or `failed`, transition to that terminal state.
- `success` -- Show extracted data preview (JSON formatted), screenshots if any, and a "Save as Template" button (template save functionality is in section 12).
- `failed` -- Show error message from status, any error screenshot, and a "Try Again" button that resets to `idle`.

**Polling pattern:** Follow the same `useEffect` + `setInterval` + `useRef` cleanup pattern used in `AutoCreateAgencyModal.tsx`. Key details:
- Store `taskId` in state after the `analyze` mutation returns it.
- Poll interval: 2000ms (const `POLL_INTERVAL_MS`).
- Timeout guard: 5 minutes (const `MAX_POLL_WAIT_MS`). If polling exceeds this, transition to `failed` with a timeout message.
- Clear the interval on unmount and when a terminal state is reached.
- Use `trpc.useUtils()` to get the `fetch` function for imperative status queries (not `useQuery`, because we need manual polling control).

**Cancel handling:** A cancel button is visible during `analyzing` and `executing` states. On click, call `trpc.automationCopilot.cancel.useMutation()` with `{ taskId }`, clear the poll interval, and reset to `idle`.

**tRPC hooks used:**
```typescript
const analyzeMutation = trpc.automationCopilot.analyze.useMutation();
const executeMutation = trpc.automationCopilot.execute.useMutation();
const cancelMutation = trpc.automationCopilot.cancel.useMutation();
const trpcUtils = trpc.useUtils();
// Polling: trpcUtils.automationCopilot.getStatus.fetch({ taskId })
```

**UI components used:** `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from `@/components/ui/dialog`. `Button`, `Input`, `Textarea` from their respective UI modules. Icons from `lucide-react`: `Loader2` (spinner), `Bot` (header icon), `CheckCircle2` (success), `AlertCircle` (error), `X` (close).

**Notifications:** Use `toast` from `sonner` for error notifications on mutation failures.

### AutomationPreviewPanel

File: `apps/web/client/src/components/automation/AutomationPreviewPanel.tsx`

A presentational component that receives `planSummary: AutomationPlanSummary` and callbacks.

**Props:**
```typescript
interface AutomationPreviewPanelProps {
  planSummary: AutomationPlanSummary;
  onConfirm: () => void;
  onCancel: () => void;
}
```

**Rendering:**
- Vertical step list using `planSummary.steps.map()`. Each step is a row with:
  - Step number (1-indexed)
  - Icon based on `actionType`: click = `MousePointerClick`, fill = `TextCursorInput`, extract_data = `FileOutput`, navigate = `Globe`, wait = `Clock`, select = `ListChecks` (all from `lucide-react`)
  - Description text
  - Type badge (pill with `actionType` label)
  - URL (if present, shown as truncated link)
  - Confidence pill with color coding:
    - Green (`bg-green-100 text-green-800`): confidence >= 0.8
    - Yellow (`bg-yellow-100 text-yellow-800`): confidence >= 0.6 and < 0.8
    - Red (`bg-red-100 text-red-800`): confidence < 0.6

- Footer section with:
  - Estimated credits display (e.g., "~25 credits")
  - Estimated duration display (e.g., "~30 seconds")
  - "Run Automation" primary button (calls `onConfirm`)
  - "Cancel" text button (calls `onCancel`)

**Styling:** Use Tailwind utility classes. The step list uses `divide-y` for separators. Confidence pills use `rounded-full px-2 py-0.5 text-xs font-medium` pattern.

### AutomationStepTracker

File: `apps/web/client/src/components/automation/AutomationStepTracker.tsx`

A presentational component that receives the execution status and renders real-time progress.

**Props:**
```typescript
interface AutomationStepTrackerProps {
  status: AutomationExecutionStatus;
}
```

**Rendering:**
- **Phase indicator:** A text line showing the current phase:
  - `"generating"` -- "Generating script..." with `Loader2` spinner
  - `"running"` -- "Running step {currentStep} of {totalSteps}..." with spinner
  - `"healing_attempt_N"` -- "Healing selector (attempt N/3)..." with amber spinner (detect via regex on status string)
  - `"success"` -- "Automation complete" with green `CheckCircle2`
  - `"failed"` -- "Automation failed" with red `AlertCircle`

- **Completed actions log:** A scrollable list of `completedActions` strings, each with a green checkmark icon. New entries animate in (simple CSS transition or `animate-in` from Tailwind).

- **Heal event highlight:** When `healEvent` is present, render an amber-bordered card showing:
  - "Healing selector (attempt {attempt}/{maxAttempts})"
  - Old selector (struck through, muted text)
  - New selector (bold)
  - Use `border-amber-400 bg-amber-50` for the card styling

- **Screenshot thumbnails:** If `screenshots` array has entries, render them as small thumbnails (64x64 rounded) in a horizontal row.

- **Error display (failed state):** Show `status.error` in a red-bordered alert box.

- **Extracted data (success state):** Show `extractedData` formatted as a simple key-value list or JSON block with `<pre>` styling.

---

## Integration Notes

### How the Modal is Opened

The modal is triggered from the sidebar navigation (section 11 adds the sidebar entry). It is also usable from any page by importing and rendering `<AutomationChatModal open={isOpen} onOpenChange={setIsOpen} />`. The modal manages all its own state internally -- the parent only controls open/close.

### Polling and Cleanup

The polling implementation must properly clean up intervals on:
1. Component unmount (return cleanup from `useEffect`)
2. Terminal state reached (clear interval in the polling callback)
3. Modal close (clear interval in `onOpenChange` handler or via the unmount cleanup)

Use `useRef` for the interval ID to avoid stale closure issues, following the exact pattern in `AutoCreateAgencyModal.tsx`.

### Error Handling

- If `analyze` mutation fails (network error, 403 feature disabled, etc.), show error via `toast.error()` and stay in `idle` state.
- If `execute` mutation fails (insufficient credits, etc.), show error via `toast.error()` and stay in `preview_ready` state.
- If polling `getStatus` returns a network error, retry silently (do not transition to failed on transient poll failures -- only transition on explicit `"failed"` status from the backend).

### Template Save (Section 12 Dependency)

The "Save as Template" button in the `success` state is a placeholder until section 12 implements template save/load. For now, render the button but have it show `toast.info("Template saving coming soon")` or similar. Section 12 will wire it to the actual template mutation.

---

## Implementation Order

1. Create the `__tests__/` directory and write all three test files (stubs above)
2. Implement `AutomationStepTracker.tsx` (simplest, no tRPC calls, pure presentational)
3. Implement `AutomationPreviewPanel.tsx` (pure presentational, callbacks only)
4. Implement `AutomationChatModal.tsx` (depends on the above two components, has the state machine and tRPC integration)
5. Verify all tests pass with `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run client/src/components/automation`