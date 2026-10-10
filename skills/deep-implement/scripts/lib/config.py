"""
Configuration management for deep-implement sessions.

Handles loading, saving, and updating session configuration including
per-section implementation checkpoints and evidence-gated outcome state.
"""

from pathlib import Path
import json
from datetime import datetime, timezone
from typing import Any

CONFIG_FILE = "deep_implement_config.json"


def load_session_config(implementation_dir: Path) -> dict | None:
    """
    Load existing session config from implementation directory.

    Args:
        implementation_dir: Path to implementation directory

    Returns:
        Config dict if found, None otherwise
    """
    config_path = Path(implementation_dir) / CONFIG_FILE
    if not config_path.exists():
        return None

    with open(config_path) as f:
        return json.load(f)


def save_session_config(implementation_dir: Path, config: dict) -> None:
    """
    Save session config to implementation directory.

    Creates the directory if it doesn't exist.

    Args:
        implementation_dir: Path to implementation directory
        config: Config dict to save
    """
    impl_dir = Path(implementation_dir)
    impl_dir.mkdir(parents=True, exist_ok=True)

    config_path = impl_dir / CONFIG_FILE
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)


def create_session_config(
    plugin_root: Path,
    sections_dir: Path,
    target_dir: Path,
    state_dir: Path,
    git_root: Path,
    commit_style: str,
    test_command: str = "uv run pytest",
    sections: list[str] | None = None,
    pre_commit: dict | None = None,
) -> dict:
    """
    Create a new session config with all required fields.

    Args:
        plugin_root: Path to the deep-implement plugin
        sections_dir: Path to sections directory
        target_dir: Path to target directory for implementation code
        state_dir: Path to state directory for session config and reviews
        git_root: Git repository root path
        commit_style: Detected commit style ("conventional", "simple", "unknown")
        test_command: Command to run tests
        sections: List of section names from manifest
        pre_commit: Pre-commit hook configuration dict

    Returns:
        New config dict
    """
    return {
        "plugin_root": str(plugin_root),
        "sections_dir": str(sections_dir),
        "target_dir": str(target_dir),
        "state_dir": str(state_dir),
        "git_root": str(git_root),
        "commit_style": commit_style,
        "test_command": test_command,
        "sections": sections or [],
        "sections_state": {},
        "pre_commit": pre_commit or {
            "present": False,
            "type": "none",
            "may_modify_files": False,
            "detected_formatters": []
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def update_section_state(
    implementation_dir: Path,
    section_name: str,
    status: str,
    commit_hash: str | None = None,
    review_file: str | None = None,
    pre_commit: dict | None = None,
) -> None:
    """
    Update per-section completion state in session config.

    Args:
        implementation_dir: Path to implementation directory
        section_name: Name of section to update
        status: New status ("in_progress", "checkpointed")
        commit_hash: Git commit hash for the implementation checkpoint
        review_file: Review file name if review written
        pre_commit: Pre-commit handling info for this section
    """
    config = load_session_config(implementation_dir)
    if config is None:
        raise ValueError(f"No config found in {implementation_dir}")

    if "sections_state" not in config:
        config["sections_state"] = {}

    state: dict[str, Any] = {"status": status}

    if commit_hash is not None:
        state["checkpoint_sha"] = commit_hash

    if review_file is not None:
        state["review_file"] = review_file

    if pre_commit is not None:
        state["pre_commit"] = pre_commit

    if status == "checkpointed":
        state["checkpointed_at"] = datetime.now(timezone.utc).isoformat()

    config["sections_state"][section_name] = state
    save_session_config(implementation_dir, config)


def update_outcome_state(implementation_dir: Path, outcome: dict[str, Any]) -> str:
    """Persist requirement/evidence closure separately from section checkpoints."""
    config = load_session_config(implementation_dir)
    if config is None:
        raise ValueError(f"No config found in {implementation_dir}")
    from scripts.lib.shared_lifecycle_policy import load_shared_lifecycle_policy

    policy = load_shared_lifecycle_policy(config.get("plugin_root"))
    complete = policy.implementation_outcome_complete(
        outcome.get("requirements", []),
        integrated=outcome.get("integrated", False),
        required_verification_fresh=outcome.get("required_verification_fresh", False),
        task_regressions_clear=outcome.get("task_regressions_clear", False),
        deployment_required=outcome.get("deployment_required", False),
        deployed=outcome.get("deployed", False),
        acceptance_required=outcome.get("acceptance_required", False),
        accepted=outcome.get("accepted", False),
        authority_resolved=outcome.get("authority_resolved", False),
        canonical_verified=outcome.get("canonical_verified", False),
    )
    config["outcome"] = outcome
    config["outcome_state"] = "IMPLEMENTATION_COMPLETE" if complete else "VALIDATION_PENDING"
    config["workspace_convergence_state"] = (
        "COMPLETE"
        if outcome.get("user_workspace_converged") is True and outcome.get("worktree_lifecycle_settled") is True
        else "PENDING"
    )
    save_session_config(implementation_dir, config)
    return config["outcome_state"]
