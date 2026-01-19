"""
SmartSpec Pro - LangGraph Checkpoint Configuration

Simplified to use MemorySaver only (PostgreSQL support disabled temporarily)
"""

from typing import Optional
import structlog

from langgraph.checkpoint.memory import MemorySaver

logger = structlog.get_logger()


# Global checkpointer instance
_checkpointer: Optional[MemorySaver] = None


def get_checkpointer() -> MemorySaver:
    """
    Get or create the MemorySaver instance.

    Returns:
        MemorySaver: In-memory checkpointer instance
    """
    global _checkpointer

    if _checkpointer is None:
        logger.debug("Creating MemorySaver checkpointer")
        _checkpointer = MemorySaver()

    return _checkpointer


def get_memory_checkpointer() -> MemorySaver:
    """
    Get an in-memory checkpointer.

    Returns:
        MemorySaver: In-memory checkpointer instance
    """
    return get_checkpointer()


async def close_checkpointer():
    """
    Close the checkpointer (no-op for MemorySaver).
    """
    global _checkpointer
    _checkpointer = None
    logger.debug("Checkpointer closed")


class CheckpointerFactory:
    """
    Factory for creating checkpointers.
    Currently only supports MemorySaver.
    """

    @staticmethod
    async def create(use_postgres: bool = False) -> MemorySaver:
        """
        Create a checkpointer.

        Args:
            use_postgres: Ignored (PostgreSQL support disabled)

        Returns:
            MemorySaver instance
        """
        return get_memory_checkpointer()

    @staticmethod
    def create_sync() -> MemorySaver:
        """
        Create a synchronous in-memory checkpointer.

        Returns:
            MemorySaver: In-memory checkpointer
        """
        return get_memory_checkpointer()
