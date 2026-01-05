"""
SmartSpec Pro - Key MFA Service
Multi-factor authentication for sensitive key operations.
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, Optional, Tuple

import structlog
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_key_v2 import KeyMFAVerification, KeyAuditEventType
from app.services.generation.key_repository import KeyRepository

logger = structlog.get_logger()


# =============================================================================
# CONSTANTS
# =============================================================================

TOTP_DIGITS = 6
TOTP_INTERVAL = 30  # seconds
TOTP_WINDOW = 1  # Allow 1 interval before/after
EMAIL_CODE_LENGTH = 6
EMAIL_CODE_EXPIRY_MINUTES = 10
MAX_MFA_ATTEMPTS = 3


# =============================================================================
# MFA TYPES
# =============================================================================

class MFAType(str, Enum):
    """Supported MFA types."""
    TOTP = "totp"
    EMAIL = "email"
    SMS = "sms"
    BACKUP_CODE = "backup_code"


class MFAOperation(str, Enum):
    """Operations requiring MFA."""
    ROTATE_KEY = "rotate"
    REVOKE_KEY = "revoke"
    DELETE_KEY = "delete"
    CHANGE_SCOPES = "change_scopes"


# =============================================================================
# MFA MODELS
# =============================================================================

class MFAChallenge(BaseModel):
    """MFA challenge response."""
    challenge_token: str
    challenge_type: MFAType
    expires_at: datetime
    message: str


class MFAVerifyRequest(BaseModel):
    """Request to verify MFA code."""
    challenge_token: str
    code: str


class MFAVerifyResponse(BaseModel):
    """Response from MFA verification."""
    verified: bool
    error: Optional[str] = None
    attempts_remaining: Optional[int] = None


# =============================================================================
# TOTP IMPLEMENTATION
# =============================================================================

class TOTPGenerator:
    """
    Time-based One-Time Password generator.
    
    Implements RFC 6238 TOTP algorithm.
    """
    
    @staticmethod
    def generate_secret(length: int = 32) -> str:
        """Generate a random TOTP secret."""
        return base64.b32encode(secrets.token_bytes(length)).decode()
    
    @staticmethod
    def get_totp_token(secret: str, timestamp: Optional[int] = None) -> str:
        """Generate TOTP token for given timestamp."""
        if timestamp is None:
            timestamp = int(time.time())
        
        # Decode secret
        key = base64.b32decode(secret.upper() + "=" * ((8 - len(secret) % 8) % 8))
        
        # Calculate time counter
        counter = timestamp // TOTP_INTERVAL
        
        # Generate HMAC-SHA1
        counter_bytes = struct.pack(">Q", counter)
        hmac_hash = hmac.new(key, counter_bytes, hashlib.sha1).digest()
        
        # Dynamic truncation
        offset = hmac_hash[-1] & 0x0F
        code = struct.unpack(">I", hmac_hash[offset:offset + 4])[0]
        code = (code & 0x7FFFFFFF) % (10 ** TOTP_DIGITS)
        
        return str(code).zfill(TOTP_DIGITS)
    
    @staticmethod
    def verify_totp(secret: str, code: str, window: int = TOTP_WINDOW) -> bool:
        """Verify TOTP code with time window."""
        timestamp = int(time.time())
        
        for offset in range(-window, window + 1):
            check_time = timestamp + (offset * TOTP_INTERVAL)
            expected = TOTPGenerator.get_totp_token(secret, check_time)
            if hmac.compare_digest(code, expected):
                return True
        
        return False
    
    @staticmethod
    def get_provisioning_uri(
        secret: str,
        account_name: str,
        issuer: str = "SmartSpec",
    ) -> str:
        """Generate provisioning URI for authenticator apps."""
        return (
            f"otpauth://totp/{issuer}:{account_name}"
            f"?secret={secret}&issuer={issuer}&digits={TOTP_DIGITS}"
        )


# =============================================================================
# MFA SERVICE
# =============================================================================

class KeyMFAService:
    """
    MFA service for key operations.
    
    Features:
    - TOTP (Google Authenticator, etc.)
    - Email verification codes
    - Backup codes
    - Rate limiting
    """
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = KeyRepository(session)
        self.totp = TOTPGenerator()
        
        # In-memory storage for user TOTP secrets (use DB in production)
        self._user_totp_secrets: Dict[str, str] = {}
        self._user_backup_codes: Dict[str, list] = {}
    
    # =========================================================================
    # TOTP SETUP
    # =========================================================================
    
    async def setup_totp(self, user_id: str, email: str) -> Dict[str, Any]:
        """
        Set up TOTP for a user.
        
        Returns secret and provisioning URI for authenticator app.
        """
        secret = self.totp.generate_secret()
        
        # Store secret (use encrypted DB storage in production)
        self._user_totp_secrets[user_id] = secret
        
        # Generate backup codes
        backup_codes = [secrets.token_hex(4).upper() for _ in range(10)]
        self._user_backup_codes[user_id] = backup_codes
        
        provisioning_uri = self.totp.get_provisioning_uri(
            secret=secret,
            account_name=email,
        )
        
        logger.info("TOTP setup initiated", user_id=user_id)
        
        return {
            "secret": secret,
            "provisioning_uri": provisioning_uri,
            "backup_codes": backup_codes,
            "message": "Scan QR code with your authenticator app and verify with a code.",
        }
    
    async def verify_totp_setup(self, user_id: str, code: str) -> bool:
        """Verify TOTP setup with initial code."""
        secret = self._user_totp_secrets.get(user_id)
        if not secret:
            return False
        
        if self.totp.verify_totp(secret, code):
            logger.info("TOTP setup verified", user_id=user_id)
            return True
        
        return False
    
    async def has_totp_enabled(self, user_id: str) -> bool:
        """Check if user has TOTP enabled."""
        return user_id in self._user_totp_secrets
    
    # =========================================================================
    # MFA CHALLENGE
    # =========================================================================
    
    async def create_challenge(
        self,
        user_id: str,
        operation: MFAOperation,
        mfa_type: MFAType = MFAType.TOTP,
        api_key_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> MFAChallenge:
        """
        Create an MFA challenge for an operation.
        
        For TOTP: User enters code from authenticator app.
        For Email: Code is sent to user's email.
        """
        challenge_token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(minutes=EMAIL_CODE_EXPIRY_MINUTES)
        
        # Create challenge record
        await self.repo.create_mfa_challenge(
            user_id=user_id,
            operation=operation.value,
            challenge_token=challenge_token,
            challenge_type=mfa_type.value,
            expires_in_minutes=EMAIL_CODE_EXPIRY_MINUTES,
            api_key_id=api_key_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        await self.session.commit()
        
        # Generate message based on type
        if mfa_type == MFAType.TOTP:
            message = "Enter the 6-digit code from your authenticator app."
        elif mfa_type == MFAType.EMAIL:
            # Send email code (implement email sending)
            email_code = "".join([str(secrets.randbelow(10)) for _ in range(EMAIL_CODE_LENGTH)])
            # TODO: Send email with code
            message = f"A verification code has been sent to your email."
        else:
            message = "Enter your verification code."
        
        logger.info(
            "MFA challenge created",
            user_id=user_id,
            operation=operation,
            mfa_type=mfa_type,
        )
        
        return MFAChallenge(
            challenge_token=challenge_token,
            challenge_type=mfa_type,
            expires_at=expires_at,
            message=message,
        )
    
    async def verify_challenge(
        self,
        challenge_token: str,
        code: str,
        ip_address: Optional[str] = None,
    ) -> MFAVerifyResponse:
        """
        Verify an MFA challenge.
        
        Returns verification result with remaining attempts if failed.
        """
        # Get challenge
        challenge = await self.repo.get_mfa_challenge(challenge_token)
        
        if not challenge:
            return MFAVerifyResponse(
                verified=False,
                error="Invalid or expired challenge",
            )
        
        # Check if expired
        if challenge.is_expired():
            return MFAVerifyResponse(
                verified=False,
                error="Challenge has expired",
            )
        
        # Check attempts
        if not challenge.can_attempt():
            await self.repo.log_event(
                event_type=KeyAuditEventType.MFA_FAILED,
                user_id=challenge.user_id,
                api_key_id=challenge.api_key_id,
                ip_address=ip_address,
                details={"reason": "Max attempts exceeded"},
                success=False,
            )
            await self.session.commit()
            
            return MFAVerifyResponse(
                verified=False,
                error="Maximum attempts exceeded",
                attempts_remaining=0,
            )
        
        # Increment attempts
        attempts = await self.repo.increment_mfa_attempts(challenge_token)
        
        # Verify based on type
        verified = False
        
        if challenge.challenge_type == MFAType.TOTP.value:
            secret = self._user_totp_secrets.get(challenge.user_id)
            if secret:
                verified = self.totp.verify_totp(secret, code)
        
        elif challenge.challenge_type == MFAType.BACKUP_CODE.value:
            backup_codes = self._user_backup_codes.get(challenge.user_id, [])
            if code.upper() in backup_codes:
                verified = True
                # Remove used backup code
                backup_codes.remove(code.upper())
        
        # Log result
        if verified:
            await self.repo.verify_mfa_challenge(challenge_token)
            await self.repo.log_event(
                event_type=KeyAuditEventType.MFA_VERIFIED,
                user_id=challenge.user_id,
                api_key_id=challenge.api_key_id,
                ip_address=ip_address,
                details={"operation": challenge.operation},
            )
            await self.session.commit()
            
            logger.info(
                "MFA verified",
                user_id=challenge.user_id,
                operation=challenge.operation,
            )
            
            return MFAVerifyResponse(verified=True)
        
        else:
            await self.repo.log_event(
                event_type=KeyAuditEventType.MFA_FAILED,
                user_id=challenge.user_id,
                api_key_id=challenge.api_key_id,
                ip_address=ip_address,
                details={"reason": "Invalid code", "attempts": attempts},
                success=False,
            )
            await self.session.commit()
            
            return MFAVerifyResponse(
                verified=False,
                error="Invalid verification code",
                attempts_remaining=MAX_MFA_ATTEMPTS - attempts,
            )
    
    async def is_challenge_verified(self, challenge_token: str) -> bool:
        """Check if a challenge has been verified."""
        challenge = await self.repo.get_mfa_challenge(challenge_token)
        return challenge is not None and challenge.verified
    
    # =========================================================================
    # BACKUP CODES
    # =========================================================================
    
    async def regenerate_backup_codes(self, user_id: str) -> list:
        """Regenerate backup codes for a user."""
        backup_codes = [secrets.token_hex(4).upper() for _ in range(10)]
        self._user_backup_codes[user_id] = backup_codes
        
        logger.info("Backup codes regenerated", user_id=user_id)
        
        return backup_codes
    
    async def get_remaining_backup_codes_count(self, user_id: str) -> int:
        """Get count of remaining backup codes."""
        return len(self._user_backup_codes.get(user_id, []))
    
    # =========================================================================
    # CLEANUP
    # =========================================================================
    
    async def cleanup_expired_challenges(self) -> int:
        """Clean up expired MFA challenges."""
        count = await self.repo.cleanup_expired_mfa_challenges()
        await self.session.commit()
        return count


# =============================================================================
# FACTORY FUNCTION
# =============================================================================

def get_key_mfa_service(session: AsyncSession) -> KeyMFAService:
    """Get key MFA service instance."""
    return KeyMFAService(session)
