<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-database-migration
section-02-shared-contracts
section-03-export-service
section-04-trpc-router
section-05-slide-render-route
section-06-python-fastapi-export
section-07-python-celery-task
section-08-export-dialog
section-09-slide-audio-panel
section-10-editor-modifications
section-11-play-mode-page
section-12-playback-engine
section-13-audio-track-player
section-14-infrastructure
section-15-testing-strategy
END_MANIFEST -->

# Implementation Sections Index

Feature: 023-PresentationExportAudioVideo — Presentation Export, Audio Support & Video Playback

This feature spans four layers: database schema, Node.js backend (tRPC + Express), Python backend (FastAPI + Celery), and React frontend. Each section is a focused implementation unit. Sections must be implemented roughly in dependency order, though several can run in parallel within a batch.

**Note on runtime:** The primary test command is `cd apps/web && pnpm test` (Vitest). Python sections use `cd python-backend && uv run pytest`. Both test suites must pass before any section is considered complete.

---

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-database-migration | — | 02, 03, 05 | No |
| section-02-shared-contracts | 01 | 03, 04, 05, 08, 09, 11 | No |
| section-03-export-service | 01, 02 | 04 | Yes (with 05, 14) |
| section-04-trpc-router | 02, 03 | 08, 09, 11 | No |
| section-05-slide-render-route | 01, 02 | 07 | Yes (with 03, 14) |
| section-06-python-fastapi-export | 14 | 07 | Yes (with 04, 08–13) |
| section-07-python-celery-task | 05, 06, 14 | 15 | No |
| section-08-export-dialog | 04 | 10 | Yes (with 07, 09, 12, 13) |
| section-09-slide-audio-panel | 04 | 10 | Yes (with 07, 08, 12, 13) |
| section-10-editor-modifications | 08, 09 | 15 | No |
| section-11-play-mode-page | 04, 12, 13 | 15 | No |
| section-12-playback-engine | — | 11 | Yes (with 07, 08, 09, 13) |
| section-13-audio-track-player | — | 11 | Yes (with 07, 08, 09, 12) |
| section-14-infrastructure | — | 06, 07 | Yes (with 03, 05) |
| section-15-testing-strategy | all | — | No |

---

## Execution Order (Batch Parallelization)

**Batch 1:** section-01-database-migration
- No dependencies; everything blocks on this

**Batch 2:** section-02-shared-contracts
- Depends on 01; types used by all subsequent layers

**Batch 3 (parallel):** section-03-export-service, section-05-slide-render-route, section-14-infrastructure
- All depend on 01+02 (or are standalone for 14)
- Export service: new DB-backed service layer
- Slide render route: internal Express route with localhost guard + Nginx block
- Infrastructure: Dockerfile playwright install, env vars, Celery queue

**Batch 4 (parallel):** section-04-trpc-router, section-06-python-fastapi-export
- tRPC router depends on 02+03 (types + service layer)
- Python FastAPI depends on 14 (Docker environment)

**Batch 5 (parallel):** section-07-python-celery-task, section-08-export-dialog, section-09-slide-audio-panel, section-12-playback-engine, section-13-audio-track-player
- Python task depends on 05+06+14
- Frontend sections 08+09 depend on 04
- Sections 12+13 are pure TypeScript with no dependencies

**Batch 6 (parallel):** section-10-editor-modifications, section-11-play-mode-page
- Editor depends on 08+09 (the new components it embeds)
- Play mode page depends on 04+12+13

**Batch 7:** section-15-testing-strategy
- Final integration tests and coverage verification

---

## Section Summaries

### section-01-database-migration
Adds the `presentation_exports` table to `apps/web/drizzle/schema.ts` (with all fields: id, deckId, userId, tenantId, format, status, progressPct, stage, errorMessage, outputUrl, outputStorageKey, outputBytes, width, height, fps, quality, celeryTaskId, idempotencyKey, createdAt, updatedAt). Also adds nullable JSON columns `audioTrack` to `presentation_slides` and `projectAudioTrack` to `presentation_decks`. Runs `pnpm db:push` and verifies migration. DB Safety Protocol required (pg_dump before migration). Takes full backups of `presentation_decks` and `presentation_slides` before running.

### section-02-shared-contracts
Extends `apps/web/shared/presentation/contracts.ts` with: `audioTrackInputSchema`, `resolvedAudioTrackSchema`, `projectAudioTrackInputSchema`, `resolvedProjectAudioTrackSchema`. Extends `PresentationRenderSpec` to include audio fields and new formats (jpg, pdf). Extends `PresentationSlideshowPayload` with resolved audio. Changes `exportId` from `string` to `number` across all related schemas. Introduces `PresentationPlayDeckPayload` type.

### section-03-export-service
Creates `apps/web/server/services/presentationExportService.ts` (thin DB CRUD layer for `presentation_exports`). Modifies `apps/web/server/services/presentationPlaybackExport.ts` to replace the stub `defaultEnqueueExportJob()` with real Python HTTP bridge call. Adds audio URL resolution helper `resolveAudioUrls()`. Updates `getPresentationExportStatus()` to read from DB and poll Python. Preserves all existing throttling and deduplication logic.

### section-04-trpc-router
Modifies `apps/web/server/routers/presentation.ts` to: extend `triggerExport` input (add jpg/pdf formats, quality enum, require idempotencyKey), extend `getExportStatus` output (add progressPct, stage, downloadUrl). Adds new procedures: `setSlideAudio` (optimistic lock), `setDeckAudio` (optimistic lock), `getPlayDeck` (read-only query, returns full deck with resolved audio URLs). Also updates `apps/web/server/services/presentationService.ts` with audio fields CRUD support.

### section-05-slide-render-route
Creates `apps/web/server/routes/slideRender.ts`: Express route `GET /internal/slide-render/:deckId/:slideIndex`. Enforces localhost-only access (checking all three loopback variants: 127.0.0.1, ::1, ::ffff:127.0.0.1). Validates `X-Internal-Token` JWT header (not query param). Fetches full slide content (including slideContent JSONB, not just slideshow metadata). Returns minimal HTML with inlined slide data, `window.__slideReady` sentinel logic, and font/image load detection. Adds Nginx `location /internal/ { deny all; }` block to `nginx/conf.d/dev-host.conf`.

### section-06-python-fastapi-export
Creates `python-backend/app/api/v1/presentations_export.py` with Pydantic models: `PresentationExportRequest`, `PresentationExportJobResponse`, `PresentationExportStatusResponse`. Implements `POST /api/v1/presentations/export` (enqueues Celery task, returns celery_task_id) and `GET /api/v1/presentations/export/{celery_task_id}` (polls AsyncResult, returns progress). Registers router in `python-backend/app/main.py`. Authentication via existing JWT bearer middleware.

### section-07-python-celery-task
Creates `python-backend/app/tasks/presentation_render.py`: Celery task `render_presentation` bound to `presentation_export` queue (concurrency 2). Three stages: (1) Playwright screenshots each slide via `GET /internal/slide-render` with `X-Internal-Token` JWT header (5-min TTL, generated with PyJWT), waits for `window.__slideReady`, progress 0–75%; (2) format-specific rendering: MP4 via FFmpeg concat demuxer + audio mixing (libx264, yuv420p, quality CRF presets), PDF via Playwright PDF + pypdf merge, PNG/JPG via PIL + zip, progress 75–90%; (3) S3/R2 upload + presigned URL, progress 90–100%. Temp dir cleanup in finally block. Updates `celery_app.py` with new queue and route.

### section-08-export-dialog
Creates `apps/web/client/src/components/presentation/ExportDialog.tsx`: Radix UI Dialog with three states (format selection, in-progress, complete/error). Format picker: MP4/PNG/JPG/PDF with radio buttons. Quality picker (draft/standard/high) shown only for MP4/JPG. Progress bar with stage label using TanStack Query polling (`refetchInterval: 2000`, stops on done/error). Download button with file size. Error state with "Try Again" reset.

### section-09-slide-audio-panel
Creates `apps/web/client/src/components/presentation/SlideAudioPanel.tsx`: Two sections — per-slide audio (Add Audio, file name, volume slider 0–1, startAtMs, endAtMs, Remove) and project-wide audio (Add Project Audio, file name, volume, loop toggle, fadeOutMs, Remove). Uses existing media library browser/picker filtered to `audio/*` MIME types. Calls `setSlideAudio` and `setDeckAudio` mutations.

### section-10-editor-modifications
Modifies `apps/web/client/src/pages/PresentationEditor.tsx` (additive only): adds "Export" button to toolbar (opens ExportDialog, disabled if feature flag off), adds "Audio" tab to right properties panel (renders SlideAudioPanel with slide/deck IDs), adds "Play" button to toolbar (navigates to `/presentation/:itemId/play`). No breaking changes to existing editor functionality.

### section-11-play-mode-page
Creates `apps/web/client/src/pages/PresentationPlayMode.tsx`: lazy-loaded page at route `/presentation/:itemId/play`. Full-screen read-only slide renderer. Uses `getPlayDeck` tRPC query. Controls overlay (auto-hide 3s): Play/Pause, Prev, Next, slide counter, Fullscreen. Keyboard shortcuts: Space (play/pause), ArrowLeft/Right (navigate). CSS fade/cut transitions based on deck settings. Auto-advance via setTimeout using slide.durationMs. Integrates PlaybackEngine and AudioTrackPlayer. Registers route in `apps/web/client/src/App.tsx`.

### section-12-playback-engine
Creates `apps/web/client/src/presentation-canvas/play/PlaybackEngine.ts`: TypeScript class encapsulating slide playback state machine (IDLE→LOADING→PLAYING→PAUSED→SLIDE_TRANSITIONING→ENDED). API: play(), pause(), goToSlide(n), nextSlide(), prevSlide(), destroy(). Single setTimeout for auto-advance, records elapsed time on pause for correct resume. Fires onStateChange callback on every transition. No audio management — delegates to AudioTrackPlayer via callbacks.

### section-13-audio-track-player
Creates `apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts`: TypeScript class managing two detached Audio elements (per-slide and project-wide). API: onSlideEnter(track), onSlideExit(), pause(), resume(), destroy(). Per-slide: create/reuse Audio, set src/volume/currentTime, play on enter, 0.5s fade-out on exit. Project-wide: created once in constructor, plays continuously, loop=true if configured. Both elements are `new Audio(url)` — not in React tree.

### section-14-infrastructure
Modifies `docker/Dockerfile.video-job-runner`: adds `RUN pip install playwright PyJWT pypdf Pillow` and `RUN playwright install chromium --with-deps`. Verifies `pypdf` and `Pillow` in `python-backend/requirements.txt`. Documents worker startup command (`celery -A app.core.celery_app worker -Q presentation_export -c 2`). Adds `JWT_SECRET` and `INTERNAL_RENDER_BASE_URL=http://host.docker.internal:3000` to worker env. Updates `python-backend/app/core/celery_app.py` to add `presentation_export` queue and task route. Adds Nginx `/internal/` deny block (note: also done in Section 5 — these changes are coordinated).

### section-15-testing-strategy
Consolidates all TDD test stubs into complete, runnable tests. Verifies coverage gates: Python ≥80% (mock Playwright in all unit tests), TypeScript new business-logic files must have unit test coverage. Runs full test suites: `cd apps/web && pnpm test`, `cd python-backend && uv run pytest`. Fixes any regressions in existing tests. Documents test markers used (`@pytest.mark.unit`, `@pytest.mark.integration`, `@pytest.mark.slow`).
