#!/usr/bin/env python3
"""Generate badge for SSE streaming probe.

Input:  streaming_snapshot.json
Output: badges/streaming.json
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="_cov/streaming_snapshot.json")
    ap.add_argument("--out", dest="out", default="_cov/badges/streaming.json")
    args = ap.parse_args()

    if not os.path.exists(args.inp):
        print(f"ERROR: missing {args.inp}")
        return 2

    with open(args.inp, "r", encoding="utf-8") as f:
        snap: Dict[str, Any] = json.load(f)

    ok = bool(snap.get("ok"))
    probes = snap.get("probes") or {}
    text_ok = bool((probes.get("sseHasTextChunk") or {}).get("ok"))
    done_ok = bool((probes.get("sseHasDone") or {}).get("ok"))

    if ok and text_ok and done_ok:
        msg, color = "sse:on", "brightgreen"
    elif text_ok or done_ok:
        msg, color = "sse:partial", "yellow"
    else:
        msg, color = "sse:off", "orange"

    badge = {"schemaVersion": 1, "label": "streaming", "message": msg, "color": color}

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(badge, f, ensure_ascii=False)

    note = os.path.splitext(args.out)[0] + ".txt"
    with open(note, "w", encoding="utf-8") as f:
        f.write(json.dumps(snap, ensure_ascii=False, indent=2) + "\n")

    print(f"Wrote {args.out}: {msg}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
