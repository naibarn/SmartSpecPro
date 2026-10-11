import asyncio

import pytest


def test_sync_asyncio_run_clears_current_loop():
    asyncio.run(asyncio.sleep(0))
    with pytest.raises(RuntimeError, match="There is no current event loop"):
        asyncio.get_event_loop()


@pytest.mark.asyncio
async def test_async_test_can_run_after_sync_asyncio_run():
    assert asyncio.get_running_loop().is_running()
