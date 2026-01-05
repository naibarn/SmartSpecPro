"""
SmartSpec Pro - Gallery API Router
Public gallery for AI-generated content with SEO optimization.
"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

import structlog

from app.core.database import get_db
from app.core.auth import get_current_user_optional, get_current_user
from app.models.user import User
from app.models.gallery import (
    GalleryItem,
    GalleryLike,
    GalleryComment,
    GalleryCollection,
    GalleryVisibility,
    GalleryCategory,
)

logger = structlog.get_logger()

router = APIRouter(prefix="/gallery", tags=["gallery"])


# =============================================================================
# SCHEMAS
# =============================================================================

class GalleryItemResponse(BaseModel):
    """Gallery item response."""
    id: str
    title: str
    description: Optional[str]
    media_type: str
    media_url: str
    thumbnail_url: Optional[str]
    prompt: str
    model_id: str
    model_name: str
    category: str
    tags: List[str]
    visibility: str
    likes_count: int
    views_count: int
    comments_count: int
    is_featured: bool
    is_nsfw: bool
    user_id: str
    user_name: str
    user_avatar: Optional[str]
    created_at: datetime
    
    # SEO fields
    slug: str
    meta_title: Optional[str]
    meta_description: Optional[str]
    
    class Config:
        from_attributes = True


class GalleryItemCreate(BaseModel):
    """Create gallery item request."""
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    generation_task_id: str
    category: GalleryCategory = GalleryCategory.OTHER
    tags: List[str] = Field(default_factory=list, max_items=10)
    visibility: GalleryVisibility = GalleryVisibility.PUBLIC
    is_nsfw: bool = False


class GalleryItemUpdate(BaseModel):
    """Update gallery item request."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    category: Optional[GalleryCategory] = None
    tags: Optional[List[str]] = Field(None, max_items=10)
    visibility: Optional[GalleryVisibility] = None
    is_nsfw: Optional[bool] = None


class CommentCreate(BaseModel):
    """Create comment request."""
    content: str = Field(..., min_length=1, max_length=1000)


class CommentResponse(BaseModel):
    """Comment response."""
    id: str
    content: str
    user_id: str
    user_name: str
    user_avatar: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class CollectionCreate(BaseModel):
    """Create collection request."""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    is_public: bool = True


class CollectionResponse(BaseModel):
    """Collection response."""
    id: str
    name: str
    description: Optional[str]
    is_public: bool
    items_count: int
    user_id: str
    user_name: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class GalleryListResponse(BaseModel):
    """Paginated gallery list response."""
    items: List[GalleryItemResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# =============================================================================
# SEO HELPERS
# =============================================================================

def generate_slug(title: str, item_id: str) -> str:
    """Generate SEO-friendly slug from title."""
    import re
    # Convert to lowercase and replace spaces with hyphens
    slug = title.lower().strip()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    slug = slug[:50]  # Limit length
    return f"{slug}-{item_id[:8]}"


def generate_meta_description(prompt: str, model_name: str) -> str:
    """Generate meta description for SEO."""
    desc = f"AI-generated content using {model_name}. {prompt[:150]}"
    if len(desc) > 160:
        desc = desc[:157] + "..."
    return desc


# =============================================================================
# PUBLIC ENDPOINTS
# =============================================================================

@router.get("/", response_model=GalleryListResponse)
async def list_gallery_items(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: Optional[GalleryCategory] = None,
    media_type: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = Query("recent", regex="^(recent|popular|trending)$"),
    featured_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    List public gallery items with filtering and pagination.
    
    This endpoint is optimized for SEO with proper pagination and filtering.
    """
    # Build query
    query = select(GalleryItem).where(
        GalleryItem.visibility == GalleryVisibility.PUBLIC,
        GalleryItem.is_approved == True,
    )
    
    # Apply filters
    if category:
        query = query.where(GalleryItem.category == category)
    
    if media_type:
        query = query.where(GalleryItem.media_type == media_type)
    
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                GalleryItem.title.ilike(search_term),
                GalleryItem.description.ilike(search_term),
                GalleryItem.prompt.ilike(search_term),
            )
        )
    
    if featured_only:
        query = query.where(GalleryItem.is_featured == True)
    
    # Apply sorting
    if sort_by == "recent":
        query = query.order_by(GalleryItem.created_at.desc())
    elif sort_by == "popular":
        query = query.order_by(GalleryItem.likes_count.desc())
    elif sort_by == "trending":
        # Trending = recent + popular (weighted)
        query = query.order_by(
            (GalleryItem.likes_count * 2 + GalleryItem.views_count).desc(),
            GalleryItem.created_at.desc()
        )
    
    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0
    
    # Apply pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    # Execute query
    result = await db.execute(query)
    items = result.scalars().all()
    
    # Calculate total pages
    total_pages = (total + page_size - 1) // page_size
    
    return GalleryListResponse(
        items=[_item_to_response(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/featured", response_model=List[GalleryItemResponse])
async def get_featured_items(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Get featured gallery items for homepage showcase."""
    query = select(GalleryItem).where(
        GalleryItem.visibility == GalleryVisibility.PUBLIC,
        GalleryItem.is_approved == True,
        GalleryItem.is_featured == True,
    ).order_by(GalleryItem.featured_at.desc()).limit(limit)
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    return [_item_to_response(item) for item in items]


@router.get("/trending", response_model=List[GalleryItemResponse])
async def get_trending_items(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Get trending gallery items based on recent engagement."""
    # Get items from last 7 days with high engagement
    from datetime import timedelta
    week_ago = datetime.utcnow() - timedelta(days=7)
    
    query = select(GalleryItem).where(
        GalleryItem.visibility == GalleryVisibility.PUBLIC,
        GalleryItem.is_approved == True,
        GalleryItem.created_at >= week_ago,
    ).order_by(
        (GalleryItem.likes_count * 3 + GalleryItem.views_count + GalleryItem.comments_count * 2).desc()
    ).limit(limit)
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    return [_item_to_response(item) for item in items]


@router.get("/categories", response_model=List[dict])
async def get_categories(db: AsyncSession = Depends(get_db)):
    """Get all categories with item counts."""
    query = select(
        GalleryItem.category,
        func.count(GalleryItem.id).label("count")
    ).where(
        GalleryItem.visibility == GalleryVisibility.PUBLIC,
        GalleryItem.is_approved == True,
    ).group_by(GalleryItem.category)
    
    result = await db.execute(query)
    rows = result.all()
    
    return [
        {
            "id": row.category.value,
            "name": row.category.value.replace("_", " ").title(),
            "count": row.count,
        }
        for row in rows
    ]


@router.get("/item/{item_id}", response_model=GalleryItemResponse)
async def get_gallery_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Get a single gallery item by ID.
    
    Increments view count for public items.
    """
    query = select(GalleryItem).where(GalleryItem.id == item_id)
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    
    # Check visibility
    if item.visibility != GalleryVisibility.PUBLIC:
        if not current_user or current_user.id != item.user_id:
            raise HTTPException(status_code=404, detail="Gallery item not found")
    
    # Increment view count
    item.views_count += 1
    await db.commit()
    
    return _item_to_response(item)


@router.get("/slug/{slug}", response_model=GalleryItemResponse)
async def get_gallery_item_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Get a gallery item by SEO-friendly slug.
    
    This endpoint is optimized for SEO with clean URLs.
    """
    query = select(GalleryItem).where(GalleryItem.slug == slug)
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    
    # Check visibility
    if item.visibility != GalleryVisibility.PUBLIC:
        if not current_user or current_user.id != item.user_id:
            raise HTTPException(status_code=404, detail="Gallery item not found")
    
    # Increment view count
    item.views_count += 1
    await db.commit()
    
    return _item_to_response(item)


# =============================================================================
# AUTHENTICATED ENDPOINTS
# =============================================================================

@router.post("/", response_model=GalleryItemResponse)
async def create_gallery_item(
    data: GalleryItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Share a generated item to the public gallery.
    
    Requires authentication.
    """
    from app.models.generation_task import GenerationTask
    
    # Get the generation task
    task_query = select(GenerationTask).where(
        GenerationTask.id == data.generation_task_id,
        GenerationTask.user_id == current_user.id,
    )
    result = await db.execute(task_query)
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Generation task not found")
    
    if task.status != "completed":
        raise HTTPException(status_code=400, detail="Task must be completed to share")
    
    # Create gallery item
    item = GalleryItem(
        title=data.title,
        description=data.description,
        media_type=task.task_type,
        media_url=task.output_url,
        thumbnail_url=task.thumbnail_url,
        prompt=task.prompt,
        model_id=task.model_id,
        model_name=task.model_name,
        category=data.category,
        tags=data.tags,
        visibility=data.visibility,
        is_nsfw=data.is_nsfw,
        user_id=current_user.id,
        generation_task_id=task.id,
    )
    
    # Generate SEO fields
    item.slug = generate_slug(data.title, item.id)
    item.meta_title = f"{data.title} | SmartSpec Gallery"
    item.meta_description = generate_meta_description(task.prompt, task.model_name)
    
    # Auto-approve for now (can add moderation later)
    item.is_approved = True
    
    db.add(item)
    await db.commit()
    await db.refresh(item)
    
    logger.info("gallery_item_created", item_id=item.id, user_id=current_user.id)
    
    return _item_to_response(item)


@router.put("/item/{item_id}", response_model=GalleryItemResponse)
async def update_gallery_item(
    item_id: str,
    data: GalleryItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a gallery item."""
    query = select(GalleryItem).where(
        GalleryItem.id == item_id,
        GalleryItem.user_id == current_user.id,
    )
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    
    # Update fields
    if data.title is not None:
        item.title = data.title
        item.slug = generate_slug(data.title, item.id)
        item.meta_title = f"{data.title} | SmartSpec Gallery"
    
    if data.description is not None:
        item.description = data.description
    
    if data.category is not None:
        item.category = data.category
    
    if data.tags is not None:
        item.tags = data.tags
    
    if data.visibility is not None:
        item.visibility = data.visibility
    
    if data.is_nsfw is not None:
        item.is_nsfw = data.is_nsfw
    
    item.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(item)
    
    return _item_to_response(item)


@router.delete("/item/{item_id}")
async def delete_gallery_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a gallery item."""
    query = select(GalleryItem).where(
        GalleryItem.id == item_id,
        GalleryItem.user_id == current_user.id,
    )
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    
    await db.delete(item)
    await db.commit()
    
    return {"message": "Gallery item deleted"}


# =============================================================================
# LIKES & COMMENTS
# =============================================================================

@router.post("/item/{item_id}/like")
async def like_gallery_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Like a gallery item."""
    # Check if item exists
    item_query = select(GalleryItem).where(GalleryItem.id == item_id)
    result = await db.execute(item_query)
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    
    # Check if already liked
    like_query = select(GalleryLike).where(
        GalleryLike.gallery_item_id == item_id,
        GalleryLike.user_id == current_user.id,
    )
    result = await db.execute(like_query)
    existing_like = result.scalar_one_or_none()
    
    if existing_like:
        # Unlike
        await db.delete(existing_like)
        item.likes_count = max(0, item.likes_count - 1)
        await db.commit()
        return {"liked": False, "likes_count": item.likes_count}
    else:
        # Like
        like = GalleryLike(gallery_item_id=item_id, user_id=current_user.id)
        db.add(like)
        item.likes_count += 1
        await db.commit()
        return {"liked": True, "likes_count": item.likes_count}


@router.get("/item/{item_id}/comments", response_model=List[CommentResponse])
async def get_comments(
    item_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get comments for a gallery item."""
    query = select(GalleryComment).where(
        GalleryComment.gallery_item_id == item_id,
    ).order_by(GalleryComment.created_at.desc())
    
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    result = await db.execute(query)
    comments = result.scalars().all()
    
    return [_comment_to_response(c) for c in comments]


@router.post("/item/{item_id}/comments", response_model=CommentResponse)
async def add_comment(
    item_id: str,
    data: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a comment to a gallery item."""
    # Check if item exists
    item_query = select(GalleryItem).where(GalleryItem.id == item_id)
    result = await db.execute(item_query)
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    
    comment = GalleryComment(
        gallery_item_id=item_id,
        user_id=current_user.id,
        content=data.content,
    )
    
    db.add(comment)
    item.comments_count += 1
    await db.commit()
    await db.refresh(comment)
    
    return _comment_to_response(comment)


# =============================================================================
# COLLECTIONS
# =============================================================================

@router.get("/collections", response_model=List[CollectionResponse])
async def list_collections(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List user's collections."""
    query = select(GalleryCollection).where(
        GalleryCollection.user_id == current_user.id,
    ).order_by(GalleryCollection.created_at.desc())
    
    result = await db.execute(query)
    collections = result.scalars().all()
    
    return [_collection_to_response(c) for c in collections]


@router.post("/collections", response_model=CollectionResponse)
async def create_collection(
    data: CollectionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new collection."""
    collection = GalleryCollection(
        name=data.name,
        description=data.description,
        is_public=data.is_public,
        user_id=current_user.id,
    )
    
    db.add(collection)
    await db.commit()
    await db.refresh(collection)
    
    return _collection_to_response(collection)


@router.post("/collections/{collection_id}/items/{item_id}")
async def add_item_to_collection(
    collection_id: str,
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add an item to a collection."""
    from app.models.gallery import GalleryCollectionItem
    
    # Verify collection ownership
    collection_query = select(GalleryCollection).where(
        GalleryCollection.id == collection_id,
        GalleryCollection.user_id == current_user.id,
    )
    result = await db.execute(collection_query)
    collection = result.scalar_one_or_none()
    
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    # Verify item exists
    item_query = select(GalleryItem).where(GalleryItem.id == item_id)
    result = await db.execute(item_query)
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    
    # Add to collection
    collection_item = GalleryCollectionItem(
        collection_id=collection_id,
        gallery_item_id=item_id,
    )
    
    db.add(collection_item)
    collection.items_count += 1
    await db.commit()
    
    return {"message": "Item added to collection"}


# =============================================================================
# SEO ENDPOINTS
# =============================================================================

@router.get("/sitemap.xml", response_class=HTMLResponse)
async def get_sitemap(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate XML sitemap for SEO.
    
    Returns sitemap with all public gallery items.
    """
    base_url = str(request.base_url).rstrip("/")
    
    # Get all public items
    query = select(GalleryItem).where(
        GalleryItem.visibility == GalleryVisibility.PUBLIC,
        GalleryItem.is_approved == True,
    ).order_by(GalleryItem.created_at.desc()).limit(50000)
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    # Generate sitemap XML
    xml_items = []
    for item in items:
        xml_items.append(f"""
    <url>
        <loc>{base_url}/gallery/{item.slug}</loc>
        <lastmod>{item.updated_at.strftime('%Y-%m-%d') if item.updated_at else item.created_at.strftime('%Y-%m-%d')}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
        <image:image>
            <image:loc>{item.media_url}</image:loc>
            <image:title>{item.title}</image:title>
        </image:image>
    </url>""")
    
    sitemap = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
    <url>
        <loc>{base_url}/gallery</loc>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
    {''.join(xml_items)}
</urlset>"""
    
    return HTMLResponse(content=sitemap, media_type="application/xml")


@router.get("/robots.txt", response_class=HTMLResponse)
async def get_robots(request: Request):
    """Generate robots.txt for SEO."""
    base_url = str(request.base_url).rstrip("/")
    
    robots = f"""User-agent: *
Allow: /gallery/
Allow: /gallery/sitemap.xml
Disallow: /api/
Disallow: /admin/

Sitemap: {base_url}/gallery/sitemap.xml
"""
    
    return HTMLResponse(content=robots, media_type="text/plain")


# =============================================================================
# HELPERS
# =============================================================================

def _item_to_response(item: GalleryItem) -> GalleryItemResponse:
    """Convert GalleryItem to response."""
    return GalleryItemResponse(
        id=item.id,
        title=item.title,
        description=item.description,
        media_type=item.media_type,
        media_url=item.media_url,
        thumbnail_url=item.thumbnail_url,
        prompt=item.prompt,
        model_id=item.model_id,
        model_name=item.model_name,
        category=item.category.value,
        tags=item.tags or [],
        visibility=item.visibility.value,
        likes_count=item.likes_count,
        views_count=item.views_count,
        comments_count=item.comments_count,
        is_featured=item.is_featured,
        is_nsfw=item.is_nsfw,
        user_id=item.user_id,
        user_name=item.user.full_name if item.user else "Anonymous",
        user_avatar=None,  # Add avatar URL if available
        created_at=item.created_at,
        slug=item.slug,
        meta_title=item.meta_title,
        meta_description=item.meta_description,
    )


def _comment_to_response(comment: GalleryComment) -> CommentResponse:
    """Convert GalleryComment to response."""
    return CommentResponse(
        id=comment.id,
        content=comment.content,
        user_id=comment.user_id,
        user_name=comment.user.full_name if comment.user else "Anonymous",
        user_avatar=None,
        created_at=comment.created_at,
    )


def _collection_to_response(collection: GalleryCollection) -> CollectionResponse:
    """Convert GalleryCollection to response."""
    return CollectionResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        is_public=collection.is_public,
        items_count=collection.items_count,
        user_id=collection.user_id,
        user_name=collection.user.full_name if collection.user else "Anonymous",
        created_at=collection.created_at,
    )
