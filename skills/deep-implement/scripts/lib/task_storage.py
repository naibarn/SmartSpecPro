"""Direct task file storage for Claude Code Tasks.

Writes task files directly to ~/.claude/tasks/<task_list_id>/
instead of returning operations for Claude to execute.

COUPLING WARNING: This module depends on Claude Code's internal
task storage format. If Anthropic changes the format, this code
will need to be updated.
"""

from __future__ import annotations

import json
import base64
import os
import tempfile
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from contextlib import contextmanager
from typing import Self


class TaskStatus(StrEnum):
    """Status values for tasks."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class TaskWriteError(Exception):
    """Raised when task files cannot be written."""

    pass


def _atomic_task_json(path: Path, data: dict) -> None:
    """An interrupted write must never leave a truncated task JSON file."""
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent,
            prefix=f".{path.name}.", delete=False,
        ) as fp:
            tmp = Path(fp.name)
            json.dump(data, fp, ensure_ascii=False, indent=2)
            fp.flush()
            os.fsync(fp.fileno())
        os.replace(tmp, path)
    finally:
        if tmp is not None:
            tmp.unlink(missing_ok=True)


@contextmanager
def _task_list_lock(directory: Path):
    """One writer per Claude task list. Distinct sessions remain parallel."""
    directory.mkdir(parents=True, exist_ok=True)
    fd = os.open(directory / ".task-list-writer.lock", os.O_CREAT | os.O_RDWR, 0o600)
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


def get_tasks_dir(task_list_id: str) -> Path:
    """Get the tasks directory for a task list ID."""
    import re
    if not re.fullmatch(r'[a-zA-Z0-9_\-]{1,128}', task_list_id):
        raise ValueError(f"Invalid task_list_id: contains unsafe characters")
    return Path.home() / ".claude" / "tasks" / task_list_id


@dataclass(frozen=True, slots=True, kw_only=True)
class TaskToWrite:
    """A task to write to disk."""

    position: int
    subject: str
    status: TaskStatus
    description: str = ""
    active_form: str = ""
    blocks: tuple[str, ...] = ()  # Task IDs this task blocks
    blocked_by: tuple[str, ...] = ()  # Task IDs blocking this task

    def to_file_dict(self) -> dict:
        """Convert to dict matching Claude Code task file format."""
        return {
            "id": str(self.position),
            "subject": self.subject,
            "description": self.description,
            "activeForm": self.active_form,
            "status": str(self.status),
            "blocks": list(self.blocks),
            "blockedBy": list(self.blocked_by),
        }


@dataclass(frozen=True, slots=True, kw_only=True)
class TaskWriteResult:
    """Result of writing tasks to disk."""

    success: bool
    task_list_id: str
    tasks_written: int
    tasks_dir: Path
    error: str | None = None

    @classmethod
    def ok(cls, task_list_id: str, tasks_written: int, tasks_dir: Path) -> Self:
        return cls(
            success=True,
            task_list_id=task_list_id,
            tasks_written=tasks_written,
            tasks_dir=tasks_dir,
        )

    @classmethod
    def err(cls, task_list_id: str, error: str) -> Self:
        return cls(
            success=False,
            task_list_id=task_list_id,
            tasks_written=0,
            tasks_dir=Path(),
            error=error,
        )


def _preserve_previous_task_schema(tasks_dir: Path, intended: list[TaskToWrite]) -> None:
    """Save older task-list bytes before changing its layout; never block on review tasks.

    Section checkpoint files remain authoritative. This snapshot only avoids
    losing old Claude task progress when transitioning to fewer task steps.
    """
    old_files = sorted((p for p in tasks_dir.glob("*.json") if p.stem.isdigit()),
                       key=lambda p: int(p.stem))
    if not old_files:
        return
    wanted = {str(task.position): task.subject for task in intended}
    existing = {p.stem: p.read_bytes() for p in old_files}
    try:
        same_layout = len(existing) == len(intended) and all(
            json.loads(raw).get("subject") == wanted.get(stem)
            for stem, raw in existing.items()
        )
    except (ValueError, TypeError, AttributeError):
        same_layout = False
    if same_layout:
        return
    snapshot = tasks_dir / ".previous-task-schema.json"
    if snapshot.exists():
        return  # immutable first-transition snapshot; never overwrite history
    payload = {
        "reason": "task schema transition; preserve prior session history",
        "files_base64": {name + ".json": base64.b64encode(raw).decode("ascii")
                         for name, raw in existing.items()},
    }
    temp = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=tasks_dir,
                                         prefix=".previous-task-schema.", delete=False) as fh:
            temp = Path(fh.name)
            json.dump(payload, fh)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(temp, snapshot)
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)


def write_tasks(
    task_list_id: str,
    tasks: list[TaskToWrite],
    dependency_graph: dict[int, tuple[list[str], list[str]]] | None = None,
    *,
    mark_extra_obsolete: bool = True,
) -> TaskWriteResult:
    """Write tasks directly to Claude Code task storage.

    Args:
        task_list_id: Session ID or user-specified task list ID
        tasks: List of tasks to write (in position order)
        dependency_graph: Optional dict of position -> (blocks, blockedBy).
            If provided, overrides blocks/blocked_by on TaskToWrite.
        mark_extra_obsolete: If True, marks existing tasks beyond
            the last written position as [obsolete] + completed

    Returns:
        TaskWriteResult with success status and details

    Note: This overwrites existing task files at the same positions.
    """
    if not task_list_id:
        return TaskWriteResult.err("", "No task_list_id provided")

    tasks_dir = get_tasks_dir(task_list_id)

    try:
        # Create directory if needed
        tasks_dir.mkdir(parents=True, exist_ok=True)

        with _task_list_lock(tasks_dir):
            # Preserve old tasks before the lean task schema reuses numeric IDs.
            _preserve_previous_task_schema(tasks_dir, tasks)

            # Track highest position we write to
            max_written_position = 0

            # Write each task
            for task in tasks:
                task_data = task.to_file_dict()

                # Apply dependency graph if provided
                if dependency_graph and task.position in dependency_graph:
                    blocks, blocked_by = dependency_graph[task.position]
                    task_data["blocks"] = blocks
                    task_data["blockedBy"] = blocked_by

                task_file = tasks_dir / f"{task.position}.json"
                _atomic_task_json(task_file, task_data)
                max_written_position = max(max_written_position, task.position)

            # Mark extra existing tasks as obsolete
            if mark_extra_obsolete:
                _mark_extra_obsolete(tasks_dir, max_written_position)

            return TaskWriteResult.ok(
                task_list_id=task_list_id,
                tasks_written=len(tasks),
                tasks_dir=tasks_dir,
            )

    except PermissionError as e:
        return TaskWriteResult.err(task_list_id, f"Permission denied: {e}")
    except OSError as e:
        return TaskWriteResult.err(task_list_id, f"File system error: {e}")


def _mark_extra_obsolete(tasks_dir: Path, max_written_position: int) -> None:
    """Mark existing task files beyond max_written_position as obsolete.

    Preserves existing blocks/blockedBy fields when marking obsolete.
    """
    for task_file in tasks_dir.glob("*.json"):
        try:
            position = int(task_file.stem)
            if position > max_written_position:
                # Read existing, check if already obsolete
                data = json.loads(task_file.read_text())
                if (
                    data.get("subject") == "[obsolete]"
                    and data.get("status") == "completed"
                ):
                    continue  # Already obsolete
                # Mark as obsolete (preserve other fields like blocks/blockedBy)
                data["subject"] = "[obsolete]"
                data["status"] = "completed"
                # Ensure required fields exist
                data.setdefault("blocks", [])
                data.setdefault("blockedBy", [])
                _atomic_task_json(task_file, data)
        except (ValueError, json.JSONDecodeError):
            continue  # Skip non-numeric or invalid files


def build_dependency_graph(
    tasks: list[TaskToWrite],
    semantic_dependencies: dict[str, list[str]],
    semantic_to_position: dict[str, int],
) -> dict[int, tuple[list[str], list[str]]]:
    """Build blocks and blockedBy arrays for each task position.

    Args:
        tasks: List of tasks with positions
        semantic_dependencies: Dict of semantic_id -> list of semantic_ids it's blocked by
        semantic_to_position: Dict of semantic_id -> position number

    Returns:
        Dict of position -> (blocks, blockedBy) where each is a list of position strings
    """
    # Initialize empty lists for each position
    blocks: dict[int, list[str]] = {t.position: [] for t in tasks}
    blocked_by: dict[int, list[str]] = {t.position: [] for t in tasks}

    # Build blockedBy from semantic dependencies
    for semantic_id, deps in semantic_dependencies.items():
        if semantic_id not in semantic_to_position:
            continue
        position = semantic_to_position[semantic_id]
        if position not in blocked_by:
            continue
        for dep_id in deps:
            if dep_id in semantic_to_position:
                dep_position = semantic_to_position[dep_id]
                blocked_by[position].append(str(dep_position))

    # Build blocks (inverse of blockedBy)
    for position, deps in blocked_by.items():
        for dep_pos_str in deps:
            dep_pos = int(dep_pos_str)
            if dep_pos in blocks:
                blocks[dep_pos].append(str(position))

    return {pos: (blocks[pos], blocked_by[pos]) for pos in blocks}
