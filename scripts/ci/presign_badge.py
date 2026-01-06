#!/usr/bin/env python3
"""Generate a Shields endpoint JSON badge for presign/upload restrictions.

Heuristic (stdlib-only) from Control Plane source:

- Reads `control-plane/src/config.ts` (required)
- Optionally scans other `control-plane/src/**/*.ts` for "presign" hints
- Extracts:
  - presign TTL default (seconds) if found
  - content-type enforcement presence
  - max upload/body bytes if found

Outputs:
- _cov/badges/presign.json
- _cov/badges/presign.txt (details)
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
from typing import Optional, Tuple


def read(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def find_ttl_seconds(text: str) -> Optional[int]:
    # Look for common env/config names with defaults, e.g.:
    # PRESIGN_TTL_SECONDS = z.coerce.number().default(300)
    # R2_PRESIGN_TTL_SECONDS ?? 300
    # ttlSeconds: Number(process.env.R2_PRESIGN_TTL_SECONDS || 300)
    patterns = [
        r"PRESIGN[^\n]{0,80}TTL[^\n]{0,80}default\((\d+)\)",
        r"PRESIGN[^\n]{0,80}TTL[^\n]{0,80}\|\|\s*(\d+)",
        r"PRESIGN[^\n]{0,80}TTL[^\n]{0,80}\?\?\s*(\d+)",
        r"R2_[A-Z0-9_]*PRESIGN[A-Z0-9_]*TTL[A-Z0-9_]*\s*[^\n]{0,40}(\d+)",
        r"ttlSeconds[^\n]{0,80}(\d+)",
    ]
    for pat in patterns:
        m = re.search(pat, text, flags=re.I)
        if m:
            try:
                return int(m.group(1))
            except Exception:
                pass
    return None


def find_max_bytes(text: str) -> Optional[int]:
    # maxUploadBytes / MAX_UPLOAD_BYTES / maxBodyBytes patterns
    patterns = [
        r"maxUploadBytes[^\n]{0,40}(\d+)",
        r"MAX_UPLOAD_BYTES[^\n]{0,40}(\d+)",
        r"maxBodyBytes[^\n]{0,40}(\d+)",
    ]
    for pat in patterns:
        m = re.search(pat, text, flags=re.I)
        if m:
            try:
                return int(m.group(1))
            except Exception:
                pass
    return None


def has_content_type_enforcement(text: str) -> bool:
    # We consider it enforced if there's an allowlist function and references to content-type in presign/upload flows.
    allowlist = "allowedContentTypes" in text
    content_type_tokens = any(tok in text for tok in ["content-type", "Content-Type", "contentType"])
    return allowlist and content_type_tokens


def color(ttl: Optional[int], ct: bool, size: Optional[int]) -> str:
    # Conservative: require ct enforcement + ttl <= 600 for green
    if ttl is not None and ttl <= 300 and ct:
        return "brightgreen"
    if ttl is not None and ttl <= 600 and ct:
        return "green"
    if ct:
        return "yellow"
    return "red"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="control-plane/src/config.ts")
    ap.add_argument("--src-glob", default="control-plane/src/**/*.ts")
    ap.add_argument("--out", default="_cov/badges/presign.json")
    ap.add_argument("--label", default="presign")
    args = ap.parse_args()

    if not os.path.exists(args.config):
        print(f"ERROR: missing {args.config}")
        return 2

    texts = []
    texts.append(read(args.config))

    for p in glob.glob(args.src_glob, recursive=True):
        if p.endswith(".d.ts"):
            continue
        try:
            texts.append(read(p))
        except Exception:
            pass

    merged = "\n\n".join(texts)

    ttl = find_ttl_seconds(merged)
    size = find_max_bytes(merged)
    ct = has_content_type_enforcement(merged)

    ttl_msg = "ttl:n/a" if ttl is None else f"ttl:{ttl}s"
    size_msg = "max:n/a" if size is None else (f"max:{size//(1024*1024)}MB" if size >= 1024*1024 else f"max:{size}B")
    ct_msg = "ct:on" if ct else "ct:off"
    msg = f"{ttl_msg} {ct_msg} {size_msg}"

    badge = {"schemaVersion": 1, "label": args.label, "message": msg, "color": color(ttl, ct, size)}
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(badge, f, ensure_ascii=False)

    note = os.path.splitext(args.out)[0] + ".txt"
    with open(note, "w", encoding="utf-8") as f:
        f.write(f"ttl={ttl}\nct_enforced={ct}\nmax_bytes={size}\nconfig={args.config}\n")

    print(f"Wrote {args.out}: {msg}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
