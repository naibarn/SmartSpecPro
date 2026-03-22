"""SSRF validation tests for FalAIProvider."""

import pytest
import httpx
from unittest.mock import AsyncMock, patch, MagicMock

from app.llm_proxy.providers.fal_ai_provider import FalAIProvider


class TestSSRFValidation:
    @pytest.fixture
    def provider(self):
        return FalAIProvider(api_key="test-key")

    def test_rejects_aws_metadata(self, provider):
        with pytest.raises(ValueError):
            provider._validate_urls({"image_url": "http://169.254.169.254/latest/meta-data/"})

    def test_rejects_localhost(self, provider):
        with pytest.raises(ValueError):
            provider._validate_urls({"image_url": "http://localhost/secret"})

    def test_rejects_127_0_0_1(self, provider):
        with pytest.raises(ValueError):
            provider._validate_urls({"image_url": "http://127.0.0.1/secret"})

    def test_rejects_10_network(self, provider):
        with pytest.raises(ValueError):
            provider._validate_urls({"image_url": "http://10.0.0.1/internal"})

    def test_rejects_192_168_network(self, provider):
        with pytest.raises(ValueError):
            provider._validate_urls({"image_url": "http://192.168.1.1/internal"})

    def test_rejects_host_docker_internal(self, provider):
        """fal.ai provider must reject host.docker.internal even though base SSRF allows it."""
        with pytest.raises(ValueError, match="host.docker.internal"):
            provider._validate_urls({"image_url": "http://host.docker.internal/uploads/img.png"})

    def test_allows_public_url(self, provider):
        # Should not raise
        provider._validate_urls({"image_url": "https://example.com/image.png"})

    def test_allows_fal_media_url(self, provider):
        # Should not raise
        provider._validate_urls({"image_url": "https://v3b.fal.media/files/some-file.png"})

    def test_validates_all_url_fields(self, provider):
        """All URL-like fields should be validated."""
        for field in ("image_url", "end_image_url", "audio_url", "video_url"):
            with pytest.raises(ValueError):
                provider._validate_urls({field: "http://127.0.0.1/evil"})

    def test_none_url_fields_skipped(self, provider):
        # Should not raise when URL fields are None
        provider._validate_urls({"image_url": None, "prompt": "test"})

    def test_non_url_fields_ignored(self, provider):
        # Non-URL fields should not be validated
        provider._validate_urls({"prompt": "http://127.0.0.1/not-a-url-field", "width": 1920})


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

    def test_video_url_over_500mb_rejected(self, provider):
        mock_response = MagicMock()
        mock_response.headers = {"Content-Length": str(600 * 1024 * 1024)}
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.head.return_value = mock_response

        with patch("app.llm_proxy.providers.fal_ai_provider.httpx.Client", return_value=mock_client):
            with pytest.raises(ValueError, match="500MB"):
                provider._validate_urls({"video_url": "https://example.com/big-video.mp4"})

    def test_missing_content_length_handled(self, provider):
        mock_response = MagicMock()
        mock_response.headers = {}
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.head.return_value = mock_response

        with patch("app.llm_proxy.providers.fal_ai_provider.httpx.Client", return_value=mock_client):
            # Should not raise when Content-Length is missing
            provider._validate_urls({"video_url": "https://example.com/video.mp4"})
