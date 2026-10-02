from __future__ import annotations

import pytest

from app.services.openai_agents_contracts import (
    AgentRuntimeCheckpoint,
    AgentRuntimeContractError,
    AgentRuntimeEvent,
    AgentRuntimeRequest,
    ReviewVerdict,
    validate_agent_runtime_cancel_request,
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


def _gateway_metadata() -> dict:
    return {
        "tenantId": "tenant_demo",
        "userId": "user_demo",
        "surface": "media_production",
        "originSurface": "marketplace_capture",
        "productionProjectId": "production_project_demo",
        "productionRunId": "production_run_demo",
        "agentRunId": "mar_demo",
        "agentName": "Production Director",
        "agentRole": "production_director",
        "stageKey": "concept_story",
        "stepId": "step_01",
        "attemptId": "attempt_01",
        "modelPolicyId": "model_policy_demo",
        "selectedModelId": "openai/gpt-4.1-mini",
        "creditCategory": "llm_planning",
        "idempotencyKey": "idem_demo",
        "creditReservationRef": "credit-reservation:llm-planning-demo",
        "creditLedgerRef": "credit-ledger:llm-planning-demo",
        "creditPayerRef": "credit-payer:user_demo",
        "preflightSnapshotRef": "preflight:product-preflight-demo",
        "creditAuditRef": "credit-audit:llm-planning-demo",
    }


def _production_manifest() -> dict:
    return {
        "schemaVersion": "1.0",
        "tenantId": "tenant_demo",
        "userId": "user_demo",
        "runId": "mar_demo",
        "stageKey": "concept_story",
        "attemptId": "attempt_01",
        "manifestHash": "manifest_hash_demo",
        "allowedAgents": ["production_director"],
        "allowedHandoffs": [],
        "allowedTools": [
            {
                "name": "return_structured_intent",
                "category": "read_state",
                "mutating": False,
                "nodeExecuted": True,
                "requiresApprovalRef": False,
                "creditCategory": "llm_planning",
                "idempotencyKey": "idem_demo",
                "timeoutMs": 30000,
                "maxCallsPerAttempt": 3,
                "outputTrust": "untrusted",
            }
        ],
        "hostedSdkCapabilities": {
            "webSearch": False,
            "fileSearch": False,
            "computerUse": False,
            "codeInterpreter": False,
            "imageGeneration": False,
            "audioGeneration": False,
            "videoGeneration": False,
            "remoteMcp": False,
            "shell": False,
        },
        "outputSchemas": [
            {
                "artifactKind": "CreativeConceptSet",
                "schemaVersion": "1.0",
                "required": True,
            }
        ],
        "sessionPolicy": {
            "persistRawSdkSession": False,
            "checkpointRefsOnly": True,
            "resumeCursorRef": "resume_cursor_ref_demo",
            "maxSessionEventBytes": 2048,
        },
        "tracePolicy": {
            "captureSensitiveInputOutput": False,
            "externalSdkTraceExport": "disabled",
            "redactionProfileId": "media-production-safe",
            "maxTraceEventBytes": 2048,
            "platformTraceEventRefs": ["trace_event_ref_demo"],
        },
        "streamPolicy": {
            "normalizeEvents": True,
            "stableEventIds": True,
            "duplicateEventBehavior": "idempotent_noop",
        },
        "approvedByNodeAt": "2026-04-20T00:00:00Z",
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


def test_valid_media_production_request_fixture_validates():
    payload = _base_request()
    payload["surface"] = "media_production"
    payload["originSurface"] = "marketplace_capture"
    payload["entryPoint"] = "marketplace_auto_review_stage"
    payload["runId"] = "mar_demo"
    payload["objective"] = "Plan an evidence-bound marketplace review storyboard."
    payload["stepContext"]["stepKey"] = "concept_story"
    payload["planContext"] = {
        "input": {
            "stageKey": "concept_story",
            "capabilityManifestHash": "manifest_hash_demo",
            "evidenceInstructionFirewallRef": "firewall_demo",
        }
    }
    payload["candidateSkillManifests"] = [
        {
            "slug": "marketplace-production-director",
            "manifestSchemaVersion": 1,
            "name": "Marketplace Production Director",
            "purpose": "Plan marketplace review media using locked product evidence.",
            "supportedSurfaces": ["media_production"],
            "supportedOriginSurfaces": ["marketplace_capture"],
            "supportedEntryPoints": ["marketplace_auto_review_stage"],
            "taskTypes": ["creative_planning"],
            "outputSchema": {"schemaRef": "CreativeConceptSet"},
        }
    ]
    payload["allowedTools"] = ["return_structured_intent"]
    payload["allowedSkills"] = ["marketplace-production-director"]
    payload["allowedAgents"] = ["production_director"]
    payload["executionEnvelope"]["allowedTools"] = ["return_structured_intent"]
    payload["executionEnvelope"]["allowedSkills"] = ["marketplace-production-director"]
    payload["executionEnvelope"]["allowedAgents"] = ["production_director"]
    payload["gatewayInvocationMetadata"] = _gateway_metadata()
    payload["productionAgentsSdkCapabilityManifest"] = _production_manifest()

    request = validate_agent_runtime_request(payload)

    assert request.surface == "media_production"
    assert request.entryPoint == "marketplace_auto_review_stage"
    assert request.candidateSkillManifests[0].supportedSurfaces == ["media_production"]
    assert request.gatewayInvocationMetadata.userId == "user_demo"


def test_media_production_rejects_extra_manifest_agent_tool_and_schema_authority():
    payload = _base_request()
    payload["surface"] = "media_production"
    payload["originSurface"] = "marketplace_capture"
    payload["entryPoint"] = "marketplace_auto_review_stage"
    payload["runId"] = "mar_demo"
    payload["objective"] = "Plan an evidence-bound marketplace review storyboard."
    payload["stepContext"]["stepKey"] = "concept_story"
    payload["planContext"] = {
        "capabilityManifestHash": "manifest_hash_demo",
        "input": {"stageKey": "concept_story"},
    }
    payload["candidateSkillManifests"] = [
        {
            "slug": "marketplace-production-director",
            "manifestSchemaVersion": 1,
            "name": "Marketplace Production Director",
            "purpose": "Plan marketplace review media using locked product evidence.",
            "supportedSurfaces": ["media_production"],
            "supportedOriginSurfaces": ["marketplace_capture"],
            "supportedEntryPoints": ["marketplace_auto_review_stage"],
            "taskTypes": ["creative_planning"],
            "outputSchema": {"schemaRef": "CreativeConceptSet"},
        }
    ]
    payload["allowedTools"] = ["return_structured_intent"]
    payload["allowedSkills"] = ["marketplace-production-director"]
    payload["allowedAgents"] = ["production_director"]
    payload["executionEnvelope"]["allowedTools"] = ["return_structured_intent"]
    payload["executionEnvelope"]["allowedSkills"] = ["marketplace-production-director"]
    payload["executionEnvelope"]["allowedAgents"] = ["production_director"]
    payload["gatewayInvocationMetadata"] = _gateway_metadata()
    payload["productionAgentsSdkCapabilityManifest"] = _production_manifest()

    with pytest.raises(AgentRuntimeContractError):
        validate_agent_runtime_request(
            {
                **payload,
                "productionAgentsSdkCapabilityManifest": {
                    **payload["productionAgentsSdkCapabilityManifest"],
                    "allowedAgents": ["production_director", "unapproved_agent"],
                },
            }
        )

    with pytest.raises(AgentRuntimeContractError):
        validate_agent_runtime_request(
            {
                **payload,
                "productionAgentsSdkCapabilityManifest": {
                    **payload["productionAgentsSdkCapabilityManifest"],
                    "allowedTools": [
                        *payload["productionAgentsSdkCapabilityManifest"]["allowedTools"],
                        {
                            **payload["productionAgentsSdkCapabilityManifest"]["allowedTools"][0],
                            "name": "schedule_unapproved_media",
                        },
                    ],
                },
            }
        )

    with pytest.raises(AgentRuntimeContractError):
        validate_agent_runtime_request(
            {
                **payload,
                "productionAgentsSdkCapabilityManifest": {
                    **payload["productionAgentsSdkCapabilityManifest"],
                    "outputSchemas": [
                        *payload["productionAgentsSdkCapabilityManifest"]["outputSchemas"],
                        {
                            "artifactKind": "UnapprovedProviderJob",
                            "schemaVersion": "1.0",
                            "required": False,
                        },
                    ],
                },
            }
        )


@pytest.mark.parametrize(
    "origin_surface",
    [
        "marketplace_capture",
        "media_studio_production",
        "media_studio_video_shot",
        "storyboard_review",
        "video_edit",
    ],
)
def test_feature_117_origin_surfaces_validate(origin_surface: str):
    payload = _base_request()
    payload["originSurface"] = origin_surface

    request = validate_agent_runtime_request(payload)

    assert request.originSurface == origin_surface


def test_media_production_missing_gateway_metadata_fails_validation():
    payload = _base_request()
    payload["surface"] = "media_production"
    payload["originSurface"] = "marketplace_capture"
    payload["entryPoint"] = "marketplace_auto_review_stage"
    payload["runId"] = "mar_demo"
    payload["allowedSkills"] = ["marketplace-production-director"]
    payload["executionEnvelope"]["allowedSkills"] = ["marketplace-production-director"]
    payload["productionAgentsSdkCapabilityManifest"] = _production_manifest()

    with pytest.raises(AgentRuntimeContractError) as exc_info:
        validate_agent_runtime_request(payload)

    assert exc_info.value.code == "invalid_request"
    assert exc_info.value.issues


def test_media_production_invalid_gateway_metadata_fails_validation():
    payload = _base_request()
    payload["surface"] = "media_production"
    payload["originSurface"] = "marketplace_capture"
    payload["entryPoint"] = "marketplace_auto_review_stage"
    payload["runId"] = "mar_demo"
    payload["gatewayInvocationMetadata"] = {
        **_gateway_metadata(),
        "selectedModelId": "wrong-model",
    }
    payload["productionAgentsSdkCapabilityManifest"] = _production_manifest()

    with pytest.raises(AgentRuntimeContractError) as exc_info:
        validate_agent_runtime_request(payload)

    assert exc_info.value.code == "invalid_request"


def test_media_production_missing_step_context_fails_validation():
    payload = _base_request()
    payload["surface"] = "media_production"
    payload["originSurface"] = "marketplace_capture"
    payload["entryPoint"] = "marketplace_auto_review_stage"
    payload["runId"] = "mar_demo"
    del payload["stepContext"]
    payload["gatewayInvocationMetadata"] = _gateway_metadata()
    payload["productionAgentsSdkCapabilityManifest"] = _production_manifest()

    with pytest.raises(AgentRuntimeContractError) as exc_info:
        validate_agent_runtime_request(payload)

    assert exc_info.value.code == "invalid_request"


def test_media_production_gateway_credit_audit_refs_are_required():
    payload = _base_request()
    payload["surface"] = "media_production"
    payload["originSurface"] = "marketplace_capture"
    payload["entryPoint"] = "marketplace_auto_review_stage"
    payload["runId"] = "mar_demo"
    payload["stepContext"]["stepKey"] = "concept_story"
    metadata = _gateway_metadata()
    del metadata["creditAuditRef"]
    payload["gatewayInvocationMetadata"] = metadata
    payload["productionAgentsSdkCapabilityManifest"] = _production_manifest()

    with pytest.raises(AgentRuntimeContractError) as exc_info:
        validate_agent_runtime_request(payload)

    assert exc_info.value.code == "invalid_request"


def test_media_production_cancel_requires_manifest_stage_attempt_identity():
    payload = {
        "runtimeContractVersion": 2,
        "traceSchemaVersion": 2,
        "checkpointSchemaVersion": 2,
        "surface": "media_production",
        "tenantId": "tenant_demo",
        "runId": "mar_demo",
        "requestId": "request_demo",
        "idempotencyKey": "idem_demo",
        "cancelReason": "user_requested",
        "actorMetadata": {},
        "traceCorrelationIds": {
            "traceId": "trace_demo",
            "parentTraceId": None,
        },
    }

    with pytest.raises(AgentRuntimeContractError) as missing_identity:
        validate_agent_runtime_cancel_request(payload)

    assert missing_identity.value.code == "invalid_request"

    cancel_request = validate_agent_runtime_cancel_request(
        {
            **payload,
            "manifestHash": "manifest_hash_demo",
            "stageKey": "concept_story",
            "attemptId": "attempt_01",
        }
    )

    assert cancel_request.manifestHash == "manifest_hash_demo"
    assert cancel_request.stageKey == "concept_story"
    assert cancel_request.attemptId == "attempt_01"


def test_stream_event_contract_carries_manifest_identity():
    event = AgentRuntimeEvent.model_validate(
        {
            "runtimeContractVersion": 2,
            "traceSchemaVersion": 2,
            "checkpointSchemaVersion": 2,
            "eventId": "event_demo",
            "eventName": "response.created",
            "surface": "media_production",
            "requestId": "request_demo",
            "idempotencyKey": "idem_demo",
            "sequence": 1,
            "sourceComponent": "openai_agents_adapter",
            "traceId": "trace_demo",
            "stepId": "step_01",
            "stepKey": "concept_story",
            "stageKey": "concept_story",
            "attemptId": "attempt_01",
            "manifestHash": "manifest_hash_demo",
            "sdkVersion": "0.0-test",
            "adapterVersion": "test",
            "redactedPayload": {},
        }
    )

    assert event.manifestHash == "manifest_hash_demo"
    assert event.stageKey == "concept_story"


def test_media_production_checkpoint_requires_top_level_authority_identity():
    checkpoint = AgentRuntimeCheckpoint.model_validate(
        {
            "runtimeContractVersion": 2,
            "traceSchemaVersion": 2,
            "checkpointSchemaVersion": 2,
            "checkpointId": "checkpoint_demo",
            "surface": "media_production",
            "requestId": "request_demo",
            "tenantId": "tenant_demo",
            "resumeCursor": "cursor_demo",
            "stepKey": "concept_story",
            "attemptId": "attempt_01",
            "manifestHash": "manifest_hash_demo",
            "status": "pending",
            "originalAttemptId": "attempt_01",
            "linkedAttemptId": "attempt_01",
            "checkpointPayload": {"checkpointRef": "checkpoint_ref_demo"},
        }
    )

    assert checkpoint.stepKey == "concept_story"
    assert checkpoint.attemptId == "attempt_01"
    assert checkpoint.manifestHash == "manifest_hash_demo"
    assert checkpoint.originalAttemptId == "attempt_01"
    assert checkpoint.linkedAttemptId == "attempt_01"

    with pytest.raises(Exception):
        AgentRuntimeCheckpoint.model_validate(
            {
                "runtimeContractVersion": 2,
                "traceSchemaVersion": 2,
                "checkpointSchemaVersion": 2,
                "checkpointId": "checkpoint_missing_identity",
                "surface": "media_production",
                "requestId": "request_demo",
                "tenantId": "tenant_demo",
                "status": "pending",
                "checkpointPayload": {},
            }
        )


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
