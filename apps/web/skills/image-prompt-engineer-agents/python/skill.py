#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "schemas" / "input.schema.json"
sys.path.insert(0, str(ROOT / "src"))

from gpt_image_prompt_engineer import run_skill


SUPPORTED_ASPECT_RATIOS = {
    "auto",
    "1:1",
    "4:5",
    "5:4",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "16:9",
    "9:16",
    "21:9",
    "9:21",
}

SUPPORTED_RENDER_SIZES = {
    "auto",
    "1024x1024",
    "1536x1024",
    "1024x1536",
}

SUPPORTED_IMAGE_STYLES = {
    "auto",
    "realistic",
    "portrait",
    "landscape",
    "cartoon",
    "anime_manga",
    "infographic",
    "slides_diagram",
    "product_ad",
    "product_mockup",
    "ui_mockup",
    "social_post",
    "document_replica",
    "concept_art",
    "3d_render",
    "flat_design",
    "minimal",
    "vintage",
    "editorial",
    "isometric",
    "line_art",
    "watercolor",
    "pixel_art",
    "fashion_lookbook",
    "cinematic",
    "architecture",
    "food_photography",
}

SUPPORTED_QUALITY_VALUES = {"auto", "low", "medium", "high"}


def _load_input_schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def _lines_or_json_array(value: Any) -> list[Any]:
    if value is None or isinstance(value, list):
        return value or []
    if not isinstance(value, str):
        return [value]
    text = value.strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = None
    if isinstance(parsed, list):
        return parsed
    if parsed is not None:
        return [parsed]
    return [line.strip() for line in text.splitlines() if line.strip()]


def _clean_string(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _normalize_ratio_text(value: Any) -> str:
    text = _clean_string(value).lower()
    if not text:
        return ""
    text = text.replace("×", "x")
    text = text.replace(" ", "")
    if ":" in text:
        left, _, right = text.partition(":")
        if left.isdigit() and right.isdigit():
            return f"{int(left)}:{int(right)}"
    return text


def _ratio_from_dimensions(value: Any) -> str:
    text = _clean_string(value).lower().replace("×", "x").replace(" ", "")
    if "x" not in text:
        return ""
    left, _, right = text.partition("x")
    if not left.isdigit() or not right.isdigit():
        return ""
    width = int(left)
    height = int(right)
    if width <= 0 or height <= 0:
        return ""

    known_ratios = {
        "1:1": 1 / 1,
        "4:5": 4 / 5,
        "5:4": 5 / 4,
        "2:3": 2 / 3,
        "3:2": 3 / 2,
        "3:4": 3 / 4,
        "4:3": 4 / 3,
        "16:9": 16 / 9,
        "9:16": 9 / 16,
        "21:9": 21 / 9,
        "9:21": 9 / 21,
    }
    actual = width / height
    return min(known_ratios, key=lambda ratio: abs(known_ratios[ratio] - actual))


def _normalize_render_size(value: Any) -> str:
    text = _clean_string(value).lower().replace("×", "x").replace(" ", "")
    return text if text in SUPPORTED_RENDER_SIZES else ""


def _normalize_common_media_params(common: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}

    ratio_candidates = [
        _normalize_ratio_text(common.get("aspect_ratio")),
        _normalize_ratio_text(common.get("aspectRatio")),
        _normalize_ratio_text(common.get("aspectRatioCustom")),
        _normalize_ratio_text(common.get("aspect_ratio_custom")),
    ]
    ratio = next((item for item in ratio_candidates if item and item != "auto"), "")
    if not ratio and "auto" in ratio_candidates:
        ratio = "auto"
    if ratio in SUPPORTED_ASPECT_RATIOS:
        normalized["aspect_ratio"] = ratio

    render_size_candidates = [
        _normalize_render_size(common.get("render_size")),
        _normalize_render_size(common.get("renderSize")),
        _normalize_render_size(common.get("size")),
        _normalize_render_size(common.get("image_size")),
        _normalize_render_size(common.get("resolution")),
    ]
    render_size = next((item for item in render_size_candidates if item and item != "auto"), "")
    if not render_size and "auto" in render_size_candidates:
        render_size = "auto"
    if render_size:
        normalized["render_size"] = render_size

    if "aspect_ratio" not in normalized:
        ratio_from_size = (
            _ratio_from_dimensions(common.get("resolution"))
            or _ratio_from_dimensions(common.get("size"))
            or _ratio_from_dimensions(common.get("image_size"))
        )
        if ratio_from_size:
            normalized["aspect_ratio"] = ratio_from_size

    quality = _clean_string(common.get("quality")).lower()
    if quality in SUPPORTED_QUALITY_VALUES:
        normalized["quality"] = quality

    style = _clean_string(common.get("style")) or _clean_string(common.get("imageStyle"))
    if style in SUPPORTED_IMAGE_STYLES:
        normalized["image_style"] = style
    if common.get("numImages") is not None and common.get("n") is None:
        normalized["n"] = common.get("numImages")

    references = common.get("source_image_path") or common.get("referenceImageUrls") or common.get("reference_image_urls")
    if references:
        normalized["source_image_path"] = references

    return normalized


def _merge_user_first(primary: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    merged = dict(primary)
    for key, value in fallback.items():
        current = merged.get(key)
        if current is None or current == "" or current == "auto":
            merged[key] = value
    return merged


def _normalize_media_studio_params(params: dict[str, Any]) -> dict[str, Any]:
    schema = _load_input_schema()
    properties = schema.get("properties") or {}
    allowed = set(properties)
    normalized = dict(params)

    prompt_language = str(normalized.get("promptLanguage") or "").strip()
    target_language_spec = properties.get("target_language") or {}
    target_language_values = set(target_language_spec.get("enum") or [])
    if "target_language" not in normalized and prompt_language in target_language_values:
        normalized["target_language"] = prompt_language

    language = str(normalized.get("language") or "").strip()
    if "target_language" not in normalized and language in target_language_values:
        normalized["target_language"] = language

    common_aliases = _normalize_common_media_params(normalized)
    normalized = _merge_user_first(normalized, common_aliases)

    for list_field in ("verified_reference_facts", "reference_sources", "panel_descriptions"):
        if list_field in normalized:
            normalized[list_field] = _lines_or_json_array(normalized[list_field])

    return {key: value for key, value in normalized.items() if key in allowed}


def main() -> int:
    envelope = json.loads(sys.stdin.read() or "{}")
    raw_params = dict(envelope.get("params") or {})
    context = envelope.get("context") if isinstance(envelope.get("context"), dict) else {}
    common_params = context.get("commonParams") if isinstance(context.get("commonParams"), dict) else {}
    params: dict[str, Any] = _normalize_media_studio_params(_merge_user_first(raw_params, dict(common_params)))
    prompt = str(envelope.get("prompt") or "").strip()

    if prompt and not str(params.get("topic") or "").strip():
        params["topic"] = prompt
    params.setdefault("response_mode", "text_prompt")
    params.setdefault("text_prompt_field", "detailed")

    result = run_skill(params)
    output = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2)
    print(json.dumps({"success": True, "output": output}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
