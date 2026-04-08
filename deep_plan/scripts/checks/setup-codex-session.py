#!/usr/bin/env python3
"""Setup planning session for deep-plan in Codex mode.

This variant intentionally avoids Claude Task list dependencies and only
prepares file-based state in the planning directory.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Add parent to path for lib imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib.config import ConfigError, get_or_create_session_config, save_session_config
from lib.sections import check_section_progress


ARTIFACT_CANDIDATES = {
    "research": ["research-notes.md", "claude-research.md"],
    "interview": ["interview-notes.md", "claude-interview.md"],
    "spec": ["implementation-spec.md", "claude-spec.md"],
    "plan": ["implementation-plan.md", "claude-plan.md"],
    "integration_notes": ["integration-notes.md", "claude-integration-notes.md"],
    "plan_tdd": ["implementation-plan-tdd.md", "claude-plan-tdd.md"],
}


def _artifact_exists(planning_dir: Path, key: str) -> bool:
    return any((planning_dir / name).exists() for name in ARTIFACT_CANDIDATES[key])


def _artifact_label(planning_dir: Path, key: str) -> str:
    for name in ARTIFACT_CANDIDATES[key]:
        if (planning_dir / name).exists():
            return name
    return ARTIFACT_CANDIDATES[key][0]


def scan_planning_files(planning_dir: Path) -> dict:
    """Scan planning directory for existing workflow files."""
    files = {
        "research": _artifact_exists(planning_dir, "research"),
        "interview": _artifact_exists(planning_dir, "interview"),
        "spec": _artifact_exists(planning_dir, "spec"),
        "plan": _artifact_exists(planning_dir, "plan"),
        "integration_notes": _artifact_exists(planning_dir, "integration_notes"),
        "plan_tdd": _artifact_exists(planning_dir, "plan_tdd"),
        "reviews": [],
        "sections": [],
        "sections_index": False,
    }

    reviews_dir = planning_dir / "reviews"
    if reviews_dir.exists():
        files["reviews"] = [f.name for f in reviews_dir.glob("*.md")]

    sections_dir = planning_dir / "sections"
    if sections_dir.exists():
        files["sections"] = [f.name for f in sections_dir.glob("section-*.md")]
        files["sections_index"] = (sections_dir / "index.md").exists()

    return files


def infer_resume_step(files: dict, section_progress: dict) -> tuple[int | None, str]:
    """Infer workflow resume step from existing artifacts.

    Returns:
        (resume_step, note)
        - resume_step=None means workflow is complete.
    """
    if files["sections_index"]:
        if not files["plan_tdd"]:
            return 16, "MISSING PREREQUISITE: implementation-plan-tdd.md - overwrite sections after step 16"

        section_state = section_progress["state"]
        if section_state == "complete":
            return None, "complete"
        if section_state in ("partial", "has_index"):
            return 19, f"sections {section_progress['progress']}, next: {section_progress['next_section']}"
        if section_state == "invalid_index":
            return 18, "invalid sections/index.md manifest; recreate index"

    if files["sections"]:
        if not files["plan_tdd"]:
            return 16, "MISSING PREREQUISITE: implementation-plan-tdd.md - overwrite sections after step 16"
        return 18, "section files exist but index missing"

    if files["plan_tdd"]:
        return 17, "TDD plan complete"

    if files["integration_notes"]:
        if not files["plan"]:
            return 11, "MISSING PREREQUISITE: implementation-plan.md - overwrite integration notes after step 11"
        return 15, "feedback integrated"

    if files["reviews"]:
        if not files["plan"]:
            return 11, "MISSING PREREQUISITE: implementation-plan.md - overwrite reviews after step 11"
        return 14, "external review complete"

    if files["plan"]:
        if not files["spec"]:
            return 10, "MISSING PREREQUISITE: implementation-spec.md - overwrite plan after step 10"
        return 12, "implementation plan complete"

    if files["spec"]:
        if not files["interview"]:
            return 9, "MISSING PREREQUISITE: interview-notes.md - overwrite spec after step 9"
        return 11, "spec complete"

    if files["interview"]:
        return 10, "interview complete"

    if files["research"]:
        return 8, "research complete"

    return 6, "none"


def build_files_summary(files: dict, section_progress: dict) -> list[str]:
    summary: list[str] = []
    planning_dir = Path(section_progress["planning_dir"])
    if files["research"]:
        summary.append(_artifact_label(planning_dir, "research"))
    if files["interview"]:
        summary.append(_artifact_label(planning_dir, "interview"))
    if files["spec"]:
        summary.append(_artifact_label(planning_dir, "spec"))
    if files["plan"]:
        summary.append(_artifact_label(planning_dir, "plan"))
    if files["integration_notes"]:
        summary.append(_artifact_label(planning_dir, "integration_notes"))
    if files["plan_tdd"]:
        summary.append(_artifact_label(planning_dir, "plan_tdd"))
    if files["reviews"]:
        summary.append(f"reviews/ ({len(files['reviews'])} files)")
    if files["sections"] or files["sections_index"]:
        state = section_progress["state"]
        progress = section_progress["progress"]
        if state == "complete":
            summary.append(f"sections/ ({progress} complete)")
        else:
            summary.append(f"sections/ ({progress}, {state})")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Setup deep-plan Codex session")
    parser.add_argument("--file", required=True, help="Path to markdown spec file")
    parser.add_argument("--plugin-root", required=True, help="Path to deep_plan plugin root")
    parser.add_argument(
        "--review-mode",
        choices=["external_llm", "self_review", "skip"],
        default="external_llm",
        help="Review mode for this planning session",
    )
    args = parser.parse_args()

    file_path = Path(args.file)
    plugin_root = Path(args.plugin_root)
    review_mode = args.review_mode

    if not plugin_root.exists():
        print(json.dumps({"success": False, "error": f"Plugin root not found: {plugin_root}"}))
        return 1

    if not file_path.exists():
        print(json.dumps({"success": False, "error": f"Spec file not found: {file_path}"}))
        return 1

    if file_path.is_dir():
        print(json.dumps({"success": False, "error": f"Expected a spec file, got a directory: {file_path}"}))
        return 1

    if file_path.suffix.lower() != ".md":
        print(json.dumps({"success": False, "error": f"Spec file must be markdown (.md): {file_path}"}))
        return 1

    content = file_path.read_text().strip()
    if not content:
        print(json.dumps({"success": False, "error": f"Spec file is empty: {file_path}"}))
        return 1

    planning_dir = file_path.parent.resolve()

    try:
        config, _ = get_or_create_session_config(
            planning_dir=planning_dir,
            plugin_root=str(plugin_root.resolve()),
            initial_file=str(file_path.resolve()),
        )
    except ConfigError as e:
        print(json.dumps({"success": False, "error": str(e)}))
        return 1

    config["review_mode"] = review_mode
    save_session_config(planning_dir, config)

    files = scan_planning_files(planning_dir)
    section_progress = check_section_progress(planning_dir)
    section_progress["planning_dir"] = str(planning_dir)
    resume_step, resume_note = infer_resume_step(files, section_progress)

    files_summary = build_files_summary(files, section_progress)
    mode = "resume" if files_summary else "new"

    if resume_step is None:
        message = "Planning workflow complete - all sections written"
    elif mode == "resume":
        message = f"Resuming from step {resume_step}. Last completed: {resume_note}"
    else:
        message = f"Starting new planning session in: {planning_dir}"

    result = {
        "success": True,
        "workflow_backend": "file_based",
        "task_list_required": False,
        "mode": mode,
        "planning_dir": str(planning_dir),
        "initial_file": str(file_path.resolve()),
        "plugin_root": str(plugin_root.resolve()),
        "review_mode": review_mode,
        "resume_from_step": resume_step,
        "message": message,
        "files_found": files_summary,
        "task_list_id": None,
        "task_list_source": "none",
        "tasks_written": 0,
        "section_progress": {
            "state": section_progress["state"],
            "progress": section_progress["progress"],
            "next_section": section_progress["next_section"],
        },
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
