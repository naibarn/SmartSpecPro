from __future__ import annotations

from typing import List, Optional


def _strip_quotes(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    return value


def _parse_inline_list(value: str) -> List[str]:
    value = value.strip()
    if not value.startswith("[") or not value.endswith("]"):
        return []
    inner = value[1:-1].strip()
    if not inner:
        return []
    return [_strip_quotes(part.strip()) for part in inner.split(",") if part.strip()]


def parse_skill_frontmatter(text: str) -> dict:
    if not text.startswith("---"):
        return {}

    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}

    data: dict = {}
    list_key: Optional[str] = None
    list_values: List[str] = []

    for raw in lines[1:]:
        line = raw.rstrip()
        if line.strip() == "---":
            if list_key is not None:
                data[list_key] = list_values[:]
            break
        if not line.strip():
            continue
        if line.startswith("  - ") and list_key is not None:
            list_values.append(_strip_quotes(line[4:].strip()))
            continue
        if ":" not in line:
            continue
        if list_key is not None:
            data[list_key] = list_values[:]
            list_key = None
            list_values = []
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if not value:
            list_key = key
            list_values = []
            continue
        if value.startswith("[") and value.endswith("]"):
            data[key] = _parse_inline_list(value)
            continue
        data[key] = _strip_quotes(value)
    return data

