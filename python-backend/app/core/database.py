"""
SmartSpec Pro - Database Configuration
Phase 0 - Critical Gap Fix #2
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool
import structlog
import re

from app.core.config import settings

logger = structlog.get_logger()

# Create declarative base for models
Base = declarative_base()

def sanitize_db_url(url: str) -> str:
    """
    Sanitize database URL by removing password
    """
    return re.sub(r'://([^:]+):([^@]+)@', r'://\1:****@', url)

# Create async engine
if settings.DATABASE_URL.startswith("sqlite"):
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
    )
else:
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
    )

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncSession:
    """
    Dependency for getting async database session
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Initialize database - create all tables"""
    # Import all models here to ensure they are registered before create_all
    from app.models import audit_log, credit, api_key, oauth, password_reset, payment, refund, support_ticket, user
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info(
        "database_initialized",
        url=sanitize_db_url(settings.DATABASE_URL)
    )


async def close_db():
    """Close database connection"""
    await engine.dispose()
    logger.info(
        "database_connection_closed",
        url=sanitize_db_url(settings.DATABASE_URL)
    )
