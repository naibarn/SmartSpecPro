# Implementation Plan: Presentation Export, Audio Support & Video Playback

Feature: 023-PresentationExportAudioVideo
Date: 2026-02-23
Status: Draft

---

## Background

The SmartSpecPro Presentation Editor is a React-based visual editor supporting text, image, video, rect, and line slide elements. The backend is a Node.js Express + tRPC monolith. Media-intensive operations are offloaded to Python Celery workers via an HTTP REST bridge.

This plan implements three interconnected capabilities: **export** (server-side headless rendering), **audio** (per-slide and project-wide tracks), and **video playback in a dedicated play mode**. These are delivered as a coordinated change across all four layers: database, Node.js backend, Python backend, and React frontend.

### What Exists Today

The export plumbing is already partially built. `presentationPlaybackExport.ts` handles deduplication, throttling, render spec construction, and status polling via in-memory registries. The `triggerExport` and `getExportStatus` tRPC procedures are wired. The Python backend has established patterns for Celery task creation (`media_tasks.py`) and FastAPI job management endpoints (`media_generation.py`). S3/R2 storage utilities exist in `storage.ts`. The only missing piece is the actual bridge: the stub `defaultEnqueueExportJob()` never calls Python.

Audio fields and the `presentation_exports` table do not exist yet. The play mode route does not exist.

---

## Section 1: Database Migration

This is the first change that must land. All downstream code depends on these new columns and tables.

### 1.1 New Table: `presentation_exports`

Add this table to `apps/web/drizzle/schema.ts`. It stores every export job as a persistent record, enabling status polling, error recovery, audit history, and download URL retrieval after server restart.

Fields:
- `id` — serial primary key
- `deckId` — FK to `presentation_decks`, `onDelete: "cascade"` (deleting a deck cascades to its export records)
- `userId` — FK to `users` (nullable), `onDelete: "set null"` (preserve audit trail if user is deleted)
- `tenantId` — varchar(36), for multi-tenant isolation
- `format` — varchar, one of `png`, `jpg`, `pdf`, `mp4`
- `status` — varchar, one of `queued`, `processing`, `done`, `error`, `cancelled`; default `queued` (`cancelled` is reserved for future use — no code path sets it in this implementation)
- `progressPct` — integer 0–100, default 0
- `stage` — varchar(64) nullable; human-readable current stage (`rendering`, `encoding`, `uploading`)
- `errorMessage` — text nullable
- `outputUrl` — text nullable; 24-hour presigned S3/R2 download URL stored once job completes (re-generated from `outputStorageKey` if expired)
- `outputStorageKey` — text nullable; the raw S3/R2 storage key, used to re-presign an expired `outputUrl`
- `outputBytes` — bigint nullable
- `width`, `height` — integers (default 1920/1080)
- `fps` — integer nullable (MP4 only, default 30 — matches existing `buildPresentationRenderSpec()` default)
- `quality` — varchar(12) nullable (`draft`, `standard`, `high`)
- `celeryTaskId` — varchar(255) nullable; the Celery task ID returned by Python after enqueueing
- `idempotencyKey` — varchar(128), unique index; used by `triggerExport` deduplication
- `createdAt`, `updatedAt` — timestamps

Add indexes on `deckId`, `userId`, `tenantId`, and `celeryTaskId` for efficient polling and multi-tenant admin queries.

### 1.2 Audio JSON Columns

Add nullable JSON columns (using Drizzle's `json()` helper, consistent with the existing `slideContent` column on `presentation_slides`) to the existing tables (these are additive, low-risk changes):

**`presentation_slides.audioTrack`** — per-slide audio configuration. The shape stored in this column:
```
{
  libraryItemId: number,
  volume: number (0.0–1.0),
  startAtMs: number (default 0),
  endAtMs: number | null (null = play to end)
}
```

**`presentation_decks.projectAudioTrack`** — deck-wide audio configuration. Shape:
```
{
  libraryItemId: number,
  volume: number (0.0–1.0),
  loop: boolean,
  fadeOutMs: number | null
}
```

Both fields are nullable — null means no audio configured. They are not validated by the DB; validation happens in the tRPC input schema using Zod.

### 1.3 Migration Execution

After editing `schema.ts`:
1. Take DB backups (`pg_dump` for `presentation_decks`, `presentation_slides`)
2. Run `cd apps/web && pnpm db:push`
3. Verify row counts match pre-migration counts
4. Verify new columns appear: `\d presentation_slides`, `\d presentation_decks`, `\d presentation_exports`

---

## Section 2: Shared Contracts Extension

`apps/web/shared/presentation/contracts.ts` is the single source of truth for types shared between the Node.js tRPC layer and the React frontend. Extend it with audio and export additions.

### 2.1 Audio Track Types

Add a Zod schema for the audio track object. This schema is used for:
1. Validating `setSlideAudio` / `setDeckAudio` tRPC inputs
2. Defining the shape in DB JSONB columns
3. The resolved audio track sent to Python (which includes a `url` field instead of `libraryItemId`)

```
audioTrackInputSchema — validates tRPC input (has libraryItemId, no url)
resolvedAudioTrackSchema — what Python receives in the render spec (has url, no libraryItemId)
projectAudioTrackInputSchema — deck-level audio with loop/fadeOut fields
resolvedProjectAudioTrackSchema — resolved version for Python
```

### 2.2 Extend `PresentationRenderSpec`

Add audio fields to the render spec:
- `slides[].audioTrack?: ResolvedAudioTrack` — per-slide resolved audio (URL already resolved by Node.js)
- `projectAudioTrack?: ResolvedProjectAudioTrack` — deck-level audio

Add `quality?: "draft" | "standard" | "high"` to the render spec.

Extend `format` from `"png" | "mp4"` to `"png" | "jpg" | "pdf" | "mp4"`.

### 2.3 Extend `PresentationSlideshowPayload`

The slideshow payload is used by both `getSlideshow` (editor preview) and the new `getPlayDeck` (play mode). Add optional audio fields:
- `slides[].audioTrack?: ResolvedAudioTrack`
- `projectAudioTrack?: ResolvedProjectAudioTrack`

### 2.4 Export Status Response

Change `exportId` in `PresentationExportStatusResult` from `string` to `number` (DB row ID). Add `progressPct`, `stage`, `downloadUrl`, and `errorMessage` fields.

**Breaking change note:** The existing schema uses `z.string()` for `exportId` and `jobId`. Changing to `number` requires simultaneous updates to ALL of the following files:
- `apps/web/shared/presentation/contracts.ts` — `presentationExportResultSchema`, `presentationExportStatusResultSchema`
- `apps/web/server/routers/presentation.ts` — `getExportStatus` input schema
- `apps/web/server/services/presentationPlaybackExport.ts` — `triggerPresentationExport` return type
- `apps/web/client/src/components/presentation/ExportDialog.tsx` — `exportId` state variable type
- All related test files

---

## Section 3: Node.js Backend — Export Service

The bulk of the Node.js export change is replacing the stub in `presentationPlaybackExport.ts` and adding a new `presentationExportService.ts` for DB-backed export management.

### 3.1 New File: `presentationExportService.ts`

This service is responsible for all database interactions with `presentation_exports`. It should be a thin data-access layer, not containing business logic.

Key functions to implement:
- `createExportRecord(input, db)` — inserts a new row with `status='queued'`
- `updateExportRecord(id, updates, db)` — partial update (for setting celeryTaskId, progressPct, status, outputUrl)
- `getExportRecord(id, db)` — fetch single record by id
- `getExportRecordByIdempotencyKey(key, db)` — for deduplication lookup
- `getExportRecordByCeleryTaskId(taskId, db)` — for reverse-lookup during polling

### 3.2 Modify `presentationPlaybackExport.ts`

**Replace `defaultEnqueueExportJob()`** — this is the core change. The function should:

1. Resolve audio URLs: for each slide's `audioTrack.libraryItemId` and for the deck's `projectAudioTrack.libraryItemId`, fetch the library item from DB and get the storage key, then call `storagePresignGet(storageKey, 3600)` to generate a 1-hour presigned GET URL (sufficient for the 12-minute task). Attach `url` to each audio track object in the render spec.

2. Create the DB record via `createExportRecord()` before calling Python.

3. Call Python via `fetch()` to `${PYTHON_BACKEND_URL}/api/v1/presentations/export`. Pass the full render spec (with resolved audio URLs). Use `signBearerToken({ scopes: ["internal:render"] })` for the Authorization header.

4. Receive `{ celeryTaskId }` from Python. Update the DB record with `celeryTaskId`.

5. Return `{ exportId: record.id }`.

**Update `getPresentationExportStatus()`** — instead of reading from in-memory `statusRegistry`, it should:
1. Load the `presentation_exports` record from DB by export ID
2. If the record has a `celeryTaskId` and status is still `queued` or `processing`, call Python GET `/api/v1/presentations/export/{celeryTaskId}` for fresh progress
3. If Python returns progress updates (percent, stage), update the DB record
4. If Python returns `done`, store the `output_url` in the DB and update status to `done`
5. If Python returns `failure`, update DB record to `status='error'` with error message
6. Return the DB record state

**Preserve existing throttling and deduplication logic** — these in-memory registries work correctly and should not be changed.

**Layered deduplication:** The in-memory `dedupeRegistry` is a fast-path optimization for rapid double-clicks within the same server process. The DB `idempotencyKey` unique constraint is the durable guarantee — it catches duplicates across server restarts. The correct code path: check in-memory first (fast); if miss (post-restart), check `getExportRecordByIdempotencyKey()` before creating a new DB record; if the DB record already exists and is `queued`/`processing`, return its ID without creating a new job.

### 3.3 Audio URL Resolution Helper

Add a private helper `resolveAudioUrls(renderSpec, db)` that:
- Iterates `renderSpec.slides` looking for non-null `audioTrack`
- For each found audio track: queries `libraryItems` by `libraryItemId`, gets the storage key, calls `storagePresignGet(storageKey, 3600)` to generate a 1-hour presigned GET URL
- Does the same for `renderSpec.projectAudioTrack` if present
- Returns a new render spec with `audioTrack.url` populated and `audioTrack.libraryItemId` removed

Note: `MAX_PRESIGN_EXPIRY_S` in `storage.ts` caps at 86400 seconds (24h). Use 3600s (1h) for audio files during rendering — well within the 12-minute Celery task limit. For the export `outputUrl`, use `storagePresignGet(outputStorageKey, 86400)` (24h) after upload.

---

## Section 4: Node.js Backend — tRPC Router

`apps/web/server/routers/presentation.ts` receives the following additions and modifications.

### 4.1 Extend `triggerExport` Input

The input Zod schema gains:
- `format`: extend enum to include `"jpg"` and `"pdf"`
- `quality`: optional enum `"draft" | "standard" | "high"`, default `"standard"`
- `idempotencyKey`: make required (was previously optional)

The mutation handler stays the same — it delegates to `triggerPresentationExport()` in the service layer.

### 4.2 Extend `getExportStatus` Output

The query output type changes to return integer `exportId` (DB row), `progressPct` (0-100), `stage` (human-readable stage label), `downloadUrl` (when done), and `errorMessage` (when error).

### 4.3 New Procedure: `setSlideAudio`

Authenticated protected procedure. Input validated by `audioTrackInputSchema | z.null()`. Delegates to `updateSlideAudio(slideId, deckId, audioTrack, actor)` in `presentationService.ts`. Requires `expectedVersion` for optimistic locking (consistent with existing slide update pattern).

### 4.4 New Procedure: `setDeckAudio`

Authenticated protected procedure. Similar to `setSlideAudio` but operates on the deck's `projectAudioTrack` field. Input validated by `projectAudioTrackInputSchema | z.null()`. Requires `expectedVersion`.

### 4.5 New Procedure: `getPlayDeck`

Authenticated protected procedure. Input: `{ itemId: number }`. This procedure:
1. Calls existing `getPresentationDeckDetail(deckId, actor)` after resolving `deckId` from `libraryItemId`
2. Builds the slideshow payload using existing `buildSlideshowPayload()`
3. Resolves audio URLs for each slide and the deck (same helper as export service)
4. Returns `PresentationPlayDeckPayload` (extended slideshow with resolved audio)

This is read-only (query, not mutation). Play mode is read-only.

---

## Section 5: Node.js Backend — Internal Slide Render Route

Create `apps/web/server/routes/slideRender.ts`. This is an Express route (not tRPC) registered with the main Express app.

### 5.1 Route Registration

Route: `GET /internal/slide-render/:deckId/:slideIndex`

This route must:
- Only be accessible from localhost. Middleware checks `req.ip || req.socket.remoteAddress` against all three loopback variants: `"127.0.0.1"`, `"::1"`, and `"::ffff:127.0.0.1"`. Returns 403 for any other origin. Note: `req.connection` is deprecated — use `req.socket.remoteAddress`.
- Validate the `X-Internal-Token` **request header** using `verifyJwtToken()`. The token should have scope `internal:slide-render` and must encode `deckId` and `slideIndex` matching the URL path parameters. **Do NOT use a `?token=` query parameter** — query params appear in server logs (Nginx and Node.js access logs).
- **Add an Nginx deny block** in `nginx/conf.d/dev-host.conf` to both the HTTP (:80) and HTTPS (:443) server blocks, before the catch-all `location /` proxy: `location /internal/ { deny all; return 403; }`. This is the primary defense; the application-layer check is a secondary layer.

The JWT is short-lived (5-minute TTL) — it only needs to survive the duration of a single Playwright screenshot call.

### 5.2 Response

On successful auth, the handler:
1. Fetches the deck's slides from DB (using `getDeckByLibraryItemId` or direct DB query). This must include the full `slideContent` JSONB field — **not just the slideshow metadata** (the slideshow payload only contains `slideId`, `orderIndex`, `title`, `durationMs`, and `transition` — not the element data).
2. Gets slide at `slideIndex`
3. Returns a minimal HTML page that renders only that slide's content, with `slideContent` inlined as a JSON script tag.

The HTML page structure:
- No navigation, no editor chrome, no toolbar — pure canvas rendering
- Sets `document.body.style.margin = '0'; document.body.style.overflow = 'hidden'`
- Renders the slide at exactly 1920×1080 (or the deck's configured dimensions)
- Inlines the slide data as a JSON script tag; a minimal React renderer mounts it
- Sets `window.__slideReady = false` on page load
- Sets `window.__slideReady = true` after `document.fonts.ready` resolves and all `<img>` elements have `complete === true`
- For video elements: sets `video.currentTime = 0` and uses the element's `poster` attribute

This route serves as the Playwright navigation target. It does not need to be a full SPA route — a self-contained server-rendered HTML page with inlined slide data is sufficient.

---

## Section 6: Python Backend — FastAPI Export API

Create `python-backend/app/api/v1/presentations_export.py`. This follows the same pattern as `media_generation.py`.

### 6.1 Request/Response Models

```
PresentationExportRequest:
  render_spec: dict  (the full PresentationRenderSpec JSON from Node.js)
  quality: str       (draft | standard | high)
  format: str        (png | jpg | pdf | mp4)

PresentationExportJobResponse:
  celery_task_id: str
  status: str        (always "queued" initially)

PresentationExportStatusResponse:
  celery_task_id: str
  state: str         (queued | processing | done | error)
  percent: int       (0–100)
  stage: str | None
  output_url: str | None
  error_message: str | None
```

### 6.2 Endpoints

**`POST /api/v1/presentations/export`**

Accepts `PresentationExportRequest` (JWT bearer token required, validated via existing Python auth middleware). Creates the Celery task via `render_presentation.delay(render_spec, quality, format)`. Returns `PresentationExportJobResponse` with the Celery task ID.

**`GET /api/v1/presentations/export/{celery_task_id}`**

No request body. Looks up `AsyncResult(celery_task_id)` from Celery's result backend (Redis). Translates Celery state to `PresentationExportStatusResponse`. If state is `SUCCESS`, returns the output URL from the task result. If state is `FAILURE`, returns the error string.

### 6.3 Router Registration

Register the new router in `python-backend/app/main.py` under `/api/v1/presentations`.

---

## Section 7: Python Backend — Celery Render Task

Create `python-backend/app/tasks/presentation_render.py`. This is the core server-side rendering logic.

### 7.1 Task Signature and Queue Registration

```python
@celery_app.task(
    bind=True,
    soft_time_limit=660,      # 11 min soft limit (raise SoftTimeLimitExceeded)
    time_limit=720,           # 12 min hard limit (SIGKILL)
    acks_late=True,
    reject_on_worker_lost=True,
    max_retries=0,
    queue="presentation_export",
)
def render_presentation(self, render_spec: dict, quality: str, format: str) -> dict:
    """
    Render a presentation to the requested format.

    Returns: {"output_url": str, "output_bytes": int}
    """
```

**Required changes to `python-backend/app/core/celery_app.py`:**
1. Add `Queue("presentation_export")` to the `task_queues` list.
2. Add a `task_routes` entry: `"app.tasks.presentation_render.render_presentation": {"queue": "presentation_export"}`.

**Worker startup:** Run the presentation export worker as a dedicated process with limited concurrency to prevent OOM from multiple simultaneous Playwright instances:
```bash
celery -A app.core.celery_app worker -Q presentation_export -c 2 --hostname=presentation@%h
```
Document this in the operational runbook / `run-services.sh`.

### 7.2 Orchestration Logic

The task proceeds through named stages, calling `self.update_state(state="PROGRESS", meta={...})` after each stage:

**Stage 1: Rendering slides (0–75% progress)**

Generate a per-slide short-lived JWT (5-minute TTL) using `PyJWT`:
```python
import jwt, time
token = jwt.encode(
    {"sub": "internal-render", "scopes": ["internal:slide-render"], "deckId": deck_id, "slideIndex": idx, "exp": int(time.time()) + 300},
    os.environ["JWT_SECRET"],
    algorithm="HS256",
)
```
This requires `PyJWT` in `requirements.txt` and `JWT_SECRET` set as an environment variable in the Docker container and worker startup.

For each slide in `render_spec["slides"]`:
- Build render URL: `{INTERNAL_RENDER_BASE_URL}/internal/slide-render/{deck_id}/{index}` where `INTERNAL_RENDER_BASE_URL` is an environment variable (default: `http://localhost:3000`; must be `http://host.docker.internal:3000` when running inside Docker, since `localhost` inside a container refers to the container itself).
- Navigate Playwright to the URL, setting custom header: `page.set_extra_http_headers({"X-Internal-Token": token})`. **Do NOT append the token as a query parameter** — it would be logged by Nginx and Node.js access loggers.
- Wait for `window.__slideReady === true` (poll up to 10 seconds, 100ms intervals). If timeout is reached, log a warning (`logger.warning("Slide %d timed out waiting for __slideReady; capturing anyway", idx)`) and proceed — do not abort.
- Wait for `document.fonts.ready`
- Take screenshot with `animations="disabled"`, clip to `{width}x{height}`
- Save to temp dir as `slide_{index:04d}.png`
- Report progress: `percent = int((index + 1) / total * 75)`

Use a single Playwright browser context for all slides. Pass `--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu` to Chromium.

**Stage 2: Format-specific rendering (75–90% progress)**

For **mp4**:
- Build FFmpeg concat demuxer file: each slide image with its `duration_sec` (from `render_spec["slides"][i]["durationMs"] / 1000`)
- If audio tracks exist: concatenate per-slide audio clips with `afade` fade-out at each slide boundary; mix with project audio via `amix` filter (normalize=0, project audio attenuated by its volume setting); stream_loop=-1 for project audio if shorter than presentation
- Run FFmpeg: `libx264, pix_fmt=yuv420p, crf={quality_crf}, preset={quality_preset}, movflags=+faststart, r=30` (30fps matches the existing `buildPresentationRenderSpec()` default and the DB schema `fps` default)
- Quality presets: draft=CRF28/veryfast, standard=CRF23/medium, high=CRF18/slow

For **pdf**:
- For each slide, call `page.pdf(width="1920px", height="1080px", print_background=True, margin=0)`
- Merge all per-slide PDFs with `pypdf.PdfWriter`
- Landscape orientation if width > height

For **png**:
- Screenshots already captured as PNG; zip them

For **jpg**:
- Convert PNG screenshots to JPEG (quality=90) with Pillow; zip them

**Stage 3: Upload and return (90–100% progress)**

Upload the output file to S3/R2 via the Python storage client. Generate a 48-hour presigned download URL. Return `{"output_url": url, "output_bytes": file_size}`.

On `SoftTimeLimitExceeded`: clean up temp files, re-raise.
On any other exception: clean up temp files, let Celery mark the task as `FAILURE`.

### 7.3 Temp File Management

All intermediate files (screenshots, audio clips, concat list, output file) go under a per-job temp directory named by the job's idempotency key. The directory is cleaned up in a `finally` block at task completion (success or failure).

---

## Section 8: Frontend — ExportDialog Component

Create `apps/web/client/src/components/presentation/ExportDialog.tsx`.

This is a modal dialog (using the existing Radix UI `Dialog` primitive) with three states: **format selection**, **in-progress**, and **complete/error**.

### 8.1 Format Selection State

Rendered when the dialog is first opened. Shows:
- Format picker: MP4, PNG, JPG, PDF (radio buttons with icons and descriptions)
- Quality picker (only shown for MP4 and JPG): Draft / Standard / High
- "Export" button that calls `triggerExport` mutation

### 8.2 In-Progress State

Shown while export is running. Shows:
- Progress bar (0–100%) updated by polling `getExportStatus` every 2 seconds
- Current stage label (e.g., "Rendering slide 4 of 10", "Encoding video...")
- "Cancel" button (currently out of scope per spec, but leave a disabled placeholder)

Polling is implemented with TanStack Query `useQuery` with `refetchInterval: 2000` when `status` is `queued` or `processing`. Polling stops automatically when `status` is `done` or `error`.

### 8.3 Complete State

Shows a "Download" button linking to `downloadUrl`. Shows file size if available. Button opens the URL in a new tab. Dialog can be closed, and re-opening it does not restart the export (the exportId is kept in component state).

### 8.4 Error State

Shows the `errorMessage` from the status response. Shows a "Try Again" button that resets the dialog back to format selection state (clears the exportId from component state, allowing a fresh export).

---

## Section 9: Frontend — SlideAudioPanel Component

Create `apps/web/client/src/components/presentation/SlideAudioPanel.tsx`.

This component is rendered inside the right properties panel as a new "Audio" tab. It has two sections: per-slide audio and project-wide audio.

### 9.1 Per-Slide Audio Section

Displayed when a slide is selected in the editor. Shows:
- Whether this slide has an audio track configured
- An "Add Audio" button (opens a media library picker, filtering to audio file types: mp3, m4a, ogg)
- If configured: the selected audio file name/title, a volume slider (0–100%), start offset input (seconds), end time input (or "play to end" checkbox), and a "Remove" button

On save: calls `setSlideAudio` mutation with the current slide ID and the configured audio track (or null to remove).

### 9.2 Project-Wide Audio Section

Always shown (not dependent on slide selection). Shows:
- Whether the deck has a project audio track
- "Add Project Audio" button (same media library picker)
- If configured: file name/title, volume slider, loop toggle, fade-out duration input, and "Remove" button

On save: calls `setDeckAudio` mutation.

### 9.3 Media Library Integration

The audio picker should use the existing media library browser component (or a filtered subset of it) to select audio files. The component receives the selected `libraryItemId` from the picker. Audio files should be filtered by MIME type (`audio/*`) in the library query.

---

## Section 10: Frontend — PresentationEditor Modifications

`apps/web/client/src/pages/PresentationEditor.tsx` receives additive changes only.

### 10.1 Export Button in Toolbar

Add an "Export" button to the top toolbar (right side, next to existing Save button). Clicking it opens the `ExportDialog` modal. The button is disabled if `PRESENTATION_EXPORTS_ENABLED` feature flag is false (check via the existing feature flag system).

### 10.2 Audio Tab in Right Panel

Add an "Audio" tab to the right properties panel. The tab renders `SlideAudioPanel` with the currently selected slide ID and deck ID as props. The tab should be always visible (not gated on element selection).

### 10.3 Play Mode Button

Add a "Play" icon button to the toolbar (next to Export). It navigates to `/presentation/:itemId/play` using Wouter's `useLocation()` hook. This is a simple navigation link — no special logic needed.

### 10.4 Data Loading for Audio Panel

The editor's existing data loading hooks (`usePresentationDeck`, `usePresentationSlides`) should return audio fields now that the DB columns exist. No new queries are needed — the audio data is part of the existing deck/slide data.

---

## Section 11: Frontend — PresentationPlayMode Page

Create `apps/web/client/src/pages/PresentationPlayMode.tsx`. This is a new lazy-loaded page registered in `App.tsx`.

### 11.1 Route Registration

In `App.tsx`:
```
const PresentationPlayMode = lazy(() => import("@/pages/PresentationPlayMode"));
<Route path="/presentation/:itemId/play" component={PresentationPlayMode} />
```

### 11.2 Data Loading

On mount, calls `getPlayDeck` (the new tRPC query) with the `itemId` from the URL. This returns a `PresentationPlayDeckPayload` with resolved audio URLs. Displays a full-screen loading spinner until data is ready.

### 11.3 Rendering

Full-screen layout. The current slide is rendered using the same slide canvas rendering code as the editor, but in read-only mode (no drag handles, no selection UI). The canvas fills the viewport.

Transition between slides: CSS fade (opacity 0→1 over 300ms) or cut (instant) based on the deck's transition setting. If no transition is configured, use cut.

### 11.4 Controls Overlay

A translucent control bar at the bottom of the screen (visible on mouse hover / touch, auto-hides after 3 seconds):
- **Play/Pause** button (space bar keyboard shortcut)
- **Previous Slide** button (left arrow keyboard shortcut)
- **Next Slide** button (right arrow keyboard shortcut)
- **Slide counter** (e.g., "3 / 12")
- **Fullscreen** button (calls `document.documentElement.requestFullscreen()`)

Keyboard shortcuts are registered via `useEffect` + `window.addEventListener('keydown', ...)` on mount, cleaned up on unmount.

### 11.5 Auto-advance

When playing (not paused), a `setTimeout` advances to the next slide after `slide.durationMs` milliseconds. On pause, the timeout is cleared. On slide change, the timeout is cleared and reset.

---

## Section 12: Frontend — PlaybackEngine

Create `apps/web/client/src/presentation-canvas/play/PlaybackEngine.ts`.

This is a TypeScript class (not a React component) that encapsulates slide playback state. It follows the state machine:

```
IDLE → LOADING → PLAYING → PAUSED → SLIDE_TRANSITIONING → PLAYING
                                   → ENDED
```

### 12.1 API

```typescript
class PlaybackEngine {
  constructor(slides: PresentationSlidePayload[], onStateChange: (state: PlaybackState) => void)
  play(): void
  pause(): void
  goToSlide(index: number): void
  nextSlide(): void
  prevSlide(): void
  destroy(): void  // cleans up timers

  readonly currentIndex: number
  readonly isPlaying: boolean
  readonly state: PlaybackState
}
```

The engine does not manage audio directly — it notifies the `AudioTrackPlayer` via callbacks when slide transitions occur.

### 12.2 Timer Management

The engine uses a single `setTimeout` for auto-advance. On `pause()`, it records elapsed time to resume from the correct position. On `play()`, it schedules the next advance using remaining time if resuming mid-slide, or full `durationMs` for a fresh slide.

---

## Section 13: Frontend — AudioTrackPlayer

Create `apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts`.

This class manages up to two `<audio>` elements: one for per-slide audio and one for project-wide audio.

### 13.1 API

```typescript
class AudioTrackPlayer {
  constructor(projectAudioTrack: ResolvedProjectAudioTrack | null)
  onSlideEnter(slideAudioTrack: ResolvedAudioTrack | null): void
  onSlideExit(): void
  pause(): void
  resume(): void
  destroy(): void
}
```

### 13.2 Behavior

**Per-slide audio**: On `onSlideEnter()`, if `slideAudioTrack` is non-null, create or reuse an `<audio>` element, set `src`, `volume`, and `currentTime = startAtMs / 1000`. Call `.play()`. On `onSlideExit()`, pause and reset to `currentTime = 0`. Apply 0.5-second fade-out before pausing if the audio was mid-play.

**Project-wide audio**: Created once in the constructor if `projectAudioTrack` is non-null. Plays continuously. On `pause()`, pauses the project audio element. On `resume()`, resumes. If `loop` is true, set `audio.loop = true`. Volume is set to `projectAudioTrack.volume`.

Both audio elements are created as detached DOM elements (`new Audio(url)`) — they are not mounted in the React tree.

---

## Section 14: Infrastructure — Dockerfile and Environment

**Note: This section must be implemented at position 6 in the implementation order** (before Section 6 Python API and Section 7 Python Task), because the Celery worker runs inside this Docker container. If Playwright/Chromium are not installed in the image, the render task will fail at import time.

### 14.1 Dockerfile Changes

Modify `docker/Dockerfile.video-job-runner`. Add after the existing FFmpeg installation:

```
RUN pip install playwright PyJWT pypdf Pillow
RUN playwright install chromium --with-deps
```

The `--with-deps` flag installs Chromium's system library dependencies (libglib, libnss, etc.) required in the container environment.

Verify `pypdf` and `Pillow` are in `python-backend/requirements.txt` (for the test environment outside Docker).

### 14.2 Environment Variables

The presentation export Celery worker requires these environment variables in its Docker environment / systemd service / screen startup:

```
JWT_SECRET=<same value as apps/web/.env JWT_SECRET>
INTERNAL_RENDER_BASE_URL=http://host.docker.internal:3000
```

`INTERNAL_RENDER_BASE_URL` defaults to `http://localhost:3000` for local non-Docker development. Inside Docker, `localhost` refers to the container itself, so `host.docker.internal:3000` is the correct address to reach the Node.js web app on the Docker host.

### 14.3 Nginx Configuration

Add the following `location` block to **both** the HTTP (:80) server block and the HTTPS (:443) server block in `nginx/conf.d/dev-host.conf`, placed **before** the catch-all `location /` proxy block:

```nginx
location /internal/ {
    deny all;
    return 403;
}
```

This prevents the public internet from reaching the `/internal/slide-render/` route. The application-layer localhost check is a secondary defense only.

---

## Section 15: Testing Strategy

### 15.1 TypeScript Tests (Vitest)

**`presentationExportService.test.ts`** (unit):
- `createExportRecord` inserts correct initial values
- `updateExportRecord` performs partial update
- `getExportRecord` returns null for unknown ID

**`presentationPlaybackExport.test.ts`** (extend existing):
- `triggerPresentationExport` calls Python bridge with resolved render spec
- Audio tracks are resolved to URLs before Python call
- `getPresentationExportStatus` reads from DB and calls Python
- Python bridge errors are caught and stored as `status='error'`
- Throttle enforcement still works after adding jpg/pdf formats

**`presentation.test.ts`** (extend existing):
- `setSlideAudio` stores audio track, requires version match
- `setDeckAudio` stores project audio track
- `getPlayDeck` returns deck with resolved audio URLs
- `triggerExport` accepts jpg and pdf formats

**`PresentationPlayMode.test.tsx`** (component):
- Renders loading state while `getPlayDeck` is pending
- Renders slide canvas when data is ready
- Keyboard shortcut space advances play/pause
- Arrow keys advance slides

### 15.2 Python Tests (pytest)

**`test_presentations_export_api.py`** (`@pytest.mark.integration`):
- `POST /api/v1/presentations/export` returns `celery_task_id`, requires auth
- `GET /api/v1/presentations/export/{task_id}` returns progress dict
- Unauthenticated requests return 401

**`test_presentation_render_task.py`** (`@pytest.mark.unit`):
- `update_state` is called at correct progress percentages
- Temp directory is cleaned up on task failure (`SoftTimeLimitExceeded` and generic exception)
- Audio fade-out applied at slide boundary (test FFmpeg filter graph)
- Video element handling: poster attribute used when video cannot autoplay

**`test_render_pipeline.py`** (`@pytest.mark.slow`):
- End-to-end render of a 3-slide test deck to PNG zip (using local test assets, no real Playwright)
- Mock Playwright screenshots, verify concat file format

### 15.3 Coverage Requirement

Python render task must achieve ≥80% test coverage (project minimum). Mock Playwright in unit tests using `unittest.mock.patch`.

---

## Implementation Order

The sections must be implemented in this order because each depends on the previous:

1. **Section 1 (Database)** — schema changes must land first
2. **Section 2 (Shared Contracts)** — TypeScript types referenced by all layers
3. **Section 3 (Export Service)** — DB-backed export management
4. **Section 4 (tRPC Router)** — exposes new procedures using Section 2 types
5. **Section 5 (Slide Render Route + Nginx deny block)** — needed by Python renderer; add Nginx `/internal/` deny block here
6. **Section 14 (Infrastructure)** — Dockerfile with Playwright/Chromium must be built **before** Python code runs; also add `INTERNAL_RENDER_BASE_URL` env var and Celery queue registration to `celery_app.py`
7. **Section 6 (Python API)** — FastAPI endpoints
8. **Section 7 (Python Task)** — Celery task (depends on Dockerfile from step 6 being built)
9. **Section 8 (ExportDialog)** — frontend, depends on Section 4
10. **Section 9 (SlideAudioPanel)** — frontend, depends on Section 4
11. **Section 10 (Editor modifications)** — integrates Sections 8 & 9
12. **Section 12 (PlaybackEngine)** — pure TypeScript, no dependencies
13. **Section 13 (AudioTrackPlayer)** — pure TypeScript, no dependencies
14. **Section 11 (PlayMode page)** — depends on Sections 12 & 13
15. **Section 15 (Tests)** — written alongside implementation (TDD where feasible)

Sections 12 and 13 can be implemented in parallel since they have no dependencies on each other. Sections 7 and 8–11 can also be developed in parallel once Section 6 (Python API) is complete.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Playwright can't render React slides correctly headless | Medium | High | Test internal render route early with a minimal slide; add `window.__slideReady` sentinel; use explicit `waitForFunction` |
| FFmpeg audio sync drift in long presentations | Low | Medium | Use concat demuxer with explicit per-slide durations; test with 10+ slide decks |
| Python render task exceeds 12-min hard time limit | Low | High | Profile render time for 10 slides at high quality; set per-slide timeout; recommend draft quality for large decks |
| Celery worker OOM from running multiple Playwright instances | Medium | High | Set worker concurrency to 2 for `presentation_export` queue; add memory limit to Docker |
| `pix_fmt=yuv420p` causes color shift on slides with alpha channels | Low | Low | PNGs with transparency will have white background fill in MP4; document as known limitation |
| `/internal/slide-render` route accidentally exposed via Nginx | Low | High | **MITIGATED in plan**: Section 14.3 requires adding `location /internal/ { deny all; }` to Nginx config. Application-layer localhost check (all three loopback variants) is a secondary defense. JWT uses `X-Internal-Token` header (not query param) to avoid log leakage. |
