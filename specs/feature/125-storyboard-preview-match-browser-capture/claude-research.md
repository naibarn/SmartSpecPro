# Feature 125 Research: Storyboard Preview-Match Browser Capture

## Research Decision

Codebase research: yes. This is an existing git repository with SocratiCode index available and active.

Web research: skipped for this deep-plan pass. The feature is primarily an internal integration of existing SmartSpecPro systems: Storyboard Review, HyperFrames final composite, Presentation browser capture, worker jobs, storage, billing, and Media Library. Current implementation planning should follow the local codebase contracts first.

Subagent execution: requested by the user, but no callable subagent/spawn tool was exposed in this Codex runtime. Research was therefore executed as inline domain tracks:

- frontend/preview contract reviewer
- backend API/job reviewer
- browser capture runtime reviewer
- QA/security/evidence reviewer

## Codebase Findings

### Storyboard Review Live Preview And Final Composite

Relevant files:

- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/server/services/hyperframesRenderService.ts`
- `apps/web/shared/workerRuntime.ts`

Findings:

- `StoryboardReviewPage.tsx` already has a large final composite surface and helper `buildHyperframesFinalPayloadPreview(...)`.
- The current preview payload preserves shot-level `subtitleCues`, `subtitleVtt`, `subtitleSrt`, overlay presets, animation presets, transitions, source timing, and final output metadata.
- The current HyperFrames final render projection/status flow is already visible in Storyboard Review and includes active, cancelled, blocked, failure, output, and Media Library session handling.
- Existing final render behavior maps worker job state back into a HyperFrames-style projection in `hyperframesRenderService.ts`, including worker-job diagnostics and output artifact references.
- The new capture path should not replace that path. It should add a sibling projection and UI state so users can distinguish deterministic HyperFrames render from preview-match capture.

Planning implications:

- Extract a shared `PreviewMatchCompositionPayload` builder instead of creating a second ad hoc payload inside the new capture action.
- Preserve structured `subtitleCues` through API, queue, internal route, worker input, and verification artifacts.
- Compute `previewCompositionHash` and `timelineHash` from fields that affect pixels, timing, subtitles, media selection, and safe-area layout.
- Add explicit stale-state blocking when the UI changes render-facing fields after hash generation.

### Presentation Dynamic Browser Capture

Relevant files:

- `python-backend/app/tasks/presentation_render.py`
- `apps/web/server/routes/slideRender.ts`
- `apps/web/server/services/presentationPlaybackExport.ts`

Findings:

- Presentation dynamic MP4 export already uses Playwright/Chromium with `record_video_dir` and `record_video_size`.
- The Presentation internal render route exposes readiness via `window.__slideReady` and `window.__slideReadyState`.
- The Python worker launches Chromium with `--disable-gpu`, waits for route readiness, records a playing page, trims clips, and assembles output with FFmpeg.
- The existing route uses a render-only HTML page, fixed viewport, font preload, media readiness checks, and a state object for degraded/failed readiness.

Planning implications:

- The Storyboard capture runtime should mirror this architecture: an internal render-only route, a browser readiness sentinel, fixed viewport, and FFmpeg post-processing.
- MVP can start with Playwright video recording because it is already proven locally, but high-quality output must gate text sharpness and fall back to lower-loss capture if WebM intermediate compression visibly hurts Thai subtitles.
- Browser capture must record the composition surface only, not the Storyboard Review UI shell.

### Worker Jobs, Billing, Artifacts, And Projection

Relevant files:

- `apps/web/shared/workerRuntime.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/workerBillingService.ts`
- `apps/web/server/services/hyperframesRenderService.ts`
- `apps/web/server/services/hyperframesFeatureAccessService.ts`

Findings:

- Feature 124 introduced worker job concepts for HyperFrames final composite, including progress stages, failure codes, capability families, artifact handling, and server-side projection.
- `hyperframesRenderService.ts` can project `worker_jobs.hyperframes_final_composite` rows into the existing HyperFrames final composite UI contract.
- Credit reservation and reconciliation patterns already exist for marketplace media and worker-backed jobs.
- Server verification before Media Library publish is an existing architectural rule.

Planning implications:

- The capture path should reuse the same durable-job discipline: idempotency, reservation before queueing, stale attempt rejection, bounded retries, artifact verification, cancellation, and operator-safe diagnostics.
- Whether the first implementation uses a new `storyboard_capture_jobs` table or `worker_jobs` must be decided by coupling. The preferred plan is to use a narrow capture job table if server-side Python worker execution is separate from desktop worker claims, while keeping a worker-compatible contract for later migration.
- Completion must never be accepted directly from client MediaRecorder output in MVP.

### Security And Data Boundaries

Relevant files:

- `apps/web/server/routes/slideRender.ts`
- `apps/web/server/services/ssrfValidation.ts`
- `apps/web/shared/workerRuntime.ts`

Findings:

- Internal render routes already use route tokens and readiness sentinels.
- Worker artifacts and diagnostics need sanitization because signed URLs, local paths, tokens, raw composition HTML, cookies, and storage keys can leak through logs.
- Storyboard capture introduces a new internal route that stages tenant media and composition data, so tenant and user authorization checks must happen before route tokens are issued.

Planning implications:

- The internal route must be token-scoped, short-lived, capture-job-specific, and non-discoverable.
- Evidence artifacts must be redacted by default.
- Support/operator evidence access requires explicit permission checks.
- Asset manifests must carry checksums or stable storage refs where available; download URLs must be short-lived and regenerated per attempt.

## Testing

Primary repo tooling:

- package manager: npm (`packageManager: npm@10.9.8`)
- root scripts: `npm run typecheck`, `npm run build`
- reliable web verification path from project convention: run checks under `apps/web` when targeting web/server code

Testing patterns to follow:

- TypeScript unit tests near server services and shared contracts, commonly under `apps/web/server/services/__tests__/`.
- Route tests near route/service modules where existing tests exist.
- Client tests for Storyboard Review helpers and UI state should be close to current Storyboard Review tests if present; otherwise add focused helper tests around extracted payload builders rather than broad page tests first.
- Python worker tests should use pytest-style task tests if the Python backend already has pytest configuration; otherwise create narrow tests around manifest parsing, FFmpeg command planning, readiness timeout mapping, and verification report generation.
- Browser evidence is required for parity: capture preview frames and compare against the live preview runtime using deterministic fixtures.

Recommended commands during implementation:

- `npm run typecheck`
- targeted `npm --workspace @smartspec/web run check` or the closest existing web check script if available
- targeted server/shared test command for modified files
- targeted Python backend pytest command for capture worker modules
- final manual or automated browser capture fixture run with Thai subtitle timing evidence

## Open Technical Risks

- Playwright `record_video_dir` may introduce a compressed WebM intermediate that softens Thai text.
- Audio captured through browser recording is unreliable; final audio should be mixed with FFmpeg from source clips and approved audio events.
- A long-running browser capture inside Express/tRPC would starve web requests; it must run in a dedicated worker process.
- Client-side capture can reduce server load, but cannot be trusted as final Library output until upload, verification, codec, tab lifecycle, and security constraints are solved.
- If Live preview and capture use separate payload builders, preview drift will return. A shared payload contract is non-negotiable.
