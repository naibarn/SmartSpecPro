"""Unit tests for FalAIProvider."""

import pytest
import httpx
from unittest.mock import AsyncMock, patch, MagicMock

from app.llm_proxy.providers.fal_ai_provider import FalAIProvider


# --- Constants ---


class TestConstants:
    def test_video_models_count(self):
        assert len(FalAIProvider.VIDEO_MODELS) == 7

    def test_video_models_are_frozenset(self):
        assert isinstance(FalAIProvider.VIDEO_MODELS, frozenset)

    def test_video_models_contain_ltx(self):
        assert "fal-ai/ltx-2.3/text-to-video" in FalAIProvider.VIDEO_MODELS
        assert "fal-ai/ltx-2.3/text-to-video/fast" in FalAIProvider.VIDEO_MODELS
        assert "fal-ai/ltx-2.3/image-to-video" in FalAIProvider.VIDEO_MODELS
        assert "fal-ai/ltx-2.3/image-to-video/fast" in FalAIProvider.VIDEO_MODELS
        assert "fal-ai/ltx-2.3/audio-to-video" in FalAIProvider.VIDEO_MODELS
        assert "fal-ai/ltx-2.3/extend-video" in FalAIProvider.VIDEO_MODELS
        assert "fal-ai/ltx-2.3/retake-video" in FalAIProvider.VIDEO_MODELS

    def test_audio_models(self):
        assert FalAIProvider.AUDIO_MODELS == frozenset({
            "fal-ai/gemini-3.1-flash-tts",
            "fal-ai/lux-tts",
        })

    def test_image_models_count(self):
        assert len(FalAIProvider.IMAGE_MODELS) == 4

    def test_image_models_are_frozenset(self):
        assert isinstance(FalAIProvider.IMAGE_MODELS, frozenset)

    def test_base_url(self):
        assert FalAIProvider.BASE_URL == "https://fal.run"

    def test_queue_base_url(self):
        assert FalAIProvider.QUEUE_BASE_URL == "https://queue.fal.run"


# --- Init ---


class TestInit:
    def test_auth_header_format(self):
        provider = FalAIProvider(api_key="test-key-123")
        assert provider._headers["Authorization"] == "Key test-key-123"

    def test_httpx_timeout(self):
        provider = FalAIProvider(api_key="test-key")
        assert provider.client.timeout.read == 300.0
        assert provider.client.timeout.connect == 10.0

    def test_custom_base_url(self):
        provider = FalAIProvider(api_key="test-key", base_url="https://custom.fal.run")
        assert provider.base_url == "https://custom.fal.run"

    def test_default_base_url(self):
        provider = FalAIProvider(api_key="test-key")
        assert provider.base_url == "https://fal.run"


# --- generate_video (queue) ---


class TestGenerateVideo:
    @pytest.fixture
    def provider(self):
        return FalAIProvider(api_key="test-key")

    async def test_posts_to_queue_endpoint(self, provider):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"request_id": "req-123", "status": "IN_QUEUE"}
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
            result = await provider.generate_video("fal-ai/ltx-2.3/text-to-video", {"prompt": "test"})

            mock_post.assert_called_once()
            call_url = mock_post.call_args[0][0]
            assert call_url.startswith("https://queue.fal.run/")
            assert "fal-ai/ltx-2.3/text-to-video" in call_url

        assert result["id"] == "req-123"
        assert result["status"] == "PROCESSING"

    async def test_validates_urls_before_request(self, provider):
        with patch.object(provider, "_validate_urls", new_callable=AsyncMock) as mock_validate:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"request_id": "req-123", "status": "IN_QUEUE"}
            mock_response.raise_for_status = MagicMock()

            with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
                await provider.generate_video(
                    "fal-ai/ltx-2.3/text-to-video",
                    {"prompt": "test", "image_url": "https://example.com/img.png"},
                )
                mock_validate.assert_called_once()

    async def test_sanitizes_prompt(self, provider):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"request_id": "req-123", "status": "IN_QUEUE"}
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
            await provider.generate_video(
                "fal-ai/ltx-2.3/text-to-video",
                {"prompt": "Hello <script>alert(1)</script> world"},
            )
            posted_payload = mock_post.call_args[1]["json"]
            assert "<script>" not in posted_payload["prompt"]
            assert "Hello" in posted_payload["prompt"]
            assert "world" in posted_payload["prompt"]


# --- generate_audio (sync TTS) ---


class TestGenerateAudio:
    @pytest.fixture
    def provider(self):
        return FalAIProvider(api_key="test-key")

    async def test_posts_to_sync_endpoint(self, provider):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"audio": {"url": "https://v3b.fal.media/audio.mp3"}}
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
            result = await provider.generate_audio("fal-ai/lux-tts", {"text": "Hello world"})

            mock_post.assert_called_once()
            call_url = mock_post.call_args[0][0]
            assert call_url.startswith("https://fal.run/")

        assert result["status"] == "COMPLETED"
        assert result["data"][0]["url"] == "https://v3b.fal.media/audio.mp3"

    async def test_validates_audio_url(self, provider):
        with patch.object(provider, "_validate_urls", new_callable=AsyncMock) as mock_validate:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"audio": {"url": "https://v3b.fal.media/audio.mp3"}}
            mock_response.raise_for_status = MagicMock()

            with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
                await provider.generate_audio(
                    "fal-ai/lux-tts",
                    {"text": "Hello", "audio_url": "https://example.com/ref.mp3"},
                )
                mock_validate.assert_called_once()

    async def test_gemini_flash_tts_uses_queue_submit_and_result(self, provider):
        submit_response = MagicMock()
        submit_response.status_code = 200
        submit_response.json.return_value = {"request_id": "req-tts-123", "status": "IN_QUEUE"}
        submit_response.raise_for_status = MagicMock()

        status_response = MagicMock()
        status_response.status_code = 200
        status_response.json.return_value = {"status": "COMPLETED"}
        status_response.raise_for_status = MagicMock()

        result_response = MagicMock()
        result_response.status_code = 200
        result_response.json.return_value = {
            "audio": {"url": "https://v3b.fal.media/gemini.mp3", "duration": 12.5}
        }
        result_response.raise_for_status = MagicMock()

        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=submit_response) as mock_post, \
             patch.object(provider.client, "get", new_callable=AsyncMock, side_effect=[status_response, result_response]) as mock_get:
            result = await provider.generate_audio(
                "fal-ai/gemini-3.1-flash-tts",
                {"prompt": "Hello world"},
            )

        assert mock_post.call_args[0][0].startswith("https://queue.fal.run/")
        assert "fal-ai/gemini-3.1-flash-tts" in mock_post.call_args[0][0]
        assert mock_get.await_count == 2
        assert result["id"] == "req-tts-123"
        assert result["status"] == "COMPLETED"
        assert result["data"][0]["url"] == "https://v3b.fal.media/gemini.mp3"
        assert result["actual_duration"] == 12.5


# --- generate_image (sync Flux) ---


class TestGenerateImage:
    @pytest.fixture
    def provider(self):
        return FalAIProvider(api_key="test-key")

    async def test_posts_to_sync_endpoint(self, provider):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "images": [{"url": "https://v3b.fal.media/img.png", "width": 1024, "height": 1024}]
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
            result = await provider.generate_image("fal-ai/flux/schnell", {"prompt": "a cat"})

            mock_post.assert_called_once()
            call_url = mock_post.call_args[0][0]
            assert call_url.startswith("https://fal.run/")

        assert result["status"] == "COMPLETED"
        assert result["data"][0]["url"] == "https://v3b.fal.media/img.png"


# --- Queue Operations ---


class TestQueueOperations:
    @pytest.fixture
    def provider(self):
        return FalAIProvider(api_key="test-key")

    async def test_submit_queue_returns_request_id(self, provider):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"request_id": "abc-123-def", "status": "IN_QUEUE"}
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
            request_id = await provider._submit_queue("fal-ai/ltx-2.3/text-to-video", {"prompt": "test"})
            assert request_id == "abc-123-def"

    async def test_get_queue_status(self, provider):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "IN_PROGRESS"}
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider.client, "get", new_callable=AsyncMock, return_value=mock_response):
            result = await provider.get_queue_status("fal-ai/ltx-2.3/text-to-video", "req-123")
            assert result["status"] == "IN_PROGRESS"

    async def test_get_queue_result_normalizes(self, provider):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "video": {
                "url": "https://v3b.fal.media/video.mp4",
                "width": 1920,
                "height": 1080,
                "duration": 6.0,
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider.client, "get", new_callable=AsyncMock, return_value=mock_response):
            result = await provider.get_queue_result("fal-ai/ltx-2.3/text-to-video", "req-123")
            assert result["data"][0]["url"] == "https://v3b.fal.media/video.mp4"
            assert result["actual_duration"] == 6.0
            assert result["actual_resolution"] == "1080p"


# --- Resolution derivation ---


class TestResolutionDerivation:
    def test_4k_resolution(self):
        assert FalAIProvider._derive_resolution(3840) == "2160p"

    def test_1440p_resolution(self):
        assert FalAIProvider._derive_resolution(2560) == "1440p"

    def test_1080p_resolution(self):
        assert FalAIProvider._derive_resolution(1920) == "1080p"

    def test_below_1440p_defaults_to_1080p(self):
        assert FalAIProvider._derive_resolution(1280) == "1080p"


# --- Error Handling ---


class TestErrorHandling:
    @pytest.fixture
    def provider(self):
        return FalAIProvider(api_key="test-key")

    async def test_401_raises_httpx_error(self, provider):
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Unauthorized", request=MagicMock(), response=mock_response
        )

        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
            with pytest.raises(httpx.HTTPStatusError) as exc_info:
                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})
            assert exc_info.value.response.status_code == 401

    async def test_422_raises_httpx_error(self, provider):
        mock_response = MagicMock()
        mock_response.status_code = 422
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Unprocessable", request=MagicMock(), response=mock_response
        )

        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
            with pytest.raises(httpx.HTTPStatusError) as exc_info:
                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})
            assert exc_info.value.response.status_code == 422

    async def test_429_raises_httpx_error(self, provider):
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Too Many Requests", request=MagicMock(), response=mock_response
        )

        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
            with pytest.raises(httpx.HTTPStatusError) as exc_info:
                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})
            assert exc_info.value.response.status_code == 429

    async def test_500_raises_httpx_error_no_body_leak(self, provider):
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal server error details that should not leak"
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Internal Server Error", request=MagicMock(), response=mock_response
        )

        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
            with pytest.raises(httpx.HTTPStatusError):
                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})

    def test_map_http_error_to_message(self):
        assert FalAIProvider.map_http_error_to_message(401) == "Invalid fal.ai API key"
        assert "access denied" in FalAIProvider.map_http_error_to_message(403)
        assert FalAIProvider.map_http_error_to_message(422) == "Content policy rejection"
        assert FalAIProvider.map_http_error_to_message(429) == "fal.ai rate limit exceeded"
        assert FalAIProvider.map_http_error_to_message(503) == "fal.ai error (HTTP 503)"


# --- Resource Cleanup ---


class TestPromptSanitization:
    """Test _sanitize_prompt method."""

    def test_strips_script_tags(self):
        assert FalAIProvider._sanitize_prompt("<script>alert('x')</script>") == "alert('x')"

    def test_strips_img_tags(self):
        assert FalAIProvider._sanitize_prompt("<img src=x onerror=alert(1)>") == ""

    def test_strips_bold_tags(self):
        assert FalAIProvider._sanitize_prompt("<b>bold</b>") == "bold"

    def test_preserves_plain_text(self):
        assert FalAIProvider._sanitize_prompt("A cat on a rooftop") == "A cat on a rooftop"

    def test_empty_prompt(self):
        assert FalAIProvider._sanitize_prompt("") == ""

    def test_only_tags(self):
        assert FalAIProvider._sanitize_prompt("<div></div>") == ""

    def test_nested_tags(self):
        assert FalAIProvider._sanitize_prompt("<div><span>text</span></div>") == "text"


class TestResourceCleanup:
    async def test_aclose_closes_client(self):
        provider = FalAIProvider(api_key="test-key")
        with patch.object(provider.client, "aclose", new_callable=AsyncMock) as mock_close:
            await provider.aclose()
            mock_close.assert_called_once()

    async def test_async_context_manager(self):
        async with FalAIProvider(api_key="test-key") as provider:
            assert provider is not None


# --- Security: Input Validation ---


class TestModelIdValidation:
    def test_valid_video_model(self):
        FalAIProvider._validate_model_id("fal-ai/ltx-2.3/text-to-video", FalAIProvider.VIDEO_MODELS)

    def test_invalid_model_raises(self):
        with pytest.raises(ValueError, match="Unknown fal.ai model"):
            FalAIProvider._validate_model_id("fal-ai/ltx/../../../admin", FalAIProvider.VIDEO_MODELS)

    def test_audio_model_rejected_for_video(self):
        with pytest.raises(ValueError, match="Unknown fal.ai model"):
            FalAIProvider._validate_model_id("fal-ai/lux-tts", FalAIProvider.VIDEO_MODELS)

    def test_valid_audio_model(self):
        FalAIProvider._validate_model_id("fal-ai/lux-tts", FalAIProvider.AUDIO_MODELS)
        FalAIProvider._validate_model_id("fal-ai/gemini-3.1-flash-tts", FalAIProvider.AUDIO_MODELS)

    def test_all_models_combined(self):
        assert len(FalAIProvider.ALL_MODELS) == 13  # 7 + 2 + 4


class TestRequestIdValidation:
    def test_valid_request_id(self):
        FalAIProvider._validate_request_id("abc-123-def-456")

    def test_rejects_path_traversal(self):
        with pytest.raises(ValueError, match="Invalid fal.ai request_id"):
            FalAIProvider._validate_request_id("../../admin")

    def test_rejects_query_injection(self):
        with pytest.raises(ValueError, match="Invalid fal.ai request_id"):
            FalAIProvider._validate_request_id("id?key=val")

    def test_rejects_empty(self):
        with pytest.raises(ValueError, match="Invalid fal.ai request_id"):
            FalAIProvider._validate_request_id("")

    def test_rejects_too_short(self):
        with pytest.raises(ValueError, match="Invalid fal.ai request_id"):
            FalAIProvider._validate_request_id("ab")


class TestDeriveResolutionSafety:
    def test_string_width_returns_default(self):
        assert FalAIProvider._derive_resolution("big") == "1080p"

    def test_none_width_returns_default(self):
        assert FalAIProvider._derive_resolution(None) == "1080p"

    def test_float_width(self):
        assert FalAIProvider._derive_resolution(3840.5) == "2160p"
