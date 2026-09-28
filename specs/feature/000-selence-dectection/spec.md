# Silence Detection (Dead Air Removal) — Full-Screen Dialog

## Overview

Upgrade the existing sidebar-based Silence Detection panel into a **full-screen dialog** inspired by Filmora's Silence Detection workflow. The dialog provides an integrated video preview, waveform visualization with highlighted silent regions, adjustable parameters, and an "Export to Timeline" action that applies detected cuts back to the editor timeline.

### Reference Screenshot

The target UX follows Filmora's Silence Detection dialog:

- Left: video preview with playback controls
- Right: settings panel (Volume Threshold, Minimum Duration, Softening Buffer)
- Bottom: mini-timeline with video thumbnail strip + audio waveform, silent regions highlighted
- Footer: "Export to Timeline" button

---

## Current State Analysis

### What Already Exists

| Layer | File | Status |
|-------|------|--------|
| Frontend Panel | `apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx` (431 lines) | Sidebar panel with basic UI |
| Panel Styling | `apps/web/client/src/components/videoeditor/SilenceDetectionPanel.css` (542 lines) | Complete CSS for sidebar layout |
| Types | `apps/web/client/src/types/videoEditor.ts` — `SilentRegion`, `SilenceDetectionConfig`, `SilenceDetectionResult` | Defined |
| MediaJobClient | `apps/web/client/src/services/mediaJobClient.ts` — `detectDeadAir()`, `cutDeadAir()` | detect works, cut calls unimplemented backend |
| Python detect | `python-backend/app/tasks/media_job_worker.py` — `handle_dead_air_detect()` | Working (FFmpeg `silencedetect`) |
| Python cut | `python-backend/app/tasks/media_job_worker.py` — `dead_air_cut` | **NOT IMPLEMENTED** (`_not_implemented_handler`) |
| Waveform renderer | `apps/web/client/src/components/videoeditor/WaveformCanvas.tsx` | Canvas-based, reusable |
| Video preview | `apps/web/client/src/components/videoeditor/PreviewPlayer.tsx` | Full-featured, reusable |
| Editor host | `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx` | `sidebarView` includes `'silence'` |

### Gaps vs. Target UX

| Feature | Current | Target |
|---------|---------|--------|
| Layout | Sidebar panel (narrow, ~300px) | Full-screen modal/dialog |
| Video preview | None in panel (uses main editor preview) | Embedded preview with playback controls inside dialog |
| Waveform + regions | None — just a text list of detected regions | Interactive waveform with silent regions highlighted in red/semi-transparent overlay |
| Softening Buffer | Not supported | Slider (0–2s) — adds padding before/after each cut for smooth transitions |
| Volume display | dB only (-60 to -20) | Dual display: dB + percentage (%) for accessibility |
| Export to Timeline | "Cut & Combine" — uses `window.confirm()`, no timeline integration | "Export to Timeline" — applies cuts as timeline clip splits, no destructive re-encode |
| `dead_air_cut` backend | `_not_implemented_handler` | Full FFmpeg implementation for server-side cut+concat |
| Progress feedback | Text spinner ("Analyzing...") | Progress bar with stage labels via SSE |
| Region interaction | Checkbox list only | Click region on waveform to select/deselect, scroll to region |
| Playback scrub | Not available | Clickable waveform to scrub playhead |

---

## Feature Specification

### 1. Full-Screen Dialog Component

**Component:** `SilenceDetectionDialog.tsx`

**Trigger:** Button in the video editor toolbar or sidebar menu. Opens as a full-screen modal overlay (similar to Media Studio's layout).

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
├────────────────────────────────┴─────────────────────────────────┤
│  Timeline Controls  [undo] [redo] [cut] [zoom -] ──●── [zoom +]│
│  ┌───────────────────────────────────────────────────────────────┤
│  │ 0:00   0:10   0:20   0:30   0:40   0:50   1:00   1:10  ... │
│  │ ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────────┐ │
│  │ │thumb│thumb│thumb│thumb│thumb│thumb│thumb│thumb│  ...    │ │  <- video thumbnails
│  │ └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────────┘ │
│  │ ┌───────────────────────────────────────────────────────────┐ │
│  │ │▓▓▓░░░▓▓▓▓▓▓▓▓▓▓░░░░░▓▓▓▓▓▓▓▓▓░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ │  <- waveform + silent regions (░ = red overlay)
│  │ └───────────────────────────────────────────────────────────┘ │
│  └──────────────────────────────────────────────────────────────┘│
│                                                [Export to Timeline]│
└──────────────────────────────────────────────────────────────────┘
```

**Responsive behavior:**
- Desktop (>= 1280px): side-by-side layout as shown above
- Tablet/Mobile (< 1280px): stacked — preview on top, settings below, timeline at bottom

### 2. Settings Panel Parameters

#### 2.1 Volume Threshold

| Property | Value |
|----------|-------|
| Range | -60 dB to -20 dB |
| Default | -40 dB |
| Display | Dual: `dB` value + approximate `%` equivalent (0% = -60dB, 100% = -20dB) |
| Step | 1 dB |
| Behavior | Lower = more sensitive (detects quieter sounds as silence) |

**Conversion formula:** `percentage = ((value - (-60)) / (-20 - (-60))) * 100`

#### 2.2 Minimum Duration

| Property | Value |
|----------|-------|
| Range | 0.1s to 5.0s |
| Default | 0.5s |
| Display | Value in seconds with 1 decimal |
| Step | 0.1s |
| Behavior | Silences shorter than this are ignored |

#### 2.3 Softening Buffer (NEW)

| Property | Value |
|----------|-------|
| Range | 0.0s to 2.0s |
| Default | 0.2s |
| Display | Value in seconds with 1 decimal |
| Step | 0.05s |
| Behavior | Adds padding before and after each cut point to prevent harsh audio jumps |

**How it works:**
- For each detected silent region `[start, end]`, the actual cut region becomes `[start + buffer, end - buffer]`
- If `(end - start) < (2 * buffer)`, the region is skipped (too short after buffer)
- The buffer ensures the audio fades naturally at cut boundaries instead of abrupt silence-to-speech jumps

### 3. Detection Workflow

```
User opens dialog
  │
  ├── Adjusts settings (threshold, min duration, buffer)
  │
  ├── Clicks [Analyze]
  │     │
  │     ├── Frontend: MediaJobClient.detectDeadAir(assetUri, params)
  │     │     params: { thresholdDb, minSilenceMs, softeningBufferMs }
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
  └── Clicks [Export to Timeline]
        │
        ├── Option A: Timeline-level cuts (non-destructive, preferred)
        │     Split clips at cut boundaries, remove silent segments
        │     Shift remaining clips left to close gaps
        │
        └── Option B: Server-side re-encode (for final export)
              Submit dead_air_cut job to Python backend
              FFmpeg concat non-silent segments → new file
```

### 4. Waveform Visualization with Region Overlay

**Reuse:** `WaveformCanvas.tsx` as the base waveform renderer.

**New component:** `SilenceWaveformOverlay.tsx`

**Features:**
- Renders detected silent regions as semi-transparent red overlay rectangles on top of the waveform
- Clickable: click a region to toggle its `selected` state
- Hover: show tooltip with region info (start, end, duration, dB)
- Playhead indicator: vertical line synced with video preview position
- Click-to-scrub: click anywhere on the waveform to seek playback
- Zoom: sync with timeline zoom level (pixels per second)
- Selected regions rendered with distinct border (e.g., dashed cyan border like Filmora)

**Data flow:**
```
project.assets[clipId].waveformData (number[])
  → WaveformCanvas renders the base waveform
  → SilenceWaveformOverlay renders red overlays on top
  → Click events toggle region.selected
  → Playhead position from PreviewPlayer currentTime
```

### 5. Mini-Timeline with Video Thumbnails

**New component:** `SilenceTimeline.tsx`

**Structure:**
- Time ruler (top) — tick marks at regular intervals based on zoom
- Video thumbnail strip — frames extracted from video at regular intervals (reuse `thumbnails` media job)
- Audio waveform with silence overlays (bottom)
- Playhead indicator spanning full timeline height
- Horizontal scroll synchronized with playhead

**Thumbnail generation:**
- Reuse existing `thumbnails` media job type (already in `VALID_JOB_TYPES`)
- Request thumbnails at interval = `duration / thumbnailCount` (e.g., every 5s for a 2:20 video = ~28 frames)
- Cache in `Asset.thumbnails?: string[]` (array of URLs)

### 6. Video Preview Integration

**Reuse:** `PreviewPlayer.tsx` with reduced controls.

**Controls within dialog:**
- Play / Pause
- Step forward / backward (frame-by-frame)
- Stop (return to 0:00)
- Time display: `HH:MM:SS:FF / HH:MM:SS:FF`
- Fullscreen toggle (optional)

**Sync:** Playhead on waveform/timeline syncs with preview player position bidirectionally.

### 7. Export to Timeline

**Primary mode: Non-destructive timeline cuts**

When the user clicks "Export to Timeline":

1. Collect all `selected` silent regions (with buffer applied)
2. For each clip in the affected track(s):
   - Calculate split points where silence regions intersect the clip
   - Split the clip at each boundary → creates new smaller clips
   - Remove clip segments that fall within silent regions
   - Shift remaining clips left (ripple delete) to close gaps
3. Add to editor undo history as a single undoable action
4. Close the dialog
5. Show toast: "Removed X silent regions (Y seconds)"

**Secondary mode: Server-side cut (optional, for export)**

- Use `MediaJobClient.cutDeadAir()` → `dead_air_cut` job
- Backend concatenates non-silent segments into new file
- Result: single continuous video file without dead air

### 8. Backend: Implement `dead_air_cut` Handler

**File:** `python-backend/app/tasks/media_job_worker.py`

**Current status:** `_not_implemented_handler` (raises `NotImplementedError`)

**Implementation spec:**

```
Input:
  - assets[0].uri: source video/audio file
  - params.segments: Array<{ startMs, endMs }> — regions to REMOVE
  - params.mode: "remove" | "compress"
  - params.softeningBufferMs: number (optional, default 0)

Process:
  1. Calculate "keep segments" (inverse of silence segments)
  2. Apply softening buffer to keep segment boundaries
  3. Build FFmpeg filter_complex:
     - For each keep segment: trim + setpts reset
     - Concat all keep segments
     - Apply audio crossfade at joins (duration = softeningBufferMs * 2)
  4. Encode output (same codec settings as source, or H.264/AAC default)

Output:
  - artifacts[0]: { path: "/tmp/.../output.mp4", kind: "video" }
  - derived: { originalDurationMs, outputDurationMs, removedMs, segmentCount }
```

**FFmpeg approach:**

```bash
ffmpeg -i input.mp4 \
  -filter_complex "
    [0:v]trim=0:5.2,setpts=PTS-STARTPTS[v0];
    [0:a]atrim=0:5.2,asetpts=PTS-STARTPTS[a0];
    [0:v]trim=8.7:15.3,setpts=PTS-STARTPTS[v1];
    [0:a]atrim=8.7:15.3,asetpts=PTS-STARTPTS[a1];
    ...
    [v0][a0][v1][a1]...concat=n=N:v=1:a=1[outv][outa]
  " \
  -map "[outv]" -map "[outa]" \
  -c:v libx264 -c:a aac output.mp4
```

With softening buffer crossfade (audio only):
```bash
# Add acrossfade between adjacent keep segments
[a0][a1]acrossfade=d=0.4:c1=tri:c2=tri[a01];
[a01][a2]acrossfade=d=0.4:c1=tri:c2=tri[a012];
```

---

## Type Changes

### New/Modified Types (`types/videoEditor.ts`)

```typescript
// Extend SilenceDetectionConfig
export interface SilenceDetectionConfig {
  threshold: number;         // dB threshold (-60 to -20)
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
  adjustedDuration: number;  // NEW: adjusted duration (may be 0 if skipped)
  selected: boolean;
  averageDb: number;
  skipped: boolean;          // NEW: true if region too short after buffer
}

// Dialog open/close state
export interface SilenceDetectionDialogState {
  isOpen: boolean;
  config: SilenceDetectionConfig;
  regions: SilentRegion[];
  analysisComplete: boolean;
  isAnalyzing: boolean;
  playbackTime: number;      // current preview position
  timelineZoom: number;      // pixels per second for mini-timeline
}
```

### Backend Params Extension

```python
# dead_air_detect params (extend)
{
  "thresholdDb": -40,
  "minSilenceMs": 500,
  # softeningBuffer is applied client-side, not needed in detect
}

# dead_air_cut params (new implementation)
{
  "segments": [
    { "startMs": 3200, "endMs": 5800 },
    { "startMs": 12400, "endMs": 14100 }
  ],
  "mode": "remove",
  "softeningBufferMs": 200,
  "crossfade": true
}
```

---

## File Structure (New/Modified)

```
apps/web/client/src/
├── components/videoeditor/
│   ├── SilenceDetectionDialog.tsx      # NEW: Full-screen dialog (replaces panel usage)
│   ├── SilenceDetectionPanel.tsx       # KEEP: Refactor to use shared logic
│   ├── SilenceWaveformOverlay.tsx      # NEW: Waveform with region overlay
│   ├── SilenceTimeline.tsx             # NEW: Mini-timeline (thumbnails + waveform)
│   ├── SilenceRegionList.tsx           # NEW: Extract region list from panel
│   ├── WaveformCanvas.tsx              # KEEP: Reuse as-is
│   ├── PreviewPlayer.tsx               # KEEP: Reuse as-is
│   └── VideoEditorPhase3.tsx           # MODIFY: Add dialog trigger
├── types/
│   └── videoEditor.ts                  # MODIFY: Extend types as above
└── services/
    └── mediaJobClient.ts               # MODIFY: Add softeningBufferMs param

python-backend/app/tasks/
└── media_job_worker.py                 # MODIFY: Implement handle_dead_air_cut()
```

---

## Implementation Priority

### Phase 1 — Core Dialog + Enhanced Detection (MVP)

1. Create `SilenceDetectionDialog.tsx` full-screen layout
2. Add **Softening Buffer** parameter to config and frontend
3. Implement buffer-adjusted region calculation (client-side)
4. Embed `PreviewPlayer` in dialog with playback sync
5. Basic waveform display (reuse `WaveformCanvas`) with red region overlays
6. "Export to Timeline" as non-destructive clip splits

### Phase 2 — Interactive Waveform + Timeline

7. `SilenceWaveformOverlay.tsx` — clickable region toggle, hover tooltips
8. `SilenceTimeline.tsx` — video thumbnail strip + waveform
9. Click-to-scrub on waveform/timeline
10. Bidirectional playhead sync (preview <-> timeline)
11. Zoom controls for mini-timeline

### Phase 3 — Backend Cut + Polish

12. Implement `handle_dead_air_cut()` in Python backend with FFmpeg concat
13. Audio crossfade at segment joins (softening buffer)
14. Progress bar with SSE stage updates during analysis
15. Keyboard shortcuts (Space=play/pause, Left/Right=step, Ctrl+Z=undo)
16. Region list with "jump to region" (click scrolls timeline + seeks preview)

---

## Acceptance Criteria

- [ ] Full-screen dialog opens from video editor toolbar
- [ ] Volume Threshold slider works (-60dB to -20dB) with dB + % display
- [ ] Minimum Duration slider works (0.1s to 5.0s)
- [ ] Softening Buffer slider works (0.0s to 2.0s)
- [ ] "Analyze" detects silent regions via existing `dead_air_detect` backend
- [ ] Waveform displays with silent regions highlighted as red overlays
- [ ] Video preview plays inside dialog with sync to waveform playhead
- [ ] Click on waveform seeks playback position
- [ ] Click on region overlay toggles selection
- [ ] "Export to Timeline" splits clips and removes silence (non-destructive)
- [ ] Operation is undoable (single undo step)
- [ ] `handle_dead_air_cut` backend handler implemented for server-side export
- [ ] Softening buffer prevents harsh audio jumps at cut points
- [ ] Existing sidebar panel remains functional (shared logic)
