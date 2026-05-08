"""Magnific media provider client.

This module owns Magnific-specific auth, endpoint lookup, payload cleanup,
status normalization, result extraction, and sanitized error classification.
Gateway/Celery integration is intentionally handled in later sections.
"""

from __future__ import annotations

from dataclasses import dataclass
import ipaddress
from typing import Any, Optional

import httpx

from app.core.media_job_validators import validate_provider_result_uri, validate_uri_strict


MAGNIFIC_PROVIDER = "magnific"
MAGNIFIC_DEFAULT_BASE_URL = "https://api.magnific.com"


class MagnificProviderError(RuntimeError):
    """Sanitized Magnific provider error."""

    def __init__(
        self,
        message: str,
        *,
        category: str = "provider_error",
        status_code: Optional[int] = None,
        provider_detail: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.category = category
        self.status_code = status_code
        self.provider_detail = provider_detail


@dataclass(frozen=True, slots=True)
class MagnificModelSpec:
    model_id: str
    endpoint: str
    media_type: str
    result_type: str
    dispatch_mode: str = "async-polling"
    output_extractors: tuple[str, ...] = (
        "data.generated[]",
        "data.image_url",
        "data.video_url",
        "data.output_url",
        "generated[]",
        "image_url",
        "video_url",
        "output_url",
        "url",
    )


def _spec(
    model_id: str,
    endpoint: str,
    media_type: str,
    result_type: str,
    *,
    dispatch_mode: str = "async-polling",
    output_extractors: Optional[tuple[str, ...]] = None,
) -> MagnificModelSpec:
    kwargs: dict[str, Any] = {}
    if output_extractors is not None:
        kwargs["output_extractors"] = output_extractors
    return MagnificModelSpec(
        model_id=model_id,
        endpoint=endpoint,
        media_type=media_type,
        result_type=result_type,
        dispatch_mode=dispatch_mode,
        **kwargs,
    )


MAGNIFIC_MODEL_SPECS: dict[str, MagnificModelSpec] = {
    "magnific/mystic": _spec("magnific/mystic", "/v1/ai/mystic", "image", "image"),
    "magnific/seedream-v5-lite": _spec("magnific/seedream-v5-lite", "/v1/ai/text-to-image/seedream-v5-lite", "image", "image"),
    "magnific/seedream-v5-lite-edit": _spec("magnific/seedream-v5-lite-edit", "/v1/ai/text-to-image/seedream-v5-lite-edit", "image", "image"),
    "magnific/nano-banana-pro": _spec("magnific/nano-banana-pro", "/v1/ai/text-to-image/nano-banana-pro", "image", "image"),
    "magnific/nano-banana-pro-flash": _spec("magnific/nano-banana-pro-flash", "/v1/ai/text-to-image/nano-banana-pro-flash", "image", "image"),
    "magnific/z-image-turbo": _spec("magnific/z-image-turbo", "/v1/ai/text-to-image/z-image", "image", "image"),
    "magnific/upscaler-creative": _spec("magnific/upscaler-creative", "/v1/ai/image-upscaler", "image", "image"),
    "magnific/relight": _spec("magnific/relight", "/v1/ai/image-relight", "image", "image"),
    "magnific/style-transfer": _spec("magnific/style-transfer", "/v1/ai/image-style-transfer", "image", "image"),
    "magnific/remove-background": _spec(
        "magnific/remove-background",
        "/v1/ai/beta/remove-background",
        "image",
        "image-set",
        dispatch_mode="sync",
        output_extractors=("data.url", "data.high_resolution", "data.preview", "url", "high_resolution", "preview"),
    ),
    "magnific/image-expand": _spec("magnific/image-expand", "/v1/ai/image-expand/seedream-v4-5", "image", "image"),
    "magnific/skin-enhancer-creative": _spec("magnific/skin-enhancer-creative", "/v1/ai/skin-enhancer/creative", "image", "image"),
    "magnific/skin-enhancer-faithful": _spec("magnific/skin-enhancer-faithful", "/v1/ai/skin-enhancer/faithful", "image", "image"),
    "magnific/skin-enhancer-flexible": _spec("magnific/skin-enhancer-flexible", "/v1/ai/skin-enhancer/flexible", "image", "image"),
    "magnific/change-camera": _spec("magnific/change-camera", "/v1/ai/image-change-camera", "image", "image"),
    "magnific/kling-v3-pro": _spec("magnific/kling-v3-pro", "/v1/ai/video/kling-v3-pro", "video", "video"),
    "magnific/kling-v3-standard": _spec("magnific/kling-v3-standard", "/v1/ai/video/kling-v3-std", "video", "video"),
    "magnific/kling-v3-omni-pro": _spec("magnific/kling-v3-omni-pro", "/v1/ai/video/kling-v3-omni-pro", "video", "video"),
    "magnific/kling-v3-omni-standard": _spec("magnific/kling-v3-omni-standard", "/v1/ai/video/kling-v3-omni-std", "video", "video"),
    "magnific/kling-v3-omni-reference-pro": _spec("magnific/kling-v3-omni-reference-pro", "/v1/ai/reference-to-video/kling-v3-omni-pro", "video", "video"),
    "magnific/kling-v3-omni-reference-standard": _spec("magnific/kling-v3-omni-reference-standard", "/v1/ai/reference-to-video/kling-v3-omni-std", "video", "video"),
    "magnific/kling-v3-motion-control-pro": _spec("magnific/kling-v3-motion-control-pro", "/v1/ai/video/kling-v3-motion-control-pro", "video", "video"),
    "magnific/kling-v3-motion-control-standard": _spec("magnific/kling-v3-motion-control-standard", "/v1/ai/video/kling-v3-motion-control-std", "video", "video"),
    "magnific/kling-v2-6-motion-control-pro": _spec("magnific/kling-v2-6-motion-control-pro", "/v1/ai/video/kling-v2-6-motion-control-pro", "video", "video"),
    "magnific/kling-v2-6-motion-control-standard": _spec("magnific/kling-v2-6-motion-control-standard", "/v1/ai/video/kling-v2-6-motion-control-std", "video", "video"),
    "magnific/wan-v2-7-text-to-video": _spec("magnific/wan-v2-7-text-to-video", "/v1/ai/text-to-video/wan-2-7", "video", "video"),
    "magnific/wan-v2-7-image-to-video": _spec("magnific/wan-v2-7-image-to-video", "/v1/ai/image-to-video/wan-2-7", "video", "video"),
    "magnific/wan-v2-7-reference-to-video": _spec("magnific/wan-v2-7-reference-to-video", "/v1/ai/reference-to-video/wan-2-7", "video", "video"),
    "magnific/veo-3-1-text-to-video": _spec("magnific/veo-3-1-text-to-video", "/v1/ai/text-to-video/veo-3-1", "video", "video"),
    "magnific/veo-3-1-text-to-video-fast": _spec("magnific/veo-3-1-text-to-video-fast", "/v1/ai/text-to-video/veo-3-1-fast", "video", "video"),
    "magnific/veo-3-1-image-to-video": _spec("magnific/veo-3-1-image-to-video", "/v1/ai/image-to-video/veo-3-1", "video", "video"),
    "magnific/veo-3-1-image-to-video-fast": _spec("magnific/veo-3-1-image-to-video-fast", "/v1/ai/image-to-video/veo-3-1-fast", "video", "video"),
    "magnific/veo-3-1-reference-to-video": _spec("magnific/veo-3-1-reference-to-video", "/v1/ai/reference-to-video/veo-3-1", "video", "video"),
    "magnific/video-upscaler-precision": _spec("magnific/video-upscaler-precision", "/v1/ai/video-upscaler-precision", "video", "video"),
}


def _assert_public_https_url(value: str, label: str) -> None:
    parsed = httpx.URL(value)
    if parsed.scheme != "https":
        raise MagnificProviderError(f"{label} must use https", category="validation_error")
    host = (parsed.host or "").strip().lower()
    if not host or host in {"localhost", "0.0.0.0", "host.docker.internal"} or host.endswith((".internal", ".local")):
        raise MagnificProviderError(f"{label} must point to a public host", category="validation_error")
    normalized_host = host[1:-1] if host.startswith("[") and host.endswith("]") else host
    try:
        ip_address = ipaddress.ip_address(normalized_host)
    except ValueError:
        return
    if ip_address.is_private or ip_address.is_loopback or ip_address.is_link_local or ip_address.is_reserved:
        raise MagnificProviderError(f"{label} must point to a public host", category="validation_error")


def normalize_magnific_base_url(base_url: Optional[str]) -> str:
    value = str(base_url or "").strip() or MAGNIFIC_DEFAULT_BASE_URL
    parsed = httpx.URL(value)
    if parsed.scheme not in {"http", "https"}:
        raise MagnificProviderError("Magnific base URL must use https", category="validation_error")
    normalized = str(parsed.copy_with(path=parsed.path.rstrip("/") or "")).rstrip("/")
    _assert_public_https_url(normalized, "Magnific base URL")
    return normalized


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, nested in value.items():
            normalized = str(key).lower()
            if any(token in normalized for token in ("key", "token", "authorization", "base64")):
                redacted[key] = "[redacted]"
            else:
                redacted[key] = _redact(nested)
        return redacted
    if isinstance(value, list):
        return [_redact(item) for item in value[:20]]
    if isinstance(value, str) and len(value) > 300:
        return f"{value[:300]}..."
    return value


def _extract_error_message(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        text = (response.text or "").strip()
        return text[:500]
    if not isinstance(data, dict):
        return str(_redact(data))[:500]
    for key in ("message", "error", "detail", "msg"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:500]
        if isinstance(value, dict):
            nested = value.get("message") or value.get("detail") or value.get("error")
            if isinstance(nested, str) and nested.strip():
                return nested.strip()[:500]
    return str(_redact(data))[:500]


def _extract_failure_message(payload: dict[str, Any]) -> Optional[str]:
    candidates: list[Any] = []
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    candidates.extend(
        [
            payload.get("message"),
            payload.get("error"),
            payload.get("detail"),
            payload.get("msg"),
            payload.get("fail_reason"),
            payload.get("failure_reason"),
            data.get("message"),
            data.get("error"),
            data.get("detail"),
            data.get("msg"),
            data.get("fail_reason"),
            data.get("failure_reason"),
        ]
    )
    for value in candidates:
        if isinstance(value, str) and value.strip():
            return value.strip()[:500]
        if isinstance(value, dict):
            nested = value.get("message") or value.get("detail") or value.get("error") or value.get("reason")
            if isinstance(nested, str) and nested.strip():
                return nested.strip()[:500]
    return None


def _failure_detail(payload: dict[str, Any], *, status: str) -> dict[str, Any]:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    detail: dict[str, Any] = {
        "provider": MAGNIFIC_PROVIDER,
        "status": status,
        "raw_status": data.get("status") or payload.get("status"),
        "response": _redact(payload),
    }
    message = _extract_failure_message(payload)
    if message:
        detail["message"] = message
    return detail


def _extract_path_value(payload: dict[str, Any], path: str) -> list[Any]:
    current: Any = payload
    values: list[Any] = []
    for part in path.split("."):
        if part.endswith("[]"):
            key = part[:-2]
            current = current.get(key) if isinstance(current, dict) else None
            if isinstance(current, list):
                values.extend(current)
            return values
        current = current.get(part) if isinstance(current, dict) else None
    if current is not None:
        values.append(current)
    return values


def _validate_output_urls(urls: list[str]) -> list[str]:
    safe_urls: list[str] = []
    for url in urls:
        try:
            validate_provider_result_uri(url)
        except Exception as exc:
            raise MagnificProviderError("Magnific returned an unsafe final media URL", category="result_extraction_failure") from exc
        safe_urls.append(url)
    return safe_urls


def _extract_urls(payload: dict[str, Any], spec: MagnificModelSpec) -> list[str]:
    urls: list[str] = []
    for path in spec.output_extractors:
        for value in _extract_path_value(payload, path):
            if isinstance(value, str) and value.strip():
                urls.append(value.strip())
    return _validate_output_urls(list(dict.fromkeys(urls)))


def _normalize_status(value: Any) -> str:
    status = str(value or "").strip().lower()
    if status in {"created", "queued", "pending"}:
        return "queued"
    if status in {"done", "success", "succeeded", "complete", "completed"}:
        return "completed"
    if status in {"failed", "failure", "error", "cancelled", "canceled"}:
        return "failed"
    return "processing"


class MagnificProvider:
    PROVIDER_NAME = MAGNIFIC_PROVIDER
    DEFAULT_BASE_URL = MAGNIFIC_DEFAULT_BASE_URL
    MODEL_SPECS = MAGNIFIC_MODEL_SPECS

    def __init__(
        self,
        *,
        api_key: str,
        base_url: Optional[str] = None,
        endpoint_registry: Optional[dict[str, MagnificModelSpec]] = None,
        timeout: Optional[httpx.Timeout] = None,
        client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        if not str(api_key or "").strip():
            raise MagnificProviderError("Magnific API key is required", category="invalid_auth")
        self.base_url = normalize_magnific_base_url(base_url)
        self.endpoint_registry = endpoint_registry or self.MODEL_SPECS
        self._headers = {
            "x-magnific-api-key": api_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        self.client = client or httpx.AsyncClient(
            timeout=timeout or httpx.Timeout(connect=10.0, read=300.0, write=60.0, pool=5.0)
        )

    def get_model_spec(self, model_id: str) -> MagnificModelSpec:
        spec = self.endpoint_registry.get(str(model_id or "").strip())
        if spec is None:
            raise MagnificProviderError("Unknown Magnific model id", category="validation_error")
        return spec

    def _url_for(self, spec: MagnificModelSpec, task_id: Optional[str] = None) -> str:
        endpoint = spec.endpoint.rstrip("/")
        if task_id:
            endpoint = f"{endpoint}/{task_id}"
        return f"{self.base_url}{endpoint}"

    async def _request(self, method: str, url: str, *, payload: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        try:
            response = await self.client.request(method, url, headers=self._headers, json=payload)
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            category = "provider_error"
            if status_code in {401, 403}:
                category = "invalid_auth"
            elif status_code == 429:
                category = "rate_limit"
            elif status_code in {400, 422}:
                category = "validation_error"
            elif status_code in {500, 502, 503, 504}:
                category = "provider_unavailable"
            provider_message = _extract_error_message(exc.response)
            detail = f": {provider_message}" if provider_message else ""
            raise MagnificProviderError(f"Magnific request failed with HTTP {status_code}{detail}", category=category, status_code=status_code) from exc
        except httpx.TimeoutException as exc:
            raise MagnificProviderError("Magnific request timed out", category="timeout") from exc
        except httpx.RequestError as exc:
            raise MagnificProviderError("Magnific request failed", category="provider_unavailable") from exc
        except ValueError as exc:
            raise MagnificProviderError("Magnific returned malformed JSON", category="provider_error") from exc

        if not isinstance(data, dict):
            raise MagnificProviderError("Magnific returned malformed JSON", category="provider_error")
        return data

    def _clean_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        cleaned: dict[str, Any] = {}
        for key, value in payload.items():
            normalized = str(key).replace("_", "").replace("-", "").lower()
            if normalized in {"webhookurl", "callbackurl"}:
                continue
            if value is None or value == "" or value == []:
                continue
            if isinstance(value, str) and (normalized.endswith("url") or normalized.endswith("urls")):
                _assert_public_https_url(value, str(key))
            if isinstance(value, list) and (normalized.endswith("urls") or normalized in {"imageurls", "videourls"}):
                for item in value:
                    if isinstance(item, str):
                        _assert_public_https_url(item, str(key))
            cleaned[key] = value
        return cleaned

    async def _submit_async(self, model_id: str, payload: dict[str, Any], *, expected_media_type: str) -> dict[str, Any]:
        spec = self.get_model_spec(model_id)
        if spec.dispatch_mode == "sync" or spec.media_type != expected_media_type:
            raise MagnificProviderError("Magnific model does not support this submit method", category="validation_error")
        raw_response = await self._request("POST", self._url_for(spec), payload=self._clean_payload(payload))
        data = raw_response.get("data") if isinstance(raw_response.get("data"), dict) else {}
        provider_task_id = str(data.get("task_id") or data.get("taskId") or raw_response.get("task_id") or "").strip()
        if not provider_task_id:
            raise MagnificProviderError("Magnific submit response did not include a task id", category="result_extraction_failure")
        return {
            "provider": self.PROVIDER_NAME,
            "model_id": model_id,
            "provider_task_id": provider_task_id,
            "status": _normalize_status(data.get("status") or raw_response.get("status")),
            "raw_response": _redact(raw_response),
        }

    async def generate_image(self, model_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._submit_async(model_id, payload, expected_media_type="image")

    async def edit_image(self, model_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._submit_async(model_id, payload, expected_media_type="image")

    async def generate_video(self, model_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._submit_async(model_id, payload, expected_media_type="video")

    async def upscale_video(self, model_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        if model_id != "magnific/video-upscaler-precision":
            raise MagnificProviderError("Magnific video upscaler requires the video-upscaler model", category="validation_error")
        return await self._submit_async(model_id, payload, expected_media_type="video")

    async def remove_background(self, payload: dict[str, Any]) -> dict[str, Any]:
        spec = self.get_model_spec("magnific/remove-background")
        raw_response = await self._request("POST", self._url_for(spec), payload=self._clean_payload(payload))
        urls = _extract_urls(raw_response, spec)
        if not urls:
            raise MagnificProviderError("Magnific remove-background response did not include media URLs", category="result_extraction_failure")
        return {
            "provider": self.PROVIDER_NAME,
            "model_id": spec.model_id,
            "provider_task_id": None,
            "status": "completed",
            "result_type": spec.result_type,
            "data": [{"url": url} for url in urls],
            "requires_rehost": True,
            "raw_response": _redact(raw_response),
        }

    async def get_task_status(self, model_id: str, task_id: str, media_type: str) -> dict[str, Any]:
        spec = self.get_model_spec(model_id)
        if spec.media_type != media_type:
            raise MagnificProviderError("Magnific task media type mismatch", category="validation_error")
        provider_task_id = str(task_id or "").strip()
        if not provider_task_id:
            raise MagnificProviderError("Magnific task id is required", category="validation_error")
        raw_response = await self._request("GET", self._url_for(spec, provider_task_id))
        data = raw_response.get("data") if isinstance(raw_response.get("data"), dict) else {}
        status = _normalize_status(data.get("status") or raw_response.get("status"))
        result: dict[str, Any] = {
            "provider": self.PROVIDER_NAME,
            "model_id": model_id,
            "provider_task_id": provider_task_id,
            "status": status,
            "raw_response": _redact(raw_response),
        }
        if status == "failed":
            provider_detail = _failure_detail(raw_response, status=status)
            provider_message = provider_detail.get("message")
            message = f"Magnific task failed: {provider_message}" if provider_message else "Magnific task failed"
            raise MagnificProviderError(
                message,
                category="terminal_task_failure",
                provider_detail=provider_detail,
            )
        if status == "completed":
            urls = _extract_urls(raw_response, spec)
            if not urls:
                raise MagnificProviderError("Magnific completed response did not include media URLs", category="result_extraction_failure")
            result["data"] = [{"url": url} for url in urls]
            result["result_type"] = spec.result_type
        return result

    async def aclose(self) -> None:
        await self.client.aclose()
