"""SSRF validation tests for FalAIProvider."""

import pytest
import httpx
from unittest.mock import AsyncMock, patch, MagicMock

from app.llm_proxy.providers.fal_ai_provider import FalAIProvider


class TestSSRFValidation:
    @pytest.fixture
    def provider(self):
        return FalAIProvider(api_key="test-key")

    async def test_rejects_aws_metadata(self, provider):
        with pytest.raises(ValueError):
            await provider._validate_urls({"image_url": "http://169.254.169.254/latest/meta-data/"})

    async def test_rejects_localhost(self, provider):
        with pytest.raises(ValueError):
            await provider._validate_urls({"image_url": "http://localhost/secret"})

    async def test_rejects_127_0_0_1(self, provider):
        with pytest.raises(ValueError):
            await provider._validate_urls({"image_url": "http://127.0.0.1/secret"})

    async def test_rejects_10_network(self, provider):
        with pytest.raises(ValueError):
            await provider._validate_urls({"image_url": "http://10.0.0.1/internal"})

    async def test_rejects_192_168_network(self, provider):
        with pytest.raises(ValueError):
            await provider._validate_urls({"image_url": "http://192.168.1.1/internal"})

    async def test_rejects_host_docker_internal(self, provider):
        """fal.ai provider must reject host.docker.internal via validate_uri_strict."""
        with pytest.raises(ValueError, match="internal"):
            await provider._validate_urls({"image_url": "http://host.docker.internal/uploads/img.png"})

    async def test_allows_public_url(self, provider):
        # Should not raise
        await provider._validate_urls({"image_url": "https://example.com/image.png"})

    async def test_allows_fal_media_url(self, provider):
        # Should not raise
        await provider._validate_urls({"image_url": "https://v3b.fal.media/files/some-file.png"})

    async def test_validates_all_url_fields(self, provider):
        """All URL-like fields should be validated."""
        for field in ("image_url", "end_image_url", "audio_url", "video_url"):
            with pytest.raises(ValueError):
                await provider._validate_urls({field: "http://127.0.0.1/evil"})

    async def test_none_url_fields_skipped(self, provider):
        # Should not raise when URL fields are None
        await provider._validate_urls({"image_url": None, "prompt": "test"})

    async def test_non_url_fields_ignored(self, provider):
        # Non-URL fields should not be validated
        await provider._validate_urls({"prompt": "http://127.0.0.1/not-a-url-field", "width": 1920})

    async def test_rejects_172_16_network(self, provider):
        with pytest.raises(ValueError):
            await provider._validate_urls({"image_url": "http://172.16.0.1/internal"})

    async def test_rejects_172_31_network(self, provider):
        with pytest.raises(ValueError):
            await provider._validate_urls({"image_url": "http://172.31.255.255/internal"})

    async def test_rejects_zero_bind(self, provider):
        with pytest.raises(ValueError):
            await provider._validate_urls({"image_url": "http://0.0.0.0:3000"})

    async def test_allows_gcs_url(self, provider):
        await provider._validate_urls({"image_url": "https://storage.googleapis.com/bucket/file.wav"})

    async def test_absent_url_fields_skipped(self, provider):
        # No URL fields at all — should not raise
        await provider._validate_urls({"prompt": "test", "duration": 5})


class TestPromptSanitization:
    @pytest.fixture
    def provider(self):
        return FalAIProvider(api_key="test-key")

    def test_strips_script_tags(self, provider):
        result = provider._sanitize_prompt("Hello <script>alert(1)</script> world")
        assert "<script>" not in result
        assert "</script>" not in result
        assert "Hello" in result
        assert "world" in result

    def test_strips_img_tags(self, provider):
        result = provider._sanitize_prompt('Test <img src="x" onerror="alert(1)"> end')
        assert "<img" not in result
        assert "Test" in result
        assert "end" in result

    def test_preserves_plain_text(self, provider):
        result = provider._sanitize_prompt("A beautiful sunset over the ocean")
        assert result == "A beautiful sunset over the ocean"


class TestVideoFileSizeValidation:
    @pytest.fixture
    def provider(self):
        return FalAIProvider(api_key="test-key")

    async def test_video_url_over_500mb_rejected(self, provider):
        mock_head_response = MagicMock()
        mock_head_response.headers = {"Content-Length": str(600 * 1024 * 1024)}
        mock_head_response.raise_for_status = MagicMock()

        with patch.object(
            provider.client, "head", new_callable=AsyncMock, return_value=mock_head_response
        ):
            with pytest.raises(ValueError, match="500MB"):
                await provider._validate_urls({"video_url": "https://example.com/big-video.mp4"})

    async def test_video_url_under_500mb_allowed(self, provider):
        mock_head_response = MagicMock()
        mock_head_response.headers = {"Content-Length": str(100 * 1024 * 1024)}  # 100MB
        mock_head_response.raise_for_status = MagicMock()

        with patch.object(
            provider.client, "head", new_callable=AsyncMock, return_value=mock_head_response
        ):
            await provider._validate_urls({"video_url": "https://example.com/video.mp4"})

    async def test_head_request_failure_allows_through(self, provider):
        """HEAD request failure is best-effort — allow the request."""
        with patch.object(
            provider.client, "head", new_callable=AsyncMock,
            side_effect=httpx.RequestError("Network error")
        ):
            await provider._validate_urls({"video_url": "https://example.com/video.mp4"})

    async def test_no_head_for_image_url(self, provider):
        """Only video_url should trigger HEAD check."""
        with patch.object(
            provider.client, "head", new_callable=AsyncMock
        ) as mock_head:
            await provider._validate_urls({"image_url": "https://example.com/img.png"})
            mock_head.assert_not_called()

    async def test_missing_content_length_handled(self, provider):
        mock_head_response = MagicMock()
        mock_head_response.headers = {}
        mock_head_response.raise_for_status = MagicMock()

        with patch.object(
            provider.client, "head", new_callable=AsyncMock, return_value=mock_head_response
        ):
            # Should not raise when Content-Length is missing
            await provider._validate_urls({"video_url": "https://example.com/video.mp4"})
