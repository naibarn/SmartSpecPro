import os
import httpx
import json
import asyncio
import time
import structlog
from typing import Dict, Any, Optional
from urllib.parse import urlparse, urlunparse

logger = structlog.get_logger()

# Legacy model name mapping fallback: SmartSpecPro -> Kie.ai API
# Primary source should be media_models.configJson.kieModelId (sent via api_config).
FALLBACK_MODEL_NAME_MAP = {
    # Image models
    "gpt-4o-image": "gpt-image-1",
    "chatgpt-4o-image": "gpt-image-1",
    "flux-kontext-pro": "flux-kontext-pro",
    "flux-kontext-max": "flux-kontext-max",
    "midjourney": "midjourney",
    "google-nano-banana-pro": "nano-banana-pro",
    "nano_banana_pro": "nano-banana-pro",
    "google-banana-2": "nano-banana-2",
    "google/nano-banana-2": "nano-banana-2",
    "nano_banana_2": "nano-banana-2",
    "google_banana_2": "nano-banana-2",
    "flux-2.0": "flux-2.0",
    "flux-2-0": "flux-2.0",
    "flux-1-1-pro": "flux-1.1-pro",
    "grok-imagine": "grok-imagine",
    "grok-imagine/text-to-video": "grok-imagine",
    "grok-imagine/image-to-video": "grok-imagine",
    "grok-imagine/upscale": "grok-imagine/upscale",
    "ideogram-2": "ideogram-2",
    "recraft-v3": "recraft-v3",
    "ghibli-ai": "ghibli-ai",
    # Video models
    "veo-3.1-fast": "veo-3.1-fast",
    "veo-3.1-quality": "veo-3.1",
    "veo-3-1": "veo-3.1",
    "veo-3.1": "veo-3.1",
    "runway-aleph": "runway-aleph",
    "sora-2": "sora-2",
    "kling-2.6": "kling-2.6",
    "kling-2-6": "kling-2.6",
    "wan-2.6": "wan-2.6",
    "wan-2-6": "wan-2.6",
    # Audio/Music models
    "suno-v4.5-plus": "suno-v4.5-plus",
    "suno-v4.5": "suno-v4.5",
    "suno-v4": "suno-v4",
    "elevenlabs-tts": "elevenlabs-tts",
    "elevenlabs-sfx": "elevenlabs-sfx",
    "sound-effects": "sound-effects",
    "vocal-removal": "vocal-removal",
    "stem-split": "stem-split",
    "music-cover": "music-cover",
}

_MODEL_RESOLUTION_STATS = {
    "explicit_api_model": 0,
    "fallback_alias_map": 0,
    "passthrough_model": 0,
}


def get_model_resolution_stats() -> Dict[str, int]:
    """Expose model-resolution counters for observability/tests."""
    return dict(_MODEL_RESOLUTION_STATS)


def reset_model_resolution_stats() -> None:
    """Reset model-resolution counters."""
    for key in _MODEL_RESOLUTION_STATS:
        _MODEL_RESOLUTION_STATS[key] = 0


def _get_api_config_value(api_config: Optional[Dict[str, Any]], *keys: str) -> Optional[str]:
    """Read a string value from api_config supporting snake_case and camelCase keys."""
    if not isinstance(api_config, dict):
        return None

    for key in keys:
        value = api_config.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _normalize_reference_image_input_type(raw_type: Optional[str]) -> Optional[str]:
    if not raw_type:
        return None

    normalized = raw_type.strip().lower()
    if normalized in {"array", "image_urls", "video_urls", "audio_urls"}:
        return "array"
    if normalized in {"url", "text", "string"}:
        return "url"
    return None


def _resolve_reference_image_input_config(
    api_config: Optional[Dict[str, Any]],
    *,
    default_key: str,
) -> tuple[str, str]:
    key = _get_api_config_value(
        api_config,
        "reference_image_input_key",
        "referenceImageInputKey",
        "reference_image_key",
        "referenceImageKey",
    ) or default_key
    input_type = _normalize_reference_image_input_type(
        _get_api_config_value(
            api_config,
            "reference_image_input_type",
            "referenceImageInputType",
            "reference_image_type",
            "referenceImageType",
        )
    ) or "array"
    return key, input_type


def resolve_api_model(model: str, api_config: Optional[Dict[str, Any]] = None) -> str:
    """
    Resolve Kie model ID from api_config first, then fallback alias mapping.
    """
    explicit_model = _get_api_config_value(
        api_config,
        "kie_model_id",
        "kieModelId",
        "model_id",
        "modelId",
    )
    if explicit_model:
        _MODEL_RESOLUTION_STATS["explicit_api_model"] += 1
        return explicit_model

    return normalize_model_name(model)


def normalize_model_name(model: str) -> str:
    """Fallback conversion for legacy/internal model aliases."""
    normalized = FALLBACK_MODEL_NAME_MAP.get(model)
    if normalized:
        _MODEL_RESOLUTION_STATS["fallback_alias_map"] += 1
        logger.warning("kie_ai_model_alias_fallback_used", original=model, normalized=normalized)
        return normalized

    _MODEL_RESOLUTION_STATS["passthrough_model"] += 1
    logger.debug("kie_ai_model_passthrough", model=model)
    return model


class KieAIProvider:
    """
    Kie.ai API Provider

    API Documentation: https://kie.ai/docs

    The Kie.ai API uses a task-based approach:
    1. Create a task via POST /jobs/createTask
    2. Poll for status via GET /jobs/status/{taskId}
    3. Get result when status is "completed"
    """

    BASE_URL = "https://api.kie.ai/api/v1"

    @classmethod
    def normalize_base_url(cls, base_url: Optional[str]) -> str:
        """
        Normalize Kie API base URL to a valid API host/path.

        Handles common misconfigurations like:
        - https://kie.ai/api/v1  -> https://api.kie.ai/api/v1
        - https://api.kie.ai     -> https://api.kie.ai/api/v1
        - https://api.kie.ai/api/v1/jobs -> https://api.kie.ai/api/v1
        """
        raw = (base_url or cls.BASE_URL).strip()
        if not raw:
            return cls.BASE_URL

        # Ensure URL has scheme for urlparse to work predictably
        if not raw.startswith(("http://", "https://")):
            raw = f"https://{raw}"

        parsed = urlparse(raw)
        scheme = parsed.scheme or "https"
        netloc = parsed.netloc
        path = parsed.path or ""

        # Handle values like "api.kie.ai/api/v1" that may end up in path
        if not netloc and path:
            parts = path.split("/", 1)
            netloc = parts[0]
            path = f"/{parts[1]}" if len(parts) > 1 else ""

        lowered_host = netloc.lower()
        if lowered_host in {"kie.ai", "www.kie.ai"}:
            netloc = "api.kie.ai"

        normalized_path = path.rstrip("/")
        if normalized_path in {"", "/"}:
            normalized_path = "/api/v1"
        elif normalized_path == "/v1":
            normalized_path = "/api/v1"
        elif normalized_path == "/api/v1/jobs":
            normalized_path = "/api/v1"
        elif normalized_path.startswith("/api/v1/jobs/"):
            normalized_path = f"/api/v1{normalized_path[len('/api/v1/jobs'):]}"

        normalized = urlunparse((scheme, netloc, normalized_path, "", "", ""))
        return normalized.rstrip("/")

    def __init__(self, api_key: str, base_url: str | None = None, callback_url: str | None = None):
        self.api_key = api_key
        raw_base_url = base_url or self.BASE_URL
        self.base_url = self.normalize_base_url(raw_base_url)
        # Callback URL for async task completion notifications
        self.callback_url = callback_url
        # Increased timeout to 600s to handle longer generation times
        self.client = httpx.AsyncClient(timeout=600.0)

        if raw_base_url and self.base_url != str(raw_base_url).rstrip("/"):
            logger.warning(
                "kie_ai_base_url_normalized",
                raw_base_url=raw_base_url,
                normalized_base_url=self.base_url,
            )

        if callback_url:
            logger.info("kie_ai_callback_configured", callback_url=callback_url)

    @staticmethod
    def _extract_task_id(result: Dict[str, Any], *, include_record_id: bool = False) -> Optional[str]:
        """Extract a task identifier from common Kie submission responses."""
        if not isinstance(result, dict):
            return None

        task_id = (
            result.get("taskId") or
            result.get("task_id") or
            (result.get("data") or {}).get("taskId") or
            (result.get("data") or {}).get("task_id")
        )
        if not task_id and include_record_id:
            task_id = (
                (result.get("data") or {}).get("recordId") or
                result.get("recordId")
            )

        if isinstance(task_id, str):
            task_id = task_id.strip()
        return task_id or None

    @staticmethod
    def _extract_submission_error_message(result: Dict[str, Any]) -> Optional[str]:
        """Extract a readable provider-side error from submission responses."""
        if not isinstance(result, dict):
            return None

        candidates: list[Any] = [
            result.get("msg"),
            result.get("message"),
            result.get("error"),
            result.get("detail"),
        ]
        data = result.get("data")
        if isinstance(data, dict):
            candidates.extend([
                data.get("msg"),
                data.get("message"),
                data.get("error"),
                data.get("detail"),
                data.get("errorMessage"),
            ])

        for candidate in candidates:
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        return None

    @classmethod
    def _is_retryable_submission_response(cls, result: Dict[str, Any]) -> bool:
        """Detect transient provider failures returned in a JSON body with HTTP 200."""
        if not isinstance(result, dict):
            return False

        codes: list[Any] = [result.get("code"), result.get("status"), result.get("errorCode")]
        data = result.get("data")
        if isinstance(data, dict):
            codes.extend([data.get("code"), data.get("status"), data.get("errorCode")])

        for code in codes:
            if isinstance(code, int) and code >= 500:
                return True
            if isinstance(code, str):
                normalized = code.strip().lower()
                if normalized.isdigit() and int(normalized) >= 500:
                    return True
                if normalized in {"server_error", "internal_server_error"}:
                    return True

        message = (cls._extract_submission_error_message(result) or "").lower()
        return any(fragment in message for fragment in (
            "server exception",
            "please try again later",
            "contact customer service",
            "temporarily unavailable",
            "system busy",
            "internal server error",
        ))

    @classmethod
    def _is_retryable_submission_exception(cls, error: Exception) -> bool:
        """Detect transient HTTP/client failures during task submission."""
        if isinstance(error, httpx.RequestError):
            return True

        if not isinstance(error, httpx.HTTPStatusError):
            return False

        status_code = error.response.status_code
        if status_code in {408, 429, 500, 502, 503, 504}:
            return True

        body = ""
        try:
            body = error.response.text
        except Exception:
            body = ""

        body = body.lower()
        return any(fragment in body for fragment in (
            "server exception",
            "please try again later",
            "contact customer service",
            "temporarily unavailable",
            "system busy",
            "internal server error",
            "service unavailable",
        ))

    @classmethod
    def _format_submission_exception_message(cls, error: Exception) -> str:
        """Turn a submission exception into a concise provider-facing message."""
        if isinstance(error, httpx.HTTPStatusError):
            try:
                payload = error.response.json()
            except Exception:
                payload = None

            if isinstance(payload, dict):
                message = cls._extract_submission_error_message(payload)
                if message:
                    return message

                detail = payload.get("detail")
                if isinstance(detail, str) and detail.strip():
                    return detail.strip()

            try:
                body = error.response.text.strip()
            except Exception:
                body = ""

            if body:
                return body[:500]
            return f"HTTP {error.response.status_code}"

        return str(error).strip() or error.__class__.__name__

    @staticmethod
    def _submission_backoff_seconds(attempt: int) -> float:
        """Exponential backoff for transient submission failures."""
        return min(float(2 ** max(attempt - 1, 0)), 8.0)

    async def _submit_generation_task(
        self,
        request_factory,
        *,
        operation: str,
        include_record_id: bool = False,
        max_attempts: int = 3,
    ) -> tuple[Dict[str, Any], str]:
        """Submit a task request and retry transient JSON-level provider errors."""
        last_result: Optional[Dict[str, Any]] = None

        for attempt in range(1, max_attempts + 1):
            try:
                result = await request_factory()
            except Exception as exc:  # noqa: BLE001
                retryable = self._is_retryable_submission_exception(exc)
                logger.warning(
                    "kie_ai_submission_request_failed",
                    operation=operation,
                    attempt=attempt,
                    max_attempts=max_attempts,
                    retryable=retryable,
                    error=str(exc),
                    error_type=type(exc).__name__,
                )

                if retryable and attempt < max_attempts:
                    delay_seconds = self._submission_backoff_seconds(attempt)
                    logger.warning(
                        "kie_ai_task_submission_retrying",
                        operation=operation,
                        attempt=attempt,
                        max_attempts=max_attempts,
                        delay_seconds=delay_seconds,
                        error=str(exc),
                    )
                    await asyncio.sleep(delay_seconds)
                    continue

                provider_message = self._format_submission_exception_message(exc)
                raise Exception(f"Kie.ai task submission failed: {provider_message}") from exc

            last_result = result
            task_id = self._extract_task_id(result, include_record_id=include_record_id)
            if task_id:
                return result, task_id

            retryable = self._is_retryable_submission_response(result)
            provider_message = self._extract_submission_error_message(result)
            logger.error(
                "kie_ai_no_task_id",
                operation=operation,
                attempt=attempt,
                max_attempts=max_attempts,
                retryable=retryable,
                provider_message=provider_message,
                result=result,
            )

            if retryable and attempt < max_attempts:
                delay_seconds = self._submission_backoff_seconds(attempt)
                logger.warning(
                    "kie_ai_task_submission_retrying",
                    operation=operation,
                    attempt=attempt,
                    max_attempts=max_attempts,
                    delay_seconds=delay_seconds,
                    provider_message=provider_message,
                )
                await asyncio.sleep(delay_seconds)
                continue

            if provider_message:
                raise Exception(f"Kie.ai task submission failed: {provider_message}")
            raise Exception(f"Kie.ai did not return a task ID: {result}")

        raise Exception(f"Kie.ai did not return a task ID: {last_result}")

    async def _make_request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Dict:
        """Make HTTP request to Kie.ai API"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        url = f"{self.base_url}/{endpoint.lstrip('/')}"

        logger.info("kie_ai_request", method=method, url=url)

        try:
            if method == "POST":
                response = await self.client.post(url, headers=headers, json=data)
            elif method == "GET":
                response = await self.client.get(url, headers=headers, params=data)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error("kie_ai_http_error", status=e.response.status_code, body=e.response.text)
            raise
        except httpx.RequestError as e:
            logger.error("kie_ai_request_error", url=str(e.request.url), error=str(e))
            raise
        except json.JSONDecodeError as e:
            logger.error("kie_ai_json_error", error=str(e))
            raise

    async def create_task(
        self,
        model: str,
        input_params: Dict[str, Any],
        callback_url: str | None = None,
    ) -> Dict:
        """
        Create a generation task

        Args:
            model: Model name (e.g., "nano-banana-pro", "veo-3-1", "kling-2-6")
            input_params: Model-specific input parameters
            callback_url: Optional webhook URL for task completion notification

        Returns:
            Task creation response with taskId
        """
        payload = {
            "model": model,
            "input": input_params
        }

        if callback_url:
            payload["callBackUrl"] = callback_url

        logger.info("kie_ai_create_task", model=model, input_keys=list(input_params.keys()))
        return await self._make_request("POST", "jobs/createTask", data=payload)

    async def get_task_status(
        self,
        task_id: str,
        preferred_status_endpoint: Optional[str] = None,
        extra_status_endpoints: Optional[list[str]] = None,
    ) -> Dict:
        """
        Get the status of a task using Kie.ai endpoints

        Tries multiple endpoints:
        1. Model-specific endpoint from DB config (if provided)
        2. GET /api/v1/jobs/recordInfo?taskId={task_id} (new API)
        3. GET /api/v1/veo/record-info?taskId={task_id} (Veo models)
        4. GET /api/v1/jobs/status/{task_id} (legacy API)

        Args:
            task_id: The task ID returned from create_task

        Returns:
            Task status response with 'state' or 'status' field
        """
        def _normalize_status_endpoint(raw_endpoint: str) -> Optional[str]:
            """Normalize custom status endpoint into a base_url-relative path."""
            if not raw_endpoint:
                return None

            endpoint = str(raw_endpoint).strip()
            if not endpoint:
                return None

            # Support placeholders
            endpoint = endpoint.replace("{task_id}", task_id)
            endpoint = endpoint.replace("{taskId}", task_id)
            endpoint = endpoint.replace("{id}", task_id)

            # Convert absolute URL to relative path when possible
            if endpoint.startswith("http://") or endpoint.startswith("https://"):
                parsed = urlparse(endpoint)
                base_parsed = urlparse(self.base_url)
                if parsed.netloc and parsed.netloc != base_parsed.netloc:
                    logger.warning(
                        "kie_ai_status_endpoint_domain_mismatch",
                        endpoint=endpoint,
                        base_url=self.base_url,
                    )
                endpoint = parsed.path or ""
                if parsed.query:
                    endpoint = f"{endpoint}?{parsed.query}"

            # Strip API prefix if present (base_url already includes /api/v1)
            if endpoint.startswith("/api/v1/"):
                endpoint = endpoint[len("/api/v1/"):]
            elif endpoint.startswith("api/v1/"):
                endpoint = endpoint[len("api/v1/"):]

            endpoint = endpoint.lstrip("/")
            if not endpoint:
                return None

            # If endpoint doesn't include task identifier, append taskId query for common record/query routes
            has_task_ref = (
                task_id in endpoint
                or "taskId=" in endpoint
                or "task_id=" in endpoint
                or "/status/" in endpoint
                or "/record/" in endpoint
            )
            if not has_task_ref and any(k in endpoint for k in ("recordInfo", "record-info", "queryTask", "query-task")):
                endpoint = f"{endpoint}&taskId={task_id}" if "?" in endpoint else f"{endpoint}?taskId={task_id}"

            return endpoint

        def _has_useful_data(resp: Dict) -> bool:
            if not isinstance(resp, dict):
                return False
            data = resp.get("data")
            if isinstance(data, dict):
                if any(k in data for k in (
                    "state", "status", "resultJson", "resultUrls", "taskResult",
                    "response", "successFlag", "errorCode", "errorMessage", "completeTime"
                )):
                    return True
            # Legacy/top-level shapes
            if any(k in resp for k in ("state", "status", "output", "url")):
                return True
            return False

        endpoints: list[tuple[str, str]] = []

        # 1) Per-model status endpoint (from media_models configJson)
        if preferred_status_endpoint:
            normalized = _normalize_status_endpoint(preferred_status_endpoint)
            if normalized:
                endpoints.append(("preferred_status", normalized))

        # 2) Additional fallback endpoints from caller (optional)
        if extra_status_endpoints:
            for extra in extra_status_endpoints:
                normalized = _normalize_status_endpoint(extra)
                if normalized:
                    endpoints.append(("extra_status", normalized))

        # 3) Built-in fallbacks (for generic models and legacy records)
        endpoints.extend([
            ("recordInfo", f"jobs/recordInfo?taskId={task_id}"),
            ("veo_record_info", f"veo/record-info?taskId={task_id}"),
            ("legacy_status", f"jobs/status/{task_id}"),
        ])

        # De-duplicate endpoints while preserving order
        deduped: list[tuple[str, str]] = []
        seen: set[str] = set()
        for label, endpoint in endpoints:
            if endpoint in seen:
                continue
            seen.add(endpoint)
            deduped.append((label, endpoint))
        endpoints = deduped

        last_response: Optional[Dict] = None
        last_error: Optional[Exception] = None

        for label, endpoint in endpoints:
            try:
                response = await self._make_request("GET", endpoint)

                # Normalize legacy format to match recordInfo format
                if "status" in response and "state" not in response:
                    status = str(response.get("status", "")).lower()
                    if status == "completed":
                        response["state"] = "success"
                    elif status == "failed":
                        response["state"] = "fail"
                    else:
                        response["state"] = status

                code = response.get("code")
                data_type = type(response.get("data")).__name__ if response.get("data") is not None else None
                logger.info(
                    "kie_ai_status_endpoint_response",
                    task_id=task_id,
                    endpoint_label=label,
                    endpoint=endpoint,
                    code=code,
                    keys=list(response.keys()) if isinstance(response, dict) else None,
                    data_type=data_type,
                )

                last_response = response

                # Prefer first response that contains meaningful status/result payload.
                if _has_useful_data(response):
                    return response

                logger.warning(
                    "kie_ai_status_endpoint_unusable_response",
                    task_id=task_id,
                    endpoint_label=label,
                    endpoint=endpoint,
                    code=code,
                    msg=response.get("msg") if isinstance(response, dict) else None,
                )
            except Exception as e:
                last_error = e
                logger.warning(
                    "kie_ai_status_endpoint_failed",
                    task_id=task_id,
                    endpoint_label=label,
                    endpoint=endpoint,
                    error=str(e),
                )

        # Return the last non-exception response for caller-side diagnostics.
        if last_response is not None:
            return last_response

        logger.error("kie_ai_status_failed", task_id=task_id, error=str(last_error) if last_error else "unknown")
        raise last_error or RuntimeError("Failed to fetch task status from all endpoints")

    async def wait_for_task(self, task_id: str, poll_interval: float = 2.0, max_wait: float = 300.0) -> Dict:
        """
        Wait for a task to complete by polling

        Args:
            task_id: The task ID to wait for
            poll_interval: Seconds between status checks
            max_wait: Maximum seconds to wait

        Returns:
            Normalized response compatible with SmartSpecPro format:
            {
                "id": task_id,
                "created": timestamp,
                "data": [{"url": "..."}, ...]
            }
        """
        elapsed = 0.0
        while elapsed < max_wait:
            status_response = await self.get_task_status(task_id)

            # Kie.ai uses 'state' field with values: success, fail, processing
            # Also check nested data.state for wrapped responses
            nested = status_response.get("data") or {}
            if not isinstance(nested, dict):
                nested = {}
            task_state = (
                status_response.get("state", "").lower() or
                nested.get("state", "").lower() or
                status_response.get("status", "").lower()  # fallback
            )

            logger.info("kie_ai_task_poll", task_id=task_id, state=task_state, elapsed=elapsed, response_keys=list(status_response.keys()))

            if task_state == "success":
                # Normalize response to SmartSpecPro format
                return self._normalize_response(task_id, status_response)
            elif task_state == "fail":
                fail_msg = (
                    status_response.get("failMsg") or
                    nested.get("failMsg") or
                    status_response.get("error") or
                    "Unknown error"
                )
                raise Exception(f"Task failed: {fail_msg}")
            elif task_state in ["pending", "processing", "running", "created", ""]:
                await asyncio.sleep(poll_interval)
                elapsed += poll_interval
            else:
                logger.warning("kie_ai_unknown_state", state=task_state, response=status_response)
                await asyncio.sleep(poll_interval)
                elapsed += poll_interval

        raise TimeoutError(f"Task {task_id} did not complete within {max_wait} seconds")

    def _normalize_response(self, task_id: str, kie_response: Dict) -> Dict:
        """
        Transform Kie.ai response to SmartSpecPro expected format

        Kie.ai recordInfo returns:
        {
            "code": 200,
            "data": {
                "state": "success",
                "resultJson": "{\"resultUrls\": [\"https://...\"]}"  # Note: may be a JSON string!
            }
        }

        SmartSpecPro expects:
        {
            "id": "...",
            "created": timestamp,
            "data": [{"url": "..."}, ...]
        }
        """
        import time

        data = []

        # Log full response for debugging credit extraction — write to file for easy access
        logger.info("kie_ai_raw_response_keys", task_id=task_id,
                     top_keys=list(kie_response.keys()) if isinstance(kie_response, dict) else "not_dict",
                     data_keys=list((kie_response.get("data") or {}).keys()) if isinstance(kie_response.get("data"), dict) else str(type(kie_response.get("data"))))
        try:
            import json as _json
            with open("/tmp/kie_ai_last_response.json", "w") as f:
                _json.dump(kie_response, f, indent=2, default=str)
        except Exception:
            pass

        # Try to get data from various locations in the response
        # 1. Check nested data.resultJson.resultUrls (Kie.ai recordInfo format)
        nested_data = kie_response.get("data", {})
        if isinstance(nested_data, dict):
            result_json = nested_data.get("resultJson", {})

            # IMPORTANT: resultJson might be a JSON string, not a dict
            if isinstance(result_json, str):
                try:
                    result_json = json.loads(result_json)
                    logger.info("kie_ai_result_json_parsed", task_id=task_id, parsed_keys=list(result_json.keys()) if isinstance(result_json, dict) else "not_dict")
                except json.JSONDecodeError:
                    logger.warning("kie_ai_result_json_parse_failed", task_id=task_id, result_json=result_json[:200] if len(result_json) > 200 else result_json)
                    result_json = {}

            if isinstance(result_json, dict):
                result_urls = result_json.get("resultUrls", [])
                logger.info("kie_ai_result_urls", task_id=task_id, urls_count=len(result_urls) if result_urls else 0, urls_type=type(result_urls).__name__)
                if result_urls:
                    for url in result_urls:
                        if isinstance(url, str):
                            data.append({"url": url})
                        elif isinstance(url, dict) and url.get("url"):
                            data.append({"url": url["url"]})

        # 2. Check if data has resultUrls directly (without resultJson wrapper)
        if not data and isinstance(nested_data, dict):
            direct_urls = nested_data.get("resultUrls", [])
            if direct_urls:
                logger.info("kie_ai_direct_urls_found", task_id=task_id, count=len(direct_urls))
                for url in direct_urls:
                    if isinstance(url, str):
                        data.append({"url": url})
                    elif isinstance(url, dict) and url.get("url"):
                        data.append({"url": url["url"]})

        # 3. Check if data has images/videos directly
        if not data and isinstance(nested_data, dict):
            for key in ["images", "videos", "audios", "files", "urls"]:
                items = nested_data.get(key, [])
                if items:
                    logger.info("kie_ai_items_found", task_id=task_id, key=key, count=len(items))
                    for item in items:
                        if isinstance(item, str):
                            data.append({"url": item})
                        elif isinstance(item, dict):
                            url = item.get("url") or item.get("image_url") or item.get("video_url") or item.get("audio_url")
                            if url:
                                data.append({"url": url})
                    break

        # 4. Fallback: check output field (old format)
        if not data:
            output = kie_response.get("output", {})
            if isinstance(output, dict):
                if "url" in output:
                    data.append({"url": output["url"]})
                elif "urls" in output:
                    data.extend([{"url": url} for url in output["urls"]])
                elif "image_url" in output:
                    data.append({"url": output["image_url"]})
                elif "video_url" in output:
                    data.append({"url": output["video_url"]})
                elif "audio_url" in output:
                    data.append({"url": output["audio_url"]})
                else:
                    # Try to find any URL-like field
                    for key, value in output.items():
                        if isinstance(value, str) and value.startswith("http"):
                            data.append({"url": value})
                            break
            elif isinstance(output, list):
                for item in output:
                    if isinstance(item, str):
                        data.append({"url": item})
                    elif isinstance(item, dict) and "url" in item:
                        data.append({"url": item["url"]})

        # 5. Check for direct URL in response
        if not data and kie_response.get("url"):
            data.append({"url": kie_response["url"]})

        # 6. Last resort: scan entire response for URLs using regex
        if not data:
            import re
            response_str = json.dumps(kie_response)
            # Find all URLs in the response
            url_pattern = r'https?://[^\s"\'\]},]+'
            found_urls = re.findall(url_pattern, response_str)
            # Filter for likely media URLs
            media_extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.mp3', '.wav', '.webm', '.svg']
            for url in found_urls:
                # Clean URL (remove trailing punctuation)
                url = url.rstrip('.,;:')
                # Skip API endpoints
                if 'api.kie.ai' in url.lower():
                    continue
                # Check if it's a media URL or from known CDN
                is_media = any(ext in url.lower() for ext in media_extensions)
                is_cdn = any(cdn in url.lower() for cdn in ['cdn', 'storage', 'media', 'blob', 'files', 's3.', 'cloudfront', 'kie', 'amazonaws'])
                if is_media or is_cdn:
                    data.append({"url": url})
                    logger.info("kie_ai_url_regex_found", task_id=task_id, url=url[:100])

        # Log result
        if data:
            logger.info("kie_ai_response_normalized", task_id=task_id, data_count=len(data), first_url=data[0]["url"][:80] if data else None)
        else:
            # Log warning with full response structure for debugging
            logger.warning("kie_ai_no_urls_found", task_id=task_id, response_keys=list(kie_response.keys()),
                          data_keys=list(nested_data.keys()) if isinstance(nested_data, dict) else "not_dict",
                          response_preview=str(kie_response)[:500])

        # Extract creditsConsumed from Kie.ai response for actual cost reconciliation
        # Check both top-level response and nested data dict
        kie_credits_consumed = None
        search_dicts = [d for d in [kie_response, nested_data] if isinstance(d, dict)]
        for search_dict in search_dicts:
            if kie_credits_consumed is not None:
                break
            for key in ("creditsConsumed", "credits_consumed", "credits", "cost", "creditCost"):
                val = search_dict.get(key)
                if val is not None:
                    try:
                        kie_credits_consumed = float(val)
                        logger.info("kie_ai_credits_consumed", task_id=task_id, field=key, source="top" if search_dict is kie_response else "data", value=kie_credits_consumed)
                    except (ValueError, TypeError):
                        pass
                    break

        return {
            "id": task_id,
            "created": int(time.time()),
            "data": data,
            "kie_credits_consumed": kie_credits_consumed,
            "raw_response": kie_response  # Keep original for debugging
        }

    async def generate_image(self, model: str, prompt: str, **kwargs) -> Dict:
        """
        Generate an image using Kie.ai

        Args:
            model: Model name (e.g., "google-nano-banana-pro", "flux-1-1-pro")
            prompt: Text prompt for image generation
            **kwargs: Additional parameters like aspect_ratio, resolution, output_format,
                      api_config (endpoint/format from configJson), extra_params

        Returns:
            Generation result with image URL
        """
        # Check for per-model API config from configJson
        api_config = kwargs.pop("api_config", None)
        extra_params = kwargs.pop("extra_params", None)

        # Determine API model name
        api_model = resolve_api_model(model, api_config)

        # Build input parameters for image generation
        input_params = {
            "prompt": prompt,
            "aspect_ratio": kwargs.get("aspect_ratio", "1:1"),
            "resolution": kwargs.get("resolution", "1K"),
            "output_format": kwargs.get("output_format", "png")
        }

        # Add optional parameters if provided
        if kwargs.get("negative_prompt"):
            input_params["negative_prompt"] = kwargs["negative_prompt"]
        if kwargs.get("seed"):
            input_params["seed"] = kwargs["seed"]
        if kwargs.get("num_images"):
            input_params["num_images"] = kwargs["num_images"]

        # Merge extra_params from configJson-based dynamic fields
        if extra_params and isinstance(extra_params, dict):
            for key, value in extra_params.items():
                if value is not None:
                    input_params[key] = value

        # Add reference images for style transfer / img2img
        # The target field is driven by model config metadata passed through api_config.
        if kwargs.get("reference_image_urls"):
            ref_urls = kwargs["reference_image_urls"]
            if isinstance(ref_urls, list) and len(ref_urls) > 0:
                reference_image_input_key, reference_image_input_type = _resolve_reference_image_input_config(
                    api_config,
                    default_key="image_input",
                )
                if reference_image_input_type == "url":
                    input_params[reference_image_input_key] = ref_urls[0]
                else:
                    input_params[reference_image_input_key] = ref_urls
                logger.info(
                    "kie_ai_reference_images",
                    count=len(ref_urls),
                    field_key=reference_image_input_key,
                    field_type=reference_image_input_type,
                    urls=ref_urls[:2],
                )  # Log first 2 for debug

        # Add reference style URL if provided
        if kwargs.get("reference_style_url"):
            input_params["style_reference"] = kwargs["reference_style_url"]
            logger.info("kie_ai_style_reference", url=kwargs["reference_style_url"][:50])

        # Use provided callback_url if explicitly passed, otherwise fall back to stored callback_url
        # Empty string ("") means "no callback" - use polling mode
        callback_url_raw = kwargs.get("callback_url")
        callback_url: str | None
        if callback_url_raw is None:  # Only fall back if not explicitly passed
            callback_url = self.callback_url
        else:
            callback_url = str(callback_url_raw)
        if callback_url == "":  # Empty string means explicitly disable callback
            callback_url = None

        logger.info("kie_ai_generate_image",
                    model=api_model,
                    has_callback=bool(callback_url),
                    has_api_config=bool(api_config),
                    callback_url=callback_url[:50] if callback_url else None)

        # Determine endpoint — use api_config endpoint or default to create_task
        api_endpoint = _get_api_config_value(api_config, "endpoint", "api_endpoint", "apiEndpoint")

        async def submit_request() -> Dict[str, Any]:
            if api_endpoint and api_endpoint != "/api/v1/jobs/createTask":
                payload = {"prompt": prompt, **input_params}
                if api_model:
                    payload["model"] = api_model
                if callback_url:
                    payload["callBackUrl"] = callback_url
                return await self._make_request("POST", api_endpoint.removeprefix("/api/v1/"), data=payload)
            return await self.create_task(api_model, input_params, callback_url)

        result, task_id = await self._submit_generation_task(
            submit_request,
            operation="image",
        )

        logger.info("kie_ai_task_created", task_id=task_id, has_callback=bool(callback_url), raw_result=result)

        # If no callback URL, poll for result (synchronous wait)
        if not callback_url:
            logger.info("kie_ai_polling_mode", task_id=task_id)
            return await self.wait_for_task(task_id)

        # With callback URL, return task info immediately (async mode)
        logger.info("kie_ai_callback_mode", task_id=task_id, callback_url=callback_url)
        return {
            "id": task_id,
            "status": "processing",
            "data": [],
            "created": int(time.time()),
            "message": "Task created. Result will be delivered via callback URL."
        }

    async def generate_video(self, model: str, prompt: str, **kwargs) -> Dict:
        """
        Generate a video using Kie.ai

        Args:
            model: Model name (e.g., "veo-3-1", "sora-2", "kling-2-6")
            prompt: Text prompt for video generation
            **kwargs: Additional parameters like duration, aspect_ratio,
                      api_config (endpoint/format from configJson), extra_params

        Returns:
            Generation result with video URL
        """
        # Check for per-model API config from configJson
        api_config = kwargs.pop("api_config", None)
        extra_params = kwargs.pop("extra_params", None)
        wait_for_completion = kwargs.pop("wait_for_completion", True)

        # Determine API model name
        api_model = resolve_api_model(model, api_config)

        input_params = {
            "prompt": prompt,
            "duration": kwargs.get("duration", 5),
            "aspect_ratio": kwargs.get("aspect_ratio", "16:9")
        }

        if kwargs.get("resolution"):
            input_params["resolution"] = kwargs["resolution"]
        if kwargs.get("fps"):
            input_params["fps"] = kwargs["fps"]

        # Merge extra_params from configJson-based dynamic fields
        if extra_params and isinstance(extra_params, dict):
            for key, value in extra_params.items():
                if value is not None:
                    input_params[key] = value

        # Add reference images if provided
        if kwargs.get("reference_image_urls"):
            ref_urls = kwargs["reference_image_urls"]
            if isinstance(ref_urls, list) and len(ref_urls) > 0:
                reference_image_input_key, reference_image_input_type = _resolve_reference_image_input_config(
                    api_config,
                    default_key="image_urls",
                )
                if reference_image_input_type == "url":
                    input_params[reference_image_input_key] = ref_urls[0]
                else:
                    input_params[reference_image_input_key] = ref_urls

        # Use provided callback_url if explicitly passed, otherwise fall back to stored callback_url
        # Empty string ("") means "no callback" - use polling mode
        callback_url_raw = kwargs.get("callback_url")
        callback_url: str | None
        if callback_url_raw is None:  # Only fall back if not explicitly passed
            callback_url = self.callback_url
        else:
            callback_url = str(callback_url_raw)
        if callback_url == "":  # Empty string means explicitly disable callback
            callback_url = None

        # Determine endpoint — use api_config endpoint or default to create_task
        api_endpoint = _get_api_config_value(api_config, "endpoint", "api_endpoint", "apiEndpoint")

        async def submit_request() -> Dict[str, Any]:
            if api_endpoint and api_endpoint != "/api/v1/jobs/createTask":
                payload = {"prompt": prompt, **input_params}
                if api_model:
                    payload["model"] = api_model
                if callback_url:
                    payload["callBackUrl"] = callback_url
                response = await self._make_request("POST", api_endpoint.removeprefix("/api/v1/"), data=payload)
                logger.info("kie_ai_custom_endpoint_response", endpoint=api_endpoint, result_keys=list(response.keys()) if isinstance(response, dict) else "not_dict", result_type=type(response).__name__)

                if "veo" in api_endpoint.lower():
                    import json as _json
                    logger.warning("VEO_RESPONSE_DEBUG", endpoint=api_endpoint, full_response=_json.dumps(response, indent=2, default=str))
                return response
            return await self.create_task(api_model, input_params, callback_url)

        result, task_id = await self._submit_generation_task(
            submit_request,
            operation="video",
            include_record_id=True,
        )

        logger.info("kie_ai_video_task_id_extracted", task_id=task_id, has_callback=bool(callback_url), will_poll=bool(wait_for_completion and not callback_url and task_id), wait_for_completion=bool(wait_for_completion), result_structure={
            "has_taskId": "taskId" in result,
            "has_task_id": "task_id" in result,
            "has_recordId": "recordId" in result,
            "has_data": "data" in result,
            "data_keys": list(result.get("data", {}).keys()) if isinstance(result.get("data"), dict) else None
        })

        # Poll only in explicit wait mode.
        # For async queue flows, return immediately after task submission.
        if wait_for_completion and not callback_url:
            logger.info("kie_ai_video_polling_started", task_id=task_id, max_wait=1200.0)
            return await self.wait_for_task(task_id, poll_interval=5.0, max_wait=1200.0)

        logger.info(
            "kie_ai_video_task_created_async",
            task_id=task_id,
            has_callback=bool(callback_url),
            wait_for_completion=bool(wait_for_completion),
            callback_url=callback_url
        )
        return {
            "id": task_id,
            "status": "processing",
            "data": [],
            "created": int(time.time()),
            "message": "Video task created. Result will be delivered via callback URL."
        }

    async def generate_audio(self, model: str, text: str, **kwargs) -> Dict:
        """
        Generate audio using Kie.ai (TTS, sound effects)

        Args:
            model: Model name (e.g., "elevenlabs-tts", "sound-effects")
            text: Text for TTS or description for sound effects
            **kwargs: Additional parameters like voice_id, language

        Returns:
            Generation result with audio URL
        """
        # Resolve model ID from api_config first, then fallback alias mapping
        api_config = kwargs.pop("api_config", None)
        extra_params = kwargs.pop("extra_params", None)
        api_model = resolve_api_model(model, api_config)

        omit_text_raw = _get_api_config_value(api_config, "omit_text", "omitText")
        omit_text = str(omit_text_raw).strip().lower() in {"1", "true", "yes", "on"}

        input_params = {}
        if text and not omit_text:
            input_params["text"] = text

        if kwargs.get("voice"):
            input_params["voice"] = kwargs["voice"]
        if kwargs.get("voice_id"):
            input_params["voice_id"] = kwargs["voice_id"]
        if kwargs.get("language"):
            input_params["language"] = kwargs["language"]
        if kwargs.get("speed"):
            input_params["speed"] = kwargs["speed"]
        if kwargs.get("stability") is not None:
            input_params["stability"] = kwargs["stability"]
        if kwargs.get("similarity_boost") is not None:
            input_params["similarity_boost"] = kwargs["similarity_boost"]
        if kwargs.get("output_format"):
            input_params["output_format"] = kwargs["output_format"]

        # Merge extra_params from configJson-based dynamic fields
        if extra_params and isinstance(extra_params, dict):
            for key, value in extra_params.items():
                if value is not None:
                    input_params[key] = value

        # Use provided callback_url if explicitly passed, otherwise fall back to stored callback_url
        # Empty string ("") means "no callback" - use polling mode
        callback_url_raw = kwargs.get("callback_url")
        callback_url: str | None
        if callback_url_raw is None:  # Only fall back if not explicitly passed
            callback_url = self.callback_url
        else:
            callback_url = str(callback_url_raw)
        if callback_url == "":  # Empty string means explicitly disable callback
            callback_url = None

        # Determine endpoint — use api_config endpoint or default to create_task
        api_endpoint = _get_api_config_value(api_config, "endpoint", "api_endpoint", "apiEndpoint")

        async def submit_request() -> Dict[str, Any]:
            if api_endpoint and api_endpoint != "/api/v1/jobs/createTask":
                payload = dict(input_params)
                if api_model:
                    payload["model"] = api_model
                if callback_url:
                    payload["callBackUrl"] = callback_url
                return await self._make_request("POST", api_endpoint.removeprefix("/api/v1/"), data=payload)
            return await self.create_task(api_model, input_params, callback_url)

        result, task_id = await self._submit_generation_task(
            submit_request,
            operation="audio",
        )

        # If no callback URL, poll for result (synchronous wait)
        if not callback_url:
            logger.info("kie_ai_audio_polling_mode", task_id=task_id)
            return await self.wait_for_task(task_id)

        # With callback URL, return task info immediately (async mode)
        logger.info("kie_ai_audio_task_created_with_callback", task_id=task_id, callback_url=callback_url)
        return {
            "id": task_id,
            "status": "processing",
            "data": [],
            "created": int(time.time()),
            "message": "Audio task created. Result will be delivered via callback URL."
        }

    async def upload_reference_image(self, file_path: str) -> Dict:
        """Upload a reference image for image-to-image generation"""
        headers = {"Authorization": f"Bearer {self.api_key}"}
        url = f"{self.base_url}/files/upload"

        with open(file_path, "rb") as f:
            files = {"file": (os.path.basename(file_path), f, "image/jpeg")}
            response = await self.client.post(url, headers=headers, files=files)
            response.raise_for_status()
            return response.json()

# Example Usage (for testing purposes)
async def main():
    api_key = os.getenv("KIE_AI_API_KEY")
    if not api_key:
        print("KIE_AI_API_KEY environment variable not set.")
        return

    kie_ai = KieAIProvider(api_key)

    # Test Image Generation with Nano Banana Pro
    # Uses endpoint: POST https://api.kie.ai/api/v1/jobs/createTask
    try:
        print("Generating image with Nano Banana Pro...")
        image_result = await kie_ai.generate_image(
            "nano-banana-pro",  # Model name without "google-" prefix
            "A futuristic city at sunset, cyberpunk style",
            aspect_ratio="16:9",
            resolution="1K",
            output_format="png"
        )
        print("Image Generation Result:", image_result)
    except Exception as e:
        print(f"Image generation failed: {e}")

    # Test Video Generation with Veo 3.1
    try:
        print("Generating video with Veo 3.1...")
        video_result = await kie_ai.generate_video(
            "veo-3-1",
            "A drone shot flying over a serene forest with a river",
            duration=5,
            aspect_ratio="16:9"
        )
        print("Video Generation Result:", video_result)
    except Exception as e:
        print(f"Video generation failed: {e}")

    # Test Audio Generation with Elevenlabs TTS
    try:
        print("Generating audio with Elevenlabs Text to Speech...")
        audio_result = await kie_ai.generate_audio(
            "elevenlabs-tts",
            "Hello, this is a test audio from SmartSpecPro."
        )
        print("Audio Generation Result:", audio_result)
    except Exception as e:
        print(f"Audio generation failed: {e}")


if __name__ == "__main__":
    asyncio.run(main())
