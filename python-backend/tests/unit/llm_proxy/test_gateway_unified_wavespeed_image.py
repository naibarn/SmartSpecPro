from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.llm_proxy.gateway_unified import LLMGateway
from app.llm_proxy.models import ImageGenerationRequest


def _gateway() -> LLMGateway:
    gateway = LLMGateway.__new__(LLMGateway)
    gateway.db = MagicMock()
    gateway.unified_client = MagicMock()
    gateway._estimate_cost = AsyncMock(return_value=Decimal("0.034"))
    gateway._check_credits = AsyncMock()
    gateway._deduct_credits = AsyncMock()
    return gateway


@pytest.mark.asyncio
async def test_generate_image_routes_wavespeed_references_to_edit_endpoint_with_all_parameters():
    gateway = _gateway()
    provider_client = MagicMock()
    provider_client.create_image_prediction = AsyncMock(
        return_value={"provider_task_id": "ws-image-task-1"}
    )
    provider_client.aclose = AsyncMock()

    references = [f"https://cdn.example.com/{index}.png" for index in range(2)]
    request = ImageGenerationRequest(
        model="openai/gpt-image-2.5-flare/text-to-image",
        prompt="Replace the background",
        aspectRatio="16:9",
        referenceImageUrls=references,
        resolution="2k",
        outputFormat="webp",
        extraParams={"quality": "high", "__reserved_credits": 46},
        apiConfig={
            "provider": "wavespeed_ai",
            "provider_model_id": "openai/gpt-image-2.5-flare/text-to-image",
            "provider_model_id_with_references": "openai/gpt-image-2.5-flare/edit",
            "endpoint": "/openai/gpt-image-2.5-flare/text-to-image",
            "endpoint_with_references": "/openai/gpt-image-2.5-flare/edit",
        },
    )

    with (
        patch.object(gateway, "_resolve_media_provider", new_callable=AsyncMock, return_value="wavespeed_ai"),
        patch(
            "app.services.media_provider_service.get_media_provider_key",
            new_callable=AsyncMock,
            return_value={"apiKey": "wavespeed-test-key", "baseUrl": None},
        ),
        patch("app.llm_proxy.providers.wavespeed_media_provider.WaveSpeedMediaProvider", return_value=provider_client) as provider_class,
    ):
        provider_class.resolve_result_endpoint_template.return_value = "/predictions/{requestId}/result"
        response = await gateway.generate_image(request, MagicMock(id=1), wait_for_completion=False)

    provider_class.assert_called_once_with(
        api_key="wavespeed-test-key",
        base_url=None,
        submit_endpoint="/openai/gpt-image-2.5-flare/edit",
        result_endpoint_template="/predictions/{requestId}/result",
        provider_model_id="openai/gpt-image-2.5-flare/edit",
    )
    provider_client.create_image_prediction.assert_awaited_once_with(
        prompt="Replace the background",
        reference_image_urls=references,
        aspect_ratio="16:9",
        resolution="2k",
        quality="high",
        output_format="webp",
    )
    provider_client.aclose.assert_awaited_once()
    assert response.provider == "wavespeed_ai"
    assert response.id == "ws-image-task-1"
    assert response.data == []
    assert response.credits_used == 46


@pytest.mark.asyncio
async def test_generate_image_routes_wavespeed_without_references_to_text_to_image_endpoint():
    gateway = _gateway()
    provider_client = MagicMock()
    provider_client.create_image_prediction = AsyncMock(
        return_value={"provider_task_id": "ws-image-task-2"}
    )
    provider_client.aclose = AsyncMock()
    request = ImageGenerationRequest(
        model="openai/gpt-image-2.5-sunburst/text-to-image",
        prompt="A sunrise over the ocean",
        extraParams={"__reserved_credits": 24},
        apiConfig={
            "provider": "wavespeed_ai",
            "provider_model_id": "openai/gpt-image-2.5-sunburst/text-to-image",
            "endpoint": "/openai/gpt-image-2.5-sunburst/text-to-image",
        },
    )

    with (
        patch.object(gateway, "_resolve_media_provider", new_callable=AsyncMock, return_value="wavespeed_ai"),
        patch(
            "app.services.media_provider_service.get_media_provider_key",
            new_callable=AsyncMock,
            return_value={"apiKey": "wavespeed-test-key", "baseUrl": None},
        ),
        patch("app.llm_proxy.providers.wavespeed_media_provider.WaveSpeedMediaProvider", return_value=provider_client) as provider_class,
    ):
        provider_class.resolve_result_endpoint_template.return_value = "/predictions/{requestId}/result"
        response = await gateway.generate_image(request, MagicMock(id=1), wait_for_completion=False)

    provider_class.assert_called_once_with(
        api_key="wavespeed-test-key",
        base_url=None,
        submit_endpoint="/openai/gpt-image-2.5-sunburst/text-to-image",
        result_endpoint_template="/predictions/{requestId}/result",
        provider_model_id="openai/gpt-image-2.5-sunburst/text-to-image",
    )
    provider_client.create_image_prediction.assert_awaited_once_with(
        prompt="A sunrise over the ocean",
        reference_image_urls=None,
        aspect_ratio="1:1",
        resolution="1k",
        quality="medium",
        output_format="png",
    )
    assert response.provider == "wavespeed_ai"
    assert response.id == "ws-image-task-2"
