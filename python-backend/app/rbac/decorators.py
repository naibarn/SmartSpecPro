"""
RBAC Decorators for FastAPI
Phase 3: SaaS Readiness
"""

import structlog
from functools import wraps
from typing import Optional, List, Callable, Any, Union
from fastapi import HTTPException, Depends, Request

from .rbac_service import get_rbac_service, RBACService
from ..multitenancy.tenant_context import get_current_tenant, TenantContext

logger = structlog.get_logger(__name__)


class PermissionChecker:
    """
    FastAPI dependency for permission checking.
    
    Usage:
        @app.get("/projects")
        async def list_projects(
            _: None = Depends(PermissionChecker("project:read"))
        ):
            return {"projects": []}
    """
    
    def __init__(
        self,
        permission: str,
        rbac_service: Optional[RBACService] = None,
    ):
        """
        Initialize permission checker.
        
        Args:
            permission: Required permission code
            rbac_service: Optional RBAC service instance
        """
        self.permission = permission
        self.rbac_service = rbac_service
    
    async def __call__(self, request: Request) -> None:
        """Check permission."""
        service = self.rbac_service or get_rbac_service()
        
        # Get user ID from request
        user_id = self._get_user_id(request)
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail={
                    "error": "unauthorized",
                    "message": "Authentication required",
                },
            )
        
        # Get tenant context
        tenant_context = get_current_tenant()
        tenant_id = tenant_context.tenant_id if tenant_context else None
        
        # Check permission
        has_perm = await service.has_permission(
            user_id=user_id,
            permission_code=self.permission,
            tenant_id=tenant_id,
        )
        
        if not has_perm:
            logger.warning(
                "permission_denied",
                user_id=user_id,
                permission=self.permission,
                tenant_id=tenant_id,
            )
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "forbidden",
                    "message": f"Permission '{self.permission}' required",
                    "required_permission": self.permission,
                },
            )
    
    def _get_user_id(self, request: Request) -> Optional[str]:
        """Extract user ID from request."""
        # Try request state (set by auth middleware)
        if hasattr(request.state, "user_id"):
            return request.state.user_id
        
        if hasattr(request.state, "user"):
            user = request.state.user
            if isinstance(user, dict):
                return user.get("id") or user.get("user_id")
            return getattr(user, "id", None) or getattr(user, "user_id", None)
        
        # Try tenant context
        tenant_context = get_current_tenant()
        if tenant_context and tenant_context.user_id:
            return tenant_context.user_id
        
        return None


class RoleChecker:
    """
    FastAPI dependency for role checking.
    
    Usage:
        @app.get("/admin/users")
        async def list_users(
            _: None = Depends(RoleChecker("admin"))
        ):
            return {"users": []}
    """
    
    def __init__(
        self,
        role: Union[str, List[str]],
        require_all: bool = False,
        rbac_service: Optional[RBACService] = None,
    ):
        """
        Initialize role checker.
        
        Args:
            role: Required role code(s)
            require_all: If True, user must have all roles
            rbac_service: Optional RBAC service instance
        """
        self.roles = [role] if isinstance(role, str) else role
        self.require_all = require_all
        self.rbac_service = rbac_service
    
    async def __call__(self, request: Request) -> None:
        """Check role."""
        service = self.rbac_service or get_rbac_service()
        
        # Get user ID from request
        user_id = self._get_user_id(request)
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail={
                    "error": "unauthorized",
                    "message": "Authentication required",
                },
            )
        
        # Get tenant context
        tenant_context = get_current_tenant()
        tenant_id = tenant_context.tenant_id if tenant_context else None
        
        # Check roles
        if self.require_all:
            # Must have all roles
            for role in self.roles:
                has_role = await service.has_role(user_id, role, tenant_id)
                if not has_role:
                    self._raise_forbidden(role)
        else:
            # Must have any role
            has_any = await service.has_any_role(user_id, self.roles, tenant_id)
            if not has_any:
                self._raise_forbidden(self.roles)
    
    def _get_user_id(self, request: Request) -> Optional[str]:
        """Extract user ID from request."""
        if hasattr(request.state, "user_id"):
            return request.state.user_id
        
        if hasattr(request.state, "user"):
            user = request.state.user
            if isinstance(user, dict):
                return user.get("id") or user.get("user_id")
            return getattr(user, "id", None) or getattr(user, "user_id", None)
        
        tenant_context = get_current_tenant()
        if tenant_context and tenant_context.user_id:
            return tenant_context.user_id
        
        return None
    
    def _raise_forbidden(self, roles: Union[str, List[str]]) -> None:
        """Raise forbidden exception."""
        if isinstance(roles, str):
            roles = [roles]
        
        logger.warning(
            "role_denied",
            required_roles=roles,
        )
        raise HTTPException(
            status_code=403,
            detail={
                "error": "forbidden",
                "message": f"Role(s) required: {', '.join(roles)}",
                "required_roles": roles,
            },
        )


def require_permission(permission: str) -> PermissionChecker:
    """
    Create a permission checker dependency.
    
    Usage:
        @app.get("/projects")
        async def list_projects(
            _: None = Depends(require_permission("project:read"))
        ):
            return {"projects": []}
    
    Args:
        permission: Required permission code
    
    Returns:
        PermissionChecker dependency
    """
    return PermissionChecker(permission)


def require_role(role: str) -> RoleChecker:
    """
    Create a role checker dependency.
    
    Usage:
        @app.get("/admin/dashboard")
        async def admin_dashboard(
            _: None = Depends(require_role("admin"))
        ):
            return {"dashboard": {}}
    
    Args:
        role: Required role code
    
    Returns:
        RoleChecker dependency
    """
    return RoleChecker(role)


def require_any_role(roles: List[str]) -> RoleChecker:
    """
    Create a role checker that requires any of the specified roles.
    
    Usage:
        @app.get("/manage")
        async def manage(
            _: None = Depends(require_any_role(["admin", "manager"]))
        ):
            return {"manage": True}
    
    Args:
        roles: List of acceptable role codes
    
    Returns:
        RoleChecker dependency
    """
    return RoleChecker(roles, require_all=False)


async def check_permission(
    user_id: str,
    permission: str,
    tenant_id: Optional[str] = None,
) -> bool:
    """
    Utility function to check permission programmatically.
    
    Usage:
        if await check_permission(user_id, "project:delete", tenant_id):
            # Delete project
            pass
    
    Args:
        user_id: User ID
        permission: Permission code
        tenant_id: Optional tenant ID
    
    Returns:
        True if user has permission
    """
    service = get_rbac_service()
    return await service.has_permission(user_id, permission, tenant_id)


async def get_user_permissions(
    user_id: str,
    tenant_id: Optional[str] = None,
) -> List[str]:
    """
    Get all permissions for a user.
    
    Args:
        user_id: User ID
        tenant_id: Optional tenant ID
    
    Returns:
        List of permission codes
    """
    service = get_rbac_service()
    permissions = await service.get_user_permissions(user_id, tenant_id)
    return list(permissions)


class OwnerOrPermission:
    """
    Dependency that allows access if user is owner OR has permission.
    
    Usage:
        @app.delete("/projects/{project_id}")
        async def delete_project(
            project_id: str,
            _: None = Depends(OwnerOrPermission("project:delete", "owner_id"))
        ):
            return {"deleted": True}
    """
    
    def __init__(
        self,
        permission: str,
        owner_field: str = "owner_id",
        resource_getter: Optional[Callable] = None,
    ):
        """
        Initialize.
        
        Args:
            permission: Required permission if not owner
            owner_field: Field name for owner ID in resource
            resource_getter: Function to get resource from request
        """
        self.permission = permission
        self.owner_field = owner_field
        self.resource_getter = resource_getter
    
    async def __call__(self, request: Request) -> None:
        """Check owner or permission."""
        service = get_rbac_service()
        
        # Get user ID
        user_id = self._get_user_id(request)
        if not user_id:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        # Try to get resource
        resource = None
        if self.resource_getter:
            resource = await self.resource_getter(request)
        elif hasattr(request.state, "resource"):
            resource = request.state.resource
        
        # Check if owner
        if resource:
            owner_id = None
            if isinstance(resource, dict):
                owner_id = resource.get(self.owner_field)
            else:
                owner_id = getattr(resource, self.owner_field, None)
            
            if owner_id == user_id:
                return  # Owner has access
        
        # Check permission
        tenant_context = get_current_tenant()
        tenant_id = tenant_context.tenant_id if tenant_context else None
        
        has_perm = await service.has_permission(user_id, self.permission, tenant_id)
        if not has_perm:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "forbidden",
                    "message": "You must be the owner or have the required permission",
                    "required_permission": self.permission,
                },
            )
    
    def _get_user_id(self, request: Request) -> Optional[str]:
        """Extract user ID from request."""
        if hasattr(request.state, "user_id"):
            return request.state.user_id
        
        if hasattr(request.state, "user"):
            user = request.state.user
            if isinstance(user, dict):
                return user.get("id") or user.get("user_id")
            return getattr(user, "id", None)
        
        tenant_context = get_current_tenant()
        if tenant_context:
            return tenant_context.user_id
        
        return None
