#!/usr/bin/env python3
"""Compatibility stub for the portable deep-plan runtime.

External LLM client validation is intentionally disabled. The skill now uses
the active host model for self-review in both Codex and Claude-compatible
hosts, so no API keys or provider SDKs are required at runtime.
"""

from __future__ import annotations

import json


def main() -> int:
    print(json.dumps({"external_llm": "disabled", "success": True}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
