I now have all the context I need. Let me produce the section content.

# Section 04: Web Engine Adapter (Python/Celery + Node.js API)

## Overview

This section implements the **web backend** for the Media Job System. It consists of three components working together:

1. **Python Celery Worker** (`python-backend/app/tasks/media_job_worker.py`) -- Executes FFmpeg commands in background tasks, reports progress via Redis
2. **Node.js API Routes** (`apps/web/server/routers/mediaJobs.ts`) -- tRPC and Express endpoints for submitting, polling, canceling, and streaming media jobs
3. **TypeScript WebEngineAdapter** (`apps/web/client/src/services/webEngineAdapter.ts`) -- Client-side adapter implementing the `IEngineAdapter` interface from section-02

This section can be built in parallel with section-03 (Desktop Engine Adapter). It depends on section-01 (Job Spec Types) and section-02 (MediaJobClient + IEngineAdapter interface).

---

## Dependencies

- **section-01-job-spec-types**: The `MediaJobSpec`, `MediaJobProgress`, `MediaJobResult`, `MediaJobError`, `MediaJobStatus`, `MediaArtifact`, and `validateJobSpec` must exist in `apps/web/shared/types/mediaJob.ts`
- **section-02-media-job-client**: The `IEngineAdapter` interface must exist in `apps/web/client/src/services/mediaJobClient.ts`

---

## Tests First

All tests should be written before the corresponding implementation. The test files and their stubs are listed below.

### 4.1 Python Worker Tests

**File**: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_media_job_worker.py`

This test file covers the Celery worker's job spec parsing, FFmpeg command generation, progress parsing, and output handling.

```
# Test: parse_job_spec accepts valid probe spec
#   Provide a valid probe job spec dict. Verify parse_job_spec returns a parsed
#   object with jobType="probe" and the correct asset URI.

# Test: parse_job_spec rejects invalid spec (missing fields)
#   Provide a dict missing "jobType". Verify parse_job_spec raises ValueError
#   with a descriptive message about the missing field.

# Test: build_ffmpeg_command_for_probe generates correct ffprobe args
#   Provide a probe job spec with a single asset URI. Verify the returned
#   command list starts with "ffprobe" and includes
#   "-print_format json -show_format -show_streams" and the input path.

# Test: build_ffmpeg_command_for_render generates correct filter_complex for trim+concat
#   Provide a render_mp4_h264 spec with a MediaTimeline containing two clips
#   on the same track. Verify the returned command includes -filter_complex
#   with trim, setpts, atrim, asetpts, and concat filters.

# Test: build_ffmpeg_command_for_waveform generates correct PCM extraction args
#   Provide a waveform_peaks spec. Verify the command includes
#   "-af aformat=sample_fmts=s16:channel_layouts=mono -f s16le -".

# Test: build_ffmpeg_command_for_silence generates correct silencedetect args
#   Provide a dead_air_detect spec with thresholdDb=-30 and minSilenceMs=500.
#   Verify the command includes silencedetect filter with noise=-30dB:d=0.5.

# Test: parse_ffmpeg_progress extracts progress percentage from output
#   Provide sample "-progress pipe:1" output containing "out_time_us=5000000".
#   Given a total duration of 10s, verify parse returns progress=0.5.

# Test: parse_silence_output extracts silence regions from stderr
#   Provide sample FFmpeg stderr with "silence_start: 1.5" and
#   "silence_end: 3.0 | silence_duration: 1.5". Verify a list with one
#   silence segment { startMs: 1500, endMs: 3000, durationMs: 1500 }.

# Test: handle_probe returns correct MediaAsset structure
#   Mock subprocess to return valid ffprobe JSON output. Verify handle_probe
#   returns a dict with assetId, kind, streams, durationMs, and mime fields.

# Test: handle_render_mp4 returns artifact with output path
#   Mock subprocess to succeed. Verify the returned dict has artifacts list
#   with one entry whose uri matches the output target and kind="video".

# Test: handle_waveform_peaks returns peaks array with correct length
#   Mock subprocess to produce known raw PCM bytes. Verify peaks array
#   length matches expected (total samples / bucket size) and values are
#   normalized to 0.0-1.0 range.
```

### 4.2 Node.js API Route Tests

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/mediaJobs.test.ts`

This test file covers the tRPC/Express endpoints for media job management.

```
# Test: POST /api/media-jobs validates job spec and returns jobId
#   Submit a valid probe job spec via the tRPC submitJob procedure.
#   Mock the Redis and Celery submission. Verify the response contains
#   a jobId string (nanoid format) and that the spec was written to Redis.

# Test: POST /api/media-jobs rejects invalid spec with 400
#   Submit a spec with missing jobType. Verify a TRPCError with code
#   "BAD_REQUEST" is thrown containing the validation error message.

# Test: GET /api/media-jobs/:id returns job status
#   Pre-populate the Redis key "media-job:{id}:status" with a JSON progress
#   object. Call the getStatus procedure. Verify it returns the status JSON
#   with correct fields (status, progress, etaMs).

# Test: GET /api/media-jobs/:id returns 404 for unknown job
#   Call getStatus with a non-existent jobId. Verify a TRPCError with code
#   "NOT_FOUND" is thrown.

# Test: DELETE /api/media-jobs/:id cancels running job
#   Pre-populate a job in "running" state. Call cancelJob. Verify the Redis
#   status key is updated to "canceled" and the Celery revoke call was made.

# Test: SSE endpoint streams progress events
#   This tests the Express SSE route at /api/media-jobs/:id/events.
#   Mock a Redis pub/sub subscription on channel "media-job-progress:{id}".
#   Simulate publishing two progress events and a "done" event.
#   Verify the SSE response contains three events with correct data fields.

# Test: POST /api/media-jobs/upload accepts file and returns URI
#   Submit a multipart file upload to the upload endpoint. Mock the
#   storage layer (storagePut). Verify the response contains a URI
#   starting with "https://" and the correct mime type.
```

### 4.3 WebEngineAdapter Tests (implied by section-02 but adapter-specific)

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/__tests__/webEngineAdapter.test.ts`

```
# Test: submitJob sends POST to /api/media-jobs and returns jobId
#   Mock fetch to return { jobId: "abc123" }. Call adapter.submitJob(spec).
#   Verify fetch was called with POST, correct body, and the returned
#   jobId matches.

# Test: getStatus sends GET to /api/media-jobs/:id and returns progress
#   Mock fetch to return a MediaJobProgress object. Call adapter.getStatus("abc123").
#   Verify the returned object has the expected status and progress fields.

# Test: cancelJob sends DELETE to /api/media-jobs/:id
#   Mock fetch to return success. Call adapter.cancelJob("abc123").
#   Verify fetch was called with DELETE method.

# Test: onProgress connects to SSE at /api/media-jobs/:id/events
#   Mock EventSource. Call adapter.onProgress("abc123", callback).
#   Simulate receiving two SSE messages. Verify the callback was called
#   twice with the correct progress objects. Call unsubscribe and verify
#   EventSource.close() was called.
```

---

## Implementation Details

### 4.1 Python Celery Worker

**File to create**: `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_job_worker.py`

This module adds a new Celery task `execute_media_job` that receives a JSON job spec string, executes the appropriate FFmpeg command, and reports progress via Redis.

#### Task Structure

The main Celery task signature:

```python
@celery_app.task(bind=True, max_retries=2, time_limit=1800, soft_time_limit=1740)
def execute_media_job(self, spec_json: str, user_id: str, job_id: str) -> dict:
    """Execute a media job based on the Media Job Spec v0.1 contract."""
```

The task function should:

1. Parse and validate `spec_json` into a Python dict using a `parse_job_spec(spec_json)` helper
2. Resolve asset URIs -- download remote assets to a temp directory if they are `https://` URLs
3. Dispatch to the correct handler function based on `spec["jobType"]`
4. Report progress via Redis keys (see Redis Key Schema below)
5. Return result dict on success, raise on failure

#### Handler Functions

Each handler is a standalone function that builds FFmpeg commands, runs them via `subprocess`, and parses output.

| Handler Function | Job Type | FFmpeg Pattern |
|-----------------|----------|----------------|
| `handle_probe(spec)` | `probe` | `ffprobe -print_format json -show_format -show_streams {input}` |
| `handle_render_mp4(spec, progress_cb)` | `render_mp4_h264` | Build filter_complex from timeline, run FFmpeg with `-progress pipe:1` |
| `handle_waveform_peaks(spec)` | `waveform_peaks` | Extract raw PCM via `-af "aformat=sample_fmts=s16:channel_layouts=mono" -f s16le -` |
| `handle_thumbnails(spec)` | `thumbnails` | `ffmpeg -ss {t} -i input -vframes 1 -q:v 2 output_{n}.jpg` per interval |
| `handle_dead_air_detect(spec)` | `dead_air_detect` | `silencedetect` filter, parse stderr for silence_start/silence_end |
| `handle_dead_air_cut(spec, progress_cb)` | `dead_air_cut` | Build trim+concat from keep segments |
| `handle_concat(spec, progress_cb)` | `concat` | Concat demuxer or filter_complex depending on strategy param |
| `handle_subtitles_extract(spec)` | `subtitles_extract` | `ffmpeg -i input -map 0:s:{idx} output.srt` |

#### Progress Reporting

The task reports progress by writing to application-owned Redis keys (NOT Celery's internal keys):

```python
import redis
import json

redis_client = redis.from_url(os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"))

def report_progress(job_id: str, progress: float, stage: str = "", message: str = "", metrics: dict = None):
    """Write progress to Redis and publish to real-time channel."""
    status_data = {
        "status": "running",
        "progress": progress,
        "stage": stage,
        "message": message,
        "metrics": metrics or {},
    }
    redis_client.set(f"media-job:{job_id}:status", json.dumps(status_data), ex=86400)
    redis_client.publish(f"media-job-progress:{job_id}", json.dumps(status_data))
```

On completion, set the result key:

```python
redis_client.set(f"media-job:{job_id}:result", json.dumps(result_data), ex=86400)
status_data = {"status": "done", "progress": 1.0}
redis_client.set(f"media-job:{job_id}:status", json.dumps(status_data), ex=86400)
redis_client.publish(f"media-job-progress:{job_id}", json.dumps(status_data))
```

On error, set the error key:

```python
redis_client.set(f"media-job:{job_id}:error", json.dumps(error_data), ex=86400)
status_data = {"status": "error", "progress": 0}
redis_client.set(f"media-job:{job_id}:status", json.dumps(status_data), ex=86400)
redis_client.publish(f"media-job-progress:{job_id}", json.dumps(status_data))
```

#### FFmpeg Progress Parsing

When running FFmpeg with `-progress pipe:1`, parse stdout for progress lines:

```python
def parse_ffmpeg_progress(line: str, total_duration_us: int) -> float | None:
    """Parse a single line from FFmpeg -progress pipe:1 output.
    Returns progress as 0.0-1.0 or None if line is not a progress line."""
```

Key fields to extract from FFmpeg progress output: `out_time_us` (microseconds of output processed), `speed` (e.g., "2.5x").

#### Silence Detection Parser

```python
def parse_silence_output(stderr: str) -> list[dict]:
    """Parse FFmpeg silencedetect filter output from stderr.
    Returns list of { startMs, endMs, durationMs } dicts."""
```

Parse lines matching `silence_start: {float}` and `silence_end: {float} | silence_duration: {float}`.

#### FFmpeg Path Validation

At module load time, verify that `ffmpeg` and `ffprobe` are available on the system PATH:

```python
import shutil

def _validate_ffmpeg():
    """Check ffmpeg and ffprobe are available. Called at import time."""
    for binary in ("ffmpeg", "ffprobe"):
        if not shutil.which(binary):
            raise RuntimeError(f"{binary} not found in PATH. Install FFmpeg.")
```

#### Celery Auto-Discovery

The existing `celery_app.py` at `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py` already auto-discovers tasks from `["app.tasks"]`:

```python
celery_app.autodiscover_tasks(["app.tasks"])
```

Since the new file is at `app/tasks/media_job_worker.py`, it will be auto-discovered. No change to `celery_app.py` is needed.

---

### 4.2 Redis Key Schema

The Node.js and Python sides communicate through a well-defined set of application-owned Redis keys. This decouples from Celery's internal result backend format.

| Key Pattern | Type | Written By | Read By | TTL |
|------------|------|-----------|---------|-----|
| `media-job:{jobId}:spec` | String (JSON) | Node.js | Python | 24h |
| `media-job:{jobId}:status` | String (JSON) | Python | Node.js | 24h |
| `media-job:{jobId}:result` | String (JSON) | Python | Node.js | 24h |
| `media-job:{jobId}:error` | String (JSON) | Python | Node.js | 24h |
| `media-job:{jobId}:meta` | String (JSON) | Node.js | Node.js | 24h |

**Status JSON shape**:
```json
{ "status": "running", "progress": 0.45, "etaMs": 12000, "stage": "rendering", "message": "Encoding frame 450/1000", "metrics": { "speed": "2.1x", "outTimeMs": 4500 } }
```

**Result JSON shape**:
```json
{ "artifacts": [{ "kind": "video", "uri": "https://...", "mime": "video/mp4" }], "derived": {} }
```

**Error JSON shape**:
```json
{ "code": "FFMPEG_ERROR", "message": "Exit code 1: ...", "details": {} }
```

**Pub/Sub channel**: `media-job-progress:{jobId}` -- Python publishes on every progress update; Node.js subscribes for SSE streaming.

---

### 4.3 Node.js API Routes

**File to create**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts`

This file exports both a tRPC router (for CRUD operations) and an Express route registration function (for SSE streaming). SSE does not work naturally with tRPC, so the SSE endpoint is an Express route -- this follows the existing pattern in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/llmRoutes.ts`.

#### tRPC Router

The `mediaJobsRouter` should be a tRPC router with these procedures:

**`submitJob`** (mutation, `protectedProcedure`):
- Input: Zod schema matching the `MediaJobSpec` type from section-01
- Validates the spec using `validateJobSpec()` from shared types
- Generates a `jobId` via `nanoid()`
- Checks per-user concurrent job limit (max 3 running jobs, configurable)
- Writes the spec to Redis key `media-job:{jobId}:spec`
- Writes metadata (userId, submittedAt) to `media-job:{jobId}:meta`
- Sets initial status to `"queued"` in `media-job:{jobId}:status`
- Dispatches to Celery by calling the Python backend via HTTP POST to `{PYTHON_BACKEND_URL}/api/v1/media-jobs/execute` (or directly via Celery's Redis broker by publishing a task message)
- Logs an audit event via `auditLogger.log()` with `eventType: "media_request"`
- Returns `{ jobId }`

**`getStatus`** (query, `protectedProcedure`):
- Input: `z.object({ jobId: z.string() })`
- Reads `media-job:{jobId}:meta` to verify the requesting user owns the job (admin can see all)
- Reads `media-job:{jobId}:status` from Redis
- If status is `"done"`, also reads `media-job:{jobId}:result`
- If status is `"error"`, also reads `media-job:{jobId}:error`
- Returns 404 if none of the keys exist
- Returns the `MediaJobProgress` (or `MediaJobResult` / `MediaJobError`) object

**`cancelJob`** (mutation, `protectedProcedure`):
- Input: `z.object({ jobId: z.string() })`
- Verifies ownership (same as getStatus)
- Sets status to `"canceled"` in Redis
- Publishes cancel event to the progress pub/sub channel
- Revokes the Celery task (via HTTP call to Python backend or direct Redis `REVOKE` message)
- Returns `{ success: true }`

**`listJobs`** (query, `protectedProcedure`):
- Optional: Lists the user's recent jobs from Redis (scan `media-job:*:meta` keys)
- Admin can list all jobs

#### Rate Limiting

Job submission should use rate limiting. Reuse the existing `createRateLimitMiddleware` from `/home/dev/projects/SmartSpecPro/apps/web/server/_core/rateLimitedProcedure.ts`:

```typescript
const mediaJobSubmitProcedure = t.procedure
  .use(requireUser)
  .use(t.middleware(createRateLimitMiddleware({
    namespace: "media-job:submit",
    limit: 10,
    windowMs: 60 * 1000, // 10 jobs per minute
  })));
```

#### SSE Express Route

**Registration function**: `registerMediaJobRoutes(app: Express)`

Register an Express route for SSE streaming:

```
GET /api/media-jobs/:id/events
```

This route:
1. Authenticates the request (extract JWT from cookie or Authorization header, same pattern as `llmRoutes.ts`)
2. Verifies the user owns the job (or is admin)
3. Sets SSE response headers: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache`, `Connection: keep-alive`
4. Creates a duplicate Redis connection for pub/sub (using `createRedisConnection()` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/redis.ts`)
5. Subscribes to channel `media-job-progress:{jobId}`
6. On each message, writes an SSE event: `event: progress\ndata: {json}\n\n`
7. Sets up a polling fallback: every 2s, read `media-job:{jobId}:status` to catch missed pub/sub messages
8. When status is `"done"` or `"error"` or `"canceled"`, send a final event and close the connection
9. On client disconnect (`req.on("close", ...)`), unsubscribe from pub/sub and clean up

**File upload route** (optional, for section-06 Web UI):

```
POST /api/media-jobs/upload
```

This accepts multipart file uploads for web users to send media files to the server. It follows the existing upload patterns in the codebase (magic byte validation, extension whitelist, size limits). This route is needed by the `WebAssetResolver` in section-06 but can be stubbed here.

#### Audit Logging

Every job submission and completion should produce an audit log entry using the existing `auditLogger` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/auditLogger.ts`. The audit event types to use:

- On submission: `eventType: "media_request"` with the job spec as requestPayload
- On completion/error: `eventType: "media_response"` with the result or error as responsePayload

Use the `traceId` from the job spec's `telemetry.traceId` field if present, or from the request's trace context via `getTraceId()`.

#### Mount the Router

**File to modify**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts`

Add the import and mount:

```typescript
import { mediaJobsRouter } from "./routers/mediaJobs";
// ... in the appRouter definition:
mediaJobs: mediaJobsRouter,
```

**File to modify**: `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`

Add the SSE route registration alongside the existing Express route registrations (after `registerLLMRoutes(app)`):

```typescript
import { registerMediaJobRoutes } from "../routers/mediaJobs";
// ... after registerLLMRoutes(app):
registerMediaJobRoutes(app);
```

---

### 4.4 TypeScript WebEngineAdapter

**File to create**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/webEngineAdapter.ts`

This file implements the `IEngineAdapter` interface from section-02 for the web platform. It communicates with the Node.js API routes defined above.

#### Interface Implementation

```typescript
import type { IEngineAdapter } from "./mediaJobClient";
import type { MediaJobSpec, MediaJobProgress } from "@shared/types/mediaJob";

export class WebEngineAdapter implements IEngineAdapter {
  /**
   * Submit a job spec to the server.
   * POST /api/media-jobs (via tRPC mutation or direct fetch)
   */
  async submitJob(spec: MediaJobSpec): Promise<string> { /* ... */ }

  /**
   * Get current job status.
   * GET via tRPC query or direct fetch to /api/media-jobs/:id
   */
  async getStatus(jobId: string): Promise<MediaJobProgress> { /* ... */ }

  /**
   * Cancel a running job.
   * DELETE via tRPC mutation or direct fetch
   */
  async cancelJob(jobId: string): Promise<void> { /* ... */ }

  /**
   * Subscribe to real-time progress via SSE.
   * Connects to /api/media-jobs/:id/events
   * Returns an unsubscribe function.
   */
  onProgress(jobId: string, callback: (progress: MediaJobProgress) => void): () => void { /* ... */ }
}
```

#### Communication Strategy

The adapter can use either tRPC client calls or direct `fetch()` for the CRUD endpoints. Using tRPC is preferred for type safety since the router is defined in the same codebase. The SSE endpoint must use `EventSource` or `fetch()` with streaming since tRPC does not support SSE natively.

For `onProgress`, use the browser's `EventSource` API:

```typescript
onProgress(jobId: string, callback: (progress: MediaJobProgress) => void): () => void {
  const eventSource = new EventSource(`/api/media-jobs/${jobId}/events`, {
    withCredentials: true, // send cookies for auth
  });

  eventSource.addEventListener("progress", (event) => {
    const data = JSON.parse(event.data) as MediaJobProgress;
    callback(data);
  });

  eventSource.onerror = () => {
    // EventSource auto-reconnects; optionally log error
  };

  return () => {
    eventSource.close();
  };
}
```

---

### 4.5 Python Backend API Endpoint (Optional Bridge)

If the Node.js server dispatches Celery tasks via HTTP rather than direct Redis broker access, a FastAPI endpoint is needed.

**File to create**: `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/media_jobs.py`

```python
@router.post("/media-jobs/execute")
async def execute_media_job_endpoint(request: MediaJobRequest):
    """Accept a media job spec from the Node.js server and dispatch to Celery."""
```

This endpoint:
1. Validates the incoming job spec
2. Calls `execute_media_job.delay(spec_json, user_id, job_id)` to enqueue the Celery task
3. Returns `{ "taskId": celery_task_id }` immediately

The alternative (and simpler) approach is for the Node.js server to publish the task directly to Redis using the Celery task message format. Either approach works; the HTTP bridge is simpler to implement and debug.

---

## File Summary

### New Files

| Absolute Path | Description |
|--------------|-------------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_job_worker.py` | Celery FFmpeg worker with job handlers |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_media_job_worker.py` | Worker unit tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` | tRPC router + Express SSE route |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/mediaJobs.test.ts` | API route tests |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/webEngineAdapter.ts` | Client-side web adapter |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/__tests__/webEngineAdapter.test.ts` | Adapter tests |
| `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/media_jobs.py` | Optional HTTP bridge endpoint |

### Modified Files

| Absolute Path | Change |
|--------------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts` | Add `import { mediaJobsRouter }` and mount as `mediaJobs: mediaJobsRouter` in the `appRouter` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` | Add `import { registerMediaJobRoutes }` and call `registerMediaJobRoutes(app)` after `registerLLMRoutes(app)` (around line 118) |

---

## Key Architectural Decisions

### Redis as communication layer (not Celery internals)

The Node.js server never reads Celery's internal result backend keys. Instead, the application defines its own Redis key schema (`media-job:{jobId}:status`, etc.) that both sides agree on. This decouples from Celery's internal format and makes the protocol testable independently.

### SSE via Express (not tRPC)

tRPC does not natively support Server-Sent Events. The SSE streaming endpoint is registered as a plain Express route, following the same pattern already used by `/home/dev/projects/SmartSpecPro/apps/web/server/_core/llmRoutes.ts` for LLM streaming. The CRUD operations (submit, status, cancel) use standard tRPC procedures.

### Auth on all endpoints

All media job endpoints require authentication via `protectedProcedure`. Users can only see and cancel their own jobs. Admin users (role === "admin") can see all jobs. The SSE endpoint authenticates by reading the session cookie (same mechanism as the tRPC context creation in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/context.ts`).

### Per-user concurrent job limit

To prevent resource exhaustion, a per-user concurrent job limit of 3 is enforced at submission time. The Node.js server checks how many jobs with status "queued" or "running" exist for the requesting user before accepting a new submission. This limit should be configurable via system settings.

### Pub/sub + polling fallback

The SSE endpoint subscribes to Redis pub/sub for real-time updates. As a reliability fallback, it also polls the status key every 2 seconds. This handles the case where a pub/sub message is lost (e.g., if the subscriber connects after the message was published).