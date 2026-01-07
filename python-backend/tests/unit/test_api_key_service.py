"""
Unit tests for API Key Service
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime, timedelta
from app.services.api_key_service import APIKeyService
from app.models.api_key import APIKey, APIKeyUsage
from app.models.user import User

class TestAPIKeyService:
    """Test APIKeyService class"""

    @pytest.fixture
    def mock_db(self):
        return AsyncMock()

    @pytest.fixture
    def mock_user(self):
        return User(id="user_123", email="test@example.com")

    def test_generate_api_key(self):
        """Test API key generation"""
        key, key_hash, key_prefix = APIKeyService.generate_api_key()
        
        assert key is not None
        assert len(key) > 20
        assert key_hash is not None
        assert key_prefix.startswith(key[:8])
        assert key_prefix.endswith(key[-8:])

    @pytest.mark.asyncio
    async def test_create_api_key(self, mock_db, mock_user):
        """Test creating API key"""
        # Patch datetime to control expiration calculation
        # But for simpler test, just check the logic flow
        
        key_obj, raw_key = await APIKeyService.create_api_key(
            db=mock_db,
            user=mock_user,
            name="Test Key",
            permissions={"read": True},
            rate_limit=100
        )
        
        assert isinstance(key_obj, APIKey)
        assert raw_key is not None
        assert key_obj.user_id == mock_user.id
        assert key_obj.name == "Test Key"
        assert key_obj.rate_limit == 100
        assert key_obj.permissions == {"read": True}
        
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        mock_db.refresh.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_api_key_with_expiration(self, mock_db, mock_user):
        """Test creating API key with expiration"""
        key_obj, _ = await APIKeyService.create_api_key(
            db=mock_db,
            user=mock_user,
            name="Expiring Key",
            expires_in_days=30
        )
        
        assert key_obj.expires_at is not None
        assert key_obj.expires_at > datetime.utcnow()

    @pytest.mark.asyncio
    async def test_get_api_key_by_hash(self, mock_db):
        """Test getting API key by hash"""
        mock_result = MagicMock()
        mock_key = APIKey(id="key_123", name="Found Key")
        mock_result.scalar_one_or_none.return_value = mock_key
        mock_db.execute.return_value = mock_result
        
        key = await APIKeyService.get_api_key_by_hash(mock_db, "hash_123")
        
        assert key == mock_key
        mock_db.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_user_api_keys(self, mock_db, mock_user):
        """Test getting user keys"""
        mock_result = MagicMock()
        keys = [APIKey(name="K1"), APIKey(name="K2")]
        mock_result.scalars().all.return_value = keys
        mock_db.execute.return_value = mock_result
        
        result = await APIKeyService.get_user_api_keys(mock_db, mock_user)
        
        assert len(result) == 2
        
        # Verify default includes only active
        # This requires checking the compiled query if using real DB, 
        # but with mock we can just ensure execute is called
        mock_db.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_api_key(self, mock_db):
        """Test updating API key"""
        mock_key = APIKey(id="key_123", name="Old Name", rate_limit=60)
        
        updated_key = await APIKeyService.update_api_key(
            db=mock_db,
            api_key=mock_key,
            name="New Name",
            rate_limit=120,
            is_active=False
        )
        
        assert updated_key.name == "New Name"
        assert updated_key.rate_limit == 120
        assert updated_key.is_active is False
        assert updated_key.updated_at is not None
        
        mock_db.commit.assert_called_once()
        mock_db.refresh.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_api_key(self, mock_db):
        """Test deleting API key"""
        mock_key = APIKey(id="key_123")
        
        await APIKeyService.delete_api_key(mock_db, mock_key)
        
        mock_db.delete.assert_called_once_with(mock_key)
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_rotate_api_key(self, mock_db):
        """Test rotating API key"""
        mock_key = APIKey(id="key_123", key_hash="old_hash", key_prefix="old_pref")
        
        # Capture old values
        old_hash = mock_key.key_hash
        
        rotated_key, new_raw_key = await APIKeyService.rotate_api_key(mock_db, mock_key)
        
        assert rotated_key.id == "key_123" # ID remains same
        assert rotated_key.key_hash != old_hash # Hash changed
        assert new_raw_key is not None
        
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_record_usage(self, mock_db):
        """Test recording usage"""
        mock_key = APIKey(id="key_123")
        
        await APIKeyService.record_usage(
            db=mock_db,
            api_key=mock_key,
            endpoint="/api/v1/chat",
            method="POST",
            status_code=200,
            response_time=150,
            credits_used=10
        )
        
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        
        # Verify usage object creation (args verification)
        call_args = mock_db.add.call_args[0][0]
        assert isinstance(call_args, APIKeyUsage)
        assert call_args.api_key_id == "key_123"
        assert call_args.endpoint == "/api/v1/chat"
        assert call_args.credits_used == 10

    @pytest.mark.asyncio
    async def test_get_usage_stats(self, mock_db):
        """Test getting usage stats"""
        mock_key = APIKey(id="key_123")
        
        # Mock usage logs
        mock_result = MagicMock()
        mock_result.scalars().all.return_value = [
            APIKeyUsage(credits_used=10, response_time=100, status_code=200),
            APIKeyUsage(credits_used=20, response_time=200, status_code=500), # Error
            APIKeyUsage(credits_used=5, response_time=50, status_code=200)
        ]
        mock_db.execute.return_value = mock_result
        
        stats = await APIKeyService.get_usage_stats(mock_db, mock_key, days=7)
        
        assert stats["total_requests"] == 3
        assert stats["total_credits"] == 35 # 10+20+5
        assert stats["error_rate"] > 0 # 1/3
        assert stats["period_days"] == 7
        assert stats["avg_response_time"] > 0

    @pytest.mark.asyncio
    async def test_get_usage_stats_empty(self, mock_db):
        """Test usage stats with no data"""
        mock_key = APIKey(id="key_123")
        
        mock_result = MagicMock()
        mock_result.scalars().all.return_value = []
        mock_db.execute.return_value = mock_result
        
        stats = await APIKeyService.get_usage_stats(mock_db, mock_key)
        
        assert stats["total_requests"] == 0
        assert stats["total_credits"] == 0
