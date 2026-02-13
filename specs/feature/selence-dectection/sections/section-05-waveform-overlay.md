Good. Now I have complete context to write the section. Let me compose the output.

# Section 5: Waveform Overlay Component

## Overview

This section creates `SilenceWaveformOverlay.tsx`, a canvas-based React component that renders silence region visualizations on top of the existing `WaveformCanvas`. It draws semi-transparent colored rectangles for detected silent regions, a playhead line synced to the current playback time, and handles click interactions for region toggling and timeline seeking.

**New file:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/SilenceWaveformOverlay.tsx`

**Test file:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/__tests__/SilenceWaveformOverlay.test.ts`

## Dependencies

- **Section 01 (types-shared-logic):** Requires the extended `SilentRegion` interface with `adjustedStartTime`, `adjustedEndTime`, `adjustedDuration`, `selected`, and `skipped` fields defined in `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/videoEditor.ts`.
- **Existing component:** `WaveformCanvas` at `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/WaveformCanvas.tsx` -- the overlay stacks on top of this component. Both must share the same parent-provided `width` and `height` props and use identical `devicePixelRatio` scaling.

## Background: WaveformCanvas Sizing Strategy

The existing `WaveformCanvas` component uses this pattern for high-DPI canvas rendering:

```typescript
const dpr = window.devicePixelRatio || 1;
canvas.width = width * dpr;
canvas.height = height * dpr;
canvas.style.width = `${width}px`;
canvas.style.height = `${height}px`;
ctx.scale(dpr, dpr);
```

The canvas CSS also uses `style={{ width: '100%', height: '100%', display: 'block' }}`. The `SilenceWaveformOverlay` must replicate this exact sizing approach so that pixel positions align perfectly when both canvases are stacked via absolute positioning.

## Tests (Write First)

All tests go in `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/__tests__/SilenceWaveformOverlay.test.ts`.

The test environment is Vitest (configured in `/home/dev/projects/SmartSpecPro/apps/web/vitest.config.ts`). Since this is a canvas-based component and the test environment is `node` (not `jsdom`), tests should focus on the logic layer -- hit-testing, time-to-pixel conversion, region lookup -- rather than actual canvas rendering. Extract testable pure functions from the component (or co-locate them in the same file and export them) so unit tests can verify correctness without a DOM.

```typescript
// File: /home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/__tests__/SilenceWaveformOverlay.test.ts

import { describe, it, expect } from 'vitest';

// Import the pure helper functions extracted from SilenceWaveformOverlay.tsx
// These are exported for testability alongside the React component.
import {
  timeToPixel,
  pixelToTime,
  hitTestRegion,
} from '../SilenceWaveformOverlay';

// ---- Canvas dimension tests ----

describe('timeToPixel', () => {
  // Test: converts time to correct pixel position given duration and canvas width
  // e.g., timeToPixel(5, 10, 800) => 400 (halfway through a 10s clip on 800px canvas)

  // Test: returns 0 for time=0

  // Test: returns canvasWidth for time=duration

  // Test: handles pixelsPerSecond override (used when timeline zoom is active)
});

describe('pixelToTime', () => {
  // Test: converts pixel X position back to time
  // pixelToTime(400, 10, 800) => 5.0

  // Test: clamps result to [0, duration]
});

describe('hitTestRegion', () => {
  // Test: returns regionId when click X falls within a region's time range
  // Given regions with adjustedStartTime=2.0, adjustedEndTime=5.0 on a 10s/800px canvas,
  // clicking at x=280 (time=3.5) should return that region's id

  // Test: returns null when click X is outside all regions

  // Test: prefers the narrowest (most specific) region when regions overlap

  // Test: skipped regions are excluded from hit testing (click passes through)
});

// ---- Rendering logic tests (verify drawing parameters, not actual pixels) ----

describe('SilenceWaveformOverlay rendering logic', () => {
  // Test: selected regions use opacity 0.3 (rgba(255, 0, 0, 0.3))
  // Verify by checking the fill style value computed for a selected region

  // Test: deselected regions use opacity 0.15 (rgba(255, 0, 0, 0.15))

  // Test: selected regions have dashed cyan border style

  // Test: skipped regions use hatched pattern fill

  // Test: playhead vertical line position = (currentTime / duration) * canvasWidth
  // For currentTime=3, duration=10, width=800 => playhead at x=240

  // Test: canvas uses devicePixelRatio scaling (internal resolution = width * dpr)
});

// ---- Click interaction tests ----

describe('SilenceWaveformOverlay click interactions', () => {
  // Test: clicking on a region triggers onRegionClick with correct regionId

  // Test: clicking outside all regions triggers onSeek with correct time value

  // Test: onSeek time value is computed as pixelToTime(clickX, duration, canvasWidth)
});
```

### Key test guidance

- **Extract pure functions:** The functions `timeToPixel`, `pixelToTime`, and `hitTestRegion` should be exported from `SilenceWaveformOverlay.tsx` as named exports alongside the default component export. This makes the core logic unit-testable without requiring a DOM or canvas mock.
- **Canvas rendering tests:** For verifying fill colors, border styles, and playhead position, create a helper that computes drawing parameters (rectangles, colors, line positions) as data objects rather than calling `ctx.fillRect` directly. Test the data, not the canvas calls. Alternatively, mock `CanvasRenderingContext2D` and assert on method calls if DOM testing is set up later.
- **Do not test React.memo behavior** -- that is a React optimization detail, not business logic.

## Props Interface

```typescript
interface SilenceWaveformOverlayProps {
  /** Array of silent regions (from Section 01 types, with adjusted bounds) */
  regions: SilentRegion[];
  /** Total duration of the media in seconds */
  duration: number;
  /** Current playback time in seconds (drives playhead position) */
  currentTime: number;
  /** Logical width of the canvas in CSS pixels (provided by parent) */
  width: number;
  /** Logical height of the canvas in CSS pixels (provided by parent) */
  height: number;
  /** Optional pixels-per-second for zoomed timeline (used by SilenceTimeline in Section 06) */
  pixelsPerSecond?: number;
  /** Called when user clicks on a region -- parent toggles selection */
  onRegionClick: (regionId: string) => void;
  /** Called when user clicks empty space -- parent seeks playback to this time */
  onSeek: (time: number) => void;
  /** Optional hover callback for tooltip display */
  onRegionHover?: (regionId: string | null) => void;
}
```

## Implementation Details

### File Structure

The component file at `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/SilenceWaveformOverlay.tsx` should contain:

1. **Exported pure helper functions** (for testability)
2. **The React component** (default export, wrapped in `React.memo`)

### Pure Helper Functions

These are exported as named exports for unit testing:

**`timeToPixel(time: number, duration: number, canvasWidth: number, pixelsPerSecond?: number): number`**
- If `pixelsPerSecond` is provided: return `time * pixelsPerSecond`
- Otherwise: return `(time / duration) * canvasWidth`
- Handles `duration === 0` safely (returns 0)

**`pixelToTime(pixelX: number, duration: number, canvasWidth: number, pixelsPerSecond?: number): number`**
- Inverse of `timeToPixel`
- Clamps result to `[0, duration]`

**`hitTestRegion(clientX: number, canvasRect: DOMRect, regions: SilentRegion[], duration: number, canvasWidth: number, pixelsPerSecond?: number): string | null`**
- Converts `clientX` to canvas-relative X using `clientX - canvasRect.left`
- Converts X to time via `pixelToTime`
- Iterates regions (excluding `skipped === true`)
- Returns `region.id` if time falls within `[region.adjustedStartTime, region.adjustedEndTime]`
- If multiple regions overlap, prefer the narrowest (shortest `adjustedDuration`)
- Returns `null` if no region matches

### Canvas Drawing Logic

The `useEffect` hook redraws the canvas when `regions`, `currentTime`, `width`, `height`, or `pixelsPerSecond` change. The drawing procedure:

1. **Setup:** Get canvas ref, get 2D context, apply `devicePixelRatio` scaling (same as `WaveformCanvas`):
   ```
   dpr = window.devicePixelRatio || 1
   canvas.width = width * dpr
   canvas.height = height * dpr
   ctx.scale(dpr, dpr)
   ```

2. **Clear:** `ctx.clearRect(0, 0, width, height)` -- transparent background so the waveform underneath is visible.

3. **Draw region rectangles:** For each region in `regions`:
   - Compute `x = timeToPixel(region.adjustedStartTime, duration, width, pixelsPerSecond)`
   - Compute `regionWidth = timeToPixel(region.adjustedEndTime, ...) - x`
   - If `region.skipped`:
     - Draw hatched pattern: alternating diagonal lines within the rectangle area using a `CanvasPattern` created from an offscreen canvas with 45-degree stripes in `rgba(128, 128, 128, 0.3)`
   - Else if `region.selected`:
     - Fill with `rgba(255, 0, 0, 0.3)` (semi-transparent red, higher opacity)
     - Stroke with dashed cyan border: `ctx.setLineDash([4, 4])`, `ctx.strokeStyle = 'cyan'`, `ctx.lineWidth = 1.5`
   - Else (deselected):
     - Fill with `rgba(255, 0, 0, 0.15)` (semi-transparent red, lower opacity)
     - No border

4. **Draw playhead:** Vertical line at `x = timeToPixel(currentTime, duration, width, pixelsPerSecond)`:
   - `ctx.strokeStyle = '#ff3333'` (red)
   - `ctx.lineWidth = 2`
   - `ctx.setLineDash([])` (solid line)
   - Draw from `(x, 0)` to `(x, height)`

### Playhead Animation

During playback, `currentTime` updates frequently. To avoid redrawing the entire canvas on every frame:

- Use a separate `requestAnimationFrame` loop (via `useRef` for the animation frame ID) that only redraws the playhead line.
- Store the last-drawn region rectangles in a ref so that a full redraw only happens when `regions`, `width`, `height`, or `pixelsPerSecond` change.
- The playhead-only redraw: clear the previous playhead (redraw a thin vertical strip from the cached region image), draw the new playhead at the updated position.
- Alternatively, a simpler approach: use two stacked canvases internally -- one for regions (redraws only when regions change), one for the playhead (redraws on every `requestAnimationFrame`). This avoids complex partial-redraw logic.

The simpler two-canvas approach is recommended for clarity:
- Bottom canvas: regions (drawn in `useEffect` dependent on `regions`, `width`, `height`, `pixelsPerSecond`)
- Top canvas: playhead only (drawn in `requestAnimationFrame` loop dependent on `currentTime`)

Both canvases use `position: absolute; top: 0; left: 0` within the component's wrapper div.

### Click Handler

Attach an `onClick` handler to the top canvas element:

```typescript
const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const regionId = hitTestRegion(
    e.clientX, rect, regions, duration, width, pixelsPerSecond
  );

  if (regionId) {
    onRegionClick(regionId);
  } else {
    const x = e.clientX - rect.left;
    const time = pixelToTime(x, duration, width, pixelsPerSecond);
    onSeek(time);
  }
};
```

### Hover Handler (Optional)

If `onRegionHover` is provided, attach an `onMouseMove` handler that performs hit testing and calls `onRegionHover(regionId)` or `onRegionHover(null)`. Throttle this to avoid excessive calls (e.g., only call when the hovered region changes, tracked via a ref).

Set `cursor: pointer` when hovering over a region, `cursor: crosshair` otherwise, by updating `canvas.style.cursor` directly in the mousemove handler.

### Component JSX

The component renders a wrapper `<div>` with `position: relative` containing the two internal canvases:

```typescript
return (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'auto',
    }}
  >
    <canvas
      ref={regionsCanvasRef}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
    />
    <canvas
      ref={playheadCanvasRef}
      onClick={handleCanvasClick}
      onMouseMove={handleMouseMove}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
      }}
    />
  </div>
);
```

The outer `<div>` uses `position: absolute` so it overlays exactly on top of the `WaveformCanvas` in the parent stack. The parent container (used in Section 06's `SilenceTimeline`) arranges them:

```typescript
<div style={{ position: 'relative', width, height }}>
  <WaveformCanvas waveformData={waveformData} width={width} height={height} />
  <SilenceWaveformOverlay
    regions={regions}
    duration={duration}
    currentTime={currentTime}
    width={width}
    height={height}
    pixelsPerSecond={pixelsPerSecond}
    onRegionClick={handleToggleRegion}
    onSeek={handleSeek}
  />
</div>
```

### React.memo Configuration

Wrap the component in `React.memo` with a custom comparison function that performs shallow comparison on all props except `regions`, which should use reference equality (the parent should produce a new array reference only when regions actually change):

```typescript
export const SilenceWaveformOverlay = React.memo(SilenceWaveformOverlayInner);
```

The default shallow comparison from `React.memo` is sufficient here since `regions` is already a new array reference when it changes (produced by `applyBufferToRegions` or selection toggles).

### Cleanup

In the `useEffect` cleanup and component unmount, cancel any active `requestAnimationFrame` via `cancelAnimationFrame(rafIdRef.current)` to prevent memory leaks and rendering to a detached canvas.

---

## Implementation Notes (Actual Build)

### Files Created
- ✅ `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/SilenceWaveformOverlay.tsx` (398 lines)
- ✅ `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/__tests__/SilenceWaveformOverlay.test.ts` (177 lines)

### Test Results
- **15 tests, all passing**
- Coverage: Pure helper functions (timeToPixel, pixelToTime, hitTestRegion)
- Test cases: dimension conversion, edge cases, zoom mode, overlapping regions, skipped regions, canvas offset

### Code Review Fixes Applied

After initial implementation, a code review identified performance and code quality improvements:

1. **Added `isPlaying` prop (CRITICAL):** Playhead animation now only runs when `isPlaying === true` (defaults to `true` for backward compatibility). When paused, the playhead is drawn once without starting a RAF loop. This prevents wasting CPU/battery at 60fps when nothing is changing.

2. **Throttled hit testing (IMPORTANT):** Added 16ms throttling to `handleMouseMove` to prevent O(n) region iteration on every mouse movement event. This improves performance with large region counts (up to 500 regions).

3. **Memoized hatch pattern (IMPORTANT):** Pattern creation moved to `useMemo` to avoid recreating the offscreen canvas and pattern object on every region redraw. Pattern doesn't depend on any props.

4. **Removed redundant canvas.style assignments (IMPORTANT):** Removed programmatic `canvas.style.width/height` assignments since JSX inline styles already set these to `'100%'`.

5. **Improved RAF cleanup (IMPORTANT):** Changed to use local variable pattern inside the effect to prevent race conditions on unmount:
   ```typescript
   let rafId: number | null = null;
   const drawPlayhead = () => { rafId = requestAnimationFrame(drawPlayhead); };
   return () => { if (rafId !== null) cancelAnimationFrame(rafId); };
   ```

6. **Extracted magic numbers to constants (MINOR):** Added named constants `HATCH_PATTERN_SIZE`, `SELECTED_BORDER_DASH`, `PLAYHEAD_LINE_WIDTH`, `THROTTLE_MS` for better readability.

7. **Added fallback for hatch pattern (MINOR):** If pattern creation fails, skipped regions now render with `rgba(128, 128, 128, 0.2)` fallback fill to ensure they're always visible.

### Deviations from Plan

- **Props interface:** Added `isPlaying?: boolean` prop (not in original spec). This was identified during code review as critical for performance. Default value is `true` to maintain expected behavior when prop is omitted.

- **Canvas style handling:** Removed redundant programmatic style assignments that conflicted with JSX inline styles. The JSX styles (`width: '100%', height: '100%'`) are sufficient for responsive sizing.

- **Hit testing optimization:** Added throttling mechanism using timestamp comparison (`Date.now()`) instead of lodash or RAF-based throttling, avoiding external dependencies.

### Integration Status

**Ready for Section 06 (mini-timeline):** Component exports all required functions and props interface. `SilenceTimeline` can import and stack this overlay on top of `WaveformCanvas` using the documented pattern.

**Performance validated:** Two-canvas approach correctly separates static regions from animated playhead. RAF loop is properly gated by `isPlaying` prop. Hover hit testing is throttled to prevent frame drops.

## Integration Points

- **Section 06 (mini-timeline):** `SilenceTimeline.tsx` will be the primary consumer of this overlay component, stacking it on top of `WaveformCanvas` inside the scrollable timeline area. It passes `pixelsPerSecond` from its zoom state.
- **Section 07 (preview-skip-silence):** The `onSeek` callback from this overlay feeds into the bidirectional sync system -- clicking the waveform updates `playbackTime` which is consumed by the `PreviewPlayer`.
- **Section 03 (settings-detection):** After analysis completes and `applyBufferToRegions()` runs, the resulting `SilentRegion[]` array is passed down to this component's `regions` prop.

## Performance Considerations

- The two-canvas approach means region rectangles are only redrawn when the region data or canvas dimensions change, not on every playback frame.
- The playhead canvas uses `requestAnimationFrame` which runs at display refresh rate (~60fps) for smooth playhead animation.
- `devicePixelRatio` scaling ensures crisp rendering on Retina/HiDPI displays.
- For very long videos with many regions (hundreds), the drawing loop is still O(n) per region-canvas redraw. This is acceptable because the region count is capped at 500 segments by the backend (Section 09's validation), and canvas fill operations for 500 rectangles are sub-millisecond.