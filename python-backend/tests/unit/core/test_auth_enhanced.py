"""
Unit Tests for Enhanced Authentication Module
Tests JWT token generation, validation, and password hashing
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta
from jose import jwt

from app.core.auth_enhanced import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    SECRET_KEY,
    JWT_SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS
)


class TestPasswordHashing:
    """Test password hashing functions"""
    
    def test_get_password_hash(self):
        """Test password hashing"""
        password = "SecurePassword123!"
        hashed = get_password_hash(password)
        
        assert hashed is not None
        assert hashed != password
        assert len(hashed) > 0
    
    def test_verify_password_correct(self):
        """Test verifying correct password"""
        password = "SecurePassword123!"
        hashed = get_password_hash(password)
        
        result = verify_password(password, hashed)
        
        assert result is True
    
    def test_verify_password_incorrect(self):
        """Test verifying incorrect password"""
        password = "SecurePassword123!"
        wrong_password = "WrongPassword456!"
        hashed = get_password_hash(password)
        
        result = verify_password(wrong_password, hashed)
        
        assert result is False
    
    def test_hash_is_unique(self):
        """Test that hashing same password produces different hashes"""
        password = "SecurePassword123!"
        hash1 = get_password_hash(password)
        hash2 = get_password_hash(password)
        
        # Bcrypt includes salt, so hashes should be different
        assert hash1 != hash2
        
        # But both should verify correctly
        assert verify_password(password, hash1)
        assert verify_password(password, hash2)


class TestAccessToken:
    """Test access token generation"""
    
    def test_create_access_token_basic(self):
        """Test creating basic access token"""
        data = {"user_id": "123", "email": "test@example.com"}
        
        token = create_access_token(data)
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0
    
    def test_create_access_token_with_expiry(self):
        """Test creating access token with custom expiry"""
        data = {"user_id": "123", "email": "test@example.com"}
        expires_delta = timedelta(hours=2)
        
        token = create_access_token(data, expires_delta=expires_delta)
        
        assert token is not None
        
        # Decode and verify expiry
        decoded = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        assert "exp" in decoded
    
    def test_access_token_contains_data(self):
        """Test that access token contains encoded data"""
        data = {"user_id": "123", "email": "test@example.com"}
        
        token = create_access_token(data)
        decoded = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        
        assert decoded["user_id"] == "123"
        assert decoded["email"] == "test@example.com"
        assert decoded["type"] == "access"
    
    def test_access_token_has_timestamps(self):
        """Test that access token has iat and exp timestamps"""
        data = {"user_id": "123"}
        
        token = create_access_token(data)
        decoded = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        
        assert "iat" in decoded
        assert "exp" in decoded
        assert decoded["exp"] > decoded["iat"]


class TestRefreshToken:
    """Test refresh token generation"""
    
    def test_create_refresh_token_basic(self):
        """Test creating basic refresh token"""
        data = {"user_id": "123"}
        
        token = create_refresh_token(data)
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0
    
    def test_refresh_token_contains_data(self):
        """Test that refresh token contains encoded data"""
        data = {"user_id": "123"}
        
        token = create_refresh_token(data)
        decoded = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        
        assert decoded["user_id"] == "123"
        assert decoded["type"] == "refresh"
    
    def test_refresh_token_longer_expiry(self):
        """Test that refresh token has longer expiry than access token"""
        data = {"user_id": "123"}
        
        access_token = create_access_token(data)
        refresh_token = create_refresh_token(data)
        
        access_decoded = jwt.decode(access_token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        refresh_decoded = jwt.decode(refresh_token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        
        # Refresh token should expire later
        assert refresh_decoded["exp"] > access_decoded["exp"]


class TestTokenValidation:
    """Test token validation"""
    
    def test_valid_token_decodes(self):
        """Test that valid token can be decoded"""
        data = {"user_id": "123", "email": "test@example.com"}
        token = create_access_token(data)
        
        decoded = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        
        assert decoded is not None
        assert decoded["user_id"] == "123"
    
    def test_invalid_token_fails(self):
        """Test that invalid token raises error"""
        invalid_token = "invalid.token.here"
        
        with pytest.raises(Exception):
            jwt.decode(invalid_token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
    
    def test_wrong_secret_fails(self):
        """Test that token with wrong secret fails"""
        data = {"user_id": "123"}
        token = create_access_token(data)
        
        with pytest.raises(Exception):
            jwt.decode(token, "wrong_secret", algorithms=[ALGORITHM])


class TestTokenExpiration:
    """Test token expiration"""
    
    def test_expired_token_fails(self):
        """Test that expired token raises error"""
        data = {"user_id": "123"}
        # Create token that expires immediately
        expires_delta = timedelta(seconds=-1)
        
        token = create_access_token(data, expires_delta=expires_delta)
        
        with pytest.raises(Exception):
            jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
    
    def test_default_access_token_expiry(self):
        """Test default access token expiry time"""
        assert ACCESS_TOKEN_EXPIRE_MINUTES > 0
    
    def test_default_refresh_token_expiry(self):
        """Test default refresh token expiry time"""
        assert REFRESH_TOKEN_EXPIRE_DAYS > 0


class TestSecurityConstants:
    """Test security constants"""
    
    def test_secret_key_exists(self):
        """Test that SECRET_KEY is set"""
        assert SECRET_KEY is not None
        assert len(SECRET_KEY) > 0
    
    def test_jwt_secret_key_exists(self):
        """Test that JWT_SECRET_KEY is set"""
        assert JWT_SECRET_KEY is not None
        assert len(JWT_SECRET_KEY) > 0
    
    def test_algorithm_is_secure(self):
        """Test that algorithm is HS256"""
        assert ALGORITHM == "HS256"


class TestTokenTypes:
    """Test token type differentiation"""
    
    def test_access_token_type(self):
        """Test that access token has correct type"""
        data = {"user_id": "123"}
        token = create_access_token(data)
        decoded = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        
        assert decoded["type"] == "access"
    
    def test_refresh_token_type(self):
        """Test that refresh token has correct type"""
        data = {"user_id": "123"}
        token = create_refresh_token(data)
        decoded = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        
        assert decoded["type"] == "refresh"
    
    def test_different_token_types(self):
        """Test that access and refresh tokens have different types"""
        data = {"user_id": "123"}
        
        access_token = create_access_token(data)
        refresh_token = create_refresh_token(data)
        
        access_decoded = jwt.decode(access_token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        refresh_decoded = jwt.decode(refresh_token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        
        assert access_decoded["type"] != refresh_decoded["type"]
