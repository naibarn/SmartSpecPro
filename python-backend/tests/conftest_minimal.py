"""
Minimal Test Configuration for Service Tests
Avoids loading the full FastAPI app and complex dependencies
"""

import pytest
import asyncio
import uuid
from typing import AsyncGenerator, Generator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

# Import Base first
from app.core.database import Base

# Import only the models we need
from app.models.user import User
from app.models.custom_skill_prompt import CustomSkillPrompt, SkillPromptTemplate
from app.models.media_task import MediaTask

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
async def test_user(test_db: AsyncSession) -> User:
    """Create a test user for tests."""
    user = User(
        id=str(uuid.uuid4()),
        email="test@example.com",
        password_hash="hashed_password",
        full_name="Test User",
        credits_balance=100000,
        is_active=True,
        email_verified=True,
    )

    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)

    return user
