# TDD plan — Feature 193

Tests are written before each implementation section and follow the existing
Vitest conventions. These are test targets/stubs; the implementation phase
writes the concrete fixtures and assertions.

## Shared contract work

- Five-point normalization accepts all five named points, bounded coordinates,
  confidence, visibility, ROI, roll, and stable face track ID.
- Missing points lower confidence or produce degraded evidence; invented points
  are rejected.
- Activity evidence requires a matching face track or explicit manual target.
- Legacy bbox-only plans remain readable and report degraded provenance.
- Camera plan fingerprints change when source, revision, trim, aspect, marks,
  policy, capability, or contract changes.
- Cut-map normalization sorts/merges half-open ranges, rejects overlap or
  out-of-duration ranges, and maps source/edit times deterministically.
- Cut-map fingerprints reject source duration/audio-stream changes.
- `media.composition_scan` is accepted by shared media validation and receives
  the expected claim capability.

## Browser analysis runtime

- Capability probe reports supported face/activity/audio operations and a
  bounded fingerprint.
- Analysis cancellation releases pending work and ignores stale source
  revisions.
- Browser budget exhaustion returns a degraded/fallback result without
  blocking playback.
- Five-point evidence is normalized identically for browser Quick and Worker
  Full Scan fixtures.
- Silence adapter preserves threshold, minimum duration, padding, stream, and
  provenance fields.

## Smart Camera UI and orchestration

- Legacy modes load into the explicit mode mapping without changing authored
  keyframes or marks.
- Face Focus and Face + Activity controls are selectable without Worker
  handoff.
- Capability/status labels expose ready, degraded, stale, Worker-running, and
  review states with accessible selected controls.
- Local Quick analysis updates a provisional plan and remains cancellable.
- Full Scan submission is idempotent for the source/revision/mark/policy/
  capability tuple.
- Late or mismatched Worker promotion does not overwrite a newer revision.

## Playback and plan application

- Play, pause, seek, reverse, loop, and dropped-frame recovery evaluate the
  same source-time plan function.
- Five-point face ROI remains inside safe margins for valid plan samples.
- Activity movement occurs only for fresh evidence associated with the same
  face track.
- Detector gaps hold, widen, or safe-fallback within the configured interval;
  they never jump to an unrelated background crop.
- Edited playhead maps through the silence cut map before camera evaluation.

## Quick Silence Cut

- Dialog review works with local analysis and preserves existing region
  selection/skipped/manual behavior.
- Local analysis remains usable without a Worker for bounded media.
- Fallback queues `media.silence_detect` with a source/revision/stream-bound
  fingerprint and does not block unrelated editing.
- Applying cuts changes playback duration/time mapping for video and audio
  together, including overlays, subtitles, markers, and camera plans.
- Render refuses unsaved transient cut maps or commits an idempotent revision.

## Worker analysis and render routing

- Composition scan submission maps the outer Feature 186 version and nested
  Feature 191 version explicitly.
- Unsupported/mixed versions are rejected before claim.
- Composition scan emits `face_5point` and `activity_associate` stage evidence
  and cannot promote without required outcomes.
- Duplicate submission/delivery returns the same canonical job/artifact.
- Stale promotion, cancellation, lease loss, retry, and worker restart are
  fenced and idempotent.
- Heavy silence/proxy operations use managed assets and existing job routing.
- `render_mp4_h264` compatibility input produces the canonical `video.render`
  envelope.
- Render validates revision, camera plan, five-point evidence, activity
  association, cut-map fingerprint, and idempotency before encoding.
- Browser closure does not cancel a queued render; no false success is shown.

## UI/UX and accessibility

- Empty/no-clip, browser-ready, degraded, Worker-running, stale, unsupported,
  queued, blocked, and review/error states render correct text and actions.
- Thai labels and English fallback keys exist for all new states.
- Keyboard users can operate modes, analysis, silence review, and render actions;
  focus and selected states are visible.
- Status is not conveyed by color alone; reduced-motion behavior is respected.
- Narrow viewport does not hide the primary action or overflow the panel.

## Verification and rollout

- Feature flags preserve old behavior when disabled.
- Migration fixtures cover legacy Smart Camera values, old silence metadata,
  in-flight render IDs, and existing composition jobs.
- Browser/Worker parity fixture compares play/seek and final render for face
  safety, activity retention, no empty multi-second framing, and silence/audio
  timing.
- Focused changed-path tests pass before each rollout wave.

