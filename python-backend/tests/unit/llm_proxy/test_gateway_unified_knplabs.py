"""
Tests for LLMGateway KNPLabs routing.
"""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.llm_proxy.gateway_unified import LLMGateway
from app.llm_proxy.models import AudioGenerationRequest, ImageGenerationRequest, VideoGenerationRequest
from app.llm_proxy.providers.knplabai_provider import KNPLabsProvider as _RealKNPLabs

KNPLABS_PATCH = "app.llm_proxy.providers.knplabai_provider.KNPLabsProvider"


def _knplabs_class_mock(instance: MagicMock) -> MagicMock:
    cls = MagicMock()
    cls.IMAGE_OPENAI_MODELS = _RealKNPLabs.IMAGE_OPENAI_MODELS
    cls.IMAGE_GEMINI_MODELS = _RealKNPLabs.IMAGE_GEMINI_MODELS
    cls.VIDEO_FORM_MODELS = _RealKNPLabs.VIDEO_FORM_MODELS
    cls.VIDEO_JSON_MODELS = _RealKNPLabs.VIDEO_JSON_MODELS
    cls.VIDEO_MODELS = _RealKNPLabs.VIDEO_MODELS
    cls.AUDIO_MODELS = _RealKNPLabs.AUDIO_MODELS
    cls.return_value = instance
    return cls


@pytest.fixture
def mock_db():
    return AsyncMock()


@pytest.fixture
def gateway(mock_db):
    with patch("app.llm_proxy.gateway_unified.LLMProxy"), \
         patch("app.llm_proxy.gateway_unified.get_unified_client"), \
         patch("app.llm_proxy.gateway_unified.CreditService"), \
         patch("app.llm_proxy.gateway_unified.get_gateway_client"):
        gw = LLMGateway(mock_db)
        gw._check_credits = AsyncMock()
        gw._estimate_cost = AsyncMock(return_value=Decimal("0.02"))
        gw._deduct_credits = AsyncMock(return_value=MagicMock(amount=-20, balance_after=980))
        gw._resolve_media_provider = AsyncMock(return_value="")
        return gw


def _make_knplabs_client_mock() -> MagicMock:
    client = MagicMock()
    client.generate_image_openai = AsyncMock(
        return_value={"id": "img-1", "data": [{"url": "https://cdn.example.com/knplabs.png"}]}
    )
    client.generate_image_gemini = AsyncMock(return_value=b"image-bytes")
    client.create_video_veo = AsyncMock(return_value="video-task-veo")
    client.create_video_json = AsyncMock(return_value="video-task-json")
    client.wait_for_video = AsyncMock(
        return_value={"status": "completed", "result_url": "https://cdn.example.com/knplabs.mp4"}
    )
    client.extract_result_url = MagicMock(return_value="https://cdn.example.com/knplabs.mp4")
    client.generate_speech = AsyncMock(return_value=b"audio-bytes")
    client.aclose = AsyncMock()
    return client


class TestGatewayImageRoutingKnplabs:
    @pytest.mark.asyncio
    async def test_routes_prefixed_openai_image_model_to_knplabs(self, gateway):
        request = ImageGenerationRequest(model="knplabs/gpt-image-1.5-all", prompt="a robot")
        mock_client = _make_knplabs_client_mock()
        gateway.unified_client.knplabs_client = mock_client

        with patch(KNPLABS_PATCH, new=_knplabs_class_mock(mock_client)):
            result = await gateway.generate_image(request, MagicMock(id=1))

        mock_client.generate_image_openai.assert_awaited_once()
        called_model = mock_client.generate_image_openai.call_args.args[0]
        assert called_model == "gpt-image-1.5-all"
        assert result.provider == "knplabs"
        assert result.data == [{"url": "https://cdn.example.com/knplabs.png"}]


class TestGatewayVideoRoutingKnplabs:
    @pytest.mark.asyncio
    async def test_routes_prefixed_json_video_model_to_knplabs(self, gateway):
        request = VideoGenerationRequest(model="knplabs/grok-video-3", prompt="a flying bird")
        mock_client = _make_knplabs_client_mock()
        gateway.unified_client.knplabs_client = mock_client

        with patch(KNPLABS_PATCH, new=_knplabs_class_mock(mock_client)):
            result = await gateway.generate_video(request, MagicMock(id=1))

        mock_client.create_video_json.assert_awaited_once()
        called_model = mock_client.create_video_json.call_args.kwargs["model"]
        assert called_model == "grok-video-3"
        mock_client.wait_for_video.assert_awaited_once_with("video-task-json", "grok-video-3")
        assert result.provider == "knplabs"
        assert result.data == [{"url": "https://cdn.example.com/knplabs.mp4"}]


class TestGatewayAudioRoutingKnplabs:
    @pytest.mark.asyncio
    async def test_routes_prefixed_tts_model_to_knplabs(self, gateway):
        request = AudioGenerationRequest(model="knplabs/gpt-4o-mini-tts", text="Hello world")
        mock_client = _make_knplabs_client_mock()
        gateway.unified_client.knplabs_client = mock_client
        gateway._upload_generated_media_bytes = AsyncMock(return_value="https://cdn.example.com/audio.mp3")

        with patch(KNPLABS_PATCH, new=_knplabs_class_mock(mock_client)):
            result = await gateway.generate_audio(request, MagicMock(id=1))

        mock_client.generate_speech.assert_awaited_once()
        called_model = mock_client.generate_speech.call_args.kwargs["model"]
        assert called_model == "gpt-4o-mini-tts"
        assert result.provider == "knplabs"
        assert result.data == [{"url": "https://cdn.example.com/audio.mp3"}]
