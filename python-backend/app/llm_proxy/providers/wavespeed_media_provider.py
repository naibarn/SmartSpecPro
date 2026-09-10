"""
WaveSpeed media provider.

Implements the WaveSpeed launch-model submit/poll flow for async video generation.
The provider keeps endpoint handling relative-only at configuration time, while
recovery payloads persist the normalized base URL plus sanitized relative paths.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
import ipaddress
import time
from typing import Any, Optional
from urllib.parse import unquote

import httpx
import structlog

from app.core.media_job_validators import validate_uri_strict

logger = structlog.get_logger()


WAVESPEED_PROVIDER = "wavespeed_ai"
WAVESPEED_DEFAULT_BASE_URL = "https://api.wavespeed.ai/api/v3"
WAVESPEED_DEFAULT_SUBMIT_ENDPOINT = "/wavespeed-ai/cinematic-video-generator"
WAVESPEED_DEFAULT_RESULT_ENDPOINT_TEMPLATE = "/predictions/{requestId}/result"
WAVESPEED_LAUNCH_MODEL_ID = "wavespeed-ai/cinematic-video-generator"
WAVESPEED_ALLOWED_ASPECT_RATIOS = frozenset({"16:9", "9:16", "4:3", "3:4"})
WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS = frozenset({"16:9", "9:16", "4:3", "3:4", "1:1", "21:9"})
WAVESPEED_ALLOWED_DURATIONS = frozenset({5, 10, 15})
WAVESPEED_MAX_REFERENCE_IMAGES = 4
WAVESPEED_POLL_INITIAL_SECONDS = 3
WAVESPEED_POLL_MAX_SECONDS = 15
WAVESPEED_POLL_TIMEOUT_SECONDS = 30 * 60
WAVESPEED_RETRYABLE_POLL_STATUS_CODES = frozenset({429, 500, 502, 503, 504})
WAVESPEED_PRICING_TIERS = {
    "5s": 800,
    "10s": 1600,
    "15s": 2400,
}
WAVESPEED_SEEDANCE_STANDARD_PRICING_TIERS = {
    "5s": 900,
    "10s": 1800,
    "15s": 2700,
}
WAVESPEED_SEEDANCE_FAST_PRICING_TIERS = {
    "5s": 600,
    "10s": 1200,
    "15s": 1800,
}
WAVESPEED_SEEDANCE_2_FAST_TEXT_TO_VIDEO_MODEL_ID = "bytedance/seedance-2.0-fast/text-to-video"
WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID = "bytedance/seedance-2.0-fast/image-to-video"
WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID = "bytedance/seedance-2.0/text-to-video"
WAVESPEED_SEEDANCE_2_IMAGE_TO_VIDEO_MODEL_ID = "bytedance/seedance-2.0/image-to-video"
WAVESPEED_GPT_IMAGE_25_FLARE_MODEL_ID = "openai/gpt-image-2.5-flare/text-to-image"
WAVESPEED_GPT_IMAGE_25_SUNBURST_MODEL_ID = "openai/gpt-image-2.5-sunburst/text-to-image"
WAVESPEED_GPT_IMAGE_25_FLARE_EDIT_MODEL_ID = "openai/gpt-image-2.5-flare/edit"
WAVESPEED_GPT_IMAGE_25_SUNBURST_EDIT_MODEL_ID = "openai/gpt-image-2.5-sunburst/edit"
WAVESPEED_GPT_IMAGE_25_ALLOWED_ASPECT_RATIOS = frozenset({
    "1:1", "1:2", "2:1", "1:3", "3:1", "2:3", "3:2", "3:4",
    "4:3", "4:5", "5:4", "9:16", "16:9", "9:21", "21:9",
})
WAVESPEED_GPT_IMAGE_25_ALLOWED_RESOLUTIONS = frozenset({"1k", "2k", "4k"})
WAVESPEED_GPT_IMAGE_25_ALLOWED_QUALITIES = frozenset({"low", "medium", "high", "xhigh", "max"})
WAVESPEED_GPT_IMAGE_25_ALLOWED_OUTPUT_FORMATS = frozenset({"png", "jpeg", "webp"})
WAVESPEED_GPT_IMAGE_25_MAX_REFERENCE_IMAGES = 16
WAVESPEED_MINIMAX_H3_MODEL_PREFIX = "wavespeed-ai/minimax-h3/"
WAVESPEED_MINIMAX_H3_MODEL_IDS = {
    "image_to_video_spicy": f"{WAVESPEED_MINIMAX_H3_MODEL_PREFIX}image-to-video-spicy",
    "image_to_video": f"{WAVESPEED_MINIMAX_H3_MODEL_PREFIX}image-to-video",
    "reference_to_video": f"{WAVESPEED_MINIMAX_H3_MODEL_PREFIX}reference-to-video",
    "text_to_video": f"{WAVESPEED_MINIMAX_H3_MODEL_PREFIX}text-to-video",
    "image_to_video_lora": f"{WAVESPEED_MINIMAX_H3_MODEL_PREFIX}image-to-video-lora",
    "reference_to_video_lora": f"{WAVESPEED_MINIMAX_H3_MODEL_PREFIX}reference-to-video-lora",
    "text_to_video_lora": f"{WAVESPEED_MINIMAX_H3_MODEL_PREFIX}text-to-video-lora",
    "video_edit": f"{WAVESPEED_MINIMAX_H3_MODEL_PREFIX}video-edit",
    "video_extend": f"{WAVESPEED_MINIMAX_H3_MODEL_PREFIX}video-extend",
    "image_edit_lora": f"{WAVESPEED_MINIMAX_H3_MODEL_PREFIX}image-edit-lora",
    "text_to_image_lora": f"{WAVESPEED_MINIMAX_H3_MODEL_PREFIX}text-to-image-lora",
    "image_edit": f"{WAVESPEED_MINIMAX_H3_MODEL_PREFIX}image-edit",
    "text_to_image": f"{WAVESPEED_MINIMAX_H3_MODEL_PREFIX}text-to-image",
}
WAVESPEED_MINIMAX_H3_VIDEO_ASPECT_RATIOS = frozenset({"16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21"})
WAVESPEED_MINIMAX_H3_IMAGE_ASPECT_RATIOS = frozenset({
    "1:1", "1:2", "2:1", "1:3", "3:1", "2:3", "3:2", "3:4",
    "4:3", "4:5", "5:4", "9:16", "16:9", "9:21", "21:9",
})
WAVESPEED_MINIMAX_H3_VIDEO_RESOLUTIONS = frozenset({"480p", "540p", "768p", "1080p"})
WAVESPEED_MINIMAX_H3_IMAGE_RESOLUTIONS = frozenset({"1k", "2k"})
WAVESPEED_MINIMAX_H3_DURATIONS = frozenset(range(3, 16))
WAVESPEED_MINIMAX_H3_IMAGE_PRICING_TIERS = {"1k": 20, "2k": 60}
WAVESPEED_MINIMAX_H3_VIDEO_PRICING_TIERS = {
    "480p-3s": 60, "480p-5s": 100, "480p-10s": 200, "480p-15s": 300,
    "540p-3s": 90, "540p-5s": 150, "540p-10s": 300, "540p-15s": 450,
    "768p-3s": 120, "768p-5s": 200, "768p-10s": 400, "768p-15s": 600,
    "1080p-3s": 240, "1080p-5s": 400, "1080p-10s": 800, "1080p-15s": 1200,
}


class WaveSpeedError(ValueError):
    """Base class for WaveSpeed validation/runtime errors."""


class WaveSpeedTerminalError(RuntimeError):
    """Raised when WaveSpeed returns a terminal failure."""


class WaveSpeedPollingTimeoutError(TimeoutError):
    """Raised when polling exceeds the 30 minute lifetime cap."""


class WaveSpeedRetryablePollingError(RuntimeError):
    """Raised when a transient polling failure should be retried."""

    def __init__(self, message: str, retry_after_seconds: Optional[int] = None) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


@dataclass(frozen=True, slots=True)
class WaveSpeedModelSpec:
    model_id: str
    submit_endpoint: str
    generate_type: str
    allowed_aspect_ratios: frozenset[str]
    allowed_durations: frozenset[int]
    max_reference_images: int
    reference_images_required: bool
    pricing_tiers: dict[str, int]
    route_family: Optional[str] = None
    allowed_resolutions: frozenset[str] = frozenset()
    max_reference_videos: int = 0
    max_reference_audios: int = 0
    max_loras: int = 0
    supports_last_image: bool = False
    supports_aspect_ratio: bool = True
    image_model: bool = False


WAVESPEED_MODEL_SPECS: dict[str, WaveSpeedModelSpec] = {
    WAVESPEED_LAUNCH_MODEL_ID: WaveSpeedModelSpec(
        model_id=WAVESPEED_LAUNCH_MODEL_ID,
        submit_endpoint=WAVESPEED_DEFAULT_SUBMIT_ENDPOINT,
        generate_type="text-to-video",
        allowed_aspect_ratios=WAVESPEED_ALLOWED_ASPECT_RATIOS,
        allowed_durations=WAVESPEED_ALLOWED_DURATIONS,
        max_reference_images=WAVESPEED_MAX_REFERENCE_IMAGES,
        reference_images_required=False,
        pricing_tiers=dict(WAVESPEED_PRICING_TIERS),
    ),
    WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID: WaveSpeedModelSpec(
        model_id=WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID,
        submit_endpoint="/bytedance/seedance-2.0/text-to-video",
        generate_type="text-to-video",
        allowed_aspect_ratios=WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS,
        allowed_durations=WAVESPEED_ALLOWED_DURATIONS,
        max_reference_images=WAVESPEED_MAX_REFERENCE_IMAGES,
        reference_images_required=False,
        pricing_tiers=dict(WAVESPEED_SEEDANCE_STANDARD_PRICING_TIERS),
    ),
    WAVESPEED_SEEDANCE_2_IMAGE_TO_VIDEO_MODEL_ID: WaveSpeedModelSpec(
        model_id=WAVESPEED_SEEDANCE_2_IMAGE_TO_VIDEO_MODEL_ID,
        submit_endpoint="/bytedance/seedance-2.0/image-to-video",
        generate_type="image-to-video",
        allowed_aspect_ratios=WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS,
        allowed_durations=WAVESPEED_ALLOWED_DURATIONS,
        max_reference_images=WAVESPEED_MAX_REFERENCE_IMAGES,
        reference_images_required=True,
        pricing_tiers=dict(WAVESPEED_SEEDANCE_STANDARD_PRICING_TIERS),
    ),
    WAVESPEED_SEEDANCE_2_FAST_TEXT_TO_VIDEO_MODEL_ID: WaveSpeedModelSpec(
        model_id=WAVESPEED_SEEDANCE_2_FAST_TEXT_TO_VIDEO_MODEL_ID,
        submit_endpoint="/bytedance/seedance-2.0-fast/text-to-video",
        generate_type="text-to-video",
        allowed_aspect_ratios=WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS,
        allowed_durations=WAVESPEED_ALLOWED_DURATIONS,
        max_reference_images=WAVESPEED_MAX_REFERENCE_IMAGES,
        reference_images_required=False,
        pricing_tiers=dict(WAVESPEED_SEEDANCE_FAST_PRICING_TIERS),
    ),
    WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID: WaveSpeedModelSpec(
        model_id=WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID,
        submit_endpoint="/bytedance/seedance-2.0-fast/image-to-video",
        generate_type="image-to-video",
        allowed_aspect_ratios=WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS,
        allowed_durations=WAVESPEED_ALLOWED_DURATIONS,
        max_reference_images=WAVESPEED_MAX_REFERENCE_IMAGES,
        reference_images_required=True,
        pricing_tiers=dict(WAVESPEED_SEEDANCE_FAST_PRICING_TIERS),
    ),
    WAVESPEED_GPT_IMAGE_25_FLARE_MODEL_ID: WaveSpeedModelSpec(
        model_id=WAVESPEED_GPT_IMAGE_25_FLARE_MODEL_ID,
        submit_endpoint="/openai/gpt-image-2.5-flare/text-to-image",
        generate_type="text-to-image",
        allowed_aspect_ratios=WAVESPEED_GPT_IMAGE_25_ALLOWED_ASPECT_RATIOS,
        allowed_durations=frozenset(),
        max_reference_images=WAVESPEED_GPT_IMAGE_25_MAX_REFERENCE_IMAGES,
        reference_images_required=False,
        pricing_tiers={},
    ),
    WAVESPEED_GPT_IMAGE_25_SUNBURST_MODEL_ID: WaveSpeedModelSpec(
        model_id=WAVESPEED_GPT_IMAGE_25_SUNBURST_MODEL_ID,
        submit_endpoint="/openai/gpt-image-2.5-sunburst/text-to-image",
        generate_type="text-to-image",
        allowed_aspect_ratios=WAVESPEED_GPT_IMAGE_25_ALLOWED_ASPECT_RATIOS,
        allowed_durations=frozenset(),
        max_reference_images=WAVESPEED_GPT_IMAGE_25_MAX_REFERENCE_IMAGES,
        reference_images_required=False,
        pricing_tiers={},
    ),
}
WAVESPEED_ENDPOINT_MODEL_SPECS = {
    spec.submit_endpoint: spec for spec in WAVESPEED_MODEL_SPECS.values()
}


def _build_minimax_h3_spec(
    model_id: str,
    route_family: str,
    *,
    reference_images_required: bool = False,
    max_reference_images: int = 0,
    max_reference_videos: int = 0,
    max_reference_audios: int = 0,
    max_loras: int = 0,
    supports_last_image: bool = False,
    supports_aspect_ratio: bool = True,
    image_model: bool = False,
) -> WaveSpeedModelSpec:
    return WaveSpeedModelSpec(
        model_id=model_id,
        submit_endpoint=f"/{model_id}",
        generate_type=route_family,
        allowed_aspect_ratios=(
            WAVESPEED_MINIMAX_H3_IMAGE_ASPECT_RATIOS
            if image_model
            else frozenset()
            if not supports_aspect_ratio
            else WAVESPEED_MINIMAX_H3_VIDEO_ASPECT_RATIOS
        ),
        allowed_durations=frozenset() if image_model else WAVESPEED_MINIMAX_H3_DURATIONS,
        max_reference_images=max_reference_images,
        reference_images_required=reference_images_required,
        pricing_tiers=dict(
            WAVESPEED_MINIMAX_H3_IMAGE_PRICING_TIERS
            if image_model
            else WAVESPEED_MINIMAX_H3_VIDEO_PRICING_TIERS
        ),
        route_family=route_family,
        allowed_resolutions=(
            WAVESPEED_MINIMAX_H3_IMAGE_RESOLUTIONS
            if image_model
            else WAVESPEED_MINIMAX_H3_VIDEO_RESOLUTIONS
        ),
        max_reference_videos=max_reference_videos,
        max_reference_audios=max_reference_audios,
        max_loras=max_loras,
        supports_last_image=supports_last_image,
        supports_aspect_ratio=supports_aspect_ratio,
        image_model=image_model,
    )


WAVESPEED_MODEL_SPECS.update({
    WAVESPEED_MINIMAX_H3_MODEL_IDS["image_to_video_spicy"]: _build_minimax_h3_spec(
        WAVESPEED_MINIMAX_H3_MODEL_IDS["image_to_video_spicy"], "image-to-video",
        reference_images_required=True, max_reference_images=1,
        supports_last_image=True, supports_aspect_ratio=False,
    ),
    WAVESPEED_MINIMAX_H3_MODEL_IDS["image_to_video"]: _build_minimax_h3_spec(
        WAVESPEED_MINIMAX_H3_MODEL_IDS["image_to_video"], "image-to-video",
        reference_images_required=True, max_reference_images=1,
        supports_last_image=True, supports_aspect_ratio=False,
    ),
    WAVESPEED_MINIMAX_H3_MODEL_IDS["reference_to_video"]: _build_minimax_h3_spec(
        WAVESPEED_MINIMAX_H3_MODEL_IDS["reference_to_video"], "reference-to-video",
        max_reference_images=9, max_reference_videos=3, max_reference_audios=3,
    ),
    WAVESPEED_MINIMAX_H3_MODEL_IDS["text_to_video"]: _build_minimax_h3_spec(
        WAVESPEED_MINIMAX_H3_MODEL_IDS["text_to_video"], "text-to-video",
    ),
    WAVESPEED_MINIMAX_H3_MODEL_IDS["image_to_video_lora"]: _build_minimax_h3_spec(
        WAVESPEED_MINIMAX_H3_MODEL_IDS["image_to_video_lora"], "image-to-video",
        reference_images_required=True, max_reference_images=1, max_loras=3,
        supports_last_image=True, supports_aspect_ratio=False,
    ),
    WAVESPEED_MINIMAX_H3_MODEL_IDS["reference_to_video_lora"]: _build_minimax_h3_spec(
        WAVESPEED_MINIMAX_H3_MODEL_IDS["reference_to_video_lora"], "reference-to-video",
        max_reference_images=9, max_reference_videos=3, max_reference_audios=3, max_loras=3,
    ),
    WAVESPEED_MINIMAX_H3_MODEL_IDS["text_to_video_lora"]: _build_minimax_h3_spec(
        WAVESPEED_MINIMAX_H3_MODEL_IDS["text_to_video_lora"], "text-to-video", max_loras=3,
    ),
    WAVESPEED_MINIMAX_H3_MODEL_IDS["video_edit"]: _build_minimax_h3_spec(
        WAVESPEED_MINIMAX_H3_MODEL_IDS["video_edit"], "video-edit",
        max_reference_images=9, max_reference_videos=1, max_reference_audios=3,
    ),
    WAVESPEED_MINIMAX_H3_MODEL_IDS["video_extend"]: _build_minimax_h3_spec(
        WAVESPEED_MINIMAX_H3_MODEL_IDS["video_extend"], "video-extend",
        max_reference_videos=1, supports_last_image=True, supports_aspect_ratio=False,
    ),
    WAVESPEED_MINIMAX_H3_MODEL_IDS["image_edit_lora"]: _build_minimax_h3_spec(
        WAVESPEED_MINIMAX_H3_MODEL_IDS["image_edit_lora"], "image-edit",
        reference_images_required=True, max_reference_images=9, max_loras=3, image_model=True,
    ),
    WAVESPEED_MINIMAX_H3_MODEL_IDS["text_to_image_lora"]: _build_minimax_h3_spec(
        WAVESPEED_MINIMAX_H3_MODEL_IDS["text_to_image_lora"], "text-to-image",
        max_loras=3, image_model=True,
    ),
    WAVESPEED_MINIMAX_H3_MODEL_IDS["image_edit"]: _build_minimax_h3_spec(
        WAVESPEED_MINIMAX_H3_MODEL_IDS["image_edit"], "image-edit",
        reference_images_required=True, max_reference_images=9, image_model=True,
    ),
    WAVESPEED_MINIMAX_H3_MODEL_IDS["text_to_image"]: _build_minimax_h3_spec(
        WAVESPEED_MINIMAX_H3_MODEL_IDS["text_to_image"], "text-to-image", image_model=True,
    ),
})
WAVESPEED_ENDPOINT_MODEL_SPECS = {
    spec.submit_endpoint: spec for spec in WAVESPEED_MODEL_SPECS.values()
}


@dataclass(slots=True)
class WaveSpeedPollResult:
    state: str
    raw_status: str
    provider_task_id: Optional[str]
    result_url: Optional[str]
    error_message: Optional[str]
    raw_response: dict[str, Any]
    poll_url_hint: Optional[str] = None


def _decode_path_for_validation(value: str, label: str) -> str:
    decoded = value
    for _ in range(2):
        try:
            next_value = unquote(decoded)
        except Exception as exc:  # pragma: no cover - unquote is very forgiving
            raise WaveSpeedError(f"{label} contains invalid percent-encoding") from exc
        if next_value == decoded:
            break
        decoded = next_value
    return decoded


def _normalize_model_lookup_key(value: Optional[str]) -> str:
    return str(value or "").strip().lower()


def _get_wavespeed_model_spec(
    provider_model_id: Optional[str],
    submit_endpoint: Optional[str],
) -> WaveSpeedModelSpec:
    normalized_model_id = _normalize_model_lookup_key(provider_model_id)
    if normalized_model_id and normalized_model_id in WAVESPEED_MODEL_SPECS:
        return WAVESPEED_MODEL_SPECS[normalized_model_id]

    normalized_endpoint = str(submit_endpoint or "").strip()
    if normalized_endpoint:
        normalized_endpoint = normalize_relative_media_endpoint_path(normalized_endpoint)
        matched = WAVESPEED_ENDPOINT_MODEL_SPECS.get(normalized_endpoint)
        if matched is not None:
            return matched

    inferred = f"{normalized_model_id} {normalized_endpoint}".lower()
    if "seedance-2.0-fast" in inferred and "image-to-video" in inferred:
        return WAVESPEED_MODEL_SPECS[WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID]
    if "seedance-2.0-fast" in inferred and "text-to-video" in inferred:
        return WAVESPEED_MODEL_SPECS[WAVESPEED_SEEDANCE_2_FAST_TEXT_TO_VIDEO_MODEL_ID]
    if "seedance-2.0" in inferred and "image-to-video" in inferred:
        return WAVESPEED_MODEL_SPECS[WAVESPEED_SEEDANCE_2_IMAGE_TO_VIDEO_MODEL_ID]
    if "seedance-2.0" in inferred and "text-to-video" in inferred:
        return WAVESPEED_MODEL_SPECS[WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID]
    if "gpt-image-2.5-flare" in inferred:
        return WAVESPEED_MODEL_SPECS[WAVESPEED_GPT_IMAGE_25_FLARE_MODEL_ID]
    if "gpt-image-2.5-sunburst" in inferred:
        return WAVESPEED_MODEL_SPECS[WAVESPEED_GPT_IMAGE_25_SUNBURST_MODEL_ID]
    return WAVESPEED_MODEL_SPECS[WAVESPEED_LAUNCH_MODEL_ID]


def _assert_public_https_url(value: str, label: str) -> None:
    parsed = httpx.URL(value)
    if parsed.scheme != "https":
        raise WaveSpeedError(f"{label} must use https")

    hostname = (parsed.host or "").strip().lower()
    if not hostname:
        raise WaveSpeedError(f"{label} must point to a public host")
    if hostname in {"localhost", "0.0.0.0", "host.docker.internal"}:
        raise WaveSpeedError(f"{label} must point to a public host")
    if hostname.endswith(".internal") or hostname.endswith(".local"):
        raise WaveSpeedError(f"{label} must point to a public host")

    normalized_host = hostname[1:-1] if hostname.startswith("[") and hostname.endswith("]") else hostname
    try:
        ip_address = ipaddress.ip_address(normalized_host)
    except ValueError:
        return

    if (
        ip_address.is_private
        or ip_address.is_loopback
        or ip_address.is_link_local
        or ip_address.is_reserved
    ):
        raise WaveSpeedError(f"{label} must point to a public host")


def normalize_wavespeed_base_url(base_url: Optional[str]) -> str:
    raw_value = str(base_url or "").strip() or WAVESPEED_DEFAULT_BASE_URL
    parsed = httpx.URL(raw_value)

    if parsed.scheme not in {"http", "https"}:
        raise WaveSpeedError("WaveSpeed base URL must use http or https")

    path = parsed.path.rstrip("/")
    if not path:
        path = "/api/v3"
    elif not path.endswith("/api/v3"):
        path = f"{path}/api/v3"

    normalized = parsed.copy_with(path=path)
    normalized_str = str(normalized).rstrip("/")
    _assert_public_https_url(normalized_str, "WaveSpeed base URL")
    return normalized_str


def normalize_relative_media_endpoint_path(
    value: Optional[str],
    *,
    allow_request_id_placeholder: bool = False,
) -> str:
    trimmed = str(value or "").strip()
    if not trimmed:
        raise WaveSpeedError("Endpoint path is required")
    decoded = _decode_path_for_validation(trimmed, "Endpoint path")
    if decoded.startswith("http://") or decoded.startswith("https://") or decoded.startswith("//"):
        raise WaveSpeedError("Endpoint paths must be relative URLs")
    if ".." in decoded:
        raise WaveSpeedError("Endpoint paths may not contain '..'")

    normalized = trimmed if trimmed.startswith("/") else f"/{trimmed}"
    normalized_decoded = decoded if decoded.startswith("/") else f"/{decoded}"
    placeholders = [segment.strip() for segment in _extract_placeholders(normalized_decoded)]
    allowed = {"requestId"} if allow_request_id_placeholder else set()
    for placeholder in placeholders:
        if placeholder not in allowed:
            raise WaveSpeedError(f"Unsupported endpoint placeholder {{{placeholder}}}")
    return normalized


def _extract_placeholders(value: str) -> list[str]:
    placeholders: list[str] = []
    start = 0
    while True:
        open_idx = value.find("{", start)
        if open_idx == -1:
            return placeholders
        close_idx = value.find("}", open_idx + 1)
        if close_idx == -1:
            return placeholders
        placeholders.append(value[open_idx + 1:close_idx])
        start = close_idx + 1


def _extract_retry_after_seconds(headers: httpx.Headers) -> Optional[int]:
    raw_value = headers.get("Retry-After")
    if not raw_value:
        return None

    try:
        parsed_int = int(raw_value.strip())
        return parsed_int if parsed_int > 0 else None
    except (TypeError, ValueError):
        pass

    try:
        parsed_dt = parsedate_to_datetime(raw_value)
    except (TypeError, ValueError, IndexError):
        return None

    delta = parsed_dt.timestamp() - time.time()
    retry_after = int(delta)
    return retry_after if retry_after > 0 else None


def _compute_next_poll_delay(
    previous_delay_seconds: int,
    retry_after_seconds: Optional[int] = None,
) -> int:
    next_delay = min(max(previous_delay_seconds * 2, WAVESPEED_POLL_INITIAL_SECONDS), WAVESPEED_POLL_MAX_SECONDS)
    if retry_after_seconds and retry_after_seconds > next_delay:
        return retry_after_seconds
    return next_delay


def _extract_output_url(outputs: Any) -> Optional[str]:
    if not isinstance(outputs, list) or not outputs:
        return None

    first = outputs[0]
    if isinstance(first, str) and first.startswith("http"):
        return first
    if isinstance(first, dict):
        for key in ("url", "video_url", "image_url"):
            value = first.get(key)
            if isinstance(value, str) and value.startswith("http"):
                return value
    return None


def _extract_error_message(payload: Any) -> Optional[str]:
    if isinstance(payload, str):
        text = payload.strip()
        return text or None
    if isinstance(payload, dict):
        for key in ("message", "detail", "error", "reason"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return str(payload) if payload else None
    if payload is None:
        return None
    return str(payload)


def normalize_wavespeed_poll_response(payload: dict[str, Any]) -> WaveSpeedPollResult:
    data = payload.get("data")
    if not isinstance(data, dict):
        data = {}

    raw_status = str(data.get("status") or payload.get("status") or "").strip().lower()
    provider_task_id = str(data.get("id") or payload.get("id") or "").strip() or None
    poll_url_hint = None
    urls = data.get("urls")
    if isinstance(urls, dict):
        poll_url_hint = urls.get("get") if isinstance(urls.get("get"), str) else None

    if raw_status in {"created", "processing"}:
        return WaveSpeedPollResult(
            state="processing",
            raw_status=raw_status,
            provider_task_id=provider_task_id,
            result_url=None,
            error_message=None,
            raw_response=payload,
            poll_url_hint=poll_url_hint,
        )

    terminal_error = _extract_error_message(data.get("error") or payload.get("error"))
    if raw_status == "completed":
        result_url = _extract_output_url(data.get("outputs"))
        if not result_url:
            return WaveSpeedPollResult(
                state="failure",
                raw_status=raw_status,
                provider_task_id=provider_task_id,
                result_url=None,
                error_message=terminal_error or "WaveSpeed completed without data.outputs[0] media URL",
                raw_response=payload,
                poll_url_hint=poll_url_hint,
            )
        try:
            validate_uri_strict(result_url)
        except ValueError as exc:
            return WaveSpeedPollResult(
                state="failure",
                raw_status=raw_status,
                provider_task_id=provider_task_id,
                result_url=None,
                error_message=f"WaveSpeed returned an unsafe final media URL: {exc}",
                raw_response=payload,
                poll_url_hint=poll_url_hint,
            )
        return WaveSpeedPollResult(
            state="success",
            raw_status=raw_status,
            provider_task_id=provider_task_id,
            result_url=result_url,
            error_message=None,
            raw_response=payload,
            poll_url_hint=poll_url_hint,
        )

    if raw_status == "failed" or terminal_error:
        return WaveSpeedPollResult(
            state="failure",
            raw_status=raw_status or "failed",
            provider_task_id=provider_task_id,
            result_url=None,
            error_message=terminal_error or "WaveSpeed returned a terminal failure",
            raw_response=payload,
            poll_url_hint=poll_url_hint,
        )

    if raw_status:
        return WaveSpeedPollResult(
            state="processing",
            raw_status=raw_status,
            provider_task_id=provider_task_id,
            result_url=None,
            error_message=None,
            raw_response=payload,
            poll_url_hint=poll_url_hint,
        )

    return WaveSpeedPollResult(
        state="processing",
        raw_status="",
        provider_task_id=provider_task_id,
        result_url=None,
        error_message=None,
        raw_response=payload,
        poll_url_hint=poll_url_hint,
    )


class WaveSpeedMediaProvider:
    PROVIDER_NAME = WAVESPEED_PROVIDER
    LAUNCH_MODEL_ID = WAVESPEED_LAUNCH_MODEL_ID
    DEFAULT_BASE_URL = WAVESPEED_DEFAULT_BASE_URL
    DEFAULT_SUBMIT_ENDPOINT = WAVESPEED_DEFAULT_SUBMIT_ENDPOINT
    DEFAULT_RESULT_ENDPOINT_TEMPLATE = WAVESPEED_DEFAULT_RESULT_ENDPOINT_TEMPLATE
    ALLOWED_ASPECT_RATIOS = WAVESPEED_ALLOWED_ASPECT_RATIOS
    ALLOWED_DURATIONS = WAVESPEED_ALLOWED_DURATIONS
    MAX_REFERENCE_IMAGES = WAVESPEED_MAX_REFERENCE_IMAGES
    POLL_INITIAL_SECONDS = WAVESPEED_POLL_INITIAL_SECONDS
    POLL_MAX_SECONDS = WAVESPEED_POLL_MAX_SECONDS
    POLL_TIMEOUT_SECONDS = WAVESPEED_POLL_TIMEOUT_SECONDS
    PRICING_TIERS = WAVESPEED_PRICING_TIERS
    MODEL_SPECS = WAVESPEED_MODEL_SPECS

    def __init__(
        self,
        *,
        api_key: str,
        base_url: Optional[str] = None,
        submit_endpoint: Optional[str] = None,
        result_endpoint_template: Optional[str] = None,
        provider_model_id: Optional[str] = None,
    ) -> None:
        self.base_url = normalize_wavespeed_base_url(base_url)
        self.model_spec = self.get_model_spec(
            provider_model_id=provider_model_id,
            submit_endpoint=submit_endpoint,
        )
        self.submit_endpoint = normalize_relative_media_endpoint_path(
            submit_endpoint or self.model_spec.submit_endpoint,
        )
        self.result_endpoint_template = normalize_relative_media_endpoint_path(
            result_endpoint_template or self.DEFAULT_RESULT_ENDPOINT_TEMPLATE,
            allow_request_id_placeholder=True,
        )
        self.provider_model_id = str(provider_model_id or self.model_spec.model_id).strip() or self.model_spec.model_id
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0))

    @classmethod
    def get_model_spec(
        cls,
        *,
        provider_model_id: Optional[str] = None,
        submit_endpoint: Optional[str] = None,
    ) -> WaveSpeedModelSpec:
        return _get_wavespeed_model_spec(provider_model_id, submit_endpoint)

    @classmethod
    def get_pricing_tiers(
        cls,
        *,
        provider_model_id: Optional[str] = None,
        submit_endpoint: Optional[str] = None,
    ) -> dict[str, int]:
        return dict(
            cls.get_model_spec(
                provider_model_id=provider_model_id,
                submit_endpoint=submit_endpoint,
            ).pricing_tiers
        )

    @staticmethod
    def resolve_submit_endpoint(api_config: Optional[dict[str, Any]]) -> str:
        if isinstance(api_config, dict):
            for key in ("endpoint", "api_endpoint", "apiEndpoint", "submit_endpoint", "submitEndpoint"):
                value = api_config.get(key)
                if isinstance(value, str) and value.strip():
                    return normalize_relative_media_endpoint_path(value)
        return WAVESPEED_DEFAULT_SUBMIT_ENDPOINT

    @staticmethod
    def resolve_result_endpoint_template(api_config: Optional[dict[str, Any]]) -> str:
        if isinstance(api_config, dict):
            for key in ("query_endpoint", "queryEndpoint", "api_query_endpoint", "apiQueryEndpoint", "result_endpoint_template", "resultEndpointTemplate"):
                value = api_config.get(key)
                if isinstance(value, str) and value.strip():
                    return normalize_relative_media_endpoint_path(
                        value,
                        allow_request_id_placeholder=True,
                    )
        return WAVESPEED_DEFAULT_RESULT_ENDPOINT_TEMPLATE

    @staticmethod
    def resolve_provider_model_id(model: Optional[str], api_config: Optional[dict[str, Any]]) -> str:
        if isinstance(api_config, dict):
            for key in ("provider_model_id", "providerModelId", "model_id", "modelId"):
                value = api_config.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        if isinstance(model, str) and model.strip():
            return model.strip()
        return WAVESPEED_LAUNCH_MODEL_ID

    def build_submit_url(self) -> str:
        return f"{self.base_url}{self.submit_endpoint}"

    def build_result_url(self, request_id: str) -> str:
        if not request_id:
            raise WaveSpeedError("WaveSpeed request id is required")
        return f"{self.base_url}{self.result_endpoint_template.replace('{requestId}', request_id)}"

    @classmethod
    def calculate_next_poll_delay(
        cls,
        previous_delay_seconds: int,
        retry_after_seconds: Optional[int] = None,
    ) -> int:
        return _compute_next_poll_delay(previous_delay_seconds, retry_after_seconds)

    @staticmethod
    def extract_retry_after_seconds(headers: httpx.Headers) -> Optional[int]:
        return _extract_retry_after_seconds(headers)

    @classmethod
    def validate_request(
        cls,
        *,
        prompt: str,
        reference_image_urls: Optional[list[str]],
        aspect_ratio: str,
        duration: int,
        resolution: Optional[str] = None,
        provider_model_id: Optional[str] = None,
        submit_endpoint: Optional[str] = None,
    ) -> None:
        model_spec = cls.get_model_spec(
            provider_model_id=provider_model_id,
            submit_endpoint=submit_endpoint,
        )

        if not isinstance(prompt, str) or not prompt.strip():
            raise WaveSpeedError("WaveSpeed prompt is required")
        if model_spec.reference_images_required and not reference_image_urls:
            raise WaveSpeedError("WaveSpeed image-to-video models require at least one reference image")
        if reference_image_urls and len(reference_image_urls) > model_spec.max_reference_images:
            raise WaveSpeedError(
                f"WaveSpeed supports at most {model_spec.max_reference_images} reference images"
            )
        if aspect_ratio not in model_spec.allowed_aspect_ratios:
            raise WaveSpeedError(
                f"WaveSpeed aspect_ratio must be one of {sorted(model_spec.allowed_aspect_ratios)}"
            )
        if duration not in model_spec.allowed_durations:
            raise WaveSpeedError(
                f"WaveSpeed duration must be one of {sorted(model_spec.allowed_durations)}"
            )
        if resolution is not None and not str(resolution).strip():
            raise WaveSpeedError("WaveSpeed resolution may not be empty")

    @classmethod
    def build_request_summary(
        cls,
        *,
        prompt: str,
        reference_image_urls: Optional[list[str]],
        aspect_ratio: str,
        duration: int,
        resolution: Optional[str] = None,
        provider_model_id: Optional[str] = None,
        submit_endpoint: Optional[str] = None,
    ) -> dict[str, Any]:
        model_spec = cls.get_model_spec(
            provider_model_id=provider_model_id,
            submit_endpoint=submit_endpoint,
        )
        summary: dict[str, Any] = {
            "prompt_length": len(prompt or ""),
            "generate_type": model_spec.generate_type,
            "has_reference_images": bool(reference_image_urls),
            "reference_image_count": len(reference_image_urls or []),
            "aspect_ratio": aspect_ratio,
            "duration": duration,
            "requested_duration": duration,
        }
        if resolution:
            summary["requested_resolution"] = resolution
        return summary

    @staticmethod
    def _first_non_empty_string(*values: Any) -> Optional[str]:
        for value in values:
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, str) and item.strip():
                        return item.strip()
                continue
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _normalize_url_list(value: Any) -> list[str]:
        if isinstance(value, str):
            value = [value]
        if not isinstance(value, list):
            return []
        return [item.strip() for item in value if isinstance(item, str) and item.strip()]

    @classmethod
    def build_minimax_h3_submit_payload(
        cls,
        *,
        model_spec: WaveSpeedModelSpec,
        prompt: str,
        reference_image_urls: Optional[list[str]],
        aspect_ratio: Optional[str],
        duration: Optional[int],
        resolution: Optional[str],
        extra_params: Optional[dict[str, Any]] = None,
        reference_video_urls: Optional[list[str]] = None,
        reference_audio_urls: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        extra = extra_params if isinstance(extra_params, dict) else {}
        route = model_spec.route_family or model_spec.generate_type
        images = cls._normalize_url_list(
            extra.get("reference_images")
            or extra.get("images")
            or reference_image_urls,
        )
        videos = cls._normalize_url_list(
            extra.get("reference_videos")
            or extra.get("videos")
            or reference_video_urls,
        )
        audios = cls._normalize_url_list(
            extra.get("reference_audios")
            or extra.get("audios")
            or reference_audio_urls,
        )
        if len(images) > model_spec.max_reference_images:
            raise WaveSpeedError(f"WaveSpeed supports at most {model_spec.max_reference_images} reference images")
        if len(videos) > model_spec.max_reference_videos:
            raise WaveSpeedError(f"WaveSpeed supports at most {model_spec.max_reference_videos} reference videos")
        if len(audios) > model_spec.max_reference_audios:
            raise WaveSpeedError(f"WaveSpeed supports at most {model_spec.max_reference_audios} reference audios")
        if model_spec.max_loras:
            loras = extra.get("loras")
            if loras is not None and (not isinstance(loras, list) or len(loras) > model_spec.max_loras):
                raise WaveSpeedError(f"WaveSpeed supports at most {model_spec.max_loras} LoRA weights")
        elif extra.get("loras"):
            raise WaveSpeedError("This WaveSpeed model does not support LoRA weights")

        clean_prompt = str(prompt or "").strip()
        if not clean_prompt:
            raise WaveSpeedError("WaveSpeed prompt is required")
        normalized_resolution = str(resolution or extra.get("resolution") or "").strip().lower()
        if normalized_resolution and normalized_resolution not in model_spec.allowed_resolutions:
            raise WaveSpeedError(
                f"WaveSpeed resolution must be one of {sorted(model_spec.allowed_resolutions)}"
            )
        normalized_duration = duration
        if normalized_duration is None and extra.get("duration") not in (None, ""):
            try:
                normalized_duration = int(extra["duration"])
            except (TypeError, ValueError) as exc:
                raise WaveSpeedError("WaveSpeed duration must be an integer") from exc
        if normalized_duration is not None and not model_spec.image_model and normalized_duration not in model_spec.allowed_durations:
            raise WaveSpeedError(
                f"WaveSpeed duration must be between 3 and 15 seconds"
            )

        payload: dict[str, Any] = {"prompt": clean_prompt}
        if route == "image-to-video":
            image = cls._first_non_empty_string(extra.get("image"), images[0] if images else None)
            if not image:
                raise WaveSpeedError("MiniMax H3 image-to-video requires a start image")
            payload["image"] = image
            last_image = cls._first_non_empty_string(extra.get("last_image"), extra.get("lastImage"))
            if last_image:
                payload["last_image"] = last_image
        elif route == "reference-to-video":
            if not images and not videos:
                raise WaveSpeedError("MiniMax H3 reference-to-video requires an image or video reference")
            if images:
                payload["reference_images"] = images
            if videos:
                payload["reference_videos"] = videos
            if audios:
                payload["reference_audios"] = audios
        elif route == "video-edit":
            source_video = cls._first_non_empty_string(extra.get("video"), videos[0] if videos else None)
            if not source_video:
                raise WaveSpeedError("MiniMax H3 video-edit requires a source video")
            payload["video"] = source_video
            if images:
                payload["reference_images"] = images
            if audios:
                payload["reference_audios"] = audios
            if "generate_audio" in extra:
                payload["generate_audio"] = bool(extra["generate_audio"])
        elif route == "video-extend":
            source_video = cls._first_non_empty_string(extra.get("video"), videos[0] if videos else None)
            if not source_video:
                raise WaveSpeedError("MiniMax H3 video-extend requires a source video")
            payload["video"] = source_video
            last_image = cls._first_non_empty_string(extra.get("last_image"), extra.get("lastImage"))
            if last_image:
                payload["last_image"] = last_image
        elif route == "image-edit":
            if not images:
                raise WaveSpeedError("MiniMax H3 image-edit requires at least one reference image")
            payload["images"] = images
        if model_spec.supports_aspect_ratio:
            selected_aspect_ratio = cls._first_non_empty_string(aspect_ratio, extra.get("aspect_ratio"), extra.get("aspectRatio"))
            if selected_aspect_ratio:
                if selected_aspect_ratio not in model_spec.allowed_aspect_ratios:
                    raise WaveSpeedError(
                        f"WaveSpeed aspect_ratio must be one of {sorted(model_spec.allowed_aspect_ratios)}"
                    )
                payload["aspect_ratio"] = selected_aspect_ratio
        if normalized_resolution:
            payload["resolution"] = normalized_resolution
        if normalized_duration is not None and not model_spec.image_model:
            payload["duration"] = normalized_duration
        if route in {"text-to-image", "image-edit"}:
            output_format = str(extra.get("output_format") or extra.get("outputFormat") or "jpeg").strip().lower()
            if output_format not in {"jpeg", "png", "webp"}:
                raise WaveSpeedError("WaveSpeed image output_format must be one of jpeg, png, or webp")
            payload["output_format"] = output_format
        if "seed" in extra and extra["seed"] not in (None, ""):
            payload["seed"] = int(extra["seed"])
        if model_spec.max_loras and extra.get("loras"):
            payload["loras"] = extra["loras"]
        return payload

    @classmethod
    def build_submit_payload(
        cls,
        *,
        prompt: str,
        reference_image_urls: Optional[list[str]],
        aspect_ratio: str,
        duration: int,
        resolution: Optional[str] = None,
        provider_model_id: Optional[str] = None,
        submit_endpoint: Optional[str] = None,
        extra_params: Optional[dict[str, Any]] = None,
        reference_video_urls: Optional[list[str]] = None,
        reference_audio_urls: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        model_spec = cls.get_model_spec(
            provider_model_id=provider_model_id,
            submit_endpoint=submit_endpoint,
        )
        if model_spec.route_family:
            return cls.build_minimax_h3_submit_payload(
                model_spec=model_spec,
                prompt=prompt,
                reference_image_urls=reference_image_urls,
                aspect_ratio=aspect_ratio,
                duration=duration,
                resolution=resolution,
                extra_params=extra_params,
                reference_video_urls=reference_video_urls,
                reference_audio_urls=reference_audio_urls,
            )
        cls.validate_request(
            prompt=prompt,
            reference_image_urls=reference_image_urls,
            aspect_ratio=aspect_ratio,
            duration=duration,
            resolution=resolution,
            provider_model_id=model_spec.model_id,
            submit_endpoint=model_spec.submit_endpoint,
        )
        payload: dict[str, Any] = {
            "prompt": prompt.strip(),
            "aspect_ratio": aspect_ratio,
            "duration": duration,
        }
        if resolution and str(resolution).strip():
            payload["resolution"] = str(resolution).strip()
        if reference_image_urls:
            payload["images"] = reference_image_urls[: model_spec.max_reference_images]
        return payload

    def build_submission_record(
        self,
        *,
        provider_task_id: str,
        prompt: str,
        reference_image_urls: Optional[list[str]],
        aspect_ratio: str,
        duration: int,
        resolution: Optional[str] = None,
        used_sync_mode: bool = False,
    ) -> dict[str, Any]:
        return {
            "provider": self.PROVIDER_NAME,
            "provider_model_id": self.provider_model_id,
            "provider_task_id": provider_task_id,
            "base_url": self.base_url,
            "submit_endpoint": self.submit_endpoint,
            "result_endpoint_template": self.result_endpoint_template,
            "used_sync_mode": used_sync_mode,
            "request_summary": self.build_request_summary(
                prompt=prompt,
                reference_image_urls=reference_image_urls,
                aspect_ratio=aspect_ratio,
                duration=duration,
                resolution=resolution,
                provider_model_id=self.provider_model_id,
                submit_endpoint=self.submit_endpoint,
            ),
        }

    async def create_prediction(
        self,
        *,
        prompt: str,
        reference_image_urls: Optional[list[str]],
        aspect_ratio: str,
        duration: int,
        resolution: Optional[str] = None,
        extra_params: Optional[dict[str, Any]] = None,
        reference_video_urls: Optional[list[str]] = None,
        reference_audio_urls: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        payload = self.build_submit_payload(
            prompt=prompt,
            reference_image_urls=reference_image_urls,
            aspect_ratio=aspect_ratio,
            duration=duration,
            resolution=resolution,
            provider_model_id=self.provider_model_id,
            submit_endpoint=self.submit_endpoint,
            extra_params=extra_params,
            reference_video_urls=reference_video_urls,
            reference_audio_urls=reference_audio_urls,
        )

        response = await self.client.post(
            self.build_submit_url(),
            headers=self._headers,
            json=payload,
        )
        response.raise_for_status()
        raw_response = response.json()

        data = raw_response.get("data")
        if not isinstance(data, dict):
            data = {}

        provider_task_id = (
            str(data.get("id") or raw_response.get("id") or "").strip()
            or None
        )
        if not provider_task_id:
            raise WaveSpeedError("WaveSpeed submit response did not include a prediction id")

        return {
            "provider_task_id": provider_task_id,
            "raw_status": str(data.get("status") or raw_response.get("status") or "created").strip().lower(),
            "raw_response": raw_response,
        }

    async def create_audio_prediction(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        cleaned_payload = {
            key: value
            for key, value in payload.items()
            if value is not None and value != "" and value != []
        }
        response = await self.client.post(
            self.build_submit_url(),
            headers=self._headers,
            json=cleaned_payload,
        )
        response.raise_for_status()
        raw_response = response.json()

        data = raw_response.get("data")
        if not isinstance(data, dict):
            data = {}

        provider_task_id = (
            str(data.get("id") or raw_response.get("id") or "").strip()
            or None
        )
        if not provider_task_id:
            raise WaveSpeedError("WaveSpeed submit response did not include a prediction id")

        return {
            "provider_task_id": provider_task_id,
            "raw_status": str(data.get("status") or raw_response.get("status") or "created").strip().lower(),
            "raw_response": raw_response,
        }

    @classmethod
    def validate_image_request(
        cls,
        *,
        prompt: str,
        reference_image_urls: Optional[list[str]],
        aspect_ratio: str,
        resolution: str,
        quality: str,
        output_format: str,
        submit_endpoint: Optional[str] = None,
    ) -> None:
        model_spec = cls.get_model_spec(submit_endpoint=submit_endpoint)
        if not isinstance(prompt, str) or not prompt.strip():
            raise WaveSpeedError("WaveSpeed image prompt is required")
        if submit_endpoint and submit_endpoint.rstrip("/").endswith("/edit") and not reference_image_urls:
            raise WaveSpeedError("WaveSpeed image edit requires at least one reference image")
        if reference_image_urls and len(reference_image_urls) > model_spec.max_reference_images:
            raise WaveSpeedError(
                f"WaveSpeed image models support at most {model_spec.max_reference_images} reference images"
            )
        if aspect_ratio not in model_spec.allowed_aspect_ratios:
            raise WaveSpeedError(
                f"WaveSpeed image aspect_ratio must be one of {sorted(model_spec.allowed_aspect_ratios)}"
            )
        if resolution not in WAVESPEED_GPT_IMAGE_25_ALLOWED_RESOLUTIONS:
            raise WaveSpeedError("WaveSpeed image resolution must be one of 1k, 2k, or 4k")
        if quality not in WAVESPEED_GPT_IMAGE_25_ALLOWED_QUALITIES:
            raise WaveSpeedError("WaveSpeed image quality must be one of low, medium, high, xhigh, or max")
        if output_format not in WAVESPEED_GPT_IMAGE_25_ALLOWED_OUTPUT_FORMATS:
            raise WaveSpeedError("WaveSpeed image output_format must be one of png, jpeg, or webp")

    @classmethod
    def build_image_submit_payload(
        cls,
        *,
        prompt: str,
        reference_image_urls: Optional[list[str]],
        aspect_ratio: str,
        resolution: str = "1k",
        quality: str = "medium",
        output_format: str = "png",
        submit_endpoint: Optional[str] = None,
    ) -> dict[str, Any]:
        cls.validate_image_request(
            prompt=prompt,
            reference_image_urls=reference_image_urls,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            quality=quality,
            output_format=output_format,
            submit_endpoint=submit_endpoint,
        )
        payload: dict[str, Any] = {
            "prompt": prompt.strip(),
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
            "quality": quality,
            "output_format": output_format,
        }
        if reference_image_urls:
            payload["images"] = reference_image_urls[:WAVESPEED_GPT_IMAGE_25_MAX_REFERENCE_IMAGES]
        return payload

    async def create_image_prediction(
        self,
        *,
        prompt: str,
        reference_image_urls: Optional[list[str]],
        aspect_ratio: str,
        resolution: str = "1k",
        quality: str = "medium",
        output_format: str = "png",
    ) -> dict[str, Any]:
        payload = self.build_image_submit_payload(
            prompt=prompt,
            reference_image_urls=reference_image_urls,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            quality=quality,
            output_format=output_format,
            submit_endpoint=self.submit_endpoint,
        )
        response = await self.client.post(
            self.build_submit_url(),
            headers=self._headers,
            json=payload,
        )
        response.raise_for_status()
        raw_response = response.json()
        data = raw_response.get("data")
        if not isinstance(data, dict):
            data = {}
        provider_task_id = str(data.get("id") or raw_response.get("id") or "").strip() or None
        if not provider_task_id:
            raise WaveSpeedError("WaveSpeed image submit response did not include a prediction id")
        return {
            "provider_task_id": provider_task_id,
            "raw_status": str(data.get("status") or raw_response.get("status") or "created").strip().lower(),
            "raw_response": raw_response,
        }

    async def poll_prediction(self, request_id: str) -> WaveSpeedPollResult:
        response = await self.client.get(
            self.build_result_url(request_id),
            headers=self._headers,
            timeout=httpx.Timeout(30.0, connect=10.0),
        )
        response.raise_for_status()
        return normalize_wavespeed_poll_response(response.json())

    async def wait_for_completion(
        self,
        *,
        request_id: str,
    ) -> WaveSpeedPollResult:
        delay_seconds = self.POLL_INITIAL_SECONDS
        elapsed_seconds = 0

        while True:
            try:
                result = await self.poll_prediction(request_id)
            except httpx.TimeoutException as exc:
                next_delay = self.calculate_next_poll_delay(delay_seconds)
                elapsed_seconds += next_delay
                if elapsed_seconds > self.POLL_TIMEOUT_SECONDS:
                    raise WaveSpeedPollingTimeoutError(
                        "WaveSpeed polling timed out after 30 minutes"
                    ) from exc
                await asyncio.sleep(next_delay)
                delay_seconds = next_delay
                continue
            except httpx.HTTPStatusError as exc:
                retry_after = None
                if exc.response.status_code in WAVESPEED_RETRYABLE_POLL_STATUS_CODES:
                    retry_after = _extract_retry_after_seconds(exc.response.headers)
                    next_delay = self.calculate_next_poll_delay(delay_seconds, retry_after)
                    elapsed_seconds += next_delay
                    if elapsed_seconds > self.POLL_TIMEOUT_SECONDS:
                        raise WaveSpeedPollingTimeoutError(
                            f"WaveSpeed polling timed out after 30 minutes (last HTTP {exc.response.status_code})"
                        ) from exc
                    await asyncio.sleep(next_delay)
                    delay_seconds = next_delay
                    continue
                raise

            if result.state == "success":
                return result
            if result.state == "failure":
                raise WaveSpeedTerminalError(
                    result.error_message or "WaveSpeed returned a terminal failure"
                )

            next_delay = self.calculate_next_poll_delay(delay_seconds)
            elapsed_seconds += next_delay
            if elapsed_seconds > self.POLL_TIMEOUT_SECONDS:
                raise WaveSpeedPollingTimeoutError(
                    f"WaveSpeed polling timed out after 30 minutes (last status: {result.raw_status or 'unknown'})"
                )
            await asyncio.sleep(next_delay)
            delay_seconds = next_delay

    async def aclose(self) -> None:
        await self.client.aclose()
