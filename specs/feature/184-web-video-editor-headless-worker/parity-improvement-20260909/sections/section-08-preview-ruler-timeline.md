# Section 08 — Preview modes, detailed ruler and many-track timeline

## Goal

Make the editor's visible working area match the Worker App: clear frame/camera/
render-faithful preview modes, detailed ruler bars and a timeline that remains
usable with many video, audio, overlay and text tracks.

## Preview modes

Unify the current toolbar into explicit modes: `กรอบ` shows editor frame,
safe-area/crop guides and selection handles; `มุมกล้อง` shows camera path,
anchor and focus overlays; `เหมือน Render` evaluates the same document used by
Remotion/FFmpeg and labels any browser approximation. Fit/25/50/100% and quality
only affect view state. Show ratio, pixel dimensions, frame rate, timecode and
current frame; respect reduced-motion settings. Frame-guide controls include
safe-area, center/crosshair and grid toggles with a clear preview-only label.

Add a `Ratio` panel/control with 16:9, 9:16, 1:1 and custom dimensions. Custom
dimensions are positive integers within configured width/height and pixel-area
limits; invalid values return a typed validation error. Changing the project
canvas creates a revision-aware command, previews fit/fill/crop and safe-area
consequences, and never mutates source media dimensions. Existing clips retain
their transforms unless the user explicitly chooses a reframe operation.

## Ruler and tracks

Implement an adaptive ruler that chooses major/minor tick intervals from zoom,
duration and frame rate. Label timecode and frame number, mark clip edges,
keyframes, clip edges and silence ranges, show snap targets/indicators, and keep
the playhead aligned while horizontally scrolling. Keep track labels and ruler
header sticky where the existing layout allows.

The timeline model supports arbitrary V/A/overlay/text tracks. Track rows are
virtualized or windowed for large projects; the viewport has independent
vertical and horizontal scroll, with `scrollIntoView` for selected clips and
keyboard navigation. Track headers expose add, rename, lock, mute, solo,
visibility and delete/restore. Add `+ Video track`, `+ Audio track`, `+
Overlay track` and `+ Text track` actions to match the screenshot's toolbar.

## Frame capture

Capture the current preview canvas at device-pixel ratio as PNG/JPEG for a local
download or optional Bin import, preserving selected color profile and pixel
dimensions. Exclude frame guides, camera handles, ruler and editor chrome from
the output. Detect tainted/cross-origin media; if a safe same-origin blob is
unavailable, use `render_still` and show its queue state.

## Files and sequence

1. Add preview mode/view state and guide overlay without changing project data.
2. Replace coarse ruler with adaptive tick/marker model and tests.
3. Add scrollable/virtualized multi-track viewport and track commands.
4. Add frame capture service and render-still fallback.

## UI/UX Contract

### Target User / JTBD

A creator needs to inspect framing, camera movement and render-like output while
scrubbing a long, multi-track project without losing the playhead or selected
clip.

### Surface Inventory

Preview toolbar, guide overlays, timecode/frame display, adaptive ruler, timeline
viewport, track headers, horizontal/vertical scrollbars and frame-capture dialog.

### Component Map

`PreviewModeToolbar` owns view state; `FrameGuideOverlay` owns guides;
`AdaptiveRuler` owns ticks/markers; `MultiTrackTimeline` owns rows/scroll;
`TrackHeader` owns track commands; `FrameCaptureDialog` owns output options.

### State Matrix

| State | Required behavior |
|---|---|
| no clips/loading | empty preview and disabled capture |
| playing/paused | playhead, timecode and ruler remain synchronized |
| frame/camera/render mode | label mode and preserve document |
| zoom/fit/quality | view-only; no revision mutation |
| many tracks | vertical scroll/virtual rows; selected row scrolls into view |
| capture pending/success | progress, output metadata and action |
| capture blocked | explain cross-origin and offer render-still |
| approximation | clearly label browser preview versus render-faithful |

### Responsive Matrix

| Viewport | Behavior |
|---|---|
| 360x800 | preview/status; compact ruler; horizontal timeline scroll |
| 390x844 | single-row track viewport with accessible controls |
| 768x1024 | stacked preview/timeline; vertical track scroll |
| 1024x768 | compact toolbar and two-axis timeline |
| 1280x800 | preview, detailed ruler and timeline |
| 1440x900 | full inspector/preview/timeline and capture dialog |

### Accessibility Acceptance

Playhead has a keyboard timecode control, Space/arrows/Home/End shortcuts are
documented, zoom and mode are labelled, rows expose lock/mute/solo/visibility,
scroll position is announced for selected clips and capture status is live.

### Copy Contract

Use `กรอบ`, `มุมกล้อง`, `เหมือน Render`, `แถบไม้บรรทัด`, `เฟรม`, `เพิ่มแทร็กวิดีโอ`,
`เพิ่มแทร็กเสียง`, `เพิ่มแทร็ก Overlay`, `เพิ่มแทร็ก Text`, `บันทึกเฟรมปัจจุบัน`
and `ตัวอย่างนี้เป็นภาพจำลอง`. English fallback remains in tooltips.

### Browser Evidence Required

Capture screenshots and keyboard traces at 360x800, 390x844, 768x1024,
1024x768, 1280x800 and 1440x900 using a 20-track fixture. Verify ruler/timeline
scroll sync, mode labels, frame capture and render-still fallback.

## Tests and acceptance

- Preview mode/fit/quality does not mutate the project. Ratio and Project
  resolution/FPS/timebase changes are explicit revision commands and preserve
  source media metadata.
- Tick spacing, frame/timecode labels, markers and scroll synchronization are
  deterministic across zoom/frame-rate fixtures.
- 20+ track fixture supports vertical/horizontal scroll and all header commands.
- Capture tests cover PNG/JPEG, DPR, tainted canvas and fallback job.

## Risks and stop conditions

Do not add a second timeline coordinate system. Stop capture with an explicit
error when the canvas is tainted; do not download a blank image. Keep render-like
preview labelled whenever effects are approximated.
