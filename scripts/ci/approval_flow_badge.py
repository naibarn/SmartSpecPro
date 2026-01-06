#!/usr/bin/env python3
"""Generate a badge for approval flow probe.

Input:  approval_flow_snapshot.json
Output: badges/approval-flow.json
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict, Optional


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="_cov/approval_flow_snapshot.json")
    ap.add_argument("--out", dest="out", default="_cov/badges/approval-flow.json")
    args = ap.parse_args()

    if not os.path.exists(args.inp):
        print(f"ERROR: missing {args.inp}")
        return 2

    with open(args.inp, "r", encoding="utf-8") as f:
        snap: Dict[str, Any] = json.load(f)

    ok = bool(snap.get("ok"))
    probes = snap.get("probes") or {}
    stream_ok = bool((probes.get("streamApprovalEvent") or {}).get("ok")) and bool((probes.get("streamToolExecutedOnce") or {}).get("ok"))
    non_ok = bool((probes.get("nonstreamDenied") or {}).get("ok"))

    msg = ("e2e:on" if (ok and stream_ok and non_ok) else ("e2e:partial" if (stream_ok or non_ok) else "e2e:off"))
    color = "brightgreen" if msg == "e2e:on" else ("yellow" if msg == "e2e:partial" else "orange")

    badge = {"schemaVersion": 1, "label": "approval-flow", "message": msg, "color": color}

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
