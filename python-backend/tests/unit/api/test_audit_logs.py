import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import FastAPI
from app.api.audit_logs import router, require_admin
from app.core.auth import get_current_user
from app.core.database import get_db

@pytest.fixture
def app():
    _app = FastAPI()
    _app.include_router(router, prefix="/api/v1")
    return _app

@pytest.fixture
def client(app):
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

def test_require_admin_success():
    # Test internal helper
    user = {"role": "admin"}
    assert require_admin(user) == user

def test_require_admin_forbidden():
    user = {"role": "user"}
    with pytest.raises(Exception): # FastAPI HTTPException
        require_admin(user)

@pytest.mark.asyncio
async def test_get_audit_logs(client, mock_db, mock_audit_service):
    # Mock require_admin to bypass auth
    with patch("app.api.audit_logs.require_admin", return_value={"role": "admin"}), \
         patch("app.api.audit_logs.get_db", return_value=mock_db), \
         patch("app.api.audit_logs.AuditService", return_value=mock_audit_service):
        
        response = client.get("/api/v1/audit-logs")
        assert response.status_code == 200
        assert "logs" in response.json()
        assert mock_audit_service.get_logs.called

@pytest.mark.asyncio
async def test_get_user_activity(client, mock_db, mock_audit_service):
    with patch("app.api.audit_logs.require_admin", return_value={"role": "admin"}), \
         patch("app.api.audit_logs.get_db", return_value=mock_db), \
         patch("app.api.audit_logs.AuditService", return_value=mock_audit_service):
        
        response = client.get("/api/v1/audit-logs/user/user123/activity")
        assert response.status_code == 200
        assert response.json()["activity"] == "standard"

@pytest.mark.asyncio
async def test_get_impersonation_logs(client, mock_db, mock_audit_service):
    with patch("app.api.audit_logs.require_admin", return_value={"role": "admin"}), \
         patch("app.api.audit_logs.get_db", return_value=mock_db), \
         patch("app.api.audit_logs.AuditService", return_value=mock_audit_service):
        
        response = client.get("/api/v1/audit-logs/impersonations")
        assert response.status_code == 200
        assert "logs" in response.json()

@pytest.mark.asyncio
async def test_get_action_statistics(client, mock_db, mock_audit_service):
    with patch("app.api.audit_logs.require_admin", return_value={"role": "admin"}), \
         patch("app.api.audit_logs.get_db", return_value=mock_db), \
         patch("app.api.audit_logs.AuditService", return_value=mock_audit_service):
        
        response = client.get("/api/v1/audit-logs/statistics")
        assert response.status_code == 200
        assert response.json()["stats"] == "ok"

@pytest.mark.asyncio
async def test_search_audit_logs(client, mock_db, mock_audit_service):
    with patch("app.api.audit_logs.require_admin", return_value={"role": "admin"}), \
         patch("app.api.audit_logs.get_db", return_value=mock_db), \
         patch("app.api.audit_logs.AuditService", return_value=mock_audit_service):
        
        response = client.get("/api/v1/audit-logs/search", params={"q": "test"})
        assert response.status_code == 200
        assert "logs" in response.json()

@pytest.mark.asyncio
async def test_get_my_activity(client, mock_db, mock_audit_service):
    with patch("app.api.audit_logs.get_current_user", return_value={"id": "user123", "role": "user"}), \
         patch("app.api.audit_logs.get_db", return_value=mock_db), \
         patch("app.api.audit_logs.AuditService", return_value=mock_audit_service):
        
        response = client.get("/api/v1/audit-logs/my-activity")
        assert response.status_code == 200
        assert response.json()["activity"] == "standard"
