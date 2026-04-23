from __future__ import annotations

import importlib
import json
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Iterable, Sequence

from app.services.openai_agents_contracts import (
    AgentRuntimeCheckpoint,
    AgentRuntimeRequest,
    AgentRuntimeResponse,
    RuntimeArtifact,
    CURRENT_CHECKPOINT_SCHEMA_VERSION,
    CURRENT_RUNTIME_CONTRACT_VERSION,
    CURRENT_TRACE_SCHEMA_VERSION,
    validate_agent_runtime_cancel_request,
    validate_agent_runtime_request,
    validate_agent_runtime_resume_request,
)
from app.services.openai_agents_gateway_model import (
    GatewayTransportConfig,
    build_gateway_transport_config,
    create_gateway_async_openai_client,
)
from app.services.openai_agents_trace import build_trace_config, normalize_stream_event
from app.services.openai_agents_version import ADAPTER_VERSION, get_effective_openai_agents_version

SideEffectClass = str


class OpenAIAgentsAdapterError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class RuntimeScope:
    tools: frozenset[str] = frozenset()
    connectors: frozenset[str] = frozenset()
    writeScopes: frozenset[str] = frozenset()


@dataclass(frozen=True)
class RegisteredRuntimeTool:
    slug: str
    tool: Any
    side_effect_class: SideEffectClass = "read_only"
    requires_approval: bool = False


@dataclass(frozen=True)
class RegisteredRuntimeHandoff:
    targetAgentName: str
    handoff: Any
    sourceScope: RuntimeScope = RuntimeScope()
    targetScope: RuntimeScope = RuntimeScope()


@dataclass
class OpenAIAgentsRuntimeComponents:
    runner: Any | None = None
    tools: Sequence[RegisteredRuntimeTool] = field(default_factory=tuple)
    handoffs: Sequence[RegisteredRuntimeHandoff] = field(default_factory=tuple)


def _maybe_await(value: Any) -> Awaitable[Any] | Any:
    if hasattr(value, "__await__"):
        return value
    return value


async def _resolve_async(value: Any) -> Any:
    maybe = _maybe_await(value)
    if hasattr(maybe, "__await__"):
        return await maybe
    return maybe


def prepare_allowed_tools(
    request: AgentRuntimeRequest,
    tool_registry: Sequence[RegisteredRuntimeTool],
) -> list[RegisteredRuntimeTool]:
    allowed_tools = set(request.allowedTools) & set(request.executionEnvelope.allowedTools)
    prepared: list[RegisteredRuntimeTool] = []
    for tool in tool_registry:
        if tool.slug not in allowed_tools:
            continue
        if tool.side_effect_class != "read_only" and not tool.requires_approval:
            raise OpenAIAgentsAdapterError(
                "mutating_tool_requires_approval",
                f"Mutating tool {tool.slug!r} must require explicit approval.",
            )
        prepared.append(tool)
    return prepared


def prepare_allowed_handoffs(
    request: AgentRuntimeRequest,
    handoff_registry: Sequence[RegisteredRuntimeHandoff],
) -> list[RegisteredRuntimeHandoff]:
    allowed_agents = set(request.allowedAgents) & set(request.executionEnvelope.allowedAgents)
    prepared: list[RegisteredRuntimeHandoff] = []
    for handoff in handoff_registry:
        if handoff.targetAgentName not in allowed_agents:
            continue
        if not handoff.targetScope.tools.issubset(handoff.sourceScope.tools):
            raise OpenAIAgentsAdapterError(
                "handoff_scope_widening_rejected",
                f"Handoff {handoff.targetAgentName!r} widened the tool scope.",
            )
        if not handoff.targetScope.connectors.issubset(handoff.sourceScope.connectors):
            raise OpenAIAgentsAdapterError(
                "handoff_scope_widening_rejected",
                f"Handoff {handoff.targetAgentName!r} widened the connector scope.",
            )
        if not handoff.targetScope.writeScopes.issubset(handoff.sourceScope.writeScopes):
            raise OpenAIAgentsAdapterError(
                "handoff_scope_widening_rejected",
                f"Handoff {handoff.targetAgentName!r} widened the write scope.",
            )
        prepared.append(handoff)
    return prepared


def label_tool_output_untrusted(*, tool_slug: str, output: Any) -> dict[str, Any]:
    return {
        "toolSlug": tool_slug,
        "trusted": False,
        "trustLevel": "tool_generated_untrusted",
        "output": output,
    }


class OpenAIAgentsAdapter:
    def __init__(self, *, adapter_version: str = ADAPTER_VERSION):
        self.adapter_version = adapter_version

    def health(self) -> dict[str, Any]:
        trace_config = build_trace_config()
        runtime_versions = list(
            range(
                max(
                    CURRENT_RUNTIME_CONTRACT_VERSION - 1,
                    1,
                ),
                CURRENT_RUNTIME_CONTRACT_VERSION + 1,
            )
        )
        trace_versions = list(
            range(
                max(
                    CURRENT_TRACE_SCHEMA_VERSION - 1,
                    1,
                ),
                CURRENT_TRACE_SCHEMA_VERSION + 1,
            )
        )
        checkpoint_versions = list(
            range(
                max(
                    CURRENT_CHECKPOINT_SCHEMA_VERSION - 1,
                    1,
                ),
                CURRENT_CHECKPOINT_SCHEMA_VERSION + 1,
            )
        )
        return {
            "adapterVersion": self.adapter_version,
            "sdkVersion": get_effective_openai_agents_version(),
            "gatewayModelSupportEnabled": True,
            "traceExportMode": trace_config.export_mode,
            "productionSafeTracing": trace_config.production_safe,
            "supportedRuntimeContractVersions": runtime_versions,
            "supportedTraceSchemaVersions": trace_versions,
            "supportedCheckpointSchemaVersions": checkpoint_versions,
        }

    async def run(
        self,
        request: dict[str, Any] | AgentRuntimeRequest,
        *,
        gateway_attribution_token: str,
        components: OpenAIAgentsRuntimeComponents | None = None,
        gateway_base_url: str | None = None,
    ) -> AgentRuntimeResponse:
        validated_request = validate_agent_runtime_request(request)
        transport_config = build_gateway_transport_config(
            surface=validated_request.surface,
            model_config=validated_request.modelConfig,
            attribution_token=gateway_attribution_token,
            gateway_base_url=gateway_base_url,
        )
        prepared_tools = prepare_allowed_tools(validated_request, (components or OpenAIAgentsRuntimeComponents()).tools)
        prepared_handoffs = prepare_allowed_handoffs(
            validated_request,
            (components or OpenAIAgentsRuntimeComponents()).handoffs,
        )

        if components and components.runner and hasattr(components.runner, "run"):
            runner_result = await _resolve_async(
                components.runner.run(
                    request=validated_request,
                    tools=prepared_tools,
                    handoffs=prepared_handoffs,
                    transport_config=transport_config,
                )
            )
            return self._normalize_response(
                request=validated_request,
                transport_config=transport_config,
                result=runner_result,
                events=[],
                trace_metadata={},
            )

        runner_result = await self._run_with_sdk(
            validated_request,
            transport_config=transport_config,
            prepared_tools=prepared_tools,
            prepared_handoffs=prepared_handoffs,
        )
        return self._normalize_response(
            request=validated_request,
            transport_config=transport_config,
            result=runner_result,
            events=[],
            trace_metadata={},
        )

    async def run_streamed(
        self,
        request: dict[str, Any] | AgentRuntimeRequest,
        *,
        gateway_attribution_token: str,
        components: OpenAIAgentsRuntimeComponents | None = None,
        gateway_base_url: str | None = None,
    ) -> AgentRuntimeResponse:
        validated_request = validate_agent_runtime_request(request)
        runtime_components = components or OpenAIAgentsRuntimeComponents()
        transport_config = build_gateway_transport_config(
            surface=validated_request.surface,
            model_config=validated_request.modelConfig,
            attribution_token=gateway_attribution_token,
            gateway_base_url=gateway_base_url,
        )
        prepared_tools = prepare_allowed_tools(validated_request, runtime_components.tools)
        prepared_handoffs = prepare_allowed_handoffs(validated_request, runtime_components.handoffs)

        if runtime_components.runner and hasattr(runtime_components.runner, "run_streamed"):
            streaming_result = runtime_components.runner.run_streamed(
                request=validated_request,
                tools=prepared_tools,
                handoffs=prepared_handoffs,
                transport_config=transport_config,
            )
        else:
            streaming_result = await self._run_streamed_with_sdk(
                validated_request,
                transport_config=transport_config,
                prepared_tools=prepared_tools,
                prepared_handoffs=prepared_handoffs,
            )

        events = []
        sequence = 0
        async for raw_event in streaming_result.stream_events():
            sequence += 1
            events.append(
                normalize_stream_event(
                    raw_event=raw_event,
                    surface=validated_request.surface,
                    request_id=validated_request.requestId,
                    idempotency_key=validated_request.idempotencyKey,
                    sequence=sequence,
                    trace_id=validated_request.traceCorrelationIds.traceId,
                    step_id=validated_request.stepContext.stepId if validated_request.stepContext else None,
                    step_key=validated_request.stepContext.stepKey if validated_request.stepContext else None,
                    attempt_id=validated_request.stepContext.attemptId if validated_request.stepContext else None,
                )
            )

        return self._normalize_response(
            request=validated_request,
            transport_config=transport_config,
            result=streaming_result,
            events=events,
            trace_metadata={},
        )

    async def resume(
        self,
        request: dict[str, Any],
        *,
        gateway_attribution_token: str,
        components: OpenAIAgentsRuntimeComponents | None = None,
        gateway_base_url: str | None = None,
    ) -> AgentRuntimeResponse:
        validated_request = validate_agent_runtime_resume_request(request)
        runtime_components = components or OpenAIAgentsRuntimeComponents()
        transport_config = build_gateway_transport_config(
            surface=validated_request.surface,
            model_config=validated_request.modelConfig,
            attribution_token=gateway_attribution_token,
            gateway_base_url=gateway_base_url,
        )
        trace_metadata = {
            "resumedFromCheckpointId": validated_request.approvalCheckpointId,
        }

        if runtime_components.runner and hasattr(runtime_components.runner, "resume"):
            result = await _resolve_async(
                runtime_components.runner.resume(
                    request=validated_request,
                    transport_config=transport_config,
                )
            )
        else:
            result = await self._resume_with_sdk(
                validated_request,
                transport_config=transport_config,
            )

        checkpoint = self._build_checkpoint(
            request=validated_request,
            status="resumed",
            resume_payload=validated_request.checkpointPayload or {},
        )
        return self._normalize_response(
            request=validated_request,
            transport_config=transport_config,
            result=result,
            events=[],
            trace_metadata=trace_metadata,
            checkpoint=checkpoint,
        )

    async def cancel(self, request: dict[str, Any]) -> AgentRuntimeResponse:
        cancel_request = validate_agent_runtime_cancel_request(request)
        return AgentRuntimeResponse.model_validate(
            {
                "runtimeContractVersion": CURRENT_RUNTIME_CONTRACT_VERSION,
                "traceSchemaVersion": CURRENT_TRACE_SCHEMA_VERSION,
                "checkpointSchemaVersion": CURRENT_CHECKPOINT_SCHEMA_VERSION,
                "status": "cancelled",
                "selectedAgentName": "System",
                "providerId": None,
                "modelId": None,
                "finalOutput": None,
                "artifacts": [],
                "events": [],
                "traceMetadata": {
                    "cancelReason": cancel_request.cancelReason,
                    "actorMetadata": cancel_request.actorMetadata,
                },
                "terminalReason": "runtime_error",
                "adapterVersion": self.adapter_version,
                "sdkVersion": get_effective_openai_agents_version(),
            }
        )

    def _sdk_symbols(self) -> dict[str, Any]:
        try:
            agents_mod = importlib.import_module("agents")
        except ModuleNotFoundError as exc:
            raise OpenAIAgentsAdapterError(
                "sdk_not_installed",
                "openai-agents is not installed in the Python runtime.",
            ) from exc

        return {
            "Agent": getattr(agents_mod, "Agent"),
            "Runner": getattr(agents_mod, "Runner"),
            "RunConfig": getattr(agents_mod, "RunConfig"),
            "OpenAIResponsesModel": getattr(agents_mod, "OpenAIResponsesModel"),
            "OpenAIChatCompletionsModel": getattr(agents_mod, "OpenAIChatCompletionsModel"),
            "RunState": getattr(agents_mod, "RunState"),
        }

    def _build_sdk_agent(
        self,
        request: AgentRuntimeRequest,
        transport_config: GatewayTransportConfig,
        prepared_tools: Sequence[RegisteredRuntimeTool],
        prepared_handoffs: Sequence[RegisteredRuntimeHandoff],
    ) -> tuple[Any, dict[str, Any]]:
        sdk = self._sdk_symbols()
        trace_config = build_trace_config()
        client = create_gateway_async_openai_client(transport_config)
        if transport_config.transport == "responses":
            sdk_model = sdk["OpenAIResponsesModel"](
                model=transport_config.resolved_gateway_model_id,
                openai_client=client,
            )
        else:
            sdk_model = sdk["OpenAIChatCompletionsModel"](
                model=transport_config.resolved_gateway_model_id,
                openai_client=client,
            )

        agent_name = (
            request.personaSnapshot.displayLabel
            if request.personaSnapshot is not None
            else (request.stepAssignment.ownerDisplayLabel if request.stepAssignment else None)
            or "SmartSpecPro Runtime Agent"
        )
        agent = sdk["Agent"](
            name=agent_name,
            instructions=request.objective,
            model=sdk_model,
            tools=[tool.tool for tool in prepared_tools],
            handoffs=[handoff.handoff for handoff in prepared_handoffs],
        )
        run_config = sdk["RunConfig"](
            tracing_disabled=not trace_config.sdk_tracing_enabled,
            trace_include_sensitive_data=trace_config.include_sensitive_data,
            workflow_name=f"SmartSpecPro {request.surface} runtime",
            trace_id=request.traceCorrelationIds.traceId,
            group_id=request.runId or request.roomId,
            trace_metadata={
                "surface": request.surface,
                "requestId": request.requestId,
                "idempotencyKey": request.idempotencyKey,
                "adapterVersion": self.adapter_version,
            },
        )
        return agent, {"Runner": sdk["Runner"], "RunConfig": run_config, "RunState": sdk["RunState"]}

    async def _run_with_sdk(
        self,
        request: AgentRuntimeRequest,
        *,
        transport_config: GatewayTransportConfig,
        prepared_tools: Sequence[RegisteredRuntimeTool],
        prepared_handoffs: Sequence[RegisteredRuntimeHandoff],
    ) -> Any:
        agent, sdk_runtime = self._build_sdk_agent(
            request,
            transport_config,
            prepared_tools,
            prepared_handoffs,
        )
        return await sdk_runtime["Runner"].run(
            agent,
            self._build_input_payload(request),
            context=self._build_context(request),
            run_config=sdk_runtime["RunConfig"],
        )

    async def _run_streamed_with_sdk(
        self,
        request: AgentRuntimeRequest,
        *,
        transport_config: GatewayTransportConfig,
        prepared_tools: Sequence[RegisteredRuntimeTool],
        prepared_handoffs: Sequence[RegisteredRuntimeHandoff],
    ) -> Any:
        agent, sdk_runtime = self._build_sdk_agent(
            request,
            transport_config,
            prepared_tools,
            prepared_handoffs,
        )
        return sdk_runtime["Runner"].run_streamed(
            agent,
            self._build_input_payload(request),
            context=self._build_context(request),
            run_config=sdk_runtime["RunConfig"],
        )

    async def _resume_with_sdk(
        self,
        request: Any,
        *,
        transport_config: GatewayTransportConfig,
    ) -> Any:
        if not request.checkpointPayload:
            raise OpenAIAgentsAdapterError(
                "resume_state_missing",
                "Checkpoint payload is required to resume with the SDK runtime.",
            )

        agent, sdk_runtime = self._build_sdk_agent(
            request,
            transport_config,
            [],
            [],
        )
        run_state = await sdk_runtime["RunState"].from_json(
            agent,
            request.checkpointPayload,
            context_override=self._build_context(request),
        )
        return await sdk_runtime["Runner"].run(
            agent,
            run_state,
            run_config=sdk_runtime["RunConfig"],
        )

    def _build_input_payload(self, request: AgentRuntimeRequest) -> Any:
        plan_context_input = (request.planContext or {}).get("input") if request.planContext else None
        return plan_context_input or request.objective

    def _build_context(self, request: AgentRuntimeRequest) -> dict[str, Any]:
        return {
            "tenantId": request.tenantId,
            "surface": request.surface,
            "requestId": request.requestId,
            "roomId": request.roomId,
            "runId": request.runId,
            "stepContext": request.stepContext.model_dump(mode="json") if request.stepContext else None,
            "stepAssignment": request.stepAssignment.model_dump(mode="json") if request.stepAssignment else None,
            "personaSnapshot": request.personaSnapshot.model_dump(mode="json") if request.personaSnapshot else None,
            "teamMembers": [member.model_dump(mode="json") for member in request.teamMembers],
            "completionPolicy": request.completionPolicy,
            "reviewPolicy": request.reviewPolicy,
            "retryPolicy": request.retryPolicy,
        }

    def _build_checkpoint(
        self,
        *,
        request: Any,
        status: str,
        resume_payload: dict[str, Any],
    ) -> AgentRuntimeCheckpoint:
        return AgentRuntimeCheckpoint.model_validate(
            {
                "runtimeContractVersion": CURRENT_RUNTIME_CONTRACT_VERSION,
                "traceSchemaVersion": CURRENT_TRACE_SCHEMA_VERSION,
                "checkpointSchemaVersion": CURRENT_CHECKPOINT_SCHEMA_VERSION,
                "checkpointId": request.approvalCheckpointId or f"checkpoint:{request.requestId}",
                "surface": request.surface,
                "requestId": request.requestId,
                "tenantId": request.tenantId,
                "resumeCursor": request.resumeCursor,
                "status": status,
                "originalAttemptId": request.stepContext.attemptId if request.stepContext else None,
                "linkedAttemptId": request.stepContext.attemptId if request.stepContext else None,
                "checkpointPayload": resume_payload,
            }
        )

    def _coerce_artifacts(self, artifacts: Iterable[Any] | None) -> list[RuntimeArtifact]:
        if not artifacts:
            return []
        coerced: list[RuntimeArtifact] = []
        for index, artifact in enumerate(artifacts, start=1):
            if isinstance(artifact, RuntimeArtifact):
                coerced.append(artifact)
                continue
            payload = artifact if isinstance(artifact, dict) else {"value": artifact}
            coerced.append(
                RuntimeArtifact.model_validate(
                    {
                        "artifactId": payload.get("artifactId") or f"artifact_{index}",
                        "artifactType": payload.get("artifactType") or payload.get("type") or "runtime_output",
                        "contentRef": payload.get("contentRef"),
                        "metadata": payload.get("metadata") or payload,
                    }
                )
            )
        return coerced

    def _normalize_response(
        self,
        *,
        request: AgentRuntimeRequest,
        transport_config: GatewayTransportConfig,
        result: Any,
        events: list[Any],
        trace_metadata: dict[str, Any],
        checkpoint: AgentRuntimeCheckpoint | None = None,
    ) -> AgentRuntimeResponse:
        if isinstance(result, AgentRuntimeResponse):
            return result

        status = "completed"
        final_output = None
        selected_agent_name = None
        selected_skill_slug = None
        artifacts: list[Any] = []
        review_verdict = None
        if isinstance(result, dict):
            status = result.get("status") or status
            final_output = result.get("finalOutput", result.get("final_output"))
            selected_agent_name = result.get("selectedAgentName", result.get("selected_agent_name"))
            selected_skill_slug = result.get("selectedSkillSlug", result.get("selected_skill_slug"))
            artifacts = result.get("artifacts") or []
            review_verdict = result.get("reviewVerdict", result.get("review_verdict"))
        else:
            final_output = getattr(result, "final_output", None)
            last_agent = getattr(result, "last_agent", None)
            selected_agent_name = getattr(last_agent, "name", None)
            interruptions = list(getattr(result, "interruptions", []) or [])
            if interruptions:
                status = "paused"
                if checkpoint is None and hasattr(result, "to_state"):
                    state = result.to_state()
                    checkpoint = self._build_checkpoint(
                        request=request,
                        status="pending",
                        resume_payload=state.to_json(strict_context=False),
                    )
            review_verdict = getattr(result, "review_verdict", None)

        metadata = {
            "exportMode": build_trace_config().export_mode,
            "productionSafe": build_trace_config().production_safe,
            **trace_metadata,
        }

        response_payload = {
            "runtimeContractVersion": CURRENT_RUNTIME_CONTRACT_VERSION,
            "traceSchemaVersion": CURRENT_TRACE_SCHEMA_VERSION,
            "checkpointSchemaVersion": CURRENT_CHECKPOINT_SCHEMA_VERSION,
            "status": status,
            "selectedAgentName": selected_agent_name or "SmartSpecPro Runtime Agent",
            "selectedSkillSlug": selected_skill_slug,
            "providerId": transport_config.provider_id,
            "modelId": transport_config.model_id,
            "gatewayRouteId": transport_config.gateway_route_id,
            "resolvedGatewayModelId": transport_config.resolved_gateway_model_id,
            "finalOutput": final_output,
            "artifacts": self._coerce_artifacts(artifacts),
            "reviewVerdict": review_verdict,
            "events": events,
            "traceMetadata": metadata,
            "checkpoint": checkpoint,
            "terminalReason": None,
            "adapterVersion": self.adapter_version,
            "sdkVersion": get_effective_openai_agents_version(),
            "toolCallsMade": [],
            "handoffsExecuted": [],
            "actingPersona": request.personaSnapshot,
            "stepAssignment": request.stepAssignment,
            "nextAction": None,
            "stepId": request.stepContext.stepId if request.stepContext else None,
            "attemptId": request.stepContext.attemptId if request.stepContext else None,
            "checkpointMetadata": checkpoint.model_dump(mode="json") if checkpoint else None,
            "eventSequenceMetadata": {
                "count": len(events),
            },
            "stepLinks": [],
        }
        return AgentRuntimeResponse.model_validate(response_payload)
