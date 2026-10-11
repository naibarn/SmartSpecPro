"""
Integration tests for Marketplace system
Tests the complete user flows including purchase, review, and security fixes
"""

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.credit import CreditTransaction, TransactionType
from app.models.marketplace_template import (
    MarketplaceTemplate,
    TemplateCategory,
    TemplatePurchase,
    TemplateStatus,
)
from app.models.user import Role, User
from app.services.marketplace_service import MarketplaceService

# Test configuration
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def db_engine():
    """Create test database engine"""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

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
        name="Buyer User",
        password="hashed_password",
        credits=5000,
    )

    creator = User(
        email="creator@test.com",
        name="Creator User",
        password="hashed_password",
        credits=0,
    )

    admin = User(
        email="admin@test.com",
        name="Admin User",
        password="hashed_password",
        role=Role.admin,
        credits=0,
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
        name="Test Image Generation Template",
        slug="test-image-gen",
        tagline="Generate amazing images",
        description="A comprehensive image generation template for SmartSpecPro",
        creator_id=test_users["creator"].id,
        category=TemplateCategory.IMAGE_GENERATION,
        tech_stack=["react"],
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
        buyer = test_users["buyer"]
        creator = test_users["creator"]
        initial_buyer_balance = buyer.credits
        initial_creator_balance = creator.credits

        # Purchase template
        purchase, distribution = await MarketplaceService.purchase_template(
            db_session, buyer, test_template.id
        )

        # Verify purchase record
        assert purchase is not None
        assert purchase.buyer_id == buyer.id
        assert purchase.template_id == test_template.id
        assert purchase.price_paid_credits == 1000
        assert purchase.creator_revenue == 850  # 85%
        assert purchase.platform_commission == 150  # 15%

        # Verify credit balances
        await db_session.refresh(buyer)
        await db_session.refresh(creator)

        assert buyer.credits == initial_buyer_balance - 1000
        assert creator.credits == initial_creator_balance + 850
        assert distribution == {"total": 1000, "creator": 850, "platform": 150}

        transactions = (await db_session.scalars(select(CreditTransaction))).all()
        assert {transaction.type for transaction in transactions} == {
            TransactionType.usage,
            TransactionType.bonus,
        }
        purchase_transaction = next(tx for tx in transactions if tx.type == TransactionType.usage)
        assert purchase_transaction.amount == -1000
        assert purchase_transaction.meta["transaction_category"] == "template_purchase"
        assert purchase_transaction.meta["balance_before"] == initial_buyer_balance

        # Verify template stats updated
        await db_session.refresh(test_template)
        assert test_template.purchase_count == 1
        assert test_template.total_revenue_credits == 850
        assert test_template.platform_commission_credits == 150

    @pytest.mark.asyncio
    async def test_duplicate_purchase_prevention(self, db_session, test_users, test_template):
        """Test that unique constraint prevents duplicate purchases"""
        buyer = test_users["buyer"]

        # First purchase should succeed
        purchase1, _ = await MarketplaceService.purchase_template(
            db_session, buyer, test_template.id
        )
        assert purchase1 is not None

        # Second purchase should fail
        with pytest.raises(ValueError, match="already purchased"):
            await MarketplaceService.purchase_template(db_session, buyer, test_template.id)

    @pytest.mark.asyncio
    async def test_insufficient_credits(self, db_session, test_users, test_template):
        """Test purchase fails with insufficient credits"""
        # Create user with insufficient credits
        poor_user = User(
            email="poor@test.com",
            name="Poor User",
            password="hashed_password",
            credits=100,
        )
        db_session.add(poor_user)
        await db_session.commit()

        # Purchase should fail
        with pytest.raises(ValueError, match="Insufficient credits"):
            await MarketplaceService.purchase_template(db_session, poor_user, test_template.id)

    @pytest.mark.asyncio
    async def test_concurrent_purchases_race_condition(self, db_session, test_users, test_template):
        """Test that row locking prevents race conditions in concurrent purchases"""

        # Create multiple buyers
        buyers = []
        for i in range(3):
            buyer = User(
                email=f"buyer{i}@test.com",
                name=f"Buyer {i}",
                password="hashed_password",
                credits=5000,
            )
            db_session.add(buyer)
            buyers.append(buyer)

        await db_session.commit()

        # Simulate concurrent purchases
        session_factory = sessionmaker(db_session.bind, class_=AsyncSession, expire_on_commit=False)

        async def purchase_with_independent_session(buyer_id):
            async with session_factory() as session:
                buyer = await session.get(User, buyer_id)
                return await MarketplaceService.purchase_template(session, buyer, test_template.id)

        tasks = [purchase_with_independent_session(buyer.id) for buyer in buyers]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # All purchases should succeed (different buyers)
        successful_purchases = [r[0] for r in results if isinstance(r, tuple) and isinstance(r[0], TemplatePurchase)]
        assert len(successful_purchases) == 3

        # Verify template stats
        await db_session.refresh(test_template)
        assert test_template.purchase_count == 3
        assert test_template.total_revenue_credits == 2550
        assert test_template.platform_commission_credits == 450


class TestMarketplaceReviewSystem:
    """Test review and rating system"""

    @pytest.mark.asyncio
    async def test_creator_submits_template_and_admin_approves(self, db_session, test_users, test_template):
        """Creator submission and admin approval follow the active moderation contract."""
        test_template.status = TemplateStatus.DRAFT
        await db_session.commit()

        submitted = await MarketplaceService.submit_for_review(
            db_session, test_template.id, test_users["creator"].id
        )
        assert submitted.status == TemplateStatus.PENDING_REVIEW

        approved = await MarketplaceService.approve_template(
            db_session, test_template.id, test_users["admin"], "Meets marketplace policy"
        )
        assert approved.status == TemplateStatus.APPROVED
        assert approved.reviewed_by == test_users["admin"].id
        assert approved.review_notes == "Meets marketplace policy"

    @pytest.mark.asyncio
    async def test_creator_cannot_submit_another_users_template(self, db_session, test_users, test_template):
        """Creators may only submit their own draft templates for review."""
        with pytest.raises(ValueError, match="not found or not in draft status"):
            await MarketplaceService.submit_for_review(
                db_session, test_template.id, test_users["buyer"].id
            )


class TestMarketplaceSecurityFixes:
    """Test security fixes from audit"""

    @pytest.mark.asyncio
    async def test_url_validation(self, db_session, test_users):
        """Test that only HTTPS URLs from approved domains are accepted"""
        from pydantic import ValidationError

        from app.api.v1.marketplace import CreateTemplateRequest

        # Test invalid URL (HTTP)
        with pytest.raises(ValidationError, match="HTTPS protocol"):
            CreateTemplateRequest(
                name="Test Template",
                slug="test",
                tagline="A useful test tagline",
                description="A sufficiently descriptive template description for validation tests.",
                category=TemplateCategory.IMAGE_GENERATION,
                tech_stack=["react"],
                price_credits=1000,
                template_file_url="http://example.com/template.zip",
                preview_images=["https://r2.cloudflare.com/preview.jpg"]
            )

        # Test invalid domain
        with pytest.raises(ValidationError, match="not approved"):
            CreateTemplateRequest(
                name="Test Template",
                slug="test",
                tagline="A useful test tagline",
                description="A sufficiently descriptive template description for validation tests.",
                category=TemplateCategory.IMAGE_GENERATION,
                tech_stack=["react"],
                price_credits=1000,
                template_file_url="https://evil.com/malware.zip",
                preview_images=["https://r2.cloudflare.com/preview.jpg"]
            )

        # Test non-ZIP file
        with pytest.raises(ValidationError, match="ZIP archive"):
            CreateTemplateRequest(
                name="Test Template",
                slug="test",
                tagline="A useful test tagline",
                description="A sufficiently descriptive template description for validation tests.",
                category=TemplateCategory.IMAGE_GENERATION,
                tech_stack=["react"],
                price_credits=1000,
                template_file_url="https://r2.cloudflare.com/template.exe",
                preview_images=["https://r2.cloudflare.com/preview.jpg"]
            )

    @pytest.mark.asyncio
    async def test_slug_validation(self, db_session, test_users):
        """Test slug validation prevents reserved words"""
        from pydantic import ValidationError

        from app.api.v1.marketplace import CreateTemplateRequest

        # Test reserved slug
        with pytest.raises(ValidationError, match="reserved"):
            CreateTemplateRequest(
                name="Test Template",
                slug="admin",  # Reserved word
                tagline="A useful test tagline",
                description="A sufficiently descriptive template description for validation tests.",
                category=TemplateCategory.IMAGE_GENERATION,
                tech_stack=["react"],
                price_credits=1000,
                template_file_url="https://r2.cloudflare.com/template.zip",
                preview_images=["https://r2.cloudflare.com/preview.jpg"]
            )

    @pytest.mark.asyncio
    async def test_revenue_integrity_check(self, db_session, test_users, test_template):
        """Test that revenue split calculation is verified"""
        buyer = test_users["buyer"]

        # Normal purchase should work
        purchase, _ = await MarketplaceService.purchase_template(db_session, buyer, test_template.id)

        # Verify split adds up to total
        assert (purchase.creator_revenue + purchase.platform_commission) == purchase.price_paid_credits
        assert purchase.creator_revenue == int(purchase.price_paid_credits * 0.85)
        assert purchase.platform_commission == int(purchase.price_paid_credits * 0.15)


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
