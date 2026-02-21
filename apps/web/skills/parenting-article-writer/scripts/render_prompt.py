#!/usr/bin/env python3
"""Render a ready-to-use writing prompt from a Parenting Article Writer input JSON.

- Applies defaults from schemas/input.schema.json
- Produces: resolved_inputs + rendered_prompt
- Dependency-free (standard library only)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def deep_apply_defaults(value: Any, schema: Dict[str, Any]) -> Any:
    """Apply JSON Schema 'default' values recursively for objects.
    This is a lightweight default applier (not a full schema validator).
    """
    if value is None and "default" in schema:
        return schema["default"]

    t = schema.get("type")
    if isinstance(value, dict) and (t == "object" or t is None):
        props = schema.get("properties", {})
        out = dict(value)
        for k, prop_schema in props.items():
            if k not in out:
                if "default" in prop_schema:
                    out[k] = prop_schema["default"]
            else:
                out[k] = deep_apply_defaults(out[k], prop_schema)
        return out

    return value


def resolve_inputs(raw: Dict[str, Any], schema: Dict[str, Any]) -> Dict[str, Any]:
    resolved = dict(raw)

    # Top-level defaults
    for key, prop_schema in schema.get("properties", {}).items():
        if key not in resolved and "default" in prop_schema:
            resolved[key] = prop_schema["default"]

    # age_range: accept missing -> default null, and apply nested defaults if object
    if "age_range" in resolved:
        ar = resolved["age_range"]
        if isinstance(ar, dict):
            anyof = schema["properties"]["age_range"].get("anyOf", [])
            obj_schema = next((s for s in anyof if s.get("type") == "object"), None)
            if obj_schema:
                resolved["age_range"] = deep_apply_defaults(ar, obj_schema)

    return resolved


def build_prompt(resolved: Dict[str, Any]) -> str:
    topic = resolved.get("topic", "Parenting topic")
    lang = resolved.get("language", "en")
    style = resolved.get("article_style", "how_to_guide")
    length = resolved.get("length", "medium")
    include_checklist = bool(resolved.get("include_checklist", True))
    include_red_flags = bool(resolved.get("include_red_flags", True))
    output_format = resolved.get("output_format", "markdown")
    response_mode = resolved.get("response_mode", "standard_article")
    show_references = resolved.get("show_references", "no")
    age_range = resolved.get("age_range")

    length_hint = {
        "short": "600–800 words",
        "medium": "900–1200 words",
        "long": "1400–1800 words",
    }.get(length, "900–1200 words")

    age_text = "No specific age range provided; include brief age notes."
    if isinstance(age_range, dict):
        unit = age_range.get("unit", "months")
        mn = age_range.get("min", 0)
        mx = age_range.get("max", 0)
        age_text = f"Target age range: {mn}–{mx} {unit}."

    lang_text = "English" if lang == "en" else "Thai"

    checklist_line = "Include a checklist section." if include_checklist else "Do not include a checklist section."
    redflags_line = "Include a 'Red flags / When to seek medical care' section." if include_red_flags else "Red flags section is optional."
    refs_line = "Include a short references section with 3–8 reputable sources." if show_references == "yes" else "Do not include a references section."

    # Prompt is always written in English; it instructs the model to output in selected language.
    return f"""You are a parenting content writer. Write a {style.replace('_',' ')} response in {lang_text}.

Topic: {topic}
{age_text}

Constraints:
- Educational information only. No diagnosis. No medication dosing.
- Be warm, practical, and non-judgmental.
- Use short paragraphs and actionable bullets/steps.
- {checklist_line}
- {redflags_line}
- {refs_line}

Length: {length_hint}
Format (standard article only): {output_format}
Response mode: {response_mode} (standard_article or json)

Output rules:
- If response_mode is "standard_article": output the full article in the requested language as normal text/Markdown.
- If response_mode is "json": output a single JSON object (no surrounding commentary) with keys:
  - title (string)
  - language ("en"|"th")
  - age_range (object|null)
  - sections (array of section titles)
  - body (object mapping section_title -> section_content)
  - disclaimer (string)
  - references (array of strings) only if show_references is "yes"

Recommended structure (for standard_article):
1) Title
2) Quick summary (3–5 bullets)
3) Who this is for (include age range if provided)
4) What’s normal vs. what’s concerning
5) Practical steps/tips (numbered)
6) Common mistakes & myths (if relevant)
7) Checklist (if enabled)
8) Red flags / When to seek medical care
9) FAQ (3–6 Q&As)
10) Closing reassurance + next steps
11) References (only if show_references is "yes")
"""


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: render_prompt.py <input.json>", file=sys.stderr)
        return 2

    input_path = Path(sys.argv[1]).expanduser().resolve()
    base_dir = Path(__file__).resolve().parent.parent
    schema_path = base_dir / "schemas" / "input.schema.json"

    raw = load_json(input_path)
    schema = load_json(schema_path)

    if not isinstance(raw, dict):
        raise SystemExit("Input JSON must be an object.")

    resolved = resolve_inputs(raw, schema)
    out = {
        "resolved_inputs": resolved,
        "rendered_prompt": build_prompt(resolved),
    }
    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
