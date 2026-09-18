Now I have all the context needed. Let me generate the section content.

# Section 1: Type Extensions and Shared Logic

## Overview

This section extends the existing TypeScript types in `videoEditor.ts` and adds two pure utility functions that are used by every other section of the Silence Detection feature. It is the foundational piece -- no other section can be implemented before this one is complete.

**Scope:**
- Extend the `SilentRegion` interface with buffer-adjusted fields
- Extend `SilenceDetectionConfig` with a `softeningBuffer` field
- Add the `AnalysisStage` union type
- Add the `SilenceDetectionDialogState` reference interface (documentation/type contract)
- Implement `applyBufferToRegions()` -- pure function for softening buffer calculation
- Implement `dbToPercent()` -- pure helper for dual dB/percentage display

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/videoEditor.ts`

**New test file:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/__tests__/silenceDetectionUtils.test.ts`

**Dependencies:** None (this is the first section; all other sections depend on it)

---

## Tests (Write First)

Create the test file at `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/__tests__/silenceDetectionUtils.test.ts`. The existing test conventions (from `videoEditor.test.ts` in the same directory) use Vitest with `describe`/`it`/`expect` and import directly from `../videoEditor`.

### Test File Structure

```typescript
/**
 * Tests for silence detection utility functions:
 * - applyBufferToRegions()
 * - dbToPercent()
 */
import { describe, it, expect } from "vitest";
import {
  applyBufferToRegions,
  dbToPercent,
  type SilentRegion,
} from "../videoEditor";
```

### Tests for `applyBufferToRegions()`

```typescript
describe("applyBufferToRegions", () => {
  // Helper to create a test region with sensible defaults
  // id, trackId, startTime, endTime, duration, selected: true, averageDb: -45, skipped: false
  // adjustedStartTime/adjustedEndTime/adjustedDuration set equal to originals

  it("returns adjusted times when buffer is applied (start + buffer, end - buffer)", () => {
    // Region: 2.0s to 8.0s (6.0s duration), buffer: 0.5s
    // Expected: adjustedStart = 2.5, adjustedEnd = 7.5, adjustedDuration = 5.0
  });

  it("marks region as skipped when buffer makes adjustedEnd <= adjustedStart", () => {
    // Region: 5.0s to 5.4s (0.4s duration), buffer: 0.3s
    // adjustedStart = 5.3, adjustedEnd = 5.1 => skipped: true
  });

  it("sets adjustedDuration to 0 for skipped regions", () => {
    // Same scenario as above, verify adjustedDuration === 0
  });

  it("handles buffer of 0 (no change to original times)", () => {
    // Region: 3.0s to 7.0s, buffer: 0
    // adjustedStart === startTime, adjustedEnd === endTime
  });

  it("handles buffer larger than half the region duration - region is skipped", () => {
    // Region: 10.0s to 12.0s (2.0s), buffer: 1.5s
    // adjustedStart = 11.5, adjustedEnd = 10.5 => skipped
  });

  it("processes multiple regions independently", () => {
    // Two regions: one that survives buffer, one that gets skipped
    // Verify they are processed independently
  });

  it("preserves original startTime/endTime/duration fields", () => {
    // After applying buffer, original fields must be unchanged
  });

  it("handles empty regions array - returns empty array", () => {
    // Input: [], buffer: 0.5
    // Output: []
  });
});
```

### Tests for `dbToPercent()`

```typescript
describe("dbToPercent", () => {
  it("-60dB maps to 0%", () => {
    expect(dbToPercent(-60)).toBe(0);
  });

  it("-20dB maps to 100%", () => {
    expect(dbToPercent(-20)).toBe(100);
  });

  it("-40dB maps to 50%", () => {
    expect(dbToPercent(-40)).toBe(50);
  });

  it("values outside range still compute (no clamping) - returns negative or >100", () => {
    // -70dB should produce a negative value
    // -10dB should produce >100
  });
});
```

---

## Implementation Details

All changes go into a single file: `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/videoEditor.ts`.

### 1. Extend `SilentRegion` Interface

The current `SilentRegion` interface (lines 208-216 of `videoEditor.ts`) has six fields. Add three new fields for buffer-adjusted bounds and a `skipped` flag:

```typescript
export interface SilentRegion {
  id: string;
  trackId: string;
  startTime: number;           // original detected start (seconds)
  endTime: number;             // original detected end (seconds)
  duration: number;            // original duration (seconds)
  adjustedStartTime: number;   // start + softeningBuffer
  adjustedEndTime: number;     // end - softeningBuffer
  adjustedDuration: number;    // may be 0 if skipped
  selected: boolean;
  averageDb: number;
  skipped: boolean;            // true if too short after buffer
}
```

The three new fields are: `adjustedStartTime`, `adjustedEndTime`, `adjustedDuration`, and `skipped`. Existing code that creates `SilentRegion` objects (in `SilenceDetectionPanel.tsx`, lines 108-116) will need to initialize these new fields. When no buffer is applied, set `adjustedStartTime = startTime`, `adjustedEndTime = endTime`, `adjustedDuration = duration`, `skipped = false`.

**Impact on existing code:** The existing `SilenceDetectionPanel.tsx` constructs `SilentRegion` objects without these fields. After this change, TypeScript will flag those construction sites. However, `SilenceDetectionPanel.tsx` will be refactored in Section 2 (converted to a trigger button), so the breakage is temporary and expected. If you want to avoid type errors in the interim, initialize the new fields alongside the existing ones in `SilenceDetectionPanel.tsx` where regions are created (around line 108).

### 2. Extend `SilenceDetectionConfig`

The current `SilenceDetectionConfig` interface (lines 218-223) has four fields. Add `softeningBuffer`:

```typescript
export interface SilenceDetectionConfig {
  threshold: number;           // dB threshold for silence (e.g., -40)
  minDuration: number;         // Minimum silence duration to detect (seconds)
  softeningBuffer: number;     // Buffer in seconds to add/subtract at region edges (default 0.2)
  enabled: boolean;
  trackIds: string[];
}
```

### 3. Add `AnalysisStage` Type

Add this union type in the "Silence Detection & Dead Air Removal" section of the file:

```typescript
export type AnalysisStage =
  | 'idle'
  | 'preparing'
  | 'scanning'
  | 'detecting'
  | 'applying_buffer'
  | 'done'
  | 'error';
```

### 4. Add `SilenceDetectionDialogState` Reference Interface

This is a **documentation/type contract** interface. Implementers of the dialog (Section 2) will use individual `useState` hooks, not a single state object. This interface exists to document the full shape of the dialog's state in one place:

```typescript
/**
 * Reference interface for the Silence Detection Dialog's local state.
 * NOT used as a single useState<SilenceDetectionDialogState>() -- each
 * field is managed by its own useState hook. This exists as a type
 * contract / documentation for what state the dialog manages.
 */
export interface SilenceDetectionDialogState {
  isOpen: boolean;
  config: SilenceDetectionConfig;
  regions: SilentRegion[];
  analysisComplete: boolean;
  isAnalyzing: boolean;
  analysisStage: AnalysisStage;
  playbackTime: number;
  timelineZoom: number;
  skipSilencePreview: boolean;
  applyToAllTracks: boolean;
}
```

### 5. Implement `applyBufferToRegions()`

Pure function, placed in the "Helper Functions" section of `videoEditor.ts` (after the existing helpers like `formatTime`, `generateId`, etc.):

```typescript
/**
 * Apply a softening buffer to silence regions.
 * For each region: adjustedStart = start + buffer, adjustedEnd = end - buffer.
 * If the buffer makes the region too short (adjustedEnd <= adjustedStart),
 * the region is marked as skipped with adjustedDuration = 0.
 *
 * This runs client-side after detection results arrive and whenever
 * the buffer slider changes. No backend call needed.
 */
export function applyBufferToRegions(
  regions: SilentRegion[],
  bufferSeconds: number
): SilentRegion[] {
  // For each region, calculate adjusted bounds.
  // If adjustedEnd <= adjustedStart: mark skipped = true, adjustedDuration = 0.
  // Otherwise: adjustedDuration = adjustedEnd - adjustedStart.
  // Always preserve original startTime, endTime, duration fields.
}
```

Key implementation rules:
- Return a **new array** (do not mutate the input)
- Each returned region is a new object (spread the original, then override adjusted fields)
- `adjustedStartTime = region.startTime + bufferSeconds`
- `adjustedEndTime = region.endTime - bufferSeconds`
- If `adjustedEndTime <= adjustedStartTime`: set `skipped = true`, `adjustedDuration = 0`
- Otherwise: `skipped = false`, `adjustedDuration = adjustedEndTime - adjustedStartTime`
- `bufferSeconds = 0` means no adjustment (adjusted fields equal originals)

### 6. Implement `dbToPercent()`

Pure function, also in the "Helper Functions" section:

```typescript
/**
 * Convert a dB value to a percentage for display purposes.
 * Maps the range [-60dB, -20dB] to [0%, 100%].
 * Values outside this range are NOT clamped -- the caller may
 * receive negative values or values > 100.
 *
 * Used for dual display on the threshold slider.
 */
export function dbToPercent(db: number): number {
  // Formula: ((db - (-60)) / (-20 - (-60))) * 100
  // Simplified: ((db + 60) / 40) * 100
}
```

The formula is straightforward: `((db + 60) / 40) * 100`. No clamping.

---

## Where to Place New Code in the File

Looking at the existing file structure:

1. **Type additions** (SilentRegion extension, SilenceDetectionConfig extension, AnalysisStage, SilenceDetectionDialogState) go in the `// Silence Detection & Dead Air Removal` section, starting at line 206 of `videoEditor.ts`. Extend the existing interfaces in-place and add new types after `SilenceDetectionResult`.

2. **Function additions** (`applyBufferToRegions`, `dbToPercent`) go in the `// Helper Functions` section, after the existing helper functions (around line 295 onward, before the V2 Migration section which starts at line 509).

---

## Verification

After implementation, run the test file:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run client/src/types/__tests__/silenceDetectionUtils.test.ts
```

Also verify that existing tests still pass (the `SilentRegion` type change may break `videoEditorMigration.test.ts` if it constructs `SilentRegion` objects -- check and update if needed):

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run client/src/types/__tests__/videoEditor.test.ts
```

Optionally run the full TypeScript type check to see what other files need the new fields:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check
```

Expected type errors will appear in `SilenceDetectionPanel.tsx` where `SilentRegion` objects are constructed without the new fields. This is addressed in Section 2 (dialog layout) when the panel is converted to a trigger button. If you want to fix it immediately, add the new fields with defaults (`adjustedStartTime: startTime, adjustedEndTime: endTime, adjustedDuration: duration, skipped: false`) at the construction site (around line 108 of `SilenceDetectionPanel.tsx`).

---

## Implementation Notes (Post-Implementation)

**Actual files modified:**
- `apps/web/client/src/types/videoEditor.ts` — Extended `SilentRegion` (4 new fields), `SilenceDetectionConfig` (+`softeningBuffer`), added `AnalysisStage`, `SilenceDetectionDialogState`, `applyBufferToRegions()`, `dbToPercent()`
- `apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx` — Fixed `SilentRegion` construction to include new fields (lines 108-125)

**New files created:**
- `apps/web/client/src/types/__tests__/silenceDetectionUtils.test.ts` — 16 tests

**Deviations from plan:**
- `applyBufferToRegions()` includes defensive clamping (`Math.max(0, bufferSeconds)` and `Math.max(0, adjustedStartTime)`) not in original spec. Added after code review for safety.
- Added 4 extra test cases beyond spec: immutability verification, exact-boundary edge case, negative buffer clamping, and non-negative adjustedStartTime guarantee.
- `SilenceDetectionPanel.tsx` was patched immediately rather than deferring to Section 2, to keep the codebase compiling.