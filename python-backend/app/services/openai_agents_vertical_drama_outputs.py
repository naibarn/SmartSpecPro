"""Trusted structured-output registry for the Vertical Drama assurance seam.

The Node contract sends a versioned schema reference.  It never sends a Python
class name or executable JSON schema.  This module is the only place where a
Vertical Drama assurance schema reference becomes an SDK ``output_type``.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, ClassVar

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.services.agent_output_assurance import AssuranceRequest


class VerticalDramaOutputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaRef: str = Field(min_length=1)
    taskKind: str = Field(min_length=1)
    attemptId: str = Field(min_length=1)
    contextFingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    inputRefs: list[str] = Field(max_length=256)
    findings: list[dict[str, Any]] = Field(default_factory=list, max_length=256)
    expected_schema_ref: ClassVar[str]


class VerticalDramaStoryFindings(VerticalDramaOutputModel):
    expected_schema_ref = "vd.assurance.story-findings.v1"


class VerticalDramaSeasonFindings(VerticalDramaOutputModel):
    expected_schema_ref = "vd.assurance.season-findings.v1"


class VerticalDramaDraftQcFindings(VerticalDramaOutputModel):
    expected_schema_ref = "vd.assurance.draft-qc-findings.v1"


class VerticalDramaDraftRepairProposal(VerticalDramaOutputModel):
    expected_schema_ref = "vd.assurance.draft-repair-proposal.v1"


class VerticalDramaPromptFindings(VerticalDramaOutputModel):
    expected_schema_ref = "vd.assurance.prompt-findings.v1"


class VerticalDramaMediaFindings(VerticalDramaOutputModel):
    expected_schema_ref = "vd.assurance.media-findings.v1"


VERTICAL_DRAMA_OUTPUT_TYPES: Mapping[str, type[VerticalDramaOutputModel]] = {
    model.expected_schema_ref: model
    for model in (
        VerticalDramaStoryFindings,
        VerticalDramaSeasonFindings,
        VerticalDramaDraftQcFindings,
        VerticalDramaDraftRepairProposal,
        VerticalDramaPromptFindings,
        VerticalDramaMediaFindings,
    )
}

_SCHEMA_TASK_KINDS: Mapping[str, frozenset[str]] = {
    "vd.assurance.story-findings.v1": frozenset({"structured_generation"}),
    "vd.assurance.season-findings.v1": frozenset({"structured_generation"}),
    "vd.assurance.draft-qc-findings.v1": frozenset({"skill_execution"}),
    "vd.assurance.draft-repair-proposal.v1": frozenset({"skill_execution"}),
    "vd.assurance.prompt-findings.v1": frozenset({"image_prompt", "video_prompt", "skill_execution"}),
    "vd.assurance.media-findings.v1": frozenset({"skill_execution"}),
}


def supported_vertical_drama_output_schemas() -> list[str]:
    return sorted(VERTICAL_DRAMA_OUTPUT_TYPES)


def resolve_vertical_drama_output_type(request: AssuranceRequest) -> type[VerticalDramaOutputModel] | None:
    """Resolve only Feature 157 schemas; generic runtime requests stay compatible."""

    schema_ref = request.outputContract.schemaRef
    output_type = VERTICAL_DRAMA_OUTPUT_TYPES.get(schema_ref)
    if output_type is None:
        if schema_ref.startswith("vd.assurance."):
            raise ValueError("unknown_vertical_drama_output_schema")
        return None
    if request.taskKind not in _SCHEMA_TASK_KINDS[schema_ref]:
        raise ValueError("vertical_drama_output_schema_task_mismatch")
    return output_type


def validate_vertical_drama_output_identity(
    request: AssuranceRequest,
    output: Any,
) -> VerticalDramaOutputModel | None:
    output_type = resolve_vertical_drama_output_type(request)
    if output_type is None:
        return None
    try:
        parsed = output_type.model_validate(output)
    except ValidationError as exc:
        raise ValueError("vertical_drama_output_schema_invalid") from exc
    if (
        parsed.schemaRef != request.outputContract.schemaRef
        or parsed.attemptId != request.attemptId
        or (request.contractHash is not None and parsed.contextFingerprint != request.contractHash)
    ):
        raise ValueError("vertical_drama_output_identity_mismatch")
    allowed_refs = {item.ref for item in request.evidence}
    if not set(parsed.inputRefs).issubset(allowed_refs):
        raise ValueError("vertical_drama_output_reference_mismatch")
    for finding in parsed.findings:
        refs = finding.get("evidenceRefs", [])
        if not isinstance(refs, list) or not set(refs).issubset(allowed_refs):
            raise ValueError("vertical_drama_output_reference_mismatch")
    return parsed


def build_vertical_drama_output_guardrails(request: AssuranceRequest) -> list[Any]:
    """Build an SDK guardrail that repeats identity/reference checks in Python."""

    output_type = resolve_vertical_drama_output_type(request)
    if output_type is None:
        return []
    try:
        from agents import GuardrailFunctionOutput, OutputGuardrail
    except ModuleNotFoundError as exc:  # pragma: no cover - health gate handles this
        raise ValueError("openai_agents_sdk_output_guardrail_unavailable") from exc

    async def validate(_context: Any, _agent: Any, output: Any) -> Any:
        try:
            parsed = validate_vertical_drama_output_identity(request, output)
        except ValueError as exc:
            return GuardrailFunctionOutput(output_info={"error": str(exc)}, tripwire_triggered=True)
        return GuardrailFunctionOutput(output_info={"schemaRef": parsed.schemaRef if parsed else None}, tripwire_triggered=False)

    return [OutputGuardrail(guardrail_function=validate, name="vertical_drama_assurance_output")]
