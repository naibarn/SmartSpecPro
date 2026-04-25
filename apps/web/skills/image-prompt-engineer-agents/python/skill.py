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

    for list_field in ("verified_reference_facts", "reference_sources", "panel_descriptions"):
        if list_field in normalized:
            normalized[list_field] = _lines_or_json_array(normalized[list_field])

    return {key: value for key, value in normalized.items() if key in allowed}


def main() -> int:
    envelope = json.loads(sys.stdin.read() or "{}")
    params: dict[str, Any] = _normalize_media_studio_params(dict(envelope.get("params") or {}))
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
