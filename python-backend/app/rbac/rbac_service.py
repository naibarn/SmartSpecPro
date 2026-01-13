"""
RBAC Service
Phase 3: SaaS Readiness
"""

import structlog
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Set
from functools import lru_cache

from .models import (
    Role,
    Permission,
    RoleAssignment,
    ResourceType,
    PermissionScope,
    SYSTEM_ROLES,
    SYSTEM_PERMISSIONS,
)

logger = structlog.get_logger(__name__)


class RBACService:
    """
    Role-Based Access Control Service.
    
    Manages roles, permissions, and access control decisions.
    """
    
    def __init__(self):
        """Initialize RBAC service."""
        # Storage (replace with database in production)
        self._roles: Dict[str, Role] = {}
        self._permissions: Dict[str, Permission] = {}
        self._assignments: Dict[str, RoleAssignment] = {}
        
        # Indexes
        self._user_assignments: Dict[str, List[str]] = {}  # user_id -> [assignment_ids]
        self._role_by_code: Dict[str, str] = {}  # code -> role_id
        
        # Cache
        self._permission_cache: Dict[str, Set[str]] = {}  # user_id -> permissions
        self._cache_ttl = 300  # 5 minutes
        self._cache_timestamps: Dict[str, datetime] = {}
        
        self._logger = logger.bind(service="rbac")
        
        # Initialize system roles and permissions
        self._initialize_system_data()
    
    def _initialize_system_data(self) -> None:
        """Initialize system roles and permissions."""
        # Add system permissions
        for perm in SYSTEM_PERMISSIONS:
            self._permissions[perm.permission_id] = perm
        
        # Add system roles
        for code, role in SYSTEM_ROLES.items():
            self._roles[role.role_id] = role
            self._role_by_code[code] = role.role_id
    
    # ==================== Role Management ====================
    
    async def create_role(
        self,
        name: str,
        code: str,
        description: str = "",
        permissions: Optional[Set[str]] = None,
        tenant_id: Optional[str] = None,
        parent_role_id: Optional[str] = None,
        is_default: bool = False,
    ) -> Role:
        """
        Create a new role.
        
        Args:
            name: Role name
            code: Unique role code
            description: Role description
            permissions: Set of permission codes
            tenant_id: Tenant ID (None for global roles)
            parent_role_id: Parent role for inheritance
            is_default: Auto-assign to new users
        
        Returns:
            Created role
        """
        # Check for duplicate code
        existing = await self.get_role_by_code(code, tenant_id)
        if existing:
            raise ValueError(f"Role with code '{code}' already exists")
        
        role = Role(
            name=name,
            code=code,
            description=description,
            permissions=permissions or set(),
            tenant_id=tenant_id,
            parent_role_id=parent_role_id,
            is_default=is_default,
        )
        
        self._roles[role.role_id] = role
        cache_key = f"{tenant_id or 'global'}:{code}"
        self._role_by_code[cache_key] = role.role_id
        
        self._logger.info(
            "role_created",
            role_id=role.role_id,
            code=code,
            tenant_id=tenant_id,
        )
        
        return role
    
    async def get_role(self, role_id: str) -> Optional[Role]:
        """Get role by ID."""
        return self._roles.get(role_id)
    
    async def get_role_by_code(
        self,
        code: str,
        tenant_id: Optional[str] = None,
    ) -> Optional[Role]:
        """Get role by code."""
        # Try tenant-specific first
        if tenant_id:
            cache_key = f"{tenant_id}:{code}"
            role_id = self._role_by_code.get(cache_key)
            if role_id:
                return self._roles.get(role_id)
        
        # Try global
        cache_key = f"global:{code}"
        role_id = self._role_by_code.get(cache_key)
        if role_id:
            return self._roles.get(role_id)
        
        # Try system roles
        role_id = self._role_by_code.get(code)
        if role_id:
            return self._roles.get(role_id)
        
        return None
    
    async def update_role(
        self,
        role_id: str,
        updates: Dict[str, Any],
    ) -> Optional[Role]:
        """Update a role."""
        role = self._roles.get(role_id)
        if not role:
            return None
        
        if role.is_system:
            raise ValueError("Cannot modify system roles")
        
        allowed_fields = ["name", "description", "is_default", "priority"]
        for field, value in updates.items():
            if field in allowed_fields:
                setattr(role, field, value)
        
        role.updated_at = datetime.utcnow()
        
        # Invalidate cache for users with this role
        self._invalidate_role_cache(role_id)
        
        self._logger.info("role_updated", role_id=role_id)
        return role
    
    async def delete_role(self, role_id: str) -> bool:
        """Delete a role."""
        role = self._roles.get(role_id)
        if not role:
            return False
        
        if role.is_system:
            raise ValueError("Cannot delete system roles")
        
        # Remove all assignments for this role
        assignments_to_remove = [
            aid for aid, a in self._assignments.items()
            if a.role_id == role_id
        ]
        for aid in assignments_to_remove:
            del self._assignments[aid]
        
        # Remove from indexes
        cache_key = f"{role.tenant_id or 'global'}:{role.code}"
        self._role_by_code.pop(cache_key, None)
        
        del self._roles[role_id]
        
        self._logger.info("role_deleted", role_id=role_id)
        return True
    
    async def add_permission_to_role(
        self,
        role_id: str,
        permission_code: str,
    ) -> Optional[Role]:
        """Add permission to a role."""
        role = self._roles.get(role_id)
        if not role:
            return None
        
        if role.is_system:
            raise ValueError("Cannot modify system roles")
        
        role.add_permission(permission_code)
        self._invalidate_role_cache(role_id)
        
        self._logger.info(
            "permission_added_to_role",
            role_id=role_id,
            permission=permission_code,
        )
        return role
    
    async def remove_permission_from_role(
        self,
        role_id: str,
        permission_code: str,
    ) -> Optional[Role]:
        """Remove permission from a role."""
        role = self._roles.get(role_id)
        if not role:
            return None
        
        if role.is_system:
            raise ValueError("Cannot modify system roles")
        
        role.remove_permission(permission_code)
        self._invalidate_role_cache(role_id)
        
        self._logger.info(
            "permission_removed_from_role",
            role_id=role_id,
            permission=permission_code,
        )
        return role
    
    async def list_roles(
        self,
        tenant_id: Optional[str] = None,
        include_system: bool = True,
    ) -> List[Role]:
        """List roles."""
        roles = []
        for role in self._roles.values():
            # Filter by tenant
            if tenant_id and role.tenant_id and role.tenant_id != tenant_id:
                continue
            
            # Filter system roles
            if not include_system and role.is_system:
                continue
            
            roles.append(role)
        
        # Sort by priority
        roles.sort(key=lambda r: r.priority, reverse=True)
        return roles
    
    # ==================== Role Assignment ====================
    
    async def assign_role(
        self,
        user_id: str,
        role_id: str,
        tenant_id: Optional[str] = None,
        scope_type: Optional[ResourceType] = None,
        scope_id: Optional[str] = None,
        assigned_by: Optional[str] = None,
        expires_in_days: Optional[int] = None,
    ) -> RoleAssignment:
        """
        Assign a role to a user.
        
        Args:
            user_id: User ID
            role_id: Role ID
            tenant_id: Tenant ID
            scope_type: Optional resource type for scoped assignment
            scope_id: Optional resource ID for scoped assignment
            assigned_by: Who assigned the role
            expires_in_days: Optional expiration
        
        Returns:
            Role assignment
        """
        # Verify role exists
        role = self._roles.get(role_id)
        if not role:
            raise ValueError(f"Role '{role_id}' not found")
        
        # Check for existing assignment
        existing = await self._find_assignment(
            user_id, role_id, tenant_id, scope_type, scope_id
        )
        if existing and existing.is_valid():
            return existing
        
        # Create assignment
        assignment = RoleAssignment(
            user_id=user_id,
            role_id=role_id,
            tenant_id=tenant_id,
            scope_type=scope_type,
            scope_id=scope_id,
            assigned_by=assigned_by,
        )
        
        if expires_in_days:
            assignment.expires_at = datetime.utcnow() + timedelta(days=expires_in_days)
        
        self._assignments[assignment.assignment_id] = assignment
        
        # Update index
        if user_id not in self._user_assignments:
            self._user_assignments[user_id] = []
        self._user_assignments[user_id].append(assignment.assignment_id)
        
        # Invalidate cache
        self._invalidate_user_cache(user_id)
        
        self._logger.info(
            "role_assigned",
            user_id=user_id,
            role_id=role_id,
            role_code=role.code,
            tenant_id=tenant_id,
        )
        
        return assignment
    
    async def revoke_role(
        self,
        user_id: str,
        role_id: str,
        tenant_id: Optional[str] = None,
        scope_type: Optional[ResourceType] = None,
        scope_id: Optional[str] = None,
        revoked_by: Optional[str] = None,
    ) -> bool:
        """Revoke a role from a user."""
        assignment = await self._find_assignment(
            user_id, role_id, tenant_id, scope_type, scope_id
        )
        
        if not assignment:
            return False
        
        assignment.revoke(revoked_by)
        self._invalidate_user_cache(user_id)
        
        self._logger.info(
            "role_revoked",
            user_id=user_id,
            role_id=role_id,
            tenant_id=tenant_id,
        )
        
        return True
    
    async def get_user_roles(
        self,
        user_id: str,
        tenant_id: Optional[str] = None,
    ) -> List[Role]:
        """Get all roles for a user."""
        roles = []
        assignment_ids = self._user_assignments.get(user_id, [])
        
        for aid in assignment_ids:
            assignment = self._assignments.get(aid)
            if not assignment or not assignment.is_valid():
                continue
            
            # Filter by tenant
            if tenant_id and assignment.tenant_id and assignment.tenant_id != tenant_id:
                continue
            
            role = self._roles.get(assignment.role_id)
            if role:
                roles.append(role)
        
        # Sort by priority
        roles.sort(key=lambda r: r.priority, reverse=True)
        return roles
    
    async def get_user_role_codes(
        self,
        user_id: str,
        tenant_id: Optional[str] = None,
    ) -> List[str]:
        """Get role codes for a user."""
        roles = await self.get_user_roles(user_id, tenant_id)
        return [r.code for r in roles]
    
    async def _find_assignment(
        self,
        user_id: str,
        role_id: str,
        tenant_id: Optional[str],
        scope_type: Optional[ResourceType],
        scope_id: Optional[str],
    ) -> Optional[RoleAssignment]:
        """Find a specific assignment."""
        assignment_ids = self._user_assignments.get(user_id, [])
        
        for aid in assignment_ids:
            assignment = self._assignments.get(aid)
            if not assignment:
                continue
            
            if (
                assignment.role_id == role_id and
                assignment.tenant_id == tenant_id and
                assignment.scope_type == scope_type and
                assignment.scope_id == scope_id
            ):
                return assignment
        
        return None
    
    # ==================== Permission Checking ====================
    
    async def get_user_permissions(
        self,
        user_id: str,
        tenant_id: Optional[str] = None,
    ) -> Set[str]:
        """
        Get all permissions for a user.
        
        Args:
            user_id: User ID
            tenant_id: Tenant ID
        
        Returns:
            Set of permission codes
        """
        # Check cache
        cache_key = f"{user_id}:{tenant_id or 'global'}"
        if self._is_cache_valid(cache_key):
            return self._permission_cache.get(cache_key, set())
        
        # Collect permissions from all roles
        permissions: Set[str] = set()
        roles = await self.get_user_roles(user_id, tenant_id)
        
        for role in roles:
            permissions.update(role.permissions)
            
            # Include inherited permissions
            if role.parent_role_id:
                parent = self._roles.get(role.parent_role_id)
                if parent:
                    permissions.update(parent.permissions)
        
        # Update cache
        self._permission_cache[cache_key] = permissions
        self._cache_timestamps[cache_key] = datetime.utcnow()
        
        return permissions
    
    async def has_permission(
        self,
        user_id: str,
        permission_code: str,
        tenant_id: Optional[str] = None,
        resource_id: Optional[str] = None,
    ) -> bool:
        """
        Check if user has a specific permission.
        
        Args:
            user_id: User ID
            permission_code: Permission code to check
            tenant_id: Tenant ID
            resource_id: Optional resource ID for scoped check
        
        Returns:
            True if user has permission
        """
        permissions = await self.get_user_permissions(user_id, tenant_id)
        
        # Direct match
        if permission_code in permissions:
            return True
        
        # Wildcard match
        for perm in permissions:
            if self._matches_wildcard(perm, permission_code):
                return True
        
        return False
    
    async def has_any_permission(
        self,
        user_id: str,
        permission_codes: List[str],
        tenant_id: Optional[str] = None,
    ) -> bool:
        """Check if user has any of the specified permissions."""
        for code in permission_codes:
            if await self.has_permission(user_id, code, tenant_id):
                return True
        return False
    
    async def has_all_permissions(
        self,
        user_id: str,
        permission_codes: List[str],
        tenant_id: Optional[str] = None,
    ) -> bool:
        """Check if user has all specified permissions."""
        for code in permission_codes:
            if not await self.has_permission(user_id, code, tenant_id):
                return False
        return True
    
    async def has_role(
        self,
        user_id: str,
        role_code: str,
        tenant_id: Optional[str] = None,
    ) -> bool:
        """Check if user has a specific role."""
        role_codes = await self.get_user_role_codes(user_id, tenant_id)
        return role_code in role_codes
    
    async def has_any_role(
        self,
        user_id: str,
        role_codes: List[str],
        tenant_id: Optional[str] = None,
    ) -> bool:
        """Check if user has any of the specified roles."""
        user_roles = await self.get_user_role_codes(user_id, tenant_id)
        return any(code in user_roles for code in role_codes)
    
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
    
    # ==================== Cache Management ====================
    
    def _is_cache_valid(self, cache_key: str) -> bool:
        """Check if cache entry is valid."""
        if cache_key not in self._cache_timestamps:
            return False
        
        age = (datetime.utcnow() - self._cache_timestamps[cache_key]).total_seconds()
        return age < self._cache_ttl
    
    def _invalidate_user_cache(self, user_id: str) -> None:
        """Invalidate cache for a user."""
        keys_to_remove = [k for k in self._permission_cache if k.startswith(f"{user_id}:")]
        for key in keys_to_remove:
            self._permission_cache.pop(key, None)
            self._cache_timestamps.pop(key, None)
    
    def _invalidate_role_cache(self, role_id: str) -> None:
        """Invalidate cache for all users with a role."""
        user_ids = set()
        for assignment in self._assignments.values():
            if assignment.role_id == role_id and assignment.is_valid():
                user_ids.add(assignment.user_id)
        
        for user_id in user_ids:
            self._invalidate_user_cache(user_id)
    
    def clear_cache(self) -> None:
        """Clear all caches."""
        self._permission_cache.clear()
        self._cache_timestamps.clear()


# Global instance
_rbac_service: Optional[RBACService] = None


def get_rbac_service() -> RBACService:
    """Get global RBAC service instance."""
    global _rbac_service
    if _rbac_service is None:
        _rbac_service = RBACService()
    return _rbac_service
