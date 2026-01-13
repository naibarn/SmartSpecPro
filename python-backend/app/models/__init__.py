"""
SmartSpec Pro - Database Models
"""

# Existing models
from .audit_log import AuditLog
from .credit import CreditTransaction, SystemConfig
from .api_key import APIKey, APIKeyUsage
from .oauth import OAuthConnection
from .password_reset import PasswordResetToken
from .payment import PaymentTransaction
from .refund import Refund
from .support_ticket import SupportTicket, TicketMessage
from .user import User
from .execution import ExecutionModel, CheckpointModel, ExecutionStatus
from .semantic_memory import SemanticMemory, MemoryType, MemoryScope
from .provider_config import ProviderConfig
from .opencode_api_key import OpenCodeAPIKey, OpenCodeAPIKeyUsage, OpenCodeKeyStatus

# Phase 3: Multi-tenancy models
from .tenant import Tenant, TenantUser, TenantStatus, TenantPlan

# Phase 3: RBAC models
from .rbac import Role, Permission, RoleAssignment, Policy, PermissionScope

# Phase 3: Approval models
from .approval import (
    ApprovalRequest,
    ApprovalResponse,
    ApprovalRule,
    ApprovalStatus,
    ApprovalType,
)

# Phase 3: Secret models
from .secret import Secret, SecretVersion, AuditEvent, SecretType

# Phase 3: Vector store models
from .vector_store import (
    VectorCollection,
    VectorDocument,
    EmbeddingJob,
    VectorIndexType,
)

__all__ = [
    # Existing
    "AuditLog",
    "CreditTransaction",
    "SystemConfig",
    "APIKey",
    "APIKeyUsage",
    "OAuthConnection",
    "PasswordResetToken",
    "PaymentTransaction",
    "Refund",
    "SupportTicket",
    "TicketMessage",
    "User",
    "ExecutionModel",
    "CheckpointModel",
    "ExecutionStatus",
    "SemanticMemory",
    "MemoryType",
    "MemoryScope",
    "ProviderConfig",
    "OpenCodeAPIKey",
    "OpenCodeAPIKeyUsage",
    "OpenCodeKeyStatus",
    # Multi-tenancy
    "Tenant",
    "TenantUser",
    "TenantStatus",
    "TenantPlan",
    # RBAC
    "Role",
    "Permission",
    "RoleAssignment",
    "Policy",
    "PermissionScope",
    # Approval
    "ApprovalRequest",
    "ApprovalResponse",
    "ApprovalRule",
    "ApprovalStatus",
    "ApprovalType",
    # Secrets
    "Secret",
    "SecretVersion",
    "AuditEvent",
    "SecretType",
    # Vector Store
    "VectorCollection",
    "VectorDocument",
    "EmbeddingJob",
    "VectorIndexType",
]
