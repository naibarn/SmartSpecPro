Now I have all the context I need to write the section. Let me compile the section content.

# Section 6: Cloud Scheduler (Periodic Tasks)

## Overview

This section replaces all periodic task scheduling -- CeleryBeat schedules in the Python backend and `setInterval` patterns in the Node.js backend -- with Google Cloud Scheduler jobs. Each Cloud Scheduler job enqueues a task into the `periodic-tasks` Cloud Tasks queue, which then dispatches an HTTP POST to the Python Cloud Run Service. This approach is compatible with Cloud Run's scaling model (instances can scale to zero, there is no persistent process to run timers or CeleryBeat).

### What is Being Replaced

**CeleryBeat schedules** (currently in `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py`, lines 75-112):
- `cleanup-expired-tasks` -- Daily at 3:00 AM, deletes tasks older than 12 days
- `retry-failed-tasks` -- Every 15 minutes
- `retry-media-callback-events` -- Every minute
- `retry-library-index-jobs` -- Every minute
- `recover-stuck-tasks` -- Every 2 minutes
- `check-scheduled-workflows` -- Every minute
- `cleanup-expired-edit-sessions` -- Every 30 minutes
- `renew-drive-watch-channels` -- Every 6 hours
- `poll-drive-changes` -- Every 15 minutes

**Node.js `setInterval` patterns** (incompatible with Cloud Run's scaling model):
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` lines 1049-1093: Redis cleanup of stale active-job set entries, every 5 minutes
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/scheduler.ts`: BullMQ scheduled message delivery worker (migrated via Section 5/BullMQ migration; this section provides the fallback scheduler)

### Dependencies

- **Section 1 (GCP Bootstrap):** GCP project, `cloud-scheduler@` service account, and the `periodic-tasks` Cloud Tasks queue must exist.
- **Section 4 (Cloud Tasks Migration):** The OIDC validation middleware on `/tasks/*` endpoints must be in place. The `enqueue_task` Python helper and the Cloud Tasks queue infrastructure must be operational.
- **Section 5 (BullMQ Migration):** The `deliver-scheduled-messages` fallback job defined here supports Section 5's migration of BullMQ scheduled message delivery.

---

## Tests First

All tests validate that Cloud Scheduler jobs are correctly configured and that handler endpoints exist and are idempotent.

### Scheduler Configuration Tests (Validation Script)

Create a validation script at `/home/dev/projects/SmartSpecPro/scripts/validate-cloud-scheduler.sh`:

```bash
#!/usr/bin/env bash
# Validates that all required Cloud Scheduler jobs exist with correct configuration.
# Usage: ./scripts/validate-cloud-scheduler.sh <GCP_PROJECT_ID> <GCP_REGION>
# Exit 0 if all jobs exist and are correctly configured, non-zero otherwise.
#
# Checks for each job:
#   - Job exists in Cloud Scheduler
#   - Cron expression matches expected value
#   - Target is an HTTP POST to the periodic-tasks queue
#   - OIDC authentication is configured with the cloud-scheduler@ service account
```

This script should verify all 12 scheduler jobs listed in the Scheduler Jobs table below. For each job it should run `gcloud scheduler jobs describe <job-name>` and validate the cron schedule, HTTP target method, target URI, and OIDC configuration.

### Handler Registration Tests (Python -- pytest)

File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_periodic_handlers.py`

```python
"""Tests for Cloud Scheduler periodic task handler endpoints.

Verifies that all handler paths referenced by Cloud Scheduler jobs
have corresponding registered endpoints in the FastAPI app, and that
each handler is idempotent (safe to invoke multiple times).
"""
import pytest
from httpx import AsyncClient

# The full list of handler paths that Cloud Scheduler targets
PERIODIC_HANDLER_PATHS = [
    "/tasks/cleanup-expired",
    "/tasks/retry-failed",
    "/tasks/retry-callbacks",
    "/tasks/recover-stuck",
    "/tasks/check-workflows",
    "/tasks/cleanup-sessions",
    "/tasks/renew-drive-channels",
    "/tasks/poll-drive-changes",
    "/tasks/process-dead-letters",
    "/tasks/cleanup-redis-stale",
    "/tasks/deliver-scheduled-fallback",
]


@pytest.mark.unit
class TestPeriodicHandlerRegistration:
    """All handler paths referenced in Cloud Scheduler must have endpoints."""

    async def test_all_handler_paths_have_endpoints(self, client: AsyncClient):
        """Each handler path in PERIODIC_HANDLER_PATHS must return
        a status code other than 404/405 when POSTed to (with dev auth bypass).
        A 401 is acceptable (means the route exists but requires auth).
        A 404 or 405 means the route is not registered."""
        ...

    async def test_handler_rejects_unauthenticated_request(self, client: AsyncClient):
        """POST to any /tasks/* endpoint without OIDC token returns 401,
        not 5xx (which would trigger Cloud Tasks retries)."""
        ...


@pytest.mark.unit
class TestPeriodicHandlerIdempotency:
    """Each periodic handler must be safe to run twice in succession."""

    async def test_cleanup_expired_idempotent(self, client: AsyncClient):
        """Running cleanup-expired twice produces no errors and
        returns a count (possibly 0 on second run)."""
        ...

    async def test_retry_failed_idempotent(self, client: AsyncClient):
        """Running retry-failed twice does not re-retry already retried tasks."""
        ...

    async def test_deliver_scheduled_fallback_idempotent(self, client: AsyncClient):
        """Running the scheduled message fallback twice does not
        deliver messages that were already delivered."""
        ...
```

### Node.js setInterval Removal Test (Vitest)

File: `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/no-setinterval.test.ts`

```typescript
/**
 * Validates that setInterval-based periodic patterns have been removed
 * from files that are incompatible with Cloud Run's scaling model.
 *
 * Specifically checks that mediaJobs.ts no longer contains the
 * stale Redis cleanup setInterval (lines 1049-1093 in the original).
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Cloud Run compatibility: no setInterval for periodic tasks", () => {
  it("mediaJobs.ts does not contain setInterval for Redis cleanup", () => {
    /**
     * Read the file content and verify the stale-cleanup setInterval
     * has been replaced by a Cloud Scheduler endpoint.
     */
  });
});
```

### Redis Stale Cleanup Handler Test (Python -- pytest)

File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_cleanup_redis_stale.py`

```python
"""Tests for the cleanup-redis-stale periodic handler.

This handler replaces the Node.js setInterval in mediaJobs.ts
that cleaned stale entries from Redis active-job sets.
"""
import pytest


@pytest.mark.unit
class TestCleanupRedisStale:
    """Tests for POST /tasks/cleanup-redis-stale handler."""

    async def test_removes_stale_queued_jobs(self):
        """Jobs in 'queued' status for >10 minutes are marked as errors
        and removed from the active set."""
        ...

    async def test_removes_stale_processing_jobs(self):
        """Jobs in 'processing' status for >60 minutes are marked as errors
        and removed from the active set."""
        ...

    async def test_removes_entries_with_expired_redis_keys(self):
        """Active set entries whose Redis status keys have expired
        are removed from the set."""
        ...

    async def test_ignores_healthy_jobs(self):
        """Jobs that are actively queued or processing within
        acceptable timeframes are not touched."""
        ...

    async def test_returns_200_with_cleanup_count(self):
        """Handler returns HTTP 200 with a JSON body containing
        the number of stale entries cleaned."""
        ...
```

---

## Implementation Details

### Cloud Scheduler Jobs

Create the following Cloud Scheduler jobs using `gcloud scheduler jobs create http`. Each job enqueues into the `periodic-tasks` Cloud Tasks queue by POSTing to the Python Cloud Run Service's handler endpoint.

| Scheduler Job Name | Cron Expression | Handler Path | Description |
|---|---|---|---|
| `cleanup-expired-tasks` | `0 3 * * *` | `/tasks/cleanup-expired` | Daily at 3 AM UTC. Deletes media tasks older than 12 days. |
| `retry-failed-tasks` | `*/15 * * * *` | `/tasks/retry-failed` | Every 15 min. Retries tasks in failed state eligible for retry. |
| `retry-media-callbacks` | `* * * * *` | `/tasks/retry-callbacks` | Every minute. Retries failed webhook/callback deliveries. |
| `retry-library-index` | `* * * * *` | `/tasks/retry-callbacks` | Every minute. Retries failed library indexing jobs (shares handler). |
| `recover-stuck-tasks` | `*/2 * * * *` | `/tasks/recover-stuck` | Every 2 min. Recovers tasks stuck in processing state. |
| `check-scheduled-workflows` | `* * * * *` | `/tasks/check-workflows` | Every minute. Checks for workflow schedules that are due. |
| `cleanup-edit-sessions` | `*/30 * * * *` | `/tasks/cleanup-sessions` | Every 30 min. Expires stale Google Drive edit sessions. |
| `renew-drive-channels` | `0 */6 * * *` | `/tasks/renew-drive-channels` | Every 6 hours. Renews expiring Google Drive webhook channels. |
| `poll-drive-changes` | `*/15 * * * *` | `/tasks/poll-drive-changes` | Every 15 min. Fallback polling when Drive webhook is down. |
| `process-dead-letters` | `0 8 * * *` | `/tasks/process-dead-letters` | Daily at 8 AM UTC. Reviews dead-letter tasks and sends admin alerts. |
| `cleanup-redis-stale` | `*/5 * * * *` | `/tasks/cleanup-redis-stale` | Every 5 min. Replaces `setInterval` in `mediaJobs.ts`. Cleans stale Redis active-job entries. |
| `deliver-scheduled-messages` | `* * * * *` | `/tasks/deliver-scheduled-fallback` | Every minute. Belt-and-suspenders fallback for BullMQ scheduled message migration (Section 5). |

### gcloud Commands for Scheduler Job Creation

Create a provisioning script at `/home/dev/projects/SmartSpecPro/scripts/create-cloud-scheduler-jobs.sh`. The script takes the GCP project ID, region, and Python Cloud Run service URL as arguments.

Each job is created with this pattern:

```bash
gcloud scheduler jobs create http <JOB_NAME> \
  --project="${GCP_PROJECT}" \
  --location="${GCP_REGION}" \
  --schedule="<CRON_EXPRESSION>" \
  --uri="${PYTHON_SERVICE_URL}<HANDLER_PATH>" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{}' \
  --oidc-service-account-email="cloud-scheduler@${GCP_PROJECT}.iam.gserviceaccount.com" \
  --oidc-token-audience="${PYTHON_SERVICE_URL}" \
  --time-zone="UTC" \
  --attempt-deadline="600s" \
  --description="<DESCRIPTION>"
```

Key configuration details:
- **OIDC authentication:** Each job uses the `cloud-scheduler@` service account to generate an OIDC token. The Python Cloud Run service validates this token (via the OIDC validation middleware from Section 4).
- **`--oidc-token-audience`:** Set to the Python Cloud Run service URL (e.g., `https://python-orchestrator-xxxxx.run.app`). This must match the audience the OIDC middleware checks.
- **`--attempt-deadline`:** Set to 600 seconds (10 minutes). This is the maximum time Cloud Scheduler waits for the HTTP response. Most periodic handlers should complete well within this.
- **`--time-zone`:** UTC for all jobs for consistency.
- **`--message-body`:** Empty JSON `{}` for most jobs. Some handlers may accept optional parameters in the body for future extensibility.

### Python Handler Endpoints

Add handler endpoints to the Python Cloud Run Service. These are registered in a new router module.

File: `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/periodic_tasks.py`

```python
"""
Cloud Scheduler periodic task handler endpoints.

These endpoints replace CeleryBeat-scheduled tasks. Each is invoked
by Cloud Scheduler via the periodic-tasks Cloud Tasks queue.

All endpoints:
  - Require OIDC authentication (enforced by the tasks auth middleware)
  - Are idempotent (safe to re-run if Cloud Tasks retries)
  - Return 2xx on success (including "nothing to do")
  - Return 4xx for permanent errors (no retry)
  - Return 5xx only for transient errors (triggers Cloud Tasks retry)
"""
from fastapi import APIRouter, Request
from app.core.config import settings

router = APIRouter(prefix="/tasks", tags=["periodic-tasks"])


@router.post("/cleanup-expired")
async def cleanup_expired_tasks(request: Request):
    """Delete media tasks older than 12 days.
    Replaces CeleryBeat 'cleanup-expired-tasks' schedule."""
    ...


@router.post("/retry-failed")
async def retry_failed_tasks(request: Request):
    """Retry media tasks in failed state that are eligible for retry.
    Replaces CeleryBeat 'retry-failed-tasks' schedule."""
    ...


@router.post("/retry-callbacks")
async def retry_callbacks(request: Request):
    """Retry failed webhook callback deliveries and library index jobs.
    Replaces both 'retry-media-callback-events' and 'retry-library-index-jobs'
    CeleryBeat schedules."""
    ...


@router.post("/recover-stuck")
async def recover_stuck_tasks(request: Request):
    """Recover tasks stuck in 'processing' state beyond timeout.
    Replaces CeleryBeat 'recover-stuck-tasks' schedule."""
    ...


@router.post("/check-workflows")
async def check_scheduled_workflows(request: Request):
    """Check for workflow schedules that are due for execution.
    Replaces CeleryBeat 'check-scheduled-workflows' schedule."""
    ...


@router.post("/cleanup-sessions")
async def cleanup_edit_sessions(request: Request):
    """Expire stale Google Drive edit sessions.
    Replaces CeleryBeat 'cleanup-expired-edit-sessions' schedule."""
    ...


@router.post("/renew-drive-channels")
async def renew_drive_channels(request: Request):
    """Renew expiring Google Drive webhook watch channels.
    Replaces CeleryBeat 'renew-drive-watch-channels' schedule."""
    ...


@router.post("/poll-drive-changes")
async def poll_drive_changes(request: Request):
    """Fallback polling for Google Drive file changes.
    Replaces CeleryBeat 'poll-drive-changes' schedule."""
    ...


@router.post("/process-dead-letters")
async def process_dead_letters(request: Request):
    """Review dead-letter entries in cloud_task_events table.
    Send admin email alerts for unresolved dead letters.
    New endpoint (no CeleryBeat equivalent)."""
    ...


@router.post("/cleanup-redis-stale")
async def cleanup_redis_stale(request: Request):
    """Clean stale entries from Redis active-job sets.
    Replaces the setInterval in apps/web/server/routers/mediaJobs.ts
    (lines 1049-1093). This logic was moved to the Python service
    because Cloud Run instances may scale to zero, making Node.js
    setInterval unreliable."""
    ...


@router.post("/deliver-scheduled-fallback")
async def deliver_scheduled_fallback(request: Request):
    """Belt-and-suspenders fallback for scheduled message delivery.
    Catches any scheduled messages that were not delivered by
    Cloud Tasks delayed dispatch (Section 5 BullMQ migration).
    Queries scheduledMessages table for messages past their
    scheduledAt time that have not been marked delivered."""
    ...
```

Each handler body should call the existing async business logic from the service layer. The Celery task functions (e.g., `cleanup_expired_tasks` in `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_tasks.py`) contain the core logic wrapped in `_run_async()`. Refactor these into standalone async functions in the service layer, then call them from both the Celery task (during Phase A dual-run) and the new HTTP handler.

### Redis Stale Cleanup Handler

The `cleanup-redis-stale` handler must replicate the logic currently in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` lines 1049-1093. That logic:

1. Scans Redis for all keys matching `media-jobs:user:*:active`.
2. For each key, gets the set members (job IDs).
3. For each job ID, checks the Redis status key.
4. If the status key has expired (no data), removes the job from the active set.
5. If the job is in `done`, `error`, or `canceled` state, removes it from the active set.
6. If the job is `queued` for more than 10 minutes, marks it as `error` and removes it.
7. If the job is `processing` for more than 60 minutes, marks it as `error` and removes it.

The Python handler connects to Memorystore Redis (the same Redis instance used for pub/sub and concurrency tracking, per Section 10) and performs the same scan/cleanup logic. The handler should return a JSON response with the count of cleaned entries.

### Removing setInterval from Node.js

After the `cleanup-redis-stale` Cloud Scheduler job is operational:

1. **Remove** the `setInterval` block at lines 1049-1093 in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts`.
2. Add a comment referencing the Cloud Scheduler replacement: `// Stale job cleanup moved to Cloud Scheduler: cleanup-redis-stale (every 5 min)`.
3. Do NOT remove the helper functions (`getJobKey`, `setJobKey`, `removeActiveJob`, etc.) -- they are still used by the rest of the media jobs router.

### Router Registration

Register the new periodic tasks router in the FastAPI app.

File: `/home/dev/projects/SmartSpecPro/python-backend/app/main.py`

Add the router import and include it:

```python
from app.api.v1.periodic_tasks import router as periodic_tasks_router

# Include with the tasks auth middleware (from Section 4)
app.include_router(periodic_tasks_router)
```

The OIDC validation middleware (from Section 4) must be applied to all `/tasks/*` routes. This can be done via a FastAPI dependency that is applied at the router level or via middleware that matches the `/tasks/` prefix.

### Monitoring

Cloud Scheduler provides built-in execution history (last run time, status, HTTP response code). Additionally:

1. **Cloud Monitoring alert:** Create an alert policy that fires when any Cloud Scheduler job has status `FAILED` for more than 2 consecutive executions. This catches broken handlers or misconfigured OIDC tokens.

2. **gcloud command to create the alert:**
   ```bash
   gcloud alpha monitoring policies create \
     --notification-channels="${NOTIFICATION_CHANNEL_ID}" \
     --display-name="Cloud Scheduler Job Failures" \
     --condition-display-name="Scheduler job failed" \
     --condition-filter='resource.type="cloud_scheduler_job" AND metric.type="logging.googleapis.com/user/scheduler_job_failed"' \
     --condition-threshold-value=2 \
     --condition-threshold-duration="600s"
   ```

   Alternatively, use a log-based metric on Cloud Scheduler logs filtered by `severity >= ERROR`.

3. **Dashboard widget:** Add a Cloud Scheduler execution timeline to the existing Jobs Dashboard (Section 16) showing success/failure counts per job over the last 24 hours.

### Local Development

In local development (`ENVIRONMENT=development`), Cloud Scheduler is not available. The existing CeleryBeat schedules continue to function during the transition (Phase A dual-run from Section 4). After Celery is fully removed (Phase C), use one of these approaches for local periodic tasks:

1. **Manual invocation:** Call the handler endpoints directly via `curl` or a test script.
2. **Local cron (optional):** A simple shell script that curls the local Python service endpoints on a schedule, or a `docker-compose` service running `supercronic` with equivalent cron entries.
3. **Startup script:** Add a `scripts/local-scheduler.sh` that runs in the background and periodically calls the handler endpoints on `http://localhost:8000`.

The OIDC validation middleware skips token verification when `ENVIRONMENT=development`, so local `curl` calls work without authentication tokens.

---

## File Summary

### Files to Create

| File Path | Purpose |
|---|---|
| `/home/dev/projects/SmartSpecPro/scripts/create-cloud-scheduler-jobs.sh` | Provisioning script for all 12 Cloud Scheduler jobs |
| `/home/dev/projects/SmartSpecPro/scripts/validate-cloud-scheduler.sh` | Validation script to verify scheduler job configuration |
| `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/periodic_tasks.py` | FastAPI router with all periodic task handler endpoints |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_periodic_handlers.py` | Tests for handler registration and idempotency |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_cleanup_redis_stale.py` | Tests for the Redis stale cleanup handler |
| `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/no-setinterval.test.ts` | Vitest test verifying setInterval removal |

### Files to Modify

| File Path | Change |
|---|---|
| `/home/dev/projects/SmartSpecPro/python-backend/app/main.py` | Include the `periodic_tasks_router` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` | Remove the setInterval block at lines 1049-1093 |
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_tasks.py` | Refactor Celery task bodies into reusable async service functions |
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/google_drive_tasks.py` | Refactor Celery task bodies into reusable async service functions |
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/workflow_tasks.py` | Refactor Celery task bodies into reusable async service functions |

### Files NOT to Modify (Yet)

| File Path | Reason |
|---|---|
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py` | CeleryBeat `beat_schedule` remains during Phase A dual-run. Removed in Phase C (Section 4). |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/scheduler.ts` | BullMQ scheduler code. Removed in Section 5 (BullMQ Migration). |

---

## Implementation Notes (Actual)

### Deviations from Plan

1. **No separate `periodic_tasks.py` router** — Periodic handlers were added directly to the existing `task_handlers.py` (created in Section 4) since they share the same `/tasks/` prefix and OIDC auth. This avoids a redundant router registration.

2. **`cleanup_expired_edit_sessions` not refactored to async** — The sync Celery function is wrapped with `asyncio.to_thread()` instead, since the full Google Drive tasks refactor was out of scope.

3. **`app/main.py` not modified** — Section 4 already registered the `task_handlers.router`, so no additional router inclusion was needed.

### Code Review Fixes Applied

- Fixed SQL column names in `process_dead_letters` handler (camelCase to match Drizzle schema)
- Fixed SQL column names in `deliver_scheduled_fallback` handler (used actual schema columns)
- Wrapped sync `cleanup_expired_edit_sessions()` with `asyncio.to_thread()` to prevent event loop blocking
- Fixed Redis client resource leak (added `try/finally` with `await redis_client.close()`)
- Removed `str(e)` from all error response bodies (information disclosure prevention)
- Fixed `cleanup_redis_stale` to return 500 on transient errors (correct Cloud Tasks retry semantics)
- Fixed `settings.CELERY_BROKER_URL` → `settings.REDIS_URL` (correct config attribute)
- Added `/tasks/` to CSRF middleware `EXEMPT_PREFIXES` (Cloud Tasks uses OIDC, not cookies)
- Added `X-Internal-Token` header support in test fixture for OIDC middleware dev mode

### Actual Files Created

| File | Purpose |
|---|---|
| `python-backend/tests/unit/test_periodic_handlers.py` | 38 tests: route registration, JSON responses, GET rejection, idempotency |
| `python-backend/tests/unit/test_cleanup_redis_stale.py` | 8 tests: FakeRedis-based Redis stale cleanup logic |
| `apps/web/server/__tests__/no-setinterval.test.ts` | 1 Vitest test: setInterval removal verification |
| `scripts/create-cloud-scheduler-jobs.sh` | gcloud provisioning script for 12 Cloud Scheduler jobs |
| `scripts/validate-cloud-scheduler.sh` | gcloud validation script for all 12 jobs |

### Actual Files Modified

| File | Change |
|---|---|
| `python-backend/app/api/v1/task_handlers.py` | Wired real business logic into 8 stub endpoints + added 3 new endpoints |
| `python-backend/app/core/csrf.py` | Added `/tasks/` to EXEMPT_PREFIXES |
| `apps/web/server/routers/mediaJobs.ts` | Removed setInterval block, added Cloud Scheduler reference comment |

### Test Results

- Python: 46 passed (38 handler + 8 Redis cleanup)
- Vitest: 1 passed (no-setinterval verification)
- Total: 47 tests all green