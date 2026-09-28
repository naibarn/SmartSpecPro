from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

VALID_TOKEN = "test-internal-secret"


def _canonical_hash(value: object) -> str:
    from app.services.openai_agents_subagent_contracts import canonical_json_hash

    return canonical_json_hash(value)


def _make_client() -> TestClient:
    from app.api.internal_openai_agents_runtime import router

    app = FastAPI()
    app.include_router(router)
    return TestClient(app, raise_server_exceptions=False)


def _make_request_payload() -> dict[str, object]:
    return {
        "runtimeContractVersion": 2,
        "traceSchemaVersion": 2,
        "checkpointSchemaVersion": 2,
        "surface": "team",
        "originSurface": "team",
        "entryPoint": "team_step",
        "tenantId": "tenant_demo",
        "roomId": "room_demo",
        "runId": "run_demo",
        "messageId": "message_demo",
        "requestId": "request_demo",
        "idempotencyKey": "idem_demo",
        "objective": "Work through the plan with subagents.",
        "planContext": {},
        "stepContext": {
            "stepId": "step_01",
            "stepKey": "plan-decompose",
            "attemptId": "attempt_01",
        },
        "activePersonaId": None,
        "personaSnapshot": None,
        "teamMembers": [],
        "stepAssignment": None,
        "approvalCheckpointId": None,
        "resumeCursor": None,
        "structuredContextPackRef": None,
        "contextEvidenceItems": [],
        "candidateSkillManifests": [],
        "allowedTools": ["shell"],
        "allowedSkills": ["team-orchestrator"],
        "allowedAgents": ["research-agent"],
        "completionPolicy": {"maxRounds": 3},
        "reviewPolicy": {"requirePassVerdict": True},
        "retryPolicy": {"maxAttempts": 2},
        "traceCorrelationIds": {
            "traceId": "trace_demo",
            "parentTraceId": "trace_parent_demo",
        },
        "sdkVersionConstraint": "~=0.14",
        "modelConfig": {
            "providerId": "openai",
            "modelId": "gpt-4.1-mini",
            "gatewayRouteId": "gateway_default",
            "resolvedGatewayModelId": "openai/gpt-4.1-mini",
        },
        "executionEnvelope": {
            "envelopeId": "env_demo",
            "tenantId": "tenant_demo",
            "issuedAt": "2026-04-20T00:00:00Z",
            "expiresAt": "2026-04-20T01:00:00Z",
            "allowedTools": ["shell"],
            "allowedSkills": ["team-orchestrator"],
            "allowedAgents": ["research-agent"],
            "sideEffectPolicy": "approval_required",
        },
    }


def _make_response_payload() -> dict[str, object]:
    return {
        "runtimeContractVersion": 2,
        "traceSchemaVersion": 2,
        "checkpointSchemaVersion": 2,
        "status": "completed",
        "selectedAgentName": "Orchestrator",
        "selectedSkillSlug": "team-orchestrator",
        "providerId": "openai",
        "modelId": "gpt-4.1-mini",
        "gatewayRouteId": "gateway_default",
        "resolvedGatewayModelId": "openai/gpt-4.1-mini",
        "finalOutput": {
            "rawContent": "Runtime output",
            "usage": {"promptTokens": 10, "completionTokens": 5},
            "creditsUsed": 2,
            "providerName": "openai",
            "modelId": "gpt-4.1-mini",
        },
        "artifacts": [],
        "reviewVerdict": {
            "status": "pass",
            "issues": [],
        },
        "events": [],
        "traceMetadata": {},
        "adapterVersion": "adapter-test",
        "sdkVersion": "sdk-test",
        "checkpoint": None,
        "terminalReason": "plan_completed",
        "toolCallsMade": [],
        "handoffsExecuted": [],
        "nextAction": None,
        "stepId": None,
        "attemptId": None,
        "checkpointMetadata": None,
        "eventSequenceMetadata": {},
        "stepLinks": [],
    }


@pytest.mark.unit
def test_missing_token_returns_401():
    client = _make_client()

    with patch("app.api.internal_openai_agents_runtime.settings") as mock_settings:
        mock_settings.SMARTSPEC_WEB_GATEWAY_TOKEN = VALID_TOKEN
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN

        response = client.post("/api/internal/openai-agents-runtime/run", json=_make_request_payload())

    assert response.status_code == 401
    assert "Missing internal token" in response.json()["detail"]


@pytest.mark.unit
def test_run_delegates_to_adapter_and_uses_gateway_token():
    client = _make_client()
    request_payload = _make_request_payload()
    response_payload = _make_response_payload()

    with (
        patch("app.api.internal_openai_agents_runtime.settings") as mock_settings,
        patch("app.api.internal_openai_agents_runtime._adapter") as mock_adapter,
    ):
        mock_settings.SMARTSPEC_WEB_GATEWAY_TOKEN = VALID_TOKEN
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
        mock_settings.SMARTSPEC_WEB_GATEWAY_URL = "http://gateway.test"
        mock_adapter.run = AsyncMock(return_value=response_payload)

        response = client.post(
            "/api/internal/openai-agents-runtime/run",
            json=request_payload,
            headers={
                "X-Internal-Token": VALID_TOKEN,
                "X-Gateway-Attribution-Token": "gateway-attribution-token",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["selectedSkillSlug"] == "team-orchestrator"
    assert body["status"] == "completed"
    assert mock_adapter.run.await_count == 1
    called_request = mock_adapter.run.await_args.args[0]
    assert called_request.requestId == "request_demo"
    assert mock_adapter.run.await_args.kwargs["gateway_attribution_token"] == "gateway-attribution-token"


@pytest.mark.unit
def test_run_routes_native_skill_runtime_when_plan_context_requests_it(tmp_path, monkeypatch):
    client = _make_client()
    bundle_dir = tmp_path / "skills" / "demo-native"
    workspace_dir = tmp_path / "workspaces" / "run-1"
    (bundle_dir / "scripts").mkdir(parents=True)
    (bundle_dir / "references").mkdir()
    (bundle_dir / "SKILL.md").write_text(
        "---\nname: demo-native\ndescription: Demo native skill\nversion: 1.0.0\ntarget_platform: agents_python\n---\n# Demo\n",
        encoding="utf-8",
    )
    (bundle_dir / "skill.lock.json").write_text(
        json.dumps(
            {
                "name": "demo-native",
                "version": "1.0.0",
                "target_platform": "agents_python",
                "bundle_topology": "single-agent",
                "entrypoints": {"run": "scripts/run.sh", "verify": "scripts/verify.sh"},
                "outputs": ["SKILL.md", "scripts/run.sh", "scripts/verify.sh", "skill.lock.json"],
                "supported_modes": ["create", "improve", "maintenance"],
                "compatibility_mirror_policy": "mirror-skill-md",
                "subagent_manifest": None,
            }
        ),
        encoding="utf-8",
    )
    (bundle_dir / "scripts" / "run.sh").write_text("#!/usr/bin/env bash\nset -euo pipefail\necho run-ok\n", encoding="utf-8")
    (bundle_dir / "scripts" / "verify.sh").write_text("#!/usr/bin/env bash\nset -euo pipefail\necho verify-ok\n", encoding="utf-8")
    for script in ("run.sh", "verify.sh"):
        script_path = bundle_dir / "scripts" / script
        script_path.chmod(script_path.stat().st_mode | 0o111)
    monkeypatch.setenv("SMARTSPEC_NATIVE_SKILLS_ROOTS", str(tmp_path / "skills"))
    monkeypatch.setenv("SMARTSPEC_NATIVE_WORKSPACE_ROOTS", str(tmp_path / "workspaces"))

    request_payload = _make_request_payload()
    request_payload["allowedSkills"] = ["demo-native"]
    request_payload["allowedTools"] = ["native-skill-shell"]
    request_payload["executionEnvelope"] = {
        **request_payload["executionEnvelope"],
        "allowedSkills": ["demo-native"],
        "allowedTools": ["native-skill-shell"],
    }
    request_payload["planContext"] = {
        "nativeSkillRuntime": {
            "enabled": True,
            "skillSlug": "demo-native",
            "bundleDir": str(bundle_dir),
            "workspaceDir": str(workspace_dir),
        }
    }
    request_payload["assurance"] = {
        "contractVersion": 1,
        "contractId": "native-skill-contract",
        "attemptId": "attempt_native",
        "taskKind": "skill_execution",
        "contractHash": "a" * 64,
        "evidencePolicy": {
            "requiredPurposes": [],
            "requireVisionFor": [],
            "allowTextOnlyFallback": True,
            "maxEvidenceItems": 16,
            "minQualityScore": 0.7,
        },
        "evidence": [],
        "outputContract": {
            "schemaRef": "native-skill-artifact",
            "requiredFields": [],
            "maxChars": None,
        },
        "providerProfile": None,
        "budget": {
            "maxTurns": 8,
            "maxToolCalls": 16,
            "maxParallelAgents": 3,
            "maxPlanDepth": 4,
            "maxWallClockSeconds": 180,
            "maxInputTokens": 32000,
            "maxOutputTokens": 8000,
            "maxRepairAttempts": 2,
            "estimatedCost": 0,
        },
        "rulePackIds": [],
        "sideEffectPolicy": "read_only",
        "sideEffectAuthorization": None,
        "repairAttempts": 0,
    }

    with (
        patch("app.api.internal_openai_agents_runtime.settings") as mock_settings,
        patch("app.api.internal_openai_agents_runtime._adapter") as mock_adapter,
    ):
        mock_settings.SMARTSPEC_WEB_GATEWAY_TOKEN = VALID_TOKEN
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
        mock_settings.SMARTSPEC_WEB_GATEWAY_URL = "http://gateway.test"
        mock_adapter.run = AsyncMock()

        response = client.post(
            "/api/internal/openai-agents-runtime/run",
            json=request_payload,
            headers={"X-Internal-Token": VALID_TOKEN},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["selectedSkillSlug"] == "demo-native"
    assert body["status"] == "completed"
    assert body["toolCallsMade"] == ["native-skill-shell"]
    assert body["traceMetadata"]["nativeSkillRuntime"] is True
    assert body["assurance"]["state"] == "provider_ready"
    assert body["assurance"]["attemptId"] == "attempt_native"
    assert body["assurance"]["contractHash"] == "a" * 64
    assert mock_adapter.run.await_count == 0


@pytest.mark.unit
def test_run_invokes_native_agent_runner_for_subagent_bundle(tmp_path, monkeypatch):
    client = _make_client()
    bundle_dir = tmp_path / "skills" / "demo-native-subagents"
    workspace_dir = tmp_path / "workspaces" / "run-subagent"
    manifest = {
        "version": 1,
        "orchestrator": {
            "name": "demo-native-orchestrator",
            "role": "orchestrator",
            "mode": "orchestrator",
            "entrypoint": "agents/orchestrator.md",
            "toolBoundary": ["scripts/run.sh", "scripts/verify.sh"],
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
                "toolBoundary": ["scripts/run.sh", "scripts/verify.sh"],
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
    (bundle_dir / "scripts").mkdir(parents=True)
    (bundle_dir / "references").mkdir()
    (bundle_dir / "agents" / "specialists").mkdir(parents=True)
    (bundle_dir / "SKILL.md").write_text("---\nname: demo-native\ntarget_platform: agents_python\n---\n# Demo\n", encoding="utf-8")
    (bundle_dir / "subagents.json").write_text(json.dumps(manifest), encoding="utf-8")
    (bundle_dir / "skill.lock.json").write_text(
        json.dumps(
            {
                "name": "demo-native",
                "version": "1.0.0",
                "target_platform": "agents_python",
                "bundle_topology": "subagent-aware",
                "entrypoints": {"run": "scripts/run.sh", "verify": "scripts/verify.sh"},
                "outputs": ["SKILL.md", "scripts/run.sh", "scripts/verify.sh", "skill.lock.json", "subagents.json"],
                "subagent_manifest": "subagents.json",
                "subagent_manifest_sha256": _canonical_hash(manifest),
            }
        ),
        encoding="utf-8",
    )
    (bundle_dir / "agents" / "orchestrator.md").write_text("# Orchestrator\n", encoding="utf-8")
    (bundle_dir / "agents" / "specialists" / "researcher.md").write_text("# Researcher\n", encoding="utf-8")
    (bundle_dir / "scripts" / "verify.sh").write_text("#!/usr/bin/env bash\nset -euo pipefail\necho verify-ok\n", encoding="utf-8")
    (bundle_dir / "scripts" / "run.sh").write_text("#!/usr/bin/env bash\nset -euo pipefail\necho run-ok\n", encoding="utf-8")
    for script in ("run.sh", "verify.sh"):
        (bundle_dir / "scripts" / script).chmod(0o755)
    monkeypatch.setenv("SMARTSPEC_NATIVE_SKILLS_ROOTS", str(tmp_path / "skills"))
    monkeypatch.setenv("SMARTSPEC_NATIVE_WORKSPACE_ROOTS", str(tmp_path / "workspaces"))

    request_payload = _make_request_payload()
    request_payload["allowedSkills"] = ["demo-native"]
    request_payload["allowedTools"] = ["native-skill-shell"]
    request_payload["executionEnvelope"] = {
        **request_payload["executionEnvelope"],
        "allowedSkills": ["demo-native"],
        "allowedTools": ["native-skill-shell"],
    }
    request_payload["planContext"] = {
        "nativeSkillRuntime": {
            "enabled": True,
            "skillSlug": "demo-native",
            "bundleDir": str(bundle_dir),
            "workspaceDir": str(workspace_dir),
            "requestedSubagent": "researcher",
        }
    }

    with (
        patch("app.api.internal_openai_agents_runtime.settings") as mock_settings,
        patch("app.api.internal_openai_agents_runtime._adapter") as mock_adapter,
        patch("app.api.internal_openai_agents_runtime.execute_native_skill_agent_sync") as mock_agent_runner,
    ):
        mock_settings.SMARTSPEC_WEB_GATEWAY_TOKEN = VALID_TOKEN
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
        mock_settings.SMARTSPEC_WEB_GATEWAY_URL = "http://gateway.test"
        mock_adapter.run = AsyncMock()
        mock_agent_runner.return_value = {
            "status": "completed",
            "selectedAgentName": "researcher",
            "finalOutput": "agent-output",
        }

        response = client.post(
            "/api/internal/openai-agents-runtime/run",
            json=request_payload,
            headers={"X-Internal-Token": VALID_TOKEN},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["selectedAgentName"] == "researcher"
    assert body["finalOutput"]["rawContent"] == "agent-output"
    assert "subagent:researcher" in body["toolCallsMade"]
    assert mock_agent_runner.call_count == 1
    assert mock_adapter.run.await_count == 0


@pytest.mark.unit
def test_resume_routes_native_skill_runtime_when_plan_context_requests_it(tmp_path, monkeypatch):
    client = _make_client()
    bundle_dir = tmp_path / "skills" / "demo-native"
    workspace_dir = tmp_path / "workspaces" / "resume-1"
    (bundle_dir / "scripts").mkdir(parents=True)
    (bundle_dir / "SKILL.md").write_text("---\nname: demo-native\ntarget_platform: agents_python\n---\n# Demo\n", encoding="utf-8")
    (bundle_dir / "skill.lock.json").write_text(
        json.dumps(
            {
                "name": "demo-native",
                "version": "1.0.0",
                "target_platform": "agents_python",
                "bundle_topology": "single-agent",
                "entrypoints": {"run": "scripts/run.sh", "verify": "scripts/verify.sh"},
                "outputs": ["SKILL.md", "scripts/run.sh", "scripts/verify.sh", "skill.lock.json"],
                "subagent_manifest": None,
            }
        ),
        encoding="utf-8",
    )
    (bundle_dir / "scripts" / "run.sh").write_text("#!/usr/bin/env bash\nset -euo pipefail\necho run-ok\n", encoding="utf-8")
    (bundle_dir / "scripts" / "verify.sh").write_text("#!/usr/bin/env bash\nset -euo pipefail\necho verify-ok\n", encoding="utf-8")
    for script in ("run.sh", "verify.sh"):
        (bundle_dir / "scripts" / script).chmod(0o755)
    monkeypatch.setenv("SMARTSPEC_NATIVE_SKILLS_ROOTS", str(tmp_path / "skills"))
    monkeypatch.setenv("SMARTSPEC_NATIVE_WORKSPACE_ROOTS", str(tmp_path / "workspaces"))

    request_payload = _make_request_payload()
    request_payload["resumeCursor"] = "resume-verify"
    request_payload["allowedSkills"] = ["demo-native"]
    request_payload["allowedTools"] = ["native-skill-shell"]
    request_payload["executionEnvelope"] = {
        **request_payload["executionEnvelope"],
        "allowedSkills": ["demo-native"],
        "allowedTools": ["native-skill-shell"],
    }
    request_payload["planContext"] = {
        "nativeSkillRuntime": {
            "enabled": True,
            "skillSlug": "demo-native",
            "bundleDir": str(bundle_dir),
            "workspaceDir": str(workspace_dir),
        }
    }

    with (
        patch("app.api.internal_openai_agents_runtime.settings") as mock_settings,
        patch("app.api.internal_openai_agents_runtime._adapter") as mock_adapter,
    ):
        mock_settings.SMARTSPEC_WEB_GATEWAY_TOKEN = VALID_TOKEN
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
        mock_settings.SMARTSPEC_WEB_GATEWAY_URL = "http://gateway.test"
        mock_adapter.resume = AsyncMock()

        response = client.post(
            "/api/internal/openai-agents-runtime/resume",
            json=request_payload,
            headers={"X-Internal-Token": VALID_TOKEN},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["selectedSkillSlug"] == "demo-native"
    assert body["status"] == "completed"
    assert mock_adapter.resume.await_count == 0


@pytest.mark.unit
def test_router_registered_in_main():
    from app.main import app

    route_paths = [route.path for route in app.routes]
    assert "/api/internal/openai-agents-runtime/run" in route_paths
    assert "/api/internal/openai-agents-runtime/health" in route_paths
