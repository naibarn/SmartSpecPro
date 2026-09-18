# Silence Detection Feature — Research Findings

## Part 1: Codebase Architecture Analysis

### 1. Video Editor Architecture

#### Main Editor Component (`VideoEditorPhase3.tsx`, 2151 lines)

**State Management:**
- Project state: `VideoEditorProject` (line 53)
- Undo/Redo: Array-based with index pointer (lines 63-66), max 50 entries, deep clones via `JSON.stringify/parse`
- Sidebar views: String-based view state (line 78)
- Dialog management: Boolean flags + callback pattern (lines 70-75)

**Sidebar View System (line 78):**
```typescript
type SidebarView = 'library' | 'ducking' | 'aspectRatio' | 'history' |
                   'transitions' | 'overlay' | 'silence' | 'text'
```
Current silence panel: Simple sidebar panel (lines 2037-2041)

**Dialog Pattern (lines 70-75, 2053-2078):**
- Uses boolean state flags (`showExportDialog`, `showRenderProgress`)
- Renders conditionally at end of component JSX
- Overlay-based full-screen modals with backdrop
- Pattern to follow: `showSilenceDialog` boolean + conditional render

**Undo/Redo System (lines 112-149):**
```typescript
const addToHistory = useCallback((newProject: VideoEditorProject) => {
  setHistory(prev => {
    const trimmed = prev.slice(0, historyIndexRef.current + 1);
    const updated = [...trimmed, JSON.parse(JSON.stringify(newProject))].slice(-50);
    setHistoryIndex(updated.length - 1);
    return updated;
  });
  setIsDirty(true);
}, []);
```
All timeline operations call `addToHistory(newProject)` after modifications.

#### Timeline Clip Management

**Clip Split/Delete/Move Pattern (lines 596-656, 1342-1397):**
- Split: Creates two new clips from one, updates trim points
- Delete: Removes from track.clips array, handles ripple mode
- Ripple mode: Automatically closes gaps by shifting subsequent clips

**Dead Air Removal (`handleCutAndCombine`, lines 759-881):**
- Splits clips at silent region boundaries (lines 778-833)
- Creates new clip segments with adjusted trim points
- Removes gaps using ripple delete logic (lines 839-864)
- Calls `addToHistory()` after completion

**Ripple Delete Logic (lines 634-644):**
```typescript
if (rippleEditMode) {
  for (const track of newProject.timeline.tracks) {
    let currentTime = 0;
    track.clips.sort((a: Clip, b: Clip) => a.startTime - b.startTime);
    track.clips.forEach((clip: Clip) => {
      clip.startTime = currentTime;
      currentTime += clip.duration;
    });
  }
}
```

### 2. Existing Silence Detection Panel (`SilenceDetectionPanel.tsx`, 431 lines)

**State Management (lines 30-45):**
```typescript
const [threshold, setThreshold] = useState(-40);
const [minDuration, setMinDuration] = useState(0.5);
const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
const [isAnalyzing, setIsAnalyzing] = useState(false);
const [silentRegions, setSilentRegions] = useState<SilentRegion[]>([]);
const [analysisComplete, setAnalysisComplete] = useState(false);
```

**MediaJobClient Integration (lines 67-136):**
- Uses `createMediaJobClient().detectDeadAir(assetUri, { thresholdDb, minSilenceMs })`
- Maps result `silenceSegments` → `SilentRegion[]` with generateId()
- Calculates totalSilence, totalActive durations

**UI:** Inline panel inside sidebar, CSS file for styling, checkboxes, expandable regions, stats cards

### 3. Waveform Canvas (`WaveformCanvas.tsx`, 90 lines)

**Props Interface (lines 8-14):**
```typescript
interface WaveformCanvasProps {
  waveformData: number[];   // Normalized peak values (0-1)
  width: number;
  height: number;
  color?: string;           // Default: '#00b294'
  backgroundColor?: string; // Default: 'transparent'
}
```

**Rendering:** HTML5 Canvas with device pixel ratio scaling, draws vertical lines per pixel (min/max peak in sample range), `React.memo` wrapper.

**Overlay potential:** Can stack multiple canvases via z-index for region overlays.

### 4. Preview Player (`PreviewPlayer.tsx`, 1115 lines)

**Props Interface (lines 21-34):**
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
  // ... transitions, transforms
}
```

**Key:** Self-contained, can be rendered anywhere. Controls zoom (10-400%), fullscreen, seek bar, volume. `currentTime` is passed as prop from parent.

### 5. MediaJobClient (`mediaJobClient.ts`, 374 lines)

**detectDeadAir (lines 245-265):**
```typescript
async detectDeadAir(assetUri: string, params?: DeadAirParams): Promise<MediaJobResult> {
  const spec: MediaJobSpec = {
    jobType: "dead_air_detect",
    inputs: { assets: [{ assetId: "input", kind: "audio", uri: assetUri }] },
    params: { thresholdDb: params?.thresholdDb ?? -40, minSilenceMs: params?.minSilenceMs ?? 500 },
  };
}
```

**cutDeadAir (lines 267-285):** Stubbed with `jobType: "dead_air_cut"`, calls unimplemented backend.

**Job Progress:** SSE-style progress updates via adapter.onProgress, fallback polling (3s), 30-min timeout.

**Result Format:**
```typescript
interface MediaJobResult {
  jobId: string;
  status: "done";
  artifacts: Array<{ kind: string; uri: string; mime: string }>;
  derived?: {
    silenceSegments?: Array<{ startMs: number; endMs: number; durationMs: number }>;
    keepSegments?: Array<{ startMs: number; endMs: number }>;
  };
}
```

### 6. Python Backend — Media Job Worker (`media_job_worker.py`, 905 lines)

**Handler Registration (lines 786-798):**
```python
HANDLER_MAP = {
    "dead_air_detect": handle_dead_air_detect,
    "dead_air_cut": _not_implemented_handler,  # ← Need to implement
    "render_mp4_h264": handle_render_mp4,
    "waveform_peaks": handle_waveform_peaks,
    "thumbnails": handle_thumbnails,
    # ...
}
```

**Silence Detection Handler (lines 689-702):**
```python
def handle_dead_air_detect(spec: dict, tmp_dir: str) -> dict:
    cmd = build_ffmpeg_command_for_silence(spec)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    segments = parse_silence_output(result.stderr)
    return {"artifacts": [], "derived": {"silenceSegments": segments}}
```

**FFmpeg Command (lines 506-528):**
```python
af = f"silencedetect=noise={threshold_db}dB:d={min_duration}"
return ["ffmpeg", "-i", path, "-af", af, "-f", "null", "-"]
```

**Pattern to follow for dead_air_cut:**
1. Validate input spec
2. Build FFmpeg command
3. Report progress via `report_progress(job_id, progress, stage, message)`
4. Run FFmpeg subprocess with timeout
5. Parse output, create result dict
6. Return `{"artifacts": [...], "derived": {...}}`

Similar handlers: `handle_render_mp4` (file output), `handle_thumbnails` (progress reporting).

### 7. UI Patterns

**Dialog System (`packages/ui/src/components/ui/dialog.tsx`):**
- Radix UI Dialog Primitives with ESC key handling, ARIA labels, focus trap
- Animated enter/exit via Tailwind animate classes

**Full-Screen Modal Examples:**
- ExportDialog: Fixed overlay (`position: fixed; inset: 0`), backdrop `rgba(0,0,0,0.8)`, z-index 1000+
- RenderProgressDialog: Same pattern with progress bar + live updates

**Video Editor Styling:** CSS-in-JS (`<style>` tags), dark theme (`#1a1a1a`, `#2a2a2a`), accent `#0078d4` / `#00b294`

**Available Radix Components:** dialog, button, card, checkbox, slider, scroll-area, accordion, badge, alert

### 8. Testing Setup

**Frontend (Vitest):** No existing video editor tests found. Framework configured in `apps/web/package.json`. `pnpm test` / `pnpm test:coverage`.

**Backend (pytest):** 80% coverage enforced. Markers: unit, integration, e2e, llm, media. Async support. Relevant: `tests/services/test_media_task_service.py`.

### 9. Type Definitions (`videoEditor.ts`, 642 lines)

**SilentRegion (lines 208-216):**
```typescript
export interface SilentRegion {
  id: string; trackId: string; startTime: number; endTime: number;
  duration: number; selected: boolean; averageDb: number;
}
```

**Clip (lines 46-65):**
```typescript
export interface Clip {
  id: string; assetId: string; trackId: string; startTime: number;
  duration: number; trimIn: number; trimOut: number; volume: number;
  speed: number; effects: Effect[]; transitions?: { fadeIn?: number; fadeOut?: number };
  // ...
}
```

**Helpers:** `generateId()`, `formatTime()`, `calculateProjectDuration()`, `addClipToTrack()`, `findTrackByType()`, `validateProject()`

---

## Part 2: Web Research — Best Practices

### Topic 1: FFmpeg filter_complex Concat + Crossfade

#### Recommended Approach: Two-Step Silence Removal

**Step 1 — Detection (already implemented):**
```bash
ffmpeg -i INPUT -af silencedetect=n=-40dB:d=0.5 -f null -
```

**Step 2 — Removal via select/aselect filters:**
```bash
ffmpeg -i input.mp4 \
  -vf "select='between(t,0,5.2)+between(t,8.7,15.3)+between(t,20,30)',setpts=N/FRAME_RATE/TB" \
  -af "aselect='between(t,0,5.2)+between(t,8.7,15.3)+between(t,20,30)',asetpts=N/SR/TB" \
  output.mp4
```

**Alternative — trim/atrim + concat filter_complex:**
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

#### Audio Crossfade Between Segments
```bash
[a0][a1]acrossfade=d=0.4:c1=tri:c2=tri[a01];
[a01][a2]acrossfade=d=0.4:c1=tri:c2=tri[a012];
```

**Critical notes:**
- `setpts=PTS-STARTPTS` is essential after each trim to reset timestamps
- For audio: `asetpts=PTS-STARTPTS`
- Crossfade duration must be shorter than shortest segment
- First/last segments: No crossfade at boundaries
- Audio crossfade should be half of video crossfade duration for sync

#### Edge Cases
- **Very short segments (<1s):** Skip crossfade, use direct cuts
- **Segments at file start/end:** No crossfade at terminal boundaries
- **Codec compatibility:** Use same codec as source, or H.264/AAC default

#### Sources
- [FFmpeg Filters Documentation](https://ffmpeg.org/ffmpeg-filters.html)
- [Cut, Trim & Concatenate in FFmpeg](https://www.ffmpeg.media/articles/cut-trim-concatenate-without-reencoding)
- [CrossFade using FFmpeg's xfade Filter](https://ottverse.com/crossfade-between-videos-ffmpeg-xfade-filter/)
- [Remove silence from video files with FFmpeg](https://github.com/bambax/Remsi)

### Topic 2: React Canvas Waveform with Interactive Overlays

#### Recommended Approach: Custom Canvas (match existing WaveformCanvas.tsx)

Since the project already has `WaveformCanvas.tsx` using raw Canvas, extend it rather than adding a library dependency.

**Overlay Architecture:**
1. Base canvas: Waveform data (existing)
2. Overlay canvas: Silent region rectangles (new, stacked via z-index)
3. Interaction layer: Click/hover events on overlay canvas

**Click-to-Seek:**
```typescript
const handleCanvasClick = (e: React.MouseEvent) => {
  const rect = canvasRef.current.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const time = (clickX / rect.width) * duration;
  onTimeChange(time);
};
```

**Region Rendering:**
```typescript
// For each silent region:
const x = (region.startTime / duration) * canvasWidth;
const w = ((region.endTime - region.startTime) / duration) * canvasWidth;
ctx.fillStyle = region.selected ? 'rgba(255, 0, 0, 0.3)' : 'rgba(255, 0, 0, 0.15)';
ctx.fillRect(x, 0, w, canvasHeight);
if (region.selected) {
  ctx.strokeStyle = '#00bcd4'; ctx.setLineDash([4, 2]);
  ctx.strokeRect(x, 0, w, canvasHeight);
}
```

**Playhead Sync:**
```typescript
// Vertical line at currentTime position
const playheadX = (currentTime / duration) * canvasWidth;
ctx.strokeStyle = '#ff0000';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(playheadX, 0);
ctx.lineTo(playheadX, canvasHeight);
ctx.stroke();
```

**Zoom (pixels per second):** Adjust canvas width = `duration * pixelsPerSecond`, wrap in scrollable container.

#### Performance Considerations
- Pre-generate waveform peaks server-side (existing `waveform_peaks` job)
- Use `requestAnimationFrame` for playhead updates
- `React.memo` on canvas components (already in place)
- Reuse Float32Array buffers for frequent updates
- Canvas > SVG for performance

#### Sources
- [wavesurfer.js](https://wavesurfer.xyz/) (reference, not dependency)
- [Visualizations with Web Audio API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API)
- [Kapwing: Audiograms with Web Audio API & Canvas](https://www.kapwing.com/blog/how-we-built-it-audiogram/)

### Topic 3: Non-Destructive Timeline Clip Splitting

#### Algorithm: Split Clip at Timestamp

The existing codebase already implements this pattern. Key steps:

1. **Locate clip** containing the split position
2. **Create two new clips** from the original
3. **Adjust trimIn/trimOut** to reference same source material
4. **Replace original** with two new clips

```
Before: [======== Clip A ========]
        start:0s, duration:10s, trimIn:5s → references 5s-15s of source

Split at 4s from clip start:

After:  [==== A1 ====][==== A2 ====]
        A1: start:0s, duration:4s, trimIn:5s → references 5s-9s
        A2: start:4s, duration:6s, trimIn:9s → references 9s-15s
```

#### Ripple Delete for Silence Removal

For silence detection "Export to Timeline":
1. Sort silent regions by startTime
2. Process from **last to first** (reverse order) to maintain valid indices
3. For each region: split intersecting clips, remove silent segments
4. Shift all subsequent clips left to close gaps
5. Record entire operation as single undo step

**Critical:** Process reverse order to prevent position shifts from invalidating subsequent region boundaries.

#### Undo/Redo

The existing system (array-based, max 50 entries, deep clone) is sufficient. The "Export to Timeline" operation should:
1. Take a snapshot before modification (`addToHistory`)
2. Apply all splits and removes
3. Single undo restores entire pre-operation state

#### Sources
- [React Video Editor Timeline](https://www.reactvideoeditor.com/docs/core/components/timeline)
- [Remotion: Building a Timeline](https://www.remotion.dev/docs/building-a-timeline)
- [Kdenlive Editing Documentation](https://docs.kdenlive.org/en/cutting_and_assembling/editing.html)

---

## Part 3: Testing Context

### Frontend Testing (Vitest)
- No existing video editor component tests found
- Need to establish patterns for:
  - Unit tests for clip splitting/ripple delete logic
  - Component tests for dialog rendering
  - Integration tests for detection workflow

### Backend Testing (pytest)
- 80% coverage enforced
- `test_media_task_service.py` exists as reference
- For `handle_dead_air_cut`: Mock FFmpeg subprocess, test segment calculation, test edge cases

### Recommended Test Strategy
1. **Pure logic tests:** Buffer calculation, region filtering, clip split math
2. **Component render tests:** Dialog opens/closes, settings update state, region list renders
3. **Integration tests:** Detection → region display → export flow (mock MediaJobClient)
4. **Backend unit tests:** FFmpeg command building, segment parsing, error handling
