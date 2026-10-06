"""Read-only references from current source, tests, docs, migrations, and routes."""
from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import Any

from .inventory import inventory

_SPEC_MENTION = re.compile(r"\b(?:specification|spec)\s*(?:#|no\.?|:|-)?\s*(\d{1,4})\b", re.I)
_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".sql", ".md", ".json", ".toml", ".yaml", ".yml"}
_SOURCE_ROOTS = ("apps", "packages", "python-backend", "scripts", "tests", "skills")
_SKIP_PARTS = {"node_modules", ".git", "target", "dist", "build", "handoff", "specs"}


def collect_source_evidence(repo: Path) -> dict[str, list[dict[str, Any]]]:
    return collect_source_evidence_for_inventory(repo, inventory(repo))


def collect_source_evidence_for_inventory(repo: Path, discovered: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    by_id: dict[str, list[dict[str, Any]]] = {}
    aliases: dict[str, list[str]] = {}
    for row in discovered["records"]:
        if row["root_kind"] == "CANONICAL" and row["record_kind"] == "CANONICAL_SPEC" and row.get("spec_id"):
            by_id.setdefault(str(row["spec_id"]), [])
            aliases.setdefault(str(int(row["spec_id"])), []).append(str(row["spec_id"]))
    result = {spec_id: [] for spec_id in by_id}
    for root_name in _SOURCE_ROOTS:
        root = repo / root_name
        if not root.is_dir():
            continue
        for base, directories, files in os.walk(root, followlinks=False):
            base_path = Path(base)
            directories[:] = sorted(name for name in directories if name not in _SKIP_PARTS and not (base_path / name).is_symlink())
            for name in sorted(files):
                path = base_path / name
                if path.suffix.lower() not in _EXTENSIONS or path.is_symlink():
                    continue
                try:
                    lines = path.read_text(encoding="utf-8").splitlines()
                except (OSError, UnicodeError):
                    continue
                category = "TEST" if any(part in {"test", "tests", "__tests__", "e2e"} for part in path.parts) or ".test." in name or ".spec." in name else "SOURCE"
                if root_name in {"scripts", "skills"} or path.suffix.lower() in {".md", ".yaml", ".yml", ".json", ".toml"}:
                    category = "DOCUMENTATION_OR_CONFIG"
                for number, line in enumerate(lines, start=1):
                    for match in _SPEC_MENTION.finditer(line):
                        spec_id = match.group(1)
                        targets = aliases.get(str(int(spec_id)), [])
                        if not targets:
                            continue
                        for target in targets:
                            result[target].append({"kind": category, "path": path.relative_to(repo).as_posix(), "line": number, "excerpt": line.strip()[:240], "identity_ambiguous": len(targets) > 1})
    for rows in result.values():
        rows.sort(key=lambda row: (row["kind"], row["path"], row["line"]))
    return result


def git_file_times(repo: Path, relative_path: str) -> dict[str, str | None]:
    """Return observed Git timestamps when history exists; never synthesize history."""
    if not (repo / relative_path).exists():
        return {"created_at": None, "last_changed_at": None}
    created = subprocess.run(["git", "log", "--follow", "--diff-filter=A", "--format=%cI", "--reverse", "--", relative_path], cwd=repo, text=True, capture_output=True, check=False)
    changed = subprocess.run(["git", "log", "-1", "--format=%cI", "--", relative_path], cwd=repo, text=True, capture_output=True, check=False)
    return {"created_at": next((line for line in created.stdout.splitlines() if line.strip()), None), "last_changed_at": next((line for line in changed.stdout.splitlines() if line.strip()), None)}


def collect_git_times(repo: Path, relative_paths: list[str]) -> dict[str, dict[str, str | None]]:
    """Collect dates for many Specs in two Git processes rather than per-file calls."""
    paths = sorted(set(relative_paths))
    result = {path: {"created_at": None, "last_changed_at": None} for path in paths}
    if not paths:
        return result
    changed = subprocess.run(["git", "log", "--format=@@%cI", "--name-only", "--", *paths], cwd=repo, text=True, capture_output=True, check=False)
    current_time = None
    for line in changed.stdout.splitlines():
        if line.startswith("@@"):
            current_time = line[2:]
        elif line in result and current_time and result[line]["last_changed_at"] is None:
            result[line]["last_changed_at"] = current_time
    created = subprocess.run(["git", "log", "--format=@@%cI", "--name-status", "--diff-filter=A", "--reverse", "--", *paths], cwd=repo, text=True, capture_output=True, check=False)
    current_time = None
    for line in created.stdout.splitlines():
        if line.startswith("@@"):
            current_time = line[2:]
        elif line.startswith("A\t"):
            path = line[2:]
            if path in result and current_time:
                result[path]["created_at"] = current_time
    return result
