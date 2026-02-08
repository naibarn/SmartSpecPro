"""
SmartSpec Pro - LangGraph Checkpoint Configuration

PostgreSQL-backed checkpointing for state persistence across process restarts.
"""

from typing import Optional, Union
import structlog

from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool

from app.core.config import settings

# Monkey-patch AsyncPostgresSaver.MIGRATIONS to remove CONCURRENTLY
# (which requires autocommit and doesn't work well with AsyncConnectionPool)
_original_migrations = AsyncPostgresSaver.MIGRATIONS.copy()
AsyncPostgresSaver.MIGRATIONS = tuple(
    m.replace(" CONCURRENTLY", "") for m in _original_migrations
)

logger = structlog.get_logger()


# Global checkpointer instances
_memory_checkpointer: Optional[MemorySaver] = None
_postgres_checkpointer: Optional[AsyncPostgresSaver] = None
_postgres_pool: Optional[AsyncConnectionPool] = None


def get_memory_checkpointer() -> MemorySaver:
    """
    Get or create in-memory checkpointer (for testing).

    Returns:
        MemorySaver: In-memory checkpointer instance
    """
    global _memory_checkpointer

    if _memory_checkpointer is None:
        logger.debug("Creating MemorySaver checkpointer")
        _memory_checkpointer = MemorySaver()

    return _memory_checkpointer


async def get_postgres_checkpointer() -> AsyncPostgresSaver:
    """
    Get or create PostgreSQL checkpointer.

    Returns:
        AsyncPostgresSaver: PostgreSQL-backed checkpointer instance
    """
    global _postgres_checkpointer, _postgres_pool

    if _postgres_checkpointer is None:
        logger.info("Initializing PostgreSQL checkpointer")

        # Convert SQLAlchemy URL to psycopg3 format
        # Replace "postgresql+asyncpg://" with "postgresql://"
        database_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

        # Create connection pool (without autocommit for normal operations)
        _postgres_pool = AsyncConnectionPool(
            conninfo=database_url,
            min_size=2,
            max_size=10,
            timeout=60,
            max_idle=300,  # 5 minutes idle timeout
            max_lifetime=3600  # 1 hour max connection lifetime
        )

        # Open the pool
        await _postgres_pool.open()

        # Create checkpointer
        _postgres_checkpointer = AsyncPostgresSaver(_postgres_pool)

        # Setup tables (idempotent - safe to call multiple times)
        await _postgres_checkpointer.setup()

        logger.info("PostgreSQL checkpointer initialized successfully")

    return _postgres_checkpointer


async def cleanup_checkpointers():
    """Cleanup checkpointer resources (call on shutdown)"""
    global _postgres_pool, _postgres_checkpointer, _memory_checkpointer

    if _postgres_pool:
        await _postgres_pool.close()
        logger.info("PostgreSQL checkpointer pool closed")
        _postgres_pool = None
        _postgres_checkpointer = None

    _memory_checkpointer = None


def get_checkpointer() -> MemorySaver:
    """
    Legacy method - Get or create the MemorySaver instance.

    Returns:
        MemorySaver: In-memory checkpointer instance
    """
    return get_memory_checkpointer()


async def close_checkpointer():
    """
    Legacy method - Close the checkpointer.
    """
    await cleanup_checkpointers()


class CheckpointerFactory:
    """
    Factory for creating checkpointers.
    Supports both PostgreSQL (production) and in-memory (testing) modes.
    """

    @staticmethod
    async def create(use_postgres: bool = True) -> Union[MemorySaver, AsyncPostgresSaver]:
        """
        Create a checkpointer.

        Args:
            use_postgres: If True, use PostgreSQL (production).
                         If False, use in-memory (testing only).

        Returns:
            AsyncPostgresSaver (if use_postgres=True) or MemorySaver (if False)
        """
        if use_postgres:
            return await get_postgres_checkpointer()
        else:
            logger.warning("Using in-memory checkpointer - state will not persist!")
            return get_memory_checkpointer()

    @staticmethod
    def create_sync() -> MemorySaver:
        """
        Create a synchronous in-memory checkpointer.

        Returns:
            MemorySaver: In-memory checkpointer
        """
        return get_memory_checkpointer()
