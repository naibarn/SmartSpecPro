"""Unit tests for fal.ai routing in gateway_unified.py."""

import pytest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from app.llm_proxy.gateway_unified import LLMGateway


# --- Provider ID Normalization ---


class TestProviderIdNormalization:
    def test_fal_ai_unchanged(self):
        assert LLMGateway._normalize_provider_id("fal_ai") == "fal_ai"

    def test_fal_short(self):
        assert LLMGateway._normalize_provider_id("fal") == "fal_ai"

    def test_falai_no_underscore(self):
        assert LLMGateway._normalize_provider_id("falai") == "fal_ai"

    def test_fal_ai_provider(self):
        assert LLMGateway._normalize_provider_id("fal_ai_provider") == "fal_ai"

    def test_existing_normalizations_regression(self):
        """Existing normalizations must still work."""
        assert LLMGateway._normalize_provider_id("byteplus") == "byteplus_modelark"
        assert LLMGateway._normalize_provider_id("kie") == "kie_ai"
        assert LLMGateway._normalize_provider_id("uvoice") == "uvoice"


# --- Video Routing ---


class TestVideoRouting:
    @pytest.fixture
    def gateway(self):
        mock_db = MagicMock()
        mock_unified_client = MagicMock()
        gw = LLMGateway.__new__(LLMGateway)
        gw.db = mock_db
        gw.unified_client = mock_unified_client
        return gw

    async def test_routes_to_fal_ai(self, gateway):
        """generate_video routes to FalAIProvider when resolved_provider == fal_ai."""
        mock_request = MagicMock()
        mock_request.model = "fal-ai/ltx-2.3/text-to-video"
        mock_request.prompt = "A beautiful sunset"
        mock_request.extra_params = {"width": 1920, "height": 1080}
        mock_request.api_config = {"provider": "fal_ai"}
        mock_request.resolution = "1080p"
        mock_request.duration = 5
        mock_request.reference_image_urls = None

        mock_user = MagicMock()
        mock_user.id = 1

        mock_provider_config = {"apiKey": "test-key-123", "baseUrl": None}

        with (
            patch.object(gateway, "_resolve_media_provider", new_callable=AsyncMock, return_value="fal_ai"),
            patch.object(gateway, "_estimate_cost", new_callable=AsyncMock, return_value=Decimal("0.10")),
            patch.object(gateway, "_check_credits", new_callable=AsyncMock),
            patch.object(gateway, "_check_fal_concurrent_limit", new_callable=AsyncMock),
            patch.object(gateway, "_deduct_credits", new_callable=AsyncMock, return_value=MagicMock(amount=-10, balance_after=Decimal("90.0"))),
            patch("app.services.media_provider_service.get_media_provider_key", new_callable=AsyncMock, return_value=mock_provider_config),
            patch("app.llm_proxy.providers.fal_ai_provider.FalAIProvider") as MockFalProvider,
        ):
            mock_fal_instance = AsyncMock()
            mock_fal_instance.generate_video.return_value = {"id": "req-123", "status": "PROCESSING"}
            MockFalProvider.return_value = mock_fal_instance

            result = await gateway.generate_video(mock_request, mock_user, wait_for_completion=False)

            MockFalProvider.assert_called_once_with(api_key="test-key-123")
            mock_fal_instance.generate_video.assert_called_once()
            assert result.id == "req-123"
            mock_fal_instance.aclose.assert_called_once()

    async def test_503_when_not_configured(self, gateway):
        """HTTPException 503 when fal_ai provider not configured."""
        from fastapi import HTTPException

        mock_request = MagicMock()
        mock_request.model = "fal-ai/ltx-2.3/text-to-video"
        mock_request.api_config = {"provider": "fal_ai"}
        mock_request.extra_params = {}
        mock_request.resolution = "1080p"
        mock_request.duration = 5
        mock_request.reference_image_urls = None

        mock_user = MagicMock()
        mock_user.id = 1

        with (
            patch.object(gateway, "_resolve_media_provider", new_callable=AsyncMock, return_value="fal_ai"),
            patch.object(gateway, "_estimate_cost", new_callable=AsyncMock, return_value=Decimal("0.10")),
            patch.object(gateway, "_check_credits", new_callable=AsyncMock),
            patch.object(gateway, "_check_fal_concurrent_limit", new_callable=AsyncMock),
            patch("app.services.media_provider_service.get_media_provider_key", new_callable=AsyncMock, return_value=None),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await gateway.generate_video(mock_request, mock_user)
            assert exc_info.value.status_code == 503

    async def test_aclose_called_on_error(self, gateway):
        """aclose() called in finally block even on error."""
        mock_request = MagicMock()
        mock_request.model = "fal-ai/ltx-2.3/text-to-video"
        mock_request.api_config = {"provider": "fal_ai"}
        mock_request.extra_params = {}
        mock_request.resolution = "1080p"
        mock_request.duration = 5
        mock_request.reference_image_urls = None

        mock_user = MagicMock()
        mock_user.id = 1

        mock_provider_config = {"apiKey": "test-key", "baseUrl": None}

        with (
            patch.object(gateway, "_resolve_media_provider", new_callable=AsyncMock, return_value="fal_ai"),
            patch.object(gateway, "_estimate_cost", new_callable=AsyncMock, return_value=Decimal("0.10")),
            patch.object(gateway, "_check_credits", new_callable=AsyncMock),
            patch.object(gateway, "_check_fal_concurrent_limit", new_callable=AsyncMock),
            patch("app.services.media_provider_service.get_media_provider_key", new_callable=AsyncMock, return_value=mock_provider_config),
            patch("app.llm_proxy.providers.fal_ai_provider.FalAIProvider") as MockFalProvider,
        ):
            mock_fal_instance = AsyncMock()
            mock_fal_instance.generate_video.side_effect = ValueError("some error")
            MockFalProvider.return_value = mock_fal_instance

            from fastapi import HTTPException
            with pytest.raises(HTTPException):
                await gateway.generate_video(mock_request, mock_user)

            mock_fal_instance.aclose.assert_called_once()


# --- Audio Routing ---


class TestAudioRouting:
    @pytest.fixture
    def gateway(self):
        mock_db = MagicMock()
        mock_unified_client = MagicMock()
        gw = LLMGateway.__new__(LLMGateway)
        gw.db = mock_db
        gw.unified_client = mock_unified_client
        return gw

    async def test_routes_to_fal_ai(self, gateway):
        """generate_audio routes to FalAIProvider when resolved_provider == fal_ai."""
        mock_request = MagicMock()
        mock_request.model = "fal-ai/lux-tts"
        mock_request.text = "Hello world"
        mock_request.api_config = {"provider": "fal_ai"}
        mock_request.extra_params = {}
        mock_request.voice_id = None
        mock_request.voice = None
        mock_request.speed = 1.0

        mock_user = MagicMock()
        mock_user.id = 1

        mock_provider_config = {"apiKey": "test-key-123", "baseUrl": None}

        with (
            patch.object(gateway, "_resolve_media_provider", new_callable=AsyncMock, return_value="fal_ai"),
            patch.object(gateway, "_normalize_audio_request_for_generation", return_value=mock_request),
            patch.object(gateway, "_estimate_cost", new_callable=AsyncMock, return_value=Decimal("0.05")),
            patch.object(gateway, "_check_credits", new_callable=AsyncMock),
            patch.object(gateway, "_check_fal_concurrent_limit", new_callable=AsyncMock),
            patch.object(gateway, "_deduct_credits", new_callable=AsyncMock, return_value=MagicMock(amount=-5, balance_after=Decimal("95.0"))),
            patch("app.services.media_provider_service.get_media_provider_key", new_callable=AsyncMock, return_value=mock_provider_config),
            patch("app.llm_proxy.providers.fal_ai_provider.FalAIProvider") as MockFalProvider,
        ):
            mock_fal_instance = AsyncMock()
            mock_fal_instance.generate_audio.return_value = {
                "data": [{"url": "https://v3b.fal.media/audio.mp3"}],
                "status": "COMPLETED",
            }
            MockFalProvider.return_value = mock_fal_instance

            result = await gateway.generate_audio(mock_request, mock_user)

            MockFalProvider.assert_called_once_with(api_key="test-key-123")
            assert result.data[0]["url"] == "https://v3b.fal.media/audio.mp3"
            mock_fal_instance.aclose.assert_called_once()

    async def test_gemini_tts_routes_prompt_payload(self, gateway):
        """Gemini 3.1 Flash TTS expects the narration body in `prompt`."""
        mock_request = MagicMock()
        mock_request.model = "fal-ai/gemini-3.1-flash-tts"
        mock_request.text = "Read this complete news script."
        mock_request.api_config = {"provider": "fal_ai"}
        mock_request.extra_params = {"style_instructions": "Crisp news voice", "text": "stale"}
        mock_request.voice_id = None
        mock_request.voice = None
        mock_request.speed = 1.0

        mock_user = MagicMock()
        mock_user.id = 1
        mock_provider_config = {"apiKey": "test-key-123", "baseUrl": None}

        with (
            patch.object(gateway, "_resolve_media_provider", new_callable=AsyncMock, return_value="fal_ai"),
            patch.object(gateway, "_normalize_audio_request_for_generation", return_value=mock_request),
            patch.object(gateway, "_estimate_cost", new_callable=AsyncMock, return_value=Decimal("0.05")),
            patch.object(gateway, "_check_credits", new_callable=AsyncMock),
            patch.object(gateway, "_check_fal_concurrent_limit", new_callable=AsyncMock),
            patch.object(gateway, "_deduct_credits", new_callable=AsyncMock, return_value=MagicMock(amount=-5, balance_after=Decimal("95.0"))),
            patch("app.services.media_provider_service.get_media_provider_key", new_callable=AsyncMock, return_value=mock_provider_config),
            patch("app.llm_proxy.providers.fal_ai_provider.FalAIProvider") as MockFalProvider,
        ):
            mock_fal_instance = AsyncMock()
            mock_fal_instance.generate_audio.return_value = {
                "data": [{"url": "https://v3b.fal.media/gemini.mp3"}],
                "status": "COMPLETED",
            }
            MockFalProvider.return_value = mock_fal_instance

            await gateway.generate_audio(mock_request, mock_user)

            mock_fal_instance.generate_audio.assert_called_once_with(
                "fal-ai/gemini-3.1-flash-tts",
                {
                    "style_instructions": "Crisp news voice",
                    "prompt": "Read this complete news script.",
                },
            )
            mock_fal_instance.aclose.assert_called_once()


# --- Image Routing ---


class TestImageRouting:
    @pytest.fixture
    def gateway(self):
        mock_db = MagicMock()
        mock_unified_client = MagicMock()
        gw = LLMGateway.__new__(LLMGateway)
        gw.db = mock_db
        gw.unified_client = mock_unified_client
        return gw

    async def test_routes_to_fal_ai(self, gateway):
        """generate_image routes to FalAIProvider when resolved_provider == fal_ai."""
        mock_request = MagicMock()
        mock_request.model = "fal-ai/flux/schnell"
        mock_request.prompt = "a cat"
        mock_request.api_config = {"provider": "fal_ai"}
        mock_request.extra_params = {}
        mock_request.size = "1024x1024"
        mock_request.reference_image_urls = None

        mock_user = MagicMock()
        mock_user.id = 1

        mock_provider_config = {"apiKey": "test-key-123", "baseUrl": None}

        with (
            patch.object(gateway, "_resolve_media_provider", new_callable=AsyncMock, return_value="fal_ai"),
            patch.object(gateway, "_estimate_cost", new_callable=AsyncMock, return_value=Decimal("0.03")),
            patch.object(gateway, "_check_credits", new_callable=AsyncMock),
            patch.object(gateway, "_check_fal_concurrent_limit", new_callable=AsyncMock),
            patch.object(gateway, "_deduct_credits", new_callable=AsyncMock, return_value=MagicMock(amount=-3, balance_after=Decimal("97.0"))),
            patch("app.services.media_provider_service.get_media_provider_key", new_callable=AsyncMock, return_value=mock_provider_config),
            patch("app.llm_proxy.providers.fal_ai_provider.FalAIProvider") as MockFalProvider,
        ):
            mock_fal_instance = AsyncMock()
            mock_fal_instance.generate_image.return_value = {
                "data": [{"url": "https://v3b.fal.media/img.png"}],
                "status": "COMPLETED",
            }
            MockFalProvider.return_value = mock_fal_instance

            result = await gateway.generate_image(mock_request, mock_user)

            MockFalProvider.assert_called_once_with(api_key="test-key-123")
            assert result.data[0]["url"] == "https://v3b.fal.media/img.png"
            mock_fal_instance.aclose.assert_called_once()


# --- Concurrent Task Limit ---


class TestConcurrentTaskLimit:
    @pytest.fixture
    def gateway(self):
        mock_db = MagicMock()
        gw = LLMGateway.__new__(LLMGateway)
        gw.db = mock_db
        return gw

    async def test_allows_zero_inflight(self, gateway):
        mock_result = MagicMock()
        mock_result.scalar.return_value = 0
        gateway.db.execute = AsyncMock(return_value=mock_result)

        # Should not raise
        await gateway._check_fal_concurrent_limit(user_id=1)

    async def test_uses_media_task_schema_columns(self, gateway):
        mock_result = MagicMock()
        mock_result.scalar.return_value = 0
        gateway.db.execute = AsyncMock(return_value=mock_result)

        await gateway._check_fal_concurrent_limit(user_id=1)

        query, params = gateway.db.execute.await_args.args
        query_sql = str(query)
        assert "user_id = :uid" in query_sql
        assert '"userId"' not in query_sql
        assert "status = :processing_status" in query_sql
        assert params["processing_status"] == "processing"

    async def test_allows_two_inflight(self, gateway):
        mock_result = MagicMock()
        mock_result.scalar.return_value = 2
        gateway.db.execute = AsyncMock(return_value=mock_result)

        # Should not raise
        await gateway._check_fal_concurrent_limit(user_id=1)

    async def test_rejects_three_inflight(self, gateway):
        mock_result = MagicMock()
        mock_result.scalar.return_value = 3
        gateway.db.execute = AsyncMock(return_value=mock_result)

        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await gateway._check_fal_concurrent_limit(user_id=1)
        assert exc_info.value.status_code == 429
