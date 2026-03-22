# SmartSpecPro Queue System Analysis: Presentation MP4 Export vs Video Generation

## Executive Summary

SmartSpecPro operates **two distinct queue systems** optimized for different workload characteristics:

1. **Presentation MP4 Export Queue** — Heavy, synchronous, Playwright + FFmpeg CPU-bound work
2. **Video/Image/Audio Generation Queue** — Network-bound, async provider API calls

Both use Celery + Redis but with fundamentally different concurrency, retry, and resource strategies.

## Queue System Comparison Matrix

| Dimension | Presentation MP4 Export | Video/Image/Audio Generation |
|-----------|------------------------|------------------------------|
| **Queue Name** | `presentation_export` | `video` (video jobs) / `media` (image, audio, gen jobs) |
| **Task Name** | `app.tasks.presentation_render.render_presentation` | `app.tasks.media_tasks.generate_video_task` / `generate_image_task` / `generate_audio_task` |
| **Celery Route** | Line 97 in celery_app.py | Lines 59-62 (video → video queue; image/audio → media queue) |
| **Job Submission** | HTTP POST `/api/v1/presentations/export` (FastAPI) | HTTP POST `/api/v1/media/image`, `/api/v1/media/video`, `/api/v1/media/audio` (FastAPI) |
| **Node.js Caller** | `presentationPlaybackExport.ts` uses fetch to Python backend | `mediaGenerationService.ts` uses fetch to Python backend |
| **How Enqueued** | `render_presentation.delay(spec, quality, format)` in FastAPI endpoint | `generate_image_task.delay(task_id, user_id, request_data)` in FastAPI endpoint |
| **Max Retries** | 0 (line 101, no retries) | 3 (lines 609, 698, 856) |
| **Soft Time Limit** | 660 seconds (11 min, line 97) | Varies by task type: typically 1800s (30 min) |
| **Hard Time Limit** | 720 seconds (12 min, line 98) | Varies by task type: typically 1800s (30 min) |
| **Task Acks** | `acks_late=True` (line 99) | Inherited from global config (acks_late=True, line 43) |
| **Worker Concurrency** | **2** (max, hardcoded in docstring line 10: `-c 2`) | Dynamic, depends on queue: typically 4-8 for media |
| **Resource Profile** | Heavy CPU + Playwright browser instance per worker | Network I/O bound, lightweight per task |
| **Prefetch Multiplier** | 1 (global, line 41) | 1 (global, line 41) |
| **Status Polling** | Celery AsyncResult polling via `/api/v1/presentations/export/{task_id}` | Celery AsyncResult polling via `/api/v1/media/{task_id}` |
| **Progress Reporting** | Via `task.update_state()` with percent/stage metadata (line 131-134) | Via `task.update_state()` (media_tasks.py, implicit) |
| **Result Lifetime** | 15 minutes in-memory registry (Node.js side) | Until Celery result backend TTL expires (configurable) |

## Detailed Queue Architecture

### Presentation MP4 Export Queue

**Flow:**
```
Node.js (presentationPlaybackExport.ts)
  ↓
fetch POST to Python: /api/v1/presentations/export
  ↓
FastAPI endpoint (presentations_export.py, line 161)
  ↓
render_presentation.delay(render_spec, quality, format)
  ↓
Celery: routes task to "presentation_export" queue
  ↓
Worker (limited to 2 concurrency): -Q presentation_export -c 2
  ↓
Task execution: _render_slides_to_screenshots() → _process_format() → _upload_output()
  ↓
Result stored in Redis backend
  ↓
Node.js polls /api/v1/presentations/export/{celery_task_id} for status
```

**Configuration Details:**
- **Queue declaration** (line 51): `Queue("presentation_export")`
- **Routing rule** (line 97): `"app.tasks.presentation_render.render_presentation": {"queue": "presentation_export"}`
- **Task options** (lines 95-103):
  - `bind=True` — task has access to `self` (the task instance)
  - `soft_time_limit=660` — raises SoftTimeLimitExceeded after 11 min
  - `time_limit=720` — SIGKILL after 12 min
  - `max_retries=0` — never retry (renders are deterministic; if timeout, a new job is enqueued)
  - `acks_late=True` — don't ack task until it completes
  - `reject_on_worker_lost=True` — re-enqueue if worker crashes

**Worker Command:**
```bash
celery -A app.core.celery_app worker -Q presentation_export -c 2 --hostname=presentation@%h
```

**Concurrency Rationale:**
- Max 2 concurrent: Playwright browser instances are heavy (100+ MB each)
- Each slide screenshot requires Chrome tab + Playwright navigation
- FFmpeg video encoding on single machine → resource contention
- CPU-bound work (FFmpeg) + I/O wait (Playwright) requires limited parallelism

**Retry Strategy:**
- No retries intentional: rendering is deterministic
- If a render fails, the frontend re-submits a new export request
- Idempotency enforced by frontend: `idempotencyKey` deduplication (presentationPlaybackExport.ts, line 60)

### Video/Image/Audio Generation Queue

**Flow (async path, most common):**
```
Node.js (mediaGenerationService.ts)
  ↓
fetch POST to Python: /api/v1/media/async/image (or video/audio)
  ↓
FastAPI endpoint (media_generation.py) [NOT FULLY SHOWN - uses async wrapper]
  ↓
generate_image_task.delay(task_id, user_id, request_data)  [or video/audio]
  ↓
Celery: routes task to "media" queue (lines 59-62)
  ↓
Worker (dynamic concurrency): -Q media
  ↓
Task: _generate_image_async() → call LLMGateway → provider API
  ↓
Result stored in Redis backend
  ↓
Node.js polls /api/v1/media/{task_id} for status (not shown, but implied)
```

**Configuration Details:**
- **Queue declarations** (lines 48-54): `Queue("media")` is primary
- **Routing rules** (lines 61-62):
  - Image tasks → `media` queue
  - Video tasks → `video` queue (separate, heavy processing)
  - Audio tasks → `media` queue
- **Task options** (lines 609, 698, 856):
  - `bind=True` — task has self reference
  - `max_retries=3` — retry up to 3 times on failure
  - Soft/hard time limits inherited from global config (1800s / 1740s)

**Worker Command:**
```bash
celery -A app.core.celery_app worker -Q media -l info  # Concurrent by default (4-8)
celery -A app.core.celery_app worker -Q video -l info  # Or dedicated video worker
```

**Concurrency Rationale:**
- Media tasks are **network-bound**: waiting for provider API response
- Can safely handle 4-8 concurrent tasks (or more) — no local CPU contention
- Each task is lightweight: ~100KB memory for request object

**Retry Strategy:**
- `max_retries=3` allows transient provider outages to auto-recover
- No exponential backoff configured (uses Celery default: same delay each retry)
- Useful for flaky Kie.ai/FAL.ai endpoints

## Job Submission Mechanisms

### Presentation Export: HTTP POST → Celery Dispatch

**File**: `python-backend/app/api/v1/presentations_export.py`, line 161

```python
@router.post("/export", response_model=PresentationExportJobResponse, status_code=201)
async def create_export_job(
    request: PresentationExportRequest,
    current_user: User = Depends(get_current_user),
) -> PresentationExportJobResponse:
    """Enqueue a Celery presentation render task and return the task id."""
    if not CELERY_ENABLED:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, ...)

    try:
        task = render_presentation.delay(request.render_spec, request.quality, request.format)
    except Exception as exc:
        logger.error("presentation_render_dispatch_failed", error=str(exc))
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, ...)

    logger.info("presentation_export_queued", celery_task_id=task.id, ...)
    return PresentationExportJobResponse(celery_task_id=task.id, status="queued")
```

**Inputs**:
- `render_spec` (dict): Complete slide spec with media, layout, audio (validated, max 64KB line 43)
- `quality` (str): "draft" | "standard" | "high"
- `format` (str): "png" | "jpg" | "pdf" | "mp4"

**Outputs**:
- Celery task ID (UUID)
- Status always "queued"

**Validation** (lines 58-134):
- Render spec size must be ≤ 64KB (security: prevent RCE via huge payloads)
- Numeric fields (fps, volume) range-checked and clamped
- Format/quality enums validated strictly

### Media Generation: HTTP POST → Celery Dispatch

**File**: `python-backend/app/api/v1/media_generation.py`, line 281 (image endpoint example)

```python
@router.post("/image", response_model=ImageGenerationResponse)
async def generate_image_endpoint(
    request: ImageGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate image via Kie.ai and track in media_tasks table."""
    gateway = LLMGateway(db)
    task = None
    external_task_id = None
    try:
        # Create task record before generation
        task = await MediaTaskService.create_task(
            db, current_user, MediaType.IMAGE,
            request.model, request.prompt,
            request.dict(exclude={'model', 'prompt'})
        )

        # Update task to processing
        await MediaTaskService.update_task_status(db, task.id, TaskStatus.PROCESSING)

        response = await gateway.generate_image(request, current_user)

        # Update task with result
        result_url = response.data[0].get("url") if response.data else None
        await MediaTaskService.update_task_status(
            db, task.id, TaskStatus.COMPLETED,
            result_url=result_url,
            ...
        )
        return response
    except Exception as e:
        if task:
            await MediaTaskService.update_task_status(
                db, task.id, TaskStatus.FAILED,
                error_message=str(e), ...
            )
        raise e
```

**Key Difference**:
- **Synchronous** — Image/audio endpoints wait for the provider to respond
- **Async** — Video endpoint (not shown) likely uses Celery dispatch (similar to above)
- Media tasks are tracked in `media_tasks` DB table with external provider task IDs

## Response Polling

### Presentation Export

**File**: `python-backend/app/api/v1/presentations_export.py`, line 254

```python
@router.get("/export/{celery_task_id}", response_model=PresentationExportStatusResponse)
async def get_export_status(
    celery_task_id: str,
    current_user: User = Depends(get_current_user),
) -> PresentationExportStatusResponse:
    """Poll the status of a presentation render task."""
    try:
        result = AsyncResult(celery_task_id)
        state = result.state  # lazy Redis read

        if state == "SUCCESS":
            return PresentationExportStatusResponse(
                celery_task_id=celery_task_id,
                state="done",
                percent=100,
                output_url=result.result.get("output_url"),
            )

        if state == "FAILURE":
            return PresentationExportStatusResponse(
                celery_task_id=celery_task_id,
                state="error",
                error_message=str(result.result),
            )

        if state == "PROGRESS":
            info = result.info or {}
            return PresentationExportStatusResponse(
                celery_task_id=celery_task_id,
                state="processing",
                percent=info.get("percent", 0),
                stage=info.get("stage"),
            )

        # PENDING, RETRY, STARTED → treat as queued
        return PresentationExportStatusResponse(
            celery_task_id=celery_task_id,
            state="queued",
            percent=0,
        )
```

**Poll States**:
- `queued`: PENDING or RETRY
- `processing`: STARTED or PROGRESS (with percent/stage)
- `done`: SUCCESS
- `error`: FAILURE or REVOKED

### Media Generation

Similar polling pattern, but media tasks also track in DB:
- External provider task IDs (`external_task_id`)
- Progress via callback events (Kie.ai webhooks)
- Result URLs stored in `media_tasks.result_url`

## Why Two Separate Queues?

### Resource Contention

**Presentation Export** (CPU-bound, heavy):
- Playwright browser: 100-150 MB per instance
- FFmpeg encoding: 200+ MB working set
- Can't run 10 of these in parallel — OOM quickly

**Video Generation** (Network-bound, light):
- Small request/response objects
- Waiting for provider API (not using local CPU)
- Can safely run 8-10 concurrently

**Problem if merged**: A single video generation request would block an export job from starting, even though the video task is just sleeping waiting for Kie.ai.

### Workload Characteristics

**Presentation Export**:
- Duration: 2-12 minutes (depends on slide count, format, quality)
- Predictable: no external provider variability
- Deterministic: re-running produces same output
- Blocking: user waiting for download link

**Video Generation**:
- Duration: seconds to minutes (depends on provider)
- Unpredictable: Kie.ai/FAL.ai SLA varies
- Non-deterministic: provider may return different result on retry
- Async: user comes back later to check status

### Failure Handling

**Presentation Export** (`max_retries=0`):
- Retrying is useless — if render timed out, it'll timeout again
- Frontend deduplicates via `idempotencyKey` (window-based request coalescing)
- User re-submits if they want to retry

**Video Generation** (`max_retries=3`):
- Transient provider failures are common
- Auto-retry recovers from temporary network issues
- User doesn't see failures unless all 3 retries exhausted

## Scaling Implications

### Current State (dev/small deployment)

- **Single worker**: Can consume from all queues with `-Q presentation_export,video,media`
- **Presentation concurrency**: Limited to 2 max (hardcoded for memory safety)
- **Video concurrency**: Limited by available memory (4-8 concurrent tasks)

### Production Scaling Scenario

```bash
# Dedicated presentation export worker
celery -A app.core.celery_app worker -Q presentation_export -c 2 --hostname=presentation@%h

# Dedicated video/media workers (can run on same host, different workers)
celery -A app.core.celery_app worker -Q video -c 4 --hostname=video-1@%h
celery -A app.core.celery_app worker -Q media -c 8 --hostname=media-1@%h
```

### If Queues Were Merged

**Problem**: Single worker with `-Q all -c 8`
- 2 concurrent presentation exports (uses 300 MB Playwright)
- 6 concurrent video generations (using remaining memory)
- Now a video generation spike starves export queue
- Or a presentation export locks down entire queue for 12 minutes

**Solution in codebase**: Separate queues + explicit routing enforce isolation at Celery level.

## Configuration Hotspots

### To Increase Presentation Export Throughput

Change worker command from `-c 2` to `-c 4`:
```bash
celery -A app.core.celery_app worker -Q presentation_export -c 4 --hostname=presentation@%h
```
**Risk**: OOM if memory < 600 MB available.

### To Reduce Presentation Export Timeout

Change soft/hard limits in `celery_app.py` line 97-98:
```python
soft_time_limit=300,  # 5 min instead of 11
time_limit=360,       # 6 min instead of 12
```
**Risk**: Slow slides with many video elements will timeout.

### To Add Retry to Presentation Export

Change line 101:
```python
max_retries=1,  # Allow one retry
```
**Risk**: Failing renders will timeout twice (24 min total user wait).

### To Reduce Video Generation Retry Count

Change media_tasks.py line 609:
```python
@celery_app.task(bind=True, max_retries=1)  # instead of 3
```
**Risk**: Transient Kie.ai outages will fail faster.
