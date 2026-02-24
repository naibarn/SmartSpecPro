"""
BytePlus ModelArk Provider (ByteDance)

Thin, stateful HTTP client wrapper for the BytePlus ModelArk API.
Supports synchronous image generation (Seedream models) and
asynchronous video task creation/polling (Seedance models).

Security:
- SSRF validation on reference_image_url before any HTTP call
- Inline params validated against allowlists to prevent prompt injection
- API key never appears in any log record
"""

import httpx
import structlog

from app.core.media_job_validators import validate_uri_no_ssrf

logger = structlog.get_logger()


def _normalize_byteplus_task_state(status_response: dict) -> tuple[str, str]:
    """
    Map a BytePlus task status response to an internal state tuple.

    Returns:
        (normalized_state, raw_status) where normalized_state is one of:
        "success", "fail", "processing", "unknown"

    BytePlus status strings:
        succeeded -> success
        failed    -> fail
        cancelled -> fail
        queued    -> processing
        processing -> processing
        <other>   -> unknown
    """
    raw_status: str = status_response.get("status", "")
    status = raw_status.lower()
    if status == "succeeded":
        return "success", raw_status
    if status in ("failed", "cancelled"):
        return "fail", raw_status
    if status in ("queued", "processing"):
        return "processing", raw_status
    return "unknown", raw_status


def _extract_byteplus_result_url(status_response: dict) -> str | None:
    """
    Extract the first valid media URL from a BytePlus task status response.

    Iterates the `content` array and returns the URL from the first item
    with type=video_url or type=image_url whose URL starts with "http".

    Returns None if no suitable URL is found.
    """
    content = status_response.get("content")
    if not content:
        return None
    for item in content:
        item_type = item.get("type", "")
        if item_type == "video_url":
            url = (item.get("video_url") or {}).get("url", "")
        elif item_type == "image_url":
            url = (item.get("image_url") or {}).get("url", "")
        else:
            continue
        if url and url.startswith("http"):
            return url
    return None


class BytePlusModelArkProvider:
    """
    BytePlus ModelArk API provider.

    Handles two distinct API flows:
    - Image (Seedream models): synchronous POST /images/generations
    - Video (Seedance models): async task via POST /contents/generations/tasks,
      polled separately by recover_stuck_tasks in media_tasks.py
    """

    BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3"

    IMAGE_MODELS: frozenset[str] = frozenset({
        "seedream-4-5-251128",
        "seedream-4-0-250828",
    })

    VIDEO_MODELS: frozenset[str] = frozenset({
        "seedance-1-0-pro-250528",
        "seedance-1-0-pro-fast-251015",
        "seedance-1-0-lite-t2v-250428",
        "seedance-1-0-lite-i2v-250428",
    })

    # Maps pixel-format sizes to BytePlus shorthand; identity entries allow
    # gateway to pass already-formatted values without silent fallthrough.
    SIZE_MAP: dict[str, str] = {
        "1024x1024": "1K",
        "2048x2048": "2K",
        "4096x4096": "4K",
        "1K": "1K",
        "2K": "2K",
        "4K": "4K",
    }

    BYTEPLUS_USD_PER_1M_TOKENS: float = 2.5

    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self._api_key = api_key  # Never log this value
        self.base_url = (base_url or self.BASE_URL).rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        # 90s default covers the longest synchronous image generation.
        # Status polls override to 30s per-request.
        self.client = httpx.AsyncClient(timeout=90.0)
        logger.info("byteplus_provider_init", base_url=self.base_url)

    async def generate_image(
        self,
        model: str,
        prompt: str,
        size: str = "2K",
        watermark: bool = True,
    ) -> dict:
        """
        Generate an image synchronously via POST /images/generations.

        Returns a dict with result_url, provider_task_id, usage_tokens, raw_response.
        Raises httpx.HTTPStatusError on 4xx/5xx responses.
        Raises ValueError if the response is missing required fields.
        """
        byteplus_size = self.SIZE_MAP.get(size, "2K")
        payload = {
            "model": model,
            "prompt": prompt,
            "size": byteplus_size,
            "response_format": "url",
            "stream": False,
            "watermark": watermark,
            "sequential_image_generation": "disabled",
        }
        url = f"{self.base_url}/images/generations"
        try:
            response = await self.client.post(url, headers=self._headers, json=payload)
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.error(
                "byteplus_generate_image_http_error",
                model=model,
                status=e.response.status_code,
            )
            raise
        except httpx.RequestError as e:
            logger.error("byteplus_generate_image_request_error", model=model, error=str(e))
            raise

        resp = response.json()
        data = resp.get("data") or []
        if not data or not isinstance(data[0], dict) or "url" not in data[0]:
            raise ValueError(
                f"BytePlus image response missing data[0].url: {list(resp.keys())}"
            )
        provider_task_id = (
            resp.get("id")
            or resp.get("request_id")
            or resp.get("requestId")
        )
        usage = resp.get("usage") or {}
        usage_tokens = usage.get("total_tokens", 0)
        if not provider_task_id:
            # BytePlus synchronous image responses can omit a task/request id.
            # Generate a stable fallback id so downstream logs/history still
            # have an identifier without failing the request.
            created = resp.get("created")
            provider_task_id = f"byteplus-sync-{created}" if created is not None else "byteplus-sync"

        result: dict = {
            "result_url": data[0]["url"],
            "provider_task_id": provider_task_id,
            "usage_tokens": usage_tokens,
            "raw_response": resp,
        }
        logger.info("byteplus_generate_image", model=model, size=byteplus_size)
        return result

    async def create_video_task(
        self,
        model: str,
        prompt: str,
        resolution: str = "1080p",
        duration: int = 5,
        camerafixed: bool = False,
        watermark: bool = True,
        reference_image_url: str | None = None,
    ) -> dict:
        """
        Create an async video generation task via POST /contents/generations/tasks.

        For I2V models, reference_image_url is validated against SSRF before use.
        Returns provider_task_id and initial status for polling.
        Raises ValueError on SSRF / invalid inline params / missing response fields.
        Raises httpx.HTTPStatusError on HTTP errors.
        """
        # SSRF validation must be first — before building content or any HTTP call.
        if reference_image_url is not None:
            validate_uri_no_ssrf(reference_image_url)

        inline_params = self._build_inline_params(resolution, duration, camerafixed, watermark)
        content: list[dict] = [
            {"type": "text", "text": f"{prompt}{inline_params}"},
        ]
        if reference_image_url is not None:
            content.append({"type": "image_url", "image_url": {"url": reference_image_url}})

        payload = {"model": model, "content": content}
        url = f"{self.base_url}/contents/generations/tasks"
        try:
            response = await self.client.post(url, headers=self._headers, json=payload)
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.error(
                "byteplus_create_video_task_http_error",
                model=model,
                status=e.response.status_code,
            )
            raise
        except httpx.RequestError as e:
            logger.error(
                "byteplus_create_video_task_request_error", model=model, error=str(e)
            )
            raise

        resp = response.json()
        provider_task_id = resp.get("id")
        status = resp.get("status")
        if not provider_task_id:
            raise ValueError(
                f"BytePlus video task response missing id: {list(resp.keys())}"
            )
        result: dict = {
            "provider_task_id": provider_task_id,
            "status": status,
        }
        logger.info(
            "byteplus_create_video_task",
            model=model,
            resolution=resolution,
            duration=duration,
        )
        return result

    async def get_task_status(self, task_id: str) -> dict:
        """
        Poll BytePlus for current task state.

        Uses a 30s per-request timeout (overrides the 90s client default)
        to fail status polls quickly. Returns raw response dict for caller
        to normalize via _normalize_byteplus_task_state().
        Raises httpx.HTTPStatusError on HTTP errors.
        """
        url = f"{self.base_url}/contents/generations/tasks/{task_id}"
        try:
            response = await self.client.get(url, headers=self._headers, timeout=30.0)
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.error(
                "byteplus_get_task_status_http_error",
                task_id=task_id,
                status=e.response.status_code,
            )
            raise
        except httpx.RequestError as e:
            logger.error(
                "byteplus_get_task_status_request_error", task_id=task_id, error=str(e)
            )
            raise
        result: dict = response.json()
        return result

    def _build_inline_params(
        self,
        resolution: str,
        duration: int,
        camerafixed: bool,
        watermark: bool,
    ) -> str:
        """
        Build inline parameter suffix appended to the video prompt.

        Security-critical: validates resolution and duration against explicit
        allowlists before string concatenation to prevent prompt injection.
        Raises ValueError for values outside the allowlists.
        """
        allowed_resolutions = {"720p", "1080p"}
        allowed_durations = {5, 10}

        if resolution not in allowed_resolutions:
            raise ValueError(
                f"Invalid resolution: {resolution!r}. Must be one of {allowed_resolutions}"
            )
        if duration not in allowed_durations:
            raise ValueError(
                f"Invalid duration: {duration}. Must be one of {allowed_durations}"
            )

        return (
            f"  --resolution {resolution}"
            f"  --duration {duration}"
            f"  --camerafixed {str(camerafixed).lower()}"
            f"  --watermark {str(watermark).lower()}"
        )

    def calculate_cost_usd(self, total_tokens: int) -> float:
        """Return USD cost for the given token count at $2.50 per 1M tokens."""
        return (total_tokens / 1_000_000) * self.BYTEPLUS_USD_PER_1M_TOKENS

    async def aclose(self) -> None:
        """Close the underlying httpx client. Call in a finally block after use."""
        await self.client.aclose()
