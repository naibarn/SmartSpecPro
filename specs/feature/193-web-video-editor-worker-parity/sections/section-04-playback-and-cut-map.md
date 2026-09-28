# Section 04 — Playback and silence cut map

## Objective

Ensure browser play/seek and timeline edits use the exact source-time camera and
silence mapping that render will use.

## Implementation status

Implemented through persisted `CameraMotionPlan` on clip metadata and the
shared `SilenceCutMap` attached to project metadata during timeline export.
Render serialization carries the same plan/cut-map metadata; the existing
timeline transform remains the compatibility projection.

## Implementation scope

- Locate the Web player transform path under `VideoEditorPhase3` and its child
  player components. Replace live detector-only crop shortcuts with the shared
  plan evaluator.
- Map edited playhead → source time before evaluating camera keyframes. Apply
  five-point safe ROI, activity freshness/association, bounded gap fallback,
  and explicit status labels during play, pause, seek, reverse, loop, and
  dropped-frame recovery.
- Add local analysis behind `SilenceDetectionDialog.tsx` while retaining its
  review, selected/skipped/manual, padding, and reversible timeline behavior.
- Persist a shared cut map on save and apply it to video, audio, subtitles,
  overlays, markers, camera lookup, and final render. Keep
  `MediaJobClient.detectDeadAir` as a compatibility adapter.

## TDD targets

- Same source-time plan result for play/seek samples.
- Safe ROI under detector gaps and activity association changes.
- Cut-map time remapping, duration, audio/video sync, and overlay timing.
- Save-required state for transient unsaved cuts before render.

## UI/UX Contract

### Target User / JTBD

Creator plays and seeks the edited timeline and trusts that preview timing and
framing will match the eventual render.

### Surface Inventory

Player viewport, timeline playhead, silence review dialog, overlays/subtitles,
and cut-map status.

### Component Map

Shared evaluator/cut map owns time math; player and timeline consume it;
dialog owns review selection only.

### State Matrix

Playing evaluates the plan; seeking maps time; detector gap shows bounded
fallback; unsaved cuts show save-required before render; stale map asks review;
error preserves previous valid edit.

### Responsive Matrix

Player and cut controls remain operable on narrow/mobile widths without hidden
playhead status; desktop exposes full diagnostics.

### Accessibility Acceptance

Playhead and region controls are keyboard reachable, focus is visible, and
screen readers receive current time/status changes without excessive chatter.

### Copy Contract

Thai copy distinguishes “ตัวอย่างชั่วคราว”, “บันทึกการตัดก่อน Render”,
“วิเคราะห์ใหม่”, and “ใช้แผนเดิม”; English fallback is required.

### Browser Evidence Required

Play/seek fixture proves source-time mapping, no audio/video drift, and no
browser-only crop transform.
