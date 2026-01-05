'''
# R17: Additional Security Tests for New Features

- Test RS256 JWT signature and verification.
- Test OAuth state token generation and validation (CSRF protection).
- Test secure password reset flow (hashed tokens, one-time use).
'''

import pytest
from datetime import datetime, timedelta
from itsdangerous import URLSafeTimedSerializer

from app.core.security import (
    create_access_token,
    decode_token,
    get_password_hash,
    verify_password,
    JWT_ALGORITHM,
    JWT_PUBLIC_KEY,
    JWT_PRIVATE_KEY
)
from app.services.oauth_service import state_serializer
from app.models.password_reset import PasswordResetToken


# --- R8: Test RS256 JWT --- #

def test_jwt_rs256_signature():
    """Tests that tokens are created with RS256 and can be decoded."""
    user_id = "testuser123"
    token = create_access_token(data={"user_id": user_id})
    
    # Decode with the public key
    payload = decode_token(token)
    
    assert payload is not None
    assert payload["user_id"] == user_id
    
    # Try to decode with the wrong key (should fail)
    with pytest.raises(Exception):
        # A simple symmetric key should not work
        decode_token(token, key="wrong_key")

# --- R11: Test OAuth State (CSRF Protection) --- #

def test_oauth_state_token_generation_and_validation():
    """Tests that the state token is correctly generated and validated."""
    state = state_serializer.dumps("test_state_value")
    
    # Load the state, should be successful
    loaded_state = state_serializer.loads(state, max_age=60)
    assert loaded_state == "test_state_value"

    # Test with tampered state (should fail)
    with pytest.raises(Exception):
        state_serializer.loads(state + "tampered")

    # Test with expired state (should fail)
        # Test with expired state (should fail)
    # Test with expired state (should fail)
        # Test with expired state (should fail)
    with pytest.raises(Exception):
        state = state_serializer.dumps("expired_value")
        # Load with a max_age of -1, which will cause it to fail
        state_serializer.loads(state, max_age=-1)


# --- R12: Test Secure Password Reset --- #

@pytest.mark.asyncio
async def test_password_reset_token_one_time_use():
    """Tests that a password reset token can only be used once."""
    token_value = "my_secure_reset_token"
    token_hash = get_password_hash(token_value)
    
    reset_token = PasswordResetToken(
        id="reset123",
        user_id="user123",
        token_hash=token_hash,
        expires_at=datetime.utcnow() + timedelta(hours=1)
    )
    
    # 1. Token should be valid initially
    assert reset_token.is_valid() is True
    
    # 2. Mark as used
    reset_token.used_at = datetime.utcnow()
    
    # 3. Token should now be invalid
    assert reset_token.is_valid() is False

@pytest.mark.asyncio
async def test_password_reset_token_expiry():
    """Tests that an expired password reset token is invalid."""
    token_value = "another_reset_token"
    token_hash = get_password_hash(token_value)
    
    reset_token = PasswordResetToken(
        id="reset456",
        user_id="user456",
        token_hash=token_hash,
        # Set expiry in the past
        expires_at=datetime.utcnow() - timedelta(minutes=1)
    )
    
    assert reset_token.is_valid() is False
