# Silence Detection (Dead Air Removal) — Complete Specification

## 1. Overview

Upgrade the existing sidebar-based Silence Detection panel into a **full-screen dialog** inspired by Filmora's Silence Detection workflow. The sidebar panel slot becomes a trigger button that opens the full-screen dialog. The dialog provides an integrated video preview with skip-silence playback, waveform visualization with highlighted silent regions, adjustable parameters (including a new softening buffer), and an "Export to Timeline" action that applies detected cuts back to the editor timeline as non-destructive clip splits.

The backend `dead_air_cut` handler (currently unimplemented) will also be completed to support server-side re-encoded export.

**Target content:** Short-form videos up to 30 minutes (YouTube, tutorials, podcast clips).

---

## 2. Current State Analysis

### Existing Components

| Layer | File | Status |
|-------|------|--------|
| Frontend Panel | `SilenceDetectionPanel.tsx` (431 lines) | Sidebar panel — will become trigger button |
| Panel Styling | `SilenceDetectionPanel.css` (542 lines) | CSS for sidebar — will be replaced |
| Types | `videoEditor.ts` — `SilentRegion`, `SilenceDetectionConfig` | Defined, needs extension |
| MediaJobClient | `mediaJobClient.ts` — `detectDeadAir()`, `cutDeadAir()` | detect works, cut calls unimplemented backend |
| Python detect | `media_job_worker.py` — `handle_dead_air_detect()` | Working (FFmpeg `silencedetect`) |
| Python cut | `media_job_worker.py` — `dead_air_cut` | **NOT IMPLEMENTED** (`_not_implemented_handler`) |
| Waveform renderer | `WaveformCanvas.tsx` (90 lines) | Canvas-based, will be extended with overlays |
| Video preview | `PreviewPlayer.tsx` (1115 lines) | Full-featured, will be embedded in dialog |
| Editor host | `VideoEditorPhase3.tsx` (2151 lines) | `sidebarView` includes `'silence'`, has dialog pattern |

### Gaps vs. Target UX

| Feature | Current | Target |
|---------|---------|--------|
| Layout | Sidebar panel (~300px) | Full-screen modal dialog |
| Dialog trigger | Direct sidebar content | Sidebar slot shows button that opens dialog |
| Video preview | None in panel | Embedded PreviewPlayer with skip-silence mode |
| Waveform + regions | Text list only | Extended WaveformCanvas with red overlay + playhead |
| Softening Buffer | Not supported | Slider (0–2s) — padding around cut points |
| Volume display | dB only | Dual: dB + percentage |
| Export to Timeline | `window.confirm()` Cut & Combine | Non-destructive clip splits + ripple delete |
| Multi-track export | N/A | User toggle: "Apply to all tracks" vs "Audio only" |
| `dead_air_cut` backend | Stub | Full FFmpeg trim+concat+crossfade implementation |
| Progress feedback | Text "Analyzing..." | Indeterminate spinner + stage labels |
| Region interaction | Checkbox list | Click region on waveform to select/deselect |
| Playback scrub | Not available | Click waveform to seek; skip-silence preview mode |
| Export feedback | `window.confirm()` | Toast + highlight new clip boundaries on timeline |
| Thumbnails | Not in panel | Reuse from project assets, generate if missing |

---

## 3. Full-Screen Dialog Component

### Component: `SilenceDetectionDialog.tsx`

**Trigger:** Button/card in the sidebar `'silence'` view slot. Opens as a full-screen modal overlay.

**Layout (3 zones):**

```
┌──────────────────────────────────────────────────────────────────┐
│  [< Back]    Silence Detection                      [X Close]   │
├────────────────────────────────┬─────────────────────────────────┤
│                                │  Settings           [Analyze]  │
│       Video Preview            │                                │
│       (16:9 aspect ratio)      │  Volume Threshold:  ──●── 18%  │
│                                │  Minimum Duration:  ──●── 0.5s │
│   ┌───────────────────┐       │  Softening Buffer:  ──●── 0.2s │
│   │                   │       │                                │
│   │    <video />      │       │  ─────────────────────────────  │
│   │                   │       │  Results (after analyze):      │
│   └───────────────────┘       │  Total silence: 00:12.3        │
│                                │  Active audio:  02:07.7        │
│   [◀] [▶] [▶▶] [□]  0:00/2:20│  Regions: 8 (6 selected)      │
│   [☐ Skip Silence Preview]    │  [☐ Apply to all tracks]       │
├────────────────────────────────┴─────────────────────────────────┤
│  [zoom -] ──●── [zoom +]                                        │
│  ┌───────────────────────────────────────────────────────────────┤
│  │ 0:00   0:10   0:20   0:30   0:40   0:50   1:00   1:10  ... │
│  │ ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────────┐ │
│  │ │thumb│thumb│thumb│thumb│thumb│thumb│thumb│thumb│  ...    │ │  <- video thumbnails
│  │ └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────────┘ │
│  │ ┌───────────────────────────────────────────────────────────┐ │
│  │ │▓▓▓░░░▓▓▓▓▓▓▓▓▓▓░░░░░▓▓▓▓▓▓▓▓▓░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ │  <- waveform + silent regions
│  │ └───────────────────────────────────────────────────────────┘ │
│  └──────────────────────────────────────────────────────────────┘│
│                                          [Export to Timeline]    │
└──────────────────────────────────────────────────────────────────┘
```

**Responsive behavior:**
- Desktop (>= 1280px): Side-by-side layout (preview left, settings right)
- Tablet/Mobile (< 1280px): Stacked — preview top, settings below, timeline bottom

**Dialog management:** Boolean state `showSilenceDialog` in `VideoEditorPhase3.tsx`, rendered conditionally at end of JSX (following ExportDialog pattern).

---

## 4. Settings Panel Parameters

### 4.1 Volume Threshold

| Property | Value |
|----------|-------|
| Range | -60 dB to -20 dB |
| Default | -40 dB |
| Display | Dual: `dB` value + approximate `%` (0% = -60dB, 100% = -20dB) |
| Step | 1 dB |
| Behavior | Lower = more sensitive |

**Conversion:** `percentage = ((value - (-60)) / (-20 - (-60))) * 100`

### 4.2 Minimum Duration

| Property | Value |
|----------|-------|
| Range | 0.1s to 5.0s |
| Default | 0.5s |
| Display | Seconds with 1 decimal |
| Step | 0.1s |
| Behavior | Silences shorter than this are ignored |

### 4.3 Softening Buffer (NEW)

| Property | Value |
|----------|-------|
| Range | 0.0s to 2.0s |
| Default | 0.2s |
| Display | Seconds with 1 decimal |
| Step | 0.05s |
| Behavior | Adds padding before/after each cut point |

**How it works:**
- For each detected silent region `[start, end]`, the actual cut region becomes `[start + buffer, end - buffer]`
- If `(end - start) < (2 * buffer)`, the region is skipped (too short after buffer)
- Ensures audio fades naturally at cut boundaries

---

## 5. Detection Workflow

```
User opens dialog (from sidebar trigger button)
  │
  ├── Adjusts settings (threshold, min duration, buffer)
  │
  ├── Clicks [Analyze]
  │     │
  │     ├── Show indeterminate spinner with stage labels:
  │     │     "Preparing..." → "Scanning audio..." → "Detecting silence..." → "Building cuts..." → "Done"
  │     │
  │     ├── Frontend: MediaJobClient.detectDeadAir(assetUri, params)
  │     │     params: { thresholdDb, minSilenceMs }
  │     │
  │     ├── Backend: FFmpeg silencedetect filter
  │     │     Returns: silenceSegments[] with { startMs, endMs, averageDb }
  │     │
  │     ├── Frontend: Apply softening buffer to trim each segment
  │     │     adjustedStart = startMs + bufferMs
  │     │     adjustedEnd   = endMs - bufferMs
  │     │     Skip if adjustedEnd <= adjustedStart
  │     │
  │     ├── Frontend: Update waveform overlay (red highlights on silent regions)
  │     │
  │     └── Frontend: Update stats (total silence, active, count)
  │
  ├── User reviews & toggles regions (click waveform or checkbox)
  │
  ├── User can toggle "Skip Silence Preview" for playback
  │     When enabled: video auto-jumps past selected silent regions during playback
  │
  └── Clicks [Export to Timeline]
        │
        ├── User toggle: "Apply to all tracks" (yes/no)
        │
        ├── Non-destructive timeline cuts:
        │     Split clips at cut boundaries, remove silent segments
        │     Shift remaining clips left (ripple delete)
        │     If "all tracks": apply same boundaries to every unlocked track
        │     Single undo step via addToHistory()
        │
        ├── Close dialog
        │
        ├── Show toast: "Removed X silent regions (Y seconds)"
        │
        └── Briefly highlight new clip boundaries on main timeline
```

---

## 6. Waveform Visualization with Region Overlay

### Approach: Extend Existing `WaveformCanvas.tsx`

No new library dependency. Stack a second canvas for overlays on top of the existing waveform canvas.

### New Component: `SilenceWaveformOverlay.tsx`

**Architecture:**
1. Container `<div>` with `position: relative`
2. Base canvas: WaveformCanvas renders the waveform
3. Overlay canvas: SilenceWaveformOverlay renders regions + playhead on top
4. Event handler layer for clicks/hovers

**Features:**
- Semi-transparent red overlay rectangles on silent regions
- Clickable: click a region to toggle its `selected` state
- Hover: tooltip with region info (start, end, duration, dB)
- Playhead indicator: vertical red line synced with video preview position
- Click-to-scrub: click anywhere on waveform to seek playback
- Zoom: canvas width = `duration * pixelsPerSecond`, in scrollable container
- Selected regions: distinct border (dashed cyan) like Filmora

**Data flow:**
```
project.assets[clipId].waveformData (number[])
  → WaveformCanvas renders base waveform
  → SilenceWaveformOverlay renders red overlays on top
  → Click events toggle region.selected
  → Playhead position from currentTime state
```

---

## 7. Mini-Timeline with Video Thumbnails

### New Component: `SilenceTimeline.tsx`

**Structure:**
- Time ruler (top) — tick marks at intervals based on zoom
- Video thumbnail strip — frames from project assets (reuse existing if available, generate via `thumbnails` media job if missing)
- Audio waveform with silence overlays (bottom)
- Playhead indicator spanning full timeline height
- Horizontal scroll synchronized with playhead

**Thumbnail strategy:**
- Check `Asset.thumbnails?: string[]` for existing cached thumbnails
- If missing, submit `thumbnails` media job with interval = `duration / thumbnailCount`
- Cache results in project assets for future reuse

---

## 8. Video Preview Integration

### Reuse: `PreviewPlayer.tsx` (embedded in dialog)

**Controls within dialog:**
- Play / Pause
- Step forward / backward (frame-by-frame)
- Stop (return to 0:00)
- Time display: current / total
- Skip Silence Preview toggle

**Skip-Silence Preview Mode:**
When enabled, during playback:
1. Monitor `currentTime` against selected silent regions
2. When playback enters a selected silent region → `onTimeChange(region.adjustedEndTime)`
3. Playback continues from end of silence automatically
4. Visual indication on waveform (e.g., fast-forward animation through skipped area)

**Sync:** Playhead on waveform/timeline syncs with preview player position bidirectionally.

---

## 9. Export to Timeline

### Primary Mode: Non-Destructive Timeline Cuts

When user clicks "Export to Timeline":

1. Collect all `selected` silent regions (with buffer applied)
2. Determine scope:
   - "Apply to all tracks" checked → process all unlocked tracks
   - Unchecked → process only the analyzed audio track
3. Process in reverse order (last region first) to maintain valid positions:
   - Calculate split points where silence regions intersect clips
   - Split clips at each boundary → creates new smaller clips
   - Remove clip segments that fall within silent regions
   - Shift remaining clips left (ripple delete) to close gaps
4. Add to editor undo history as a **single undoable action** via `addToHistory()`
5. Close the dialog
6. Show toast: "Removed X silent regions (Y seconds)"
7. Briefly highlight new clip boundaries on main timeline

### Secondary Mode: Server-Side Export

For users who want a re-encoded output file:
- Use `MediaJobClient.cutDeadAir()` → `dead_air_cut` job
- Backend concatenates non-silent segments with optional crossfade
- Result: single continuous video file without dead air

---

## 10. Backend: Implement `dead_air_cut` Handler

**File:** `python-backend/app/tasks/media_job_worker.py`

**Implementation Priority:** Phase 1 (MVP)

### Input Spec

```python
{
  "jobType": "dead_air_cut",
  "inputs": {
    "assets": [{"assetId": "input", "kind": "video", "uri": "/path/to/file.mp4"}]
  },
  "params": {
    "segments": [
      {"startMs": 3200, "endMs": 5800},
      {"startMs": 12400, "endMs": 14100}
    ],
    "mode": "remove",
    "softeningBufferMs": 200,
    "crossfade": true
  }
}
```

### Processing

1. Calculate "keep segments" (inverse of silence segments)
2. Apply softening buffer to keep segment boundaries
3. Build FFmpeg command using `select`/`aselect` filters:

```bash
ffmpeg -i input.mp4 \
  -vf "select='between(t,0,5.2)+between(t,8.7,15.3)+between(t,20,30)',setpts=N/FRAME_RATE/TB" \
  -af "aselect='between(t,0,5.2)+between(t,8.7,15.3)+between(t,20,30)',asetpts=N/SR/TB" \
  output.mp4
```

With crossfade (alternative approach using trim+concat):
```bash
ffmpeg -i input.mp4 \
  -filter_complex "
    [0:v]trim=0:5.2,setpts=PTS-STARTPTS[v0];
    [0:a]atrim=0:5.2,asetpts=PTS-STARTPTS[a0];
    [0:v]trim=8.7:15.3,setpts=PTS-STARTPTS[v1];
    [0:a]atrim=8.7:15.3,asetpts=PTS-STARTPTS[a1];
    [v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]
  " -map "[outv]" -map "[outa]" -c:v libx264 -c:a aac output.mp4
```

Audio crossfade between segments:
```bash
[a0][a1]acrossfade=d=0.4:c1=tri:c2=tri[a01];
```

### Progress Reporting

Report stage transitions via `report_progress()`:
- "Preparing" → "Building filter" → "Encoding" → "Finalizing"

### Output

```python
{
  "artifacts": [{"path": "/tmp/.../output.mp4", "kind": "video"}],
  "derived": {
    "originalDurationMs": 140000,
    "outputDurationMs": 127600,
    "removedMs": 12400,
    "segmentCount": 3
  }
}
```

### Edge Cases

- Very short segments (< crossfade duration): Skip crossfade, use hard cut
- Terminal segments (first/last): No crossfade at file boundaries
- Audio-only files: Skip video filters, only use `aselect`/`atrim`
- Crossfade duration must not exceed shortest keep segment

---

## 11. Type Changes

### Modified Types (`types/videoEditor.ts`)

```typescript
// Extend SilenceDetectionConfig
export interface SilenceDetectionConfig {
  threshold: number;         // dB (-60 to -20)
  minDuration: number;       // seconds (0.1 to 5.0)
  softeningBuffer: number;   // NEW: seconds (0.0 to 2.0)
  enabled: boolean;
  trackIds: string[];
}

// Extend SilentRegion with buffer-adjusted bounds
export interface SilentRegion {
  id: string;
  trackId: string;
  startTime: number;         // original detected start (seconds)
  endTime: number;           // original detected end (seconds)
  duration: number;          // original duration (seconds)
  adjustedStartTime: number; // NEW: start + buffer
  adjustedEndTime: number;   // NEW: end - buffer
  adjustedDuration: number;  // NEW: adjusted duration
  selected: boolean;
  averageDb: number;
  skipped: boolean;          // NEW: true if region too short after buffer
}

// Dialog state
export interface SilenceDetectionDialogState {
  isOpen: boolean;
  config: SilenceDetectionConfig;
  regions: SilentRegion[];
  analysisComplete: boolean;
  isAnalyzing: boolean;
  analysisStage: string;     // Current stage label
  playbackTime: number;
  timelineZoom: number;      // pixels per second
  skipSilencePreview: boolean;
  applyToAllTracks: boolean;
}
```

---

## 12. File Structure (New/Modified)

```
apps/web/client/src/
├── components/videoeditor/
│   ├── SilenceDetectionDialog.tsx      # NEW: Full-screen dialog
│   ├── SilenceDetectionPanel.tsx       # MODIFY: Becomes trigger button for dialog
│   ├── SilenceWaveformOverlay.tsx      # NEW: Canvas overlay for regions + playhead
│   ├── SilenceTimeline.tsx             # NEW: Mini-timeline (thumbnails + waveform)
│   ├── SilenceRegionList.tsx           # NEW: Extracted region list component
│   ├── WaveformCanvas.tsx              # KEEP: Reuse as-is (base waveform)
│   ├── PreviewPlayer.tsx               # KEEP: Embed in dialog as-is
│   └── VideoEditorPhase3.tsx           # MODIFY: Add dialog state + trigger
├── types/
│   └── videoEditor.ts                  # MODIFY: Extend types
└── services/
    └── mediaJobClient.ts               # MODIFY: Add softeningBufferMs param

python-backend/app/tasks/
└── media_job_worker.py                 # MODIFY: Implement handle_dead_air_cut()
```

---

## 13. Acceptance Criteria

- [ ] Sidebar "silence" view shows a trigger button that opens the full-screen dialog
- [ ] Full-screen dialog opens with embedded video preview + settings panel + mini-timeline
- [ ] Volume Threshold slider works (-60dB to -20dB) with dB + % display
- [ ] Minimum Duration slider works (0.1s to 5.0s)
- [ ] Softening Buffer slider works (0.0s to 2.0s)
- [ ] "Analyze" detects silent regions via existing `dead_air_detect` backend
- [ ] Indeterminate spinner with stage labels during analysis
- [ ] Waveform displays (extended WaveformCanvas) with silent regions as red overlays
- [ ] Video preview plays inside dialog with bidirectional sync to waveform playhead
- [ ] Click on waveform seeks playback position
- [ ] Click on region overlay toggles selection
- [ ] Skip-silence preview mode auto-jumps past selected silent regions during playback
- [ ] "Apply to all tracks" toggle controls export scope
- [ ] "Export to Timeline" splits clips and removes silence (non-destructive, single undo step)
- [ ] Toast notification + highlight new clip boundaries on main timeline after export
- [ ] `handle_dead_air_cut` backend handler implemented with FFmpeg trim+concat
- [ ] Audio crossfade at segment joins when softening buffer > 0
- [ ] Softening buffer prevents harsh audio jumps at cut points
- [ ] Thumbnails reuse from project assets, generate if missing
- [ ] Responsive layout (side-by-side on desktop, stacked on mobile)
