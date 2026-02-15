Good -- no Cloud Tasks code exists yet. Now I have all the context I need. Let me produce the section content.

# Section 4: Celery to Cloud Tasks Migration

## Overview

This section replaces all Celery-based task processing with Google Cloud Tasks HTTP targets. The migration uses a phased rollout (dual-write, validate, remove) to ensure rollback safety. It covers the Cloud Tasks enqueue modules for both Python and Node.js, OIDC validation middleware for securing task handler endpoints, new `/tasks/*` HTTP handler endpoints in the Python service, a dead letter queue (DLQ) pattern, and the Node.js file modifications required to dispatch work through Cloud Tasks instead of direct HTTP calls to the Python backend.

### Dependencies

- **Section 01 (GCP Bootstrap):** Cloud Tasks queues must be provisioned (`media-jobs`, `video-jobs-short`, `video-jobs-long`, `workflow-tasks`, `polling-tasks`, `periodic-tasks`). Service accounts (`cloud-run-api@`, `cloud-scheduler@`) must exist with correct IAM roles.
- **Section 03 (Database):** The `cloud_task_events` table and `media_tasks.cloud_task_id` column must exist in the database.

### What This Section Blocks

- Section 05 (BullMQ Migration) -- depends on the Cloud Tasks enqueue pattern established here.
- Section 06 (Cloud Scheduler) -- depends on the OIDC validation middleware and `/tasks/*` endpoint pattern.
- Section 07 (Kie AI Integration) -- depends on the polling and media task endpoints.
- Section 08 (Media Pipeline) -- depends on `POST /tasks/process-media` endpoint.
- Section 15 (Admin Dashboard) -- depends on `cloud_task_events` data for job health panels.

---

## Migration Architecture

### Current Flow (Celery)

```
Node.js API ──HTTP POST──> Python /api/v1/media-jobs/execute ──> Celery broker (Redis) ──> Celery Worker
CeleryBeat ──> Redis ──> Celery Worker ──> periodic task execution
```

The existing codebase has Celery tasks registered across these files:
- `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_tasks.py` -- image/video/audio generation, cleanup, retry, recovery tasks
- `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_job_worker.py` -- FFmpeg-based media job execution
- `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/workflow_tasks.py` -- scheduled workflows, system events, queue messages
- `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py` -- Drive sync, channel renewal, edit session cleanup
- `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py` -- Celery app, queue routing, CeleryBeat schedule

### New Flow (Cloud Tasks)

```
Node.js API ──> Cloud Tasks API ──HTTP POST──> Python Cloud Run Service /tasks/* endpoint
Cloud Scheduler ──> Cloud Tasks queue ──HTTP POST──> Python Cloud Run Service /tasks/* endpoint
```

All task execution moves from Celery workers to HTTP handler endpoints on the Python Cloud Run service. Cloud Tasks manages retries, backoff, and rate limiting at the queue level.

---

## Phased Migration Strategy

### Phase A: Deploy Alongside (Feature Flag)

Deploy Cloud Tasks endpoints alongside existing Celery tasks. A feature flag `USE_CLOUD_TASKS` (stored in Upstash Redis, readable in both Node.js and Python) controls which dispatch path is used. Both systems run simultaneously.

- New jobs can be dispatched to Cloud Tasks when the flag is `true`.
- Celery workers remain running as fallback when the flag is `false`.
- The flag can be toggled per-environment without a redeploy.

### Phase B: Validate (1-2 Weeks)

Run Cloud Tasks in production with monitoring. Compare job completion rates, latencies, and error rates. If Cloud Tasks underperforms, flip the flag back to Celery.

### Phase C: Remove Celery

After Phase B validates, remove all Celery code (see "Removing Celery" at the end of this section). Tag the Celery branch in git for emergency rollback.

---

## Tests

All tests should be written before implementation. The following test stubs define the expected behavior.

### Cloud Tasks Enqueue -- Python (pytest)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_cloud_tasks_enqueue.py`

```python
"""Tests for the Cloud Tasks enqueue module."""
import pytest


@pytest.mark.unit
class TestEnqueueTask:
    """Tests for enqueue_task function."""

    async def test_creates_task_with_correct_queue_url_and_payload(self):
        """enqueue_task creates a Cloud Tasks task with the correct queue name,
        target URL, and JSON payload."""

    async def test_delay_seconds_sets_schedule_time(self):
        """enqueue_task with delay_seconds sets the scheduleTime on the task
        to current_time + delay_seconds."""

    async def test_task_id_sets_deterministic_name_for_dedup(self):
        """enqueue_task with task_id sets a deterministic task name that Cloud Tasks
        uses for deduplication within its 24h window."""

    async def test_raises_error_for_nonexistent_queue(self):
        """enqueue_task raises an appropriate error when the specified queue
        does not exist in the GCP project."""
```

### Cloud Tasks Enqueue -- Node.js (Vitest)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/cloudTasks.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";

describe("enqueueTask", () => {
  it("creates a task with correct HTTP target URL", async () => {
    /** enqueueTask should call the Cloud Tasks client with an httpRequest
     * target pointing to the Python Cloud Run service URL + handlerPath. */
  });

  it("passes payload as JSON body in the task", async () => {
    /** The httpRequest.body should be the base64-encoded JSON payload. */
  });

  it("applies delay via scheduleTime when delaySeconds is provided", async () => {
    /** When delaySeconds is set, scheduleTime should be current time + delay. */
  });
});
```

### OIDC Validation Middleware -- Python (pytest)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_oidc_middleware.py`

```python
"""Tests for the Cloud Tasks OIDC validation middleware."""
import pytest


@pytest.mark.unit
class TestOIDCValidation:
    """Tests for OIDC token validation on /tasks/* endpoints."""

    async def test_valid_oidc_token_from_allowed_sa_accepted(self):
        """Request with a valid OIDC token from an allowed service account
        (cloud-run-api@ or cloud-scheduler@) returns 200."""

    async def test_missing_authorization_header_returns_401(self):
        """Request without an Authorization header returns 401 JSON error."""

    async def test_expired_token_returns_401(self):
        """Request with an expired OIDC token returns 401."""

    async def test_wrong_audience_claim_returns_401(self):
        """Request where the aud claim does not match the Python Cloud Run
        service URL returns 401."""

    async def test_unauthorized_service_account_returns_401(self):
        """Request from a service account not in the allowed list returns 401."""

    async def test_oidc_skipped_in_development_mode(self):
        """When ENVIRONMENT=development, OIDC validation is skipped and
        requests are accepted with a shared internal token instead."""
```

### Task Handler Endpoints -- Python (pytest)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_task_handlers.py`

```python
"""Tests for Cloud Tasks handler endpoints under /tasks/*."""
import pytest


@pytest.mark.unit
class TestPollJobHandler:
    """Tests for POST /tasks/poll-job."""

    async def test_returns_200_for_already_completed_job(self):
        """Idempotency: if the job is already completed in the DB,
        the handler returns 200 without re-processing."""

    async def test_polls_kie_ai_and_enqueues_followup_on_success(self):
        """When Kie AI reports job complete, handler updates DB and
        enqueues a process-media task via Cloud Tasks."""

    async def test_reenqueues_with_backoff_when_still_processing(self):
        """When Kie AI reports job still processing, handler enqueues
        a new poll-job task with increased delay (exponential backoff)."""


@pytest.mark.unit
class TestProcessMediaHandler:
    """Tests for POST /tasks/process-media."""

    async def test_processes_job_and_returns_200(self):
        """Handler processes a valid job and returns 200."""

    async def test_returns_200_for_already_processed_job(self):
        """Idempotency: if the job already has R2 keys in DB,
        returns 200 without re-processing."""


@pytest.mark.unit
class TestCleanupExpiredHandler:
    """Tests for POST /tasks/cleanup-expired."""

    async def test_deletes_old_tasks_and_returns_count(self):
        """Handler deletes tasks older than 12 days and returns the count."""


@pytest.mark.unit
class TestAllTaskEndpoints:
    """Cross-cutting tests for all /tasks/* endpoints."""

    async def test_reject_requests_without_oidc_token(self):
        """All /tasks/* endpoints return 401 when called without an
        OIDC token (unless ENVIRONMENT=development)."""
```

### Dead Letter Queue -- Python (pytest)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_dead_letter_queue.py`

```python
"""Tests for the Dead Letter Queue pattern."""
import pytest


@pytest.mark.unit
class TestDeadLetterQueue:
    """Tests for DLQ behavior on final retry."""

    async def test_final_retry_writes_dead_letter_to_db(self):
        """On the final retry attempt (X-CloudTasks-TaskRetryCount == max_attempts - 1),
        the handler writes to cloud_task_events with status='dead_letter'."""

    async def test_non_final_retry_does_not_write_dead_letter(self):
        """On non-final retry attempts, no dead letter record is created."""

    async def test_dead_letter_processing_sends_admin_email(self):
        """The daily dead letter processing job sends an email alert
        to all admin users listing unresolved dead letters."""
```

### Feature Flag Migration -- Node.js (Vitest)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/cloudTasksFlag.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";

describe("Cloud Tasks feature flag", () => {
  it("dispatches via Cloud Tasks when USE_CLOUD_TASKS=true", async () => {
    /** When the feature flag is true, job dispatch should call
     * enqueueTask instead of the direct HTTP POST to Python. */
  });

  it("dispatches via existing HTTP POST when USE_CLOUD_TASKS=false", async () => {
    /** When the feature flag is false, job dispatch should use
     * the existing dispatchToCelery function (HTTP POST to Python). */
  });
});
```

---

## Implementation Details

### 1. Python Cloud Tasks Enqueue Module

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/cloud_tasks.py`

This module wraps the `google-cloud-tasks` library and provides a single `enqueue_task` function used by all task dispatch points.

```python
"""Cloud Tasks enqueue module.

Provides a unified interface for dispatching tasks to Google Cloud Tasks queues.
"""

from google.cloud import tasks_v2
from google.protobuf import timestamp_pb2
import json
import os
from datetime import datetime, timedelta


# Queue configurations matching Section 01 GCP Bootstrap
QUEUE_CONFIGS = {
    "media-jobs": {"max_dispatches_per_second": 5, "max_concurrent_dispatches": 10, "max_attempts": 5},
    "video-jobs-short": {"max_dispatches_per_second": 2, "max_concurrent_dispatches": 10, "max_attempts": 3},
    "video-jobs-long": {"max_dispatches_per_second": 1, "max_concurrent_dispatches": 3, "max_attempts": 3},
    "workflow-tasks": {"max_dispatches_per_second": 10, "max_concurrent_dispatches": 20, "max_attempts": 5},
    "polling-tasks": {"max_dispatches_per_second": 2, "max_concurrent_dispatches": 5, "max_attempts": 10},
    "periodic-tasks": {"max_dispatches_per_second": 1, "max_concurrent_dispatches": 5, "max_attempts": 3},
}


async def enqueue_task(
    queue_name: str,
    handler_path: str,
    payload: dict,
    delay_seconds: int = 0,
    task_id: str | None = None,
) -> str:
    """Enqueue a task to Cloud Tasks.

    Args:
        queue_name: Which queue to use (e.g., 'media-jobs').
        handler_path: Endpoint path on the target service (e.g., '/tasks/process-media').
        payload: JSON body for the task.
        delay_seconds: Optional delay before first dispatch.
        task_id: Optional deterministic name for deduplication (24h window).

    Returns:
        The created task name (full resource path).

    Raises:
        ValueError: If queue_name is not a known queue.
        google.api_core.exceptions.GoogleAPIError: On Cloud Tasks API failure.
    """
    ...
```

Key implementation details:
- Read `GCP_PROJECT_ID`, `GCP_REGION`, and `CLOUD_RUN_PYTHON_URL` from environment variables.
- The HTTP target URL is `{CLOUD_RUN_PYTHON_URL}{handler_path}`.
- Set `oidc_token` on the HTTP request with the `cloud-run-api@` service account email and audience matching the Python service URL.
- If `delay_seconds > 0`, compute `schedule_time` as `now + timedelta(seconds=delay_seconds)`.
- If `task_id` is provided, set it as the task name for Cloud Tasks deduplication. Format: `projects/{project}/locations/{region}/queues/{queue}/tasks/{task_id}`.
- Add `google-cloud-tasks>=2.14.0` to `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt`.

### 2. Node.js Cloud Tasks Enqueue Module

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/cloudTasks.ts`

```typescript
/**
 * Cloud Tasks enqueue module for Node.js.
 *
 * Provides a typed interface for dispatching tasks to Google Cloud Tasks
 * queues from the Node.js API server.
 */

import { CloudTasksClient } from "@google-cloud/tasks";

interface EnqueueTaskOptions {
  /** Which Cloud Tasks queue to use (e.g., 'media-jobs') */
  queueName: string;
  /** Endpoint path on the Python service (e.g., '/tasks/process-media') */
  handlerPath: string;
  /** JSON body for the task */
  payload: Record<string, unknown>;
  /** Optional delay in seconds before first dispatch */
  delaySeconds?: number;
  /** Optional deterministic task ID for deduplication (24h window) */
  taskId?: string;
}

/**
 * Enqueue a task to Google Cloud Tasks.
 *
 * The task is dispatched as an HTTP POST to the Python Cloud Run service
 * with OIDC authentication.
 *
 * @returns The full resource name of the created task.
 */
export async function enqueueTask(options: EnqueueTaskOptions): Promise<string> {
  // Implementation reads GCP_PROJECT_ID, GCP_REGION, CLOUD_RUN_PYTHON_URL
  // from process.env and constructs the Cloud Tasks API call.
  ...
}
```

Key implementation details:
- Add `@google-cloud/tasks` to `/home/dev/projects/SmartSpecPro/apps/web/package.json` devDependencies.
- Use the `CloudTasksClient` from the `@google-cloud/tasks` package.
- The `httpRequest.url` is `${CLOUD_RUN_PYTHON_URL}${handlerPath}`.
- Set `httpRequest.oidcToken` with the `cloud-run-api@` service account and audience.
- Encode `payload` as `Buffer.from(JSON.stringify(payload)).toString("base64")` for the `httpRequest.body`.
- If `delaySeconds` is set, compute `scheduleTime` as `{ seconds: Math.floor(Date.now() / 1000) + delaySeconds }`.

### 3. OIDC Validation Middleware (Python)

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/middleware/oidc_auth.py`

This FastAPI middleware protects all `/tasks/*` endpoints from unauthorized callers.

```python
"""OIDC token validation middleware for Cloud Tasks endpoints.

Validates that incoming requests to /tasks/* carry a valid Google OIDC token
from an authorized service account.
"""

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
import os

# Allowed service account emails
ALLOWED_SERVICE_ACCOUNTS: list[str] = []  # Populated from env vars at startup

class OIDCAuthMiddleware(BaseHTTPMiddleware):
    """Middleware that validates OIDC tokens on /tasks/* routes.

    In development mode (ENVIRONMENT=development), OIDC validation is skipped
    and a shared internal token is accepted instead.
    """

    async def dispatch(self, request: Request, call_next):
        """Validate OIDC token for /tasks/* paths."""
        ...
```

Validation steps (all within the middleware):
1. Check if the request path starts with `/tasks/`. If not, pass through.
2. If `ENVIRONMENT == "development"`, validate using a shared `TASKS_INTERNAL_TOKEN` header instead of OIDC. Accept if the token matches.
3. Extract `Authorization: Bearer <token>` header. Return HTTP 401 (not 5xx, to avoid Cloud Tasks retry) if missing.
4. Use `google.oauth2.id_token.verify_oauth2_token()` from `google-auth` to validate the JWT.
5. Check `aud` (audience) matches `CLOUD_RUN_PYTHON_URL` environment variable.
6. Check `email` matches one of the allowed service accounts: `cloud-run-api@{GCP_PROJECT_ID}.iam.gserviceaccount.com` or `cloud-scheduler@{GCP_PROJECT_ID}.iam.gserviceaccount.com`.
7. Return 401 with JSON body `{"error": "Unauthorized", "detail": "..."}` on any validation failure.
8. Add `google-auth>=2.23.0` to requirements if not already present.

Register the middleware in `/home/dev/projects/SmartSpecPro/python-backend/app/main.py` before the FastAPI app routes.

### 4. Task Handler Endpoints (Python)

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/task_handlers.py`

Create a FastAPI router with all Cloud Tasks handler endpoints. Register it under the `/tasks` prefix in `/home/dev/projects/SmartSpecPro/python-backend/app/main.py`.

Each endpoint must:
1. Read `X-CloudTasks-TaskRetryCount` header to implement DLQ logic on the final retry.
2. Be fully idempotent -- check DB state before processing.
3. Return 2xx on success (Cloud Tasks considers any 2xx a success).
4. Return 5xx for transient errors (triggers Cloud Tasks retry).
5. Return 4xx (specifically 200 with error status update) for permanent errors (prevents retry).

**Endpoints to implement:**

| Endpoint | Replaces Celery Task | Queue |
|----------|---------------------|-------|
| `POST /tasks/poll-job` | `poll_kie_job` (implicit in media_tasks) | `polling-tasks` |
| `POST /tasks/process-media` | `generate_image_task`, `generate_video_task`, `generate_audio_task` | `media-jobs` |
| `POST /tasks/process-video` | `execute_media_job` (FFmpeg) | `video-jobs-short` / `video-jobs-long` |
| `POST /tasks/cleanup-expired` | `cleanup_expired_tasks` | `periodic-tasks` |
| `POST /tasks/retry-failed` | `retry_failed_tasks` | `periodic-tasks` |
| `POST /tasks/retry-callbacks` | `retry_media_callback_events` | `periodic-tasks` |
| `POST /tasks/recover-stuck` | `recover_stuck_tasks` | `periodic-tasks` |
| `POST /tasks/check-workflows` | `check_scheduled_workflows` | `periodic-tasks` |
| `POST /tasks/cleanup-sessions` | `cleanup_expired_edit_sessions` | `periodic-tasks` |
| `POST /tasks/renew-drive-channels` | `renew_drive_watch_channels` | `periodic-tasks` |
| `POST /tasks/poll-drive-changes` | `poll_drive_changes` | `periodic-tasks` |

```python
"""Cloud Tasks HTTP handler endpoints.

These endpoints replace Celery tasks. Each receives an HTTP POST from
Cloud Tasks with a JSON payload, performs the work, and returns a status.
"""

from fastapi import APIRouter, Request, Response
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/tasks", tags=["cloud-tasks"])


@router.post("/poll-job")
async def poll_job(request: Request):
    """Poll Kie AI for a specific job status.

    Payload: {"job_id": str, "kie_job_id": str, "attempt": int}

    Idempotent: if job is already completed, returns 200 immediately.
    On still-processing: re-enqueues with exponential backoff.
    On final retry: writes dead letter record.
    """
    ...


@router.post("/process-media")
async def process_media(request: Request):
    """Trigger media-job processing (download, thumbnail, R2 upload, DB update).

    Payload: {"job_id": str, "kie_job_id": str}

    Idempotent: if job already has R2 keys, returns 200.
    """
    ...


@router.post("/cleanup-expired")
async def cleanup_expired(request: Request):
    """Delete tasks older than 12 days.

    Payload: {} (no payload needed)

    Returns: {"deleted_count": int}
    """
    ...
```

Each handler function should:
- Parse the JSON body from `request.body()`.
- Read `X-CloudTasks-TaskRetryCount` from headers.
- Call into the existing service layer (e.g., `MediaTaskService`) for the actual business logic. The service layer code does not change -- only the dispatch mechanism changes.
- Handle the DLQ pattern on final retry (see section below).

### 5. Dead Letter Queue Pattern

Since Cloud Tasks has no built-in DLQ, implement it at the application level.

Each task handler checks the `X-CloudTasks-TaskRetryCount` header against the queue's `max_attempts` configuration:

```python
async def _check_dead_letter(request: Request, queue_name: str, payload: dict) -> bool:
    """Check if this is the final retry attempt and write a dead letter if so.

    Returns True if a dead letter was written (caller should return 200 to
    stop further retries).
    """
    retry_count = int(request.headers.get("X-CloudTasks-TaskRetryCount", "0"))
    max_attempts = QUEUE_CONFIGS.get(queue_name, {}).get("max_attempts", 5)

    if retry_count >= max_attempts - 1:
        # Final retry -- write to cloud_task_events as dead letter
        # (DB write via Drizzle-owned table, accessed from Python with extend_existing)
        ...
        return True
    return False
```

The `cloud_task_events` table (defined in Section 03) stores dead letters with columns: `task_id`, `queue_name`, `job_id`, `status` (set to `'dead_letter'`), `attempt_count`, `created_at`, `error_message`, and the original `payload` as JSON.

A Cloud Scheduler job (defined in Section 06) runs daily to check for dead letters and send email alerts to admins.

### 6. Node.js Files Requiring Modification

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts`

Three changes are needed in this file:

**Change 1: Replace `dispatchToCelery` with Cloud Tasks enqueue (around lines 209-235)**

The existing `dispatchToCelery` function makes a direct HTTP POST to `/api/v1/media-jobs/execute` on the Python backend. Replace it with a conditional dispatch:

```typescript
async function dispatchJob(specJson: string, userId: string, jobId: string) {
  const useCloudTasks = await getFeatureFlag("USE_CLOUD_TASKS");
  if (useCloudTasks) {
    await enqueueTask({
      queueName: "media-jobs",
      handlerPath: "/tasks/process-media",
      payload: { spec_json: specJson, user_id: userId, job_id: jobId },
    });
  } else {
    await dispatchToCelery(specJson, userId, jobId);
  }
}
```

The `getFeatureFlag` function reads from Upstash Redis (or environment variable fallback).

**Change 2: Replace `setInterval` cleanup (lines 1048-1093)**

Remove the `setInterval`-based Redis cleanup loop entirely. This pattern is incompatible with Cloud Run's scaling model (each instance would run its own interval). Instead, a Cloud Scheduler job (`cleanup-redis-stale`, every 5 minutes) dispatches to `POST /tasks/cleanup-redis-stale` on the Python service. That endpoint replicates the same scan-and-clean logic.

**Change 3: Add polling task enqueue after job submission**

When a media generation job is submitted and gets a `kie_job_id` back, enqueue a Cloud Tasks polling task with a 2-minute delay as a fallback to the webhook:

```typescript
// After successful Kie AI submission
if (useCloudTasks) {
  await enqueueTask({
    queueName: "polling-tasks",
    handlerPath: "/tasks/poll-job",
    payload: { job_id: jobId, kie_job_id: kieJobId, attempt: 0 },
    delaySeconds: 120, // 2 minutes
  });
}
```

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/scheduler.ts`

This file uses BullMQ for scheduled message delivery. It is addressed in Section 05 (BullMQ Migration), not here. However, a `getFeatureFlag` utility is needed by this section and should be created.

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/featureFlags.ts`

```typescript
/**
 * Feature flag reader for Cloud Tasks migration.
 *
 * Reads flags from Upstash Redis with an env var fallback.
 */

export async function getFeatureFlag(flagName: string): Promise<boolean> {
  /** Read flag from Redis key `feature-flag:{flagName}`.
   * Falls back to process.env[flagName] if Redis is unavailable.
   * Returns false by default. */
  ...
}
```

### 7. Removing Celery (Phase C)

After the Cloud Tasks integration is validated (Phase B), remove all Celery infrastructure:

1. **Delete** `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py` -- the Celery app, queue routing, and CeleryBeat schedule.
2. **Remove** all `@celery_app.task` decorators from:
   - `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_tasks.py`
   - `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_job_worker.py`
   - `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/workflow_tasks.py`
   - `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py`
3. **Remove** `celery`, `kombu`, `flower` from `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt`. Keep `redis` for Upstash rate limiting.
4. **Remove** Celery worker services from `/home/dev/projects/SmartSpecPro/docker/docker-compose.media.yml`.
5. **Remove** CeleryBeat configuration (already in `celery_app.py`).
6. **Update** `/home/dev/projects/SmartSpecPro/run-services.sh` to remove Celery worker startup.
7. **Convert** the task functions to regular async functions. The business logic inside the Celery task decorators remains the same -- only the dispatch and decorator mechanism changes.

---

## File Summary

### Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/cloud_tasks.py` | Cloud Tasks enqueue module (Python) |
| `/home/dev/projects/SmartSpecPro/python-backend/app/middleware/oidc_auth.py` | OIDC validation middleware |
| `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/task_handlers.py` | All `/tasks/*` HTTP handler endpoints |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/cloudTasks.ts` | Cloud Tasks enqueue module (Node.js) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/featureFlags.ts` | Feature flag reader |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_cloud_tasks_enqueue.py` | Tests for Python enqueue module |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_oidc_middleware.py` | Tests for OIDC middleware |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_task_handlers.py` | Tests for task handler endpoints |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_dead_letter_queue.py` | Tests for DLQ pattern |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/cloudTasks.test.ts` | Tests for Node.js enqueue module |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/cloudTasksFlag.test.ts` | Tests for feature flag dispatch |

### Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` | Replace `dispatchToCelery` with conditional Cloud Tasks dispatch; remove `setInterval` cleanup; add polling task enqueue |
| `/home/dev/projects/SmartSpecPro/python-backend/app/main.py` | Register OIDC middleware and `/tasks` router |
| `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt` | Add `google-cloud-tasks>=2.14.0`, `google-auth>=2.23.0` |
| `/home/dev/projects/SmartSpecPro/apps/web/package.json` | Add `@google-cloud/tasks` dependency |

### Files to Delete (Phase C Only)

| File | Reason |
|------|--------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py` | Celery app and CeleryBeat schedule replaced by Cloud Tasks + Cloud Scheduler |

---

## Implementation Checklist

1. Write all test files listed above.
2. Create the Python `cloud_tasks.py` enqueue module.
3. Create the OIDC middleware (`oidc_auth.py`) and register it in `main.py`.
4. Create the task handler router (`task_handlers.py`) and register it in `main.py`.
5. Implement the DLQ helper function used by all task handlers.
6. Create the Node.js `cloudTasks.ts` enqueue module.
7. Create the `featureFlags.ts` utility.
8. Modify `mediaJobs.ts` to use conditional dispatch (feature flag).
9. Remove the `setInterval` cleanup from `mediaJobs.ts`.
10. Add polling task enqueue after Kie AI job submission in `mediaJobs.ts`.
11. Run all tests: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/test_cloud_tasks*.py tests/test_oidc*.py tests/test_task_handlers.py tests/test_dead_letter*.py` and `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/services/__tests__/cloudTasks`.
12. Validate with `pnpm check` (TypeScript) and `mypy app/` (Python).