# Research Findings: Presentation Export, Audio & Video Playback

Generated: 2026-02-23

---

## Part 1: Codebase Research

### 1.1 Existing Export Infrastructure (Key Finding: Structurally Ready)

The export system is **structurally complete but functionally stubbed**. The entire state machine, deduplication, throttling, schema validation, and render spec building exists. Only the Python HTTP bridge is missing.

**Key files:**
- `apps/web/server/services/presentationPlaybackExport.ts` (564 lines) — orchestration
- `apps/web/server/routers/presentation.ts` (653 lines) — tRPC procedures
- `apps/web/shared/presentation/contracts.ts` — all export/render schemas

#### Current tRPC export procedures

```typescript
// presentation.ts router (line ~420-500)

triggerExport: protectedProcedure
  .input(z.object({
    deckId: z.number().int().positive(),
    format: z.enum(["png", "mp4"]),        // <-- only png/mp4; need to add jpg, pdf
    idempotencyKey: z.string().min(1).max(128).optional(),
  }))
  .mutation(...)

getExportStatus: protectedProcedure
  .input(z.object({ exportId: z.string().min(1).max(128) }))
  .query(...)  // returns PresentationExportStatusResult

getSlideshow: protectedProcedure
  .input(deckIdSchema)
  .query(...)  // returns PresentationSlideshowPayload
```

**Throttling** (already implemented, must preserve):
- Max 6 export requests per user per 60s window
- Max 4 export requests per deck per 60s window
- Deduplication window: 15 seconds

**Feature flags**:
- `PRESENTATION_EDITOR_ENABLED` env var (default: true)
- `PRESENTATION_EXPORTS_ENABLED` env var (default: true)

#### The critical stub to replace

```typescript
// presentationPlaybackExport.ts line ~306-314
async function defaultEnqueueExportJob(...): Promise<{ jobId: string }> {
  // THIS IS THE STUB — returns fake jobId, does nothing
  return { jobId: generateJobId() };
}
```

This needs to be replaced with an actual `fetch()` call to the Python backend.

#### Existing export contracts (shared/presentation/contracts.ts)

```typescript
interface PresentationExportResult {
  schemaVersion: "presentation_export_v1";
  exportId: string;
  jobId: string;
  deckId: number;
  format: "png" | "mp4";
  deduped: boolean;
  status: "queued" | "processing" | "completed" | "failed";
  message: string;
  renderSpec: PresentationRenderSpec;
  warnings: PresentationExportWarning[];
}

interface PresentationRenderSpec {
  schemaVersion: "presentation_render_v1";
  deckId: number;
  format: "png" | "mp4";
  width: number;     // default 1920
  height: number;    // default 1080
  fps: number;       // default 30
  slides: PresentationSlidePayload[];
  warnings: PresentationExportWarning[];
}

interface PresentationSlideshowPayload {
  schemaVersion: "presentation_slideshow_v1";
  deckId: number;
  generatedAt: Date;
  slides: PresentationSlidePayload[];  // each has durationMs (default 3000)
}
```

#### Slide element types (in slideContent JSONB)

Supported element types: `text`, `image`, `video`, `rect`, `line`. Each has `id`, `type`, `x`, `y`, `width`, `height`, `opacity`, `rotation`.

---

### 1.2 Database Schema

**Location**: `apps/web/drizzle/schema.ts` (lines 1720-1850)

```typescript
// presentation_decks table
presentationDecks = pgTable("presentation_decks", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  version: integer("version").notNull().default(1),
  slideCount: integer("slide_count").notNull().default(0),
  totalAssetBytes: integer("total_asset_bytes").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // ❌ MISSING: projectAudioTrack jsonb nullable
});

// presentation_slides table
presentationSlides = pgTable("presentation_slides", {
  id: serial("id").primaryKey(),
  deckId: integer("deck_id").notNull().references(() => presentationDecks.id),
  orderIndex: integer("order_index").notNull(),
  version: integer("version").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull().default("Slide"),
  slideContent: json("slide_content").$type<Record<string, any>>().notNull().default({}),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // ❌ MISSING: audioTrack jsonb nullable
});

// presentation_asset_links table
presentationAssetLinks = pgTable("presentation_asset_links", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  deckId: integer("deck_id").notNull().references(() => presentationDecks.id),
  slideId: integer("slide_id").references(() => presentationSlides.id),  // nullable
  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id),
  byteSize: integer("byte_size").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**Critical limits** (from `shared/presentation/constants.ts`):
```typescript
PRESENTATION_LIMITS = {
  maxSlidesPerDeck: 200,
  maxAssetsPerDeck: 500,
  softDeckSizeBytes: 75 * 1024 * 1024,
  hardDeckSizeBytes: 100 * 1024 * 1024,
  maxElementsPerSlide: 250,
  maxSlideContentBytes: 256 * 1024,
}
```

**Missing tables** (to be created):
- `presentation_exports` — tracks export jobs
- Audio stored in `slideContent` JSONB and `presentationDecks.projectAudioTrack` JSONB (not separate tables)

---

### 1.3 Python Backend Patterns

**Existing media task pattern** (`python-backend/app/tasks/media_tasks.py`):

```python
from app.core.celery_app import celery_app
from app.models.media_task import MediaTask, TaskStatus

@celery_app.task(bind=True, default_retry_delay=60, max_retries=3)
def generate_image_task(self, task_id: str, prompt: str, model: str, ...):
    try:
        # Call provider API
        # Store result URL in DB
        # Update task status to completed
    except Exception as exc:
        logger.error(f"task_failed", task_id=task_id, exc=str(exc))
        # Retry or mark as failed
```

**Key pattern**: `_run_async()` helper safely runs async code in Celery worker context.

**Python FastAPI endpoint pattern** (`python-backend/app/api/v1/media_generation.py`):

```python
router = APIRouter()

class TaskResponse(BaseModel):
    id: str
    task_id: Optional[str]   # external provider task ID
    status: str               # pending/processing/completed/failed
    result_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str

@router.post("/generate")
async def trigger_generation(request: GenerationRequest, db: AsyncSession = Depends(get_db)):
    # Create task record in DB
    # Enqueue Celery task
    # Return TaskResponse

@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str, db: AsyncSession = Depends(get_db)):
    # Query DB for task, return TaskResponse
```

---

### 1.4 Node.js → Python HTTP Bridge

Pattern found in `apps/web/server/routers/media.ts` and `mediaJobs.ts`:

```typescript
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

// Bearer token creation
import { signBearerToken } from "../_core/tokens";
const token = await signBearerToken({ scopes: ["media:write"] }); // 15-min JWT

// Call Python backend
const response = await fetch(`${PYTHON_BACKEND_URL}/api/v1/media/generate`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  },
  body: JSON.stringify(payload),
});
const data = await response.json();

// Poll status
const status = await fetch(`${PYTHON_BACKEND_URL}/api/v1/media/tasks/${taskId}`, {
  headers: { "Authorization": `Bearer ${token}` },
});
```

---

### 1.5 Storage Abstraction (S3/R2)

**Location**: `apps/web/server/storage.ts`

```typescript
// Upload file → returns signed URL
async function storagePut(
  key: string,
  fileBuffer: Buffer,
  fileType: string
): Promise<string>

// Generate presigned download URL (max 24 hours)
const presignedUrl = await getSignedUrl(
  s3Client,
  new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
  { expiresIn: 86400 }  // 24 hours
);

// Delete from storage
async function storageDelete(key: string): Promise<void>
```

Multi-tier resolution: Forge API → config cache → DB settings → env vars (R2) → local disk.

---

### 1.6 Application Routing

**Location**: `apps/web/client/src/App.tsx`

Current presentation routes:
```typescript
const PresentationEditor = lazy(() => import("@/pages/PresentationEditor"));
const PresentationLibrary = lazy(() => import("@/pages/PresentationLibrary"));

<Route path="/presentation-editor/:itemId" component={PresentationEditor} />
<Route path="/presentation-library" component={PresentationLibrary} />
```

Uses **Wouter** (not React Router). Add play mode route following same lazy-load pattern.

---

### 1.7 Testing Setup

**TypeScript (Vitest)**:
- `apps/web/server/routers/presentation.test.ts` — tRPC procedure tests with mocked services
- `apps/web/server/services/presentationPlaybackExport.test.ts` — export service tests
- Pattern: `vi.mock()` for services, custom `createCallerFactory` for tRPC

**Python (pytest)**:
- Location: `python-backend/tests/`
- Markers: `unit`, `integration`, `e2e`, `slow`
- `asyncio_mode = auto`
- 80% coverage minimum enforced by CI

---

## Part 2: Web Research Findings

### 2.1 Playwright Python — Headless Slide Rendering

**Browser management**: Reuse a single browser context across all slides to minimize memory and startup overhead.

```python
from playwright.sync_api import sync_playwright

def render_slides_to_images(slide_urls: list[str], output_dir: str) -> list[str]:
    screenshots = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            "--no-sandbox",          # Required in Docker/Linux
            "--disable-dev-shm-usage",  # Prevent /dev/shm OOM in Docker
            "--disable-gpu",
            "--disable-setuid-sandbox",
        ])
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
        )
        page = context.new_page()

        for i, url in enumerate(slide_urls):
            page.goto(url, wait_until="networkidle")
            # Wait for custom render-ready signal
            page.evaluate("() => window.__slideReady !== false")
            # Wait for fonts
            page.evaluate("() => document.fonts.ready")
            page.wait_for_timeout(100)  # Brief settle time

            path = f"{output_dir}/slide_{i:04d}.png"
            page.screenshot(
                path=path,
                full_page=False,
                animations="disabled",  # Freeze CSS animations at first frame
                clip={"x": 0, "y": 0, "width": 1920, "height": 1080},
            )
            screenshots.append(path)

        page.close()
        context.close()
        browser.close()
    return screenshots
```

**Critical options**:
- `animations="disabled"` — freezes CSS animations at first frame
- `wait_until="networkidle"` — waits for all network requests to finish
- `document.fonts.ready` — ensures fonts are loaded before screenshot
- `--no-sandbox --disable-dev-shm-usage` — required in Docker containers

**Window sentinel pattern** for React slides:
```javascript
// In the slide render page, set window.__slideReady = false during loading
// Set window.__slideReady = true when all content is rendered
// Playwright can poll for this before screenshot
```

---

### 2.2 FFmpeg Audio/Video Mixing

**Variable-duration slides** (each slide has different `durationMs`): Use the concat demuxer with a `.txt` file — most reliable approach.

```python
import ffmpeg, tempfile, os

def build_video_from_slides(slides: list[dict], output_path: str):
    """
    slides: [{"image": "slide_01.png", "duration_sec": 5.0}, ...]
    """
    concat_lines = []
    for slide in slides:
        concat_lines.append(f"file '{os.path.abspath(slide['image'])}'")
        concat_lines.append(f"duration {slide['duration_sec']}")
    # Repeat last image (FFmpeg concat demuxer quirk)
    concat_lines.append(f"file '{os.path.abspath(slides[-1]['image'])}'")

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write("\n".join(concat_lines))
        concat_file = f.name

    try:
        (
            ffmpeg
            .input(concat_file, format="concat", safe=0)
            .output(
                output_path,
                vcodec="libx264",
                pix_fmt="yuv420p",   # CRITICAL: required for Apple/mobile playback
                crf=18,              # High quality (18-23 range)
                preset="slow",       # Better compression at cost of speed
                movflags="+faststart",  # Progressive download support
                r=25,                # 25fps output
                vf="fps=25",
            )
            .run(overwrite_output=True)
        )
    finally:
        os.unlink(concat_file)
```

**Quality presets (CRF values)**:
- `draft`: CRF 28, preset `veryfast` — fast, smaller file
- `standard`: CRF 23, preset `medium` — good balance
- `high`: CRF 18, preset `slow` — near-lossless (recommended default)

**Audio mixing** — per-slide narration + background music:

```python
def mix_audio(narration: str, background: str, output: str,
              bg_volume: float = 0.15, total_duration: float = None):
    narration_input = ffmpeg.input(narration)

    # Loop background if needed, trim to total duration
    if total_duration:
        bg_input = ffmpeg.input(background, stream_loop=-1)
        bg_filtered = bg_input.audio.filter("atrim", duration=total_duration)
    else:
        bg_filtered = ffmpeg.input(background).audio

    bg_attenuated = bg_filtered.filter("volume", bg_volume)

    mixed = ffmpeg.filter(
        [narration_input.audio, bg_attenuated],
        "amix",
        inputs=2,
        duration="first",   # Duration = narration length
        normalize=0,        # CRITICAL: Don't auto-normalize (would boost BG)
    )

    ffmpeg.output(mixed, output, acodec="aac", ar=44100, audio_bitrate="192k").run(
        overwrite_output=True
    )
```

**Audio fade transitions**:
```python
# Fade out at end of slide's audio
stream = stream.filter("afade", type="out",
                       start_time=total_duration - 0.5,
                       duration=0.5)
```

**Final assembly**:
```python
def combine_video_audio(video: str, audio: str, output: str):
    v = ffmpeg.input(video).video
    a = ffmpeg.input(audio).audio
    (ffmpeg
     .output(v, a, output, vcodec="copy", acodec="aac",
             audio_bitrate="192k", movflags="+faststart")
     .run(overwrite_output=True))
```

---

### 2.3 PDF Generation with Playwright

**Critical**: Always use `print_background=True` — without it, CSS backgrounds are stripped.

```python
def render_slides_to_pdf(slide_urls: list[str], output_path: str):
    from pypdf import PdfWriter, PdfReader
    import io

    writer = PdfWriter()

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = browser.new_context()
        page = context.new_page()

        for url in slide_urls:
            page.goto(url, wait_until="networkidle")
            page.evaluate("() => document.fonts.ready")
            page.wait_for_timeout(200)

            pdf_bytes = page.pdf(
                width="1920px",
                height="1080px",
                print_background=True,  # CRITICAL for slides
                margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
                display_header_footer=False,
                scale=1.0,
            )

            reader = PdfReader(io.BytesIO(pdf_bytes))
            writer.add_page(reader.pages[0])

        page.close()
        context.close()
        browser.close()

    with open(output_path, "wb") as f:
        writer.write(f)
```

**Aspect ratio dimensions**:
- 16:9 → `width="1920px", height="1080px"`
- 4:3 → `width="1024px", height="768px"`

**Memory management** for 50+ slides: Reuse single `page` object; process in batches of 25; call `gc.collect()` between batches.

**CSS gotchas**:
- `position: fixed` elements appear on every PDF page
- `background-attachment: fixed` is stripped → use `scroll` or `local`
- Use `@media print` to hide editor UI elements

---

### 2.4 Celery — Progress Tracking for Long Export Jobs

**Fine-grained progress** (0-100%):

```python
from celery import current_task

@celery_app.task(bind=True, track_started=True)
def render_presentation(self, job_id: str, render_spec: dict, options: dict):
    total_slides = len(render_spec["slides"])

    for i, slide in enumerate(render_spec["slides"]):
        self.update_state(
            state="PROGRESS",
            meta={
                "job_id": job_id,
                "stage": "rendering",
                "current": i + 1,
                "total": total_slides,
                "percent": int((i + 1) / total_slides * 75),  # 0-75% for render
                "message": f"Rendering slide {i + 1} of {total_slides}",
            }
        )
        render_slide(slide)

    self.update_state(state="PROGRESS", meta={"percent": 85, "stage": "encoding", ...})
    encode_video(...)

    self.update_state(state="PROGRESS", meta={"percent": 95, "stage": "uploading", ...})
    output_url = upload_to_storage(...)

    return {"job_id": job_id, "output_url": output_url, "percent": 100}
```

**Polling from FastAPI**:
```python
from celery.result import AsyncResult

def get_task_progress(task_id: str) -> dict:
    result = AsyncResult(task_id)
    if result.state == "PENDING":
        return {"state": "queued", "percent": 0}
    elif result.state == "PROGRESS":
        return {"state": "processing", **result.info}
    elif result.state == "SUCCESS":
        return {"state": "done", "percent": 100, "output_url": result.result["output_url"]}
    elif result.state == "FAILURE":
        return {"state": "error", "error": str(result.info)}
    return {"state": result.state, "percent": 0}
```

**Timeout configuration** (for 2-10 min export jobs):
```python
@celery_app.task(
    bind=True,
    soft_time_limit=660,    # 11 min soft limit (graceful cleanup)
    time_limit=720,          # 12 min hard limit (SIGKILL)
    acks_late=True,          # Don't ack until task completes (survives worker crash)
    reject_on_worker_lost=True,
    max_retries=0,           # Don't auto-retry export tasks
)
def render_presentation(self, ...):
    from celery.exceptions import SoftTimeLimitExceeded
    try:
        ...
    except SoftTimeLimitExceeded:
        cleanup_temp_files(job_id)
        raise
```

**Queue isolation** — put exports on a dedicated queue:
```bash
celery -A app.core.celery_app worker -Q presentation_export -c 2 --loglevel=info
```

**Cooperative cancellation** via Redis flag:
```python
def is_cancelled(job_id: str) -> bool:
    return redis_client.get(f"cancel:export:{job_id}") == b"1"

# Inside task loop
if is_cancelled(job_id):
    cleanup_temp_files(job_id)
    return {"status": "cancelled"}
```

**Storage approach**: Store S3/R2 URL in result, not file contents. Use PostgreSQL `presentation_exports` table for persistent job history; use Redis (`update_state`) for fast polling during active jobs.

---

## Part 3: Testing Strategy

### TypeScript (Vitest) Tests Needed

1. **tRPC procedures** (`presentation.test.ts` additions):
   - `triggerExport` with new formats (jpg, pdf) — mock Python bridge
   - `getExportStatus` with all status states
   - `setSlideAudio`, `setDeckAudio` procedures
   - `getPlayDeck` procedure

2. **presentationPlaybackExport.ts** tests:
   - Python bridge HTTP call with correct payload
   - Status polling passthrough to Python response
   - Throttle enforcement (still works after new formats)

3. **PresentationPlayMode.tsx** component tests:
   - Slide auto-advance timer
   - Video play/pause on slide transition
   - Audio start/stop on slide change
   - Keyboard controls (space, arrow keys)

### Python (pytest) Tests Needed

1. **`test_render_presentation.py`** (`@pytest.mark.unit`):
   - Task progress reporting (update_state calls)
   - Temp file cleanup on failure
   - Soft time limit handling

2. **`test_presentations_export_api.py`** (`@pytest.mark.integration`):
   - POST `/api/v1/presentations/export` → returns jobId
   - GET `/api/v1/presentations/export/{jobId}` → returns progress
   - Auth required (JWT token)

3. **`test_render_pipeline.py`** (`@pytest.mark.slow`):
   - End-to-end render with mock slides
   - Audio mixing with test files
   - PDF generation output

---

## Part 4: Key Implementation Decisions

### Answers to Open Questions (from spec)

1. **MP4 FPS**: Use 25fps (PAL standard, good for slide presentations). Default CRF 18 (`high` quality). Support `draft` (CRF 28) and `standard` (CRF 23).

2. **Slide render URL access**: Playwright runs in Celery worker on same host. Internal Express route `GET /internal/slide-render/:deckId/:slideIndex?token=<signed>` accessible via `http://localhost:3000`. Not exposed via Nginx.

3. **Audio formats**: Accept MP3, AAC (M4A), OGG. Reject WAV (too large). FFmpeg handles conversion to AAC in output.

4. **Audio sync when slide durationMs < audio duration**: Fade out audio at end of slide (0.5s fade). If slide audio is shorter than slide duration, silence fills the rest.

5. **Project audio during pause**: Yes, project audio pauses when presentation is paused. Resumes on play.

6. **Export timeout**: Soft limit 11 min, hard limit 12 min. Progress updates prevent polling timeouts.

7. **Video-in-slide during MP4 export**: Replace with poster image (or first frame). Playwright will capture whatever is visible at screenshot time; video elements should show their `poster` attribute or first frame.

---

## Part 5: Summary Table

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| tRPC `triggerExport` | Partial | `server/routers/presentation.ts` | Needs jpg/pdf formats, quality param |
| tRPC `getExportStatus` | Partial | same | Needs real Python bridge |
| Export orchestration | Partial | `server/services/presentationPlaybackExport.ts` | Replace stub at line ~306 |
| Export contracts/schemas | Ready | `shared/presentation/contracts.ts` | Needs audio fields added |
| DB: presentation_exports | Missing | `drizzle/schema.ts` | New table required |
| DB: audio fields | Missing | `drizzle/schema.ts` | Add to decks + slides |
| Python render task | Missing | `python-backend/app/tasks/` | New Celery task |
| Python export API | Missing | `python-backend/app/api/v1/` | New FastAPI router |
| Internal slide render route | Missing | `apps/web/server/routes/` | Express route for Playwright |
| PresentationPlayMode.tsx | Missing | `client/src/pages/` | New React page |
| PlaybackEngine.ts | Missing | `client/src/presentation-canvas/play/` | State machine |
| AudioTrackPlayer.ts | Missing | same | Audio element management |
| ExportDialog.tsx | Missing | `client/src/components/presentation/` | UI for export |
| SlideAudioPanel.tsx | Missing | same | UI for audio attachment |
| Dockerfile.video-job-runner | Partial | `docker/` | Needs `playwright install chromium` |
