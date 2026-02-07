Now I have all the context I need. Let me generate the section content.

# Section 05: Frontend Consolidation

## Overview

This section merges the four VideoEditor component variants (Phase 0, Phase 1, Phase 2, Phase 3) into a single unified `VideoEditor.tsx` component wired to the `MediaJobClient` abstraction from Section 02. It also migrates all time units from seconds to milliseconds, fixes duplicate type definitions, removes `@ts-nocheck`, connects `WaveformCanvas` and `SilenceDetectionPanel` to real backend data, and makes `ProjectManager` platform-aware.

**Dependencies**: Sections 01 (Job Spec types), 02 (MediaJobClient), 03 (Desktop Engine Adapter), 04 (Web Engine Adapter) must be completed first. The `MediaJobClient`, `IEngineAdapter`, and `MediaJobSpec` types must exist before this section can be implemented.

## Files Overview

### Files to Modify

| File | Change Summary |
|------|---------------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/videoEditor.ts` | Migrate time fields to ms, bump version to "2.0", eliminate duplicate types, add migration helpers |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/videoEditorService.ts` | Remove `@ts-nocheck`, refactor to use `MediaJobClient`, remove duplicate `MediaLibraryAsset` and `RenderJob` types |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/projectManager.ts` | Add platform detection, fix `sample_rate` vs `sampleRate` validation bug, delegate to web or desktop storage |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoEditor.tsx` | Replace with consolidated component (all features from Phase 3) |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/WaveformCanvas.tsx` | Wire to real waveform peak data from `waveform_peaks` job |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx` | Wire to `MediaJobClient.detectDeadAir()` and `MediaJobClient.cutDeadAir()` |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/MediaLibraryPanel.tsx` | Import `MediaLibraryAsset` from canonical location in `types/videoEditor.ts` |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/VideoEditorPage.tsx` | Remove Tauri-only guard, render consolidated `VideoEditor` on all platforms |

### Files to Delete

| File | Reason |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoEditorPhase1.tsx` | Merged into consolidated `VideoEditor` |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoEditorPhase2.tsx` | Merged into consolidated `VideoEditor` |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx` | Merged into consolidated `VideoEditor` |

---

## Tests (Write First)

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/__tests__/VideoEditor.test.tsx`

```typescript
/**
 * Consolidated VideoEditor component tests.
 * These tests verify the merged component works correctly
 * with the MediaJobClient abstraction layer.
 */
import { describe, it, expect, vi } from "vitest";

describe("VideoEditor", () => {
  it("renders without crashing", () => {
    /** Render the VideoEditor component and assert it produces
     * a container element with the expected root class. */
  });

  it("detects platform and uses correct adapter", () => {
    /** When window.__TAURI__ exists, MediaJobClient should use
     * TauriEngineAdapter. Otherwise it should use WebEngineAdapter.
     * Mock detectPlatform and verify the adapter selection. */
  });

  it("MediaLibraryPanel shows upload button on web", () => {
    /** On web platform, the MediaLibraryPanel should render an
     * "Upload Media" button in addition to the "From Generated" list. */
  });

  it("MediaLibraryPanel shows generated media from backend", () => {
    /** Mock videoEditorMediaLibrary.fetchAllGeneratedMedia to return
     * test data. Verify the list renders video and audio items. */
  });

  it("ExportDialog triggers download on web platform", () => {
    /** On web, clicking export should create a browser download
     * rather than calling Tauri's save dialog. */
  });

  it("ExportDialog triggers save dialog on desktop platform", () => {
    /** On desktop, clicking export should invoke Tauri's save()
     * dialog and use the returned path for the render output. */
  });

  it("WaveformCanvas renders peaks from waveform_peaks job result", () => {
    /** Pass real peak data (array of 0.0-1.0 floats) to
     * WaveformCanvas and verify the canvas draws correctly. */
  });

  it("SilenceDetectionPanel calls detectDeadAir on analyze button click", () => {
    /** Mock MediaJobClient.detectDeadAir(). Click the "Auto-Detect"
     * button. Verify the mock was called with the correct asset URI
     * and threshold parameters. */
  });

  it("SilenceDetectionPanel displays detected silence regions", () => {
    /** After detectDeadAir resolves with silence segments, verify
     * the panel renders each region with start time, end time,
     * and a selection checkbox. */
  });

  it("SilenceDetectionPanel calls cutDeadAir on remove button click", () => {
    /** Select some silence regions, click "Cut & Combine". Verify
     * MediaJobClient.cutDeadAir() is called with the correct
     * segments and mode. */
  });

  it("PreviewPlayer uses HTML5 video on web", () => {
    /** On web platform, PreviewPlayer should render a standard
     * <video> element with an https:// source URL, not a Tauri
     * asset:// protocol. */
  });
});
```

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/__tests__/videoEditorMigration.test.ts`

```typescript
/**
 * Tests for time unit migration (seconds -> milliseconds)
 * and project version upgrade (1.0 -> 2.0).
 */
import { describe, it, expect } from "vitest";

describe("Time Unit Migration", () => {
  it("migrateProjectV1ToV2 converts all seconds fields to milliseconds", () => {
    /** Create a v1.0 project with time values in seconds.
     * Call migrateProjectV1ToV2(). Verify all time fields
     * (startTime -> startMs, duration -> durationMs, trimIn -> inMs,
     * trimOut -> outMs) are multiplied by 1000. */
  });

  it("migrateProjectV1ToV2 sets version to 2.0", () => {
    /** After migration, project.version should be "2.0". */
  });

  it("migrateProjectV1ToV2 is idempotent on v2.0 projects", () => {
    /** Calling migration on a project already at version "2.0"
     * should return it unchanged (no double-conversion). */
  });

  it("formatTimeMs displays milliseconds in MM:SS.CC format", () => {
    /** 65500ms -> "1:05.55", 0ms -> "0:00.00",
     * 3661000ms -> "1:01:01.00" */
  });

  it("calculateProjectDurationMs computes from ms-based clips", () => {
    /** Given clips with startMs and durationMs, returns the maximum
     * endpoint in ms. */
  });
});
```

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/__tests__/videoEditorTypes.test.ts`

```typescript
/**
 * Tests for type consolidation and elimination of duplicates.
 */
import { describe, it, expect } from "vitest";

describe("Type Consolidation", () => {
  it("MediaLibraryAsset is exported only from types/videoEditor.ts", () => {
    /** Import MediaLibraryAsset from types/videoEditor.ts.
     * Verify it has all required fields: id, type, title,
     * thumbnailUrl, duration, url, model, createdAt, format. */
  });

  it("RenderJob is exported only from types/videoEditor.ts", () => {
    /** Import RenderJob from types/videoEditor.ts.
     * Verify it uses camelCase field names (outputPath, not output_path). */
  });

  it("videoEditorService.ts re-exports types from videoEditor.ts, not duplicate definitions", () => {
    /** Verify that videoEditorService.ts imports and re-exports
     * MediaLibraryAsset and RenderJob from types/videoEditor.ts. */
  });
});
```

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/__tests__/projectManager.test.ts`

```typescript
/**
 * Tests for ProjectManager validation bug fix and platform detection.
 */
import { describe, it, expect } from "vitest";

describe("ProjectManager", () => {
  it("validateProjectStructure accepts sampleRate (camelCase)", () => {
    /** Create a valid project structure with settings.sampleRate = 48000.
     * Call validateProjectStructure(). It should NOT throw.
     * The current bug checks settings.sample_rate (snake_case). */
  });

  it("validateProjectStructure accepts v2.0 projects with ms fields", () => {
    /** Create a v2.0 project with startMs/durationMs fields.
     * Validation should accept clip.startMs >= 0 and
     * clip.durationMs > 0 (max 7200000ms). */
  });

  it("loadProject auto-migrates v1.0 projects to v2.0", () => {
    /** Mock readTextFile to return a v1.0 JSON project.
     * Call loadProject(). The returned project should have
     * version "2.0" with ms-based time fields. */
  });
});
```

---

## Implementation Details

### Task 1: Fix Type Definitions in `videoEditor.ts`

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/videoEditor.ts`

**Current state**: All time values use seconds (e.g., `startTime: number`, `duration: number`, `trimIn: number`, `trimOut: number`). The `MediaLibraryAsset` type is defined here AND duplicated in `videoEditorService.ts`. The `RenderJob` type is also duplicated with snake_case fields in the service file.

**Changes required**:

1. **Rename time fields to ms convention**:
   - `Clip.startTime` -> `Clip.startMs`
   - `Clip.duration` -> `Clip.durationMs`
   - `Clip.trimIn` -> `Clip.inMs`
   - `Clip.trimOut` -> `Clip.outMs`
   - `Clip.transitions.fadeIn` -> `Clip.transitions.fadeInMs`
   - `Clip.transitions.fadeOut` -> `Clip.transitions.fadeOutMs`
   - `ProjectSettings.duration` -> `ProjectSettings.durationMs`
   - `SilentRegion.startTime` -> `SilentRegion.startMs`
   - `SilentRegion.endTime` -> `SilentRegion.endMs`
   - `SilentRegion.duration` -> `SilentRegion.durationMs`
   - `SilenceDetectionConfig.minDuration` -> `SilenceDetectionConfig.minDurationMs`
   - `TimelineState.currentTime` -> `TimelineState.currentTimeMs`

2. **Bump project version**: Change default in `createEmptyProject()` from `"1.0"` to `"2.0"`.

3. **Add migration function**:
   ```typescript
   function migrateProjectV1ToV2(project: any): VideoEditorProject
   ```
   This function checks `project.version`. If `"1.0"`, it multiplies all time values by 1000 and sets version to `"2.0"`. If already `"2.0"` or higher, returns unchanged.

4. **Add ms-based formatting helper**:
   ```typescript
   function formatTimeMs(ms: number): string
   ```

5. **Update `calculateProjectDuration`** to use `startMs + durationMs` instead of `startTime + duration`. Rename to `calculateProjectDurationMs`.

6. **Update `addClipToTrack`** to use ms-based field names.

7. **Ensure `MediaLibraryAsset` and `RenderJob` remain the canonical exports**. The `RenderJob` interface should use camelCase (`outputPath` not `output_path`, `startedAt` not `started_at`).

8. **Add `Track.type` to include `"overlay"` in the union** (Phase 3 uses overlay tracks). Currently the type is `'video' | 'audio' | 'overlay'` which is correct.

### Task 2: Refactor `videoEditorService.ts`

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/videoEditorService.ts`

**Current state**: Has `@ts-nocheck` on line 1. Defines duplicate `MediaLibraryAsset` and `RenderJob` types. All methods use `invoke()` from Tauri directly.

**Changes required**:

1. **Remove `@ts-nocheck`** directive.

2. **Delete the duplicate type definitions** for `MediaLibraryAsset` and `RenderJob`. Instead, import from `types/videoEditor.ts`:
   ```typescript
   import type { MediaLibraryAsset, RenderJob } from '../types/videoEditor';
   ```

3. **Keep `MediaFileInfo` and `WorkspaceFile`** as they are service-specific types not duplicated elsewhere.

4. **Refactor `VideoEditorMediaLibrary` class**:
   - The `downloadToWorkspace` method currently uses `invoke('save_blob_to_file')` and `invoke('file_exists')`. These are Tauri-specific. Add a platform check: on web, upload via API instead.
   - The `generateThumbnail` method uses `invoke('ffmpeg_generate_thumbnail')`. Replace with `jobClient.getThumbnails()`.
   - The `probeMediaFile` method uses `invoke('ffmpeg_probe_file')`. Replace with `jobClient.probe()`.

5. **Refactor `VideoEditorRenderService` class**:
   - `startRender` currently calls `invoke('start_render')`. Replace with `jobClient.renderMp4()`.
   - `getRenderStatus` currently calls `invoke('get_render_status')`. Replace with adapter's `getStatus()`.
   - `cancelRender` currently calls `invoke('cancel_render')`. Replace with `jobClient.cancelJob()`.
   - `pollRenderJob` should use `jobClient.waitForCompletion()` instead of manual polling.

6. **Fix TypeScript errors** that the `@ts-nocheck` was hiding (likely related to the `mediaService` import and implicit `any` parameters).

### Task 3: Fix `projectManager.ts` Validation Bug and Add Platform Detection

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/projectManager.ts`

**Current state**: Line 47-48 validates `settings.sample_rate` (snake_case), but the `ProjectSettings` type uses `sampleRate` (camelCase). This means validation always fails for valid projects. Also, the entire file depends on Tauri APIs (`invoke`, `save`/`open` dialogs, `readTextFile`/`writeTextFile`).

**Changes required**:

1. **Fix the validation bug**: Change `settings.sample_rate` to `settings.sampleRate` on line 47-48.

2. **Add version-aware validation**: When version is `"2.0"`, validate `clip.startMs` and `clip.durationMs` (in ms, max 7200000) instead of `clip.startTime` and `clip.duration`.

3. **Add auto-migration on load**: In `loadProject()`, after parsing JSON, check `data.version`. If `"1.0"`, call `migrateProjectV1ToV2(data)` before validation. This ensures seamless upgrade of old project files.

4. **Add platform detection**: The `saveProject` and `loadProject` methods must work on both desktop (Tauri) and web. Add a `detectPlatform()` check:
   - Desktop: Use existing Tauri dialog + filesystem APIs (current behavior).
   - Web: Delegate to `WebProjectManager` (implemented in Section 06). For this section, add the platform branching logic but the web path can throw `new Error('Web project storage not yet implemented')` as a placeholder until Section 06.

5. **Conditionally import Tauri APIs**: Wrap Tauri imports in dynamic import or platform check so the module does not crash when loaded in a web browser:
   ```typescript
   async function getTauriApis() {
     const core = await import('@tauri-apps/api/core');
     const dialog = await import('@tauri-apps/plugin-dialog');
     const fs = await import('@tauri-apps/plugin-fs');
     return { invoke: core.invoke, save: dialog.save, open: dialog.open, readTextFile: fs.readTextFile, writeTextFile: fs.writeTextFile };
   }
   ```

### Task 4: Consolidate VideoEditor Components

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoEditor.tsx`

**Current state**: This file contains the Phase 0 "basic media library" component. The most complete variant is `VideoEditorPhase3.tsx` which includes all features: timeline, preview, export, audio ducking, aspect ratio, history, transitions, overlays, silence detection, keyboard shortcuts, error boundary, confirm dialogs, multi-select, copy/paste, split, ripple edit.

**Changes required**:

1. **Replace the Phase 0 content entirely** with the Phase 3 component as the base, renamed to `VideoEditor`.

2. **Wire to `MediaJobClient`**: Replace all direct `invoke()` calls and service class calls with `MediaJobClient` methods:

   | Current Pattern | New Pattern |
   |-----------------|-------------|
   | `videoEditorRenderService.startRender(projectJson, outputPath)` | `jobClient.renderMp4(project, outputPath)` |
   | `videoEditorRenderService.getRenderStatus(jobId)` | `jobClient.waitForCompletion(jobId, onProgress)` |
   | `videoEditorRenderService.cancelRender(jobId)` | `jobClient.cancelJob(jobId)` |
   | `fetch('/api/video-editor/analyze-silence', ...)` (in SilenceDetectionPanel) | `jobClient.detectDeadAir(assetUri, params)` |
   | Direct confirm dialog for cut+combine | `jobClient.cutDeadAir(assetUri, segments, mode)` |

3. **Use ms-based time fields throughout**: All references to `startTime`, `duration`, `trimIn`, `trimOut` must change to `startMs`, `durationMs`, `inMs`, `outMs`. The playback loop increment changes from `prev + 1/30` (seconds) to `prev + 1000/30` (milliseconds).

4. **Update all component references**: All child components (`Timeline`, `PreviewPlayer`, `Toolbar`, etc.) receive ms-based props. Display functions use `formatTimeMs()` instead of `formatTime()`.

5. **Wrap in `ErrorBoundary`** (already present in Phase 3).

6. **Export as both named and default**: `export const VideoEditor` and `export default VideoEditor`.

### Task 5: Update `VideoEditorPage.tsx`

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/VideoEditorPage.tsx`

**Current state**: Has a Tauri-only guard that shows `DesktopOnlyMessage` on web. Imports `VideoEditorPhase3`.

**Changes required**:

1. **Remove the Tauri guard**. The video editor should work on both desktop and web platforms. The `MediaJobClient` auto-selects the correct adapter.

2. **Import the consolidated `VideoEditor`** instead of `VideoEditorPhase3`:
   ```typescript
   import { VideoEditor } from '@/components/videoeditor/VideoEditor';

   export default function VideoEditorPage() {
     return <VideoEditor />;
   }
   ```

### Task 6: Wire WaveformCanvas to Real Data

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/WaveformCanvas.tsx`

**Current state**: The component already renders a canvas from `waveformData: number[]` prop. It works correctly with real data. The problem is upstream: callers pass dummy data like `[0.5, 0.5, ...]` instead of real peaks.

**Changes required**:

1. **No changes to the component itself** -- it already handles real data correctly.

2. **The wiring happens in the consolidated `VideoEditor.tsx`** and in the `TimelineClip.tsx` component: when an audio clip is added to the timeline, call `jobClient.getWaveformPeaks(assetUri)` and store the resulting peaks in the asset's `waveformData` property. Then pass that data to `WaveformCanvas`.

3. **Add a loading state**: While the waveform job is running, show a "loading..." indicator or a flat-line placeholder. Once peaks arrive, re-render with real data.

### Task 7: Wire SilenceDetectionPanel to MediaJobClient

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx`

**Current state**: The `handleAutoDetect` function makes a raw `fetch('/api/video-editor/analyze-silence', ...)` call. This endpoint does not exist yet -- the silence detection should go through the `MediaJobClient`.

**Changes required**:

1. **Accept `jobClient` as a prop** or obtain it from a React context/hook:
   ```typescript
   interface SilenceDetectionPanelProps {
     project: VideoEditorProject;
     jobClient: MediaJobClient;
     onCutAndCombine: (selectedRegions: SilentRegion[]) => void;
   }
   ```

2. **Replace the `fetch()` call** in `handleAutoDetect` with:
   ```typescript
   const result = await jobClient.detectDeadAir(assetUri, {
     thresholdDb: threshold,
     minSilenceMs: minDuration * 1000
   });
   ```

3. **Replace the cut action** to use `jobClient.cutDeadAir()`:
   ```typescript
   const result = await jobClient.cutDeadAir(assetUri, selectedSegments, 'remove');
   ```

4. **Update time handling**: The panel currently works in seconds. With the ms migration, all `startTime`/`endTime`/`duration` references become `startMs`/`endMs`/`durationMs`. The threshold sliders and display values should be updated accordingly.

### Task 8: Update MediaLibraryPanel Import Path

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/MediaLibraryPanel.tsx`

**Current state**: Imports `MediaLibraryAsset` from `../../services/videoEditorService`. After Task 2, the canonical type location is `../../types/videoEditor`.

**Changes required**:

1. **Change the import**:
   ```typescript
   // Before
   import { videoEditorMediaLibrary, type MediaLibraryAsset } from '../../services/videoEditorService';

   // After
   import { videoEditorMediaLibrary } from '../../services/videoEditorService';
   import type { MediaLibraryAsset } from '../../types/videoEditor';
   ```

### Task 9: Delete Phase Variant Files

After all the above changes compile and tests pass, delete:

- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoEditorPhase1.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoEditorPhase2.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`

Verify no other files import these:

```bash
grep -r "VideoEditorPhase1\|VideoEditorPhase2\|VideoEditorPhase3" apps/web/client/src/
```

If any imports remain, update them to point to the consolidated `VideoEditor`.

---

## Implementation Order

1. **Task 1** -- Update `videoEditor.ts` types (ms migration, dedup, helpers)
2. **Task 3** -- Fix `projectManager.ts` (validation bug, migration-on-load, platform branching)
3. **Task 2** -- Refactor `videoEditorService.ts` (remove @ts-nocheck, dedup types, wire to MediaJobClient)
4. **Task 8** -- Fix `MediaLibraryPanel.tsx` import path
5. **Task 4** -- Consolidate VideoEditor components
6. **Task 7** -- Wire SilenceDetectionPanel
7. **Task 6** -- Wire WaveformCanvas (upstream in consolidated component)
8. **Task 5** -- Update VideoEditorPage (remove Tauri guard)
9. **Task 9** -- Delete phase variant files
10. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`

---

## Key Bug Fixes Included

### 1. `projectManager.ts` snake_case validation bug

**Root cause**: Line 47-48 of `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/projectManager.ts` checks `settings.sample_rate` but the `ProjectSettings` type (line 27 of `videoEditor.ts`) defines it as `sampleRate` (camelCase). This means any valid project with `sampleRate: 48000` will fail validation because `settings.sample_rate` is `undefined`, which is `typeof undefined !== 'number'`.

**Fix**: Change `settings.sample_rate` to `settings.sampleRate` in the validation function.

### 2. Duplicate type definitions

**Root cause**: `MediaLibraryAsset` is defined in both `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/videoEditor.ts` (line 227) and `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/videoEditorService.ts` (line 14). `RenderJob` is defined in both `videoEditor.ts` (line 213, camelCase) and `videoEditorService.ts` (line 48, snake_case). The service file version uses `output_path`, `started_at`, `completed_at` while the types file uses `outputPath`, `startedAt`, `completedAt`.

**Fix**: Delete the duplicate definitions from `videoEditorService.ts`. Import from `types/videoEditor.ts`. Standardize on camelCase.

### 3. `@ts-nocheck` suppressing real errors

**Root cause**: Line 1 of `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/videoEditorService.ts` has `// @ts-nocheck` which suppresses all TypeScript errors. This hides issues with the `mediaService` import and implicit `any` parameters.

**Fix**: Remove `@ts-nocheck`. Add proper typing for the `mediaService` import and all function parameters. The `mediaService` module may need a type declaration or proper TypeScript exports.

---

## Verification Checklist

After implementing all tasks:

1. `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test` -- all tests pass
2. `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` -- no TypeScript errors
3. Grep for old phase imports: `grep -r "VideoEditorPhase" apps/web/client/src/` -- should return nothing
4. Grep for `@ts-nocheck` in service: `grep -r "ts-nocheck" apps/web/client/src/services/` -- should return nothing
5. Grep for `sample_rate` in projectManager: `grep "sample_rate" apps/web/client/src/services/projectManager.ts` -- should return nothing
6. Verify `MediaLibraryAsset` is defined in exactly one place: `grep -r "export interface MediaLibraryAsset" apps/web/client/src/` -- should return one result in `types/videoEditor.ts`
7. Verify `RenderJob` is defined in exactly one place: `grep -r "export interface RenderJob" apps/web/client/src/` -- should return one result in `types/videoEditor.ts`