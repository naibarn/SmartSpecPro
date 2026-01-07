"""
Unit tests for Auth Service
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime, timedelta
from app.services.auth_service import AuthService
from app.models.user import User
from app.models.token_blacklist import TokenBlacklist
from app.models.password_reset import PasswordResetToken

class TestAuthService:
    """Test AuthService class"""

    @pytest.fixture
    def mock_db(self):
        return AsyncMock()

    @pytest.fixture
    def auth_service(self, mock_db):
        return AuthService(mock_db)

    def test_create_access_token(self, auth_service):
        """Test creating access token"""
        with patch("app.services.auth_service.create_access_token_util") as mock_create:
            mock_create.return_value = "access_token"
            
            token = auth_service.create_access_token("user_123", "test@example.com")
            
            assert token == "access_token"
            mock_create.assert_called_once()
            call_args = mock_create.call_args[1]
            assert call_args["data"]["sub"] == "user_123"
            assert call_args["data"]["email"] == "test@example.com"

    def test_create_refresh_token(self, auth_service):
        """Test creating refresh token"""
        with patch("app.services.auth_service.create_refresh_token_util") as mock_create:
            mock_create.return_value = "refresh_token"
            
            token = auth_service.create_refresh_token("user_123", "test@example.com")
            
            assert token == "refresh_token"
            mock_create.assert_called_once()

    def test_create_token_pair(self, auth_service):
        """Test creating token pair"""
        with patch.object(auth_service, "create_access_token", return_value="acc"), \
             patch.object(auth_service, "create_refresh_token", return_value="ref"):
            
            pair = auth_service.create_token_pair("user_123", "test@example.com")
            
            assert pair["access_token"] == "acc"
            assert pair["refresh_token"] == "ref"
            assert pair["token_type"] == "bearer"

    def test_verify_token(self, auth_service):
        """Test token verification"""
        with patch("app.services.auth_service.decode_token") as mock_decode:
            mock_decode.return_value = {"sub": "user_123"}
            
            payload = auth_service.verify_token("token")
            
            assert payload == {"sub": "user_123"}

    @pytest.mark.asyncio
    async def test_is_token_blacklisted_memory_hit(self, auth_service):
        """Test blacklist check hits memory"""
        with patch("app.services.auth_service.is_token_blacklisted_in_memory", return_value=True):
            result = await auth_service.is_token_blacklisted("jti_123")
            assert result is True

    @pytest.mark.asyncio
    async def test_is_token_blacklisted_db_hit(self, auth_service, mock_db):
        """Test blacklist check hits DB"""
        with patch("app.services.auth_service.is_token_blacklisted_in_memory", return_value=False):
            # Mock DB return
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = TokenBlacklist()
            mock_db.execute.return_value = mock_result
            
            result = await auth_service.is_token_blacklisted("jti_123")
            
            assert result is True
            mock_db.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_refresh_access_token_success(self, auth_service, mock_db):
        """Test refreshing access token"""
        with patch.object(auth_service, "verify_token") as mock_verify, \
             patch.object(auth_service, "is_token_blacklisted", return_value=False), \
             patch.object(auth_service, "create_token_pair") as mock_pair:
            
            # Setup valid refresh token payload
            mock_verify.return_value = {
                "sub": "user_123",
                "email": "test@example.com", 
                "type": "refresh",
                "jti": "jti_123"
            }
            
            # Mock User DB lookup
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = User(id="user_123")
            mock_db.execute.return_value = mock_result
            
            mock_pair.return_value = {"access": "new"}
            
            result = await auth_service.refresh_access_token("ref_token")
            
            assert result == {"access": "new"}
            mock_pair.assert_called_with("user_123", "test@example.com")

    @pytest.mark.asyncio
    async def test_refresh_access_token_invalid(self, auth_service):
        """Test refresh with invalid token"""
        with patch.object(auth_service, "verify_token", return_value=None):
            result = await auth_service.refresh_access_token("bad_token")
            assert result is None

    @pytest.mark.asyncio
    async def test_logout(self, auth_service, mock_db):
        """Test logout"""
        with patch.object(auth_service, "verify_token") as mock_verify, \
             patch("app.services.auth_service.add_to_blacklist") as mock_mem_blacklist:
            
            # Mock payloads
            mock_verify.side_effect = [
                {"jti": "acc_jti", "sub": "u1", "type": "access", "exp": 12345}, # Access
                {"jti": "ref_jti", "sub": "u1", "type": "refresh", "exp": 12345} # Refresh
            ]
            
            # Mock DB check (not found, so add)
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None
            mock_db.execute.return_value = mock_result
            
            await auth_service.logout("acc_token", "ref_token")
            
            assert mock_mem_blacklist.call_count == 2
            assert mock_db.add.call_count == 2
            mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_password_reset_token(self, auth_service, mock_db):
        """Test creating reset token"""
        token = await auth_service.create_password_reset_token("user_123")
        
        assert token is not None
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_verify_password_reset_token_success(self, auth_service, mock_db):
        """Test verifying valid reset token"""
        with patch("app.models.password_reset.PasswordResetToken.is_valid", return_value=True):
            mock_result = MagicMock()
            mock_token = PasswordResetToken(user_id="user_123")
            mock_result.scalar_one_or_none.return_value = mock_token
            mock_db.execute.return_value = mock_result
            
            user_id = await auth_service.verify_password_reset_token("token")
            
            assert user_id == "user_123"

    @pytest.mark.asyncio
    async def test_reset_password_success(self, auth_service, mock_db):
        """Test resetting password"""
        with patch.object(auth_service, "verify_password_reset_token", return_value="user_123"), \
             patch("app.services.auth_service.get_password_hash", return_value="new_hash"), \
             patch.object(auth_service, "logout_all_sessions"):
            
            # Mock User lookup
            user_mock = User(id="user_123")
            
            # Mock Token lookup
            token_mock = PasswordResetToken()
            
            # Configure db execute side effects
            # 1. User lookup -> returns user
            # 2. Token lookup -> returns token
            mock_result_user = MagicMock()
            mock_result_user.scalar_one_or_none.return_value = user_mock
            
            mock_result_token = MagicMock()
            mock_result_token.scalar_one_or_none.return_value = token_mock
            
            mock_db.execute.side_effect = [mock_result_user, mock_result_token]
            
            result = await auth_service.reset_password("token", "new_pass")
            
            assert result is True
            assert user_mock.hashed_password == "new_hash"
            assert token_mock.used_at is not None
            mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_cleanup_expired_tokens(self, auth_service, mock_db):
        """Test cleanup"""
        # Mock result.rowcount
        mock_result = MagicMock()
        mock_result.rowcount = 5
        mock_db.execute.return_value = mock_result
        
        counts = await auth_service.cleanup_expired_tokens()
        
        assert counts == (5, 5) # 5 blacklist, 5 reset tokens
        assert mock_db.execute.call_count == 2
        mock_db.commit.assert_called_once()
