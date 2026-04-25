from __future__ import annotations

from pathlib import Path

from app.services.openai_agents_skill_persistence import load_persisted_skill_runtime_state
from app.services.openai_agents_skill_supervisor import SkillPhaseResult, run_supervised_skill_phases


def test_supervisor_resumes_from_persisted_lineage(tmp_path: Path) -> None:
    workspace_dir = tmp_path / "workspace"
    bundle_dir = tmp_path / "bundle"
    attempts = {"verify": 0}
    seen_phases: list[str] = []

    def phase_executor(phase: str, state: dict[str, object]) -> SkillPhaseResult:
        seen_phases.append(phase)
        if phase == "verify":
            attempts["verify"] += 1
            if attempts["verify"] == 1:
                return SkillPhaseResult(
                    phase=phase,
                    status="failed",
                    last_command="scripts/verify.sh",
                    verification_command="scripts/verify.sh",
                    resume_hint="resume-verify",
                    checkpoint_version=4,
                    parent_run_id="run-root",
                    child_run_ids=["child-1"],
                    verification_state="failed",
                    artifact_refs=["logs/phase_verify.md"],
                    details={"role": "child"},
                )
        return SkillPhaseResult(
            phase=phase,
            status="completed",
            last_command=f"run {phase}",
            verification_command="scripts/verify.sh",
            resume_hint=f"resume-{phase}",
            checkpoint_version=4,
            parent_run_id="run-root",
            child_run_ids=["child-1"] if phase == "verify" else [],
            verification_state="passed" if phase == "verify" else state.get("verification_status"),
            artifact_refs=[f"out/{phase}.md"],
            details={"role": "orchestrator" if phase != "verify" else "child"},
        )

    first_run = run_supervised_skill_phases(
        workspace_dir=workspace_dir,
        bundle_dir=bundle_dir,
        skill_slug="demo-skill",
        phase_executor=phase_executor,
    )

    assert first_run["phase_status"] == "failed"
    assert first_run["lineage"]["role"] == "child"
    assert first_run["lineage"]["checkpointVersion"] == 4
    assert load_persisted_skill_runtime_state(workspace_dir)["lineage"]["resumeCursor"] == "resume-verify"

    resumed_run = run_supervised_skill_phases(
        workspace_dir=workspace_dir,
        bundle_dir=bundle_dir,
        skill_slug="demo-skill",
        phase_executor=phase_executor,
        resume_state=load_persisted_skill_runtime_state(workspace_dir),
    )

    assert resumed_run["phase_status"] == "completed"
    assert resumed_run["current_phase"] == "finalize"
    assert resumed_run["lineage"]["role"] == "orchestrator"
    assert "verify" in seen_phases
