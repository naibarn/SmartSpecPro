"""Load the one shared lifecycle policy from the active skill installation."""
from __future__ import annotations
import importlib.util
import os
import sys
from pathlib import Path
from types import ModuleType


def load_shared_lifecycle_policy(plugin_root: Path | str | None = None) -> ModuleType:
    candidates: list[Path] = []
    if plugin_root:
        candidates.append(Path(plugin_root).expanduser().resolve().parent / "development-lifecycle" / "lifecycle_policy.py")
    if os.environ.get("CODEX_HOME"):
        candidates.append(Path(os.environ["CODEX_HOME"]).expanduser() / "skills/development-lifecycle/lifecycle_policy.py")
    candidates.append(Path(__file__).resolve().parents[4] / "skills/development-lifecycle/lifecycle_policy.py")
    candidates.append(Path.home() / ".codex/skills/development-lifecycle/lifecycle_policy.py")
    for candidate in candidates:
        if not candidate.is_file():
            continue
        module_name = "deep_shared_lifecycle_policy"
        module = sys.modules.get(module_name)
        if module is not None:
            return module
        spec = importlib.util.spec_from_file_location(module_name, candidate)
        if spec is None or spec.loader is None:
            continue
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        return module
    searched = ", ".join(str(path) for path in candidates)
    raise FileNotFoundError(f"Shared development-lifecycle policy is unavailable; searched: {searched}")
