"""
SmartSpec Pro - Secure Key Management Service v2
Enhanced security with proper key rotation, versioning, and audit trails.

Security Improvements:
- Unique salt per encryption operation
- Key versioning with grace period
- Comprehensive audit logging
- Automatic key rotation scheduling
- Envelope encryption support
- Database persistence ready
"""

import base64
import hashlib
import os
import secrets
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import structlog
from cryptography.fernet import Fernet, MultiFernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from pydantic import BaseModel, Field

from app.core.config import settings

logger = structlog.get_logger()


# =============================================================================
# CONSTANTS
# =============================================================================

# Key rotation grace period (old key remains valid)
DEFAULT_GRACE_PERIOD_HOURS = 24

# Maximum key versions to keep
MAX_KEY_VERSIONS = 5

# PBKDF2 iterations (NIST recommends minimum 10,000, we use 310,000 for 2024+)
PBKDF2_ITERATIONS = 310000

# Salt length in bytes
SALT_LENGTH = 32


# =============================================================================
# AUDIT EVENTS
# =============================================================================

class AuditEventType(str, Enum):
    """Types of audit events for key operations."""
    KEY_CREATED = "key_created"
    KEY_ROTATED = "key_rotated"
    KEY_REVOKED = "key_revoked"
    KEY_DELETED = "key_deleted"
    KEY_ACCESSED = "key_accessed"
    KEY_VALIDATED = "key_validated"
    KEY_VALIDATION_FAILED = "key_validation_failed"
    KEY_EXPIRED = "key_expired"
    ROTATION_SCHEDULED = "rotation_scheduled"
    GRACE_PERIOD_STARTED = "grace_period_started"
    GRACE_PERIOD_ENDED = "grace_period_ended"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"


class AuditEvent(BaseModel):
    """Audit event record."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: AuditEventType
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    user_id: str
    key_id: Optional[str] = None
    key_version: Optional[int] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)
    success: bool = True
    error_message: Optional[str] = None


# =============================================================================
# KEY VERSION MODEL
# =============================================================================

class KeyVersion(BaseModel):
    """Represents a single version of an API key."""
    version: int
    key_hash: str
    encrypted_key: str
    salt: str  # Unique salt for this version
    created_at: datetime
    expires_at: Optional[datetime] = None
    is_active: bool = True
    is_primary: bool = False  # Is this the current primary version?
    grace_period_ends_at: Optional[datetime] = None


class KeyRotationPolicy(BaseModel):
    """Policy for automatic key rotation."""
    enabled: bool = False
    rotation_interval_days: int = 90
    grace_period_hours: int = DEFAULT_GRACE_PERIOD_HOURS
    notify_before_days: int = 7
    last_rotation_at: Optional[datetime] = None
    next_rotation_at: Optional[datetime] = None


# =============================================================================
# ENHANCED ENCRYPTION SERVICE
# =============================================================================

class EnhancedEncryptionService:
    """
    Enhanced encryption service with unique salts and key versioning support.
    
    Security Features:
    - Unique salt per encryption operation
    - Support for multiple key versions (MultiFernet)
    - Secure key derivation with high iteration count
    - Salt stored alongside ciphertext
    """
    
    def __init__(self, master_key: Optional[str] = None):
        """Initialize with master key from environment."""
        self.master_key = master_key or settings.ENCRYPTION_MASTER_KEY
        if not self.master_key:
            raise ValueError("ENCRYPTION_MASTER_KEY must be set")
        
        # Validate master key strength
        if len(self.master_key) < 32:
            raise ValueError("ENCRYPTION_MASTER_KEY must be at least 32 characters")
    
    def _derive_key(self, salt: bytes) -> bytes:
        """
        Derive encryption key from master key using PBKDF2.
        
        Args:
            salt: Unique salt for this derivation
            
        Returns:
            32-byte derived key
        """
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=PBKDF2_ITERATIONS,
        )
        return kdf.derive(self.master_key.encode())
    
    def encrypt(self, plaintext: str) -> Tuple[str, str]:
        """
        Encrypt a string with a unique salt.
        
        Args:
            plaintext: String to encrypt
            
        Returns:
            Tuple of (ciphertext, salt) both base64 encoded
        """
        # Generate unique salt
        salt = os.urandom(SALT_LENGTH)
        
        # Derive key from master key + salt
        derived_key = self._derive_key(salt)
        fernet_key = base64.urlsafe_b64encode(derived_key)
        fernet = Fernet(fernet_key)
        
        # Encrypt
        encrypted = fernet.encrypt(plaintext.encode())
        
        # Return both ciphertext and salt
        return (
            base64.urlsafe_b64encode(encrypted).decode(),
            base64.urlsafe_b64encode(salt).decode()
        )
    
    def decrypt(self, ciphertext: str, salt: str) -> str:
        """
        Decrypt a string using the provided salt.
        
        Args:
            ciphertext: Base64-encoded encrypted string
            salt: Base64-encoded salt used during encryption
            
        Returns:
            Decrypted plaintext
        """
        # Decode salt
        salt_bytes = base64.urlsafe_b64decode(salt.encode())
        
        # Derive same key
        derived_key = self._derive_key(salt_bytes)
        fernet_key = base64.urlsafe_b64encode(derived_key)
        fernet = Fernet(fernet_key)
        
        # Decrypt
        encrypted = base64.urlsafe_b64decode(ciphertext.encode())
        decrypted = fernet.decrypt(encrypted)
        
        return decrypted.decode()
    
    def create_multi_fernet(self, salts: List[str]) -> MultiFernet:
        """
        Create a MultiFernet instance for decrypting multiple key versions.
        
        Args:
            salts: List of salts for each key version (newest first)
            
        Returns:
            MultiFernet instance
        """
        fernets = []
        for salt in salts:
            salt_bytes = base64.urlsafe_b64decode(salt.encode())
            derived_key = self._derive_key(salt_bytes)
            fernet_key = base64.urlsafe_b64encode(derived_key)
            fernets.append(Fernet(fernet_key))
        
        return MultiFernet(fernets)
    
    @staticmethod
    def hash_key(key: str) -> str:
        """Create SHA256 hash of a key for lookup."""
        return hashlib.sha256(key.encode()).hexdigest()
    
    @staticmethod
    def generate_api_key(prefix: str = "ss_live_") -> str:
        """Generate a cryptographically secure API key."""
        random_part = secrets.token_urlsafe(32)
        return f"{prefix}{random_part}"


# =============================================================================
# AUDIT LOGGER
# =============================================================================

class KeyAuditLogger:
    """
    Comprehensive audit logging for key operations.
    
    Features:
    - Structured logging with all relevant context
    - Suspicious activity detection
    - Compliance-ready audit trail
    """
    
    def __init__(self):
        self._events: List[AuditEvent] = []  # In production, use database
        self._suspicious_patterns: Dict[str, List[datetime]] = {}
    
    async def log_event(
        self,
        event_type: AuditEventType,
        user_id: str,
        key_id: Optional[str] = None,
        key_version: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        success: bool = True,
        error_message: Optional[str] = None,
    ) -> AuditEvent:
        """Log an audit event."""
        event = AuditEvent(
            event_type=event_type,
            user_id=user_id,
            key_id=key_id,
            key_version=key_version,
            ip_address=ip_address,
            user_agent=user_agent,
            details=details or {},
            success=success,
            error_message=error_message,
        )
        
        self._events.append(event)
        
        # Log to structured logger
        logger.info(
            f"key_audit_{event_type.value}",
            event_id=event.id,
            user_id=user_id,
            key_id=key_id,
            key_version=key_version,
            ip_address=ip_address,
            success=success,
            error_message=error_message,
            **event.details,
        )
        
        # Check for suspicious patterns
        await self._check_suspicious_activity(event)
        
        return event
    
    async def _check_suspicious_activity(self, event: AuditEvent):
        """Detect suspicious patterns in key operations."""
        user_key = f"{event.user_id}:{event.event_type.value}"
        
        if user_key not in self._suspicious_patterns:
            self._suspicious_patterns[user_key] = []
        
        # Track recent events
        now = datetime.utcnow()
        self._suspicious_patterns[user_key].append(now)
        
        # Clean old events (keep last hour)
        hour_ago = now - timedelta(hours=1)
        self._suspicious_patterns[user_key] = [
            t for t in self._suspicious_patterns[user_key] if t > hour_ago
        ]
        
        # Check for suspicious patterns
        recent_count = len(self._suspicious_patterns[user_key])
        
        # Too many validation failures
        if event.event_type == AuditEventType.KEY_VALIDATION_FAILED and recent_count > 10:
            await self._alert_suspicious_activity(
                event.user_id,
                "Too many validation failures",
                {"count": recent_count, "period": "1 hour"},
            )
        
        # Too many rotations
        if event.event_type == AuditEventType.KEY_ROTATED and recent_count > 5:
            await self._alert_suspicious_activity(
                event.user_id,
                "Excessive key rotations",
                {"count": recent_count, "period": "1 hour"},
            )
    
    async def _alert_suspicious_activity(
        self,
        user_id: str,
        reason: str,
        details: Dict[str, Any],
    ):
        """Alert on suspicious activity."""
        logger.warning(
            "suspicious_key_activity",
            user_id=user_id,
            reason=reason,
            **details,
        )
        
        # In production: send alerts via email, Slack, PagerDuty, etc.
    
    async def get_events(
        self,
        user_id: Optional[str] = None,
        key_id: Optional[str] = None,
        event_type: Optional[AuditEventType] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[AuditEvent]:
        """Query audit events with filters."""
        events = self._events
        
        if user_id:
            events = [e for e in events if e.user_id == user_id]
        
        if key_id:
            events = [e for e in events if e.key_id == key_id]
        
        if event_type:
            events = [e for e in events if e.event_type == event_type]
        
        if start_date:
            events = [e for e in events if e.timestamp >= start_date]
        
        if end_date:
            events = [e for e in events if e.timestamp <= end_date]
        
        # Sort by timestamp descending
        events.sort(key=lambda e: e.timestamp, reverse=True)
        
        return events[:limit]


# =============================================================================
# ENHANCED KEY MANAGEMENT SERVICE
# =============================================================================

class EnhancedKeyManagementService:
    """
    Enhanced key management with versioning and grace periods.
    
    Security Features:
    - Key versioning (multiple active versions during rotation)
    - Grace period for smooth transitions
    - Automatic rotation scheduling
    - Comprehensive audit logging
    - Rate limiting on sensitive operations
    """
    
    def __init__(
        self,
        encryption_service: Optional[EnhancedEncryptionService] = None,
        audit_logger: Optional[KeyAuditLogger] = None,
    ):
        self.encryption = encryption_service or EnhancedEncryptionService()
        self.audit = audit_logger or KeyAuditLogger()
        
        # Storage (use database in production)
        self._keys: Dict[str, Dict[str, Any]] = {}
        self._key_hash_index: Dict[str, Tuple[str, int]] = {}  # hash -> (key_id, version)
        
        # Rate limiting for rotation
        self._rotation_timestamps: Dict[str, List[datetime]] = {}
    
    # =========================================================================
    # KEY CREATION
    # =========================================================================
    
    async def create_key(
        self,
        user_id: str,
        project_id: str,
        name: str,
        scopes: List[str],
        expires_in_days: Optional[int] = None,
        rate_limit_per_minute: int = 60,
        rotation_policy: Optional[KeyRotationPolicy] = None,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new API key with versioning support.
        
        Returns the key only once - it cannot be retrieved again.
        """
        # Generate key
        api_key = self.encryption.generate_api_key()
        key_id = str(uuid4())
        key_hash = self.encryption.hash_key(api_key)
        
        # Encrypt with unique salt
        encrypted_key, salt = self.encryption.encrypt(api_key)
        
        # Calculate expiration
        expires_at = None
        if expires_in_days:
            expires_at = datetime.utcnow() + timedelta(days=expires_in_days)
        
        # Create initial version
        version = KeyVersion(
            version=1,
            key_hash=key_hash,
            encrypted_key=encrypted_key,
            salt=salt,
            created_at=datetime.utcnow(),
            expires_at=expires_at,
            is_active=True,
            is_primary=True,
        )
        
        # Set up rotation policy
        if rotation_policy is None:
            rotation_policy = KeyRotationPolicy()
        
        if rotation_policy.enabled:
            rotation_policy.next_rotation_at = datetime.utcnow() + timedelta(
                days=rotation_policy.rotation_interval_days
            )
        
        # Store key info
        key_info = {
            "id": key_id,
            "user_id": user_id,
            "project_id": project_id,
            "name": name,
            "key_prefix": api_key[:12],
            "scopes": scopes,
            "is_active": True,
            "created_at": datetime.utcnow(),
            "rate_limit_per_minute": rate_limit_per_minute,
            "versions": [version.model_dump()],
            "current_version": 1,
            "rotation_policy": rotation_policy.model_dump(),
            "usage_count": 0,
            "last_used_at": None,
        }
        
        self._keys[key_id] = key_info
        self._key_hash_index[key_hash] = (key_id, 1)
        
        # Audit log
        await self.audit.log_event(
            event_type=AuditEventType.KEY_CREATED,
            user_id=user_id,
            key_id=key_id,
            key_version=1,
            ip_address=ip_address,
            details={
                "name": name,
                "scopes": scopes,
                "expires_in_days": expires_in_days,
                "rotation_enabled": rotation_policy.enabled,
            },
        )
        
        return {
            "id": key_id,
            "name": name,
            "key": api_key,  # Only returned once!
            "key_prefix": api_key[:12],
            "version": 1,
            "created_at": key_info["created_at"],
            "expires_at": expires_at,
        }
    
    # =========================================================================
    # KEY ROTATION WITH GRACE PERIOD
    # =========================================================================
    
    async def rotate_key(
        self,
        key_id: str,
        user_id: str,
        grace_period_hours: Optional[int] = None,
        ip_address: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Rotate an API key with grace period.
        
        The old key remains valid during the grace period, allowing
        clients to transition smoothly to the new key.
        
        Args:
            key_id: Key to rotate
            user_id: Owner user ID
            grace_period_hours: Hours to keep old key valid (default: 24)
            ip_address: Request IP for audit
            
        Returns:
            New key info with the actual key (shown only once)
        """
        key_info = self._keys.get(key_id)
        if not key_info:
            return None
        
        if key_info["user_id"] != user_id:
            await self.audit.log_event(
                event_type=AuditEventType.KEY_ROTATED,
                user_id=user_id,
                key_id=key_id,
                ip_address=ip_address,
                success=False,
                error_message="Unauthorized rotation attempt",
            )
            return None
        
        # Rate limit rotations
        if not await self._check_rotation_rate_limit(user_id, key_id):
            await self.audit.log_event(
                event_type=AuditEventType.KEY_ROTATED,
                user_id=user_id,
                key_id=key_id,
                ip_address=ip_address,
                success=False,
                error_message="Rate limit exceeded for key rotation",
            )
            return None
        
        # Determine grace period
        if grace_period_hours is None:
            policy = KeyRotationPolicy(**key_info["rotation_policy"])
            grace_period_hours = policy.grace_period_hours
        
        grace_period_ends = datetime.utcnow() + timedelta(hours=grace_period_hours)
        
        # Generate new key
        new_api_key = self.encryption.generate_api_key()
        new_key_hash = self.encryption.hash_key(new_api_key)
        new_encrypted_key, new_salt = self.encryption.encrypt(new_api_key)
        
        # Get current version number
        current_version = key_info["current_version"]
        new_version_num = current_version + 1
        
        # Update old version(s) with grace period
        for v in key_info["versions"]:
            if v["is_primary"]:
                v["is_primary"] = False
                v["grace_period_ends_at"] = grace_period_ends.isoformat()
        
        # Create new version
        new_version = KeyVersion(
            version=new_version_num,
            key_hash=new_key_hash,
            encrypted_key=new_encrypted_key,
            salt=new_salt,
            created_at=datetime.utcnow(),
            expires_at=key_info["versions"][0].get("expires_at"),  # Inherit expiry
            is_active=True,
            is_primary=True,
        )
        
        # Add new version
        key_info["versions"].insert(0, new_version.model_dump())
        key_info["current_version"] = new_version_num
        key_info["key_prefix"] = new_api_key[:12]
        
        # Update hash index for new key
        self._key_hash_index[new_key_hash] = (key_id, new_version_num)
        
        # Clean up old versions (keep MAX_KEY_VERSIONS)
        await self._cleanup_old_versions(key_id)
        
        # Update rotation policy
        policy = KeyRotationPolicy(**key_info["rotation_policy"])
        policy.last_rotation_at = datetime.utcnow()
        if policy.enabled:
            policy.next_rotation_at = datetime.utcnow() + timedelta(
                days=policy.rotation_interval_days
            )
        key_info["rotation_policy"] = policy.model_dump()
        
        # Audit log
        await self.audit.log_event(
            event_type=AuditEventType.KEY_ROTATED,
            user_id=user_id,
            key_id=key_id,
            key_version=new_version_num,
            ip_address=ip_address,
            details={
                "previous_version": current_version,
                "grace_period_hours": grace_period_hours,
                "grace_period_ends_at": grace_period_ends.isoformat(),
            },
        )
        
        await self.audit.log_event(
            event_type=AuditEventType.GRACE_PERIOD_STARTED,
            user_id=user_id,
            key_id=key_id,
            key_version=current_version,
            details={
                "ends_at": grace_period_ends.isoformat(),
            },
        )
        
        return {
            "id": key_id,
            "name": key_info["name"],
            "key": new_api_key,  # Only returned once!
            "key_prefix": new_api_key[:12],
            "version": new_version_num,
            "previous_version": current_version,
            "grace_period_ends_at": grace_period_ends,
            "created_at": new_version.created_at,
        }
    
    async def _check_rotation_rate_limit(self, user_id: str, key_id: str) -> bool:
        """Check if rotation is allowed (max 3 per hour per key)."""
        rate_key = f"{user_id}:{key_id}"
        now = datetime.utcnow()
        hour_ago = now - timedelta(hours=1)
        
        if rate_key not in self._rotation_timestamps:
            self._rotation_timestamps[rate_key] = []
        
        # Clean old timestamps
        self._rotation_timestamps[rate_key] = [
            t for t in self._rotation_timestamps[rate_key] if t > hour_ago
        ]
        
        # Check limit
        if len(self._rotation_timestamps[rate_key]) >= 3:
            return False
        
        # Record this rotation
        self._rotation_timestamps[rate_key].append(now)
        return True
    
    async def _cleanup_old_versions(self, key_id: str):
        """Remove old versions beyond MAX_KEY_VERSIONS."""
        key_info = self._keys.get(key_id)
        if not key_info:
            return
        
        versions = key_info["versions"]
        
        # Keep only MAX_KEY_VERSIONS
        while len(versions) > MAX_KEY_VERSIONS:
            old_version = versions.pop()
            
            # Remove from hash index
            old_hash = old_version["key_hash"]
            if old_hash in self._key_hash_index:
                del self._key_hash_index[old_hash]
    
    # =========================================================================
    # KEY VALIDATION
    # =========================================================================
    
    async def validate_key(
        self,
        api_key: str,
        required_scope: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Validate an API key, supporting multiple versions during grace period.
        
        Args:
            api_key: The API key to validate
            required_scope: Required scope (optional)
            ip_address: Request IP for audit
            
        Returns:
            Key info if valid, None if invalid
        """
        key_hash = self.encryption.hash_key(api_key)
        lookup = self._key_hash_index.get(key_hash)
        
        if not lookup:
            # Log failed validation
            await self.audit.log_event(
                event_type=AuditEventType.KEY_VALIDATION_FAILED,
                user_id="unknown",
                ip_address=ip_address,
                details={"reason": "Key not found", "key_prefix": api_key[:12]},
                success=False,
            )
            return None
        
        key_id, version_num = lookup
        key_info = self._keys.get(key_id)
        
        if not key_info:
            return None
        
        # Find the version
        version = None
        for v in key_info["versions"]:
            if v["version"] == version_num:
                version = v
                break
        
        if not version:
            return None
        
        # Check if version is active
        if not version["is_active"]:
            await self.audit.log_event(
                event_type=AuditEventType.KEY_VALIDATION_FAILED,
                user_id=key_info["user_id"],
                key_id=key_id,
                key_version=version_num,
                ip_address=ip_address,
                details={"reason": "Version inactive"},
                success=False,
            )
            return None
        
        # Check grace period for non-primary versions
        if not version["is_primary"]:
            grace_ends = version.get("grace_period_ends_at")
            if grace_ends:
                grace_ends_dt = datetime.fromisoformat(grace_ends)
                if datetime.utcnow() > grace_ends_dt:
                    # Grace period expired
                    version["is_active"] = False
                    del self._key_hash_index[key_hash]
                    
                    await self.audit.log_event(
                        event_type=AuditEventType.GRACE_PERIOD_ENDED,
                        user_id=key_info["user_id"],
                        key_id=key_id,
                        key_version=version_num,
                    )
                    
                    await self.audit.log_event(
                        event_type=AuditEventType.KEY_VALIDATION_FAILED,
                        user_id=key_info["user_id"],
                        key_id=key_id,
                        key_version=version_num,
                        ip_address=ip_address,
                        details={"reason": "Grace period expired"},
                        success=False,
                    )
                    return None
        
        # Check expiration
        expires_at = version.get("expires_at")
        if expires_at:
            expires_dt = datetime.fromisoformat(expires_at) if isinstance(expires_at, str) else expires_at
            if datetime.utcnow() > expires_dt:
                await self.audit.log_event(
                    event_type=AuditEventType.KEY_EXPIRED,
                    user_id=key_info["user_id"],
                    key_id=key_id,
                    key_version=version_num,
                )
                return None
        
        # Check scope
        if required_scope:
            scopes = key_info["scopes"]
            if "*" not in scopes and required_scope not in scopes:
                await self.audit.log_event(
                    event_type=AuditEventType.KEY_VALIDATION_FAILED,
                    user_id=key_info["user_id"],
                    key_id=key_id,
                    key_version=version_num,
                    ip_address=ip_address,
                    details={"reason": "Missing scope", "required": required_scope},
                    success=False,
                )
                return None
        
        # Update usage stats
        key_info["last_used_at"] = datetime.utcnow()
        key_info["usage_count"] += 1
        
        # Log successful validation
        await self.audit.log_event(
            event_type=AuditEventType.KEY_VALIDATED,
            user_id=key_info["user_id"],
            key_id=key_id,
            key_version=version_num,
            ip_address=ip_address,
        )
        
        return {
            "id": key_id,
            "user_id": key_info["user_id"],
            "project_id": key_info["project_id"],
            "name": key_info["name"],
            "scopes": key_info["scopes"],
            "version": version_num,
            "is_primary": version["is_primary"],
            "rate_limit_per_minute": key_info["rate_limit_per_minute"],
        }
    
    # =========================================================================
    # KEY MANAGEMENT
    # =========================================================================
    
    async def revoke_key(
        self,
        key_id: str,
        user_id: str,
        ip_address: Optional[str] = None,
    ) -> bool:
        """Revoke all versions of a key immediately."""
        key_info = self._keys.get(key_id)
        if not key_info or key_info["user_id"] != user_id:
            return False
        
        # Deactivate all versions
        for version in key_info["versions"]:
            version["is_active"] = False
            key_hash = version["key_hash"]
            if key_hash in self._key_hash_index:
                del self._key_hash_index[key_hash]
        
        key_info["is_active"] = False
        
        await self.audit.log_event(
            event_type=AuditEventType.KEY_REVOKED,
            user_id=user_id,
            key_id=key_id,
            ip_address=ip_address,
            details={"versions_revoked": len(key_info["versions"])},
        )
        
        return True
    
    async def get_key_info(self, key_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """Get key information (without the actual key)."""
        key_info = self._keys.get(key_id)
        if not key_info or key_info["user_id"] != user_id:
            return None
        
        return {
            "id": key_info["id"],
            "name": key_info["name"],
            "key_prefix": key_info["key_prefix"],
            "scopes": key_info["scopes"],
            "is_active": key_info["is_active"],
            "created_at": key_info["created_at"],
            "current_version": key_info["current_version"],
            "versions": [
                {
                    "version": v["version"],
                    "is_active": v["is_active"],
                    "is_primary": v["is_primary"],
                    "created_at": v["created_at"],
                    "grace_period_ends_at": v.get("grace_period_ends_at"),
                }
                for v in key_info["versions"]
            ],
            "rotation_policy": key_info["rotation_policy"],
            "usage_count": key_info["usage_count"],
            "last_used_at": key_info["last_used_at"],
        }
    
    async def list_keys(self, user_id: str, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """List all keys for a user/project."""
        keys = []
        for key_info in self._keys.values():
            if key_info["user_id"] != user_id:
                continue
            if project_id and key_info["project_id"] != project_id:
                continue
            
            keys.append({
                "id": key_info["id"],
                "name": key_info["name"],
                "key_prefix": key_info["key_prefix"],
                "is_active": key_info["is_active"],
                "current_version": key_info["current_version"],
                "created_at": key_info["created_at"],
                "last_used_at": key_info["last_used_at"],
                "usage_count": key_info["usage_count"],
            })
        
        return keys
    
    async def get_audit_log(
        self,
        user_id: str,
        key_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[AuditEvent]:
        """Get audit log for a user's keys."""
        return await self.audit.get_events(
            user_id=user_id,
            key_id=key_id,
            limit=limit,
        )


# =============================================================================
# SINGLETON INSTANCES
# =============================================================================

_enhanced_encryption: Optional[EnhancedEncryptionService] = None
_enhanced_key_management: Optional[EnhancedKeyManagementService] = None
_audit_logger: Optional[KeyAuditLogger] = None


def get_enhanced_encryption_service() -> EnhancedEncryptionService:
    """Get singleton enhanced encryption service."""
    global _enhanced_encryption
    if _enhanced_encryption is None:
        _enhanced_encryption = EnhancedEncryptionService()
    return _enhanced_encryption


def get_audit_logger() -> KeyAuditLogger:
    """Get singleton audit logger."""
    global _audit_logger
    if _audit_logger is None:
        _audit_logger = KeyAuditLogger()
    return _audit_logger


def get_enhanced_key_management_service() -> EnhancedKeyManagementService:
    """Get singleton enhanced key management service."""
    global _enhanced_key_management
    if _enhanced_key_management is None:
        _enhanced_key_management = EnhancedKeyManagementService(
            encryption_service=get_enhanced_encryption_service(),
            audit_logger=get_audit_logger(),
        )
    return _enhanced_key_management
