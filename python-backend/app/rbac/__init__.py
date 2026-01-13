"""
SmartSpec Pro - RBAC Module
Phase 3: SaaS Readiness

Role-Based Access Control (RBAC) implementation providing:
- Role management (create, assign, revoke)
- Permission management
- Policy enforcement
- Access control middleware
"""

from .models import (
    Role,
    Permission,
    RoleAssignment,
    PermissionScope,
    ResourceType,
)
from .rbac_service import (
    RBACService,
    get_rbac_service,
)
from .policy_engine import (
    PolicyEngine,
    Policy,
    PolicyEffect,
    PolicyCondition,
    get_policy_engine,
)
from .decorators import (
    require_permission,
    require_role,
    require_any_role,
    check_permission,
)

__all__ = [
    # Models
    "Role",
    "Permission",
    "RoleAssignment",
    "PermissionScope",
    "ResourceType",
    # Service
    "RBACService",
    "get_rbac_service",
    # Policy
    "PolicyEngine",
    "Policy",
    "PolicyEffect",
    "PolicyCondition",
    "get_policy_engine",
    # Decorators
    "require_permission",
    "require_role",
    "require_any_role",
    "check_permission",
]
