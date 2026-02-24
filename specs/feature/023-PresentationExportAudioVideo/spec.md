# Feature Spec: Presentation Export, Audio Support & Video Playback
**Spec ID:** 023-PresentationExportAudioVideo
**Created:** 2026-02-23
**Status:** Draft — awaiting /deep-plan

---

## 1. Problem Statement

The Presentation Editor currently has three critical missing capabilities:

1. **Export** — `triggerExport` tRPC procedure exists but is a no-op stub. Users cannot actually export their presentations to MP4, PNG/JPG, or PDF.
2. **Audio** — There is no audio support: no per-slide background audio, no project-wide audio track, and no audio element type on the canvas.
3. **Video playback in play mode** — There is no presentation play mode UI. Video elements on slides cannot be interacted with during a presentation.

---

## 2. Goals

### 2.1 Export (MP4 / PNG+JPG / PDF)
- Users can export a presentation deck to **MP4** (video with transitions + audio).
- Users can export to **PNG or JPG** (one image per slide, zipped).
- Users can export to **PDF** (one page per slide, printable).
- Export jobs run **server-side** (Python Celery task using headless Chromium + FFmpeg).
- Users see **real-time export progress** with ETA (via polling `getExportStatus`).
- Completed export produces a **signed S3/R2 URL** for download.
- Export is **throttled** (existing: 6/min per user, 4/deck — preserve this).

### 2.2 Audio Support
- **Per-slide audio track**: each slide can have one background audio track (MP3/MP4/OGG, max 5 min).
- **Project-wide audio track**: one continuous audio track attached to the deck (plays across all slides).
- Audio files stored in the **existing media library** (library_item_id reference).
- Audio **volume control** per track (0.0–1.0).
- Audio tracks are **exported** (mixed into MP4 output by FFmpeg).

### 2.3 Video Playback in Play Mode
- New **PresentationPlayMode** page at route `/presentation/:deckId/play`.
- Slides auto-advance per their `durationMs` with transition (cut/fade).
- **Video elements auto-play** when their slide becomes active.
- **Per-slide audio track** plays while that slide is shown.
- **Project-wide audio loops by default** (user can toggle off in editor); plays continuously across all slides.
- Playback controls: **Play/Pause, Prev Slide, Next Slide, Fullscreen**.
- **Access control:** Play mode requires authentication (same as editor). Public share links are future scope (out of scope here).

---

## 3. Out of Scope

- Real-time collaborative editing during playback.
- Speaker notes display during play mode (can be added later).
- Remote presenter control / remote clicker.
- Audio recording within the editor (only upload from media library).
- Custom FFmpeg filter chains or video effects.
- Exporting individual elements as assets.

---

## 4. Affected Domains

| Domain | Impact |
|--------|--------|
| **CMD-1 Frontend** | Export dialog UI, Audio attachment UI in editor, PresentationPlayMode page |
| **CMD-2 Backend (tRPC)** | New/modified tRPC procedures (export tracking, audio metadata, play mode) |
| **CMD-4 Database** | New `presentation_exports` table, audio fields in slides/decks schema |
| **CMD-3 Python** | Celery render task (Playwright + FFmpeg), audio mixing; new FastAPI endpoints for export job management |
| **CMD-5 Infrastructure** | Add `playwright install chromium` to Dockerfile.video-job-runner |

---

## 5. Technical Architecture

### 5.1 Export Architecture (Server-Side Headless Rendering)

**Selected approach:** Server-side headless rendering via Celery.

**Rationale:**
- Canvas uses DOM + SVG (not Konva), so client-side canvas capture is unreliable.
- `ffmpeg.wasm` is too resource-intensive for browser-side video composition.
- Server-side approach gives consistent quality, supports audio mixing, and provides progress feedback.

**Node.js ↔ Python bridge:** Node.js calls Python backend via **HTTP REST** (same pattern as existing media tasks). Example: `POST http://localhost:8000/api/v1/presentations/export`. Python FastAPI receives, creates Celery task, returns `jobId`. Node.js polls `GET /api/v1/presentations/export/{jobId}` for progress.

**Slide render URL for Playwright:** A new internal-only Express route `GET /internal/slide-render/:deckId/:slideIndex?token=<signed>` serves a minimal HTML page with the slide rendered in isolation (no editor chrome). Playwright navigates to `http://localhost:3000/internal/slide-render/:deckId/:slideIndex` to capture screenshots. This route is not exposed via Nginx (localhost only).

**Rendering stack choice:** Use **Playwright (Python playwright package)** instead of pyppeteer. `Dockerfile.video-job-runner` already has FFmpeg — add Chromium via `playwright install chromium` in that Dockerfile. The main `Dockerfile.python-orchestrator` does NOT need Chromium (rendering runs in Celery workers, not the API server).

**Flow:**
```
Client → tRPC triggerExport (format, quality)
       → Node.js → POST /api/v1/presentations/export (Python FastAPI)
       → Celery task: render_presentation
         → Playwright screenshots each slide (via localhost:3000/internal/slide-render)
         → FFmpeg composes PNG sequence + audio tracks
         → Upload to S3/R2
         → Update presentation_exports row (status, url)
       → Node.js polls GET /api/v1/presentations/export/{jobId}
       → Client receives signed download URL
```

**Export formats:**
- `png` / `jpg`: ZIP of individual slide images (rendered via Puppeteer screenshot)
- `pdf`: PDF via Puppeteer's `page.pdf()` (multi-page, one slide per page)
- `mp4`: PNG sequence via Puppeteer + audio mixing via FFmpeg

**New DB table:** `presentation_exports`
```sql
id serial PK
deck_id FK → presentation_decks
user_id FK → users
format "png"|"jpg"|"pdf"|"mp4"
status "queued"|"processing"|"done"|"error"
progress_pct integer (0–100)
error_message text nullable
output_url text nullable (S3 signed URL or permanent path)
output_bytes bigint nullable
width integer
height integer
fps integer nullable (mp4 only)
idempotency_key varchar(128) unique
created_at timestamp
updated_at timestamp
```

### 5.2 Audio Architecture

**Schema additions:**

```typescript
// In presentationSlideContentSchema (shared/presentation/contracts.ts):
audioTrack: z.object({
  libraryItemId: z.number().int().positive(),
  volume: z.number().min(0).max(1).default(1),
  startAtMs: z.number().int().min(0).default(0),
  endAtMs: z.number().int().min(0).nullable().default(null), // null = play to end
}).optional()

// In presentation_decks (DB column):
project_audio_track JSONB nullable
// Shape: { libraryItemId, volume, loop: boolean, fadeOutMs?: number }
```

**No new audio element type on canvas** — audio is slide/deck metadata, not a draggable canvas element.

**Audio storage:** Uses existing `library_items` table + `presentation_asset_links` to track usage.

### 5.3 Video Playback Architecture

**New route:** `/presentation/:deckId/play`

**Component:** `PresentationPlayMode.tsx` (new page, lazy-loaded)

**Play state machine:**
```
IDLE → LOADING → PLAYING → PAUSED → SLIDE_TRANSITIONING → (next slide) → PLAYING
                                  → ENDED
```

**Video handling during play:**
- Video elements rendered as `<video>` tags (not canvas overlay).
- On slide enter: call `videoRef.play()`.
- On slide exit: call `videoRef.pause()` + `videoRef.currentTime = 0`.
- `muted` flag from slide element schema respected.

**Audio handling during play:**
- Per-slide audio: `<audio>` element, play on slide enter, pause on exit.
- Project audio: single `<audio>` element persisted across slides, plays continuously.
- Volume from metadata.

---

## 6. New Files Required

```
New:
  apps/web/client/src/pages/PresentationPlayMode.tsx
  apps/web/client/src/presentation-canvas/play/PlaybackEngine.ts
  apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts
  apps/web/client/src/components/presentation/ExportDialog.tsx
  apps/web/client/src/components/presentation/SlideAudioPanel.tsx
  apps/web/server/services/presentationExportService.ts
  apps/web/drizzle/XXXX_presentation_exports_audio.sql
  python-backend/app/tasks/presentation_render.py
  python-backend/app/tasks/presentation_render_audio.py
  python-backend/app/api/v1/presentations_export.py  (FastAPI endpoint — HTTP bridge)
  apps/web/server/routes/slideRender.ts  (internal Playwright target route)

Modified:
  apps/web/shared/presentation/contracts.ts (audio schema additions)
  apps/web/drizzle/schema.ts (presentation_exports table, deck audio column)
  apps/web/server/routers/presentation.ts (export status + audio procedures)
  apps/web/server/services/presentationPlaybackExport.ts (wire up real job queue)
  apps/web/server/services/presentationService.ts (audio fields CRUD)
  apps/web/client/src/pages/PresentationEditor.tsx (export button, audio panel)
  apps/web/client/src/App.tsx (add play mode route)
  docker/Dockerfile.video-job-runner (add playwright install chromium)
```

---

## 7. API Contracts (tRPC Additions)

```typescript
// Existing — extend:
presentation.triggerExport.input: {
  deckId: number
  format: "png" | "jpg" | "pdf" | "mp4"  // add jpg, pdf
  quality?: "draft" | "standard" | "high"
  idempotencyKey: string
}
presentation.getExportStatus.output: {
  exportId: number
  status: "queued" | "processing" | "done" | "error"
  progressPct: number
  downloadUrl?: string
  errorMessage?: string
}

// New:
presentation.setSlideAudio.input: {
  slideId: number
  audioTrack: { libraryItemId: number; volume: number; startAtMs: number } | null
}
presentation.setDeckAudio.input: {
  deckId: number
  projectAudio: { libraryItemId: number; volume: number; loop: boolean } | null
}
presentation.getPlayDeck.input: { deckId: number }
presentation.getPlayDeck.output: PresentationSlideshowPayload  // extend with audio fields
```

---

## 8. Constraints

- **Do NOT break existing editor** — all changes to PresentationEditor.tsx are additive.
- **Preserve export throttling** (6/min per user, 4/deck).
- **No audio element on canvas** — audio is metadata only (not draggable).
- **Audio files must be from media library** — no direct URL input.
- **Play mode is read-only** — no editing from play mode route.
- **PDF export uses portrait/landscape based on canvas aspect ratio**.
- **Export to MP4 respects `durationMs` and transitions** from slide schema.

---

## 9. Open Questions for /deep-plan

1. **MP4 FPS and encoding**: What default FPS for MP4? (24, 30, 60?) What quality preset for FFmpeg? (`crf 18` for high, `crf 28` for draft?)
2. **Slide render URL**: How does Puppeteer access the slide render endpoint? (internal preview URL? or separate render-only SSR route?)
3. **Audio file format support**: Which formats? MP3 + AAC minimum, or also WAV/OGG?
4. **Audio sync**: When slide `durationMs` < audio duration, fade out audio or cut?
5. **Project audio behavior**: Should project audio pause when presentation is paused?
6. **Export timeout**: What is max allowed export time? 5 min? 10 min?
7. **Video-in-slide during MP4 export**: Should embedded videos play during Puppeteer render? Or replace with poster image?
8. ~~Play mode access control~~ — **RESOLVED**: Authenticated only. Public share links = future scope.

---

## 10. Success Criteria

- [ ] User can export a 10-slide deck to MP4 (with audio) in < 2 minutes.
- [ ] User can export to PNG/JPG ZIP (per-slide images) and PDF.
- [ ] Export progress shown in real-time (0–100%).
- [ ] Completed export generates a downloadable link (valid for ≥ 24h).
- [ ] User can attach an audio file from media library to any slide.
- [ ] User can attach a project-wide audio track.
- [ ] Audio plays correctly in play mode (per-slide + continuous).
- [ ] Video elements auto-play on slide entry in play mode.
- [ ] Play mode supports fullscreen, prev/next, and play/pause controls.
- [ ] All existing presentation editor tests still pass.
