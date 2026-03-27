"""
KNPLabs AI provider wrapper for media and utility endpoints.

Chat completions are routed through the web LLM provider tables. This class
only handles media generation, TTS, and embeddings from the Python backend.
"""

from __future__ import annotations

import asyncio
import base64
import json
import re
import time
from typing import Any, Optional

import httpx
import structlog

from app.core.media_job_validators import validate_uri_strict

logger = structlog.get_logger()

_KNPLAB_TASK_ID_RE = re.compile(r"^[a-zA-Z0-9_\-:.]{4,256}$")
_MAX_RESPONSE_BYTES = 20 * 1024 * 1024
_MAX_TTS_INPUT_LENGTH = 4096

_ALLOWED_TTS_VOICES = frozenset({"alloy", "echo", "fable", "onyx", "nova", "shimmer"})
_ALLOWED_TTS_FORMATS = frozenset({"mp3", "opus", "aac", "flac", "wav", "pcm"})


class KNPLabsProvider:
    """
    Standalone KNPLabs media provider.

    The provider is intentionally not a BaseLLMProvider subclass. It owns the
    media-generation, TTS, and embedding HTTP contracts needed by the Python
    backend while chat completions continue to flow through the Node router.
    """

    IMAGE_OPENAI_MODELS = frozenset({
        "gpt-image-1.5-all",
        "gpt-image-1-all",
        "sora_image",
        "grok-3-image",
        "grok-4-image",
        "grok-4.1-image",
    })

    IMAGE_GEMINI_MODELS = frozenset({
        "gemini-3.1-flash-image-preview",
        "gemini-3-pro-image-preview",
        "gemini-2.5-flash-image",
    })

    VIDEO_FORM_MODELS = frozenset({
        "veo_3_1",
        "veo_3_1-fast",
        "veo_3_1-fast-4K",
        "veo_3_1-components",
        "veo_3_1-components-4K",
        "veo_3_1-4K",
        "veo_3_1-fast-components-4K",
    })

    VIDEO_JSON_MODELS = frozenset({
        "veo3-fast-frames",
        "veo3.1-components",
        "grok-video-3",
        "grok-video-3-10s",
        "grok-video-3-15s",
    })

    VIDEO_MODELS = VIDEO_FORM_MODELS | VIDEO_JSON_MODELS

    AUDIO_MODELS = frozenset({
        "gpt-4o-mini-tts",
        "tts-1",
        "tts-1-hd",
    })

    EMBEDDING_MODELS = frozenset({
        "text-embedding-3-large",
        "text-embedding-3-small",
        "text-embedding-ada-002",
        "gemini-embedding-001",
        "gemini-embedding-2-preview",
        "knp-text-embedding-ada-002",
        "knp-gemini-embedding-exp",
    })

    EMBEDDING_DIMENSIONS = {
        "text-embedding-3-large": 3072,
        "text-embedding-3-small": 1536,
        "text-embedding-ada-002": 1536,
        "gemini-embedding-001": 768,
        "gemini-embedding-2-preview": 1536,
        "knp-text-embedding-ada-002": 1536,
        "knp-gemini-embedding-exp": 768,
    }

    BASE_URL = "https://api.knplabai.com/ai/v1"

    def __init__(self, api_key: str, base_url: Optional[str] = None):
        self.api_key = api_key
        self.base_url = (base_url or self.BASE_URL).rstrip("/")
        self._service_root = self._derive_service_root(self.base_url)
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        self.client = httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=5.0),
        )
        logger.info("knplabs_provider_init", base_url=self.base_url)

    @staticmethod
    def _derive_service_root(base_url: str) -> str:
        normalized = base_url.rstrip("/")
        if normalized.endswith("/v1"):
            return normalized[:-3].rstrip("/")
        return normalized

    def _v1_url(self, suffix: str) -> str:
        return f"{self._service_root}/v1{suffix}"

    def _v1beta_url(self, suffix: str) -> str:
        return f"{self._service_root}/v1beta{suffix}"

    @staticmethod
    def _validate_task_id(task_id: str) -> None:
        if not isinstance(task_id, str) or not _KNPLAB_TASK_ID_RE.match(task_id):
            raise ValueError(f"Invalid KNPLabs task_id: {str(task_id)[:50]!r}")

    @staticmethod
    def _validate_model_id(model: str, allowlist: frozenset[str]) -> None:
        normalized_model = str(model or "").strip().lower().split("/", 1)[-1]
        if normalized_model not in allowlist:
            raise ValueError(f"Unknown KNPLabs model: {model!r}")

    @staticmethod
    def _sanitize_prompt(prompt: str) -> str:
        if not isinstance(prompt, str):
            raise ValueError("Prompt must be a string")
        cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", prompt)
        return cleaned[:100_000]

    @staticmethod
    def _safe_json_response(resp: httpx.Response) -> dict[str, Any]:
        if len(resp.content) > _MAX_RESPONSE_BYTES:
            raise ValueError(f"Response exceeds {_MAX_RESPONSE_BYTES // (1024 * 1024)}MB limit")
        data = resp.json()
        if not isinstance(data, dict):
            raise ValueError("KNPLabs response must be a JSON object")
        return data

    @staticmethod
    def _extract_url_from_response(data: Any) -> Optional[str]:
        if isinstance(data, dict):
            for key in ("url", "video_url", "audio_url", "result_url"):
                value = data.get(key)
                if isinstance(value, str) and value.startswith("http"):
                    return value
            for key in ("data", "result", "output", "response"):
                nested = data.get(key)
                if isinstance(nested, dict):
                    url = KNPLabsProvider._extract_url_from_response(nested)
                    if url:
                        return url
                if isinstance(nested, list):
                    for item in nested:
                        url = KNPLabsProvider._extract_url_from_response(item)
                        if url:
                            return url
        elif isinstance(data, list):
            for item in data:
                url = KNPLabsProvider._extract_url_from_response(item)
                if url:
                    return url
        return None

    async def aclose(self) -> None:
        await self.client.aclose()

    async def __aenter__(self) -> "KNPLabsProvider":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.aclose()

    async def generate_image_openai(self, model: str, prompt: str, size: str | None = None, n: int = 1) -> dict[str, Any]:
        self._validate_model_id(model, self.IMAGE_OPENAI_MODELS)
        payload: dict[str, Any] = {
            "model": model,
            "prompt": self._sanitize_prompt(prompt),
            "n": n,
        }
        if size:
            payload["size"] = size

        response = await self.client.post(
            self._v1_url("/images/generations"),
            json=payload,
            headers=self._headers,
        )
        response.raise_for_status()
        return self._safe_json_response(response)

    async def generate_image_gemini(self, model: str, prompt: str, aspect_ratio: str = "1:1") -> bytes:
        self._validate_model_id(model, self.IMAGE_GEMINI_MODELS)
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": self._sanitize_prompt(prompt)}],
                }
            ],
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"],
                "imageConfig": {"aspectRatio": aspect_ratio},
            },
        }

        response = await self.client.post(
            self._v1beta_url(f"/models/{model}:generateContent"),
            json=payload,
            headers=self._headers,
        )
        response.raise_for_status()
        data = self._safe_json_response(response)

        candidates = data.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise ValueError("No candidates returned from Gemini image response")

        content = candidates[0].get("content") if isinstance(candidates[0], dict) else None
        parts = content.get("parts") if isinstance(content, dict) else None
        if not isinstance(parts, list):
            raise ValueError("Gemini image response missing parts")

        for part in parts:
            if not isinstance(part, dict):
                continue
            inline_data = part.get("inlineData")
            if not isinstance(inline_data, dict):
                continue
            raw_b64 = inline_data.get("data")
            if not isinstance(raw_b64, str):
                continue
            if len(raw_b64) > (_MAX_RESPONSE_BYTES * 4 // 3) + 64:
                raise ValueError("Inline image exceeds 20MB")
            decoded = base64.b64decode(raw_b64)
            if len(decoded) > _MAX_RESPONSE_BYTES:
                raise ValueError("Inline image exceeds 20MB")
            return decoded

        raise ValueError("No image in Gemini response")

    async def create_video_veo(self, model: str, prompt: str, size: str, seconds: int) -> str:
        self._validate_model_id(model, self.VIDEO_FORM_MODELS)
        payload = {
            "model": model,
            "prompt": self._sanitize_prompt(prompt),
            "size": size,
            "seconds": str(seconds),
            "watermark": "false",
        }
        response = await self.client.post(
            self._v1_url("/videos"),
            data=payload,
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=5.0),
        )
        response.raise_for_status()
        data = self._safe_json_response(response)
        task_id = data.get("id") or data.get("request_id") or data.get("task_id")
        if not isinstance(task_id, str):
            raise ValueError("KNPLabs video response missing task id")
        self._validate_task_id(task_id)
        return task_id

    async def create_video_json(
        self,
        model: str,
        prompt: str,
        images: Optional[list[str]] = None,
        aspect_ratio: str = "16:9",
    ) -> str:
        self._validate_model_id(model, self.VIDEO_JSON_MODELS)
        payload: dict[str, Any] = {
            "model": model,
            "prompt": self._sanitize_prompt(prompt),
            "aspect_ratio": aspect_ratio,
        }
        if images:
            for url in images:
                validate_uri_strict(url)
            payload["images"] = images

        response = await self.client.post(
            self._v1_url("/video/create"),
            json=payload,
            headers=self._headers,
        )
        response.raise_for_status()
        data = self._safe_json_response(response)
        task_id = data.get("id") or data.get("request_id") or data.get("task_id")
        if not isinstance(task_id, str):
            raise ValueError("KNPLabs video response missing task id")
        self._validate_task_id(task_id)
        return task_id

    async def poll_video_status(self, task_id: str, model: str) -> dict[str, Any]:
        self._validate_task_id(task_id)
        timeout = httpx.Timeout(connect=10.0, read=30.0, write=5.0, pool=5.0)
        normalized_model = str(model or "").strip().lower().split("/", 1)[-1]
        if normalized_model in self.VIDEO_JSON_MODELS and normalized_model.startswith("grok-video"):
            response = await self.client.get(
                self._v1_url("/video/query"),
                params={"id": task_id},
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=timeout,
            )
        else:
            response = await self.client.get(
                self._v1_url(f"/videos/{task_id}"),
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=timeout,
            )
        response.raise_for_status()
        data = self._safe_json_response(response)

        # Fallback content endpoint if the main poll completed but did not expose a URL.
        status = str(data.get("status") or data.get("state") or "").lower()
        if status in {"completed", "complete", "success", "succeeded"}:
            if not self._extract_url_from_response(data):
                try:
                    content_response = await self.client.get(
                        self._v1_url(f"/videos/{task_id}/content"),
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        timeout=timeout,
                    )
                    if content_response.status_code < 400:
                        content_data = self._safe_json_response(content_response)
                        if self._extract_url_from_response(content_data):
                            data = {**data, **content_data}
                except Exception:
                    logger.debug("knplabs_video_content_fallback_failed", task_id=task_id, model=model)

        return data

    @staticmethod
    def extract_result_url(data: Any) -> Optional[str]:
        """Return the first public URL found in a KNPLabs response payload."""
        return KNPLabsProvider._extract_url_from_response(data)

    async def wait_for_video(
        self,
        task_id: str,
        model: str,
        timeout_seconds: int = 900,
        poll_interval_seconds: int = 10,
    ) -> dict[str, Any]:
        """Poll KNPLabs until a video task reaches a terminal state."""
        deadline = time.monotonic() + max(timeout_seconds, 1)
        poll_interval = max(poll_interval_seconds, 1)

        while True:
            status_payload = await self.poll_video_status(task_id, model)
            status = str(status_payload.get("status") or status_payload.get("state") or "").lower()
            if status in {"completed", "complete", "success", "succeeded", "failed", "fail", "error", "cancelled", "canceled"}:
                return status_payload

            if time.monotonic() >= deadline:
                raise TimeoutError(f"KNPLabs video task {task_id} did not finish within {timeout_seconds}s")

            await asyncio.sleep(poll_interval)

    async def generate_speech(
        self,
        model: str,
        input_text: str,
        voice: str = "alloy",
        response_format: str = "mp3",
    ) -> bytes:
        self._validate_model_id(model, self.AUDIO_MODELS)
        if voice not in _ALLOWED_TTS_VOICES:
            raise ValueError(f"Invalid TTS voice: {voice!r}")
        if response_format not in _ALLOWED_TTS_FORMATS:
            raise ValueError(f"Invalid TTS format: {response_format!r}")

        sanitized = self._sanitize_prompt(input_text)
        if len(sanitized) > _MAX_TTS_INPUT_LENGTH:
            raise ValueError(f"TTS input exceeds {_MAX_TTS_INPUT_LENGTH} chars")

        response = await self.client.post(
            self._v1_url("/audio/speech"),
            json={
                "model": model,
                "input": sanitized,
                "voice": voice,
                "response_format": response_format,
            },
            headers=self._headers,
        )
        response.raise_for_status()

        content_type = (response.headers.get("content-type") or "").lower()
        if not content_type.startswith("audio/"):
            raise ValueError(f"Unexpected TTS Content-Type: {content_type[:80]!r}")
        if len(response.content) > _MAX_RESPONSE_BYTES:
            raise ValueError("TTS audio exceeds 20MB")
        return response.content

    async def create_embedding(
        self,
        model: str,
        input_text: str,
        dimensions: Optional[int] = None,
    ) -> list[float]:
        self._validate_model_id(model, self.EMBEDDING_MODELS)
        payload: dict[str, Any] = {
            "model": model,
            "input": self._sanitize_prompt(input_text),
        }
        if dimensions is not None:
            payload["dimensions"] = dimensions

        response = await self.client.post(
            self._v1_url("/embeddings"),
            json=payload,
            headers=self._headers,
            timeout=httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=5.0),
        )
        response.raise_for_status()
        data = self._safe_json_response(response)
        items = data.get("data")
        if not isinstance(items, list) or not items:
            raise ValueError("KNPLabs embedding response missing data")
        embedding = items[0].get("embedding") if isinstance(items[0], dict) else None
        if not isinstance(embedding, list) or not all(isinstance(v, (int, float)) for v in embedding):
            raise ValueError("Embedding contains non-numeric values")

        vector = [float(v) for v in embedding]
        expected_dimension = dimensions or self.EMBEDDING_DIMENSIONS.get(model)
        if expected_dimension and len(vector) != expected_dimension:
            raise ValueError(
                f"Embedding dimension mismatch: expected {expected_dimension}, got {len(vector)}"
            )
        return vector
