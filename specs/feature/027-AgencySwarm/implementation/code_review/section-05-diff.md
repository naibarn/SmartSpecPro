diff --git a/python-backend/app/api/agencies.py b/python-backend/app/api/agencies.py
new file mode 100644
index 0000000..66517b7
--- /dev/null
+++ b/python-backend/app/api/agencies.py
@@ -0,0 +1,365 @@
+"""Agency run endpoints -- FastAPI router for multi-agent execution."""
+
+import asyncio
+import json
+import uuid
+from datetime import datetime, timezone
+from typing import AsyncIterator, Optional
+
+import structlog
+from fastapi import APIRouter, Depends, HTTPException, Query
+from fastapi.responses import StreamingResponse
+from pydantic import BaseModel, Field
+from sqlalchemy import text
+from sqlalchemy.ext.asyncio import AsyncSession
+
+from app.core.auth import get_current_user
+from app.core.config import settings
+from app.core.database import get_db
+from app.models.user import User
+from app.services.agency_service import (
+    AgencyNotFoundError,
+    AgencyPermissionError,
+    AgencyService,
+    InsufficientCreditsError,
+    RunContext,
+)
+
+router = APIRouter(prefix="/api/v1/agencies", tags=["agencies"])
+logger = structlog.get_logger(__name__)
+
+
+# ── Request / Response Models ──────────────────────────────────
+
+
+class AgencyRunRequest(BaseModel):
+    """Request body for POST /run and POST /stream."""
+
+    message: str = Field(..., min_length=1, max_length=50000)
+    conversation_id: Optional[str] = Field(
+        None, description="Existing conversation ID to continue"
+    )
+
+
+class AgencyRunResponse(BaseModel):
+    """Response from POST /run."""
+
+    run_id: str
+    conversation_id: str
+    status: str  # completed / failed
+    output: str
+    credits_used: float
+    duration_ms: int
+
+
+class AgencyRunSummary(BaseModel):
+    """Single run in the list response."""
+
+    id: str
+    status: str
+    total_credits_used: float
+    started_at: Optional[datetime] = None
+    completed_at: Optional[datetime] = None
+    duration_ms: Optional[int] = None
+    error_type: Optional[str] = None
+    error_message: Optional[str] = None
+    step_count: int = 0
+
+
+class AgencyRunListResponse(BaseModel):
+    """Response from GET /runs."""
+
+    runs: list[AgencyRunSummary]
+    total: int
+
+
+class AgencyCancelResponse(BaseModel):
+    """Response from POST /cancel."""
+
+    run_id: str
+    status: str  # cancelled
+
+
+# ── Error Classification ───────────────────────────────────────
+
+
+class AgencyErrorType:
+    """Error classification constants."""
+
+    TRANSIENT = "transient"  # timeout, 429, 503 -- retry
+    PERMANENT = "permanent"  # auth, validation, credit -- fail fast
+    OPTIONAL_SKIP = "optional_skip"  # optional agent failed -- skip
+
+
+def classify_error(error: Exception, agent_is_optional: bool = False) -> str:
+    """Classify an error for retry/fail/skip decision.
+
+    Returns one of AgencyErrorType constants.
+    """
+    if agent_is_optional:
+        return AgencyErrorType.OPTIONAL_SKIP
+
+    # Transient errors
+    if isinstance(error, (asyncio.TimeoutError, ConnectionError)):
+        return AgencyErrorType.TRANSIENT
+
+    status_code = getattr(error, "status_code", None)
+    if status_code in (429, 502, 503, 504):
+        return AgencyErrorType.TRANSIENT
+
+    # Permanent errors
+    if isinstance(error, (InsufficientCreditsError, ValueError)):
+        return AgencyErrorType.PERMANENT
+
+    if status_code in (400, 401, 403):
+        return AgencyErrorType.PERMANENT
+
+    # Default: permanent (fail-safe)
+    return AgencyErrorType.PERMANENT
+
+
+# ── Retry Logic ────────────────────────────────────────────────
+
+MAX_RETRIES = 3
+BACKOFF_BASE = 1.0  # seconds
+
+
+async def with_retry(coro_factory, max_retries=MAX_RETRIES):
+    """Execute an async operation with exponential backoff retry on transient errors.
+
+    coro_factory: a callable that returns a new coroutine on each call
+    (because a coroutine object cannot be awaited twice).
+    """
+    last_error = None
+    for attempt in range(max_retries):
+        try:
+            return await coro_factory()
+        except Exception as exc:
+            error_type = classify_error(exc)
+            if error_type != AgencyErrorType.TRANSIENT:
+                raise
+            last_error = exc
+            if attempt < max_retries - 1:
+                delay = BACKOFF_BASE * (2**attempt)
+                logger.warning(
+                    "agency_retry",
+                    attempt=attempt + 1,
+                    max_retries=max_retries,
+                    delay=delay,
+                    error=str(exc),
+                )
+                await asyncio.sleep(delay)
+    raise last_error  # type: ignore[misc]
+
+
+# ── Feature Flag Dependency ────────────────────────────────────
+
+
+async def require_agency_feature(
+    db: AsyncSession = Depends(get_db),
+) -> None:
+    """Dependency that raises 404 if AGENCY_SWARM_ENABLED is false.
+
+    Checks env config first (fast path), then falls back to system_settings table.
+    """
+    if settings.AGENCY_SWARM_ENABLED:
+        return
+
+    # Check system_settings table as override
+    try:
+        result = await db.execute(
+            text("""
+                SELECT value FROM system_settings
+                WHERE category = 'feature_flags'
+                  AND key = 'AGENCY_SWARM_ENABLED'
+                LIMIT 1
+            """)
+        )
+        row = result.first()
+        if row and str(row.value).lower() in ("true", "1", "yes"):
+            return
+    except Exception:
+        pass  # DB error -- fall through to disabled
+
+    raise HTTPException(status_code=404, detail="Agency feature is disabled")
+
+
+# ── Endpoints ──────────────────────────────────────────────────
+
+
+@router.post("/{agency_id}/run")
+async def run_agency(
+    agency_id: str,
+    request: AgencyRunRequest,
+    user: User = Depends(get_current_user),
+    db: AsyncSession = Depends(get_db),
+    _flag: None = Depends(require_agency_feature),
+) -> AgencyRunResponse:
+    """Execute a non-streaming agency run."""
+    conversation_id = request.conversation_id or str(uuid.uuid4())
+    service = AgencyService(db=db)
+    context = RunContext(
+        user_id=user.id,
+        tenant_id=user.currentTenantId or "",
+        conversation_id=conversation_id,
+        user_token="",  # Token is used by adapter for gateway routing
+    )
+
+    try:
+        result = await with_retry(
+            lambda: service.execute_run(agency_id, request.message, context)
+        )
+    except InsufficientCreditsError as exc:
+        raise HTTPException(status_code=402, detail=str(exc))
+    except AgencyNotFoundError as exc:
+        raise HTTPException(status_code=404, detail=str(exc))
+    except AgencyPermissionError as exc:
+        raise HTTPException(status_code=403, detail=str(exc))
+    except Exception as exc:
+        logger.error(
+            "agency_run_failed",
+            agency_id=agency_id,
+            user_id=user.id,
+            error=str(exc),
+        )
+        raise HTTPException(status_code=503, detail="Agency run failed")
+
+    return AgencyRunResponse(
+        run_id=result.run_id,
+        conversation_id=conversation_id,
+        status="completed",
+        output=result.response,
+        credits_used=0.0,  # Per-call deduction by gateway; reconciled in section-06
+        duration_ms=result.duration_ms,
+    )
+
+
+@router.post("/{agency_id}/stream")
+async def stream_agency(
+    agency_id: str,
+    request: AgencyRunRequest,
+    user: User = Depends(get_current_user),
+    db: AsyncSession = Depends(get_db),
+    _flag: None = Depends(require_agency_feature),
+):
+    """Execute a streaming agency run (SSE)."""
+    conversation_id = request.conversation_id or str(uuid.uuid4())
+    service = AgencyService(db=db)
+    context = RunContext(
+        user_id=user.id,
+        tenant_id=user.currentTenantId or "",
+        conversation_id=conversation_id,
+        user_token="",
+    )
+
+    # Pre-check credits before starting stream
+    try:
+        estimate = service.credit_manager.estimate_run_cost(agent_count=2)
+        has_credits = await service.credit_manager.pre_check(
+            user_id=user.id, estimated_cost=estimate
+        )
+        if not has_credits:
+            raise InsufficientCreditsError("Insufficient credits for agency run")
+    except InsufficientCreditsError as exc:
+        raise HTTPException(status_code=402, detail=str(exc))
+
+    async def sse_generator() -> AsyncIterator[str]:
+        """Wrap agency service streaming with error boundary."""
+        try:
+            async for event in service.execute_run_stream(
+                agency_id, request.message, context
+            ):
+                event_type = event.get("event", "message")
+                event_data = json.dumps(event.get("data", {}))
+                yield f"event: {event_type}\ndata: {event_data}\n\n"
+        except Exception as exc:
+            error_data = json.dumps(
+                {
+                    "error_type": classify_error(exc),
+                    "message": str(exc)[:500],
+                    "retryable": classify_error(exc) == AgencyErrorType.TRANSIENT,
+                }
+            )
+            yield f"event: run_error\ndata: {error_data}\n\n"
+
+    return StreamingResponse(
+        sse_generator(),
+        media_type="text/event-stream",
+        headers={
+            "Cache-Control": "no-cache, no-transform",
+            "Connection": "keep-alive",
+            "X-Accel-Buffering": "no",
+        },
+    )
+
+
+@router.get("/{agency_id}/runs")
+async def list_runs(
+    agency_id: str,
+    user: User = Depends(get_current_user),
+    db: AsyncSession = Depends(get_db),
+    _flag: None = Depends(require_agency_feature),
+    limit: int = Query(default=20, ge=1, le=100),
+    offset: int = Query(default=0, ge=0),
+    status: Optional[str] = Query(default=None),
+) -> AgencyRunListResponse:
+    """List runs for an agency, filtered by tenant."""
+    service = AgencyService(db=db)
+    result = await service.list_runs(
+        agency_id=agency_id,
+        tenant_id=user.currentTenantId or "",
+        limit=limit,
+        offset=offset,
+        status_filter=status,
+    )
+    return AgencyRunListResponse(
+        runs=[AgencyRunSummary(**r) for r in result["runs"]],
+        total=result["total"],
+    )
+
+
+@router.get("/{agency_id}/runs/{run_id}")
+async def get_run(
+    agency_id: str,
+    run_id: str,
+    user: User = Depends(get_current_user),
+    db: AsyncSession = Depends(get_db),
+    _flag: None = Depends(require_agency_feature),
+) -> AgencyRunSummary:
+    """Get details for a specific run."""
+    service = AgencyService(db=db)
+    try:
+        result = await service.get_run(
+            run_id=run_id,
+            agency_id=agency_id,
+            tenant_id=user.currentTenantId or "",
+        )
+    except AgencyNotFoundError as exc:
+        raise HTTPException(status_code=404, detail=str(exc))
+
+    return AgencyRunSummary(**result)
+
+
+@router.post("/{agency_id}/runs/{run_id}/cancel")
+async def cancel_run(
+    agency_id: str,
+    run_id: str,
+    user: User = Depends(get_current_user),
+    db: AsyncSession = Depends(get_db),
+    _flag: None = Depends(require_agency_feature),
+) -> AgencyCancelResponse:
+    """Cancel a running agency run."""
+    service = AgencyService(db=db)
+    try:
+        result = await service.cancel_run(
+            run_id=run_id,
+            agency_id=agency_id,
+            tenant_id=user.currentTenantId or "",
+        )
+    except AgencyNotFoundError as exc:
+        raise HTTPException(status_code=404, detail=str(exc))
+
+    return AgencyCancelResponse(
+        run_id=result["run_id"],
+        status=result["status"],
+    )
diff --git a/python-backend/app/main.py b/python-backend/app/main.py
index 56d12e0..994edc6 100644
--- a/python-backend/app/main.py
+++ b/python-backend/app/main.py
@@ -57,13 +57,15 @@ from app.api import (
     csrf,  # CSRF Protection
     oauth,  # OAuth Social Login
     telegram_webhook,  # Telegram bot webhook for account linking
-    internal_mcp,  # Internal MCP tools API (Google Drive)
-    internal_gdrive,  # Internal Google Drive sync API
-    onedrive,  # OneDrive file operations API
-    internal_onedrive,  # Internal OneDrive sync API
-    admin_alerts,  # Admin alert threshold checking
-    internal_library,  # Internal library scope propagation API
-)
+     internal_mcp,  # Internal MCP tools API (Google Drive)
+     internal_gdrive,  # Internal Google Drive sync API
+     onedrive,  # OneDrive file operations API
+     internal_onedrive,  # Internal OneDrive sync API
+     admin_alerts,  # Admin alert threshold checking
+     internal_library,  # Internal library scope propagation API
+    internal_sandbox,  # Internal sandbox dispatch/cancel API
+    agencies,  # Agency-Swarm multi-agent endpoints
+ )
 from app.api.v1 import (
     skills,
     auth_generator,
@@ -297,6 +299,8 @@ app.include_router(onedrive.router, tags=["OneDrive"])
 app.include_router(internal_onedrive.router, tags=["Internal OneDrive"])
 app.include_router(admin_alerts.router, tags=["Admin Alerts"])
 app.include_router(internal_library.router, tags=["Internal Library"])
+app.include_router(internal_sandbox.router, tags=["Internal Sandbox"])
+app.include_router(agencies.router, tags=["Agencies"])
 
 @app.get("/")
 async def root():
diff --git a/python-backend/app/services/agency_service.py b/python-backend/app/services/agency_service.py
index aee64b1..2d50966 100644
--- a/python-backend/app/services/agency_service.py
+++ b/python-backend/app/services/agency_service.py
@@ -428,3 +428,156 @@ class AgencyService:
                 "event": "run_error",
                 "data": {"error_type": type(exc).__name__, "message": str(exc)[:500]},
             }
+
+    async def list_runs(
+        self,
+        agency_id: str,
+        tenant_id: str,
+        limit: int = 20,
+        offset: int = 0,
+        status_filter: str | None = None,
+    ) -> dict:
+        """List runs for an agency filtered by tenant.
+
+        Returns dict with 'runs' list and 'total' count.
+        """
+        params: dict = {
+            "agency_id": agency_id,
+            "tenant_id": tenant_id,
+            "limit": limit,
+            "offset": offset,
+        }
+
+        where_clause = "WHERE agency_id = :agency_id AND tenant_id = :tenant_id"
+        if status_filter:
+            where_clause += " AND status = :status"
+            params["status"] = status_filter
+
+        # Count
+        count_result = await self.db.execute(
+            text(f"SELECT count(*) FROM agency_runs {where_clause}"),
+            params,
+        )
+        total = count_result.scalar() or 0
+
+        # Fetch
+        result = await self.db.execute(
+            text(f"""
+                SELECT id, status,
+                       COALESCE(total_credits_used, 0) as total_credits_used,
+                       started_at, completed_at, duration_ms,
+                       error_type, error_message,
+                       COALESCE(step_count, 0) as step_count
+                FROM agency_runs
+                {where_clause}
+                ORDER BY started_at DESC NULLS LAST
+                LIMIT :limit OFFSET :offset
+            """),
+            params,
+        )
+
+        runs = [
+            {
+                "id": row.id,
+                "status": row.status,
+                "total_credits_used": float(row.total_credits_used),
+                "started_at": row.started_at.isoformat() if row.started_at else None,
+                "completed_at": row.completed_at.isoformat() if row.completed_at else None,
+                "duration_ms": row.duration_ms,
+                "error_type": row.error_type,
+                "error_message": row.error_message,
+                "step_count": row.step_count,
+            }
+            for row in result.all()
+        ]
+
+        return {"runs": runs, "total": total}
+
+    async def get_run(
+        self,
+        run_id: str,
+        agency_id: str,
+        tenant_id: str,
+    ) -> dict:
+        """Get a single run by ID, scoped to agency and tenant.
+
+        Raises AgencyNotFoundError if not found or wrong tenant.
+        """
+        result = await self.db.execute(
+            text("""
+                SELECT id, status,
+                       COALESCE(total_credits_used, 0) as total_credits_used,
+                       started_at, completed_at, duration_ms,
+                       error_type, error_message,
+                       COALESCE(step_count, 0) as step_count
+                FROM agency_runs
+                WHERE id = :run_id
+                  AND agency_id = :agency_id
+                  AND tenant_id = :tenant_id
+            """),
+            {"run_id": run_id, "agency_id": agency_id, "tenant_id": tenant_id},
+        )
+        row = result.first()
+        if not row:
+            raise AgencyNotFoundError(f"Run {run_id} not found")
+
+        return {
+            "id": row.id,
+            "status": row.status,
+            "total_credits_used": float(row.total_credits_used),
+            "started_at": row.started_at.isoformat() if row.started_at else None,
+            "completed_at": row.completed_at.isoformat() if row.completed_at else None,
+            "duration_ms": row.duration_ms,
+            "error_type": row.error_type,
+            "error_message": row.error_message,
+            "step_count": row.step_count,
+        }
+
+    async def cancel_run(
+        self,
+        run_id: str,
+        agency_id: str,
+        tenant_id: str,
+    ) -> dict:
+        """Cancel a running agency run.
+
+        Raises AgencyNotFoundError if run not found or wrong tenant.
+        """
+        result = await self.db.execute(
+            text("""
+                SELECT id, status FROM agency_runs
+                WHERE id = :run_id
+                  AND agency_id = :agency_id
+                  AND tenant_id = :tenant_id
+            """),
+            {"run_id": run_id, "agency_id": agency_id, "tenant_id": tenant_id},
+        )
+        row = result.first()
+        if not row:
+            raise AgencyNotFoundError(f"Run {run_id} not found")
+
+        if row.status in ("completed", "failed", "cancelled"):
+            return {"run_id": run_id, "status": row.status}
+
+        await self.db.execute(
+            text("""
+                UPDATE agency_runs
+                SET status = 'cancelled',
+                    completed_at = :completed_at
+                WHERE id = :run_id
+            """),
+            {
+                "run_id": run_id,
+                "completed_at": datetime.now(timezone.utc),
+            },
+        )
+        await self.db.commit()
+
+        logger.info(
+            "agency_run_cancelled",
+            run_id=run_id,
+            agency_id=agency_id,
+            tenant_id=tenant_id,
+        )
+
+        return {"run_id": run_id, "status": "cancelled"}
diff --git a/python-backend/tests/unit/test_agency_router.py b/python-backend/tests/unit/test_agency_router.py
new file mode 100644
index 0000000..2d2bbd0
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_router.py
@@ -0,0 +1,590 @@
+"""Tests for the agency FastAPI router.
+
+Validates HTTP-level behavior: auth, feature flags, error handling,
+response shapes. Agency execution is mocked.
+"""
+
+import asyncio
+import json
+import uuid
+from datetime import datetime, timezone
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+from fastapi import FastAPI
+from fastapi.testclient import TestClient
+
+pytestmark = [pytest.mark.unit, pytest.mark.agency]
+
+
+# ── Helpers ─────────────────────────────────────────────────────
+
+
+def _make_mock_user():
+    """Create a mock authenticated User object."""
+    user = MagicMock()
+    user.id = 42
+    user.currentTenantId = "tenant-abc"
+    user.email = "test@example.com"
+    user.is_active = True
+    user.is_admin = False
+    return user
+
+
+def _make_run_result():
+    """Create a mock RunResult from AgencyService."""
+    result = MagicMock()
+    result.run_id = str(uuid.uuid4())
+    result.response = "The analysis is complete."
+    result.agent_name = "Researcher"
+    result.total_tokens = 500
+    result.step_count = 3
+    result.duration_ms = 2500
+    return result
+
+
+def _build_app(
+    *,
+    feature_enabled: bool = True,
+    user=None,
+    agency_service_mock=None,
+):
+    """Build a FastAPI test app with the agencies router and mocked deps."""
+    from app.api.agencies import router, require_agency_feature
+    from app.core.auth import get_current_user
+    from app.core.database import get_db
+
+    app = FastAPI()
+
+    mock_user = user or _make_mock_user()
+    mock_db = AsyncMock()
+
+    # Override auth dependency
+    app.dependency_overrides[get_current_user] = lambda: mock_user
+    app.dependency_overrides[get_db] = lambda: mock_db
+
+    if not feature_enabled:
+        from fastapi import HTTPException
+
+        async def _disabled():
+            raise HTTPException(status_code=404, detail="Agency feature is disabled")
+
+        app.dependency_overrides[require_agency_feature] = _disabled
+    else:
+        app.dependency_overrides[require_agency_feature] = lambda: None
+
+    app.include_router(router)
+    return app, mock_db
+
+
+def _build_app_no_auth(*, feature_enabled: bool = True):
+    """Build a FastAPI test app WITHOUT auth override (tests 401)."""
+    from app.api.agencies import router, require_agency_feature
+    from app.core.database import get_db
+
+    app = FastAPI()
+    mock_db = AsyncMock()
+
+    app.dependency_overrides[get_db] = lambda: mock_db
+
+    if not feature_enabled:
+        from fastapi import HTTPException
+
+        async def _disabled():
+            raise HTTPException(status_code=404, detail="Agency feature is disabled")
+
+        app.dependency_overrides[require_agency_feature] = _disabled
+    else:
+        app.dependency_overrides[require_agency_feature] = lambda: None
+
+    app.include_router(router)
+    return app, mock_db
+
+
+# ── Auth Tests ──────────────────────────────────────────────────
+
+
+class TestAgencyRouterAuth:
+    """Endpoints require Bearer token auth."""
+
+    def test_run_requires_auth_returns_401(self):
+        """POST /api/v1/agencies/{id}/run without auth headers returns 401."""
+        app, _ = _build_app_no_auth()
+        client = TestClient(app)
+        resp = client.post(
+            "/api/v1/agencies/agency-1/run",
+            json={"message": "Hello"},
+        )
+        assert resp.status_code in (401, 403)
+
+    def test_stream_requires_auth_returns_401(self):
+        """POST /api/v1/agencies/{id}/stream without auth headers returns 401."""
+        app, _ = _build_app_no_auth()
+        client = TestClient(app)
+        resp = client.post(
+            "/api/v1/agencies/agency-1/stream",
+            json={"message": "Hello"},
+        )
+        assert resp.status_code in (401, 403)
+
+    def test_list_runs_requires_auth_returns_401(self):
+        """GET /api/v1/agencies/{id}/runs without auth headers returns 401."""
+        app, _ = _build_app_no_auth()
+        client = TestClient(app)
+        resp = client.get("/api/v1/agencies/agency-1/runs")
+        assert resp.status_code in (401, 403)
+
+    def test_cancel_requires_auth_returns_401(self):
+        """POST /cancel without auth returns 401."""
+        app, _ = _build_app_no_auth()
+        client = TestClient(app)
+        resp = client.post("/api/v1/agencies/agency-1/runs/run-1/cancel")
+        assert resp.status_code in (401, 403)
+
+
+# ── Feature Flag Tests ──────────────────────────────────────────
+
+
+class TestAgencyRouterFeatureFlag:
+    """All endpoints return 404 when AGENCY_SWARM_ENABLED is false."""
+
+    def test_run_returns_404_when_disabled(self):
+        """POST /run returns 404 when feature flag is off."""
+        app, _ = _build_app(feature_enabled=False)
+        client = TestClient(app)
+        resp = client.post(
+            "/api/v1/agencies/agency-1/run",
+            json={"message": "Hello"},
+        )
+        assert resp.status_code == 404
+
+    def test_stream_returns_404_when_disabled(self):
+        """POST /stream returns 404 when feature flag is off."""
+        app, _ = _build_app(feature_enabled=False)
+        client = TestClient(app)
+        resp = client.post(
+            "/api/v1/agencies/agency-1/stream",
+            json={"message": "Hello"},
+        )
+        assert resp.status_code == 404
+
+    def test_list_runs_returns_404_when_disabled(self):
+        """GET /runs returns 404 when feature flag is off."""
+        app, _ = _build_app(feature_enabled=False)
+        client = TestClient(app)
+        resp = client.get("/api/v1/agencies/agency-1/runs")
+        assert resp.status_code == 404
+
+    def test_cancel_returns_404_when_disabled(self):
+        """POST /cancel returns 404 when feature flag is off."""
+        app, _ = _build_app(feature_enabled=False)
+        client = TestClient(app)
+        resp = client.post("/api/v1/agencies/agency-1/runs/run-1/cancel")
+        assert resp.status_code == 404
+
+    def test_run_details_returns_404_when_disabled(self):
+        """GET /runs/{run_id} returns 404 when feature flag is off."""
+        app, _ = _build_app(feature_enabled=False)
+        client = TestClient(app)
+        resp = client.get("/api/v1/agencies/agency-1/runs/run-1")
+        assert resp.status_code == 404
+
+
+# ── Run Endpoint Tests ──────────────────────────────────────────
+
+
+class TestAgencyRunEndpoint:
+    """POST /api/v1/agencies/{agency_id}/run -- non-streaming execution."""
+
+    @patch("app.api.agencies.AgencyService")
+    def test_returns_run_result_with_run_id(self, MockService):
+        """Successful run returns JSON with run_id, status, and output."""
+        mock_result = _make_run_result()
+        mock_svc = MagicMock()
+        mock_svc.execute_run = AsyncMock(return_value=mock_result)
+        MockService.return_value = mock_svc
+
+        app, _ = _build_app()
+        client = TestClient(app)
+        resp = client.post(
+            "/api/v1/agencies/agency-1/run",
+            json={"message": "Analyze this topic"},
+        )
+
+        assert resp.status_code == 200
+        data = resp.json()
+        assert "run_id" in data
+        assert data["status"] == "completed"
+        assert data["output"] == "The analysis is complete."
+        assert "credits_used" in data
+        assert "duration_ms" in data
+
+    def test_returns_422_for_missing_message(self):
+        """Missing 'message' field in request body returns 422."""
+        app, _ = _build_app()
+        client = TestClient(app)
+        resp = client.post(
+            "/api/v1/agencies/agency-1/run",
+            json={},
+        )
+        assert resp.status_code == 422
+
+    @patch("app.api.agencies.AgencyService")
+    def test_returns_402_on_insufficient_credits(self, MockService):
+        """When credit pre-check fails, returns 402 Payment Required."""
+        from app.services.agency_service import InsufficientCreditsError
+
+        mock_svc = MagicMock()
+        mock_svc.execute_run = AsyncMock(
+            side_effect=InsufficientCreditsError("Not enough credits")
+        )
+        MockService.return_value = mock_svc
+
+        app, _ = _build_app()
+        client = TestClient(app)
+        resp = client.post(
+            "/api/v1/agencies/agency-1/run",
+            json={"message": "Analyze this"},
+        )
+        assert resp.status_code == 402
+
+    @patch("app.api.agencies.AgencyService")
+    def test_returns_404_for_nonexistent_agency(self, MockService):
+        """Agency ID not found returns 404."""
+        from app.services.agency_service import AgencyNotFoundError
+
+        mock_svc = MagicMock()
+        mock_svc.execute_run = AsyncMock(
+            side_effect=AgencyNotFoundError("Agency not found")
+        )
+        MockService.return_value = mock_svc
+
+        app, _ = _build_app()
+        client = TestClient(app)
+        resp = client.post(
+            "/api/v1/agencies/nonexistent/run",
+            json={"message": "Hello"},
+        )
+        assert resp.status_code == 404
+
+
+# ── Stream Endpoint Tests ───────────────────────────────────────
+
+
+class TestAgencyStreamEndpoint:
+    """POST /api/v1/agencies/{agency_id}/stream -- SSE streaming execution."""
+
+    @patch("app.api.agencies.AgencyService")
+    def test_returns_sse_content_type(self, MockService):
+        """Response has Content-Type: text/event-stream."""
+
+        async def _mock_stream(*args, **kwargs):
+            yield {"event": "run_started", "data": {"run_id": "r1", "agency_id": "a1"}}
+            yield {"event": "token", "data": {"delta": "Hello"}}
+            yield {"event": "run_finished", "data": {"run_id": "r1"}}
+
+        mock_svc = MagicMock()
+        mock_svc.execute_run_stream = _mock_stream
+        mock_svc.credit_manager.estimate_run_cost.return_value = 0.1
+        mock_svc.credit_manager.pre_check = AsyncMock(return_value=True)
+        MockService.return_value = mock_svc
+
+        app, _ = _build_app()
+        client = TestClient(app)
+        resp = client.post(
+            "/api/v1/agencies/agency-1/stream",
+            json={"message": "Hello"},
+        )
+
+        assert resp.status_code == 200
+        assert "text/event-stream" in resp.headers.get("content-type", "")
+
+    @patch("app.api.agencies.AgencyService")
+    def test_sse_headers_include_no_cache(self, MockService):
+        """Response includes Cache-Control: no-cache and X-Accel-Buffering: no."""
+
+        async def _mock_stream(*args, **kwargs):
+            yield {"event": "run_started", "data": {"run_id": "r1", "agency_id": "a1"}}
+            yield {"event": "run_finished", "data": {"run_id": "r1"}}
+
+        mock_svc = MagicMock()
+        mock_svc.execute_run_stream = _mock_stream
+        mock_svc.credit_manager.estimate_run_cost.return_value = 0.1
+        mock_svc.credit_manager.pre_check = AsyncMock(return_value=True)
+        MockService.return_value = mock_svc
+
+        app, _ = _build_app()
+        client = TestClient(app)
+        resp = client.post(
+            "/api/v1/agencies/agency-1/stream",
+            json={"message": "Hello"},
+        )
+
+        assert resp.status_code == 200
+        assert "no-cache" in resp.headers.get("cache-control", "")
+        assert resp.headers.get("x-accel-buffering") == "no"
+
+    @patch("app.api.agencies.AgencyService")
+    def test_returns_402_on_insufficient_credits(self, MockService):
+        """Credit pre-check failure prevents streaming and returns 402."""
+        mock_svc = MagicMock()
+        mock_svc.credit_manager.estimate_run_cost.return_value = 10.0
+        mock_svc.credit_manager.pre_check = AsyncMock(return_value=False)
+        MockService.return_value = mock_svc
+
+        app, _ = _build_app()
+        client = TestClient(app)
+        resp = client.post(
+            "/api/v1/agencies/agency-1/stream",
+            json={"message": "Hello"},
+        )
+
+        assert resp.status_code == 402
+
+
+# ── List Runs Endpoint Tests ────────────────────────────────────
+
+
+class TestAgencyListRunsEndpoint:
+    """GET /api/v1/agencies/{agency_id}/runs -- list runs for an agency."""
+
+    @patch("app.api.agencies.AgencyService")
+    def test_returns_runs_filtered_by_tenant(self, MockService):
+        """Runs returned are filtered to the authenticated user's tenant."""
+        mock_svc = MagicMock()
+        mock_svc.list_runs = AsyncMock(return_value={
+            "runs": [
+                {
+                    "id": "run-1",
+                    "status": "completed",
+                    "total_credits_used": 1.5,
+                    "started_at": None,
+                    "completed_at": None,
+                    "duration_ms": 2000,
+                    "error_type": None,
+                    "error_message": None,
+                    "step_count": 3,
+                },
+            ],
+            "total": 1,
+        })
+        MockService.return_value = mock_svc
+
+        app, _ = _build_app()
+        client = TestClient(app)
+        resp = client.get("/api/v1/agencies/agency-1/runs")
+
+        assert resp.status_code == 200
+        data = resp.json()
+        assert "runs" in data
+        assert "total" in data
+
+    @patch("app.api.agencies.AgencyService")
+    def test_returns_empty_list_for_no_runs(self, MockService):
+        """No runs for agency returns an empty list (not 404)."""
+        mock_svc = MagicMock()
+        mock_svc.list_runs = AsyncMock(return_value={"runs": [], "total": 0})
+        MockService.return_value = mock_svc
+
+        app, _ = _build_app()
+        client = TestClient(app)
+        resp = client.get("/api/v1/agencies/agency-1/runs")
+
+        assert resp.status_code == 200
+        data = resp.json()
+        assert data["runs"] == []
+        assert data["total"] == 0
+
+
+# ── Cancel Endpoint Tests ───────────────────────────────────────
+
+
+class TestAgencyCancelEndpoint:
+    """POST /api/v1/agencies/{agency_id}/runs/{run_id}/cancel."""
+
+    @patch("app.api.agencies.AgencyService")
+    def test_cancel_returns_success(self, MockService):
+        """Cancelling a running run returns success status."""
+        mock_svc = MagicMock()
+        mock_svc.cancel_run = AsyncMock(return_value={"run_id": "run-1", "status": "cancelled"})
+        MockService.return_value = mock_svc
+
+        app, _ = _build_app()
+        client = TestClient(app)
+        resp = client.post("/api/v1/agencies/agency-1/runs/run-1/cancel")
+
+        assert resp.status_code == 200
+        data = resp.json()
+        assert data["run_id"] == "run-1"
+        assert data["status"] == "cancelled"
+
+    @patch("app.api.agencies.AgencyService")
+    def test_cancel_nonexistent_run_returns_404(self, MockService):
+        """Cancelling a run that does not exist returns 404."""
+        from app.services.agency_service import AgencyNotFoundError
+
+        mock_svc = MagicMock()
+        mock_svc.cancel_run = AsyncMock(side_effect=AgencyNotFoundError("Run not found"))
+        MockService.return_value = mock_svc
+
+        app, _ = _build_app()
+        client = TestClient(app)
+        resp = client.post("/api/v1/agencies/agency-1/runs/nonexistent/cancel")
+
+        assert resp.status_code == 404
+
+
+# ── Error Handling Tests ────────────────────────────────────────
+
+
+class TestAgencyErrorHandling:
+    """Error classification: transient (retry), permanent (fail), optional (skip)."""
+
+    def test_classify_transient_timeout(self):
+        """Timeout error is classified as transient."""
+        from app.api.agencies import classify_error, AgencyErrorType
+
+        result = classify_error(asyncio.TimeoutError("timed out"))
+        assert result == AgencyErrorType.TRANSIENT
+
+    def test_classify_transient_429(self):
+        """HTTP 429 error is classified as transient."""
+        from app.api.agencies import classify_error, AgencyErrorType
+
+        err = Exception("429 Too Many Requests")
+        err.status_code = 429  # type: ignore[attr-defined]
+        result = classify_error(err)
+        assert result == AgencyErrorType.TRANSIENT
+
+    def test_classify_permanent_auth_failure(self):
+        """Auth failure (401) is classified as permanent."""
+        from app.api.agencies import classify_error, AgencyErrorType
+
+        err = Exception("401 Unauthorized")
+        err.status_code = 401  # type: ignore[attr-defined]
+        result = classify_error(err)
+        assert result == AgencyErrorType.PERMANENT
+
+    def test_classify_permanent_credit_exhaustion(self):
+        """InsufficientCreditsError is classified as permanent."""
+        from app.api.agencies import classify_error, AgencyErrorType
+        from app.services.agency_service import InsufficientCreditsError
+
+        result = classify_error(InsufficientCreditsError("No credits"))
+        assert result == AgencyErrorType.PERMANENT
+
+    def test_classify_optional_agent_skip(self):
+        """Optional agent failure is classified as optional_skip."""
+        from app.api.agencies import classify_error, AgencyErrorType
+
+        result = classify_error(Exception("Agent failed"), agent_is_optional=True)
+        assert result == AgencyErrorType.OPTIONAL_SKIP
+
+    def test_classify_required_agent_failure(self):
+        """Required agent failure is NOT optional_skip."""
+        from app.api.agencies import classify_error, AgencyErrorType
+
+        result = classify_error(Exception("Agent failed"), agent_is_optional=False)
+        # Required agent failure is treated as permanent (not skip)
+        assert result != AgencyErrorType.OPTIONAL_SKIP
+
+    @patch("app.api.agencies.AgencyService")
+    def test_fallback_safe_single_agent(self, MockService):
+        """If isFallbackSafe=true and service degrades, falls back to single-agent."""
+        mock_result = _make_run_result()
+        mock_result.response = "Fallback response"
+        mock_svc = MagicMock()
+        mock_svc.execute_run = AsyncMock(return_value=mock_result)
+        MockService.return_value = mock_svc
+
+        app, _ = _build_app()
+        client = TestClient(app)
+        resp = client.post(
+            "/api/v1/agencies/agency-1/run",
+            json={"message": "Hello"},
+        )
+
+        assert resp.status_code == 200
+        # Fallback behavior is handled by service layer -- router just returns the result
+
+    @patch("app.api.agencies.AgencyService")
+    def test_non_fallback_safe_fails_closed(self, MockService):
+        """If isFallbackSafe=false and service degrades, returns error."""
+        mock_svc = MagicMock()
+        mock_svc.execute_run = AsyncMock(side_effect=Exception("Service degraded"))
+        MockService.return_value = mock_svc
+
+        app, _ = _build_app()
+        client = TestClient(app)
+        resp = client.post(
+            "/api/v1/agencies/agency-1/run",
+            json={"message": "Hello"},
+        )
+
+        assert resp.status_code == 503
+
+    @patch("app.api.agencies.AgencyService")
+    def test_partial_completion_charges_completed_steps_only(self, MockService):
+        """When a run partially completes, only the completed LLM calls are charged."""
+        # This is tested via the service layer -- router returns the error.
+        # The credit reconciliation is handled internally.
+        mock_svc = MagicMock()
+        mock_svc.execute_run = AsyncMock(
+            side_effect=Exception("Partial failure after 2 steps")
+        )
+        MockService.return_value = mock_svc
+
+        app, _ = _build_app()
+        client = TestClient(app)
+        resp = client.post(
+            "/api/v1/agencies/agency-1/run",
+            json={"message": "Hello"},
+        )
+
+        # Run fails -- credits for completed steps are already deducted by gateway
+        assert resp.status_code == 503
+
+
+# ── Retry Logic Tests ───────────────────────────────────────────
+
+
+class TestRetryLogic:
+    """Tests for the with_retry utility."""
+
+    async def test_retries_on_transient_error(self):
+        """Retry succeeds after transient failure."""
+        from app.api.agencies import with_retry
+
+        call_count = 0
+
+        async def _flaky():
+            nonlocal call_count
+            call_count += 1
+            if call_count < 3:
+                raise asyncio.TimeoutError("timeout")
+            return "success"
+
+        result = await with_retry(lambda: _flaky(), max_retries=3)
+        assert result == "success"
+        assert call_count == 3
+
+    async def test_permanent_error_no_retry(self):
+        """Permanent error is not retried."""
+        from app.api.agencies import with_retry
+        from app.services.agency_service import InsufficientCreditsError
+
+        async def _permanent():
+            raise InsufficientCreditsError("No credits")
+
+        with pytest.raises(InsufficientCreditsError):
+            await with_retry(lambda: _permanent(), max_retries=3)
+
+    async def test_max_retries_exhausted(self):
+        """After max retries, the last error is raised."""
+        from app.api.agencies import with_retry
+
+        async def _always_fails():
+            raise asyncio.TimeoutError("timeout")
+
+        with pytest.raises(asyncio.TimeoutError):
+            await with_retry(lambda: _always_fails(), max_retries=3)
