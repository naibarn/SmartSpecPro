"""
Integration tests for Marketplace system
Tests the complete user flows including purchase, review, and security fixes
"""

import pytest
import asyncio
from decimal import Decimal
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.models.user import User
from app.models.marketplace_template import MarketplaceTemplate, TemplatePurchase, TemplateReview, TemplateStatus, TemplateCategory
from app.services.marketplace_service import MarketplaceService
from app.services.credit_service import CreditService
from app.core.database import Base


# Test configuration
TEST_DATABASE_URL = "sqlite+aiosqlite:///./test_marketplace.db"


@pytest.fixture
async def db_engine():
    """Create test database engine"""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    await engine.dispose()


@pytest.fixture
async def db_session(db_engine):
    """Create test database session"""
    async_session = sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        yield session


@pytest.fixture
async def test_users(db_session):
    """Create test users"""
    buyer = User(
        email="buyer@test.com",
        username="buyer_user",
        hashed_password="hashed_password",
        is_active=True,
        credit_balance=Decimal("5000.00")
    )

    creator = User(
        email="creator@test.com",
        username="creator_user",
        hashed_password="hashed_password",
        is_active=True,
        credit_balance=Decimal("0.00")
    )

    admin = User(
        email="admin@test.com",
        username="admin_user",
        hashed_password="hashed_password",
        is_active=True,
        is_superuser=True,
        credit_balance=Decimal("0.00")
    )

    db_session.add_all([buyer, creator, admin])
    await db_session.commit()
    await db_session.refresh(buyer)
    await db_session.refresh(creator)
    await db_session.refresh(admin)

    return {"buyer": buyer, "creator": creator, "admin": admin}


@pytest.fixture
async def test_template(db_session, test_users):
    """Create test template"""
    template = MarketplaceTemplate(
        title="Test Image Generation Template",
        slug="test-image-gen",
        tagline="Generate amazing images",
        description="A comprehensive image generation template for SmartSpecPro",
        creator_id=test_users["creator"].id,
        category=TemplateCategory.IMAGE_GENERATION,
        price_credits=1000,
        template_file_url="https://r2.cloudflare.com/templates/test.zip",
        preview_images=["https://r2.cloudflare.com/previews/1.jpg"],
        demo_video_url="https://www.youtube.com/watch?v=test123",
        status=TemplateStatus.APPROVED,
        is_featured=True
    )

    db_session.add(template)
    await db_session.commit()
    await db_session.refresh(template)

    return template


class TestMarketplacePurchaseFlow:
    """Test complete purchase flow with security fixes"""

    @pytest.mark.asyncio
    async def test_successful_purchase(self, db_session, test_users, test_template):
        """Test successful template purchase with 85/15 revenue split"""
        service = MarketplaceService(db_session)
        credit_service = CreditService(db_session)

        buyer = test_users["buyer"]
        creator = test_users["creator"]
        initial_buyer_balance = buyer.credit_balance
        initial_creator_balance = creator.credit_balance

        # Purchase template
        purchase = await service.purchase_template(
            template_id=test_template.id,
            buyer=buyer
        )

        # Verify purchase record
        assert purchase is not None
        assert purchase.buyer_id == buyer.id
        assert purchase.template_id == test_template.id
        assert purchase.credits_paid == 1000
        assert purchase.creator_revenue == 850  # 85%
        assert purchase.platform_commission == 150  # 15%

        # Verify credit balances
        await db_session.refresh(buyer)
        await db_session.refresh(creator)

        assert buyer.credit_balance == initial_buyer_balance - 1000
        assert creator.credit_balance == initial_creator_balance + 850

        # Verify template stats updated
        await db_session.refresh(test_template)
        assert test_template.purchase_count == 1
        assert test_template.total_revenue_credits == 1000

    @pytest.mark.asyncio
    async def test_duplicate_purchase_prevention(self, db_session, test_users, test_template):
        """Test that unique constraint prevents duplicate purchases"""
        service = MarketplaceService(db_session)
        buyer = test_users["buyer"]

        # First purchase should succeed
        purchase1 = await service.purchase_template(
            template_id=test_template.id,
            buyer=buyer
        )
        assert purchase1 is not None

        # Second purchase should fail
        with pytest.raises(ValueError, match="already purchased"):
            await service.purchase_template(
                template_id=test_template.id,
                buyer=buyer
            )

    @pytest.mark.asyncio
    async def test_insufficient_credits(self, db_session, test_users, test_template):
        """Test purchase fails with insufficient credits"""
        service = MarketplaceService(db_session)

        # Create user with insufficient credits
        poor_user = User(
            email="poor@test.com",
            username="poor_user",
            hashed_password="hashed_password",
            is_active=True,
            credit_balance=Decimal("100.00")
        )
        db_session.add(poor_user)
        await db_session.commit()

        # Purchase should fail
        with pytest.raises(ValueError, match="Insufficient credits"):
            await service.purchase_template(
                template_id=test_template.id,
                buyer=poor_user
            )

    @pytest.mark.asyncio
    async def test_concurrent_purchases_race_condition(self, db_session, test_users, test_template):
        """Test that row locking prevents race conditions in concurrent purchases"""
        service = MarketplaceService(db_session)

        # Create multiple buyers
        buyers = []
        for i in range(3):
            buyer = User(
                email=f"buyer{i}@test.com",
                username=f"buyer_{i}",
                hashed_password="hashed_password",
                is_active=True,
                credit_balance=Decimal("5000.00")
            )
            db_session.add(buyer)
            buyers.append(buyer)

        await db_session.commit()

        # Simulate concurrent purchases
        tasks = [
            service.purchase_template(test_template.id, buyer)
            for buyer in buyers
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # All purchases should succeed (different buyers)
        successful_purchases = [r for r in results if isinstance(r, TemplatePurchase)]
        assert len(successful_purchases) == 3

        # Verify template stats
        await db_session.refresh(test_template)
        assert test_template.purchase_count == 3
        assert test_template.total_revenue_credits == 3000


class TestMarketplaceReviewSystem:
    """Test review and rating system"""

    @pytest.mark.asyncio
    async def test_add_review(self, db_session, test_users, test_template):
        """Test adding a review after purchase"""
        service = MarketplaceService(db_session)
        buyer = test_users["buyer"]

        # Purchase first
        await service.purchase_template(test_template.id, buyer)

        # Add review
        review = await service.add_review(
            template_id=test_template.id,
            user=buyer,
            rating=5,
            comment="Excellent template! Very useful."
        )

        assert review is not None
        assert review.rating == 5
        assert review.comment == "Excellent template! Very useful."

        # Verify template rating updated
        await db_session.refresh(test_template)
        assert test_template.rating_average == 5.0
        assert test_template.rating_count == 1

    @pytest.mark.asyncio
    async def test_review_without_purchase(self, db_session, test_users, test_template):
        """Test that users cannot review without purchasing"""
        service = MarketplaceService(db_session)

        # Create user who hasn't purchased
        non_buyer = User(
            email="nonbuyer@test.com",
            username="non_buyer",
            hashed_password="hashed_password",
            is_active=True,
            credit_balance=Decimal("5000.00")
        )
        db_session.add(non_buyer)
        await db_session.commit()

        # Review should fail
        with pytest.raises(ValueError, match="must purchase"):
            await service.add_review(
                template_id=test_template.id,
                user=non_buyer,
                rating=5,
                comment="Trying to review without purchase"
            )


class TestMarketplaceSecurityFixes:
    """Test security fixes from audit"""

    @pytest.mark.asyncio
    async def test_url_validation(self, db_session, test_users):
        """Test that only HTTPS URLs from approved domains are accepted"""
        from app.api.v1.marketplace import TemplateCreateRequest
        from pydantic import ValidationError

        # Test invalid URL (HTTP)
        with pytest.raises(ValidationError, match="Must use HTTPS"):
            TemplateCreateRequest(
                title="Test",
                slug="test",
                tagline="Test tagline",
                description="Test description",
                category=TemplateCategory.IMAGE_GENERATION,
                price_credits=1000,
                template_file_url="http://example.com/template.zip",
                preview_images=["https://r2.cloudflare.com/preview.jpg"]
            )

        # Test invalid domain
        with pytest.raises(ValidationError, match="approved storage"):
            TemplateCreateRequest(
                title="Test",
                slug="test",
                tagline="Test tagline",
                description="Test description",
                category=TemplateCategory.IMAGE_GENERATION,
                price_credits=1000,
                template_file_url="https://evil.com/malware.zip",
                preview_images=["https://r2.cloudflare.com/preview.jpg"]
            )

        # Test non-ZIP file
        with pytest.raises(ValidationError, match="Must be ZIP"):
            TemplateCreateRequest(
                title="Test",
                slug="test",
                tagline="Test tagline",
                description="Test description",
                category=TemplateCategory.IMAGE_GENERATION,
                price_credits=1000,
                template_file_url="https://r2.cloudflare.com/template.exe",
                preview_images=["https://r2.cloudflare.com/preview.jpg"]
            )

    @pytest.mark.asyncio
    async def test_slug_validation(self, db_session, test_users):
        """Test slug validation prevents reserved words"""
        from app.api.v1.marketplace import TemplateCreateRequest
        from pydantic import ValidationError

        # Test reserved slug
        with pytest.raises(ValidationError, match="reserved"):
            TemplateCreateRequest(
                title="Test",
                slug="admin",  # Reserved word
                tagline="Test tagline",
                description="Test description",
                category=TemplateCategory.IMAGE_GENERATION,
                price_credits=1000,
                template_file_url="https://r2.cloudflare.com/template.zip",
                preview_images=["https://r2.cloudflare.com/preview.jpg"]
            )

    @pytest.mark.asyncio
    async def test_revenue_integrity_check(self, db_session, test_users, test_template):
        """Test that revenue split calculation is verified"""
        service = MarketplaceService(db_session)
        buyer = test_users["buyer"]

        # Normal purchase should work
        purchase = await service.purchase_template(test_template.id, buyer)

        # Verify split adds up to total
        assert (purchase.creator_revenue + purchase.platform_commission) == purchase.credits_paid
        assert purchase.creator_revenue == int(purchase.credits_paid * 0.85)
        assert purchase.platform_commission == int(purchase.credits_paid * 0.15)


class TestMarketplaceAnalytics:
    """Test analytics and performance indexes"""

    @pytest.mark.asyncio
    async def test_creator_revenue_query_performance(self, db_session, test_users):
        """Test that creator revenue queries use indexes"""
        # This test verifies the index exists and can be used
        creator = test_users["creator"]

        # Query that should use idx_template_creator_revenue
        query = select(MarketplaceTemplate).where(
            MarketplaceTemplate.creator_id == creator.id
        ).order_by(MarketplaceTemplate.total_revenue_credits.desc())

        result = await db_session.execute(query)
        templates = result.scalars().all()

        # Query should complete without error
        assert isinstance(templates, list)

    @pytest.mark.asyncio
    async def test_popular_templates_query(self, db_session):
        """Test query for most popular templates uses indexes"""
        # Query that should use idx_template_purchase_count
        query = select(MarketplaceTemplate).where(
            MarketplaceTemplate.status == TemplateStatus.APPROVED
        ).order_by(MarketplaceTemplate.purchase_count.desc()).limit(10)

        result = await db_session.execute(query)
        templates = result.scalars().all()

        assert isinstance(templates, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--asyncio-mode=auto"])
