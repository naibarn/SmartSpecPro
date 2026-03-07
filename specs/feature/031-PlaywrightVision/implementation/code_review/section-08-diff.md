diff --git a/python-backend/app/api/automation_copilot.py b/python-backend/app/api/automation_copilot.py
new file mode 100644
index 0000000..016ed2e
--- /dev/null
+++ b/python-backend/app/api/automation_copilot.py
@@ -0,0 +1,209 @@
+"""FastAPI endpoints for the Automation Copilot feature.
+
+Five endpoints with X-Internal-Token auth:
+  POST /analyze   — Parse prompt into intent
+  GET  /status    — Get task status
+  POST /execute   — Generate + run automation
+  POST /cancel    — Cancel running task
+  GET  /templates — List saved templates
+"""
+
+from __future__ import annotations
+
+import json
+import secrets
+import uuid
+from typing import Optional
+
+import redis as sync_redis
+import structlog
+from fastapi import APIRouter, Depends, Header, HTTPException, Query
+from pydantic import BaseModel, Field
+
+from app.core.config import settings
+
+logger = structlog.get_logger(__name__)
+
+router = APIRouter(tags=["Automation Copilot"])
+
+_REDIS_URL = getattr(settings, "CELERY_BROKER_URL", None) or "redis://localhost:6379/0"
+_RESULT_TTL = 3600
+
+
+def _get_redis() -> sync_redis.Redis:
+    return sync_redis.Redis.from_url(_REDIS_URL, decode_responses=True)
+
+
+# ── Auth ──────────────────────────────────────────────────────────────────
+
+
+async def _verify_internal_token(
+    x_internal_token: Optional[str] = Header(None),
+    x_proxy_token: Optional[str] = Header(None),
+) -> None:
+    expected = (
+        getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
+        or getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", None)
+    )
+    if not expected:
+        raise HTTPException(status_code=500, detail="Internal token not configured")
+    token = x_internal_token or x_proxy_token
+    if not token:
+        raise HTTPException(status_code=401, detail=json.dumps({"error": "Missing internal token", "code": "unauthorized"}))
+    if not secrets.compare_digest(token, expected):
+        raise HTTPException(status_code=401, detail=json.dumps({"error": "Invalid internal token", "code": "unauthorized"}))
+
+
+# ── Request/Response Models ───────────────────────────────────────────────
+
+
+class AnalyzeRequest(BaseModel):
+    prompt: str = Field(..., min_length=1, max_length=10000)
+    tenant_id: str = Field(..., max_length=100)
+    user_id: int
+    user_jwt: str
+
+
+class ExecuteRequest(BaseModel):
+    task_id: str
+    execution_id: str
+    intent_json: str
+    user_jwt: str
+    tenant_id: str = Field(..., max_length=100)
+    user_id: int
+    vision_model: str = Field(default="gpt-4o", max_length=100)
+    allowed_domains: list[str] = Field(default_factory=list)
+
+
+class CancelRequest(BaseModel):
+    tenant_id: str = Field(..., max_length=100)
+
+
+# ── Endpoints ─────────────────────────────────────────────────────────────
+
+
+@router.post("/analyze")
+async def analyze(
+    body: AnalyzeRequest,
+    _: None = Depends(_verify_internal_token),
+):
+    """Parse prompt into automation intent."""
+    from app.tasks.automation_copilot_task import automation_analyze_task
+
+    # Feature flag check
+    r = _get_redis()
+    flag = r.get(f"feature_flag:automationCopilot:{body.tenant_id}")
+    if flag == "0":
+        raise HTTPException(
+            status_code=403,
+            detail=json.dumps({"error": "Automation Copilot is disabled", "code": "feature_disabled"}),
+        )
+
+    task_id = f"auto-{uuid.uuid4().hex[:12]}"
+    r.set(
+        f"automation:{task_id}",
+        json.dumps({"status": "queued", "tenant_id": body.tenant_id, "user_id": body.user_id}),
+        ex=_RESULT_TTL,
+    )
+
+    automation_analyze_task.delay(
+        task_id, body.user_jwt, body.user_id, body.tenant_id, body.prompt
+    )
+    logger.info("automation_analyze_enqueued", task_id=task_id, tenant_id=body.tenant_id)
+    return {"task_id": task_id}
+
+
+@router.get("/status/{task_id}")
+async def get_status(
+    task_id: str,
+    tenant_id: str = Query(...),
+    _: None = Depends(_verify_internal_token),
+):
+    """Get automation task status."""
+    r = _get_redis()
+    raw = r.get(f"automation:{task_id}")
+    if raw is None:
+        raise HTTPException(
+            status_code=404,
+            detail=json.dumps({"error": "Task not found", "code": "not_found"}),
+        )
+
+    data = json.loads(raw)
+    stored_tenant = data.get("tenant_id")
+    if stored_tenant and stored_tenant != tenant_id:
+        raise HTTPException(
+            status_code=403,
+            detail=json.dumps({"error": "Access denied", "code": "forbidden"}),
+        )
+
+    # Strip internal keys
+    return {k: v for k, v in data.items() if not k.startswith("_")}
+
+
+@router.post("/execute")
+async def execute(
+    body: ExecuteRequest,
+    _: None = Depends(_verify_internal_token),
+):
+    """Generate and execute automation scripts."""
+    from app.tasks.automation_copilot_task import automation_execute_task
+
+    automation_execute_task.delay(
+        body.task_id,
+        body.execution_id,
+        body.user_jwt,
+        body.user_id,
+        body.tenant_id,
+        body.intent_json,
+        body.vision_model,
+        body.allowed_domains,
+    )
+    logger.info("automation_execute_enqueued", task_id=body.task_id, tenant_id=body.tenant_id)
+    return {"ok": True}
+
+
+@router.post("/cancel/{task_id}")
+async def cancel(
+    task_id: str,
+    body: CancelRequest,
+    _: None = Depends(_verify_internal_token),
+):
+    """Cancel a running automation task."""
+    r = _get_redis()
+
+    # Verify task exists and tenant matches
+    raw = r.get(f"automation:{task_id}")
+    if raw is None:
+        raise HTTPException(
+            status_code=404,
+            detail=json.dumps({"error": "Task not found", "code": "not_found"}),
+        )
+
+    data = json.loads(raw)
+    stored_tenant = data.get("tenant_id")
+    if stored_tenant and stored_tenant != body.tenant_id:
+        raise HTTPException(
+            status_code=403,
+            detail=json.dumps({"error": "Access denied", "code": "forbidden"}),
+        )
+
+    r.set(f"automation:{task_id}:cancel", "1", ex=_RESULT_TTL)
+    logger.info("automation_cancelled", task_id=task_id, tenant_id=body.tenant_id)
+    return {"cancelled": True}
+
+
+@router.get("/templates")
+async def list_templates(
+    tenant_id: str = Query(...),
+    limit: int = Query(default=20, le=100, ge=1),
+    cursor: str | None = Query(default=None),
+    _: None = Depends(_verify_internal_token),
+):
+    """List automation templates for a tenant.
+
+    Uses timestamp cursor pagination.
+    Templates DB table is implemented in section 12.
+    For now, returns an empty list (placeholder until DB table exists).
+    """
+    # TODO: Query automation_templates table when section 12 is implemented
+    return {"templates": [], "next_cursor": None}
diff --git a/python-backend/tests/integration/test_automation_copilot_api.py b/python-backend/tests/integration/test_automation_copilot_api.py
new file mode 100644
index 0000000..ae56c60
--- /dev/null
+++ b/python-backend/tests/integration/test_automation_copilot_api.py
@@ -0,0 +1,166 @@
+"""Integration tests for Automation Copilot FastAPI endpoints."""
+
+import json
+from unittest.mock import MagicMock, patch
+
+import pytest
+from fastapi import FastAPI
+from fastapi.testclient import TestClient
+
+from app.api.automation_copilot import router
+
+VALID_TOKEN = "test-internal-token-abc"
+ENDPOINT_PREFIX = "/api/v1/automation-copilot"
+
+
+@pytest.fixture
+def app():
+    app = FastAPI()
+    app.include_router(router, prefix=ENDPOINT_PREFIX)
+    return app
+
+
+@pytest.fixture
+def mock_redis():
+    r = MagicMock()
+    store = {}
+
+    def set_side_effect(key, value, **kwargs):
+        store[key] = value
+
+    def get_side_effect(key):
+        return store.get(key)
+
+    r.set = MagicMock(side_effect=set_side_effect)
+    r.get = MagicMock(side_effect=get_side_effect)
+    r._store = store
+    return r
+
+
+@pytest.fixture
+def client(app, mock_redis):
+    with patch("app.api.automation_copilot.settings") as mock_settings:
+        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
+        mock_settings.SMARTSPEC_WEB_GATEWAY_TOKEN = None
+        mock_settings.CELERY_BROKER_URL = "redis://localhost:6379/0"
+        with patch("app.api.automation_copilot._get_redis", return_value=mock_redis):
+            yield TestClient(app)
+
+
+@pytest.fixture
+def internal_headers():
+    return {"X-Internal-Token": VALID_TOKEN}
+
+
+class TestAnalyzeEndpoint:
+    def test_returns_401_without_internal_token(self, client):
+        resp = client.post(f"{ENDPOINT_PREFIX}/analyze", json={
+            "prompt": "click submit",
+            "tenant_id": "t1",
+            "user_id": 1,
+            "user_jwt": "jwt",
+        })
+        assert resp.status_code == 401
+
+    def test_returns_403_if_feature_flag_disabled(self, client, internal_headers, mock_redis):
+        mock_redis._store["feature_flag:automationCopilot:t1"] = "0"
+        resp = client.post(
+            f"{ENDPOINT_PREFIX}/analyze",
+            json={"prompt": "test", "tenant_id": "t1", "user_id": 1, "user_jwt": "jwt"},
+            headers=internal_headers,
+        )
+        assert resp.status_code == 403
+
+    def test_returns_200_and_enqueues_task(self, client, internal_headers):
+        with patch("app.tasks.automation_copilot_task.automation_analyze_task") as mock_task:
+            mock_task.delay = MagicMock()
+            resp = client.post(
+                f"{ENDPOINT_PREFIX}/analyze",
+                json={"prompt": "click submit", "tenant_id": "t1", "user_id": 1, "user_jwt": "jwt"},
+                headers=internal_headers,
+            )
+        assert resp.status_code == 200
+        data = resp.json()
+        assert "task_id" in data
+        assert data["task_id"].startswith("auto-")
+        mock_task.delay.assert_called_once()
+
+
+class TestStatusEndpoint:
+    def test_returns_404_for_unknown_task_id(self, client, internal_headers):
+        resp = client.get(
+            f"{ENDPOINT_PREFIX}/status/unknown-task?tenant_id=t1",
+            headers=internal_headers,
+        )
+        assert resp.status_code == 404
+
+    def test_returns_403_if_tenant_id_mismatch(self, client, internal_headers, mock_redis):
+        mock_redis._store["automation:task-1"] = json.dumps({"status": "running", "tenant_id": "t1"})
+        resp = client.get(
+            f"{ENDPOINT_PREFIX}/status/task-1?tenant_id=t2",
+            headers=internal_headers,
+        )
+        assert resp.status_code == 403
+
+    def test_returns_current_status_from_redis(self, client, internal_headers, mock_redis):
+        mock_redis._store["automation:task-1"] = json.dumps({
+            "status": "success",
+            "tenant_id": "t1",
+            "actual_credits_used": 5,
+        })
+        resp = client.get(
+            f"{ENDPOINT_PREFIX}/status/task-1?tenant_id=t1",
+            headers=internal_headers,
+        )
+        assert resp.status_code == 200
+        data = resp.json()
+        assert data["status"] == "success"
+        assert data["actual_credits_used"] == 5
+
+
+class TestExecuteEndpoint:
+    def test_returns_200_and_enqueues_execution_task(self, client, internal_headers):
+        with patch("app.tasks.automation_copilot_task.automation_execute_task") as mock_task:
+            mock_task.delay = MagicMock()
+            resp = client.post(
+                f"{ENDPOINT_PREFIX}/execute",
+                json={
+                    "task_id": "task-1",
+                    "execution_id": "exec-1",
+                    "intent_json": "{}",
+                    "user_jwt": "jwt",
+                    "tenant_id": "t1",
+                    "user_id": 1,
+                    "vision_model": "gpt-4o",
+                    "allowed_domains": ["example.com"],
+                },
+                headers=internal_headers,
+            )
+        assert resp.status_code == 200
+        assert resp.json() == {"ok": True}
+        mock_task.delay.assert_called_once()
+
+
+class TestCancelEndpoint:
+    def test_sets_redis_cancel_key_with_ttl(self, client, internal_headers, mock_redis):
+        mock_redis._store["automation:task-1"] = json.dumps({"status": "running", "tenant_id": "t1"})
+        resp = client.post(
+            f"{ENDPOINT_PREFIX}/cancel/task-1",
+            json={"tenant_id": "t1"},
+            headers=internal_headers,
+        )
+        assert resp.status_code == 200
+        assert resp.json() == {"cancelled": True}
+        assert mock_redis._store.get("automation:task-1:cancel") == "1"
+
+
+class TestTemplatesEndpoint:
+    def test_returns_empty_list_placeholder(self, client, internal_headers):
+        resp = client.get(
+            f"{ENDPOINT_PREFIX}/templates?tenant_id=t1",
+            headers=internal_headers,
+        )
+        assert resp.status_code == 200
+        data = resp.json()
+        assert data["templates"] == []
+        assert data["next_cursor"] is None
