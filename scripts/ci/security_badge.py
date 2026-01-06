#!/usr/bin/env python3
"""Generate a Shields.io endpoint JSON badge describing proxy security posture.

This is a *heuristic* based on secure defaults in the OpenAI-compatible proxy:
- localhostOnly default (should be ON)
- autoApproveNonstream default (should be OFF)
- approval tools default (should include workspace_write_file)

Input: python-backend/app/api/llm_openai_compat.py (source code text)
Output: badges/security.json (schemaVersion=1)

Why heuristic? We want a stdlib-only script that runs in CI without installing deps.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from typing import Optional, Tuple


def _read(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _find_default_env_bool(src: str, env_name: str, expected_literal: str) -> Optional[bool]:
    # Example pattern:
    # LOCALHOST_ONLY = os.getenv("LLM_PROXY_LOCALHOST_ONLY", "1") != "0"
    pat = re.compile(r'os\.getenv\(\s*"' + re.escape(env_name) + r'"\s*,\s*"' + re.escape(expected_literal) + r'"\s*\)')
    if not pat.search(src):
        return None
    # Interpret expected_literal as bool default, where "1" means True and "0" means False for these flags.
    if expected_literal == "1":
        return True
    if expected_literal == "0":
        return False
    return None


def posture_from_source(src: str) -> Tuple[str, str]:
    # Required secure defaults
    localhost_default = _find_default_env_bool(src, "LLM_PROXY_LOCALHOST_ONLY", "1")
    auto_approve_nonstream_default = _find_default_env_bool(src, "LLM_PROXY_AUTO_APPROVE_NONSTREAM", "0")

    approval_tools_secure = "LLM_PROXY_APPROVAL_TOOLS" in src and "workspace_write_file" in src

    issues = []
    if localhost_default is not True:
        issues.append("localhost_only_default_not_strict")
    if auto_approve_nonstream_default is not False:
        issues.append("auto_approve_nonstream_default_not_strict")
    if not approval_tools_secure:
        issues.append("approval_tools_default_missing_write")

    if issues:
        return "permissive", ",".join(issues)
    return "strict", "secure_defaults_ok"


def color_for(mode: str) -> str:
    return "brightgreen" if mode == "strict" else "red"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="python-backend/app/api/llm_openai_compat.py")
    ap.add_argument("--out", default="badges/security.json")
    ap.add_argument("--label", default="security")
    args = ap.parse_args()

    if not os.path.exists(args.source):
        print(f"ERROR: missing {args.source}")
        return 2

    src = _read(args.source)
    mode, detail = posture_from_source(src)

    badge = {
        "schemaVersion": 1,
        "label": args.label,
        "message": mode,
        "color": color_for(mode),
    }

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(badge, f, ensure_ascii=False)

    # Also write a human-readable note next to badge file if desired
    note_path = os.path.splitext(args.out)[0] + ".txt"
    with open(note_path, "w", encoding="utf-8") as f:
        f.write(f"mode={mode}\nreason={detail}\nsource={args.source}\n")

    print(f"Wrote {args.out}: {mode} ({detail})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
