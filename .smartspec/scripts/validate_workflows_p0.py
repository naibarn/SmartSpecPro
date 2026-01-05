#!/usr/bin/env python3
"""Validate SmartSpec workflow catalog against P0 conventions.

Runs locally and writes a machine-readable report into `.spec/reports/`.

Checks (P0):
- workflow_key = filename stem
- Kilo command = `/{workflow_key}.md`
- `workflow:` exists in frontmatter for production workflows
- `.md:Zone.Identifier` artifacts are ignored

Exit code is non-zero when violations are found.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple


FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def parse_frontmatter(text: str) -> Dict[str, str]:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}
    body = m.group(1)
    out: Dict[str, str] = {}
    last_key: Optional[str] = None
    for raw in body.splitlines():
        line = raw.rstrip("\n")
        if not line.strip():
            continue
        if ":" in line and not line.startswith((" ", "\t")):
            k, v = line.split(":", 1)
            last_key = k.strip()
            out[last_key] = v.strip().strip('"').strip("'")
            continue
        if last_key and line.startswith((" ", "\t")):
            out[last_key] = (out.get(last_key, "") + " " + line.strip()).strip()
    return out


def classify(fn: str, fm: Dict[str, str]) -> str:
    upper = fn.upper()
    if "REQUIREMENTS" in upper:
        return "doc"
    if fm.get("workflow"):
        return "production"
    return "legacy"


def scan(workflows_dir: Path) -> Tuple[List[dict], List[str]]:
    items: List[dict] = []
    issues: List[str] = []

    if not workflows_dir.exists():
        return items, [f"workflows_dir not found: {workflows_dir}"]

    for fn in sorted(os.listdir(workflows_dir)):
        if ":" in fn:
            continue
        if not fn.endswith(".md"):
            continue
        path = workflows_dir / fn
        try:
            text = path.read_text(encoding="utf-8")
        except Exception as e:
            issues.append(f"read failed: {fn}: {e}")
            continue
        fm = parse_frontmatter(text)
        kind = classify(fn, fm)
        workflow_key = fn[:-3]
        kilo_command = f"/{workflow_key}.md"
        workflow_slug = fm.get("workflow") or ""

        if kind == "production" and not workflow_slug:
            issues.append(f"missing frontmatter workflow slug: {fn}")

        items.append(
            {
                "workflow_key": workflow_key,
                "kilo_command": kilo_command,
                "workflow_slug": workflow_slug,
                "kind": kind,
                "version": fm.get("version"),
                "category": fm.get("category"),
                "description": fm.get("description"),
                "path": str(path),
            }
        )

    return items, issues


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workflows-dir", default=".smartspec/workflows")
    ap.add_argument("--out", default=".spec/reports/workflow-catalog")
    args = ap.parse_args()

    workflows_dir = Path(args.workflows_dir)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    items, issues = scan(workflows_dir)

    report = {
        "status": "success" if not issues else "warning",
        "workflows_total": len(items),
        "issues_total": len(issues),
        "issues": issues,
        "workflows": items,
    }

    (out_dir / "summary.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    # Human-friendly note
    md_lines = [
        "# Workflow Catalog Validation (P0)",
        f"- workflows_total: {len(items)}",
        f"- issues_total: {len(issues)}",
        "",
    ]
    if issues:
        md_lines.append("## Issues")
        md_lines.extend([f"- {x}" for x in issues])
    else:
        md_lines.append("✅ No issues found.")

    (out_dir / "report.md").write_text("\n".join(md_lines) + "\n", encoding="utf-8")

    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
