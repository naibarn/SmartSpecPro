from unittest.mock import AsyncMock

import pytest

from app.llm_proxy.providers.kie_ai_provider import (
    KieAIProvider,
    resolve_image_api_model,
)


VARIANTS = [
    (
        "qwen3/pro-text-to-image",
        "qwen3/pro-image-to-image",
    ),
    (
        "qwen3/text-to-image",
        "qwen3/image-to-image",
    ),
]


@pytest.mark.parametrize("text_model,image_model", VARIANTS)
def test_qwen_image_3_variant_switches_only_when_images_are_attached(text_model, image_model):
    api_config = {
        "kie_model_id": text_model,
        "kie_model_id_with_references": image_model,
    }

    assert resolve_image_api_model(text_model, api_config, []) == text_model
    assert resolve_image_api_model(text_model, api_config, None) == text_model
    assert resolve_image_api_model(text_model, api_config, ["https://example.com/reference.png"]) == image_model


@pytest.mark.asyncio
@pytest.mark.parametrize("text_model,image_model", VARIANTS)
async def test_generate_image_sends_qwen_payload_and_image_to_image_operation(
    text_model,
    image_model,
):
    provider = KieAIProvider(api_key="test-key")
    provider.create_task = AsyncMock(return_value={"data": {"taskId": "task-1"}})
    provider._prepare_reference_image_urls = AsyncMock(
        return_value=["https://kie.example/reference.png"]
    )
    api_config = {
        "kie_model_id": text_model,
        "kie_model_id_with_references": image_model,
        "reference_image_input_key": "image_urls",
        "reference_image_input_type": "array",
        "drop_params": ["aspect_ratio"],
    }

    await provider.generate_image(
        model=text_model,
        prompt="Create a cinematic product image",
        callback_url="",
        wait_for_completion=False,
        aspect_ratio="16:9",
        api_config=api_config,
        extra_params={
            "image_size": "16:9",
            "resolution": "2K",
            "output_format": "jpeg",
            "prompt_extend": False,
            "negative_prompt": "blurry",
            "seed": 17,
            "nsfw_checker": False,
        },
        reference_image_urls=["https://smartaihub.app/reference.png"],
    )

    args, kwargs = provider.create_task.await_args
    assert kwargs == {}
    assert args[0] == image_model
    assert args[1] == {
        "prompt": "Create a cinematic product image",
        "resolution": "2K",
        "output_format": "jpeg",
        "image_size": "16:9",
        "prompt_extend": False,
        "negative_prompt": "blurry",
        "seed": 17,
        "nsfw_checker": False,
        "image_urls": ["https://kie.example/reference.png"],
    }
    assert "aspect_ratio" not in args[1]
