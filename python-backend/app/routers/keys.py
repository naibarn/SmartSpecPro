"""
SmartSpec Pro - API Key Management Router
Endpoints for managing API keys with versioning and security features.
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.services.generation.key_service import get_key_management_service

router = APIRouter(prefix="/keys", tags=["API Keys"])


# =============================================================================
# REQUEST/RESPONSE SCHEMAS
# =============================================================================

class CreateKeyRequest(BaseModel):
    """Request to create a new API key."""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    scopes: List[str] = Field(default=["*"])
    project_id: Optional[str] = None
    expires_in_days: Optional[int] = Field(None, ge=1, le=365)
    rate_limit_per_minute: int = Field(default=60, ge=1, le=1000)
    rotation_enabled: bool = False
    rotation_interval_days: int = Field(default=90, ge=7, le=365)
    mfa_required: bool = True


class CreateKeyResponse(BaseModel):
    """Response after creating a key (includes the actual key)."""
    id: str
    name: str
    key: str  # Only shown once!
    key_prefix: str
    version: int
    scopes: List[str]
    created_at: str
    expires_at: Optional[str]
    message: str = "Store this key securely. It will not be shown again."


class RotateKeyRequest(BaseModel):
    """Request to rotate an API key."""
    grace_period_hours: Optional[int] = Field(None, ge=1, le=168)  # Max 7 days
    mfa_token: Optional[str] = None


class RotateKeyResponse(BaseModel):
    """Response after rotating a key."""
    id: str
    name: str
    key: str  # Only shown once!
    key_prefix: str
    version: int
    previous_version: int
    grace_period_ends_at: str
    created_at: str
    message: str = "New key generated. Old key valid until grace period ends."


class RevokeKeyRequest(BaseModel):
    """Request to revoke an API key."""
    reason: Optional[str] = Field(None, max_length=500)
    mfa_token: Optional[str] = None


class KeyVersionInfo(BaseModel):
    """Information about a key version."""
    version: int
    status: str
    created_at: str
    grace_period_ends_at: Optional[str]


class KeyInfo(BaseModel):
    """Detailed key information."""
    id: str
    name: str
    key_prefix: str
    description: Optional[str]
    scopes: List[str]
    status: str
    current_version: int
    versions: List[KeyVersionInfo]
    rate_limit_per_minute: int
    rotation_enabled: bool
    rotation_interval_days: int
    next_rotation_at: Optional[str]
    mfa_required_for_rotation: bool
    total_usage_count: int
    last_used_at: Optional[str]
    created_at: str
    expires_at: Optional[str]


class KeyListItem(BaseModel):
    """Key item in list response."""
    id: str
    name: str
    key_prefix: str
    status: str
    current_version: int
    scopes: List[str]
    total_usage_count: int
    last_used_at: Optional[str]
    created_at: str
    expires_at: Optional[str]


class AuditLogEntry(BaseModel):
    """Audit log entry."""
    id: str
    event_type: str
    timestamp: str
    api_key_id: Optional[str]
    key_version: Optional[int]
    ip_address: Optional[str]
    details: dict
    success: bool
    error_message: Optional[str]
    risk_score: int
    is_suspicious: bool


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_client_ip(request: Request) -> str:
    """Extract client IP from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("", response_model=CreateKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_key(
    request: Request,
    data: CreateKeyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new API key.
    
    The actual key is only returned once in this response.
    Store it securely - it cannot be retrieved again.
    """
    service = get_key_management_service(db)
    
    result = await service.create_key(
        user_id=current_user.id,
        name=data.name,
        scopes=data.scopes,
        project_id=data.project_id,
        description=data.description,
        expires_in_days=data.expires_in_days,
        rate_limit_per_minute=data.rate_limit_per_minute,
        rotation_enabled=data.rotation_enabled,
        rotation_interval_days=data.rotation_interval_days,
        mfa_required=data.mfa_required,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    
    return CreateKeyResponse(**result)


@router.get("", response_model=List[KeyListItem])
async def list_keys(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all API keys for the current user."""
    service = get_key_management_service(db)
    
    keys = await service.list_keys(
        user_id=current_user.id,
        project_id=project_id,
    )
    
    return [KeyListItem(**key) for key in keys]


@router.get("/{key_id}", response_model=KeyInfo)
async def get_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed information about an API key."""
    service = get_key_management_service(db)
    
    key = await service.get_key(key_id, current_user.id)
    
    if not key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )
    
    return KeyInfo(
        **key,
        versions=[KeyVersionInfo(**v) for v in key["versions"]],
    )


@router.post("/{key_id}/rotate", response_model=RotateKeyResponse)
async def rotate_key(
    key_id: str,
    request: Request,
    data: RotateKeyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Rotate an API key.
    
    Generates a new key while keeping the old one valid during the grace period.
    This allows for smooth transitions without service interruption.
    """
    service = get_key_management_service(db)
    
    result = await service.rotate_key(
        key_id=key_id,
        user_id=current_user.id,
        grace_period_hours=data.grace_period_hours,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
        mfa_token=data.mfa_token,
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found or access denied",
        )
    
    if "error" in result:
        if result["error"] == "mfa_required":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=result["message"],
            )
        elif result["error"] == "rate_limited":
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=result["message"],
            )
    
    return RotateKeyResponse(**result)


@router.post("/{key_id}/revoke", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_key(
    key_id: str,
    request: Request,
    data: RevokeKeyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Revoke an API key.
    
    This immediately invalidates the key and all its versions.
    This action cannot be undone.
    """
    service = get_key_management_service(db)
    
    success = await service.revoke_key(
        key_id=key_id,
        user_id=current_user.id,
        reason=data.reason,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
        mfa_token=data.mfa_token,
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found or access denied",
        )


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_key(
    key_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Permanently delete an API key.
    
    This removes the key and all associated data.
    This action cannot be undone.
    """
    service = get_key_management_service(db)
    
    # First revoke, then delete
    success = await service.revoke_key(
        key_id=key_id,
        user_id=current_user.id,
        reason="Deleted by user",
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found or access denied",
        )


@router.get("/{key_id}/audit", response_model=List[AuditLogEntry])
async def get_key_audit_log(
    key_id: str,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get audit log for a specific API key."""
    service = get_key_management_service(db)
    
    # Verify key ownership
    key = await service.get_key(key_id, current_user.id)
    if not key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )
    
    logs = await service.get_audit_log(
        user_id=current_user.id,
        key_id=key_id,
        limit=limit,
    )
    
    return [AuditLogEntry(**log) for log in logs]


@router.get("/audit/all", response_model=List[AuditLogEntry])
async def get_all_audit_logs(
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get audit log for all API keys belonging to the current user."""
    service = get_key_management_service(db)
    
    logs = await service.get_audit_log(
        user_id=current_user.id,
        limit=limit,
    )
    
    return [AuditLogEntry(**log) for log in logs]


# =============================================================================
# VALIDATION ENDPOINT (for internal use)
# =============================================================================

class ValidateKeyRequest(BaseModel):
    """Request to validate an API key."""
    api_key: str
    required_scope: Optional[str] = None


class ValidateKeyResponse(BaseModel):
    """Response from key validation."""
    valid: bool
    user_id: Optional[str] = None
    project_id: Optional[str] = None
    scopes: Optional[List[str]] = None
    rate_limit_per_minute: Optional[int] = None
    error: Optional[str] = None


@router.post("/validate", response_model=ValidateKeyResponse)
async def validate_key(
    request: Request,
    data: ValidateKeyRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Validate an API key (internal endpoint).
    
    This endpoint is used by other services to validate API keys.
    """
    service = get_key_management_service(db)
    
    result = await service.validate_key(
        api_key=data.api_key,
        required_scope=data.required_scope,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    
    if not result:
        return ValidateKeyResponse(valid=False, error="Invalid or expired API key")
    
    return ValidateKeyResponse(
        valid=True,
        user_id=result["user_id"],
        project_id=result["project_id"],
        scopes=result["scopes"],
        rate_limit_per_minute=result["rate_limit_per_minute"],
    )
