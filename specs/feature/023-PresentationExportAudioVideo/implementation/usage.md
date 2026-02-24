# Feature 023: Presentation Export & Audio/Video — Usage Guide

Generated: 2026-02-24
Implementation: 15 sections, 15 commits
Branch: `main`

---

## Overview

This feature adds audio-narrated presentations and multi-format export to SmartSpecPro.
Users can:
- Add audio narration to individual slides and project-level background tracks
- Export presentations as PNG ZIPs, JPG ZIPs, PDF, or MP4 video
- Play presentations in an immersive full-screen mode with audio and slide transitions

---

## Quick Start

### 1. Export a Presentation

Navigate to a presentation in the editor, then click the **Export** button in the toolbar.

```
Formats available:
  PNG ZIP   — lossless screenshots of every slide (1920×1080)
  JPG ZIP   — compressed screenshots (configurable quality)
  PDF       — multi-page PDF (one slide per page)
  MP4       — video with optional narration, configurable FPS + quality
```

Export jobs run as Celery tasks and return a download URL when ready.
Poll for completion:

```typescript
// tRPC query — auto-polls while status === "processing"
const { data } = trpc.presentation.getExportStatus.useQuery(
  { exportId },
  { refetchInterval: (d) => (d?.status === "processing" ? 2000 : false) }
);
```

### 2. Add Audio to a Slide

Open the **Audio** panel in the slide editor (bottom-right panel area):

```
SlideAudioPanel → AudioPickerDialog
  - Select from Media Library (generated audio clips)
  - Set volume (0–1)
  - Set start offset (startAtMs)
  - Optionally set end trim (endAtMs)
```

The audio config is stored in `presentation_slides.audio_track_json` and included in the render spec.

### 3. Play a Presentation

Click the **Play** button in the editor toolbar. This opens `/presentation/:deckId/play` in a new tab.

Controls:
- `Space` — play / pause
- `→` / `←` — next / previous slide
- `Escape` — return to editor
- Click slide — advance

---

## API Reference

### tRPC Router (`presentation.*`)

Defined in [apps/web/server/routers/presentationExport.ts](../../../../../../apps/web/server/routers/presentationExport.ts)

| Procedure | Type | Description |
|---|---|---|
| `presentation.startExport` | mutation | Enqueue a render job; returns `exportId` |
| `presentation.getExportStatus` | query | Poll status + download URL |
| `presentation.cancelExport` | mutation | Cancel a pending job |
| `presentation.updateSlideAudio` | mutation | Set audio config for a slide |
| `presentation.removeSlideAudio` | mutation | Clear audio from a slide |
| `presentation.updateProjectAudio` | mutation | Set deck-level background audio |

#### startExport input

```typescript
{
  deckId: number;
  format: "png" | "jpg" | "pdf" | "mp4";
  quality: "draft" | "standard" | "high";
  fps?: number;          // MP4 only, default 30
  width?: number;        // default 1920
  height?: number;       // default 1080
}
```

#### getExportStatus response

```typescript
{
  exportId: string;
  status: "pending" | "processing" | "complete" | "failed";
  downloadUrl?: string;    // present when status === "complete"
  errorMessage?: string;   // present when status === "failed"
  progressPct?: number;    // 0–100
}
```

---

### Python FastAPI Endpoints

Base URL: `http://localhost:8000/api/v1`

| Method | Path | Description |
|---|---|---|
| `POST` | `/presentations/export` | Trigger Celery render task |
| `GET` | `/presentations/export/{export_id}` | Poll task status |
| `POST` | `/presentations/export/{export_id}/cancel` | Cancel task |

#### POST /presentations/export — Request Body

```json
{
  "export_id": "uuid",
  "deck_id": 42,
  "tenant_id": "tenant-abc",
  "format": "mp4",
  "quality": "standard",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "slides": [
    {
      "slideId": 1,
      "orderIndex": 0,
      "durationMs": 5000,
      "transition": "fade",
      "elements": [],
      "audioTrack": {
        "url": "https://cdn.example.com/audio.mp3",
        "volume": 0.8,
        "startAtMs": 0,
        "endAtMs": null
      }
    }
  ],
  "projectAudioTrack": null
}
```

---

### Internal Slide Render Route (Node.js)

**Not public — Playwright only.** Blocked at Nginx `/internal/` deny rule.

```
GET /internal/slide-render/:deckId/:slideIndex
```

- Requires `Authorization: Bearer <jwt>` signed with `JWT_SECRET` (5-min TTL)
- Returns a fully-rendered HTML slide for Playwright screenshot capture
- Signals readiness via `window.__slideReady = true`

---

### Shared Contracts

Defined in [packages/shared/src/presentation/contracts.ts](../../../../../../packages/shared/src/presentation/contracts.ts)

```typescript
// Render spec sent from Node → Python for a render job
interface PresentationRenderSpec {
  schemaVersion: "presentation_render_v1";
  deckId: number;
  tenantId: string;
  format: "png" | "jpg" | "pdf" | "mp4";
  quality: "draft" | "standard" | "high";
  width: number; height: number; fps: number;
  slides: RenderSlideSpec[];
  projectAudioTrack: ResolvedProjectAudioTrack | null;
}

// Audio config attached to a single slide
interface ResolvedAudioTrack {
  url: string; volume: number; startAtMs: number; endAtMs: number | null;
}

// Deck-level continuous background audio
interface ResolvedProjectAudioTrack {
  url: string; volume: number; loop: boolean;
}
```

---

## Infrastructure

### Celery Worker (Presentation Export)

Start the dedicated worker (limited to 2 concurrent Playwright instances):

```bash
celery -A app.core.celery_app worker \
  -Q presentation_export \
  -c 2 \
  --hostname=presentation@%h \
  -l info
```

Required environment variables for the worker:

| Variable | Value |
|---|---|
| `JWT_SECRET` | Same value as `apps/web/.env` |
| `INTERNAL_RENDER_BASE_URL` | `http://localhost:3000` (local) or `http://host.docker.internal:3000` (Docker) |

### Dockerfile

The worker image is `docker/Dockerfile.video-job-runner`.
Playwright + Chromium are installed in the final stage:

```dockerfile
RUN pip install playwright PyJWT pypdf Pillow
RUN playwright install chromium --with-deps
```

---

## Database Tables

New tables created in `drizzle/schema.ts`:

- **`presentation_exports`** — tracks export jobs (status, format, download URL, error)
- **`presentation_slides.audio_track_json`** — added column (nullable JSON) for per-slide audio
- **`presentation_decks.project_audio_track_json`** — added column (nullable JSON) for background audio

---

## Key Source Files

| Layer | File |
|---|---|
| DB Schema | [drizzle/schema.ts](../../../../../../drizzle/schema.ts) |
| Shared Contracts | [packages/shared/src/presentation/contracts.ts](../../../../../../packages/shared/src/presentation/contracts.ts) |
| tRPC Router | [apps/web/server/routers/presentationExport.ts](../../../../../../apps/web/server/routers/presentationExport.ts) |
| Export Service (Node) | [apps/web/server/services/presentationExportService.ts](../../../../../../apps/web/server/services/presentationExportService.ts) |
| Slide Render Route | [apps/web/server/routers/slideRender.ts](../../../../../../apps/web/server/routers/slideRender.ts) |
| FastAPI Endpoints | [python-backend/app/api/v1/presentations_export.py](../../../../../../python-backend/app/api/v1/presentations_export.py) |
| Celery Render Task | [python-backend/app/tasks/presentation_render.py](../../../../../../python-backend/app/tasks/presentation_render.py) |
| Export Dialog UI | [apps/web/client/src/presentation-canvas/export/ExportDialog.tsx](../../../../../../apps/web/client/src/presentation-canvas/export/ExportDialog.tsx) |
| Slide Audio Panel UI | [apps/web/client/src/presentation-canvas/editor/SlideAudioPanel.tsx](../../../../../../apps/web/client/src/presentation-canvas/editor/SlideAudioPanel.tsx) |
| Play Mode Page | [apps/web/client/src/pages/PresentationPlayMode.tsx](../../../../../../apps/web/client/src/pages/PresentationPlayMode.tsx) |
| Playback Engine | [apps/web/client/src/presentation-canvas/play/PlaybackEngine.ts](../../../../../../apps/web/client/src/presentation-canvas/play/PlaybackEngine.ts) |
| Audio Track Player | [apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts](../../../../../../apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts) |
| Celery App (queues) | [python-backend/app/core/celery_app.py](../../../../../../python-backend/app/core/celery_app.py) |

---

## Running Tests

### TypeScript (Vitest)

```bash
cd apps/web
pnpm test                          # All tests
pnpm test presentation             # Only presentation tests
pnpm test PlaybackEngine           # Specific test file
```

Key test files:
- `src/presentation-canvas/play/PlaybackEngine.test.ts` — 18 tests
- `src/presentation-canvas/play/AudioTrackPlayer.test.ts` — 15 tests
- `src/presentation-canvas/export/ExportDialog.test.tsx` — stub (TDD scaffolding)
- `src/presentation-canvas/editor/SlideAudioPanel.test.tsx` — stub (TDD scaffolding)

### Python (pytest)

```bash
cd python-backend
uv run pytest tests/test_presentations_export_api.py -v   # FastAPI endpoint tests
uv run pytest tests/test_presentation_render_task.py -v   # Celery task unit tests
uv run pytest -m slow                                      # Integration pipeline tests (Playwright mocked)
```

Integration tests mock only Playwright screenshots and R2 upload;
all other processing (zip, Pillow, pypdf) is real.
