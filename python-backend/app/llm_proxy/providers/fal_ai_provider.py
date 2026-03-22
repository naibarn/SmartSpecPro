"""fal.ai media provider — video (queue), audio (sync TTS), image (sync Flux)."""

import re
from typing import Any, NoReturn
from urllib.parse import urlparse

import httpx
import structlog

from app.core.media_job_validators import validate_uri_no_ssrf

logger = structlog.get_logger()

# URL-bearing fields that must pass SSRF validation
_URL_FIELDS = frozenset({"image_url", "end_image_url", "audio_url", "video_url"})


class FalAIProvider:
    BASE_URL = "https://fal.run"
    QUEUE_BASE_URL = "https://queue.fal.run"
    MAX_VIDEO_FILE_SIZE = 500 * 1024 * 1024  # 500 MB

    VIDEO_MODELS: frozenset[str] = frozenset({
        "fal-ai/ltx-2.3/text-to-video",
        "fal-ai/ltx-2.3/text-to-video/fast",
        "fal-ai/ltx-2.3/image-to-video",
        "fal-ai/ltx-2.3/image-to-video/fast",
        "fal-ai/ltx-2.3/audio-to-video",
        "fal-ai/ltx-2.3/extend-video",
        "fal-ai/ltx-2.3/retake-video",
    })
    AUDIO_MODELS: frozenset[str] = frozenset({"fal-ai/lux-tts"})
    IMAGE_MODELS: frozenset[str] = frozenset({
        "fal-ai/flux/schnell",
        "fal-ai/flux/dev",
        "fal-ai/flux-pro",
        "fal-ai/stable-diffusion-v3-medium",
    })

    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self.base_url = (base_url or self.BASE_URL).rstrip("/")
        self._headers = {
            "Authorization": f"Key {api_key}",
            "Content-Type": "application/json",
        }
        self.client = httpx.AsyncClient(timeout=300.0)
        logger.info("fal_ai_provider_init", base_url=self.base_url)

    # ------------------------------------------------------------------
    # Validation helpers
    # ------------------------------------------------------------------

    async def _validate_urls(self, params: dict[str, Any]) -> None:
        """SSRF: validate URL fields + reject host.docker.internal + HEAD size check for video_url."""
        for key in _URL_FIELDS:
            url = params.get(key)
            if url is None:
                continue

            # Reject host.docker.internal (fal.ai provider-specific)
            parsed = urlparse(url)
            hostname = (parsed.hostname or "").lower()
            if hostname == "host.docker.internal":
                raise ValueError(
                    f"URL field '{key}' targets host.docker.internal which is not allowed for fal.ai"
                )

            # Run the shared SSRF validator
            validate_uri_no_ssrf(url)

        # Async video file size check
        video_url = params.get("video_url")
        if video_url is not None:
            await self._check_video_size(video_url)

    async def _check_video_size(self, url: str) -> None:
        """Async HEAD check for video file size (best-effort)."""
        try:
            resp = await self.client.head(url, follow_redirects=False)
            resp.raise_for_status()
            cl = resp.headers.get("Content-Length")
            if cl and int(cl) > self.MAX_VIDEO_FILE_SIZE:
                raise ValueError(
                    f"Video file exceeds 500MB limit ({int(cl)} bytes)"
                )
        except (httpx.RequestError, httpx.HTTPStatusError):
            # Best effort — if HEAD fails, allow through
            pass

    @staticmethod
    def _sanitize_prompt(prompt: str) -> str:
        """Strip HTML/XML tags from prompt."""
        return re.sub(r"<[^>]+>", "", prompt)

    # ------------------------------------------------------------------
    # HTTP error handling
    # ------------------------------------------------------------------

    @staticmethod
    def _handle_http_error(exc: httpx.HTTPStatusError) -> NoReturn:
        """Convert HTTP errors to sanitized ValueErrors. Never leak response body."""
        status = exc.response.status_code
        if status == 401:
            raise ValueError("Invalid fal.ai API key") from None
        if status == 422:
            raise ValueError("Content policy rejection") from None
        if status == 429:
            raise ValueError("fal.ai rate limit exceeded") from None
        raise ValueError(f"fal.ai error (HTTP {status})") from None

    # ------------------------------------------------------------------
    # Public API — media generation
    # ------------------------------------------------------------------

    async def generate_video(self, model_id: str, params: dict[str, Any]) -> dict:
        """Queue-based video generation. Returns {id, status: PROCESSING}."""
        await self._validate_urls(params)

        if "prompt" in params:
            params = {**params, "prompt": self._sanitize_prompt(params["prompt"])}

        logger.info("fal_ai_generate_video", model_id=model_id)
        request_id = await self._submit_queue(model_id, params)
        return {"id": request_id, "status": "PROCESSING"}

    async def generate_audio(self, model_id: str, params: dict[str, Any]) -> dict:
        """Synchronous TTS generation. Returns {data: [{url}], status: COMPLETED}."""
        await self._validate_urls(params)

        if "prompt" in params:
            params = {**params, "prompt": self._sanitize_prompt(params["prompt"])}

        url = f"{self.base_url}/{model_id}"
        logger.info("fal_ai_generate_audio", model_id=model_id, url=url)

        try:
            response = await self.client.post(url, headers=self._headers, json=params)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            self._handle_http_error(exc)

        data = response.json()
        audio_url = data.get("audio", {}).get("url", "")
        return {
            "data": [{"url": audio_url}],
            "status": "COMPLETED",
        }

    async def generate_image(self, model_id: str, params: dict[str, Any]) -> dict:
        """Synchronous image generation. Returns {data: [{url}], status: COMPLETED}."""
        await self._validate_urls(params)

        if "prompt" in params:
            params = {**params, "prompt": self._sanitize_prompt(params["prompt"])}

        url = f"{self.base_url}/{model_id}"
        logger.info("fal_ai_generate_image", model_id=model_id, url=url)

        try:
            response = await self.client.post(url, headers=self._headers, json=params)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            self._handle_http_error(exc)

        data = response.json()
        images = data.get("images", [])
        return {
            "data": [{"url": img.get("url", "")} for img in images],
            "status": "COMPLETED",
        }

    # ------------------------------------------------------------------
    # Queue operations
    # ------------------------------------------------------------------

    async def _submit_queue(self, model_id: str, payload: dict[str, Any]) -> str:
        """POST queue.fal.run/{model_id} → return request_id."""
        url = f"{self.QUEUE_BASE_URL}/{model_id}"
        logger.info("fal_ai_submit_queue", model_id=model_id, url=url)

        try:
            response = await self.client.post(url, headers=self._headers, json=payload)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            self._handle_http_error(exc)

        data = response.json()
        return data["request_id"]

    async def get_queue_status(self, model_id: str, request_id: str) -> dict:
        """GET queue status → {status: IN_QUEUE|IN_PROGRESS|COMPLETED}."""
        url = f"{self.QUEUE_BASE_URL}/{model_id}/requests/{request_id}/status"
        logger.info("fal_ai_queue_status", model_id=model_id, request_id=request_id)

        try:
            response = await self.client.get(url, headers=self._headers)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            self._handle_http_error(exc)

        return response.json()

    async def get_queue_result(self, model_id: str, request_id: str) -> dict:
        """GET queue result → normalized {data: [{url}], actual_duration, actual_resolution}."""
        url = f"{self.QUEUE_BASE_URL}/{model_id}/requests/{request_id}"
        logger.info("fal_ai_queue_result", model_id=model_id, request_id=request_id)

        try:
            response = await self.client.get(url, headers=self._headers)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            self._handle_http_error(exc)

        data = response.json()
        video = data.get("video", {})
        video_url = video.get("url", "")
        width = video.get("width", 0)
        height = video.get("height", 0)
        duration = video.get("duration")

        return {
            "data": [{"url": video_url}],
            "actual_duration": duration,
            "actual_resolution": self._derive_resolution(width, height),
        }

    @staticmethod
    def _derive_resolution(width: int, height: int) -> str:
        """Derive resolution label from pixel dimensions."""
        if width >= 3840:
            return "2160p"
        if width >= 2560:
            return "1440p"
        return "1080p"

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------

    async def aclose(self) -> None:
        """Close the httpx client. MUST be called in a finally block."""
        await self.client.aclose()
        logger.info("fal_ai_provider_closed")
