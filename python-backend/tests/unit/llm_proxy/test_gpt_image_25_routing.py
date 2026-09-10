from unittest.mock import AsyncMock

import pytest

from app.llm_proxy.providers.kie_ai_provider import (
    KieAIProvider,
    resolve_image_api_model,
)

VARIANTS = [
    (
        "gpt-image-2-5-flare-text-to-image",
        "gpt-image-2-5-flare-image-to-image",
    ),
    (
        "gpt-image-2-5-sunburst-text-to-image",
        "gpt-image-2-5-sunburst-image-to-image",
    ),
]


@pytest.mark.parametrize("text_model,image_model", VARIANTS)
def test_gpt_image_25_variant_switches_only_when_images_are_attached(text_model, image_model):
    api_config = {
        "kie_model_id": text_model,
        "kie_model_id_with_references": image_model,
    }

    assert resolve_image_api_model(text_model, api_config, []) == text_model
    assert resolve_image_api_model(text_model, api_config, None) == text_model
    assert resolve_image_api_model(text_model, api_config, ["https://example.com/reference.png"]) == image_model


@pytest.mark.asyncio
@pytest.mark.parametrize("text_model,image_model", VARIANTS)
async def test_generate_image_sends_the_selected_gpt_image_25_operation(
    text_model,
    image_model,
):
    provider = KieAIProvider(api_key="test-key")
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-1"}})
    provider.wait_for_task = AsyncMock(return_value={"id": "task-1", "data": []})
    provider._prepare_reference_image_urls = AsyncMock(
        return_value=["https://kie.example/reference.png"]
    )
    api_config = {
        "kie_model_id": text_model,
        "kie_model_id_with_references": image_model,
        "reference_image_input_key": "input_urls",
        "reference_image_input_type": "array",
    }

    await provider.generate_image(
        model=text_model,
        prompt="Create a cinematic product image",
        callback_url="",
        api_config=api_config,
        reference_image_urls=["https://smartaihub.app/reference.png"],
    )

    args, kwargs = provider.create_task.await_args
    assert kwargs == {}
    assert args[0] == image_model
    assert args[1]["input_urls"] == ["https://kie.example/reference.png"]

    provider.create_task.reset_mock()
    provider._prepare_reference_image_urls.reset_mock()

    await provider.generate_image(
        model=text_model,
        prompt="Create a cinematic product image",
        callback_url="",
        api_config=api_config,
    )

    args, kwargs = provider.create_task.await_args
    assert kwargs == {}
    assert args[0] == text_model
    assert "input_urls" not in args[1]
    provider._prepare_reference_image_urls.assert_not_awaited()
