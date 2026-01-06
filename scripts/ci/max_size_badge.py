#!/usr/bin/env python3
"""Generate a Shields endpoint JSON badge for max artifact upload size.

Heuristic (stdlib-only) from Control Plane config source:
- Looks for MAX upload/body bytes numeric literals or defaults.
- If not found, badge reports n/a and is red.

Outputs:
- _cov/badges/max-size.json
- _cov/badges/max-size.txt
"""

from __future__ import annotations

import argparse
import json
import os
import re
from typing import Optional


def read(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def find_max_bytes(src: str) -> Optional[int]:
    patterns = [
        r"maxUploadBytes\s*[:=]\s*(\d+)",
        r"MAX_UPLOAD_BYTES\s*[:=]\s*(\d+)",
        r"maxBodyBytes\s*[:=]\s*(\d+)",
        r"MAX_BODY_BYTES\s*[:=]\s*(\d+)",
        r"default\((\d+)\)\s*;?\s*//\s*max.*bytes",
    ]
    for pat in patterns:
        m = re.search(pat, src, flags=re.I)
        if m:
            try:
                return int(m.group(1))
            except Exception:
                pass
    # Also consider env fallback forms: Number(process.env.X || 52428800)
    m = re.search(r"\|\|\s*(\d{6,})\s*\)", src)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            pass
    return None


def fmt(n: Optional[int]) -> str:
    if n is None:
        return "n/a"
    mb = n / (1024 * 1024)
    if mb >= 1:
        return f"{mb:.0f}MB"
    kb = n / 1024
    if kb >= 1:
        return f"{kb:.0f}KB"
    return f"{n}B"


def color(n: Optional[int]) -> str:
    if n is None:
        return "red"
    mb = n / (1024 * 1024)
    # smaller limits tend to be safer; but don't penalize reasonable sizes
    if mb <= 50:
        return "brightgreen"
    if mb <= 200:
        return "green"
    if mb <= 500:
        return "yellow"
    return "orange"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="control-plane/src/config.ts")
    ap.add_argument("--out", default="_cov/badges/max-size.json")
    ap.add_argument("--label", default="max-size")
    args = ap.parse_args()

    if not os.path.exists(args.source):
        print(f"ERROR: missing {args.source}")
        return 2

    src = read(args.source)
    n = find_max_bytes(src)
    msg = f"max:{fmt(n)}"
    badge = {"schemaVersion": 1, "label": args.label, "message": msg, "color": color(n)}

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(badge, f, ensure_ascii=False)

    note = os.path.splitext(args.out)[0] + ".txt"
    with open(note, "w", encoding="utf-8") as f:
        f.write(f"max_bytes={n}\n")

    print(f"Wrote {args.out}: {msg}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
