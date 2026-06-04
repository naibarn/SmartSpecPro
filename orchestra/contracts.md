# Orchestra Contracts

## Backend Runtime Contract

- `startAutoStoryboardReview` starts/resumes the existing Marketplace Auto Review path using backend defaults.
- HyperFrames preview is queued only when feature access is enabled, worker/dependency policy allows queueing, and the run has storyboard/evidence state eligible for composition.
- Disabled or ineligible states return sanitized projections and do not create false-completed render jobs.

## Render Worker Contract

- With runtime packages deferred, the worker must never mark a HyperFrames job `completed`.
- If the worker flag is accidentally enabled before runtime readiness, it must leave queued jobs safe or mark them `failed_transient`/diagnostic-deferred without fabricating artifacts.
- Completed/saved states require output refs produced by a real render/runtime path or explicit test fixture injection.

## Library Finalize Contract

- `saveHyperframesRenderToLibrary` requires library-save access, a completed QA-ready render projection, a real output ref, a valid output checksum, and a matching idempotency key.
- It must not fabricate `hf_output_hash`, `output.mp4`, or `qaStatus: passed`.
- Duplicate finalization remains idempotent through the existing Library source-link/idempotency behavior.

## UI Contract

- Product Detail puts the Auto Storyboard Review CTA before Standard controls when Auto is enabled/available.
- Standard Order remains visible, keyboard reachable, and uses the existing `startAutoReview` path for `storyboard_images` and `full_video`.
- Storyboard Review and MediaStudio show automatic preview/result/resume context first and manual render/customization only as fallback.
