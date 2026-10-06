"""Shared classification of disposable runtime artifacts in portable skills."""
from __future__ import annotations

import subprocess
import sys
import os
from pathlib import Path

RUNTIME_PARTS = {".venv", ".pytest_cache", "__pycache__"}


def runtime_artifacts(root: Path) -> list[Path]:
    root = root.resolve()
    if not root.exists():
        return []
    found: list[Path] = []
    for base, directories, files in os.walk(root, topdown=True):
        base_path = Path(base)
        retained: list[str] = []
        for name in directories:
            candidate = base_path / name
            if name in RUNTIME_PARTS:
                found.append(candidate)
            else:
                retained.append(name)
        directories[:] = retained
        found.extend(base_path / name for name in files if name.endswith((".pyc", ".pyo")))
    return sorted(found, key=lambda p: p.as_posix())


def tracked_runtime_paths(repo: Path, artifacts: list[Path]) -> list[Path]:
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=repo).decode().split("\0")
    tracked = {Path(item) for item in tracked if item}
    tracked_prefixes = set(tracked)
    for path in tracked:
        tracked_prefixes.update(path.parents)
    result: set[Path] = set()
    for artifact in artifacts:
        relative = artifact.relative_to(repo)
        if relative in tracked_prefixes:
            result.add(relative)
    return sorted(result)


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] != "check-cleanup":
        print("usage: runtime_hygiene.py check-cleanup <repo-root>", file=sys.stderr)
        return 2
    repo = Path(sys.argv[2]).resolve()
    artifacts = runtime_artifacts(repo / "skills")
    tracked = tracked_runtime_paths(repo, artifacts)
    if tracked:
        print("refusing to remove tracked skill runtime content:", file=sys.stderr)
        for path in tracked:
            print(path.as_posix(), file=sys.stderr)
        return 1
    print(f"safe to clean {len(artifacts)} ignored/untracked runtime artifact paths")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
