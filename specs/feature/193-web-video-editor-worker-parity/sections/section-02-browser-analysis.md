# Section 02 — Browser analysis runtime

## Objective

Provide bounded local Face Focus, Face + Activity, and Quick Silence Cut
analysis without requiring Worker App or blocking the React playback loop.

## Implementation status

Implemented in `apps/web/client/src/services/browserVideoAnalysis.ts` using the
Worker App MediaPipe package/model/WASM contract, lazy loading, cancellation,
capability fingerprints, five-point normalization, bounded frame-difference
activity sampling associated to the face track, and Web Audio silence analysis
with a bounded fetch budget. The browser path yields between samples; heavy
authoritative scans remain on the Worker path.

## Implementation scope

- Add a lazy browser analysis service in `apps/web/client/src/services/` with
  capability probing, operation-specific budgets, cancellation, provenance,
  and deterministic capability fingerprints.
- Run face/activity sampling in a dedicated Web Worker when available. Use an
  AudioWorklet or Worker-backed audio path for local silence analysis, with a
  bounded small-media fallback.
- Normalize detector output to the shared five-point face/activity evidence and
  pass it to the shared planner; the adapter must not own camera policy.
- Return explicit `browser_ready`, `browser_degraded`, `unsupported`, and
  `stale` results. Release temporary buffers when source/revision changes.

## Runtime constraints

Reuse the existing Worker App `@mediapipe/tasks-vision` `^1.0.1` dependency and
the same `blaze_face_full_range.tflite`/WASM assets. If the Web deployment does
not expose those immutable assets, report `browser_degraded` and offer Full
Scan; do not fetch an untracked model. Model/runtime identity is included in
the capability fingerprint.
Duration, decoded-pixel, memory, and wall-clock budgets are configuration and
must be measured in tests. A budget failure offers Worker fallback and leaves
the editor usable.

## TDD targets

- Capability matrix and lazy initialization.
- Five-point output normalization and activity face-track association.
- Detector gap, cancellation, source invalidation, and budget exhaustion.
- Local silence thresholds, padding, stream selection, and provenance.

## UI/UX Contract

### Target User / JTBD

Browser creator needs quick local analysis without losing editor responsiveness.

### Surface Inventory

Capability status in Smart Camera and Silence Detection dialog; no new route.

### Component Map

Analysis service owns runtime state; existing panels own presentation.

### State Matrix

Ready enables local action; degraded explains limits; running shows progress;
cancelled returns to ready; stale requests re-analysis; error offers Worker or
manual fallback.

### Responsive Matrix

Status text and fallback action remain visible on mobile, tablet, and desktop.

### Accessibility Acceptance

Status is announced, controls are keyboard reachable, focus is visible, and
color is not the only status signal.

### Copy Contract

Thai primary copy with English fallback; distinguish local, degraded, queued,
and Worker-required states.

### Browser Evidence Required

Vitest state tests plus a browser fixture proving local analysis does not block
playback and that cancellation releases the operation.
