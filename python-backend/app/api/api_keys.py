"""
API Key Management API
Endpoints for managing programmatic access keys
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

from app.core.auth import get_current_user
from app.core.database import get_db
from app.services.api_key_service import APIKeyService
from app.models.user import User


router = APIRouter(prefix="/api/v1")


# ============================================================================
# Request/Response Models
# ============================================================================

class CreateAPIKeyRequest(BaseModel):
    """Create API key request"""
    name: str = Field(..., min_length=1, max_length=255, description="User-friendly name for the key")
    permissions: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Permissions dict. Default: full access"
    )
    rate_limit: int = Field(default=60, ge=1, le=1000, description="Requests per minute")
    expires_in_days: Optional[int] = Field(
        default=None,
        ge=1,
        le=3650,
        description="Expiration in days. None = never expires"
    )
    description: Optional[str] = Field(default=None, max_length=1000)


class UpdateAPIKeyRequest(BaseModel):
    """Update API key request"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    permissions: Optional[Dict[str, Any]] = None
    rate_limit: Optional[int] = Field(None, ge=1, le=1000)
    is_active: Optional[bool] = None
    description: Optional[str] = Field(None, max_length=1000)


# ============================================================================
# API Key Endpoints
# ============================================================================

@router.post("/api-keys", status_code=status.HTTP_201_CREATED)
async def create_api_key(
    request: CreateAPIKeyRequest,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Create a new API key
    
    **Important:** The full API key is only shown once during creation.
    Save it securely - it cannot be retrieved later.
    
    **Permissions Format:**
    ```json
    {
        "endpoints": ["*"] or ["/api/v1/llm/*", "/api/v1/credits"],
        "methods": ["*"] or ["GET", "POST"]
    }
    ```
    
    **Default:** Full access to all endpoints and methods
    """
    # Get user object
    result = await db.execute(
        select(User).where(User.id == current_user["id"])
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Create API key
    api_key, raw_key = await APIKeyService.create_api_key(
        db=db,
        user=user,
        name=request.name,
        permissions=request.permissions,
        rate_limit=request.rate_limit,
        expires_in_days=request.expires_in_days,
        description=request.description
    )
    
    return {
        "id": str(api_key.id),
        "name": api_key.name,
        "key": raw_key,  # Only shown once!
        "prefix": api_key.key_prefix,
        "permissions": api_key.permissions,
        "rate_limit": api_key.rate_limit,
        "is_active": api_key.is_active,
        "expires_at": api_key.expires_at.isoformat() if api_key.expires_at else None,
        "created_at": api_key.created_at.isoformat(),
        "warning": "⚠️ Save this key securely! It will not be shown again."
    }


@router.get("/api-keys")
async def list_api_keys(
    include_inactive: bool = False,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    List all API keys for the current user
    
    Returns API keys without the plaintext key (only prefix shown).
    """
    # Get user object
    result = await db.execute(
        select(User).where(User.id == current_user["id"])
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Get API keys
    api_keys = await APIKeyService.get_user_api_keys(
        db=db,
        user=user,
        include_inactive=include_inactive
    )
    
    return {
        "api_keys": [
            {
                "id": str(key.id),
                "name": key.name,
                "prefix": key.key_prefix,
                "permissions": key.permissions,
                "rate_limit": key.rate_limit,
                "is_active": key.is_active,
                "is_expired": key.is_expired(),
                "is_valid": key.is_valid(),
                "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None,
                "expires_at": key.expires_at.isoformat() if key.expires_at else None,
                "description": key.description,
                "created_at": key.created_at.isoformat()
            }
            for key in api_keys
        ],
        "total": len(api_keys)
    }


@router.get("/api-keys/{api_key_id}")
async def get_api_key(
    api_key_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Get details of a specific API key
    """
    from sqlalchemy import select, and_
    from app.models.api_key import APIKey
    
    result = await db.execute(
        select(APIKey).where(
            and_(
                APIKey.id == api_key_id,
                APIKey.user_id == current_user["id"]
            )
        )
    )
    api_key = result.scalar_one_or_none()
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    return {
        "id": str(api_key.id),
        "name": api_key.name,
        "prefix": api_key.key_prefix,
        "permissions": api_key.permissions,
        "rate_limit": api_key.rate_limit,
        "is_active": api_key.is_active,
        "is_expired": api_key.is_expired(),
        "is_valid": api_key.is_valid(),
        "last_used_at": api_key.last_used_at.isoformat() if api_key.last_used_at else None,
        "expires_at": api_key.expires_at.isoformat() if api_key.expires_at else None,
        "description": api_key.description,
        "created_at": api_key.created_at.isoformat(),
        "updated_at": api_key.updated_at.isoformat()
    }


@router.put("/api-keys/{api_key_id}")
async def update_api_key(
    api_key_id: str,
    request: UpdateAPIKeyRequest,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Update an API key
    
    Can update name, permissions, rate limit, active status, and description.
    Cannot update the key itself - use rotate endpoint instead.
    """
    from sqlalchemy import select, and_
    from app.models.api_key import APIKey
    
    result = await db.execute(
        select(APIKey).where(
            and_(
                APIKey.id == api_key_id,
                APIKey.user_id == current_user["id"]
            )
        )
    )
    api_key = result.scalar_one_or_none()
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    # Update API key
    updated_key = await APIKeyService.update_api_key(
        db=db,
        api_key=api_key,
        name=request.name,
        permissions=request.permissions,
        rate_limit=request.rate_limit,
        is_active=request.is_active,
        description=request.description
    )
    
    return {
        "id": str(updated_key.id),
        "name": updated_key.name,
        "prefix": updated_key.key_prefix,
        "permissions": updated_key.permissions,
        "rate_limit": updated_key.rate_limit,
        "is_active": updated_key.is_active,
        "is_expired": updated_key.is_expired(),
        "description": updated_key.description,
        "updated_at": updated_key.updated_at.isoformat()
    }


@router.post("/api-keys/{api_key_id}/rotate")
async def rotate_api_key(
    api_key_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Rotate an API key (generate new key, keep same ID)
    
    **Important:** The old key will be immediately invalidated.
    The new key is only shown once - save it securely!
    """
    from sqlalchemy import select, and_
    from app.models.api_key import APIKey
    
    result = await db.execute(
        select(APIKey).where(
            and_(
                APIKey.id == api_key_id,
                APIKey.user_id == current_user["id"]
            )
        )
    )
    api_key = result.scalar_one_or_none()
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    # Rotate key
    rotated_key, new_raw_key = await APIKeyService.rotate_api_key(
        db=db,
        api_key=api_key
    )
    
    return {
        "id": str(rotated_key.id),
        "name": rotated_key.name,
        "key": new_raw_key,  # Only shown once!
        "prefix": rotated_key.key_prefix,
        "updated_at": rotated_key.updated_at.isoformat(),
        "warning": "⚠️ The old key is now invalid. Save the new key securely!"
    }


@router.delete("/api-keys/{api_key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(
    api_key_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Permanently delete an API key
    
    **Warning:** This action cannot be undone. The key will be immediately invalidated.
    """
    from sqlalchemy import select, and_
    from app.models.api_key import APIKey
    
    result = await db.execute(
        select(APIKey).where(
            and_(
                APIKey.id == api_key_id,
                APIKey.user_id == current_user["id"]
            )
        )
    )
    api_key = result.scalar_one_or_none()
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    # Delete API key
    await APIKeyService.delete_api_key(db=db, api_key=api_key)
    
    return None


@router.get("/api-keys/{api_key_id}/usage")
async def get_api_key_usage(
    api_key_id: str,
    days: int = 30,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Get usage statistics for an API key
    
    Returns request count, credits used, response times, and error rates.
    """
    from sqlalchemy import select, and_
    from app.models.api_key import APIKey
    
    result = await db.execute(
        select(APIKey).where(
            and_(
                APIKey.id == api_key_id,
                APIKey.user_id == current_user["id"]
            )
        )
    )
    api_key = result.scalar_one_or_none()
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    # Get usage stats
    stats = await APIKeyService.get_usage_stats(
        db=db,
        api_key=api_key,
        days=days
    )
    
    return {
        "api_key_id": api_key_id,
        "api_key_name": api_key.name,
        "period_days": days,
        **stats
    }
