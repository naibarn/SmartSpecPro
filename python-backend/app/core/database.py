"""
SmartSpec Pro - Database Configuration
Phase 0 - Critical Gap Fix #2
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool
import os
import re

import structlog

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
    # NOTE: pool_pre_ping=False because it's incompatible with asyncpg
    # (causes MissingGreenlet error). Use pool_recycle instead.
    _pool_size = int(os.environ.get("DB_POOL_SIZE", "5"))
    _max_overflow = int(os.environ.get("DB_MAX_OVERFLOW", "5"))
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
        pool_pre_ping=False,
        pool_size=_pool_size,
        max_overflow=_max_overflow,
        pool_recycle=300,  # Recycle connections every 5 minutes
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


def get_db_context():
    """
    Context manager for getting async database session in background tasks.
    Usage: async with get_db_context() as db: ...
    """
    return AsyncSessionLocal()


async def init_db():
    """Initialize database - create all tables"""
    # Import all models here to ensure they are registered before create_all
    from app.models import (
        # Core models
        audit_log, credit, api_key, oauth, password_reset, payment, refund,
        support_ticket, user, marketplace_template,
        # Execution and memory
        execution, semantic_memory, provider_config, opencode_key,
        # Phase 3 models
        tenant, rbac, approval, vault_model, vector_store,
        # Media and assets
        asset, media_task, media_callback_event, library,
        # Notifications and preferences
        notification, user_preferences, custom_skill_prompt,
        # Sandbox execution
        sandbox,
    )
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
