# Web Video Editor / Worker App Parity Design

## Goal

Make Web Video Editor and Worker App use the same face/activity evidence, camera-motion plan, silence-cut map, and render handoff semantics.

## Current gaps found

- Web's queue helper sends `cameraMotionPlans` and `silenceCutMap`, but the main final-render submit path does not.
- The canonical Worker `editor_video_render` path currently renders the basic NLE timeline without consuming camera plans, playback rate, or render handoff metadata.
- Worker App already has validated camera-plan remapping and animated FFmpeg crop helpers; the canonical renderer does not reuse them.
- Browser Quick analysis returns clip-relative evidence, but its plan duration is derived from timeline duration instead of the source analysis window. This diverges when clip speed is not 1.
- Worker timeline playback has a local silence-range normalizer with a 50 ms merge tolerance, while the shared cut-map contract merges only overlapping ranges.

## Decisions

1. The shared camera-motion plan remains the canonical face/activity output. Face evidence is five-point evidence; activity evidence must remain associated with a known face track and freshness policy.
2. Quick analysis remains browser-local and Full Scan remains Worker-backed. Both produce the same plan shape and source-time contract.
3. `silenceCutMap` represents an already-approved ripple edit in the Web timeline. The render path validates and carries it as provenance; it must not apply the same ranges a second time. The actual timeline clips/source trims remain the render input of record.
4. The direct Web final-render envelope must carry the same options as the existing queue helper: camera plans, silence map, and handoff fingerprints.
5. Canonical Worker render consumes the camera plan per canonical clip, including source-time remapping for each trimmed clip, and applies playback rate to video/audio duration.
6. Invalid or stale plans fail closed with an actionable contract error. A missing plan is allowed and keeps the normal center/canvas render path.

## Scope

- Add one pure Web render-handoff builder used by both queue and final-render paths.
- Preserve camera plans and silence-map provenance in the canonical project/options payload.
- Make the Rust canonical renderer consume camera plans, playback rate, and the validated handoff metadata.
- Align Worker playback silence normalization with the shared range contract while preserving manual-range gating.
- Add focused tests for payload parity, speed-aware Quick plan duration, Rust camera-plan/cut-map validation, and render time remapping.

## Non-goals

- No database migration or new job type.
- No replacement of the existing browser detector or Worker Full Scan model.
- No automatic re-application of a silence map to a timeline that has already been ripple-edited.
- No broad rewrite of unsupported overlay/effect rendering in the canonical Worker renderer.

## Failure and rollout policy

- Stale Smart Camera plans remain blocked from final render until Quick or Full Scan runs again.
- Unsupported/invalid plan versions fail before FFmpeg starts.
- If a project has no camera plan, canonical render keeps the existing center/canvas behavior.
- Existing native Worker App local-media render behavior remains unchanged; only the canonical Web editor render handoff is extended.
- Browser and real Windows Worker render proof remain explicit validation gates after code tests.
