"""
Marketplace API
Endpoints for template marketplace operations
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import structlog

from app.core.database import get_db
from app.core.auth import get_current_user, require_admin
from app.models.user import User
from app.models.marketplace_template import TemplateStatus, TemplateCategory, TechStack
from app.services.marketplace_service import MarketplaceService

logger = structlog.get_logger()
router = APIRouter()


# ==================== Request/Response Models ====================

class CreateTemplateRequest(BaseModel):
    """Request to create a new template"""
    name: str = Field(..., min_length=3, max_length=255)
    slug: str = Field(..., min_length=3, max_length=255, regex=r'^[a-z0-9-]+$')
    tagline: str = Field(..., min_length=10, max_length=500)
    description: str = Field(..., min_length=50)
    category: TemplateCategory
    tags: Optional[List[str]] = []
    tech_stack: List[str] = Field(..., min_items=1)
    price_credits: int = Field(..., ge=0)
    template_file_url: str
    preview_images: Optional[List[str]] = []
    demo_video_url: Optional[str] = None
    readme_content: Optional[str] = None
    min_smartspec_version: Optional[str] = None
    dependencies: Optional[List[str]] = []


class UpdateTemplateRequest(BaseModel):
    """Request to update template"""
    name: Optional[str] = Field(None, min_length=3, max_length=255)
    tagline: Optional[str] = Field(None, min_length=10, max_length=500)
    description: Optional[str] = Field(None, min_length=50)
    tags: Optional[List[str]] = None
    price_credits: Optional[int] = Field(None, ge=0)
    preview_images: Optional[List[str]] = None
    demo_video_url: Optional[str] = None
    readme_content: Optional[str] = None


class ReviewTemplateRequest(BaseModel):
    """Admin review decision"""
    approve: bool
    notes: Optional[str] = None
    rejection_reason: Optional[str] = None


class TemplateResponse(BaseModel):
    """Template info response"""
    id: str
    creator_id: str
    name: str
    slug: str
    tagline: str
    description: str
    category: str
    tags: List[str]
    tech_stack: List[str]
    price_credits: int
    status: str
    is_featured: bool
    preview_images: List[str]
    demo_video_url: Optional[str]
    version: str
    readme_content: Optional[str]
    download_count: int
    purchase_count: int
    rating_average: Optional[float]
    rating_count: int
    view_count: int
    created_at: str
    published_at: Optional[str]


class TemplateListResponse(BaseModel):
    """Paginated template list"""
    templates: List[TemplateResponse]
    total: int
    limit: int
    offset: int


class PurchaseResponse(BaseModel):
    """Purchase confirmation"""
    purchase_id: str
    template_id: str
    template_name: str
    price_paid_credits: int
    download_url: str
    buyer_balance_after: int
    message: str


class PurchaseHistoryResponse(BaseModel):
    """User's purchase history"""
    id: str
    template_id: str
    price_paid_credits: int
    template_version: str
    download_count: int
    last_downloaded_at: Optional[str]
    purchased_at: str


class CreatorAnalyticsResponse(BaseModel):
    """Creator's template analytics"""
    total_templates: int
    approved_templates: int
    total_revenue_credits: int
    total_purchases: int
    creator_share_percentage: int


# ==================== Public Marketplace Endpoints ====================

@router.get("/templates", response_model=TemplateListResponse)
async def list_marketplace_templates(
    category: Optional[TemplateCategory] = Query(None),
    tech_stack: Optional[str] = Query(None),
    min_price: Optional[int] = Query(None, ge=0),
    max_price: Optional[int] = Query(None, ge=0),
    search: Optional[str] = Query(None),
    sort_by: str = Query("popular", regex="^(popular|recent|price_low|price_high|rating)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """
    Browse marketplace templates
    Public endpoint - no auth required
    """
    templates, total = await MarketplaceService.list_marketplace_templates(
        db,
        category=category,
        tech_stack=tech_stack,
        min_price=min_price,
        max_price=max_price,
        search_query=search,
        sort_by=sort_by,
        limit=limit,
        offset=offset
    )

    return TemplateListResponse(
        templates=[TemplateResponse(**t.to_dict()) for t in templates],
        total=total,
        limit=limit,
        offset=offset
    )


@router.get("/templates/{template_id}", response_model=TemplateResponse)
async def get_template_details(
    template_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get template details
    Public endpoint - increments view count
    """
    template = await MarketplaceService.get_template_by_id(
        db,
        template_id,
        increment_view=True
    )

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )

    return TemplateResponse(**template.to_dict())


# ==================== Template Creator Endpoints ====================

@router.post("/templates", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    request: CreateTemplateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new template (starts in DRAFT status)
    Requires authentication
    """
    try:
        template = await MarketplaceService.create_template(
            db,
            creator=current_user,
            name=request.name,
            slug=request.slug,
            tagline=request.tagline,
            description=request.description,
            category=request.category,
            price_credits=request.price_credits,
            tech_stack=request.tech_stack,
            template_file_url=request.template_file_url,
            tags=request.tags,
            preview_images=request.preview_images,
            demo_video_url=request.demo_video_url,
            readme_content=request.readme_content,
            min_smartspec_version=request.min_smartspec_version,
            dependencies=request.dependencies
        )

        return TemplateResponse(**template.to_dict())

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.put("/templates/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: str,
    request: UpdateTemplateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update template (only in DRAFT status)
    Creator only
    """
    template = await MarketplaceService.get_template_by_id(db, template_id)

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )

    if template.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this template"
        )

    if template.status != TemplateStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only edit templates in DRAFT status"
        )

    # Update fields
    update_data = request.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)

    await db.commit()
    await db.refresh(template)

    return TemplateResponse(**template.to_dict())


@router.post("/templates/{template_id}/submit", response_model=TemplateResponse)
async def submit_template_for_review(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Submit template for admin review
    Creator only
    """
    try:
        template = await MarketplaceService.submit_for_review(
            db,
            template_id,
            current_user.id
        )

        return TemplateResponse(**template.to_dict())

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/my-templates", response_model=List[TemplateResponse])
async def list_my_templates(
    status_filter: Optional[TemplateStatus] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List templates created by current user
    """
    templates = await MarketplaceService.list_creator_templates(
        db,
        current_user.id,
        status=status_filter
    )

    return [TemplateResponse(**t.to_dict()) for t in templates]


@router.get("/my-analytics", response_model=CreatorAnalyticsResponse)
async def get_my_analytics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get analytics for current user's templates
    """
    analytics = await MarketplaceService.get_creator_analytics(
        db,
        current_user.id
    )

    return CreatorAnalyticsResponse(**analytics)


# ==================== Purchase Endpoints ====================

@router.post("/templates/{template_id}/purchase", response_model=PurchaseResponse)
async def purchase_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Purchase a template with credits
    Deducts credits from buyer, distributes to creator (85%) and platform (15%)
    """
    try:
        purchase, credit_split = await MarketplaceService.purchase_template(
            db,
            current_user,
            template_id
        )

        # Get template for response
        template = await MarketplaceService.get_template_by_id(db, template_id)

        # Generate download URL (will be used to download ZIP)
        download_url = f"/api/v1/marketplace/purchases/{purchase.id}/download"

        return PurchaseResponse(
            purchase_id=purchase.id,
            template_id=template_id,
            template_name=template.name,
            price_paid_credits=purchase.price_paid_credits,
            download_url=download_url,
            buyer_balance_after=purchase.buyer_balance_after,
            message=f"Successfully purchased '{template.name}'. You can now download and use this template."
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/purchases/{purchase_id}/download")
async def download_purchased_template(
    purchase_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Download purchased template ZIP file
    Records download in statistics
    """
    purchase = await MarketplaceService.get_purchase_by_id(
        db,
        purchase_id,
        buyer_id=current_user.id
    )

    if not purchase:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Purchase not found"
        )

    # Get template for file URL
    template = await MarketplaceService.get_template_by_id(db, purchase.template_id)

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )

    # Record download
    await MarketplaceService.record_download(db, purchase_id, current_user.id)

    # Return redirect to actual file (R2/S3 URL)
    return {
        "download_url": template.template_file_url,
        "filename": f"{template.slug}-v{template.version}.zip",
        "version": template.version
    }


@router.get("/my-purchases", response_model=List[PurchaseHistoryResponse])
async def list_my_purchases(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List templates purchased by current user
    """
    purchases = await MarketplaceService.list_user_purchases(
        db,
        current_user.id,
        limit=limit,
        offset=offset
    )

    return [PurchaseHistoryResponse(**p.to_dict()) for p in purchases]


# ==================== Admin Endpoints ====================

@router.get("/admin/pending-reviews", response_model=List[TemplateResponse])
async def list_pending_reviews(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    List templates pending admin review
    Admin only
    """
    templates, _ = await MarketplaceService.list_marketplace_templates(
        db,
        limit=100,
        offset=0
    )

    # Filter for pending review (should be done in service but this works)
    from sqlalchemy import select
    query = select(MarketplaceService).where(
        MarketplaceTemplate.status == TemplateStatus.PENDING_REVIEW
    )
    result = await db.execute(query)
    pending = list(result.scalars().all())

    return [TemplateResponse(**t.to_dict()) for t in pending]


@router.post("/admin/templates/{template_id}/review", response_model=TemplateResponse)
async def review_template(
    template_id: str,
    request: ReviewTemplateRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Approve or reject template
    Admin only
    """
    try:
        if request.approve:
            template = await MarketplaceService.approve_template(
                db,
                template_id,
                current_user,
                review_notes=request.notes
            )
        else:
            if not request.rejection_reason:
                raise ValueError("Rejection reason is required")

            template = await MarketplaceService.reject_template(
                db,
                template_id,
                current_user,
                rejection_reason=request.rejection_reason
            )

        return TemplateResponse(**template.to_dict())

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.patch("/admin/templates/{template_id}/feature", response_model=TemplateResponse)
async def toggle_featured(
    template_id: str,
    featured: bool,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Toggle template featured status
    Admin only
    """
    template = await MarketplaceService.get_template_by_id(db, template_id)

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )

    template.is_featured = featured
    await db.commit()
    await db.refresh(template)

    logger.info(
        "template_featured_toggled",
        template_id=template_id,
        featured=featured,
        admin_id=current_user.id
    )

    return TemplateResponse(**template.to_dict())
