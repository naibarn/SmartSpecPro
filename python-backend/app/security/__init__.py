"""
SmartSpec Pro - Security Module
Phase 3: SaaS Readiness

Security features:
- Secrets management
- Encryption service
- API key management
- Audit logging
"""

from .secrets_manager import (
    SecretsManager,
    SecretType,
    Secret,
    get_secrets_manager,
)
from .encryption import (
    EncryptionService,
    get_encryption_service,
)
from .audit_logger import (
    AuditLogger,
    AuditEvent,
    AuditAction,
    get_audit_logger,
)

__all__ = [
    # Secrets
    "SecretsManager",
    "SecretType",
    "Secret",
    "get_secrets_manager",
    # Encryption
    "EncryptionService",
    "get_encryption_service",
    # Audit
    "AuditLogger",
    "AuditEvent",
    "AuditAction",
    "get_audit_logger",
]
