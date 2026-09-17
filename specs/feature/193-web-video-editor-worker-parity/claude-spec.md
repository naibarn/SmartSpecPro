# Synthesized implementation specification — Feature 193

This document is the deep-plan synthesis of the authoritative feature spec,
repository research, and stakeholder decisions. The complete acceptance
contract remains in `spec.md`; this file highlights the implementation boundary
used by the plan.

## Product intent

The Web Video Editor must provide Worker-equivalent Smart Camera and silence
editing while remaining useful without a Worker machine. Browser execution is
the default for interactive, bounded work. Full Scan, unsupported/oversized
analysis, proxy/transcode, and final video render are durable Feature 186
worker jobs.

## Required user behavior

1. Face Focus uses a five-point face contract: left eye, right eye, nose tip,
   left mouth, and right mouth. The points, confidence, visibility, face ROI,
   roll, and stable track ID are shared evidence consumed by browser play and
   Worker render.
2. Face + Activity keeps the five-point face ROI protected while following a
   fresh activity target attached to the same face track. Missing/uncertain
   activity must degrade truthfully and must not pan to another person or empty
   background.
3. Quick Silence Cut works locally for media inside explicit browser budgets.
   Its reversible cut map is shared by playback, seek, overlays, camera-plan
   lookup, and final render. Worker silence detection is a fallback or explicit
   analysis request.
4. Playback evaluates the saved normalized plan at source time for play, pause,
   seek, reverse, loop, and dropped-frame recovery. Render evaluates the same
   plan and source-to-edited-time map.
5. Final render submits `video.render` through Feature 186. The current
   `render_mp4_h264` path remains only as a compatibility alias. Current
   `MediaJobClient.detectDeadAir` remains only as a compatibility adapter for
   `media.silence_detect`.

## Runtime boundaries

### Browser

- Lazy capability probe and bounded `BrowserVideoAnalysisAdapter`.
- Web Worker/AudioWorklet for local analysis where possible; no heavy encode on
  the React event loop.
- Local Quick plans are provisional, fingerprinted, and visibly labelled.
- Existing `SmartCameraPanel` and `SilenceDetectionDialog` remain the primary
  UI surfaces.

### Worker

- `media.composition_scan` operation maps to canonical job type
  `video.composition_scan` and Feature 191 shared composition contract.
- `media.silence_detect`, `media.waveform`, `media.probe`, and `media.proxy`
  are fallback/explicit heavy media operations.
- `video.render` receives a saved project revision, camera plan, five-point
  evidence reference, activity associations, cut map, and fingerprints.
- Transport contract version (`feature-186-v1`) and nested composition contract
  version (`feature-191.v1`) are validated separately.

## Persistence and safety

- No second jobs table. Use `worker_jobs`, events, outbox, managed artifacts,
  project revisions, and settlement markers.
- Plans/evidence are source/revision/trim/aspect/mark/policy/capability bound.
- Render requires a saved revision; transient browser state cannot be sent as
  canonical render input.
- Stale results, late callbacks, duplicate deliveries, worker loss, and lost
  publication responses are fenced/idempotent under Feature 186.
- No raw frames, secrets, unrestricted detector payloads, or expiring signed
  URLs in project JSON or lifecycle events.

## UI/UX contract

- Modes: `off`, `face_focus`, `face_activity`, `manual_keyframes`; legacy
  `auto_face`, `auto`, `auto_object` values migrate compatibly.
- State labels: `browser_ready`, `browser_degraded`, `worker_available`,
  `worker_running`, `stale`, `unsupported`, `worker_required_for_render`,
  `provisional_quick_plan`, `five_point_face_ready`, `activity_partial`, and
  `needs_review`.
- Missing Worker must not disable editing, playback, local analysis, or timeline
  review.
- Primary actions and errors must be keyboard-accessible, localized through the
  existing Web locale system, and explicit about whether work is local,
  queued, degraded, stale, or blocked.

## Delivery waves

1. Shared contracts, fingerprints, cut map, and browser capability seam.
2. Local Face Focus with five-point evidence and safe playback application.
3. Local Face + Activity with face-track association and bounded reacquisition.
4. Local Quick Silence Cut with shared source/edit time mapping.
5. Worker composition/silence fallbacks with checkpoint and promotion fencing.
6. Canonical Web render handoff and compatibility drain.
7. Canary, parity evidence, rollout, and legacy retirement.

## Required verification

- Shared planner/evidence/fingerprint tests.
- Browser detector-gap, five-point confidence, activity association,
  cut-map/playhead, and local-budget tests.
- UI tests for no-Worker editing and truthful capability state.
- Feature 186 job tests for version mapping, outbox, duplicate delivery,
  lease fencing, stale promotion, cancellation, and render settlement.
- Representative fixture comparison for browser play versus Worker render,
  face safety, activity retention, no empty multi-second framing, and exact
  silence range/audio-video parity.

