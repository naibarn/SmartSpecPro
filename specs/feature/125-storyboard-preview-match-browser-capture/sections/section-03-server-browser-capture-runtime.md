# Section 03: Server Browser Capture Runtime

## Goal

Build the server-side Presentation-style browser capture runtime for Storyboard final composite output.

## Scope

- Add an internal render-only route for capture.
- Add readiness state compatible with worker polling.
- Add a dedicated server capture worker path.
- Reuse Presentation dynamic capture behavior where practical.
- Ensure the capture surface excludes all Storyboard Review UI chrome.

## UI/UX Contract

### Target User / JTBD

End user expects captured output to match Live preview. This section affects the captured pixels, not the visible Storyboard Review controls.

### Surface Inventory

- Internal render-only capture page.
- Captured final composition surface.

### Component Map

- Composition runtime root renders source video, overlays, subtitles, transitions, and text motion.
- Readiness sentinel exposes capture readiness to worker.
- No editor/review controls are rendered.

### State Matrix

- pending: route is loading assets/fonts/media.
- ready: route is safe for capture.
- degraded: route can capture but records degraded metadata.
- failed: route cannot capture and must fail the worker attempt.

### Responsive Matrix

The capture route uses fixed output dimensions, default 1080x1920. It is not responsive UI, but it must preserve safe areas and composition scaling exactly at the requested output size.

### Accessibility Acceptance

N/A for human navigation because this is an internal capture route. It must still use semantic text rendering and loaded fonts so captured subtitles are readable.

### Copy Contract

N/A for user-visible UI copy. Readiness errors must map to user-safe projection messages in Section 02.

### Browser Evidence Required

- Captured frame evidence proving no Storyboard Review controls or browser chrome appear.
- Sample frame evidence for subtitle timing and animation.

## Files To Review

- `python-backend/app/tasks/presentation_render.py`
- `apps/web/server/routes/slideRender.ts`
- `apps/web/server/services/presentationPlaybackExport.ts`
- capture job service from Section 02
- shared payload contract from Section 01

## Files To Change

- `apps/web/server/routes/storyboardFinalCapture.ts` or equivalent new route
- server route registration
- Python capture worker module or extension to Presentation worker
- worker progress/event integration
- route and worker tests

## Internal Route Contract

Route:

`GET /internal/storyboard-final-capture/:captureJobId`

Rules:

- require a short-lived internal capture token
- token is scoped to capture job id and attempt id
- load only staged capture payload and asset manifest for that attempt
- render only the final composition surface
- no toolbar, debug panels, Review controls, player controls, raw prompts, signed URLs, or browser chrome

Readiness:

- expose `window.__storyboardCaptureReady`
- expose `window.__storyboardCaptureState`
- include status, code, reason, composition hash, timeline hash, duration, fps, media readiness, font readiness, and degraded flags

## Worker Contract

The worker must:

- load or claim a queued capture job
- create one active attempt
- prepare a workspace
- stage signed media/font/audio manifests
- launch Chromium with fixed viewport and GPU disabled by default
- navigate to the internal route
- poll readiness
- record the playing composition
- trim to expected duration
- pass artifacts to FFmpeg encode/audio/verification in Section 04
- report progress and failures
- clean local workspace

Start with Playwright `record_video_dir` because the Presentation exporter already uses it. Keep the capture mechanism metadata so the job records whether output came from Playwright video recording or a lower-loss fallback.

## Failure Codes

Include at least:

- `route_token_invalid`
- `capture_payload_missing`
- `asset_manifest_invalid`
- `browser_launch_failed`
- `capture_ready_timeout`
- `capture_ready_failed`
- `media_preload_failed`
- `font_preload_failed`
- `browser_recording_unavailable`
- `capture_attempt_stale`
- `capture_cancelled`

## Test First

- Test route rejects missing, expired, or mismatched token.
- Test route loads only the matching capture job/attempt.
- Test route emits ready state for a valid fixture.
- Test route emits degraded state for font/media soft timeout.
- Test route does not render Storyboard Review UI controls.
- Test worker creates exactly one active attempt.
- Test worker reports ordered progress stages.
- Test worker maps readiness timeout to failure projection.
- Test worker cannot complete a stale/cancelled attempt.

## Acceptance Criteria

- Capture work runs outside Express/tRPC handlers.
- Browser route can be recorded at 1080x1920, 30fps target.
- Subtitle timing and animation are driven by the same payload semantics as Live preview.
- The captured video contains only the composition surface.
