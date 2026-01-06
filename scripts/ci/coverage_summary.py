#!/usr/bin/env python3
"""Repo-level coverage summary.

Reads:
- Python: coverage.xml (Cobertura XML) from python-backend
- Node: coverage/coverage-summary.json from Jest or Vitest (json-summary reporter)

Emits:
- coverage_summary.json
- coverage_summary.md

Optionally fails if any coverage file is missing/unparseable.
"""

from __future__ import annotations

import argparse
import json
import os
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class Cov:
    name: str
    lines_pct: Optional[float]
    statements_pct: Optional[float] = None
    functions_pct: Optional[float] = None
    branches_pct: Optional[float] = None
    source: str = ""


def parse_python_coverage_xml(path: str) -> Cov:
    try:
        root = ET.parse(path).getroot()
        line_rate = root.attrib.get("line-rate")
        branch_rate = root.attrib.get("branch-rate")
        lines = float(line_rate) * 100.0 if line_rate is not None else None
        branches = float(branch_rate) * 100.0 if branch_rate is not None else None
        return Cov(name="python-backend", lines_pct=lines, branches_pct=branches, source=path)
    except Exception as e:
        return Cov(name="python-backend", lines_pct=None, source=f"{path} ({e})")


def parse_js_coverage_summary(path: str, name: str) -> Cov:
    try:
        with open(path, "r", encoding="utf-8") as f:
            obj = json.load(f)
        total = obj.get("total") or {}

        def pct(k: str) -> Optional[float]:
            v = total.get(k) or {}
            p = v.get("pct")
            return float(p) if p is not None else None

        return Cov(
            name=name,
            lines_pct=pct("lines"),
            statements_pct=pct("statements"),
            functions_pct=pct("functions"),
            branches_pct=pct("branches"),
            source=path,
        )
    except Exception as e:
        return Cov(name=name, lines_pct=None, source=f"{path} ({e})")


def fmt_pct(v: Optional[float]) -> str:
    return "-" if v is None else f"{v:.1f}%"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--python-xml", required=True)
    ap.add_argument("--api-generator", required=True)
    ap.add_argument("--control-plane", required=True)
    ap.add_argument("--desktop-app", required=True)
    ap.add_argument("--out-json", default="coverage_summary.json")
    ap.add_argument("--out-md", default="coverage_summary.md")
    ap.add_argument("--fail-on-missing", action="store_true", help="Fail (exit non-zero) if any coverage file is missing/unparseable")
    args = ap.parse_args()

    covs = []
    covs.append(parse_python_coverage_xml(args.python_xml) if os.path.exists(args.python_xml) else Cov("python-backend", None, source=f"missing:{args.python_xml}"))
    for name, path in [
        ("api-generator", args.api_generator),
        ("control-plane", args.control_plane),
        ("desktop-app", args.desktop_app),
    ]:
        covs.append(parse_js_coverage_summary(path, name) if os.path.exists(path) else Cov(name, None, source=f"missing:{path}"))

    out: Dict[str, Any] = {"packages": [c.__dict__ for c in covs]}
    with open(args.out_json, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    md = []
    md.append("# Coverage Summary\n\n")
    md.append("| Package | Lines | Statements | Functions | Branches | Source |\n")
    md.append("|---|---:|---:|---:|---:|---|\n")
    for c in covs:
        md.append(f"| {c.name} | {fmt_pct(c.lines_pct)} | {fmt_pct(c.statements_pct)} | {fmt_pct(c.functions_pct)} | {fmt_pct(c.branches_pct)} | {c.source} |\n")
    md.append("\n> Notes: Coverage thresholds are enforced in each package's test command. This report aggregates outputs.\n")
    with open(args.out_md, "w", encoding="utf-8") as f:
        f.write("".join(md))

    for c in covs:
        print(f"{c.name}: lines={fmt_pct(c.lines_pct)} branches={fmt_pct(c.branches_pct)}")

    missing = [c for c in covs if c.lines_pct is None]
    if args.fail_on_missing and missing:
        print("ERROR: Missing/unparseable coverage for:", ", ".join([m.name for m in missing]))
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
