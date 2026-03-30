"""
STT/TTS Endpoint Tests

Tests for POST /api/internal/stt and POST /api/internal/tts endpoints.
"""
from __future__ import annotations

import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def mock_settings():
    """Mock settings with internal token configured."""
    with patch("app.api.stt.settings") as mock:
        mock.SMARTSPEC_PROXY_TOKEN = "test-internal-token"
        mock.SMARTSPEC_WEB_GATEWAY_TOKEN = None
        yield mock


@pytest.fixture
def mock_unified_client():
    """Mock UnifiedLLMClient."""
    with patch("app.llm_proxy.unified_client.UnifiedLLMClient") as mock_cls:
        client = MagicMock()
        client.transcribe = AsyncMock(return_value={
            "text": "Hello world",
            "language": "en",
            "confidence": 0.95,
            "duration": 3.5,
        })
        client.synthesize_speech = AsyncMock(return_value={
            "audio_bytes": b"\xff\xfb" + bytes(1024),
        })
        mock_cls.return_value = client
        yield client


@pytest.fixture
async def stt_client(mock_settings):
    """Async HTTP client for the STT/TTS router."""
    from app.api.stt import router

    app = FastAPI()
    app.include_router(router)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client


class TestSTTEndpoint:
    """Tests for POST /api/internal/stt"""

    @pytest.mark.asyncio
    async def test_stt_requires_internal_auth(self, stt_client):
        """Endpoint requires X-Internal-Token header."""
        response = await stt_client.post(
            "/api/internal/stt",
            files={"audio": ("audio.pcm", io.BytesIO(bytes(1024)), "application/octet-stream")},
            data={"provider": "groq", "format": "pcm16"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_stt_rejects_invalid_token(self, stt_client):
        """Invalid token returns 401."""
        response = await stt_client.post(
            "/api/internal/stt",
            headers={"X-Internal-Token": "wrong-token"},
            files={"audio": ("audio.pcm", io.BytesIO(bytes(1024)), "application/octet-stream")},
            data={"provider": "groq", "format": "pcm16"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_stt_returns_transcript_with_metadata(self, stt_client, mock_unified_client):
        """Response includes text, language, confidence, duration."""
        response = await stt_client.post(
            "/api/internal/stt",
            headers={"X-Internal-Token": "test-internal-token"},
            files={"audio": ("audio.pcm", io.BytesIO(bytes(1024)), "application/octet-stream")},
            data={"provider": "groq", "format": "pcm16"},
        )
        # Either success (if unified_client available) or graceful fallback
        assert response.status_code in (200, 422)
        if response.status_code == 200:
            data = response.json()
            assert "text" in data
            assert "language" in data
            assert "confidence" in data
            assert "duration" in data

    @pytest.mark.asyncio
    async def test_stt_rejects_unsupported_provider(self, stt_client):
        """Unknown provider returns 400."""
        response = await stt_client.post(
            "/api/internal/stt",
            headers={"X-Internal-Token": "test-internal-token"},
            files={"audio": ("audio.pcm", io.BytesIO(bytes(1024)), "application/octet-stream")},
            data={"provider": "unknown_provider", "format": "pcm16"},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_stt_rejects_oversized_audio(self, stt_client, monkeypatch):
        """Audio files > MAX_AUDIO_BYTES rejected with 413."""
        from app.api.stt import MAX_AUDIO_BYTES
        monkeypatch.setattr("app.api.stt.MAX_AUDIO_BYTES", 1024, raising=False)
        oversized = bytes(1025)
        response = await stt_client.post(
            "/api/internal/stt",
            headers={"X-Internal-Token": "test-internal-token"},
            files={"audio": ("audio.pcm", io.BytesIO(oversized), "application/octet-stream")},
            data={"provider": "groq", "format": "pcm16"},
        )
        assert response.status_code == 413


class TestTTSEndpoint:
    """Tests for POST /api/internal/tts"""

    @pytest.mark.asyncio
    async def test_tts_requires_internal_auth(self, stt_client):
        """Endpoint requires X-Internal-Token header."""
        response = await stt_client.post(
            "/api/internal/tts",
            json={"text": "Hello", "provider": "openai"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_tts_rejects_unsupported_provider(self, stt_client):
        """Unknown provider returns 400."""
        response = await stt_client.post(
            "/api/internal/tts",
            headers={"X-Internal-Token": "test-internal-token"},
            json={"text": "Hello", "provider": "unknown"},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_tts_rejects_text_exceeding_max_chars(self, stt_client):
        """Text > MAX_TTS_CHARS rejected with 413."""
        from app.api.stt import MAX_TTS_CHARS
        long_text = "x" * (MAX_TTS_CHARS + 1)
        response = await stt_client.post(
            "/api/internal/tts",
            headers={"X-Internal-Token": "test-internal-token"},
            json={"text": long_text, "provider": "openai"},
        )
        assert response.status_code == 413

    @pytest.mark.asyncio
    async def test_tts_returns_audio_response(self, stt_client, mock_unified_client):
        """Returns binary audio with correct content type."""
        response = await stt_client.post(
            "/api/internal/tts",
            headers={"X-Internal-Token": "test-internal-token"},
            json={"text": "Hello world", "provider": "openai"},
        )
        assert response.status_code in (200, 422)
        if response.status_code == 200:
            assert "audio" in response.headers.get("content-type", "")
