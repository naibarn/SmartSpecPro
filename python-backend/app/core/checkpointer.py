"""
SmartSpec Pro - LangGraph Checkpoint Configuration

This module provides PostgreSQL-based checkpointing for LangGraph workflows.
It supports both async PostgreSQL (production) and in-memory (development/testing).

The checkpointer automatically creates required tables on first use.
"""

from typing import Optional
from contextlib import asynccontextmanager
import structlog

from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool

from app.core.config import settings

logger = structlog.get_logger()

# Global connection pool
_connection_pool: Optional[AsyncConnectionPool] = None

# Global checkpointer instance
_checkpointer: Optional[AsyncPostgresSaver] = None


async def get_connection_pool() -> AsyncConnectionPool:
    """
    Get or create the async connection pool for PostgreSQL.
    
    Returns:
        AsyncConnectionPool: The connection pool instance
    """
    global _connection_pool
    
    if _connection_pool is None:
        logger.info(
            "Creating PostgreSQL connection pool for checkpoints",
            pool_size=settings.CHECKPOINT_POOL_SIZE
        )
        
        _connection_pool = AsyncConnectionPool(
            conninfo=settings.CHECKPOINT_DATABASE_URL,
            min_size=1,
            max_size=settings.CHECKPOINT_POOL_SIZE,
            open=False  # Don't open immediately
        )
        
        # Open the pool
        await _connection_pool.open()
        
        logger.info("PostgreSQL connection pool created successfully")
    
    return _connection_pool


async def get_checkpointer() -> AsyncPostgresSaver:
    """
    Get or create the AsyncPostgresSaver instance.
    
    This function:
    1. Creates a connection pool if not exists
    2. Creates the checkpointer with the pool
    3. Sets up required database tables
    
    Returns:
        AsyncPostgresSaver: The checkpointer instance
    """
    global _checkpointer
    
    if _checkpointer is None:
        pool = await get_connection_pool()
        
        logger.info("Creating AsyncPostgresSaver checkpointer")
        
        _checkpointer = AsyncPostgresSaver(pool)
        
        # Setup tables (creates if not exists)
        await _checkpointer.setup()
        
        logger.info("AsyncPostgresSaver checkpointer ready")
    
    return _checkpointer


def get_memory_checkpointer() -> MemorySaver:
    """
    Get an in-memory checkpointer for development/testing.
    
    Returns:
        MemorySaver: In-memory checkpointer instance
    """
    logger.debug("Using in-memory checkpointer")
    return MemorySaver()


async def close_checkpointer():
    """
    Close the checkpointer and connection pool.
    Should be called during application shutdown.
    """
    global _connection_pool, _checkpointer
    
    if _connection_pool is not None:
        logger.info("Closing PostgreSQL connection pool")
        await _connection_pool.close()
        _connection_pool = None
        _checkpointer = None
        logger.info("PostgreSQL connection pool closed")


@asynccontextmanager
async def checkpointer_context():
    """
    Context manager for checkpointer lifecycle.
    
    Usage:
        async with checkpointer_context() as checkpointer:
            # Use checkpointer
            graph = workflow.compile(checkpointer=checkpointer)
    """
    try:
        checkpointer = await get_checkpointer()
        yield checkpointer
    finally:
        # Don't close here - let the application manage lifecycle
        pass


class CheckpointerFactory:
    """
    Factory for creating checkpointers based on configuration.
    
    Supports:
    - PostgreSQL (production): Persistent, durable checkpoints
    - Memory (development): Fast, non-persistent checkpoints
    """
    
    @staticmethod
    async def create(use_postgres: bool = True) -> AsyncPostgresSaver | MemorySaver:
        """
        Create a checkpointer based on configuration.
        
        Args:
            use_postgres: If True, use PostgreSQL. If False, use in-memory.
        
        Returns:
            Checkpointer instance
        """
        if use_postgres and settings.CHECKPOINT_DATABASE_URL:
            try:
                return await get_checkpointer()
            except Exception as e:
                logger.warning(
                    "Failed to create PostgreSQL checkpointer, falling back to memory",
                    error=str(e)
                )
                return get_memory_checkpointer()
        else:
            return get_memory_checkpointer()
    
    @staticmethod
    def create_sync() -> MemorySaver:
        """
        Create a synchronous in-memory checkpointer.
        Useful for testing or simple use cases.
        
        Returns:
            MemorySaver: In-memory checkpointer
        """
        return get_memory_checkpointer()
