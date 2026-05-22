#!/usr/bin/env python3
"""Validate UI/UX contract coverage in deep-plan section files."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path


UI_HINTS = [
    "ui",
    "ux",
    "browser-visible",
    ".tsx",
    "react",
    "frontend",
    "page",
    "dialog",
    "form",
    "responsive",
    "accessibility",
    "visual",
    "copy",
]

REQUIRED_HEADINGS = [
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


@dataclass
class SectionResult:
    path: str
    ui_affecting: bool
    missing: list[str]

    @property
    def ok(self) -> bool:
        return not self.ui_affecting or not self.missing


def is_ui_affecting(text: str) -> bool:
    lower = text.lower()
    if "## ui/ux contract" in lower:
        return True
    return any(hint in lower for hint in UI_HINTS)


def check_section(path: Path) -> SectionResult:
    text = path.read_text(encoding="utf-8")
    ui_affecting = is_ui_affecting(text)
    missing = [heading for heading in REQUIRED_HEADINGS if heading not in text] if ui_affecting else []
    return SectionResult(path=str(path), ui_affecting=ui_affecting, missing=missing)


def check_planning_dir(planning_dir: Path) -> list[SectionResult]:
    sections_dir = planning_dir / "sections"
    if not sections_dir.exists():
        raise FileNotFoundError(f"missing sections directory: {sections_dir}")
    section_files = sorted(sections_dir.glob("section-*.md"))
    return [check_section(path) for path in section_files]


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate UI/UX contract headings in deep-plan sections")
    parser.add_argument("--planning-dir", required=True, help="Path to a deep-plan planning directory")
    parser.add_argument("--json", action="store_true", help="Output JSON instead of text")
    args = parser.parse_args()

    results = check_planning_dir(Path(args.planning_dir))
    failed = [result for result in results if not result.ok]

    if args.json:
        print(
            json.dumps(
                {
                    "ok": not failed,
                    "checked": len(results),
                    "ui_sections": sum(1 for result in results if result.ui_affecting),
                    "failures": [
                        {"path": result.path, "missing": result.missing} for result in failed
                    ],
                },
                indent=2,
            )
        )
    else:
        print(f"checked {len(results)} section files")
        print(f"ui-affecting sections: {sum(1 for result in results if result.ui_affecting)}")
        for result in failed:
            print(f"FAIL {result.path}")
            for heading in result.missing:
                print(f"  missing {heading}")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
