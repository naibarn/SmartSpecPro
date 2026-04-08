from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.llm_proxy.gateway_unified import LLMGateway
from app.llm_proxy.models import VideoGenerationRequest
from app.llm_proxy.providers.wavespeed_media_provider import (
    WAVESPEED_SEEDANCE_2_FAST_TEXT_TO_VIDEO_MODEL_ID,
    WaveSpeedMediaProvider as _RealWaveSpeed,
    WaveSpeedPollResult,
)

WAVESPEED_PATCH = "app.llm_proxy.providers.wavespeed_media_provider.WaveSpeedMediaProvider"
GET_PROVIDER_KEY_PATCH = "app.services.media_provider_service.get_media_provider_key"


def _wavespeed_class_mock(instance: MagicMock) -> MagicMock:
    cls = MagicMock()
    cls.LAUNCH_MODEL_ID = _RealWaveSpeed.LAUNCH_MODEL_ID
    cls.POLL_INITIAL_SECONDS = _RealWaveSpeed.POLL_INITIAL_SECONDS
    cls.resolve_submit_endpoint = MagicMock(side_effect=_RealWaveSpeed.resolve_submit_endpoint)
    cls.resolve_result_endpoint_template = MagicMock(side_effect=_RealWaveSpeed.resolve_result_endpoint_template)
    cls.resolve_provider_model_id = MagicMock(side_effect=_RealWaveSpeed.resolve_provider_model_id)
    cls.return_value = instance
    return cls


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=RuntimeError("db unavailable"))
    return db


@pytest.fixture
def gateway(mock_db):
    with patch("app.llm_proxy.gateway_unified.LLMProxy"), \
         patch("app.llm_proxy.gateway_unified.get_unified_client"), \
         patch("app.llm_proxy.gateway_unified.CreditService"), \
         patch("app.llm_proxy.gateway_unified.get_gateway_client"):
        gw = LLMGateway(mock_db)
        gw._check_credits = AsyncMock()
        gw._estimate_cost = AsyncMock(return_value=Decimal("0.8"))
        gw._deduct_credits = AsyncMock(return_value=MagicMock(amount=-800, balance_after=9200))
        return gw


def _make_wavespeed_client_mock() -> MagicMock:
    client = MagicMock()
    client.create_prediction = AsyncMock(return_value={
        "provider_task_id": "ws-pred-123",
        "raw_status": "created",
        "raw_response": {"data": {"id": "ws-pred-123", "status": "created"}},
    })
    client.wait_for_completion = AsyncMock(return_value=WaveSpeedPollResult(
        state="success",
        raw_status="completed",
        provider_task_id="ws-pred-123",
        result_url="https://cdn.example.com/wavespeed.mp4",
        error_message=None,
        raw_response={"data": {"id": "ws-pred-123", "status": "completed"}},
    ))
    client.aclose = AsyncMock()
    return client


@pytest.mark.asyncio
async def test_generate_video_routes_launch_model_to_wavespeed_and_maps_submit_fields(gateway):
    request = VideoGenerationRequest(
        model="wavespeed-ai/cinematic-video-generator",
        prompt="A cinematic waterfall",
        duration=10,
        aspectRatio="9:16",
        referenceImageUrls=[
            "https://cdn.example.com/1.png",
            "https://cdn.example.com/2.png",
        ],
        apiConfig={"provider": "wavespeed-ai"},
    )
    client = _make_wavespeed_client_mock()

    with patch(WAVESPEED_PATCH, new=_wavespeed_class_mock(client)), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "ws-key", "baseUrl": "https://api.wavespeed.ai"}):
        response = await gateway.generate_video(request, MagicMock(id=1), wait_for_completion=False)

    assert response.provider == "wavespeed_ai"
    assert response.id == "ws-pred-123"
    assert response.data == []
    client.create_prediction.assert_awaited_once_with(
        prompt="A cinematic waterfall",
        reference_image_urls=[
            "https://cdn.example.com/1.png",
            "https://cdn.example.com/2.png",
        ],
        aspect_ratio="9:16",
        duration=10,
        resolution=None,
    )
    client.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_generate_video_waits_for_completion_in_sync_mode(gateway):
    request = VideoGenerationRequest(
        model="wavespeed-ai/cinematic-video-generator",
        prompt="A cinematic waterfall",
        duration=5,
        aspectRatio="16:9",
    )
    client = _make_wavespeed_client_mock()

    with patch(WAVESPEED_PATCH, new=_wavespeed_class_mock(client)), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "ws-key", "baseUrl": "https://api.wavespeed.ai"}):
        response = await gateway.generate_video(request, MagicMock(id=1), wait_for_completion=True)

    assert response.data == [{"url": "https://cdn.example.com/wavespeed.mp4"}]
    client.wait_for_completion.assert_awaited_once_with(request_id="ws-pred-123")


@pytest.mark.asyncio
async def test_generate_video_raises_503_when_wavespeed_not_configured(gateway):
    request = VideoGenerationRequest(
        model="wavespeed-ai/cinematic-video-generator",
        prompt="A cinematic waterfall",
        duration=5,
        aspectRatio="16:9",
    )

    with patch(WAVESPEED_PATCH, new=_wavespeed_class_mock(MagicMock())), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            await gateway.generate_video(request, MagicMock(id=1), wait_for_completion=False)

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_estimate_cost_uses_wavespeed_static_tiers_when_db_lookup_is_unavailable(gateway):
    request = VideoGenerationRequest(
        model="wavespeed-ai/cinematic-video-generator",
        prompt="A cinematic waterfall",
        duration=10,
        apiConfig={"provider": "wavespeed_ai"},
    )

    cost = await LLMGateway._estimate_cost(gateway, request, False)

    assert cost == Decimal("1.6")


@pytest.mark.asyncio
async def test_estimate_cost_uses_model_specific_wavespeed_static_tiers_for_new_seedance_models(gateway):
    request = VideoGenerationRequest(
        model=WAVESPEED_SEEDANCE_2_FAST_TEXT_TO_VIDEO_MODEL_ID,
        prompt="A cinematic waterfall",
        duration=15,
        apiConfig={"provider": "wavespeed_ai"},
    )

    cost = await LLMGateway._estimate_cost(gateway, request, False)

    assert cost == Decimal("1.8")
