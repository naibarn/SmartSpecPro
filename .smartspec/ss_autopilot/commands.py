from __future__ import annotations

from typing import Dict, Any

from .platform import format_workflow_command, get_platform_flag


def workflow_key_to_report_dir(workflow_key: str) -> str:
    """Map a workflow key (usually the filename stem) to a report directory name.

    Conventions:
    - workflow_key is the workflow file stem (e.g. `smartspec_generate_spec`).
    - report directory is kebab-case WITHOUT the `smartspec_` prefix
      (e.g. `generate-spec`).

    This keeps existing report paths stable while allowing workflow identifiers
    to follow the filename/key standard.
    """
    # Keep backwards-compatible report directory names for workflows whose
    # filename includes implementation details (e.g. "_runner", "_checkboxes").
    overrides = {
        "smartspec_sync_tasks_checkboxes": "sync-tasks",
        "smartspec_test_suite_runner": "test-suite",
    }
    if workflow_key in overrides:
        return overrides[workflow_key]

    key = workflow_key
    if key.startswith("smartspec_"):
        key = key[len("smartspec_") :]
    return key.replace("_", "-")


def build_slash_command(cfg: Dict[str, Any], platform: str, workflow_key: str, *args: str) -> str:
    """Build a platform-specific slash command.

    Priority:
    1) Project config override: cfg['commands'][platform][workflow_key]
    2) Derived default: `/{workflow_key}.md` + platform flag (for kilo/antigravity)
    """
    cmd_base = (
        cfg.get("commands", {})
        .get(platform, {})
        .get(workflow_key)
    )

    if not cmd_base:
        # Derived default (P0 standard): Kilo uses `/{workflow_key}.md`.
        base = format_workflow_command(platform, workflow_key)
        flag = get_platform_flag(platform)
        cmd_base = f"{base} {flag}".strip() if flag else base

    parts = [cmd_base] + list(args)
    return " ".join([p for p in parts if p])


def default_out_dir(workflow_key: str, spec_id: str) -> str:
    """Default output directory under .spec/reports.

    Note: we keep the historical path shape `.spec/reports/<kebab>/<specid>`.
    """
    safe = spec_id.replace("spec-", "")
    report_dir = workflow_key_to_report_dir(workflow_key)
    return f".spec/reports/{report_dir}/{safe}"
