Now I have all the context I need. Let me generate the section content.

# Section 4: Silence Region List Component

## Overview

This section extracts the silence region list from the existing `SilenceDetectionPanel.tsx` into a standalone `SilenceRegionList.tsx` component. The new component provides a scrollable, interactive list of detected silent regions with per-region checkboxes, bulk selection controls, expandable detail rows, a "Skipped" badge for buffer-excluded regions, and a click-to-scroll callback for timeline/waveform navigation.

**New file:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/SilenceRegionList.tsx`

**Depends on:** Section 01 (types: `SilentRegion` with `adjustedStartTime`, `adjustedEndTime`, `adjustedDuration`, `skipped` fields; `Track` type; `formatTime` utility)

**Blocks:** Section 03 (Settings Panel imports and renders this component)

---

## Background and Context

The current `SilenceDetectionPanel.tsx` (at `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx`) contains an inline region list that renders detected `SilentRegion[]` items as expandable rows with checkboxes. This section extracts that region list into a reusable component so it can be embedded in the new full-screen `SilenceDetectionDialog` (Section 02) rather than the old sidebar panel.

### Current SilentRegion interface (before Section 01 extensions)

```typescript
// File: apps/web/client/src/types/videoEditor.ts
export interface SilentRegion {
  id: string;
  trackId: string;
  startTime: number;
  endTime: number;
  duration: number;
  selected: boolean;
  averageDb: number;
}
```

Section 01 extends this with buffer-adjusted fields. The region list component must handle these additional fields:

```typescript
// After Section 01 applies:
export interface SilentRegion {
  id: string;
  trackId: string;
  startTime: number;
  endTime: number;
  duration: number;
  adjustedStartTime: number;  // start + softeningBuffer
  adjustedEndTime: number;    // end - softeningBuffer
  adjustedDuration: number;   // may be 0 if skipped
  selected: boolean;
  averageDb: number;
  skipped: boolean;           // true if too short after buffer
}
```

### Track type (already exists)

```typescript
export interface Track {
  id: string;
  type: 'video' | 'audio' | 'overlay' | 'text';
  name: string;
  clips: Clip[];
  muted: boolean;
  locked: boolean;
  visible: boolean;
  height?: number;
  zIndex?: number;
}
```

### formatTime utility (already exists)

```typescript
export function formatTime(seconds: number): string {
  // Returns MM:SS or HH:MM:SS format
}
```

---

## Tests

**Test file:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/__tests__/SilenceRegionList.test.tsx`

**IMPLEMENTATION NOTE:** Used `@testing-library/react` instead of `renderToStaticMarkup` for better interaction testing (click handlers, event propagation) and consistency with Section 03 dialog tests. This provides more comprehensive test coverage than static markup assertions.

Write these tests BEFORE implementing the component:

```typescript
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SilenceRegionList } from "../SilenceRegionList";
import type { SilentRegion, Track } from "../../../types/videoEditor";

// --- Test helpers ---

// Factory function to create a minimal SilentRegion with Section 01 fields.
// Provide overrides for specific tests.
function makeRegion(overrides?: Partial<SilentRegion>): SilentRegion {
  /** Return a region with sensible defaults; merge overrides. */
}

// Factory for a minimal Track.
function makeTrack(overrides?: Partial<Track>): Track {
  /** Return a track with sensible defaults; merge overrides. */
}

describe("SilenceRegionList", () => {
  // Test: renders one row per region
  // Provide an array of 3 regions. Assert the rendered HTML contains 3 region
  // header elements (e.g., "Region #1", "Region #2", "Region #3").

  // Test: checkbox toggles selection via onToggleRegion
  // Render with one selected region. Assert the rendered checkbox has
  // checked="". Render again with selected=false, assert it does not.
  // (Note: click interaction testing is limited with renderToStaticMarkup;
  // assert that the onToggleRegion prop is wired by checking the element
  // structure. For deeper interaction tests, use a DOM-based renderer.)

  // Test: "Select All" calls onSelectAll
  // Assert the rendered HTML contains a button with text "Select All".

  // Test: "Deselect All" calls onDeselectAll
  // Assert the rendered HTML contains a button with text "Deselect All".

  // Test: skipped regions show "Skipped" badge and disabled checkbox
  // Provide a region with skipped=true. Assert the rendered HTML contains
  // "Skipped" text/badge and the checkbox has the disabled attribute.

  // Test: clicking a region row calls onScrollToRegion with regionId
  // Assert the component renders an interactive element (e.g., a clickable
  // div or button) per region that is wired to onScrollToRegion.

  // Test: expandable details show start, end, duration, dB, track name
  // Provide a region and a matching track. Render in expanded state.
  // Assert the rendered HTML contains the formatted start time, end time,
  // duration, dB value, and track name strings.
});
```

### Test strategy notes

- The project frontend tests use `renderToStaticMarkup` for lightweight assertions on rendered HTML output. This avoids the need for a full DOM (jsdom) setup.
- For callback wiring (onToggleRegion, onSelectAll, onDeselectAll, onScrollToRegion), the static markup tests can only verify that the correct DOM elements exist (checkboxes, buttons). Full click-handler integration tests would require a DOM renderer, which is out of scope for this section.
- Each test should be self-contained: create its own region/track data using the factory helpers, render the component, and assert on the HTML string.

---

## Props Interface

Define the following props interface in `SilenceRegionList.tsx`:

```typescript
interface SilenceRegionListProps {
  regions: SilentRegion[];
  onToggleRegion: (regionId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onScrollToRegion?: (regionId: string) => void;
  tracks: Track[];
}
```

**Prop descriptions:**

| Prop | Type | Description |
|------|------|-------------|
| `regions` | `SilentRegion[]` | All detected regions (including skipped ones). The component displays all of them. |
| `onToggleRegion` | `(regionId: string) => void` | Called when a region's checkbox is toggled. Parent flips `region.selected`. |
| `onSelectAll` | `() => void` | Called when "Select All" button is clicked. Parent sets all non-skipped regions to `selected: true`. |
| `onDeselectAll` | `() => void` | Called when "Deselect All" button is clicked. Parent sets all regions to `selected: false`. |
| `onScrollToRegion` | `(regionId: string) => void` (optional) | Called when user clicks a region row. Parent scrolls the timeline waveform to that region's position and seeks the preview player. |
| `tracks` | `Track[]` | All project tracks. Used to resolve `region.trackId` to a human-readable track name in the expanded details view. |

---

## Component Implementation Details

### File location

`/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/SilenceRegionList.tsx`

### Imports

```typescript
import React, { useState } from 'react';
import {
  type SilentRegion,
  type Track,
  formatTime,
} from '../../types/videoEditor';
```

### Internal state

The component manages one piece of local UI state:

- `expandedRegions: Set<string>` -- tracks which region IDs have their detail section expanded. Toggled by clicking the expand/collapse chevron or the region header row.

### Component structure (JSX outline)

```
<div className="silence-region-list">
  {/* Header with bulk actions */}
  <div className="region-list-header">
    <span>Detected Regions ({regions.length})</span>
    <div className="region-list-actions">
      <button onClick={onSelectAll}>Select All</button>
      <button onClick={onDeselectAll}>Deselect All</button>
    </div>
  </div>

  {/* Scrollable region list */}
  <div className="regions-list">
    {regions.length === 0 ? (
      <EmptyState />
    ) : (
      regions.map((region, index) => (
        <RegionItem
          key={region.id}
          region={region}
          index={index}
          isExpanded={expandedRegions.has(region.id)}
          trackName={resolveTrackName(region.trackId)}
          onToggle={() => onToggleRegion(region.id)}
          onExpand={() => toggleExpanded(region.id)}
          onScrollTo={() => onScrollToRegion?.(region.id)}
        />
      ))
    )}
  </div>
</div>
```

The `RegionItem` can be an inline sub-component or inlined JSX. It does not need to be a separate exported component.

### Per-region row rendering

Each region row renders:

1. **Checkbox** -- checked if `region.selected`, disabled if `region.skipped`. On change, calls `onToggleRegion(region.id)`. The checkbox click handler should call `e.stopPropagation()` to prevent triggering the row click.

2. **Region summary line** -- "Region #N" with:
   - A "Selected" badge (blue) if `region.selected` and not `region.skipped`
   - A **"Skipped"** badge (amber/orange) if `region.skipped` -- indicates the region is too short after softening buffer was applied
   - Time range: `formatTime(region.startTime)` arrow `formatTime(region.endTime)` with `(formatTime(region.duration))` suffix

3. **Expand/collapse chevron** -- toggles `expandedRegions` set membership for this region ID.

4. **Row click behavior** -- clicking the row (outside the checkbox) calls `onScrollToRegion?.(region.id)` to navigate the timeline/preview to that region's position.

### Expanded details section

When a region is expanded, show a detail panel below the summary with these rows:

| Label | Value |
|-------|-------|
| Start | `formatTime(region.startTime)` |
| End | `formatTime(region.endTime)` |
| Duration | `formatTime(region.duration)` |
| Adj. Start | `formatTime(region.adjustedStartTime)` (only if different from startTime) |
| Adj. End | `formatTime(region.adjustedEndTime)` (only if different from endTime) |
| Adj. Duration | `formatTime(region.adjustedDuration)` (show "0.00" or "Skipped" for skipped regions) |
| Avg Level | `region.averageDb.toFixed(1) dB` |
| Track | Track name resolved from `tracks.find(t => t.id === region.trackId)?.name` or "Unknown" |

### Track name resolution

```typescript
function resolveTrackName(trackId: string): string {
  return tracks.find(t => t.id === trackId)?.name || 'Unknown';
}
```

### Skipped region behavior

When `region.skipped` is `true`:

- The checkbox is rendered with `disabled` attribute
- The "Skipped" badge is shown in the region title (amber/orange background, dark text)
- The row has a reduced opacity (`opacity: 0.6`) to visually indicate it will not be included in export
- The region is still visible in the list (not hidden) so users understand why certain short regions are excluded by the softening buffer

### Styling approach

**IMPLEMENTATION NOTE:** Used inline `<style>` tag within the component (consistent with Section 03 dialog pattern) rather than external CSS file. This approach keeps component styles self-contained and follows the established pattern from the settings dialog.

- `.regions-list` -- scrollable container with max-height and custom scrollbar
- `.region-item`, `.region-item.selected` -- row card with selection highlight
- `.region-header` -- flex row with checkbox, info, expand button
- `.region-checkbox` -- checkbox sizing
- `.region-info`, `.region-title`, `.region-time` -- text layout
- `.badge-selected` -- blue selected badge
- `.expand-btn` -- chevron button
- `.region-details`, `.detail-row`, `.detail-label`, `.detail-value` -- expanded details
- `.empty-state` -- no-regions message

Add a new CSS class for the skipped badge:

```css
.badge-skipped {
  background: #ff9800;
  color: #1e1e1e;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}
```

And for the skipped row dimming:

```css
.region-item.skipped {
  opacity: 0.6;
}

.region-item.skipped .region-checkbox {
  cursor: not-allowed;
}
```

These new classes should be added to the existing `SilenceDetectionPanel.css` file or, if the dialog uses its own `<style>` tag approach (as described in Section 02), they can be colocated in the component file. The implementer should follow whichever pattern Section 02 establishes.

### Empty state

When `regions.length === 0`, render:

```html
<div class="empty-state">
  <p>No silent regions detected</p>
  <p class="help-text">Try adjusting the threshold or minimum duration</p>
</div>
```

### Export

Export the component as a named export:

```typescript
export { SilenceRegionList };
// Also export the props interface for use by parent components
export type { SilenceRegionListProps };
```

### Accessibility Enhancements

**IMPLEMENTATION NOTE:** The following accessibility features were added during code review (beyond original spec):

1. **ARIA labels:**
   - Checkbox: `aria-label="Select region ${index + 1}"`
   - Expand button: `aria-label="${isExpanded ? 'Collapse' : 'Expand'} details for region ${index + 1}"`
   - Region header: `aria-label="Scroll to region ${index + 1}"`

2. **Keyboard navigation:**
   - Region header: `tabIndex={0}` + `onKeyDown` handler for Enter/Space keys
   - Allows keyboard-only users to navigate and scroll to regions

3. **Semantic markup:**
   - Regions list container: `role="region"`, `aria-label="Detected silent regions"`, `aria-live="polite"`
   - Empty state: `role="status"`, `aria-live="polite"`
   - Region header: `role="button"`

4. **Event handling improvements:**
   - Checkbox: Merged `onChange` and `onClick` into single handler with `stopPropagation`
   - Expand button: `stopPropagation` called BEFORE `toggleExpanded` to ensure proper event ordering

5. **CSS cursor states:**
   - Added `.region-item.skipped .region-checkbox { cursor: not-allowed; }` for better visual feedback

These enhancements ensure WCAG compliance and improve the experience for screen reader users and keyboard-only navigation.

---

## Integration Points

### How the parent component (SilenceDetectionDialog) uses SilenceRegionList

The dialog (Section 02/03) manages the `silentRegions` state array and passes it down along with callback handlers:

```typescript
<SilenceRegionList
  regions={silentRegions}
  onToggleRegion={(regionId) => {
    setSilentRegions(prev =>
      prev.map(r => r.id === regionId ? { ...r, selected: !r.selected } : r)
    );
  }}
  onSelectAll={() => {
    setSilentRegions(prev =>
      prev.map(r => r.skipped ? r : { ...r, selected: true })
    );
  }}
  onDeselectAll={() => {
    setSilentRegions(prev =>
      prev.map(r => ({ ...r, selected: false }))
    );
  }}
  onScrollToRegion={(regionId) => {
    const region = silentRegions.find(r => r.id === regionId);
    if (region) {
      // Seek preview player and scroll waveform to region.startTime
      handleSeek(region.startTime);
    }
  }}
  tracks={project.timeline.tracks}
/>
```

Note: `onSelectAll` in the parent should skip `skipped` regions (they cannot be meaningfully selected since they have zero adjusted duration). This logic lives in the parent, not in `SilenceRegionList` itself -- the component simply calls the callback.

### Existing code being replaced

The inline region list JSX in `SilenceDetectionPanel.tsx` (lines ~316-391) is the code being extracted. After this section is complete, `SilenceDetectionPanel.tsx` will be converted to a trigger button (Section 02), so the inline list will be removed entirely. The new `SilenceRegionList.tsx` component replaces that inline JSX with a self-contained, reusable component.

---

## Implementation Checklist

✅ **COMPLETED:**

1. ✅ Created test file at `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/__tests__/SilenceRegionList.test.tsx` with 20 comprehensive test cases (using @testing-library/react)
2. ✅ Created component at `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/SilenceRegionList.tsx` with full implementation
3. ✅ Added inline styles including `.badge-skipped`, `.region-item.skipped`, and all other necessary CSS rules
4. ✅ All 20 tests pass successfully
5. ✅ Applied accessibility enhancements from code review:
   - ARIA labels for all interactive elements
   - Keyboard navigation support (tabIndex + onKeyDown)
   - Semantic markup (role, aria-live attributes)
   - Proper event handling (stopPropagation ordering)
   - Cursor state feedback for skipped regions

**Test Results:** 20/20 tests passing
**Files Created:**
- `apps/web/client/src/components/videoeditor/SilenceRegionList.tsx` (346 lines)
- `apps/web/client/src/components/videoeditor/__tests__/SilenceRegionList.test.tsx` (389 lines)