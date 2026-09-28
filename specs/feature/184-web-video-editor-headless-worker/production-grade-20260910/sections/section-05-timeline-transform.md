# Section 05 — Timeline correctness, Transform/Keyframes and performance

## Goal

Match the Worker App editing semantics in the browser while keeping Transform
(static state) and Keyframes (time-varying state) unambiguous.

## Implementation

- Keep Transform as the base x/y/scale/rotation/opacity/crop at a clip time;
  Keyframes are normalized clip-local timestamps with interpolation/easing.
  Editing a keyframe never silently changes the base transform.
- Support video and image clips equally, free pan/zoom, Ken Burns presets,
  pinned keyframes, snapping, split/trim/ripple, undo/redo and keyboard frame
  stepping. Add a visual distinction between base-transform and keyframe edits.
- Timeline supports arbitrary track count with horizontal and vertical scroll,
  virtualization after a threshold, per-track lock/mute/solo/visibility/volume,
  detailed ruler ticks and safe drag/drop hit targets.
- Compile the canonical timeline to render plans deterministically; reject
  overlapping or out-of-bounds clips before Worker submit.

## Tests and proof

Pure transform/keyframe interpolation fixtures, image/video parity fixtures,
keyboard and snapping tests, 20+ track browser fixture, scroll persistence and
render-plan hash stability. Compare selected frames with the Worker evaluator.

## UI/UX Contract

### Target User / JTBD
Editors need to complete the requested media task, understand whether it runs in the browser or Worker, and recover safely from a blocked or failed operation.

### Surface Inventory
The owning editor panel, Worker handoff state, Worker Jobs result/review state, and Dashboard deep link are the required surfaces for this section.

### Component Map
Reuse the existing Phase 3 editor shell and shared operation status components. Add a typed panel state, operation capability badge, progress/error banner and review action where this section owns a user action.

### State Matrix
`idle` → `editing` → `preflight` → `queued` → `running` → `review` → `applied`; `blocked`, `failed`, `canceled`, `stale` and `expired` are explicit recoverable states. No unavailable capability is shown as success.

### Responsive Matrix
Verify the surface at 390x844, 768x1024, 1280x800 and 1440x900. Horizontal timeline overflow is intentional and scrollable; dialogs must remain usable without clipping.

### Accessibility Acceptance
Every action has an accessible name, keyboard path, visible focus, disabled reason and status announcement. Errors identify the next recovery action without exposing tokens, paths or signed URLs.

### Copy Contract
Use `Worker Jobs` / `คิวงาน Worker` for the queue. Use `กำลังตรวจสอบความสามารถ Worker`, `ต้องติดตั้ง Worker adapter`, `รอตรวจสอบผลลัพธ์` and `ผลลัพธ์ล้าสมัย` for the corresponding states.

### Browser Evidence Required
Capture a focused browser trace or screenshot for the happy path and each blocked/error state. Record viewport, operation, capability manifest revision and whether the proof is local, staging or production.
