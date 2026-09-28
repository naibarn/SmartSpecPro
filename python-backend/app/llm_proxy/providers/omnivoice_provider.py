"""
OmniVoice Provider

Thin async client for a self-hosted OmniVoice TTS service.

The SmartSpec integration deliberately treats OmniVoice as a provider adapter
behind the existing internal TTS gateway rather than coupling the Python API
surface to a specific local model-launch workflow.
"""

from __future__ import annotations

import base64
from typing import Any, Optional

import httpx
import structlog
from urllib.parse import urljoin

from app.core.media_job_validators import (
    validate_provider_reference_url,
    validate_provider_result_uri,
)

logger = structlog.get_logger()


def _extract_string(payload: Any, *keys: str) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _extract_audio_url(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None

    direct = _extract_string(
        payload,
        "audio_url",
        "audioUrl",
        "url",
        "result_url",
        "resultUrl",
    )
    if direct:
        return direct

    for key in ("data", "result", "output", "response"):
        nested = payload.get(key)
        if isinstance(nested, dict):
            nested_url = _extract_audio_url(nested)
            if nested_url:
                return nested_url
    return None


def _extract_audio_base64(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None

    direct = _extract_string(
        payload,
        "audio_base64",
        "audioBase64",
        "base64",
        "audio",
    )
    if direct:
        return direct

    for key in ("data", "result", "output", "response"):
        nested = payload.get(key)
        if isinstance(nested, dict):
            nested_base64 = _extract_audio_base64(nested)
            if nested_base64:
                return nested_base64
    return None


class OmniVoiceProvider:
    DEFAULT_TTS_PATH = "/tts"
    MAX_REFERENCE_AUDIO_BYTES = 10 * 1024 * 1024
    MAX_RESULT_REDIRECTS = 3
    AUDIO_MODELS: frozenset[str] = frozenset({
        "omnivoice-tts",
        "omnivoice/multilingual-tts",
    })

    def __init__(self, base_url: str, api_key: str | None = None, tts_path: str | None = None):
        normalized_base_url = str(base_url or "").strip().rstrip("/")
        if not normalized_base_url.startswith(("http://", "https://")):
            raise ValueError("OMNIVOICE_BASE_URL must be an absolute http(s) URL")

        self.base_url = normalized_base_url
        self.tts_path = str(tts_path or self.DEFAULT_TTS_PATH).strip() or self.DEFAULT_TTS_PATH
        self.client = httpx.AsyncClient(timeout=180.0, follow_redirects=False)
        self._headers = {"Content-Type": "application/json"}
        if api_key and api_key.strip():
            self._headers["Authorization"] = f"Bearer {api_key.strip()}"
        logger.info("omnivoice_provider_init", base_url=self.base_url, tts_path=self.tts_path)

    async def aclose(self) -> None:
        await self.client.aclose()

    async def generate_speech(
        self,
        *,
        text: str,
        voice: str | None = None,
        speed: float = 1.0,
        response_format: str = "mp3",
        instruct: str | None = None,
        reference_audio_base64: str | None = None,
        reference_audio_url: str | None = None,
        reference_text: str | None = None,
    ) -> bytes:
        payload: dict[str, Any] = {
            "text": text,
            "speed": speed,
            "format": response_format,
        }
        if voice:
            payload["voice"] = voice
        if instruct:
            payload["instruct"] = instruct
        if reference_audio_base64:
            raw_base64 = reference_audio_base64.replace("\n", "").replace("\r", "").strip()
            padding = 2 if raw_base64.endswith("==") else 1 if raw_base64.endswith("=") else 0
            estimated_bytes = max(0, (len(raw_base64) * 3 // 4) - padding)
            if estimated_bytes > self.MAX_REFERENCE_AUDIO_BYTES:
                raise ValueError("OmniVoice reference audio exceeds the 10 MB limit")
            payload["reference_audio_base64"] = reference_audio_base64
        if reference_audio_url:
            validate_provider_reference_url(reference_audio_url)
            payload["reference_audio_url"] = reference_audio_url
        if reference_text:
            payload["reference_text"] = reference_text

        response = await self.client.post(
            f"{self.base_url}/{self.tts_path.lstrip('/')}",
            json=payload,
            headers=self._headers,
        )
        response.raise_for_status()

        content_type = (response.headers.get("content-type") or "").lower()
        if content_type.startswith("audio/"):
            return response.content

        payload_json = response.json()
        audio_base64 = _extract_audio_base64(payload_json)
        if audio_base64:
            return base64.b64decode(audio_base64)

        audio_url = _extract_audio_url(payload_json)
        if audio_url:
            return await self._download_result_audio(audio_url)

        raise ValueError("OmniVoice provider returned neither audio bytes nor a resolvable audio URL")

    async def _download_result_audio(self, url: str) -> bytes:
        """Fetch provider output while validating every redirect target."""
        validate_provider_result_uri(url)
        current_url = url
        for _ in range(self.MAX_RESULT_REDIRECTS + 1):
            response = await self.client.get(
                current_url,
                headers=self._headers,
                follow_redirects=False,
            )
            if response.status_code not in {301, 302, 303, 307, 308}:
                response.raise_for_status()
                return response.content
            location = response.headers.get("location")
            if not location:
                response.raise_for_status()
                return response.content
            next_url = urljoin(str(response.url), location)
            validate_provider_result_uri(next_url)
            current_url = next_url
        raise ValueError("MEDIA_PIPELINE_PERMANENT: too many OmniVoice result redirects")
