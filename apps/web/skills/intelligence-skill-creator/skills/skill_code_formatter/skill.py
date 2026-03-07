"""Sample skill: Code Formatter (simple)."""
from __future__ import annotations

import json
from typing import Any


def respond(input: Any, context=None) -> str:
    code = str(input or "").replace("\\r\\n", "\n").replace("\\n", "\n")
    lines = [ln.rstrip() for ln in code.splitlines()]
    formatted = "\n".join(lines).rstrip() + "\n"
    return json.dumps(
        {
            "success": True,
            "output": "Formatted successfully",
            "formatted_code": formatted,
        },
        ensure_ascii=False,
    )
