# Feature 125 TDD Plan: Storyboard Preview-Match Browser Capture

## 1. Contracts And Hashes

- Test: quality enum accepts only `standard` and `high`.
- Test: render engine enum includes `preview_match_browser_capture` without removing `hyperframes_worker`.
- Test: `PreviewMatchCompositionPayload` requires structured `subtitleCues`.
- Test: preview composition hash changes when subtitle timing, overlay preset, source media timing, or text motion changes.
- Test: preview composition hash does not change for non-rendering UI-only state.

## 2. Storyboard Review UI

- Test: both `Render Final Composite` and `Capture Final Composite` are visible when final source video assignments are valid.
- Test: capture action is disabled when source assignments are incomplete.
- Test: capture action is blocked when expected preview/timeline hashes are stale.
- Test: quality selector defaults to `standard` and can select `high` only when enabled.
- Test: UI copy distinguishes HyperFrames render from preview-match capture.
- Test: active capture status shows capture-specific stages.
- Test: cancellation and retry states use user-safe Thai/English copy.

## 3. API Create/Get/Cancel

- Test: create rejects unauthenticated or wrong-tenant access.
- Test: create rejects invalid quality, invalid output dimensions, missing source videos, or stale hashes.
- Test: create returns an existing active job for duplicate idempotency key.
- Test: duplicate create does not reserve credits twice.
- Test: get returns the same projection shape after refresh.
- Test: cancel is idempotent and marks active attempt stale.
- Test: stale attempt completion is rejected after cancellation.

## 4. Persistence And Billing

- Test: queued capture job persists tenant/user/product/run/storyboard identity.
- Test: job stores engine id, quality, hashes, output requirements, and billing reservation id.
- Test: standard reservation applies the configured 0.75x multiplier.
- Test: high reservation applies the configured 1.0x multiplier.
- Test: queued cancellation releases reservation according to policy.
- Test: verification failure releases/refunds according to existing render failure policy.

## 5. Internal Render Route

- Test: route requires a valid short-lived internal token.
- Test: route rejects expired token or mismatched capture job id.
- Test: route renders only the composition surface, not Storyboard Review UI controls.
- Test: route exposes `window.__storyboardCaptureReady`.
- Test: route exposes `window.__storyboardCaptureState` with composition hash, timeline hash, duration, and fps.
- Test: missing media/font readiness reports degraded or failed state using the failure-code vocabulary.
- Test: subtitles are visible only inside active cue windows.

## 6. Capture Worker

- Test: worker loads a queued job and creates one active attempt.
- Test: worker sends progress stages in order for prepare, browser ready, capture, encode, verify, publish.
- Test: Playwright context uses fixed viewport and record size.
- Test: readiness timeout maps to a transient or permanent failure code.
- Test: high quality falls back or blocks when text-sharpness fixture fails.
- Test: local workspace is cleaned after success and failure.
- Test: stale/cancelled attempts cannot upload final artifacts.

## 7. FFmpeg, Audio, And Verification

- Test: standard preset maps to expected final encode settings.
- Test: high preset maps to expected final encode settings or lower-loss capture branch.
- Test: FFprobe validation rejects wrong duration, fps, resolution, missing audio when required, and undersized files.
- Test: native source audio and approved audio events are mixed by FFmpeg, not trusted from browser audio recording.
- Test: verification rejects mismatched composition hash, timeline hash, quality, engine id, or attempt id.
- Test: sampled frame comparison fails when subtitles appear all at once.
- Test: Thai subtitle fixture passes when cue timing matches preview.

## 8. Media Library And Evidence

- Test: Library publish occurs only after verification passes.
- Test: failed verification does not create a Library item.
- Test: output refs include engine id, quality, composition hash, timeline hash, and verification report id.
- Test: evidence artifacts redact signed URLs, route tokens, cookies, local paths, bearer tokens, and raw storage keys.
- Test: support evidence access requires operator/support authorization.

## 9. Feature Flags And Operations

- Test: capture action is hidden or disabled when capture flag is off.
- Test: high quality is unavailable when high flag is off.
- Test: server worker disabled returns a clear blocker without affecting existing HyperFrames render.
- Test: concurrency caps prevent more than configured active captures.
- Test: queue timeout and attempt timeout produce user-safe failure projection.

## 10. Future Paths

- Test: client capture flag does not publish directly to Library in MVP.
- Test: Worker App-compatible contract can serialize/deserialize the capture payload without signed URL persistence.
- Test: current server MVP remains the default when experimental client/worker-app flags are off.
