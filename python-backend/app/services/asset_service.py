"""
SmartSpec Pro - Asset Service
Service layer for managing project assets with CRUD operations.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
import structlog

from app.models.asset import Asset, AssetType, AssetStatus

logger = structlog.get_logger()


# ============================================
# Pydantic Schemas
# ============================================

class AssetMetadata(BaseModel):
    """Metadata for asset generation."""
    prompt: Optional[str] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None  # seconds for video/audio
    format: Optional[str] = None
    generation_time_ms: Optional[int] = None
    cost_credits: Optional[float] = None


class AssetCreate(BaseModel):
    """Schema for creating a new asset."""
    filename: str = Field(..., min_length=1, max_length=255)
    original_filename: Optional[str] = None
    relative_path: str = Field(..., min_length=1)
    file_size: Optional[int] = None
    asset_type: str = Field(..., pattern="^(image|video|audio)$")
    project_id: Optional[str] = None
    spec_id: Optional[str] = None
    generation_task_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    description: Optional[str] = None
    alt_text: Optional[str] = None


class AssetUpdate(BaseModel):
    """Schema for updating an asset."""
    filename: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    alt_text: Optional[str] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
    status: Optional[str] = Field(None, pattern="^(active|archived|deleted)$")


class AssetRead(BaseModel):
    """Schema for reading an asset."""
    id: str
    user_id: str
    project_id: Optional[str]
    spec_id: Optional[str]
    filename: str
    original_filename: Optional[str]
    relative_path: str
    file_size: Optional[int]
    mime_type: Optional[str]
    asset_type: str
    status: str
    version: int
    is_latest: bool
    parent_asset_id: Optional[str]
    generation_task_id: Optional[str]
    metadata: Optional[Dict[str, Any]]
    tags: Optional[List[str]]
    description: Optional[str]
    alt_text: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class AssetListResponse(BaseModel):
    """Response schema for asset list."""
    items: List[AssetRead]
    total: int
    page: int
    page_size: int
    total_pages: int


class AssetSearchParams(BaseModel):
    """Parameters for searching assets."""
    query: Optional[str] = None  # Search in filename, description, tags
    asset_type: Optional[str] = None
    project_id: Optional[str] = None
    spec_id: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = "active"
    is_latest: Optional[bool] = True
    page: int = 1
    page_size: int = 20
    sort_by: str = "created_at"
    sort_order: str = "desc"


# ============================================
# Asset Service
# ============================================

class AssetService:
    """Service for managing assets."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create(self, user_id: str, data: AssetCreate) -> Asset:
        """Create a new asset."""
        # Determine MIME type
        mime_type = Asset.get_mime_type(data.filename)
        
        # Create asset
        asset = Asset(
            id=str(uuid.uuid4()),
            user_id=user_id,
            project_id=data.project_id,
            spec_id=data.spec_id,
            filename=data.filename,
            original_filename=data.original_filename,
            relative_path=data.relative_path,
            file_size=data.file_size,
            mime_type=mime_type,
            asset_type=AssetType(data.asset_type),
            status=AssetStatus.ACTIVE,
            version=1,
            is_latest=True,
            generation_task_id=data.generation_task_id,
            asset_metadata=data.metadata or {},
            tags=data.tags or [],
            description=data.description,
            alt_text=data.alt_text,
        )
        
        self.db.add(asset)
        await self.db.commit()
        await self.db.refresh(asset)
        
        logger.info("Asset created", asset_id=asset.id, filename=asset.filename)
        return asset
    
    async def get_by_id(self, asset_id: str, user_id: Optional[str] = None) -> Optional[Asset]:
        """Get asset by ID."""
        query = select(Asset).where(Asset.id == asset_id)
        
        if user_id:
            query = query.where(Asset.user_id == user_id)
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def update(self, asset_id: str, user_id: str, data: AssetUpdate) -> Optional[Asset]:
        """Update an asset."""
        asset = await self.get_by_id(asset_id, user_id)
        if not asset:
            return None
        
        # Update fields
        if data.filename is not None:
            asset.filename = data.filename
            asset.mime_type = Asset.get_mime_type(data.filename)
        if data.description is not None:
            asset.description = data.description
        if data.alt_text is not None:
            asset.alt_text = data.alt_text
        if data.tags is not None:
            asset.tags = data.tags
        if data.metadata is not None:
            # Merge metadata
            asset.asset_metadata = {**asset.asset_metadata, **data.metadata}
        if data.status is not None:
            asset.status = AssetStatus(data.status)
            if data.status == "deleted":
                asset.deleted_at = datetime.utcnow()
        
        asset.updated_at = datetime.utcnow()
        
        await self.db.commit()
        await self.db.refresh(asset)
        
        logger.info("Asset updated", asset_id=asset.id)
        return asset
    
    async def create_version(
        self, 
        parent_asset_id: str, 
        user_id: str, 
        data: AssetCreate
    ) -> Optional[Asset]:
        """Create a new version of an asset."""
        # Get parent asset
        parent = await self.get_by_id(parent_asset_id, user_id)
        if not parent:
            return None
        
        # Mark parent as not latest
        parent.is_latest = False
        
        # Create new version
        mime_type = Asset.get_mime_type(data.filename)
        
        new_asset = Asset(
            id=str(uuid.uuid4()),
            user_id=user_id,
            project_id=data.project_id or parent.project_id,
            spec_id=data.spec_id or parent.spec_id,
            filename=data.filename,
            original_filename=data.original_filename,
            relative_path=data.relative_path,
            file_size=data.file_size,
            mime_type=mime_type,
            asset_type=AssetType(data.asset_type),
            status=AssetStatus.ACTIVE,
            version=parent.version + 1,
            is_latest=True,
            parent_asset_id=parent_asset_id,
            generation_task_id=data.generation_task_id,
            asset_metadata=data.metadata or {},
            tags=data.tags or parent.tags,
            description=data.description or parent.description,
            alt_text=data.alt_text or parent.alt_text,
        )
        
        self.db.add(new_asset)
        await self.db.commit()
        await self.db.refresh(new_asset)
        
        logger.info("Asset version created", 
                   asset_id=new_asset.id, 
                   parent_id=parent_asset_id,
                   version=new_asset.version)
        return new_asset
    
    async def delete(self, asset_id: str, user_id: str, hard_delete: bool = False) -> bool:
        """Delete an asset (soft delete by default)."""
        asset = await self.get_by_id(asset_id, user_id)
        if not asset:
            return False
        
        if hard_delete:
            await self.db.delete(asset)
        else:
            asset.status = AssetStatus.DELETED
            asset.deleted_at = datetime.utcnow()
        
        await self.db.commit()
        
        logger.info("Asset deleted", asset_id=asset_id, hard_delete=hard_delete)
        return True
    
    async def search(self, user_id: str, params: AssetSearchParams) -> AssetListResponse:
        """Search assets with filters and pagination."""
        # Base query
        query = select(Asset).where(Asset.user_id == user_id)
        count_query = select(func.count(Asset.id)).where(Asset.user_id == user_id)
        
        # Apply filters
        if params.asset_type:
            query = query.where(Asset.asset_type == AssetType(params.asset_type))
            count_query = count_query.where(Asset.asset_type == AssetType(params.asset_type))
        
        if params.project_id:
            query = query.where(Asset.project_id == params.project_id)
            count_query = count_query.where(Asset.project_id == params.project_id)
        
        if params.spec_id:
            query = query.where(Asset.spec_id == params.spec_id)
            count_query = count_query.where(Asset.spec_id == params.spec_id)
        
        if params.status:
            query = query.where(Asset.status == AssetStatus(params.status))
            count_query = count_query.where(Asset.status == AssetStatus(params.status))
        
        if params.is_latest is not None:
            query = query.where(Asset.is_latest == params.is_latest)
            count_query = count_query.where(Asset.is_latest == params.is_latest)
        
        if params.query:
            search_term = f"%{params.query}%"
            query = query.where(
                or_(
                    Asset.filename.ilike(search_term),
                    Asset.description.ilike(search_term),
                )
            )
            count_query = count_query.where(
                or_(
                    Asset.filename.ilike(search_term),
                    Asset.description.ilike(search_term),
                )
            )
        
        if params.tags:
            # Filter by tags (JSON array contains)
            for tag in params.tags:
                query = query.where(Asset.tags.contains([tag]))
                count_query = count_query.where(Asset.tags.contains([tag]))
        
        # Get total count
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0
        
        # Apply sorting
        sort_column = getattr(Asset, params.sort_by, Asset.created_at)
        if params.sort_order == "desc":
            query = query.order_by(sort_column.desc())
        else:
            query = query.order_by(sort_column.asc())
        
        # Apply pagination
        offset = (params.page - 1) * params.page_size
        query = query.offset(offset).limit(params.page_size)
        
        # Execute query
        result = await self.db.execute(query)
        assets = result.scalars().all()
        
        # Calculate total pages
        total_pages = (total + params.page_size - 1) // params.page_size
        
        return AssetListResponse(
            items=[AssetRead.model_validate(a) for a in assets],
            total=total,
            page=params.page,
            page_size=params.page_size,
            total_pages=total_pages,
        )
    
    async def get_versions(self, asset_id: str, user_id: str) -> List[Asset]:
        """Get all versions of an asset."""
        # First get the asset to find the root
        asset = await self.get_by_id(asset_id, user_id)
        if not asset:
            return []
        
        # Find root asset (the one without parent)
        root_id = asset_id
        current = asset
        while current.parent_asset_id:
            root_id = current.parent_asset_id
            current = await self.get_by_id(current.parent_asset_id, user_id)
            if not current:
                break
        
        # Get all versions starting from root
        versions = []
        current_id = root_id
        while current_id:
            current = await self.get_by_id(current_id, user_id)
            if current:
                versions.append(current)
                # Find next version
                query = select(Asset).where(
                    and_(
                        Asset.parent_asset_id == current_id,
                        Asset.user_id == user_id
                    )
                )
                result = await self.db.execute(query)
                next_version = result.scalar_one_or_none()
                current_id = next_version.id if next_version else None
            else:
                break
        
        return versions
    
    async def get_by_path(self, relative_path: str, user_id: str) -> Optional[Asset]:
        """Get asset by relative path."""
        query = select(Asset).where(
            and_(
                Asset.relative_path == relative_path,
                Asset.user_id == user_id,
                Asset.is_latest == True,
                Asset.status == AssetStatus.ACTIVE
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
