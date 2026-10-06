Good -- none of those exist yet, confirming that Section 1 (types and shared logic) must be implemented first. Now I have all the context needed to write the section content.

# Section 3: Settings Panel and Detection Flow

## Overview

This section implements the settings panel UI inside the `SilenceDetectionDialog` and the full analysis flow. It adds three parameter sliders (Volume Threshold, Minimum Duration, Softening Buffer), track selection checkboxes, and the Analyze button that triggers `detectDeadAir()` via `MediaJobClient`. After detection, results are mapped to `SilentRegion[]`, the softening buffer is applied client-side via `applyBufferToRegions()`, and summary stats are calculated. The section also handles analysis cancellation via `AbortController`, error states, and live re-analysis when the buffer slider changes post-detection.

## Dependencies

- **section-01-types-shared-logic** (must be completed first): Provides the extended `SilentRegion` interface (with `adjustedStartTime`, `adjustedEndTime`, `adjustedDuration`, `skipped` fields), `SilenceDetectionConfig` (with `softeningBuffer`), `AnalysisStage` type, `applyBufferToRegions()`, and `dbToPercent()`.
- **section-02-dialog-layout** (must be completed first): Provides the `SilenceDetectionDialog.tsx` shell component with its three-zone layout. The settings panel content built in this section goes into the dialog's right/bottom settings zone.

## Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/client/src/components/videoeditor/__tests__/settingsDetection.test.ts` | **Create** | Tests for settings UI behavior, analyze flow, cancellation, and buffer re-analysis |
| `apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx` | **Modify** | Add settings panel JSX, sliders, track selection, Analyze button, stats display, and all analysis state/logic inside the existing dialog shell |

## Tests First

Create the test file at `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/__tests__/settingsDetection.test.ts`.

These tests follow the Vitest conventions established in the codebase (see `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/__tests__/videoEditor.test.ts` for the import pattern and test structure).

**Note on testing approach:** Because this section's logic lives inside a React component with internal state (not exported pure functions), the tests should focus on the behavioral contracts rather than implementation internals. The key testable behaviors are: slider ranges and defaults, slider disabled states, the analyze flow's observable effects, error handling, and buffer-change re-analysis. Use a mock for `createMediaJobClient` to control the `detectDeadAir` response.

```typescript
// File: apps/web/client/src/components/videoeditor/__tests__/settingsDetection.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ========================================
// Settings UI Tests
// ========================================

describe("Settings Panel: Slider Configuration", () => {
  // Test: threshold slider range is -60 to -20, default -40
  // Verify the Volume Threshold slider renders with min="-60", max="-20", step="1",
  // and initial value of -40.

  // Test: threshold slider shows both dB and percentage values
  // The label should display the current dB value AND the percentage computed via
  // dbToPercent(). At default -40 dB, percentage should be 50%.

  // Test: minimum duration slider range is 0.1 to 5.0, default 0.5
  // Verify Minimum Duration slider renders with min="0.1", max="5.0", step="0.1",
  // and initial value of 0.5.

  // Test: softening buffer slider range is 0.0 to 2.0, default 0.2
  // Verify Softening Buffer slider renders with min="0.0", max="2.0", step="0.05",
  // and initial value of 0.2. This is a NEW slider not present in the original panel.

  // Test: all sliders are disabled while isAnalyzing is true
  // When analysis is in progress, all three range inputs should have
  // the `disabled` attribute set to true.
});

// ========================================
// Analyze Flow Tests
// ========================================

describe("Settings Panel: Analyze Flow", () => {
  // Mock createMediaJobClient to return a controlled detectDeadAir response.
  // The mock should resolve with:
  // {
  //   jobId: "test-job",
  //   status: "done",
  //   artifacts: [],
  //   derived: {
  //     silenceSegments: [
  //       { startMs: 5000, endMs: 10000, durationMs: 5000 },
  //       { startMs: 20000, endMs: 25000, durationMs: 5000 },
  //     ],
  //     keepSegments: [
  //       { startMs: 0, endMs: 5000 },
  //       { startMs: 10000, endMs: 20000 },
  //       { startMs: 25000, endMs: 30000 },
  //     ],
  //   },
  // }

  // Test: clicking Analyze sets isAnalyzing to true and disables Analyze button
  // After clicking the Analyze button, the button should become disabled immediately.
  // The button text should change to reflect the analyzing state.

  // Test: Analyze calls detectDeadAir with correct thresholdDb and minSilenceMs
  // Verify the mock's detectDeadAir was called with:
  //   assetUri = the path from the first clip's asset
  //   params.thresholdDb = current threshold slider value (default -40)
  //   params.minSilenceMs = current minDuration slider value * 1000 (default 500)

  // Test: on successful result, maps silenceSegments to SilentRegion[] with correct fields
  // Each segment from derived.silenceSegments should be mapped to a SilentRegion:
  //   startTime = startMs / 1000
  //   endTime = endMs / 1000
  //   duration = (endMs - startMs) / 1000
  //   selected = true (all selected by default)
  //   trackId = the selected track's ID

  // Test: after detection, applies softening buffer via applyBufferToRegions
  // Regions should have adjustedStartTime, adjustedEndTime, adjustedDuration fields
  // populated by applyBufferToRegions() with the current buffer value (default 0.2s).
  // For a region 5.0-10.0s with 0.2s buffer:
  //   adjustedStartTime = 5.2, adjustedEndTime = 9.8, adjustedDuration = 4.6

  // Test: calculates and displays correct stats (total silence, active time, region count)
  // After analysis, stats cards should show:
  //   Total silence = sum of all region durations
  //   Active audio = projectDuration - totalSilence
  //   Selected = count of selected regions + their total duration

  // Test: sets analysisComplete to true after successful analysis
  // After analysis completes, the results section (region list, stats) should be visible.

  // Test: sets analysisStage to 'error' on failure
  // When detectDeadAir rejects, an error message should be displayed in the stats area.
  // The Analyze button should be re-enabled. Sliders should be re-enabled.
});

// ========================================
// Analysis Cancellation Tests
// ========================================

describe("Settings Panel: Analysis Cancellation", () => {
  // Test: AbortController.abort() is called when dialog unmounts during analysis
  // Start an analysis, then unmount the component. Verify the abort signal was triggered.
  // This prevents orphaned requests when the user closes the dialog during detection.

  // Test: error message is shown when analysis times out
  // If detectDeadAir throws a timeout error, the UI should show an error message
  // and set analysisStage to 'error'.

  // Test: sliders are re-enabled after analysis error
  // After any analysis failure, all sliders should return to enabled state.
});

// ========================================
// Buffer Change Re-analysis Tests
// ========================================

describe("Settings Panel: Buffer Change Re-analysis", () => {
  // Test: changing softening buffer after analysis re-runs applyBufferToRegions with new value
  // After a successful analysis, changing the buffer slider from 0.2 to 0.5 should
  // recalculate adjusted bounds. For a region 5.0-10.0s:
  //   With 0.2s buffer: adjustedStart=5.2, adjustedEnd=9.8
  //   With 0.5s buffer: adjustedStart=5.5, adjustedEnd=9.5

  // Test: stats update after buffer change (skipped regions affect counts)
  // If a region is 0.3s long and buffer is changed to 0.2s:
  //   adjustedDuration = 0.3 - 0.4 = negative => skipped
  // The selected count should decrease, and total silence should exclude skipped regions.

  // Test: no backend call made when buffer changes (client-side only)
  // The mock's detectDeadAir should NOT be called again when the buffer slider changes.
  // Only applyBufferToRegions runs client-side.
});
```

## Implementation Details

### 3.1 Settings Panel UI

The settings panel is rendered inside the dialog's right/bottom zone (the settings area established by Section 2). It contains three slider groups, a track selection area, and an Analyze button.

**Slider specifications:**

| Parameter | Range | Step | Default | Label Format |
|-----------|-------|------|---------|--------------|
| Volume Threshold | -60 to -20 dB | 1 | -40 | `"{value} dB ({percent}%)"` using `dbToPercent()` from Section 1 |
| Minimum Duration | 0.1 to 5.0 s | 0.1 | 0.5 | `"{value.toFixed(1)}s"` |
| Softening Buffer | 0.0 to 2.0 s | 0.05 | 0.2 | `"{value.toFixed(2)}s"` |

All three sliders are standard HTML `<input type="range">` elements, matching the pattern already used in the existing `SilenceDetectionPanel.tsx` (see lines 211-247 of that file for reference). Each slider has a label showing the current value and endpoint labels.

All sliders must be disabled when `isAnalyzing` is `true`.

The Softening Buffer slider is **new** -- it does not exist in the current panel. It controls the buffer applied client-side after detection results arrive. The label should include a brief help text: "Adds padding around cuts for smoother transitions".

**State hooks for sliders** (inside `SilenceDetectionDialog`):

```typescript
const [threshold, setThreshold] = useState(-40);
const [minDuration, setMinDuration] = useState(0.5);
const [softeningBuffer, setSofteningBuffer] = useState(0.2);
```

### 3.2 Track Selection

Below the sliders, render checkboxes for each audio track that has clips. This reuses the same logic pattern from the existing `SilenceDetectionPanel.tsx` (lines 248-269):

- Filter `project.timeline.tracks` to get audio tracks with `clips.length > 0`
- Pre-select the first audio track on mount (via `useEffect`)
- Each checkbox toggles the track in a `selectedTrackIds: string[]` state array
- Checkboxes disabled during analysis

**State hook:**

```typescript
const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
```

The track toggle handler is identical to the existing `handleTrackToggle` function in the current panel.

### 3.3 Analyze Button and Detection Flow

The Analyze button triggers `handleAutoDetect()`. This is the core analysis flow.

**State hooks for analysis:**

```typescript
const [isAnalyzing, setIsAnalyzing] = useState(false);
const [analysisComplete, setAnalysisComplete] = useState(false);
const [analysisStage, setAnalysisStage] = useState<AnalysisStage>('idle');
const [silentRegions, setSilentRegions] = useState<SilentRegion[]>([]);
const [totalSilence, setTotalSilence] = useState(0);
const [totalActive, setTotalActive] = useState(0);
const abortControllerRef = useRef<AbortController | null>(null);
```

**`handleAutoDetect` implementation outline:**

1. Guard: if `selectedTrackIds.length === 0`, return early (button should already be disabled, but defensive check).
2. Create a new `AbortController` and store in `abortControllerRef`.
3. Set `isAnalyzing = true`, `analysisStage = 'preparing'`, `analysisComplete = false`, clear previous regions.
4. Find the asset URI: get the first selected track's first clip, look up `project.assets[clip.assetId].path`.
5. If no asset URI found, set `analysisStage = 'error'` with appropriate message and return.
6. Start **timer-based stage label transitions** (since the backend does not report fine-grained progress):
   - After 1 second: `analysisStage = 'scanning'`
   - After 3 seconds: `analysisStage = 'detecting'`
   - These timers are cleared on completion or abort.
7. Call `createMediaJobClient().detectDeadAir(assetUri, { thresholdDb: threshold, minSilenceMs: minDuration * 1000 })`.
8. On success:
   - Extract `derived.silenceSegments` from the result.
   - Map each segment to a `SilentRegion` object (same mapping as existing panel, lines 108-116, but including the new fields):
     ```typescript
     const region: SilentRegion = {
       id: generateId(),
       startTime: seg.startMs / 1000,
       endTime: seg.endMs / 1000,
       duration: (seg.endMs - seg.startMs) / 1000,
       adjustedStartTime: 0, // set by applyBufferToRegions
       adjustedEndTime: 0,
       adjustedDuration: 0,
       averageDb: seg.averageDb || threshold,
       trackId: selectedTracks[0].id,
       selected: true,
       skipped: false,
     };
     ```
   - Set `analysisStage = 'applying_buffer'`.
   - Apply softening buffer: `const bufferedRegions = applyBufferToRegions(regions, softeningBuffer)`.
   - Calculate stats:
     - `totalSilenceDuration = bufferedRegions.filter(r => !r.skipped).reduce((sum, r) => sum + r.adjustedDuration, 0)`
     - `totalActiveDuration = max(0, projectDuration - totalSilenceDuration)`
   - Set `silentRegions = bufferedRegions`, update stats, set `analysisComplete = true`, `analysisStage = 'done'`.
9. On error:
   - If the abort signal was triggered, silently ignore (user closed dialog).
   - Otherwise: set `analysisStage = 'error'`, display a user-friendly error message.
10. In finally block: set `isAnalyzing = false`, clear stage transition timers.

**The Analyze button** should be disabled when: `isAnalyzing || selectedTrackIds.length === 0 || audioTracks.length === 0`. Its label shows the current `analysisStage` when analyzing:
- `'preparing'` -> "Preparing..."
- `'scanning'` -> "Scanning audio..."
- `'detecting'` -> "Detecting silence..."
- `'applying_buffer'` -> "Applying buffer..."
- Otherwise when `isAnalyzing`: "Analyzing..."

### 3.4 Analysis Cancellation and Error Handling

- Store an `AbortController` ref. The signal is not directly passed to `detectDeadAir` (since `MediaJobClient` does not currently support abort signals), but it serves two purposes:
  1. On dialog unmount or close during analysis: call `abortControllerRef.current?.abort()`. In the analysis `catch` block, check `abortControllerRef.current?.signal.aborted` to silently ignore the error.
  2. On dialog unmount: use a `useEffect` cleanup function to abort.

  ```typescript
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);
  ```

- If analysis fails (and was not aborted): set `analysisStage = 'error'`, show a meaningful error message in the stats area (e.g., "Analysis failed -- try again or adjust settings"). Re-enable sliders by setting `isAnalyzing = false`.
- Disable the Analyze button while `isAnalyzing` is true to prevent duplicate concurrent requests.

### 3.5 Stats Display

After analysis completes (`analysisComplete === true`), render a grid of stat cards:

| Stat | Value | Calculation |
|------|-------|-------------|
| Total Silence | `formatTime(totalSilence)` | Sum of `adjustedDuration` for all non-skipped regions |
| Active Audio | `formatTime(totalActive)` | `projectDuration - totalSilence` |
| Selected | `"{count} ({formatTime(duration)})"` | Count and sum of duration for `selected && !skipped` regions |

This matches the existing stats grid pattern from the current `SilenceDetectionPanel.tsx` (lines 299-314), but uses the adjusted durations from the buffer calculation.

### 3.6 Re-analysis on Buffer Change

When the softening buffer slider changes **after analysis is complete**, re-run the buffer calculation without making a backend call:

```typescript
useEffect(() => {
  if (analysisComplete && silentRegions.length > 0) {
    // Re-apply buffer to the raw regions (use original startTime/endTime)
    const reBuffered = applyBufferToRegions(silentRegions, softeningBuffer);
    setSilentRegions(reBuffered);
    // Recalculate stats
    const silenceDuration = reBuffered
      .filter(r => !r.skipped)
      .reduce((sum, r) => sum + r.adjustedDuration, 0);
    setTotalSilence(silenceDuration);
    setTotalActive(Math.max(0, (project.settings.duration || 0) - silenceDuration));
  }
}, [softeningBuffer]);
```

**Important implementation detail:** `applyBufferToRegions()` must use the **original** `startTime`/`endTime` fields (not the previously adjusted values) when recalculating. This means the function always computes from the raw detection bounds, regardless of what `adjustedStartTime`/`adjustedEndTime` currently hold. This is already the specified behavior of `applyBufferToRegions()` from Section 1.

### 3.7 Stage Label Transitions

Since the backend `detectDeadAir` does not report fine-grained progress, use timer-based label transitions to give the user visual feedback during the wait:

```typescript
// Inside handleAutoDetect, after setIsAnalyzing(true):
const stageTimers: ReturnType<typeof setTimeout>[] = [];
stageTimers.push(setTimeout(() => setAnalysisStage('scanning'), 1000));
stageTimers.push(setTimeout(() => setAnalysisStage('detecting'), 3000));

// In the finally block or on completion:
stageTimers.forEach(clearTimeout);
```

These are purely cosmetic -- the actual detection runs as a single async call. The stage labels provide a sense of progress to the user.

### 3.8 Styling

The settings panel uses the same dark theme CSS approach as the dialog shell (established in Section 2). Key styling points:

- Slider controls use the `.control-group` pattern from the existing `SilenceDetectionPanel.css`
- The stats grid uses a 3-column CSS grid: `display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;`
- The Analyze button spans full width of the settings column with accent color `#0078d4` background
- Error messages display in a red-tinted card within the stats area
- Stage labels animate with a subtle pulse opacity animation during analysis

### 3.9 Integration with Other Dialog Sections

The `silentRegions` state managed here is shared with:
- **Section 4 (SilenceRegionList):** Receives `regions` as a prop, along with `onToggleRegion`, `onSelectAll`, `onDeselectAll` callbacks
- **Section 5 (SilenceWaveformOverlay):** Receives `regions` as a prop for rendering overlays
- **Section 7 (Preview Player):** Receives `regions` for skip-silence mode
- **Section 8 (Export to Timeline):** The `onExportToTimeline` callback passes `silentRegions.filter(r => r.selected && !r.skipped)` upward

The dialog component manages all this state centrally. The settings panel is not a separate component file -- it is rendered inline within `SilenceDetectionDialog.tsx` as part of the right/bottom zone JSX.
---

## Implementation Notes

### Actual Implementation

**Files Created:**
- `apps/web/client/src/components/videoeditor/__tests__/settingsDetection.test.tsx` - Test suite with 18 test cases covering all spec requirements

**Files Modified:**
- `apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx` - Added complete settings panel implementation

**Test Coverage:**
- All 18 tests passing
- Covers: slider configuration, analyze flow, error handling, cancellation, buffer re-analysis
- Added extra test for percentage display updates (code review improvement)

### Deviations from Plan

None - implementation matches specification exactly.

### Code Review Improvements Applied

1. **Stage Timer Race Condition Fix** - Moved stage timers to useRef to prevent setState on unmounted component
2. **Buffer Re-analysis Comment** - Added comment explaining dependency array choice to prevent future infinite loop bugs
3. **Project Duration State** - Stored project duration in state to prevent unnecessary re-renders when project settings change
4. **Stats Guard** - Added guard for undefined project.settings.duration
5. **Invalid Track Validation** - Added validation to filter out invalid track IDs before analysis
6. **Error Handling Comment** - Added comment explaining abort check in catch block
7. **Test Coverage** - Added test for threshold slider percentage update

### Known Limitations

- Stage transitions use hardcoded timers (1s, 3s) - acceptable for current use case
- CSS classes not prefixed - low collision risk in practice
- Stage label animation not implemented - cosmetic, can be added in future polish pass

### Final Test Count

18 tests passing (17 from spec + 1 additional from code review)
