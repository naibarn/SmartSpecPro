"""
Tests for PostgreSQL checkpointing functionality.

Tests that CheckpointerFactory can create PostgreSQL and in-memory checkpointers.
Full functional tests will be added when orchestrator is implemented.
"""

import pytest
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.core.checkpointer import CheckpointerFactory, get_postgres_checkpointer


@pytest.mark.asyncio
async def test_checkpointer_factory_postgres_mode():
    """Test CheckpointerFactory returns PostgreSQL saver when enabled"""
    checkpointer = await CheckpointerFactory.create(use_postgres=True)

    # Should return AsyncPostgresSaver, not MemorySaver
    assert isinstance(checkpointer, AsyncPostgresSaver)
    assert not isinstance(checkpointer, MemorySaver)


@pytest.mark.asyncio
async def test_checkpointer_factory_memory_mode():
    """Test CheckpointerFactory returns MemorySaver when disabled"""
    checkpointer = await CheckpointerFactory.create(use_postgres=False)

    # Should return MemorySaver
    assert isinstance(checkpointer, MemorySaver)


@pytest.mark.asyncio
async def test_postgres_checkpointer_singleton():
    """Test that get_postgres_checkpointer returns same instance"""
    checkpointer1 = await get_postgres_checkpointer()
    checkpointer2 = await get_postgres_checkpointer()

    # Should return same instance (singleton pattern)
    assert checkpointer1 is checkpointer2


@pytest.mark.asyncio
async def test_postgres_tables_created():
    """Test that checkpoint tables are created"""
    import psycopg
    from app.core.config import settings

    # Create checkpointer (which runs setup())
    await get_postgres_checkpointer()

    # Check tables exist
    db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    async with await psycopg.AsyncConnection.connect(db_url) as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT tablename FROM pg_tables
                WHERE schemaname='public'
                AND tablename IN ('checkpoints', 'checkpoint_writes')
                ORDER BY tablename
            """)
            tables = await cur.fetchall()

    table_names = [t[0] for t in tables]
    assert "checkpoints" in table_names
    assert "checkpoint_writes" in table_names


# Integration tests requiring full orchestrator will be added later
@pytest.mark.integration
@pytest.mark.skip(reason="Orchestrator integration not yet available")
class TestCheckpointIntegration:
    """Full integration tests with orchestrator"""

    @pytest.mark.asyncio
    async def test_workflow_save_and_resume(self):
        """Test full workflow save and resume cycle"""
        # Will be implemented when orchestrator is ready
        pass
