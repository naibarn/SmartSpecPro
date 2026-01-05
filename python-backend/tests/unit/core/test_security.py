"""
Unit Tests for Security Module
Tests password hashing, JWT tokens, and security utilities
"""

import pytest
from datetime import timedelta
import uuid

from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    add_to_blacklist,
    is_token_blacklisted
)


class TestPasswordHashing:
    """Test password hashing functions"""
    
    def test_hash_password(self):
        """Test password hashing"""
        password = "SecurePassword123!"
        
        hashed = get_password_hash(password)
        
        assert hashed is not None
        assert hashed != password
        assert len(hashed) > 20
    
    def test_hash_different_for_same_password(self):
        """Test that same password produces different hashes (salting)"""
        password = "SecurePassword123!"
        
        hash1 = get_password_hash(password)
        hash2 = get_password_hash(password)
        
        # Hashes should be different due to random salt
        assert hash1 != hash2
    
    def test_verify_correct_password(self):
        """Test verifying correct password"""
        password = "SecurePassword123!"
        hashed = get_password_hash(password)
        
        result = verify_password(password, hashed)
        
        assert result is True
    
    def test_verify_incorrect_password(self):
        """Test verifying incorrect password"""
        password = "SecurePassword123!"
        wrong_password = "WrongPassword456!"
        hashed = get_password_hash(password)
        
        result = verify_password(wrong_password, hashed)
        
        assert result is False
    
    def test_verify_empty_password(self):
        """Test verifying empty password"""
        password = "SecurePassword123!"
        hashed = get_password_hash(password)
        
        result = verify_password("", hashed)
        
        assert result is False


class TestJWTTokens:
    """Test JWT token functions"""
    
    def test_create_access_token(self):
        """Test creating access token"""
        data = {"sub": str(uuid.uuid4()), "email": "test@example.com"}
        
        token = create_access_token(data)
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 50
    
    def test_create_access_token_with_expiry(self):
        """Test creating access token with custom expiry"""
        data = {"sub": str(uuid.uuid4()), "email": "test@example.com"}
        expires = timedelta(hours=1)
        
        token = create_access_token(data, expires)
        
        assert token is not None
        assert isinstance(token, str)
    
    def test_create_refresh_token(self):
        """Test creating refresh token"""
        data = {"sub": str(uuid.uuid4()), "email": "test@example.com"}
        
        token = create_refresh_token(data)
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 50
    
    def test_decode_valid_token(self):
        """Test decoding valid token"""
        user_id = str(uuid.uuid4())
        email = "test@example.com"
        data = {"sub": user_id, "email": email}
        
        token = create_access_token(data)
        payload = decode_token(token)
        
        assert payload is not None
        assert payload.get("email") == email
    
    def test_decode_invalid_token(self):
        """Test decoding invalid token"""
        payload = decode_token("invalid_token")
        
        assert payload is None
    
    def test_decode_expired_token(self):
        """Test decoding expired token"""
        data = {"sub": str(uuid.uuid4()), "email": "test@example.com"}
        # Create token that expires immediately
        token = create_access_token(data, timedelta(seconds=-1))
        
        payload = decode_token(token)
        
        assert payload is None
    
    def test_access_and_refresh_tokens_different(self):
        """Test that access and refresh tokens are different"""
        data = {"sub": str(uuid.uuid4()), "email": "test@example.com"}
        
        access_token = create_access_token(data)
        refresh_token = create_refresh_token(data)
        
        assert access_token != refresh_token


class TestTokenBlacklist:
    """Test token blacklist functions"""
    
    def test_add_to_blacklist(self):
        """Test adding token to blacklist"""
        jti = str(uuid.uuid4())
        
        # Should not raise
        add_to_blacklist(jti)
    
    def test_is_token_blacklisted_not_blacklisted(self):
        """Test checking non-blacklisted token"""
        jti = str(uuid.uuid4())
        
        result = is_token_blacklisted(jti)
        
        assert result is False
    
    def test_is_token_blacklisted_after_adding(self):
        """Test checking blacklisted token"""
        jti = str(uuid.uuid4())
        
        add_to_blacklist(jti)
        result = is_token_blacklisted(jti)
        
        assert result is True
    
    def test_blacklist_multiple_tokens(self):
        """Test blacklisting multiple tokens"""
        jti1 = str(uuid.uuid4())
        jti2 = str(uuid.uuid4())
        jti3 = str(uuid.uuid4())
        
        add_to_blacklist(jti1)
        add_to_blacklist(jti2)
        
        assert is_token_blacklisted(jti1) is True
        assert is_token_blacklisted(jti2) is True
        assert is_token_blacklisted(jti3) is False
