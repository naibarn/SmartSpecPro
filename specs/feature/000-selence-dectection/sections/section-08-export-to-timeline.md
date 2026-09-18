# Section 8: Export to Timeline Logic

## Implementation Status

**Status:** ✅ COMPLETED
**Commit:** (pending)
**Date:** 2026-02-13

## Overview

This section implements the `handleSilenceExportToTimeline()` function in `VideoEditorPhase3.tsx`. When the user clicks "Export to Timeline" in the Silence Detection Dialog, this handler receives the selected silent regions and performs non-destructive clip splitting: it deep-clones the project, splits clips at region boundaries using `trimIn`/`trimOut` math, removes the silent segments, ripple-deletes gaps, and commits the result as a single undo step. Post-export, the dialog closes, a toast notification appears, and new clip boundaries are briefly highlighted on the main timeline.

## Implementation Notes

### Completed Features
1. ✅ Pure utility module `silenceExportUtils.ts` with exportable functions
2. ✅ Clip split logic with correct `trimIn`/`trimOut` calculations
3. ✅ Text/overlay clip split variant (no trimIn/trimOut changes)
4. ✅ Region removal with reverse-order processing
5. ✅ Ripple delete for gap closure
6. ✅ `processExportToTimeline` orchestrator function
7. ✅ Handler integration in VideoEditorPhase3.tsx
8. ✅ Toast notification with removed region count and duration
9. ✅ Comprehensive unit tests (17 tests, all passing)

### Code Review Fixes Applied
- Fixed region processing to use exact "clip fully in region" check instead of midpoint heuristic
- Removed placeholder tests, documented integration testing approach
- Added comment explaining stable dependency array (showToast, useState setters)

### Deviations from Plan
- **Clip boundary highlight feature:** Deferred as optional (spec allows this)
- **Test coverage:** Integration tests for track-type handling and undo behavior instead of unit tests (more practical)

## Dependencies

- **Section 01 (Types and Shared Logic):** The extended `SilentRegion` interface with `adjustedStartTime`, `adjustedEndTime`, `adjustedDuration`, and `skipped` fields must exist in `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/videoEditor.ts`.
- **Section 02 (Dialog Layout):** The `SilenceDetectionDialog` component must call `onExportToTimeline(selectedRegions, applyToAllTracks)` when the user clicks the export button.

## Files to Create or Modify

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/__tests__/silenceExportToTimeline.test.ts` | **Create** -- unit tests for clip split, region removal, ripple delete, track-type behavior, and undo integration |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/silenceExportUtils.ts` | **Create** -- pure utility functions for clip splitting, region removal, and ripple deletion (extracted from the handler for testability) |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx` | **Modify** -- add `handleSilenceExportToTimeline` callback, `showSilenceDialog` state, and dialog rendering |

---

## Tests (Write First)

All tests go in `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/__tests__/silenceExportToTimeline.test.ts`.

The tests import pure utility functions from `silenceExportUtils.ts` so they can run without React rendering. The key functions to test are:

- `splitClipAtPosition(clip, timelinePosition)` -- splits a single clip at a timeline position, returning `[leftClip, rightClip]` or `[originalClip]` if the position is at or outside the clip bounds
- `removeRegionsFromTrack(track, regions)` -- processes a track's clips against a set of sorted silent regions, splitting and removing as needed
- `rippleDeleteTrack(track)` -- repositions clips sequentially with no gaps
- `processExportToTimeline(project, selectedRegions, applyToAllTracks, analyzedTrackIds)` -- the orchestrator that returns a new project with all modifications applied

### Clip Split Logic Tests

```typescript
import { describe, it, expect } from "vitest";
import {
  splitClipAtPosition,
  removeRegionsFromTrack,
  rippleDeleteTrack,
  processExportToTimeline,
} from "../silenceExportUtils";
import { type Clip, type Track, type VideoEditorProject, generateId } from "../../../types/videoEditor";

describe("splitClipAtPosition", () => {
  // Test: splitting a clip at its midpoint creates two clips with correct trimIn/trimOut
  //   Input: { startTime: 2.0, duration: 8.0, trimIn: 1.0, trimOut: 9.0 }
  //   Split at 6.0 -> Left: { startTime: 2.0, duration: 4.0, trimIn: 1.0, trimOut: 5.0 }
  //                   Right: { startTime: 6.0, duration: 4.0, trimIn: 5.0, trimOut: 9.0 }

  // Test: splitting at clip start (position === startTime) returns original clip unchanged

  // Test: splitting at clip end (position === startTime + duration) returns original clip unchanged

  // Test: splitting at position outside clip bounds returns original clip unchanged

  // Test: both split clips reference the same assetId

  // Test: split clip durations sum to original duration

  // Test: split clip trimIn/trimOut values are absolute positions in source (not deltas)
});
```

### Region Removal Tests (Reverse-Order Processing)

```typescript
describe("removeRegionsFromTrack", () => {
  // Test: single region removed from single clip -> clip is split, silent portion removed

  // Test: multiple non-overlapping regions processed in reverse order -> correct splits

  // Test: region that spans entire clip -> clip is removed entirely

  // Test: region that starts before clip start -> only overlapping portion is removed

  // Test: region that ends after clip end -> only overlapping portion is removed

  // Test: no regions provided -> track clips unchanged
});
```

### Ripple Delete Tests

```typescript
describe("rippleDeleteTrack", () => {
  // Test: after removal, remaining clips are repositioned sequentially (no gaps)
  //   Clips at [0, 5, 12] with durations [3, 4, 2] -> repositioned to [0, 3, 7]

  // Test: ripple delete preserves clip order

  // Test: ripple delete works with empty clips array

  // Test: clips already sequential with no gaps -> unchanged positions
});
```

### Track-Type-Specific Behavior Tests

```typescript
describe("processExportToTimeline - track type handling", () => {
  // Test: audio/video clips use trimIn/trimOut split logic
  //   Verify that split clips have updated trimIn and trimOut fields

  // Test: text/overlay clips split by adjusting startTime/duration only (no trimIn/trimOut changes)
  //   Text clips do not have meaningful trimIn/trimOut since they are generated elements

  // Test: muted tracks are excluded from "apply to all tracks"

  // Test: locked tracks are excluded from "apply to all tracks"

  // Test: when applyToAllTracks is false, only analyzedTrackIds are processed
});
```

### Undo Integration Tests

```typescript
describe("processExportToTimeline - undo behavior", () => {
  // Test: processExportToTimeline returns a deep-cloned project (original is unmodified)
  //   Verify the input project object is not mutated

  // Test: returned project has updated modifiedAt timestamp

  // Test: returned project has recalculated settings.duration
});
```

---

## Implementation Details

### 1. Pure Utility Module: `silenceExportUtils.ts`

Create `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/silenceExportUtils.ts` containing the following exported functions. This separation from the React component enables direct unit testing.

#### `splitClipAtPosition(clip: Clip, timelinePosition: number): [Clip] | [Clip, Clip]`

Splits a clip at a given timeline position. Returns a one-element or two-element tuple.

Key logic:
- If `timelinePosition <= clip.startTime` or `timelinePosition >= clip.startTime + clip.duration`, return `[clip]` (no split needed).
- Calculate `offsetInClip = timelinePosition - clip.startTime`.
- Calculate `splitPointInSource = clip.trimIn + offsetInClip` (this is the **absolute** position in the source asset).
- Left clip: `{ ...clip, id: generateId('clip'), duration: offsetInClip, trimOut: splitPointInSource }`.
- Right clip: `{ ...clip, id: generateId('clip'), startTime: timelinePosition, duration: clip.duration - offsetInClip, trimIn: splitPointInSource }`.

This matches the codebase convention where `trimIn` and `trimOut` are both **absolute positions in the source asset** (seconds). `duration` on the timeline = `trimOut - trimIn`.

#### `splitTextClipAtPosition(clip: Clip, timelinePosition: number): [Clip] | [Clip, Clip]`

Variant for text/overlay clips that do not have meaningful `trimIn`/`trimOut` source-asset semantics. Splits by adjusting `startTime` and `duration` only:
- Left clip: `{ ...clip, id: generateId('clip'), duration: offsetInClip }`. `trimIn`/`trimOut` remain unchanged.
- Right clip: `{ ...clip, id: generateId('clip'), startTime: timelinePosition, duration: clip.duration - offsetInClip }`. `trimIn`/`trimOut` remain unchanged.

#### `removeRegionsFromTrack(track: Track, regions: SilentRegion[], trackType: Track['type']): Clip[]`

Processes a track against sorted (descending by `adjustedStartTime`) regions. For each region, iterates through the current clip list:
1. Find clips overlapping `[region.adjustedStartTime, region.adjustedEndTime]`.
2. For each overlapping clip, split at the region boundaries (using `splitClipAtPosition` for audio/video or `splitTextClipAtPosition` for text/overlay).
3. Discard any resulting sub-clip that falls entirely within the silent region.

The function processes regions in **descending** order (last-to-first by `adjustedStartTime`). This is critical because processing from the end of the timeline backward ensures that earlier clip positions remain valid as later segments are removed.

Returns the surviving clips array (not yet ripple-deleted).

#### `rippleDeleteTrack(clips: Clip[]): Clip[]`

Reassigns `startTime` values sequentially, closing all gaps:

```
currentTime = 0
for each clip (sorted by startTime):
    clip.startTime = currentTime
    currentTime += clip.duration
```

Returns the repositioned clips.

#### `processExportToTimeline(project, selectedRegions, applyToAllTracks, analyzedTrackIds): VideoEditorProject`

The orchestrator function:

1. **Deep clone** the project: `JSON.parse(JSON.stringify(project))`.
2. **Filter regions:** Only use regions where `selected === true` and `skipped === false` and `adjustedDuration > 0`.
3. **Sort regions** by `adjustedStartTime` in **descending** order.
4. **Determine target tracks:**
   - If `applyToAllTracks === true`: all tracks where `locked === false` and `muted === false` and the track has at least one clip.
   - If `applyToAllTracks === false`: only tracks whose `id` appears in `analyzedTrackIds`.
5. **For each target track:** call `removeRegionsFromTrack(track, sortedRegions, track.type)`, then `rippleDeleteTrack(resultClips)`. Assign the result back to `track.clips`.
6. **Recalculate project duration:** `newProject.settings.duration = calculateProjectDuration(newProject.timeline)`.
7. **Update timestamp:** `newProject.modifiedAt = new Date().toISOString()`.
8. Return the new project.

### 2. Handler in VideoEditorPhase3.tsx

In `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`, add the following.

#### State Addition

Near the existing dialog state declarations (around line 71-75), add:

```typescript
const [showSilenceDialog, setShowSilenceDialog] = useState(false);
```

#### Handler Function

After the existing `handleCutAndCombine` callback (around line 881), add `handleSilenceExportToTimeline`:

```typescript
const handleSilenceExportToTimeline = useCallback(
  (selectedRegions: SilentRegion[], applyToAllTracks: boolean) => {
    /**
     * Called by SilenceDetectionDialog when user clicks "Export to Timeline".
     *
     * 1. Compute the new project via processExportToTimeline()
     * 2. Set the project state
     * 3. Add to undo history (single step)
     * 4. Close the dialog
     * 5. Show toast notification
     * 6. Highlight new clip boundaries (temporary CSS animation)
     */
  },
  [addToHistory]
);
```

Inside the handler:

1. Filter `selectedRegions` to only those with `selected === true` and `skipped !== true`. If none remain, return early.
2. Determine `analyzedTrackIds` -- the set of unique `trackId` values from the regions. This tells `processExportToTimeline` which tracks were analyzed.
3. Call `processExportToTimeline(project, selectedRegions, applyToAllTracks, analyzedTrackIds)` from the utility module to get `newProject`.
4. Call `setProject(newProject)`.
5. Call `addToHistory(newProject)` to register a **single** undo step.
6. Close the dialog: `setShowSilenceDialog(false)`.
7. Reset selected clips: `setSelectedClipId(null); setSelectedClipIds([]);`.
8. Count removed regions and their total duration for the toast:
   ```typescript
   const removedCount = validRegions.length;
   const totalRemovedDuration = validRegions.reduce(
     (sum, r) => sum + r.adjustedDuration, 0
   );
   showToast(
     `Removed ${removedCount} silent region${removedCount !== 1 ? 's' : ''} (${formatTime(totalRemovedDuration)})`,
     'success',
     4000
   );
   ```
9. Optionally trigger a temporary highlight on new clip boundaries. This can be done by setting a transient state (e.g., `highlightedClipIds`) that adds a CSS class with a fade-out animation, cleared after ~2 seconds via `setTimeout`.

#### Dialog Rendering

At the end of the JSX (near where `ExportDialog` and `RenderProgressDialog` are rendered), add the conditional dialog render:

```typescript
{showSilenceDialog && (
  <SilenceDetectionDialog
    project={project}
    onExportToTimeline={handleSilenceExportToTimeline}
    onClose={() => setShowSilenceDialog(false)}
  />
)}
```

Import `SilenceDetectionDialog` at the top of the file alongside the other dialog imports. Also import `processExportToTimeline` from `./silenceExportUtils` and ensure `formatTime` is imported from `../../types/videoEditor`.

#### Update Sidebar Trigger

The existing `SilenceDetectionPanel` rendering (around line 2037-2041) should be updated to pass a callback that opens the dialog:

```typescript
{sidebarView === 'silence' && (
  <SilenceDetectionPanel
    project={project}
    onCutAndCombine={handleCutAndCombine}
    onOpenDialog={() => setShowSilenceDialog(true)}
  />
)}
```

The `SilenceDetectionPanel` (modified in Section 02) will use `onOpenDialog` to render a trigger button.

### 3. Clip Split Math -- Detailed Example

This is the most error-prone part of the implementation. Here is the exact math:

```
Original clip:
  startTime: 2.0 (position on timeline)
  duration:  8.0 (visible length on timeline)
  trimIn:    1.0 (start point in source asset, absolute)
  trimOut:   9.0 (end point in source asset, absolute)

Silent region to remove:
  adjustedStartTime: 5.0
  adjustedEndTime:   7.0

Step 1: Split at adjustedStartTime (5.0)
  offsetInClip = 5.0 - 2.0 = 3.0
  splitPointInSource = 1.0 + 3.0 = 4.0
  Left:  { startTime: 2.0, duration: 3.0, trimIn: 1.0, trimOut: 4.0 }  -- KEEP
  Right: { startTime: 5.0, duration: 5.0, trimIn: 4.0, trimOut: 9.0 }  -- needs further split

Step 2: Split the right part at adjustedEndTime (7.0)
  offsetInClip = 7.0 - 5.0 = 2.0
  splitPointInSource = 4.0 + 2.0 = 6.0
  Middle: { startTime: 5.0, duration: 2.0, trimIn: 4.0, trimOut: 6.0 }  -- DISCARD (silent)
  Right:  { startTime: 7.0, duration: 3.0, trimIn: 6.0, trimOut: 9.0 }  -- KEEP

Step 3: After removal, clips are [Left, Right]:
  Left:  { startTime: 2.0, duration: 3.0, trimIn: 1.0, trimOut: 4.0 }
  Right: { startTime: 7.0, duration: 3.0, trimIn: 6.0, trimOut: 9.0 }

Step 4: Ripple delete closes the gap:
  Left:  { startTime: 0.0, duration: 3.0, trimIn: 1.0, trimOut: 4.0 }
  Right: { startTime: 3.0, duration: 3.0, trimIn: 6.0, trimOut: 9.0 }
```

### 4. Track-Type-Specific Behavior

When `applyToAllTracks` is true, the `removeRegionsFromTrack` function must check the track type:

- **`video` and `audio`:** Use `splitClipAtPosition()` which adjusts `trimIn`/`trimOut` based on source-asset positions.
- **`text` and `overlay`:** Use `splitTextClipAtPosition()` which adjusts only `startTime` and `duration`. These are generated elements (text overlays, images) that do not reference a source media file's timeline in the same way. Their `trimIn`/`trimOut` values (if present) are left unchanged.
- **Muted tracks:** Excluded entirely. Check `track.muted === true` and skip.
- **Locked tracks:** Excluded entirely. Check `track.locked === true` and skip.

### 5. Post-Export UX

After the export completes:

1. **Close dialog:** `setShowSilenceDialog(false)`.
2. **Toast notification:** Uses the existing `showToast` function imported from `./Toast`. Message format: `"Removed {count} silent regions ({formatted duration})"`.
3. **Highlight new boundaries:** Optional visual enhancement. Set a list of newly created clip IDs (from the split operations) into a transient state. The main Timeline component can check this list and apply a temporary CSS class (e.g., `silence-export-highlight`) that shows a brief glow animation. Clear the list after 2 seconds using `setTimeout`. This is a nice-to-have and can be deferred if the implementation timeline is tight.

### 6. Edge Cases to Handle

- **No selected regions after filtering:** Return early, do not modify the project.
- **Region entirely outside any clip:** The region is simply ignored (no clips overlap with it).
- **Region exactly at clip boundary:** The split returns the original clip unchanged, region has no effect on that clip.
- **Multiple regions within a single clip:** Processing in reverse order ensures each split is computed against correct (not yet shifted) positions.
- **Clip with zero duration after split:** Discard any resulting clip where `duration <= 0`.
- **Floating-point precision:** Use a small epsilon (e.g., `1e-6`) when comparing time positions to avoid issues with floating-point arithmetic at exact boundaries.