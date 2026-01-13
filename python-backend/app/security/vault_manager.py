"""
Secrets Manager for Secure Credential Storage
Phase 3: SaaS Readiness
"""

import structlog
import os
import json
import base64
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Dict, Any, List
import uuid
import hashlib

logger = structlog.get_logger(__name__)


class SecretType(str, Enum):
    """Types of secrets."""
    API_KEY = "api_key"
    DATABASE_URL = "database_url"
    OAUTH_TOKEN = "oauth_token"
    ENCRYPTION_KEY = "encryption_key"
    WEBHOOK_SECRET = "webhook_secret"
    SERVICE_ACCOUNT = "service_account"
    CERTIFICATE = "certificate"
    CUSTOM = "custom"


class SecretScope(str, Enum):
    """Scope of secrets."""
    GLOBAL = "global"  # Available to all tenants
    TENANT = "tenant"  # Specific to a tenant
    PROJECT = "project"  # Specific to a project
    USER = "user"  # Specific to a user


@dataclass
class Secret:
    """
    A secret stored in the secrets manager.
    """
    
    secret_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    description: str = ""
    
    # Type and scope
    secret_type: SecretType = SecretType.CUSTOM
    scope: SecretScope = SecretScope.TENANT
    
    # Ownership
    tenant_id: Optional[str] = None
    project_id: Optional[str] = None
    user_id: Optional[str] = None
    
    # Value (encrypted)
    encrypted_value: str = ""
    value_hash: str = ""  # For verification without decryption
    
    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)
    
    # Rotation
    rotation_enabled: bool = False
    rotation_interval_days: int = 90
    last_rotated_at: Optional[datetime] = None
    
    # Expiration
    expires_at: Optional[datetime] = None
    
    # Access control
    allowed_services: List[str] = field(default_factory=list)
    
    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    last_accessed_at: Optional[datetime] = None
    access_count: int = 0
    
    # Status
    is_active: bool = True
    
    def is_expired(self) -> bool:
        """Check if secret has expired."""
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at
    
    def needs_rotation(self) -> bool:
        """Check if secret needs rotation."""
        if not self.rotation_enabled:
            return False
        
        if self.last_rotated_at is None:
            return True
        
        days_since_rotation = (datetime.utcnow() - self.last_rotated_at).days
        return days_since_rotation >= self.rotation_interval_days
    
    def to_dict(self, include_value: bool = False) -> Dict[str, Any]:
        """Convert to dictionary."""
        result = {
            "secret_id": self.secret_id,
            "name": self.name,
            "description": self.description,
            "secret_type": self.secret_type.value,
            "scope": self.scope.value,
            "tenant_id": self.tenant_id,
            "project_id": self.project_id,
            "user_id": self.user_id,
            "metadata": self.metadata,
            "tags": self.tags,
            "rotation_enabled": self.rotation_enabled,
            "rotation_interval_days": self.rotation_interval_days,
            "last_rotated_at": self.last_rotated_at.isoformat() if self.last_rotated_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "allowed_services": self.allowed_services,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "last_accessed_at": self.last_accessed_at.isoformat() if self.last_accessed_at else None,
            "access_count": self.access_count,
            "is_active": self.is_active,
            "is_expired": self.is_expired(),
            "needs_rotation": self.needs_rotation(),
        }
        
        if include_value:
            result["encrypted_value"] = self.encrypted_value
        
        return result


class SecretsManager:
    """
    Manager for secure credential storage.
    
    Features:
    - Encrypted storage
    - Multi-tenant isolation
    - Automatic rotation
    - Access auditing
    - Integration with external vaults
    """
    
    def __init__(
        self,
        encryption_key: Optional[str] = None,
        vault_url: Optional[str] = None,
        vault_token: Optional[str] = None,
    ):
        """
        Initialize secrets manager.
        
        Args:
            encryption_key: Master encryption key
            vault_url: HashiCorp Vault URL (optional)
            vault_token: Vault authentication token
        """
        self._encryption_key = encryption_key or os.environ.get(
            "SMARTSPEC_ENCRYPTION_KEY",
            "default-dev-key-change-in-production"
        )
        self._vault_url = vault_url
        self._vault_token = vault_token
        
        # Storage (replace with database in production)
        self._secrets: Dict[str, Secret] = {}
        
        # Indexes
        self._by_name: Dict[str, str] = {}  # name -> secret_id
        self._by_tenant: Dict[str, List[str]] = {}
        
        self._logger = logger.bind(component="secrets_manager")
        
        # Initialize encryption
        self._cipher = None
        self._initialize_encryption()
    
    def _initialize_encryption(self) -> None:
        """Initialize encryption cipher."""
        try:
            from cryptography.fernet import Fernet
            from cryptography.hazmat.primitives import hashes
            from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
            
            # Derive key from master key
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=b"smartspec-salt",  # Use proper salt in production
                iterations=100000,
            )
            key = base64.urlsafe_b64encode(
                kdf.derive(self._encryption_key.encode())
            )
            self._cipher = Fernet(key)
            
        except ImportError:
            self._logger.warning("cryptography_not_installed", fallback="base64")
            self._cipher = None
    
    def _encrypt(self, value: str) -> str:
        """Encrypt a value."""
        if self._cipher:
            return self._cipher.encrypt(value.encode()).decode()
        else:
            # Fallback to base64 (NOT secure, for development only)
            return base64.b64encode(value.encode()).decode()
    
    def _decrypt(self, encrypted_value: str) -> str:
        """Decrypt a value."""
        if self._cipher:
            return self._cipher.decrypt(encrypted_value.encode()).decode()
        else:
            return base64.b64decode(encrypted_value.encode()).decode()
    
    def _hash_value(self, value: str) -> str:
        """Hash a value for verification."""
        return hashlib.sha256(value.encode()).hexdigest()
    
    # ==================== CRUD Operations ====================
    
    async def create_secret(
        self,
        name: str,
        value: str,
        secret_type: SecretType = SecretType.CUSTOM,
        scope: SecretScope = SecretScope.TENANT,
        tenant_id: Optional[str] = None,
        project_id: Optional[str] = None,
        user_id: Optional[str] = None,
        description: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
        rotation_enabled: bool = False,
        rotation_interval_days: int = 90,
        expires_at: Optional[datetime] = None,
        allowed_services: Optional[List[str]] = None,
    ) -> Secret:
        """
        Create a new secret.
        
        Args:
            name: Secret name
            value: Secret value (will be encrypted)
            secret_type: Type of secret
            scope: Scope of secret
            tenant_id: Tenant ID
            project_id: Project ID
            user_id: User ID
            description: Description
            metadata: Additional metadata
            tags: Tags for categorization
            rotation_enabled: Enable automatic rotation
            rotation_interval_days: Days between rotations
            expires_at: Expiration time
            allowed_services: Services allowed to access
        
        Returns:
            Created secret
        """
        # Check for duplicate name
        full_name = self._get_full_name(name, tenant_id, project_id)
        if full_name in self._by_name:
            raise ValueError(f"Secret with name '{name}' already exists")
        
        # Create secret
        secret = Secret(
            name=name,
            description=description,
            secret_type=secret_type,
            scope=scope,
            tenant_id=tenant_id,
            project_id=project_id,
            user_id=user_id,
            encrypted_value=self._encrypt(value),
            value_hash=self._hash_value(value),
            metadata=metadata or {},
            tags=tags or [],
            rotation_enabled=rotation_enabled,
            rotation_interval_days=rotation_interval_days,
            last_rotated_at=datetime.utcnow() if rotation_enabled else None,
            expires_at=expires_at,
            allowed_services=allowed_services or [],
        )
        
        # Store
        self._secrets[secret.secret_id] = secret
        self._by_name[full_name] = secret.secret_id
        
        if tenant_id:
            if tenant_id not in self._by_tenant:
                self._by_tenant[tenant_id] = []
            self._by_tenant[tenant_id].append(secret.secret_id)
        
        self._logger.info(
            "secret_created",
            secret_id=secret.secret_id,
            name=name,
            type=secret_type.value,
        )
        
        return secret
    
    async def get_secret(
        self,
        secret_id: Optional[str] = None,
        name: Optional[str] = None,
        tenant_id: Optional[str] = None,
        project_id: Optional[str] = None,
        service: Optional[str] = None,
    ) -> Optional[Secret]:
        """
        Get a secret by ID or name.
        
        Args:
            secret_id: Secret ID
            name: Secret name
            tenant_id: Tenant ID (for name lookup)
            project_id: Project ID (for name lookup)
            service: Requesting service (for access control)
        
        Returns:
            Secret or None
        """
        # Find secret
        if secret_id:
            secret = self._secrets.get(secret_id)
        elif name:
            full_name = self._get_full_name(name, tenant_id, project_id)
            secret_id = self._by_name.get(full_name)
            secret = self._secrets.get(secret_id) if secret_id else None
        else:
            return None
        
        if not secret:
            return None
        
        # Check if active and not expired
        if not secret.is_active or secret.is_expired():
            return None
        
        # Check service access
        if service and secret.allowed_services:
            if service not in secret.allowed_services:
                self._logger.warning(
                    "secret_access_denied",
                    secret_id=secret.secret_id,
                    service=service,
                )
                return None
        
        # Update access tracking
        secret.last_accessed_at = datetime.utcnow()
        secret.access_count += 1
        
        return secret
    
    async def get_secret_value(
        self,
        secret_id: Optional[str] = None,
        name: Optional[str] = None,
        tenant_id: Optional[str] = None,
        project_id: Optional[str] = None,
        service: Optional[str] = None,
    ) -> Optional[str]:
        """
        Get decrypted secret value.
        
        Args:
            secret_id: Secret ID
            name: Secret name
            tenant_id: Tenant ID
            project_id: Project ID
            service: Requesting service
        
        Returns:
            Decrypted value or None
        """
        secret = await self.get_secret(
            secret_id=secret_id,
            name=name,
            tenant_id=tenant_id,
            project_id=project_id,
            service=service,
        )
        
        if not secret:
            return None
        
        try:
            return self._decrypt(secret.encrypted_value)
        except Exception as e:
            self._logger.error(
                "secret_decryption_failed",
                secret_id=secret.secret_id,
                error=str(e),
            )
            return None
    
    async def update_secret(
        self,
        secret_id: str,
        value: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
        rotation_enabled: Optional[bool] = None,
        rotation_interval_days: Optional[int] = None,
        expires_at: Optional[datetime] = None,
        allowed_services: Optional[List[str]] = None,
    ) -> Optional[Secret]:
        """Update a secret."""
        secret = self._secrets.get(secret_id)
        if not secret:
            return None
        
        if value is not None:
            secret.encrypted_value = self._encrypt(value)
            secret.value_hash = self._hash_value(value)
            secret.last_rotated_at = datetime.utcnow()
        
        if description is not None:
            secret.description = description
        
        if metadata is not None:
            secret.metadata.update(metadata)
        
        if tags is not None:
            secret.tags = tags
        
        if rotation_enabled is not None:
            secret.rotation_enabled = rotation_enabled
        
        if rotation_interval_days is not None:
            secret.rotation_interval_days = rotation_interval_days
        
        if expires_at is not None:
            secret.expires_at = expires_at
        
        if allowed_services is not None:
            secret.allowed_services = allowed_services
        
        secret.updated_at = datetime.utcnow()
        
        self._logger.info("secret_updated", secret_id=secret_id)
        return secret
    
    async def rotate_secret(
        self,
        secret_id: str,
        new_value: str,
    ) -> Optional[Secret]:
        """
        Rotate a secret's value.
        
        Args:
            secret_id: Secret ID
            new_value: New secret value
        
        Returns:
            Updated secret
        """
        secret = self._secrets.get(secret_id)
        if not secret:
            return None
        
        # Update value
        secret.encrypted_value = self._encrypt(new_value)
        secret.value_hash = self._hash_value(new_value)
        secret.last_rotated_at = datetime.utcnow()
        secret.updated_at = datetime.utcnow()
        
        self._logger.info(
            "secret_rotated",
            secret_id=secret_id,
            name=secret.name,
        )
        
        return secret
    
    async def delete_secret(self, secret_id: str) -> bool:
        """Delete a secret."""
        secret = self._secrets.get(secret_id)
        if not secret:
            return False
        
        # Remove from indexes
        full_name = self._get_full_name(
            secret.name, secret.tenant_id, secret.project_id
        )
        if full_name in self._by_name:
            del self._by_name[full_name]
        
        if secret.tenant_id and secret.tenant_id in self._by_tenant:
            self._by_tenant[secret.tenant_id].remove(secret_id)
        
        del self._secrets[secret_id]
        
        self._logger.info("secret_deleted", secret_id=secret_id)
        return True
    
    async def list_secrets(
        self,
        tenant_id: Optional[str] = None,
        project_id: Optional[str] = None,
        secret_type: Optional[SecretType] = None,
        tags: Optional[List[str]] = None,
        include_expired: bool = False,
    ) -> List[Secret]:
        """List secrets with filtering."""
        secrets = list(self._secrets.values())
        
        if tenant_id:
            secrets = [s for s in secrets if s.tenant_id == tenant_id]
        
        if project_id:
            secrets = [s for s in secrets if s.project_id == project_id]
        
        if secret_type:
            secrets = [s for s in secrets if s.secret_type == secret_type]
        
        if tags:
            secrets = [
                s for s in secrets
                if any(t in s.tags for t in tags)
            ]
        
        if not include_expired:
            secrets = [s for s in secrets if not s.is_expired()]
        
        return secrets
    
    # ==================== Rotation ====================
    
    async def check_rotations(self) -> List[Secret]:
        """
        Check for secrets that need rotation.
        
        Returns:
            List of secrets needing rotation
        """
        return [
            s for s in self._secrets.values()
            if s.is_active and s.needs_rotation()
        ]
    
    async def auto_rotate(
        self,
        secret_id: str,
        generator: Optional[callable] = None,
    ) -> Optional[Secret]:
        """
        Automatically rotate a secret.
        
        Args:
            secret_id: Secret ID
            generator: Function to generate new value
        
        Returns:
            Rotated secret
        """
        secret = self._secrets.get(secret_id)
        if not secret:
            return None
        
        # Generate new value
        if generator:
            new_value = generator()
        else:
            # Default: generate random string
            import secrets as py_secrets
            new_value = py_secrets.token_urlsafe(32)
        
        return await self.rotate_secret(secret_id, new_value)
    
    # ==================== Vault Integration ====================
    
    async def sync_to_vault(self, secret_id: str) -> bool:
        """Sync a secret to HashiCorp Vault."""
        if not self._vault_url or not self._vault_token:
            self._logger.warning("vault_not_configured")
            return False
        
        secret = self._secrets.get(secret_id)
        if not secret:
            return False
        
        try:
            import httpx
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self._vault_url}/v1/secret/data/{secret.name}",
                    headers={"X-Vault-Token": self._vault_token},
                    json={
                        "data": {
                            "value": self._decrypt(secret.encrypted_value),
                            "metadata": secret.metadata,
                        }
                    },
                )
                response.raise_for_status()
            
            self._logger.info("secret_synced_to_vault", secret_id=secret_id)
            return True
            
        except Exception as e:
            self._logger.error(
                "vault_sync_failed",
                secret_id=secret_id,
                error=str(e),
            )
            return False
    
    async def import_from_vault(
        self,
        path: str,
        tenant_id: Optional[str] = None,
    ) -> Optional[Secret]:
        """Import a secret from HashiCorp Vault."""
        if not self._vault_url or not self._vault_token:
            return None
        
        try:
            import httpx
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self._vault_url}/v1/secret/data/{path}",
                    headers={"X-Vault-Token": self._vault_token},
                )
                response.raise_for_status()
                data = response.json()
            
            value = data["data"]["data"]["value"]
            metadata = data["data"]["data"].get("metadata", {})
            
            return await self.create_secret(
                name=path.split("/")[-1],
                value=value,
                tenant_id=tenant_id,
                metadata=metadata,
            )
            
        except Exception as e:
            self._logger.error("vault_import_failed", path=path, error=str(e))
            return None
    
    # ==================== Helpers ====================
    
    def _get_full_name(
        self,
        name: str,
        tenant_id: Optional[str],
        project_id: Optional[str],
    ) -> str:
        """Get full name with scope prefix."""
        parts = []
        if tenant_id:
            parts.append(f"tenant:{tenant_id}")
        if project_id:
            parts.append(f"project:{project_id}")
        parts.append(name)
        return "/".join(parts)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get secrets manager statistics."""
        secrets = list(self._secrets.values())
        
        return {
            "total_secrets": len(secrets),
            "active_secrets": sum(1 for s in secrets if s.is_active),
            "expired_secrets": sum(1 for s in secrets if s.is_expired()),
            "needs_rotation": sum(1 for s in secrets if s.needs_rotation()),
            "by_type": {
                t.value: sum(1 for s in secrets if s.secret_type == t)
                for t in SecretType
            },
        }


# Global instance
_secrets_manager: Optional[SecretsManager] = None


def get_secrets_manager() -> SecretsManager:
    """Get global secrets manager instance."""
    global _secrets_manager
    if _secrets_manager is None:
        _secrets_manager = SecretsManager()
    return _secrets_manager
