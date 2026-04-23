from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from ..native_bundle import build_native_skill_files, write_native_skill_bundle


def build_agents_python_bundle(plan: Mapping[str, Any] | None) -> dict[str, str]:
    return build_native_skill_files(plan)


def export_agents_python_bundle(target_dir: Path, plan: Mapping[str, Any] | None) -> list[Path]:
    return write_native_skill_bundle(target_dir, plan, overwrite=True)
