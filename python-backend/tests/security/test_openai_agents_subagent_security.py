from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services.openai_agents_skill_persistence import persist_skill_runtime_state
from app.services.openai_agents_skill_runtime import NativeSkillShellExecutor
from app.services.openai_agents_subagent_contracts import (
    NativeSubagentContractError,
    validate_native_subagent_topology,
)

pytestmark = [pytest.mark.security]


def test_subagent_path_integrity_rejects_prefix_spoofing() -> None:
    with pytest.raises(NativeSubagentContractError) as exc_info:
        validate_native_subagent_topology(
            {
                "version": 1,
                "orchestrator": {
                    "name": "demo-orchestrator",
                    "role": "orchestrator",
                    "mode": "orchestrator",
                    "entrypoint": "agents/orchestrator.md.evil",
                    "checkpointPolicy": {"mode": "parent-run"},
                    "verificationCommand": "scripts/verify.sh",
                    "fallbackBehavior": "escalate-to-parent",
                },
                "subagents": [
                    {
                        "name": "researcher",
                        "role": "research",
                        "mode": "tool",
                        "entrypoint": "agents/specialists/researcher.md",
                        "toolBoundary": ["search"],
                        "handoffPolicy": {"mode": "never"},
                        "checkpointPolicy": {"mode": "per-run"},
                        "verificationCommand": "scripts/verify.sh",
                        "fallbackBehavior": "return-error",
                    }
                ],
                "routing": [{"from": "orchestrator", "to": "researcher"}],
                "checkpointPolicy": {"mode": "parent-run"},
                "verificationPolicy": {"command": "scripts/verify.sh"},
                "fallbackPolicy": {"behavior": "escalate-to-parent"},
                "securityPolicy": {
                    "toolAllowlist": ["scripts/run.sh", "scripts/verify.sh", "echo", "cat", "ls", "pwd", "find"],
                    "toolDenylist": ["rm", "curl", "wget", "ssh", "scp", "sudo", "bash", "sh", "python", "python3", "node"],
                    "networkEgress": "none",
                    "filesystemScopes": ["bundle", "workspace", "state", "out", "logs", ".agents"],
                    "secretPolicy": {"redact": True, "persist": "never"},
                    "fanoutLimit": 1,
                    "maxConcurrency": 1,
                    "allowedInvocationModes": ["tool"],
                },
            },
            source_path=Path("subagents.json"),
        )

    assert exc_info.value.code == "invalid_path_scope"


def test_shell_executor_blocks_interpreters_and_shell_escape_hatches(tmp_path: Path) -> None:
    executor = NativeSkillShellExecutor(tmp_path / "bundle", tmp_path / "workspace")
    request = SimpleNamespace(
        data=SimpleNamespace(
            action=SimpleNamespace(
                commands=["python -c 'print(1)'", "bash -lc 'echo unsafe'"],
                max_output_length=256,
                timeout_ms=1000,
            )
        )
    )

    result = executor(request)

    assert all(output.outcome.exit_code == 126 for output in result.output)
    assert all("not allowed" in output.stderr for output in result.output)


def test_shell_executor_blocks_absolute_path_reads(tmp_path: Path) -> None:
    bundle_dir = tmp_path / "bundle"
    workspace_dir = tmp_path / "workspace"
    bundle_dir.mkdir()
    workspace_dir.mkdir()
    executor = NativeSkillShellExecutor(bundle_dir, workspace_dir)
    request = SimpleNamespace(
        data=SimpleNamespace(
            action=SimpleNamespace(
                commands=["cat /etc/passwd"],
                max_output_length=256,
                timeout_ms=1000,
            )
        )
    )

    result = executor(request)

    assert result.output[0].outcome.exit_code == 126
    assert "outside the native skill sandbox" in result.output[0].stderr


def test_runtime_state_redacts_secrets_before_persisting(tmp_path: Path) -> None:
    workspace_dir = tmp_path / "workspace"

    files = persist_skill_runtime_state(
        workspace_dir,
        {
            "skill_slug": "demo-skill",
            "current_phase": "verify",
            "phase_status": "running",
            "api_token": "secret-123",
            "nested": {"authorization": "bearer secret-456"},
            "lineage": {
                "role": "orchestrator",
                "resumeCursor": "resume-verify",
                "childRunIds": ["child-run"],
            },
            "artifacts": [
                {"path": "out/result.json", "secret": "keep-me-out"},
            ],
        },
    )

    last_state = json.loads(files["last_session_state"].read_text(encoding="utf-8"))
    lineage = json.loads(files["lineage"].read_text(encoding="utf-8"))

    assert last_state["api_token"] == "[redacted]"
    assert last_state["nested"]["authorization"] == "[redacted]"
    assert lineage["role"] == "orchestrator"
    assert lineage["resumeCursor"] == "resume-verify"
    assert "keep-me-out" not in files["artifact_index"].read_text(encoding="utf-8")
