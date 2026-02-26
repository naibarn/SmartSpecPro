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
from .opencode_key import OpenCodeAPIKey, OpenCodeAPIKeyUsage, OpenCodeKeyStatus

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
from .vault_model import Secret, SecretVersion, AuditEvent, SecretType

# Phase 3: Vector store models
from .vector_store import (
    VectorCollection,
    VectorDocument,
    EmbeddingJob,
    VectorIndexType,
)

# Asset Management
from .asset import Asset, AssetType, AssetStatus

# Media Generation
from .media_task import MediaTask, TaskStatus, MediaType
from .media_callback_event import (
    MediaCallbackEvent,
    MediaCallbackDLQ,
    CallbackEventStatus,
    CallbackDLQStatus,
)
from .library import (
    LibraryItem,
    LibraryLink,
    LibraryChunk,
    LibraryPermission,
    LibraryIndexJob,
)

# Sandbox execution
from .sandbox import (
    SandboxProfile,
    SandboxJob,
    SandboxArtifact,
    TenantSandboxPolicy,
    SandboxExecutionMode,
    SandboxJobStatus,
    SandboxArtifactType,
    SandboxFeatureType,
    SandboxNetworkAction,
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
    # Asset Management
    "Asset",
    "AssetType",
    "AssetStatus",
    # Media Generation
    "MediaTask",
    "TaskStatus",
    "MediaType",
    "MediaCallbackEvent",
    "MediaCallbackDLQ",
    "CallbackEventStatus",
    "CallbackDLQStatus",
    # Library/RAG
    "LibraryItem",
    "LibraryLink",
    "LibraryChunk",
    "LibraryPermission",
    "LibraryIndexJob",
    # Sandbox
    "SandboxProfile",
    "SandboxJob",
    "SandboxArtifact",
    "TenantSandboxPolicy",
    "SandboxExecutionMode",
    "SandboxJobStatus",
    "SandboxArtifactType",
    "SandboxFeatureType",
    "SandboxNetworkAction",
]
