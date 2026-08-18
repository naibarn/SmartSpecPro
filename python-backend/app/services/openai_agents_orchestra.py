"""Assurance-first orchestration seam around the OpenAI Agents adapter.

The SDK is deliberately kept behind this boundary. This module performs the
cheap deterministic checks before a Runner is allowed to spend tokens or call
an external provider; the existing adapter remains responsible for SDK
compatibility, tracing, streaming, and checkpoints.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from app.services.agent_output_assurance import (
    AssuranceFinding,
    AssuranceRequest,
    AssuranceResult,
    validate_evidence_bundle,
)
from app.services.openai_agents_contracts import AgentRuntimeRequest, AgentRuntimeResponse


class OrchestraAdmissionError(ValueError):
    def __init__(self, finding: AssuranceFinding):
        super().__init__(finding.message)
        self.finding = finding


def preflight_orchestra_request(request: AgentRuntimeRequest) -> AssuranceRequest | None:
    assurance = request.assurance
    if assurance is None:
        return None
    raw_origin = (request.originSurface or "").strip().lower()
    context_origin = request.planContext.get("originSurface") if request.planContext else None
    if raw_origin in {"agency", "agency_swarm", "agency-swarm"} or str(context_origin or "").strip().lower() in {
        "agency",
        "agency_swarm",
        "agency-swarm",
    }:
        raise OrchestraAdmissionError(
            AssuranceFinding(code="agency_origin_forbidden", severity="blocking", message="agency_swarm_active_execution_forbidden")
        )
    finding = validate_evidence_bundle(assurance)
    if finding is not None:
        raise OrchestraAdmissionError(finding)
    if assurance.sideEffectPolicy != "read_only" and assurance.sideEffectAuthorization is None:
        raise OrchestraAdmissionError(
            AssuranceFinding(code="side_effect_unauthorized", severity="blocking", message="side_effect_authorization_required")
        )
    return assurance


async def run_orchestra(
    request: AgentRuntimeRequest,
    adapter_run: Callable[..., Awaitable[AgentRuntimeResponse]],
    **adapter_kwargs: Any,
) -> AgentRuntimeResponse:
    assurance = preflight_orchestra_request(request)
    response = await adapter_run(request, **adapter_kwargs)
    if assurance is None:
        return response
    if response.assurance is None:
        response.assurance = AssuranceResult.model_validate({
            "executionId": request.runId or request.requestId,
            "attemptId": assurance.attemptId,
            # The adapter has already completed its bounded run at this
            # boundary.  Exposing `verifying` here made every Node final gate
            # reject an otherwise valid artifact because only `provider_ready`
            # and `committed` are admissible for side-effect review.  Python
            # still never performs the side effect; this state means the
            # artifact is ready for Node's final deterministic gate.
            "state": "provider_ready" if response.status == "completed" else "failed",
            "contractHash": assurance.contractHash,
            "findings": [],
            "sideEffectAuthorizationId": None,
        })
    elif response.assurance.attemptId != assurance.attemptId:
        raise OrchestraAdmissionError(
            AssuranceFinding(code="contract_hash_mismatch", severity="blocking", message="assurance_attempt_mismatch")
        )
    elif assurance.contractHash and response.assurance.contractHash != assurance.contractHash:
        raise OrchestraAdmissionError(
            AssuranceFinding(code="contract_hash_mismatch", severity="blocking", message="assurance_contract_hash_mismatch")
        )
    return response
