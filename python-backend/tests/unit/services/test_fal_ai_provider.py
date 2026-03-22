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
        assert FalAIProvider.AUDIO_MODELS == frozenset({"fal-ai/lux-tts"})

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
        assert provider.client.timeout == httpx.Timeout(300.0)

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
        provider = FalAIProvider(api_key="test-key")
        assert provider._derive_resolution(3840, 2160) == "2160p"

    def test_1440p_resolution(self):
        provider = FalAIProvider(api_key="test-key")
        assert provider._derive_resolution(2560, 1440) == "1440p"

    def test_1080p_resolution(self):
        provider = FalAIProvider(api_key="test-key")
        assert provider._derive_resolution(1920, 1080) == "1080p"

    def test_below_1440p_defaults_to_1080p(self):
        provider = FalAIProvider(api_key="test-key")
        assert provider._derive_resolution(1280, 720) == "1080p"


# --- Error Handling ---


class TestErrorHandling:
    @pytest.fixture
    def provider(self):
        return FalAIProvider(api_key="test-key")

    async def test_401_invalid_api_key(self, provider):
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Unauthorized", request=MagicMock(), response=mock_response
        )

        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
            with pytest.raises(ValueError, match="Invalid fal.ai API key"):
                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})

    async def test_422_content_policy(self, provider):
        mock_response = MagicMock()
        mock_response.status_code = 422
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Unprocessable", request=MagicMock(), response=mock_response
        )

        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
            with pytest.raises(ValueError, match="Content policy rejection"):
                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})

    async def test_429_rate_limit(self, provider):
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Too Many Requests", request=MagicMock(), response=mock_response
        )

        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
            with pytest.raises(ValueError, match="fal.ai rate limit exceeded"):
                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})

    async def test_500_no_body_in_message(self, provider):
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal server error details that should not leak"
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Internal Server Error", request=MagicMock(), response=mock_response
        )

        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
            with pytest.raises(ValueError, match=r"fal\.ai error \(HTTP 500\)"):
                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})


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
