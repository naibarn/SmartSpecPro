import pytest

from app.services.agent_output_assurance import AssuranceRequest
from app.services.openai_agents_vertical_drama_outputs import (
    VERTICAL_DRAMA_OUTPUT_TYPES,
    build_vertical_drama_output_guardrails,
    resolve_vertical_drama_output_type,
    validate_vertical_drama_output_identity,
)


def make_request(**overrides):
    payload = {
        "contractVersion": 1,
        "contractId": "vd-contract",
        "attemptId": "attempt-1",
        "taskKind": "structured_generation",
        "contractHash": "a" * 64,
        "evidencePolicy": {"allowTextOnlyFallback": True},
        "evidence": [{"ref": "context:1", "purpose": "context", "trusted": True}],
        "outputContract": {"schemaRef": "vd.assurance.story-findings.v1"},
        "budget": {},
    }
    payload.update(overrides)
    return AssuranceRequest.model_validate(payload)


def test_resolve_vertical_drama_output_type_by_versioned_schema_ref():
    assert resolve_vertical_drama_output_type(make_request()).__name__ == "VerticalDramaStoryFindings"
    assert len(VERTICAL_DRAMA_OUTPUT_TYPES) == 6


def test_unknown_or_task_mismatched_schema_is_rejected_before_runner():
    with pytest.raises(ValueError, match="unknown_vertical_drama_output_schema"):
        resolve_vertical_drama_output_type(make_request(outputContract={"schemaRef": "vd.assurance.unknown.v1"}))
    with pytest.raises(ValueError, match="task_mismatch"):
        resolve_vertical_drama_output_type(make_request(taskKind="skill_execution"))


def test_valid_output_requires_identity_and_server_issued_refs():
    request = make_request()
    output = {
        "schemaRef": "vd.assurance.story-findings.v1",
        "taskKind": "structured_generation",
        "attemptId": "attempt-1",
        "contextFingerprint": "a" * 64,
        "inputRefs": ["context:1"],
        "findings": [{"code": "ok", "message": "ok", "evidenceRefs": ["context:1"]}],
    }
    assert validate_vertical_drama_output_identity(request, output).schemaRef == output["schemaRef"]
    with pytest.raises(ValueError, match="reference_mismatch"):
        validate_vertical_drama_output_identity(request, {**output, "inputRefs": ["attacker-ref"]})


def test_output_guardrail_is_bound_to_the_trusted_type():
    guardrails = build_vertical_drama_output_guardrails(make_request())
    assert len(guardrails) == 1
    assert guardrails[0].name == "vertical_drama_assurance_output"
