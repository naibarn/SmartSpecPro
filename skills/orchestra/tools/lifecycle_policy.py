"""Compatibility adapter for the shared development-lifecycle policy kernel."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_shared_policy():
    shared_path = Path(__file__).resolve().parents[2] / "development-lifecycle" / "lifecycle_policy.py"
    module_name = "shared_development_lifecycle_policy"
    module = sys.modules.get(module_name)
    if module is not None:
        return module
    spec = importlib.util.spec_from_file_location(module_name, shared_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load shared lifecycle policy: {shared_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


_shared = _load_shared_policy()
__all__ = [name for name in dir(_shared) if not name.startswith("_")]
globals().update({name: getattr(_shared, name) for name in __all__})
