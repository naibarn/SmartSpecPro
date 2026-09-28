# Section 03 — Transform, Keyframes, placement and camera motion

## Goal

Make Transform and Keyframes understandable and deterministic for both images
and videos. The same commands must drive pointer editing, numeric inputs,
playhead scrubbing and Worker render evaluation.

## Semantic model

`Transform` is a clip's base/current position state: x/y anchor, scale, rotation,
opacity and crop. It answers “where/how large is this clip at this instant when
no animated point overrides it?”. `Keyframes` are timestamped Transform values
with interpolation. They answer “how does that state change over time?”. The
inspector labels the source of every displayed value as `Transform` or
`Keyframe @ time`.

Store clip-local normalized time `[0,1]` plus source/project timestamps. The pure
reducer sorts points, replaces a near-duplicate within epsilon, clamps finite
values to documented bounds and preserves unknown fields. Interpolation supports
`hold`, `linear` and `easeInOut`; unsupported curves fail validation instead of
falling back silently.

## Interaction contract

- Numeric fields and pointer handles dispatch the same `setTransform` command.
- `เพิ่ม Keyframe` captures the evaluated value at the playhead; a second click
  at the same time updates that point, not a duplicate.
- A selected keyframe can be pinned to the inspector, moved along the ruler,
  given an interpolation mode, edited or deleted. “Pin” is an editing focus;
  “Lock track” blocks edits. The UI must not conflate them.
- Scrubbing seeks to exact keyframe time. Arrow/Shift+Arrow nudges selected
  points by one frame/ten frames. Undo/redo is command based.
- `bake to base` is explicit and clears points only after confirmation.
- Still images use the same transform track; a still has a project duration and
  can pan/zoom between points exactly like video.

## Camera and free positioning

`SmartCameraPanel` provides fit/fill, free pan/zoom, anchor, rotation, face
focus and auto-pan/auto-zoom. Manual motion is a transform track. Auto focus
creates a versioned `focus_track` artifact that is previewed and approved before
it is merged. It cannot overwrite manual points. A camera path and clip
transform are separate namespaces so changing one is visible and reversible.
Product/focus pins expose add, seek, delete-all, show/hide and “hide while
previewing” controls; these are marker visibility settings and never become
rendered pixels or silently mutate the transform track.
Automatic focus/reframe uses the `reframe` Worker adapter and returns a
revision-pinned `focus_track` artifact for review before merge.

`PreviewPlayer` evaluates at the current frame. The Worker evaluator consumes
the same JSON fixture and uses project dimensions, pixel aspect and crop rules.
Pointer drag/resize must remain bounded by the preview frame and preserve
subpixel values until serialization.

## Files and sequence

1. Extend `transformKeyframes.ts` with reducer, validation, interpolation and
   fixture serialization.
2. Refactor `OverlayPanel.tsx`, `PreviewPlayer.tsx`, timeline commands and
   `SmartCameraPanel.tsx` to dispatch the shared reducer.
3. Add Worker/Rust evaluator and browser-vs-worker frame fixtures.
4. Add migration for old transform/keyframe shapes and a report for dropped
   unsupported curves.

## UI/UX Contract

### Target User / JTBD

A creator needs to place, crop, zoom and pan a still or video, then animate that
placement while knowing whether a value comes from a base Transform or a
Keyframe.

### Surface Inventory

Preview handles, Transform inspector, Keyframe strip, keyframe context menu,
track header lock/pin controls and Camera/Auto Pan-Zoom panel.

### Component Map

`transformTrack` owns pure commands; `PreviewPlayer` owns evaluation/render;
`OverlayPanel` owns numeric editing; `KeyframeStrip` owns points and playhead;
`SmartCameraPanel` owns focus-track review; timeline track headers own lock and
selection.

### State Matrix

| State | Required behavior |
|---|---|
| no clip | inspector disabled with selection guidance |
| base transform | fields labelled Transform |
| keyframe selected | fields labelled Keyframe and seek action |
| duplicate time | replace within epsilon and announce update |
| locked track | preview works; edit commands disabled |
| auto focus pending | progress and cancel; no mutation |
| focus ready | review/approve/reject before merge |
| stale focus | show source revision and regenerate |
| unsaved | save indicator and undo |

### Responsive Matrix

| Viewport | Behavior |
|---|---|
| 360x800 | preview and single-point review; advanced curve editing deferred |
| 390x844 | transform fields in bottom sheet; keyframe seek available |
| 768x1024 | stacked inspector and keyframe strip |
| 1024x768 | compact side inspector with timeline |
| 1280x800 | full preview/inspector/timeline |
| 1440x900 | full camera, keyframe and track controls |

### Accessibility Acceptance

Every handle has labelled keyboard alternatives, sliders expose units and range,
selected keyframes have text timecode, lock/pin state is announced, focus is
visible and pointer-only operations have buttons for add/update/delete/seek.

### Copy Contract

Use `Transform (ตำแหน่ง/ขนาด)`, `Keyframes (จุดเปลี่ยนตามเวลา)`, `เพิ่ม Keyframe`,
`ปักหมุดเพื่อแก้ไข`, `ล็อกแทร็ก`, `เลื่อนไปยังจุด`, `ซูม`, `แพน`, `Auto Pan/Zoom`
and `ตรวจสอบเส้นทางก่อนใช้`. Do not call a static transform a keyframe.

### Browser Evidence Required

An authenticated browser fixture must import one image and one video, create two
points each, scrub, drag, pin, lock, reload and compare screenshots/serialized
documents with the Worker evaluator fixture.

## Tests and acceptance

- Reducer tests cover interpolation, epsilon replacement, clamping, unknown
  fields, pin/move/delete, bake, undo/redo and image/video duration mapping.
- Component tests prove pointer/numeric/keyboard parity and lock versus pin.
- Stale auto-focus cannot apply to a newer revision.
- Render fixture output matches browser evaluator at exact frame boundaries.

## Risks and stop conditions

Stop if an old project uses an unsupported curve or absolute local path; surface
the migration report and keep the clip editable. Never let auto-generated camera
points erase manual keyframes without explicit approval.
