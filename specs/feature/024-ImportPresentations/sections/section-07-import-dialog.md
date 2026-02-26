# Section 07: Frontend — ImportPresentationDialog

## Implementation Status: COMPLETE

### Files Created
- `apps/web/client/src/components/presentation/ImportPresentationDialog.tsx` — Main component
- `apps/web/client/src/components/presentation/uploadPptxFile.ts` — Upload helper
- `apps/web/client/src/components/presentation/ImportPresentationDialog.test.tsx` — 17 tests (all passing)

### Also Modified
- `apps/web/server/services/libraryService.ts` — Raised MAX_LIBRARY_UPLOAD_BYTES from 30 MB to 50 MB

### Key Deviations from Plan
1. **`uploadPptxFile` has 4 args**: Takes a `mutateAsync` callback as 4th arg to avoid React hooks outside component. Tests mock the entire module so arg count doesn't affect test behavior.
2. **Polling via `trpc.getImportStatus.useQuery()`** (not raw tanstack `useQuery`): Matches ExportDialog pattern already established in the codebase. Behavior is identical.
3. **`expired` OAuth state**: Distinguished with "Reconnect Google Drive" button (not in original plan).
4. **`handleTryAgain` resets all state**: Resets selectedFile, fileError, slidesUrl, slidesUrlError, fileInputRef.
5. **`handleOpenDeck` null guard**: Shows error step instead of silently failing.
6. **Slide count not shown**: Server does not return slideCount in getImportStatus response.

### Tests: 17 passing
- File validation (2 tests)
- PPTX upload flow (5 tests)
- Google Slides flow (3 tests)
- Processing step polling (3 tests)
- Result step (2 tests)
- Error step (1 test)

Note: Used `userEvent.click()` for tab switching (Radix uses `onPointerDown`, not `onClick`).
Used `vi.hoisted()` for wouter mock to enable assertions on `setLocation`.

---

## Overview

This section covers the implementation of the `ImportPresentationDialog` React component. It is a Radix-based modal dialog with a 5-step state machine that guides users through importing a presentation from either a PPTX file upload or a Google Slides URL.

**Dependencies (must be completed before starting this section):**
- Section 05 (tRPC Router) — provides `trpc.presentationImport.startImport`, `trpc.presentationImport.getImportStatus`, and `trpc.presentationImport.cancelImport`.
- Section 06 (Service + Callback) — the callback pipeline that creates the deck; the dialog depends on `deckLibraryItemId` being populated in the status response when `status === "done"`.

---

## File to Create

```
apps/web/client/src/components/presentation/ImportPresentationDialog.tsx
```

---

## Tests First

**File:** `apps/web/client/src/components/presentation/ImportPresentationDialog.test.tsx`

Write the tests below before implementing the component. Use Vitest + React Testing Library. The test file must have the `@vitest-environment jsdom` docblock.

### Mock Setup

Mock all tRPC procedures and the XHR upload helper (see Implementation section for the helper's signature):

```typescript
/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ImportPresentationDialog } from "./ImportPresentationDialog";

// Mock trpc
vi.mock("@/lib/trpc", () => ({
  trpc: {
    presentationImport: {
      startImport: { useMutation: vi.fn() },
      getImportStatus: { useQuery: vi.fn() },
      cancelImport: { useMutation: vi.fn() },
    },
    googleDrive: {
      getConnectionStatus: { useQuery: vi.fn() },
    },
  },
}));

// Mock the XHR upload helper
vi.mock("./uploadPptxFile", () => ({
  uploadPptxFile: vi.fn(),
}));

// Mock wouter navigation
vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
}));
```

### Required Test Cases

```typescript
describe("ImportPresentationDialog", () => {
  // -------------------------------------------------------------------------
  // File validation (before upload)
  // -------------------------------------------------------------------------

  it("shows inline error and stays on select step when file exceeds 50 MB", () => {
    /**
     * Arrange: render with a mock file whose size > 52_428_800 bytes.
     * Act: select the oversized file via the hidden <input type="file">.
     * Assert: error message containing "50" or "too large" is visible.
     *         step remains "select" (upload button / Import label still present).
     */
  });

  it("does not show error and stays on select step when file is within 50 MB limit", () => {
    /**
     * Arrange: render with a mock file whose size = 1_000_000.
     * Act: select the file.
     * Assert: no inline error; Import button is enabled.
     */
  });

  // -------------------------------------------------------------------------
  // PPTX upload flow
  // -------------------------------------------------------------------------

  it("advances step to 'uploading' when Import is clicked with a valid file", async () => {
    /**
     * Arrange: mock getImportStatus query returning null. mock startImport returning
     *          { conversionId: 42 }. mock uploadPptxFile as a never-resolving promise
     *          to keep the component in the uploading state.
     * Act: select valid file, click Import.
     * Assert: spinner / "Uploading" heading or progress element is present.
     */
  });

  it("updates progress bar value as upload progresses", async () => {
    /**
     * Arrange: mock uploadPptxFile to call onProgress(50) then resolve.
     * Act: select valid file, click Import.
     * Assert: progress bar aria-valuenow or value equals 50 at the midpoint.
     */
  });

  it("calls startImport with sourceType 'pptx' and sourceLibraryItemId after upload success", async () => {
    /**
     * Arrange: mock uploadPptxFile to resolve with { libraryItemId: 99 }.
     *          mock startImport mutate to call onSuccess({ conversionId: 7 }).
     * Act: select valid file, click Import.
     * Assert: startImport.mutate called with
     *         { sourceType: "pptx", sourceLibraryItemId: 99, title: expect.any(String) }.
     */
  });

  it("advances step to 'processing' and sets conversionId after upload + startImport success", async () => {
    /**
     * Arrange: mock uploadPptxFile resolves with { libraryItemId: 99 }.
     *          mock startImport calls onSuccess({ conversionId: 7 }).
     *          mock getImportStatus returns { status: "processing", progress: 10 }.
     * Act: select valid file, click Import.
     * Assert: step is "processing" (spinner or progress bar with label "Processing" visible).
     *         conversionId is passed to getImportStatus query.
     */
  });

  it("advances step to 'error' and shows error message when upload fails", async () => {
    /**
     * Arrange: mock uploadPptxFile to reject with new Error("Network error").
     * Act: select valid file, click Import.
     * Assert: step changes to "error". Error message containing "Network error" is visible.
     */
  });

  it("calls AbortController.abort() and resets step to 'select' when Cancel is clicked during upload", async () => {
    /**
     * Arrange: mock uploadPptxFile with a pending promise (never resolves until aborted).
     *          spy on AbortController.prototype.abort.
     * Act: select valid file, click Import; then click Cancel.
     * Assert: abort() was called once. Step returns to "select".
     */
  });

  // -------------------------------------------------------------------------
  // Google Slides flow
  // -------------------------------------------------------------------------

  it("shows 'Connect Google Drive' button when OAuth is not connected", () => {
    /**
     * Arrange: mock getConnectionStatus returning { status: "not_connected" }.
     * Act: click the "Google Slides" tab.
     * Assert: "Connect Google Drive" button is rendered; URL input is absent.
     */
  });

  it("shows validation error for a non-Google Slides URL", async () => {
    /**
     * Arrange: mock getConnectionStatus returning { status: "connected" }.
     * Act: switch to Google Slides tab; type "https://example.com/not-slides"; click Import.
     * Assert: validation error message visible; startImport not called.
     */
  });

  it("calls startImport with sourceType 'google_slides' and slidesUrl for a valid URL", async () => {
    /**
     * Arrange: mock getConnectionStatus returning { status: "connected" }.
     *          mock startImport mutate to call onSuccess({ conversionId: 3 }).
     * Act: switch to Google Slides tab; enter valid URL; click Import.
     * Assert: startImport.mutate called with
     *         { sourceType: "google_slides", slidesUrl: "<valid URL>" }.
     */
  });

  // -------------------------------------------------------------------------
  // Processing step (polling)
  // -------------------------------------------------------------------------

  it("advances step to 'result' when polling returns status 'done'", async () => {
    /**
     * Arrange: render with step already at "processing" (conversionId set).
     *          mock getImportStatus to return { status: "done", progress: 100,
     *          fidelityWarnings: [], deckLibraryItemId: 5 }.
     * Act: wait for useEffect to react to status change.
     * Assert: step changes to "result". "Import complete" text is visible.
     */
  });

  it("advances step to 'error' and shows error message when polling returns status 'failed'", async () => {
    /**
     * Arrange: mock getImportStatus returning { status: "failed", error: "PPTX corrupt" }.
     * Act: wait for useEffect.
     * Assert: step is "error". "PPTX corrupt" text is visible.
     */
  });

  it("calls cancelImport and resets to 'select' when Cancel is clicked during processing", async () => {
    /**
     * Arrange: render in "processing" step with conversionId = 42.
     *          mock cancelImport mutate.
     * Act: click Cancel.
     * Assert: cancelImport.mutate called with { conversionId: 42 }.
     *         step resets to "select".
     */
  });

  // -------------------------------------------------------------------------
  // Result step
  // -------------------------------------------------------------------------

  it("displays the correct slide count in the result step", () => {
    /**
     * Arrange: render in "result" step; mock status data with slideCount or
     *          infer count from data returned by the status query.
     * Assert: text like "10 slides imported" or "Import complete" with count is visible.
     */
  });

  it("renders fidelityWarnings as list items in the result step", () => {
    /**
     * Arrange: mock status data with fidelityWarnings: ["Oval approximated", "Table dropped"].
     * Assert: both warning strings appear as <li> elements.
     */
  });

  it("navigates to the correct PresentationEditor route when 'Open Deck' is clicked", async () => {
    /**
     * Arrange: render in "result" step with deckLibraryItemId = 17.
     *          spy on setLocation from wouter.
     * Act: click "Open Deck".
     * Assert: setLocation called with "/presentation/17" (or the correct editor route path).
     */
  });

  // -------------------------------------------------------------------------
  // Error step
  // -------------------------------------------------------------------------

  it("resets step to 'select' and clears error when 'Try Again' is clicked", async () => {
    /**
     * Arrange: render in "error" step with errorMessage set.
     * Act: click "Try Again".
     * Assert: step is "select". Error message no longer visible.
     *         conversionId is cleared (null).
     */
  });
});
```

**Test command:**
```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test ImportPresentationDialog
```

---

## Implementation

### Component File

**Path:** `apps/web/client/src/components/presentation/ImportPresentationDialog.tsx`

### State Machine

The component has five steps:

```
"select"     — Initial state. User chooses PPTX tab or Google Slides tab.
"uploading"  — Active only for PPTX: XHR upload in progress, progress bar visible.
"processing" — Import queued in Python; polling for status.
"result"     — Import complete; show slide count, warnings, Open Deck button.
"error"      — Upload failed, startImport failed, or Python task failed.

Transitions:
  select     → uploading   (PPTX: Import button clicked, XHR started)
  select     → processing  (GSlides: startImport mutation succeeded)
  uploading  → processing  (XHR done + startImport succeeded)
  uploading  → error       (XHR failed OR startImport failed)
  processing → result      (polling: status === "done")
  processing → error       (polling: status === "failed")
  error      → select      ("Try Again" clicked — resets all state)
```

### Props Interface

```typescript
interface ImportPresentationDialogProps {
  /** Called when the dialog should close (X button, Close button, or successful navigation). */
  onClose: () => void;
}
```

The dialog manages its own `open` state internally (always mounted while rendered from parent; parent controls rendering via conditional: `{isImportDialogOpen && <ImportPresentationDialog onClose={...} />}`).

### Internal State

```typescript
type ImportStep = "select" | "uploading" | "processing" | "result" | "error";

// Inside component:
const [step, setStep] = useState<ImportStep>("select");
const [activeTab, setActiveTab] = useState<"pptx" | "google_slides">("pptx");
const [selectedFile, setSelectedFile] = useState<File | null>(null);
const [fileError, setFileError] = useState<string | null>(null);
const [slidesUrl, setSlidesUrl] = useState("");
const [slidesUrlError, setSlidesUrlError] = useState<string | null>(null);
const [uploadProgress, setUploadProgress] = useState(0);
const [conversionId, setConversionId] = useState<number | null>(null);
const [errorMessage, setErrorMessage] = useState<string | null>(null);
const abortRef = useRef<AbortController | null>(null);
```

### XHR Upload Helper (separate module or inline utility)

**Path (suggested):** Inline in the component file or extracted to `apps/web/client/src/components/presentation/uploadPptxFile.ts`

```typescript
/**
 * Upload a PPTX file to the library via XHR (not fetch) so upload progress
 * events are available.
 *
 * Posts to the existing library upload endpoint as multipart/form-data.
 * Returns the new library item ID on success.
 * Throws DOMException("Aborted", "AbortError") if signal is aborted.
 * Throws Error with message on network error or non-2xx response.
 */
export function uploadPptxFile(
  file: File,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
): Promise<{ libraryItemId: number }>;
```

Implementation notes:
- Use `XMLHttpRequest`. Do NOT use `fetch` — fetch does not expose upload progress events.
- POST to the existing library file upload endpoint. The existing upload endpoint used by other parts of the app accepts `multipart/form-data` with the file under the `file` field. Look at how the backend `library.uploadFile` tRPC procedure works — it uses `fileBase64`, `fileName`, `fileType` — so the XHR helper should convert the file to base64 and call the tRPC mutation via `trpc.library.uploadFile.mutate(...)` instead. Alternatively, if there is a raw HTTP upload endpoint, use that. The exact endpoint shape must be confirmed by reading `apps/web/server/routers/library.ts` (the `uploadFile` procedure at line ~189).

**Important:** The `library.uploadFile` tRPC procedure accepts `{ fileName, fileType, fileBase64, title, visibility }`. Since tRPC mutations are invoked through the JS client (not raw XHR), wrap the XHR approach appropriately: use XHR only if there is a raw HTTP endpoint exposing the multipart upload. Otherwise, read the file as a Base64 string and call `trpc.library.uploadFile.mutate(...)` — progress tracking in this case is not possible via XHR events, but the upload is typically fast enough. If XHR with progress is required, a raw Express multipart route must exist or be added.

> **Implementer note:** Before writing `uploadPptxFile`, read `apps/web/server/routers/library.ts` lines 78–220 to confirm the exact upload mechanism. If the tRPC route uses base64, skip the XHR approach and use the tRPC mutation instead, reporting progress as 0→50 (pre-call) and 50→100 (post-call) to give basic feedback.

### tRPC Hooks to Wire Up

```typescript
// Inside the component:
const startImportMutation = trpc.presentationImport.startImport.useMutation();
const cancelImportMutation = trpc.presentationImport.cancelImport.useMutation();
const connectionStatusQuery = trpc.googleDrive.getConnectionStatus.useQuery(undefined, {
  enabled: activeTab === "google_slides",
  retry: false,
});

// Polling (TanStack Query v5 API):
const statusQuery = useQuery({
  queryKey: ["import-status", conversionId],
  queryFn: () =>
    trpc.presentationImport.getImportStatus.query({ conversionId: conversionId! }),
  enabled: conversionId !== null && step === "processing",
  refetchInterval: (query) => {
    const s = query.state.data?.status;
    return s === "done" || s === "failed" || s === "cancelled" ? false : 2000;
  },
  staleTime: 0,
});
```

Note: `useQuery` here is from `@tanstack/react-query`, not a tRPC hook — import it directly. The `trpc.presentationImport.getImportStatus.query(...)` call is the vanilla tRPC client call.

### Polling Side Effect

```typescript
useEffect(() => {
  if (!statusQuery.data) return;
  const { status, error } = statusQuery.data;
  if (status === "done") {
    setStep("result");
  } else if (status === "failed") {
    setErrorMessage(error ?? "Import failed.");
    setStep("error");
  }
}, [statusQuery.data]);
```

### PPTX Import Handler

```typescript
async function handlePptxImport() {
  if (!selectedFile) return;
  setFileError(null);
  const controller = new AbortController();
  abortRef.current = controller;
  setStep("uploading");
  setUploadProgress(0);

  try {
    const { libraryItemId } = await uploadPptxFile(
      selectedFile,
      (pct) => setUploadProgress(pct),
      controller.signal,
    );

    const result = await startImportMutation.mutateAsync({
      sourceType: "pptx",
      sourceLibraryItemId: libraryItemId,
      title: selectedFile.name.replace(/\.pptx$/i, ""),
    });

    setConversionId(result.conversionId);
    setStep("processing");
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // User cancelled — reset silently
      setStep("select");
    } else {
      setErrorMessage(err instanceof Error ? err.message : "Upload failed.");
      setStep("error");
    }
  }
}
```

### Google Slides Import Handler

```typescript
const GSLIDES_URL_RE = /^https:\/\/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/;

async function handleGSlidesImport() {
  setSlidesUrlError(null);
  if (!GSLIDES_URL_RE.test(slidesUrl)) {
    setSlidesUrlError("Enter a valid Google Slides URL (docs.google.com/presentation/d/...)");
    return;
  }

  try {
    const result = await startImportMutation.mutateAsync({
      sourceType: "google_slides",
      slidesUrl,
    });
    setConversionId(result.conversionId);
    setStep("processing");
  } catch (err) {
    setErrorMessage(err instanceof Error ? err.message : "Failed to start import.");
    setStep("error");
  }
}
```

### Cancel Handlers

```typescript
function handleCancelUpload() {
  abortRef.current?.abort();
  setStep("select");
  setUploadProgress(0);
}

function handleCancelProcessing() {
  if (conversionId !== null) {
    cancelImportMutation.mutate({ conversionId }); // best-effort, don't await
  }
  setConversionId(null);
  setStep("select");
}
```

### Try Again Handler

```typescript
function handleTryAgain() {
  setStep("select");
  setConversionId(null);
  setErrorMessage(null);
  setUploadProgress(0);
}
```

### Open Deck Handler

```typescript
const [, setLocation] = useLocation(); // from "wouter"

function handleOpenDeck() {
  const id = statusQuery.data?.deckLibraryItemId;
  if (id) {
    setLocation(`/presentation/${id}`);
    onClose();
  }
}
```

### File Validation

```typescript
const MAX_FILE_BYTES = 52_428_800; // 50 MB

function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    setFileError("File is too large. Maximum size is 50 MB.");
    setSelectedFile(null);
  } else {
    setFileError(null);
    setSelectedFile(file);
  }
}
```

### JSX Structure (Radix Dialog)

Use Radix `Dialog` with the `open` prop set to `true` (always open while parent has mounted this component). `onOpenChange` calls `onClose()` when Radix detects an external close gesture (click-outside or Escape), but only when `step === "select"` or `step === "result"` or `step === "error"` — prevent accidental close during upload/processing.

**Step: Select**

```tsx
<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "pptx" | "google_slides")}>
  <TabsList>
    <TabsTrigger value="pptx">Upload PPTX</TabsTrigger>
    <TabsTrigger value="google_slides">Google Slides</TabsTrigger>
  </TabsList>

  <TabsContent value="pptx">
    {/* Drag-and-drop zone or click-to-select */}
    {/* Hidden <input type="file" accept=".pptx" ref={fileInputRef} onChange={handleFileChange} /> */}
    {/* "Max 50 MB" badge */}
    {fileError && <p className="text-destructive text-sm">{fileError}</p>}
    <Button onClick={handlePptxImport} disabled={!selectedFile || startImportMutation.isPending}>
      Import
    </Button>
  </TabsContent>

  <TabsContent value="google_slides">
    {connectionStatusQuery.data?.status === "connected" ? (
      <>
        <Input
          type="url"
          placeholder="https://docs.google.com/presentation/d/..."
          value={slidesUrl}
          onChange={(e) => setSlidesUrl(e.target.value)}
        />
        {slidesUrlError && <p className="text-destructive text-sm">{slidesUrlError}</p>}
        <Button onClick={handleGSlidesImport} disabled={!slidesUrl || startImportMutation.isPending}>
          Import
        </Button>
      </>
    ) : (
      <Button onClick={() => { /* open settings/Google Drive connection flow */ }}>
        Connect Google Drive
      </Button>
    )}
  </TabsContent>
</Tabs>
```

**Step: Uploading**

```tsx
<div>
  <Loader2 className="animate-spin" />
  <p>Uploading...</p>
  <Progress value={uploadProgress} />
  <Button variant="secondary" onClick={handleCancelUpload}>Cancel</Button>
</div>
```

**Step: Processing**

```tsx
<div>
  <Loader2 className="animate-spin" />
  <p>Processing presentation...</p>
  <Progress value={statusQuery.data?.progress ?? 0} />
  <Button variant="secondary" onClick={handleCancelProcessing}>Cancel</Button>
</div>
```

**Step: Result**

```tsx
<div>
  <p>Import complete!</p>
  {statusQuery.data?.fidelityWarnings?.length ? (
    <ul>
      {statusQuery.data.fidelityWarnings.map((w, i) => (
        <li key={i}>{w}</li>
      ))}
    </ul>
  ) : null}
  <Button onClick={handleOpenDeck}>Open Deck</Button>
  <Button variant="secondary" onClick={onClose}>Close</Button>
</div>
```

**Step: Error**

```tsx
<div>
  <p className="text-destructive">{errorMessage ?? "An unexpected error occurred."}</p>
  <Button onClick={handleTryAgain}>Try Again</Button>
</div>
```

### Imports Required

```typescript
import { useRef, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
```

---

## UI/UX Notes

- The drag-and-drop zone on the PPTX tab should have a dashed border, a file icon, and a visible label like "Drop your .pptx file here or click to browse". Use a `<label>` wrapping the hidden `<input>` so clicking the zone opens the file picker.
- The "Max 50 MB" badge can be a small `<span>` with muted text styling.
- On the Google Slides tab, if `connectionStatusQuery.isLoading` is true, show a skeleton or a disabled input rather than the "Connect" button to avoid a flash.
- The "Connect Google Drive" button should navigate to or open the user Settings page at the Google Drive section. Use `setLocation("/settings#google-drive")` or similar, then call `onClose()`.
- Prevent closing the dialog (disable onOpenChange forwarding) while step is `"uploading"` or `"processing"` to avoid orphaned uploads.

---

## Dependency Notes

- **`trpc.presentationImport.*`** procedures are defined in Section 05 (`apps/web/server/routers/presentationImport.ts`). Do not implement them here.
- **`trpc.googleDrive.getConnectionStatus`** already exists in `apps/web/server/routers/googleDrive.ts`. Returns `{ status: "not_connected" | "connected" | "expired", email, scopes, connectedAt }`.
- **`trpc.library.uploadFile`** already exists in `apps/web/server/routers/library.ts`. Accepts `{ fileName, fileType, fileBase64, title?, visibility? }`. If using this procedure for the PPTX upload (base64 approach), convert the file with `FileReader.readAsDataURL` and strip the `data:...;base64,` prefix. Progress tracking via XHR is not applicable in this case — simulate progress by setting 10% on start and 90% after mutation resolves.

---

## Verification Checklist

- `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test` passes all new tests.
- `pnpm check` shows no TypeScript errors in `ImportPresentationDialog.tsx`.
- Component renders inside the Radix Dialog without layout issues.
- Uploading a valid .pptx file advances through uploading → processing → result steps.
- Files over 50 MB show an inline error and do not advance.
- Google Slides tab with a connected account shows the URL input.
- Google Slides tab with no connected account shows "Connect Google Drive".
- Invalid Google Slides URL shows validation error; Import button does not fire.
- Cancel during upload calls `AbortController.abort()` and resets to select.
- Cancel during processing calls `cancelImport` mutation and resets to select.
- "Open Deck" navigates to `/presentation/{deckLibraryItemId}`.
- "Try Again" resets all state to the select step.
- Fidelity warnings are rendered as a list in the result step.