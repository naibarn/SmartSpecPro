from __future__ import annotations

from pathlib import Path

from ..native_bundle import evaluate_native_skill_bundle


def evaluate_agents_python_bundle(bundle_dir: Path):
    return evaluate_native_skill_bundle(bundle_dir)
