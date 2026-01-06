#!/usr/bin/env python3
"""Generate a Shields.io endpoint JSON badge describing Control Plane posture.

Heuristic from `control-plane/src/config.ts` (stdlib-only, runs in CI without Node).

Signals:
- content-type allowlist present (allowedContentTypes)
- supports image types (image/png, image/jpeg, image/webp)
- supports video/mp4 (optional)
- has max upload bytes / size guard

Output:
- badges/control-plane.json (schemaVersion=1)
- badges/control-plane.txt (details)
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


def analyze(src: str) -> Tuple[str, str, str]:
    has_allowlist = "allowedContentTypes" in src
    img = any(x in src for x in ["image/png", "image/jpeg", "image/webp"])
    vid = any(x in src for x in ["video/mp4", "video/"])
    pdf = "application/pdf" in src
    md = any(x in src for x in ["text/markdown", "text/plain"])
    # size guard heuristics
    size_guard = bool(re.search(r"max.*(upload|body).*bytes", src, re.I)) or ("MAX_UPLOAD" in src) or ("maxUploadBytes" in src)

    parts = []
    if img:
        parts.append("img")
    if vid:
        parts.append("vid")
    if pdf:
        parts.append("pdf")
    if md:
        parts.append("text")
    ct = "+".join(parts) if parts else "unknown"

    if has_allowlist and size_guard:
        mode = "strict"
        color = "brightgreen"
    elif has_allowlist:
        mode = "allowlist"
        color = "green"
    elif size_guard:
        mode = "size-only"
        color = "yellow"
    else:
        mode = "unknown"
        color = "lightgrey"

    message = f"{mode} ct:{ct}"
    detail = f"has_allowlist={has_allowlist} img={img} vid={vid} pdf={pdf} text={md} size_guard={size_guard}"
    return message, color, detail


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="control-plane/src/config.ts")
    ap.add_argument("--out", default="_cov/badges/control-plane.json")
    ap.add_argument("--label", default="control-plane")
    args = ap.parse_args()

    if not os.path.exists(args.source):
        print(f"ERROR: missing {args.source}")
        return 2

    src = _read(args.source)
    msg, color, detail = analyze(src)

    badge = {"schemaVersion": 1, "label": args.label, "message": msg, "color": color}
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(badge, f, ensure_ascii=False)

    note = os.path.splitext(args.out)[0] + ".txt"
    with open(note, "w", encoding="utf-8") as f:
        f.write(detail + "\n")

    print(f"Wrote {args.out}: {msg}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
