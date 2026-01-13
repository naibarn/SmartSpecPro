"""
SmartSpec Pro - Tenants API
Phase 3: Multi-tenancy Management Endpoints
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from datetime import datetime

from app.core.auth import get_current_user, get_current_admin_user as get_current_admin
from app.models.user import User
from app.multitenancy.tenant_service import TenantService, get_tenant_service
from app.multitenancy.tenant_model import TenantPlan, TenantStatus

router = APIRouter(prefix="/api/v1/tenants")


# ==========================================
# Request/Response Models
# ==========================================

class TenantCreate(BaseModel):
    """Request model for creating a tenant."""
    name: str = Field(..., min_length=2, max_length=255)
    slug: str = Field(..., min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")
    description: Optional[str] = None
    plan: TenantPlan = TenantPlan.FREE


class TenantUpdate(BaseModel):
    """Request model for updating a tenant."""
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = None
    logo_url: Optional[str] = None
    website: Optional[str] = None
    settings: Optional[dict] = None


class TenantResponse(BaseModel):
    """Response model for tenant data."""
    id: str
    name: str
    slug: str
    status: TenantStatus
    plan: TenantPlan
    owner_id: Optional[str]
    description: Optional[str]
    logo_url: Optional[str]
    website: Optional[str]
    max_users: int
    max_projects: int
    current_users: int
    current_projects: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class TenantListResponse(BaseModel):
    """Response model for tenant list."""
    tenants: List[TenantResponse]
    total: int
    page: int
    page_size: int


class TenantMemberCreate(BaseModel):
    """Request model for adding a tenant member."""
    user_id: str
    role: str = "member"


class TenantMemberResponse(BaseModel):
    """Response model for tenant member."""
    id: str
    tenant_id: str
    user_id: str
    role: str
    is_active: bool
    joined_at: datetime

    class Config:
        from_attributes = True


# ==========================================
# Tenant CRUD Endpoints
# ==========================================

@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    data: TenantCreate,
    current_user: User = Depends(get_current_user),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """
    Create a new tenant.
    
    The current user becomes the owner of the tenant.
    """
    tenant = await tenant_service.create_tenant(
        name=data.name,
        slug=data.slug,
        owner_id=current_user.id,
        owner_email=current_user.email,
        plan=data.plan,
        description=data.description,
    )
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create tenant. Slug may already exist.",
        )
    
    return tenant


@router.get("", response_model=TenantListResponse)
async def list_tenants(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """
    List tenants the current user has access to.
    """
    tenants = await tenant_service.list_user_tenants(
        user_id=current_user.id,
        page=page,
        page_size=page_size,
    )
    
    total = await tenant_service.count_user_tenants(current_user.id)
    
    return TenantListResponse(
        tenants=tenants,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: str,
    current_user: User = Depends(get_current_user),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """
    Get tenant details.
    """
    tenant = await tenant_service.get_tenant(tenant_id)
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )
    
    # Check access
    has_access = await tenant_service.check_user_access(
        tenant_id=tenant_id,
        user_id=current_user.id,
    )
    
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    
    return tenant


@router.patch("/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: str,
    data: TenantUpdate,
    current_user: User = Depends(get_current_user),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """
    Update tenant details.
    
    Requires owner or admin role.
    """
    # Check permission
    has_permission = await tenant_service.check_user_permission(
        tenant_id=tenant_id,
        user_id=current_user.id,
        permission="settings:write",
    )
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )
    
    tenant = await tenant_service.update_tenant(
        tenant_id=tenant_id,
        **data.model_dump(exclude_unset=True),
    )
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )
    
    return tenant


@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenant(
    tenant_id: str,
    current_user: User = Depends(get_current_user),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """
    Delete a tenant.
    
    Requires owner role. This is a soft delete.
    """
    tenant = await tenant_service.get_tenant(tenant_id)
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )
    
    if tenant.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can delete the tenant",
        )
    
    await tenant_service.delete_tenant(tenant_id)


# ==========================================
# Tenant Member Endpoints
# ==========================================

@router.post("/{tenant_id}/members", response_model=TenantMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_tenant_member(
    tenant_id: str,
    data: TenantMemberCreate,
    current_user: User = Depends(get_current_user),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """
    Add a member to the tenant.
    
    Requires admin or owner role.
    """
    has_permission = await tenant_service.check_user_permission(
        tenant_id=tenant_id,
        user_id=current_user.id,
        permission="users:write",
    )
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )
    
    member = await tenant_service.add_member(
        tenant_id=tenant_id,
        user_id=data.user_id,
        role=data.role,
    )
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to add member. User may already be a member.",
        )
    
    return member


@router.get("/{tenant_id}/members", response_model=List[TenantMemberResponse])
async def list_tenant_members(
    tenant_id: str,
    current_user: User = Depends(get_current_user),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """
    List tenant members.
    """
    has_access = await tenant_service.check_user_access(
        tenant_id=tenant_id,
        user_id=current_user.id,
    )
    
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    
    members = await tenant_service.list_members(tenant_id)
    return members


@router.delete("/{tenant_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_tenant_member(
    tenant_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """
    Remove a member from the tenant.
    
    Requires admin or owner role. Cannot remove the owner.
    """
    has_permission = await tenant_service.check_user_permission(
        tenant_id=tenant_id,
        user_id=current_user.id,
        permission="users:write",
    )
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )
    
    tenant = await tenant_service.get_tenant(tenant_id)
    if tenant and tenant.owner_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the tenant owner",
        )
    
    await tenant_service.remove_member(tenant_id, user_id)


# ==========================================
# Admin Endpoints
# ==========================================

@router.get("/admin/all", response_model=TenantListResponse)
async def admin_list_all_tenants(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[TenantStatus] = None,
    plan_filter: Optional[TenantPlan] = None,
    current_admin: User = Depends(get_current_admin),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """
    List all tenants (admin only).
    """
    tenants = await tenant_service.list_all_tenants(
        page=page,
        page_size=page_size,
        status=status_filter,
        plan=plan_filter,
    )
    
    total = await tenant_service.count_all_tenants(
        status=status_filter,
        plan=plan_filter,
    )
    
    return TenantListResponse(
        tenants=tenants,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/admin/{tenant_id}/suspend", response_model=TenantResponse)
async def admin_suspend_tenant(
    tenant_id: str,
    current_admin: User = Depends(get_current_admin),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """
    Suspend a tenant (admin only).
    """
    tenant = await tenant_service.suspend_tenant(tenant_id)
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )
    
    return tenant


@router.post("/admin/{tenant_id}/activate", response_model=TenantResponse)
async def admin_activate_tenant(
    tenant_id: str,
    current_admin: User = Depends(get_current_admin),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """
    Activate a suspended tenant (admin only).
    """
    tenant = await tenant_service.activate_tenant(tenant_id)
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )
    
    return tenant


@router.patch("/admin/{tenant_id}/plan", response_model=TenantResponse)
async def admin_update_tenant_plan(
    tenant_id: str,
    plan: TenantPlan,
    current_admin: User = Depends(get_current_admin),
    tenant_service: TenantService = Depends(get_tenant_service),
):
    """
    Update tenant plan (admin only).
    """
    tenant = await tenant_service.update_plan(tenant_id, plan)
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )
    
    return tenant
