# Silence Detection (Dead Air Removal) — Implementation Plan

## 1. Context and Goals

SmartSpecPro's video editor currently has a sidebar-based Silence Detection panel that can detect silent regions in audio tracks using FFmpeg's `silencedetect` filter via a MediaJobClient → Python backend pipeline. However, the UX is limited to a narrow sidebar with no waveform visualization, no video preview integration, and a basic "Cut & Combine" action that uses `window.confirm()`.

This plan upgrades the feature into a **full-screen dialog** inspired by Filmora's Silence Detection, adding:

1. **Full-screen dialog** replacing the sidebar panel (sidebar becomes a trigger button)
2. **Extended waveform visualization** with clickable region overlays and playhead sync
3. **Embedded video preview** with a "skip-silence" playback mode
4. **Softening buffer** parameter for smooth cut transitions
5. **Non-destructive "Export to Timeline"** that splits clips and ripple-deletes silent regions
6. **Backend `dead_air_cut` handler** for server-side re-encoded export via FFmpeg
7. **Mini-timeline** with video thumbnails and zoom controls

**Target content:** Videos up to 30 minutes (short-form: YouTube, tutorials, podcasts).

---

## 2. Architecture Overview

### Component Hierarchy

```
VideoEditorPhase3.tsx (host)
  ├── SilenceDetectionPanel.tsx (sidebar trigger → opens dialog)
  └── SilenceDetectionDialog.tsx (full-screen modal)
        ├── PreviewPlayer.tsx (embedded, with skip-silence logic)
        ├── Settings Panel (sliders + analyze button + results)
        │   └── SilenceRegionList.tsx (extracted region checklist)
        └── SilenceTimeline.tsx (bottom zone)
              ├── Time ruler
              ├── Video thumbnail strip
              └── WaveformCanvas.tsx + SilenceWaveformOverlay.tsx (stacked)
```

### Data Flow

```
User adjusts settings → clicks Analyze
  → MediaJobClient.detectDeadAir(assetUri, {thresholdDb, minSilenceMs})
  → Python backend: FFmpeg silencedetect → silenceSegments[]
  → Frontend applies softening buffer → SilentRegion[] with adjusted bounds
  → Waveform overlay renders regions, stats update

User clicks Export to Timeline
  → Collect selected regions
  → Process clips in reverse order: split at boundaries, remove silent segments
  → Ripple delete gaps, addToHistory() as single undo step
  → Close dialog, toast + highlight changes on main timeline

User requests server-side export (optional)
  → MediaJobClient.cutDeadAir(assetUri, segments, mode)
  → Python backend: FFmpeg select/aselect + concat → output.mp4
```

---

## 3. Section 1: Type Extensions and Shared Logic

### 3.1 Extend `SilentRegion` Interface

**File:** `apps/web/client/src/types/videoEditor.ts`

Add buffer-adjusted fields to `SilentRegion`:

```typescript
export interface SilentRegion {
  id: string;
  trackId: string;
  startTime: number;         // original detected start (seconds)
  endTime: number;           // original detected end
  duration: number;          // original duration
  adjustedStartTime: number; // start + softeningBuffer
  adjustedEndTime: number;   // end - softeningBuffer
  adjustedDuration: number;  // may be 0 if skipped
  selected: boolean;
  averageDb: number;
  skipped: boolean;          // true if too short after buffer
}
```

### 3.2 Extend `SilenceDetectionConfig`

Add `softeningBuffer` field (default 0.2s).

### 3.3 Add `SilenceDetectionDialogState` and `AnalysisStage`

Define a union type for analysis stages:

```typescript
type AnalysisStage = 'idle' | 'preparing' | 'scanning' | 'detecting' | 'applying_buffer' | 'done' | 'error';
```

New reference interface for dialog-level state (used as documentation/type contract — implementers will use individual `useState` hooks, not a single `useState<SilenceDetectionDialogState>()`): `isOpen`, `config`, `regions`, `analysisComplete`, `isAnalyzing`, `analysisStage: AnalysisStage`, `playbackTime`, `timelineZoom`, `skipSilencePreview`, `applyToAllTracks`.

### 3.4 Buffer Calculation Logic

Pure function `applyBufferToRegions(regions: SilentRegion[], bufferSeconds: number): SilentRegion[]`:
- For each region: `adjustedStart = start + buffer`, `adjustedEnd = end - buffer`
- If `adjustedEnd <= adjustedStart`: mark as `skipped: true`, `adjustedDuration: 0`
- Otherwise: calculate `adjustedDuration = adjustedEnd - adjustedStart`

This function runs client-side after detection results arrive and whenever the buffer slider changes.

### 3.5 dB-to-Percentage Conversion

Helper: `dbToPercent(db: number): number` → `((db - (-60)) / (-20 - (-60))) * 100`
Used for dual display on the threshold slider.

---

## 4. Section 2: Dialog Component and Layout

### 4.1 Sidebar Trigger Conversion

**File:** `SilenceDetectionPanel.tsx`

Replace the current panel content with a trigger card/button. When clicked, it sets `showSilenceDialog = true` on the parent `VideoEditorPhase3.tsx`.

The existing `SilenceDetectionPanel.tsx` keeps its file name but its JSX reduces to a styled button with an icon and description text like "Open Silence Detection" with a brief explanation.

### 4.2 Dialog State in Editor Host

**File:** `VideoEditorPhase3.tsx`

Add state: `const [showSilenceDialog, setShowSilenceDialog] = useState(false);`

Render conditionally at the end of the JSX (following the ExportDialog/RenderProgressDialog pattern):

```typescript
{showSilenceDialog && (
  <SilenceDetectionDialog
    project={project}
    onExportToTimeline={handleSilenceExportToTimeline}
    onClose={() => setShowSilenceDialog(false)}
  />
)}
```

### 4.3 Dialog Component Structure

**New file:** `SilenceDetectionDialog.tsx`

Three-zone layout:

1. **Header:** Back button, title "Silence Detection", close (X) button
2. **Main content area (flex row on desktop, flex column on mobile):**
   - **Left/Top:** PreviewPlayer embedded with skip-silence controls
   - **Right/Bottom:** Settings panel (3 sliders + Analyze button + SilenceRegionList + stats)
3. **Bottom zone:** SilenceTimeline (time ruler + thumbnail strip + waveform overlay)
4. **Footer:** "Export to Timeline" button + "Apply to all tracks" toggle

**Dialog shell:** Use Radix UI Dialog primitives (`Dialog.Root`, `Dialog.Portal`, `Dialog.Overlay`, `Dialog.Content`) as the outer container, matching the ExportDialog pattern. This provides focus trapping, ESC-to-close, and ARIA attributes automatically.

**Styling approach:** CSS-in-JS via `<style>` tag (matching ExportDialog and RenderProgressDialog patterns in the codebase). Dark theme: `#1a1a1a` background, `#2a2a2a` panels, `#e0e0e0` text, `#0078d4` accent.

**Responsive breakpoint:** `1280px`. Above: side-by-side. Below: stacked.

**Z-index:** 2000+ (above other editor overlays).

### 4.5 Waveform Data Availability Check

On dialog open, check if `asset.waveformData` exists for the target clip's asset:
1. If `undefined`: trigger a `waveform_peaks` media job via MediaJobClient immediately
2. Show a loading skeleton in the waveform/timeline area while waiting
3. If waveform generation fails: display a "Waveform unavailable" message in the timeline area, but allow analysis and export to proceed (analysis does not depend on waveform data)

### 4.4 Dialog Props Interface

```typescript
interface SilenceDetectionDialogProps {
  project: VideoEditorProject;
  onExportToTimeline: (selectedRegions: SilentRegion[], applyToAllTracks: boolean) => void;
  onClose: () => void;
}
```

All detection state is local to the dialog (config, regions, analysis status). The dialog communicates results upward only via `onExportToTimeline`.

---

## 5. Section 3: Settings Panel and Detection Flow

### 5.1 Settings UI

Three sliders within the dialog's settings zone:

- **Volume Threshold:** Range input, -60 to -20 dB, step 1. Label shows both dB and percentage.
- **Minimum Duration:** Range input, 0.1 to 5.0s, step 0.1.
- **Softening Buffer:** Range input, 0.0 to 2.0s, step 0.05. New parameter not in backend — applied client-side.

Sliders disabled while `isAnalyzing` is true.

### 5.2 Track Selection

Below sliders: checkboxes for each audio track with clips. Pre-select first audio track. Same logic as current panel.

### 5.3 Analyze Button

Triggers `handleAutoDetect()`:

1. Set `isAnalyzing = true`, `analysisStage = "Preparing..."`
2. Find asset URI from first selected track's first clip
3. Call `createMediaJobClient().detectDeadAir(assetUri, { thresholdDb, minSilenceMs })`
4. Update stage labels during wait: "Scanning audio..." → "Detecting silence..."
5. On result: map `silenceSegments` to `SilentRegion[]`
6. Apply softening buffer via `applyBufferToRegions()`
7. Calculate stats (total silence, active time)
8. Set `analysisComplete = true`, `isAnalyzing = false`, `analysisStage = "Done"`

Stage label transitions can be timer-based (estimated) since the backend doesn't currently report fine-grained progress for detection.

**Note:** Analysis uses only the first selected track's first clip. If multiple tracks are selected, they share the same detection results. This is the intended MVP behavior, matching Filmora and similar tools. A future enhancement could run `detectDeadAir` per-track and merge results.

### 5.6 Analysis Cancellation and Error Handling

- Store an `AbortController` ref. On dialog unmount (or close during analysis), call `abort()` to cancel in-flight `detectDeadAir` requests.
- If analysis fails or times out: set `analysisStage = 'error'`, show a meaningful error message in the stats area (e.g., "Analysis failed — try again or adjust settings"), re-enable sliders.
- Disable the Analyze button while `isAnalyzing` is true (prevents duplicate concurrent requests).

### 5.4 Stats Display

After analysis: grid of stat cards showing:
- Total silence duration
- Active audio duration
- Selected region count + duration

### 5.5 Re-analysis on Buffer Change

When the softening buffer slider changes after analysis is complete, re-run `applyBufferToRegions()` with the new buffer value. This recalculates adjusted bounds and updates which regions are skipped. No backend call needed.

---

## 6. Section 4: Silence Region List Component

### 6.1 Extracted Component

**New file:** `SilenceRegionList.tsx`

Extract the region list from the current `SilenceDetectionPanel.tsx` into a standalone component.

### 6.2 Props Interface

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

### 6.3 Features

- Checkbox per region to toggle selection
- Select All / Deselect All buttons
- Expandable details (start, end, duration, dB, track name)
- Skipped regions (too short after buffer) shown with a "Skipped" badge and disabled checkbox
- Click a region → calls `onScrollToRegion` to scroll the timeline waveform to that position and seek the preview player

---

## 7. Section 5: Waveform Overlay Component

### 7.1 Architecture

**New file:** `SilenceWaveformOverlay.tsx`

A canvas-based component that renders ON TOP of the existing `WaveformCanvas`. The parent container uses `position: relative` to stack them.

```
<div style={{ position: 'relative' }}>
  <WaveformCanvas waveformData={...} width={...} height={...} />
  <SilenceWaveformOverlay
    regions={regions}
    duration={duration}
    currentTime={currentTime}
    width={width}
    height={height}
    onRegionClick={handleToggleRegion}
    onSeek={handleSeek}
  />
</div>
```

### 7.2 Props Interface

```typescript
interface SilenceWaveformOverlayProps {
  regions: SilentRegion[];
  duration: number;
  currentTime: number;
  width: number;
  height: number;
  pixelsPerSecond?: number;
  onRegionClick: (regionId: string) => void;
  onSeek: (time: number) => void;
  onRegionHover?: (regionId: string | null) => void;
}
```

### 7.3 Rendering

Canvas draws:
1. **Silent region rectangles:** Semi-transparent red fill (`rgba(255, 0, 0, 0.3)` for selected, `rgba(255, 0, 0, 0.15)` for deselected). Selected regions get a dashed cyan border.
2. **Skipped regions:** Shown with a strikethrough/hatched pattern to indicate they're too short after buffer.
3. **Playhead:** Vertical line at `(currentTime / duration) * canvasWidth`, red, 2px.
4. **Hover tooltip:** Shows region info (start → end, duration, dB) when hovering over a region.

### 7.4 Interaction

- **Click on region:** Hit-test → toggle `selected` state via `onRegionClick(regionId)`
- **Click elsewhere:** Seek to that time position via `onSeek(time)`
- **Mouse move:** Hit-test for hover tooltip display

Hit-testing: Convert `clientX` → canvas X → time → check which region (if any) contains that time.

### 7.5 Sizing Strategy

**Critical:** `SilenceWaveformOverlay` must use the exact same sizing strategy as `WaveformCanvas` to prevent misalignment:
- CSS: `style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}`
- Internal resolution: `canvas.width = width * devicePixelRatio`, `canvas.height = height * devicePixelRatio`
- Both components receive the same `width` and `height` props from the same parent measurement (e.g., via `ResizeObserver` or a shared container ref)

### 7.6 Performance

- Use `React.memo` to prevent unnecessary redraws
- Redraw only when `regions`, `currentTime`, or `width` change
- Use `requestAnimationFrame` for playhead updates during playback
- Device pixel ratio scaling (matching existing WaveformCanvas pattern)

---

## 8. Section 6: Mini-Timeline Component

### 8.1 Component Structure

**New file:** `SilenceTimeline.tsx`

Vertically stacked inside the dialog's bottom zone:

1. **Zoom controls bar:** Zoom slider (pixels per second), zoom in/out buttons
2. **Scrollable timeline area:** Horizontal scroll container
   - **Time ruler:** Tick marks at intervals based on zoom (e.g., every 5s at low zoom, every 1s at high zoom)
   - **Thumbnail strip:** Video frame thumbnails at regular intervals
   - **Waveform + overlay:** WaveformCanvas + SilenceWaveformOverlay stacked

### 8.2 Props Interface

```typescript
interface SilenceTimelineProps {
  project: VideoEditorProject;
  regions: SilentRegion[];
  currentTime: number;
  duration: number;
  waveformData: number[];
  onSeek: (time: number) => void;
  onRegionClick: (regionId: string) => void;
}
```

### 8.3 Zoom and Virtualized Rendering

Internal state: `pixelsPerSecond` (default: 100). Range: 50–500.

Logical timeline width = `duration * pixelsPerSecond`. Wrapped in a horizontally scrollable div.

**Canvas max width constraint:** HTML Canvas has browser-imposed maximum dimensions (~16,384px in Chrome). For a 30-minute video at 500 px/s, the logical width would be 900,000px — far exceeding this limit. Therefore:

- **Virtualize rendering:** Only render the visible viewport portion of the waveform/timeline plus a buffer zone (~500px on each side)
- The canvas element's actual width = `min(viewportWidth + 1000, logicalWidth)`
- On scroll, recompute which time range is visible and redraw the canvas for that range
- Use `transform: translateX()` to position the canvas within the scroll container
- This applies to both `WaveformCanvas` and `SilenceWaveformOverlay` within the timeline

Auto-scroll: When playback is active, the scroll container follows the playhead.

### 8.4 Thumbnails

- Check `project.assets[assetId].thumbnails` for cached thumbnail URLs
- If missing: submit a `thumbnails` media job via MediaJobClient
- Display as a row of `<img>` elements at regular intervals matching the time ruler

### 8.5 Time Ruler

Render tick marks and labels. Interval calculation:
- At 50 px/s: every 10s
- At 100 px/s: every 5s
- At 200+ px/s: every 1s

Use a simple canvas or div-based ruler.

---

## 9. Section 7: Preview Player Integration and Skip-Silence Mode

### 9.1 Embedding PreviewPlayer

Embed `PreviewPlayer` in the dialog's left/top zone. Pass all required props:

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

The dialog manages its own playback state (`playbackTime`, `isPlaying`) separate from the main editor timeline. This prevents interference with the main editor's playback.

### 9.2 Bidirectional Sync

- **Preview → Waveform:** When `playbackTime` changes, waveform overlay redraws playhead position
- **Waveform → Preview:** When user clicks waveform (via `onSeek`), update `playbackTime`

### 9.3 Skip-Silence Preview Mode

Toggle: "Skip Silence Preview" checkbox below the preview player.

When enabled and playback is active:
1. Use `requestAnimationFrame`-based polling (not `timeupdate`, which only fires ~4Hz) for smoother detection
2. Check if `currentTime` falls within any selected + non-skipped silent region's adjusted bounds
3. If yes: immediately seek to `region.adjustedEndTime` (skip past the silence)
4. Continue normal playback from there

**Infinite loop prevention safeguards:**
- Maintain a `lastSkipTime` ref. After a skip, set a cooldown (100ms) before allowing another skip
- Guard: do not skip if `currentTime` is already at (within 50ms of) a region's `adjustedEndTime`
- Pre-sort silence intervals and use binary search for O(log n) lookup
- If a skip lands inside another silence region, the cooldown ensures only one skip per frame cycle

### 9.4 Preview Asset Resolution

Find the video asset URI from the project's first selected audio track's clip `assetId`. The asset's `path` provides the URL for the preview player.

---

## 10. Section 8: Export to Timeline Logic

### 10.1 Handler in VideoEditorPhase3

**New function:** `handleSilenceExportToTimeline(selectedRegions: SilentRegion[], applyToAllTracks: boolean)`

This is called by the dialog's Export button and receives the finalized region list.

### 10.2 Algorithm: Non-Destructive Clip Splitting

Process:

1. **Deep clone** the current project (for undo snapshot)
2. **Determine target tracks:**
   - If `applyToAllTracks`: all unlocked tracks with clips
   - Otherwise: only the audio track(s) that were analyzed
3. **Sort regions** by `adjustedStartTime` in **descending order** (process last-to-first to maintain valid positions)
4. **For each region** (reverse order):
   - For each target track:
     - Find clips that overlap with `[adjustedStartTime, adjustedEndTime]`
     - **Split clips at region boundaries:**
       - If clip starts before region start → split at region start
       - If clip ends after region end → split at region end
     - **Remove segments** that fall entirely within the silent region
5. **Ripple delete:** For each target track, sort clips by startTime, then reassign positions sequentially (close gaps):
   ```
   currentTime = 0;
   for each clip (sorted): clip.startTime = currentTime; currentTime += clip.duration;
   ```
6. **Add to history:** `addToHistory(newProject)` as a single undo step
7. **Update project** with the modified timeline

### 10.3 Clip Split Logic

**Important:** In this codebase, `trimIn` and `trimOut` are both **absolute positions in the source asset** (seconds). `trimIn` is the in-point (where playback starts in the source), and `trimOut` is the out-point (where playback ends in the source). The visible portion is `[trimIn, trimOut]`. The clip's `duration` on the timeline = `trimOut - trimIn`.

When splitting a clip at a given timeline position:

```
Original: { startTime: 2.0, duration: 8.0, trimIn: 1.0, trimOut: 9.0 }
Split at timeline position 6.0 (4.0 seconds into the clip)

Left:  { startTime: 2.0, duration: 4.0, trimIn: 1.0, trimOut: 5.0 }
Right: { startTime: 6.0, duration: 4.0, trimIn: 5.0, trimOut: 9.0 }
```

The split point in source-asset time = `trimIn + (splitPosition - startTime)` = `1.0 + (6.0 - 2.0)` = `5.0`. Left clip gets `trimOut = 5.0`, right clip gets `trimIn = 5.0`.

Both clips reference the same `assetId`.

### 10.4 Track-Type-Specific Behavior for "Apply to All Tracks"

When `applyToAllTracks` is true, different track types are handled differently:

- **Audio/video tracks:** Split clips at region boundaries using `trimIn`/`trimOut` as described above
- **Text/overlay/image tracks:** These are generated elements without `trimIn`/`trimOut` semantics. Split by adjusting `startTime` and `duration` only — if a text clip overlaps a silent region, truncate or split its duration to exclude the silent portion
- **Muted tracks:** Excluded from "apply to all tracks" (muted content is already silent)
- **Locked tracks:** Excluded (already specified)

### 10.5 Post-Export UX

1. Close the dialog: `setShowSilenceDialog(false)`
2. Show toast notification: `"Removed {count} silent regions ({formatTime(totalDuration)})"`
3. Highlight new clip boundaries on the main timeline (temporary CSS class with animation, auto-remove after ~2 seconds)

---

## 11. Section 9: Backend `dead_air_cut` Handler

### 11.1 Handler Registration

**File:** `python-backend/app/tasks/media_job_worker.py`

Replace `_not_implemented_handler` in `HANDLER_MAP` with `handle_dead_air_cut`.

### 11.2 Function Signature

```python
def handle_dead_air_cut(spec: dict, tmp_dir: str) -> dict:
    """Cut silent segments from video/audio and concatenate remaining parts.

    Reads segments to remove from spec.params.segments.
    Applies optional softening buffer and audio crossfade.
    Returns concatenated output file as artifact.
    """
```

### 11.3 Input Params

```python
params = {
    "segments": [{"startMs": int, "endMs": int}, ...],  # regions to REMOVE
    "mode": "remove",           # only mode for now
    "softeningBufferMs": 200,   # optional, default 0
    "crossfade": True           # optional, default False
}
```

### 11.4 Input Validation (Security)

Before processing, validate all inputs strictly:

1. **Asset validation:** File exists and is a supported media format
2. **Segment bounds:** For each segment: `startMs >= 0`, `startMs < endMs`, `endMs` does not exceed probed file duration
3. **Segment overlap:** No overlapping segments (sort by startMs and verify no intersections)
4. **Segment count limit:** Maximum 500 segments. If exceeded, return error (prevents shell command length issues and FFmpeg filter complexity limits)
5. **Type casting:** Cast all `startMs`/`endMs` values to `int`, all time values to `float` before interpolating into FFmpeg filter strings (prevents filter injection, following the pattern in `build_ffmpeg_command_for_silence`)
6. **Buffer validation:** `softeningBufferMs` clamped to range `[0, 5000]`
7. **Mode validation:** Only `"remove"` is supported; reject unknown modes

### 11.5 Processing Steps

1. **Validate input** per Section 11.4
2. **Calculate keep segments:** Invert the silence segments to get the portions to keep. Apply softening buffer to keep-segment boundaries (expand keep segments by buffer amount).
3. **Determine FFmpeg approach:**
   - If crossfade is disabled: Use `select`/`aselect` with `between()` expressions + `setpts`/`asetpts` for timestamp reset
   - If crossfade is enabled: Use `trim`/`atrim` for each keep segment + `concat` filter, with `acrossfade` between adjacent audio segments
4. **Build FFmpeg command** using the appropriate approach
5. **Report progress** via `report_progress()`: "Preparing" → "Building filter" → "Encoding" → "Finalizing"
6. **Run FFmpeg** via `subprocess.run()` with appropriate timeout (estimate: 1-2x real-time for 30min video)
7. **Return result** with artifact and derived metadata

### 11.6 Frame Rate Probing

Before building any FFmpeg command, probe the source file to get the actual frame rate:

```python
probe = ffprobe(input_path)  # using existing probe utility or subprocess
fps = probe["streams"][0]["r_frame_rate"]  # e.g., "30000/1001" for 29.97fps
```

This is required because `setpts=N/FRAME_RATE/TB` needs the real frame rate. Variable frame rate sources that report no constant rate should use the `trim`+`concat` approach instead of `select`/`aselect`.

### 11.7 FFmpeg Command: Select/ASelect Approach (No Crossfade)

For keep segments [(0, 5.2), (8.7, 15.3), (20, 30)] with probed frame rate:

```
ffmpeg -i input.mp4
  -vf "select='between(t,0,5.2)+between(t,8.7,15.3)+between(t,20,30)',setpts=N/{PROBED_FPS}/TB"
  -af "aselect='between(t,0,5.2)+between(t,8.7,15.3)+between(t,20,30)',asetpts=N/SR/TB"
  -c:v libx264 -c:a aac output.mp4
```

### 11.8 FFmpeg Command: Trim+Concat Approach (With Crossfade)

For keep segments with crossfade, build a `filter_complex`:
- Each keep segment gets `trim`+`setpts` (video) and `atrim`+`asetpts` (audio)
- Audio segments get chained `acrossfade` filters
- Video segments get `concat` (no video crossfade — just clean cuts)
- Crossfade duration = `min(softeningBufferMs * 2, shortest_keep_segment_duration) / 1000`

### 11.9 Edge Cases

- **Empty segments list:** Return input file as-is (no processing needed)
- **Single keep segment:** No concat needed, just trim
- **Very short keep segments (< crossfade duration):** Skip crossfade for that pair, use hard cut
- **Audio-only files:** Skip video filters entirely
- **Terminal segments:** No crossfade at file start/end boundaries

### 11.10 Output

```python
return {
    "artifacts": [{"path": output_path, "kind": "video", "mime": "video/mp4"}],
    "derived": {
        "originalDurationMs": original_duration_ms,
        "outputDurationMs": output_duration_ms,
        "removedMs": removed_ms,
        "segmentCount": len(keep_segments)
    }
}
```

---

## 12. Section 10: MediaJobClient Updates

### 12.1 Extend `cutDeadAir` Method

**File:** `apps/web/client/src/services/mediaJobClient.ts`

The method already exists but needs to include `softeningBufferMs` and `crossfade` in the job spec params.

Update the `params` section of the MediaJobSpec to include:

```typescript
params: {
  segments: segments.map(s => ({ startMs: s.startMs, endMs: s.endMs })),
  mode: mode,
  softeningBufferMs: softeningBufferMs ?? 0,
  crossfade: crossfade ?? false,
}
```

### 12.2 Stage Label Support

The MediaJobClient already supports progress updates via `adapter.onProgress`. The dialog can listen for stage changes by checking the progress message field (if the backend reports it via `report_progress`).

For detection (which doesn't report fine-grained progress), use estimated timer-based stage transitions.

---

## 13. Implementation Order

### Phase 1: Foundation (Sections 1-2)

1. Type extensions and shared logic (buffer calculation, dB conversion)
2. Dialog component shell and layout (responsive CSS)
3. Sidebar trigger conversion
4. Dialog state wiring in VideoEditorPhase3

### Phase 2: Detection and Display (Sections 3-5)

5. Settings panel with three sliders
6. Analyze flow (reusing existing MediaJobClient.detectDeadAir)
7. Region list component (extracted from current panel)
8. Waveform overlay component (regions, playhead, click interactions)

### Phase 3: Timeline and Preview (Sections 6-7)

9. Mini-timeline with zoom, time ruler, and thumbnail strip
10. Preview player embedding with bidirectional sync
11. Skip-silence preview mode

### Phase 4: Export and Backend (Sections 8-10)

12. Export to Timeline logic (clip splitting, ripple delete)
13. Post-export UX (toast, highlight)
14. Backend `dead_air_cut` handler (FFmpeg processing)
15. MediaJobClient updates for cutDeadAir

### Testing Throughout

Each section should have tests written alongside implementation (see TDD plan).

---

## 14. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Waveform data not available for asset | Medium | Blocks waveform display | Trigger `waveform_peaks` job on dialog open if data missing |
| FFmpeg concat produces A/V desync | Medium | Bad output quality | Test with various codecs; use `setpts=N/FRAME_RATE/TB` for reliable sync |
| Large waveform data (30min) causes slow canvas render | Low | UI jank | Downsample waveform data for display; only render visible portion based on scroll position |
| Clip splitting math errors (off-by-one with trimIn/trimOut) | Medium | Incorrect timeline after export | Extensive unit tests for split logic; test with edge cases (split at clip boundary, split at 0, etc.) |
| Skip-silence preview causes playback stutter | Medium | Poor UX | Debounce seek calls; pre-compute silence intervals for O(log n) lookup |
| Dialog blocks main editor interaction | Low | UX annoyance | Dialog is modal overlay — this is expected behavior. Main editor state is preserved underneath. |

---

## 15. Files Summary

### New Files

| File | Purpose |
|------|---------|
| `SilenceDetectionDialog.tsx` | Full-screen dialog component |
| `SilenceWaveformOverlay.tsx` | Canvas overlay for regions + playhead |
| `SilenceTimeline.tsx` | Mini-timeline with thumbnails + waveform |
| `SilenceRegionList.tsx` | Extracted region list component |

### Modified Files

| File | Changes |
|------|---------|
| `VideoEditorPhase3.tsx` | Add `showSilenceDialog` state, dialog render, `handleSilenceExportToTimeline` |
| `SilenceDetectionPanel.tsx` | Replace panel content with dialog trigger button |
| `videoEditor.ts` | Extend `SilentRegion`, `SilenceDetectionConfig`, add `SilenceDetectionDialogState` |
| `mediaJobClient.ts` | Update `cutDeadAir` params |
| `media_job_worker.py` | Implement `handle_dead_air_cut` handler |
