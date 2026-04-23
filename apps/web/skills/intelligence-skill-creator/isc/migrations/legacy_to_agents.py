from __future__ import annotations

from pathlib import Path

from ..native_bundle import migrate_legacy_skill_bundle


def migrate_legacy_to_agents_python(source_dir: Path, target_dir: Path | None = None) -> list[Path]:
    return migrate_legacy_skill_bundle(source_dir, target_dir)
