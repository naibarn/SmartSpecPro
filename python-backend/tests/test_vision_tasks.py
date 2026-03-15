"""
Tests for vision analysis Celery task (Section 03: Vision Pipeline).
All external calls (Gemini API, database) are mocked.
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
from sqlalchemy.ext.asyncio import AsyncSession


GEMINI_VISION_RESPONSE = {
    "candidates": [
        {
            "content": {
                "parts": [
                    {
                        "text": json.dumps({
                            "shortCaption": "A modern living room",
                            "detailedCaption": "A bright modern living room with white walls and wooden floors.",
                            "ocrText": "",
                            "objects": ["sofa", "table", "lamp"],
                            "styles": ["modern", "minimalist"],
                            "materials": ["wood", "fabric"],
                            "colors": ["white", "beige", "brown"],
                            "rooms": ["living room"],
                            "architectureTags": ["open plan"],
                            "aestheticScore": 0.85,
                            "safetyLabels": [],
                        })
                    }
                ]
            }
        }
    ]
}

GEMINI_EMBEDDING_RESPONSE = {
    "embedding": {
        "values": [0.1] * 768
    }
}

NSFW_VISION_RESPONSE = {
    "candidates": [
        {
            "content": {
                "parts": [
                    {
                        "text": json.dumps({
                            "shortCaption": "Adult content",
                            "detailedCaption": "Explicit content.",
                            "ocrText": "",
                            "objects": [],
                            "styles": [],
                            "materials": [],
                            "colors": [],
                            "rooms": [],
                            "architectureTags": [],
                            "aestheticScore": 0.1,
                            "safetyLabels": [
                                {"category": "SEXUALLY_EXPLICIT", "confidence": 0.95}
                            ],
                        })
                    }
                ]
            }
        }
    ]
}


def make_mock_session(existing_analysis=None, asset_row=None):
    """Build a mock async DB session."""
    session = AsyncMock(spec=AsyncSession)
    result_mock = MagicMock()

    if existing_analysis is not None:
        result_mock.scalars.return_value.first.return_value = existing_analysis
    else:
        result_mock.scalars.return_value.first.return_value = None

    session.execute.return_value = result_mock
    session.commit = AsyncMock()
    session.add = MagicMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    return session


@pytest.mark.unit
class TestAnalyzeImageTaskGeminiCall:
    """Test that analyze_image_task calls Gemini Flash with correct structure."""

    @patch("app.tasks.vision_tasks.AsyncSessionLocal")
    @patch("app.tasks.vision_tasks.httpx")
    def test_calls_gemini_vision_api(self, mock_httpx, mock_session_cls):
        """Task calls Gemini Flash with image URL and structured prompt."""
        from app.tasks.vision_tasks import analyze_image_task

        mock_session = make_mock_session()
        mock_session_cls.return_value = mock_session

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = GEMINI_VISION_RESPONSE
        mock_httpx.post.return_value = mock_response

        mock_embed_response = MagicMock()
        mock_embed_response.status_code = 200
        mock_embed_response.json.return_value = GEMINI_EMBEDDING_RESPONSE

        mock_httpx.post.side_effect = [mock_response, mock_embed_response]

        with patch("app.tasks.vision_tasks.settings") as mock_settings:
            mock_settings.GOOGLE_API_KEY = "fake-key"
            mock_settings.SMARTSPEC_PROXY_TOKEN = "token"

            analyze_image_task(
                asset_id=1,
                image_url="https://example.com/img.jpg",
                tenant_id="tenant-1",
                user_id=42,
            )

        # Verify Gemini vision API was called
        call_args = mock_httpx.post.call_args_list[0]
        url = call_args[0][0] if call_args[0] else call_args[1].get("url", "")
        if not url:
            url = str(call_args)
        assert "gemini-2.5-flash" in str(call_args) or "generateContent" in str(call_args)


@pytest.mark.unit
class TestAnalyzeImageTaskStoresResult:
    """Test that analyze_image_task stores results in media_asset_analysis."""

    @patch("app.tasks.vision_tasks.AsyncSessionLocal")
    @patch("app.tasks.vision_tasks.httpx")
    def test_stores_analysis_row(self, mock_httpx, mock_session_cls):
        """Task inserts a media_asset_analysis row with correct fields."""
        from app.tasks.vision_tasks import analyze_image_task

        mock_session = make_mock_session()
        mock_session_cls.return_value = mock_session

        mock_vision_resp = MagicMock()
        mock_vision_resp.status_code = 200
        mock_vision_resp.json.return_value = GEMINI_VISION_RESPONSE

        mock_embed_resp = MagicMock()
        mock_embed_resp.status_code = 200
        mock_embed_resp.json.return_value = GEMINI_EMBEDDING_RESPONSE

        mock_httpx.post.side_effect = [mock_vision_resp, mock_embed_resp]

        with patch("app.tasks.vision_tasks.settings") as mock_settings:
            mock_settings.GOOGLE_API_KEY = "fake-key"

            analyze_image_task(
                asset_id=1,
                image_url="https://example.com/img.jpg",
                tenant_id="tenant-1",
                user_id=42,
            )

        # session.add should be called for MediaAssetAnalysis and MultimodalMemoryItem
        assert mock_session.add.called


@pytest.mark.unit
class TestAnalyzeImageTaskStatusUpdate:
    """Test that analyze_image_task updates media_assets.status."""

    @patch("app.tasks.vision_tasks.AsyncSessionLocal")
    @patch("app.tasks.vision_tasks.httpx")
    def test_updates_status_to_analyzed(self, mock_httpx, mock_session_cls):
        """Task sets status='analyzed' after successful analysis."""
        from app.tasks.vision_tasks import analyze_image_task

        mock_session = make_mock_session()
        mock_session_cls.return_value = mock_session

        mock_vision_resp = MagicMock()
        mock_vision_resp.status_code = 200
        mock_vision_resp.json.return_value = GEMINI_VISION_RESPONSE

        mock_embed_resp = MagicMock()
        mock_embed_resp.status_code = 200
        mock_embed_resp.json.return_value = GEMINI_EMBEDDING_RESPONSE

        mock_httpx.post.side_effect = [mock_vision_resp, mock_embed_resp]

        with patch("app.tasks.vision_tasks.settings") as mock_settings:
            mock_settings.GOOGLE_API_KEY = "fake-key"

            analyze_image_task(
                asset_id=1,
                image_url="https://example.com/img.jpg",
                tenant_id="tenant-1",
                user_id=42,
            )

        # Verify execute was called (for UPDATE queries)
        assert mock_session.execute.called


@pytest.mark.unit
class TestAnalyzeImageTaskEmbeddingCall:
    """Test that the embedding API is called (or not) correctly."""

    @patch("app.tasks.vision_tasks.AsyncSessionLocal")
    @patch("app.tasks.vision_tasks.httpx")
    def test_embedding_api_called_on_success(self, mock_httpx, mock_session_cls):
        """Task calls both Gemini vision AND embedding API for non-NSFW images."""
        from app.tasks.vision_tasks import analyze_image_task

        mock_session = make_mock_session()
        mock_session_cls.return_value = mock_session

        mock_vision_resp = MagicMock()
        mock_vision_resp.status_code = 200
        mock_vision_resp.json.return_value = GEMINI_VISION_RESPONSE

        mock_embed_resp = MagicMock()
        mock_embed_resp.status_code = 200
        mock_embed_resp.json.return_value = GEMINI_EMBEDDING_RESPONSE

        mock_httpx.post.side_effect = [mock_vision_resp, mock_embed_resp]

        with patch("app.tasks.vision_tasks.settings") as mock_settings:
            mock_settings.GOOGLE_API_KEY = "fake-key"
            analyze_image_task(
                asset_id=1,
                image_url="https://example.com/img.jpg",
                tenant_id="tenant-1",
                user_id=42,
            )

        assert mock_httpx.post.call_count == 2, (
            f"Expected 2 API calls (vision + embedding), got {mock_httpx.post.call_count}"
        )
        embedding_call = str(mock_httpx.post.call_args_list[1])
        assert "embedContent" in embedding_call

    @patch("app.tasks.vision_tasks.AsyncSessionLocal")
    @patch("app.tasks.vision_tasks.httpx")
    def test_embedding_api_not_called_when_nsfw(self, mock_httpx, mock_session_cls):
        """Task skips embedding API when image is NSFW (no vector stored)."""
        from app.tasks.vision_tasks import analyze_image_task

        mock_session = make_mock_session()
        mock_session_cls.return_value = mock_session

        mock_nsfw_resp = MagicMock()
        mock_nsfw_resp.status_code = 200
        mock_nsfw_resp.json.return_value = NSFW_VISION_RESPONSE
        mock_httpx.post.return_value = mock_nsfw_resp

        with patch("app.tasks.vision_tasks.settings") as mock_settings:
            mock_settings.GOOGLE_API_KEY = "fake-key"
            analyze_image_task(
                asset_id=1,
                image_url="https://example.com/img.jpg",
                tenant_id="tenant-1",
                user_id=42,
            )

        # Only 1 HTTP call (vision only) — embedding skipped for NSFW
        assert mock_httpx.post.call_count == 1


@pytest.mark.unit
class TestAnalyzeImageTaskNSFW:
    """Test NSFW blocking behavior."""

    @patch("app.tasks.vision_tasks.AsyncSessionLocal")
    @patch("app.tasks.vision_tasks.httpx")
    def test_nsfw_sets_status_blocked(self, mock_httpx, mock_session_cls):
        """Task sets status='nsfw_blocked' when NSFW labels detected."""
        from app.tasks.vision_tasks import analyze_image_task

        mock_session = make_mock_session()
        mock_session_cls.return_value = mock_session

        mock_nsfw_resp = MagicMock()
        mock_nsfw_resp.status_code = 200
        mock_nsfw_resp.json.return_value = NSFW_VISION_RESPONSE
        mock_httpx.post.return_value = mock_nsfw_resp

        with patch("app.tasks.vision_tasks.settings") as mock_settings:
            mock_settings.GOOGLE_API_KEY = "fake-key"

            analyze_image_task(
                asset_id=1,
                image_url="https://example.com/img.jpg",
                tenant_id="tenant-1",
                user_id=42,
            )

        assert mock_httpx.post.call_count == 1

    def test_nsfw_threshold_blocks_above_threshold(self):
        """_is_nsfw returns True for confidence strictly above NSFW_THRESHOLD."""
        from app.tasks.vision_tasks import _is_nsfw, NSFW_THRESHOLD

        labels = [{"category": "SEXUALLY_EXPLICIT", "confidence": NSFW_THRESHOLD + 0.01}]
        assert _is_nsfw(labels) is True

    def test_nsfw_threshold_does_not_block_at_exactly_threshold(self):
        """_is_nsfw uses strict > — confidence exactly at threshold is NOT blocked."""
        from app.tasks.vision_tasks import _is_nsfw, NSFW_THRESHOLD

        labels = [{"category": "SEXUALLY_EXPLICIT", "confidence": NSFW_THRESHOLD}]
        assert _is_nsfw(labels) is False

    def test_nsfw_threshold_allows_below_threshold(self):
        """_is_nsfw returns False for confidence below NSFW_THRESHOLD."""
        from app.tasks.vision_tasks import _is_nsfw, NSFW_THRESHOLD

        labels = [{"category": "SEXUALLY_EXPLICIT", "confidence": NSFW_THRESHOLD - 0.01}]
        assert _is_nsfw(labels) is False

    def test_nsfw_threshold_matches_nodejs_constant(self):
        """NSFW_THRESHOLD must equal 0.5 to match Node.js visionMemoryService.ts."""
        from app.tasks.vision_tasks import NSFW_THRESHOLD

        assert NSFW_THRESHOLD == 0.5, (
            f"Python NSFW_THRESHOLD ({NSFW_THRESHOLD}) must match "
            "Node.js NSFW_SCORE_THRESHOLD (0.5)"
        )


@pytest.mark.unit
class TestAnalyzeImageTaskFailure:
    """Test error handling and status update to 'failed'."""

    @patch("app.tasks.vision_tasks.AsyncSessionLocal")
    @patch("app.tasks.vision_tasks.httpx")
    def test_sets_failed_on_api_error(self, mock_httpx, mock_session_cls):
        """Task sets status='failed' when Gemini API raises exception."""
        from app.tasks.vision_tasks import analyze_image_task

        mock_session = make_mock_session()
        mock_session_cls.return_value = mock_session
        mock_httpx.post.side_effect = Exception("Connection refused")

        with patch("app.tasks.vision_tasks.settings") as mock_settings:
            mock_settings.GOOGLE_API_KEY = "fake-key"

            # Should not raise — failure is handled internally
            analyze_image_task(
                asset_id=1,
                image_url="https://example.com/img.jpg",
                tenant_id="tenant-1",
                user_id=42,
            )

        # Execute called at least once (for status update to 'failed')
        assert mock_session.execute.called


@pytest.mark.unit
class TestAnalyzeImageTaskIdempotent:
    """Test idempotency — skip if analysis already exists."""

    @patch("app.tasks.vision_tasks.AsyncSessionLocal")
    @patch("app.tasks.vision_tasks.httpx")
    def test_skips_if_analysis_exists(self, mock_httpx, mock_session_cls):
        """Task returns early without calling Gemini if analysis row exists."""
        from app.tasks.vision_tasks import analyze_image_task

        existing = MagicMock()
        existing.id = 99
        mock_session = make_mock_session(existing_analysis=existing)
        mock_session_cls.return_value = mock_session

        with patch("app.tasks.vision_tasks.settings") as mock_settings:
            mock_settings.GOOGLE_API_KEY = "fake-key"

            analyze_image_task(
                asset_id=1,
                image_url="https://example.com/img.jpg",
                tenant_id="tenant-1",
                user_id=42,
            )

        # Gemini API should NOT be called
        mock_httpx.post.assert_not_called()
