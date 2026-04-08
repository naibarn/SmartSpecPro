import pytest
from unittest.mock import AsyncMock, patch

from app.llm_proxy.providers.kie_ai_provider import KieAIProvider


@pytest.mark.asyncio
async def test_wait_for_task_treats_waiting_as_processing_until_success():
    provider = KieAIProvider(api_key="test-key")
    provider.get_task_status = AsyncMock(side_effect=[
        {
            "code": 200,
            "msg": "success",
            "data": {
                "taskId": "task-waiting-1",
                "state": "waiting",
            },
        },
        {
            "code": 200,
            "msg": "success",
            "data": {
                "taskId": "task-waiting-1",
                "state": "waiting",
            },
        },
        {
            "code": 200,
            "msg": "success",
            "data": {
                "taskId": "task-waiting-1",
                "state": "success",
                "resultJson": "{\"resultUrls\":[\"https://cdn.example.com/result.jpg\"]}",
            },
        },
    ])

    with patch("app.llm_proxy.providers.kie_ai_provider.asyncio.sleep", new=AsyncMock()) as sleep_mock:
        result = await provider.wait_for_task("task-waiting-1", poll_interval=0.5, max_wait=5.0)

    assert provider.get_task_status.await_count == 3
    assert sleep_mock.await_count == 2
    assert result["id"] == "task-waiting-1"
    assert result["data"][0]["url"] == "https://cdn.example.com/result.jpg"
