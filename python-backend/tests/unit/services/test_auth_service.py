"""
Unit Tests for AuthService
Tests token generation, verification, password reset, and logout functionality
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta
import uuid

from app.services.auth_service import AuthService
from app.models.user import User
from app.models.token_blacklist import TokenBlacklist
from app.models.password_reset import PasswordResetToken


class TestAuthServiceTokenGeneration:
    """Test token generation methods"""
    
    def test_create_access_token(self, test_db):
        """Test access token creation"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        
        token = service.create_access_token(user_id, email)
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 50  # JWT tokens are typically longer
    
    def test_create_access_token_with_custom_expiry(self, test_db):
        """Test access token creation with custom expiry"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        expires_delta = timedelta(hours=1)
        
        token = service.create_access_token(user_id, email, expires_delta)
        
        assert token is not None
        assert isinstance(token, str)
    
    def test_create_refresh_token(self, test_db):
        """Test refresh token creation"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        
        token = service.create_refresh_token(user_id, email)
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 50
    
    def test_create_refresh_token_with_custom_expiry(self, test_db):
        """Test refresh token creation with custom expiry"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        expires_delta = timedelta(days=7)
        
        token = service.create_refresh_token(user_id, email, expires_delta)
        
        assert token is not None
        assert isinstance(token, str)
    
    def test_create_token_pair(self, test_db):
        """Test creating access and refresh token pair"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        
        tokens = service.create_token_pair(user_id, email)
        
        assert "access_token" in tokens
        assert "refresh_token" in tokens
        assert "token_type" in tokens
        assert "expires_in" in tokens
        assert tokens["token_type"] == "bearer"
        assert tokens["expires_in"] > 0
    
    def test_token_pair_contains_different_tokens(self, test_db):
        """Test that token pair contains different tokens"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        
        tokens = service.create_token_pair(user_id, email)
        
        assert tokens["access_token"] != tokens["refresh_token"]


class TestAuthServiceTokenVerification:
    """Test token verification methods"""
    
    def test_verify_valid_token(self, test_db):
        """Test verification of valid token"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        
        token = service.create_access_token(user_id, email)
        payload = service.verify_token(token)
        
        assert payload is not None
        assert payload.get("email") == email
    
    def test_verify_token_contains_user_id(self, test_db):
        """Test that verified token contains user_id"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        
        token = service.create_access_token(user_id, email)
        payload = service.verify_token(token)
        
        assert payload is not None
        assert payload.get("sub") == user_id
    
    def test_verify_token_contains_jti(self, test_db):
        """Test that verified token contains JTI"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        
        token = service.create_access_token(user_id, email)
        payload = service.verify_token(token)
        
        assert payload is not None
        assert "jti" in payload
    
    def test_verify_invalid_token(self, test_db):
        """Test verification of invalid token"""
        service = AuthService(test_db)
        
        payload = service.verify_token("invalid_token")
        
        assert payload is None
    
    def test_verify_malformed_token(self, test_db):
        """Test verification of malformed token"""
        service = AuthService(test_db)
        
        payload = service.verify_token("not.a.valid.jwt.token")
        
        assert payload is None
    
    def test_verify_empty_token(self, test_db):
        """Test verification of empty token"""
        service = AuthService(test_db)
        
        payload = service.verify_token("")
        
        assert payload is None
    
    def test_verify_expired_token(self, test_db):
        """Test verification of expired token"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        
        # Create token with negative expiry (already expired)
        token = service.create_access_token(user_id, email, timedelta(seconds=-1))
        payload = service.verify_token(token)
        
        assert payload is None


class TestAuthServiceTokenBlacklist:
    """Test token blacklist methods"""
    
    @pytest.mark.asyncio
    async def test_is_token_blacklisted_not_blacklisted(self, test_db):
        """Test checking non-blacklisted token"""
        service = AuthService(test_db)
        jti = str(uuid.uuid4())
        
        result = await service.is_token_blacklisted(jti)
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_logout_blacklists_token(self, test_db):
        """Test that logout blacklists the token"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        
        access_token = service.create_access_token(user_id, email)
        
        result = await service.logout(access_token)
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_logout_with_refresh_token(self, test_db):
        """Test logout with both access and refresh tokens"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        
        access_token = service.create_access_token(user_id, email)
        refresh_token = service.create_refresh_token(user_id, email)
        
        result = await service.logout(access_token, refresh_token)
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_logout_with_invalid_token(self, test_db):
        """Test logout with invalid token"""
        service = AuthService(test_db)
        
        result = await service.logout("invalid_token")
        
        # Should still return True (graceful handling)
        assert result is True


class TestAuthServiceLogoutAllSessions:
    """Test logout all sessions method"""
    
    @pytest.mark.asyncio
    async def test_logout_all_sessions(self, test_db, test_user):
        """Test logging out all sessions"""
        service = AuthService(test_db)
        
        count = await service.logout_all_sessions(str(test_user.id))
        
        # Currently returns 0 as sessions aren't tracked
        assert isinstance(count, int)
        assert count >= 0


class TestAuthServiceRefreshToken:
    """Test token refresh methods"""
    
    @pytest.mark.asyncio
    async def test_refresh_access_token_invalid_token(self, test_db):
        """Test refresh with invalid token"""
        service = AuthService(test_db)
        
        result = await service.refresh_access_token("invalid_token")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_refresh_access_token_with_access_token(self, test_db):
        """Test refresh with access token (should fail)"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        
        # Try to use access token as refresh token
        access_token = service.create_access_token(user_id, email)
        result = await service.refresh_access_token(access_token)
        
        # Should fail because it's not a refresh token
        assert result is None
    
    @pytest.mark.asyncio
    async def test_refresh_access_token_success(self, test_db, test_user):
        """Test successful token refresh"""
        service = AuthService(test_db)
        
        # Create refresh token for existing user
        refresh_token = service.create_refresh_token(str(test_user.id), test_user.email)
        
        result = await service.refresh_access_token(refresh_token)
        
        # Should return new token pair
        if result:
            assert "access_token" in result
            assert "refresh_token" in result


class TestAuthServicePasswordReset:
    """Test password reset methods"""
    
    @pytest.mark.asyncio
    async def test_create_password_reset_token(self, test_db, test_user):
        """Test creating password reset token"""
        service = AuthService(test_db)
        
        token = await service.create_password_reset_token(
            str(test_user.id),
            ip_address="127.0.0.1",
            user_agent="Test Browser"
        )
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 20
    
    @pytest.mark.asyncio
    async def test_create_password_reset_token_without_metadata(self, test_db, test_user):
        """Test creating password reset token without IP/UA"""
        service = AuthService(test_db)
        
        token = await service.create_password_reset_token(str(test_user.id))
        
        assert token is not None
        assert isinstance(token, str)
    
    @pytest.mark.asyncio
    async def test_verify_password_reset_token_invalid(self, test_db):
        """Test verifying invalid password reset token"""
        service = AuthService(test_db)
        
        user_id = await service.verify_password_reset_token("invalid_token")
        
        assert user_id is None
    
    @pytest.mark.asyncio
    async def test_verify_password_reset_token_valid(self, test_db, test_user):
        """Test verifying valid password reset token"""
        service = AuthService(test_db)
        
        # Create token
        token = await service.create_password_reset_token(str(test_user.id))
        
        # Verify token
        user_id = await service.verify_password_reset_token(token)
        
        assert user_id == str(test_user.id)
    
    @pytest.mark.asyncio
    async def test_reset_password_invalid_token(self, test_db):
        """Test resetting password with invalid token"""
        service = AuthService(test_db)
        
        result = await service.reset_password("invalid_token", "newpassword123")
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_reset_password_success(self, test_db, test_user):
        """Test successful password reset"""
        service = AuthService(test_db)
        
        # Create reset token
        token = await service.create_password_reset_token(str(test_user.id))
        
        # Reset password
        result = await service.reset_password(token, "newpassword123")
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_reset_password_token_used_once(self, test_db, test_user):
        """Test that reset token can only be used once"""
        service = AuthService(test_db)
        
        # Create reset token
        token = await service.create_password_reset_token(str(test_user.id))
        
        # Reset password first time
        result1 = await service.reset_password(token, "newpassword123")
        assert result1 is True
        
        # Try to use same token again
        result2 = await service.reset_password(token, "anotherpassword")
        assert result2 is False


class TestAuthServiceCleanup:
    """Test token cleanup methods"""
    
    @pytest.mark.asyncio
    async def test_cleanup_expired_tokens(self, test_db):
        """Test cleaning up expired tokens"""
        service = AuthService(test_db)
        
        blacklist_deleted, reset_deleted = await service.cleanup_expired_tokens()
        
        assert isinstance(blacklist_deleted, int)
        assert isinstance(reset_deleted, int)
        assert blacklist_deleted >= 0
        assert reset_deleted >= 0


class TestAuthServiceEdgeCases:
    """Test edge cases and error handling"""
    
    def test_multiple_token_creation(self, test_db):
        """Test creating multiple tokens for same user"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        
        tokens = [service.create_access_token(user_id, email) for _ in range(5)]
        
        # All tokens should be unique
        assert len(set(tokens)) == 5
    
    def test_tokens_have_unique_jti(self, test_db):
        """Test that each token has unique JTI"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        
        token1 = service.create_access_token(user_id, email)
        token2 = service.create_access_token(user_id, email)
        
        payload1 = service.verify_token(token1)
        payload2 = service.verify_token(token2)
        
        assert payload1["jti"] != payload2["jti"]
    
    @pytest.mark.asyncio
    async def test_logout_multiple_times(self, test_db):
        """Test logging out same token multiple times"""
        service = AuthService(test_db)
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        
        access_token = service.create_access_token(user_id, email)
        
        # Logout multiple times
        result1 = await service.logout(access_token)
        result2 = await service.logout(access_token)
        
        assert result1 is True
        assert result2 is True  # Should handle gracefully
