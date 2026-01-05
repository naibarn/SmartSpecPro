from __future__ import annotations

"""Lightweight workflow discovery helpers.

This module historically provided `discover_workflows()` metadata scanning.
For runtime catalog/search, prefer `WorkflowCatalog` from `workflow_loader`.

P0 standard:
- workflow_key = filename stem (e.g. `smartspec_generate_spec`)
- Kilo command = `/{workflow_key}.md`
- frontmatter `workflow:` = canonical slug metadata
"""

import os
import re
from dataclasses import dataclass
from typing import Optional, Dict, List

from .workflow_loader import WorkflowCatalog  # re-export for compatibility


@dataclass
class WorkflowMeta:
    workflow_key: str               # filename stem (e.g. smartspec_generate_spec)
    kilo_command: str               # e.g. /smartspec_generate_spec.md
    workflow_slug: str              # e.g. /smartspec_generate_spec (may be empty)
    kind: str                       # production | legacy | doc
    version: Optional[str]
    category: Optional[str]
    description: Optional[str]
    path: str


_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def _parse_frontmatter(text: str) -> Dict[str, str]:
    m = _FRONTMATTER_RE.match(text)
    if not m:
        return {}
    body = m.group(1)
    out: Dict[str, str] = {}
    last_key: Optional[str] = None
    for raw in body.splitlines():
        line = raw.rstrip("\n")
        if not line.strip():
            continue
        if ":" in line and not line.startswith(" ") and not line.startswith("\t"):
            k, v = line.split(":", 1)
            last_key = k.strip()
            out[last_key] = v.strip().strip('"').strip("'")
            continue
        if last_key and (line.startswith(" ") or line.startswith("\t")):
            out[last_key] = (out.get(last_key, "") + " " + line.strip()).strip()
    return out


def _classify_filename(fn: str, fm: Dict[str, str]) -> str:
    # Ignore should already be filtered; here we label docs/legacy for callers.
    upper = fn.upper()
    if "REQUIREMENTS" in upper:
        return "doc"
    if fm.get("workflow"):
        return "production"
    return "legacy"


def discover_workflows(workflows_dir: str = ".smartspec/workflows") -> List[WorkflowMeta]:
    metas: List[WorkflowMeta] = []
    if not os.path.isdir(workflows_dir):
        return metas
    for fn in os.listdir(workflows_dir):
        # Filter Windows ADS artifacts and non-markdown
        if ":" in fn or not fn.endswith(".md"):
            continue
        path = os.path.join(workflows_dir, fn)
        try:
            text = open(path, "r", encoding="utf-8").read()
        except Exception:
            continue
        fm = _parse_frontmatter(text)
        workflow_key = fn[:-3]
        metas.append(
            WorkflowMeta(
                workflow_key=workflow_key,
                kilo_command=f"/{workflow_key}.md",
                workflow_slug=fm.get("workflow") or "",
                kind=_classify_filename(fn, fm),
                version=fm.get("version"),
                category=fm.get("category"),
                description=fm.get("description"),
                path=path,
            )
        )
    return sorted(metas, key=lambda m: m.workflow_key)
