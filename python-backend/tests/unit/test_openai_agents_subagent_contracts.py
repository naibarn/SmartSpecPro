from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.openai_agents_subagent_contracts import (
    NativeSubagentContractError,
    canonical_json_hash,
    discover_native_subagents,
    load_native_subagent_topology,
    resolve_native_subagent_route,
    validate_native_subagent_topology,
)


def _valid_topology() -> dict[str, object]:
    return {
        "version": 1,
        "orchestrator": {
            "name": "demo-orchestrator",
            "role": "orchestrator",
            "mode": "orchestrator",
            "entrypoint": "agents/orchestrator.md",
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
                "checkpointPolicy": {"mode": "per-run"},
                "handoffPolicy": {"mode": "never"},
                "verificationCommand": "scripts/verify.sh",
                "fallbackBehavior": "return-error",
            },
            {
                "name": "writer",
                "role": "writing",
                "mode": "handoff",
                "entrypoint": "agents/specialists/writer.md",
                "toolBoundary": ["draft"],
                "checkpointPolicy": {"mode": "per-step"},
                "handoffPolicy": {"mode": "conditional", "approvalsRequired": True},
                "verificationCommand": "scripts/verify.sh",
                "fallbackBehavior": "escalate-to-parent",
            },
        ],
        "routing": [
            {"from": "orchestrator", "to": "researcher"},
            {"from": "researcher", "to": "writer"},
        ],
        "checkpointPolicy": {"mode": "parent-run"},
        "verificationPolicy": {"command": "scripts/verify.sh", "onFailure": "escalate"},
        "fallbackPolicy": {"behavior": "escalate-to-parent", "retryLimit": 1},
        "securityPolicy": {
            "toolAllowlist": ["scripts/run.sh", "scripts/verify.sh", "echo", "cat", "ls", "pwd", "find"],
            "toolDenylist": ["rm", "curl", "wget", "ssh", "scp", "sudo", "bash", "sh", "python", "python3", "node"],
            "networkEgress": "none",
            "filesystemScopes": ["bundle", "workspace", "state", "out", "logs", ".agents"],
            "secretPolicy": {"redact": True, "persist": "never"},
            "fanoutLimit": 2,
            "maxConcurrency": 2,
            "allowedInvocationModes": ["tool", "handoff"],
        },
    }


def _write_topology_bundle(bundle_dir: Path, topology: dict[str, object]) -> None:
    bundle_dir.mkdir()
    (bundle_dir / "subagents.json").write_text(json.dumps(topology), encoding="utf-8")
    (bundle_dir / "skill.lock.json").write_text(
        json.dumps(
            {
                "target_platform": "agents_python",
                "subagent_manifest": "subagents.json",
                "subagent_manifest_sha256": canonical_json_hash(topology),
            }
        ),
        encoding="utf-8",
    )


def test_validate_native_subagent_topology_accepts_valid_bundle(tmp_path: Path) -> None:
    topology = validate_native_subagent_topology(_valid_topology(), source_path=tmp_path / "subagents.json")

    assert topology.orchestrator.name == "demo-orchestrator"
    assert [node.name for node in topology.subagents] == ["researcher", "writer"]
    assert topology.routing[0]["to"] == "researcher"
    assert topology.checkpointPolicy.mode == "parent-run"
    assert topology.fallbackPolicy.behavior == "escalate-to-parent"
    assert topology.securityPolicy.networkEgress == "none"


def test_validate_native_subagent_topology_rejects_path_traversal(tmp_path: Path) -> None:
    payload = _valid_topology()
    payload["subagents"] = [
        {
            "name": "researcher",
            "role": "research",
            "mode": "tool",
            "entrypoint": "../escape.md",
            "checkpointPolicy": {"mode": "per-run"},
            "handoffPolicy": {"mode": "never"},
            "verificationCommand": "scripts/verify.sh",
            "fallbackBehavior": "return-error",
        }
    ]

    with pytest.raises(NativeSubagentContractError) as exc_info:
        validate_native_subagent_topology(payload, source_path=tmp_path / "subagents.json")

    assert exc_info.value.code == "path_traversal"


def test_validate_native_subagent_topology_rejects_orchestrator_entrypoint_prefix_spoof(tmp_path: Path) -> None:
    payload = _valid_topology()
    payload["orchestrator"] = {
        **payload["orchestrator"],
        "entrypoint": "agents/orchestrator.md.evil",
    }

    with pytest.raises(NativeSubagentContractError) as exc_info:
        validate_native_subagent_topology(payload, source_path=tmp_path / "subagents.json")

    assert exc_info.value.code == "invalid_path_scope"


def test_load_and_route_native_subagent_topology(tmp_path: Path) -> None:
    bundle_dir = tmp_path / "bundle"
    _write_topology_bundle(bundle_dir, _valid_topology())

    topology = load_native_subagent_topology(bundle_dir)

    assert topology is not None
    assert discover_native_subagents(bundle_dir) == ["researcher", "writer"]
    route = resolve_native_subagent_route(topology, "writer")
    assert route is not None
    assert route.name == "writer"
    assert resolve_native_subagent_route(topology, None).name == "demo-orchestrator"


def test_load_native_subagent_topology_rejects_manifest_hash_drift(tmp_path: Path) -> None:
    bundle_dir = tmp_path / "bundle"
    topology = _valid_topology()
    _write_topology_bundle(bundle_dir, topology)
    topology["routing"] = [{"from": "orchestrator", "to": "researcher"}]
    (bundle_dir / "subagents.json").write_text(json.dumps(topology), encoding="utf-8")

    with pytest.raises(NativeSubagentContractError) as exc_info:
        load_native_subagent_topology(bundle_dir)

    assert exc_info.value.code == "manifest_integrity"


def test_resolve_native_subagent_route_rejects_unknown_request(tmp_path: Path) -> None:
    topology = validate_native_subagent_topology(_valid_topology(), source_path=tmp_path / "subagents.json")

    with pytest.raises(NativeSubagentContractError) as exc_info:
        resolve_native_subagent_route(topology, "missing")

    assert exc_info.value.code == "invalid_routing"


def test_validate_native_subagent_topology_rejects_unknown_routing_target(tmp_path: Path) -> None:
    payload = _valid_topology()
    payload["routing"] = [{"from": "orchestrator", "to": "unknown"}]

    with pytest.raises(NativeSubagentContractError) as exc_info:
        validate_native_subagent_topology(payload, source_path=tmp_path / "subagents.json")

    assert exc_info.value.code == "invalid_routing"


def test_validate_native_subagent_topology_rejects_missing_security_policy(tmp_path: Path) -> None:
    payload = _valid_topology()
    payload.pop("securityPolicy")

    with pytest.raises(NativeSubagentContractError) as exc_info:
        validate_native_subagent_topology(payload, source_path=tmp_path / "subagents.json")

    assert exc_info.value.code == "invalid_policy"


def test_validate_native_subagent_topology_rejects_blocked_invocation_mode(tmp_path: Path) -> None:
    payload = _valid_topology()
    payload["securityPolicy"] = {
        **payload["securityPolicy"],  # type: ignore[index]
        "allowedInvocationModes": ["tool"],
    }

    with pytest.raises(NativeSubagentContractError) as exc_info:
        validate_native_subagent_topology(payload, source_path=tmp_path / "subagents.json")

    assert exc_info.value.code == "invalid_policy"
