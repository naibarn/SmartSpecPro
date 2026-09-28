# Section 7: Preview Player Integration and Skip-Silence Mode

## Implementation Status

**Status:** ✅ COMPLETED
**Commit:** (pending)
**Date:** 2026-02-13

## Overview

This section embeds the existing `PreviewPlayer` component inside the `SilenceDetectionDialog` with bidirectional time synchronization between the preview and the waveform overlay. It also implements a "Skip Silence Preview" toggle that, during playback, automatically seeks past selected silent regions. The skip-silence logic uses pre-sorted intervals with binary search for O(log n) lookups and includes safeguards (cooldown, boundary guard) to prevent infinite skip loops.

## Implementation Notes

### Completed Features
1. ✅ PreviewPlayer embedded in dialog's preview zone
2. ✅ SilenceWaveformOverlay integrated in timeline zone with bidirectional sync
3. ✅ Skip-silence toggle with checkbox UI
4. ✅ Binary search function `findRegionAtTime()` - optimized to accept pre-filtered regions
5. ✅ Skip-silence orchestration function `shouldSkipSilence()` with cooldown and boundary guard
6. ✅ requestAnimationFrame loop for smooth skip detection (~60Hz)
7. ✅ Comprehensive unit tests (16 tests, all passing)
8. ✅ Accessibility labels added to skip-silence toggle

### Code Review Fixes Applied
- Fixed performance bug: Removed internal filtering from `findRegionAtTime()` to use pre-filtered regions
- Fixed React stale closure: Added `setPlaybackTime` to useEffect dependency array
- Added null checks for `activeClip` fields using nullish coalescing
- Removed placeholder bidirectional sync tests (documented as integration-tested)
- Added duration fallback to `firstClip.duration` when `project.settings.duration` is missing
- Removed dead code: `skipSilencePreview` state variable
- Added `id` and `htmlFor` attributes for accessibility compliance

### Deviations from Plan
- **Waveform Overlay Placement:** Rendered in timeline zone (bottom) instead of preview zone, matching the existing dialog layout from Section 02
- **Binary Search Signature:** Updated to accept pre-filtered regions for performance (no internal filtering)
- **Test Structure:** Removed placeholder bidirectional sync unit tests, documented as integration/manual-tested features

## Dependencies

- **Section 01 (Types and Shared Logic):** `SilentRegion` interface with `adjustedStartTime`, `adjustedEndTime`, `adjustedDuration`, `selected`, and `skipped` fields must be available in `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/videoEditor.ts`.
- **Section 02 (Dialog Layout):** `SilenceDetectionDialog.tsx` must exist with its three-zone layout. This section adds the preview player to the dialog's left/top zone.
- **Section 05 (Waveform Overlay):** `SilenceWaveformOverlay.tsx` must exist and accept `currentTime` / `onSeek` props for bidirectional sync with the preview.

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/__tests__/skipSilenceLogic.test.ts` | Unit tests for skip-silence binary search and skip logic |

## Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx` | Add PreviewPlayer embedding, playback state, skip-silence toggle, and bidirectional sync |

## Background: Existing PreviewPlayer

The `PreviewPlayer` component at `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/PreviewPlayer.tsx` accepts these key props:

```typescript
interface PreviewPlayerProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTimeChange: (time: number) => void;
  onPlayPause: () => void;
  onStop: () => void;
  previewVideoUrl?: string;
  activeClip?: ActiveClipInfo | null;
  activeAudioClips?: ActiveClipInfo[];
  // ... transition props (not needed here)
}
```

The player internally manages its own `<video>` element. When playing, it fires `onTimeChange` from `handleTimeUpdate` (via the `timeupdate` event at ~4Hz). When paused, setting `currentTime` externally causes the player to seek. This existing behavior is the foundation for bidirectional sync.

## Background: SilentRegion Interface (from Section 01)

After Section 01 is complete, `SilentRegion` will have:

```typescript
export interface SilentRegion {
  id: string;
  trackId: string;
  startTime: number;
  endTime: number;
  duration: number;
  adjustedStartTime: number;
  adjustedEndTime: number;
  adjustedDuration: number;
  selected: boolean;
  averageDb: number;
  skipped: boolean;
}
```

The skip-silence feature operates on the **adjusted** bounds (post-softening-buffer).

---

## Tests First

All tests go in `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/__tests__/skipSilenceLogic.test.ts`.

The skip-silence logic should be extracted as pure, testable functions (not embedded in React hooks). This enables thorough unit testing without component rendering overhead.

### Test File Structure

```typescript
import { describe, it, expect } from "vitest";

// These functions will be exported from a utility file or the dialog module.
// Signatures defined below.

describe("findRegionAtTime (binary search)", () => {
  // Test: binary search finds correct region for given currentTime
  //   Given sorted regions with adjustedStartTime [2, 5, 10], adjustedEndTime [4, 8, 15]
  //   When searching for time 6.0
  //   Then returns the region at index 1 (5-8)

  // Test: binary search returns null for time outside all regions
  //   Given sorted regions with adjustedStartTime [2, 5, 10], adjustedEndTime [4, 8, 15]
  //   When searching for time 9.0
  //   Then returns null

  // Test: binary search returns null for empty regions array

  // Test: binary search handles time at exact region boundary (start)
  //   Given a region [5.0, 8.0], searching time 5.0 returns that region

  // Test: binary search handles time at exact region boundary (end)
  //   Given a region [5.0, 8.0], searching time 8.0 returns that region

  // Test: binary search only considers selected and non-skipped regions
  //   Given regions where one is deselected and one is skipped
  //   Searching a time inside the deselected region returns null
  //   Searching a time inside the skipped region returns null
});

describe("shouldSkipSilence", () => {
  // Test: when skip-silence is enabled and currentTime is inside a
  //   silent region, returns the adjustedEndTime to seek to

  // Test: when skip-silence is disabled, returns null even if
  //   currentTime is in a silent region

  // Test: does not skip to regions that are deselected
  //   (findRegionAtTime filters them, so shouldSkipSilence returns null)

  // Test: does not skip to regions that are marked as skipped
  //   (findRegionAtTime filters them, so shouldSkipSilence returns null)

  // Test: cooldown prevents infinite loop -- returns null when
  //   lastSkipTimestamp is within 100ms of current wall-clock time

  // Test: does not skip when currentTime is within 50ms of a
  //   region's adjustedEndTime (boundary guard)

  // Test: returns adjustedEndTime when all conditions are met
  //   (enabled, inside region, not in cooldown, not near boundary)
});

describe("bidirectional sync", () => {
  // Test: clicking waveform updates playbackTime (waveform -> preview direction)
  //   When onSeek is called with time 12.5
  //   Then playbackTime state should be set to 12.5

  // Test: playbackTime changes update playhead position on waveform
  //   (preview -> waveform direction)
  //   When playbackTime changes to 7.3
  //   Then the currentTime prop passed to SilenceWaveformOverlay is 7.3
});
```

### What Each Test Validates

**Binary search tests** validate the `findRegionAtTime()` function that takes a sorted array of `SilentRegion` and a `currentTime`, then returns the region containing that time (or `null`). It must only consider regions where `selected === true` and `skipped === false`.

**shouldSkipSilence tests** validate the orchestration function that combines: (1) the binary search lookup, (2) the enabled toggle check, (3) the cooldown check (100ms since last skip), and (4) the boundary guard (within 50ms of `adjustedEndTime`). It returns either the target seek time or `null`.

**Bidirectional sync tests** verify that the data flow between PreviewPlayer's `onTimeChange` callback and the waveform overlay's `currentTime` prop is wired correctly in both directions.

---

## Implementation Details

### 7.1 Pure Functions for Skip-Silence Logic

Extract two pure functions that can be tested independently. These should be exported from the dialog file or from a small utility module alongside it.

**`findRegionAtTime(regions, currentTime)`**

- Accepts a pre-sorted (by `adjustedStartTime`) array of `SilentRegion` and a time value.
- Uses binary search to find a region where `adjustedStartTime <= currentTime <= adjustedEndTime`.
- Filters: only considers regions where `selected === true` AND `skipped === false`.
- Returns the matching `SilentRegion` or `null`.
- Sorting should happen once when regions change (via `useMemo`), not on every call.

Binary search approach:
1. Maintain two pointers `lo = 0`, `hi = regions.length - 1`.
2. At each step, pick `mid`. If `regions[mid].adjustedEndTime < currentTime`, search right half. If `regions[mid].adjustedStartTime > currentTime`, search left half. Otherwise, check if this region is selected and non-skipped; if yes, return it; if no, do a linear scan of nearby regions (since filtered regions may be sparse).
3. A simpler and equally valid approach (given typical region counts under 500): pre-filter to only selected, non-skipped regions, then binary search that filtered array. The filtering is O(n) but done once per region change, and the search per frame is O(log n).

**`shouldSkipSilence(params)`**

Parameters object:
- `enabled: boolean` -- the skip-silence toggle state
- `currentTime: number` -- current playback position
- `regions: SilentRegion[]` -- sorted, pre-filtered silence regions
- `lastSkipTimestamp: number` -- wall-clock time (`performance.now()`) of the last skip
- `cooldownMs: number` -- cooldown threshold (100ms)
- `boundaryGuardMs: number` -- boundary guard threshold (50ms as seconds = 0.05)

Returns `number | null` -- the time to seek to, or `null` if no skip should happen.

Logic:
1. If `!enabled`, return `null`.
2. If `performance.now() - lastSkipTimestamp < cooldownMs`, return `null` (cooldown active).
3. Call `findRegionAtTime(regions, currentTime)`.
4. If no region found, return `null`.
5. If `Math.abs(currentTime - region.adjustedEndTime) < boundaryGuardMs`, return `null` (already at boundary).
6. Return `region.adjustedEndTime`.

### 7.2 Embedding PreviewPlayer in the Dialog

Inside `SilenceDetectionDialog.tsx`, in the dialog's left/top content zone, render `PreviewPlayer`:

```typescript
<PreviewPlayer
  currentTime={playbackTime}
  duration={duration}
  isPlaying={isPlaying}
  onTimeChange={handleTimeChange}
  onPlayPause={handlePlayPause}
  onStop={handleStop}
  previewVideoUrl={previewUrl}
  activeClip={activeClip}
/>
```

The dialog manages its own playback state independently from the main editor:
- `playbackTime: number` -- current time in the preview (via `useState`)
- `isPlaying: boolean` -- playback state (via `useState`)

These are separate from the main editor's timeline state so that the dialog's preview does not interfere with or depend on the main editor playback.

### 7.3 Preview Asset Resolution

To determine `previewUrl` and `activeClip`:
1. Get the first selected audio track's first clip via its `assetId`.
2. Look up `project.assets[assetId]`.
3. The asset's `path` property provides the video/audio URL.
4. If the clip has `trimIn`/`trimOut`, construct an `ActiveClipInfo` object to pass as `activeClip`. Otherwise, pass just `previewVideoUrl`.

```typescript
const resolvePreviewAsset = (
  project: VideoEditorProject,
  selectedTrackIds: string[]
): { previewUrl: string; activeClip: ActiveClipInfo | null } => {
  // Find first selected track with clips
  // Get first clip's assetId -> look up asset -> use asset.path
  // Build ActiveClipInfo from clip's timeline position and trim points
};
```

### 7.4 Bidirectional Sync

**Preview to Waveform (preview drives waveform playhead):**

The `handleTimeChange` callback receives time updates from `PreviewPlayer` (during playback via `timeupdate` events, during seek via the seek bar). It sets `playbackTime`, which flows down as `currentTime` to the `SilenceWaveformOverlay` and `SilenceTimeline` components.

```typescript
const handleTimeChange = useCallback((time: number) => {
  setPlaybackTime(time);
}, []);
```

**Waveform to Preview (click on waveform seeks preview):**

The `SilenceWaveformOverlay`'s `onSeek` callback is connected to set `playbackTime`:

```typescript
const handleWaveformSeek = useCallback((time: number) => {
  setPlaybackTime(time);
  // If playing, the PreviewPlayer will pick up the new currentTime
  // via the prop change and seek its internal video element
}, []);
```

Both directions converge on the same `playbackTime` state, which is the single source of truth for the current position.

### 7.5 Skip-Silence Preview Mode

**Toggle UI:**

Below the `PreviewPlayer`, render a checkbox:

```typescript
<label className="skip-silence-toggle">
  <input
    type="checkbox"
    checked={skipSilenceEnabled}
    onChange={(e) => setSkipSilenceEnabled(e.target.checked)}
  />
  Skip Silence Preview
</label>
```

**Skip logic integration via `useEffect` + `requestAnimationFrame`:**

Use a `useEffect` that runs a `requestAnimationFrame` loop while `isPlaying && skipSilenceEnabled`. On each frame:

1. Read `playbackTime` from a ref (to avoid stale closures).
2. Call `shouldSkipSilence(...)`.
3. If it returns a target time, seek to that time and update `lastSkipTimestamp`.

Pseudocode for the hook:

```typescript
const lastSkipRef = useRef(0);
const playbackTimeRef = useRef(playbackTime);
playbackTimeRef.current = playbackTime;

// Pre-filter and sort regions once when they change
const skipRegions = useMemo(() => {
  return regions
    .filter(r => r.selected && !r.skipped && r.adjustedDuration > 0)
    .sort((a, b) => a.adjustedStartTime - b.adjustedStartTime);
}, [regions]);

useEffect(() => {
  if (!isPlaying || !skipSilenceEnabled || skipRegions.length === 0) return;

  let rafId: number;

  const tick = () => {
    const target = shouldSkipSilence({
      enabled: true,
      currentTime: playbackTimeRef.current,
      regions: skipRegions,
      lastSkipTimestamp: lastSkipRef.current,
      cooldownMs: 100,
      boundaryGuardMs: 0.05,
    });

    if (target !== null) {
      setPlaybackTime(target);
      lastSkipRef.current = performance.now();
    }

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}, [isPlaying, skipSilenceEnabled, skipRegions]);
```

Key design decisions:
- `requestAnimationFrame` polling (~60Hz) instead of relying on `timeupdate` (~4Hz) for smoother detection of when the playhead enters a silent region.
- The cooldown (100ms) prevents rapid re-triggering if a skip lands near another region.
- The boundary guard (50ms = 0.05s) prevents skipping when already positioned at the end of a region (which would trigger the next region's start check immediately).
- `useMemo` for the filtered/sorted region list ensures O(log n) lookups without repeated filtering per frame.

### 7.6 Play/Pause/Stop Handlers

```typescript
const handlePlayPause = useCallback(() => {
  setIsPlaying(prev => !prev);
}, []);

const handleStop = useCallback(() => {
  setIsPlaying(false);
  setPlaybackTime(0);
}, []);
```

### 7.7 Styling for Skip-Silence Toggle

Use CSS-in-JS within the dialog's existing `<style>` block (matching the codebase pattern):

```css
.skip-silence-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: #e0e0e0;
  cursor: pointer;
  user-select: none;
}

.skip-silence-toggle input[type="checkbox"] {
  accent-color: #0078d4;
  width: 16px;
  height: 16px;
  cursor: pointer;
}
```

---

## Integration Summary

The data flow for this section:

```
PreviewPlayer (onTimeChange)
  -> handleTimeChange -> setPlaybackTime
  -> playbackTime flows to:
       - SilenceWaveformOverlay (currentTime prop -> redraws playhead)
       - SilenceTimeline (currentTime prop -> auto-scroll)
       - Skip-silence rAF loop (reads via ref)

SilenceWaveformOverlay (onSeek from click)
  -> handleWaveformSeek -> setPlaybackTime
  -> PreviewPlayer receives new currentTime prop -> seeks video element

Skip-Silence rAF loop
  -> reads playbackTimeRef.current
  -> calls shouldSkipSilence with binary search
  -> if skip needed: setPlaybackTime(adjustedEndTime)
  -> PreviewPlayer receives new currentTime -> seeks past silence
```

## Edge Cases to Handle

1. **No regions detected yet:** Skip-silence toggle can exist but the rAF loop exits early when `skipRegions.length === 0`.
2. **All regions deselected:** Same early exit.
3. **Playback reaches end of media:** PreviewPlayer handles this via its `onEnded` callback which calls `onStop`.
4. **Dialog closes during playback:** The `useEffect` cleanup cancels the rAF loop. The dialog's local `isPlaying` state is discarded.
5. **Rapid toggle of skip-silence checkbox:** The `useEffect` dependency array includes `skipSilenceEnabled`, so toggling off immediately cancels the rAF loop.
6. **Very short regions back-to-back:** The cooldown prevents chaining multiple skips within a single 100ms window, ensuring the player has time to settle at each new position.