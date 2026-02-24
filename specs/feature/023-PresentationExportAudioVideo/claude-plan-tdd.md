# TDD Plan: Presentation Export, Audio Support & Video Playback

Feature: 023-PresentationExportAudioVideo
Date: 2026-02-23

**Testing frameworks:** Vitest (TypeScript), pytest (Python)
**Test locations:** `apps/web/server/routers/*.test.ts`, `apps/web/server/services/*.test.ts`, `apps/web/client/src/**/*.test.tsx`, `python-backend/tests/`
**Coverage requirement:** Python ≥80% (enforced by CI); TypeScript: existing test suite must not regress

---

## Section 1: Database Migration

**Write tests BEFORE running the migration.**

### TypeScript (Vitest) — `drizzle/schema.test.ts` (new) or migration verification script

- Test: `presentation_exports` table exists after `pnpm db:push`
- Test: `presentation_exports.status` accepts `"queued"`, `"processing"`, `"done"`, `"error"`, `"cancelled"`
- Test: `presentation_exports.idempotencyKey` has a unique constraint (insert duplicate key → DB error)
- Test: `presentation_slides.audioTrack` column accepts null (no audio) and valid JSON object
- Test: `presentation_decks.projectAudioTrack` column accepts null and valid JSON object
- Test: `presentation_exports.outputStorageKey` is nullable
- Test: deleting a `presentation_deck` cascades to delete its `presentation_exports` rows
- Test: deleting a `user` sets `presentation_exports.userId` to null (not cascade)

*Note: Schema verification tests can be lightweight integration tests using the test DB connection.*

---

## Section 2: Shared Contracts Extension

**Write tests BEFORE extending contracts.ts.**

### TypeScript (Vitest) — `shared/presentation/contracts.test.ts` (extend existing or new)

- Test: `audioTrackInputSchema` parses valid `{ libraryItemId: 1, volume: 0.8, startAtMs: 0 }`
- Test: `audioTrackInputSchema` rejects `volume: 1.5` (exceeds 1.0)
- Test: `audioTrackInputSchema` rejects negative `libraryItemId`
- Test: `projectAudioTrackInputSchema` parses `{ libraryItemId: 1, volume: 0.5, loop: true }` with `fadeOutMs: null`
- Test: `resolvedAudioTrackSchema` has `url: string` (not `libraryItemId`)
- Test: `presentationExportStatusResultSchema` parses `exportId` as `number` (not string)
- Test: `PresentationRenderSpec` `format` field accepts `"jpg"` and `"pdf"` (not just `"png"` and `"mp4"`)

---

## Section 3: Node.js Backend — Export Service

**Write tests BEFORE implementing `presentationExportService.ts`.**

### TypeScript (Vitest) — `server/services/presentationExportService.test.ts` (new)

- Test: `createExportRecord` inserts row with `status="queued"`, `progressPct=0`
- Test: `createExportRecord` sets `idempotencyKey` from input
- Test: `updateExportRecord` sets only the provided fields (partial update — other fields unchanged)
- Test: `getExportRecord` returns null for unknown id
- Test: `getExportRecord` returns the inserted row with correct fields
- Test: `getExportRecordByIdempotencyKey` returns existing row for a duplicate key
- Test: `getExportRecordByIdempotencyKey` returns null for unknown key
- Test: `getExportRecordByCeleryTaskId` returns correct row

### TypeScript (Vitest) — extend `server/services/presentationPlaybackExport.test.ts`

- Test: `triggerPresentationExport` calls Python bridge `POST /api/v1/presentations/export` with correct render spec
- Test: `triggerPresentationExport` resolves slide audio URLs via `storagePresignGet` before calling Python
- Test: `triggerPresentationExport` stores `celeryTaskId` returned by Python in DB
- Test: `triggerPresentationExport` returns existing export ID when `idempotencyKey` matches in-progress DB record (deduplication)
- Test: `getPresentationExportStatus` reads from DB and calls Python GET for live progress
- Test: `getPresentationExportStatus` updates DB to `status="done"` + `outputUrl` when Python returns done
- Test: `getPresentationExportStatus` updates DB to `status="error"` when Python returns failure
- Test: Python bridge HTTP error (5xx) is caught and stored as `status="error"` in DB
- Test: throttle enforcement still applies to `"jpg"` and `"pdf"` formats

---

## Section 4: Node.js Backend — tRPC Router

**Write tests BEFORE modifying `presentation.ts` router.**

### TypeScript (Vitest) — extend `server/routers/presentation.test.ts`

- Test: `triggerExport` accepts `format: "jpg"` input
- Test: `triggerExport` accepts `format: "pdf"` input
- Test: `triggerExport` with `quality: "high"` passes quality to service layer
- Test: `triggerExport` requires `idempotencyKey` (rejects input without it)
- Test: `getExportStatus` returns `progressPct` and `stage` fields
- Test: `getExportStatus` returns `downloadUrl` when status is `"done"`
- Test: `setSlideAudio` stores audio track on slide (authenticated)
- Test: `setSlideAudio` with `null` removes existing audio track
- Test: `setSlideAudio` requires `expectedVersion` (optimistic lock)
- Test: `setDeckAudio` stores project audio on deck
- Test: `setDeckAudio` with `null` removes project audio
- Test: `getPlayDeck` returns deck with resolved audio URLs in slides
- Test: `getPlayDeck` requires authentication (unauthenticated request → 401)
- Test: `getPlayDeck` returns `projectAudioTrack` with resolved URL on deck

---

## Section 5: Node.js Backend — Internal Slide Render Route

**Write tests BEFORE implementing `slideRender.ts`.**

### TypeScript (Vitest) — `server/routes/slideRender.test.ts` (new)

- Test: `GET /internal/slide-render/:deckId/:slideIndex` returns 403 for non-localhost remote address (simulate `::2`)
- Test: route accepts `req.socket.remoteAddress === "127.0.0.1"` (IPv4 loopback)
- Test: route accepts `req.socket.remoteAddress === "::1"` (IPv6 loopback)
- Test: route accepts `req.socket.remoteAddress === "::ffff:127.0.0.1"` (IPv4-mapped IPv6)
- Test: missing `X-Internal-Token` header returns 401
- Test: invalid/expired JWT in `X-Internal-Token` returns 401
- Test: JWT with mismatched `deckId` or `slideIndex` returns 401
- Test: valid JWT + localhost returns 200 with HTML containing the slide JSON
- Test: HTML response contains `window.__slideReady = false` initialization
- Test: HTML response contains inlined `slideContent` JSON (not just slideshow metadata)
- Test: out-of-bounds `slideIndex` returns 404

---

## Section 6: Python Backend — FastAPI Export API

**Write tests BEFORE implementing `presentations_export.py`.**

### Python (pytest) — `python-backend/tests/test_presentations_export_api.py` (new, `@pytest.mark.integration`)

- Test: `POST /api/v1/presentations/export` returns `{ celery_task_id, status: "queued" }` with valid auth
- Test: `POST /api/v1/presentations/export` returns 401 without auth header
- Test: `POST /api/v1/presentations/export` returns 422 for invalid `format` value
- Test: `GET /api/v1/presentations/export/{task_id}` returns `{ state, percent, stage }` for a pending task
- Test: `GET /api/v1/presentations/export/{task_id}` returns `state: "done"` and `output_url` for a completed task (mock AsyncResult)
- Test: `GET /api/v1/presentations/export/{task_id}` returns `state: "error"` and `error_message` for failed task
- Test: `GET /api/v1/presentations/export/unknown-task-id` returns appropriate response (pending state, not 404)

---

## Section 7: Python Backend — Celery Render Task

**Write tests BEFORE implementing `presentation_render.py`.**

### Python (pytest) — `python-backend/tests/test_presentation_render_task.py` (new)

**Unit tests (`@pytest.mark.unit`, mock Playwright):**
- Test: `update_state` called with `state="PROGRESS"` after each slide is captured (percent increases monotonically)
- Test: `update_state` percent reaches 75 after all slides rendered, 90 after format processing, 100 after upload
- Test: temp directory is cleaned up in `finally` block when task succeeds
- Test: temp directory is cleaned up when `SoftTimeLimitExceeded` is raised
- Test: temp directory is cleaned up when a generic `Exception` is raised mid-task
- Test: JWT token sent to Playwright uses `X-Internal-Token` header (not query parameter)
- Test: `INTERNAL_RENDER_BASE_URL` env var controls the base URL used in Playwright navigation
- Test: `window.__slideReady` timeout logs warning but does not abort rendering
- Test: FFmpeg concat file has one entry per slide with correct `duration` value from `durationMs`
- Test: FFmpeg `r=30` (fps=30) for MP4 output
- Test: quality preset CRF28/veryfast for `draft`, CRF23/medium for `standard`, CRF18/slow for `high`
- Test: PNG output is a zip file containing `slide_0000.png`, `slide_0001.png`, etc.
- Test: JPG output converts PNG files to JPEG quality=90 before zipping
- Test: PDF output calls `pypdf.PdfWriter` to merge per-slide PDF files

**Slow tests (`@pytest.mark.slow`, mock Playwright screenshots):**
- Test: end-to-end render of 3-slide deck to PNG zip with mocked Playwright screenshots
- Test: concat file format is valid for FFmpeg demuxer (each line: `file '...'` + `duration N.NNN`)
- Test: audio tracks from render spec are included in FFmpeg `-i` inputs
- Test: project audio uses `stream_loop=-1` when `loop=true`

---

## Section 8: Frontend — ExportDialog Component

**Write tests BEFORE implementing `ExportDialog.tsx`.**

### TypeScript (Vitest + React Testing Library) — `components/presentation/ExportDialog.test.tsx` (new)

- Test: renders format picker with MP4, PNG, JPG, PDF options
- Test: quality picker is shown only when MP4 or JPG format is selected
- Test: quality picker is hidden when PNG or PDF is selected
- Test: clicking "Export" calls `triggerExport` mutation with selected format and quality
- Test: dialog transitions to in-progress state after export is triggered
- Test: progress bar shows `progressPct` value from `getExportStatus` response
- Test: stage label renders correctly for "rendering", "encoding", "uploading" values
- Test: `getExportStatus` polling stops when status is `"done"`
- Test: `getExportStatus` polling stops when status is `"error"`
- Test: download button appears with `downloadUrl` when status is `"done"`
- Test: error message renders when status is `"error"`
- Test: "Try Again" button in error state resets dialog to format selection

---

## Section 9: Frontend — SlideAudioPanel Component

**Write tests BEFORE implementing `SlideAudioPanel.tsx`.**

### TypeScript (Vitest + React Testing Library) — `components/presentation/SlideAudioPanel.test.tsx` (new)

- Test: renders "Add Audio" button when no audio track is configured for slide
- Test: renders audio file name and volume slider when audio track exists
- Test: "Remove" button clears audio track (calls `setSlideAudio` with `null`)
- Test: volume slider value reflects `audioTrack.volume` (0–1 mapped to 0–100%)
- Test: "Add Project Audio" button is always visible (not gated on slide selection)
- Test: project audio section shows file name and loop toggle when deck audio exists
- Test: `setDeckAudio` mutation is called with `null` when deck audio is removed
- Test: media library picker filters to `audio/*` MIME types

---

## Section 10: Frontend — PresentationEditor Modifications

**Write tests BEFORE modifying `PresentationEditor.tsx`.**

### TypeScript (Vitest + React Testing Library) — extend `pages/PresentationEditor.test.tsx`

- Test: "Export" button is present in toolbar
- Test: clicking "Export" button opens `ExportDialog` modal
- Test: "Audio" tab is present in right properties panel
- Test: "Audio" tab renders `SlideAudioPanel` with current slide ID and deck ID
- Test: "Play" button is present in toolbar
- Test: clicking "Play" button navigates to `/presentation/:itemId/play`

---

## Section 11: Frontend — PresentationPlayMode Page

**Write tests BEFORE implementing `PresentationPlayMode.tsx`.**

### TypeScript (Vitest + React Testing Library) — `pages/PresentationPlayMode.test.tsx` (new)

- Test: renders full-screen loading spinner while `getPlayDeck` query is pending
- Test: renders slide canvas when data is ready (uses mocked `getPlayDeck` response)
- Test: pressing `Space` toggles play/pause state
- Test: pressing `ArrowRight` advances to next slide
- Test: pressing `ArrowLeft` goes to previous slide
- Test: pressing `ArrowRight` on last slide does not advance past end (ENDED state)
- Test: fullscreen button calls `document.documentElement.requestFullscreen`
- Test: slide counter shows "1 / N" format
- Test: control bar is visible on mouse hover and hidden after 3 seconds of inactivity
- Test: keyboard listeners are cleaned up on component unmount

---

## Section 12: Frontend — PlaybackEngine

**Write tests BEFORE implementing `PlaybackEngine.ts`.**

### TypeScript (Vitest) — `presentation-canvas/play/PlaybackEngine.test.ts` (new)

- Test: initial state is `IDLE`
- Test: `play()` transitions state from `IDLE` to `PLAYING`
- Test: `pause()` transitions state from `PLAYING` to `PAUSED`
- Test: `goToSlide(n)` updates `currentIndex` to `n`
- Test: `nextSlide()` increments `currentIndex`
- Test: `prevSlide()` decrements `currentIndex`, clamped to 0
- Test: auto-advance calls `onStateChange` with `SLIDE_TRANSITIONING` after `slide.durationMs`
- Test: auto-advance does not fire when paused
- Test: `destroy()` clears the auto-advance timer (no late callbacks)
- Test: `onStateChange` callback is invoked on every state transition
- Test: after reaching the last slide, state transitions to `ENDED`

---

## Section 13: Frontend — AudioTrackPlayer

**Write tests BEFORE implementing `AudioTrackPlayer.ts`.**

### TypeScript (Vitest) — `presentation-canvas/play/AudioTrackPlayer.test.ts` (new)

*Mock `Audio` constructor (not available in JSDOM) using `vi.fn()`.*

- Test: `onSlideEnter(null)` does not create an audio element
- Test: `onSlideEnter(track)` creates `<audio>` with `src` and `volume` set from track
- Test: `onSlideEnter(track)` calls `audio.play()`
- Test: `onSlideEnter(track)` sets `audio.currentTime` to `startAtMs / 1000`
- Test: `onSlideExit()` calls `audio.pause()` on the per-slide audio element
- Test: `onSlideExit()` resets per-slide audio `currentTime` to 0
- Test: project audio `loop: true` sets `audio.loop = true` on the project audio element
- Test: `pause()` pauses both per-slide and project audio elements
- Test: `resume()` resumes both per-slide and project audio elements
- Test: `destroy()` pauses all audio elements (cleanup)

---

## Section 14: Infrastructure — Dockerfile and Environment

**Write tests BEFORE deploying Dockerfile changes.**

### Manual verification checklist (no automated tests — infrastructure changes)

- Verify: `docker build -f docker/Dockerfile.video-job-runner .` succeeds without errors
- Verify: `playwright install chromium --with-deps` completes in the container
- Verify: `python -c "import playwright; print('ok')"` runs successfully in container
- Verify: `python -c "import PyJWT; print('ok')"` runs successfully in container
- Verify: `python -c "import pypdf; print('ok')"` runs successfully in container
- Verify: `python -c "from PIL import Image; print('ok')"` runs successfully in container
- Verify: Nginx `/internal/` deny block returns 403 for a curl request from outside localhost
- Verify: `INTERNAL_RENDER_BASE_URL=http://host.docker.internal:3000` is set in worker environment

---

## Section 15: Testing Strategy (Meta)

### Coverage Gates

- Python render task: ≥80% line coverage (project minimum). Mock Playwright in all unit tests via `unittest.mock.patch("playwright.sync_api.sync_playwright")`.
- TypeScript: all new files with business logic (`presentationExportService.ts`, `PlaybackEngine.ts`, `AudioTrackPlayer.ts`) must have unit test files.

### Test Markers

Python tests must use these markers:
- `@pytest.mark.unit` — no external dependencies (mock everything)
- `@pytest.mark.integration` — requires running FastAPI app (use `TestClient`)
- `@pytest.mark.slow` — end-to-end pipeline tests (run in CI, not in dev watch mode)

### Test Data

- Use a 3-slide test deck JSON fixture for Python render tests (inlined in `conftest.py`)
- Mock Playwright `page.screenshot()` to return a 1920×1080 white PNG (pre-generated test asset)
- Mock S3/R2 uploads in all unit/integration tests
