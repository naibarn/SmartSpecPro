from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from agents.usage import Usage

import app.services.openai_agents_skill_runtime as skill_runtime
from app.api.internal_openai_agents_runtime import _native_runtime_result_to_agent_response


def test_native_agents_usage_reaches_agent_runtime_response(tmp_path: Path) -> None:
    usage = Usage(requests=1, input_tokens=137, output_tokens=29, total_tokens=166)
    sdk_result = SimpleNamespace(
        last_agent=SimpleNamespace(name="usage-acceptance"),
        final_output="task complete",
        context_wrapper=SimpleNamespace(usage=usage),
    )
    request = skill_runtime.NativeSkillRuntimeRequest(
        skill_slug="usage-acceptance",
        bundle_dir=tmp_path / "bundle",
        workspace_dir=tmp_path / "workspace",
    )
    request.bundle_dir.mkdir()
    request.workspace_dir.mkdir()

    with patch.object(skill_runtime.Runner, "run_sync", return_value=sdk_result):
        agent_result = skill_runtime.execute_native_skill_agent_sync(request)

    body = SimpleNamespace(
        runId="acceptance-run",
        requestId="acceptance-request",
        assurance=None,
        modelConfig=SimpleNamespace(
            providerId="openai", modelId="model", gatewayRouteId="route", resolvedGatewayModelId="openai/model"
        ),
        personaSnapshot=None,
        stepAssignment=None,
        stepContext=None,
    )
    response = _native_runtime_result_to_agent_response(
        body=body,
        native_request=request,
        result={
            "current_phase": "finalize",
            "phase_status": "completed",
            "phase_results": {"execute": {"agentResult": agent_result}},
            "artifacts": [],
        },
    )

    assert response.finalOutput["usage"] == {"promptTokens": 137, "completionTokens": 29}
