"""
SmartSpec Pro - Secure Key Management Service
Handles secure storage and retrieval of API keys and tokens.
"""

import base64
import hashlib
import os
import secrets
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from uuid import uuid4

import structlog
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from pydantic import BaseModel, Field

from app.core.config import settings

logger = structlog.get_logger()


# =============================================================================
# ENCRYPTION UTILITIES
# =============================================================================

class EncryptionService:
    """
    Handles encryption/decryption of sensitive data.
    Uses Fernet symmetric encryption with PBKDF2 key derivation.
    """
    
    def __init__(self, master_key: Optional[str] = None):
        """
        Initialize encryption service.
        
        Args:
            master_key: Master encryption key (from environment)
        """
        self.master_key = master_key or settings.ENCRYPTION_MASTER_KEY
        if not self.master_key:
            raise ValueError("ENCRYPTION_MASTER_KEY must be set")
        
        self._fernet = self._create_fernet()
    
    def _create_fernet(self) -> Fernet:
        """Create Fernet instance from master key."""
        # Derive a key using PBKDF2
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"smartspec_salt_v1",  # Static salt for consistency
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(
            kdf.derive(self.master_key.encode())
        )
        return Fernet(key)
    
    def encrypt(self, plaintext: str) -> str:
        """
        Encrypt a string.
        
        Args:
            plaintext: String to encrypt
            
        Returns:
            Base64-encoded encrypted string
        """
        encrypted = self._fernet.encrypt(plaintext.encode())
        return base64.urlsafe_b64encode(encrypted).decode()
    
    def decrypt(self, ciphertext: str) -> str:
        """
        Decrypt a string.
        
        Args:
            ciphertext: Base64-encoded encrypted string
            
        Returns:
            Decrypted plaintext
        """
        encrypted = base64.urlsafe_b64decode(ciphertext.encode())
        decrypted = self._fernet.decrypt(encrypted)
        return decrypted.decode()
    
    @staticmethod
    def generate_key() -> str:
        """Generate a new random encryption key."""
        return Fernet.generate_key().decode()
    
    @staticmethod
    def hash_key(key: str) -> str:
        """
        Create a hash of a key for lookup purposes.
        
        Args:
            key: Key to hash
            
        Returns:
            SHA256 hash of the key
        """
        return hashlib.sha256(key.encode()).hexdigest()


# =============================================================================
# API KEY MODELS
# =============================================================================

class APIKeyScope(str):
    """Scopes for API key permissions."""
    IMAGE_GENERATE = "image:generate"
    VIDEO_GENERATE = "video:generate"
    AUDIO_GENERATE = "audio:generate"
    GALLERY_READ = "gallery:read"
    GALLERY_WRITE = "gallery:write"
    ADMIN = "admin"
    ALL = "*"


class APIKeyCreate(BaseModel):
    """Schema for creating an API key."""
    name: str = Field(..., min_length=1, max_length=100)
    scopes: List[str] = Field(default_factory=lambda: [APIKeyScope.ALL])
    expires_in_days: Optional[int] = Field(default=None, ge=1, le=365)
    rate_limit_per_minute: int = Field(default=60, ge=1, le=1000)
    rate_limit_per_day: int = Field(default=10000, ge=1, le=1000000)
    allowed_origins: Optional[List[str]] = Field(default=None)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class APIKeyInfo(BaseModel):
    """API key information (without the actual key)."""
    id: str
    name: str
    key_prefix: str  # First 8 characters for identification
    key_hash: str  # For lookup
    scopes: List[str]
    is_active: bool
    created_at: datetime
    expires_at: Optional[datetime]
    last_used_at: Optional[datetime]
    usage_count: int
    rate_limit_per_minute: int
    rate_limit_per_day: int
    allowed_origins: Optional[List[str]]
    metadata: Dict[str, Any]


class APIKeyWithSecret(APIKeyInfo):
    """API key with the actual secret (only returned on creation)."""
    key: str  # The actual API key (only shown once)


# =============================================================================
# KEY MANAGEMENT SERVICE
# =============================================================================

class KeyManagementService:
    """
    Manages API keys for user projects.
    
    Features:
    - Secure key generation and storage
    - Key rotation
    - Scope-based permissions
    - Rate limiting configuration
    - Origin restrictions
    """
    
    def __init__(self, encryption_service: Optional[EncryptionService] = None):
        self.encryption = encryption_service or EncryptionService()
        
        # In-memory storage (should use database in production)
        self._keys: Dict[str, Dict[str, Any]] = {}
        self._key_hash_index: Dict[str, str] = {}  # hash -> key_id
    
    # =========================================================================
    # KEY GENERATION
    # =========================================================================
    
    def generate_api_key(self) -> str:
        """
        Generate a new API key.
        
        Format: ss_live_<random_32_chars>
        """
        prefix = "ss_live_"
        random_part = secrets.token_urlsafe(24)  # 32 chars
        return f"{prefix}{random_part}"
    
    def generate_test_key(self) -> str:
        """
        Generate a test API key (for development).
        
        Format: ss_test_<random_32_chars>
        """
        prefix = "ss_test_"
        random_part = secrets.token_urlsafe(24)
        return f"{prefix}{random_part}"
    
    # =========================================================================
    # KEY CRUD
    # =========================================================================
    
    async def create_key(
        self,
        user_id: str,
        project_id: str,
        key_data: APIKeyCreate,
        is_test: bool = False,
    ) -> APIKeyWithSecret:
        """
        Create a new API key.
        
        Args:
            user_id: Owner user ID
            project_id: Project ID
            key_data: Key configuration
            is_test: Whether this is a test key
            
        Returns:
            APIKeyWithSecret with the actual key (only shown once)
        """
        # Generate key
        api_key = self.generate_test_key() if is_test else self.generate_api_key()
        key_id = str(uuid4())
        key_hash = self.encryption.hash_key(api_key)
        key_prefix = api_key[:12]  # "ss_live_xxxx" or "ss_test_xxxx"
        
        # Calculate expiration
        expires_at = None
        if key_data.expires_in_days:
            expires_at = datetime.utcnow() + timedelta(days=key_data.expires_in_days)
        
        # Encrypt the key for storage
        encrypted_key = self.encryption.encrypt(api_key)
        
        # Store key info
        key_info = {
            "id": key_id,
            "user_id": user_id,
            "project_id": project_id,
            "name": key_data.name,
            "key_prefix": key_prefix,
            "key_hash": key_hash,
            "encrypted_key": encrypted_key,
            "scopes": key_data.scopes,
            "is_active": True,
            "created_at": datetime.utcnow(),
            "expires_at": expires_at,
            "last_used_at": None,
            "usage_count": 0,
            "rate_limit_per_minute": key_data.rate_limit_per_minute,
            "rate_limit_per_day": key_data.rate_limit_per_day,
            "allowed_origins": key_data.allowed_origins,
            "metadata": key_data.metadata,
        }
        
        self._keys[key_id] = key_info
        self._key_hash_index[key_hash] = key_id
        
        logger.info(
            "API key created",
            key_id=key_id,
            user_id=user_id,
            project_id=project_id,
            name=key_data.name,
        )
        
        return APIKeyWithSecret(
            id=key_id,
            name=key_data.name,
            key_prefix=key_prefix,
            key_hash=key_hash,
            key=api_key,  # Only returned on creation
            scopes=key_data.scopes,
            is_active=True,
            created_at=key_info["created_at"],
            expires_at=expires_at,
            last_used_at=None,
            usage_count=0,
            rate_limit_per_minute=key_data.rate_limit_per_minute,
            rate_limit_per_day=key_data.rate_limit_per_day,
            allowed_origins=key_data.allowed_origins,
            metadata=key_data.metadata,
        )
    
    async def get_key(self, key_id: str) -> Optional[APIKeyInfo]:
        """Get key info by ID."""
        key_info = self._keys.get(key_id)
        if not key_info:
            return None
        
        return APIKeyInfo(
            id=key_info["id"],
            name=key_info["name"],
            key_prefix=key_info["key_prefix"],
            key_hash=key_info["key_hash"],
            scopes=key_info["scopes"],
            is_active=key_info["is_active"],
            created_at=key_info["created_at"],
            expires_at=key_info["expires_at"],
            last_used_at=key_info["last_used_at"],
            usage_count=key_info["usage_count"],
            rate_limit_per_minute=key_info["rate_limit_per_minute"],
            rate_limit_per_day=key_info["rate_limit_per_day"],
            allowed_origins=key_info["allowed_origins"],
            metadata=key_info["metadata"],
        )
    
    async def list_keys(
        self,
        user_id: str,
        project_id: Optional[str] = None,
        include_inactive: bool = False,
    ) -> List[APIKeyInfo]:
        """List all keys for a user/project."""
        keys = []
        
        for key_info in self._keys.values():
            if key_info["user_id"] != user_id:
                continue
            
            if project_id and key_info["project_id"] != project_id:
                continue
            
            if not include_inactive and not key_info["is_active"]:
                continue
            
            keys.append(APIKeyInfo(
                id=key_info["id"],
                name=key_info["name"],
                key_prefix=key_info["key_prefix"],
                key_hash=key_info["key_hash"],
                scopes=key_info["scopes"],
                is_active=key_info["is_active"],
                created_at=key_info["created_at"],
                expires_at=key_info["expires_at"],
                last_used_at=key_info["last_used_at"],
                usage_count=key_info["usage_count"],
                rate_limit_per_minute=key_info["rate_limit_per_minute"],
                rate_limit_per_day=key_info["rate_limit_per_day"],
                allowed_origins=key_info["allowed_origins"],
                metadata=key_info["metadata"],
            ))
        
        return sorted(keys, key=lambda k: k.created_at, reverse=True)
    
    async def revoke_key(self, key_id: str, user_id: str) -> bool:
        """Revoke (deactivate) an API key."""
        key_info = self._keys.get(key_id)
        if not key_info:
            return False
        
        if key_info["user_id"] != user_id:
            return False
        
        key_info["is_active"] = False
        logger.info("API key revoked", key_id=key_id)
        return True
    
    async def delete_key(self, key_id: str, user_id: str) -> bool:
        """Permanently delete an API key."""
        key_info = self._keys.get(key_id)
        if not key_info:
            return False
        
        if key_info["user_id"] != user_id:
            return False
        
        # Remove from index
        key_hash = key_info["key_hash"]
        if key_hash in self._key_hash_index:
            del self._key_hash_index[key_hash]
        
        # Remove key
        del self._keys[key_id]
        
        logger.info("API key deleted", key_id=key_id)
        return True
    
    # =========================================================================
    # KEY VALIDATION
    # =========================================================================
    
    async def validate_key(
        self,
        api_key: str,
        required_scope: Optional[str] = None,
        origin: Optional[str] = None,
    ) -> Optional[APIKeyInfo]:
        """
        Validate an API key.
        
        Args:
            api_key: The API key to validate
            required_scope: Required scope (optional)
            origin: Request origin for CORS validation
            
        Returns:
            APIKeyInfo if valid, None if invalid
        """
        # Hash the key for lookup
        key_hash = self.encryption.hash_key(api_key)
        key_id = self._key_hash_index.get(key_hash)
        
        if not key_id:
            logger.warning("API key not found", key_prefix=api_key[:12])
            return None
        
        key_info = self._keys.get(key_id)
        if not key_info:
            return None
        
        # Check if active
        if not key_info["is_active"]:
            logger.warning("API key is inactive", key_id=key_id)
            return None
        
        # Check expiration
        if key_info["expires_at"] and datetime.utcnow() > key_info["expires_at"]:
            logger.warning("API key expired", key_id=key_id)
            return None
        
        # Check scope
        if required_scope:
            scopes = key_info["scopes"]
            if APIKeyScope.ALL not in scopes and required_scope not in scopes:
                logger.warning(
                    "API key missing required scope",
                    key_id=key_id,
                    required_scope=required_scope,
                )
                return None
        
        # Check origin
        allowed_origins = key_info["allowed_origins"]
        if allowed_origins and origin:
            if origin not in allowed_origins and "*" not in allowed_origins:
                logger.warning(
                    "API key origin not allowed",
                    key_id=key_id,
                    origin=origin,
                )
                return None
        
        # Update usage stats
        key_info["last_used_at"] = datetime.utcnow()
        key_info["usage_count"] += 1
        
        return APIKeyInfo(
            id=key_info["id"],
            name=key_info["name"],
            key_prefix=key_info["key_prefix"],
            key_hash=key_info["key_hash"],
            scopes=key_info["scopes"],
            is_active=key_info["is_active"],
            created_at=key_info["created_at"],
            expires_at=key_info["expires_at"],
            last_used_at=key_info["last_used_at"],
            usage_count=key_info["usage_count"],
            rate_limit_per_minute=key_info["rate_limit_per_minute"],
            rate_limit_per_day=key_info["rate_limit_per_day"],
            allowed_origins=key_info["allowed_origins"],
            metadata=key_info["metadata"],
        )
    
    # =========================================================================
    # KEY ROTATION
    # =========================================================================
    
    async def rotate_key(
        self,
        key_id: str,
        user_id: str,
    ) -> Optional[APIKeyWithSecret]:
        """
        Rotate an API key (generate new key, keep same settings).
        
        Args:
            key_id: Key to rotate
            user_id: Owner user ID
            
        Returns:
            New APIKeyWithSecret
        """
        key_info = self._keys.get(key_id)
        if not key_info:
            return None
        
        if key_info["user_id"] != user_id:
            return None
        
        # Generate new key
        is_test = key_info["key_prefix"].startswith("ss_test_")
        new_api_key = self.generate_test_key() if is_test else self.generate_api_key()
        new_key_hash = self.encryption.hash_key(new_api_key)
        new_key_prefix = new_api_key[:12]
        new_encrypted_key = self.encryption.encrypt(new_api_key)
        
        # Remove old hash from index
        old_key_hash = key_info["key_hash"]
        if old_key_hash in self._key_hash_index:
            del self._key_hash_index[old_key_hash]
        
        # Update key info
        key_info["key_prefix"] = new_key_prefix
        key_info["key_hash"] = new_key_hash
        key_info["encrypted_key"] = new_encrypted_key
        
        # Add new hash to index
        self._key_hash_index[new_key_hash] = key_id
        
        logger.info("API key rotated", key_id=key_id)
        
        return APIKeyWithSecret(
            id=key_info["id"],
            name=key_info["name"],
            key_prefix=new_key_prefix,
            key_hash=new_key_hash,
            key=new_api_key,
            scopes=key_info["scopes"],
            is_active=key_info["is_active"],
            created_at=key_info["created_at"],
            expires_at=key_info["expires_at"],
            last_used_at=key_info["last_used_at"],
            usage_count=key_info["usage_count"],
            rate_limit_per_minute=key_info["rate_limit_per_minute"],
            rate_limit_per_day=key_info["rate_limit_per_day"],
            allowed_origins=key_info["allowed_origins"],
            metadata=key_info["metadata"],
        )


# =============================================================================
# PROVIDER KEY STORAGE
# =============================================================================

class ProviderKeyStorage:
    """
    Secure storage for third-party provider API keys.
    
    Stores keys like:
    - KIE_AI_API_KEY
    - CLOUDFLARE_R2_ACCESS_KEY
    - etc.
    """
    
    def __init__(self, encryption_service: Optional[EncryptionService] = None):
        self.encryption = encryption_service or EncryptionService()
        
        # In-memory storage (should use database/vault in production)
        self._provider_keys: Dict[str, Dict[str, str]] = {}
    
    async def store_provider_key(
        self,
        user_id: str,
        project_id: str,
        provider: str,
        key_name: str,
        key_value: str,
    ) -> bool:
        """
        Store a provider API key.
        
        Args:
            user_id: Owner user ID
            project_id: Project ID
            provider: Provider name (e.g., "kie.ai", "cloudflare")
            key_name: Key name (e.g., "api_key", "access_key_id")
            key_value: The actual key value
            
        Returns:
            True if stored successfully
        """
        storage_key = f"{user_id}:{project_id}:{provider}"
        
        if storage_key not in self._provider_keys:
            self._provider_keys[storage_key] = {}
        
        # Encrypt and store
        encrypted_value = self.encryption.encrypt(key_value)
        self._provider_keys[storage_key][key_name] = encrypted_value
        
        logger.info(
            "Provider key stored",
            user_id=user_id,
            project_id=project_id,
            provider=provider,
            key_name=key_name,
        )
        
        return True
    
    async def get_provider_key(
        self,
        user_id: str,
        project_id: str,
        provider: str,
        key_name: str,
    ) -> Optional[str]:
        """
        Retrieve a provider API key.
        
        Args:
            user_id: Owner user ID
            project_id: Project ID
            provider: Provider name
            key_name: Key name
            
        Returns:
            Decrypted key value or None
        """
        storage_key = f"{user_id}:{project_id}:{provider}"
        
        provider_keys = self._provider_keys.get(storage_key)
        if not provider_keys:
            return None
        
        encrypted_value = provider_keys.get(key_name)
        if not encrypted_value:
            return None
        
        return self.encryption.decrypt(encrypted_value)
    
    async def delete_provider_key(
        self,
        user_id: str,
        project_id: str,
        provider: str,
        key_name: Optional[str] = None,
    ) -> bool:
        """
        Delete provider key(s).
        
        Args:
            user_id: Owner user ID
            project_id: Project ID
            provider: Provider name
            key_name: Specific key to delete (or all if None)
            
        Returns:
            True if deleted
        """
        storage_key = f"{user_id}:{project_id}:{provider}"
        
        if storage_key not in self._provider_keys:
            return False
        
        if key_name:
            if key_name in self._provider_keys[storage_key]:
                del self._provider_keys[storage_key][key_name]
        else:
            del self._provider_keys[storage_key]
        
        logger.info(
            "Provider key deleted",
            user_id=user_id,
            project_id=project_id,
            provider=provider,
            key_name=key_name,
        )
        
        return True
    
    async def list_provider_keys(
        self,
        user_id: str,
        project_id: str,
    ) -> Dict[str, List[str]]:
        """
        List all provider keys for a project (names only, not values).
        
        Returns:
            Dict of provider -> list of key names
        """
        result = {}
        prefix = f"{user_id}:{project_id}:"
        
        for storage_key, keys in self._provider_keys.items():
            if storage_key.startswith(prefix):
                provider = storage_key.replace(prefix, "")
                result[provider] = list(keys.keys())
        
        return result


# =============================================================================
# SINGLETON INSTANCES
# =============================================================================

_encryption_service: Optional[EncryptionService] = None
_key_management_service: Optional[KeyManagementService] = None
_provider_key_storage: Optional[ProviderKeyStorage] = None


def get_encryption_service() -> EncryptionService:
    """Get the singleton encryption service."""
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = EncryptionService()
    return _encryption_service


def get_key_management_service() -> KeyManagementService:
    """Get the singleton key management service."""
    global _key_management_service
    if _key_management_service is None:
        _key_management_service = KeyManagementService()
    return _key_management_service


def get_provider_key_storage() -> ProviderKeyStorage:
    """Get the singleton provider key storage."""
    global _provider_key_storage
    if _provider_key_storage is None:
        _provider_key_storage = ProviderKeyStorage()
    return _provider_key_storage
