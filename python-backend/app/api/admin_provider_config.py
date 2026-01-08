"""
Admin API for Provider Configuration

Endpoints for managing LLM provider API keys and settings.
Admin-only access.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.provider_config import ProviderConfig
from app.core.encryption import encryption_service


router = APIRouter(prefix="/api/v1/admin/provider-configs", tags=["admin", "provider-config"])


# ==================== Pydantic Models ====================

class ProviderConfigCreate(BaseModel):
    """Request model for creating provider config"""
    provider_name: str = Field(..., min_length=1, max_length=50)
    display_name: str = Field(..., min_length=1, max_length=100)
    api_key: Optional[str] = None  # Plain text, will be encrypted
    base_url: Optional[str] = None
    config_json: Optional[dict] = None
    is_enabled: bool = True
    description: Optional[str] = None


class ProviderConfigUpdate(BaseModel):
    """Request model for updating provider config"""
    display_name: Optional[str] = Field(None, min_length=1, max_length=100)
    api_key: Optional[str] = None  # Plain text, will be encrypted (empty string = remove)
    base_url: Optional[str] = None
    config_json: Optional[dict] = None
    is_enabled: Optional[bool] = None
    description: Optional[str] = None


class ProviderConfigResponse(BaseModel):
    """Response model for provider config"""
    id: str
    provider_name: str
    display_name: str
    has_api_key: bool  # Never expose actual key
    base_url: Optional[str]
    config_json: Optional[dict]
    is_enabled: bool
    description: Optional[str]
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# ==================== Dependencies ====================

async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require admin user"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


# ==================== Endpoints ====================

@router.get("/", response_model=List[ProviderConfigResponse])
async def list_provider_configs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    List all provider configurations (admin only).

    Returns all provider configs without exposing actual API keys.
    """
    result = await db.execute(select(ProviderConfig))
    configs = result.scalars().all()

    return [
        ProviderConfigResponse(
            id=config.id,
            provider_name=config.provider_name,
            display_name=config.display_name,
            has_api_key=bool(config.api_key_encrypted),
            base_url=config.base_url,
            config_json=config.config_json,
            is_enabled=config.is_enabled,
            description=config.description,
            created_at=config.created_at.isoformat(),
            updated_at=config.updated_at.isoformat()
        )
        for config in configs
    ]


@router.get("/{provider_name}", response_model=ProviderConfigResponse)
async def get_provider_config(
    provider_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Get a specific provider configuration (admin only).

    Args:
        provider_name: Provider identifier (e.g., "openai", "anthropic")
    """
    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.provider_name == provider_name)
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Provider config '{provider_name}' not found"
        )

    return ProviderConfigResponse(
        id=config.id,
        provider_name=config.provider_name,
        display_name=config.display_name,
        has_api_key=bool(config.api_key_encrypted),
        base_url=config.base_url,
        config_json=config.config_json,
        is_enabled=config.is_enabled,
        description=config.description,
        created_at=config.created_at.isoformat(),
        updated_at=config.updated_at.isoformat()
    )


@router.post("/", response_model=ProviderConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_provider_config(
    data: ProviderConfigCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Create a new provider configuration (admin only).

    Args:
        data: Provider configuration data
    """
    # Check if provider already exists
    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.provider_name == data.provider_name)
    )
    existing = result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Provider '{data.provider_name}' already exists"
        )

    # Encrypt API key if provided
    api_key_encrypted = None
    if data.api_key:
        api_key_encrypted = encryption_service.encrypt(data.api_key)

    # Create new config
    config = ProviderConfig(
        provider_name=data.provider_name,
        display_name=data.display_name,
        api_key_encrypted=api_key_encrypted,
        base_url=data.base_url,
        config_json=data.config_json,
        is_enabled=data.is_enabled,
        description=data.description
    )

    db.add(config)
    await db.commit()
    await db.refresh(config)

    return ProviderConfigResponse(
        id=config.id,
        provider_name=config.provider_name,
        display_name=config.display_name,
        has_api_key=bool(config.api_key_encrypted),
        base_url=config.base_url,
        config_json=config.config_json,
        is_enabled=config.is_enabled,
        description=config.description,
        created_at=config.created_at.isoformat(),
        updated_at=config.updated_at.isoformat()
    )


@router.put("/{provider_name}", response_model=ProviderConfigResponse)
async def update_provider_config(
    provider_name: str,
    data: ProviderConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Update an existing provider configuration (admin only).

    Args:
        provider_name: Provider identifier
        data: Updated configuration data
    """
    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.provider_name == provider_name)
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Provider config '{provider_name}' not found"
        )

    # Update fields
    if data.display_name is not None:
        config.display_name = data.display_name

    if data.api_key is not None:
        if data.api_key == "":
            # Empty string = remove API key
            config.api_key_encrypted = None
        else:
            # Encrypt new API key
            config.api_key_encrypted = encryption_service.encrypt(data.api_key)

    if data.base_url is not None:
        config.base_url = data.base_url

    if data.config_json is not None:
        config.config_json = data.config_json

    if data.is_enabled is not None:
        config.is_enabled = data.is_enabled

    if data.description is not None:
        config.description = data.description

    await db.commit()
    await db.refresh(config)

    return ProviderConfigResponse(
        id=config.id,
        provider_name=config.provider_name,
        display_name=config.display_name,
        has_api_key=bool(config.api_key_encrypted),
        base_url=config.base_url,
        config_json=config.config_json,
        is_enabled=config.is_enabled,
        description=config.description,
        created_at=config.created_at.isoformat(),
        updated_at=config.updated_at.isoformat()
    )


@router.delete("/{provider_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider_config(
    provider_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Delete a provider configuration (admin only).

    Args:
        provider_name: Provider identifier
    """
    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.provider_name == provider_name)
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Provider config '{provider_name}' not found"
        )

    await db.delete(config)
    await db.commit()

    return None


@router.post("/{provider_name}/test", response_model=dict)
async def test_provider_config(
    provider_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Test a provider configuration by making a simple API call (admin only).

    Args:
        provider_name: Provider identifier

    Returns:
        Test result with success status and details
    """
    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.provider_name == provider_name)
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Provider config '{provider_name}' not found"
        )

    if not config.api_key_encrypted:
        return {
            "success": False,
            "message": "No API key configured"
        }

    # TODO: Implement actual provider testing logic
    # For now, just return a placeholder
    return {
        "success": True,
        "message": f"Provider '{provider_name}' test not implemented yet",
        "provider": config.provider_name,
        "has_api_key": True
    }
