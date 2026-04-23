from __future__ import annotations

import json
import os
import stat
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
ISC_ROOT = REPO_ROOT / "apps" / "web" / "skills" / "intelligence-skill-creator"
if str(ISC_ROOT) not in sys.path:
    sys.path.insert(0, str(ISC_ROOT))

from isc.native_bundle import (  # type: ignore[import-not-found]
    build_native_skill_files,
    evaluate_native_skill_bundle,
    migrate_legacy_skill_bundle,
    write_native_skill_bundle,
)


def test_write_native_skill_bundle_emits_native_surface(tmp_path: Path) -> None:
    bundle_dir = tmp_path / "native-skill"
    plan = {
        "skill_name": "native-skill",
        "skill_title": "Native Skill",
        "description": "Native skill bundle",
        "version": "1.2.3",
        "workflow": ["discover", "inspect", "plan", "execute", "verify", "summarize", "finalize"],
        "guardrails": ["No interactive prompts."],
        "final_response_checklist": ["Verification passed."],
    }

    written = write_native_skill_bundle(bundle_dir, plan)

    expected_paths = {
        bundle_dir / "SKILL.md",
        bundle_dir / "skill.md",
        bundle_dir / "scripts" / "run.sh",
        bundle_dir / "scripts" / "verify.sh",
        bundle_dir / "references" / "input_contract.md",
        bundle_dir / "references" / "output_contract.md",
        bundle_dir / "references" / "maintenance.md",
        bundle_dir / "MODEL_COMPATIBILITY.md",
        bundle_dir / "skill.lock.json",
    }

    assert expected_paths.issubset(set(written))
    assert (bundle_dir / "SKILL.md").read_text(encoding="utf-8").startswith("---\nname: native-skill")
    assert "target_platform: agents_python" in (bundle_dir / "SKILL.md").read_text(encoding="utf-8")
    assert (bundle_dir / "scripts" / "run.sh").stat().st_mode & stat.S_IXUSR
    assert (bundle_dir / "scripts" / "verify.sh").stat().st_mode & stat.S_IXUSR

    report = evaluate_native_skill_bundle(bundle_dir)
    assert report.pass_rate == pytest.approx(1.0)


def test_migrate_legacy_skill_bundle_creates_native_bundle(tmp_path: Path) -> None:
    legacy_dir = tmp_path / "legacy-skill"
    legacy_dir.mkdir()
    (legacy_dir / "SKILL.md").write_text(
        "---\nname: Legacy Skill\ndescription: Legacy description\nversion: 0.9.0\n---\n# Legacy\n",
        encoding="utf-8",
    )

    written = migrate_legacy_skill_bundle(legacy_dir)

    assert (legacy_dir / "skill.lock.json").exists()
    assert (legacy_dir / "scripts" / "run.sh").exists()
    assert (legacy_dir / "scripts" / "verify.sh").exists()
    assert any(path.name == "SKILL.md" for path in written)
    report = evaluate_native_skill_bundle(legacy_dir)
    assert report.pass_rate == pytest.approx(1.0)


def test_build_native_skill_files_includes_required_contracts() -> None:
    files = build_native_skill_files({"skill_name": "sample"})
    assert "SKILL.md" in files
    assert "skill.lock.json" in files
    lock = json.loads(files["skill.lock.json"])
    assert lock["target_platform"] == "agents_python"
