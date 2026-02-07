Now I have all the context I need to write the final section. Let me produce the content.

# Section 09: Integration Testing and End-to-End Verification

This is the **final section** of the Media Job System implementation. It depends on ALL previous sections (01 through 08) being complete. Its purpose is to verify that the entire system works together: type contracts, client routing, engine adapters (desktop and web), frontend components, FFmpeg bundling, validation, and security -- all integrated end-to-end.

## Prerequisites

All of these must be implemented and passing their own unit tests before starting this section:

- **Section 01** -- Job Spec types in `apps/web/shared/types/mediaJob.ts` with `validateJobSpec`, `projectToTimeline`, `timelineToProject`, and conversion helpers
- **Section 02** -- `MediaJobClient` and `IEngineAdapter` interface in `apps/web/client/src/services/mediaJobClient.ts`
- **Section 03** -- `TauriEngineAdapter` in `apps/web/client/src/services/tauriEngineAdapter.ts` and Rust `job_dispatcher.rs` with `build_filter_complex`, waveform, silence detection
- **Section 04** -- Python Celery worker `media_job_worker.py`, Node.js `mediaJobs.ts` router with SSE, `WebEngineAdapter`
- **Section 05** -- Consolidated `VideoEditor.tsx`, wired to `MediaJobClient`, time unit migration to ms
- **Section 06** -- Web UI support: `WebAssetResolver`, `WebProjectManager`, platform-aware components, navigation integration
- **Section 07** -- FFmpeg sidecar bundling via `externalBin`, graceful Linux fallback
- **Section 08** -- Validation and security: SSRF prevention, path sanitization, codec allowlist, resource limits

## Architecture Context

The Media Job System has three tiers of communication:

1. **Frontend** -- React components call `MediaJobClient` convenience methods (e.g., `probe()`, `renderMp4()`)
2. **Client Layer** -- `MediaJobClient` delegates to an `IEngineAdapter` (auto-detected: `TauriEngineAdapter` for desktop, `WebEngineAdapter` for browser)
3. **Backend** -- Desktop: Tauri sidecar FFmpeg via Rust `job_dispatcher`. Web: Node.js API routes forwarding to Python/Celery worker via Redis keys and pub/sub

Progress flows back through the same chain: Desktop via Tauri events, Web via SSE over Redis pub/sub.

### Redis Key Schema (Web Pipeline)

```
media-job:{jobId}:status  -- JSON { status, progress, etaMs, stage, message, metrics }
media-job:{jobId}:result  -- JSON { artifacts, derived }
media-job:{jobId}:error   -- JSON { code, message, details }
```

Redis channel for real-time progress: `media-job-progress:{jobId}`

### Key Types Referenced

```typescript
// From section 01 - apps/web/shared/types/mediaJob.ts
interface MediaJobSpec {
  specVersion: "0.1"
  jobId: string
  jobType: MediaJobType
  priority?: "low" | "normal" | "high"
  inputs: { assets?: MediaAsset[]; project?: MediaTimeline | null }
  params?: Record<string, unknown>
  output: { mode: "file" | "dir" | "memory"; target: string; overwrite?: boolean }
  engine?: { strategy: "desktop_sidecar" | "web_backend" | "web_wasm"; hints?: Record<string, unknown> }
  cache?: { enabled?: boolean; key?: string }
  telemetry?: { traceId?: string }
}

interface MediaJobProgress {
  jobId: string
  status: MediaJobStatus  // "queued" | "running" | "done" | "error" | "canceled"
  progress: number        // 0.0 - 1.0
  etaMs?: number
  stage?: string
  message?: string
  metrics?: { speed?: string; outTimeMs?: number }
}

interface MediaJobResult {
  jobId: string
  status: "done"
  artifacts: MediaArtifact[]
  derived?: Record<string, unknown>
}
```

---

## Tests FIRST

This section defines three categories of integration tests. All tests should be written as stubs first, then implementations filled in.

### 9.1 TypeScript Integration Tests (Vitest)

#### File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/mediaJobs.integration.test.ts`

This file tests the Node.js media jobs API routes against a real (or mocked) backend, verifying the full request-response cycle from HTTP request through to Redis state and back.

**Test conventions**: Follow the pattern established in `apps/web/server/routers/adminTenants.integration.test.ts` -- use real Express server instances with `createServer`, bind to port 0, clean up in `afterAll`.

```
describe("Media Jobs API Integration")

  Test: POST /api/media-jobs with valid probe spec returns 202 and jobId
    - Build a valid MediaJobSpec with jobType "probe"
    - POST to the media jobs endpoint
    - Assert HTTP 202 response with { jobId } in body
    - Assert jobId matches UUID format

  Test: POST /api/media-jobs with invalid spec returns 400 with validation errors
    - Submit a spec missing required jobType field
    - Assert HTTP 400 with { errors } array in response body
    - Assert at least one error mentions "jobType"

  Test: POST /api/media-jobs without auth returns 401
    - Submit request with no auth header / no session cookie
    - Assert HTTP 401

  Test: GET /api/media-jobs/:id returns status for existing job
    - Submit a job, get back jobId
    - Write a status entry to the Redis key media-job:{jobId}:status
    - GET /api/media-jobs/{jobId}
    - Assert response contains { status, progress }

  Test: GET /api/media-jobs/:id returns 404 for unknown jobId
    - GET /api/media-jobs/nonexistent-uuid
    - Assert HTTP 404

  Test: DELETE /api/media-jobs/:id cancels a running job
    - Submit a job
    - Write status "running" to Redis
    - DELETE /api/media-jobs/{jobId}
    - Assert HTTP 200 and job status changes to "canceled"

  Test: user can only access their own jobs (authorization)
    - Submit job as user A
    - Attempt GET as user B
    - Assert HTTP 403 or 404 (job not visible to other user)

  Test: concurrent job limit is enforced
    - Submit 3 jobs as the same user (the configured max)
    - Attempt a 4th submission
    - Assert HTTP 429 with rate limit message

  Test: SSE endpoint streams progress events
    - Submit a job
    - Connect to GET /api/media-jobs/{jobId}/events
    - Publish progress updates to Redis channel media-job-progress:{jobId}
    - Assert SSE events received with correct progress values
    - Assert SSE stream closes after "done" status event

  Test: job completion writes audit log entry
    - Submit a job with telemetry.traceId set
    - Simulate job completion (set Redis result key)
    - Verify audit log contains entry with eventType "media_response" and matching traceId
```

#### File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/__tests__/mediaJobClient.integration.test.ts`

This file tests the `MediaJobClient` end-to-end flow using mock adapters that simulate real backend behavior (multiple progress callbacks before completion).

```
describe("MediaJobClient Integration")

  Test: full probe lifecycle -- submit, progress, result
    - Create a MockEngineAdapter that:
      - On submitJob: returns a jobId
      - On onProgress: emits "queued" then "running" with progress 0.5 then "done"
    - Call client.probe(assetUri)
    - Assert the returned MediaAsset has correct fields from the mock result

  Test: full render lifecycle -- submit, multiple progress callbacks, result
    - Create a MockEngineAdapter simulating a render that takes 3 progress steps
    - Call client.renderMp4(timeline, outputTarget)
    - Collect all onProgress calls
    - Assert progress values are monotonically non-decreasing (0.0 -> 0.33 -> 0.66 -> 1.0)
    - Assert final result contains artifact with output URI

  Test: error propagation -- adapter returns error status
    - Create a MockEngineAdapter that emits "error" status
    - Call client.waitForCompletion(jobId)
    - Assert it rejects with a MediaJobError containing the error code and message

  Test: cancellation flow
    - Create a MockEngineAdapter tracking cancelJob calls
    - Submit a job, then cancel it
    - Assert adapter.cancelJob was called with the correct jobId
    - Assert no further progress events are emitted after cancellation

  Test: convenience method spec construction
    - Create a spy adapter that captures the submitted spec
    - Call each convenience method (probe, renderMp4, getWaveformPeaks, detectDeadAir, cutDeadAir, extractSubtitles, concat)
    - For each, assert the spec.jobType, spec.inputs, and spec.params are correct
```

#### File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/__tests__/adapterSelection.integration.test.ts`

Tests for the auto-detection logic that selects the correct engine adapter based on environment.

```
describe("Engine Adapter Auto-Selection")

  Test: selects TauriEngineAdapter when window.__TAURI__ is defined
    - Set globalThis.window.__TAURI__ = { ... }
    - Import adapter factory / MediaJobClient factory
    - Assert the created adapter is an instance of TauriEngineAdapter

  Test: selects WebEngineAdapter when window.__TAURI__ is undefined
    - Ensure window.__TAURI__ is not defined
    - Import adapter factory
    - Assert the created adapter is an instance of WebEngineAdapter

  Test: adapter can be explicitly overridden via constructor
    - Create MediaJobClient with an explicit MockEngineAdapter
    - Assert it uses the provided adapter regardless of environment
```

### 9.2 Python Integration Tests (pytest)

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_media_job_pipeline.py`

This file tests the Celery worker end-to-end: job spec comes in, FFmpeg commands are built and executed (or mocked), results are written to Redis.

**Test conventions**: Follow patterns from `python-backend/tests/services/test_media_task_service.py`. Use pytest markers (`@pytest.mark.integration`). Use SQLite in-memory for DB and mock Redis where needed.

```python
"""
Integration tests for the Media Job pipeline.
Tests the full flow: spec parsing -> FFmpeg command generation -> execution -> result.
"""

@pytest.mark.integration
class TestMediaJobPipeline:

    Test: probe job returns correct MediaAsset structure
        - Create a valid probe job spec JSON
        - Mock subprocess.run to return ffprobe JSON output
        - Call execute_media_job(spec_json)
        - Assert result contains streams, duration, codec info

    Test: render_mp4_h264 job builds correct filter_complex and executes
        - Create a render spec with a 2-clip timeline
        - Mock subprocess.run to capture the ffmpeg command
        - Call execute_media_job(spec_json)
        - Assert the captured command contains -filter_complex with trim+concat
        - Assert the output artifact URI is set correctly

    Test: waveform_peaks job returns peaks array
        - Create a waveform spec with bucketMs=50
        - Mock subprocess to return raw PCM bytes (known values)
        - Call execute_media_job(spec_json)
        - Assert result.derived contains peaks array of correct length
        - Assert peak values are normalized to 0.0-1.0

    Test: dead_air_detect returns silence segments
        - Create a dead_air_detect spec
        - Mock subprocess stderr with silence_start/silence_end lines
        - Call execute_media_job(spec_json)
        - Assert result.derived contains silenceSegments with correct start/end ms

    Test: dead_air_cut builds trim+concat from keep segments
        - Create a dead_air_cut spec with segments to keep
        - Mock subprocess to capture the ffmpeg command
        - Assert the command includes correct trim filter for each keep segment

    Test: progress updates are written to Redis
        - Create a render spec
        - Mock subprocess to emit -progress output lines over time
        - Assert Redis key media-job:{jobId}:status is updated with increasing progress
        - Assert Redis channel media-job-progress:{jobId} receives published messages

    Test: job failure writes error to Redis
        - Create a spec that will trigger an FFmpeg error (mock subprocess returning exit code 1)
        - Call execute_media_job(spec_json)
        - Assert Redis key media-job:{jobId}:error contains error code and message

    Test: invalid spec is rejected before FFmpeg execution
        - Create a spec with missing inputs
        - Call execute_media_job(spec_json)
        - Assert it raises a validation error without invoking subprocess
```

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_media_job_security.py`

Integration-level security tests for the Python worker (overlaps with section 08 but tests the integration, not individual validators).

```python
"""
Security integration tests for media job worker.
Verifies that validation and sandboxing work together.
"""

@pytest.mark.integration
class TestMediaJobSecurity:

    Test: SSRF-prone URI is rejected at the integration level
        - Submit a probe spec with uri "http://169.254.169.254/latest/meta-data/"
        - Assert the worker rejects it with an SSRF error before any subprocess call

    Test: path traversal URI is rejected
        - Submit a spec with uri "file:///etc/passwd"
        - Assert rejection with path traversal error

    Test: oversized output is killed by timeout
        - Submit a render spec with mock subprocess that never exits
        - Assert the worker enforces its timeout and kills the process
        - Assert an error result is written with timeout code

    Test: shell injection via crafted asset label is prevented
        - Submit a spec where asset label contains "; rm -rf /"
        - Assert the label is never passed to subprocess arguments unsanitized
```

### 9.3 End-to-End Job Submission Flow Tests

#### File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/mediaJobs.e2e.test.ts`

These tests simulate the complete user journey: frontend builds a spec, submits via the API, the backend enqueues it, progress flows back, and the result is retrieved. This requires more extensive mocking of the Celery/Redis infrastructure.

**Important**: These are "end-to-end" within the Node.js process. They do NOT spin up the Python worker. Instead, they mock the Redis keys that the worker would write to, verifying that the Node.js orchestration layer handles the full lifecycle.

```
describe("End-to-End Media Job Flow")

  Test: probe job full lifecycle
    - Authenticate as test user
    - POST a probe spec to /api/media-jobs
    - Assert 202 with jobId
    - Simulate worker writing status "running" to Redis
    - GET /api/media-jobs/{jobId} -- assert status is "running"
    - Simulate worker writing result to Redis
    - GET /api/media-jobs/{jobId} -- assert status is "done" with artifacts
    - Verify audit log contains both media_request and media_response events

  Test: render job with SSE progress streaming
    - Authenticate as test user
    - POST a render_mp4_h264 spec
    - Open SSE connection to /api/media-jobs/{jobId}/events
    - Simulate worker publishing 3 progress updates to Redis channel
    - Assert all 3 SSE events received in order with correct progress values
    - Simulate worker writing result
    - Assert SSE stream emits final "done" event and closes

  Test: job cancellation mid-progress
    - Authenticate as test user
    - POST a render spec
    - Simulate worker setting status to "running" with progress 0.3
    - DELETE /api/media-jobs/{jobId}
    - Assert status changes to "canceled"
    - Assert no further progress events are emitted on SSE

  Test: file upload followed by job submission (web pipeline)
    - Authenticate as test user
    - POST multipart file to /api/media-jobs/upload
    - Assert response contains uploaded asset URI (https:// format)
    - POST a probe spec using the returned URI
    - Assert job is accepted (202)

  Test: error handling for worker crash
    - Authenticate as test user
    - POST a render spec
    - Simulate worker writing error to Redis (code: "FFMPEG_CRASH", message: "Segmentation fault")
    - GET /api/media-jobs/{jobId}
    - Assert status is "error" with the correct error code and message
    - Verify audit log contains media_response with error details
```

---

## Implementation Details

### 9.1 Test Infrastructure Setup

#### Vitest Configuration

The existing `apps/web/vite.config.ts` does not include Vitest configuration explicitly -- it relies on defaults. For integration tests, ensure the test command supports the integration test files.

No changes to `vite.config.ts` are needed. Run integration tests the same way as existing tests:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm test                                          # all tests
pnpm vitest run server/routers/__tests__/mediaJobs.integration.test.ts  # specific file
pnpm vitest run --reporter=verbose                 # verbose output
```

#### pytest Configuration

The existing `python-backend/pyproject.toml` already has the `integration` marker defined. Run integration tests with:

```bash
cd /home/dev/projects/SmartSpecPro/python-backend
pytest -m integration                              # integration tests only
pytest tests/integration/test_media_job_pipeline.py # specific file
```

### 9.2 Shared Test Fixtures and Helpers

#### TypeScript Test Helpers

Create a shared fixture file used by all integration tests.

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/mediaJobFixtures.ts`

This file should export:

- `buildValidProbeSpec(overrides?)` -- returns a minimal valid `MediaJobSpec` with jobType "probe"
- `buildValidRenderSpec(overrides?)` -- returns a valid render spec with a 2-clip timeline
- `buildValidWaveformSpec(overrides?)` -- returns a valid waveform spec
- `createTestServer()` -- starts an Express server with the mediaJobs router mounted, returns `{ server, base, cleanup }`
- `mockRedisState(jobId, state)` -- writes state to the Redis key schema for a job
- `mockRedisResult(jobId, result)` -- writes result to Redis
- `mockRedisError(jobId, error)` -- writes error to Redis
- `createAuthHeaders(userId)` -- returns auth headers for a test user
- `waitForSSEEvent(url, eventName, timeoutMs)` -- connects to SSE endpoint and waits for a specific event

These helper functions should use the `vi.mock` pattern for Redis (mocking `ioredis`) unless running against a real Redis instance (controlled by `process.env.TEST_REDIS_URL`).

#### Python Test Fixtures

Create a shared fixture module for media job tests.

**File**: `/home/dev/projects/SmartSpecPro/python-backend/tests/fixtures/media_job_fixtures.py`

This file should export:

- `valid_probe_spec()` -- returns a dict representing a valid probe job spec
- `valid_render_spec(num_clips=2)` -- returns a dict with a multi-clip timeline
- `valid_waveform_spec(bucket_ms=50)` -- returns a waveform spec
- `valid_dead_air_spec()` -- returns a dead air detection spec
- `mock_ffprobe_output()` -- returns sample ffprobe JSON output
- `mock_ffmpeg_progress_lines()` -- returns sample `-progress pipe:1` output
- `mock_silence_detect_stderr()` -- returns sample silencedetect filter output

Use `@pytest.fixture` decorators so these can be injected into test functions.

### 9.3 Mock Adapter for Client Integration Tests

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/__tests__/MockEngineAdapter.ts`

A test-only adapter implementing `IEngineAdapter` that allows tests to script the progression of job states.

```typescript
/**
 * MockEngineAdapter for integration testing.
 * Allows tests to script job status progression and capture submitted specs.
 */
class MockEngineAdapter implements IEngineAdapter {
  /** All specs submitted to this adapter */
  submittedSpecs: MediaJobSpec[]
  /** Canceled job IDs */
  canceledJobs: string[]
  /** Configure what status sequence a job goes through */
  setJobProgression(jobId: string, steps: MediaJobProgress[]): void
  /** Configure the final result for a job */
  setJobResult(jobId: string, result: MediaJobResult): void
  /** Configure an error for a job */
  setJobError(jobId: string, error: MediaJobError): void
}
```

The adapter should use `setTimeout` or microtask scheduling to simulate async progression through the configured steps.

### 9.4 Redis Mocking Strategy

For TypeScript integration tests that need Redis:

- **Option A (recommended for CI)**: Mock `ioredis` entirely using `vi.mock`. The mock should support `get`/`set`/`del`/`publish`/`subscribe` backed by an in-memory Map.
- **Option B (for local integration testing)**: Use real Redis (requires `docker compose up -d`). Guard with `process.env.TEST_REDIS_URL`. Skip tests if Redis is unavailable.

For Python integration tests:

- Use `fakeredis` package (add to `requirements-dev.txt` if not present). It provides an in-memory Redis-compatible object.
- Alternatively, mock the Redis calls in the worker with `unittest.mock.patch`.

### 9.5 Express Server Setup for API Integration Tests

The API integration tests need a running Express server with the `mediaJobs` router registered. Follow the pattern from `adminTenants.integration.test.ts`:

```typescript
// Pseudocode for createTestServer()
async function createTestServer() {
  // Mock auth middleware to accept test tokens
  // Mount the mediaJobs router (from section 04)
  // Start on port 0 (OS-assigned)
  // Return { server, base URL, cleanup function }
}
```

Auth mocking: The test should mock the `authenticateRequest` function (from `sdk.ts`) to return a controlled user object, similar to how `adminTenants.test.ts` does it with `mockAuthenticateRequest`.

### 9.6 Audit Log Verification

Integration tests that verify audit logging should:

1. Mock or spy on `auditLogger.log()` from `apps/web/server/services/auditLogger.ts`
2. After the operation under test, assert that `auditLogger.log` was called with the expected `eventType` and `traceId`
3. Do NOT read from JSONL files in tests -- that introduces file system coupling. Spy on the function call instead.

### 9.7 SSE Testing Approach

Testing SSE from Vitest requires connecting to the SSE endpoint and collecting events. Use the `EventSource` API or raw `fetch` with response body streaming:

```typescript
// Approach: use fetch with ReadableStream to consume SSE
async function collectSSEEvents(url: string, maxEvents: number, timeoutMs = 5000): Promise<string[]> {
  // fetch(url) with AbortController
  // Read from response.body (ReadableStream)
  // Parse SSE format: "data: {...}\n\n"
  // Collect events until maxEvents reached or timeout
}
```

Alternatively, if the test environment does not support `EventSource`, use the `eventsource` npm package as a polyfill.

### 9.8 Cross-Language Integration Verification

One critical integration test verifies that the Node.js API and Python worker agree on the Redis key schema. This is tested by:

1. In the TypeScript test: write a job status to `media-job:{jobId}:status` in the expected JSON format
2. Assert the Node.js API route can read and parse it correctly
3. In the Python test: write a job status from the worker and assert the JSON structure matches what Node.js expects

Both sides must produce/consume the same shape:

```json
{
  "status": "running",
  "progress": 0.5,
  "etaMs": 12000,
  "stage": "encoding",
  "message": "Encoding frame 500/1000",
  "metrics": { "speed": "2.1x", "outTimeMs": 25000 }
}
```

If either side changes this contract, the other side's integration tests should fail, catching the mismatch early.

---

## File Summary

### New Files to Create

| File | Language | Purpose |
|------|----------|---------|
| `apps/web/server/routers/__tests__/mediaJobs.integration.test.ts` | TypeScript | API route integration tests |
| `apps/web/server/routers/__tests__/mediaJobs.e2e.test.ts` | TypeScript | End-to-end job lifecycle tests |
| `apps/web/server/routers/__tests__/mediaJobFixtures.ts` | TypeScript | Shared test fixtures and helpers |
| `apps/web/client/src/services/__tests__/mediaJobClient.integration.test.ts` | TypeScript | Client integration tests |
| `apps/web/client/src/services/__tests__/adapterSelection.integration.test.ts` | TypeScript | Adapter auto-detection tests |
| `apps/web/client/src/services/__tests__/MockEngineAdapter.ts` | TypeScript | Mock adapter for testing |
| `python-backend/tests/integration/test_media_job_pipeline.py` | Python | Celery worker pipeline tests |
| `python-backend/tests/integration/test_media_job_security.py` | Python | Worker security integration tests |
| `python-backend/tests/fixtures/media_job_fixtures.py` | Python | Shared Python test fixtures |

### Files Referenced (from earlier sections, not modified here)

| File | Section | What it provides |
|------|---------|-----------------|
| `apps/web/shared/types/mediaJob.ts` | 01 | Type definitions, `validateJobSpec` |
| `apps/web/client/src/services/mediaJobClient.ts` | 02 | `MediaJobClient`, `IEngineAdapter` |
| `apps/web/client/src/services/tauriEngineAdapter.ts` | 03 | Desktop adapter |
| `apps/web/client/src/services/webEngineAdapter.ts` | 04 | Web adapter |
| `apps/web/server/routers/mediaJobs.ts` | 04 | API routes being tested |
| `python-backend/app/workers/media_job_worker.py` | 04 | Worker being tested |
| `apps/web/server/services/auditLogger.ts` | Existing | Audit logging |

---

## Verification Checklist

After implementing all tests in this section, run the full verification:

```bash
# 1. TypeScript unit + integration tests
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm test

# 2. TypeScript type checking
pnpm check

# 3. Python unit + integration tests
cd /home/dev/projects/SmartSpecPro/python-backend
pytest -m "unit or integration"

# 4. All tests together (from repo root)
cd /home/dev/projects/SmartSpecPro
npm run test 2>/dev/null || true   # if configured at root
```

**Expected outcomes**:
- All new integration tests pass (mocked Redis, mocked subprocess)
- All existing tests continue to pass (no regressions)
- TypeScript type check passes with no errors
- Python coverage remains at or above 80%

**If tests fail**: Follow the Debugging Protocol from CLAUDE.md. Read the exact error, trace the call chain, identify root cause. Do NOT change test expectations to make failing tests pass -- fix the implementation in the appropriate section instead.