# Feature 125 Implementation Plan: Storyboard Preview-Match Browser Capture

## 1. Objective

Build a new Storyboard Review final output path named `Capture Final Composite` that records the same browser composition runtime users see in Live preview. The path must be faster and more preview-faithful than the current frame-oriented HyperFrames render path, while preserving server verification, billing, storage, audit, tenant isolation, and Media Library publish rules.

The existing `Render Final Composite` action remains available and unchanged as the HyperFrames/worker render path.

## 2. Architecture Overview

The implementation is additive and uses these components:

- shared TypeScript contract: `PreviewMatchCompositionPayload`, hashes, quality enum, job projection, failure codes
- Storyboard Review UI: capture CTA, quality selector, stale/disabled/progress/failure/completed states
- server API: create/get/cancel capture job procedures
- persistence: durable capture job state, attempt state, billing reservation metadata, evidence refs, output refs
- internal render route: `/internal/storyboard-final-capture/:captureJobId`
- capture worker: Playwright/Chromium browser recording, readiness polling, FFmpeg encode/audio/probe, verification, storage upload
- Media Library bridge: publish only after server verification
- feature flags and operations: enablement, kill switch, concurrency caps, retention, redaction

## 3. Naming And Contracts

Use these names consistently:

- user-facing button: `Capture Final Composite`
- Thai label: `Capture ตาม Preview`
- internal engine id: `preview_match_browser_capture`
- quality enum: `standard | high`
- queue name: `storyboard_capture`
- task name: `storyboard_capture.render_preview_match_final_composite`

Add a shared contract module near existing shared worker/storyboard contracts. If `apps/web/shared/workerRuntime.ts` becomes too large, create `apps/web/shared/storyboardPreviewMatchCapture.ts` and re-export where needed.

The shared payload must include:

- tenant/product/run/storyboard identity
- revision id and composition/timeline hashes
- output width, height, fps, duration
- shot list with source video refs, source media start, shot start/end, duration
- overlay, animation, transition, text motion, safe-zone, font, and subtitle settings
- structured `subtitleCues`
- audio event refs and native audio policy

`subtitleText` is allowed only as display metadata. It must not replace `subtitleCues` at any render boundary.

## 4. UI/UX Contract

Target user: a Storyboard Review user who has confirmed source videos and wants a final MP4 that matches preview.

Surface inventory:

- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- final composite controls panel
- Live preview surface
- final output status/projection area

Component map:

- capture quality control: small selector beside final actions
- `Render Final Composite` button: existing path
- `Capture Final Composite` button: new path
- capture status panel: queued, preparing, capturing, encoding, verifying, publishing, completed, cancelled, failed
- evidence/support details: collapsed by default, user-safe copy only

State matrix:

- disabled: missing product/run, missing final source video assignments, stale preview hash, feature flag off, quota blocked
- loading: create mutation pending
- active: queued/preparing/capturing/encoding/verifying/publishing
- success: verified output ready or saved to Library
- error: transient/permanent failure with retry guidance
- cancelled: idempotent cancelled state with stale-attempt protection
- hover/focus: both final action buttons expose clear labels and keyboard focus

Responsive matrix:

- mobile: actions stack, quality selector remains visible above buttons
- tablet/laptop: actions can sit beside each other with concise helper copy
- desktop: preserve existing panel density; do not add large marketing-style blocks

Accessibility:

- keyboard activation for both actions
- clear `aria-label` for capture quality and action buttons
- focus states on buttons, selector, cancel/retry
- status updates should be announced through existing live region/toast pattern if available
- reduced-motion browser setting must not disable final captured animation; UI animation may still respect reduced motion

Copy contract:

- Thai primary helper: `บันทึกจาก preview runtime เพื่อให้ animation และ subtitle เหมือนที่เห็น`
- Standard: `เร็วกว่า เหมาะกับ social video`
- High: `คมกว่า เหมาะกับตัวอักษรเยอะหรือเก็บงาน final`
- Avoid claiming completion until verification and Library publish state are known.

Browser evidence:

- capture desktop and mobile screenshots of the controls
- capture before/after state for active and failed jobs
- verify no UI controls overlap the video preview or captured surface

## 5. API And Job Lifecycle

Add sibling procedures to the existing final composite render flow:

- create preview-match capture job
- get capture job projection
- cancel capture job

The create procedure validates:

- authenticated tenant/user access
- product/run/storyboard identity
- final source video assignments
- feature flag and quota
- expected preview composition hash
- expected timeline hash
- quality value
- output dimensions/fps allowlist

The create procedure returns a projection immediately after queueing. Duplicate submissions within the configured idempotency window return the existing active job and must not reserve credits twice.

Status flow:

`queued -> preparing_assets -> browser_ready -> capturing -> encoding -> verifying -> publishing -> completed`

Terminal statuses:

`completed`, `saved_to_library`, `cancelled`, `failed_transient`, `failed_permanent`, `verification_failed`, `compliance_blocked`

Cancellation marks the active attempt stale. Stale attempts cannot upload artifacts or complete the job.

## 6. Persistence And Billing

Choose persistence in implementation after inspecting current migration patterns:

- preferred for server MVP: narrow `storyboard_capture_jobs` plus `storyboard_capture_attempts` when Python/server capture is not claimed through desktop worker APIs
- acceptable alternative: `worker_jobs` job type if it cleanly supports server-side capture workers without pretending a desktop worker claimed the job

Required persisted fields:

- tenant id, user id, product id, run id, storyboard review id
- quality, engine id, requested output, duration/fps
- idempotency key
- composition hash, timeline hash, final config hash
- status, progress, stage, failure code, safe message
- attempt id and stale/cancelled marker
- billing reservation id and reconciliation status
- output artifact refs and sanitized evidence refs
- created/updated/completed timestamps

Billing:

- reserve credits before queueing
- `standard` starts at 0.75x existing final composite estimate
- `high` starts at 1.0x existing final composite estimate
- capture only after verified publish
- release/refund on queued cancellation and verification/runtime failures according to existing render policy
- duplicate-submit reuse must not create another reservation

## 7. Internal Render Route

Add a render-only route:

`GET /internal/storyboard-final-capture/:captureJobId`

Route rules:

- requires a short-lived internal capture token
- loads only the capture job/attempt associated with the token
- renders only the final composition surface
- excludes Storyboard Review UI, player controls, toolbar, debug panels, raw prompts, tokens, and browser chrome
- exposes `window.__storyboardCaptureReady` and `window.__storyboardCaptureState`
- preloads fonts and media
- reports degraded readiness when non-fatal media/font waits exceed soft thresholds
- reports failed readiness for structural failures

The route should reuse the same preview composition renderer or byte-equivalent projection used by Live preview. If the current preview renderer is embedded inside `StoryboardReviewPage.tsx`, extract pure payload/render helpers before adding the route.

## 8. Capture Worker

Run capture outside Express/tRPC request handlers.

Preferred implementation order:

1. Extend the Python Presentation export worker only if the Storyboard capture manifest can be consumed without coupling to presentation deck tables.
2. Otherwise add a dedicated `storyboard_capture` worker with the same operational shape: Playwright/Chromium, readiness polling, FFmpeg/FFprobe, storage upload, progress events, retries, cleanup.

Worker responsibilities:

- claim or load a queued capture job
- create one active attempt
- generate short-lived internal route token and asset manifest
- launch Chromium at fixed viewport with GPU disabled by default
- wait for readiness state
- record the playing composition
- trim to expected duration
- encode MP4 with selected quality
- mix native source audio and approved audio events via FFmpeg
- probe output
- upload output and evidence artifacts
- report progress and terminal status
- clean local workspace

Playwright `record_video_dir` is the first candidate. For `high`, if Thai text sharpness fails the fixture gate, use lower-loss CDP/screencast frame capture piped to FFmpeg.

## 9. Verification And Media Library Publish

Verification gates:

- output exists and meets minimum size
- container/codec/fps/resolution/duration match requested output
- audio track policy is satisfied
- composition hash, timeline hash, engine id, attempt id, and quality match job input
- representative frame comparison against preview evidence passes
- Thai subtitle timing fixture passes
- evidence is redacted

Suggested parity thresholds:

- SSIM >= 0.96 on sampled frames
- pixel diff <= 3% outside expected video compression variance
- text-region blocking failure when subtitle text is missing, duplicated, all-at-once, or visibly unreadable

Only after verification passes:

- publish output to Media Library
- reconcile credits
- mark job completed/saved
- expose user-safe final projection

## 10. Feature Flags, Rollout, And Operations

Add flags:

- `STORYBOARD_PREVIEW_MATCH_CAPTURE_ENABLED`
- `STORYBOARD_PREVIEW_MATCH_CAPTURE_HIGH_ENABLED`
- `STORYBOARD_PREVIEW_MATCH_CAPTURE_SERVER_WORKER_ENABLED`
- `STORYBOARD_CLIENT_CAPTURE_EXPERIMENT_ENABLED`

Operational controls:

- per-tenant and global concurrency
- max duration
- max retries
- queue timeout
- attempt timeout
- cleanup TTL
- evidence retention TTL
- kill switch that hides/disables capture without affecting Render Final Composite

Rollout:

1. development fixtures
2. internal tenant only
3. limited beta with standard quality
4. high quality after text sharpness evidence
5. worker-app migration after server MVP proves parity

## 11. Client Capture Future

Do not use client MediaRecorder as trusted final output in MVP.

Future client capture can be added behind `STORYBOARD_CLIENT_CAPTURE_EXPERIMENT_ENABLED` for local draft/download first. It may graduate only after:

- output upload is resumable
- server verification can reject bad output
- codec support matrix is understood
- tab sleep/background throttling is handled
- CORS and signed asset access are scoped safely
- audio behavior is reliable or server-mixed after upload

## 12. Worker App Future

Design the capture payload and artifact contract so Smart AI Hub Worker App can later run the same preview-match capture engine locally.

Server remains source of truth for:

- queueing
- signed manifests
- permission checks
- verification
- storage
- billing
- final projection

Worker App may later take over:

- asset download
- browser capture
- local FFmpeg encode
- artifact upload

## 13. Implementation Sequence

1. Add shared contracts, hashes, status/failure vocabulary, quality enum, and fixture payload tests.
2. Extract Live preview payload builder from `StoryboardReviewPage.tsx` into shared client-safe helpers.
3. Add UI CTA, quality selector, and capture projection states.
4. Add create/get/cancel API procedures with feature-flag and permission checks.
5. Add durable capture job persistence and idempotency.
6. Add billing reservation/reconciliation hooks.
7. Add internal render route and readiness state.
8. Add capture worker runtime based on Presentation dynamic capture.
9. Add FFmpeg encode/audio/probe/verification pipeline.
10. Add Media Library publish bridge after verification.
11. Add evidence redaction and support access controls.
12. Add rollout flags, operator metrics, and runbook notes.
13. Add client capture and Worker App follow-up stubs only after MVP contracts stabilize.

## 14. Risks And Mitigations

- Preview/capture drift: shared payload builder and hash fixture tests.
- Subtitle all-at-once regression: structured cue tests and visual timing fixture.
- Text softness in high quality: lower-loss capture fallback before enabling high.
- Web server starvation: long capture work runs only in worker process.
- Duplicate charges: idempotency key and reservation reuse.
- Stale upload completion: attempt ids and cancellation stale markers.
- Token leakage: sanitized logs/evidence and scoped route tokens.
- Client capture inconsistency: keep experimental and server-verified only.
