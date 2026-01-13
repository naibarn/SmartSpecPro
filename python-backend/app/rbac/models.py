"""
RBAC Models
Phase 3: SaaS Readiness
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List, Set
import uuid


class ResourceType(str, Enum):
    """Types of resources that can be protected."""
    PROJECT = "project"
    WORKSPACE = "workspace"
    DOCUMENT = "document"
    API_KEY = "api_key"
    WORKFLOW = "workflow"
    MEMORY = "memory"
    TEMPLATE = "template"
    SKILL = "skill"
    SETTINGS = "settings"
    USER = "user"
    ROLE = "role"
    TENANT = "tenant"
    BILLING = "billing"
    AUDIT_LOG = "audit_log"


class PermissionScope(str, Enum):
    """Scope of permissions."""
    GLOBAL = "global"  # Applies to all resources
    TENANT = "tenant"  # Applies within tenant
    PROJECT = "project"  # Applies within project
    RESOURCE = "resource"  # Applies to specific resource


@dataclass
class Permission:
    """
    Permission definition.
    
    Format: resource:action or resource:action:scope
    Examples:
        - project:read
        - project:write
        - project:delete
        - workflow:execute
        - settings:admin
    """
    
    permission_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""  # Human-readable name
    code: str = ""  # Permission code (e.g., "project:read")
    description: str = ""
    
    # Parsed components
    resource_type: Optional[ResourceType] = None
    action: str = ""
    scope: PermissionScope = PermissionScope.TENANT
    
    # Metadata
    is_system: bool = False  # System permissions cannot be deleted
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    def __post_init__(self):
        """Parse permission code."""
        if self.code and not self.resource_type:
            self._parse_code()
    
    def _parse_code(self) -> None:
        """Parse permission code into components."""
        parts = self.code.split(":")
        if len(parts) >= 2:
            try:
                self.resource_type = ResourceType(parts[0])
            except ValueError:
                pass
            self.action = parts[1]
            if len(parts) >= 3:
                try:
                    self.scope = PermissionScope(parts[2])
                except ValueError:
                    pass
    
    def matches(self, required: str) -> bool:
        """
        Check if this permission matches a required permission.
        
        Supports wildcards:
        - "project:*" matches "project:read", "project:write", etc.
        - "*:read" matches "project:read", "workflow:read", etc.
        - "*:*" matches everything
        
        Args:
            required: Required permission code
        
        Returns:
            True if matches
        """
        if self.code == required:
            return True
        
        # Check wildcards
        self_parts = self.code.split(":")
        req_parts = required.split(":")
        
        if len(self_parts) != len(req_parts):
            return False
        
        for self_part, req_part in zip(self_parts, req_parts):
            if self_part != "*" and self_part != req_part:
                return False
        
        return True
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "permission_id": self.permission_id,
            "name": self.name,
            "code": self.code,
            "description": self.description,
            "resource_type": self.resource_type.value if self.resource_type else None,
            "action": self.action,
            "scope": self.scope.value,
            "is_system": self.is_system,
            "created_at": self.created_at.isoformat(),
        }


@dataclass
class Role:
    """
    Role definition.
    
    A role is a collection of permissions that can be assigned to users.
    """
    
    role_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    code: str = ""  # Unique code (e.g., "admin", "developer", "viewer")
    description: str = ""
    
    # Tenant association (None for system roles)
    tenant_id: Optional[str] = None
    
    # Permissions
    permissions: Set[str] = field(default_factory=set)  # Permission codes
    
    # Inheritance
    parent_role_id: Optional[str] = None  # Inherits permissions from parent
    
    # Metadata
    is_system: bool = False  # System roles cannot be deleted
    is_default: bool = False  # Automatically assigned to new users
    priority: int = 0  # Higher priority roles take precedence
    
    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    
    def has_permission(self, permission_code: str) -> bool:
        """
        Check if role has a permission.
        
        Args:
            permission_code: Permission code to check
        
        Returns:
            True if role has permission
        """
        # Direct match
        if permission_code in self.permissions:
            return True
        
        # Check wildcards
        for perm in self.permissions:
            if self._matches_wildcard(perm, permission_code):
                return True
        
        return False
    
    def _matches_wildcard(self, pattern: str, target: str) -> bool:
        """Check if pattern matches target with wildcards."""
        pattern_parts = pattern.split(":")
        target_parts = target.split(":")
        
        if len(pattern_parts) != len(target_parts):
            return False
        
        for p, t in zip(pattern_parts, target_parts):
            if p != "*" and p != t:
                return False
        
        return True
    
    def add_permission(self, permission_code: str) -> None:
        """Add a permission to the role."""
        self.permissions.add(permission_code)
        self.updated_at = datetime.utcnow()
    
    def remove_permission(self, permission_code: str) -> None:
        """Remove a permission from the role."""
        self.permissions.discard(permission_code)
        self.updated_at = datetime.utcnow()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "role_id": self.role_id,
            "name": self.name,
            "code": self.code,
            "description": self.description,
            "tenant_id": self.tenant_id,
            "permissions": list(self.permissions),
            "parent_role_id": self.parent_role_id,
            "is_system": self.is_system,
            "is_default": self.is_default,
            "priority": self.priority,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Role":
        """Create from dictionary."""
        if "permissions" in data and isinstance(data["permissions"], list):
            data["permissions"] = set(data["permissions"])
        return cls(**data)


@dataclass
class RoleAssignment:
    """
    Assignment of a role to a user.
    """
    
    assignment_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    role_id: str = ""
    tenant_id: Optional[str] = None
    
    # Scope (optional resource-level assignment)
    scope_type: Optional[ResourceType] = None
    scope_id: Optional[str] = None  # e.g., project_id
    
    # Assignment metadata
    assigned_by: Optional[str] = None
    assigned_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None
    
    # Status
    is_active: bool = True
    revoked_at: Optional[datetime] = None
    revoked_by: Optional[str] = None
    
    def is_valid(self) -> bool:
        """Check if assignment is currently valid."""
        if not self.is_active:
            return False
        if self.expires_at and datetime.utcnow() > self.expires_at:
            return False
        return True
    
    def revoke(self, revoked_by: Optional[str] = None) -> None:
        """Revoke the assignment."""
        self.is_active = False
        self.revoked_at = datetime.utcnow()
        self.revoked_by = revoked_by
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "assignment_id": self.assignment_id,
            "user_id": self.user_id,
            "role_id": self.role_id,
            "tenant_id": self.tenant_id,
            "scope_type": self.scope_type.value if self.scope_type else None,
            "scope_id": self.scope_id,
            "assigned_by": self.assigned_by,
            "assigned_at": self.assigned_at.isoformat(),
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "is_active": self.is_active,
            "is_valid": self.is_valid(),
        }


# Predefined system roles
SYSTEM_ROLES = {
    "super_admin": Role(
        role_id="system-super-admin",
        name="Super Admin",
        code="super_admin",
        description="Full system access",
        permissions={"*:*"},
        is_system=True,
        priority=1000,
    ),
    "tenant_admin": Role(
        role_id="system-tenant-admin",
        name="Tenant Admin",
        code="tenant_admin",
        description="Full tenant access",
        permissions={
            "project:*",
            "workspace:*",
            "document:*",
            "api_key:*",
            "workflow:*",
            "memory:*",
            "template:*",
            "skill:*",
            "settings:*",
            "user:read",
            "user:invite",
            "role:read",
            "role:assign",
        },
        is_system=True,
        priority=900,
    ),
    "developer": Role(
        role_id="system-developer",
        name="Developer",
        code="developer",
        description="Development access",
        permissions={
            "project:read",
            "project:write",
            "workspace:read",
            "workspace:write",
            "document:read",
            "document:write",
            "api_key:read",
            "api_key:create",
            "workflow:read",
            "workflow:write",
            "workflow:execute",
            "memory:read",
            "memory:write",
            "template:read",
            "skill:read",
            "skill:write",
        },
        is_system=True,
        is_default=True,
        priority=500,
    ),
    "viewer": Role(
        role_id="system-viewer",
        name="Viewer",
        code="viewer",
        description="Read-only access",
        permissions={
            "project:read",
            "workspace:read",
            "document:read",
            "workflow:read",
            "memory:read",
            "template:read",
            "skill:read",
        },
        is_system=True,
        priority=100,
    ),
    "billing_admin": Role(
        role_id="system-billing-admin",
        name="Billing Admin",
        code="billing_admin",
        description="Billing and subscription management",
        permissions={
            "billing:*",
            "settings:read",
        },
        is_system=True,
        priority=800,
    ),
}


# Predefined permissions
SYSTEM_PERMISSIONS = [
    # Project permissions
    Permission(code="project:read", name="View Projects", is_system=True),
    Permission(code="project:write", name="Edit Projects", is_system=True),
    Permission(code="project:delete", name="Delete Projects", is_system=True),
    Permission(code="project:admin", name="Administer Projects", is_system=True),
    
    # Workspace permissions
    Permission(code="workspace:read", name="View Workspaces", is_system=True),
    Permission(code="workspace:write", name="Edit Workspaces", is_system=True),
    Permission(code="workspace:delete", name="Delete Workspaces", is_system=True),
    Permission(code="workspace:execute", name="Execute in Workspaces", is_system=True),
    
    # Workflow permissions
    Permission(code="workflow:read", name="View Workflows", is_system=True),
    Permission(code="workflow:write", name="Edit Workflows", is_system=True),
    Permission(code="workflow:execute", name="Execute Workflows", is_system=True),
    Permission(code="workflow:approve", name="Approve Workflows", is_system=True),
    
    # API Key permissions
    Permission(code="api_key:read", name="View API Keys", is_system=True),
    Permission(code="api_key:create", name="Create API Keys", is_system=True),
    Permission(code="api_key:delete", name="Delete API Keys", is_system=True),
    
    # User permissions
    Permission(code="user:read", name="View Users", is_system=True),
    Permission(code="user:invite", name="Invite Users", is_system=True),
    Permission(code="user:manage", name="Manage Users", is_system=True),
    
    # Role permissions
    Permission(code="role:read", name="View Roles", is_system=True),
    Permission(code="role:write", name="Edit Roles", is_system=True),
    Permission(code="role:assign", name="Assign Roles", is_system=True),
    
    # Settings permissions
    Permission(code="settings:read", name="View Settings", is_system=True),
    Permission(code="settings:write", name="Edit Settings", is_system=True),
    Permission(code="settings:admin", name="Administer Settings", is_system=True),
    
    # Billing permissions
    Permission(code="billing:read", name="View Billing", is_system=True),
    Permission(code="billing:write", name="Manage Billing", is_system=True),
]
