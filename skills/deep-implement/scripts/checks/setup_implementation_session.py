#!/usr/bin/env python3
"""
Setup script for deep-implement sessions.

Validates sections directory, detects git configuration, checks pre-commit hooks,
infers resume state, and generates TODOs for the skill.

Usage:
    uv run scripts/checks/setup_implementation_session.py \
        --sections-dir <path> \
        --plugin-root <path>
"""

import argparse
import json
import subprocess
import sys
import re
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from scripts.lib.config import load_session_config, save_session_config, create_session_config, refresh_handoff, HANDOFF_FILE
from scripts.lib.sections import parse_manifest_block, parse_project_config_block, validate_section_file, get_checkpointed_sections
from scripts.lib.shared_lifecycle_policy import load_shared_lifecycle_policy
from scripts.lib.task_storage import TaskToWrite, write_tasks, build_dependency_graph, TaskStatus
from scripts.lib.task_reconciliation import TaskListContext
from scripts.lib.impl_tasks import (
    SECTION_STEP_IDS,
    SECTION_STEP_DEFINITIONS,
    FINALIZATION_TASK,
    RESUME_STEP_COMPLETE_MAPPING,
    CONTEXT_ITEM_KEYS,
    format_display_name,
)


# Known formatters that modify files
KNOWN_FORMATTERS = {
    # Python
    "black", "isort", "autopep8", "yapf", "blue",
    # Python with specific IDs
    "ruff-format",
    # JavaScript/TypeScript
    "prettier", "eslint-fix",
    # Rust
    "fmt", "rustfmt",
    # Go
    "gofmt", "goimports",
    # General
    "end-of-file-fixer", "trailing-whitespace",
}

# Partial matches for formatters (repo URLs or IDs containing these)
FORMATTER_PATTERNS = [
    "black", "isort", "autopep8", "yapf", "prettier",
    "rustfmt", "gofmt", "goimports", "ruff",
]


def validate_sections_dir(sections_dir: Path) -> dict:
    """
    Validate sections directory structure.

    Checks:
    1. Path exists and is a directory
    2. index.md exists
    3. index.md has valid PROJECT_CONFIG block
    4. index.md has valid SECTION_MANIFEST block
    5. All manifest sections have corresponding files
    6. All section files have content

    Args:
        sections_dir: Path to sections directory

    Returns:
        {"valid": bool, "error": str | None, "sections": list[str], "project_config": dict}
    """
    sections_dir = Path(sections_dir)

    if not sections_dir.exists():
        return {"valid": False, "error": f"Sections directory does not exist: {sections_dir}", "sections": [], "project_config": {}}

    if not sections_dir.is_dir():
        return {"valid": False, "error": f"Path is not a directory: {sections_dir}", "sections": [], "project_config": {}}

    index_path = sections_dir / "index.md"
    if not index_path.exists():
        return {"valid": False, "error": f"index.md not found in {sections_dir}", "sections": [], "project_config": {}}

    # Parse index.md
    index_content = index_path.read_text()

    # Parse project config
    project_config = parse_project_config_block(index_content)
    if not project_config:
        example = """<!-- PROJECT_CONFIG
runtime: python-uv
test_command: uv run pytest
END_PROJECT_CONFIG -->"""
        return {
            "valid": False,
            "error": f"No valid PROJECT_CONFIG block found.\n\nFile: {index_path}\n\nAdd this block at the top of index.md (before SECTION_MANIFEST):\n\n{example}",
            "sections": [],
            "project_config": {}
        }

    # Validate required config fields
    required_fields = ["runtime", "test_command"]
    missing_fields = [f for f in required_fields if f not in project_config]
    if missing_fields:
        example_fields = "\n".join(f"{f}: <value>" for f in missing_fields)
        return {
            "valid": False,
            "error": f"PROJECT_CONFIG missing required fields: {', '.join(missing_fields)}\n\nFile: {index_path}\n\nAdd these fields to the PROJECT_CONFIG block:\n\n{example_fields}",
            "sections": [],
            "project_config": project_config
        }

    # Parse manifest
    sections = parse_manifest_block(index_content)

    if not sections:
        return {"valid": False, "error": "No valid SECTION_MANIFEST block found in index.md", "sections": [], "project_config": project_config}

    # Validate each section file
    for section in sections:
        section_path = sections_dir / f"{section}.md"
        result = validate_section_file(section_path)
        if not result["valid"]:
            return {"valid": False, "error": result["error"], "sections": sections, "project_config": project_config}

    return {"valid": True, "error": None, "sections": sections, "project_config": project_config}


def check_git_repo(target_dir: Path) -> dict:
    """
    Check if target is in a git repository.

    Args:
        target_dir: Directory to check

    Returns:
        {"available": bool, "root": str | None}
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=target_dir,
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            return {"available": True, "root": result.stdout.strip()}
    except Exception:
        pass

    return {"available": False, "root": None}


# Protected branch patterns
PROTECTED_BRANCHES = {"main", "master"}
PROTECTED_BRANCH_PREFIXES = ("release/", "release-", "hotfix/", "hotfix-")


def check_current_branch(git_root: Path) -> dict:
    """
    Check current git branch and if it's a protected branch.

    Args:
        git_root: Git repository root

    Returns:
        {"branch": str | None, "is_protected": bool}
    """
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=git_root,
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            branch = result.stdout.strip()
            is_protected = (
                branch in PROTECTED_BRANCHES or
                branch.startswith(PROTECTED_BRANCH_PREFIXES)
            )
            return {"branch": branch, "is_protected": is_protected}
    except Exception:
        pass

    return {"branch": None, "is_protected": False}


def check_working_tree_status(git_root: Path) -> dict:
    """
    Check if working tree is clean.

    Args:
        git_root: Git repository root

    Returns:
        {"clean": bool, "dirty_files": list[str]}
    """
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=git_root,
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            lines = [l for l in result.stdout.strip().split('\n') if l]
            dirty_files = []
            for line in lines:
                # Format: XY filename (XY are 2 status chars, then space, then filename)
                # Use split to handle various formats robustly
                parts = line.split(maxsplit=1)
                if len(parts) >= 2:
                    dirty_files.append(parts[1].strip())
                elif len(parts) == 1 and len(line) > 2:
                    # Fallback: just strip the status chars
                    dirty_files.append(line[3:].strip())
            return {"clean": len(dirty_files) == 0, "dirty_files": dirty_files}
    except Exception:
        pass

    return {"clean": True, "dirty_files": []}


def detect_commit_style(git_root: Path) -> str:
    """
    Detect commit message style from git history.

    Args:
        git_root: Git repository root

    Returns:
        "conventional" | "simple" | "unknown"
    """
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", "-20", "--format=%s"],
            cwd=git_root,
            capture_output=True,
            text=True
        )
        if result.returncode != 0 or not result.stdout.strip():
            return "unknown"

        messages = result.stdout.strip().split('\n')

        # Check for conventional commit patterns
        conventional_pattern = re.compile(r'^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?!?:')
        conventional_count = sum(1 for msg in messages if conventional_pattern.match(msg))

        if conventional_count >= len(messages) * 0.5:  # 50% threshold
            return "conventional"
        elif messages:
            return "simple"
        else:
            return "unknown"

    except Exception:
        return "unknown"


def validate_path_safety(path: Path, allowed_root: Path) -> bool:
    """
    Ensure path is under allowed_root after normalization.

    Rejects absolute paths outside root and '..' traversal.

    Args:
        path: Path to validate
        allowed_root: Root directory that paths must be under
    """
    try:
        resolved_path = Path(path).resolve()
        resolved_root = Path(allowed_root).resolve()

        return (
            resolved_path == resolved_root
            or resolved_root in resolved_path.parents
        )
    except Exception:
        return False


def check_pre_commit_hooks(git_root: Path) -> dict:
    """
    Detect pre-commit hook configuration.

    Checks:
    1. .pre-commit-config.yaml (pre-commit framework)
    2. .git/hooks/pre-commit (native hook)
    3. Parses YAML for known formatters

    Args:
        git_root: Git repository root

    Returns:
        {
            "present": bool,
            "type": "pre-commit-framework" | "native-hook" | "both" | "none",
            "config_file": str | None,
            "native_hook": str | None,
            "may_modify_files": bool,
            "detected_formatters": list[str]
        }
    """
    git_root = Path(git_root)

    pre_commit_config = git_root / ".pre-commit-config.yaml"
    native_hook = git_root / ".git" / "hooks" / "pre-commit"

    has_framework = pre_commit_config.exists()
    has_native = native_hook.exists() and bool(native_hook.stat().st_mode & 0o111)  # executable

    detected_formatters = []
    may_modify_files = False

    # Parse pre-commit config for formatters
    if has_framework:
        try:
            content = pre_commit_config.read_text()
            # Simple YAML parsing for hook IDs
            # Look for "- id: <hook_id>" patterns
            for line in content.split('\n'):
                line = line.strip()
                if line.startswith('- id:'):
                    hook_id = line.replace('- id:', '').strip()
                    # Check if this is a known formatter
                    if hook_id in KNOWN_FORMATTERS:
                        detected_formatters.append(hook_id)
                        may_modify_files = True
                    else:
                        # Check partial matches
                        for pattern in FORMATTER_PATTERNS:
                            if pattern in hook_id.lower():
                                detected_formatters.append(hook_id)
                                may_modify_files = True
                                break

                # Also check repo URLs for formatter patterns
                if line.startswith('- repo:'):
                    repo_url = line.replace('- repo:', '').strip()
                    for pattern in FORMATTER_PATTERNS:
                        if pattern in repo_url.lower():
                            # This repo likely has formatters
                            pass  # Will be caught by hook ID check
        except Exception:
            pass

    # Determine type
    if has_framework and has_native:
        hook_type = "both"
    elif has_framework:
        hook_type = "pre-commit-framework"
    elif has_native:
        hook_type = "native-hook"
        may_modify_files = True  # Unknown, assume it might
    else:
        hook_type = "none"

    return {
        "present": has_framework or has_native,
        "type": hook_type,
        "config_file": str(pre_commit_config) if has_framework else None,
        "native_hook": str(native_hook) if has_native else None,
        "may_modify_files": may_modify_files,
        "detected_formatters": detected_formatters
    }


def detect_section_review_state(state_dir: Path, section_name: str) -> dict:
    """
    Detect the code review state for a specific section.

    Checks for existence of code review files:
    - section-NN-diff.md: Diff generated for review
    - section-NN-review.md: Review findings from subagent
    - section-NN-interview.md: Interview transcript (decisions recorded)

    Recovery logic is simple and robust:
    - Interview exists → apply fixes from beginning (Claude will notice already-applied fixes)
    - No interview but review exists → start interview
    - No review but diff exists → run review subagent
    - Nothing exists → start implementation

    The commit is the definitive checkpoint - if section has a valid commit,
    it's in completed_sections and won't reach this function.

    Args:
        state_dir: Path to implementation/state directory
        section_name: Section name (e.g., "section-01-foundation")

    Returns:
        {
            "has_diff": bool,
            "has_review": bool,
            "has_interview": bool,
            "resume_step": str  # Which step to resume from
        }
    """
    code_review_dir = state_dir / "code_review"

    # Extract section number for file naming (e.g., "section-01-foundation" -> "01")
    section_num = section_name.split("-")[1] if "-" in section_name else "00"

    diff_file = code_review_dir / f"section-{section_num}-diff.md"
    review_file = code_review_dir / f"section-{section_num}-review.md"
    interview_file = code_review_dir / f"section-{section_num}-interview.md"

    has_diff = diff_file.exists()
    has_review = review_file.exists()
    has_interview = interview_file.exists()

    # Determine which step to resume from based on file existence
    # No Status field introspection - files are the source of truth
    if has_interview:
        # Interview recorded, apply fixes from beginning
        # Claude will notice already-applied fixes as it works
        resume_step = "apply_fixes"
    elif has_review:
        resume_step = "interview"
    elif has_diff:
        resume_step = "review"
    else:
        resume_step = "implement"

    return {
        "has_diff": has_diff,
        "has_review": has_review,
        "has_interview": has_interview,
        "resume_step": resume_step
    }


def infer_session_state(
    sections_dir: Path,
    implementation_dir: Path,
    git_root: Path
) -> dict:
    """
    Determine if this is a new or resume session.

    Args:
        sections_dir: Path to sections directory
        implementation_dir: Path to implementation directory
        git_root: Git repository root

    Returns:
        {
            "mode": "new" | "resume" | "implementation_complete" | "complete",
            "completed_sections": list[str],
            "resume_from": str | None,
            "resume_section_state": dict | None  # Code review state for resume section
        }
    """
    implementation_dir = Path(implementation_dir)

    # Check for existing config
    config = load_session_config(implementation_dir)
    if config is None:
        return {
            "mode": "new",
            "completed_sections": [],
            "resume_from": None,
            "resume_section_state": None
        }

    # Get completed sections
    checkpointed = get_checkpointed_sections(implementation_dir, git_root)
    all_sections = config.get("sections", [])
    outcome = config.get("outcome", {})
    policy = load_shared_lifecycle_policy(config.get("plugin_root"))
    outcome_complete = policy.outcome_complete(
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

    if len(checkpointed) >= len(all_sections) and all_sections:
        return {
            "mode": "complete" if outcome_complete else "implementation_complete",
            "checkpointed_sections": checkpointed,
            "completed_sections": checkpointed,
            "outcome_complete": outcome_complete,
            "resume_from": None,
            "resume_section_state": None
        }

    # Find first incomplete section
    resume_from = None
    for section in all_sections:
        if section not in checkpointed:
            resume_from = section
            break

    # Detect code review state for the section being resumed
    resume_section_state = None
    if resume_from:
        resume_section_state = detect_section_review_state(implementation_dir, resume_from)

    return {
        "mode": "resume",  # an existing config must never be re-created without checkpoints
        "checkpointed_sections": checkpointed,
        "completed_sections": checkpointed,
        "outcome_complete": False,
        "resume_from": resume_from,
        "resume_section_state": resume_section_state
    }


def generate_implementation_tasks(
    sections: list[str],
    completed_sections: list[str],
    resume_section: str | None,
    resume_section_state: dict | None,
    context_values: dict[str, str],
    outcome_complete: bool = False,
) -> list[TaskToWrite]:
    """Generate implementation tasks for direct file write.

    Args:
        sections: List of section names from manifest
        completed_sections: List of already completed section names
        resume_section: Section name being resumed (if any)
        resume_section_state: Code review state for resume section
        context_values: Dict of context values to persist (paths, settings)

    Returns:
        List of TaskToWrite ready for write_tasks()
    """
    tasks: list[TaskToWrite] = []
    position = 1

    # Context tasks (at start, with values in subject for recovery)
    # Context remains visible for interruption recovery; it is not a task gate
    for key in CONTEXT_ITEM_KEYS:
        if key in context_values:
            value = context_values[key]
            tasks.append(TaskToWrite(
                position=position,
                subject=f"{key}={value}",
                status=TaskStatus.PENDING,
                description=f"Session context: {key}",
                active_form=f"Context: {key}",
            ))
            position += 1

    # Determine completed steps for resume section
    resume_steps_complete: set[str] = set()
    if resume_section and resume_section_state:
        resume_step = resume_section_state.get("resume_step", "implement")
        resume_steps_complete = RESUME_STEP_COMPLETE_MAPPING.get(resume_step, set())

    # Section tasks
    for section_index, section in enumerate(sections):
        display_name = format_display_name(section)
        is_completed = section in completed_sections
        is_resume = section == resume_section

        for step_id in SECTION_STEP_IDS:
            defn = SECTION_STEP_DEFINITIONS[step_id]

            # Determine status
            if is_completed:
                status = TaskStatus.COMPLETED
            elif is_resume and step_id in resume_steps_complete:
                status = TaskStatus.COMPLETED
            else:
                status = TaskStatus.PENDING

            tasks.append(TaskToWrite(
                position=position,
                subject=defn.subject.format(section=section, display_name=display_name),
                status=status,
                description=defn.description.format(section=section, display_name=display_name),
                active_form=defn.active_form.format(section=section, display_name=display_name),
            ))
            position += 1

    # Finalization task
    all_complete = bool(sections) and all(s in completed_sections for s in sections)
    tasks.append(TaskToWrite(
        position=position,
        subject=FINALIZATION_TASK.subject,
        status=TaskStatus.COMPLETED if all_complete else TaskStatus.PENDING,
        description=FINALIZATION_TASK.description,
        active_form=FINALIZATION_TASK.active_form,
    ))

    return tasks


def build_impl_dependency_graph(
    tasks: list[TaskToWrite],
    sections: list[str],
) -> dict[int, tuple[list[str], list[str]]]:
    """Only actual implementation/checkpoint order is a task dependency.

    Worktrees may operate independently; this task list represents the
    ordered steps within one implementation session. It does not enforce
    reviews, user compaction prompts, or final acceptance as prerequisites.
    """
    blocks: dict[int, list[str]] = {t.position: [] for t in tasks}
    blocked_by: dict[int, list[str]] = {t.position: [] for t in tasks}
    if not tasks:
        return {}

    steps_per_section = len(SECTION_STEP_IDS)
    context_count = len(tasks) - len(sections) * steps_per_section - 1
    assert context_count >= 0

    def link(a: int, b: int) -> None:
        blocks[a].append(str(b))
        blocked_by[b].append(str(a))

    for index in range(len(sections)):
        start = context_count + 1 + index * steps_per_section
        for offset in range(steps_per_section - 1):
            link(start + offset, start + offset + 1)
        if index:
            link(start - 1, start)

    final_pos = tasks[-1].position
    if sections:
        link(final_pos - 1, final_pos)
    # Context reminders remain visible but do not block any work.
    return {pos: (blocks[pos], blocked_by[pos]) for pos in blocks}


def main():
    parser = argparse.ArgumentParser(description="Setup deep-implement session")
    parser.add_argument("--sections-dir", required=True, help="Path to sections directory")
    parser.add_argument(
        "--target-dir",
        help="Path to target directory for implementation (defaults to current working directory)",
    )
    parser.add_argument("--plugin-root", required=True, help="Path to plugin root")
    parser.add_argument("--session-id", help="Session ID from hook context (takes precedence over env var)")
    args = parser.parse_args()

    sections_dir = Path(args.sections_dir).resolve()
    target_dir = Path(args.target_dir).resolve() if args.target_dir else Path.cwd().resolve()
    target_dir_source = "argument" if args.target_dir else "cwd"
    plugin_root = Path(args.plugin_root).resolve()

    # Validate sections directory
    validation = validate_sections_dir(sections_dir)
    if not validation["valid"]:
        print(json.dumps({
            "success": False,
            "error": validation["error"]
        }))
        return

    sections = validation["sections"]
    project_config = validation["project_config"]

    # State directory (sibling to sections) for session config and reviews
    state_dir = sections_dir.parent / "implementation"

    # Check git in the TARGET directory (where code will be written)
    # Git is REQUIRED - fail if not in a git repo
    git_info = check_git_repo(target_dir)
    if not git_info["available"]:
        print(json.dumps({
            "success": False,
            "error": f"Target directory is not in a git repository: {target_dir}. Git is required for deep-implement."
        }))
        return

    git_root = Path(git_info["root"])

    # Validate the target path is within the git repository. The sections
    # directory may be a planning artifact outside the target repo.
    if not validate_path_safety(target_dir, git_root):
        print(json.dumps({
            "success": False,
            "error": f"Path safety violation: {target_dir.resolve()} is outside {git_root.resolve()}"
        }))
        return

    # Check current branch
    branch_info = check_current_branch(git_root)

    # Check working tree
    working_tree = check_working_tree_status(git_root)

    # Detect commit style
    commit_style = detect_commit_style(git_root)

    # Check pre-commit hooks
    pre_commit = check_pre_commit_hooks(git_root)

    # Infer session state
    state = infer_session_state(sections_dir, state_dir, git_root)

    # Create or update session config
    if state["mode"] == "new" and load_session_config(state_dir) is None:
        config = create_session_config(
            plugin_root=plugin_root,
            sections_dir=sections_dir,
            target_dir=target_dir,
            state_dir=state_dir,
            git_root=git_root,
            commit_style=commit_style,
            sections=sections,
            pre_commit=pre_commit
        )
        save_session_config(state_dir, config)

    # A prior crash may have saved canonical JSON before HANDOFF.md was replaced.
    # Repair the view automatically on every resumed setup; this never resets work.
    handoff_path = refresh_handoff(state_dir)

    # Get task list context
    # Priority: --session-id (from hook context) > env vars
    context_session_id = args.session_id  # From hook additionalContext -> Claude -> CLI arg
    env_task_context = TaskListContext.from_env()  # From CLAUDE_CODE_TASK_LIST_ID or DEEP_SESSION_ID
    env_session_id = env_task_context.task_list_id

    # Determine which session_id to use and track source
    if context_session_id:
        session_id = context_session_id
        session_id_source = "context"
    elif env_session_id:
        session_id = env_session_id
        session_id_source = "env"
    else:
        session_id = None
        session_id_source = "none"

    # Track if both were present and whether they matched
    session_id_matched = None
    if context_session_id and env_session_id:
        session_id_matched = (context_session_id == env_session_id)

    # Context values for task generation
    context_values = {
        "plugin_root": str(plugin_root),
        "sections_dir": str(sections_dir),
        "target_dir": str(target_dir),
        "state_dir": str(state_dir),
        "runtime": project_config["runtime"],
        "test_command": project_config["test_command"],
    }

    # Generate implementation tasks
    tasks_to_write = generate_implementation_tasks(
        sections=sections,
        completed_sections=state["completed_sections"],
        resume_section=state.get("resume_from"),
        resume_section_state=state.get("resume_section_state"),
        context_values=context_values,
        outcome_complete=state.get("outcome_complete", False),
    )

    # Build dependency graph
    dependency_graph = build_impl_dependency_graph(tasks_to_write, sections)

    # Write tasks to disk
    write_result = None
    task_write_error = None
    workflow_backend = "compatible"
    tracking_backend = "compatible"
    if session_id:
        workflow_backend = "task_list"
        tracking_backend = "claude_tasks"
        write_result = write_tasks(
            session_id,
            tasks_to_write,
            dependency_graph=dependency_graph,
        )
        if not write_result.success:
            task_write_error = write_result.error

    # Output result
    result = {
        "success": True,
        "mode": state["mode"],
        "outcome_complete": state.get("outcome_complete", False),
        "checkpointed_sections": state.get("checkpointed_sections", state["completed_sections"]),
        "sections_dir": str(sections_dir),
        "target_dir": str(target_dir),
        "target_dir_source": target_dir_source,
        "state_dir": str(state_dir),
        "handoff_path": str(handoff_path) if handoff_path else None,
        "git_root": str(git_root),
        "current_branch": branch_info["branch"],
        "is_protected_branch": branch_info["is_protected"],
        "working_tree_clean": working_tree["clean"],
        "dirty_files": working_tree["dirty_files"],
        "commit_style": commit_style,
        "pre_commit": pre_commit,
        "project_config": project_config,
        "sections": sections,
        "completed_sections": state["completed_sections"],
        "resume_from": state["resume_from"],
        "resume_section_state": state.get("resume_section_state"),
        "workflow_backend": workflow_backend,
        "tracking_backend": tracking_backend,
        "tasks_written": write_result.tasks_written if write_result else 0,
        "task_write_error": task_write_error,
        # Session ID diagnostics
        "session_id": session_id,
        "session_id_source": session_id_source,
        "session_id_matched": session_id_matched,
    }

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
