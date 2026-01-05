"""
SmartSpec Pro - Key Management Service
Production-ready service with database persistence.
"""

import base64
import hashlib
import os
import secrets
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import structlog
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.api_key_v2 import (
    APIKeyV2, APIKeyVersion, KeyAuditLog,
    KeyStatus, KeyVersionStatus, KeyAuditEventType
)
from app.services.generation.key_repository import KeyRepository

logger = structlog.get_logger()


# =============================================================================
# CONSTANTS
# =============================================================================

PBKDF2_ITERATIONS = 310000
SALT_LENGTH = 32
DEFAULT_GRACE_PERIOD_HOURS = 24
MAX_KEY_VERSIONS = 5
MAX_ROTATIONS_PER_HOUR = 3


# =============================================================================
# ENCRYPTION UTILITIES
# =============================================================================

class KeyEncryption:
    """Handles encryption/decryption of API keys."""
    
    def __init__(self, master_key: Optional[str] = None):
        self.master_key = master_key or getattr(settings, 'ENCRYPTION_MASTER_KEY', None)
        if not self.master_key:
            # Generate a default key for development (NOT for production!)
            self.master_key = "dev_master_key_32_characters_long"
            logger.warning("Using default encryption key - NOT FOR PRODUCTION!")
    
    def _derive_key(self, salt: bytes) -> bytes:
        """Derive encryption key from master key using PBKDF2."""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=PBKDF2_ITERATIONS,
        )
        return kdf.derive(self.master_key.encode())
    
    def encrypt(self, plaintext: str) -> Tuple[str, str]:
        """Encrypt with unique salt. Returns (ciphertext, salt)."""
        salt = os.urandom(SALT_LENGTH)
        derived_key = self._derive_key(salt)
        fernet_key = base64.urlsafe_b64encode(derived_key)
        fernet = Fernet(fernet_key)
        encrypted = fernet.encrypt(plaintext.encode())
        
        return (
            base64.urlsafe_b64encode(encrypted).decode(),
            base64.urlsafe_b64encode(salt).decode()
        )
    
    def decrypt(self, ciphertext: str, salt: str) -> str:
        """Decrypt using the provided salt."""
        salt_bytes = base64.urlsafe_b64decode(salt.encode())
        derived_key = self._derive_key(salt_bytes)
        fernet_key = base64.urlsafe_b64encode(derived_key)
        fernet = Fernet(fernet_key)
        encrypted = base64.urlsafe_b64decode(ciphertext.encode())
        decrypted = fernet.decrypt(encrypted)
        return decrypted.decode()
    
    @staticmethod
    def hash_key(key: str) -> str:
        """Create SHA256 hash of a key."""
        return hashlib.sha256(key.encode()).hexdigest()
    
    @staticmethod
    def generate_api_key(prefix: str = "ss_live_") -> str:
        """Generate a cryptographically secure API key."""
        random_part = secrets.token_urlsafe(32)
        return f"{prefix}{random_part}"


# =============================================================================
# KEY MANAGEMENT SERVICE
# =============================================================================

class KeyManagementService:
    """
    Production key management service with database persistence.
    
    Features:
    - Secure key generation and storage
    - Key versioning with grace periods
    - Comprehensive audit logging
    - Rate limiting on sensitive operations
    """
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = KeyRepository(session)
        self.encryption = KeyEncryption()
    
    # =========================================================================
    # KEY CREATION
    # =========================================================================
    
    async def create_key(
        self,
        user_id: str,
        name: str,
        scopes: List[str],
        project_id: Optional[str] = None,
        description: Optional[str] = None,
        expires_in_days: Optional[int] = None,
        rate_limit_per_minute: int = 60,
        rotation_enabled: bool = False,
        rotation_interval_days: int = 90,
        mfa_required: bool = True,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new API key.
        
        Returns the key only once - it cannot be retrieved again.
        """
        # Generate key
        api_key = self.encryption.generate_api_key()
        key_hash = self.encryption.hash_key(api_key)
        encrypted_key, salt = self.encryption.encrypt(api_key)
        
        # Calculate expiration
        expires_at = None
        if expires_in_days:
            expires_at = datetime.utcnow() + timedelta(days=expires_in_days)
        
        # Create key record
        key = await self.repo.create_key(
            user_id=user_id,
            name=name,
            key_prefix=api_key[:12],
            scopes=scopes,
            project_id=project_id,
            description=description,
            rate_limit_per_minute=rate_limit_per_minute,
            rate_limit_per_day=rate_limit_per_minute * 60 * 24,
            expires_at=expires_at,
            rotation_enabled=rotation_enabled,
            rotation_interval_days=rotation_interval_days,
            mfa_required_for_rotation=mfa_required,
        )
        
        # Create initial version
        version = await self.repo.create_version(
            api_key_id=key.id,
            version=1,
            key_hash=key_hash,
            encrypted_key=encrypted_key,
            salt=salt,
            is_primary=True,
        )
        
        # Log audit event
        await self.repo.log_event(
            event_type=KeyAuditEventType.KEY_CREATED,
            user_id=user_id,
            api_key_id=key.id,
            key_version=1,
            ip_address=ip_address,
            user_agent=user_agent,
            details={
                "name": name,
                "scopes": scopes,
                "expires_in_days": expires_in_days,
                "rotation_enabled": rotation_enabled,
            },
        )
        
        await self.session.commit()
        
        logger.info(
            "API key created",
            key_id=key.id,
            user_id=user_id,
            name=name,
        )
        
        return {
            "id": key.id,
            "name": name,
            "key": api_key,  # Only returned once!
            "key_prefix": api_key[:12],
            "version": 1,
            "scopes": scopes,
            "created_at": key.created_at.isoformat(),
            "expires_at": expires_at.isoformat() if expires_at else None,
        }
    
    # =========================================================================
    # KEY ROTATION
    # =========================================================================
    
    async def rotate_key(
        self,
        key_id: str,
        user_id: str,
        grace_period_hours: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        mfa_token: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Rotate an API key with grace period.
        
        The old key remains valid during the grace period.
        """
        # Get key
        key = await self.repo.get_key_by_id(key_id, include_versions=True)
        if not key:
            return None
        
        # Verify ownership
        if key.user_id != user_id:
            await self.repo.log_event(
                event_type=KeyAuditEventType.KEY_ROTATED,
                user_id=user_id,
                api_key_id=key_id,
                ip_address=ip_address,
                success=False,
                error_message="Unauthorized rotation attempt",
                risk_score=80,
                is_suspicious=True,
            )
            await self.session.commit()
            return None
        
        # Check MFA if required
        if key.mfa_required_for_rotation and not mfa_token:
            return {"error": "mfa_required", "message": "MFA verification required for rotation"}
        
        # Rate limit check
        recent_rotations = await self.repo.count_recent_events(
            user_id=user_id,
            event_type=KeyAuditEventType.KEY_ROTATED,
            hours=1,
        )
        
        if recent_rotations >= MAX_ROTATIONS_PER_HOUR:
            await self.repo.log_event(
                event_type=KeyAuditEventType.KEY_ROTATED,
                user_id=user_id,
                api_key_id=key_id,
                ip_address=ip_address,
                success=False,
                error_message="Rate limit exceeded",
            )
            await self.session.commit()
            return {"error": "rate_limited", "message": "Too many rotations. Please wait."}
        
        # Determine grace period
        if grace_period_hours is None:
            grace_period_hours = key.rotation_grace_period_hours or DEFAULT_GRACE_PERIOD_HOURS
        
        grace_period_ends = datetime.utcnow() + timedelta(hours=grace_period_hours)
        
        # Generate new key
        new_api_key = self.encryption.generate_api_key()
        new_key_hash = self.encryption.hash_key(new_api_key)
        new_encrypted_key, new_salt = self.encryption.encrypt(new_api_key)
        
        # Get current version number
        current_version = key.current_version
        new_version_num = current_version + 1
        
        # Set grace period on old primary version
        for version in key.versions:
            if version.status == KeyVersionStatus.PRIMARY:
                await self.repo.set_version_grace_period(
                    version_id=version.id,
                    grace_period_hours=grace_period_hours,
                )
        
        # Create new version
        new_version = await self.repo.create_version(
            api_key_id=key.id,
            version=new_version_num,
            key_hash=new_key_hash,
            encrypted_key=new_encrypted_key,
            salt=new_salt,
            is_primary=True,
        )
        
        # Update key
        await self.repo.update_key(
            key_id=key.id,
            current_version=new_version_num,
            key_prefix=new_api_key[:12],
            last_rotation_at=datetime.utcnow(),
            next_rotation_at=(
                datetime.utcnow() + timedelta(days=key.rotation_interval_days)
                if key.rotation_enabled else None
            ),
        )
        
        # Log audit events
        await self.repo.log_event(
            event_type=KeyAuditEventType.KEY_ROTATED,
            user_id=user_id,
            api_key_id=key.id,
            key_version=new_version_num,
            ip_address=ip_address,
            user_agent=user_agent,
            details={
                "previous_version": current_version,
                "grace_period_hours": grace_period_hours,
                "grace_period_ends_at": grace_period_ends.isoformat(),
            },
        )
        
        await self.repo.log_event(
            event_type=KeyAuditEventType.GRACE_PERIOD_STARTED,
            user_id=user_id,
            api_key_id=key.id,
            key_version=current_version,
            details={"ends_at": grace_period_ends.isoformat()},
        )
        
        await self.session.commit()
        
        logger.info(
            "API key rotated",
            key_id=key.id,
            user_id=user_id,
            new_version=new_version_num,
            grace_period_hours=grace_period_hours,
        )
        
        return {
            "id": key.id,
            "name": key.name,
            "key": new_api_key,  # Only returned once!
            "key_prefix": new_api_key[:12],
            "version": new_version_num,
            "previous_version": current_version,
            "grace_period_ends_at": grace_period_ends.isoformat(),
            "created_at": new_version.created_at.isoformat(),
        }
    
    # =========================================================================
    # KEY VALIDATION
    # =========================================================================
    
    async def validate_key(
        self,
        api_key: str,
        required_scope: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Validate an API key.
        
        Supports multiple active versions during grace periods.
        """
        key_hash = self.encryption.hash_key(api_key)
        
        # Find version by hash
        version = await self.repo.get_version_by_hash(key_hash)
        
        if not version:
            await self.repo.log_event(
                event_type=KeyAuditEventType.KEY_VALIDATION_FAILED,
                user_id="unknown",
                ip_address=ip_address,
                user_agent=user_agent,
                details={"reason": "Key not found", "key_prefix": api_key[:12]},
                success=False,
            )
            await self.session.commit()
            return None
        
        key = version.api_key
        
        # Check key status
        if key.status != KeyStatus.ACTIVE:
            await self.repo.log_event(
                event_type=KeyAuditEventType.KEY_VALIDATION_FAILED,
                user_id=key.user_id,
                api_key_id=key.id,
                key_version=version.version,
                ip_address=ip_address,
                details={"reason": f"Key status: {key.status.value}"},
                success=False,
            )
            await self.session.commit()
            return None
        
        # Check version status
        if not version.is_valid():
            # If grace period expired, deactivate
            if version.status == KeyVersionStatus.GRACE_PERIOD:
                await self.repo.deactivate_version(version.id)
                await self.repo.log_event(
                    event_type=KeyAuditEventType.GRACE_PERIOD_ENDED,
                    user_id=key.user_id,
                    api_key_id=key.id,
                    key_version=version.version,
                )
            
            await self.repo.log_event(
                event_type=KeyAuditEventType.KEY_VALIDATION_FAILED,
                user_id=key.user_id,
                api_key_id=key.id,
                key_version=version.version,
                ip_address=ip_address,
                details={"reason": "Version inactive or expired"},
                success=False,
            )
            await self.session.commit()
            return None
        
        # Check expiration
        if key.expires_at and datetime.utcnow() > key.expires_at:
            await self.repo.update_key(key.id, status=KeyStatus.EXPIRED)
            await self.repo.log_event(
                event_type=KeyAuditEventType.KEY_EXPIRED,
                user_id=key.user_id,
                api_key_id=key.id,
            )
            await self.session.commit()
            return None
        
        # Check scope
        if required_scope and not key.has_scope(required_scope):
            await self.repo.log_event(
                event_type=KeyAuditEventType.KEY_VALIDATION_FAILED,
                user_id=key.user_id,
                api_key_id=key.id,
                key_version=version.version,
                ip_address=ip_address,
                details={"reason": "Missing scope", "required": required_scope},
                success=False,
            )
            await self.session.commit()
            return None
        
        # Update usage stats
        await self.repo.update_key(
            key.id,
            total_usage_count=key.total_usage_count + 1,
            last_used_at=datetime.utcnow(),
        )
        
        # Log successful validation
        await self.repo.log_event(
            event_type=KeyAuditEventType.KEY_VALIDATED,
            user_id=key.user_id,
            api_key_id=key.id,
            key_version=version.version,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        await self.session.commit()
        
        return {
            "id": key.id,
            "user_id": key.user_id,
            "project_id": key.project_id,
            "name": key.name,
            "scopes": key.scopes,
            "version": version.version,
            "is_primary": version.status == KeyVersionStatus.PRIMARY,
            "rate_limit_per_minute": key.rate_limit_per_minute,
        }
    
    # =========================================================================
    # KEY MANAGEMENT
    # =========================================================================
    
    async def revoke_key(
        self,
        key_id: str,
        user_id: str,
        reason: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        mfa_token: Optional[str] = None,
    ) -> bool:
        """Revoke an API key."""
        key = await self.repo.get_key_by_id(key_id)
        if not key or key.user_id != user_id:
            return False
        
        # Check MFA if required
        if key.mfa_required_for_revoke and not mfa_token:
            return False
        
        await self.repo.revoke_key(key_id, reason)
        
        await self.repo.log_event(
            event_type=KeyAuditEventType.KEY_REVOKED,
            user_id=user_id,
            api_key_id=key_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"reason": reason},
        )
        
        await self.session.commit()
        
        logger.info("API key revoked", key_id=key_id, user_id=user_id)
        return True
    
    async def get_key(self, key_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """Get key information (without the actual key)."""
        key = await self.repo.get_key_by_id(key_id, include_versions=True)
        if not key or key.user_id != user_id:
            return None
        
        return {
            "id": key.id,
            "name": key.name,
            "key_prefix": key.key_prefix,
            "description": key.description,
            "scopes": key.scopes,
            "status": key.status.value,
            "current_version": key.current_version,
            "versions": [
                {
                    "version": v.version,
                    "status": v.status.value,
                    "created_at": v.created_at.isoformat(),
                    "grace_period_ends_at": v.grace_period_ends_at.isoformat() if v.grace_period_ends_at else None,
                }
                for v in key.versions[:5]  # Last 5 versions
            ],
            "rate_limit_per_minute": key.rate_limit_per_minute,
            "rotation_enabled": key.rotation_enabled,
            "rotation_interval_days": key.rotation_interval_days,
            "next_rotation_at": key.next_rotation_at.isoformat() if key.next_rotation_at else None,
            "mfa_required_for_rotation": key.mfa_required_for_rotation,
            "total_usage_count": key.total_usage_count,
            "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None,
            "created_at": key.created_at.isoformat(),
            "expires_at": key.expires_at.isoformat() if key.expires_at else None,
        }
    
    async def list_keys(
        self,
        user_id: str,
        project_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List all keys for a user."""
        keys = await self.repo.get_keys_by_user(user_id, project_id)
        
        return [
            {
                "id": key.id,
                "name": key.name,
                "key_prefix": key.key_prefix,
                "status": key.status.value,
                "current_version": key.current_version,
                "scopes": key.scopes,
                "total_usage_count": key.total_usage_count,
                "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None,
                "created_at": key.created_at.isoformat(),
                "expires_at": key.expires_at.isoformat() if key.expires_at else None,
            }
            for key in keys
        ]
    
    async def get_audit_log(
        self,
        user_id: str,
        key_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Get audit log for a user's keys."""
        logs, _ = await self.repo.get_audit_logs(
            user_id=user_id,
            api_key_id=key_id,
            limit=limit,
        )
        
        return [log.to_dict() for log in logs]
    
    # =========================================================================
    # MAINTENANCE
    # =========================================================================
    
    async def cleanup_expired_grace_periods(self) -> int:
        """Cleanup expired grace periods. Run periodically."""
        count = await self.repo.cleanup_expired_grace_periods()
        await self.session.commit()
        
        if count > 0:
            logger.info("Cleaned up expired grace periods", count=count)
        
        return count
    
    async def cleanup_expired_mfa_challenges(self) -> int:
        """Cleanup expired MFA challenges. Run periodically."""
        count = await self.repo.cleanup_expired_mfa_challenges()
        await self.session.commit()
        return count


# =============================================================================
# FACTORY FUNCTION
# =============================================================================

def get_key_management_service(session: AsyncSession) -> KeyManagementService:
    """Get key management service instance."""
    return KeyManagementService(session)
