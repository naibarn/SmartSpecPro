"""
Configuration management for deep-implement sessions.

Handles loading, saving, and updating session configuration including
per-section implementation checkpoints and evidence-gated outcome state.
"""

from pathlib import Path
import os
import tempfile
import json
from contextlib import contextmanager
from collections.abc import Callable
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


# State JSON is authoritative. HANDOFF.md is a regenerable inspection view.
HANDOFF_FILE = "HANDOFF.md"
HISTORY_FILE = "handoff_history.jsonl"
LOCK_FILE = ".deep_implement_state.lock"


@contextmanager
def _state_lock(directory: Path):
    """Serialize writers of one implementation state across agent processes.

    Advisory OS file lock: not an approval gate; it is held only while doing I/O.
    """
    directory.mkdir(parents=True, exist_ok=True)
    lock_path = directory / LOCK_FILE
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        if os.name == "nt":
            import msvcrt
            if os.fstat(fd).st_size == 0:
                os.write(fd, b"0")
            os.lseek(fd, 0, os.SEEK_SET)
            msvcrt.locking(fd, msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(fd, fcntl.LOCK_EX)
        try:
            yield
        finally:
            if os.name == "nt":
                os.lseek(fd, 0, os.SEEK_SET)
                msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)


def _atomic_write(path: Path, contents: str) -> None:
    """Never truncate the previous checkpoint or handoff on failed replacement."""
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent,
            prefix=f".{path.name}.", delete=False,
        ) as stream:
            temp_path = Path(stream.name)
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_path, path)
        if os.name != "nt":
            dir_fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def render_handoff(config: dict) -> str:
    """Human-readable, non-authoritative view of durable implementation state."""
    sections = config.get("sections", [])
    states = config.get("sections_state", {})
    progress = config.get("progress", {})
    lines = [
        "# Deep Implement — Live HandOff", "",
        "Generated from `deep_implement_config.json`. Read this at any time;",
        "on resume, reconcile recorded SHA values with Git/PR state.", "",
        f"- State generation: `{config.get('generation', 0)}`",
        f"- Updated (UTC): `{config.get('updated_at', 'unknown')}`",
        f"- Sections source: `{config.get('sections_dir', 'unknown')}`",
        f"- Target checkout: `{config.get('target_dir', 'unknown')}`",
        f"- Worktree: `{progress.get('worktree', config.get('target_dir', 'unknown'))}`",
        f"- Latest recorded merged Main SHA: `{progress.get('merged_main_sha') or 'NOT_VERIFIED'}`",
        f"- Outcome: `{config.get('outcome_state', 'NOT_ACCEPTED')}`",
        f"- Active section: `{progress.get('active_section') or 'none'}`",
        f"- Next action: {progress.get('next_action') or 'Inspect Git/PR reality and resume first incomplete section'}",
        "", "## Sections", "",
        "| Section | Stage | Owner/session | Worktree | Local checkpoint | Merged Main | Next action |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for name in dict.fromkeys([*sections, *states.keys()]):
        st = states.get(name, {})
        def safe(value):
            return str(value or "—").replace("|", "\\|").replace("\n", " ")
        lines.append(f"| {safe(name)} | {safe(st.get('status', 'pending'))} | "
                     f"{safe(st.get('session_id'))} | {safe(st.get('worktree'))} | "
                     f"{safe(st.get('checkpoint_sha'))} | {safe(st.get('merged_main_sha'))} | "
                     f"{safe(st.get('next_action'))} |")
    lines.extend(["", "## Open gaps / blockers (not automatic merge blockers)", ""])
    gaps = progress.get("gaps", [])
    if gaps:
        lines.extend(f"- {str(g).replace(chr(10), ' ')}" for g in gaps)
    else:
        lines.append("- None recorded; this does not imply final acceptance.")
    lines.extend(["", "## Resume", "",
                  "1. Read this file and `deep_implement_config.json`.",
                  "2. Check current Git HEAD, actual commits, worktree ownership and PR merge status.",
                  "3. Recover any committed-but-unrecorded or merged-but-unrecorded work before replaying.",
                  "4. Continue the next incomplete step; do not reset dirty files or re-open merged PRs.", ""])
    return "\n".join(lines)


def _persist_locked(directory: Path, config: dict, *, reason: str) -> None:
    """One authoritative state, a read-only projection, and a best-effort journal."""
    config["generation"] = int(config.get("generation", 0)) + 1
    config["updated_at"] = datetime.now(timezone.utc).isoformat()
    _atomic_write(directory / CONFIG_FILE, json.dumps(config, indent=2, ensure_ascii=False) + "\n")
    # The projection is recoverable from the authoritative JSON even if a crash
    # occurs between the two replaces.
    _atomic_write(directory / HANDOFF_FILE, render_handoff(config))
    event = {"generation": config["generation"], "at": config["updated_at"],
             "reason": reason, "active_section": config.get("progress", {}).get("active_section"),
             "merged_main_sha": config.get("progress", {}).get("merged_main_sha"),
             "next_action": config.get("progress", {}).get("next_action"),
             "open_gap_count": len(config.get("progress", {}).get("gaps", []))}
    with open(directory / HISTORY_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")
        f.flush()
        os.fsync(f.fileno())


def refresh_handoff(implementation_dir: Path) -> Path | None:
    """Repair stale/missing inspection view after interrupted multi-file write."""
    directory = Path(implementation_dir)
    with _state_lock(directory):
        config = load_session_config(directory)
        if config is None:
            return None
        handoff = directory / HANDOFF_FILE
        expected = render_handoff(config)
        if not handoff.exists() or handoff.read_text(encoding="utf-8") != expected:
            _atomic_write(handoff, expected)
        return handoff


def mutate_session_config(implementation_dir: Path, mutator: Callable[[dict], None], *,
                          reason: str = "checkpoint") -> dict:
    """Atomic read-modify-write so parallel sections cannot lose checkpoints."""
    directory = Path(implementation_dir)
    with _state_lock(directory):
        current = load_session_config(directory)
        if current is None:
            raise ValueError(f"No config found in {directory}")
        mutator(current)
        _persist_locked(directory, current, reason=reason)
        return current


def save_session_config(implementation_dir: Path, config: dict) -> None:
    """Save a new/loaded config; reject stale-generation overwrites."""
    directory = Path(implementation_dir)
    with _state_lock(directory):
        current = load_session_config(directory)
        if current is not None and "generation" in config:
            if config["generation"] != current.get("generation", 0):
                raise ValueError("STALE_STATE: reload before writing session config")
        _persist_locked(directory, config, reason="config_save")


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
    def apply(config: dict) -> None:
        state = dict(config.setdefault("sections_state", {}).get(section_name, {}))
        state["status"] = status
        if commit_hash is not None:
            state["checkpoint_sha"] = commit_hash
        if review_file is not None:
            state["review_file"] = review_file
        if pre_commit is not None:
            state["pre_commit"] = pre_commit
        if status == "checkpointed":
            state["checkpointed_at"] = datetime.now(timezone.utc).isoformat()
        config["sections_state"][section_name] = state
        config.setdefault("progress", {})["active_section"] = section_name
    mutate_session_config(implementation_dir, apply, reason=f"section:{section_name}:{status}")

def update_outcome_state(implementation_dir: Path, outcome: dict[str, Any]) -> str:
    """Persist requirement/evidence closure separately from section checkpoints."""
    def apply(config: dict) -> None:
        from scripts.lib.shared_lifecycle_policy import load_shared_lifecycle_policy

        policy = load_shared_lifecycle_policy(config.get("plugin_root"))
        complete = policy.outcome_complete(
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
            user_workspace_converged=outcome.get("user_workspace_converged", False),
            worktree_lifecycle_settled=outcome.get("worktree_lifecycle_settled", False),
        )
        config["outcome"] = outcome
        config["outcome_state"] = "COMPLETE" if complete else "VALIDATION_PENDING"
    updated = mutate_session_config(implementation_dir, apply, reason="outcome_evidence")
    return updated["outcome_state"]
