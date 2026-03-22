"""fal.ai media provider — video (queue), audio (sync TTS), image (sync Flux).

Auth: ``Key <api_key>`` header (NOT Bearer).
Endpoints:
  - Sync (audio/image): POST https://fal.run/{model_id}
  - Queue (video):      POST https://queue.fal.run/{model_id}
  - Queue poll:         GET  https://queue.fal.run/{model_id}/requests/{request_id}/status
  - Queue result:       GET  https://queue.fal.run/{model_id}/requests/{request_id}

All outbound calls use ``follow_redirects=False`` to prevent redirect-based SSRF.
"""

import re
import unicodedata
from typing import Any
import httpx
import structlog

from app.core.media_job_validators import validate_uri_strict

logger = structlog.get_logger()

# URL-bearing fields that must pass SSRF validation.
# Covers all known fal.ai URL params across video/audio/image models.
_URL_FIELDS = frozenset({
    "image_url", "end_image_url", "audio_url", "video_url",
    "reference_url", "mask_url", "init_image_url", "control_image_url",
    "source_url", "target_url", "lora_url",
})

# Regex for validating request_id from fal.ai (alphanumeric + dash/underscore)
_REQUEST_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]{4,256}$")

# Max prompt length to prevent abuse (100K chars)
_MAX_PROMPT_LENGTH = 100_000

# Max response body size (10 MB) to prevent OOM from malformed responses
_MAX_RESPONSE_BYTES = 10 * 1024 * 1024

# Timeout for queue status polls (shorter than generation timeout)
_POLL_TIMEOUT = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=5.0)

# Regex to detect URL-like values in extra_params (catch-all SSRF check)
_URL_PATTERN = re.compile(r"^https?://", re.IGNORECASE)


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
    ALL_MODELS: frozenset[str] = VIDEO_MODELS | AUDIO_MODELS | IMAGE_MODELS

    def __init__(
        self,
        api_key: str,
        base_url: str | None = None,
        queue_base_url: str | None = None,
    ) -> None:
        self.base_url = (base_url or self.BASE_URL).rstrip("/")
        self.queue_base_url = (queue_base_url or self.QUEUE_BASE_URL).rstrip("/")
        # SECURITY: _headers contains the API key — never log this dict
        self._headers = {
            "Authorization": f"Key {api_key}",
            "Content-Type": "application/json",
        }
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=300.0, write=30.0, pool=5.0),
        )
        logger.info("fal_ai_provider_init", base_url=self.base_url)

    # ------------------------------------------------------------------
    # Input validation
    # ------------------------------------------------------------------

    @classmethod
    def _validate_model_id(cls, model_id: str, allowed: frozenset[str] | None = None) -> None:
        """Validate model_id against allowlist to prevent path injection."""
        target = allowed or cls.ALL_MODELS
        if model_id not in target:
            raise ValueError(f"Unknown fal.ai model: {model_id}")

    @staticmethod
    def _validate_request_id(request_id: str) -> None:
        """Validate request_id format to prevent URL injection."""
        if not _REQUEST_ID_RE.match(request_id):
            raise ValueError(f"Invalid fal.ai request_id format: {request_id[:50]}")

    # ------------------------------------------------------------------
    # SSRF & content validation
    # ------------------------------------------------------------------

    async def _validate_urls(self, params: dict[str, Any]) -> None:
        """SSRF: validate known URL fields + catch-all for URL-like string values."""
        # Check known URL fields
        for key in _URL_FIELDS:
            url = params.get(key)
            if url is None:
                continue
            if not isinstance(url, str):
                raise ValueError(f"URL field '{key}' must be a string")
            validate_uri_strict(url)

        # Catch-all: validate any string value that looks like a URL
        # This prevents SSRF via unknown/new URL fields in extra_params
        for key, value in params.items():
            if key in _URL_FIELDS:
                continue  # Already validated above
            if isinstance(value, str) and _URL_PATTERN.match(value):
                validate_uri_strict(value)

        # Async video file size check
        video_url = params.get("video_url")
        if video_url is not None:
            await self._check_video_size(video_url)

    async def _check_video_size(self, url: str) -> None:
        """Async HEAD check for video file size. Fail-open ONLY on timeout."""
        try:
            resp = await self.client.head(
                url, follow_redirects=False, timeout=httpx.Timeout(10.0),
            )
            resp.raise_for_status()
            cl = resp.headers.get("Content-Length")
            if cl and int(cl) > self.MAX_VIDEO_FILE_SIZE:
                raise ValueError(
                    f"Video file exceeds 500MB limit ({int(cl)} bytes)"
                )
        except (ValueError, httpx.HTTPStatusError):
            raise  # re-raise size limit + HTTP errors (incl. redirect 3xx)
        except httpx.TimeoutException:
            logger.debug("fal_ai_video_size_check_timeout", url=url[:100])
        except httpx.RequestError as exc:
            # SECURITY: Fail-closed on connection errors (not timeout).
            # An attacker could deliberately reset connections to bypass size check.
            logger.warning(
                "fal_ai_video_size_check_connection_error",
                url=url[:100],
                reason=type(exc).__name__,
            )
            raise ValueError(
                f"Cannot verify video file size: {type(exc).__name__}"
            )

    @staticmethod
    def _sanitize_prompt(prompt: str) -> str:
        """Strip HTML/XML tags and unicode control characters, enforce length cap."""
        if len(prompt) > _MAX_PROMPT_LENGTH:
            prompt = prompt[:_MAX_PROMPT_LENGTH]
        # Strip unicode control characters (keep newline, tab, carriage return)
        prompt = "".join(
            c for c in prompt
            if unicodedata.category(c)[0] != "C" or c in "\n\t\r"
        )
        # Strip HTML/XML tags
        return re.sub(r"<[^>]*>", "", prompt)

    # ------------------------------------------------------------------
    # HTTP error handling
    # ------------------------------------------------------------------

    @staticmethod
    def _handle_http_error(exc: httpx.HTTPStatusError) -> None:
        """Log sanitized error and re-raise original httpx exception for caller handling."""
        status = exc.response.status_code
        if status == 401:
            logger.warning("fal_ai_auth_error", status=status)
        elif status == 422:
            logger.warning("fal_ai_content_policy", status=status)
        elif status == 429:
            logger.warning("fal_ai_rate_limited", status=status)
        else:
            logger.warning("fal_ai_http_error", status=status)
        raise  # re-raise the original httpx.HTTPStatusError

    @staticmethod
    def map_http_error_to_message(status: int) -> str:
        """Convert HTTP status code to a user-safe error message."""
        if status == 401:
            return "Invalid fal.ai API key"
        if status == 422:
            return "Content policy rejection"
        if status == 429:
            return "fal.ai rate limit exceeded"
        return f"fal.ai error (HTTP {status})"

    # ------------------------------------------------------------------
    # Response validation
    # ------------------------------------------------------------------

    @staticmethod
    def _safe_parse_response(response: httpx.Response) -> dict:
        """Parse JSON response with size limit to prevent OOM."""
        if len(response.content) > _MAX_RESPONSE_BYTES:
            raise ValueError(
                f"fal.ai response exceeds {_MAX_RESPONSE_BYTES // (1024 * 1024)}MB limit "
                f"({len(response.content)} bytes)"
            )
        return response.json()

    # ------------------------------------------------------------------
    # Public API — media generation
    # ------------------------------------------------------------------

    async def generate_video(self, model_id: str, params: dict[str, Any]) -> dict:
        """Queue-based video generation. Returns {id, status: PROCESSING}."""
        self._validate_model_id(model_id, self.VIDEO_MODELS)
        await self._validate_urls(params)

        if "prompt" in params:
            params = {**params, "prompt": self._sanitize_prompt(params["prompt"])}

        logger.info("fal_ai_generate_video", model_id=model_id)
        request_id = await self._submit_queue(model_id, params)
        return {"id": request_id, "status": "PROCESSING"}

    async def generate_audio(self, model_id: str, params: dict[str, Any]) -> dict:
        """Synchronous TTS generation. Returns {data: [{url}], status: COMPLETED}."""
        self._validate_model_id(model_id, self.AUDIO_MODELS)
        await self._validate_urls(params)

        if "prompt" in params:
            params = {**params, "prompt": self._sanitize_prompt(params["prompt"])}

        url = f"{self.base_url}/{model_id}"
        logger.info("fal_ai_generate_audio", model_id=model_id)

        response = await self.client.post(
            url, headers=self._headers, json=params, follow_redirects=False,
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            self._handle_http_error(exc)

        data = self._safe_parse_response(response)
        audio_url = data.get("audio", {}).get("url") or data.get("url")
        return {
            "data": [{"url": audio_url}] if audio_url else [],
            "status": "COMPLETED",
        }

    async def generate_image(self, model_id: str, params: dict[str, Any]) -> dict:
        """Synchronous image generation. Returns {data: [{url}], status: COMPLETED}."""
        self._validate_model_id(model_id, self.IMAGE_MODELS)
        await self._validate_urls(params)

        if "prompt" in params:
            params = {**params, "prompt": self._sanitize_prompt(params["prompt"])}

        url = f"{self.base_url}/{model_id}"
        logger.info("fal_ai_generate_image", model_id=model_id)

        response = await self.client.post(
            url, headers=self._headers, json=params, follow_redirects=False,
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            self._handle_http_error(exc)

        data = self._safe_parse_response(response)
        images = data.get("images", [])
        return {
            "data": [{"url": img["url"]} for img in images if img.get("url")],
            "status": "COMPLETED",
        }

    # ------------------------------------------------------------------
    # Queue operations
    # ------------------------------------------------------------------

    async def _submit_queue(self, model_id: str, payload: dict[str, Any]) -> str:
        """POST queue.fal.run/{model_id} → return request_id."""
        url = f"{self.queue_base_url}/{model_id}"
        logger.info("fal_ai_submit_queue", model_id=model_id)

        response = await self.client.post(
            url, headers=self._headers, json=payload, follow_redirects=False,
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            self._handle_http_error(exc)

        data = self._safe_parse_response(response)
        request_id = data.get("request_id")
        if not request_id:
            raise ValueError("fal.ai queue response missing request_id")
        self._validate_request_id(request_id)
        return request_id

    async def get_queue_status(self, model_id: str, request_id: str) -> dict:
        """GET queue status → {status: IN_QUEUE|IN_PROGRESS|COMPLETED}."""
        self._validate_model_id(model_id)
        self._validate_request_id(request_id)
        url = f"{self.queue_base_url}/{model_id}/requests/{request_id}/status"
        logger.info("fal_ai_queue_status", model_id=model_id, request_id=request_id)

        response = await self.client.get(
            url, headers=self._headers, follow_redirects=False, timeout=_POLL_TIMEOUT,
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            self._handle_http_error(exc)

        return self._safe_parse_response(response)

    async def get_queue_result(self, model_id: str, request_id: str) -> dict:
        """GET queue result → normalized {data: [{url}], actual_duration, actual_resolution}."""
        self._validate_model_id(model_id)
        self._validate_request_id(request_id)
        url = f"{self.queue_base_url}/{model_id}/requests/{request_id}"
        logger.info("fal_ai_queue_result", model_id=model_id, request_id=request_id)

        response = await self.client.get(
            url, headers=self._headers, follow_redirects=False,
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            self._handle_http_error(exc)

        data = self._safe_parse_response(response)

        # Normalize: try video shape first, then audio, then top-level
        video = data.get("video") or {}
        audio = data.get("audio") or {}

        result_url = (
            video.get("url")
            or audio.get("url")
            or self._extract_data_url(data)
            or data.get("url")
        )
        width = video.get("width")
        duration = video.get("duration") or audio.get("duration") or data.get("duration")

        return {
            "data": [{"url": result_url}] if result_url else [],
            "actual_duration": duration,
            "actual_resolution": self._derive_resolution(width),
        }

    @staticmethod
    def _extract_data_url(data: dict) -> str | None:
        """Safely extract URL from data[0].url pattern."""
        data_list = data.get("data")
        if isinstance(data_list, list) and data_list:
            first = data_list[0]
            if isinstance(first, dict):
                return first.get("url")
        return None

    @staticmethod
    def _derive_resolution(width: Any) -> str:
        """Derive resolution label from pixel width. Safe for non-numeric input."""
        if not isinstance(width, (int, float)):
            return "1080p"
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

    async def __aenter__(self) -> "FalAIProvider":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.aclose()
