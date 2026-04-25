from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .openai_agents_skill_persistence import (
    load_persisted_skill_runtime_state,
    persist_skill_runtime_state,
)

DEFAULT_SKILL_PHASES: tuple[str, ...] = (
    "discover",
    "inspect",
    "plan",
    "execute",
    "verify",
    "summarize",
    "finalize",
)


@dataclass
class SkillPhaseResult:
    phase: str
    status: str
    last_command: str | None = None
    artifacts: list[dict[str, Any]] = field(default_factory=list)
    verification_command: str | None = None
    resume_hint: str | None = None
    loaded_skills: list[str] = field(default_factory=list)
    checkpoint_version: int | None = None
    parent_run_id: str | None = None
    child_run_ids: list[str] = field(default_factory=list)
    verification_state: str | None = None
    artifact_refs: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


def build_runtime_descriptor(skill_slug: str, bundle_dir: Path, workspace_dir: Path) -> dict[str, Any]:
    return {
        "skillSlug": skill_slug,
        "bundleDir": str(bundle_dir),
        "workspaceDir": str(workspace_dir),
        "agentClass": "SandboxAgent",
        "capabilities": ["Capabilities.default()"],
        "skillSource": "Skills(lazy_from=LocalDirLazySkillSource(...))",
        "mounts": {
            "repo": str(workspace_dir / "repo"),
            "skills": str(bundle_dir),
            "state": str(workspace_dir / "state"),
            "out": str(workspace_dir / "out"),
            "logs": str(workspace_dir / "logs"),
        },
    }


def advance_phase(current_phase: str | None, phases: Iterable[str] = DEFAULT_SKILL_PHASES) -> str | None:
    ordered = list(phases)
    if current_phase not in ordered:
        return ordered[0] if ordered else None
    index = ordered.index(current_phase)
    if index + 1 >= len(ordered):
        return None
    return ordered[index + 1]


def run_supervised_skill_phases(
    *,
    workspace_dir: Path,
    bundle_dir: Path,
    skill_slug: str,
    phase_executor: Callable[[str, Mapping[str, Any]], SkillPhaseResult],
    phases: Iterable[str] = DEFAULT_SKILL_PHASES,
    resume_state: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    ordered = list(phases)
    if not ordered:
        raise ValueError("At least one phase is required.")

    state = dict(resume_state or load_persisted_skill_runtime_state(workspace_dir) or {})
    lineage = dict(state.get("lineage") if isinstance(state.get("lineage"), dict) else {})
    phase_results = dict(state.get("phase_results") if isinstance(state.get("phase_results"), dict) else {})
    current_phase = str(state.get("current_phase") or ordered[0])
    start_index = ordered.index(current_phase) if current_phase in ordered else 0
    if state.get("phase_status") == "completed" and current_phase == ordered[-1]:
        return state

    for phase in ordered[start_index:]:
        if phase == "finalize" and state.get("verification_status") != "completed":
            raise RuntimeError("Verification must complete before finalize.")
        phase_state = dict(state)
        phase_state.update(
            {
                "skill_slug": skill_slug,
                "bundle_dir": str(bundle_dir),
                "current_phase": phase,
                "phase_status": "running",
            }
        )
        result = phase_executor(phase, phase_state)
        phase_results[phase] = result.details
        state.update(
            {
                "skill_slug": skill_slug,
                "bundle_dir": str(bundle_dir),
                "current_phase": phase,
                "phase_status": result.status,
                "last_command": result.last_command,
                "artifacts": result.artifacts,
                "verification_command": result.verification_command,
                "resume_hint": result.resume_hint,
                "loaded_skills": result.loaded_skills,
                "checkpoint_version": result.checkpoint_version or lineage.get("checkpointVersion") or 1,
                "parent_run_id": result.parent_run_id or lineage.get("parentRunId"),
                "child_run_ids": result.child_run_ids or lineage.get("childRunIds") or [],
                "verification_state": result.verification_state or state.get("verification_status"),
                "artifact_refs": result.artifact_refs or lineage.get("artifactRefs") or [],
                "phase_details": result.details,
                "phase_results": phase_results,
            }
        )
        lineage.update(
            {
                "schemaVersion": 1,
                "skillSlug": skill_slug,
                "role": result.details.get("role") or lineage.get("role") or "orchestrator",
                "status": result.status,
                "checkpointVersion": result.checkpoint_version or lineage.get("checkpointVersion") or 1,
                "parentRunId": result.parent_run_id or lineage.get("parentRunId"),
                "childRunIds": result.child_run_ids or lineage.get("childRunIds") or [],
                "resumeCursor": result.resume_hint or lineage.get("resumeCursor"),
                "verificationState": result.verification_state or state.get("verification_status"),
                "artifactRefs": result.artifact_refs or lineage.get("artifactRefs") or [],
            }
        )
        state["lineage"] = lineage
        if phase == "verify":
            state["verification_status"] = result.status
        persist_skill_runtime_state(workspace_dir, state)
        if result.status == "failed":
            return state
        if phase == ordered[-1]:
            state["phase_status"] = "completed"
            persist_skill_runtime_state(workspace_dir, state)
            return state
    return state
