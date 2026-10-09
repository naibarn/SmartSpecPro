"""Tests for the supported in-memory and PostgreSQL checkpointer APIs."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langgraph.checkpoint.memory import MemorySaver

import app.core.checkpointer as checkpointer_module
from app.core.checkpointer import (
    CheckpointerFactory,
    cleanup_checkpointers,
    get_checkpointer,
    get_memory_checkpointer,
    get_postgres_checkpointer,
)


@pytest.fixture(autouse=True)
async def reset_checkpointer_state():
    await cleanup_checkpointers()
    yield
    await cleanup_checkpointers()


def test_memory_checkpointer_is_cached_and_legacy_alias_uses_current_memory_api():
    memory = get_memory_checkpointer()
    assert isinstance(memory, MemorySaver)
    assert get_memory_checkpointer() is memory
    assert get_checkpointer() is memory
    assert CheckpointerFactory.create_sync() is memory


@pytest.mark.asyncio
async def test_factory_can_select_memory_without_database_access():
    memory = await CheckpointerFactory.create(use_postgres=False)
    assert isinstance(memory, MemorySaver)


@pytest.mark.asyncio
async def test_postgres_checkpointer_opens_pool_and_runs_setup():
    pool = AsyncMock()
    saver = AsyncMock()
    with (
        patch.object(checkpointer_module, "AsyncConnectionPool", return_value=pool) as pool_factory,
        patch.object(checkpointer_module, "AsyncPostgresSaver", return_value=saver) as saver_factory,
        patch.object(checkpointer_module.settings, "DATABASE_URL", "postgresql+asyncpg://db/test"),
    ):
        result = await get_postgres_checkpointer()

    assert result is saver
    pool_factory.assert_called_once()
    assert pool_factory.call_args.kwargs["conninfo"] == "postgresql://db/test"
    pool.open.assert_awaited_once()
    saver_factory.assert_called_once_with(pool)
    saver.setup.assert_awaited_once()


@pytest.mark.asyncio
async def test_postgres_checkpointer_reuses_initialized_saver():
    pool = AsyncMock()
    saver = AsyncMock()
    with (
        patch.object(checkpointer_module, "AsyncConnectionPool", return_value=pool) as pool_factory,
        patch.object(checkpointer_module, "AsyncPostgresSaver", return_value=saver),
    ):
        first = await get_postgres_checkpointer()
        second = await get_postgres_checkpointer()

    assert first is second is saver
    pool_factory.assert_called_once()
    saver.setup.assert_awaited_once()


@pytest.mark.asyncio
async def test_cleanup_closes_pool_and_resets_cached_instances():
    pool = AsyncMock()
    checkpointer_module._postgres_pool = pool
    checkpointer_module._postgres_checkpointer = MagicMock()
    memory = get_memory_checkpointer()

    await cleanup_checkpointers()

    pool.close.assert_awaited_once()
    assert checkpointer_module._postgres_pool is None
    assert checkpointer_module._postgres_checkpointer is None
    assert checkpointer_module._memory_checkpointer is None
    assert get_memory_checkpointer() is not memory
