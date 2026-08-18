import asyncio
import json
import os
import re
import time
from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx
import structlog

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
    "google-banana-2-lite": "nano-banana-2-lite",
    "google/nano-banana-2-lite": "nano-banana-2-lite",
    "nano_banana_2_lite": "nano-banana-2-lite",
    "google_banana_2_lite": "nano-banana-2-lite",
    "gemini-3.1-flash-lite-image": "nano-banana-2-lite",
    "flux-2.0": "flux-2.0",
    "flux-2-0": "flux-2.0",
    "flux-1-1-pro": "flux-1.1-pro",
    "grok-imagine": "grok-imagine",
    "grok-imagine/text-to-video": "grok-imagine",
    "grok-imagine/image-to-video": "grok-imagine",
    "grok-imagine-video-1-5-preview": "grok-imagine-video-1-5-preview",
    "grok-imagine-video-1.5-preview": "grok-imagine-video-1-5-preview",
    "grok-imagine-video-1.5": "grok-imagine-video-1-5-preview",
    "grok-imagine-video-1-5": "grok-imagine-video-1-5-preview",
    "grok-video-1.5": "grok-imagine-video-1-5-preview",
    "grok-video-1-5": "grok-imagine-video-1-5-preview",
    "grok-imagine/upscale": "grok-imagine/upscale",
    "ideogram-2": "ideogram-2",
    "recraft-v3": "recraft-v3",
    "ghibli-ai": "ghibli-ai",
    # Video models
    "veo3": "veo3",
    "veo3_fast": "veo3_fast",
    "veo3_lite": "veo3_lite",
    "veo3/generate-veo-3-video": "veo3",
    "veo3/generate-veo-3-video-fast": "veo3_fast",
    "veo3/generate-veo-3-video-lite": "veo3_lite",
    "veo3/extend-video": "fast",
    "veo3/veo3_fast": "veo3_fast",
    "veo3/veo3_lite": "veo3_lite",
    "veo-3.1-lite": "veo3_lite",
    "veo-3.1-fast": "veo3_fast",
    "veo-3.1-quality": "veo-3.1",
    "veo-3-1": "veo-3.1",
    "veo-3.1": "veo-3.1",
    "runway-aleph": "runway-aleph",
    "sora-2": "sora-2",
    "kling-2.6": "kling-2.6",
    "kling-2-6": "kling-2.6",
    "wan-2.6": "wan-2.6",
    "wan-2-6": "wan-2.6",
    "happyhorse": "happyhorse/text-to-video",
    "happyhorse-1.0": "happyhorse/text-to-video",
    "happyhorse-1-0": "happyhorse/text-to-video",
    "happyhorse/text-to-video": "happyhorse/text-to-video",
    "happyhorse/image-to-video": "happyhorse/image-to-video",
    "happyhorse/reference-to-video": "happyhorse/reference-to-video",
    "happyhorse/video-edit": "happyhorse/video-edit",
    "gemini-omni": "gemini-omni-video",
    "gemini-omni-video": "gemini-omni-video",
    "gemini_omni_video": "gemini-omni-video",
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

NANO_BANANA_2_LITE_API_MODEL = "nano-banana-2-lite"

_MODEL_RESOLUTION_STATS = {
    "explicit_api_model": 0,
    "fallback_alias_map": 0,
    "passthrough_model": 0,
}

_INTERNAL_EXTRA_PARAM_KEYS = {
    "marketplaceContext",
    "marketplaceProduct",
    "marketplace_context",
    "marketplace_product",
    "reference_image_manifest",
    "referenceImageManifest",
    "reference_image_role_order",
    "referenceImageRoleOrder",
    "reference_image_role_counts",
    "referenceImageRoleCounts",
}


def get_model_resolution_stats() -> dict[str, int]:
    """Expose model-resolution counters for observability/tests."""
    return dict(_MODEL_RESOLUTION_STATS)


def reset_model_resolution_stats() -> None:
    """Reset model-resolution counters."""
    for key in _MODEL_RESOLUTION_STATS:
        _MODEL_RESOLUTION_STATS[key] = 0


def _iter_provider_extra_params(extra_params: Any):
    if not isinstance(extra_params, dict):
        return

    for key, value in extra_params.items():
        if value is None:
            continue
        normalized_key = str(key)
        if normalized_key.startswith("__") or normalized_key in _INTERNAL_EXTRA_PARAM_KEYS:
            continue
        yield key, value


def _first_extra_param(extra_params: Any, *keys: str) -> Any:
    """Read the first present key from a catalog-driven extra_params payload."""
    if not isinstance(extra_params, dict):
        return None
    for key in keys:
        value = extra_params.get(key)
        if value is not None:
            return value
    return None


def _get_api_config_value(api_config: dict[str, Any] | None, *keys: str) -> str | None:
    """Read a string value from api_config supporting snake_case and camelCase keys."""
    if not isinstance(api_config, dict):
        return None

    for key in keys:
        value = api_config.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _get_api_config_str_list(api_config: dict[str, Any] | None, *keys: str) -> list[str]:
    """Read a list-of-strings value from api_config (snake_case or camelCase).

    `_get_api_config_value` deliberately returns only strings, so list-valued
    settings such as `drop_params` need their own reader. A bare string is
    accepted as a one-element list.
    """
    if not isinstance(api_config, dict):
        return []

    for key in keys:
        value = api_config.get(key)
        if value is None:
            continue
        items = value if isinstance(value, list) else [value]
        normalized = [str(item).strip() for item in items if isinstance(item, str) and str(item).strip()]
        if normalized:
            return normalized
    return []


def _get_api_config_bool(api_config: dict[str, Any] | None, *keys: str) -> bool:
    if not isinstance(api_config, dict):
        return False
    for key in keys:
        value = api_config.get(key)
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value != 0
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on"}:
                return True
            if normalized in {"0", "false", "no", "off"}:
                return False
    return False


def _normalize_reference_image_input_type(raw_type: str | None) -> str | None:
    if not raw_type:
        return None

    normalized = raw_type.strip().lower()
    if normalized in {"array", "image_urls", "video_urls", "audio_urls"}:
        return "array"
    if normalized in {"object_array", "object-array", "video_list", "video-list"}:
        return "object_array"
    if normalized in {"url", "text", "string"}:
        return "url"
    return None


def _normalize_reference_video_object_list(value: Any) -> list[dict[str, Any]]:
    if value is None:
        return []

    raw_items = value if isinstance(value, list) else [value]
    normalized: list[dict[str, Any]] = []
    for item in raw_items:
        if isinstance(item, str):
            url = item.strip()
            if url:
                normalized.append({"url": url})
            continue

        if not isinstance(item, dict):
            continue

        url_value = item.get("url") or item.get("video_url") or item.get("videoUrl")
        if not isinstance(url_value, str) or not url_value.strip():
            continue

        entry: dict[str, Any] = {"url": url_value.strip()}
        for source_key, target_key in (
            ("start", "start"),
            ("starts", "start"),
            ("start_time", "start"),
            ("startTime", "start"),
            ("end", "ends"),
            ("ends", "ends"),
            ("end_time", "ends"),
            ("endTime", "ends"),
        ):
            if source_key in item and item[source_key] is not None:
                entry[target_key] = item[source_key]
        normalized.append(entry)
    return normalized


def _resolve_reference_image_input_config(
    api_config: dict[str, Any] | None,
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


def _default_reference_image_key_for_model(api_model: str | None) -> str:
    if api_model == NANO_BANANA_2_LITE_API_MODEL:
        return "image_urls"
    return "image_input"


# Matches one or more leading `/api/v1/`-style prefixes. `self.base_url` already
# ends in `/api/v1`, so any such prefix stored in model config must be removed or
# the request lands on `https://api.kie.ai/api/v1/api/v1/...`.
_API_VERSION_PREFIX_RE = re.compile(r"^(?:/?api/v\d+/)+", re.IGNORECASE)

# Kie.ai's default job-submission endpoint, relative to base_url.
DEFAULT_CREATE_TASK_ENDPOINT = "jobs/createTask"


def _clean_endpoint(endpoint: str | None) -> str:
    """Normalize a configured Kie.ai endpoint into a base_url-relative path.

    An unset/blank endpoint means "use the default createTask job endpoint", so
    callers can compare the result against DEFAULT_CREATE_TASK_ENDPOINT to decide
    between the generic job API and a model-specific custom endpoint.

    Only `api/vN/` prefixes are stripped — a bare `/v1/...` path is left alone so
    endpoints such as `/v1/text-to-speech/{voice_id}` keep their existing routing.
    """
    if endpoint is None:
        return DEFAULT_CREATE_TASK_ENDPOINT

    cleaned = str(endpoint).strip()
    if not cleaned:
        return DEFAULT_CREATE_TASK_ENDPOINT

    if "://" in cleaned:
        parsed = urlparse(cleaned)
        cleaned = parsed.path or ""

    cleaned = _API_VERSION_PREFIX_RE.sub("", cleaned).lstrip("/")
    return cleaned or DEFAULT_CREATE_TASK_ENDPOINT


def _is_reference_url_key(key: str) -> bool:
    lowered = key.lower()
    return lowered.endswith("url") or lowered.endswith("urls")


def _redact_url_for_log(value: str) -> str:
    """Keep provider diagnostics useful without persisting signed URL tokens."""
    try:
        parsed = urlparse(value)
        if parsed.query:
            return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, "[redacted]", ""))
    except ValueError:
        pass
    return value


def _normalize_ref_urls_for_model(model: str | None, input_params: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of ``input_params`` with reference URL fields cleaned up.

    The target field name itself is catalog-driven (see
    ``_resolve_reference_image_input_config``); this only sanitizes the values so
    a blank or partially-populated reference list never reaches Kie.ai as an
    empty string / list of empties, which the API rejects with an opaque error.

    Non-URL fields and unrecognized value shapes are passed through untouched.
    """
    if not isinstance(input_params, dict):
        return input_params

    normalized: dict[str, Any] = {}
    dropped: list[str] = []
    for key, value in input_params.items():
        if not _is_reference_url_key(str(key)):
            normalized[key] = value
            continue

        if isinstance(value, str):
            cleaned_url = value.strip()
            if cleaned_url:
                normalized[key] = cleaned_url
            else:
                dropped.append(str(key))
            continue

        if isinstance(value, list):
            cleaned_urls = [
                item.strip() for item in value if isinstance(item, str) and item.strip()
            ]
            # Non-string entries (e.g. the `{"url": ..., "start": ...}` objects used
            # by object-array video inputs) are preserved as-is; only Nones are dropped.
            non_str = [item for item in value if not isinstance(item, str) and item is not None]
            cleaned_list: list[Any] = cleaned_urls + non_str
            if cleaned_list:
                normalized[key] = cleaned_list
            else:
                dropped.append(str(key))
            continue

        normalized[key] = value

    if dropped:
        logger.info("kie_ai_dropped_empty_reference_fields", model=model, fields=dropped)

    return normalized


def _resolve_reference_video_input_config(
    api_config: dict[str, Any] | None,
    *,
    default_key: str,
) -> tuple[str, str]:
    key = _get_api_config_value(
        api_config,
        "reference_video_input_key",
        "referenceVideoInputKey",
        "reference_video_key",
        "referenceVideoKey",
    ) or default_key
    input_type = _normalize_reference_image_input_type(
        _get_api_config_value(
            api_config,
            "reference_video_input_type",
            "referenceVideoInputType",
            "reference_video_type",
            "referenceVideoType",
        )
    ) or "array"
    return key, input_type


def _resolve_reference_audio_input_config(
    api_config: dict[str, Any] | None,
    *,
    default_key: str,
) -> tuple[str, str]:
    key = _get_api_config_value(
        api_config,
        "reference_audio_input_key",
        "referenceAudioInputKey",
        "reference_audio_key",
        "referenceAudioKey",
    ) or default_key
    input_type = _normalize_reference_image_input_type(
        _get_api_config_value(
            api_config,
            "reference_audio_input_type",
            "referenceAudioInputType",
            "reference_audio_type",
            "referenceAudioType",
        )
    ) or "array"
    return key, input_type


def _resolve_reference_overflow_keys(
    api_config: dict[str, Any] | None,
    *,
    subject: str,
) -> list[str]:
    """Extra payload keys that receive reference URLs 2..N in `url` mode.

    Providers that take an ordered pair of single-URL fields (minimax-h3's
    ``first_frame_url`` / ``last_frame_url``) can consume the Studio's ordered
    reference list without a bespoke code path: index 0 lands on the primary key
    and each subsequent index lands on the next overflow key. Indices beyond the
    configured keys are dropped, which is the pre-existing behavior for `url`.
    """
    return _get_api_config_str_list(
        api_config,
        f"reference_{subject}_overflow_keys",
        f"reference{subject.capitalize()}OverflowKeys",
    )


def _apply_reference_urls_to_input(
    input_params: dict[str, Any],
    urls: list[Any],
    *,
    key: str,
    input_type: str,
    overflow_keys: list[str] | None = None,
) -> None:
    """Write a reference URL list onto ``input_params`` in the configured shape."""
    if not urls:
        return

    if input_type == "url":
        input_params[key] = urls[0]
        for offset, overflow_key in enumerate(overflow_keys or []):
            index = offset + 1
            if index < len(urls):
                input_params[overflow_key] = urls[index]
        return

    if input_type == "object_array":
        input_params[key] = _normalize_reference_video_object_list(urls)
        return

    input_params[key] = urls


# ---------------------------------------------------------------------------
# Declarative mode routing (`apiConfig.modes`)
#
# Some providers expose one logical model as several endpoints with genuinely
# different input contracts — minimax-h3 is `text-to-video`, `image-to-video`
# (single-URL first/last frame, no `aspect_ratio` at all) and
# `reference-to-video` (arrays of image/video/audio references). Serving those
# from one catalog row needs more than the two-way, image-only
# `kie_model_id_with_references` switch.
#
# `apiConfig.modes` is an ordered list of PARTIAL api_config overrides. The
# first entry whose `when` predicate matches the shape of the attached
# references wins, and its keys are layered over the base api_config. The rest
# of the request builder then runs unchanged against the merged config, because
# every downstream helper already reads its settings from api_config.
#
# A row without `modes` resolves to its api_config unchanged, so every existing
# catalog row keeps byte-identical behavior.
# ---------------------------------------------------------------------------

_MODE_PREDICATE_SUBJECTS = {
    "image": "images",
    "images": "images",
    "referenceimage": "images",
    "referenceimages": "images",
    "video": "videos",
    "videos": "videos",
    "referencevideo": "videos",
    "referencevideos": "videos",
    "audio": "audios",
    "audios": "audios",
    "referenceaudio": "audios",
    "referenceaudios": "audios",
}

# Mode metadata that describes the mode rather than overriding api_config.
_MODE_METADATA_KEYS = {"id", "when", "label", "notice", "description"}

_GROK_IMAGE_2_MODEL = "grok-imagine-image-2"
_GROK_IMAGE_2_SEGMENT_MAP_MODEL = "grok-imagine-image-2/segment-map"
_GROK_IMAGE_2_OPERATIONS = {
    "text-to-image": "grok-imagine-image-2-0/text-to-image",
    "image-edit": "grok-imagine-image-2-0/image-edit",
    "segment-map": "grok-imagine-image-2-0/segment-map",
}


def normalize_reference_url_list(value: Any) -> list[str]:
    """Flatten any reference input shape into a list of non-empty URL strings."""
    if value is None:
        return []

    raw_items = value if isinstance(value, list) else [value]
    urls: list[str] = []
    for item in raw_items:
        if isinstance(item, str):
            cleaned = item.strip()
            if cleaned:
                urls.append(cleaned)
            continue
        if isinstance(item, dict):
            candidate = (
                item.get("url")
                or item.get("video_url")
                or item.get("videoUrl")
                or item.get("image_url")
                or item.get("audio_url")
            )
            if isinstance(candidate, str) and candidate.strip():
                urls.append(candidate.strip())
    return urls


def count_reference_inputs(
    *,
    reference_image_urls: Any = None,
    reference_video_urls: Any = None,
    reference_audio_urls: Any = None,
) -> dict[str, int]:
    """Count the attached references that mode predicates are evaluated against."""
    return {
        "images": len(normalize_reference_url_list(reference_image_urls)),
        "videos": len(normalize_reference_url_list(reference_video_urls)),
        "audios": len(normalize_reference_url_list(reference_audio_urls)),
    }


def _mode_predicate_matches(when: Any, counts: dict[str, int]) -> bool:
    """Evaluate a mode's `when` predicate. All declared bounds are AND-ed.

    An absent/empty predicate is an unconditional match (catch-all). An
    unparseable predicate fails closed — the mode is skipped and a warning is
    logged, so a typo in catalog JSON degrades to the base config instead of
    silently sending the wrong payload shape.
    """
    if when is None:
        return True
    if not isinstance(when, dict):
        logger.warning("kie_ai_mode_predicate_invalid", predicate_type=type(when).__name__)
        return False

    for raw_key, raw_value in when.items():
        key = re.sub(r"[^a-z0-9]", "", str(raw_key).lower())
        if key.startswith("min"):
            bound, raw_subject = "min", key[3:]
        elif key.startswith("max"):
            bound, raw_subject = "max", key[3:]
        else:
            logger.warning("kie_ai_mode_predicate_unknown_key", key=str(raw_key))
            return False

        subject = _MODE_PREDICATE_SUBJECTS.get(raw_subject)
        if subject is None:
            logger.warning("kie_ai_mode_predicate_unknown_subject", key=str(raw_key))
            return False

        try:
            threshold = int(raw_value)
        except (TypeError, ValueError):
            logger.warning("kie_ai_mode_predicate_invalid_value", key=str(raw_key), value=str(raw_value))
            return False

        actual = counts.get(subject, 0)
        if bound == "min" and actual < threshold:
            return False
        if bound == "max" and actual > threshold:
            return False

    return True


def resolve_mode_api_config(
    api_config: dict[str, Any] | None,
    counts: dict[str, int],
) -> tuple[dict[str, Any] | None, str | None]:
    """Layer the first matching `apiConfig.modes` entry over the base config.

    Returns ``(merged_api_config, matched_mode_id)``. ``matched_mode_id`` is
    None when the row declares no modes or none matched, in which case the
    caller must fall back to its legacy resolution path.
    """
    if not isinstance(api_config, dict):
        return api_config, None

    raw_modes = api_config.get("modes")
    if raw_modes is None:
        raw_modes = api_config.get("apiModes")
    if not isinstance(raw_modes, list) or not raw_modes:
        return api_config, None

    base = {key: value for key, value in api_config.items() if key not in {"modes", "apiModes"}}

    for index, mode in enumerate(raw_modes):
        if not isinstance(mode, dict):
            logger.warning("kie_ai_mode_entry_invalid", index=index, entry_type=type(mode).__name__)
            continue
        if not _mode_predicate_matches(mode.get("when"), counts):
            continue

        merged = dict(base)
        for key, value in mode.items():
            if key in _MODE_METADATA_KEYS:
                continue
            merged[key] = value

        mode_id = str(mode.get("id") or f"mode_{index}")
        logger.info(
            "kie_ai_mode_selected",
            mode=mode_id,
            reference_images=counts.get("images", 0),
            reference_videos=counts.get("videos", 0),
            reference_audios=counts.get("audios", 0),
        )
        return merged, mode_id

    logger.info(
        "kie_ai_mode_fell_through_to_base",
        reference_images=counts.get("images", 0),
        reference_videos=counts.get("videos", 0),
        reference_audios=counts.get("audios", 0),
    )
    return base, None


def resolve_generation_api_config(
    model: str,
    api_config: dict[str, Any] | None,
    *,
    media_type: str,
    reference_image_urls: Any = None,
    reference_video_urls: Any = None,
    reference_audio_urls: Any = None,
) -> tuple[dict[str, Any] | None, str, str | None]:
    """Single entry point for "which endpoint and which payload shape".

    Mode routing takes precedence; when no mode matches, image requests fall
    back to the legacy two-way `kie_model_id_with_references` switch and video
    requests to plain `resolve_api_model`, which is exactly today's behavior.

    Returns ``(effective_api_config, api_model, matched_mode_id)``.
    """
    counts = count_reference_inputs(
        reference_image_urls=reference_image_urls,
        reference_video_urls=reference_video_urls,
        reference_audio_urls=reference_audio_urls,
    )
    merged, mode_id = resolve_mode_api_config(api_config, counts)

    if mode_id is not None:
        return merged, resolve_api_model(model, merged), mode_id

    if media_type == "image":
        return merged, resolve_image_api_model(model, merged, reference_image_urls), None

    return merged, resolve_api_model(model, merged), None


def resolve_grok_image_2_operation(
    model: str,
    api_config: dict[str, Any] | None,
    extra_params: dict[str, Any] | None,
) -> tuple[dict[str, Any] | None, str, str | None]:
    """Resolve Grok Image 2's logical operation to its Kie model endpoint.

    The catalog exposes text-to-image and image-edit as one user-facing model,
    while Segment Map has its own catalog row. The Node server authorizes and
    resolves the source task before this function runs; this function only
    selects the provider endpoint and removes fields rejected by that endpoint.
    """
    normalized_model = str(model or "").strip().lower()
    if normalized_model not in {_GROK_IMAGE_2_MODEL, _GROK_IMAGE_2_SEGMENT_MAP_MODEL}:
        return api_config, resolve_api_model(model, api_config), None

    raw_operation = None
    if isinstance(extra_params, dict):
        raw_operation = extra_params.get("grokOperation") or extra_params.get("grok_operation")
    operation = str(raw_operation or "").strip().lower()
    if normalized_model == _GROK_IMAGE_2_SEGMENT_MAP_MODEL:
        operation = "segment-map"
    elif operation not in {"text-to-image", "image-edit"}:
        operation = "text-to-image"

    merged = dict(api_config or {})
    configured_operations = merged.get("operations")
    configured = configured_operations.get(operation) if isinstance(configured_operations, dict) else None
    if isinstance(configured, dict):
        merged.update(configured)
    merged["kie_model_id"] = _GROK_IMAGE_2_OPERATIONS[operation]

    drop_params = set(_get_api_config_str_list(merged, "drop_params", "dropParams"))
    drop_params.update({"sourceMediaTaskId", "source_media_task_id", "grokOperation", "grok_operation"})
    if operation == "segment-map":
        drop_params.update({"prompt", "aspect_ratio", "resolution", "output_format"})
    elif operation == "image-edit":
        drop_params.update({"aspect_ratio", "resolution", "output_format"})
    if drop_params:
        merged["drop_params"] = sorted(drop_params)

    return merged, _GROK_IMAGE_2_OPERATIONS[operation], operation


def _apply_mode_drop_params(input_params: dict[str, Any], api_config: dict[str, Any] | None) -> None:
    """Strip payload keys the selected mode's endpoint does not accept.

    `omit_aspect_ratio` / `omit_duration` only suppress the builder's own
    defaults and run BEFORE `extra_params` is merged, so a catalog `inputFields`
    entry can put the key back. `drop_params` runs last and is the only way to
    guarantee a key never reaches a mode-specific endpoint — minimax-h3's
    image-to-video rejects `aspect_ratio` outright.
    """
    dropped: list[str] = []
    for key in _get_api_config_str_list(api_config, "drop_params", "dropParams"):
        if key in input_params:
            input_params.pop(key, None)
            dropped.append(key)

    if dropped:
        logger.info("kie_ai_mode_dropped_params", fields=dropped)


def _is_4k_resolution(value: Any) -> bool:
    if value is None:
        return False
    normalized = str(value).strip().lower().replace(" ", "")
    return normalized in {"4k", "2160p", "uhd", "ultrahd"}


def _is_success_code(value: Any) -> bool:
    if value in (0, 200):
        return True
    if isinstance(value, str) and value.strip() in {"0", "200"}:
        return True
    return False


def _extract_kie_data_or_drift(response: dict[str, Any], *, operation: str) -> dict[str, Any]:
    if not isinstance(response, dict):
        raise Exception(f"Kie.ai provider_contract_drift: {operation} returned non-object response")

    code = response.get("code")
    has_success_code = _is_success_code(code) or code is None
    data = response.get("data")
    if has_success_code and isinstance(data, dict):
        return data

    message = response.get("message") or response.get("msg") or response.get("error") or "unexpected response shape"
    raise Exception(f"Kie.ai provider_contract_drift: {operation} failed closed ({message})")


def _is_veo_endpoint(endpoint: str | None) -> bool:
    return bool(endpoint and "veo" in str(endpoint).strip().lower())


def _is_veo_extend_endpoint(endpoint: str | None) -> bool:
    normalized = str(endpoint or "").strip().lower()
    return "veo/extend" in normalized


def _is_veo_extend_request(
    api_endpoint: str | None,
    api_config: dict[str, Any] | None,
    input_params: dict[str, Any] | None = None,
) -> bool:
    generate_type = _get_api_config_value(
        api_config,
        "generate_type",
        "generateType",
        "operation",
        "task_type",
        "taskType",
    )
    payload_format = _get_api_config_value(
        api_config,
        "payload_format",
        "payloadFormat",
        "apiPayloadFormat",
    )
    normalized_generate_type = str(generate_type or "").strip().lower().replace("_", "-")
    normalized_payload_format = str(payload_format or "").strip().lower().replace("_", "-")
    if _is_veo_extend_endpoint(api_endpoint):
        return True
    if normalized_generate_type in {"video-extend", "veo-extend", "extend-video"}:
        return True
    if normalized_payload_format in {"veo-extend", "veo3-extend"}:
        return True
    if isinstance(input_params, dict):
        input_generate_type = str(
            input_params.get("generateType")
            or input_params.get("generationType")
            or ""
        ).strip().lower().replace("_", "-")
        return input_generate_type in {"video-extend", "veo-extend", "extend-video"}
    return False


def _pop_first_non_empty(input_params: dict[str, Any], keys: tuple[str, ...]) -> Any | None:
    for key in keys:
        value = input_params.pop(key, None)
        if value is None:
            continue
        if isinstance(value, str):
            value = value.strip()
        if value != "":
            return value
    return None


def _resolve_veo_extend_model(api_model: str | None, api_config: dict[str, Any] | None) -> str:
    configured = _get_api_config_value(
        api_config,
        "extend_model",
        "extendModel",
        "veo_extend_model",
        "veoExtendModel",
    )
    if configured:
        return configured

    normalized = str(api_model or "").strip().lower()
    if "fast" in normalized:
        return "fast"
    # Kie's Veo extension endpoint documents `model: "fast"` for Veo 3.1 extension.
    return "fast"


def _build_veo_extend_payload(
    *,
    prompt: str,
    input_params: dict[str, Any],
    api_model: str | None,
    api_config: dict[str, Any] | None,
    callback_url: str | None,
) -> dict[str, Any]:
    task_id = _pop_first_non_empty(input_params, (
        "taskId",
        "task_id",
        "sourceTaskId",
        "source_task_id",
        "providerTaskId",
        "provider_task_id",
        "kieTaskId",
        "kie_task_id",
    ))
    if not task_id:
        raise ValueError(
            "Veo 3.1 Extend requires the original Kie taskId. "
            "A video URL alone cannot be extended by Kie.ai's /veo/extend endpoint."
        )

    seeds = _pop_first_non_empty(input_params, ("seeds", "seed"))
    watermark = _pop_first_non_empty(input_params, ("watermark",))

    payload: dict[str, Any] = {
        "taskId": str(task_id),
        "prompt": prompt,
        "model": _resolve_veo_extend_model(api_model, api_config),
    }
    if seeds is not None:
        payload["seeds"] = seeds
    if watermark is not None:
        payload["watermark"] = watermark
    if callback_url:
        payload["callBackUrl"] = callback_url
    return payload


def _normalize_veo_aspect_ratio_for_payload(value: Any, generation_type: Any = None) -> str | None:
    """Normalize SmartSpec's internal Veo aspect ratio values to Kie.ai's API enum."""
    if value is None:
        return None

    cleaned = str(value).strip()
    if not cleaned:
        return None

    if cleaned.lower() == "auto":
        if str(generation_type or "").strip() == "REFERENCE_2_VIDEO":
            return "16:9"
        return "Auto"

    if cleaned in {"16:9", "9:16"}:
        return cleaned

    return cleaned


def _normalize_veo_generation_payload(input_params: dict[str, Any]) -> None:
    """Apply Veo-specific payload normalization in-place before submitting to Kie.ai."""
    generation_type = input_params.get("generationType")
    raw_aspect_ratio = input_params.get("aspect_ratio")

    if raw_aspect_ratio is None and input_params.get("aspectRatio") is not None:
        raw_aspect_ratio = input_params.get("aspectRatio")

    input_params.pop("aspectRatio", None)
    normalized_aspect_ratio = _normalize_veo_aspect_ratio_for_payload(raw_aspect_ratio, generation_type)
    if normalized_aspect_ratio:
        input_params["aspect_ratio"] = normalized_aspect_ratio
    else:
        input_params.pop("aspect_ratio", None)

    if str(generation_type or "").strip() == "TEXT_2_VIDEO":
        input_params.pop("imageUrls", None)
        input_params.pop("image_urls", None)
        return

    image_urls = input_params.pop("image_urls", None)
    if input_params.get("imageUrls") is None and image_urls is not None:
        input_params["imageUrls"] = image_urls
    if isinstance(input_params.get("imageUrls"), str):
        image_url = str(input_params["imageUrls"]).strip()
        if image_url:
            input_params["imageUrls"] = [image_url]
        else:
            input_params.pop("imageUrls", None)


def resolve_api_model(model: str, api_config: dict[str, Any] | None = None) -> str:
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


def resolve_image_api_model(
    model: str,
    api_config: dict[str, Any] | None = None,
    reference_image_urls: Any = None,
) -> str:
    """Resolve an opt-in image model variant from attached reference images."""
    default_model = resolve_api_model(model, api_config)
    if not isinstance(reference_image_urls, list) or not reference_image_urls:
        return default_model

    return _get_api_config_value(
        api_config,
        "kie_model_id_with_references",
        "kieModelIdWithReferences",
    ) or default_model


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
    def normalize_base_url(cls, base_url: str | None) -> str:
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
        # httpx keeps async synchronization primitives in its transport. A
        # provider instance can outlive the event loop that first used it
        # (notably when shared between FastAPI and Celery), so never reuse the
        # client across event loops.
        self._client_loop: asyncio.AbstractEventLoop | None = None

        if raw_base_url and self.base_url != str(raw_base_url).rstrip("/"):
            logger.warning(
                "kie_ai_base_url_normalized",
                raw_base_url=raw_base_url,
                normalized_base_url=self.base_url,
            )

        if callback_url:
            logger.info("kie_ai_callback_configured", callback_url=callback_url)

    def _get_client_for_current_loop(self) -> httpx.AsyncClient:
        """Return a client owned by the currently running event loop."""
        current_loop = asyncio.get_running_loop()
        if self._client_loop is None or self._client_loop is current_loop:
            self._client_loop = current_loop
            return self.client

        # Do not await the old client's close here: it belongs to another loop
        # and may already be closed. Its transport will be reclaimed normally;
        # the important invariant is that a client is never used cross-loop.
        self.client = httpx.AsyncClient(timeout=600.0)
        self._client_loop = current_loop
        logger.info("kie_ai_http_client_recreated_for_event_loop")
        return self.client

    @staticmethod
    def _extract_task_id(result: dict[str, Any], *, include_record_id: bool = False) -> str | None:
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
    def _extract_submission_error_message(result: dict[str, Any]) -> str | None:
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
    def _is_retryable_submission_response(cls, result: dict[str, Any]) -> bool:
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
    ) -> tuple[dict[str, Any], str]:
        """Submit a task request and retry transient JSON-level provider errors."""
        last_result: dict[str, Any] | None = None

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

    async def _make_request(self, method: str, endpoint: str, data: dict | None = None) -> dict:
        """Make HTTP request to Kie.ai API"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        # Model catalog entries historically stored both `/jobs/...` and
        # `/api/v1/jobs/...`.  Normalize at the final request boundary too so
        # a stale/custom catalog row can never produce `/api/v1/api/v1/...`.
        relative_endpoint = _clean_endpoint(endpoint)
        url = f"{self.base_url}/{relative_endpoint}"

        logger.info("kie_ai_request", method=method, url=url)

        try:
            client = self._get_client_for_current_loop()
            if method == "POST":
                response = await client.post(url, headers=headers, json=data)
            elif method == "GET":
                response = await client.get(url, headers=headers, params=data)
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
        input_params: dict,
        callback_url: str | None = None
    ) -> dict:
        """
        Create a generation task via Kie.ai createTask endpoint.

        Args:
            model: Kie.ai model identifier (e.g. 'nano-banana-pro')
            input_params: Model-specific input parameters
            callback_url: Optional webhook URL for task completion notification

        Returns:
            Task creation response with taskId
        """
        norm_params = _normalize_ref_urls_for_model(model, input_params)
        payload = {
            "model": model,
            "input": norm_params
        }

        if callback_url:
            payload["callBackUrl"] = callback_url

        logger.info("kie_ai_create_task", model=model, input_keys=list(norm_params.keys()))
        return await self._make_request("POST", "jobs/createTask", data=payload)

    async def create_omni_character_asset(
        self,
        *,
        character_name: str,
        description: str,
        image_urls: list[str],
        audio_ids: list[str] | None = None,
        client_request_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a reusable Gemini Omni Character asset.

        This is provider asset creation, not a video media task.
        """
        payload: dict[str, Any] = {
            "model": "gemini-omni-character",
            "input": {
                "character_name": character_name,
                "description": description,
                "image_urls": image_urls[:1],
            },
        }
        if audio_ids:
            payload["input"]["audio_ids"] = audio_ids
        if client_request_id:
            payload["clientRequestId"] = client_request_id

        response = await self._make_request("POST", "omni/character/create", data=payload)
        data = _extract_kie_data_or_drift(response, operation="gemini_omni_character_create")
        character_id = data.get("characterId")
        if not isinstance(character_id, str) or not character_id.strip():
            raise Exception("Kie.ai provider_contract_drift: missing data.characterId")
        return {
            "provider": "kie.ai",
            "capability": "gemini_omni_character",
            "assetType": "character",
            "providerAssetId": character_id.strip(),
            "displayName": data.get("characterName") or character_name,
            "contractVersion": "1.0.0",
            "raw": {
                "characterName": data.get("characterName"),
                "imageUrl": data.get("imageUrl"),
            },
        }

    async def create_omni_audio_asset(
        self,
        *,
        display_name: str,
        voice_description: str | None = None,
        example_dialogue: str | None = None,
        audio_id: str | None = None,
        client_request_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a reusable Gemini Omni Audio asset."""
        input_payload: dict[str, Any] = {"display_name": display_name}
        if voice_description:
            input_payload["voice_description"] = voice_description
        if example_dialogue:
            input_payload["example_dialogue"] = example_dialogue
        if audio_id:
            input_payload["audio_id"] = audio_id

        payload: dict[str, Any] = {
            "model": "gemini-omni-audio",
            "input": input_payload,
        }
        if client_request_id:
            payload["clientRequestId"] = client_request_id

        response = await self._make_request("POST", "omni/audio/create", data=payload)
        data = _extract_kie_data_or_drift(response, operation="gemini_omni_audio_create")
        kie_audio_id = data.get("kieAudioId")
        if not isinstance(kie_audio_id, str) or not kie_audio_id.strip():
            raise Exception("Kie.ai provider_contract_drift: missing data.kieAudioId")
        return {
            "provider": "kie.ai",
            "capability": "gemini_omni_audio",
            "assetType": "audio",
            "providerAssetId": kie_audio_id.strip(),
            "displayName": data.get("displayName") or display_name,
            "contractVersion": "1.0.0",
            "raw": {
                "kieAudioId": kie_audio_id.strip(),
                "displayName": data.get("displayName"),
            },
        }

    async def submit_veo_4k_upgrade(
        self,
        task_id: str,
        *,
        index: int = 0,
        callback_url: str | None = None,
        api_config: dict[str, Any] | None = None,
    ) -> tuple[dict[str, Any], str]:
        """Submit Kie Veo 4K post-processing for an already completed Veo task."""
        endpoint = _get_api_config_value(
            api_config,
            "veo_4k_endpoint",
            "veo4kEndpoint",
            "veo4KEndpoint",
            "veo4kUpgradeEndpoint",
            "veo4KUpgradeEndpoint",
        ) or "/api/v1/veo/get-4k-video"

        payload: dict[str, Any] = {
            "taskId": task_id,
            "index": max(0, int(index)),
        }
        effective_callback_url = callback_url if callback_url is not None else self.callback_url
        if effective_callback_url:
            payload["callBackUrl"] = effective_callback_url

        result, upgrade_task_id = await self._submit_generation_task(
            lambda: self._make_request("POST", _clean_endpoint(endpoint), data=payload),
            operation="veo_4k_upgrade",
        )
        logger.info(
            "kie_ai_veo_4k_upgrade_submitted",
            source_task_id=task_id,
            upgrade_task_id=upgrade_task_id,
            index=index,
            has_callback=bool(effective_callback_url),
        )
        return result, upgrade_task_id

    async def get_task_status(
        self,
        task_id: str,
        preferred_status_endpoint: str | None = None,
        extra_status_endpoints: list[str] | None = None,
    ) -> dict:
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
        def _normalize_status_endpoint(raw_endpoint: str) -> str | None:
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

        def _has_useful_data(resp: dict) -> bool:
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

        last_response: dict | None = None
        last_error: Exception | None = None

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

    async def wait_for_task(self, task_id: str, poll_interval: float = 2.0, max_wait: float = 300.0) -> dict:
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
            elif task_state in ["pending", "processing", "running", "created", "waiting", ""]:
                await asyncio.sleep(poll_interval)
                elapsed += poll_interval
            else:
                logger.warning(
                    "kie_ai_unknown_state",
                    task_id=task_id,
                    state=task_state,
                    response_keys=sorted(status_response.keys()),
                    data_keys=sorted(nested.keys()),
                )
                await asyncio.sleep(poll_interval)
                elapsed += poll_interval

        raise TimeoutError(f"Task {task_id} did not complete within {max_wait} seconds")

    def _normalize_response(self, task_id: str, kie_response: dict) -> dict:
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
                    for _key, value in output.items():
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

    async def generate_image(self, model: str, prompt: str, **kwargs) -> dict:
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
        wait_for_completion = kwargs.pop("wait_for_completion", True)

        # Determine API model name and payload shape. Reference-driven variants
        # are opt-in through catalog metadata, so unrelated Kie models keep their
        # current behavior.
        reference_image_urls = kwargs.get("reference_image_urls")
        api_config, api_model, active_mode_id = resolve_generation_api_config(
            model,
            api_config,
            media_type="image",
            reference_image_urls=reference_image_urls,
        )
        api_config, api_model, grok_operation = resolve_grok_image_2_operation(
            model,
            api_config,
            extra_params if isinstance(extra_params, dict) else None,
        )
        if grok_operation:
            active_mode_id = grok_operation

        # Build input parameters for image generation
        input_params = {
            "prompt": prompt,
            "aspect_ratio": kwargs.get("aspect_ratio", "auto" if api_model == NANO_BANANA_2_LITE_API_MODEL else "1:1"),
            "resolution": kwargs.get("resolution", "1K"),
            "output_format": kwargs.get("output_format", "png")
        }
        if api_model == NANO_BANANA_2_LITE_API_MODEL:
            if "resolution" not in kwargs:
                input_params.pop("resolution", None)
            if "output_format" not in kwargs:
                input_params.pop("output_format", None)

        # Add optional parameters if provided
        if kwargs.get("negative_prompt"):
            input_params["negative_prompt"] = kwargs["negative_prompt"]
        if kwargs.get("seed"):
            input_params["seed"] = kwargs["seed"]
        if kwargs.get("num_images"):
            input_params["num_images"] = kwargs["num_images"]

        # Merge extra_params from configJson-based dynamic fields
        for key, value in _iter_provider_extra_params(extra_params):
            input_params[key] = value

        if grok_operation in {"image-edit", "segment-map"}:
            task_id = str(input_params.get("task_id") or "").strip()
            if not task_id:
                raise ValueError(f"Grok Image 2 {grok_operation} requires task_id")
            input_params["task_id"] = task_id
        if grok_operation == "image-edit" and not str(prompt or "").strip():
            raise ValueError("Grok Image 2 image-edit requires a prompt")
        if "mask_indexs" in input_params:
            raw_masks = input_params.get("mask_indexs")
            if not isinstance(raw_masks, list):
                raise ValueError("mask_indexs must be an array")
            normalized_masks: list[int] = []
            for raw_mask in raw_masks:
                candidate = raw_mask.get("value") if isinstance(raw_mask, dict) else raw_mask
                if isinstance(candidate, bool):
                    raise ValueError("mask_indexs must contain integer indexes")
                try:
                    parsed_mask = int(candidate)
                except (TypeError, ValueError):
                    raise ValueError("mask_indexs must contain integer indexes") from None
                if parsed_mask < 0 or parsed_mask > 64:
                    raise ValueError("mask_indexs values must be between 0 and 64")
                normalized_masks.append(parsed_mask)
            input_params["mask_indexs"] = normalized_masks

        # Add reference images for style transfer / img2img
        # The target field is driven by model config metadata passed through api_config.
        if reference_image_urls:
            ref_urls = reference_image_urls
            if isinstance(ref_urls, list) and len(ref_urls) > 0:
                reference_image_input_key, reference_image_input_type = _resolve_reference_image_input_config(
                    api_config,
                    default_key=_default_reference_image_key_for_model(api_model),
                )
                _apply_reference_urls_to_input(
                    input_params,
                    ref_urls,
                    key=reference_image_input_key,
                    input_type=reference_image_input_type,
                    overflow_keys=_resolve_reference_overflow_keys(api_config, subject="image"),
                )
                logger.info(
                    "kie_ai_reference_images",
                    count=len(ref_urls),
                    field_key=reference_image_input_key,
                    field_type=reference_image_input_type,
                    urls=[_redact_url_for_log(url) for url in ref_urls[:2]],
                )  # Log first 2 for debug

        # Add reference style URL if provided
        if kwargs.get("reference_style_url"):
            input_params["style_reference"] = kwargs["reference_style_url"]
            logger.info("kie_ai_style_reference", has_style_reference=True)

        # Last write wins: strip anything the selected mode's endpoint rejects.
        _apply_mode_drop_params(input_params, api_config)

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
                    mode=active_mode_id,
                    has_callback=bool(callback_url),
                    has_api_config=bool(api_config),
                    callback_url=callback_url[:50] if callback_url else None)

        # Determine endpoint — use api_config endpoint or default to create_task
        api_endpoint = _get_api_config_value(api_config, "endpoint", "api_endpoint", "apiEndpoint")

        async def submit_request() -> dict[str, Any]:
            norm_input_params = _normalize_ref_urls_for_model(api_model, input_params)
            clean_ep = _clean_endpoint(api_endpoint)
            if clean_ep != "jobs/createTask":
                payload = {"prompt": prompt, **norm_input_params}
                if api_model:
                    payload["model"] = api_model
                if callback_url:
                    payload["callBackUrl"] = callback_url
                return await self._make_request("POST", clean_ep, data=payload)
            return await self.create_task(api_model, norm_input_params, callback_url)

        result, task_id = await self._submit_generation_task(
            submit_request,
            operation="image",
        )

        logger.info(
            "kie_ai_task_created",
            task_id=task_id,
            has_callback=bool(callback_url),
            response_keys=sorted(result.keys()) if isinstance(result, dict) else [],
        )

        # Synchronous callers retain blocking polling. Async workers persist the
        # provider task ID and hand completion polling to a short Celery task.
        if not callback_url and wait_for_completion:
            logger.info("kie_ai_polling_mode", task_id=task_id)
            return await self.wait_for_task(task_id)

        logger.info(
            "kie_ai_async_mode",
            task_id=task_id,
            callback_enabled=bool(callback_url),
        )
        return {
            "id": task_id,
            "status": "processing",
            "data": [],
            "created": int(time.time()),
            "message": "Task created and queued for completion tracking.",
        }

    async def generate_video(self, model: str, prompt: str, **kwargs) -> dict:
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

        # Reference URLs are collected up front because `apiConfig.modes` selects
        # the endpoint AND the payload shape from how many of each are attached.
        ref_video_urls = normalize_reference_url_list(kwargs.get("reference_video_urls")) + \
            normalize_reference_url_list(kwargs.get("reference_video_url"))
        ref_audio_urls = normalize_reference_url_list(kwargs.get("reference_audio_urls")) + \
            normalize_reference_url_list(kwargs.get("reference_audio_url"))
        if not ref_audio_urls:
            # There is no studio-level "attach reference audio" channel yet, so
            # audio arrives as a catalog `audio_urls` inputField in extra_params.
            # Mode selection has to see it or an audio-only request would route
            # to text-to-video and then have the audio key merged in anyway.
            ref_audio_urls = normalize_reference_url_list(
                _first_extra_param(extra_params, "reference_audio_urls", "audio_urls")
            )

        # Determine API model name, payload shape and endpoint
        api_config, api_model, active_mode_id = resolve_generation_api_config(
            model,
            api_config,
            media_type="video",
            reference_image_urls=kwargs.get("reference_image_urls"),
            reference_video_urls=ref_video_urls,
            reference_audio_urls=ref_audio_urls,
        )
        api_endpoint = _get_api_config_value(api_config, "endpoint", "api_endpoint", "apiEndpoint")
        requested_resolution = kwargs.get("resolution")
        requires_veo_4k_postprocess = _is_4k_resolution(requested_resolution) and _is_veo_endpoint(api_endpoint)

        input_params = {
            "prompt": prompt,
            "duration": kwargs.get("duration", 5),
            "aspect_ratio": kwargs.get("aspect_ratio", "16:9")
        }
        if _get_api_config_bool(api_config, "omit_duration", "omitDuration"):
            input_params.pop("duration", None)
        if _get_api_config_bool(api_config, "omit_aspect_ratio", "omitAspectRatio"):
            input_params.pop("aspect_ratio", None)

        if kwargs.get("resolution") and not requires_veo_4k_postprocess:
            input_params["resolution"] = kwargs["resolution"]
        if kwargs.get("fps"):
            input_params["fps"] = kwargs["fps"]

        # Merge extra_params from configJson-based dynamic fields
        for key, value in _iter_provider_extra_params(extra_params):
            if requires_veo_4k_postprocess and str(key) == "resolution":
                continue
            input_params[key] = value

        is_veo_generation_request = (
            _is_veo_endpoint(api_endpoint)
            and not _is_veo_extend_request(api_endpoint, api_config, input_params)
        )

        if is_veo_generation_request:
            _normalize_veo_generation_payload(input_params)

        # Add reference images if provided
        if kwargs.get("reference_image_urls"):
            ref_urls = kwargs["reference_image_urls"]
            if isinstance(ref_urls, list) and len(ref_urls) > 0:
                reference_image_input_key, reference_image_input_type = _resolve_reference_image_input_config(
                    api_config,
                    default_key="imageUrls" if is_veo_generation_request else "image_urls",
                )
                _apply_reference_urls_to_input(
                    input_params,
                    ref_urls,
                    key=reference_image_input_key,
                    input_type=reference_image_input_type,
                    overflow_keys=_resolve_reference_overflow_keys(api_config, subject="image"),
                )

        if is_veo_generation_request:
            _normalize_veo_generation_payload(input_params)

        if ref_video_urls:
            reference_video_input_key, reference_video_input_type = _resolve_reference_video_input_config(
                api_config,
                default_key="video_urls",
            )
            _apply_reference_urls_to_input(
                input_params,
                ref_video_urls,
                key=reference_video_input_key,
                input_type=reference_video_input_type,
                overflow_keys=_resolve_reference_overflow_keys(api_config, subject="video"),
            )

        if ref_audio_urls:
            reference_audio_input_key, reference_audio_input_type = _resolve_reference_audio_input_config(
                api_config,
                default_key="audio_urls",
            )
            _apply_reference_urls_to_input(
                input_params,
                ref_audio_urls,
                key=reference_audio_input_key,
                input_type=reference_audio_input_type,
                overflow_keys=_resolve_reference_overflow_keys(api_config, subject="audio"),
            )

        reference_video_input_key, reference_video_input_type = _resolve_reference_video_input_config(
            api_config,
            default_key="video_urls",
        )
        existing_video_value = input_params.get(reference_video_input_key)
        if reference_video_input_type == "object_array":
            normalized_video_list = _normalize_reference_video_object_list(existing_video_value)
            if normalized_video_list:
                input_params[reference_video_input_key] = normalized_video_list
            else:
                input_params.pop(reference_video_input_key, None)
        elif reference_video_input_type == "url" and isinstance(existing_video_value, list):
            first_video = next(
                (str(url).strip() for url in existing_video_value if isinstance(url, str) and str(url).strip()),
                None,
            )
            if first_video:
                input_params[reference_video_input_key] = first_video
            else:
                input_params.pop(reference_video_input_key, None)

        # Last write wins: strip anything the selected mode's endpoint rejects
        # (minimax-h3/image-to-video has no `aspect_ratio` parameter at all).
        _apply_mode_drop_params(input_params, api_config)

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

        async def submit_request() -> dict[str, Any]:
            norm_input_params = _normalize_ref_urls_for_model(api_model, input_params)
            clean_ep = _clean_endpoint(api_endpoint)
            if clean_ep != DEFAULT_CREATE_TASK_ENDPOINT:
                if _is_veo_extend_request(api_endpoint, api_config, input_params):
                    payload = _build_veo_extend_payload(
                        prompt=prompt,
                        input_params=input_params,
                        api_model=api_model,
                        api_config=api_config,
                        callback_url=callback_url,
                    )
                else:
                    payload = {"prompt": prompt, **norm_input_params}
                    if api_model:
                        payload["model"] = api_model
                    if callback_url:
                        payload["callBackUrl"] = callback_url
                response = await self._make_request("POST", clean_ep, data=payload)
                logger.info("kie_ai_custom_endpoint_response", endpoint=api_endpoint, result_keys=list(response.keys()) if isinstance(response, dict) else "not_dict", result_type=type(response).__name__)

                if "veo" in str(api_endpoint).lower():
                    import json as _json
                    logger.warning("VEO_RESPONSE_DEBUG", endpoint=api_endpoint, full_response=_json.dumps(response, indent=2, default=str))
                return response
            return await self.create_task(api_model, norm_input_params, callback_url)

        result, task_id = await self._submit_generation_task(
            submit_request,
            operation="video",
            include_record_id=True,
        )

        logger.info("kie_ai_video_task_id_extracted", task_id=task_id, model=api_model, mode=active_mode_id, has_callback=bool(callback_url), will_poll=bool(wait_for_completion and not callback_url and task_id), wait_for_completion=bool(wait_for_completion), result_structure={
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
            initial_result = await self.wait_for_task(task_id, poll_interval=5.0, max_wait=1200.0)
            if requires_veo_4k_postprocess:
                upgrade_index = 0
                if isinstance(extra_params, dict):
                    raw_index = extra_params.get("index") or extra_params.get("outputIndex") or extra_params.get("veo4kIndex")
                    try:
                        upgrade_index = max(0, int(raw_index)) if raw_index is not None else 0
                    except (TypeError, ValueError):
                        upgrade_index = 0
                _, upgrade_task_id = await self.submit_veo_4k_upgrade(
                    task_id,
                    index=upgrade_index,
                    callback_url="",
                    api_config=api_config,
                )
                upgrade_result = await self.wait_for_task(upgrade_task_id, poll_interval=5.0, max_wait=1200.0)
                upgrade_result["source_task_id"] = task_id
                upgrade_result["source_result"] = initial_result
                upgrade_result["actual_resolution"] = "4K"
                return upgrade_result
            return initial_result

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
            "message": "Video task created. Result will be delivered via callback URL.",
            **({"requested_resolution": "4K", "requires_veo_4k_postprocess": True} if requires_veo_4k_postprocess else {}),
        }

    async def generate_audio(self, model: str, text: str, **kwargs) -> dict:
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
        for key, value in _iter_provider_extra_params(extra_params):
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

        async def submit_request() -> dict[str, Any]:
            norm_input_params = _normalize_ref_urls_for_model(api_model, input_params)
            clean_ep = _clean_endpoint(api_endpoint)
            if clean_ep != "jobs/createTask":
                payload = dict(norm_input_params)
                if api_model:
                    payload["model"] = api_model
                if callback_url:
                    payload["callBackUrl"] = callback_url
                return await self._make_request("POST", clean_ep, data=payload)
            return await self.create_task(api_model, norm_input_params, callback_url)

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

    async def upload_reference_image(self, file_path: str) -> dict:
        """Upload a reference image for image-to-image generation"""
        headers = {"Authorization": f"Bearer {self.api_key}"}
        url = f"{self.base_url}/files/upload"

        with open(file_path, "rb") as f:
            files = {"file": (os.path.basename(file_path), f, "image/jpeg")}
            response = await self._get_client_for_current_loop().post(url, headers=headers, files=files)
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
