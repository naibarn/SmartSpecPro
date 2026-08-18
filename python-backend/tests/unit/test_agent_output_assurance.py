from datetime import datetime, timezone

from app.services.agent_output_assurance import (
    AssuranceRequest,
    ProviderCapabilityProfile,
    SideEffectAuthorization,
    canonical_json,
    compose_character_identity,
    detect_plan_cycle,
    validate_evidence_bundle,
    validate_provider_prompt_length,
    validate_side_effect_authorization,
)
from app.services.openai_agents_orchestra import OrchestraAdmissionError, preflight_orchestra_request


def make_request(**overrides):
    payload = {
        "contractVersion": 1,
        "contractId": "contract-1",
        "attemptId": "attempt-1",
        "taskKind": "video_prompt",
        "evidencePolicy": {"requiredPurposes": ["scene"], "requireVisionFor": ["video_prompt"]},
        "evidence": [{"ref": "img-1", "purpose": "scene", "qualityScore": 0.9, "readable": True, "resolution": "high", "unresolvedPeople": 0, "trusted": True}],
        "outputContract": {"schemaRef": "video.prompt"},
        "providerProfile": {"providerId": "kie", "modelId": "grok", "maxPromptChars": 4096, "supportsVision": True},
        "budget": {},
    }
    payload.update(overrides)
    return AssuranceRequest.model_validate(payload)


def test_contract_and_canonical_hash_vector():
    assert canonical_json({"b": 2, "a": 1}) == '{"a":1,"b":2}'
    assert make_request().taskKind == "video_prompt"


def test_ambiguous_evidence_and_kie_limit_block():
    request = make_request(evidence=[{"ref": "img-1", "purpose": "scene", "qualityScore": 0.9, "unresolvedPeople": 1}])
    assert validate_evidence_bundle(request).code == "evidence_extra_people_unresolved"
    profile = ProviderCapabilityProfile(providerId="kie", modelId="grok", maxPromptChars=4096)
    assert validate_provider_prompt_length(profile, "x" * 4097).code == "provider_budget_exceeded"
    assert validate_provider_prompt_length(profile, "x" * 4096) is None


def test_custom_identity_wins_and_cycles_are_rejected():
    assert compose_character_identity("ไอริณ", "ผู้หญิงที่ใส่ผ้ากันเปื้อน", "viewer-left") == "ไอริณ (ผู้หญิงที่ใส่ผ้ากันเปื้อน)"
    assert detect_plan_cycle([{"id": "a", "dependsOn": ["b"]}, {"id": "b", "dependsOn": ["a"]}]) is True


def test_side_effect_authorization_is_bound_and_expires():
    auth = SideEffectAuthorization(tokenId="tok", tenantId="tenant", contractHash="a" * 64, outputHash="b" * 64, policyHash="c" * 64, allowedEffects=["provider.submit"], expiresAt=datetime(2099, 1, 1, tzinfo=timezone.utc), nonce="nonce")
    assert validate_side_effect_authorization(auth, {"tenantId": "tenant", "contractHash": "a" * 64, "outputHash": "b" * 64, "policyHash": "c" * 64}) is None
    assert validate_side_effect_authorization(auth, {"tenantId": "other", "contractHash": "a" * 64, "outputHash": "b" * 64, "policyHash": "c" * 64}).code == "side_effect_unauthorized"


def test_orchestra_preflight_rejects_agency_origin_without_running_sdk():
    payload = {
        "runtimeContractVersion": 2,
        "traceSchemaVersion": 2,
        "checkpointSchemaVersion": 2,
        "surface": "chat",
        "originSurface": "chat",
        "entryPoint": "chat_turn",
        "tenantId": "tenant",
        "requestId": "request-1",
        "idempotencyKey": "idem-1",
        "objective": "test",
        "teamMembers": [],
        "candidateSkillManifests": [],
        "allowedTools": [],
        "allowedSkills": [],
        "allowedAgents": [],
        "completionPolicy": {},
        "reviewPolicy": {},
        "retryPolicy": {},
        "traceCorrelationIds": {"traceId": "trace-1"},
        "modelConfig": {"providerId": "test", "modelId": "test"},
        "executionEnvelope": {"envelopeId": "env-1", "tenantId": "tenant", "issuedAt": "2026-01-01T00:00:00Z", "expiresAt": "2099-01-01T00:00:00Z", "allowedTools": [], "allowedSkills": [], "allowedAgents": [], "sideEffectPolicy": "read_only"},
        "planContext": {"originSurface": "agency"},
        "contextEvidenceItems": [],
        "assurance": make_request().model_dump(),
    }
    from app.services.openai_agents_contracts import AgentRuntimeRequest
    request = AgentRuntimeRequest.model_validate(payload)
    try:
        preflight_orchestra_request(request)
    except OrchestraAdmissionError as exc:
        assert exc.finding.code == "agency_origin_forbidden"
    else:
        raise AssertionError("Agency origin must be rejected before SDK execution")
