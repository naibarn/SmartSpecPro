"""
SmartSpec Pro - RBAC API
Phase 3: Role-Based Access Control Endpoints
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from datetime import datetime

from app.core.auth import get_current_user, get_current_admin
from app.models.user import User
from app.rbac.rbac_service import RBACService, get_rbac_service
from app.multitenancy.tenant_context import get_current_tenant_id

router = APIRouter(prefix="/api/v1/rbac")


# ==========================================
# Request/Response Models
# ==========================================

class RoleCreate(BaseModel):
    """Request model for creating a role."""
    name: str = Field(..., min_length=2, max_length=100)
    display_name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    permissions: List[str] = Field(default_factory=list)
    parent_role_id: Optional[str] = None


class RoleUpdate(BaseModel):
    """Request model for updating a role."""
    display_name: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = None
    permissions: Optional[List[str]] = None


class RoleResponse(BaseModel):
    """Response model for role data."""
    id: str
    name: str
    display_name: str
    description: Optional[str]
    tenant_id: Optional[str]
    scope: str
    permissions: List[str]
    is_system: bool
    is_default: bool
    priority: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class RoleAssignmentCreate(BaseModel):
    """Request model for assigning a role."""
    user_id: str
    role_id: str
    project_id: Optional[str] = None
    reason: Optional[str] = None
    expires_at: Optional[datetime] = None


class RoleAssignmentResponse(BaseModel):
    """Response model for role assignment."""
    id: str
    user_id: str
    role_id: str
    tenant_id: Optional[str]
    project_id: Optional[str]
    assigned_by: Optional[str]
    reason: Optional[str]
    is_active: bool
    expires_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class PermissionResponse(BaseModel):
    """Response model for permission data."""
    id: str
    name: str
    display_name: str
    description: Optional[str]
    resource: str
    action: str
    scope: str
    is_system: bool

    class Config:
        from_attributes = True


class PermissionCheckRequest(BaseModel):
    """Request model for checking permission."""
    permission: str
    resource_id: Optional[str] = None


class PermissionCheckResponse(BaseModel):
    """Response model for permission check."""
    allowed: bool
    permission: str
    reason: Optional[str] = None


# ==========================================
# Role Endpoints
# ==========================================

@router.get("/roles", response_model=List[RoleResponse])
async def list_roles(
    include_system: bool = Query(True, description="Include system roles"),
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    rbac_service: RBACService = Depends(get_rbac_service),
):
    """
    List available roles.
    
    Returns system roles and tenant-specific roles.
    """
    roles = await rbac_service.list_roles(
        tenant_id=tenant_id,
        include_system=include_system,
    )
    return roles


@router.post("/roles", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    data: RoleCreate,
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    rbac_service: RBACService = Depends(get_rbac_service),
):
    """
    Create a custom role.
    
    Custom roles are scoped to the current tenant.
    """
    # Check permission
    has_permission = await rbac_service.check_permission(
        user_id=current_user.id,
        tenant_id=tenant_id,
        permission="roles:write",
    )
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )
    
    role = await rbac_service.create_role(
        name=data.name,
        display_name=data.display_name,
        description=data.description,
        permissions=data.permissions,
        tenant_id=tenant_id,
        parent_role_id=data.parent_role_id,
    )
    
    if not role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create role. Name may already exist.",
        )
    
    return role


@router.get("/roles/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: str,
    current_user: User = Depends(get_current_user),
    rbac_service: RBACService = Depends(get_rbac_service),
):
    """
    Get role details.
    """
    role = await rbac_service.get_role(role_id)
    
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )
    
    return role


@router.patch("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: str,
    data: RoleUpdate,
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    rbac_service: RBACService = Depends(get_rbac_service),
):
    """
    Update a custom role.
    
    System roles cannot be modified.
    """
    role = await rbac_service.get_role(role_id)
    
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )
    
    if role.is_system:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="System roles cannot be modified",
        )
    
    # Check permission
    has_permission = await rbac_service.check_permission(
        user_id=current_user.id,
        tenant_id=tenant_id,
        permission="roles:write",
    )
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )
    
    updated_role = await rbac_service.update_role(
        role_id=role_id,
        **data.model_dump(exclude_unset=True),
    )
    
    return updated_role


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: str,
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    rbac_service: RBACService = Depends(get_rbac_service),
):
    """
    Delete a custom role.
    
    System roles cannot be deleted.
    """
    role = await rbac_service.get_role(role_id)
    
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )
    
    if role.is_system:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="System roles cannot be deleted",
        )
    
    # Check permission
    has_permission = await rbac_service.check_permission(
        user_id=current_user.id,
        tenant_id=tenant_id,
        permission="roles:delete",
    )
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )
    
    await rbac_service.delete_role(role_id)


# ==========================================
# Role Assignment Endpoints
# ==========================================

@router.post("/assignments", response_model=RoleAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def assign_role(
    data: RoleAssignmentCreate,
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    rbac_service: RBACService = Depends(get_rbac_service),
):
    """
    Assign a role to a user.
    """
    # Check permission
    has_permission = await rbac_service.check_permission(
        user_id=current_user.id,
        tenant_id=tenant_id,
        permission="roles:assign",
    )
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )
    
    assignment = await rbac_service.assign_role(
        user_id=data.user_id,
        role_id=data.role_id,
        tenant_id=tenant_id,
        project_id=data.project_id,
        assigned_by=current_user.id,
        reason=data.reason,
        expires_at=data.expires_at,
    )
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to assign role",
        )
    
    return assignment


@router.get("/assignments", response_model=List[RoleAssignmentResponse])
async def list_role_assignments(
    user_id: Optional[str] = None,
    role_id: Optional[str] = None,
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    rbac_service: RBACService = Depends(get_rbac_service),
):
    """
    List role assignments.
    """
    assignments = await rbac_service.list_assignments(
        tenant_id=tenant_id,
        user_id=user_id,
        role_id=role_id,
        project_id=project_id,
    )
    return assignments


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_role_assignment(
    assignment_id: str,
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    rbac_service: RBACService = Depends(get_rbac_service),
):
    """
    Revoke a role assignment.
    """
    # Check permission
    has_permission = await rbac_service.check_permission(
        user_id=current_user.id,
        tenant_id=tenant_id,
        permission="roles:assign",
    )
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )
    
    await rbac_service.revoke_assignment(assignment_id)


# ==========================================
# Permission Endpoints
# ==========================================

@router.get("/permissions", response_model=List[PermissionResponse])
async def list_permissions(
    resource: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    rbac_service: RBACService = Depends(get_rbac_service),
):
    """
    List available permissions.
    """
    permissions = await rbac_service.list_permissions(resource=resource)
    return permissions


@router.post("/check", response_model=PermissionCheckResponse)
async def check_permission(
    data: PermissionCheckRequest,
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    rbac_service: RBACService = Depends(get_rbac_service),
):
    """
    Check if the current user has a specific permission.
    """
    allowed = await rbac_service.check_permission(
        user_id=current_user.id,
        tenant_id=tenant_id,
        permission=data.permission,
        resource_id=data.resource_id,
    )
    
    return PermissionCheckResponse(
        allowed=allowed,
        permission=data.permission,
    )


@router.get("/me/roles", response_model=List[RoleResponse])
async def get_my_roles(
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    rbac_service: RBACService = Depends(get_rbac_service),
):
    """
    Get roles assigned to the current user.
    """
    roles = await rbac_service.get_user_roles(
        user_id=current_user.id,
        tenant_id=tenant_id,
    )
    return roles


@router.get("/me/permissions", response_model=List[str])
async def get_my_permissions(
    current_user: User = Depends(get_current_user),
    tenant_id: Optional[str] = Depends(get_current_tenant_id),
    rbac_service: RBACService = Depends(get_rbac_service),
):
    """
    Get all permissions for the current user.
    """
    permissions = await rbac_service.get_user_permissions(
        user_id=current_user.id,
        tenant_id=tenant_id,
    )
    return permissions
