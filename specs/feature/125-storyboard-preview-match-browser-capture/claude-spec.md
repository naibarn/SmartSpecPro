# Feature 125 Synthesized Spec: Storyboard Preview-Match Browser Capture

## Summary

Add a new Storyboard Review final composite action named `Capture Final Composite` (`Capture ตาม Preview`) that records the same browser composition runtime users see in Live preview. The output must preserve animation, transitions, subtitle timing, text layout, safe areas, fonts, source video playback, and audio alignment closely enough that users can trust the preview as the final output.

The existing `Render Final Composite` action remains available as the deterministic HyperFrames/worker render path. This feature adds a sibling preview-match capture path and does not remove, rename, or silently reroute the old action.

## Core Requirements

- Add a Storyboard Review CTA next to the current final render action.
- Add quality presets: `standard` and `high`.
- Use a shared final composition payload for Live preview and capture.
- Preserve structured `subtitleCues` across UI, API, queue, internal route, worker, verification, and artifact metadata.
- Run MVP capture in a dedicated server worker process that uses a Presentation-style browser capture path.
- Keep client/browser capture as a future experimental path unless it can be server-verified.
- Capture the render-only final composition surface, not the editor/review UI.
- Use FFmpeg for trim, encode, audio mix, probe, metadata, and final MP4 production.
- Publish to Media Library only after server verification passes.
- Store capture metadata and sanitized evidence for support and QA.

## User Experience

Storyboard Review should show two distinct final output actions:

- `Render Final Composite`: existing HyperFrames/worker render path.
- `Capture Final Composite`: new preview-match browser capture path.

The capture action should show:

- quality selector: `standard` and `high`
- disabled state when final source video assignments are incomplete
- stale state when preview/capture hashes no longer match current render-facing inputs
- progress state with capture-specific stages
- completed state with output and Media Library publish status
- failure state with user-safe reason, retry guidance, and support evidence id when available

## Architecture

The MVP architecture has five layers:

1. Shared composition contract in TypeScript.
2. Storyboard Review UI and API mutations.
3. Durable capture job persistence, billing reservation, status projection, and cancellation.
4. Internal render-only route consumed by Playwright/Chromium.
5. Dedicated capture worker using browser recording plus FFmpeg verification/publish.

The server web process validates, persists, enqueues, signs manifests, and projects status. It does not run long browser captures inline inside request handlers.

## Capture Runtime

The internal capture route should expose:

- `window.__storyboardCaptureReady`
- `window.__storyboardCaptureState`

The route must:

- use a fixed viewport, default 1080x1920 at 30fps
- load tenant-scoped source videos from a staged asset manifest
- preload required fonts
- play the same timeline semantics as Live preview
- ensure reduced-motion settings do not disable final capture animation
- return readiness/degraded/failure state for the worker

## Quality Policy

`standard`:

- prioritize fast output
- allow Playwright recording if fixture gates pass
- target CRF 23 equivalent final MP4

`high`:

- prioritize text sharpness and subtitle readability
- target CRF 18 equivalent final MP4
- must fall back to lower-loss frame capture if Playwright WebM intermediate visibly degrades Thai text

Both qualities:

- must probe duration, fps, resolution, audio track, and codec
- must verify composition/timeline hashes
- must compare representative frames against preview evidence
- must block completed status when verification fails

## Security And Operations

- Internal route tokens are short-lived and scoped to one capture job/attempt.
- Signed asset URLs are regenerated per attempt and not persisted in user-visible metadata.
- Diagnostics and evidence are redacted by default.
- Operator/support artifact access requires authorization.
- Queue concurrency, timeouts, retries, cancellation, and stale attempt rejection must be explicit.
- Feature flags and kill switches must allow disabling capture without affecting existing HyperFrames render.

## Acceptance Criteria

- Users can choose `Capture Final Composite` beside the existing render action.
- Capture output visually matches Live preview for at least one Thai subtitle fixture with animations enabled.
- Subtitle lines appear only during their cue windows, not all at once.
- Capture does not include UI controls or browser chrome.
- Server verification gates Media Library publish.
- Duplicate clicks do not create duplicate active jobs or double credit reservations.
- Cancellation prevents stale attempt completion.
- High quality does not ship if Thai text has visible double-compression artifacts.
- Evidence artifacts are sanitized and access-controlled.
