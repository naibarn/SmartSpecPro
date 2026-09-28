# Deep implementation plan — Feature 193

## 1. Goal and implementation boundary

Implement the browser-first Web Video Editor parity described by
`specs/feature/193-web-video-editor-worker-parity/spec.md` without creating a
second job ledger or a second camera planner. The implementation must make
Face Focus, Face + Activity, and Quick Silence Cut useful with no Worker,
while routing Full Scan, heavy media fallback, and final render through Feature
186 jobs.

The implementation is intentionally staged. Each stage leaves the existing
legacy path usable and keeps a compatibility alias until the new path has
passed its focused tests and reconciliation window.

## 2. Invariants and decisions

1. `worker_jobs.id` remains the only canonical heavy-work identity.
2. `CameraMotionPlan` and `CompositionPlan` from `@smartspec/shared` remain the
   only planner outputs consumed by preview and render.
3. Five-point face evidence is normalized before planning and is source,
   revision, trim, aspect, policy, and capability bound.
4. Activity evidence must reference the same face track or an explicit manual
   target. Unassociated motion cannot move the camera.
5. Silence cuts are represented as a source-time cut map plus an edited-time
   prefix map. The map is consumed by playback, seek, overlays, and render.
6. The render job receives a saved project revision. Transient browser state is
   never treated as canonical render input.
7. `feature-186-v1` is the transport/control-plane envelope version and
   `feature-191.v1` is the nested composition payload version. The adapter
   validates both explicitly.
8. `workerHandoff` is an operation-routing signal, not a prerequisite for
   browser editing or local analysis.

## 3. Shared contract work (Wave 0)

### 3.1 Five-point and activity evidence

Extend `packages/shared/src/video-editor/cameraMotion.ts` with the versioned
evidence fields required by the spec. Keep existing legacy plan versions
readable. Add types for point confidence/visibility, normalized face ROI, face
track ID, roll, and activity association. The activity type must carry source
time, target track ID/kind, confidence, visibility, freshness, and
`associatedFaceTrackId`.

Update the planner input and plan evidence projection so the five-point face
ROI is the protected region for both `face_focus` and `face_activity`. Preserve
the existing safe-margin, hysteresis, velocity, and fallback behavior. Add
validation errors for malformed point ranges, missing face track IDs, stale
activity evidence, and activity associations that do not reference a valid
face track. Legacy bbox-only plans remain readable but are marked degraded.

Add pure helpers (signatures only in the plan) for normalizing five points,
deriving a face ROI, validating activity association, and evaluating the
source-time plan. They must be deterministic and independent of React, DOM,
FFmpeg, or Worker APIs.

The detector adapter reuses the Worker App's already-approved
`@mediapipe/tasks-vision` `^1.0.1` runtime and the immutable
`blaze_face_full_range.tflite` plus WASM assets. The Web package may declare
that same dependency because it is required for parity; it must not introduce
a second face model. Native detector keypoints are mapped to the Feature 193
five-point contract and model/runtime/asset fingerprints are persisted in
provenance.

### 3.2 Source/edit time cut map

Create a shared utility under `packages/shared/src/video-editor/` for a sorted,
non-overlapping half-open cut map. It must expose types and pure operations to:

- validate and normalize silence ranges;
- build source-to-edited and edited-to-source prefix maps;
- map a playhead and clip-local timestamp in either direction;
- fingerprint the map with source/revision/audio-stream/detection settings; and
- reject a map when the source duration or audio stream changed.

The utility must preserve the existing `SilentRegion`/dialog shape through an
adapter. It must not decide which ranges the user selects; it only represents
the accepted non-destructive edit.

### 3.3 Media operation and job contract

Add `media.composition_scan` to
`packages/shared/src/video-editor/mediaExecutionContract.ts`, its analysis kind
and claim capability rules, and the operation allowlist validation. Map it in
`apps/web/server/services/editorMediaJobContract.ts` only as a compatibility
operation alias; the authoritative Full Scan helper continues to create
`video.composition_scan` with the existing Feature 191 nested contract, while
the outer Feature 186 row always validates `feature-186-v1`. The existing
helper's payload version must be corrected so the executor cannot receive a
nested version where an outer version is expected. There must be one
idempotency tuple and one promotion path.

Add an explicit adapter mapping document/type that carries the outer
Feature 186 transport version and nested `feature-191.v1` payload. The
composition executor registry must reject unsupported combinations before
claim and tests must cover both versions.

Do not change existing `media.reframe` callers in the same commit without a
compatibility alias. New Web code uses `media.composition_scan`; the alias
routes to the same evidence/promotion path.

## 4. Browser analysis runtime (Wave 0–1)

Create a browser-only analysis port under
`apps/web/client/src/services/` with implementations selected by capability
probe. The port returns a bounded capability profile and chunked evidence; it
does not persist jobs, call provider APIs, or own the planner.

The implementation should load the approved face/hand runtime lazily and run
sampling in a dedicated Web Worker where supported. The audio detector should
use `AudioWorklet` or a Worker-backed decoder when available, with a bounded
main-thread fallback only for small media. The face runtime is the existing
MediaPipe dependency above; the audio runtime remains browser native and
model-free. Model/runtime choice must be recorded in the capability
fingerprint.

The adapter must support cancellation, source revision invalidation, bounded
decoded-pixel/duration/memory/time budgets, and a truthful degraded result.
Temporary frames and audio buffers are released on cancellation or source
change.

## 5. Smart Camera Web experience (Wave 1–2)

### 5.1 Types and state

Extend `apps/web/client/src/types/videoEditor.ts` so `SmartCameraSettings`
supports explicit `face_focus` and `face_activity` while accepting legacy
aliases. Add analysis provenance/status, source/revision/mark/policy/capability
fingerprints, plan reference/hash, last analysis job ID, warnings, and stale
reason. Keep serialization backward compatible with existing projects.

### 5.2 Panel and editor orchestration

Update `SmartCameraPanel.tsx` to show the explicit modes and compatibility
labels, local-ready/degraded/Worker-running/stale states, the five-point ready
indicator, and an optional Full Scan action. Keep manual keyframe and mark
actions available in every mode. Copy must explain that local Quick analysis is
available and that Full Scan is optional.

Update `VideoEditorPhase3.tsx` so:

- mode changes normalize aliases and invalidate only incompatible evidence;
- a local Quick request starts through the browser analysis port and updates
  the provisional plan without requiring `workerHandoff`;
- a Full Scan request submits the canonical composition job with a stable
  source/revision/mark/policy/capability dedupe tuple;
- a completed Worker result is promoted only through fingerprinted revision
  fencing; and
- the player receives one shared plan evaluator instead of recomputing a crop
  from live UI state.

Add a small capability/analysis status component rather than duplicating status
logic inside the panel. It must expose accessible text and test IDs for the
state matrix.

## 6. Playback and plan application (Wave 1–2)

Identify the current Web player transform path in `VideoEditorPhase3.tsx` and
its child player components. Replace any mode-specific live face-centering
shortcut with a source-time plan evaluator from the shared package. The player
must map edited time to source time through the shared cut map before evaluating
camera keyframes.

Implement bounded detector-gap behavior: hold the last valid plan for the
configured interval, then widen/safe-fallback, and expose a status. Activity
targets may move the crop away from the face only after freshness, association,
hysteresis, and safe-margin checks pass.

Add deterministic seek/play tests that compare the same timestamp evaluation
used by render. Avoid introducing a CSS-only crop path that is absent from the
saved plan.

## 7. Quick Silence Cut (Wave 3)

Keep `SilenceDetectionDialog.tsx` as the review UI. Introduce a local analysis
adapter behind its existing `detectDeadAir` call site. Local analysis should
produce the existing regions plus the shared cut-map fingerprint; it should not
automatically mutate the timeline before the user reviews selections.

When local capability/budgets fail, use the existing queue operation path for
`media.silence_detect`. The panel copy and action should distinguish local
Quick Cut from explicit Worker analysis. Do not block playback or other editing
while the Worker job is queued.

When the user applies cuts, persist the cut map with the project revision and
make all timeline consumers use the edited-time prefix map. Update subtitle,
overlay, marker, camera-plan, and audio/video track time lookups together. A
render request must auto-save/promote a dirty cut map or show a save-required
state; it cannot send an in-memory map as canonical input.

Preserve manual regions, softening/padding settings, selected/skipped state,
and existing skip-silence preview behavior. Add a compatibility adapter for the
current `MediaJobClient.detectDeadAir` result shape.

## 8. Worker analysis and render routing (Wave 4–5)

### 8.1 Composition scan

Extend the Web server operation contract and router so a composition scan can
be submitted through Feature 186 without requiring the desktop Worker feature
flag when an approved hosted/PostgreSQL-pull executor is available. Keep
server-derived tenant, actor, asset ownership, revision, and capability
policy. Use the existing `enqueueCompositionScanJob`/executor for the canonical
`video.composition_scan` path, adding the Web-specific envelope fields and
stage evidence required by Feature 193.

The executor stages must be observable and checkpointed:
`probe → sample → face_5point → track → activity_associate → plan → ready`.
Promotion updates a project revision only if all fingerprints and expected
revision guards still match. A stale result remains an artifact/diagnostic and
cannot mutate a newer revision.

### 8.2 Heavy silence/proxy fallback

Reuse `editorMediaJobs` and `MediaJobEnvelope` for `media.silence_detect`,
`media.waveform`, `media.probe`, and `media.proxy`. Add any missing operation
mapping and capability policy without duplicating result storage. Worker results
must be managed-asset/artifact references and source-time bound.

### 8.3 Canonical render

Refactor the Web export path in `VideoEditorPhase3.tsx`,
`VideoEditorRenderService`, and related client/server adapters so the canonical
submission is `video.render`. Preserve `render_mp4_h264` only as a shim that
builds the same envelope. The envelope includes the saved project revision,
managed assets, camera plan/evidence reference, activity associations, cut map,
source/revision fingerprints, output profile, and idempotency key.

Routing is server-owned: connected Worker App, approved hosted/worker-pull
executor, or durable Worker-required/unavailable state. The browser never
encodes a heavy final video or reports success before canonical artifact
settlement. Browser closure must not cancel a queued render.

## 9. Persistence and API boundaries

Use existing project revision/save routes and Feature 186 job/status routes.
Add only the smallest tRPC/service procedures required to:

- report browser capability and local analysis provenance;
- submit composition scan/fallback jobs with server-derived scope;
- fetch a bounded analysis artifact/status; and
- promote a result with expected revision/fingerprint guards.

The router surface is explicit: `editorMediaJobs.submit` remains the generic
managed-asset path, `submitCompositionScan` delegates to
`enqueueCompositionScanJob`, and `getAnalysisStatus`/
`promoteCompositionScan` expose bounded status/evidence with expected revision
and fingerprint guards. Desktop-worker availability may affect heavy render
execution, but it must not gate browser-local analysis or editing.

Every mutating request uses the existing auth, tenant, CSRF/rate-limit, and
action idempotency boundaries. No client-supplied adapter, tenant, billing, or
executor field is trusted. The API returns canonical status, compatibility
status, provenance, stale state, and transport observation separately.

## 10. UI/UX contract

### Target user and job-to-be-done

Creators edit short vertical videos from a browser, often without a Worker
machine. They need to keep a face and the important hand-held activity visible,
remove dead air, preview the result, and submit a heavy render only when an
approved executor is available.

### Route and surface inventory

- Web Video Editor route and `VideoEditorPhase3` orchestration.
- Smart Camera sidebar panel and player overlay/status badge.
- Existing Silence Detection panel/dialog and timeline cut map.
- Export dialog/status and Worker job progress/error surface.

### Component ownership

- Shared planner/cut map: `packages/shared/src/video-editor/`.
- Browser analysis/capability services: `apps/web/client/src/services/`.
- Smart Camera UI: `SmartCameraPanel.tsx` plus a small status component.
- Silence review: existing `SilenceDetectionDialog.tsx`.
- Editor orchestration: `VideoEditorPhase3.tsx`.
- Server submission/promotion: `editorMediaJobs` and composition scan service.

### State matrix

| State | Visible behavior | Primary action |
|---|---|---|
| No clip/source | Empty panel explains selection | Select clip/source |
| Browser ready | Local Quick controls enabled, provenance visible | Analyze locally / play |
| Browser degraded | Controls remain usable with limitation copy | Use degraded preview or Full Scan |
| Worker running | Progress and cancel/review state; editing remains available | View progress/cancel |
| Stale result | Existing plan remains until replacement; warning visible | Re-analyze/promote |
| Unsupported | Manual marks and editing remain enabled | Use manual mode or Worker |
| Render queued | Job ID/status visible; tab can close | View/cancel/retry per policy |
| Render blocked | Explicit Worker-required reason; project preserved | Connect/enable executor |
| Error/review | Bounded safe error and evidence reference | Retry, inspect, or manual fallback |

### Responsive and accessibility matrix

| Viewport | Requirement |
|---|---|
| Mobile/narrow | Controls stack; status and primary action remain visible without horizontal overflow |
| Tablet | Panel and player remain usable; timeline cut-map review remains keyboard reachable |
| Laptop/desktop | Full status details and progress available without hiding core controls |

All controls require labels, keyboard activation, visible focus, `aria-pressed`
or equivalent selected state, non-color-only status, and reduced-motion-safe
transitions. Long analysis and render progress must announce status changes to
screen readers without spamming. Thai copy is primary for existing editor
users; English fallback keys are required. Error copy must distinguish local
degraded, queued Worker, stale, unsupported, and save-required states.

### Visual and token direction

Preserve the existing editor visual language and CSS ownership. Use existing
editor tokens/classes rather than introducing a new design system or raw
provider branding. Status badges must have text plus icon/shape and maintain
contrast in the current dark editor.

### Browser evidence

The implementation plan requires focused Vitest component evidence and a
Playwright/browser fixture when available: no-Worker editing, mode selection,
five-point/activity status, seek/play parity, silence-cut review, render queued
state, keyboard/focus behavior, and responsive overflow.

## 11. Tests-first plan

Before implementation, add or outline tests for each contract section in
`claude-plan-tdd.md`. The implementer must use focused Vitest tests for shared
pure functions, browser adapters, panel/dialog state, server mapping, and job
promotion. Run Playwright only for the available editor fixture and do not run
the repository TypeScript check unless explicitly requested.

## 12. Rollout and rollback

Introduce feature flags for browser Face Focus, browser Face + Activity, local
Silence Cut, composition scan submission, and canonical render handoff. The
old producer is disabled for new work before the new side-effecting producer is
enabled. Rollback keeps canonical IDs/history and routes new heavy work back to
the previous compatibility shim; it does not delete plans, artifacts, or
events.
