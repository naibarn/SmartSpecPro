Now I have all the context needed. Let me generate the section content for `section-08-export-dialog`.

# Section 08: Frontend — ExportDialog Component

## Overview

This section creates the `ExportDialog` modal component for the Presentation Editor. It is a new file at `apps/web/client/src/components/presentation/ExportDialog.tsx` that provides a three-state UI: format selection, in-progress tracking, and completion/error display.

This section depends on:
- **Section 02** (Shared Contracts) — for `PresentationExportStatusResult` with numeric `exportId`, `progressPct`, `stage`, `downloadUrl`, and `errorMessage`
- **Section 04** (tRPC Router) — for `triggerExport` mutation (jpg/pdf formats, `quality` enum, required `idempotencyKey`) and `getExportStatus` query (returns `progressPct`, `stage`, `downloadUrl`, `errorMessage`)

Do NOT confuse this component with the existing video editor export dialog at `apps/web/client/src/components/videoeditor/ExportDialog.tsx`. These are entirely separate components for separate features.

---

## Tests First

**File to create:** `apps/web/client/src/components/presentation/ExportDialog.test.tsx`

Write all tests before implementing the component. Use Vitest + React Testing Library. Mock the tRPC client.

```typescript
// apps/web/client/src/components/presentation/ExportDialog.test.tsx

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExportDialog } from "./ExportDialog";

// Mock trpc hooks
vi.mock("@/lib/trpc", () => ({
  trpc: {
    presentation: {
      triggerExport: { useMutation: vi.fn() },
      getExportStatus: { useQuery: vi.fn() },
    },
  },
}));
```

Test cases that must all pass before the implementation is considered complete:

1. **Format picker renders all four options** — renders radio buttons or cards labeled "MP4", "PNG", "JPG", "PDF"
2. **Quality picker conditional on format** — shown when MP4 or JPG is selected, hidden when PNG or PDF is selected
3. **Quality picker hidden for PNG** — switching from MP4 to PNG hides the quality picker
4. **Quality picker hidden for PDF** — switching from MP4 to PDF hides the quality picker
5. **Export button calls `triggerExport` mutation** — clicking "Export" calls the mutation with the selected `format` and `quality`
6. **`triggerExport` receives `idempotencyKey`** — the mutation is called with a non-empty string `idempotencyKey`
7. **Dialog transitions to in-progress after trigger** — after `triggerExport` resolves with `exportId`, the dialog shows a progress bar
8. **Progress bar shows `progressPct`** — when `getExportStatus` returns `progressPct: 42`, a progress element reflects 42%
9. **Stage label renders for "rendering"** — stage label is visible when status stage is "rendering"
10. **Stage label renders for "encoding"** — stage label is visible when stage is "encoding"
11. **Stage label renders for "uploading"** — stage label is visible when stage is "uploading"
12. **Polling stops when status is `"done"`** — `getExportStatus` is no longer polled (`refetchInterval` becomes `false`) when status is done
13. **Polling stops when status is `"error"`** — same as above for error state
14. **Download button appears with `downloadUrl` when `"done"`** — a link/button with `href` matching `downloadUrl` is present when status is done
15. **Error message renders when status is `"error"`** — the `errorMessage` string is visible in the DOM
16. **"Try Again" button resets dialog to format selection** — clicking "Try Again" in error state clears `exportId` state and shows the format picker again

---

## Implementation

### File to Create

`apps/web/client/src/components/presentation/ExportDialog.tsx`

### Component Interface

```typescript
interface ExportDialogProps {
  /** Library item ID of the presentation deck being exported */
  deckId: number;
  /** Whether the dialog is open */
  open: boolean;
  /** Called when the dialog is closed */
  onClose: () => void;
}
```

### Dialog States

The component has three mutually exclusive render states, driven by internal state:

```
"selecting" → "exporting" → "done" | "error"
                               ↓
                          "selecting"  (via "Try Again")
```

Use a single `dialogPhase` state variable: `"selecting" | "exporting" | "done" | "error"`. The transition to `"exporting"` happens when the `triggerExport` mutation resolves successfully. The transition to `"done"` or `"error"` is driven by the polling query result.

### State Variables

```typescript
// Format and quality selection
const [format, setFormat] = useState<"mp4" | "png" | "jpg" | "pdf">("mp4");
const [quality, setQuality] = useState<"draft" | "standard" | "high">("standard");

// Export job tracking (set after triggerExport resolves)
const [exportId, setExportId] = useState<number | null>(null);

// Dialog phase
const [dialogPhase, setDialogPhase] = useState<"selecting" | "exporting" | "done" | "error">("selecting");
```

### idempotencyKey Generation

Generate a stable idempotency key when the component mounts (or when dialog opens) using `crypto.randomUUID()`. Store it in a `useRef` so it persists across re-renders but resets when the dialog is re-opened with a fresh instance. On "Try Again", generate a new UUID so the next export attempt is not deduplicated against the failed one.

```typescript
const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

// Reset when "Try Again" is clicked
function handleTryAgain() {
  idempotencyKeyRef.current = crypto.randomUUID();
  setExportId(null);
  setDialogPhase("selecting");
}
```

### tRPC Mutation: `triggerExport`

```typescript
const triggerExportMutation = trpc.presentation.triggerExport.useMutation({
  onSuccess(data) {
    setExportId(data.exportId);
    setDialogPhase("exporting");
  },
  onError(err) {
    // Show toast notification and remain in "selecting" phase
    toast.error(`Export failed to start: ${err.message}`);
  },
});

function handleExport() {
  triggerExportMutation.mutate({
    deckId,
    format,
    quality,
    idempotencyKey: idempotencyKeyRef.current,
  });
}
```

### tRPC Query: `getExportStatus` with Polling

```typescript
const exportStatusQuery = trpc.presentation.getExportStatus.useQuery(
  { exportId: exportId! },
  {
    enabled: exportId !== null && (dialogPhase === "exporting"),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "done" || status === "error") return false;
      return 2000; // Poll every 2 seconds
    },
    refetchIntervalInBackground: false,
  },
);
```

When the query data changes, update `dialogPhase` with a `useEffect`:

```typescript
useEffect(() => {
  const status = exportStatusQuery.data?.status;
  if (status === "done") setDialogPhase("done");
  if (status === "error") setDialogPhase("error");
}, [exportStatusQuery.data?.status]);
```

### Format Selection State Render

The format picker uses radio buttons (or visually styled cards using the existing `RadioGroup` / `RadioGroupItem` from `@/components/ui/radio-group`). Each option should show a short label and a one-line description:

| Format | Description |
|--------|-------------|
| MP4 | Video file, suitable for sharing and embedding |
| PNG | Lossless image slides (ZIP archive) |
| JPG | Compressed image slides (ZIP archive) |
| PDF | Portable document, all slides in one file |

The quality picker (shown only for `format === "mp4" || format === "jpg"`) uses three options rendered as radio buttons or a segmented button group:

| Quality | Description |
|---------|-------------|
| Draft | Faster render, smaller file |
| Standard | Balanced quality and size (default) |
| High | Best quality, larger file, slower render |

The "Export" button is disabled while `triggerExportMutation.isPending`.

### In-Progress State Render

Show the `Progress` component from `@/components/ui/progress` with `value={exportStatusQuery.data?.progressPct ?? 0}`.

Show a stage label below the progress bar. Map raw stage values to human-readable strings:

```typescript
const STAGE_LABELS: Record<string, string> = {
  rendering: "Rendering slides...",
  encoding: "Encoding video...",
  uploading: "Uploading file...",
};
```

Show a disabled "Cancel" button as a placeholder. The placeholder must be rendered but disabled, per the spec. Add a `title` or `aria-label` of "Cancellation not yet supported" to communicate its disabled state.

### Complete State Render

Show a "Download" button that opens `exportStatusQuery.data?.downloadUrl` in a new browser tab (`window.open(url, "_blank", "noopener")`). Also display file size if `exportStatusQuery.data?.outputBytes` is available, formatted as MB.

The dialog remains open after completion. The user must close it manually. This is intentional — the download URL is only available while the dialog is open.

### Error State Render

Show `exportStatusQuery.data?.errorMessage` in a visible error block (use the existing `Alert` component from `@/components/ui/alert` with `variant="destructive"`).

Show a "Try Again" button that calls `handleTryAgain()`.

### Dialog Shell

Use the existing Radix-based `Dialog` component from `@/components/ui/dialog`:

```typescript
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
```

Set `onOpenChange` to call `onClose` when the user dismisses the dialog. When `dialogPhase` is `"exporting"`, set `DialogContent` prop `onInteractOutside={(e) => e.preventDefault()}` to prevent accidental dismissal mid-export.

### Imports

```typescript
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
```

---

## Key Design Decisions

**Why `exportId` is `number | null`:** After Section 02 changes `exportId` from `string` to `number` (DB row ID), the state variable type must be `number | null`. Ensure the `getExportStatus` query input matches the updated schema (`exportId: z.number().int().positive()`).

**Why "Cancel" button is disabled:** The backend currently has no cancellation endpoint. The spec explicitly requires a disabled placeholder. Do not remove it or omit it — it is a visible affordance for future implementation.

**Why `onInteractOutside` is blocked during export:** Users could accidentally close the dialog by clicking outside and lose their place in the export flow. The download URL is stored in the DB so it remains accessible, but the UX is cleaner with a blocked dismiss during active export.

**Quality is only meaningful for MP4 and JPG:** PNG is lossless by definition. PDF export quality is determined by the slide content, not a CRF setting. Hiding the quality picker for PNG and PDF avoids presenting a non-functional control.

**`refetchIntervalInBackground: false`:** There is no need to continue polling if the user switches browser tabs. The user must return to the dialog to see the result. This avoids unnecessary background network traffic.

---

## Dependencies on Other Sections

- **Section 02 (Shared Contracts)** must be complete. The `triggerExport` mutation input must include `format: "jpg" | "pdf"` and `quality`, and `getExportStatus` output must include `progressPct`, `stage`, `downloadUrl`, `errorMessage`. The `exportId` in all schemas must be `number`, not `string`.
- **Section 04 (tRPC Router)** must be complete. The `triggerExport` mutation must accept `quality` and require `idempotencyKey`. The `getExportStatus` query must return the new fields.
- **Section 10 (Editor Modifications)** depends on this section — it integrates `ExportDialog` into the `PresentationEditor` toolbar.

---

## File Summary

| File | Action |
|------|--------|
| `apps/web/client/src/components/presentation/ExportDialog.tsx` | Create |
| `apps/web/client/src/components/presentation/ExportDialog.test.tsx` | Create (tests first) |

---

## Implementation Results

**Status:** COMPLETE

### Files Created

| File | Notes |
|------|-------|
| `apps/web/client/src/components/presentation/ExportDialog.tsx` | Created as planned |
| `apps/web/client/src/components/presentation/ExportDialog.test.tsx` | 17 tests (17/17 passing) |

### Deviations from Plan

1. **`aria-valuenow` forwarded explicitly**: The `Progress` component from `packages/ui` does not pass `value` through to `ProgressPrimitive.Root`, so Radix cannot set `aria-valuenow` automatically. Added explicit `aria-valuenow={progressPct}` as a workaround. This enables the test `progressBar.getAttribute("aria-valuenow") === "42"` to pass correctly.

2. **Download uses `window.open` instead of `<a href>`** (H2 code review fix): Replaced `<a href={downloadUrl}><Button asChild>` with `<Button onClick={() => window.open(downloadUrl, "_blank", "noopener")}>`. Eliminates invalid `<a>` wrapping `<button>` DOM nesting.

3. **State reset on dialog reopen** (M1 code review fix): Added `useEffect` keyed on `[open]` that resets `idempotencyKeyRef`, `exportId`, and `dialogPhase` to "selecting" whenever `open` transitions to `true`. Prevents stale state from a previous export leaking into a fresh dialog open.

4. **`useEffect` guard for phase transitions** (H3 code review fix): Added `if (dialogPhase !== "exporting") return;` guard inside the status polling effect, and `dialogPhase` added to deps. Prevents stale query data from re-triggering phase transitions after "Try Again" reset.

5. **`outputBytes` displayed as file size** (H1 code review fix): Extracted `outputBytes` from `statusData` and displayed as `{fileSizeMb} MB` in the Done phase when non-null.

6. **`DialogDescription` added** (L3 code review fix): Added `<DialogDescription className="sr-only">` to suppress Radix a11y console warning.

### Test Count

- **17 tests**, 17/17 passing
- Covers: format picker (4 options), quality picker conditional (mp4/jpg show, png/pdf hide), triggerExport args + idempotencyKey, progress bar + aria-valuenow, stage labels (rendering/encoding/uploading), polling stops on done/error, download button window.open, errorMessage, Try Again reset, onError toast