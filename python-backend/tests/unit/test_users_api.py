"""
Unit tests for User API
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.api.users import router
from app.core.auth import get_current_user, verify_password
from app.core.database import get_db
from app.models.user import User


@pytest.fixture
def client():
    """Create a test client"""
    return TestClient(app)

class TestUserAPI:
    """Test User API endpoints"""
    
    @pytest.fixture
    def mock_user(self):
        """Mock authenticated user"""
        user = User(
            id="user_123",
            email="test@example.com",
            full_name="Test User",
            hashed_password="hashed_password",
            credits_balance=100,
            is_admin=False,
            created_at="2024-01-01T00:00:00",
            updated_at="2024-01-01T00:00:00"
        )
        return user

    @pytest.fixture
    def mock_db(self):
        return AsyncMock()

    @pytest.fixture
    def client_with_auth(self, client, mock_user, mock_db):
        """Client with auth override"""
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_db] = lambda: mock_db
        yield client
        app.dependency_overrides = {}

    def test_get_profile(self, client_with_auth, mock_user):
        """Test GET /me"""
        response = client_with_auth.get("/api/users/me")
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == mock_user.email
        assert data["full_name"] == mock_user.full_name

    @pytest.mark.asyncio
    async def test_update_profile_success(self, client_with_auth, mock_db, mock_user):
        """Test PUT /me success"""
        # Mock unique email check (return None = no collision)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result
        
        payload = {"full_name": "New Name", "email": "new@example.com"}
        response = client_with_auth.put("/api/users/me", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["full_name"] == "New Name"
        assert data["email"] == "new@example.com"
        
        # Verify DB calls
        # Note: Since TestClient runs sync, but the endpoint calls async DB methods, 
        # FastAPIs TestClient handles loop but our mock needs to support it. 
        # AsyncMock handles awaiting.
        mock_db.commit.assert_called_once()
        mock_db.refresh.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_profile_email_exists(self, client_with_auth, mock_db):
        """Test PUT /me email collision"""
        # Mock collision
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = User(id="other")
        mock_db.execute.return_value = mock_result
        
        payload = {"email": "taken@example.com"}
        response = client_with_auth.put("/api/users/me", json=payload)
        
        assert response.status_code == 400
        assert "Email already registered" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_change_password_success(self, client_with_auth, mock_db, mock_user):
        """Test PUT /me/password success"""
        
        with patch("app.api.users.verify_password", side_effect=[True, False]), \
             patch("app.api.users.get_password_hash", return_value="new_hash"):
            
            # 1st verify_password: check current (True)
            # 2nd verify_password: check if new is same as old (False matches if check)
            
            payload = {
                "current_password": "OldPassword1!",
                "new_password": "NewPassword1!"
            }
            response = client_with_auth.put("/api/users/me/password", json=payload)
            
            assert response.status_code == 200
            assert mock_user.hashed_password == "new_hash"
            mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_change_password_weak(self, client_with_auth):
        """Test PUT /me/password weak password"""
        payload = {
            "current_password": "OldPassword1!",
            "new_password": "weak"
        }
        response = client_with_auth.put("/api/users/me/password", json=payload)
        
        assert response.status_code == 422 # Validation error

    @pytest.mark.asyncio
    async def test_delete_account_success(self, client_with_auth, mock_db, mock_user):
        """Test DELETE /me"""
        # Ensure 0 balance
        mock_user.credits_balance = 0
        
        with patch("app.api.users.verify_password", return_value=True):
            response = client_with_auth.delete("/api/users/me?password=Password1!")
            
            assert response.status_code == 200
            mock_db.delete.assert_called_once_with(mock_user)
            mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_account_with_credits(self, client_with_auth, mock_user):
        """Test DELETE /me with credits"""
        mock_user.credits_balance = 100
        
        with patch("app.api.users.verify_password", return_value=True):
            response = client_with_auth.delete("/api/users/me?password=Password1!")
            
            assert response.status_code == 400
            assert "remaining credits" in response.json()["detail"]
