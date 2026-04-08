from __future__ import annotations

import pytest

from app.tasks.approval_timeout_tasks import _close_redis_client

pytestmark = [pytest.mark.unit]


class AsyncCloseRedis:
    def __init__(self) -> None:
        self.closed = False

    async def aclose(self) -> None:
        self.closed = True


class SyncCloseRedis:
    def __init__(self) -> None:
        self.closed = False

    def close(self) -> None:
        self.closed = True


class AwaitableCloseRedis:
    def __init__(self) -> None:
        self.closed = False

    async def _close_async(self) -> None:
        self.closed = True

    def close(self):
        return self._close_async()


@pytest.mark.asyncio
async def test_close_redis_client_prefers_aclose_when_available():
    client = AsyncCloseRedis()

    await _close_redis_client(client)

    assert client.closed is True


@pytest.mark.asyncio
async def test_close_redis_client_supports_sync_close():
    client = SyncCloseRedis()

    await _close_redis_client(client)

    assert client.closed is True


@pytest.mark.asyncio
async def test_close_redis_client_awaits_close_result_when_needed():
    client = AwaitableCloseRedis()

    await _close_redis_client(client)

    assert client.closed is True
