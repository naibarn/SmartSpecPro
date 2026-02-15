Now I have all the context I need. Let me generate the section content.

# Section 8: Media Pipeline (Inline Processing in Python Cloud Run Service)

## Overview

This section implements the media-job processing pipeline as an inline handler in the Python Cloud Run Service. When Kie AI completes a media generation job (image, video, or audio), the result must be downloaded, post-processed (thumbnails, metadata extraction), uploaded to R2 storage, and recorded in the database. This entire pipeline runs within the `POST /tasks/process-media` Cloud Tasks handler on the Python Cloud Run Service -- not as a separate Cloud Run Job.

Media jobs are IO-bound (download, upload, DB write) and do not require the dedicated CPU/memory resources that justify a separate Cloud Run Job. Running inline simplifies the architecture by eliminating the three-hop pattern (Cloud Tasks -> Service -> Admin API -> Job).

### Dependencies

- **Section 07 (Kie Integration):** The webhook handler and polling handler both enqueue `media-jobs` Cloud Tasks that call `POST /tasks/process-media`. This section implements that handler.
- **Section 09 (R2 Storage):** The pipeline uploads results and thumbnails to Cloudflare R2 using the storage abstraction configured in Section 09. R2 credentials and bucket configuration must be in place.
- **Section 04 (Cloud Tasks):** The OIDC validation middleware on `/tasks/*` endpoints must be in place before this handler can receive authorized Cloud Tasks dispatches.

### Architecture

```
Cloud Tasks (media-jobs queue)
    |
    v
POST /tasks/process-media  (Python Cloud Run Service)
    |
    +-- 1. Idempotency check (DB: does job already have R2 keys?)
    +-- 2. Download media from Kie AI result URL
    +-- 3. Generate thumbnails (image: 300px width, video: frame at 25%)
    +-- 4. Extract metadata (size, dimensions, duration, codec)
    +-- 5. Upload full result + thumbnail to R2
    +-- 6. Update DB (media_tasks) with R2 keys, presigned URLs, metadata
    +-- 7. Emit PostHog event: media_job_completed
    +-- 8. Return 200 OK
```

Cloud Tasks allows up to 30-minute handler timeouts, which is more than sufficient for the IO-bound media processing workload.

---

## Tests

All tests go in the Python test directory. Create the test file at `/home/dev/projects/SmartSpecPro/python-backend/tests/test_media_pipeline.py`.

### Test: Handler downloads media from Kie AI result URL

```python
@pytest.mark.unit
async def test_process_media_downloads_from_kie_result_url(mock_db, mock_r2_client):
    """POST /tasks/process-media fetches media bytes from the Kie AI result URL."""
    # Arrange: mock httpx download, provide a job_id with no existing R2 keys
    # Act: call the handler
    # Assert: httpx.get was called with the expected Kie result URL
```

### Test: Handler generates thumbnail for image (300px width)

```python
@pytest.mark.unit
async def test_process_media_generates_image_thumbnail(mock_db, tmp_path):
    """For image jobs, handler creates a 300px-wide thumbnail using Pillow."""
    # Arrange: provide a downloaded JPEG image
    # Act: call thumbnail generation
    # Assert: output thumbnail width is 300px, maintains aspect ratio
```

### Test: Handler generates thumbnail for video (frame at 25% duration)

```python
@pytest.mark.unit
async def test_process_media_generates_video_thumbnail(mock_db, tmp_path):
    """For video jobs, handler extracts a frame at 25% of duration via FFmpeg."""
    # Arrange: provide a short test video
    # Act: call thumbnail generation
    # Assert: FFmpeg was invoked with -ss at 25% of probed duration
```

### Test: Handler uploads result and thumbnail to R2

```python
@pytest.mark.unit
async def test_process_media_uploads_to_r2(mock_db, mock_r2_client):
    """Handler uploads both the full result and thumbnail to R2 under temp/raw/{user_id}/{job_id}/."""
    # Arrange: provide downloaded media + generated thumbnail
    # Act: call the handler
    # Assert: boto3 put_object called twice with correct keys
```

### Test: Handler updates DB with R2 keys and metadata

```python
@pytest.mark.unit
async def test_process_media_updates_db(mock_db):
    """Handler writes R2 object keys, presigned URLs, file size, and dimensions to media_tasks."""
    # Arrange: successful upload to R2
    # Act: call the handler
    # Assert: media_tasks row has result_url, result_data with r2_keys, metadata
```

### Test: Handler emits PostHog media_job_completed event

```python
@pytest.mark.unit
async def test_process_media_emits_posthog_event(mock_db, mock_posthog):
    """Handler captures PostHog server-side event with correct properties."""
    # Arrange: successful pipeline run
    # Act: call the handler
    # Assert: posthog.capture called with event='media_job_completed',
    #         properties include job_type, duration_ms, output_size_bytes, resolution
```

### Test: Handler returns 200 for already-processed job (idempotent)

```python
@pytest.mark.unit
async def test_process_media_idempotent_returns_200(mock_db):
    """If job already has R2 keys in the DB, handler returns 200 immediately without re-processing."""
    # Arrange: media_tasks row with non-null result_data containing r2_keys
    # Act: call POST /tasks/process-media with the same job_id
    # Assert: returns 200, no download or upload performed
```

### Test: Handler returns 5xx on transient download failure (triggers retry)

```python
@pytest.mark.unit
async def test_process_media_5xx_on_transient_failure(mock_db):
    """Network timeouts or R2 upload failures return 5xx so Cloud Tasks retries."""
    # Arrange: mock httpx to raise a TimeoutError
    # Act: call the handler
    # Assert: response status is 500, Cloud Tasks will retry
```

### Test: Handler returns 200 with failed status on permanent Kie AI error

```python
@pytest.mark.unit
async def test_process_media_200_on_permanent_error(mock_db):
    """When Kie AI returns an error result, update job as failed and return 200 (no retry)."""
    # Arrange: Kie AI result URL returns 404 or an error payload
    # Act: call the handler
    # Assert: job status updated to 'failed', returns 200 to prevent Cloud Tasks retry
```

---

## Implementation Details

### Endpoint Registration

Add the `POST /tasks/process-media` endpoint to the Python Cloud Run Service. This endpoint is registered alongside other Cloud Tasks handlers in the task router.

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/tasks.py` (create new file)

This file defines a FastAPI `APIRouter` with prefix `/tasks` that houses all Cloud Tasks handlers. The `process-media` handler is one of them.

```python
# python-backend/app/api/v1/tasks.py

from fastapi import APIRouter, Request, Response
import structlog

router = APIRouter(prefix="/tasks", tags=["cloud-tasks"])
logger = structlog.get_logger()

@router.post("/process-media")
async def process_media(request: Request) -> Response:
    """Process a completed Kie AI media job.

    Receives: { job_id: str, kie_job_id: str, result_url: str, user_id: int, media_type: str }
    
    Pipeline: download -> thumbnail -> metadata -> R2 upload -> DB update -> PostHog event
    
    Idempotent: if the job already has R2 keys, returns 200 immediately.
    
    Returns 200 on success or permanent failure (prevents retry).
    Returns 5xx on transient failure (triggers Cloud Tasks retry).
    """
    ...
```

**Register the router in** `/home/dev/projects/SmartSpecPro/python-backend/app/main.py` by importing and including it alongside the existing API routers.

### Request Payload Schema

The Cloud Tasks payload sent by the webhook/polling handler (Section 07) must include:

```python
class ProcessMediaPayload(BaseModel):
    """Payload for POST /tasks/process-media."""
    job_id: str               # Application job ID (media_tasks.id)
    kie_job_id: str            # External Kie AI task ID
    result_url: str            # Kie AI result download URL
    user_id: int               # User who submitted the job
    media_type: str            # "image", "video", or "audio"
    request_id: str | None = None  # Correlation ID for tracing
```

### Pipeline Implementation

Create a service module for the media processing pipeline.

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/media_pipeline.py`

This module contains the core pipeline logic, separated from the HTTP handler for testability.

#### Step 1: Idempotency Check

Before any processing, query the `media_tasks` table for the given `job_id`. If the row's `result_data` already contains an `r2_keys` field, the job has already been processed. Return immediately with a 200 response.

```python
async def check_already_processed(db: AsyncSession, job_id: str) -> bool:
    """Return True if the job already has R2 keys stored."""
    ...
```

#### Step 2: Download Media from Kie AI

Use `httpx` (async HTTP client) to download the media file from the `result_url`. Store the downloaded file in a temporary directory. Set reasonable timeouts (connect: 10s, read: 120s) to handle large files.

```python
async def download_media(result_url: str, tmp_dir: str) -> tuple[str, int]:
    """Download media from Kie AI result URL.
    
    Returns: (local_file_path, file_size_bytes)
    Raises: httpx.TimeoutException on network timeout (transient, should retry)
    Raises: MediaPipelineError on permanent failure (404, invalid content)
    """
    ...
```

If the download fails with a 4xx error from Kie AI, treat it as a permanent failure -- update the job status to `failed` and return 200 from the handler. If the download fails with a network timeout or 5xx from Kie AI, raise an exception so the handler returns 5xx and Cloud Tasks retries.

#### Step 3: Generate Thumbnails

For images, use Pillow (PIL) to resize to 300px width while maintaining aspect ratio:

```python
async def generate_image_thumbnail(input_path: str, output_path: str, width: int = 300) -> None:
    """Generate a thumbnail of the given image at the specified width."""
    ...
```

For videos, use a lightweight FFmpeg call to extract a single frame at 25% of the total duration:

```python
async def generate_video_thumbnail(input_path: str, output_path: str) -> None:
    """Extract a frame at 25% duration as thumbnail.
    
    Uses ffprobe to determine duration, then ffmpeg -ss to extract the frame.
    """
    ...
```

For audio files, no thumbnail is generated. A default audio icon can be used client-side.

#### Step 4: Extract Metadata

Extract file metadata depending on media type:

```python
async def extract_metadata(file_path: str, media_type: str) -> dict:
    """Extract metadata from the downloaded media file.
    
    Returns dict with keys like:
      - file_size_bytes: int
      - width: int (image/video only)
      - height: int (image/video only)
      - duration_seconds: float (video/audio only)
      - format: str
      - codec: str (video only)
      - mime_type: str
    """
    ...
```

For images, use Pillow to read dimensions and format. For video/audio, use `ffprobe` (already available in the container).

#### Step 5: Upload to R2

Upload the full result file and thumbnail (if generated) to R2 under the prefix `temp/raw/{user_id}/{job_id}/`:

```python
async def upload_to_r2(
    r2_client,
    bucket: str,
    user_id: int,
    job_id: str,
    result_path: str,
    thumbnail_path: str | None,
) -> dict:
    """Upload result and thumbnail to R2.
    
    Returns dict with keys:
      - result_key: str (R2 object key for the full result)
      - thumbnail_key: str | None (R2 object key for the thumbnail)
      - result_presigned_url: str (1-hour presigned GET URL)
      - thumbnail_presigned_url: str | None
    """
    ...
```

The R2 client is created using `boto3` with R2 credentials from environment variables (mounted from GCP Secret Manager). The R2 endpoint follows the pattern `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.

Object keys follow the convention:
- Full result: `temp/raw/{user_id}/{job_id}/result.{ext}`
- Thumbnail: `temp/raw/{user_id}/{job_id}/thumb.jpg`

Generate presigned download URLs with 1-hour expiry for immediate client access.

#### Step 6: Update Database

Update the `media_tasks` row with:
- `result_url`: the presigned URL for the full result (for immediate client access)
- `result_data`: JSON containing `r2_keys` (object keys for long-term reference), metadata, and presigned URLs
- `status`: `completed`
- `completed_at`: current UTC timestamp

```python
async def update_job_with_results(
    db: AsyncSession,
    job_id: str,
    r2_info: dict,
    metadata: dict,
) -> None:
    """Update the media_tasks row with R2 keys, presigned URLs, and metadata."""
    ...
```

The `result_data` JSON structure:

```json
{
  "r2_keys": {
    "result": "temp/raw/123/abc-def/result.mp4",
    "thumbnail": "temp/raw/123/abc-def/thumb.jpg"
  },
  "presigned_urls": {
    "result": "https://...",
    "thumbnail": "https://..."
  },
  "metadata": {
    "file_size_bytes": 15234567,
    "width": 1920,
    "height": 1080,
    "duration_seconds": 4.5,
    "format": "mp4",
    "codec": "h264",
    "mime_type": "video/mp4"
  }
}
```

#### Step 7: Emit PostHog Event

Capture a server-side PostHog event `media_job_completed` with the user as the `distinct_id`:

```python
async def emit_posthog_event(
    user_id: int,
    job_id: str,
    media_type: str,
    metadata: dict,
    processing_duration_ms: int,
) -> None:
    """Capture PostHog server-side event for the completed media job."""
    # posthog.capture(
    #     distinct_id=str(user_id),
    #     event='media_job_completed',
    #     properties={
    #         'job_id': job_id,
    #         'job_type': media_type,
    #         'duration_ms': processing_duration_ms,
    #         'output_size_bytes': metadata.get('file_size_bytes'),
    #         'resolution': f"{metadata.get('width')}x{metadata.get('height')}",
    #     }
    # )
    ...
```

### Error Handling Strategy

The handler distinguishes between transient and permanent errors:

| Error Type | Example | HTTP Response | Cloud Tasks Behavior |
|---|---|---|---|
| Transient | Network timeout, R2 upload failure, DB connection error | 500 | Retries (up to 5, per `media-jobs` queue config) |
| Permanent | Kie AI returns 404, invalid/corrupt media file | 200 | No retry; job marked as `failed` |

For permanent errors, the handler updates the job's `status` to `failed` and writes the error message to `error_message` before returning 200. This prevents Cloud Tasks from retrying a request that will never succeed.

### Dead Letter Handling

On the final retry attempt (detected via `X-CloudTasks-TaskRetryCount` header), if the handler still encounters a transient error, it should:

1. Write a record to the `cloud_task_events` table with `status='dead_letter'`.
2. Update the job status to `failed` with an error message indicating DLQ.
3. Return 200 to prevent further retries.

This integrates with the DLQ pattern defined in Section 04.

```python
def is_final_retry(request: Request, max_retries: int = 5) -> bool:
    """Check if this is the final retry attempt based on Cloud Tasks header."""
    retry_count = int(request.headers.get("X-CloudTasks-TaskRetryCount", "0"))
    return retry_count >= max_retries - 1
```

### OIDC Validation

The `/tasks/process-media` endpoint is protected by the OIDC validation middleware defined in Section 04. In development (`ENVIRONMENT=development`), OIDC validation is skipped and a shared internal token is used instead.

### Temporary File Cleanup

All temporary files (downloaded media, generated thumbnails) are stored in a `tempfile.mkdtemp()` directory and cleaned up in a `finally` block after processing completes, regardless of success or failure.

```python
tmp_dir = tempfile.mkdtemp(prefix=f"media_pipeline_{job_id}_")
try:
    # ... pipeline steps ...
finally:
    shutil.rmtree(tmp_dir, ignore_errors=True)
```

### Progress Reporting

During the pipeline, publish progress updates to the Redis pub/sub channel `media-job-progress:{jobId}` (via Memorystore, not Upstash) so the Node.js SSE endpoint can relay them to the client:

- After download: `{ "progress": 0.3, "stage": "downloading" }`
- After thumbnail: `{ "progress": 0.5, "stage": "thumbnailing" }`
- After upload: `{ "progress": 0.8, "stage": "uploading" }`
- After DB update: `{ "progress": 1.0, "stage": "done" }`

Use the existing `report_progress` / `report_done` functions from `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_job_worker.py` as reference. In the Cloud Run deployment, these will publish to Memorystore Redis instead of the local Redis.

### Required Dependencies

Add these to `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt` if not already present:

- `httpx` -- async HTTP client for downloading media from Kie AI
- `Pillow` -- image processing (thumbnail generation, dimension extraction)
- `boto3` -- S3-compatible client for R2 uploads
- `posthog` -- server-side PostHog event capture

### Files Summary (Actual Implementation)

| File | Action | Description |
|---|---|---|
| `python-backend/app/api/v1/task_handlers.py` | **Modify** | Replaced `process-media` stub with full pipeline handler |
| `python-backend/app/services/media_pipeline.py` | **Create** | Core pipeline: download, thumbnail (Pillow/FFmpeg), metadata, R2 upload |
| `python-backend/pyproject.toml` | **Modify** | Added Pillow dependency |
| `python-backend/tests/unit/api/test_media_pipeline.py` | **Create** | 9 unit tests for process-media handler |

### Deviations from Plan

1. **Handler in `task_handlers.py`, not new `tasks.py`**: The plan called for a new `tasks.py` file. The handler was added to the existing `task_handlers.py` which already has the `/tasks` router prefix from Section 4.

2. **No `main.py` change needed**: The router was already registered.

3. **R2 paths use existing `StoragePath` class**: Plan specified `temp/raw/{user_id}/{job_id}/` but the implementation uses the existing `StoragePath.image_generated()`, `video_generated()`, etc. which produce `images/generated/{user_id}/{job_id}.{ext}`. This is more consistent with the existing codebase.

4. **PostHog event deferred to Section 14**: The plan called for `media_job_completed` PostHog event. This was deferred since Section 14 implements the full PostHog integration.

5. **SSRF protection added (code review fix)**: `download_media()` validates URLs via `validate_uri_no_ssrf()` to block internal IPs and cloud metadata endpoints.

6. **Payload validation added (code review fix)**: Handler returns 200 with `status=invalid_payload` if `job_id` or `result_url` missing.

### Test Results

- **Python**: 9 tests passing
- All 22 section-07 + section-08 tests pass together (regression verified)

### Integration with Existing Code

- **Celery (existing):** Handles local FFmpeg jobs (probe, render, waveform, silence detection, transcode)
- **Cloud Tasks process-media (new):** Handles downloading and storing results from Kie AI after generation completes

The two systems coexist during Phase A (dual-write) of the migration.