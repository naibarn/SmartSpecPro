#!/usr/bin/env python3
"""Classify whether changed paths require the progressive integration gate."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Iterable


PATH_PREFIXES = (
    "skills/brainstorming/",
    "skills/development-lifecycle/",
    "skills/orchestra/",
    "skills/integration-controller/",
    "skills/session-finish/",
    "skills/deep-plan/",
    "skills/deep-implement/",
    "skills/deep-plan-quick/",
    "skills/deep-project/",
    "scripts/development-lifecycle/",
)
EXACT_PATHS = {
    "AGENTS.md",
    "apps/web/scripts/build-main-deploy.py",
    "apps/web/scripts/test_build_main_deploy_freshness.py",
    ".github/workflows/progressive-integration.yml",
}


def requires_progressive_gate(changed_paths: Iterable[str]) -> bool:
    """Return whether a changed path affects progressive lifecycle policy."""
    return any(
        path in EXACT_PATHS or path.startswith(PATH_PREFIXES)
        for raw_path in changed_paths
        if (path := raw_path.strip())
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("changed_paths", type=Path)
    args = parser.parse_args(argv)
    try:
        changed_paths = args.changed_paths.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as error:
        print(f"Unable to read changed-path list: {type(error).__name__}", file=sys.stderr)
        return 2
    print("run" if requires_progressive_gate(changed_paths) else "skip")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
