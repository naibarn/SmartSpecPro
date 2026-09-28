# Feature 184 follow-up: Web Media Workspace parity and editor completion

## Goal

Complete the browser Video Editor so the `/video-editor` route is a credible Web
Media Workspace for the Worker App's editing capabilities. The browser owns
interactive authoring, preview, timeline state, validation, and review. Heavy,
long-running, GPU-dependent, or privacy-sensitive media work is represented as a
versioned `worker_jobs` job and executed by an eligible Worker. The current
Phase 3 editor, canonical NLE envelope, tenant boundaries, and legacy project
readability remain the starting point.

## Current problem

The new route now exposes the richer Phase 3 editor, but the Bin cannot upload
files, it does not open on the Bin tab by default, and several controls visible in
the Worker App are either incomplete, browser-only placeholders, or do not yet
have a matching Worker execution contract. The implementation must close these
gaps without silently claiming parity when an executor or deployment gate is
unproven.

## Requirements

1. **Project Bin and R2 ingest**: Bin is the default sidebar tab. It accepts one
   file or multiple files from an accessible browser file picker, uploads to
   managed storage/R2, shows per-file and aggregate progress, supports retry and
   cancellation, preserves partial success, and adds ready assets to the project
   pool. Small files may use a single PUT; large files use resumable multipart
   upload with bounded concurrency and abort/expiry cleanup. Local absolute paths
   are never sent to the browser API or Worker envelope.
2. **Keyframes and Transform**: verify and finish keyframe authoring, pinning at
   the playhead, interpolation, deletion, duplicate-time replacement, undo/redo,
   and persistence. Clearly separate Transform (the current static or evaluated
   position/scale/rotation/opacity at a time) from Keyframes (the time-varying
   control points that produce Transform). Zoom and pan must work for video and
   still-image clips, including manual focus and safe bounds.
3. **Quick Silence Cut**: port the Worker App's review-first silence/dead-air
   workflow to the web: configure threshold/minimum duration/padding, request
   analysis, render waveform/segments, preview proposed cuts, selectively approve,
   apply an edit map, undo, and send heavy analysis/render work to Worker.
4. **Extract audio**: verify that extracting audio from a video creates a
   managed audio asset and a correctly aligned audio track/clip, keeps source
   linkage, handles missing audio streams, and does not mutate the source video.
5. **AI music**: port the Worker App AI music entry point to a browser panel with
   prompt/duration/tempo/mood controls, explicit credit estimate and consent,
   async job status, cancellation/retry, generated-asset import, and timeline
   placement. Provider calls remain server/Worker jobs; no provider call occurs
   during tests.
6. **Blur/privacy bar with tracking**: provide rectangle/ellipse/face/object blur
   regions, feather/strength/tint controls, keyframed regions, and a Worker
   analysis option that tracks an approved face/object. Preview must show the
   region and render must fail closed when a required privacy analysis is missing.
7. **Voice recording**: record from any browser-visible microphone through
   `getUserMedia`/`MediaRecorder`, enumerate/select devices, show permission and
   device errors, meter input, pause/resume/retake, upload the recording to
   managed storage, and place a synchronized audio clip. Browser recording is
   explicitly opt-in and never exposes raw device paths.
8. **Speaker analysis and edit planning**: expose source selection, analysis
   stages, speaker review/mapping, and an editable cut/subtitle plan. Results are
   versioned artifacts requiring review and expected revision before applying.
9. **Render modes**: support Auto mode selection, Manual Remotion/FFmpeg
   selection, and GPU render when an eligible Worker advertises the capability.
   Show preflight, resource/credit estimate, queue state, progress, retry/cancel,
   and clear fallback when a mode/capability is unavailable.
10. **MP3 export**: export the approved timeline audio as MP3 with bitrate and
    sample-rate presets, metadata-safe filename, Worker execution for long jobs,
    and a durable downloadable artifact.
11. **Subtitles**: port subtitle creation/import/export, timing/style editing,
    speaker association, review state, and render inclusion. Generated subtitles
    must be distinguishable from user-approved text.
12. **Preview modes**: support fit/frame preview, camera/frame guide overlays,
    safe-area/grid guides, and a render-faithful preview mode with an explicit
    performance/quality indicator. Guides must not leak into final output.
13. **Save current frame**: save the current evaluated frame as a PNG/JPEG from
    the browser when safe and supported, otherwise queue a Worker capture job;
    preserve color/size settings and return a managed image asset.
14. **Detailed rulers**: add adaptive time/frame rulers, minor ticks, frame
    numbers at high zoom, snap indicators, playhead labels, and horizontal/vertical
    scroll synchronization without degrading large timelines.
15. **Ducking and waveform presets**: verify sidechain ducking against selected
    voice/music tracks, add preset curves and manual attack/release/amount, show
    normalized waveforms and clip gain envelopes, and keep mute/lock semantics.
16. **Symbols/SVG stock**: add a searchable stock SVG symbol panel with line,
    outline, and utility categories, preview, color/stroke controls, licensing
    metadata, safe SVG sanitization, and timeline/overlay insertion.
17. **AI CSS/React/Three.js overlays**: provide a skill-first AI creation flow
    that generates a constrained overlay manifest, previews it in an isolated
    sandbox, supports editable code/props, rejects unsafe APIs/imports, and only
    sends an approved deterministic artifact to Worker/Remotion rendering.
18. **Transform/Keyframe UX contract**: label Transform and Keyframes as
    separate concepts throughout toolbar, inspector, preview and docs. Provide
    direct drag/pan/zoom controls for video and image clips, numeric fields,
    reset/fit actions, keyframe pin/delete controls, and accessible keyboard
    focus/announcements.

## Constraints and safety

- Preserve existing Phase 3 editing functions and legacy project readability.
- Keep all media references tenant-owned managed asset IDs in persisted projects
  and Worker jobs; do not persist local absolute paths.
- Use the existing `worker_jobs`/Worker Jobs naming and protocol. `/render-jobs`
  remains a compatibility redirect only.
- No typecheck is required for this planning/implementation wave because the
  user requested avoiding its memory pressure; use focused tests, syntax/bundle
  checks, and production build instead.
- Do not consume paid provider credits or edit production records in tests.
- Browser and production deployment proof are separate gates from local source
  proof. A UI control is not marked complete until its contract, failure state,
  and execution capability are explicit.

## Desired outcome

An authenticated creator can import media into Bin, author and review a
multi-track edit in the browser, use the complete toolbar/panel set, preview
keyframed transforms and privacy regions, record or generate audio, create and
review subtitles, choose a render/export mode, and submit a durable job. Worker
Jobs displays progress and immutable revision results. Unsupported capabilities
remain visible with a safe fallback and an actionable reason.
