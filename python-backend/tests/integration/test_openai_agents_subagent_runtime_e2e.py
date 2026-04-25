from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from app.services.openai_agents_skill_persistence import load_persisted_skill_runtime_state
from app.services.openai_agents_skill_runtime import (
    NativeSkillRuntimeRequest,
    load_native_skill_topology,
    resolve_native_skill_route,
    run_native_skill_runtime,
)
from app.services.openai_agents_skill_supervisor import SkillPhaseResult

pytestmark = [pytest.mark.integration]


def _canonical_hash(value: object) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _write_native_bundle(bundle_dir: Path) -> None:
    manifest = {
        "version": 1,
        "orchestrator": {
            "name": "demo-skill-orchestrator",
            "role": "orchestrator",
            "mode": "orchestrator",
            "entrypoint": "agents/orchestrator.md",
            "toolBoundary": ["inspect", "plan"],
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
    }
    lock = {
        "name": "demo-skill",
        "version": "1.0.0",
        "target_platform": "agents_python",
        "bundle_topology": "subagent-aware",
        "entrypoints": {"run": "scripts/run.sh", "verify": "scripts/verify.sh"},
        "outputs": [
            "SKILL.md",
            "scripts/run.sh",
            "scripts/verify.sh",
            "references/input_contract.md",
            "references/output_contract.md",
            "references/maintenance.md",
            "references/subagents.md",
            "agents/orchestrator.md",
            "agents/specialists/researcher.md",
            "subagents.json",
            "MODEL_COMPATIBILITY.md",
            "skill.lock.json",
        ],
        "supported_modes": ["create", "improve", "maintenance"],
        "compatibility_mirror_policy": "mirror-skill-md",
        "subagent_manifest": "subagents.json",
        "subagent_manifest_sha256": _canonical_hash(manifest),
    }

    bundle_dir.mkdir(parents=True, exist_ok=True)
    (bundle_dir / "SKILL.md").write_text(
        "---\n"
        "name: Demo Skill\n"
        "description: Demo subagent runtime bundle.\n"
        "version: 1.0.0\n"
        "target_platform: agents_python\n"
        "---\n"
        "# Demo Skill\n",
        encoding="utf-8",
    )
    (bundle_dir / "skill.lock.json").write_text(json.dumps(lock, indent=2), encoding="utf-8")
    (bundle_dir / "subagents.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (bundle_dir / "agents").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "agents" / "orchestrator.md").write_text("# Orchestrator\n", encoding="utf-8")
    (bundle_dir / "agents" / "specialists").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "agents" / "specialists" / "researcher.md").write_text("# Researcher\n", encoding="utf-8")
    (bundle_dir / "scripts").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "scripts" / "run.sh").write_text("#!/usr/bin/env bash\nset -euo pipefail\n", encoding="utf-8")
    (bundle_dir / "scripts" / "verify.sh").write_text("#!/usr/bin/env bash\nset -euo pipefail\n", encoding="utf-8")
    (bundle_dir / "references").mkdir(parents=True, exist_ok=True)
    for relative_path, title in (
        ("references/input_contract.md", "# Input\n"),
        ("references/output_contract.md", "# Output\n"),
        ("references/maintenance.md", "# Maintenance\n"),
        ("references/subagents.md", "# Subagents\n"),
        ("MODEL_COMPATIBILITY.md", "# Compatibility\n"),
    ):
        (bundle_dir / relative_path).write_text(title, encoding="utf-8")

    for script in ("scripts/run.sh", "scripts/verify.sh"):
        script_path = bundle_dir / script
        script_path.chmod(script_path.stat().st_mode | 0o111)


def test_native_skill_runtime_resumes_an_interrupted_run(tmp_path: Path) -> None:
    bundle_dir = tmp_path / "bundle"
    workspace_dir = tmp_path / "workspace"
    _write_native_bundle(bundle_dir)

    topology = load_native_skill_topology(bundle_dir)
    assert topology is not None
    assert resolve_native_skill_route(
        NativeSkillRuntimeRequest(
            skill_slug="demo-skill",
            bundle_dir=bundle_dir,
            workspace_dir=workspace_dir,
            requested_subagent="researcher",
        )
    )["selectedRoute"]["name"] == "researcher"

    verify_attempts = {"count": 0}

    def phase_executor(phase: str, state: dict[str, object]) -> SkillPhaseResult:
        if phase == "verify":
            verify_attempts["count"] += 1
            if verify_attempts["count"] == 1:
                return SkillPhaseResult(
                    phase=phase,
                    status="failed",
                    last_command="scripts/verify.sh",
                    verification_command="scripts/verify.sh",
                    resume_hint="resume-verify",
                    checkpoint_version=2,
                    parent_run_id="root-run",
                    child_run_ids=["child-run"],
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
            checkpoint_version=2,
            parent_run_id="root-run",
            child_run_ids=["child-run"] if phase == "verify" else [],
            verification_state="passed" if phase == "verify" else state.get("verification_status"),
            artifact_refs=[f"out/{phase}.md"],
            details={"role": "orchestrator" if phase != "verify" else "child"},
        )

    first_run = run_native_skill_runtime(
        NativeSkillRuntimeRequest(
            skill_slug="demo-skill",
            bundle_dir=bundle_dir,
            workspace_dir=workspace_dir,
            requested_subagent="researcher",
        ),
        phase_executor,
    )

    assert first_run["phase_status"] == "failed"
    assert first_run["lineage"]["role"] == "child"
    assert load_persisted_skill_runtime_state(workspace_dir)["lineage"]["verificationState"] == "failed"

    resumed_run = run_native_skill_runtime(
        NativeSkillRuntimeRequest(
            skill_slug="demo-skill",
            bundle_dir=bundle_dir,
            workspace_dir=workspace_dir,
            requested_subagent="researcher",
            resume_hint="resume-verify",
        ),
        phase_executor,
    )

    assert resumed_run["phase_status"] == "completed"
    assert resumed_run["current_phase"] == "finalize"
    assert resumed_run["lineage"]["role"] == "orchestrator"
    assert verify_attempts["count"] == 2
