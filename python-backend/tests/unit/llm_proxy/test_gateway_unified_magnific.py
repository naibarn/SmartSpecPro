from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.llm_proxy.gateway_unified import LLMGateway
from app.llm_proxy.models import ImageGenerationRequest, VideoGenerationRequest


GET_PROVIDER_KEY_PATCH = "app.services.media_provider_service.get_media_provider_key"
MAGNIFIC_PATCH = "app.llm_proxy.providers.magnific_provider.MagnificProvider"


def _gateway() -> LLMGateway:
    gateway = LLMGateway.__new__(LLMGateway)
    gateway.db = MagicMock()
    gateway.unified_client = MagicMock()
    gateway._estimate_cost = AsyncMock(return_value=Decimal("0.02"))
    gateway._check_credits = AsyncMock()
    gateway._deduct_credits = AsyncMock(
        return_value=MagicMock(amount=-20, balance_after=980)
    )
    return gateway


def _configured_provider_key(api_key: str = "magnific-test-key") -> dict:
    return {"apiKey": api_key, "baseUrl": None}


def test_build_magnific_payload_maps_lora_selectors_into_styling():
    request = ImageGenerationRequest(
        model="magnific/mystic",
        prompt="A studio portrait",
        negativePrompt="blur",
        aspectRatio="1:1",
        resolution="1K",
        seed=42,
        referenceImageUrls=["https://storage.googleapis.com/smartspec-test/ref.png"],
        extraParams={
            "style_lora_id": "style-1",
            "character_lora_ids": ["char-1", "char-2"],
            "__reserved_credits": 20,
        },
    )

    payload = LLMGateway._build_magnific_payload(request)

    assert payload["prompt"] == "A studio portrait"
    assert payload["negative_prompt"] == "blur"
    assert payload["aspect_ratio"] == "1:1"
    assert payload["resolution"] == "1K"
    assert payload["seed"] == 42
    assert payload["image_urls"] == ["https://storage.googleapis.com/smartspec-test/ref.png"]
    assert payload["styling"] == {
        "styles": ["style-1"],
        "characters": ["char-1", "char-2"],
    }
    assert "__reserved_credits" not in payload
    assert "style_lora_id" not in payload
    assert "character_lora_ids" not in payload


def test_build_magnific_payload_maps_video_references():
    request = VideoGenerationRequest(
        model="magnific/video-upscaler-precision",
        prompt="Upscale this clip",
        duration=10,
        resolution="1080p",
        fps=24,
        referenceVideoUrl="https://storage.googleapis.com/smartspec-test/input.mp4",
        extraParams={"strength": 70},
    )

    payload = LLMGateway._build_magnific_payload(request)

    assert payload["prompt"] == "Upscale this clip"
    assert payload["duration"] == 10
    assert payload["resolution"] == "1080p"
    assert payload["fps"] == 24
    assert payload["strength"] == 70
    assert payload["video_url"] == "https://storage.googleapis.com/smartspec-test/input.mp4"
    assert payload["video_urls"] == ["https://storage.googleapis.com/smartspec-test/input.mp4"]


def test_build_magnific_payload_sanitizes_nano_banana_request_for_magnific_api():
    long_prompt = "x" * 3200
    request = ImageGenerationRequest(
        model="magnific/nano-banana-pro",
        prompt=long_prompt,
        aspectRatio="9:16",
        referenceImageUrls=["https://storage.googleapis.com/smartspec-test/ref.png"],
        extraParams={
            "negative_prompt": "duplicated prompt text must not be sent",
            "use_google_search_tool": False,
            "cfg_scale": 8,
            "steps": 30,
            "__reserved_credits": 20,
        },
    )

    payload = LLMGateway._build_magnific_payload(request)

    assert payload == {
        "prompt": "x" * 3000,
        "aspect_ratio": "9:16",
        "use_google_search_tool": False,
        "reference_images": [
            {
                "image": "https://storage.googleapis.com/smartspec-test/ref.png",
                "mime_type": "image/png",
            }
        ],
        "resolution": "2K",
    }


def test_build_magnific_payload_preserves_or_infers_reference_image_mime_types():
    request = ImageGenerationRequest(
        model="magnific/nano-banana-pro",
        prompt="Use the product references",
        extraParams={
            "reference_images": [
                "https://storage.googleapis.com/smartspec-test/ref.jpg?sig=1",
                {"image": "https://storage.googleapis.com/smartspec-test/ref.webp"},
                {
                    "image": "https://storage.googleapis.com/smartspec-test/ref.png",
                    "mime_type": "image/png",
                    "text": "Front angle",
                },
            ],
        },
    )

    payload = LLMGateway._build_magnific_payload(request)

    assert payload["reference_images"] == [
        {
            "image": "https://storage.googleapis.com/smartspec-test/ref.jpg?sig=1",
            "mime_type": "image/jpeg",
        },
        {
            "image": "https://storage.googleapis.com/smartspec-test/ref.webp",
            "mime_type": "image/webp",
        },
        {
            "image": "https://storage.googleapis.com/smartspec-test/ref.png",
            "text": "Front angle",
            "mime_type": "image/png",
        },
    ]


def test_build_magnific_payload_uses_flash_resolution_default():
    request = ImageGenerationRequest(
        model="magnific/nano-banana-pro-flash",
        prompt="A compact infographic",
        extraParams={"use_google_search_tool": True},
    )

    payload = LLMGateway._build_magnific_payload(request)

    assert payload["aspect_ratio"] == "1:1"
    assert payload["resolution"] == "1K"
    assert payload["use_google_search_tool"] is True


def test_is_magnific_model_id_is_prefix_scoped():
    assert LLMGateway._is_magnific_model_id("magnific/mystic") is True
    assert LLMGateway._is_magnific_model_id(" Magnific/Veo-3-1 ") is True
    assert LLMGateway._is_magnific_model_id("not-magnific/mystic") is False
    assert LLMGateway._is_magnific_model_id(None) is False


@pytest.mark.asyncio
async def test_generate_image_routes_magnific_model_to_magnific_not_kie():
    gateway = _gateway()
    kie_client = MagicMock()
    kie_client.generate_image = AsyncMock()
    gateway.unified_client.kie_ai_client = kie_client
    request = ImageGenerationRequest(
        model="magnific/nano-banana-pro",
        prompt="Create an infographic",
        apiConfig={"provider": "magnific"},
        extraParams={"__reserved_credits": 20},
    )

    magnific_client = MagicMock()
    magnific_client.get_model_spec.return_value = MagicMock(dispatch_mode="async")
    magnific_client.generate_image = AsyncMock(
        return_value={"provider_task_id": "magnific-task-1"}
    )
    magnific_client.aclose = AsyncMock()

    with (
        patch.object(
            gateway,
            "_resolve_media_provider",
            new_callable=AsyncMock,
            return_value="magnific",
        ),
        patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=_configured_provider_key()),
        patch(MAGNIFIC_PATCH, return_value=magnific_client) as magnific_class,
    ):
        response = await gateway.generate_image(request, MagicMock(id=1))

    magnific_class.assert_called_once_with(
        api_key="magnific-test-key",
        base_url=None,
    )
    magnific_client.generate_image.assert_awaited_once()
    magnific_client.aclose.assert_awaited_once()
    kie_client.generate_image.assert_not_awaited()
    assert response.provider == "magnific"
    assert response.id == "magnific-task-1"
    assert response.data == []


@pytest.mark.asyncio
async def test_generate_image_keeps_kie_fallback_for_non_magnific_model():
    gateway = _gateway()
    request = ImageGenerationRequest(
        model="gpt-image-2-text-to-image",
        prompt="A calm office scene",
        apiConfig={"provider": "kie_ai"},
    )
    kie_client = MagicMock()
    kie_client.generate_image = AsyncMock(
        return_value={
            "id": "kie-task-1",
            "created": 0,
            "data": [{"url": "https://storage.googleapis.com/smartspec-test/kie.png"}],
            "kie_credits_consumed": None,
        }
    )
    gateway.unified_client.kie_ai_client = kie_client

    magnific_client = MagicMock()
    with (
        patch.object(
            gateway,
            "_resolve_media_provider",
            new_callable=AsyncMock,
            return_value="kie_ai",
        ),
        patch(MAGNIFIC_PATCH, return_value=magnific_client) as magnific_class,
    ):
        response = await gateway.generate_image(request, MagicMock(id=1))

    magnific_class.assert_not_called()
    kie_client.generate_image.assert_awaited_once()
    assert response.provider == "kie_ai"
    assert response.id == "kie-task-1"
    assert response.data == [{"url": "https://storage.googleapis.com/smartspec-test/kie.png"}]
