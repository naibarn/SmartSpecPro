"""
SmartSpec Pro - Asset API Endpoints
RESTful API for managing project assets.
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.core.database import AsyncSessionLocal
from app.core.auth import get_current_user
from app.models.user import User
from app.services.asset_service import (
    AssetService,
    AssetCreate,
    AssetUpdate,
    AssetRead,
    AssetListResponse,
    AssetSearchParams,
)

logger = structlog.get_logger()

router = APIRouter()


# ============================================
# Dependencies
# ============================================

async def get_db():
    """Get database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_asset_service(db: AsyncSession = Depends(get_db)) -> AssetService:
    """Get asset service instance."""
    return AssetService(db)


# ============================================
# API Endpoints
# ============================================

@router.post("/", response_model=AssetRead, status_code=status.HTTP_201_CREATED)
async def create_asset(
    data: AssetCreate,
    current_user: User = Depends(get_current_user),
    service: AssetService = Depends(get_asset_service),
):
    """
    Create a new asset.
    
    Register a new asset in the asset registry. This is typically called
    after a file has been saved to the project's assets directory.
    """
    try:
        asset = await service.create(current_user.id, data)
        logger.info("Asset created via API", 
                   asset_id=asset.id, 
                   user_id=current_user.id)
        return AssetRead.model_validate(asset)
    except Exception as e:
        logger.error("Failed to create asset", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create asset: {str(e)}"
        )


@router.get("/", response_model=AssetListResponse)
async def list_assets(
    query: Optional[str] = Query(None, description="Search query for filename or description"),
    asset_type: Optional[str] = Query(None, description="Filter by asset type (image, video, audio)"),
    project_id: Optional[str] = Query(None, description="Filter by project ID"),
    spec_id: Optional[str] = Query(None, description="Filter by spec ID"),
    tags: Optional[List[str]] = Query(None, description="Filter by tags"),
    status: Optional[str] = Query("active", description="Filter by status (active, archived, deleted)"),
    is_latest: Optional[bool] = Query(True, description="Filter by latest version only"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order (asc, desc)"),
    current_user: User = Depends(get_current_user),
    service: AssetService = Depends(get_asset_service),
):
    """
    List and search assets.
    
    Returns a paginated list of assets with optional filtering and sorting.
    """
    params = AssetSearchParams(
        query=query,
        asset_type=asset_type,
        project_id=project_id,
        spec_id=spec_id,
        tags=tags,
        status=status,
        is_latest=is_latest,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    
    return await service.search(current_user.id, params)


@router.get("/{asset_id}", response_model=AssetRead)
async def get_asset(
    asset_id: str,
    current_user: User = Depends(get_current_user),
    service: AssetService = Depends(get_asset_service),
):
    """
    Get asset by ID.
    
    Returns detailed information about a specific asset.
    """
    asset = await service.get_by_id(asset_id, current_user.id)
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    return AssetRead.model_validate(asset)


@router.put("/{asset_id}", response_model=AssetRead)
async def update_asset(
    asset_id: str,
    data: AssetUpdate,
    current_user: User = Depends(get_current_user),
    service: AssetService = Depends(get_asset_service),
):
    """
    Update an asset.
    
    Update asset metadata, tags, description, or status.
    """
    asset = await service.update(asset_id, current_user.id, data)
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    return AssetRead.model_validate(asset)


@router.post("/{asset_id}/version", response_model=AssetRead, status_code=status.HTTP_201_CREATED)
async def create_asset_version(
    asset_id: str,
    data: AssetCreate,
    current_user: User = Depends(get_current_user),
    service: AssetService = Depends(get_asset_service),
):
    """
    Create a new version of an asset.
    
    Creates a new version linked to the parent asset. The parent asset
    will be marked as not latest.
    """
    asset = await service.create_version(asset_id, current_user.id, data)
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent asset not found"
        )
    logger.info("Asset version created via API",
               asset_id=asset.id,
               parent_id=asset_id,
               version=asset.version)
    return AssetRead.model_validate(asset)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: str,
    hard_delete: bool = Query(False, description="Permanently delete the asset"),
    current_user: User = Depends(get_current_user),
    service: AssetService = Depends(get_asset_service),
):
    """
    Delete an asset.
    
    By default, performs a soft delete (marks as deleted).
    Use hard_delete=true to permanently remove the asset.
    """
    success = await service.delete(asset_id, current_user.id, hard_delete)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    return None


@router.get("/{asset_id}/versions", response_model=List[AssetRead])
async def get_asset_versions(
    asset_id: str,
    current_user: User = Depends(get_current_user),
    service: AssetService = Depends(get_asset_service),
):
    """
    Get all versions of an asset.
    
    Returns a list of all versions of the asset, ordered by version number.
    """
    versions = await service.get_versions(asset_id, current_user.id)
    if not versions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    return [AssetRead.model_validate(v) for v in versions]


@router.get("/by-path/{path:path}", response_model=AssetRead)
async def get_asset_by_path(
    path: str,
    current_user: User = Depends(get_current_user),
    service: AssetService = Depends(get_asset_service),
):
    """
    Get asset by relative path.
    
    Returns the latest active asset at the specified path.
    """
    asset = await service.get_by_path(path, current_user.id)
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found at specified path"
        )
    return AssetRead.model_validate(asset)
