#!/usr/bin/env python3
"""Generate badge for tool-status streaming probe.

Input:  tool_status_snapshot.json
Output: badges/tool-status.json
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="_cov/tool_status_snapshot.json")
    ap.add_argument("--out", dest="out", default="_cov/badges/tool-status.json")
    args = ap.parse_args()

    if not os.path.exists(args.inp):
        print(f"ERROR: missing {args.inp}")
        return 2

    with open(args.inp, "r", encoding="utf-8") as f:
        snap: Dict[str, Any] = json.load(f)

    ok = bool(snap.get("ok"))
    probes = snap.get("probes") or {}
    msg = "tool:on" if ok else ("tool:partial" if any((v or {}).get("ok") for v in probes.values() if isinstance(v, dict)) else "tool:off")
    color = "brightgreen" if msg == "tool:on" else ("yellow" if msg == "tool:partial" else "orange")

    badge = {"schemaVersion": 1, "label": "tool-status", "message": msg, "color": color}

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
