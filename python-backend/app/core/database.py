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

# Track whether we're in a Celery worker child process.
# Set to True by reinit_engine_for_celery_worker() called from worker_process_init.
_is_celery_worker = False

def sanitize_db_url(url: str) -> str:
    """
    Sanitize database URL by removing password
    """
    return re.sub(r'://([^:]+):([^@]+)@', r'://\1:****@', url)


def _create_engine():
    """Create the async engine with appropriate pool settings."""
    if settings.DATABASE_URL.startswith("sqlite"):
        return create_async_engine(
            settings.DATABASE_URL,
            echo=settings.DEBUG,
        )

    if _is_celery_worker:
        # Celery prefork workers: use NullPool to avoid connection pool corruption.
        # After fork(), inherited asyncpg connections are in undefined state.
        # NullPool creates a fresh connection per session and closes it immediately,
        # eliminating "cannot perform operation: another operation is in progress" errors.
        return create_async_engine(
            settings.DATABASE_URL,
            echo=settings.DEBUG,
            poolclass=NullPool,
        )

    # FastAPI / non-worker: use connection pool for performance.
    _pool_size = int(os.environ.get("DB_POOL_SIZE", "5"))
    _max_overflow = int(os.environ.get("DB_MAX_OVERFLOW", "5"))
    return create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
        pool_pre_ping=False,
        pool_size=_pool_size,
        max_overflow=_max_overflow,
        pool_recycle=300,
    )


engine = _create_engine()

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


def reinit_engine_for_celery_worker():
    """
    Reinitialize the engine with NullPool after Celery worker fork.

    Must be called from celery worker_process_init signal. This:
    1. Disposes inherited (corrupted) connections from the parent process
    2. Recreates the engine with NullPool so each session gets a fresh connection
    3. Reconfigures AsyncSessionLocal in-place (via .configure()) so that ALL
       modules that imported it at module level see the new engine binding
    """
    global engine, _is_celery_worker
    _is_celery_worker = True

    # Dispose inherited connections — they are invalid after fork()
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    loop.run_until_complete(engine.dispose())

    # Recreate engine with NullPool
    engine = _create_engine()

    # Reconfigure the EXISTING AsyncSessionLocal in-place.
    # This is critical: other modules that did `from database import AsyncSessionLocal`
    # hold a reference to this object. Creating a new one would leave them with a stale
    # session factory bound to the old, disposed engine.
    AsyncSessionLocal.configure(bind=engine)

    logger.info("celery_worker_engine_reinitialized", poolclass="NullPool")


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
        # Agency-Swarm
        agency,
        # Live browser runtime
        live_browser,
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
