# Combined Specification: Presentation Export, Audio Support & Video Playback

Feature: 023-PresentationExportAudioVideo
Date: 2026-02-23

This document synthesizes the original spec, codebase research, and interview decisions into a single authoritative specification.

---

## 1. Problem Statement

The Presentation Editor has three critical missing capabilities:

1. **Export** — `triggerExport` tRPC procedure exists but is a no-op stub. Users cannot export to MP4, PNG/JPG, or PDF.
2. **Audio** — No per-slide background audio, no project-wide audio track.
3. **Video playback in play mode** — No `PresentationPlayMode` page exists.

---

## 2. What We're Building

### 2.1 Export (MP4 / PNG / JPG / PDF)

Users can export a presentation to four formats:
- **MP4**: Video with slide transitions, slide audio, and project-wide audio mixed via FFmpeg
- **PNG**: One PNG image per slide, zipped
- **JPG**: One JPG image per slide, zipped
- **PDF**: Multi-page PDF, one slide per page, portrait/landscape based on canvas aspect ratio

Export jobs run server-side in Python Celery workers using headless Chromium (Playwright) + FFmpeg.

Users see real-time export progress (0–100%) with the current stage label. A signed S3/R2 URL (48-hour TTL) is generated when export completes.

Export throttling is preserved: 6 exports/min per user, 4 exports/min per deck.

### 2.2 Audio Support

**Per-slide audio track**: Each slide can have one background audio track (MP3/AAC/OGG, max 5 min) selected from the media library. Configurable volume (0.0–1.0) and start offset.

**Project-wide audio track**: One continuous audio track for the entire deck, plays across all slides. Configurable volume, loop flag, and optional fade-out duration.

Audio is **metadata only** (not a canvas element). Audio is stored as JSONB fields in the deck/slide records, pointing to media library items by ID.

Audio files in MP4 export: per-slide audio fades out (0.5s) at slide boundary; project audio loops if needed.

### 2.3 Video Playback in Play Mode

New **PresentationPlayMode** page at route `/presentation/:itemId/play`.

- Slides auto-advance per `durationMs` with cut/fade transitions
- Video elements auto-play on slide entry
- Per-slide audio plays while the slide is shown
- Project-wide audio plays continuously across all slides
- Controls: Play/Pause, Prev Slide, Next Slide, Fullscreen
- Access: authenticated users only (same JWT as editor)
- Play mode is read-only — no editing

---

## 3. Architecture Decisions (Confirmed)

### 3.1 Export Flow

```
User clicks Export →
  tRPC triggerExport →
    1. Enforce throttle (in-memory, preserve existing)
    2. Check deduplication (existing, preserve)
    3. Resolve audio library item URLs (Node.js, not Python)
    4. Write presentation_exports row (status='queued')
    5. POST to Python: /api/v1/presentations/export
       └─ Python creates Celery task, returns celery_task_id
    6. Update presentation_exports row with celery_task_id
    7. Return exportId to client

Client polls getExportStatus every 2s →
  tRPC getExportStatus →
    1. GET /api/v1/presentations/export/{celery_task_id}
    2. Python returns {state, percent, stage, output_url}
    3. If done: update presentation_exports row (status='done', output_url)
    4. Return status to client

Client receives signed URL → download link shown
```

### 3.2 Internal Slide Render Endpoint

Express route (localhost only, not Nginx-exposed):
`GET /internal/slide-render/:deckId/:slideIndex?token=<JWT>`

- Token: `signBearerToken({ scopes: ["internal:slide-render"], deckId, slideIndex })` — short-lived (15 min)
- Returns minimal HTML page: slide rendered in isolation (no editor chrome, no nav)
- Sets `window.__slideReady = false` during loading, `true` when all elements are painted
- Video elements: `video.currentTime = 0`, show poster attribute

### 3.3 Python Render Task Flow

```
Celery task: render_presentation
  Input: PresentationRenderSpec (with resolved audio URLs)

  1. Launch Playwright browser (1920x1080 viewport)
  2. For each slide:
     a. Navigate to localhost:3000/internal/slide-render/:deckId/:slideIndex?token=<JWT>
     b. Wait for window.__slideReady === true
     c. Wait for document.fonts.ready
     d. Screenshot → slide_0001.png
     e. update_state(state="PROGRESS", percent=0-75%)

  3. If format==mp4:
     a. Build FFmpeg concat file with per-slide durations
     b. Mix audio: per-slide afade + project audio loop
     c. Encode: libx264, CRF per quality preset, pix_fmt=yuv420p
     d. update_state(percent=85%)

  4. If format==pdf:
     a. Navigate each slide, call page.pdf() with print_background=True
     b. Merge pages with pypdf
     c. update_state(percent=85%)

  5. If format==png or jpg:
     a. Convert screenshots (JPEG compression if jpg)
     b. Zip all images
     c. update_state(percent=85%)

  6. Upload to S3/R2, generate 48-hour presigned URL
     update_state(percent=95%)

  7. Return {output_url, output_bytes}
     update_state(percent=100%)
```

### 3.4 Audio URL Resolution

Before the render spec is sent to Python, Node.js resolves all audio `libraryItemId` references to actual signed download URLs. The render spec sent to Python is fully self-contained — Python never queries the library.

Structure added to render spec:
```typescript
interface ResolvedAudioTrack {
  url: string;         // presigned S3/R2 download URL (48h)
  volume: number;      // 0.0 to 1.0
  startAtMs: number;
  endAtMs: number | null;
}
```

### 3.5 Export Failure and Retry

- On Celery task error/timeout: Node.js polling detects `state="FAILURE"` → updates `presentation_exports` row to `status='error'`
- Client sees error state in ExportDialog with error message
- User can click Export again — creates a new DB record + new Celery job (old failed record is preserved)
- No auto-retry for export tasks (`max_retries=0` in Celery)

---

## 4. Database Changes

### 4.1 New Table: `presentation_exports`

```sql
CREATE TABLE presentation_exports (
  id                SERIAL PRIMARY KEY,
  deck_id           INTEGER NOT NULL REFERENCES presentation_decks(id),
  user_id           INTEGER NOT NULL REFERENCES users(id),
  tenant_id         VARCHAR(36) NOT NULL,
  format            VARCHAR(4) NOT NULL CHECK (format IN ('png','jpg','pdf','mp4')),
  status            VARCHAR(16) NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','processing','done','error','cancelled')),
  progress_pct      INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  stage             VARCHAR(64),
  error_message     TEXT,
  output_url        TEXT,
  output_bytes      BIGINT,
  width             INTEGER NOT NULL DEFAULT 1920,
  height            INTEGER NOT NULL DEFAULT 1080,
  fps               INTEGER,
  quality           VARCHAR(12),
  celery_task_id    VARCHAR(255),
  idempotency_key   VARCHAR(128) UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_presentation_exports_deck_id ON presentation_exports(deck_id);
CREATE INDEX idx_presentation_exports_user_id ON presentation_exports(user_id);
CREATE INDEX idx_presentation_exports_celery_task_id ON presentation_exports(celery_task_id);
```

### 4.2 Add Audio Columns

```sql
-- Per-slide audio track (JSONB nullable)
ALTER TABLE presentation_slides
  ADD COLUMN audio_track JSONB;
-- Shape: { libraryItemId: number, volume: number, startAtMs: number, endAtMs: number|null }

-- Project-wide audio track (JSONB nullable)
ALTER TABLE presentation_decks
  ADD COLUMN project_audio_track JSONB;
-- Shape: { libraryItemId: number, volume: number, loop: boolean, fadeOutMs?: number }
```

---

## 5. tRPC API Changes

### 5.1 Extend `triggerExport`

```typescript
// Current: format: z.enum(["png", "mp4"])
// New:
format: z.enum(["png", "jpg", "pdf", "mp4"])
quality: z.enum(["draft", "standard", "high"]).default("standard").optional()
idempotencyKey: z.string().min(1).max(128)  // make required
```

### 5.2 Extend `getExportStatus` response

```typescript
interface PresentationExportStatusResult {
  exportId: number;   // DB row ID (integer, not string)
  status: "queued" | "processing" | "done" | "error";
  progressPct: number;
  stage?: string;
  downloadUrl?: string;
  errorMessage?: string;
}
```

### 5.3 New tRPC Procedures

```typescript
// Set per-slide audio track (null removes it)
presentation.setSlideAudio.input: {
  deckId: number
  slideId: number
  expectedVersion: number
  audioTrack: {
    libraryItemId: number
    volume: number            // 0.0 to 1.0
    startAtMs: number         // default 0
    endAtMs: number | null    // null = play to end
  } | null
}

// Set project-wide audio track (null removes it)
presentation.setDeckAudio.input: {
  deckId: number
  expectedVersion: number
  projectAudio: {
    libraryItemId: number
    volume: number
    loop: boolean
    fadeOutMs: number | null
  } | null
}

// Get full deck for play mode (extends getSlideshow with audio fields)
presentation.getPlayDeck.input: { itemId: number }
presentation.getPlayDeck.output: PresentationPlayDeckPayload
// Extends PresentationSlideshowPayload with:
//   - slides[].audioTrack?: ResolvedAudioTrack
//   - projectAudioTrack?: ResolvedAudioTrack
```

---

## 6. New Files

```
Frontend (new):
  apps/web/client/src/pages/PresentationPlayMode.tsx
  apps/web/client/src/presentation-canvas/play/PlaybackEngine.ts
  apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts
  apps/web/client/src/components/presentation/ExportDialog.tsx
  apps/web/client/src/components/presentation/SlideAudioPanel.tsx

Backend Node.js (new):
  apps/web/server/services/presentationExportService.ts
  apps/web/server/routes/slideRender.ts

Database (new):
  apps/web/drizzle/XXXX_presentation_exports_audio.sql

Python (new):
  python-backend/app/tasks/presentation_render.py
  python-backend/app/api/v1/presentations_export.py

Tests (new):
  apps/web/server/services/presentationExportService.test.ts
  python-backend/tests/test_presentations_export_api.py
  python-backend/tests/test_presentation_render_task.py
```

## 7. Modified Files

```
apps/web/shared/presentation/contracts.ts
  - Add audioTrack to PresentationSlidePayload
  - Add projectAudioTrack to PresentationSlideshowPayload
  - Add ResolvedAudioTrack interface
  - Extend PresentationRenderSpec with audio fields
  - Extend format enum with "jpg" | "pdf"

apps/web/drizzle/schema.ts
  - Add presentation_exports table
  - Add audioTrack column to presentationSlides
  - Add projectAudioTrack column to presentationDecks

apps/web/server/routers/presentation.ts
  - Extend triggerExport input (jpg, pdf, quality)
  - Extend getExportStatus output
  - Add setSlideAudio, setDeckAudio, getPlayDeck procedures

apps/web/server/services/presentationPlaybackExport.ts
  - Replace defaultEnqueueExportJob() stub with real HTTP call to Python
  - Add audio URL resolution before building render spec
  - Wire status polling to Python backend

apps/web/server/services/presentationService.ts
  - Add updateSlideAudio(), updateDeckAudio() CRUD functions

apps/web/client/src/pages/PresentationEditor.tsx
  - Add Export button to toolbar
  - Add SlideAudioPanel as new right panel tab
  - Add "Play" button linking to play mode route

apps/web/client/src/App.tsx
  - Add lazy-loaded route: /presentation/:itemId/play

docker/Dockerfile.video-job-runner
  - Add: RUN playwright install chromium --with-deps
```

---

## 8. Constraints (Non-Negotiable)

- Do NOT break existing PresentationEditor tests
- Preserve export throttling (6/min per user, 4/deck)
- Audio is metadata only — no audio canvas element type
- Audio files must come from the media library — no direct URL input
- Play mode is read-only
- PDF orientation based on canvas aspect ratio (>1 = landscape, <1 = portrait)
- pix_fmt=yuv420p always set in MP4 (required for Apple/mobile playback)
- Export URL TTL: 48 hours
- Play mode route uses libraryItemId: `/presentation/:itemId/play`

---

## 9. Success Criteria

- [ ] User can export a 10-slide deck to MP4 (with audio) in < 2 minutes
- [ ] User can export to PNG/JPG ZIP and PDF
- [ ] Export progress shown in real-time (0–100%) with stage label
- [ ] Completed export generates a 48-hour downloadable link
- [ ] User can attach audio from media library to any slide
- [ ] User can attach a project-wide audio track
- [ ] Audio plays correctly in play mode (per-slide + continuous)
- [ ] Video elements auto-play on slide entry in play mode
- [ ] Play mode supports fullscreen, prev/next, play/pause controls
- [ ] All existing presentation editor tests still pass
- [ ] Python render task test coverage ≥ 80%
