"""Tests for check-ui-contracts.py script."""

import json
import subprocess
from pathlib import Path


def run_checker(planning_dir: Path):
    script = Path(__file__).parent.parent / "scripts" / "checks" / "check-ui-contracts.py"
    return subprocess.run(
        ["uv", "run", str(script), "--planning-dir", str(planning_dir), "--json"],
        capture_output=True,
        text=True,
        timeout=10,
    )


def test_non_ui_section_passes(tmp_path: Path):
    sections = tmp_path / "sections"
    sections.mkdir()
    (sections / "section-01-api.md").write_text(
        "# Section 01\n\nBackend endpoint and database migration only.\n",
        encoding="utf-8",
    )

    result = run_checker(tmp_path)

    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["ui_sections"] == 0


def test_ui_section_requires_contract_headings(tmp_path: Path):
    sections = tmp_path / "sections"
    sections.mkdir()
    (sections / "section-01-ui.md").write_text(
        "# Section 01\n\nBuild React page and responsive UI.\n",
        encoding="utf-8",
    )

    result = run_checker(tmp_path)

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert "### Copy Contract" in payload["failures"][0]["missing"]


def test_complete_ui_contract_passes(tmp_path: Path):
    sections = tmp_path / "sections"
    sections.mkdir()
    headings = "\n\n".join(
        [
            "## UI/UX Contract",
            "### Target User / JTBD",
            "### Surface Inventory",
            "### Component Map",
            "### State Matrix",
            "### Responsive Matrix",
            "### Accessibility Acceptance",
            "### Copy Contract",
            "### Browser Evidence Required",
        ]
    )
    (sections / "section-01-ui.md").write_text(
        f"# Section 01\n\nBuild React page.\n\n{headings}\n",
        encoding="utf-8",
    )

    result = run_checker(tmp_path)

    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["ui_sections"] == 1
