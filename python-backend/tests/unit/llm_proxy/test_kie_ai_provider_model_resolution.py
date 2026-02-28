import pytest
from unittest.mock import AsyncMock

from app.llm_proxy.providers.kie_ai_provider import (
    KieAIProvider,
    get_model_resolution_stats,
    reset_model_resolution_stats,
    resolve_api_model,
)


def test_resolve_api_model_prefers_config_kie_model_id_variants():
    reset_model_resolution_stats()

    assert resolve_api_model("google-banana-2", {"kie_model_id": "nano-banana-2"}) == "nano-banana-2"
    assert resolve_api_model("google-banana-2", {"kieModelId": "nano-banana-2"}) == "nano-banana-2"

    stats = get_model_resolution_stats()
    assert stats["explicit_api_model"] == 2


@pytest.mark.asyncio
async def test_generate_image_uses_db_model_id_and_endpoint_aliases():
    reset_model_resolution_stats()

    provider = KieAIProvider(api_key="test-key")
    provider.wait_for_task = AsyncMock(return_value={"id": "task-1", "data": []})
    provider._make_request = AsyncMock(return_value={"data": {"taskId": "task-1"}})

    await provider.generate_image(
        model="legacy-model-alias",
        prompt="test prompt",
        callback_url="",
        api_config={
            "kieModelId": "nano-banana-2",
            "apiEndpoint": "/api/v1/veo/generate",
        },
    )

    provider._make_request.assert_awaited_once()
    args, kwargs = provider._make_request.await_args
    assert args[0] == "POST"
    assert args[1] == "veo/generate"
    assert kwargs["data"]["model"] == "nano-banana-2"

