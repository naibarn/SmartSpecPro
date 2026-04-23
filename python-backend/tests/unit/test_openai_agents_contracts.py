from __future__ import annotations

import pytest

from app.services.openai_agents_contracts import (
    AgentRuntimeContractError,
    AgentRuntimeRequest,
    ReviewVerdict,
    validate_agent_runtime_request,
)


def _base_request() -> dict:
    return {
        "runtimeContractVersion": 2,
        "traceSchemaVersion": 2,
        "checkpointSchemaVersion": 2,
        "surface": "chat",
        "originSurface": "chat",
        "entryPoint": "chat_turn",
        "tenantId": "tenant_demo",
        "roomId": "room_demo",
        "runId": "run_demo",
        "messageId": "message_demo",
        "requestId": "request_demo",
        "idempotencyKey": "idem_demo",
        "objective": "Plan and execute the next safe step.",
        "planContext": {"goal": "draft a short concept brief"},
        "stepContext": {
            "stepId": "step_01",
            "stepKey": "plan-decompose",
            "attemptId": "attempt_01",
        },
        "activePersonaId": "persona_content_director",
        "personaSnapshot": {
            "personaId": "persona_content_director",
            "displayLabel": "Content Director",
            "nickname": "CD",
            "provenance": "direct_request",
            "promptSegmentRef": "segment_01",
            "guidanceSummary": "Leads the planning pass.",
        },
        "teamMembers": [],
        "stepAssignment": {
            "ownerMemberId": "member_owner",
            "ownerPersonaId": "persona_content_director",
            "ownerDisplayLabel": "Content Director",
            "reviewerMemberId": "member_reviewer",
            "reviewerPersonaId": "persona_trend_researcher",
            "reviewerDisplayLabel": "Trend Researcher",
        },
        "approvalCheckpointId": None,
        "resumeCursor": None,
        "structuredContextPackRef": "context_pack_01",
        "contextEvidenceItems": [],
        "candidateSkillManifests": [],
        "allowedTools": [],
        "allowedSkills": [],
        "allowedAgents": [],
        "completionPolicy": {"target": "complete"},
        "reviewPolicy": {"mode": "required"},
        "retryPolicy": {"maxAttempts": 3},
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
            "allowedTools": [],
            "allowedSkills": [],
            "allowedAgents": [],
            "sideEffectPolicy": "read_only",
        },
    }


def test_valid_chat_request_fixture_validates():
    request = validate_agent_runtime_request(_base_request())

    assert isinstance(request, AgentRuntimeRequest)
    assert request.surface == "chat"
    assert request.entryPoint == "chat_turn"
    assert request.executionEnvelope.sideEffectPolicy == "read_only"


def test_valid_team_step_request_fixture_validates():
    payload = _base_request()
    payload["surface"] = "team"
    payload["originSurface"] = "team"
    payload["entryPoint"] = "team_step"
    payload["teamMembers"] = [
        {
            "memberId": "member_owner",
            "memberKind": "assistant",
            "memberRole": "orchestrator",
            "personaId": "persona_content_director",
            "displayLabel": "Content Director",
            "personaDisplayLabel": "Content Director",
            "isLead": True,
            "preferredLanguage": "th",
            "personaGuidanceSummary": "Lead the planning loop.",
        },
        {
            "memberId": "member_reviewer",
            "memberKind": "assistant",
            "memberRole": "reviewer",
            "personaId": "persona_trend_researcher",
            "displayLabel": "Trend Researcher",
            "personaDisplayLabel": "Trend Researcher",
            "isLead": False,
            "preferredLanguage": "th",
            "personaGuidanceSummary": "Check cultural accuracy.",
        },
    ]

    request = validate_agent_runtime_request(payload)

    assert request.surface == "team"
    assert request.stepAssignment.ownerDisplayLabel == "Content Director"
    assert len(request.teamMembers) == 2


def test_mixed_deploy_previous_contract_versions_are_accepted():
    payload = _base_request()
    payload["runtimeContractVersion"] = 1
    payload["traceSchemaVersion"] = 1
    payload["checkpointSchemaVersion"] = 1

    request = validate_agent_runtime_request(payload)

    assert request.runtimeContractVersion == 1
    assert request.traceSchemaVersion == 1
    assert request.checkpointSchemaVersion == 1


def test_future_contract_versions_fail_closed():
    payload = _base_request()
    payload["runtimeContractVersion"] = 3

    with pytest.raises(AgentRuntimeContractError) as exc_info:
        validate_agent_runtime_request(payload)

    assert exc_info.value.code == "invalid_request"
    assert exc_info.value.issues


def test_missing_execution_envelope_fails():
    payload = _base_request()
    del payload["executionEnvelope"]

    with pytest.raises(AgentRuntimeContractError) as exc_info:
        validate_agent_runtime_request(payload)

    assert exc_info.value.code == "invalid_request"
    assert any(issue["path"] == "executionEnvelope" for issue in exc_info.value.issues)


def test_missing_model_config_fails():
    payload = _base_request()
    del payload["modelConfig"]

    with pytest.raises(AgentRuntimeContractError) as exc_info:
        validate_agent_runtime_request(payload)

    assert exc_info.value.code == "invalid_request"
    assert any(issue["path"] == "modelConfig" for issue in exc_info.value.issues)


def test_unknown_review_status_fails():
    with pytest.raises(Exception):
        ReviewVerdict.model_validate(
            {
                "status": "unknown",
                "issues": [],
            }
        )


def test_validation_errors_are_redacted():
    payload = _base_request()
    payload["traceCorrelationIds"] = {
        "traceId": "trace_demo",
        "parentTraceId": "secret-token-value",
    }
    del payload["executionEnvelope"]

    with pytest.raises(AgentRuntimeContractError) as exc_info:
        validate_agent_runtime_request(payload)

    issues = exc_info.value.issues
    assert issues
    assert "secret-token-value" not in str(issues)
    assert all("input" not in issue for issue in issues)
