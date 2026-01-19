"""
Marketplace Service
Handles template marketplace operations, purchases, and revenue distribution
"""

from typing import Optional, List, Dict, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, desc
from sqlalchemy.exc import IntegrityError
from datetime import datetime
import structlog

from app.models.marketplace_template import (
    MarketplaceTemplate,
    TemplatePurchase,
    TemplateReview,
    TemplateRevenueLedger,
    TemplateStatus,
    TemplateCategory,
)
from app.models.user import User
from app.models.credit import CreditTransaction

logger = structlog.get_logger()

# Revenue split configuration
CREATOR_REVENUE_PERCENTAGE = 85  # Creator gets 85%
PLATFORM_COMMISSION_PERCENTAGE = 15  # Platform gets 15%


class MarketplaceService:
    """Service for marketplace template operations"""

    @staticmethod
    async def create_template(
        db: AsyncSession,
        creator: User,
        name: str,
        slug: str,
        tagline: str,
        description: str,
        category: TemplateCategory,
        price_credits: int,
        tech_stack: List[str],
        template_file_url: str,
        **optional_fields
    ) -> MarketplaceTemplate:
        """
        Create a new template (starts in DRAFT status)
        """
        # Validate slug uniqueness
        existing = await db.execute(
            select(MarketplaceTemplate).where(MarketplaceTemplate.slug == slug)
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"Slug '{slug}' already exists")

        # Validate price
        if price_credits < 0:
            raise ValueError("Price must be non-negative")

        template = MarketplaceTemplate(
            creator_id=creator.id,
            name=name,
            slug=slug,
            tagline=tagline,
            description=description,
            category=category,
            price_credits=price_credits,
            tech_stack=tech_stack,
            template_file_url=template_file_url,
            status=TemplateStatus.DRAFT,
            **optional_fields
        )

        db.add(template)
        await db.commit()
        await db.refresh(template)

        logger.info(
            "template_created",
            template_id=template.id,
            creator_id=creator.id,
            name=name,
            price=price_credits
        )

        return template

    @staticmethod
    async def submit_for_review(
        db: AsyncSession,
        template_id: str,
        creator_id: str
    ) -> MarketplaceTemplate:
        """
        Submit template for admin review
        """
        query = select(MarketplaceTemplate).where(
            and_(
                MarketplaceTemplate.id == template_id,
                MarketplaceTemplate.creator_id == creator_id,
                MarketplaceTemplate.status == TemplateStatus.DRAFT
            )
        )
        result = await db.execute(query)
        template = result.scalar_one_or_none()

        if not template:
            raise ValueError("Template not found or not in draft status")

        template.status = TemplateStatus.PENDING_REVIEW
        template.submitted_at = datetime.utcnow()

        await db.commit()
        await db.refresh(template)

        logger.info(
            "template_submitted_for_review",
            template_id=template_id,
            creator_id=creator_id
        )

        return template

    @staticmethod
    async def approve_template(
        db: AsyncSession,
        template_id: str,
        reviewer: User,
        review_notes: Optional[str] = None
    ) -> MarketplaceTemplate:
        """
        Admin approves template (makes it visible in marketplace)
        """
        query = select(MarketplaceTemplate).where(
            and_(
                MarketplaceTemplate.id == template_id,
                MarketplaceTemplate.status == TemplateStatus.PENDING_REVIEW
            )
        )
        result = await db.execute(query)
        template = result.scalar_one_or_none()

        if not template:
            raise ValueError("Template not found or not pending review")

        template.status = TemplateStatus.APPROVED
        template.reviewed_at = datetime.utcnow()
        template.reviewed_by = reviewer.id
        template.review_notes = review_notes
        template.published_at = datetime.utcnow()

        await db.commit()
        await db.refresh(template)

        logger.info(
            "template_approved",
            template_id=template_id,
            reviewer_id=reviewer.id
        )

        return template

    @staticmethod
    async def reject_template(
        db: AsyncSession,
        template_id: str,
        reviewer: User,
        rejection_reason: str
    ) -> MarketplaceTemplate:
        """
        Admin rejects template
        """
        query = select(MarketplaceTemplate).where(
            and_(
                MarketplaceTemplate.id == template_id,
                MarketplaceTemplate.status == TemplateStatus.PENDING_REVIEW
            )
        )
        result = await db.execute(query)
        template = result.scalar_one_or_none()

        if not template:
            raise ValueError("Template not found or not pending review")

        template.status = TemplateStatus.REJECTED
        template.reviewed_at = datetime.utcnow()
        template.reviewed_by = reviewer.id
        template.rejection_reason = rejection_reason

        await db.commit()
        await db.refresh(template)

        logger.info(
            "template_rejected",
            template_id=template_id,
            reviewer_id=reviewer.id,
            reason=rejection_reason
        )

        return template

    @staticmethod
    async def list_marketplace_templates(
        db: AsyncSession,
        category: Optional[TemplateCategory] = None,
        tech_stack: Optional[str] = None,
        min_price: Optional[int] = None,
        max_price: Optional[int] = None,
        search_query: Optional[str] = None,
        sort_by: str = "popular",  # popular, recent, price_low, price_high, rating
        limit: int = 20,
        offset: int = 0
    ) -> Tuple[List[MarketplaceTemplate], int]:
        """
        List approved templates in marketplace with filters and sorting
        """
        query = select(MarketplaceTemplate).where(
            MarketplaceTemplate.status == TemplateStatus.APPROVED
        )

        # Apply filters
        if category:
            query = query.where(MarketplaceTemplate.category == category)

        if tech_stack:
            query = query.where(
                MarketplaceTemplate.tech_stack.contains([tech_stack])
            )

        if min_price is not None:
            query = query.where(MarketplaceTemplate.price_credits >= min_price)

        if max_price is not None:
            query = query.where(MarketplaceTemplate.price_credits <= max_price)

        if search_query:
            search_pattern = f"%{search_query}%"
            query = query.where(
                or_(
                    MarketplaceTemplate.name.ilike(search_pattern),
                    MarketplaceTemplate.tagline.ilike(search_pattern),
                    MarketplaceTemplate.description.ilike(search_pattern)
                )
            )

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        count_result = await db.execute(count_query)
        total = count_result.scalar()

        # Apply sorting
        if sort_by == "popular":
            query = query.order_by(desc(MarketplaceTemplate.purchase_count))
        elif sort_by == "recent":
            query = query.order_by(desc(MarketplaceTemplate.published_at))
        elif sort_by == "price_low":
            query = query.order_by(MarketplaceTemplate.price_credits)
        elif sort_by == "price_high":
            query = query.order_by(desc(MarketplaceTemplate.price_credits))
        elif sort_by == "rating":
            query = query.order_by(desc(MarketplaceTemplate.rating_average))

        # Apply pagination
        query = query.limit(limit).offset(offset)

        result = await db.execute(query)
        templates = list(result.scalars().all())

        return templates, total

    @staticmethod
    async def get_template_by_id(
        db: AsyncSession,
        template_id: str,
        increment_view: bool = False
    ) -> Optional[MarketplaceTemplate]:
        """
        Get template by ID
        Optionally increment view count
        """
        query = select(MarketplaceTemplate).where(
            MarketplaceTemplate.id == template_id
        )
        result = await db.execute(query)
        template = result.scalar_one_or_none()

        if template and increment_view:
            template.view_count += 1
            await db.commit()
            await db.refresh(template)

        return template

    @staticmethod
    async def has_user_purchased(
        db: AsyncSession,
        user_id: str,
        template_id: str
    ) -> bool:
        """
        Check if user has already purchased this template
        """
        query = select(TemplatePurchase).where(
            and_(
                TemplatePurchase.buyer_id == user_id,
                TemplatePurchase.template_id == template_id
            )
        )
        result = await db.execute(query)
        purchase = result.scalar_one_or_none()
        return purchase is not None

    @staticmethod
    async def purchase_template(
        db: AsyncSession,
        buyer: User,
        template_id: str
    ) -> Tuple[TemplatePurchase, Dict[str, int]]:
        """
        Purchase template with credits
        Returns purchase record and credit distribution

        Credit Flow:
        1. Deduct 100% from buyer
        2. Add 85% to creator
        3. Add 15% to platform
        """
        # Get template
        template = await MarketplaceService.get_template_by_id(db, template_id)
        if not template:
            raise ValueError("Template not found")

        if template.status != TemplateStatus.APPROVED:
            raise ValueError("Template is not available for purchase")

        # Check if already purchased
        if await MarketplaceService.has_user_purchased(db, buyer.id, template_id):
            raise ValueError("You have already purchased this template")

        # CRITICAL FIX: Lock buyer row to prevent race conditions
        # Re-fetch buyer with row lock to ensure exclusive access
        buyer_lock_query = select(User).where(User.id == buyer.id).with_for_update()
        buyer_lock_result = await db.execute(buyer_lock_query)
        buyer = buyer_lock_result.scalar_one()

        # Check buyer has enough credits (after locking)
        if buyer.credits_balance < template.price_credits:
            raise ValueError(
                f"Insufficient credits. Need {template.price_credits}, have {buyer.credits_balance}"
            )

        # Calculate revenue split
        total_credits = template.price_credits
        creator_revenue = int(total_credits * CREATOR_REVENUE_PERCENTAGE / 100)
        platform_commission = total_credits - creator_revenue  # Ensure no rounding loss

        # Verify split integrity
        assert (creator_revenue + platform_commission) == total_credits, "Revenue split calculation error"

        # CRITICAL FIX: Get creator with row lock
        creator_query = select(User).where(User.id == template.creator_id).with_for_update()
        creator_result = await db.execute(creator_query)
        creator = creator_result.scalar_one()

        # CRITICAL FIX: Lock template for statistics update
        template_lock_query = select(MarketplaceTemplate).where(
            MarketplaceTemplate.id == template_id
        ).with_for_update()
        template_lock_result = await db.execute(template_lock_query)
        template = template_lock_result.scalar_one()

        # Record balances before transaction
        buyer_balance_before = buyer.credits_balance
        creator_balance_before = creator.credits_balance

        # Execute credit transfers
        # 1. Deduct from buyer
        buyer.credits_balance -= total_credits

        # 2. Add to creator
        creator.credits_balance += creator_revenue

        # 3. Platform commission (tracked but not added to any user)
        # Platform earnings are tracked separately

        # Create purchase record
        purchase = TemplatePurchase(
            template_id=template_id,
            buyer_id=buyer.id,
            price_paid_credits=total_credits,
            creator_revenue=creator_revenue,
            platform_commission=platform_commission,
            buyer_balance_before=buyer_balance_before,
            buyer_balance_after=buyer.credits_balance,
            template_version=template.version
        )
        db.add(purchase)

        # Create credit transactions for audit trail
        # Buyer transaction (debit)
        buyer_tx = CreditTransaction(
            user_id=buyer.id,
            amount=-total_credits,
            balance_before=buyer_balance_before,
            balance_after=buyer.credits_balance,
            transaction_type="template_purchase",
            description=f"Purchased template: {template.name}",
            metadata={"template_id": template_id, "purchase_id": purchase.id}
        )
        db.add(buyer_tx)

        # Creator transaction (credit)
        creator_tx = CreditTransaction(
            user_id=creator.id,
            amount=creator_revenue,
            balance_before=creator_balance_before,
            balance_after=creator.credits_balance,
            transaction_type="template_sale",
            description=f"Sale of template: {template.name}",
            metadata={"template_id": template_id, "purchase_id": purchase.id, "buyer_id": buyer.id}
        )
        db.add(creator_tx)

        # Create ledger entry for transparency
        ledger = TemplateRevenueLedger(
            purchase_id=purchase.id,
            template_id=template_id,
            buyer_id=buyer.id,
            creator_id=creator.id,
            total_credits=total_credits,
            creator_credits=creator_revenue,
            platform_credits=platform_commission
        )
        db.add(ledger)

        # Update template statistics
        template.purchase_count += 1
        template.total_revenue_credits += creator_revenue
        template.platform_commission_credits += platform_commission

        # Commit with IntegrityError handling for duplicate purchases
        try:
            await db.commit()
        except IntegrityError as e:
            await db.rollback()
            logger.warning(
                "duplicate_purchase_prevented",
                template_id=template_id,
                buyer_id=buyer.id,
                error=str(e)
            )
            raise ValueError("You have already purchased this template")

        await db.refresh(purchase)
        await db.refresh(template)
        await db.refresh(buyer)
        await db.refresh(creator)

        logger.info(
            "template_purchased",
            template_id=template_id,
            buyer_id=buyer.id,
            creator_id=creator.id,
            price=total_credits,
            creator_revenue=creator_revenue,
            platform_commission=platform_commission
        )

        return purchase, {
            "total": total_credits,
            "creator": creator_revenue,
            "platform": platform_commission
        }

    @staticmethod
    async def get_purchase_by_id(
        db: AsyncSession,
        purchase_id: str,
        buyer_id: Optional[str] = None
    ) -> Optional[TemplatePurchase]:
        """
        Get purchase record
        If buyer_id provided, verify ownership
        """
        query = select(TemplatePurchase).where(TemplatePurchase.id == purchase_id)

        if buyer_id:
            query = query.where(TemplatePurchase.buyer_id == buyer_id)

        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def record_download(
        db: AsyncSession,
        purchase_id: str,
        buyer_id: str
    ) -> TemplatePurchase:
        """
        Record template download (increment counter)
        """
        purchase = await MarketplaceService.get_purchase_by_id(db, purchase_id, buyer_id)

        if not purchase:
            raise ValueError("Purchase not found")

        purchase.download_count += 1
        purchase.last_downloaded_at = datetime.utcnow()

        # Also increment template download count
        template = await MarketplaceService.get_template_by_id(db, purchase.template_id)
        if template:
            template.download_count += 1

        await db.commit()
        await db.refresh(purchase)

        return purchase

    @staticmethod
    async def list_user_purchases(
        db: AsyncSession,
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[TemplatePurchase]:
        """
        List all templates purchased by user
        """
        query = select(TemplatePurchase).where(
            TemplatePurchase.buyer_id == user_id
        ).order_by(desc(TemplatePurchase.purchased_at)).limit(limit).offset(offset)

        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def list_creator_templates(
        db: AsyncSession,
        creator_id: str,
        status: Optional[TemplateStatus] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[MarketplaceTemplate]:
        """
        List templates created by user
        """
        query = select(MarketplaceTemplate).where(
            MarketplaceTemplate.creator_id == creator_id
        )

        if status:
            query = query.where(MarketplaceTemplate.status == status)

        query = query.order_by(desc(MarketplaceTemplate.created_at)).limit(limit).offset(offset)

        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_creator_analytics(
        db: AsyncSession,
        creator_id: str
    ) -> Dict:
        """
        Get analytics for template creator
        """
        # Total templates
        total_query = select(func.count()).select_from(MarketplaceTemplate).where(
            MarketplaceTemplate.creator_id == creator_id
        )
        total_result = await db.execute(total_query)
        total_templates = total_result.scalar()

        # Approved templates
        approved_query = select(func.count()).select_from(MarketplaceTemplate).where(
            and_(
                MarketplaceTemplate.creator_id == creator_id,
                MarketplaceTemplate.status == TemplateStatus.APPROVED
            )
        )
        approved_result = await db.execute(approved_query)
        approved_templates = approved_result.scalar()

        # Total revenue
        revenue_query = select(func.sum(MarketplaceTemplate.total_revenue_credits)).where(
            MarketplaceTemplate.creator_id == creator_id
        )
        revenue_result = await db.execute(revenue_query)
        total_revenue = revenue_result.scalar() or 0

        # Total purchases
        purchase_query = select(func.sum(MarketplaceTemplate.purchase_count)).where(
            MarketplaceTemplate.creator_id == creator_id
        )
        purchase_result = await db.execute(purchase_query)
        total_purchases = purchase_result.scalar() or 0

        return {
            "total_templates": total_templates,
            "approved_templates": approved_templates,
            "total_revenue_credits": total_revenue,
            "total_purchases": total_purchases,
            "creator_share_percentage": CREATOR_REVENUE_PERCENTAGE,
        }
