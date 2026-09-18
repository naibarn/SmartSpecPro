I now have all the context needed. Let me produce the section content.

# Section 2: Dialog Component and Layout

## Overview

This section creates the full-screen `SilenceDetectionDialog.tsx` modal component, converts the existing `SilenceDetectionPanel.tsx` sidebar into a trigger button, and wires up the dialog state in `VideoEditorPhase3.tsx`. It also includes the waveform data availability check that fires on dialog open.

**Dependencies:** Section 01 (types and shared logic) must be complete -- specifically the extended `SilentRegion` interface, `SilenceDetectionDialogState`, and `AnalysisStage` type must exist in `apps/web/client/src/types/videoEditor.ts`.

**Blocks:** Section 03 (settings/detection flow), Section 07 (preview/skip-silence), Section 08 (export to timeline).

---

## Files Involved

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/client/src/components/videoeditor/__tests__/SilenceDetectionDialog.test.tsx` | **Create** | Tests for the dialog component |
| `apps/web/client/src/components/videoeditor/__tests__/SilenceDetectionPanelTrigger.test.tsx` | **Create** | Tests for the converted sidebar trigger |
| `apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx` | **Create** | Full-screen dialog component |
| `apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx` | **Modify** | Replace full panel content with a trigger button |
| `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx` | **Modify** | Add `showSilenceDialog` state, render dialog, add `handleSilenceExportToTimeline` stub |

---

## Tests (Write First)

All tests use Vitest with `@testing-library/react`. Since there are no existing video editor component tests in the codebase, these establish the testing pattern for the feature.

### Test File: `apps/web/client/src/components/videoeditor/__tests__/SilenceDetectionDialog.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SilenceDetectionDialog from "../SilenceDetectionDialog";
import type { VideoEditorProject, SilentRegion } from "../../../types/videoEditor";
import { createEmptyProject } from "../../../types/videoEditor";

/**
 * Tests for SilenceDetectionDialog component.
 *
 * Validates:
 * - Structural rendering (header, settings, timeline, footer zones)
 * - Close behavior (X button, ESC key via Radix Dialog)
 * - Export button disabled states
 * - Waveform data availability check on open
 * - Responsive layout breakpoint at 1280px
 */

// Stub project factory for tests
function makeTestProject(): VideoEditorProject {
  const p = createEmptyProject("Test");
  // Add a minimal audio track with a clip referencing an asset
  // (implementer fills in the exact shape)
  return p;
}

describe("SilenceDetectionDialog", () => {
  const mockOnClose = vi.fn();
  const mockOnExport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test: dialog renders with header, settings zone, timeline zone, and footer
  it("renders all four structural zones", () => {
    // Render the dialog, assert presence of:
    //   - Header containing "Silence Detection" title and close button
    //   - Settings zone (right/bottom panel area)
    //   - Timeline zone (bottom area)
    //   - Footer containing "Export to Timeline" button
  });

  // Test: dialog calls onClose when X button clicked
  it("calls onClose when X button is clicked", () => {
    // Render dialog, click the close (X) button, assert mockOnClose was called
  });

  // Test: dialog calls onClose when ESC key pressed (Radix Dialog handles this)
  it("calls onClose on ESC key press", () => {
    // Render dialog, fire ESC keydown, assert mockOnClose was called
    // Note: Radix Dialog.Content handles ESC natively
  });

  // Test: "Export to Timeline" button is disabled when no analysis has been performed
  it("disables Export button when no analysis has been performed", () => {
    // Render dialog with default state (no analysis done)
    // Assert the Export button has disabled attribute
  });

  // Test: "Export to Timeline" button is disabled when no regions are selected
  it("disables Export button when no regions are selected", () => {
    // This test requires simulating a post-analysis state with all regions deselected
    // Assert the Export button has disabled attribute
  });

  // Test: responsive layout switches from side-by-side to stacked at 1280px breakpoint
  it("uses responsive layout classes for 1280px breakpoint", () => {
    // Render dialog, inspect the main content container for CSS classes or
    // media query-driven flex-direction. The implementation uses a CSS media
    // query at 1280px; this test verifies the class is present.
  });
});

describe("SilenceDetectionDialog — Waveform Data Availability", () => {
  // Test: triggers waveform_peaks job when asset.waveformData is undefined on dialog open
  it("triggers waveform_peaks job when waveformData is missing", () => {
    // Render dialog with a project whose asset has waveformData: undefined
    // Assert that createMediaJobClient().getWaveformPeaks() was called
  });

  // Test: shows loading skeleton while waveform data is being fetched
  it("shows loading skeleton while fetching waveform data", () => {
    // Render dialog, assert a skeleton/loading indicator is visible in the timeline zone
  });

  // Test: shows "Waveform unavailable" message when waveform generation fails
  it('shows "Waveform unavailable" on waveform fetch failure', () => {
    // Mock getWaveformPeaks to reject, render dialog, assert fallback message
  });

  // Test: does not trigger job when waveformData already exists
  it("does not fetch waveform when data already exists", () => {
    // Render dialog with asset.waveformData = [0.1, 0.2, ...]
    // Assert getWaveformPeaks was NOT called
  });
});
```

### Test File: `apps/web/client/src/components/videoeditor/__tests__/SilenceDetectionPanelTrigger.test.tsx`

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SilenceDetectionPanel from "../SilenceDetectionPanel";

/**
 * Tests for the converted SilenceDetectionPanel (now a trigger button).
 *
 * After the conversion, the panel no longer contains sliders, region
 * lists, or analysis logic. It is a single styled button that opens
 * the full-screen SilenceDetectionDialog.
 */

describe("SilenceDetectionPanel (trigger mode)", () => {
  // Test: renders a trigger button with "Open Silence Detection" text
  it('renders trigger button with "Open Silence Detection" text', () => {
    // Render the panel, assert that text "Open Silence Detection" is present
  });

  // Test: calls onOpenDialog callback when button clicked
  it("calls onOpenDialog when button is clicked", () => {
    // Render with a mock onOpenDialog prop, click the button, assert called
  });
});
```

---

## Implementation Details

### 1. Convert `SilenceDetectionPanel.tsx` to a Trigger Button

**File:** `apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx`

The existing panel (430 lines of sliders, region lists, and analysis logic) is replaced entirely with a compact trigger card. The analysis logic, sliders, and region list move into the dialog (sections 03 and 04).

**New props interface:**

```typescript
interface SilenceDetectionPanelProps {
  onOpenDialog: () => void;
}
```

The component renders a styled card/button containing:
- An icon (muted speaker or waveform icon)
- Title: "Silence Detection"
- Brief description: "Automatically detect and remove silent regions from your video"
- A call-to-action button labeled "Open Silence Detection"

When clicked, it calls `props.onOpenDialog()`.

The existing `SilenceDetectionPanel.css` can be stripped down or replaced with minimal styles for the trigger card. Keep the file name unchanged.

**Important:** The old props `onCutAndCombine` and `onAnalyzeComplete` are removed. `VideoEditorPhase3.tsx` must be updated to pass `onOpenDialog` instead (see step 3 below).

### 2. Create `SilenceDetectionDialog.tsx`

**File:** `apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx`

This is a new full-screen modal dialog. It follows the pattern established by `ExportDialog.tsx` and `RenderProgressDialog.tsx` in the same directory: a `<div>` overlay with inline `<style>` for CSS-in-JS.

However, unlike `ExportDialog` which uses raw `<div>` overlays, the silence detection dialog uses **Radix UI Dialog primitives** from `@/components/ui/dialog` for built-in focus trapping, ESC-to-close, and ARIA support. The project already has the `@radix-ui/react-dialog` package available via `packages/ui`, and the shared Dialog components (`Dialog`, `DialogPortal`, `DialogOverlay`, `DialogContent`, `DialogTitle`, `DialogClose`) are importable from `@/components/ui/dialog`.

**Props interface:**

```typescript
interface SilenceDetectionDialogProps {
  project: VideoEditorProject;
  onExportToTimeline: (
    selectedRegions: SilentRegion[],
    applyToAllTracks: boolean,
  ) => void;
  onClose: () => void;
}
```

All detection state is local to the dialog. The dialog communicates results upward only via `onExportToTimeline`. This keeps the main editor state clean and makes the dialog self-contained.

**Three-zone layout:**

1. **Header zone** -- Contains:
   - A back/close button (left side) for returning to the editor
   - Title text: "Silence Detection"
   - A close (X) button (right side) using `DialogClose`

2. **Main content area** -- A flex container that switches direction at the 1280px breakpoint:
   - **Above 1280px (desktop):** `flex-direction: row` -- preview player on the left (~60% width), settings panel on the right (~40% width)
   - **Below 1280px (mobile/tablet):** `flex-direction: column` -- preview player stacked on top, settings below

   The left/top zone is a placeholder for `PreviewPlayer` (wired in section 07). The right/bottom zone is a placeholder for the settings panel (wired in section 03). Both zones render skeleton placeholders until their respective sections are implemented.

3. **Bottom zone** -- The `SilenceTimeline` area (wired in section 06). Initially renders a placeholder container.

4. **Footer zone** -- Contains:
   - An "Apply to all tracks" toggle switch (left side)
   - An "Export to Timeline" button (right side), disabled when `!analysisComplete || selectedRegionCount === 0`

**Internal state (individual `useState` hooks, not a monolithic state object):**

```typescript
const [config, setConfig] = useState<SilenceDetectionConfig>({...defaults});
const [regions, setRegions] = useState<SilentRegion[]>([]);
const [analysisComplete, setAnalysisComplete] = useState(false);
const [isAnalyzing, setIsAnalyzing] = useState(false);
const [analysisStage, setAnalysisStage] = useState<AnalysisStage>('idle');
const [playbackTime, setPlaybackTime] = useState(0);
const [timelineZoom, setTimelineZoom] = useState(100); // px/s
const [skipSilencePreview, setSkipSilencePreview] = useState(false);
const [applyToAllTracks, setApplyToAllTracks] = useState(false);
const [waveformData, setWaveformData] = useState<number[] | null>(null);
const [waveformLoading, setWaveformLoading] = useState(false);
const [waveformError, setWaveformError] = useState(false);
```

**Styling approach:** Inline `<style>` tag within the component (matching ExportDialog pattern). Dark theme colors:
- Background: `#1a1a1a`
- Panel backgrounds: `#2a2a2a`
- Text: `#e0e0e0`
- Accent/primary: `#0078d4`
- Borders: `#444`

**Z-index:** The dialog overlay uses z-index 2000+ to render above other editor overlays (the ExportDialog uses z-index 1000).

**Radix Dialog integration:**

```typescript
<Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
  <DialogPortal>
    <DialogOverlay className="silence-dialog-overlay" />
    <DialogContent
      className="silence-dialog-content"
      showCloseButton={false}  // We render our own header with close button
    >
      {/* Header, main content, timeline, footer */}
    </DialogContent>
  </DialogPortal>
</Dialog>
```

The `DialogContent` wrapper from `@/components/ui/dialog` includes `DialogOverlay` automatically inside `DialogPortal`, but for the full-screen case, override the content's `className` to use `max-w-none w-screen h-screen` (or equivalent full-viewport styles). The `showCloseButton={false}` prop prevents the default Radix close button since we render a custom header.

### 3. Waveform Data Availability Check

On dialog mount (`useEffect` with empty deps), check if the target clip's asset has `waveformData`:

```typescript
useEffect(() => {
  // Find the first audio track's first clip's asset
  const audioTracks = project.timeline.tracks.filter(
    (t) => t.type === "audio" && t.clips.length > 0,
  );
  if (audioTracks.length === 0) return;

  const firstClip = audioTracks[0].clips[0];
  const asset = project.assets[firstClip.assetId];
  if (!asset) return;

  if (asset.waveformData && asset.waveformData.length > 0) {
    setWaveformData(asset.waveformData);
    return;
  }

  // Waveform data missing -- trigger generation
  setWaveformLoading(true);
  const fetchWaveform = async () => {
    try {
      const client = await createMediaJobClient();
      const result = await client.getWaveformPeaks(asset.path);
      const peaks = (result as any).derived?.peaks || [];
      setWaveformData(peaks);
    } catch (err) {
      console.error("Waveform generation failed:", err);
      setWaveformError(true);
    } finally {
      setWaveformLoading(false);
    }
  };
  fetchWaveform();
}, []);
```

In the timeline zone, render conditionally based on state:
- `waveformLoading === true`: Show a loading skeleton (pulsing placeholder bars)
- `waveformError === true`: Show "Waveform unavailable" message. Analysis and export still work -- waveform visualization is optional.
- `waveformData !== null`: Pass data to timeline components (section 06)

### 4. Wire Up Dialog in `VideoEditorPhase3.tsx`

**File:** `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`

**Changes:**

1. **Add state:**
   ```typescript
   const [showSilenceDialog, setShowSilenceDialog] = useState(false);
   ```

2. **Add import:**
   ```typescript
   import SilenceDetectionDialog from "./SilenceDetectionDialog";
   ```

3. **Update the `SilenceDetectionPanel` render** (around line 2037-2041). Change from:
   ```typescript
   {sidebarView === "silence" && (
     <SilenceDetectionPanel
       project={project}
       onCutAndCombine={handleCutAndCombine}
     />
   )}
   ```
   To:
   ```typescript
   {sidebarView === "silence" && (
     <SilenceDetectionPanel
       onOpenDialog={() => setShowSilenceDialog(true)}
     />
   )}
   ```

4. **Add a stub `handleSilenceExportToTimeline`** (the real implementation is section 08):
   ```typescript
   const handleSilenceExportToTimeline = useCallback(
     (selectedRegions: SilentRegion[], applyToAllTracks: boolean) => {
       // Section 08 implements the full clip splitting + ripple delete logic.
       // For now, close the dialog and log.
       console.log("Export to timeline:", selectedRegions.length, "regions");
       setShowSilenceDialog(false);
     },
     [],
   );
   ```

5. **Render the dialog** after the existing ExportDialog/RenderProgressDialog block (around line 2069):
   ```typescript
   {showSilenceDialog && (
     <SilenceDetectionDialog
       project={project}
       onExportToTimeline={handleSilenceExportToTimeline}
       onClose={() => setShowSilenceDialog(false)}
     />
   )}
   ```

This follows the exact same conditional rendering pattern used by `ExportDialog` (line 2054) and `RenderProgressDialog` (line 2063) in the existing code.

### 5. CSS Architecture Notes

The dialog's `<style>` tag should define at minimum these classes:

| Class | Purpose |
|-------|---------|
| `.silence-dialog-overlay` | Full-viewport overlay, `rgba(0,0,0,0.9)` background, z-index 2000 |
| `.silence-dialog-content` | Full-screen container, `#1a1a1a` background, flex column |
| `.silence-dialog-header` | Header bar with back button, title, close button |
| `.silence-dialog-main` | Flex row (desktop) / column (mobile), `flex: 1`, overflow hidden |
| `.silence-dialog-preview` | Left/top zone, 60% width on desktop |
| `.silence-dialog-settings` | Right/bottom zone, 40% width on desktop, overflow-y auto |
| `.silence-dialog-timeline` | Bottom zone, fixed height (~200px), border-top |
| `.silence-dialog-footer` | Footer bar with export button and toggle |

**Responsive media query:**
```css
@media (max-width: 1279px) {
  .silence-dialog-main {
    flex-direction: column;
  }
  .silence-dialog-preview,
  .silence-dialog-settings {
    width: 100%;
  }
}
```

---

## Integration Points with Other Sections

| Section | Integration Point |
|---------|-------------------|
| **Section 01** | Types used: `SilentRegion`, `SilenceDetectionConfig`, `AnalysisStage`, `SilenceDetectionDialogState`. Helpers used: `applyBufferToRegions()`, `dbToPercent()`. |
| **Section 03** | The settings panel (sliders + Analyze button) renders inside `.silence-dialog-settings`. Section 03 builds the actual settings UI; this section provides the container and the state hooks it reads/writes. |
| **Section 04** | `SilenceRegionList` renders inside `.silence-dialog-settings`, below the settings panel. |
| **Section 05** | `SilenceWaveformOverlay` renders inside the timeline zone, stacked on `WaveformCanvas`. |
| **Section 06** | `SilenceTimeline` renders in `.silence-dialog-timeline`. This section provides the container; section 06 builds the timeline internals. |
| **Section 07** | `PreviewPlayer` renders inside `.silence-dialog-preview`. This section provides the container and playback state hooks; section 07 wires the player and skip-silence logic. |
| **Section 08** | `handleSilenceExportToTimeline` in `VideoEditorPhase3.tsx` is stubbed here. Section 08 provides the full implementation with clip splitting and ripple delete. |

---

## Verification Checklist

After implementation, verify:

1. Clicking the "Silence" sidebar tab shows a trigger button (not the old full panel)
2. Clicking the trigger button opens the full-screen dialog
3. The dialog renders with all four zones visible (header, main, timeline, footer)
4. Pressing ESC closes the dialog
5. Clicking the X button closes the dialog
6. The "Export to Timeline" button is disabled by default (no analysis done)
7. On desktop (viewport > 1280px), preview and settings are side-by-side
8. On narrow viewports (< 1280px), preview and settings stack vertically
9. If the clip's asset has no `waveformData`, a loading skeleton appears in the timeline zone and `getWaveformPeaks` is called
10. If waveform generation fails, "Waveform unavailable" message appears but the dialog remains functional
11. All tests pass: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`

---

## Implementation Notes (Actual)

### Deviations from Plan

1. **DialogPrimitive.Content used directly** instead of the shared `DialogContent` wrapper. The wrapper internally renders its own `<DialogPortal>` and `<DialogOverlay>`, causing double portal/overlay rendering. Using `DialogPrimitive.Content` from `@radix-ui/react-dialog` directly avoids this.

2. **`aria-describedby={undefined}`** added to opt out of Radix's `DialogDescription` requirement, since this full-screen dialog doesn't use a short description.

3. **`useMemo` for skeleton bar heights** — `Math.random()` was moved out of the render path into a memoized array to prevent visual flicker on re-renders.

4. **Mounted ref guard** added to the waveform fetch `useEffect` to prevent state updates on unmounted components.

5. **`project` added to useEffect deps** instead of empty `[]` to handle potential project changes while dialog is open.

6. **`AssetWithWaveform` interface** created to replace `as any` casts for waveform data access on assets.

7. **`@keyframes silence-pulse`** renamed from generic `pulse` to avoid collision with Tailwind's `animate-pulse`.

### Additional Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/client/src/test-setup.ts` | **Create** | Module._resolveFilename hook to fix React 18/19 version mismatch in monorepo + explicit RTL cleanup |
| `apps/web/vitest.config.ts` | **Modify** | Added `@vitejs/plugin-react`, `resolve.dedupe`, `resolve.alias` for React, `server.deps.inline`, `environmentMatchGlobs` for jsdom auto-assignment to .test.tsx files |
| `apps/web/package.json` | **Modify** | Added devDependencies: `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `happy-dom` |

### Test Results

- **29 tests passing** across 3 files:
  - `silenceDetectionUtils.test.ts`: 16 tests (Section 01)
  - `SilenceDetectionPanelTrigger.test.tsx`: 3 tests
  - `SilenceDetectionDialog.test.tsx`: 10 tests (6 structural + 4 waveform)

### Monorepo React Version Issue

Root `node_modules` has React 18.3.1 (pulled by `reactflow` in root `package.json`), while `apps/web/node_modules` has React 19.2.3. `@testing-library/react` is hoisted to root and resolves `react-dom` v18 instead of v19, causing "Objects are not valid as a React child" errors.

**Fix:** `test-setup.ts` patches `Module._resolveFilename` to redirect all `react`/`react-dom` imports to `apps/web/node_modules` versions. This is a Node.js internal API — fragile but necessary until the root React 18 dependency is removed.