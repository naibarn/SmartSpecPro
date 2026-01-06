#!/usr/bin/env python3
"""Generate a Shields.io endpoint JSON badge from aggregated coverage summary.

Input:  coverage_summary.json produced by scripts/ci/coverage_summary.py
Output: badges/coverage.json (schemaVersion=1)

By default, uses the *minimum* lines% across packages (conservative).
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict, List, Optional


def color_for(pct: Optional[float]) -> str:
    if pct is None:
        return "lightgrey"
    if pct >= 90:
        return "brightgreen"
    if pct >= 80:
        return "green"
    if pct >= 70:
        return "yellowgreen"
    if pct >= 60:
        return "yellow"
    if pct >= 50:
        return "orange"
    return "red"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="coverage_summary.json", help="coverage_summary.json path")
    ap.add_argument("--out", dest="out", default="badges/coverage.json", help="output badge json path")
    ap.add_argument("--mode", choices=["min", "avg"], default="min", help="how to compute repo coverage")
    ap.add_argument("--label", default="coverage", help="badge label")
    args = ap.parse_args()

    if not os.path.exists(args.inp):
        print(f"ERROR: missing input {args.inp}")
        return 2

    with open(args.inp, "r", encoding="utf-8") as f:
        obj = json.load(f)

    pkgs: List[Dict[str, Any]] = list(obj.get("packages") or [])
    vals = [p.get("lines_pct") for p in pkgs if isinstance(p.get("lines_pct"), (int, float))]
    pct: Optional[float]
    if not vals:
        pct = None
    elif args.mode == "avg":
        pct = sum(float(x) for x in vals) / len(vals)
    else:
        pct = min(float(x) for x in vals)

    msg = "n/a" if pct is None else f"{pct:.1f}%"
    badge = {
        "schemaVersion": 1,
        "label": args.label,
        "message": msg,
        "color": color_for(pct),
    }

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(badge, f, ensure_ascii=False)

    print(f"Wrote {args.out}: {msg}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
