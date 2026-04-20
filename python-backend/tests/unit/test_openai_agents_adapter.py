from __future__ import annotations

import pytest

from app.services.openai_agents_adapter import (
    OpenAIAgentsAdapterError,
    RegisteredRuntimeHandoff,
    RegisteredRuntimeTool,
    RuntimeScope,
    label_tool_output_untrusted,
    prepare_allowed_handoffs,
    prepare_allowed_tools,
)
from app.services.openai_agents_contracts import AgentRuntimeRequest


def _request(allowed_tools: list[str] | None = None) -> AgentRuntimeRequest:
    return AgentRuntimeRequest.model_validate(
        {
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
            "objective": "Work through the locked plan step.",
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
            "allowedTools": allowed_tools or ["research_tool"],
            "allowedSkills": [],
            "allowedAgents": ["review_agent"],
            "completionPolicy": {},
            "reviewPolicy": {},
            "retryPolicy": {},
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
                "allowedTools": allowed_tools or ["research_tool"],
                "allowedSkills": [],
                "allowedAgents": ["review_agent"],
                "sideEffectPolicy": "approval_required",
            },
        }
    )


def test_only_allowed_tools_are_registered():
    request = _request(["research_tool"])
    tools = [
        RegisteredRuntimeTool(
            slug="research_tool",
            tool={"name": "research"},
            side_effect_class="read_only",
            requires_approval=False,
        ),
        RegisteredRuntimeTool(
            slug="blocked_tool",
            tool={"name": "blocked"},
            side_effect_class="read_only",
            requires_approval=False,
        ),
    ]

    prepared = prepare_allowed_tools(request, tools)

    assert [tool.slug for tool in prepared] == ["research_tool"]


def test_mutating_tool_without_approval_requirement_is_rejected():
    request = _request(["publish_tool"])
    tools = [
        RegisteredRuntimeTool(
            slug="publish_tool",
            tool={"name": "publish"},
            side_effect_class="connector_write",
            requires_approval=False,
        )
    ]

    with pytest.raises(OpenAIAgentsAdapterError) as exc_info:
        prepare_allowed_tools(request, tools)

    assert exc_info.value.code == "mutating_tool_requires_approval"


def test_handoff_cannot_widen_scope():
    request = _request()
    handoffs = [
        RegisteredRuntimeHandoff(
            targetAgentName="review_agent",
            handoff={"name": "review"},
            sourceScope=RuntimeScope(
                tools=frozenset({"research_tool"}),
                connectors=frozenset({"google_drive"}),
                writeScopes=frozenset({"notes"}),
            ),
            targetScope=RuntimeScope(
                tools=frozenset({"research_tool", "delete_tool"}),
                connectors=frozenset({"google_drive"}),
                writeScopes=frozenset({"notes", "database"}),
            ),
        )
    ]

    with pytest.raises(OpenAIAgentsAdapterError) as exc_info:
        prepare_allowed_handoffs(request, handoffs)

    assert exc_info.value.code == "handoff_scope_widening_rejected"


def test_tool_output_is_labeled_untrusted():
    envelope = label_tool_output_untrusted(
        tool_slug="research_tool",
        output={"summary": "Draft result"},
    )

    assert envelope["trusted"] is False
    assert envelope["trustLevel"] == "tool_generated_untrusted"
    assert envelope["toolSlug"] == "research_tool"
