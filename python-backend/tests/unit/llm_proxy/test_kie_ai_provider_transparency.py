from unittest.mock import AsyncMock

import pytest

from app.llm_proxy.providers.kie_ai_provider import KieAIProvider


@pytest.mark.asyncio
async def test_generate_image_forwards_native_transparent_background_input():
    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-1", "data": []})
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-1"}})

    await provider.generate_image(
        model="gpt-image-2-text-to-image",
        prompt="a clean product cutout",
        callback_url="",
        api_config={"kie_model_id": "gpt-image-2-text-to-image"},
        extra_params={"background": "transparent"},
    )

    provider.create_task.assert_awaited_once()
    args, _ = provider.create_task.await_args
    assert args[1]["background"] == "transparent"
    assert args[1]["output_format"] == "png"

