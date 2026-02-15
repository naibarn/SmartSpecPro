I now have sufficient understanding of the codebase and the deployment plan. Let me generate the section content.

# Section 7: Kie AI Integration (Webhook + Polling) for Cloud Tasks

## Overview

This section migrates the Kie AI completion flow from the current Celery-based architecture to Google Cloud Tasks. The system implements a dual completion path: a webhook handler as the primary mechanism and a polling fallback with exponential backoff. Both paths converge on the same result: updating the job in the database and enqueuing a media-processing task via Cloud Tasks.

**What this section does NOT cover:**
- The actual media-processing pipeline (downloading, thumbnails, R2 upload) -- that is Section 8 (Media Pipeline).
- Cloud Tasks queue creation and OIDC middleware -- that is Section 4 (Cloud Tasks Migration).
- R2 storage setup -- that is Section 9.

**Dependencies:**
- **Section 4 (Cloud Tasks Migration):** OIDC validation middleware on `/tasks/*` endpoints, the `enqueue_task` Python helper, Cloud Tasks queues (`media-jobs`, `polling-tasks`).
- **Section 9 (R2 Storage):** R2 bucket and credentials (needed by Section 8, which this section feeds into).

**What this section blocks:**
- **Section 8 (Media Pipeline):** The `POST /tasks/process-media` handler (Section 8) is enqueued by the webhook and polling handlers built here.

---

## Tests First

All tests below belong in the Python backend test suite. They use pytest with async support and mock external dependencies (Kie AI API, Cloud Tasks client, Redis).

### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/api/test_kie_webhook_handler.py`

```python
"""Tests for the Kie AI webhook handler at POST /api/webhooks/kie."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

# -- Webhook signature validation --

@pytest.mark.unit
async def test_valid_webhook_signature_updates_job_to_done():
    """Valid webhook with correct HMAC signature updates job status to 'done'
    and enqueues a media-job processing Cloud Task."""
    ...

@pytest.mark.unit
async def test_valid_webhook_enqueues_media_processing_task():
    """After updating job status, webhook handler enqueues
    POST /tasks/process-media via Cloud Tasks 'media-jobs' queue."""
    ...

@pytest.mark.unit
async def test_duplicate_webhook_returns_200_without_reprocessing():
    """If kie_job_id already completed in DB, return 200 immediately.
    No Cloud Task is enqueued. Dedup key checked in Redis."""
    ...

@pytest.mark.unit
async def test_webhook_invalid_signature_returns_401():
    """Webhook with wrong or missing HMAC signature returns 401.
    Job status is NOT updated. No Cloud Task enqueued."""
    ...

@pytest.mark.unit
async def test_webhook_unknown_kie_job_id_returns_404():
    """Webhook referencing a kie_job_id not found in the jobs table
    returns 404. No side effects."""
    ...

@pytest.mark.unit
async def test_webhook_stores_dedup_key_in_redis():
    """After successful processing, the handler stores
    'webhook-dedup:{kie_job_id}' in Upstash Redis with 24h TTL."""
    ...

@pytest.mark.unit
async def test_webhook_checks_redis_dedup_before_db():
    """If Redis dedup key exists for kie_job_id, handler returns 200
    immediately without querying the database."""
    ...
```

### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/api/test_kie_poll_handler.py`

```python
"""Tests for the Kie AI polling handler at POST /tasks/poll-job."""

import pytest
from unittest.mock import AsyncMock, patch

# -- Polling handler --

@pytest.mark.unit
async def test_poll_completed_job_triggers_media_processing():
    """Poll for a completed Kie AI job enqueues process-media
    Cloud Task and updates job status to 'done'."""
    ...

@pytest.mark.unit
async def test_poll_in_progress_re_enqueues_with_increased_delay():
    """Poll for an in-progress job re-enqueues itself to the
    polling-tasks queue with doubled delay (exponential backoff).
    Delay sequence: 2min -> 4min -> 8min -> ... capped at 30min."""
    ...

@pytest.mark.unit
async def test_poll_timed_out_marks_job_timeout():
    """If the job has been polling for >24 hours, mark as 'timeout',
    record a job_events entry, and do NOT re-enqueue."""
    ...

@pytest.mark.unit
async def test_poll_already_completed_returns_200():
    """If the job was already completed (webhook arrived first),
    return 200 without calling Kie AI status API or enqueuing anything."""
    ...

@pytest.mark.unit
async def test_poll_kie_api_error_returns_5xx_for_retry():
    """If Kie AI status API returns a transient error (network, 5xx),
    the handler returns 5xx so Cloud Tasks retries automatically."""
    ...

@pytest.mark.unit
async def test_poll_kie_permanent_error_marks_failed():
    """If Kie AI status API returns a permanent error (task cancelled,
    invalid task ID), mark job as failed and return 200."""
    ...
```

### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_kie_job_submission.py`

```python
"""Tests for the updated job submission flow on the Node.js side.
These validate the Cloud Tasks polling enqueue behavior."""

# NOTE: These tests are Vitest tests documented here for reference,
# but implemented in the Node.js test suite.
# File: /home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/mediaJobs.kie.test.ts

# @vitest
# test: Job submission enqueues polling task with 2-minute delay
# test: Job submission stores kie_job_id in DB
# test: Job submission respects per-user concurrency limit (max 3)
```

### File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/mediaJobs.kie.test.ts`

```typescript
/**
 * Tests for updated Kie AI job submission flow with Cloud Tasks polling.
 */
import { describe, it, expect, vi } from "vitest";

describe("Kie AI Job Submission (Cloud Tasks)", () => {
  it("should enqueue a polling task with 2-minute delay after Kie AI submission", async () => {
    /** After calling Kie AI and receiving kie_job_id, the handler should call
     * enqueueTask({ queueName: 'polling-tasks', handlerPath: '/tasks/poll-job',
     *   payload: { job_id, kie_job_id }, delaySeconds: 120 })
     */
  });

  it("should store kie_job_id in the database after successful submission", async () => {
    /** The media_tasks row must have task_id = kie_job_id after submission. */
  });

  it("should reject submission when user has 3 active concurrent jobs", async () => {
    /** Per-user concurrency limit of 3 is enforced via Redis Set.
     * Response: 429 Too Many Requests. */
  });
});
```

---

## Implementation Details

### 1. Webhook Endpoint: `POST /api/webhooks/kie`

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/media_generation.py`

The existing `POST /callback/kie-ai` endpoint already handles Kie AI webhooks with HMAC signature validation, payload normalization, and a durable callback pipeline. This section refactors it to work with Cloud Tasks instead of the legacy in-memory `_pending_callbacks` dict.

**Changes required:**

1. **Move the endpoint path** from `/callback/kie-ai` to `/api/webhooks/kie` (the new canonical public URL). The old path should redirect or remain as an alias during the migration period.

2. **Add Redis-based dedup check** before any DB operations. On webhook receipt:
   - Compute a dedup key: `webhook-dedup:{kie_job_id}`.
   - Check Upstash Redis for this key. If present, return `200 OK` immediately (duplicate).
   - After successful processing, `SET webhook-dedup:{kie_job_id} 1 EX 86400` (24h TTL).

3. **Enqueue Cloud Tasks media-processing task** instead of relying on the durable callback pipeline to update DB status directly. After confirming the webhook is valid and the job exists:
   - Call `enqueue_task(queue_name='media-jobs', handler_path='/tasks/process-media', payload={'job_id': job_id, 'kie_job_id': kie_job_id, 'result_url': result_url})`.
   - The actual media download/processing happens in Section 8's handler.

4. **Keep the existing durable callback pipeline** (`process_kie_callback_payload`) as a fallback during migration. Use the `USE_CLOUD_TASKS` feature flag to choose between the new Cloud Tasks path and the existing durable pipeline path.

**Webhook handler pseudocode:**

```python
@router.post("/api/webhooks/kie")
async def kie_webhook_handler(request: Request, db: AsyncSession = Depends(get_db)):
    """Receive Kie AI completion callbacks. Public endpoint with HMAC validation."""

    # 1. Validate HMAC signature (from KIE_AI_WEBHOOK_SECRET)
    #    Return 401 on failure (not 5xx -- must not trigger Cloud Tasks retry)

    # 2. Parse payload, extract kie_job_id and status

    # 3. Redis dedup check
    #    Key: webhook-dedup:{kie_job_id}
    #    If exists: return 200 {"duplicate": true}

    # 4. Look up job by kie_job_id in media_tasks table
    #    If not found: return 404

    # 5. Idempotency: if job already completed, return 200

    # 6. If status == completed and result_url present:
    #    a. Update job status to 'done' in DB
    #    b. Record job_events entry
    #    c. Enqueue Cloud Tasks: POST /tasks/process-media
    #       payload: {job_id, kie_job_id, result_url, media_type}

    # 7. If status == failed:
    #    a. Update job status to 'failed' in DB
    #    b. Record error in job_events
    #    c. Return 200 (no retry needed)

    # 8. Store dedup key in Redis with 24h TTL

    # 9. Return 200
```

**Signature validation** reuses the existing HMAC validation logic from the current `kie_ai_callback` function in `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/media_generation.py` (lines 1318-1336). The webhook secret is read from `KIE_AI_WEBHOOK_SECRET` environment variable (in production, sourced from GCP Secret Manager).

### 2. Polling Handler: `POST /tasks/poll-job`

**File to create/modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/task_handlers.py`

This is a new file for Cloud Tasks handler endpoints. All handlers in this file are internal-only, protected by the OIDC validation middleware (from Section 4).

**Poll handler pseudocode:**

```python
@router.post("/tasks/poll-job")
async def poll_job_handler(request: Request, db: AsyncSession = Depends(get_db)):
    """Poll Kie AI for job status. Called by Cloud Tasks with retry."""

    # OIDC validation handled by middleware (Section 4)

    # 1. Parse payload: {job_id, kie_job_id, attempt, submitted_at}

    # 2. Idempotency: check if job is already completed/failed in DB
    #    If terminal: return 200

    # 3. Call Kie AI status API via kie_client.get_task_status(kie_job_id)
    #    Use existing _normalize_kie_task_state() and _extract_first_kie_result_url()
    #    from media_generation.py

    # 4. If completed:
    #    a. Update job status to 'done'
    #    b. Enqueue Cloud Tasks: POST /tasks/process-media
    #    c. Return 200

    # 5. If still processing:
    #    a. Check timeout: if submitted_at > 24h ago, mark as 'timeout', return 200
    #    b. Calculate next delay: min(initial_delay * 2^attempt, 1800) seconds
    #       Initial delay: 120s (2 min)
    #       Sequence: 120s, 240s, 480s, 960s, 1800s, 1800s, ...
    #    c. Re-enqueue self to polling-tasks queue with new delay
    #    d. Return 200

    # 6. If Kie AI returns error:
    #    a. If transient (network/5xx): return 5xx (Cloud Tasks retries)
    #    b. If permanent (cancelled, invalid ID): mark failed, return 200
```

**Exponential backoff schedule:**

| Attempt | Delay    | Cumulative Wait |
|---------|----------|-----------------|
| 1       | 2 min    | 2 min           |
| 2       | 4 min    | 6 min           |
| 3       | 8 min    | 14 min          |
| 4       | 16 min   | 30 min          |
| 5+      | 30 min   | 60 min, 90 min, ... |

The `polling-tasks` queue configuration (from Section 1) limits to 2/s dispatch rate and 5 concurrent, which prevents overwhelming the Kie AI status API.

### 3. Job Submission Flow Updates

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts`

The current `dispatchToCelery` function (lines 209-235) sends an HTTP POST to the Python backend's `/api/v1/media-jobs/execute` endpoint. This must be updated to also enqueue a Cloud Tasks polling task.

**Changes required:**

1. After the Node.js API calls Kie AI (via the Python backend) and receives a `kie_job_id`, enqueue a polling task to Cloud Tasks:

```typescript
// After receiving kie_job_id from the Kie AI submission response:
import { enqueueTask } from "../services/cloudTasks";

await enqueueTask({
  queueName: "polling-tasks",
  handlerPath: "/tasks/poll-job",
  payload: {
    job_id: jobId,
    kie_job_id: kieJobId,
    attempt: 0,
    submitted_at: Date.now(),
  },
  delaySeconds: 120, // First poll after 2 minutes
});
```

2. **Feature flag gating:** Use the `USE_CLOUD_TASKS` feature flag (stored in Upstash Redis, from Section 10) to determine whether to use the new Cloud Tasks polling path or the existing client-side polling. This allows gradual rollout:

```typescript
const useCloudTasks = await redis.cache.get("USE_CLOUD_TASKS") === "true";

if (useCloudTasks) {
  // New path: Cloud Tasks polling
  await enqueueTask({ queueName: "polling-tasks", ... });
} else {
  // Legacy path: client polls via SSE/REST
  // (existing behavior, no change needed)
}
```

3. **Preserve existing concurrency tracking:** The per-user concurrency limit (max 3 concurrent jobs via Redis Set at `media-jobs:user:{userId}:active`) remains unchanged. This uses Memorystore Redis for the active-set tracking (not Upstash), as documented in Section 10.

4. **Preserve existing progress reporting:** The SSE endpoint at `/api/media-jobs/:id/events` and the Redis pub/sub progress channel `media-job-progress:{jobId}` remain unchanged. Progress updates will come from the Python Cloud Run service (which publishes to Memorystore Redis), received by the Node.js SSE subscriber.

### 4. Redis Dedup Service

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/webhook_dedup.py`

A simple service for webhook deduplication using Upstash Redis:

```python
"""Webhook deduplication via Upstash Redis."""

class WebhookDedupService:
    """Check and store webhook dedup keys with 24h TTL."""

    async def is_duplicate(self, kie_job_id: str) -> bool:
        """Check if this kie_job_id has already been processed."""
        ...

    async def mark_processed(self, kie_job_id: str) -> None:
        """Mark a kie_job_id as processed. Key expires after 24h."""
        ...
```

The key pattern is `webhook-dedup:{kie_job_id}`. The TTL of 24 hours matches Cloud Tasks' dedup window for task IDs.

### 5. Cloud Tasks Integration Points

This section creates two Cloud Tasks interactions:

**A. Webhook enqueues media processing:**
- Queue: `media-jobs` (5/s, 10 concurrent, 5 retries)
- Handler: `POST /tasks/process-media` (implemented in Section 8)
- Payload: `{ job_id, kie_job_id, result_url, media_type }`

**B. Polling self-enqueue:**
- Queue: `polling-tasks` (2/s, 5 concurrent, 10 retries)
- Handler: `POST /tasks/poll-job` (implemented in this section)
- Payload: `{ job_id, kie_job_id, attempt, submitted_at }`
- Delay: exponential backoff (120s to 1800s cap)

Both use the `enqueue_task()` helper from Section 4. The `task_id` parameter is set to a deterministic value (`poll-{job_id}-{attempt}` for polling, `process-{job_id}` for media processing) to leverage Cloud Tasks' 24-hour dedup window.

### 6. Existing Code to Preserve

The following existing code must be preserved during this migration:

- **`_normalize_kie_task_state()`** in `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/media_generation.py` (lines 111-159) -- Used by the polling handler to normalize Kie AI response formats.
- **`_extract_first_kie_result_url()`** in the same file (lines 176-253) -- Used by the polling handler to extract result URLs from various Kie response shapes.
- **`_extract_model_query_endpoint()`** in the same file (lines 256-279) -- Used to find model-specific query endpoints for polling.
- **`process_kie_callback_payload()`** in `/home/dev/projects/SmartSpecPro/python-backend/app/services/media_callback_service.py` -- The durable callback pipeline remains as a fallback path.
- **`MediaTaskService`** in `/home/dev/projects/SmartSpecPro/python-backend/app/services/media_task_service.py` -- All DB operations (get_task_by_external_id, update_task_by_external_id, update_task_status) remain unchanged.
- **Per-user concurrency tracking** in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` (lines 57-90) -- Redis Set at `media-jobs:user:{userId}:active` with `MAX_CONCURRENT_JOBS = 3`.
- **SSE progress streaming** in the same file (lines 505-622) -- Redis pub/sub subscriber for real-time progress updates.

### 7. Migration Path

This section follows the phased migration strategy from Section 4:

**Phase A (Deploy alongside):**
- Deploy the new webhook endpoint at `/api/webhooks/kie` alongside the existing `/callback/kie-ai`.
- Configure Kie AI to send webhooks to the new endpoint.
- Cloud Tasks polling runs in parallel with existing client-side polling.
- Feature flag `USE_CLOUD_TASKS` controls which path the Node.js submission flow uses.

**Phase B (Validate):**
- Monitor webhook delivery rate vs. polling completion rate.
- Compare job completion latency between webhook and polling paths.
- Verify dedup prevents double-processing when both webhook and polling complete.

**Phase C (Remove legacy):**
- Remove the legacy `_pending_callbacks` in-memory dict.
- Remove the old `/callback/kie-ai` endpoint (or redirect to `/api/webhooks/kie`).
- Remove the `setInterval` cleanup at lines 1048-1093 of `mediaJobs.ts` (moved to Cloud Scheduler in Section 6).

---

## File Summary (Actual Implementation)

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/api/v1/kie_webhooks.py` | **Create** | `POST /api/webhooks/kie` — dedicated public webhook router with HMAC, Redis dedup, Cloud Tasks enqueue |
| `python-backend/app/api/v1/task_handlers.py` | **Modify** | Added full `POST /tasks/poll-job` handler with exponential backoff and 24h timeout |
| `python-backend/app/services/webhook_dedup.py` | **Create** | Redis-based webhook dedup service (24h TTL keys) |
| `python-backend/app/main.py` | **Modify** | Registered `kie_webhooks.router` on app |
| `apps/web/server/routers/mediaJobs.ts` | **Modify** | Added `enqueuePollingTask()`, updated `dispatchToCelery` to return `kie_job_id`, Cloud Tasks polling in `dispatchJob` |
| `python-backend/tests/unit/api/test_kie_webhook_handler.py` | **Create** | 7 webhook handler tests |
| `python-backend/tests/unit/api/test_kie_poll_handler.py` | **Create** | 6 polling handler tests |
| `apps/web/server/routers/__tests__/mediaJobs.kie.test.ts` | **Create** | 3 Node.js job submission tests |

### Deviations from Plan

1. **Webhook in separate file**: The plan called for adding the webhook to `media_generation.py`. Code review identified that `/api/webhooks/kie` is a public endpoint that should NOT be behind the `/tasks/*` OIDC middleware, so it was placed in a new dedicated `kie_webhooks.py` with its own `APIRouter(prefix="/api/webhooks")`.

2. **`task_handlers.py` already existed**: The plan listed this as "Create" but it was already created in Section 4 with a stub `poll_job` handler. The stub was replaced with the full implementation.

3. **Feature flag gating deferred**: The `USE_CLOUD_TASKS` feature flag gating in the webhook handler was deferred — the webhook itself doesn't need a flag since it only processes incoming calls. The Node.js `dispatchJob` already has feature flag gating from Section 5.

4. **`job_events` recording deferred**: The plan called for recording `job_events` entries. This was deferred as the `job_events` table/service doesn't exist yet and is not critical for the Cloud Tasks migration.

5. **JSON parse error handling added**: Code review identified that `request.body()` parsing needed explicit `try/except` for malformed payloads (returns 400).

6. **`enqueue_task` wrapped in try/except**: Code review identified that the media-processing enqueue in the webhook handler should be best-effort to avoid failing the entire webhook on transient Cloud Tasks errors.

7. **Dead code bug fixed in Node.js**: Code review found that `useCloudTasks && result.kie_job_id` in the else branch of `dispatchJob` was dead code (always false). Fixed by removing the `useCloudTasks &&` guard.

---

## Test Results

- **Python**: 13 tests passing (7 webhook + 6 polling)
- **Node.js**: 3 tests passing
- **Total**: 16 tests, all green