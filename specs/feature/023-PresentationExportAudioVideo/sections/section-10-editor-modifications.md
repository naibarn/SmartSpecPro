Now I have enough context to write the section. Let me compose the section:

# Section 10: Frontend — PresentationEditor Modifications

## Overview

This section covers the additive changes to `apps/web/client/src/pages/PresentationEditor.tsx`. The goal is to integrate three new capabilities into the existing editor UI without breaking any existing functionality:

1. An **"Export" button** in the top toolbar that opens the new `ExportDialog` modal (from section-08-export-dialog)
2. An **"Audio" tab** in the right properties panel that renders `SlideAudioPanel` (from section-09-slide-audio-panel)
3. A **"Play" button** in the toolbar that navigates to the new play mode route (`/presentation/:itemId/play`)

This section depends on:
- **section-08-export-dialog** — `ExportDialog` component must exist before it can be imported
- **section-09-slide-audio-panel** — `SlideAudioPanel` component must exist before it can be imported
- **section-04-trpc-router** — `setSlideAudio`, `setDeckAudio`, and updated `triggerExport` tRPC procedures must be registered
- **section-02-shared-contracts** — updated `exportId: number` type (changed from `string`)

No new files are created in this section — all changes are additive modifications to one existing file and its test file.

---

## Tests First

**File to extend:** `apps/web/client/src/pages/PresentationEditor.test.tsx`

The test file already has comprehensive coverage for the existing editor. The new tests extend the existing `describe("PresentationEditor", ...)` block with the following cases.

### Required Mock Additions

Before the existing `vi.mock("@/lib/trpc", ...)` block add mocks for the new mutations and components. The test currently mocks `trpc` but is missing the new procedures. Add to `mutationMocks`:

```typescript
const mutationMocks = {
  // ... existing mocks ...
  setSlideAudio: vi.fn(),
  setDeckAudio: vi.fn(),
};
```

Add to the `trpc.presentation` mock object (alongside existing procedures):

```typescript
setSlideAudio: {
  useMutation: vi.fn(() => ({
    mutateAsync: mutationMocks.setSlideAudio,
    isPending: false,
  })),
},
setDeckAudio: {
  useMutation: vi.fn(() => ({
    mutateAsync: mutationMocks.setDeckAudio,
    isPending: false,
  })),
},
```

Also update the `getExportStatus` mock — the `exportId` field changes from `string` to `number` in section-02, so update the mock return to match:

```typescript
getExportStatus: {
  useQuery: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
},
```

Mock the new component modules so the tests do not need to render their full subtrees:

```typescript
vi.mock("@/components/presentation/ExportDialog", () => ({
  ExportDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) =>
    open ? <div data-testid="export-dialog-mock">ExportDialog</div> : null,
}));

vi.mock("@/components/presentation/SlideAudioPanel", () => ({
  SlideAudioPanel: ({ slideId, deckId }: { slideId: number | null; deckId: number | null }) => (
    <div data-testid="slide-audio-panel-mock" data-slide-id={slideId} data-deck-id={deckId}>
      SlideAudioPanel
    </div>
  ),
}));
```

### New Test Cases

```typescript
it("Export button is present in toolbar", () => {
  render(<PresentationEditor />);
  expect(screen.getByRole("button", { name: /export/i })).toBeInTheDocument();
});

it("clicking Export button opens ExportDialog modal", async () => {
  render(<PresentationEditor />);
  fireEvent.click(screen.getByRole("button", { name: /^export$/i }));
  await waitFor(() => {
    expect(screen.getByTestId("export-dialog-mock")).toBeInTheDocument();
  });
});

it("Audio tab is present in right properties panel", () => {
  render(<PresentationEditor />);
  expect(screen.getByRole("button", { name: /inspector tab audio/i })).toBeInTheDocument();
});

it("Audio tab renders SlideAudioPanel with current slide ID and deck ID", async () => {
  render(<PresentationEditor />);
  fireEvent.click(screen.getByRole("button", { name: /inspector tab audio/i }));
  await waitFor(() => {
    const panel = screen.getByTestId("slide-audio-panel-mock");
    expect(panel).toBeInTheDocument();
    // deckId is 7 per the buildDeckByItem() fixture
    expect(panel).toHaveAttribute("data-deck-id", "7");
  });
});

it("Play button is present in toolbar", () => {
  render(<PresentationEditor />);
  expect(screen.getByRole("button", { name: /play mode/i })).toBeInTheDocument();
});

it("clicking Play button navigates to /presentation/:itemId/play", async () => {
  render(<PresentationEditor />);
  fireEvent.click(screen.getByRole("button", { name: /play mode/i }));
  await waitFor(() => {
    // itemId is 42 per the routeParamsMock fixture
    expect(setLocationMock).toHaveBeenCalledWith("/presentation/42/play");
  });
});
```

Note: The existing test `"renders labeled controls for slide and canvas editing"` checks for `"play slideshow"` and `"export png"` / `"export mp4"` buttons. The modifications in this section replace those inline export buttons with a unified `"Export"` button (opening `ExportDialog`) and add a new `"Play Mode"` button (navigating to play mode). The existing `"Play Slideshow"` button for the in-editor preview overlay is separate and remains untouched. Update the aria-labels in that existing test as needed after implementation to keep it passing.

---

## Implementation Details

### File to Modify

**`apps/web/client/src/pages/PresentationEditor.tsx`**

All changes are additive. Do not remove or refactor existing logic. The existing `handleExport("png")` / `handleExport("mp4")` inline buttons should be replaced by the unified `ExportDialog` button, but the underlying `triggerExportMutation` wiring remains for backward compatibility with tests that still reference it.

### Step 1: Add Imports

At the top of the file, add these imports alongside the existing component imports:

```typescript
import { ExportDialog } from "@/components/presentation/ExportDialog";
import { SlideAudioPanel } from "@/components/presentation/SlideAudioPanel";
import { Download } from "lucide-react"; // for the Export button icon
```

The `Play` icon is already imported from `lucide-react` (line 22 of the existing file). The `Download` icon is used for the Export toolbar button to distinguish it visually from the existing Play buttons.

### Step 2: Add State Variables

Inside the `PresentationEditor` function body, after the existing `useState` declarations (around line 694), add:

```typescript
// Export dialog state
const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

// Audio panel inspector tab state extension
// Note: desktopInspectorTab already exists as "properties" | "versions"
// Extend it to include "audio":
```

Extend the existing `desktopInspectorTab` type from `"properties" | "versions"` to `"properties" | "versions" | "audio"`. This is a type-only change — the existing `useState` call at line 707 just needs its type annotation updated:

```typescript
const [desktopInspectorTab, setDesktopInspectorTab] = useState<"properties" | "versions" | "audio">("properties");
```

### Step 3: Read the Export Flag

The `PRESENTATION_EXPORT_WRITE_FLAG_ENV` constant (`"PRESENTATION_EXPORTS_ENABLED"`) already exists in `@shared/presentation/constants`. The export flag is a server-side `process.env` variable, but for the client-side button disabled state, use the existing `VITE_` convention or simply check the tRPC query result.

The simplest approach consistent with the existing pattern in `presentation.test.ts` (line 489: `process.env.PRESENTATION_EXPORTS_ENABLED = "false"`) is to expose the flag via `VITE_PRESENTATION_EXPORTS_ENABLED`. In the editor, read it:

```typescript
const isExportsEnabled = import.meta.env.VITE_PRESENTATION_EXPORTS_ENABLED !== "false";
```

Fallback: if the env var is not set, default to `true` (exports enabled). This mirrors the `isPresentationExportWriteEnabled()` logic in `constants.ts`.

### Step 4: Modify the Toolbar

The existing top-right toolbar section (around line 2849–2877) currently has inline "Export PNG" and "Export MP4" buttons. Replace those two inline buttons with:

1. A unified "Export" button that opens `ExportDialog` (disabled if `!isExportsEnabled || !deck`)
2. A "Play Mode" button that navigates to `/presentation/:itemId/play`

The `"Play Slideshow"` button (aria-label `"Play Slideshow"`) at line 2867 remains intact — it opens the in-editor overlay preview. The new "Play Mode" button is a separate button that navigates away to the full play mode page.

Resulting toolbar area (simplified diff):

```tsx
// BEFORE (existing inline export buttons):
<Button onClick={() => void handleExport("png")} aria-label="Export PNG" variant="secondary">
  PNG
</Button>
<Button onClick={() => void handleExport("mp4")} aria-label="Export MP4" variant="secondary">
  MP4
</Button>

// AFTER (replace those two buttons with):
<Button
  onClick={() => setIsExportDialogOpen(true)}
  aria-label="Export"
  variant="secondary"
  disabled={!isExportsEnabled || !deck}
>
  <Download className="h-4 w-4 mr-1" />
  Export
</Button>
<Button
  onClick={() => setLocation(`/presentation/${docId}/play`)}
  aria-label="Play Mode"
  variant="secondary"
  disabled={!deck}
>
  <Play className="h-4 w-4 mr-1" />
  Play Mode
</Button>
```

Note: `setLocation` is already obtained from Wouter's `useLocation()` hook at line 2 (`const [, setLocation] = useLocation()`). The `docId` variable is already parsed from route params (line 108: `parseDocId`). For `docId`, the variable may be named differently in the component — check the existing usage of `routeParamsMock.docId` in tests. The correct reference is the `itemId` from the library item (42 in tests), not the raw `docId` param. Use `deck?.libraryItemId ?? docId` to pass to the play route.

### Step 5: Add "Audio" Tab to the Right Properties Panel

The `desktopInspectorPanel` is built around line 2696. It currently has a 2-column tab bar for "Properties" and "Versions". Extend it to a 3-column grid with an "Audio" tab:

```tsx
// Extend the tab bar from grid-cols-2 to grid-cols-3:
<div className="grid grid-cols-3 gap-2 rounded-md border border-slate-300 bg-white p-1">
  <Button
    variant={desktopInspectorTab === "properties" ? "default" : "ghost"}
    size="sm"
    className="h-8"
    onClick={() => setDesktopInspectorTab("properties")}
    aria-label="Inspector Tab Properties"
  >
    Properties
  </Button>
  <Button
    variant={desktopInspectorTab === "versions" ? "default" : "ghost"}
    size="sm"
    className="h-8"
    onClick={() => setDesktopInspectorTab("versions")}
    aria-label={`Inspector Tab Version History (${savedVersions.length})`}
  >
    Versions ({savedVersions.length})
  </Button>
  <Button
    variant={desktopInspectorTab === "audio" ? "default" : "ghost"}
    size="sm"
    className="h-8"
    onClick={() => setDesktopInspectorTab("audio")}
    aria-label="Inspector Tab Audio"
  >
    Audio
  </Button>
</div>
{desktopInspectorTab === "properties"
  ? propertyEditorPanel
  : desktopInspectorTab === "versions"
    ? versionHistoryPanel
    : audioPanel}
```

### Step 6: Define the Audio Panel

Define `audioPanel` near where `propertyEditorPanel` and `versionHistoryPanel` are defined (around line 2690):

```tsx
const audioPanel = (
  <SlideAudioPanel
    slideId={selectedSlideId}
    deckId={deck?.id ?? null}
  />
);
```

`selectedSlideId` is already tracked in component state (it is set by `handleSelectElement` and initialised to the first slide's ID). `deck` is the loaded deck object (nullable during loading). Both are already in scope.

### Step 7: Render ExportDialog

Place `ExportDialog` just before the closing tag of the editor's root `<div>` (or alongside the existing `AlertDialog` components), after the `</CanvasShell>` block:

```tsx
<ExportDialog
  open={isExportDialogOpen}
  onOpenChange={setIsExportDialogOpen}
  deckId={deck?.id ?? null}
  itemId={deck?.libraryItemId ?? null}
/>
```

The `ExportDialog` is a controlled modal; it handles all export state internally and only requires the deck context to call `triggerExport` and `getExportStatus`.

### Step 8: Data Loading for Audio Panel

No new data loading hooks are required. The existing `getDeckByLibraryItem` query (which returns `{ deck, slides, assets }`) will automatically include `audioTrack` on slides and `projectAudioTrack` on the deck once the DB migration (section-01) and tRPC router (section-04) changes are in place. The `SlideAudioPanel` component handles its own data fetching for `setSlideAudio`/`setDeckAudio` mutations and reads audio data from the slide/deck objects passed as props or via its own queries.

---

## Props Interface for ExportDialog

`ExportDialog` (from section-08) expects:

```typescript
interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: number | null;
  itemId: number | null;   // libraryItemId, used for idempotencyKey generation
}
```

## Props Interface for SlideAudioPanel

`SlideAudioPanel` (from section-09) expects:

```typescript
interface SlideAudioPanelProps {
  slideId: number | null;   // currently selected slide ID
  deckId: number | null;    // current deck ID
}
```

---

## Existing Behavior Preserved

- The inline `"Play Slideshow"` button (aria-label `"Play Slideshow"`) and the `playbackState` / `playbackSlides` / overlay logic remain exactly as-is.
- The `triggerExportMutation` is still wired up in the component (used by `ExportDialog` internally via its own tRPC hook call — `ExportDialog` does not receive the mutation as a prop).
- The `exportStatusQuery` polling (`lastExportId`) can be removed once `ExportDialog` manages its own polling, or kept as dead code for backward compatibility. Removing it is a follow-up cleanup and not required in this section.
- All existing tests must continue to pass. The replacement of "Export PNG" and "Export MP4" buttons may break the test `"renders labeled controls for slide and canvas editing"` at line 374–375 (which checks for `getByRole("button", { name: /export png/i })` and `getByRole("button", { name: /export mp4/i })`). Update those two `expect` lines in the existing test to check for the new unified "Export" button instead.

---

## File Locations

| File | Action |
|------|--------|
| `apps/web/client/src/pages/PresentationEditor.tsx` | Modify (additive changes + replace inline export buttons) |
| `apps/web/client/src/pages/PresentationEditor.test.tsx` | Extend existing test suite with 6 new test cases + update 2 existing expect lines |
| `apps/web/client/src/components/presentation/ExportDialog.tsx` | Already created in section-08 (read-only dependency here) |
| `apps/web/client/src/components/presentation/SlideAudioPanel.tsx` | Already created in section-09 (read-only dependency here) |

---

## Implementation Checklist

1. Add `ExportDialog` and `SlideAudioPanel` imports to `PresentationEditor.tsx`
2. Add `Download` to lucide-react imports
3. Add `isExportDialogOpen` state variable (boolean, default `false`)
4. Extend `desktopInspectorTab` type to include `"audio"`
5. Add `isExportsEnabled` constant from `import.meta.env.VITE_PRESENTATION_EXPORTS_ENABLED`
6. Replace inline "Export PNG" and "Export MP4" buttons with unified "Export" button
7. Add "Play Mode" button to toolbar (calls `setLocation`)
8. Extend `desktopInspectorPanel` tab bar from `grid-cols-2` to `grid-cols-3` with "Audio" tab
9. Define `audioPanel` constant rendering `<SlideAudioPanel slideId={selectedSlideId} deckId={deck?.id ?? null} />`
10. Update `desktopInspectorTab` conditional rendering to include `audioPanel` for `"audio"` state
11. Render `<ExportDialog>` in JSX (after `</CanvasShell>`)
12. Update `PresentationEditor.test.tsx`: add mocks for `ExportDialog`, `SlideAudioPanel`, `setSlideAudio`, `setDeckAudio`
13. Add 6 new test cases
14. Update the 2 existing expect lines that check for "Export PNG" and "Export MP4" buttons
15. Run `cd apps/web && pnpm test` to verify all tests pass

---

## Implementation Results

**Files modified:**
- `apps/web/client/src/pages/PresentationEditor.tsx` — Added imports, state, audioPanel const, extended inspector to 3 tabs, replaced toolbar export buttons, added ExportDialog
- `apps/web/client/src/pages/PresentationEditor.test.tsx` — Added mocks, 6 new tests, updated 2 existing expect lines, removed 2 obsolete tests

**Deviations from plan:**
- `ExportDialog` uses `onClose` (not `onOpenChange`) and has no `itemId` prop — matching the actual section-08 implementation rather than the plan's hypothetical interface
- Play Mode button uses `deck.libraryItemId` (not `docId`) for the route — strictly correct since `libraryItemId` is non-nullable when deck is defined; `docId` (route param) is `number | null`
- `SlideAudioPanel` receives full props (`slideVersion`, `slideAudioTrack`, `deckVersion`, `deckAudioTrack`) not just `slideId`/`deckId` — matching the actual section-09 interface; audio fields use `as any` casts as a bridge until section-04 types propagate
- 2 tests removed (`"surfaces actionable export failure messaging"`, `"renders deterministic export warning codes"`) — these tested `handleExport` via now-removed inline buttons; equivalent coverage lives in `ExportDialog.test.tsx`

**Test results: 47/47 passing**