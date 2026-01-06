#!/usr/bin/env python3
"""Generate a Shields endpoint JSON badge for artifact type support.

Heuristic (stdlib-only) based on Control Plane allowlists in source:

- Reads `control-plane/src/config.ts`
- Extracts allowed content-types by scanning for string literals like "image/png"

Outputs:
- _cov/badges/artifacts.json
- _cov/badges/artifacts.txt (details)

Badge message (compact):
  img<N> vid<N> doc<N>

Where:
- img: count of allowed image/* types (png/jpeg/webp/gif etc.)
- vid: count of allowed video/* types (e.g. mp4)
- doc: count of common doc/text types (pdf, markdown, plain, json)

Color:
- brightgreen: img>=1 and vid>=1 and doc>=1
- green: img>=1 and doc>=1
- yellow: only one category found
- red: none found
"""

from __future__ import annotations

import argparse
import json
import os
import re
from typing import List, Set, Tuple


CT_RE = re.compile(r'"([a-zA-Z0-9!#\$%&\*\+\-\.\^_`\|~]+/[a-zA-Z0-9!#\$%&\*\+\-\.\^_`\|~]+)"')


def read(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def extract_content_types(src: str) -> Set[str]:
    types = set()
    for m in CT_RE.finditer(src):
        v = m.group(1)
        # Filter obviously unrelated strings by requiring a slash and no spaces (already)
        if "/" in v and len(v) <= 60:
            types.add(v.lower())
    return types


def categorize(types: Set[str]) -> Tuple[List[str], List[str], List[str], List[str]]:
    images = sorted([t for t in types if t.startswith("image/")])
    videos = sorted([t for t in types if t.startswith("video/")])
    docs = sorted([t for t in types if t in ("application/pdf", "text/markdown", "text/plain", "application/json")])
    other = sorted([t for t in types if t not in set(images + videos + docs)])
    return images, videos, docs, other


def color(img_n: int, vid_n: int, doc_n: int) -> str:
    if img_n >= 1 and vid_n >= 1 and doc_n >= 1:
        return "brightgreen"
    if img_n >= 1 and doc_n >= 1:
        return "green"
    if (img_n + vid_n + doc_n) >= 1:
        return "yellow"
    return "red"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="control-plane/src/config.ts")
    ap.add_argument("--out", default="_cov/badges/artifacts.json")
    ap.add_argument("--label", default="artifacts")
    args = ap.parse_args()

    if not os.path.exists(args.source):
        print(f"ERROR: missing {args.source}")
        return 2

    src = read(args.source)
    types = extract_content_types(src)
    images, videos, docs, other = categorize(types)

    msg = f"img{len(images)} vid{len(videos)} doc{len(docs)}"
    badge = {"schemaVersion": 1, "label": args.label, "message": msg, "color": color(len(images), len(videos), len(docs))}

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(badge, f, ensure_ascii=False)

    note = os.path.splitext(args.out)[0] + ".txt"
    with open(note, "w", encoding="utf-8") as f:
        f.write("images=" + ",".join(images) + "\n")
        f.write("videos=" + ",".join(videos) + "\n")
        f.write("docs=" + ",".join(docs) + "\n")
        f.write("other=" + ",".join(other) + "\n")

    print(f"Wrote {args.out}: {msg}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
