"""
SmartSpec Pro - Admin Gallery API Router
Admin panel for managing gallery content, moderation, and featured items.
"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, update

import structlog

from app.core.database import get_db
from app.core.auth import get_current_admin_user
from app.models.user import User
from app.models.gallery import (
    GalleryItem,
    GalleryComment,
    GalleryVisibility,
    GalleryCategory,
)

logger = structlog.get_logger()

router = APIRouter(prefix="/admin/gallery", tags=["admin-gallery"])


# =============================================================================
# SCHEMAS
# =============================================================================

class AdminGalleryItemResponse(BaseModel):
    """Admin gallery item response with extra fields."""
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
    is_approved: bool
    is_nsfw: bool
    user_id: str
    user_email: str
    user_name: str
    created_at: datetime
    updated_at: Optional[datetime]
    featured_at: Optional[datetime]
    slug: str
    
    class Config:
        from_attributes = True


class GalleryModerationAction(BaseModel):
    """Moderation action request."""
    action: str = Field(..., regex="^(approve|reject|feature|unfeature|hide|delete)$")
    reason: Optional[str] = None


class BulkModerationAction(BaseModel):
    """Bulk moderation action request."""
    item_ids: List[str]
    action: str = Field(..., regex="^(approve|reject|feature|unfeature|hide|delete)$")
    reason: Optional[str] = None


class GalleryStatsResponse(BaseModel):
    """Gallery statistics response."""
    total_items: int
    pending_review: int
    approved_items: int
    rejected_items: int
    featured_items: int
    nsfw_items: int
    total_likes: int
    total_views: int
    total_comments: int
    items_by_type: dict
    items_by_category: dict
    top_creators: List[dict]


class AdminGalleryListResponse(BaseModel):
    """Paginated admin gallery list response."""
    items: List[AdminGalleryItemResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# =============================================================================
# STATISTICS
# =============================================================================

@router.get("/stats", response_model=GalleryStatsResponse)
async def get_gallery_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Get gallery statistics for admin dashboard."""
    # Total items
    total_query = select(func.count(GalleryItem.id))
    total = (await db.execute(total_query)).scalar() or 0
    
    # Pending review
    pending_query = select(func.count(GalleryItem.id)).where(
        GalleryItem.is_approved == False,
        GalleryItem.visibility == GalleryVisibility.PUBLIC,
    )
    pending = (await db.execute(pending_query)).scalar() or 0
    
    # Approved items
    approved_query = select(func.count(GalleryItem.id)).where(GalleryItem.is_approved == True)
    approved = (await db.execute(approved_query)).scalar() or 0
    
    # Featured items
    featured_query = select(func.count(GalleryItem.id)).where(GalleryItem.is_featured == True)
    featured = (await db.execute(featured_query)).scalar() or 0
    
    # NSFW items
    nsfw_query = select(func.count(GalleryItem.id)).where(GalleryItem.is_nsfw == True)
    nsfw = (await db.execute(nsfw_query)).scalar() or 0
    
    # Total engagement
    engagement_query = select(
        func.sum(GalleryItem.likes_count),
        func.sum(GalleryItem.views_count),
        func.sum(GalleryItem.comments_count),
    )
    engagement = (await db.execute(engagement_query)).one()
    total_likes = engagement[0] or 0
    total_views = engagement[1] or 0
    total_comments = engagement[2] or 0
    
    # Items by type
    type_query = select(
        GalleryItem.media_type,
        func.count(GalleryItem.id).label("count")
    ).group_by(GalleryItem.media_type)
    type_result = await db.execute(type_query)
    items_by_type = {row.media_type: row.count for row in type_result.all()}
    
    # Items by category
    category_query = select(
        GalleryItem.category,
        func.count(GalleryItem.id).label("count")
    ).group_by(GalleryItem.category)
    category_result = await db.execute(category_query)
    items_by_category = {row.category.value: row.count for row in category_result.all()}
    
    # Top creators
    creator_query = select(
        GalleryItem.user_id,
        func.count(GalleryItem.id).label("item_count"),
        func.sum(GalleryItem.likes_count).label("total_likes"),
    ).group_by(GalleryItem.user_id).order_by(
        func.count(GalleryItem.id).desc()
    ).limit(10)
    creator_result = await db.execute(creator_query)
    
    top_creators = []
    for row in creator_result.all():
        # Get user info
        user_query = select(User).where(User.id == row.user_id)
        user = (await db.execute(user_query)).scalar_one_or_none()
        if user:
            top_creators.append({
                "user_id": row.user_id,
                "user_name": user.full_name or user.email,
                "item_count": row.item_count,
                "total_likes": row.total_likes or 0,
            })
    
    return GalleryStatsResponse(
        total_items=total,
        pending_review=pending,
        approved_items=approved,
        rejected_items=total - approved - pending,
        featured_items=featured,
        nsfw_items=nsfw,
        total_likes=total_likes,
        total_views=total_views,
        total_comments=total_comments,
        items_by_type=items_by_type,
        items_by_category=items_by_category,
        top_creators=top_creators,
    )


# =============================================================================
# ITEM MANAGEMENT
# =============================================================================

@router.get("/items", response_model=AdminGalleryListResponse)
async def list_gallery_items_admin(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None, regex="^(pending|approved|rejected|featured)$"),
    media_type: Optional[str] = None,
    category: Optional[GalleryCategory] = None,
    search: Optional[str] = None,
    user_id: Optional[str] = None,
    is_nsfw: Optional[bool] = None,
    sort_by: str = Query("recent", regex="^(recent|popular|reports)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """List all gallery items with admin filters."""
    query = select(GalleryItem)
    
    # Apply filters
    if status == "pending":
        query = query.where(
            GalleryItem.is_approved == False,
            GalleryItem.visibility == GalleryVisibility.PUBLIC,
        )
    elif status == "approved":
        query = query.where(GalleryItem.is_approved == True)
    elif status == "featured":
        query = query.where(GalleryItem.is_featured == True)
    
    if media_type:
        query = query.where(GalleryItem.media_type == media_type)
    
    if category:
        query = query.where(GalleryItem.category == category)
    
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                GalleryItem.title.ilike(search_term),
                GalleryItem.prompt.ilike(search_term),
            )
        )
    
    if user_id:
        query = query.where(GalleryItem.user_id == user_id)
    
    if is_nsfw is not None:
        query = query.where(GalleryItem.is_nsfw == is_nsfw)
    
    # Apply sorting
    if sort_by == "recent":
        query = query.order_by(GalleryItem.created_at.desc())
    elif sort_by == "popular":
        query = query.order_by(GalleryItem.likes_count.desc())
    
    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0
    
    # Apply pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    # Execute query
    result = await db.execute(query)
    items = result.scalars().all()
    
    # Get user info for each item
    response_items = []
    for item in items:
        user_query = select(User).where(User.id == item.user_id)
        user = (await db.execute(user_query)).scalar_one_or_none()
        
        response_items.append(AdminGalleryItemResponse(
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
            is_approved=item.is_approved,
            is_nsfw=item.is_nsfw,
            user_id=item.user_id,
            user_email=user.email if user else "Unknown",
            user_name=user.full_name if user else "Unknown",
            created_at=item.created_at,
            updated_at=item.updated_at,
            featured_at=item.featured_at,
            slug=item.slug,
        ))
    
    total_pages = (total + page_size - 1) // page_size
    
    return AdminGalleryListResponse(
        items=response_items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/items/{item_id}", response_model=AdminGalleryItemResponse)
async def get_gallery_item_admin(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Get a single gallery item with admin details."""
    query = select(GalleryItem).where(GalleryItem.id == item_id)
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    
    user_query = select(User).where(User.id == item.user_id)
    user = (await db.execute(user_query)).scalar_one_or_none()
    
    return AdminGalleryItemResponse(
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
        is_approved=item.is_approved,
        is_nsfw=item.is_nsfw,
        user_id=item.user_id,
        user_email=user.email if user else "Unknown",
        user_name=user.full_name if user else "Unknown",
        created_at=item.created_at,
        updated_at=item.updated_at,
        featured_at=item.featured_at,
        slug=item.slug,
    )


# =============================================================================
# MODERATION
# =============================================================================

@router.post("/items/{item_id}/moderate")
async def moderate_gallery_item(
    item_id: str,
    action: GalleryModerationAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Perform moderation action on a gallery item.
    
    Actions:
    - approve: Approve item for public display
    - reject: Reject item (hide from public)
    - feature: Mark as featured
    - unfeature: Remove from featured
    - hide: Hide item from public
    - delete: Permanently delete item
    """
    query = select(GalleryItem).where(GalleryItem.id == item_id)
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Gallery item not found")
    
    if action.action == "approve":
        item.is_approved = True
        message = "Item approved"
    
    elif action.action == "reject":
        item.is_approved = False
        item.visibility = GalleryVisibility.PRIVATE
        message = "Item rejected"
    
    elif action.action == "feature":
        item.is_featured = True
        item.featured_at = datetime.utcnow()
        message = "Item featured"
    
    elif action.action == "unfeature":
        item.is_featured = False
        item.featured_at = None
        message = "Item unfeatured"
    
    elif action.action == "hide":
        item.visibility = GalleryVisibility.PRIVATE
        message = "Item hidden"
    
    elif action.action == "delete":
        await db.delete(item)
        await db.commit()
        logger.info(
            "gallery_item_deleted_by_admin",
            item_id=item_id,
            admin_id=current_user.id,
            reason=action.reason,
        )
        return {"message": "Item deleted"}
    
    item.updated_at = datetime.utcnow()
    await db.commit()
    
    logger.info(
        "gallery_item_moderated",
        item_id=item_id,
        action=action.action,
        admin_id=current_user.id,
        reason=action.reason,
    )
    
    return {"message": message}


@router.post("/items/bulk-moderate")
async def bulk_moderate_gallery_items(
    action: BulkModerationAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Perform bulk moderation action on multiple gallery items."""
    if not action.item_ids:
        raise HTTPException(status_code=400, detail="No items specified")
    
    if len(action.item_ids) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 items per bulk action")
    
    # Get all items
    query = select(GalleryItem).where(GalleryItem.id.in_(action.item_ids))
    result = await db.execute(query)
    items = result.scalars().all()
    
    if not items:
        raise HTTPException(status_code=404, detail="No items found")
    
    updated_count = 0
    
    for item in items:
        if action.action == "approve":
            item.is_approved = True
        elif action.action == "reject":
            item.is_approved = False
            item.visibility = GalleryVisibility.PRIVATE
        elif action.action == "feature":
            item.is_featured = True
            item.featured_at = datetime.utcnow()
        elif action.action == "unfeature":
            item.is_featured = False
            item.featured_at = None
        elif action.action == "hide":
            item.visibility = GalleryVisibility.PRIVATE
        elif action.action == "delete":
            await db.delete(item)
        
        item.updated_at = datetime.utcnow()
        updated_count += 1
    
    await db.commit()
    
    logger.info(
        "gallery_items_bulk_moderated",
        action=action.action,
        count=updated_count,
        admin_id=current_user.id,
        reason=action.reason,
    )
    
    return {
        "message": f"Bulk action '{action.action}' completed",
        "updated_count": updated_count,
    }


# =============================================================================
# COMMENT MODERATION
# =============================================================================

@router.get("/comments", response_model=List[dict])
async def list_comments_admin(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    item_id: Optional[str] = None,
    user_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """List all comments with admin filters."""
    query = select(GalleryComment)
    
    if item_id:
        query = query.where(GalleryComment.gallery_item_id == item_id)
    
    if user_id:
        query = query.where(GalleryComment.user_id == user_id)
    
    query = query.order_by(GalleryComment.created_at.desc())
    
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    result = await db.execute(query)
    comments = result.scalars().all()
    
    response = []
    for comment in comments:
        user_query = select(User).where(User.id == comment.user_id)
        user = (await db.execute(user_query)).scalar_one_or_none()
        
        response.append({
            "id": comment.id,
            "content": comment.content,
            "gallery_item_id": comment.gallery_item_id,
            "user_id": comment.user_id,
            "user_name": user.full_name if user else "Unknown",
            "user_email": user.email if user else "Unknown",
            "created_at": comment.created_at,
        })
    
    return response


@router.delete("/comments/{comment_id}")
async def delete_comment_admin(
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Delete a comment as admin."""
    query = select(GalleryComment).where(GalleryComment.id == comment_id)
    result = await db.execute(query)
    comment = result.scalar_one_or_none()
    
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Update comment count on gallery item
    item_query = select(GalleryItem).where(GalleryItem.id == comment.gallery_item_id)
    item = (await db.execute(item_query)).scalar_one_or_none()
    if item:
        item.comments_count = max(0, item.comments_count - 1)
    
    await db.delete(comment)
    await db.commit()
    
    logger.info(
        "comment_deleted_by_admin",
        comment_id=comment_id,
        admin_id=current_user.id,
    )
    
    return {"message": "Comment deleted"}


# =============================================================================
# FEATURED MANAGEMENT
# =============================================================================

@router.get("/featured", response_model=List[AdminGalleryItemResponse])
async def list_featured_items(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """List all featured items ordered by featured date."""
    query = select(GalleryItem).where(
        GalleryItem.is_featured == True
    ).order_by(GalleryItem.featured_at.desc())
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    response = []
    for item in items:
        user_query = select(User).where(User.id == item.user_id)
        user = (await db.execute(user_query)).scalar_one_or_none()
        
        response.append(AdminGalleryItemResponse(
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
            is_approved=item.is_approved,
            is_nsfw=item.is_nsfw,
            user_id=item.user_id,
            user_email=user.email if user else "Unknown",
            user_name=user.full_name if user else "Unknown",
            created_at=item.created_at,
            updated_at=item.updated_at,
            featured_at=item.featured_at,
            slug=item.slug,
        ))
    
    return response


@router.put("/featured/reorder")
async def reorder_featured_items(
    item_ids: List[str],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Reorder featured items by updating featured_at timestamps."""
    now = datetime.utcnow()
    
    for i, item_id in enumerate(item_ids):
        query = select(GalleryItem).where(
            GalleryItem.id == item_id,
            GalleryItem.is_featured == True,
        )
        result = await db.execute(query)
        item = result.scalar_one_or_none()
        
        if item:
            # Set featured_at with decreasing timestamps to maintain order
            from datetime import timedelta
            item.featured_at = now - timedelta(seconds=i)
    
    await db.commit()
    
    return {"message": "Featured items reordered"}
