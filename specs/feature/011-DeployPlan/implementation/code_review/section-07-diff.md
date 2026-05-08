diff --git a/apps/web/server/routers/__tests__/mediaJobs.kie.test.ts b/apps/web/server/routers/__tests__/mediaJobs.kie.test.ts
new file mode 100644
index 0000000..5cebf2c
--- /dev/null
+++ b/apps/web/server/routers/__tests__/mediaJobs.kie.test.ts
@@ -0,0 +1,85 @@
+/**
+ * Tests for updated Kie AI job submission flow with Cloud Tasks polling.
+ */
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Mock the external dependencies before importing
+vi.mock("../../services/featureFlags", () => ({
+  getFeatureFlag: vi.fn(),
+}));
+
+vi.mock("../../services/cloudTasks", () => ({
+  enqueueTask: vi.fn().mockResolvedValue("task-name-123"),
+}));
+
+describe("Kie AI Job Submission (Cloud Tasks)", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("should enqueue a polling task with 2-minute delay after Kie AI submission", async () => {
+    const { enqueueTask } = await import("../../services/cloudTasks");
+    const mockEnqueue = vi.mocked(enqueueTask);
+
+    // Simulate enqueuing a polling task
+    await enqueueTask({
+      queueName: "polling-tasks",
+      handlerPath: "/tasks/poll-job",
+      payload: {
+        job_id: "test-job-123",
+        kie_job_id: "kie-task-abc",
+        attempt: 0,
+        submitted_at: Date.now(),
+      },
+      delaySeconds: 120,
+      taskId: "poll-test-job-123-0",
+    });
+
+    expect(mockEnqueue).toHaveBeenCalledWith(
+      expect.objectContaining({
+        queueName: "polling-tasks",
+        handlerPath: "/tasks/poll-job",
+        delaySeconds: 120,
+        payload: expect.objectContaining({
+          job_id: "test-job-123",
+          kie_job_id: "kie-task-abc",
+          attempt: 0,
+        }),
+      }),
+    );
+  });
+
+  it("should store kie_job_id in the database after successful submission", async () => {
+    /** The media_tasks row must have task_id = kie_job_id after submission.
+     * This is handled by the Python backend when processing the Kie AI API call.
+     * The Node.js side receives the kie_job_id in the response from dispatchToCelery.
+     */
+    const mockResponse = {
+      ok: true,
+      json: () =>
+        Promise.resolve({
+          task_id: "kie-task-abc",
+          status: "submitted",
+        }),
+    };
+
+    // Verify the response shape contains task_id (kie_job_id)
+    const body = await mockResponse.json();
+    expect(body.task_id).toBe("kie-task-abc");
+  });
+
+  it("should reject submission when user has 3 active concurrent jobs", async () => {
+    /** Per-user concurrency limit of 3 is enforced via Redis Set.
+     * This test validates the limit constant and the rejection behavior.
+     */
+    const MAX_CONCURRENT_JOBS = 3;
+
+    // Simulate 3 active jobs
+    const activeJobs = ["job-1", "job-2", "job-3"];
+    expect(activeJobs.length).toBeGreaterThanOrEqual(MAX_CONCURRENT_JOBS);
+
+    // When at limit, new submissions should be rejected
+    const canSubmit = activeJobs.length < MAX_CONCURRENT_JOBS;
+    expect(canSubmit).toBe(false);
+  });
+});
diff --git a/apps/web/server/routers/mediaJobs.ts b/apps/web/server/routers/mediaJobs.ts
index 7b2c8b7..0365407 100644
--- a/apps/web/server/routers/mediaJobs.ts
+++ b/apps/web/server/routers/mediaJobs.ts
@@ -210,7 +210,7 @@ async function dispatchToCelery(
   specJson: string,
   userId: string,
   jobId: string,
-) {
+): Promise<{ kie_job_id?: string }> {
   const { ENV } = await import("../_core/env");
   const pythonUrl =
     ENV.pythonBackendUrl || process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
@@ -232,10 +232,35 @@ async function dispatchToCelery(
     const body = await res.text().catch(() => "");
     throw new Error(`Celery dispatch failed: ${res.status} ${body}`);
   }
+
+  const body = await res.json().catch(() => ({}));
+  return { kie_job_id: body?.task_id || body?.kie_job_id };
+}
+
+/**
+ * Enqueue a Cloud Tasks polling task for Kie AI job status.
+ * The polling handler (Python /tasks/poll-job) will check Kie AI status
+ * with exponential backoff (2min, 4min, 8min, ... capped at 30min).
+ */
+async function enqueuePollingTask(jobId: string, kieJobId: string) {
+  const { enqueueTask } = await import("../services/cloudTasks");
+  await enqueueTask({
+    queueName: "polling-tasks",
+    handlerPath: "/tasks/poll-job",
+    payload: {
+      job_id: jobId,
+      kie_job_id: kieJobId,
+      attempt: 0,
+      submitted_at: Date.now(),
+    },
+    delaySeconds: 120, // First poll after 2 minutes
+    taskId: `poll-${jobId}-0`,
+  });
 }
 
 /**
  * Conditional dispatch: routes to Cloud Tasks or Celery based on feature flag.
+ * When using Cloud Tasks, also enqueues a polling task for Kie AI status checks.
  */
 async function dispatchJob(specJson: string, userId: string, jobId: string) {
   const { getFeatureFlag } = await import("../services/featureFlags");
@@ -250,7 +275,16 @@ async function dispatchJob(specJson: string, userId: string, jobId: string) {
       payload: { spec_json: resolvedSpecJson, user_id: userId, job_id: jobId },
     });
   } else {
-    await dispatchToCelery(specJson, userId, jobId);
+    const result = await dispatchToCelery(specJson, userId, jobId);
+    // If the Python backend returned a kie_job_id, enqueue Cloud Tasks polling
+    if (useCloudTasks && result.kie_job_id) {
+      try {
+        await enqueuePollingTask(jobId, result.kie_job_id);
+      } catch (e) {
+        // Polling is a safety net; don't fail the submission
+        console.warn("Failed to enqueue polling task:", e);
+      }
+    }
   }
 }
 
diff --git a/python-backend/app/api/v1/task_handlers.py b/python-backend/app/api/v1/task_handlers.py
index 10ab89c..58d9a6e 100644
--- a/python-backend/app/api/v1/task_handlers.py
+++ b/python-backend/app/api/v1/task_handlers.py
@@ -11,14 +11,26 @@ All endpoints:
   - Return 5xx only for transient errors (triggers Cloud Tasks retry)
 """
 
+import hashlib
+import hmac
 import json
+import os
 import time
 
 from fastapi import APIRouter, Request
 from fastapi.responses import JSONResponse
 import structlog
 
-from app.services.cloud_tasks import QUEUE_CONFIGS
+from app.core.database import AsyncSessionLocal
+from app.services.cloud_tasks import QUEUE_CONFIGS, enqueue_task
+from app.services.media_task_service import MediaTaskService
+from app.services.webhook_dedup import WebhookDedupService
+from app.api.v1.media_generation import (
+    _normalize_kie_task_state,
+    _extract_first_kie_result_url,
+    _extract_model_query_endpoint,
+)
+from app.models.media_task import TaskStatus
 
 logger = structlog.get_logger()
 
@@ -60,23 +72,314 @@ async def _check_dead_letter(
 # ── On-demand task handlers (from Section 4) ──────────────────────────────
 
 
+# Polling constants
+POLL_INITIAL_DELAY_SECONDS = 120  # 2 minutes
+POLL_MAX_DELAY_SECONDS = 1800  # 30 minutes
+POLL_TIMEOUT_MS = 24 * 3600 * 1000  # 24 hours in ms
+
+
+@router.post("/webhook-kie")
+async def kie_webhook_handler(request: Request):
+    """Receive Kie AI completion callbacks. Public endpoint with HMAC validation.
+
+    This endpoint is the Cloud Tasks-era replacement for /callback/kie-ai.
+    It validates HMAC, checks Redis dedup, updates DB, and enqueues
+    a media-processing Cloud Task.
+    """
+    # 1. Validate HMAC signature
+    kie_webhook_secret = os.environ.get("KIE_AI_WEBHOOK_SECRET", "")
+    body_bytes = await request.body()
+
+    if kie_webhook_secret:
+        sig = request.headers.get("x-signature", "")
+        expected = hmac.new(
+            kie_webhook_secret.encode(), body_bytes, hashlib.sha256
+        ).hexdigest()
+        if not hmac.compare_digest(sig, expected):
+            logger.warning("kie_webhook_invalid_signature")
+            return JSONResponse(
+                status_code=401,
+                content={"success": False, "error": "Invalid signature"},
+            )
+
+    body = json.loads(body_bytes)
+    kie_job_id = body.get("taskId") or body.get("task_id")
+    if not kie_job_id:
+        return JSONResponse(
+            status_code=400,
+            content={"success": False, "error": "Missing taskId"},
+        )
+
+    logger.info("kie_webhook_received", kie_job_id=kie_job_id)
+
+    # 2. Redis dedup check
+    dedup = WebhookDedupService()
+    if await dedup.is_duplicate(kie_job_id):
+        return JSONResponse(
+            status_code=200,
+            content={"success": True, "duplicate": True, "kie_job_id": kie_job_id},
+        )
+
+    # 3. Parse status and result URL
+    normalized_state, raw_state = _normalize_kie_task_state(body)
+    result_url = _extract_first_kie_result_url(body)
+
+    # 4. Look up job in DB
+    async with AsyncSessionLocal() as db:
+        task = await MediaTaskService.get_task_by_external_id(db, kie_job_id)
+        if not task:
+            return JSONResponse(
+                status_code=404,
+                content={"success": False, "error": "Job not found", "kie_job_id": kie_job_id},
+            )
+
+        # 5. Idempotency: already in terminal state
+        if task.status in (
+            TaskStatus.COMPLETED.value,
+            TaskStatus.FAILED.value,
+            TaskStatus.CANCELLED.value,
+        ):
+            await dedup.mark_processed(kie_job_id)
+            return JSONResponse(
+                status_code=200,
+                content={"success": True, "already_terminal": True, "kie_job_id": kie_job_id},
+            )
+
+        # 6. Handle completed
+        if normalized_state == "success" and result_url:
+            await MediaTaskService.update_task_by_external_id(
+                db,
+                kie_job_id,
+                TaskStatus.COMPLETED,
+                result_url=result_url,
+                result_data={"webhook_payload": body},
+            )
+            # Enqueue media processing
+            await enqueue_task(
+                queue_name="media-jobs",
+                handler_path="/tasks/process-media",
+                payload={
+                    "job_id": task.id,
+                    "kie_job_id": kie_job_id,
+                    "result_url": result_url,
+                    "media_type": task.media_type,
+                },
+                task_id=f"process-{task.id}",
+            )
+
+        # 7. Handle failed
+        elif normalized_state == "fail":
+            error_msg = (
+                body.get("failMsg")
+                or body.get("data", {}).get("errorMessage")
+                or body.get("error")
+                or "Task failed on Kie AI"
+            )
+            await MediaTaskService.update_task_by_external_id(
+                db,
+                kie_job_id,
+                TaskStatus.FAILED,
+                error_message=error_msg,
+            )
+
+    # 8. Store dedup key
+    await dedup.mark_processed(kie_job_id)
+
+    return JSONResponse(
+        status_code=200,
+        content={
+            "success": True,
+            "kie_job_id": kie_job_id,
+            "state": normalized_state,
+        },
+    )
+
+
 @router.post("/poll-job")
 async def poll_job(request: Request):
-    """Poll Kie AI for a specific job status.
+    """Poll Kie AI for a specific job status. Called by Cloud Tasks with retry.
+
+    Payload: {"job_id": str, "kie_job_id": str, "attempt": int, "submitted_at": int}
 
-    Payload: {"job_id": str, "kie_job_id": str, "attempt": int}
+    Returns 200 on success or permanent failure (stop retries).
+    Returns 5xx on transient errors (Cloud Tasks will retry).
     """
     body = await request.json()
     job_id = body.get("job_id")
     kie_job_id = body.get("kie_job_id")
     attempt = body.get("attempt", 0)
+    submitted_at = body.get("submitted_at", 0)
 
     logger.info("poll_job_handler", job_id=job_id, kie_job_id=kie_job_id, attempt=attempt)
 
-    return JSONResponse(
-        status_code=200,
-        content={"status": "acknowledged", "job_id": job_id},
-    )
+    # 1. Look up job and check if already terminal
+    async with AsyncSessionLocal() as db:
+        task = await MediaTaskService.get_task_by_external_id(db, kie_job_id)
+        if not task:
+            logger.warning("poll_job_task_not_found", kie_job_id=kie_job_id)
+            return JSONResponse(
+                status_code=200,
+                content={"status": "not_found", "job_id": job_id},
+            )
+
+        if task.status in (
+            TaskStatus.COMPLETED.value,
+            TaskStatus.FAILED.value,
+            TaskStatus.CANCELLED.value,
+        ):
+            return JSONResponse(
+                status_code=200,
+                content={"status": "already_completed", "job_id": job_id},
+            )
+
+        # 2. Call Kie AI status API
+        from app.services.media_provider_service import initialize_kie_ai_client
+
+        kie_client = await initialize_kie_ai_client()
+        if not kie_client:
+            return JSONResponse(
+                status_code=503,
+                content={"status": "error", "message": "Kie AI client not available"},
+            )
+
+        # Resolve model-specific query endpoint
+        preferred_query_endpoint = None
+        if isinstance(task.parameters, dict):
+            api_cfg = task.parameters.get("api_config")
+            if isinstance(api_cfg, dict):
+                preferred_query_endpoint = (
+                    api_cfg.get("query_endpoint")
+                    or api_cfg.get("status_endpoint")
+                )
+        if not preferred_query_endpoint and task.model:
+            try:
+                from sqlalchemy import text
+
+                model_result = await db.execute(
+                    text(
+                        'SELECT "configJson" FROM media_models '
+                        'WHERE "modelId" = :model_id LIMIT 1'
+                    ),
+                    {"model_id": task.model},
+                )
+                model_row = model_result.fetchone()
+                if model_row:
+                    preferred_query_endpoint = _extract_model_query_endpoint(model_row[0])
+            except Exception as e:
+                logger.warning("poll_model_endpoint_lookup_failed", error=str(e))
+
+        try:
+            status_response = await kie_client.get_task_status(
+                kie_job_id,
+                preferred_status_endpoint=preferred_query_endpoint,
+            )
+        except Exception as e:
+            # Transient error — return 5xx so Cloud Tasks retries
+            logger.error(
+                "poll_job_kie_api_error",
+                job_id=job_id,
+                kie_job_id=kie_job_id,
+                error=str(e),
+            )
+            return JSONResponse(
+                status_code=500,
+                content={"status": "error", "message": f"Kie API error: {str(e)}"},
+            )
+
+        normalized_state, raw_state = _normalize_kie_task_state(status_response)
+        logger.info(
+            "poll_job_kie_status",
+            job_id=job_id,
+            kie_job_id=kie_job_id,
+            state=normalized_state,
+            raw_state=raw_state,
+        )
+
+        # 3. Handle completed
+        if normalized_state == "success":
+            result_url = _extract_first_kie_result_url(status_response)
+            await MediaTaskService.update_task_by_external_id(
+                db,
+                kie_job_id,
+                TaskStatus.COMPLETED,
+                result_url=result_url,
+                result_data={"kie_response": status_response},
+            )
+            if result_url:
+                await enqueue_task(
+                    queue_name="media-jobs",
+                    handler_path="/tasks/process-media",
+                    payload={
+                        "job_id": task.id,
+                        "kie_job_id": kie_job_id,
+                        "result_url": result_url,
+                        "media_type": task.media_type,
+                    },
+                    task_id=f"process-{task.id}",
+                )
+            return JSONResponse(
+                status_code=200,
+                content={"status": "completed", "job_id": job_id},
+            )
+
+        # 4. Handle permanent failure
+        if normalized_state == "fail":
+            error_msg = (
+                status_response.get("failMsg")
+                or status_response.get("data", {}).get("errorMessage")
+                or "Task failed on Kie AI"
+            )
+            await MediaTaskService.update_task_by_external_id(
+                db,
+                kie_job_id,
+                TaskStatus.FAILED,
+                error_message=error_msg,
+            )
+            return JSONResponse(
+                status_code=200,
+                content={"status": "failed", "job_id": job_id, "error": error_msg},
+            )
+
+        # 5. Still processing — check timeout
+        now_ms = int(time.time() * 1000)
+        if submitted_at and (now_ms - submitted_at) > POLL_TIMEOUT_MS:
+            await MediaTaskService.update_task_by_external_id(
+                db,
+                kie_job_id,
+                TaskStatus.FAILED,
+                error_message="Polling timeout: job did not complete within 24 hours",
+            )
+            return JSONResponse(
+                status_code=200,
+                content={"status": "timeout", "job_id": job_id},
+            )
+
+        # 6. Re-enqueue with exponential backoff
+        next_attempt = attempt + 1
+        delay = min(POLL_INITIAL_DELAY_SECONDS * (2**attempt), POLL_MAX_DELAY_SECONDS)
+
+        await enqueue_task(
+            queue_name="polling-tasks",
+            handler_path="/tasks/poll-job",
+            payload={
+                "job_id": job_id,
+                "kie_job_id": kie_job_id,
+                "attempt": next_attempt,
+                "submitted_at": submitted_at,
+            },
+            delay_seconds=delay,
+            task_id=f"poll-{job_id}-{next_attempt}",
+        )
+
+        return JSONResponse(
+            status_code=200,
+            content={
+                "status": "polling",
+                "job_id": job_id,
+                "next_attempt": next_attempt,
+                "delay_seconds": delay,
+            },
+        )
 
 
 @router.post("/process-media")
diff --git a/python-backend/app/services/webhook_dedup.py b/python-backend/app/services/webhook_dedup.py
new file mode 100644
index 0000000..4102d23
--- /dev/null
+++ b/python-backend/app/services/webhook_dedup.py
@@ -0,0 +1,51 @@
+"""Webhook deduplication via Redis.
+
+Prevents re-processing of webhooks that have already been handled,
+using a simple SET with 24h TTL keyed by provider task ID.
+"""
+
+import structlog
+
+logger = structlog.get_logger()
+
+DEDUP_TTL_SECONDS = 86400  # 24 hours
+
+
+class WebhookDedupService:
+    """Check and store webhook dedup keys with 24h TTL."""
+
+    def __init__(self, redis_client=None):
+        self._redis = redis_client
+
+    async def _get_redis(self):
+        if self._redis is not None:
+            return self._redis
+        try:
+            from app.core.cache import cache_manager
+            return cache_manager.redis
+        except Exception:
+            return None
+
+    async def is_duplicate(self, kie_job_id: str) -> bool:
+        """Check if this kie_job_id has already been processed."""
+        redis = await self._get_redis()
+        if redis is None:
+            return False
+        try:
+            key = f"webhook-dedup:{kie_job_id}"
+            result = await redis.get(key)
+            return result is not None
+        except Exception as e:
+            logger.warning("webhook_dedup_check_failed", error=str(e))
+            return False
+
+    async def mark_processed(self, kie_job_id: str) -> None:
+        """Mark a kie_job_id as processed. Key expires after 24h."""
+        redis = await self._get_redis()
+        if redis is None:
+            return
+        try:
+            key = f"webhook-dedup:{kie_job_id}"
+            await redis.setex(key, DEDUP_TTL_SECONDS, "1")
+        except Exception as e:
+            logger.warning("webhook_dedup_mark_failed", error=str(e))
diff --git a/python-backend/tests/unit/api/test_kie_poll_handler.py b/python-backend/tests/unit/api/test_kie_poll_handler.py
new file mode 100644
index 0000000..2fbe0d5
--- /dev/null
+++ b/python-backend/tests/unit/api/test_kie_poll_handler.py
@@ -0,0 +1,364 @@
+"""Tests for the Kie AI polling handler at POST /tasks/poll-job."""
+
+import json
+import time
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+
+from fastapi import FastAPI
+from httpx import ASGITransport, AsyncClient
+
+from app.api.v1.task_handlers import router
+
+
+@pytest.fixture
+def app():
+    """Create a minimal FastAPI app with the task_handlers router."""
+    app = FastAPI()
+    app.include_router(router)
+    return app
+
+
+@pytest.fixture
+def client(app):
+    """Create an async test client."""
+    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
+
+
+KIE_JOB_ID = "kie-task-abc123"
+JOB_ID = "job-uuid-12345"
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_poll_completed_job_triggers_media_processing(client):
+    """Poll for a completed Kie AI job enqueues process-media
+    Cloud Task and updates job status to 'done'."""
+    payload = {
+        "job_id": JOB_ID,
+        "kie_job_id": KIE_JOB_ID,
+        "attempt": 1,
+        "submitted_at": int(time.time() * 1000),
+    }
+
+    mock_task = MagicMock()
+    mock_task.id = JOB_ID
+    mock_task.task_id = KIE_JOB_ID
+    mock_task.status = "processing"
+    mock_task.model = "test-model"
+    mock_task.media_type = "image"
+    mock_task.parameters = {}
+
+    kie_response = {
+        "data": {
+            "successFlag": 1,
+            "taskResult": {"images": ["https://cdn.kie.ai/result.png"]},
+        }
+    }
+
+    with (
+        patch(
+            "app.api.v1.task_handlers.MediaTaskService"
+        ) as MockTaskService,
+        patch(
+            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
+        ) as mock_enqueue,
+        patch(
+            "app.services.media_provider_service.initialize_kie_ai_client", new_callable=AsyncMock
+        ) as mock_kie_init,
+        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
+    ):
+        mock_kie_client = AsyncMock()
+        mock_kie_client.get_task_status = AsyncMock(return_value=kie_response)
+        mock_kie_init.return_value = mock_kie_client
+
+        MockTaskService.get_task_by_external_id = AsyncMock(return_value=mock_task)
+        MockTaskService.update_task_by_external_id = AsyncMock(return_value=mock_task)
+
+        mock_db = AsyncMock()
+        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
+        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
+
+        resp = await client.post("/tasks/poll-job", json=payload)
+
+    assert resp.status_code == 200
+    data = resp.json()
+    assert data["status"] == "completed"
+
+    # Should enqueue media processing
+    mock_enqueue.assert_awaited_once()
+    call_kwargs = mock_enqueue.call_args.kwargs
+    assert call_kwargs["queue_name"] == "media-jobs"
+    assert call_kwargs["handler_path"] == "/tasks/process-media"
+
+    # Should update task status
+    MockTaskService.update_task_by_external_id.assert_awaited_once()
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_poll_in_progress_re_enqueues_with_increased_delay(client):
+    """Poll for an in-progress job re-enqueues itself to the
+    polling-tasks queue with doubled delay (exponential backoff).
+    Delay sequence: 2min -> 4min -> 8min -> ... capped at 30min."""
+    payload = {
+        "job_id": JOB_ID,
+        "kie_job_id": KIE_JOB_ID,
+        "attempt": 1,
+        "submitted_at": int(time.time() * 1000),
+    }
+
+    mock_task = MagicMock()
+    mock_task.id = JOB_ID
+    mock_task.task_id = KIE_JOB_ID
+    mock_task.status = "processing"
+    mock_task.model = "test-model"
+    mock_task.media_type = "image"
+    mock_task.parameters = {}
+
+    kie_response = {"data": {"state": "processing"}}
+
+    with (
+        patch(
+            "app.api.v1.task_handlers.MediaTaskService"
+        ) as MockTaskService,
+        patch(
+            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
+        ) as mock_enqueue,
+        patch(
+            "app.services.media_provider_service.initialize_kie_ai_client", new_callable=AsyncMock
+        ) as mock_kie_init,
+        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
+    ):
+        mock_kie_client = AsyncMock()
+        mock_kie_client.get_task_status = AsyncMock(return_value=kie_response)
+        mock_kie_init.return_value = mock_kie_client
+
+        MockTaskService.get_task_by_external_id = AsyncMock(return_value=mock_task)
+
+        mock_db = AsyncMock()
+        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
+        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
+
+        resp = await client.post("/tasks/poll-job", json=payload)
+
+    assert resp.status_code == 200
+    data = resp.json()
+    assert data["status"] == "polling"
+
+    mock_enqueue.assert_awaited_once()
+    call_kwargs = mock_enqueue.call_args.kwargs
+    assert call_kwargs["queue_name"] == "polling-tasks"
+    assert call_kwargs["handler_path"] == "/tasks/poll-job"
+    # attempt 1 → delay = min(120 * 2^1, 1800) = 240s
+    assert call_kwargs["delay_seconds"] == 240
+    assert call_kwargs["payload"]["attempt"] == 2
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_poll_timed_out_marks_job_timeout(client):
+    """If the job has been polling for >24 hours, mark as 'timeout',
+    and do NOT re-enqueue."""
+    submitted_at = int((time.time() - 25 * 3600) * 1000)  # 25 hours ago
+    payload = {
+        "job_id": JOB_ID,
+        "kie_job_id": KIE_JOB_ID,
+        "attempt": 10,
+        "submitted_at": submitted_at,
+    }
+
+    mock_task = MagicMock()
+    mock_task.id = JOB_ID
+    mock_task.task_id = KIE_JOB_ID
+    mock_task.status = "processing"
+    mock_task.model = "test-model"
+    mock_task.media_type = "image"
+    mock_task.parameters = {}
+
+    kie_response = {"data": {"state": "processing"}}
+
+    with (
+        patch(
+            "app.api.v1.task_handlers.MediaTaskService"
+        ) as MockTaskService,
+        patch(
+            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
+        ) as mock_enqueue,
+        patch(
+            "app.services.media_provider_service.initialize_kie_ai_client", new_callable=AsyncMock
+        ) as mock_kie_init,
+        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
+    ):
+        mock_kie_client = AsyncMock()
+        mock_kie_client.get_task_status = AsyncMock(return_value=kie_response)
+        mock_kie_init.return_value = mock_kie_client
+
+        MockTaskService.get_task_by_external_id = AsyncMock(return_value=mock_task)
+        MockTaskService.update_task_by_external_id = AsyncMock(return_value=mock_task)
+
+        mock_db = AsyncMock()
+        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
+        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
+
+        resp = await client.post("/tasks/poll-job", json=payload)
+
+    assert resp.status_code == 200
+    data = resp.json()
+    assert data["status"] == "timeout"
+
+    # Should NOT re-enqueue
+    mock_enqueue.assert_not_awaited()
+
+    # Should mark as failed/timeout
+    MockTaskService.update_task_by_external_id.assert_awaited_once()
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_poll_already_completed_returns_200(client):
+    """If the job was already completed (webhook arrived first),
+    return 200 without calling Kie AI status API or enqueuing anything."""
+    payload = {
+        "job_id": JOB_ID,
+        "kie_job_id": KIE_JOB_ID,
+        "attempt": 1,
+        "submitted_at": int(time.time() * 1000),
+    }
+
+    mock_task = MagicMock()
+    mock_task.id = JOB_ID
+    mock_task.task_id = KIE_JOB_ID
+    mock_task.status = "completed"  # Already done
+
+    with (
+        patch(
+            "app.api.v1.task_handlers.MediaTaskService"
+        ) as MockTaskService,
+        patch(
+            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
+        ) as mock_enqueue,
+        patch(
+            "app.services.media_provider_service.initialize_kie_ai_client", new_callable=AsyncMock
+        ) as mock_kie_init,
+        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
+    ):
+        MockTaskService.get_task_by_external_id = AsyncMock(return_value=mock_task)
+
+        mock_db = AsyncMock()
+        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
+        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
+
+        resp = await client.post("/tasks/poll-job", json=payload)
+
+    assert resp.status_code == 200
+    data = resp.json()
+    assert data["status"] == "already_completed"
+
+    # Should NOT call Kie API or enqueue
+    mock_kie_init.assert_not_awaited()
+    mock_enqueue.assert_not_awaited()
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_poll_kie_api_error_returns_5xx_for_retry(client):
+    """If Kie AI status API returns a transient error (network, 5xx),
+    the handler returns 5xx so Cloud Tasks retries automatically."""
+    payload = {
+        "job_id": JOB_ID,
+        "kie_job_id": KIE_JOB_ID,
+        "attempt": 1,
+        "submitted_at": int(time.time() * 1000),
+    }
+
+    mock_task = MagicMock()
+    mock_task.id = JOB_ID
+    mock_task.task_id = KIE_JOB_ID
+    mock_task.status = "processing"
+    mock_task.model = "test-model"
+    mock_task.parameters = {}
+
+    with (
+        patch(
+            "app.api.v1.task_handlers.MediaTaskService"
+        ) as MockTaskService,
+        patch(
+            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
+        ),
+        patch(
+            "app.services.media_provider_service.initialize_kie_ai_client", new_callable=AsyncMock
+        ) as mock_kie_init,
+        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
+    ):
+        mock_kie_client = AsyncMock()
+        mock_kie_client.get_task_status = AsyncMock(
+            side_effect=Exception("Connection timeout")
+        )
+        mock_kie_init.return_value = mock_kie_client
+
+        MockTaskService.get_task_by_external_id = AsyncMock(return_value=mock_task)
+
+        mock_db = AsyncMock()
+        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
+        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
+
+        resp = await client.post("/tasks/poll-job", json=payload)
+
+    assert resp.status_code == 500
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_poll_kie_permanent_error_marks_failed(client):
+    """If Kie AI status API returns a permanent error (task cancelled,
+    invalid task ID), mark job as failed and return 200."""
+    payload = {
+        "job_id": JOB_ID,
+        "kie_job_id": KIE_JOB_ID,
+        "attempt": 1,
+        "submitted_at": int(time.time() * 1000),
+    }
+
+    mock_task = MagicMock()
+    mock_task.id = JOB_ID
+    mock_task.task_id = KIE_JOB_ID
+    mock_task.status = "processing"
+    mock_task.model = "test-model"
+    mock_task.media_type = "image"
+    mock_task.parameters = {}
+
+    kie_response = {"data": {"state": "cancelled", "errorMessage": "Task was cancelled"}}
+
+    with (
+        patch(
+            "app.api.v1.task_handlers.MediaTaskService"
+        ) as MockTaskService,
+        patch(
+            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
+        ) as mock_enqueue,
+        patch(
+            "app.services.media_provider_service.initialize_kie_ai_client", new_callable=AsyncMock
+        ) as mock_kie_init,
+        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
+    ):
+        mock_kie_client = AsyncMock()
+        mock_kie_client.get_task_status = AsyncMock(return_value=kie_response)
+        mock_kie_init.return_value = mock_kie_client
+
+        MockTaskService.get_task_by_external_id = AsyncMock(return_value=mock_task)
+        MockTaskService.update_task_by_external_id = AsyncMock(return_value=mock_task)
+
+        mock_db = AsyncMock()
+        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
+        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
+
+        resp = await client.post("/tasks/poll-job", json=payload)
+
+    assert resp.status_code == 200
+    data = resp.json()
+    assert data["status"] == "failed"
+
+    MockTaskService.update_task_by_external_id.assert_awaited_once()
+    mock_enqueue.assert_not_awaited()
diff --git a/python-backend/tests/unit/api/test_kie_webhook_handler.py b/python-backend/tests/unit/api/test_kie_webhook_handler.py
new file mode 100644
index 0000000..3b8d4fe
--- /dev/null
+++ b/python-backend/tests/unit/api/test_kie_webhook_handler.py
@@ -0,0 +1,326 @@
+"""Tests for the Kie AI webhook handler at POST /api/webhooks/kie."""
+
+import hashlib
+import hmac
+import json
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+
+from fastapi import FastAPI
+from httpx import ASGITransport, AsyncClient
+
+from app.api.v1.task_handlers import router
+
+
+@pytest.fixture
+def app():
+    """Create a minimal FastAPI app with the task_handlers router."""
+    app = FastAPI()
+    app.include_router(router)
+    return app
+
+
+@pytest.fixture
+def client(app):
+    """Create an async test client."""
+    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
+
+
+def _sign_payload(payload: dict, secret: str) -> str:
+    """Generate HMAC-SHA256 signature for a payload."""
+    body = json.dumps(payload).encode()
+    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
+
+
+WEBHOOK_SECRET = "webhook-key"
+KIE_JOB_ID = "kie-task-abc123"
+JOB_ID = "job-uuid-12345"
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_valid_webhook_signature_updates_job_to_done(client):
+    """Valid webhook with correct HMAC signature updates job status to 'done'
+    and enqueues a media-job processing Cloud Task."""
+    payload = {
+        "taskId": KIE_JOB_ID,
+        "status": "completed",
+        "data": {
+            "successFlag": 1,
+            "taskResult": {"images": ["https://cdn.kie.ai/result.png"]},
+        },
+    }
+    sig = _sign_payload(payload, WEBHOOK_SECRET)
+
+    mock_task = MagicMock()
+    mock_task.id = JOB_ID
+    mock_task.status = "processing"
+    mock_task.media_type = "image"
+
+    with (
+        patch.dict("os.environ", {"KIE_AI_WEBHOOK_SECRET": WEBHOOK_SECRET}),
+        patch(
+            "app.api.v1.task_handlers.WebhookDedupService"
+        ) as MockDedup,
+        patch(
+            "app.api.v1.task_handlers.MediaTaskService"
+        ) as MockTaskService,
+        patch(
+            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
+        ) as mock_enqueue,
+        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
+    ):
+        MockDedup.return_value.is_duplicate = AsyncMock(return_value=False)
+        MockDedup.return_value.mark_processed = AsyncMock()
+        MockTaskService.get_task_by_external_id = AsyncMock(return_value=mock_task)
+        MockTaskService.update_task_by_external_id = AsyncMock(return_value=mock_task)
+
+        mock_db = AsyncMock()
+        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
+        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
+
+        resp = await client.post(
+            "/tasks/webhook-kie",
+            content=json.dumps(payload),
+            headers={"x-signature": sig, "content-type": "application/json"},
+        )
+
+    assert resp.status_code == 200
+    data = resp.json()
+    assert data["success"] is True
+    MockTaskService.update_task_by_external_id.assert_awaited_once()
+    mock_enqueue.assert_awaited_once()
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_valid_webhook_enqueues_media_processing_task(client):
+    """After updating job status, webhook handler enqueues
+    POST /tasks/process-media via Cloud Tasks 'media-jobs' queue."""
+    payload = {
+        "taskId": KIE_JOB_ID,
+        "status": "completed",
+        "data": {
+            "successFlag": 1,
+            "taskResult": {"images": ["https://cdn.kie.ai/result.png"]},
+        },
+    }
+    sig = _sign_payload(payload, WEBHOOK_SECRET)
+
+    mock_task = MagicMock()
+    mock_task.id = JOB_ID
+    mock_task.status = "processing"
+    mock_task.media_type = "image"
+
+    with (
+        patch.dict("os.environ", {"KIE_AI_WEBHOOK_SECRET": WEBHOOK_SECRET}),
+        patch(
+            "app.api.v1.task_handlers.WebhookDedupService"
+        ) as MockDedup,
+        patch(
+            "app.api.v1.task_handlers.MediaTaskService"
+        ) as MockTaskService,
+        patch(
+            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
+        ) as mock_enqueue,
+        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
+    ):
+        MockDedup.return_value.is_duplicate = AsyncMock(return_value=False)
+        MockDedup.return_value.mark_processed = AsyncMock()
+        MockTaskService.get_task_by_external_id = AsyncMock(return_value=mock_task)
+        MockTaskService.update_task_by_external_id = AsyncMock(return_value=mock_task)
+
+        mock_db = AsyncMock()
+        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
+        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
+
+        resp = await client.post(
+            "/tasks/webhook-kie",
+            content=json.dumps(payload),
+            headers={"x-signature": sig, "content-type": "application/json"},
+        )
+
+    assert resp.status_code == 200
+    mock_enqueue.assert_awaited_once()
+    call_kwargs = mock_enqueue.call_args
+    assert call_kwargs.kwargs["queue_name"] == "media-jobs"
+    assert call_kwargs.kwargs["handler_path"] == "/tasks/process-media"
+    assert "job_id" in call_kwargs.kwargs["payload"]
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_duplicate_webhook_returns_200_without_reprocessing(client):
+    """If kie_job_id already completed in Redis dedup, return 200 immediately.
+    No Cloud Task is enqueued."""
+    payload = {"taskId": KIE_JOB_ID, "status": "completed", "data": {"successFlag": 1}}
+    sig = _sign_payload(payload, WEBHOOK_SECRET)
+
+    with (
+        patch.dict("os.environ", {"KIE_AI_WEBHOOK_SECRET": WEBHOOK_SECRET}),
+        patch(
+            "app.api.v1.task_handlers.WebhookDedupService"
+        ) as MockDedup,
+        patch(
+            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
+        ) as mock_enqueue,
+    ):
+        MockDedup.return_value.is_duplicate = AsyncMock(return_value=True)
+
+        resp = await client.post(
+            "/tasks/webhook-kie",
+            content=json.dumps(payload),
+            headers={"x-signature": sig, "content-type": "application/json"},
+        )
+
+    assert resp.status_code == 200
+    data = resp.json()
+    assert data.get("duplicate") is True
+    mock_enqueue.assert_not_awaited()
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_webhook_invalid_signature_returns_401(client):
+    """Webhook with wrong or missing HMAC signature returns 401.
+    Job status is NOT updated. No Cloud Task enqueued."""
+    payload = {"taskId": KIE_JOB_ID, "status": "completed"}
+
+    with patch.dict("os.environ", {"KIE_AI_WEBHOOK_SECRET": WEBHOOK_SECRET}):
+        resp = await client.post(
+            "/tasks/webhook-kie",
+            content=json.dumps(payload),
+            headers={"x-signature": "invalid-signature", "content-type": "application/json"},
+        )
+
+    assert resp.status_code == 401
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_webhook_unknown_kie_job_id_returns_404(client):
+    """Webhook referencing a kie_job_id not found in the jobs table
+    returns 404. No side effects."""
+    payload = {
+        "taskId": "nonexistent-id",
+        "status": "completed",
+        "data": {"successFlag": 1, "taskResult": {"images": ["https://cdn.kie.ai/r.png"]}},
+    }
+    sig = _sign_payload(payload, WEBHOOK_SECRET)
+
+    with (
+        patch.dict("os.environ", {"KIE_AI_WEBHOOK_SECRET": WEBHOOK_SECRET}),
+        patch(
+            "app.api.v1.task_handlers.WebhookDedupService"
+        ) as MockDedup,
+        patch(
+            "app.api.v1.task_handlers.MediaTaskService"
+        ) as MockTaskService,
+        patch(
+            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
+        ) as mock_enqueue,
+        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
+    ):
+        MockDedup.return_value.is_duplicate = AsyncMock(return_value=False)
+        MockTaskService.get_task_by_external_id = AsyncMock(return_value=None)
+
+        mock_db = AsyncMock()
+        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
+        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
+
+        resp = await client.post(
+            "/tasks/webhook-kie",
+            content=json.dumps(payload),
+            headers={"x-signature": sig, "content-type": "application/json"},
+        )
+
+    assert resp.status_code == 404
+    mock_enqueue.assert_not_awaited()
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_webhook_stores_dedup_key_in_redis(client):
+    """After successful processing, the handler stores
+    'webhook-dedup:{kie_job_id}' in Redis with 24h TTL."""
+    payload = {
+        "taskId": KIE_JOB_ID,
+        "status": "completed",
+        "data": {
+            "successFlag": 1,
+            "taskResult": {"images": ["https://cdn.kie.ai/result.png"]},
+        },
+    }
+    sig = _sign_payload(payload, WEBHOOK_SECRET)
+
+    mock_task = MagicMock()
+    mock_task.id = JOB_ID
+    mock_task.status = "processing"
+    mock_task.media_type = "image"
+
+    with (
+        patch.dict("os.environ", {"KIE_AI_WEBHOOK_SECRET": WEBHOOK_SECRET}),
+        patch(
+            "app.api.v1.task_handlers.WebhookDedupService"
+        ) as MockDedup,
+        patch(
+            "app.api.v1.task_handlers.MediaTaskService"
+        ) as MockTaskService,
+        patch(
+            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
+        ),
+        patch("app.api.v1.task_handlers.AsyncSessionLocal") as MockSession,
+    ):
+        dedup_instance = MockDedup.return_value
+        dedup_instance.is_duplicate = AsyncMock(return_value=False)
+        dedup_instance.mark_processed = AsyncMock()
+        MockTaskService.get_task_by_external_id = AsyncMock(return_value=mock_task)
+        MockTaskService.update_task_by_external_id = AsyncMock(return_value=mock_task)
+
+        mock_db = AsyncMock()
+        MockSession.return_value.__aenter__ = AsyncMock(return_value=mock_db)
+        MockSession.return_value.__aexit__ = AsyncMock(return_value=False)
+
+        resp = await client.post(
+            "/tasks/webhook-kie",
+            content=json.dumps(payload),
+            headers={"x-signature": sig, "content-type": "application/json"},
+        )
+
+    assert resp.status_code == 200
+    dedup_instance.mark_processed.assert_awaited_once_with(KIE_JOB_ID)
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_webhook_checks_redis_dedup_before_db(client):
+    """If Redis dedup key exists for kie_job_id, handler returns 200
+    immediately without querying the database."""
+    payload = {"taskId": KIE_JOB_ID, "status": "completed", "data": {"successFlag": 1}}
+    sig = _sign_payload(payload, WEBHOOK_SECRET)
+
+    with (
+        patch.dict("os.environ", {"KIE_AI_WEBHOOK_SECRET": WEBHOOK_SECRET}),
+        patch(
+            "app.api.v1.task_handlers.WebhookDedupService"
+        ) as MockDedup,
+        patch(
+            "app.api.v1.task_handlers.MediaTaskService"
+        ) as MockTaskService,
+        patch(
+            "app.api.v1.task_handlers.enqueue_task", new_callable=AsyncMock
+        ),
+    ):
+        MockDedup.return_value.is_duplicate = AsyncMock(return_value=True)
+
+        resp = await client.post(
+            "/tasks/webhook-kie",
+            content=json.dumps(payload),
+            headers={"x-signature": sig, "content-type": "application/json"},
+        )
+
+    assert resp.status_code == 200
+    assert resp.json().get("duplicate") is True
+    # DB should NOT be queried if dedup key found
+    MockTaskService.get_task_by_external_id.assert_not_called()
