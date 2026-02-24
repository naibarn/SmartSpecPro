"""
Test Configuration and Fixtures
Shared fixtures for all tests

IMPORTANT: SQLite in-memory databases require StaticPool to share the same
connection across all operations. Using NullPool will cause each operation
to create a new database, losing all tables and data.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock
from typing import AsyncGenerator, Generator

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

# Import Base first
from app.core.database import Base, get_db

# Import only models without JSONB (for SQLite compatibility in tests)
from app.models.user import User
from app.models.tenant import Tenant
from app.models.workflow import Workflow
from app.models.workflow_schedule import WorkflowSchedule
from app.models.workflow_event_subscription import WorkflowEventSubscription
from app.models.api_key import APIKey, APIKeyUsage
from app.models.oauth import OAuthConnection
from app.models.password_reset import PasswordResetToken
from app.models.support_ticket import SupportTicket, TicketMessage
from app.models.execution import ExecutionModel, CheckpointModel, ExecutionStatus

# Skip importing models with JSONB for SQLite compatibility:
# - credit, credits (JSONB columns)
# - webhook, user_preferences (JSONB columns)
# - audit_log, payment, refund (may have JSONB)

from app.main import app
from app.core.config import settings
from app.core.auth import create_access_token, get_password_hash


# Test database URL - using in-memory SQLite for fast tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an instance of the default event loop for each test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def test_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Create a fresh test database for each test function.
    
    Uses StaticPool to ensure all operations share the same connection,
    which is required for SQLite in-memory databases.
    """
    engine = create_async_engine(
        TEST_DATABASE_URL,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Create session factory
    async_session = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    # Yield session for test
    async with async_session() as session:
        yield session

    # Cleanup: drop all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture
async def db_session(test_db: AsyncSession) -> AsyncSession:
    """Alias for test_db fixture for compatibility."""
    return test_db


@pytest.fixture(scope="function")
def client(test_db: AsyncSession) -> TestClient:
    """Create a test client with the test database."""
    
    async def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db

    # Use FastAPI's TestClient which handles async properly
    test_client = TestClient(app)
    yield test_client
    test_client.close()

    app.dependency_overrides.clear()


@pytest.fixture
async def test_tenant(test_db: AsyncSession):
    """Create a test tenant."""
    from app.models.tenant import Tenant
    import uuid

    tenant = Tenant(
        id=str(uuid.uuid4()),
        name="Test Tenant",
        slug="test-tenant",
        status="active",
        plan="professional",
    )
    test_db.add(tenant)
    await test_db.commit()
    await test_db.refresh(tenant)
    return tenant


@pytest.fixture
async def other_tenant(test_db: AsyncSession):
    """Create another test tenant for isolation testing."""
    from app.models.tenant import Tenant
    import uuid

    tenant = Tenant(
        id=str(uuid.uuid4()),
        name="Other Tenant",
        slug="other-tenant",
        status="active",
        plan="free",
    )
    test_db.add(tenant)
    await test_db.commit()
    await test_db.refresh(tenant)
    return tenant


@pytest.fixture
async def test_user(test_db: AsyncSession, test_tenant) -> User:
    """Create a test user for authentication tests."""
    user = User(
        email="test@example.com",
        password_hash=get_password_hash("testpassword123"),  # Match test expectation
        full_name="Test User",
        credits_balance=100000,
        is_active=True,
        email_verified=True,
        currentTenantId=test_tenant.id,
    )

    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)

    return user


@pytest.fixture
def test_user_token(test_user: User) -> str:
    """Create an access token for the test user."""
    return create_access_token(data={"user_id": str(test_user.id), "email": test_user.email})


@pytest.fixture
def auth_headers(test_user_token: str) -> dict:
    """Create authorization headers with the test user's token."""
    return {"Authorization": f"Bearer {test_user_token}"}


class MockRedisPipeline:
    """A mock Redis pipeline that supports async context manager and shares state with parent."""
    
    def __init__(self, parent_data: dict, parent_ttls: dict):
        self._parent_data = parent_data
        self._parent_ttls = parent_ttls
        self._commands = []
    
    def get(self, key):
        self._commands.append(("get", key))
        return self
    
    def incr(self, key):
        self._commands.append(("incr", key))
        return self
    
    def expire(self, key, seconds):
        self._commands.append(("expire", key, seconds))
        return self
    
    async def execute(self):
        results = []
        for cmd in self._commands:
            if cmd[0] == "get":
                key = cmd[1]
                value = self._parent_data.get(key)
                results.append(str(value) if value is not None else None)
            elif cmd[0] == "incr":
                key = cmd[1]
                if key not in self._parent_data:
                    self._parent_data[key] = 0
                self._parent_data[key] += 1
                results.append(self._parent_data[key])
            elif cmd[0] == "expire":
                key, seconds = cmd[1], cmd[2]
                self._parent_ttls[key] = seconds
                results.append(True)
        self._commands = []
        return results
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


class MockRedisClient:
    """A mock Redis client that properly supports async operations and maintains state."""
    
    def __init__(self):
        self._data = {}
        self._ttls = {}
    
    async def get(self, key):
        value = self._data.get(key)
        return str(value) if value is not None else None
    
    async def set(self, key, value, ex=None):
        self._data[key] = value
        if ex:
            self._ttls[key] = ex
        return True
    
    async def incr(self, key):
        if key not in self._data:
            self._data[key] = 0
        self._data[key] += 1
        return self._data[key]
    
    async def expire(self, key, seconds):
        self._ttls[key] = seconds
        return True
    
    async def ttl(self, key):
        return self._ttls.get(key, 60)
    
    def pipeline(self):
        return MockRedisPipeline(self._data, self._ttls)


@pytest.fixture
def mock_redis(monkeypatch):
    """Mock Redis client for tests that don't need actual Redis."""
    mock_client = MockRedisClient()
    
    def from_url(*args, **kwargs):
        return mock_client
    
    monkeypatch.setattr("redis.asyncio.from_url", from_url)
    return mock_client


@pytest.fixture
def mock_stripe(monkeypatch):
    """Mock Stripe API for payment tests."""
    
    class MockCheckoutSession:
        id = "cs_test_123456"
        url = "https://checkout.stripe.com/test"
    
    class MockCheckout:
        class Session:
            @staticmethod
            def create(**kwargs):
                return MockCheckoutSession()
            
            @staticmethod
            def retrieve(session_id):
                return {
                    "id": session_id,
                    "payment_status": "paid",
                    "payment_intent": "pi_test_123456",
                    "amount_total": 10000,  # $100.00 in cents
                    "metadata": {"user_id": "test_user_id"}
                }
    
    class MockStripe:
        checkout = MockCheckout()
    
    # Patch stripe module
    import stripe
    monkeypatch.setattr(stripe.checkout.Session, "create", MockCheckout.Session.create)
    monkeypatch.setattr(stripe.checkout.Session, "retrieve", MockCheckout.Session.retrieve)
    
    return MockStripe()


# ---------------------------------------------------------------------------
# Presentation Export Fixtures (Section 15)
# ---------------------------------------------------------------------------

@pytest.fixture
def three_slide_render_spec():
    """Minimal 3-slide render spec for presentation render task tests."""
    return {
        "schemaVersion": "presentation_render_v1",
        "deckId": 42,
        "tenantId": "tenant-test",
        "format": "png",
        "quality": "standard",
        "width": 1920,
        "height": 1080,
        "fps": 30,
        "slides": [
            {
                "slideId": 1,
                "orderIndex": 0,
                "durationMs": 3000,
                "transition": "cut",
                "elements": [],
                "audioTrack": None,
            },
            {
                "slideId": 2,
                "orderIndex": 1,
                "durationMs": 4000,
                "transition": "fade",
                "elements": [],
                "audioTrack": None,
            },
            {
                "slideId": 3,
                "orderIndex": 2,
                "durationMs": 2500,
                "transition": "cut",
                "elements": [],
                "audioTrack": None,
            },
        ],
        "projectAudioTrack": None,
    }


@pytest.fixture
def three_slide_render_spec_with_audio(three_slide_render_spec):
    """3-slide render spec with per-slide and project audio configured."""
    spec = dict(three_slide_render_spec)
    spec["slides"] = [dict(s) for s in spec["slides"]]
    spec["slides"][0]["audioTrack"] = {
        "url": "https://cdn.example.com/audio/slide1.mp3",
        "volume": 0.8,
        "startAtMs": 0,
        "endAtMs": None,
    }
    spec["projectAudioTrack"] = {
        "url": "https://cdn.example.com/audio/background.mp3",
        "volume": 0.4,
        "loop": True,
        "fadeOutMs": 1000,
    }
    return spec


@pytest.fixture
def white_png_1920x1080():
    """1920x1080 white PNG bytes — used as a mock Playwright screenshot."""
    from PIL import Image
    import io
    img = Image.new("RGB", (1920, 1080), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
