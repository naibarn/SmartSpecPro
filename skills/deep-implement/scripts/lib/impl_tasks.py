"""Implementation task definitions for deep-implement.

This module defines the task templates and configuration for the
implementation workflow. Tasks are generated based on these definitions
and written directly to the task storage.
"""

from dataclasses import dataclass
from enum import StrEnum


class TaskStatus(StrEnum):
    """Status values for tasks."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


@dataclass(frozen=True, slots=True, kw_only=True)
class TaskDefinition:
    """Template for a task type."""

    subject: str
    description: str
    active_form: str


# Implementation work is checkpointed through existing files and commit SHAs.
# Code review and compaction are available on demand, never blocking each section.
SECTION_STEP_IDS = ["implement", "update_docs", "commit", "record_completion"]

SECTION_STEP_DEFINITIONS: dict[str, TaskDefinition] = {
    "implement": TaskDefinition(
        subject="Implement {section}",
        description="Implement and debug the section with focused checks",
        active_form="Implementing {display_name}",
    ),
    "update_docs": TaskDefinition(
        subject="Update {section} relevant documentation",
        description="Update documentation changed by this section, if necessary",
        active_form="Documenting {display_name}",
    ),
    "commit": TaskDefinition(
        subject="Commit {section}",
        description="Commit only owned code after relevant checks",
        active_form="Committing {display_name}",
    ),
    "record_completion": TaskDefinition(
        subject="Persist checkpoint for {section}",
        description="Record actual commit SHA with update_section_state.py and hand off integration",
        active_form="Checkpointing {display_name}",
    ),
}

FINALIZATION_TASK = TaskDefinition(
    subject="Summarize implementation and pending acceptance",
    description="Write a concise implementation handoff; unresolved UAT/release evidence remains open",
    active_form="Summarizing implementation",
)

# Older sessions may have review/interview artifacts: treat them as historical
# evidence only. Never skip the commit or checkpoint write based on a review file.
RESUME_STEP_COMPLETE_MAPPING: dict[str, set[str]] = {
    "implement": set(),
    "review": {"implement"},
    "interview": {"implement"},
    "apply_fixes": {"implement"},
    "commit": {"implement", "update_docs"},
}

# Context items stored at the start of the task list (as completed tasks)
# Order matters - plugin_root must be first for context recovery after compaction
CONTEXT_ITEM_KEYS = [
    "plugin_root",
    "sections_dir",
    "target_dir",
    "state_dir",
    "runtime",
    "test_command",
]


def format_display_name(section: str) -> str:
    """Convert section name to human-readable display name.

    Args:
        section: Section name like "section-01-foundation"

    Returns:
        Display name like "section 01: foundation"
    """
    # section-01-foundation -> "01: foundation"
    parts = section.replace("section-", "").split("-", 1)
    if len(parts) == 2:
        num, name = parts
        return f"section {num}: {name.replace('-', ' ')}"
    return section
