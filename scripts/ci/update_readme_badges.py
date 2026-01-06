#!/usr/bin/env python3
"""Update README badges based on repository slug.

Updates a badge block between:
  <!-- CI_BADGES_START -->
  <!-- CI_BADGES_END -->

Badges:
- CI (workflow)
- coverage
- security
- policy
- approval
- approval-flow
- streaming
- tool-status
- control-plane
- presign
- artifacts
- max-size
- authz

All non-CI badges are Shields endpoints pointing to raw JSON on the `badges` branch.
"""

from __future__ import annotations

import argparse
import os
import re
from typing import Tuple
from urllib.parse import quote


BADGES_START = "<!-- CI_BADGES_START -->"
BADGES_END = "<!-- CI_BADGES_END -->"


def build_badges(repo: str) -> str:
    ci_badge = f"https://github.com/{repo}/actions/workflows/ci.yml/badge.svg"
    ci_link = f"https://github.com/{repo}/actions/workflows/ci.yml"
    badge_branch = "badges"

    def raw(name: str) -> str:
        return f"https://raw.githubusercontent.com/{repo}/{badge_branch}/badges/{name}.json"

    def shields(raw_url: str) -> str:
        return "https://img.shields.io/endpoint?url=" + quote(raw_url, safe="")

    names = [
        "coverage",
        "security",
        "policy",
        "approval",
        "approval-flow",
        "streaming",
        "tool-status",
        "control-plane",
        "presign",
        "artifacts",
        "max-size",
        "authz",
    ]
    parts = [f"[![CI]({ci_badge})]({ci_link})"]
    for n in names:
        r = raw(n)
        label = n.replace("-", "").title()
        if n == "control-plane":
            label = "ControlPlane"
        if n == "max-size":
            label = "MaxSize"
        if n == "approval-flow":
            label = "ApprovalFlow"
        if n == "tool-status":
            label = "ToolStatus"
        parts.append(f"[![{label}]({shields(r)})]({r})")

    return f"{BADGES_START}\n" + " ".join(parts) + "\n" + f"{BADGES_END}"


def replace_block(text: str, new_block: str) -> Tuple[str, bool]:
    if BADGES_START in text and BADGES_END in text:
        pattern = re.compile(re.escape(BADGES_START) + r".*?" + re.escape(BADGES_END), re.S)
        return pattern.sub(new_block, text), True
    return text, False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=os.getenv("GITHUB_REPOSITORY", "").strip(), help="owner/repo")
    ap.add_argument("--readme", default="README.md")
    args = ap.parse_args()

    if not args.repo:
        print("ERROR: --repo not provided and GITHUB_REPOSITORY is empty")
        return 2

    with open(args.readme, "r", encoding="utf-8") as f:
        text = f.read()

    new_block = build_badges(args.repo)

    out, replaced = replace_block(text, new_block)
    if not replaced:
        m = re.search(r"^# .+?$", out, flags=re.M)
        if m:
            idx = m.end()
            out = out[:idx] + "\n\n" + new_block + "\n" + out[idx:]
        else:
            out = new_block + "\n\n" + out

    with open(args.readme, "w", encoding="utf-8") as f:
        f.write(out)

    print(f"Updated badges in {args.readme} for repo={args.repo}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
