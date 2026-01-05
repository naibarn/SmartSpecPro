"""
Unit tests for OAuth Service
Tests OAuth 2.0 authentication flow for Google and GitHub
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta
import json
import uuid

from app.services.oauth_service import OAuthService, state_serializer


class TestOAuthServiceInit:
    """Tests for OAuthService initialization"""
    
    def test_init_with_db_session(self):
        """Test OAuthService initializes with database session"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        assert service.db == mock_db


class TestGenerateOAuthState:
    """Tests for OAuth state token generation"""
    
    def test_generate_oauth_state_returns_string(self):
        """Test generate_oauth_state returns a non-empty string"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        state = service.generate_oauth_state()
        
        assert isinstance(state, str)
        assert len(state) > 0
    
    def test_generate_oauth_state_is_unique(self):
        """Test generate_oauth_state returns unique values"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        states = [service.generate_oauth_state() for _ in range(10)]
        
        # All states should be unique
        assert len(set(states)) == 10
    
    def test_generate_oauth_state_is_verifiable(self):
        """Test generated state can be verified"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        state = service.generate_oauth_state()
        
        # Should be able to load the state without error
        loaded = state_serializer.loads(state, max_age=600)
        assert loaded is not None


class TestStateSerializer:
    """Tests for state serializer"""
    
    def test_state_serializer_creates_valid_token(self):
        """Test state serializer creates a valid token"""
        data = str(uuid.uuid4())
        token = state_serializer.dumps(data)
        
        assert isinstance(token, str)
        assert len(token) > 0
    
    def test_state_serializer_loads_valid_token(self):
        """Test state serializer can load a valid token"""
        data = str(uuid.uuid4())
        token = state_serializer.dumps(data)
        
        loaded = state_serializer.loads(token, max_age=600)
        
        assert loaded == data
    
    def test_state_serializer_rejects_expired_token(self):
        """Test state serializer rejects expired tokens"""
        from itsdangerous import SignatureExpired
        import time
        
        data = str(uuid.uuid4())
        token = state_serializer.dumps(data)
        
        # Wait a tiny bit and use very short max_age
        time.sleep(0.1)
        
        # Try to load with negative max_age (will be expired)
        with pytest.raises(SignatureExpired):
            state_serializer.loads(token, max_age=-1)
    
    def test_state_serializer_rejects_invalid_token(self):
        """Test state serializer rejects invalid tokens"""
        from itsdangerous import BadSignature
        
        with pytest.raises(BadSignature):
            state_serializer.loads("invalid-token", max_age=600)


class TestExchangeCodeForToken:
    """Tests for _exchange_code_for_token method"""
    
    @pytest.mark.asyncio
    async def test_exchange_code_google_success(self):
        """Test successful token exchange with Google"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "access_token": "google_access_token",
            "refresh_token": "google_refresh_token",
            "expires_in": 3600
        }
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client.return_value.__aenter__.return_value = mock_client_instance
            
            result = await service._exchange_code_for_token(
                provider="google",
                code="auth_code",
                redirect_uri="http://localhost/callback",
                client_id="client_id",
                client_secret="client_secret",
                state="state"
            )
        
        assert result is not None
        assert result["access_token"] == "google_access_token"
        assert result["refresh_token"] == "google_refresh_token"
    
    @pytest.mark.asyncio
    async def test_exchange_code_github_success(self):
        """Test successful token exchange with GitHub"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "access_token": "github_access_token",
            "token_type": "bearer"
        }
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client.return_value.__aenter__.return_value = mock_client_instance
            
            result = await service._exchange_code_for_token(
                provider="github",
                code="auth_code",
                redirect_uri="http://localhost/callback",
                client_id="client_id",
                client_secret="client_secret",
                state="state"
            )
        
        assert result is not None
        assert result["access_token"] == "github_access_token"
    
    @pytest.mark.asyncio
    async def test_exchange_code_invalid_provider(self):
        """Test token exchange with invalid provider returns None"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        result = await service._exchange_code_for_token(
            provider="invalid_provider",
            code="auth_code",
            redirect_uri="http://localhost/callback",
            client_id="client_id",
            client_secret="client_secret",
            state="state"
        )
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_exchange_code_api_error(self):
        """Test token exchange handles API errors"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        mock_response = MagicMock()
        mock_response.status_code = 400
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client.return_value.__aenter__.return_value = mock_client_instance
            
            result = await service._exchange_code_for_token(
                provider="google",
                code="invalid_code",
                redirect_uri="http://localhost/callback",
                client_id="client_id",
                client_secret="client_secret",
                state="state"
            )
        
        assert result is None


class TestGetUserProfile:
    """Tests for _get_user_profile method"""
    
    @pytest.mark.asyncio
    async def test_get_google_profile_success(self):
        """Test successful Google profile retrieval"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "google_user_123",
            "email": "user@gmail.com",
            "name": "Test User",
            "picture": "https://example.com/photo.jpg",
            "verified_email": True
        }
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client.return_value.__aenter__.return_value = mock_client_instance
            
            result = await service._get_user_profile("google", "access_token")
        
        assert result is not None
        assert result["id"] == "google_user_123"
        assert result["email"] == "user@gmail.com"
        assert result["name"] == "Test User"
        assert result["verified_email"] == True
    
    @pytest.mark.asyncio
    async def test_get_github_profile_success(self):
        """Test successful GitHub profile retrieval"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": 12345,
            "email": "user@github.com",
            "name": "GitHub User",
            "login": "githubuser",
            "avatar_url": "https://github.com/avatar.jpg"
        }
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client.return_value.__aenter__.return_value = mock_client_instance
            
            result = await service._get_user_profile("github", "access_token")
        
        assert result is not None
        assert result["id"] == "12345"
        assert result["email"] == "user@github.com"
        assert result["name"] == "GitHub User"
        assert result["verified_email"] == True
    
    @pytest.mark.asyncio
    async def test_get_github_profile_no_email_fallback(self):
        """Test GitHub profile with no email falls back to login"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        # First call returns profile without email
        mock_profile_response = MagicMock()
        mock_profile_response.status_code = 200
        mock_profile_response.json.return_value = {
            "id": 12345,
            "email": None,
            "name": None,
            "login": "githubuser",
            "avatar_url": "https://github.com/avatar.jpg"
        }
        
        # Second call returns emails
        mock_emails_response = MagicMock()
        mock_emails_response.status_code = 200
        mock_emails_response.json.return_value = [
            {"email": "primary@github.com", "primary": True, "verified": True},
            {"email": "secondary@github.com", "primary": False, "verified": True}
        ]
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(
                side_effect=[mock_profile_response, mock_emails_response]
            )
            mock_client.return_value.__aenter__.return_value = mock_client_instance
            
            result = await service._get_user_profile("github", "access_token")
        
        assert result is not None
        assert result["email"] == "primary@github.com"
        assert result["name"] == "githubuser"  # Falls back to login
    
    @pytest.mark.asyncio
    async def test_get_profile_invalid_provider(self):
        """Test profile retrieval with invalid provider returns None"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        result = await service._get_user_profile("invalid_provider", "access_token")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_get_profile_api_error(self):
        """Test profile retrieval handles API errors"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        mock_response = MagicMock()
        mock_response.status_code = 401
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client.return_value.__aenter__.return_value = mock_client_instance
            
            result = await service._get_user_profile("google", "invalid_token")
        
        assert result is None


class TestGetGitHubPrimaryEmail:
    """Tests for _get_github_primary_email method"""
    
    @pytest.mark.asyncio
    async def test_get_primary_email_success(self):
        """Test successful primary email retrieval"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {"email": "primary@github.com", "primary": True, "verified": True},
            {"email": "secondary@github.com", "primary": False, "verified": True}
        ]
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client.return_value.__aenter__.return_value = mock_client_instance
            
            result = await service._get_github_primary_email("access_token")
        
        assert result == "primary@github.com"
    
    @pytest.mark.asyncio
    async def test_get_email_fallback_to_verified(self):
        """Test fallback to first verified email when no primary"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {"email": "unverified@github.com", "primary": False, "verified": False},
            {"email": "verified@github.com", "primary": False, "verified": True}
        ]
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client.return_value.__aenter__.return_value = mock_client_instance
            
            result = await service._get_github_primary_email("access_token")
        
        assert result == "verified@github.com"
    
    @pytest.mark.asyncio
    async def test_get_email_api_error(self):
        """Test email retrieval handles API errors"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        mock_response = MagicMock()
        mock_response.status_code = 401
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client.return_value.__aenter__.return_value = mock_client_instance
            
            result = await service._get_github_primary_email("invalid_token")
        
        assert result is None


class TestHandleOAuthCallback:
    """Tests for handle_oauth_callback method"""
    
    @pytest.mark.asyncio
    async def test_callback_invalid_state(self):
        """Test callback rejects invalid state token"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        with pytest.raises(ValueError, match="Invalid or expired OAuth state token"):
            await service.handle_oauth_callback(
                provider="google",
                code="auth_code",
                redirect_uri="http://localhost/callback",
                client_id="client_id",
                client_secret="client_secret",
                state="invalid_state"
            )
    
    @pytest.mark.asyncio
    async def test_callback_token_exchange_failure(self):
        """Test callback handles token exchange failure"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        # Generate valid state
        valid_state = service.generate_oauth_state()
        
        # Mock failed token exchange
        with patch.object(service, '_exchange_code_for_token', return_value=None):
            with pytest.raises(ValueError, match="Failed to exchange code for token"):
                await service.handle_oauth_callback(
                    provider="google",
                    code="invalid_code",
                    redirect_uri="http://localhost/callback",
                    client_id="client_id",
                    client_secret="client_secret",
                    state=valid_state
                )
    
    @pytest.mark.asyncio
    async def test_callback_profile_failure(self):
        """Test callback handles profile retrieval failure"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        valid_state = service.generate_oauth_state()
        
        with patch.object(service, '_exchange_code_for_token', return_value={
            "access_token": "token",
            "refresh_token": "refresh",
            "expires_in": 3600
        }):
            with patch.object(service, '_get_user_profile', return_value=None):
                with pytest.raises(ValueError, match="Failed to get user profile"):
                    await service.handle_oauth_callback(
                        provider="google",
                        code="auth_code",
                        redirect_uri="http://localhost/callback",
                        client_id="client_id",
                        client_secret="client_secret",
                        state=valid_state
                    )
    
    @pytest.mark.asyncio
    async def test_callback_profile_no_email(self):
        """Test callback handles profile without email"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        valid_state = service.generate_oauth_state()
        
        with patch.object(service, '_exchange_code_for_token', return_value={
            "access_token": "token",
            "refresh_token": "refresh",
            "expires_in": 3600
        }):
            with patch.object(service, '_get_user_profile', return_value={
                "id": "123",
                "email": None,
                "name": "Test"
            }):
                with pytest.raises(ValueError, match="Failed to get user profile or email not provided"):
                    await service.handle_oauth_callback(
                        provider="google",
                        code="auth_code",
                        redirect_uri="http://localhost/callback",
                        client_id="client_id",
                        client_secret="client_secret",
                        state=valid_state
                    )


class TestFindOrCreateUser:
    """Tests for _find_or_create_user method"""
    
    @pytest.mark.asyncio
    async def test_find_existing_oauth_connection(self):
        """Test finding user with existing OAuth connection"""
        mock_db = AsyncMock()
        service = OAuthService(mock_db)
        
        # Mock existing OAuth connection
        mock_user = MagicMock()
        mock_user.id = uuid.uuid4()
        mock_user.email = "user@example.com"
        
        mock_oauth_conn = MagicMock()
        mock_oauth_conn.user = mock_user
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_oauth_conn
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()
        
        result = await service._find_or_create_user(
            provider="google",
            profile={"id": "123", "email": "user@example.com", "name": "Test"},
            access_token="new_token",
            refresh_token="new_refresh",
            expires_in=3600
        )
        
        assert result == mock_user
        # Verify token was updated
        assert mock_oauth_conn.access_token == "new_token"
        assert mock_oauth_conn.refresh_token == "new_refresh"


class TestLinkOAuthAccount:
    """Tests for link_oauth_account method"""
    
    @pytest.mark.asyncio
    async def test_link_invalid_state(self):
        """Test link rejects invalid state token"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        with pytest.raises(ValueError, match="Invalid or expired OAuth state token"):
            await service.link_oauth_account(
                user_id="user_123",
                provider="google",
                code="auth_code",
                redirect_uri="http://localhost/callback",
                client_id="client_id",
                client_secret="client_secret",
                state="invalid_state"
            )
    
    @pytest.mark.asyncio
    async def test_link_token_exchange_failure(self):
        """Test link returns False on token exchange failure"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        valid_state = service.generate_oauth_state()
        
        with patch.object(service, '_exchange_code_for_token', return_value=None):
            result = await service.link_oauth_account(
                user_id="user_123",
                provider="google",
                code="invalid_code",
                redirect_uri="http://localhost/callback",
                client_id="client_id",
                client_secret="client_secret",
                state=valid_state
            )
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_link_profile_failure(self):
        """Test link returns False on profile retrieval failure"""
        mock_db = MagicMock()
        service = OAuthService(mock_db)
        
        valid_state = service.generate_oauth_state()
        
        with patch.object(service, '_exchange_code_for_token', return_value={
            "access_token": "token"
        }):
            with patch.object(service, '_get_user_profile', return_value=None):
                result = await service.link_oauth_account(
                    user_id="user_123",
                    provider="google",
                    code="auth_code",
                    redirect_uri="http://localhost/callback",
                    client_id="client_id",
                    client_secret="client_secret",
                    state=valid_state
                )
        
        assert result is False


class TestUnlinkOAuthAccount:
    """Tests for unlink_oauth_account method"""
    
    @pytest.mark.asyncio
    async def test_unlink_user_not_found(self):
        """Test unlink returns False when user not found"""
        mock_db = AsyncMock()
        service = OAuthService(mock_db)
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        result = await service.unlink_oauth_account("nonexistent_user", "google")
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_unlink_only_auth_method(self):
        """Test unlink raises error when it's the only auth method"""
        mock_db = AsyncMock()
        service = OAuthService(mock_db)
        
        # Mock user without password
        mock_user = MagicMock()
        mock_user.id = "user_123"
        mock_user.password_hash = ""  # No password
        
        # Mock single OAuth connection
        mock_oauth_conn = MagicMock()
        mock_oauth_conns = [mock_oauth_conn]
        
        mock_result_user = MagicMock()
        mock_result_user.scalar_one_or_none.return_value = mock_user
        
        mock_result_oauth = MagicMock()
        mock_result_oauth.scalars.return_value.all.return_value = mock_oauth_conns
        
        mock_db.execute = AsyncMock(side_effect=[mock_result_user, mock_result_oauth])
        
        with pytest.raises(ValueError, match="Cannot unlink the only authentication method"):
            await service.unlink_oauth_account("user_123", "google")
    
    @pytest.mark.asyncio
    async def test_unlink_success_with_password(self):
        """Test successful unlink when user has password"""
        mock_db = AsyncMock()
        service = OAuthService(mock_db)
        
        # Mock user with password
        mock_user = MagicMock()
        mock_user.id = "user_123"
        mock_user.password_hash = "hashed_password"
        
        # Mock single OAuth connection
        mock_oauth_conn = MagicMock()
        mock_oauth_conns = [mock_oauth_conn]
        
        mock_result_user = MagicMock()
        mock_result_user.scalar_one_or_none.return_value = mock_user
        
        mock_result_oauth_list = MagicMock()
        mock_result_oauth_list.scalars.return_value.all.return_value = mock_oauth_conns
        
        mock_result_oauth_single = MagicMock()
        mock_result_oauth_single.scalar_one_or_none.return_value = mock_oauth_conn
        
        mock_db.execute = AsyncMock(side_effect=[
            mock_result_user,
            mock_result_oauth_list,
            mock_result_oauth_single
        ])
        mock_db.delete = AsyncMock()
        mock_db.commit = AsyncMock()
        
        result = await service.unlink_oauth_account("user_123", "google")
        
        assert result is True
        mock_db.delete.assert_called_once_with(mock_oauth_conn)
    
    @pytest.mark.asyncio
    async def test_unlink_success_with_multiple_oauth(self):
        """Test successful unlink when user has multiple OAuth connections"""
        mock_db = AsyncMock()
        service = OAuthService(mock_db)
        
        # Mock user without password but multiple OAuth
        mock_user = MagicMock()
        mock_user.id = "user_123"
        mock_user.password_hash = ""
        
        # Mock multiple OAuth connections
        mock_oauth_conn1 = MagicMock()
        mock_oauth_conn2 = MagicMock()
        mock_oauth_conns = [mock_oauth_conn1, mock_oauth_conn2]
        
        mock_result_user = MagicMock()
        mock_result_user.scalar_one_or_none.return_value = mock_user
        
        mock_result_oauth_list = MagicMock()
        mock_result_oauth_list.scalars.return_value.all.return_value = mock_oauth_conns
        
        mock_result_oauth_single = MagicMock()
        mock_result_oauth_single.scalar_one_or_none.return_value = mock_oauth_conn1
        
        mock_db.execute = AsyncMock(side_effect=[
            mock_result_user,
            mock_result_oauth_list,
            mock_result_oauth_single
        ])
        mock_db.delete = AsyncMock()
        mock_db.commit = AsyncMock()
        
        result = await service.unlink_oauth_account("user_123", "google")
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_unlink_connection_not_found(self):
        """Test unlink returns False when connection not found"""
        mock_db = AsyncMock()
        service = OAuthService(mock_db)
        
        # Mock user with password
        mock_user = MagicMock()
        mock_user.id = "user_123"
        mock_user.password_hash = "hashed_password"
        
        mock_oauth_conns = [MagicMock()]
        
        mock_result_user = MagicMock()
        mock_result_user.scalar_one_or_none.return_value = mock_user
        
        mock_result_oauth_list = MagicMock()
        mock_result_oauth_list.scalars.return_value.all.return_value = mock_oauth_conns
        
        mock_result_oauth_single = MagicMock()
        mock_result_oauth_single.scalar_one_or_none.return_value = None  # Not found
        
        mock_db.execute = AsyncMock(side_effect=[
            mock_result_user,
            mock_result_oauth_list,
            mock_result_oauth_single
        ])
        
        result = await service.unlink_oauth_account("user_123", "github")
        
        assert result is False


class TestHandleOAuthCallbackSuccess:
    """Tests for successful OAuth callback flow"""
    
    @pytest.mark.asyncio
    async def test_callback_success_new_user(self):
        """Test successful callback creates new user and returns JWT"""
        mock_db = AsyncMock()
        service = OAuthService(mock_db)
        
        # Generate valid state
        valid_state = service.generate_oauth_state()
        
        # Mock token exchange
        mock_token_data = {
            "access_token": "test_access_token",
            "refresh_token": "test_refresh_token",
            "expires_in": 3600
        }
        
        # Mock user profile
        mock_profile = {
            "id": "google_user_123",
            "email": "newuser@example.com",
            "name": "New User",
            "verified_email": True
        }
        
        # Mock database - no existing OAuth connection, no existing user
        mock_result_oauth = MagicMock()
        mock_result_oauth.scalar_one_or_none.return_value = None
        
        mock_result_user = MagicMock()
        mock_result_user.scalar_one_or_none.return_value = None
        
        # Track execute calls
        execute_calls = [mock_result_oauth, mock_result_user]
        call_index = [0]
        
        async def mock_execute(*args, **kwargs):
            result = execute_calls[call_index[0]]
            call_index[0] += 1
            return result
        
        mock_db.execute = mock_execute
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()
        
        with patch.object(service, '_exchange_code_for_token', return_value=mock_token_data):
            with patch.object(service, '_get_user_profile', return_value=mock_profile):
                with patch('app.services.oauth_service.create_access_token') as mock_create_token:
                    mock_create_token.return_value = "jwt_token_123"
                    
                    result = await service.handle_oauth_callback(
                        provider="google",
                        code="valid_code",
                        redirect_uri="http://localhost/callback",
                        client_id="client_id",
                        client_secret="client_secret",
                        state=valid_state
                    )
        
        assert result is not None
        assert "access_token" in result
        assert result["access_token"] == "jwt_token_123"
        assert result["token_type"] == "bearer"
        assert "user" in result
    
    @pytest.mark.asyncio
    async def test_callback_success_existing_user(self):
        """Test successful callback with existing user"""
        mock_db = AsyncMock()
        service = OAuthService(mock_db)
        
        # Generate valid state
        valid_state = service.generate_oauth_state()
        
        # Mock token exchange
        mock_token_data = {
            "access_token": "test_access_token",
            "refresh_token": "test_refresh_token",
            "expires_in": 3600
        }
        
        # Mock user profile
        mock_profile = {
            "id": "google_user_123",
            "email": "existing@example.com",
            "name": "Existing User",
            "verified_email": True
        }
        
        # Mock existing OAuth connection with user
        mock_user = MagicMock()
        mock_user.id = uuid.uuid4()
        mock_user.email = "existing@example.com"
        mock_user.full_name = "Existing User"
        mock_user.credits_balance = 100.0
        mock_user.is_admin = False
        
        mock_oauth_conn = MagicMock()
        mock_oauth_conn.user = mock_user
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_oauth_conn
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()
        
        with patch.object(service, '_exchange_code_for_token', return_value=mock_token_data):
            with patch.object(service, '_get_user_profile', return_value=mock_profile):
                with patch('app.services.oauth_service.create_access_token') as mock_create_token:
                    mock_create_token.return_value = "jwt_token_456"
                    
                    result = await service.handle_oauth_callback(
                        provider="google",
                        code="valid_code",
                        redirect_uri="http://localhost/callback",
                        client_id="client_id",
                        client_secret="client_secret",
                        state=valid_state
                    )
        
        assert result is not None
        assert result["access_token"] == "jwt_token_456"
        assert result["user"]["email"] == "existing@example.com"


class TestFindOrCreateUserComplete:
    """Tests for _find_or_create_user method with database operations"""
    
    @pytest.mark.asyncio
    async def test_create_new_user_with_oauth(self):
        """Test creating new user when no existing user or OAuth connection"""
        mock_db = AsyncMock()
        service = OAuthService(mock_db)
        
        profile = {
            "id": "provider_user_123",
            "email": "newuser@example.com",
            "name": "New User",
            "verified_email": True
        }
        
        # Mock no existing OAuth connection
        mock_result_oauth = MagicMock()
        mock_result_oauth.scalar_one_or_none.return_value = None
        
        # Mock no existing user
        mock_result_user = MagicMock()
        mock_result_user.scalar_one_or_none.return_value = None
        
        execute_results = [mock_result_oauth, mock_result_user]
        call_idx = [0]
        
        async def mock_execute(*args, **kwargs):
            result = execute_results[call_idx[0]]
            call_idx[0] += 1
            return result
        
        mock_db.execute = mock_execute
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()
        
        result = await service._find_or_create_user(
            provider="google",
            profile=profile,
            access_token="access_token",
            refresh_token="refresh_token",
            expires_in=3600
        )
        
        # Verify user was created (add was called twice - once for user, once for oauth)
        assert mock_db.add.call_count == 2
        assert mock_db.commit.called
    
    @pytest.mark.asyncio
    async def test_link_oauth_to_existing_user(self):
        """Test linking OAuth to existing user with same email"""
        mock_db = AsyncMock()
        service = OAuthService(mock_db)
        
        profile = {
            "id": "provider_user_456",
            "email": "existing@example.com",
            "name": "Existing User",
            "verified_email": True
        }
        
        # Mock no existing OAuth connection
        mock_result_oauth = MagicMock()
        mock_result_oauth.scalar_one_or_none.return_value = None
        
        # Mock existing user
        mock_existing_user = MagicMock()
        mock_existing_user.id = uuid.uuid4()
        mock_existing_user.email = "existing@example.com"
        
        mock_result_user = MagicMock()
        mock_result_user.scalar_one_or_none.return_value = mock_existing_user
        
        execute_results = [mock_result_oauth, mock_result_user]
        call_idx = [0]
        
        async def mock_execute(*args, **kwargs):
            result = execute_results[call_idx[0]]
            call_idx[0] += 1
            return result
        
        mock_db.execute = mock_execute
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()
        
        result = await service._find_or_create_user(
            provider="github",
            profile=profile,
            access_token="access_token",
            refresh_token="refresh_token",
            expires_in=3600
        )
        
        # Verify only OAuth connection was added (not new user)
        assert mock_db.add.call_count == 1  # Only OAuth connection
        assert result == mock_existing_user


class TestLinkOAuthAccountComplete:
    """Tests for link_oauth_account with database operations"""
    
    @pytest.mark.asyncio
    async def test_link_new_oauth_account(self):
        """Test linking a new OAuth account to user"""
        mock_db = AsyncMock()
        service = OAuthService(mock_db)
        
        user_id = str(uuid.uuid4())
        
        # Mock token exchange
        mock_token_data = {
            "access_token": "new_access_token",
            "refresh_token": "new_refresh_token",
            "expires_in": 3600
        }
        
        # Mock profile
        mock_profile = {
            "id": "new_provider_user_123",
            "email": "user@example.com",
            "name": "User"
        }
        
        # Mock no existing OAuth connection
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()
        
        # Generate valid state
        valid_state = service.generate_oauth_state()
        
        with patch.object(service, '_exchange_code_for_token', return_value=mock_token_data):
            with patch.object(service, '_get_user_profile', return_value=mock_profile):
                result = await service.link_oauth_account(
                    user_id=user_id,
                    provider="github",
                    code="auth_code",
                    redirect_uri="http://localhost/callback",
                    client_id="client_id",
                    client_secret="client_secret",
                    state=valid_state
                )
        
        assert result is True
        assert mock_db.add.called
        assert mock_db.commit.called
    
    @pytest.mark.asyncio
    async def test_link_update_existing_oauth_same_user(self):
        """Test updating existing OAuth connection for same user"""
        mock_db = AsyncMock()
        service = OAuthService(mock_db)
        
        user_id = str(uuid.uuid4())
        
        # Mock token exchange
        mock_token_data = {
            "access_token": "updated_access_token",
            "refresh_token": "updated_refresh_token",
            "expires_in": 7200
        }
        
        # Mock profile
        mock_profile = {
            "id": "existing_provider_user",
            "email": "user@example.com",
            "name": "User"
        }
        
        # Mock existing OAuth connection for same user
        mock_existing_conn = MagicMock()
        mock_existing_conn.user_id = user_id
        mock_existing_conn.access_token = "old_token"
        mock_existing_conn.refresh_token = "old_refresh"
        mock_existing_conn.token_expires_at = None
        mock_existing_conn.profile_data = "{}"
        mock_existing_conn.updated_at = None
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_existing_conn
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.commit = AsyncMock()
        
        # Generate valid state
        valid_state = service.generate_oauth_state()
        
        with patch.object(service, '_exchange_code_for_token', return_value=mock_token_data):
            with patch.object(service, '_get_user_profile', return_value=mock_profile):
                result = await service.link_oauth_account(
                    user_id=user_id,
                    provider="google",
                    code="auth_code",
                    redirect_uri="http://localhost/callback",
                    client_id="client_id",
                    client_secret="client_secret",
                    state=valid_state
                )
        
        assert result is True
        # Verify token was updated
        assert mock_existing_conn.access_token == "updated_access_token"
        assert mock_existing_conn.refresh_token == "updated_refresh_token"
        assert mock_db.commit.called
    
    @pytest.mark.asyncio
    async def test_link_fails_when_linked_to_another_user(self):
        """Test linking fails when OAuth is already linked to another user"""
        mock_db = AsyncMock()
        service = OAuthService(mock_db)
        
        user_id = str(uuid.uuid4())
        another_user_id = str(uuid.uuid4())
        
        # Mock token exchange
        mock_token_data = {
            "access_token": "access_token",
            "refresh_token": "refresh_token",
            "expires_in": 3600
        }
        
        # Mock profile
        mock_profile = {
            "id": "provider_user_linked_to_another",
            "email": "other@example.com",
            "name": "Other User"
        }
        
        # Mock existing OAuth connection for different user
        mock_existing_conn = MagicMock()
        mock_existing_conn.user_id = another_user_id  # Different user
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_existing_conn
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        # Generate valid state
        valid_state = service.generate_oauth_state()
        
        with patch.object(service, '_exchange_code_for_token', return_value=mock_token_data):
            with patch.object(service, '_get_user_profile', return_value=mock_profile):
                with pytest.raises(ValueError, match="already linked to another user"):
                    await service.link_oauth_account(
                        user_id=user_id,
                        provider="google",
                        code="auth_code",
                        redirect_uri="http://localhost/callback",
                        client_id="client_id",
                        client_secret="client_secret",
                        state=valid_state
                    )
