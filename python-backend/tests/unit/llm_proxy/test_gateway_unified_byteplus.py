"""
Tests for LLMGateway BytePlus ModelArk routing.
Section 05 — gateway_unified.py extensions.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal

from fastapi import HTTPException

from app.llm_proxy.gateway_unified import LLMGateway
from app.llm_proxy.models import ImageGenerationRequest, VideoGenerationRequest
from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider as _RealBytePlus

BYTEPLUS_PATCH = "app.llm_proxy.providers.byteplus_modelark_provider.BytePlusModelArkProvider"
GET_PROVIDER_KEY_PATCH = "app.services.media_provider_service.get_media_provider_key"


def _byteplus_class_mock(instance: MagicMock) -> MagicMock:
    """Return a mock *class* with IMAGE_MODELS/VIDEO_MODELS intact for routing checks.

    When the gateway does `from ... import BytePlusModelArkProvider` and then checks
    `request.model in BytePlusModelArkProvider.IMAGE_MODELS`, the real frozenset is needed.
    """
    cls = MagicMock()
    cls.IMAGE_MODELS = _RealBytePlus.IMAGE_MODELS
    cls.VIDEO_MODELS = _RealBytePlus.VIDEO_MODELS
    cls.return_value = instance
    return cls


def _configured_provider_key(api_key: str = "test-key") -> dict:
    return {"apiKey": api_key, "baseUrl": None}


@pytest.fixture
def mock_db():
    """Async DB session mock."""
    return AsyncMock()


@pytest.fixture
def gateway(mock_db):
    """LLMGateway instance with all heavy dependencies mocked."""
    with patch("app.llm_proxy.gateway_unified.LLMProxy"), \
         patch("app.llm_proxy.gateway_unified.get_unified_client"), \
         patch("app.llm_proxy.gateway_unified.CreditService"), \
         patch("app.llm_proxy.gateway_unified.get_gateway_client"):
        gw = LLMGateway(mock_db)
        gw._check_credits = AsyncMock()
        gw._estimate_cost = AsyncMock(return_value=Decimal("0.02"))
        gw._deduct_credits = AsyncMock(return_value=MagicMock(amount=-20, balance_after=980))
        return gw


def _make_byteplus_client_mock(
    result_url: str = "https://cdn.example.com/img.png",
    task_id: str = "bp-task-123",
    usage_tokens: int = 1000,
) -> MagicMock:
    """Create a mock BytePlusModelArkProvider instance."""
    client = MagicMock()
    client.generate_image = AsyncMock(return_value={
        "result_url": result_url,
        "provider_task_id": task_id,
        "usage_tokens": usage_tokens,
        "raw_response": {},
    })
    client.create_video_task = AsyncMock(return_value={
        "provider_task_id": "bp-video-task-456",
        "status": "queued",
    })
    client.calculate_cost_usd = MagicMock(return_value=0.0025)
    client.aclose = AsyncMock()
    return client


class TestGatewayImageRoutingByteplus:
    """generate_image() routes BytePlus Seedream models correctly."""

    @pytest.mark.asyncio
    async def test_routes_to_byteplus_for_seedream_4_5(self, gateway):
        """generate_image routes to BytePlus when model is 'seedream-4-5-251128'."""
        request = ImageGenerationRequest(model="seedream-4-5-251128", prompt="a sunrise")
        mock_client = _make_byteplus_client_mock()
        with patch(BYTEPLUS_PATCH, new=_byteplus_class_mock(mock_client)), \
             patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=_configured_provider_key()):
            result = await gateway.generate_image(request, MagicMock(id=1))
        mock_client.generate_image.assert_awaited_once()
        assert result.provider == "byteplus_modelark"

    @pytest.mark.asyncio
    async def test_routes_to_byteplus_for_seedream_4_0(self, gateway):
        """generate_image routes to BytePlus when model is 'seedream-4-0-250828'."""
        request = ImageGenerationRequest(model="seedream-4-0-250828", prompt="a mountain")
        mock_client = _make_byteplus_client_mock()
        with patch(BYTEPLUS_PATCH, new=_byteplus_class_mock(mock_client)), \
             patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=_configured_provider_key()):
            result = await gateway.generate_image(request, MagicMock(id=1))
        assert result.provider == "byteplus_modelark"

    @pytest.mark.asyncio
    async def test_returns_image_generation_response_with_url(self, gateway):
        """generate_image returns ImageGenerationResponse with result_url in data."""
        request = ImageGenerationRequest(model="seedream-4-5-251128", prompt="a river")
        mock_client = _make_byteplus_client_mock(
            result_url="https://cdn.example.com/river.png", task_id="t1"
        )
        with patch(BYTEPLUS_PATCH, new=_byteplus_class_mock(mock_client)), \
             patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=_configured_provider_key()):
            result = await gateway.generate_image(request, MagicMock(id=1))
        assert result.data == [{"url": "https://cdn.example.com/river.png"}]
        assert result.id == "t1"

    @pytest.mark.asyncio
    async def test_raises_503_when_byteplus_not_configured(self, gateway):
        """generate_image raises HTTP 503 when get_media_provider_key returns None."""
        request = ImageGenerationRequest(model="seedream-4-5-251128", prompt="a forest")
        with patch(BYTEPLUS_PATCH, new=_byteplus_class_mock(MagicMock())), \
             patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                await gateway.generate_image(request, MagicMock(id=1))
        assert exc_info.value.status_code == 503

    @pytest.mark.asyncio
    async def test_raises_503_when_api_key_missing(self, gateway):
        """generate_image raises HTTP 503 when provider config has no apiKey."""
        request = ImageGenerationRequest(model="seedream-4-5-251128", prompt="a desert")
        with patch(BYTEPLUS_PATCH, new=_byteplus_class_mock(MagicMock())), \
             patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "", "baseUrl": None}):
            with pytest.raises(HTTPException) as exc_info:
                await gateway.generate_image(request, MagicMock(id=1))
        assert exc_info.value.status_code == 503

    @pytest.mark.asyncio
    async def test_kieai_regression_non_byteplus_model(self, gateway):
        """generate_image falls through to Kie.ai for non-BytePlus model — no regression."""
        request = ImageGenerationRequest(model="kolors", prompt="a city")
        # Set up kie_ai_client mock so Kie.ai path executes successfully
        kie_mock = MagicMock()
        kie_mock.generate_image = AsyncMock(return_value={
            "id": "kie-123",
            "data": [{"url": "https://example.com/city.png"}],
            "created": 1000,
            "kie_credits_consumed": None,
        })
        gateway.unified_client.kie_ai_client = kie_mock
        # Use _byteplus_class_mock so routing check uses real IMAGE_MODELS, "kolors" is not in it
        byteplus_cls_mock = _byteplus_class_mock(MagicMock())
        with patch(BYTEPLUS_PATCH, new=byteplus_cls_mock):
            result = await gateway.generate_image(request, MagicMock(id=1))
        # Provider was imported but never instantiated for "kolors"
        byteplus_cls_mock.assert_not_called()
        assert result.provider == "kie_ai"

    @pytest.mark.asyncio
    async def test_aclose_called_in_finally_on_success(self, gateway):
        """aclose() is called on the BytePlus client even on success."""
        request = ImageGenerationRequest(model="seedream-4-5-251128", prompt="a beach")
        mock_client = _make_byteplus_client_mock()
        with patch(BYTEPLUS_PATCH, new=_byteplus_class_mock(mock_client)), \
             patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=_configured_provider_key()):
            await gateway.generate_image(request, MagicMock(id=1))
        mock_client.aclose.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_aclose_called_in_finally_on_error(self, gateway):
        """aclose() is called on the BytePlus client even when generate_image raises."""
        request = ImageGenerationRequest(model="seedream-4-5-251128", prompt="a storm")
        mock_client = _make_byteplus_client_mock()
        mock_client.generate_image = AsyncMock(side_effect=RuntimeError("network error"))
        with patch(BYTEPLUS_PATCH, new=_byteplus_class_mock(mock_client)), \
             patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=_configured_provider_key()):
            with pytest.raises(HTTPException):
                await gateway.generate_image(request, MagicMock(id=1))
        mock_client.aclose.assert_awaited_once()


class TestGatewayVideoRoutingByteplus:
    """generate_video() routes BytePlus Seedance models correctly."""

    @pytest.mark.asyncio
    async def test_routes_to_byteplus_for_seedance_model(self, gateway):
        """generate_video routes to BytePlus when model is in VIDEO_MODELS."""
        request = VideoGenerationRequest(model="seedance-1-0-pro-250528", prompt="a flying bird")
        mock_client = _make_byteplus_client_mock()
        with patch(BYTEPLUS_PATCH, new=_byteplus_class_mock(mock_client)), \
             patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=_configured_provider_key()):
            result = await gateway.generate_video(request, MagicMock(id=1))
        mock_client.create_video_task.assert_awaited_once()
        assert result.provider == "byteplus_modelark"

    @pytest.mark.asyncio
    async def test_passes_reference_image_url_for_i2v(self, gateway):
        """generate_video passes reference_image_urls[0] as reference_image_url for I2V."""
        request = VideoGenerationRequest(
            model="seedance-1-0-lite-i2v-250428",
            prompt="a spinning globe",
            reference_image_urls=["https://cdn.example.com/ref.png", "https://cdn.example.com/other.png"],
        )
        mock_client = _make_byteplus_client_mock()
        with patch(BYTEPLUS_PATCH, new=_byteplus_class_mock(mock_client)), \
             patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=_configured_provider_key()):
            await gateway.generate_video(request, MagicMock(id=1))
        call_kwargs = mock_client.create_video_task.call_args[1]
        assert call_kwargs["reference_image_url"] == "https://cdn.example.com/ref.png"

    @pytest.mark.asyncio
    async def test_returns_video_generation_response_with_task_id(self, gateway):
        """generate_video returns VideoGenerationResponse with provider_task_id as id."""
        request = VideoGenerationRequest(model="seedance-1-0-pro-250528", prompt="a river flowing")
        mock_client = _make_byteplus_client_mock()
        with patch(BYTEPLUS_PATCH, new=_byteplus_class_mock(mock_client)), \
             patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=_configured_provider_key()):
            result = await gateway.generate_video(request, MagicMock(id=1))
        assert result.id == "bp-video-task-456"
        assert result.provider == "byteplus_modelark"
        assert result.data == []

    @pytest.mark.asyncio
    async def test_kieai_regression_non_byteplus_video_model(self, gateway):
        """generate_video falls through to Kie.ai for non-BytePlus model — no regression."""
        request = VideoGenerationRequest(model="kling-v1", prompt="a dog running")
        kie_mock = MagicMock()
        kie_mock.generate_video = AsyncMock(return_value={
            "id": "kie-vid-001",
            "data": [{"url": "https://example.com/dog.mp4"}],
            "created": 0,
            "kie_credits_consumed": None,
        })
        gateway.unified_client.kie_ai_client = kie_mock
        byteplus_cls_mock = _byteplus_class_mock(MagicMock())
        with patch(BYTEPLUS_PATCH, new=byteplus_cls_mock):
            result = await gateway.generate_video(request, MagicMock(id=1))
        byteplus_cls_mock.assert_not_called()
        assert result.provider == "kie_ai"

    @pytest.mark.asyncio
    async def test_raises_503_when_byteplus_not_configured(self, gateway):
        """generate_video raises HTTP 503 when BytePlus provider not configured."""
        request = VideoGenerationRequest(model="seedance-1-0-pro-250528", prompt="a sunset")
        with patch(BYTEPLUS_PATCH, new=_byteplus_class_mock(MagicMock())), \
             patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                await gateway.generate_video(request, MagicMock(id=1))
        assert exc_info.value.status_code == 503

    @pytest.mark.asyncio
    async def test_raises_503_when_video_api_key_missing(self, gateway):
        """generate_video raises HTTP 503 when provider config has empty apiKey."""
        request = VideoGenerationRequest(model="seedance-1-0-pro-250528", prompt="a canyon")
        with patch(BYTEPLUS_PATCH, new=_byteplus_class_mock(MagicMock())), \
             patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "", "baseUrl": None}):
            with pytest.raises(HTTPException) as exc_info:
                await gateway.generate_video(request, MagicMock(id=1))
        assert exc_info.value.status_code == 503

    @pytest.mark.asyncio
    async def test_aclose_called_in_finally(self, gateway):
        """aclose() is called on the BytePlus client in all cases."""
        request = VideoGenerationRequest(model="seedance-1-0-pro-250528", prompt="a waterfall")
        mock_client = _make_byteplus_client_mock()
        mock_client.create_video_task = AsyncMock(side_effect=RuntimeError("api error"))
        with patch(BYTEPLUS_PATCH, new=_byteplus_class_mock(mock_client)), \
             patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=_configured_provider_key()):
            with pytest.raises(HTTPException):
                await gateway.generate_video(request, MagicMock(id=1))
        mock_client.aclose.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_uses_request_resolution_and_duration(self, gateway):
        """generate_video passes resolution and duration from request fields."""
        request = VideoGenerationRequest(
            model="seedance-1-0-pro-250528",
            prompt="a landscape",
            resolution="720p",
            duration=10,
        )
        mock_client = _make_byteplus_client_mock()
        with patch(BYTEPLUS_PATCH, new=_byteplus_class_mock(mock_client)), \
             patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=_configured_provider_key()):
            await gateway.generate_video(request, MagicMock(id=1))
        call_kwargs = mock_client.create_video_task.call_args[1]
        assert call_kwargs["resolution"] == "720p"
        assert call_kwargs["duration"] == 10
