from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.services.openai_agents_adapter import (
    OpenAIAgentsAdapter,
    OpenAIAgentsRuntimeComponents,
)
from app.services.openai_agents_trace import normalize_stream_event


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
        "objective": "Continue safely from the latest checkpoint.",
        "planContext": {},
        "stepContext": None,
        "activePersonaId": None,
        "personaSnapshot": None,
        "teamMembers": [],
        "stepAssignment": None,
        "approvalCheckpointId": None,
        "resumeCursor": None,
        "structuredContextPackRef": None,
        "contextEvidenceItems": [],
        "candidateSkillManifests": [],
        "allowedTools": [],
        "allowedSkills": [],
        "allowedAgents": [],
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
            "allowedTools": [],
            "allowedSkills": [],
            "allowedAgents": [],
            "sideEffectPolicy": "read_only",
        },
    }


@dataclass
class _FakeStreamingResult:
    events: list[dict]
    final_output: str = "done"
    interruptions: list[dict] | None = None

    async def stream_events(self):
        for event in self.events:
            yield event


class _FakeRunner:
    def __init__(self, result: _FakeStreamingResult):
        self.result = result
        self.resume_calls: list[dict] = []

    def run_streamed(self, **_: object):
        return self.result

    async def resume(self, **kwargs: object):
        self.resume_calls.append(kwargs)
        return {
            "status": "completed",
            "final_output": "resumed",
            "selected_agent_name": "Resume Agent",
        }


@pytest.mark.asyncio
async def test_stream_events_include_sequence_and_idempotency_key():
    adapter = OpenAIAgentsAdapter()
    runner = _FakeRunner(
        _FakeStreamingResult(
            events=[
                {"type": "response.created", "id": "evt_1"},
                {"type": "response.output_text.delta", "id": "evt_2", "delta": "hello"},
            ]
        )
    )

    response = await adapter.run_streamed(
        _base_request(),
        gateway_attribution_token="platform-token",
        components=OpenAIAgentsRuntimeComponents(runner=runner),
    )

    assert [event.sequence for event in response.events] == [1, 2]
    assert {event.idempotencyKey for event in response.events} == {"idem_demo"}


def test_duplicate_stream_event_maps_to_same_normalized_event_identity():
    first = normalize_stream_event(
        raw_event={"type": "response.output_text.delta", "id": "evt_dup", "delta": "hello"},
        surface="chat",
        request_id="request_demo",
        idempotency_key="idem_demo",
        sequence=1,
        trace_id="trace_demo",
    )
    second = normalize_stream_event(
        raw_event={"type": "response.output_text.delta", "id": "evt_dup", "delta": "hello"},
        surface="chat",
        request_id="request_demo",
        idempotency_key="idem_demo",
        sequence=1,
        trace_id="trace_demo",
    )

    assert first.eventId == second.eventId


@pytest.mark.asyncio
async def test_resume_references_checkpoint():
    adapter = OpenAIAgentsAdapter()
    runner = _FakeRunner(_FakeStreamingResult(events=[]))
    request = _base_request()
    request["approvalCheckpointId"] = "checkpoint_123"
    request["resumeCursor"] = "cursor_123"

    response = await adapter.resume(
        request,
        gateway_attribution_token="platform-token",
        components=OpenAIAgentsRuntimeComponents(runner=runner),
    )

    assert response.checkpoint is not None
    assert response.checkpoint.checkpointId == "checkpoint_123"
    assert response.traceMetadata["resumedFromCheckpointId"] == "checkpoint_123"


@pytest.mark.asyncio
async def test_cancel_returns_structured_status():
    adapter = OpenAIAgentsAdapter()
    request = {
        "runtimeContractVersion": 2,
        "traceSchemaVersion": 2,
        "checkpointSchemaVersion": 2,
        "surface": "team",
        "tenantId": "tenant_demo",
        "roomId": "room_demo",
        "runId": "run_demo",
        "requestId": "request_demo",
        "idempotencyKey": "idem_demo",
        "cancelReason": "user_requested",
        "actorMetadata": {"actorId": "user_1", "actorType": "human"},
        "traceCorrelationIds": {
            "traceId": "trace_demo",
            "parentTraceId": "trace_parent_demo",
        },
    }

    response = await adapter.cancel(request)

    assert response.status == "cancelled"
    assert response.terminalReason == "runtime_error"
    assert response.traceMetadata["cancelReason"] == "user_requested"
