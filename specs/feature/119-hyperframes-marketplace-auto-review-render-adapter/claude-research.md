# Research: Feature 119 HyperFrames Marketplace Auto Review Render Adapter

Date: 2026-06-04
Mode: existing codebase, SocratiCode-first, planning only
Initial spec: `specs/feature/119-hyperframes-marketplace-auto-review-render-adapter/spec.md`

## Research Decision

Codebase research is required because the feature touches existing Marketplace Capture, Marketplace Auto Review, Storyboard Review, MediaStudio, Library, tRPC, worker, storage, and tests.

Web research is required because the spec depends on HyperFrames package behavior and runtime requirements. Only primary sources were used:

- HyperFrames GitHub README: https://github.com/heygen-com/hyperframes
- HyperFrames introduction: https://hyperframes.heygen.com/introduction
- HyperFrames CLI docs: https://hyperframes.heygen.com/packages/cli
- HyperFrames producer docs: https://hyperframes.heygen.com/packages/producer
- HyperFrames engine docs: https://hyperframes.heygen.com/packages/engine

SocratiCode status was green for `/home/dev/projects/SmartSpecPro` with 92k+ indexed chunks. Discovery used SocratiCode first, then targeted `rg` and line-range reads.

## Current SmartSpecPro Baseline

Feature 118 records the implemented Marketplace Auto Review baseline:

- Entry page: `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`.
- tRPC router: `apps/web/server/routers/marketplaceCapture.ts`.
- Service: `apps/web/server/services/marketplaceAutoReviewService.ts`.
- Background advancement: `apps/web/server/jobs/marketplaceAutoReviewJob.ts`.
- Shared contract tests: `apps/web/shared/__tests__/marketplaceAutoReviewContracts.test.ts`.
- Service tests: `apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts`.

The current router exposes:

- `marketplaceCapture.startAutoReview`
- `marketplaceCapture.getAutoReviewRun`
- `marketplaceCapture.listAutoReviewRuns`
- `marketplaceCapture.advanceAutoReviewRun`
- `marketplaceCapture.cancelAutoReviewRun`

The current start input includes:

- `productId`
- `creationIntent`
- `outputMode`: `storyboard_images` or `full_video`
- `frameStrategy`: `storyboard_3x3_split` or `video_shot_start_stop`
- `audioStrategy`: `auto`, `native_video_audio`, `separate_tts_voiceover`, or `silent`
- `shotCount`
- `overlayTextMode`
- `imageModel`
- `qualityMode`
- `referenceAnchors`

The current service creates durable run/stage rows, active-run dedupe, product preflight evidence, reference anchors, production run metadata, and staged advancement. `startMarketplaceAutoReviewRun` returns an existing active run for the same user/product and queues advancement.

## Durable Stage Baseline

Storyboard-only mode uses:

1. `product_preflight`
2. `production_project`
3. `concept_story`
4. `prompt_plan`
5. `image_generation`
6. `storyboard_review`

Full-video mode adds:

7. `video_generation`
8. `audio_generation`
9. `video_edit`
10. `render`
11. `library_finalize`

Feature 119 should attach HyperFrames preview/final render to existing run/stage state first. A new durable stage is deferred until metrics prove it is necessary.

## Product Detail UI Baseline

`MarketplaceCaptureProductDetail.tsx` already:

- loads `listAutoReviewRuns` and polls active runs;
- starts runs through `startAutoReviewMutation`;
- invalidates `listAutoReviewRuns` and `getProduct` after start;
- has a right-side Media Panel with History, Library, and Product tabs;
- supports product filtering in the Media Panel;
- requires product, character, and environment anchors before starting the current workflow;
- preserves standard controls for output mode, frame strategy, image model, shot count, audio strategy, overlay text, status summary, and history/timeline display.

Feature 119 must not replace this standard order flow. It adds an Auto Storyboard Review launch mode alongside the existing Standard Order mode.

## Storyboard Review, MediaStudio, Library Baseline

`StoryboardReviewPage.tsx` already supports Library search, compound render, render progress, fallback metadata, and save-to-Library behavior.

`MediaStudio.tsx` already has localStorage render-to-library sessions:

- key: `smartspec_media_studio_render_library_sessions_v1`
- sources: `storyboard_review` and `video_shot`
- TTL: 7 days
- fields: job ID, production run ID, title, metadata, timestamps

Feature 119 should extend this session model for HyperFrames render-to-library, not invent an unrelated handoff store.

## HyperFrames Findings

HyperFrames is an open-source HTML-native video rendering framework. The GitHub README describes it as turning HTML, CSS, media, and seekable animations into deterministic MP4 videos, with a CLI, producer package, engine, catalog, player, and agent skills.

The CLI supports:

- `init`
- `preview`
- `render`
- `lint`
- `inspect`
- `snapshot`
- `doctor`

The CLI docs describe `snapshot` as capturing PNG key frames and `render` as producing MP4/WebM/MOV/PNG sequence outputs. Render options include output path, format, FPS, quality, CRF, and GPU settings. The docs list Node.js 22+ and FFmpeg as requirements.

`@hyperframes/producer` is the right production package when SmartSpecPro needs Node.js programmatic rendering. It loads composition HTML, injects runtime, waits for readiness gates, captures frames through the engine, encodes with FFmpeg, mixes audio, supports progress callbacks, supports cancellation errors, and can run a Hono-based HTTP server.

Producer docs also note Docker rendering for deterministic output with pinned Chrome and font sets. The plan should keep heavy Chrome/FFmpeg dependencies out of the main web runtime and prefer a separate worker/container.

## Testing Baseline

The project uses TypeScript, Vitest-style tests, and focused test paths:

- `apps/web/shared/__tests__/marketplaceAutoReviewContracts.test.ts`
- `apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts`
- `apps/web/server/routers/__tests__/...`
- `apps/web/client/src/pages/__tests__/...`
- `apps/web/client/src/components/.../__tests__/...`
- `apps/web/tests/e2e/...`

Release gates should prefer focused commands such as:

- `npm --prefix apps/web run test -- <focused test paths>`
- `npm --prefix apps/web run test:e2e -- apps/web/tests/e2e/marketplace-hyperframes-ui.spec.ts`

## Planning Constraints

- Do not add HyperFrames dependencies in early contract/UI sections.
- Do not edit implementation during this planning pass.
- Preserve Feature 118 factual baseline.
- Preserve Feature 117 related artifacts and existing dirty worktree changes.
- Keep Auto Storyboard Review auto-first but not auto-only.
- Keep Standard Order usable with `storyboard_images` and `full_video`.
- Use existing run/stage/outbox/artifact tables for MVP unless the promotion criteria in the spec are met.
- Treat all normal-user HyperFrames diagnostics as sanitized projections.
