from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services.openai_agents_skill_persistence import (
    load_persisted_skill_runtime_state,
    persist_skill_runtime_state,
    redact_skill_runtime_state,
)
from app.services.openai_agents_skill_runtime import (
    NativeSkillRuntimeRequest,
    NativeSkillShellExecutor,
    build_native_skill_agent,
    build_native_skill_runtime_descriptor,
    resolve_native_skill_bundle_path,
    run_native_skill_runtime,
)
from app.services.openai_agents_skill_supervisor import (
    DEFAULT_SKILL_PHASES,
    SkillPhaseResult,
    advance_phase,
    run_supervised_skill_phases,
)


def test_redact_skill_runtime_state_masks_sensitive_fields() -> None:
    state = {
        "api_token": "secret-123",
        "nested": {"authorization": "bearer secret-456"},
        "artifacts": [{"path": "out/file.txt", "secret": "do-not-keep"}],
    }

    redacted = redact_skill_runtime_state(state)

    assert redacted["api_token"] == "[redacted]"
    assert redacted["nested"]["authorization"] == "[redacted]"
    assert redacted["artifacts"][0]["secret"] == "[redacted]"


def test_persist_skill_runtime_state_writes_expected_files(tmp_path: Path) -> None:
    workspace_dir = tmp_path / "workspace"
    files = persist_skill_runtime_state(
        workspace_dir,
        {
            "skill_slug": "demo-skill",
            "current_phase": "inspect",
            "phase_status": "running",
            "last_command": "python run.py",
            "resume_hint": "resume-inspect",
            "api_token": "secret-123",
            "artifacts": [{"path": "out/result.json", "secret": "redact-me"}],
        },
    )

    assert files["progress"].exists()
    assert files["last_session_state"].exists()
    assert files["phase_log"].exists()
    assert files["artifact_index"].exists()
    assert "secret-123" not in files["last_session_state"].read_text(encoding="utf-8")
    assert "redact-me" not in files["artifact_index"].read_text(encoding="utf-8")
    assert load_persisted_skill_runtime_state(workspace_dir)["current_phase"] == "inspect"


def test_persist_skill_runtime_state_rejects_outside_artifact_paths(tmp_path: Path) -> None:
    workspace_dir = tmp_path / "workspace"

    with pytest.raises(ValueError):
        persist_skill_runtime_state(
            workspace_dir,
            {
                "current_phase": "execute",
                "phase_status": "running",
                "artifacts": [{"path": "../escape.txt"}],
            },
        )


def test_supervisor_runs_all_phases_and_persists_logs(tmp_path: Path) -> None:
    workspace_dir = tmp_path / "workspace"
    bundle_dir = tmp_path / "bundle"

    def phase_executor(phase: str, state: dict[str, object]) -> SkillPhaseResult:
        return SkillPhaseResult(
            phase=phase,
            status="completed",
            last_command=f"run {phase}",
            artifacts=[{"path": f"out/{phase}.json"}],
            verification_command="scripts/verify.sh",
            resume_hint=f"resume-{phase}",
            loaded_skills=["native-skill"],
        )

    result = run_supervised_skill_phases(
        workspace_dir=workspace_dir,
        bundle_dir=bundle_dir,
        skill_slug="native-skill",
        phase_executor=phase_executor,
    )

    assert result["current_phase"] == DEFAULT_SKILL_PHASES[-1]
    assert result["phase_status"] == "completed"
    assert (workspace_dir / "logs" / "phase_discover.md").exists()
    assert (workspace_dir / "logs" / "phase_finalize.md").exists()
    assert json.loads((workspace_dir / "out" / "artifact_index.json").read_text(encoding="utf-8"))["count"] == 1


def test_supervisor_blocks_finalize_until_verify_passes(tmp_path: Path) -> None:
    workspace_dir = tmp_path / "workspace"
    bundle_dir = tmp_path / "bundle"

    def phase_executor(phase: str, state: dict[str, object]) -> SkillPhaseResult:
        return SkillPhaseResult(phase=phase, status="completed")

    with pytest.raises(RuntimeError, match="Verification must complete before finalize"):
        run_supervised_skill_phases(
            workspace_dir=workspace_dir,
            bundle_dir=bundle_dir,
            skill_slug="native-skill",
            phase_executor=phase_executor,
            resume_state={
                "current_phase": "finalize",
                "phase_status": "running",
                "verification_status": "failed",
            },
        )


def test_supervisor_advances_phase_names() -> None:
    assert advance_phase(None) == "discover"
    assert advance_phase("discover") == "inspect"
    assert advance_phase("finalize") is None


def test_runtime_descriptor_mentions_sdk_and_mounts(tmp_path: Path) -> None:
    request = NativeSkillRuntimeRequest(
        skill_slug="demo-skill",
        bundle_dir=tmp_path / "bundle",
        workspace_dir=tmp_path / "workspace",
    )

    descriptor = build_native_skill_runtime_descriptor(request)

    assert descriptor["agentClass"] == "SandboxAgent"
    assert descriptor["skillSource"] == "Skills(lazy_from=LocalDirLazySkillSource(...))"
    assert descriptor["sdkAgentClass"] == "Agent"
    assert descriptor["shellToolType"] == "ShellTool"
    assert descriptor["sdkModel"] == "gpt-5.4"
    assert descriptor["mounts"]["out"].endswith("/out")


def test_runtime_rejects_path_traversal(tmp_path: Path) -> None:
    bundle_dir = tmp_path / "bundle"
    bundle_dir.mkdir()

    with pytest.raises(ValueError):
        resolve_native_skill_bundle_path(bundle_dir, "../escape")


def test_run_native_skill_runtime_uses_supervisor(tmp_path: Path) -> None:
    workspace_dir = tmp_path / "workspace"
    bundle_dir = tmp_path / "bundle"

    def phase_executor(phase: str, state: dict[str, object]) -> SkillPhaseResult:
        return SkillPhaseResult(phase=phase, status="completed")

    result = run_native_skill_runtime(
        NativeSkillRuntimeRequest(
            skill_slug="demo-skill",
            bundle_dir=bundle_dir,
            workspace_dir=workspace_dir,
            resume_hint="cursor-1",
        ),
        phase_executor,
    )

    assert result["skill_slug"] == "demo-skill"
    assert result["current_phase"] == "finalize"


def test_build_native_skill_agent_builds_sdk_agent(tmp_path: Path) -> None:
    request = NativeSkillRuntimeRequest(
        skill_slug="demo-skill",
        bundle_dir=tmp_path / "bundle",
        workspace_dir=tmp_path / "workspace",
    )

    agent = build_native_skill_agent(request)

    assert agent.name == "demo-skill"
    assert agent.model == "gpt-5.4"
    assert "always verify before finalize" in agent.instructions
    assert agent.tools[0].name == "shell"
    assert agent.tools[0].needs_approval is True
    assert agent.tools[0].environment["type"] == "local"
    assert agent.tools[0].environment["skills"][0]["path"] == str((tmp_path / "bundle").resolve())


def test_native_skill_shell_executor_blocks_disallowed_commands(tmp_path: Path) -> None:
    executor = NativeSkillShellExecutor(tmp_path / "bundle", tmp_path / "workspace")
    request = SimpleNamespace(
        data=SimpleNamespace(
            action=SimpleNamespace(
                max_output_length=1000,
                timeout_ms=1000,
                commands=["rm -rf /"],
            )
        )
    )

    result = executor(request)

    assert result.output[0].outcome.type == "exit"
    assert result.output[0].outcome.exit_code == 126
    assert "not allowed" in result.output[0].stderr


def test_native_skill_shell_executor_allows_safe_inspection_commands(tmp_path: Path) -> None:
    workspace_dir = tmp_path / "workspace"
    workspace_dir.mkdir()
    executor = NativeSkillShellExecutor(tmp_path / "bundle", workspace_dir)
    request = SimpleNamespace(
        data=SimpleNamespace(
            action=SimpleNamespace(
                max_output_length=1000,
                timeout_ms=1000,
                commands=["pwd"],
            )
        )
    )

    result = executor(request)

    assert result.output[0].outcome.type == "exit"
    assert result.output[0].outcome.exit_code == 0
    assert workspace_dir.as_posix() in result.output[0].stdout
