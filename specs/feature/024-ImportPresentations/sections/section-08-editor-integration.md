# Implementation Status: COMPLETE

**Commit:** (see deep_implement_config.json)
**Tests:** 3 new tests, all passing
**Files modified:** `PresentationEditor.tsx`, `PresentationEditor.test.tsx`, `ImportPresentationDialog.tsx` (onClose/setLocation fix)

**Actual deviations from plan:**
- Added `title` tooltip attribute to Import button (code review M1 fix)
- Swapped `onClose()` / `setLocation()` order in `ImportPresentationDialog.handleOpenDeck` to prevent state-update-on-unmounted-component warning (code review L1 fix)
- Pre-existing unstaged changes to `PresentationEditor.tsx` (Shapes icon, GraphicsPanel, ReactElement, handleInsertGraphic function) were swept into the commit

---

# Section 08: Frontend — PresentationEditor Integration

## Overview

This section describes modifications to the existing `PresentationEditor` page component to expose the import capability to the user. The work is intentionally minimal: add one state variable, one toolbar button, and one conditionally rendered dialog component.

**Prerequisite:** Section 07 (ImportPresentationDialog) must be complete before this section can be implemented. The dialog component and its props interface must already exist.

**Dependency:** Section 05 (tRPC Router) must be complete because `ImportPresentationDialog` internally calls `trpc.presentationImport.*` procedures.

---

## Files to Modify

- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx` — add Import button and dialog

**No new files are created by this section.**

---

## Tests First

Tests live in the existing file `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.test.tsx`. Add a new `describe` block (or extend the existing one) for the import integration cases.

**Test command:** `cd apps/web && pnpm test`

### Test Setup Context

The existing test file already mocks:
- `@/lib/trpc` — the full `trpc` object with all presentation/library procedures
- `@/contexts/AuthContext`
- `wouter`
- `@/components/presentation/ExportDialog` (as a simple mock that renders a `data-testid` element when `open` is true)
- `@/components/presentation/SlideAudioPanel`
- The `PresentationEditor` component itself is rendered directly with `render(<PresentationEditor />)`

For the import dialog, add a parallel mock at the top of the test file:

```typescript
vi.mock("@/components/presentation/ImportPresentationDialog", () => ({
  ImportPresentationDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="import-dialog-mock">
      ImportPresentationDialog
      <button onClick={onClose}>Close Import</button>
    </div>
  ),
}));
```

Also extend the `trpc` mock to include the `presentationImport` namespace (required because `PresentationEditor` now renders `ImportPresentationDialog` which may call these procedures — though since the dialog is mocked the procedures won't actually be called, so a minimal stub is sufficient):

```typescript
// Inside the existing vi.mock("@/lib/trpc", ...) object:
presentationImport: {
  startImport: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })) },
  getImportStatus: { useQuery: vi.fn(() => ({ data: null, isLoading: false })) },
  cancelImport: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })) },
},
```

### Required Test Cases

```typescript
describe("PresentationEditor — Import button integration", () => {
  it('renders an "Import" button in the toolbar', () => {
    render(<PresentationEditor />);
    expect(screen.getByRole("button", { name: /^import$/i })).toBeInTheDocument();
  });

  it("opens ImportPresentationDialog when Import button is clicked", async () => {
    render(<PresentationEditor />);
    expect(screen.queryByTestId("import-dialog-mock")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("import-dialog-mock")).toBeInTheDocument();
    });
  });

  it("closes ImportPresentationDialog when onClose is called", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    await waitFor(() => expect(screen.getByTestId("import-dialog-mock")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /close import/i }));
    await waitFor(() => {
      expect(screen.queryByTestId("import-dialog-mock")).not.toBeInTheDocument();
    });
  });
});
```

These three cases fully cover the section's scope: button renders, dialog opens, dialog closes.

---

## Implementation

### 1. Add the `isImportDialogOpen` State Variable

Locate the block of `useState` declarations around line 715–720 of `PresentationEditor.tsx`. The existing `isExportDialogOpen` declaration is nearby:

```typescript
const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
```

Add the import dialog state immediately after it:

```typescript
const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
```

### 2. Add the Import to the Import List

At the top of the file, add the `Upload` icon to the existing lucide-react import block, and add the `ImportPresentationDialog` component import alongside the existing dialog imports.

**lucide-react import** — add `Upload` to the existing destructured import:

```typescript
import {
  // ... existing icons ...
  Upload,
  // ...
} from "lucide-react";
```

**Component import** — add alongside the existing `ExportDialog` import (around line 79):

```typescript
import { ImportPresentationDialog } from "@/components/presentation/ImportPresentationDialog";
```

### 3. Add the Import Button in the Toolbar

The header toolbar button group is around line 2987–3012. The Export button currently looks like:

```typescript
<Button
  onClick={() => setIsExportDialogOpen(true)}
  aria-label="Export"
  variant="secondary"
  size="sm"
  className="gap-1"
  disabled={!isExportsEnabled || !deck}
>
  <Download className="h-3.5 w-3.5" />
  <span className="hidden sm:inline">Export</span>
</Button>
```

Insert the Import button immediately **before** the Export button:

```tsx
<Button
  onClick={() => setIsImportDialogOpen(true)}
  aria-label="Import"
  variant="secondary"
  size="sm"
  className="gap-1"
>
  <Upload className="h-3.5 w-3.5" />
  <span className="hidden sm:inline">Import</span>
</Button>
```

Note: the Import button has no `disabled` condition — it is always enabled when the editor is loaded, unlike Export which depends on feature flags and deck availability.

### 4. Render the Dialog Conditionally

The existing `ExportDialog` is rendered near line 3172:

```tsx
{deck && (
  <ExportDialog
    open={isExportDialogOpen}
    onClose={() => setIsExportDialogOpen(false)}
    deckId={deck.id}
  />
)}
```

Add the `ImportPresentationDialog` adjacent to the `ExportDialog` (outside any `deck &&` guard — the dialog itself handles the case where no deck is active yet):

```tsx
{isImportDialogOpen && (
  <ImportPresentationDialog onClose={() => setIsImportDialogOpen(false)} />
)}
```

Place this immediately before or after the `ExportDialog` block. The dialog is rendered conditionally using the short-circuit pattern rather than an `open` prop, following the same pattern the plan specifies.

---

## Summary of Changes

All changes are confined to a single file: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx`.

| Change | Location in file | Lines affected |
|--------|-----------------|---------------|
| Add `Upload` to lucide-react import | ~line 1–36 | 1 line added |
| Add `ImportPresentationDialog` import | ~line 79 | 1 line added |
| Add `isImportDialogOpen` state | ~line 719 | 1 line added |
| Add Import toolbar button | ~line 2991 | ~8 lines added |
| Render dialog conditionally | ~line 3172 | ~3 lines added |

**Total: approximately 14 lines added across 5 locations in one file.**

No other files require changes. No new files are created. No tRPC router changes, no server-side changes.

---

## Verification Steps

1. Run `cd apps/web && pnpm check` — TypeScript should compile without errors. The `ImportPresentationDialog` component's props type (`{ onClose: () => void }`) must match what is passed here.

2. Run `cd apps/web && pnpm test` — all three new tests plus the existing `PresentationEditor` suite must pass. Confirm the existing test `"renders labeled controls..."` still passes (it checks for the Export button by `aria-label="Export"` — the new Import button sits next to it and should not conflict).

3. Manual verification: navigate to any presentation in the editor at `https://smartaihub.app`. Confirm:
   - An "Import" button appears in the header toolbar, to the left of the Export button.
   - Clicking "Import" opens the `ImportPresentationDialog` dialog.
   - Closing the dialog (via any close mechanism the dialog provides) causes it to disappear.
   - The rest of the editor (Export, Play, Save, etc.) is unaffected.