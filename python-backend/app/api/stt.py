"""
Internal STT/TTS API endpoints.

Called by the Node.js voice gateway, routed through the unified_client.
Requires X-Internal-Token header for authentication.

POST /api/internal/stt  — Speech-to-text transcription
POST /api/internal/tts  — Text-to-speech synthesis
"""

from __future__ import annotations

import io
import secrets
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.core.config import settings

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/internal", tags=["Internal STT/TTS"])

# ── Max sizes ─────────────────────────────────────────────────────────────

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25MB
MAX_TTS_CHARS = 5000


# ── Auth ──────────────────────────────────────────────────────────────────


async def _verify_internal_token(
    x_internal_token: Optional[str] = Header(None),
    x_proxy_token: Optional[str] = Header(None),
) -> None:
    """Verify internal service token for Node.js -> Python calls."""
    expected = (
        getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
        or getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", None)
    )
    if not expected:
        raise HTTPException(status_code=500, detail="Internal token not configured")

    token = x_internal_token or x_proxy_token
    if not token:
        raise HTTPException(status_code=401, detail="Missing internal token")
    if not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Invalid internal token")


# ── STT Endpoint ──────────────────────────────────────────────────────────


class STTResponse(BaseModel):
    text: str
    language: str
    confidence: float
    duration: float


@router.post(
    "/stt",
    response_model=STTResponse,
    summary="Transcribe audio to text",
)
async def transcribe_audio(
    audio: UploadFile = File(...),
    provider: str = Form(default="groq"),
    format: str = Form(default="pcm16"),
    language: Optional[str] = Form(default=None),
    _auth: None = Depends(_verify_internal_token),
) -> STTResponse:
    """Transcribe audio using the specified STT provider."""
    audio_bytes = await audio.read()

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail=f"Audio file exceeds {MAX_AUDIO_BYTES} bytes")

    if provider not in ("groq", "openai"):
        raise HTTPException(status_code=400, detail=f"Unsupported STT provider: {provider}")

    try:
        result = await _call_stt_provider(audio_bytes, provider, format, language)
        return STTResponse(**result)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("stt_provider_error", provider=provider, error=str(exc))
        raise HTTPException(status_code=502, detail=f"STT provider error: {str(exc)}")


async def _call_stt_provider(
    audio_bytes: bytes,
    provider: str,
    format: str,
    language: Optional[str],
) -> dict:
    """Route to the appropriate STT provider via unified_client."""
    try:
        from app.llm_proxy.unified_client import UnifiedLLMClient

        client = UnifiedLLMClient()

        # Build transcription request
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = f"audio.{format}"

        result = await client.transcribe(
            audio_file=audio_file,
            provider=provider,
            language=language,
        )
        return {
            "text": result.get("text", ""),
            "language": result.get("language", language or "en"),
            "confidence": result.get("confidence", 0.9),
            "duration": result.get("duration", 0.0),
        }
    except ImportError:
        logger.error("unified_client_not_available", detail="STT unavailable — unified client not configured")
        raise HTTPException(status_code=503, detail="Speech-to-text service not available")


# ── TTS Endpoint ──────────────────────────────────────────────────────────


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, description="Text to synthesize")
    provider: str = "openai"
    voice: str = "alloy"
    speed: float = Field(default=1.0, ge=0.25, le=4.0)
    format: str = "mp3"


@router.post(
    "/tts",
    summary="Synthesize text to speech",
)
async def synthesize_speech(
    body: TTSRequest,
    _auth: None = Depends(_verify_internal_token),
) -> Response:
    """Synthesize speech from text using the specified TTS provider."""
    if len(body.text) > MAX_TTS_CHARS:
        raise HTTPException(status_code=413, detail=f"Text exceeds {MAX_TTS_CHARS} characters")

    if body.provider not in ("openai", "elevenlabs"):
        raise HTTPException(status_code=400, detail=f"Unsupported TTS provider: {body.provider}")

    try:
        audio_bytes, content_type = await _call_tts_provider(body)
        return Response(
            content=audio_bytes,
            media_type=content_type,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("tts_provider_error", provider=body.provider, error=str(exc))
        raise HTTPException(status_code=502, detail=f"TTS provider error: {str(exc)}")


async def _call_tts_provider(body: TTSRequest) -> tuple[bytes, str]:
    """Route to the appropriate TTS provider."""
    try:
        from app.llm_proxy.unified_client import UnifiedLLMClient

        client = UnifiedLLMClient()
        result = await client.synthesize_speech(
            text=body.text,
            provider=body.provider,
            voice=body.voice,
            speed=body.speed,
            format=body.format,
        )
        audio_bytes = result.get("audio_bytes", b"")
        content_type = "audio/mpeg" if body.format == "mp3" else "audio/pcm"
        return audio_bytes, content_type
    except ImportError:
        logger.error("unified_client_not_available", detail="TTS unavailable — unified client not configured")
        raise HTTPException(status_code=503, detail="Text-to-speech service not available")
