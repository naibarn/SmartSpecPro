from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api.audit_logs import require_admin, router
from app.core.auth import get_current_user
from app.core.database import get_db


@pytest.fixture
def app():
    _app = FastAPI()
    _app.include_router(router)
    return _app

@pytest.fixture
def client(app):
    return TestClient(app)

@pytest.fixture
def admin_client(app, mock_db):
    app.dependency_overrides[require_admin] = lambda: {"id": "admin123", "role": "admin"}
    app.dependency_overrides[get_db] = lambda: mock_db
    return TestClient(app)

@pytest.fixture
def user_client(app, mock_db):
    app.dependency_overrides[get_current_user] = lambda: {"id": "user123", "role": "user"}
    app.dependency_overrides[get_db] = lambda: mock_db
    return TestClient(app)

@pytest.fixture
def mock_db():
    return MagicMock()

@pytest.fixture
def mock_audit_service():
    service = MagicMock()
    service.get_logs = AsyncMock(return_value=[])
    service.get_user_activity = AsyncMock(return_value={"activity": "standard"})
    service.get_impersonation_logs = AsyncMock(return_value=[])
    service.get_action_statistics = AsyncMock(return_value={"stats": "ok"})
    service.search_logs = AsyncMock(return_value=[])
    return service

@pytest.mark.asyncio
async def test_require_admin_success():
    # Test internal helper
    user = {"role": "admin"}
    assert await require_admin(user) == user

@pytest.mark.asyncio
async def test_require_admin_forbidden():
    with pytest.raises(HTTPException) as exc_info:
        await require_admin({"role": "user"})
    assert exc_info.value.status_code == 403

def test_audit_logs_require_admin(user_client):
    response = user_client.get("/api/v1/audit-logs")
    assert response.status_code == 403

@pytest.mark.asyncio
async def test_get_audit_logs(admin_client, mock_audit_service):
    with patch("app.api.audit_logs.AuditService", return_value=mock_audit_service):
        response = admin_client.get("/api/v1/audit-logs")
        assert response.status_code == 200
        assert "logs" in response.json()
        assert mock_audit_service.get_logs.called

@pytest.mark.asyncio
async def test_get_user_activity(admin_client, mock_audit_service):
    with patch("app.api.audit_logs.AuditService", return_value=mock_audit_service):
        response = admin_client.get("/api/v1/audit-logs/user/user123/activity")
        assert response.status_code == 200
        assert response.json()["activity"] == "standard"

@pytest.mark.asyncio
async def test_get_impersonation_logs(admin_client, mock_audit_service):
    with patch("app.api.audit_logs.AuditService", return_value=mock_audit_service):
        response = admin_client.get("/api/v1/audit-logs/impersonations")
        assert response.status_code == 200
        assert "logs" in response.json()

@pytest.mark.asyncio
async def test_get_action_statistics(admin_client, mock_audit_service):
    with patch("app.api.audit_logs.AuditService", return_value=mock_audit_service):
        response = admin_client.get("/api/v1/audit-logs/statistics")
        assert response.status_code == 200
        assert response.json()["stats"] == "ok"

@pytest.mark.asyncio
async def test_search_audit_logs(admin_client, mock_audit_service):
    with patch("app.api.audit_logs.AuditService", return_value=mock_audit_service):
        response = admin_client.get("/api/v1/audit-logs/search", params={"q": "test"})
        assert response.status_code == 200
        assert "logs" in response.json()

@pytest.mark.asyncio
async def test_get_my_activity(user_client, mock_audit_service):
    with patch("app.api.audit_logs.AuditService", return_value=mock_audit_service):
        response = user_client.get("/api/v1/audit-logs/my-activity")
        assert response.status_code == 200
        assert response.json()["activity"] == "standard"
