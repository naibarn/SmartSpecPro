from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = ROOT / "schemas"


def load_schema(name: str) -> dict[str, Any]:
    return json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))


def _fail(message: str) -> None:
    raise ValueError(message)


def validate_input(data: dict[str, Any]) -> dict[str, Any]:
    data = dict(data)
    source_images = data.get("source_image_path")
    if isinstance(source_images, list):
        paths = [str(item).strip() for item in source_images if str(item).strip()]
        if len(paths) > 5:
            _fail("source_image_path supports up to 5 reference images")
        data["source_image_path"] = paths or None
    elif source_images is not None:
        data["source_image_path"] = str(source_images).strip() or None

    mask_image = data.get("mask_image_path")
    if isinstance(mask_image, list):
        data["mask_image_path"] = next((str(item).strip() for item in mask_image if str(item).strip()), None)
    elif mask_image is not None:
        data["mask_image_path"] = str(mask_image).strip() or None

    schema = load_schema("input.schema.json")
    props = schema.get("properties", {})
    allowed = set(props)
    extra = set(data) - allowed
    if extra:
        _fail(f"Unexpected input field(s): {', '.join(sorted(extra))}")
    for key in schema.get("required", []):
        if key not in data:
            _fail(f"Missing required input field: {key}")
    topic = data.get("topic")
    if not isinstance(topic, str) or len(topic.strip()) < 3:
        _fail("topic must be a string with at least 3 characters")
    for key, value in data.items():
        spec = props.get(key, {})
        enum = spec.get("enum")
        if enum is not None and value not in enum:
            _fail(f"{key} must be one of: {', '.join(map(str, enum))}")
        if key in {"source_image_path", "mask_image_path"}:
            values = value if isinstance(value, list) else [value]
            for item in values:
                if item is not None and len(str(item)) > 1024:
                    _fail(f"{key} entries must be 1024 characters or fewer")
        if key == "verified_reference_facts":
            if not isinstance(value, list) or len(value) > 20:
                _fail("verified_reference_facts must be an array with at most 20 items")
            for item in value:
                if len(str(item)) > 500:
                    _fail("verified_reference_facts entries must be 500 characters or fewer")
        if key == "reference_sources":
            if not isinstance(value, list) or len(value) > 10:
                _fail("reference_sources must be an array with at most 10 items")
        if key == "return_variants" and not (1 <= int(value) <= 3):
            _fail("return_variants must be between 1 and 3")
        if key == "n" and not (1 <= int(value) <= 4):
            _fail("n must be between 1 and 4")
        if key == "output_compression" and value is not None and not (0 <= int(value) <= 100):
            _fail("output_compression must be between 0 and 100")
        if key == "quality_review_passes" and not (0 <= int(value) <= 3):
            _fail("quality_review_passes must be between 0 and 3")
    if data.get("mode") == "edit" and not data.get("source_image_path"):
        _fail("source_image_path is required when mode=edit")
    return data


def validate_output(data: dict[str, Any]) -> dict[str, Any]:
    required = load_schema("output.schema.json").get("required", [])
    for key in required:
        if key not in data:
            _fail(f"Missing required output field: {key}")
    if data.get("status") not in {"ok", "completed", "error"}:
        _fail("status must be ok, completed, or error")
    for key in ["requested", "normalized", "locked_user_params", "prompts", "prompt_quality", "safety_review", "render_request", "metadata", "orchestration", "merge_report", "final_quality_delta", "final_review", "reference_research"]:
        if not isinstance(data.get(key), dict):
            _fail(f"{key} must be an object")
    if not isinstance(data.get("decision_trace"), list):
        _fail("decision_trace must be an array")
    if not isinstance(data.get("warnings"), list):
        _fail("warnings must be an array")
    if not isinstance(data.get("subagent_reports"), list):
        _fail("subagent_reports must be an array")
    if not isinstance(data.get("conflict_resolution"), list):
        _fail("conflict_resolution must be an array")
    prompts = data["prompts"]
    for key in ["short", "detailed", "structured", "negative_constraints", "variants"]:
        if key not in prompts:
            _fail(f"prompts.{key} is required")
    if not isinstance(prompts["variants"], list) or not prompts["variants"]:
        _fail("prompts.variants must be a non-empty array")
    rr = data["render_request"]
    if not isinstance(rr.get("image_api"), dict) or not isinstance(rr.get("responses_tool"), dict):
        _fail("render_request must include image_api and responses_tool objects")
    return data
