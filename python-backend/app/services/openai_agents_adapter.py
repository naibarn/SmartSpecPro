from __future__ import annotations

import asyncio
import importlib
from collections import Counter
from collections.abc import Awaitable, Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any

from app.services.openai_agents_contracts import (
    CURRENT_CHECKPOINT_SCHEMA_VERSION,
    CURRENT_RUNTIME_CONTRACT_VERSION,
    CURRENT_TRACE_SCHEMA_VERSION,
    AgentRuntimeCheckpoint,
    AgentRuntimeEvent,
    AgentRuntimeRequest,
    AgentRuntimeResponse,
    ProductionAgentsSdkCapabilityManifest,
    RuntimeArtifact,
    validate_agent_runtime_cancel_request,
    validate_agent_runtime_request,
    validate_agent_runtime_resume_request,
)
from app.services.openai_agents_gateway_model import (
    GatewayTransport,
    GatewayTransportConfig,
    build_gateway_transport_config,
    create_gateway_async_openai_client,
)
from app.services.openai_agents_trace import build_trace_config, normalize_stream_event
from app.services.openai_agents_version import ADAPTER_VERSION, get_effective_openai_agents_version
from app.services.openai_agents_vertical_drama_outputs import (
    build_vertical_drama_output_guardrails,
    resolve_vertical_drama_output_type,
    supported_vertical_drama_output_schemas,
    validate_vertical_drama_output_identity,
)

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


def _gateway_transport_for_request(request: AgentRuntimeRequest) -> GatewayTransport:
    if request.surface == "media_production":
        return "chat_completions"
    return "responses"


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
    manifest_tool_names = _media_production_allowed_tool_names(request)
    prepared: list[RegisteredRuntimeTool] = []
    for tool in tool_registry:
        if tool.slug not in allowed_tools:
            continue
        if request.surface == "media_production" and tool.slug not in manifest_tool_names:
            raise OpenAIAgentsAdapterError(
                "media_production_manifest_mismatch",
                f"Tool {tool.slug!r} is not allowed by the SDK capability manifest.",
            )
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
    manifest = _media_production_manifest(request)
    manifest_handoff_targets = {handoff.toAgent for handoff in manifest.allowedHandoffs} if manifest else set()
    manifest_handoff_tool_names: dict[str, set[str]] = {}
    if manifest:
        for allowed_handoff in manifest.allowedHandoffs:
            manifest_handoff_tool_names.setdefault(allowed_handoff.toAgent, set()).update(
                allowed_handoff.allowedToolNames
            )
    prepared: list[RegisteredRuntimeHandoff] = []
    for handoff in handoff_registry:
        if handoff.targetAgentName not in allowed_agents:
            continue
        if request.surface == "media_production" and handoff.targetAgentName not in manifest_handoff_targets:
            raise OpenAIAgentsAdapterError(
                "media_production_manifest_mismatch",
                f"Handoff {handoff.targetAgentName!r} is not allowed by the SDK capability manifest.",
            )
        if request.surface == "media_production":
            allowed_tool_names = manifest_handoff_tool_names.get(handoff.targetAgentName, set())
            if not handoff.targetScope.tools.issubset(allowed_tool_names):
                raise OpenAIAgentsAdapterError(
                    "media_production_manifest_mismatch",
                    f"Handoff {handoff.targetAgentName!r} target tool scope exceeds the SDK capability manifest.",
                )
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


def _plan_context_input(request: AgentRuntimeRequest) -> dict[str, Any]:
    plan_context = request.planContext or {}
    raw_input = plan_context.get("input")
    if isinstance(raw_input, dict):
        return {
            **{key: value for key, value in plan_context.items() if key != "input"},
            **raw_input,
        }
    return plan_context


def _media_production_manifest(request: AgentRuntimeRequest) -> ProductionAgentsSdkCapabilityManifest | None:
    return request.productionAgentsSdkCapabilityManifest if request.surface == "media_production" else None


def _media_production_allowed_tool_names(request: AgentRuntimeRequest) -> set[str]:
    manifest = _media_production_manifest(request)
    if manifest is None:
        return set()
    return {tool.name for tool in manifest.allowedTools}


def _media_production_authority_metadata(request: AgentRuntimeRequest) -> dict[str, str]:
    manifest = _media_production_manifest(request)
    if manifest is None:
        return {}
    return {
        "manifestHash": manifest.manifestHash,
        "stageKey": manifest.stageKey,
        "attemptId": manifest.attemptId,
    }


def _media_production_canonical_agent_name(request: AgentRuntimeRequest) -> str | None:
    manifest = _media_production_manifest(request)
    if manifest is None:
        return None
    allowed_agents = set(request.allowedAgents) & set(request.executionEnvelope.allowedAgents) & set(manifest.allowedAgents)
    gateway_role = request.gatewayInvocationMetadata.agentRole if request.gatewayInvocationMetadata else None
    candidates = [
        gateway_role,
        request.allowedAgents[0] if request.allowedAgents else None,
        manifest.allowedAgents[0] if manifest.allowedAgents else None,
    ]
    for candidate in candidates:
        if candidate and candidate in allowed_agents:
            return candidate
    return manifest.allowedAgents[0] if manifest.allowedAgents else None


def _enforce_media_production_response_identity(
    request: AgentRuntimeRequest,
    response: AgentRuntimeResponse,
) -> None:
    authority_metadata = _media_production_authority_metadata(request)
    if not authority_metadata:
        return
    checks = {
        "manifestHash": authority_metadata["manifestHash"],
        "stageKey": authority_metadata["stageKey"],
        "attemptId": authority_metadata["attemptId"],
    }
    for key, expected in checks.items():
        if response.traceMetadata.get(key) != expected:
            raise OpenAIAgentsAdapterError(
                "media_production_response_identity_mismatch",
                f"Media production response trace metadata {key} does not match the request manifest.",
            )
        if response.eventSequenceMetadata.get(key) not in (None, expected):
            raise OpenAIAgentsAdapterError(
                "media_production_response_identity_mismatch",
                f"Media production response event metadata {key} does not match the request manifest.",
            )
        if response.checkpointMetadata and response.checkpointMetadata.get(key) not in (None, expected):
            raise OpenAIAgentsAdapterError(
                "media_production_response_identity_mismatch",
                f"Media production response checkpoint metadata {key} does not match the request manifest.",
            )
    for event in response.events:
        if event.manifestHash != checks["manifestHash"] or event.attemptId != checks["attemptId"]:
            raise OpenAIAgentsAdapterError(
                "media_production_response_identity_mismatch",
                "Media production response event identity does not match the request manifest.",
            )
        event_stage = event.stageKey or event.stepKey
        if event_stage != checks["stageKey"]:
            raise OpenAIAgentsAdapterError(
                "media_production_response_identity_mismatch",
                "Media production response event stage does not match the request manifest.",
            )
    if response.checkpoint and (
        response.checkpoint.manifestHash != checks["manifestHash"]
        or response.checkpoint.stepKey != checks["stageKey"]
        or response.checkpoint.attemptId != checks["attemptId"]
    ):
        raise OpenAIAgentsAdapterError(
            "media_production_response_identity_mismatch",
            "Media production response checkpoint identity does not match the request manifest.",
        )


def _coerce_tool_call_slug(tool_call: Any) -> str | None:
    if isinstance(tool_call, str):
        return tool_call
    if isinstance(tool_call, dict):
        for key in ("slug", "toolSlug", "tool_slug", "name", "toolName", "tool_name"):
            value = tool_call.get(key)
            if isinstance(value, str) and value:
                return value
        function_payload = tool_call.get("function")
        if isinstance(function_payload, dict):
            value = function_payload.get("name")
            if isinstance(value, str) and value:
                return value
    for attr in ("slug", "toolSlug", "tool_slug", "name", "toolName", "tool_name"):
        value = getattr(tool_call, attr, None)
        if isinstance(value, str) and value:
            return value
    function_payload = getattr(tool_call, "function", None)
    value = getattr(function_payload, "name", None)
    if isinstance(value, str) and value:
        return value
    return None


def _extract_tool_call_slugs(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, dict):
        slugs: list[str] = []
        for key in (
            "toolCallsMade",
            "tool_calls_made",
            "toolCalls",
            "tool_calls",
            "toolsCalled",
            "tools_called",
        ):
            if key in value:
                slugs.extend(_extract_tool_call_slugs(value[key]))
        slug = _coerce_tool_call_slug(value)
        if slug and not slugs:
            slugs.append(slug)
        return slugs
    if isinstance(value, Iterable) and not isinstance(value, (str, bytes)):
        slugs: list[str] = []
        for item in value:
            slugs.extend(_extract_tool_call_slugs(item))
        return slugs
    for attr in (
        "toolCallsMade",
        "tool_calls_made",
        "toolCalls",
        "tool_calls",
        "toolsCalled",
        "tools_called",
    ):
        if hasattr(value, attr):
            return _extract_tool_call_slugs(getattr(value, attr))
    slug = _coerce_tool_call_slug(value)
    return [slug] if slug else []


def _enforce_media_production_tool_call_limits(request: AgentRuntimeRequest, tool_calls_made: list[str]) -> None:
    manifest = _media_production_manifest(request)
    if manifest is None or not tool_calls_made:
        return
    max_calls_by_tool = {tool.name: tool.maxCallsPerAttempt for tool in manifest.allowedTools}
    for tool_slug, call_count in Counter(tool_calls_made).items():
        max_calls = max_calls_by_tool.get(tool_slug)
        if max_calls is None:
            raise OpenAIAgentsAdapterError(
                "media_production_manifest_mismatch",
                f"Tool call {tool_slug!r} is not allowed by the SDK capability manifest.",
            )
        if call_count > max_calls:
            raise OpenAIAgentsAdapterError(
                "media_production_tool_call_limit_exceeded",
                f"Tool {tool_slug!r} exceeded its manifest maxCallsPerAttempt limit.",
            )


def _is_refs_only_checkpoint_payload(payload: dict[str, Any]) -> bool:
    if payload.get("refsOnly") is not True:
        return False
    allowed_keys = {
        "refsOnly",
        "checkpointRef",
        "resumeCursorRef",
        "capabilityManifestHash",
        "stageKey",
        "attemptId",
        "idempotencyKey",
    }
    return set(payload).issubset(allowed_keys)


def _build_refs_only_checkpoint_payload(request: AgentRuntimeRequest) -> dict[str, Any]:
    plan_input = _plan_context_input(request)
    manifest = request.productionAgentsSdkCapabilityManifest
    resume_cursor_ref = None
    if manifest is not None:
        resume_cursor_ref = manifest.sessionPolicy.resumeCursorRef
    return {
        "refsOnly": True,
        "checkpointRef": plan_input.get("checkpointRef") or request.approvalCheckpointId or f"checkpoint:{request.requestId}",
        "resumeCursorRef": resume_cursor_ref or request.resumeCursor,
        "capabilityManifestHash": manifest.manifestHash if manifest else plan_input.get("capabilityManifestHash"),
        "stageKey": request.stepContext.stepKey if request.stepContext else plan_input.get("stageKey"),
        "attemptId": request.stepContext.attemptId if request.stepContext else plan_input.get("attemptId"),
        "idempotencyKey": request.idempotencyKey,
    }


def validate_media_production_capability_manifest(request: AgentRuntimeRequest) -> None:
    if request.surface != "media_production":
        return

    plan_input = _plan_context_input(request)
    manifest = request.productionAgentsSdkCapabilityManifest
    invocation_metadata = request.gatewayInvocationMetadata
    if manifest is None or invocation_metadata is None:
        raise OpenAIAgentsAdapterError(
            "media_production_manifest_required",
            "Media production requests require gateway metadata and a Node-created SDK capability manifest.",
        )

    manifest_hash = plan_input.get("capabilityManifestHash") or plan_input.get("manifestHash")
    if not isinstance(manifest_hash, str) or not manifest_hash.strip():
        raise OpenAIAgentsAdapterError(
            "media_production_manifest_required",
            "Media production requests require a Node-created capability manifest hash.",
        )
    if manifest.manifestHash != manifest_hash:
        raise OpenAIAgentsAdapterError(
            "media_production_manifest_mismatch",
            "Capability manifest hash does not match the request manifest hash.",
        )

    if not request.candidateSkillManifests:
        raise OpenAIAgentsAdapterError(
            "media_production_manifest_required",
            "Media production requests require at least one candidate capability manifest.",
        )

    supported_manifest = None
    for candidate_manifest in request.candidateSkillManifests:
        if "media_production" not in candidate_manifest.supportedSurfaces:
            continue
        if request.entryPoint not in candidate_manifest.supportedEntryPoints:
            continue
        if request.originSurface and request.originSurface not in candidate_manifest.supportedOriginSurfaces:
            continue
        if request.allowedSkills and candidate_manifest.slug not in request.allowedSkills:
            continue
        supported_manifest = candidate_manifest
        break

    if supported_manifest is None:
        raise OpenAIAgentsAdapterError(
            "media_production_manifest_mismatch",
            "No candidate manifest is scoped to this media production request.",
        )
    if supported_manifest.slug not in request.executionEnvelope.allowedSkills:
        raise OpenAIAgentsAdapterError(
            "media_production_manifest_mismatch",
            "Selected media production skill is not allowed by the execution envelope.",
        )

    allowed_agent_set = set(manifest.allowedAgents)
    if not set(request.allowedAgents).issubset(allowed_agent_set):
        raise OpenAIAgentsAdapterError(
            "media_production_manifest_mismatch",
            "Request agent scope exceeds the SDK capability manifest.",
        )
    if invocation_metadata.agentRole not in allowed_agent_set:
        raise OpenAIAgentsAdapterError(
            "media_production_manifest_mismatch",
            "Gateway invocation agent role is not allowed by the SDK capability manifest.",
        )

    allowed_tool_names = {tool.name for tool in manifest.allowedTools}
    if not set(request.allowedTools).issubset(allowed_tool_names):
        raise OpenAIAgentsAdapterError(
            "media_production_manifest_mismatch",
            "Request tool scope exceeds the SDK capability manifest.",
        )
    if not set(request.executionEnvelope.allowedTools).issubset(allowed_tool_names):
        raise OpenAIAgentsAdapterError(
            "media_production_manifest_mismatch",
            "Execution envelope tool scope exceeds the SDK capability manifest.",
        )
    for tool in manifest.allowedTools:
        if tool.mutating and (not tool.nodeExecuted or not tool.requiresApprovalRef):
            raise OpenAIAgentsAdapterError(
                "media_production_manifest_mismatch",
                "Mutating media production tools must be Node-executed and approval-ref gated.",
            )
        if tool.creditCategory and tool.creditCategory != invocation_metadata.creditCategory:
            raise OpenAIAgentsAdapterError(
                "media_production_manifest_mismatch",
                "Tool credit category does not match gateway invocation metadata.",
            )

    allowed_handoff_targets = {handoff.toAgent for handoff in manifest.allowedHandoffs}
    disallowed_handoff_agents = allowed_handoff_targets - allowed_agent_set
    if disallowed_handoff_agents:
        raise OpenAIAgentsAdapterError(
            "media_production_manifest_mismatch",
            "Handoff targets must remain within the manifest agent scope.",
        )
    for handoff in manifest.allowedHandoffs:
        if not set(handoff.allowedToolNames).issubset(allowed_tool_names):
            raise OpenAIAgentsAdapterError(
                "media_production_manifest_mismatch",
                "Handoff tool scope exceeds the SDK capability manifest.",
            )

    schema_ref = None
    if supported_manifest.outputSchema:
        schema_ref = supported_manifest.outputSchema.get("schemaRef") or supported_manifest.outputSchema.get("artifactKind")
    allowed_schema_refs = {schema.artifactKind for schema in manifest.outputSchemas}
    if schema_ref and schema_ref not in allowed_schema_refs:
        raise OpenAIAgentsAdapterError(
            "media_production_manifest_mismatch",
            "Selected output schema is not allowed by the SDK capability manifest.",
        )
    if any(schema.required for schema in manifest.outputSchemas) and not schema_ref:
        raise OpenAIAgentsAdapterError(
            "media_production_manifest_mismatch",
            "Selected media production skill must declare an allowed output schema.",
        )

    if manifest.tracePolicy.externalSdkTraceExport != "disabled":
        raise OpenAIAgentsAdapterError(
            "raw_trace_or_session_capture_rejected",
            "External SDK trace export is disabled for media production.",
        )

    checkpoint_payload = getattr(request, "checkpointPayload", None)
    if checkpoint_payload and not _is_refs_only_checkpoint_payload(checkpoint_payload):
        raise OpenAIAgentsAdapterError(
            "raw_checkpoint_payload_rejected",
            "Media production resume/checkpoint payloads must be refs-only.",
        )

    hosted_capabilities = plan_input.get("hostedCapabilities") or plan_input.get("hostedCapabilityRequests")
    if hosted_capabilities:
        raise OpenAIAgentsAdapterError(
            "hosted_capabilities_disabled",
            "Hosted SDK capabilities are disabled for media production requests.",
        )

    if plan_input.get("rawTraceExportAllowed") is True or plan_input.get("rawSessionPersistenceAllowed") is True:
        raise OpenAIAgentsAdapterError(
            "raw_trace_or_session_capture_rejected",
            "Raw SDK trace export and raw session persistence are disabled for media production.",
        )

    if plan_input.get("rawMarketplaceEvidence"):
        raise OpenAIAgentsAdapterError(
            "marketplace_evidence_firewall_required",
            "Raw marketplace evidence cannot be passed as instructions to media production agents.",
        )

    has_marketplace_evidence = bool(
        plan_input.get("marketplaceEvidenceRefs")
        or plan_input.get("escapedUntrustedEvidenceRefs")
        or plan_input.get("allowedFactRefs")
    )
    firewall_status = plan_input.get("evidenceInstructionFirewallStatus")
    firewall_ref = plan_input.get("evidenceInstructionFirewallRef")
    if has_marketplace_evidence and (
        not isinstance(firewall_ref, str)
        or firewall_status not in {"passed", "reduced_to_safe_refs"}
    ):
        raise OpenAIAgentsAdapterError(
            "marketplace_evidence_firewall_required",
            "Marketplace evidence must be reduced by the Node evidence instruction firewall before SDK execution.",
        )


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
            "supportedAssuranceOutputSchemas": supported_vertical_drama_output_schemas(),
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
        validate_media_production_capability_manifest(validated_request)
        transport_config = build_gateway_transport_config(
            surface=validated_request.surface,
            model_config=validated_request.modelConfig,
            attribution_token=gateway_attribution_token,
            tenant_id=validated_request.tenantId,
            gateway_base_url=gateway_base_url,
            transport=_gateway_transport_for_request(validated_request),
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
        validate_media_production_capability_manifest(validated_request)
        runtime_components = components or OpenAIAgentsRuntimeComponents()
        transport_config = build_gateway_transport_config(
            surface=validated_request.surface,
            model_config=validated_request.modelConfig,
            attribution_token=gateway_attribution_token,
            tenant_id=validated_request.tenantId,
            gateway_base_url=gateway_base_url,
            transport=_gateway_transport_for_request(validated_request),
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
        authority_metadata = _media_production_authority_metadata(validated_request)
        async for raw_event in streaming_result.stream_events():
            sequence += 1
            event_payload = {**raw_event, **authority_metadata} if isinstance(raw_event, dict) else raw_event
            events.append(
                normalize_stream_event(
                    raw_event=event_payload,
                    surface=validated_request.surface,
                    request_id=validated_request.requestId,
                    idempotency_key=validated_request.idempotencyKey,
                    sequence=sequence,
                    trace_id=validated_request.traceCorrelationIds.traceId,
                    step_id=validated_request.stepContext.stepId if validated_request.stepContext else None,
                    step_key=validated_request.stepContext.stepKey if validated_request.stepContext else None,
                    attempt_id=validated_request.stepContext.attemptId if validated_request.stepContext else None,
                ).model_copy(
                    update={
                        "manifestHash": authority_metadata.get("manifestHash"),
                        "stageKey": authority_metadata.get("stageKey"),
                    }
                )
            )

        return self._normalize_response(
            request=validated_request,
            transport_config=transport_config,
            result=streaming_result,
            events=events,
            trace_metadata=authority_metadata,
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
        validate_media_production_capability_manifest(validated_request)
        runtime_components = components or OpenAIAgentsRuntimeComponents()
        transport_config = build_gateway_transport_config(
            surface=validated_request.surface,
            model_config=validated_request.modelConfig,
            attribution_token=gateway_attribution_token,
            tenant_id=validated_request.tenantId,
            gateway_base_url=gateway_base_url,
            transport=_gateway_transport_for_request(validated_request),
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
        authority_metadata = {}
        events: list[AgentRuntimeEvent] = []
        if cancel_request.surface == "media_production":
            authority_metadata = {
                "manifestHash": cancel_request.manifestHash,
                "stageKey": cancel_request.stageKey,
                "attemptId": cancel_request.attemptId,
            }
            events.append(
                AgentRuntimeEvent.model_validate(
                    {
                        "runtimeContractVersion": CURRENT_RUNTIME_CONTRACT_VERSION,
                        "traceSchemaVersion": CURRENT_TRACE_SCHEMA_VERSION,
                        "checkpointSchemaVersion": CURRENT_CHECKPOINT_SCHEMA_VERSION,
                        "eventId": f"{cancel_request.requestId}:cancelled:{cancel_request.attemptId}",
                        "eventName": "runtime.cancelled",
                        "surface": cancel_request.surface,
                        "requestId": cancel_request.requestId,
                        "idempotencyKey": cancel_request.idempotencyKey,
                        "sequence": 1,
                        "sourceComponent": "openai_agents_adapter",
                        "traceId": cancel_request.traceCorrelationIds.traceId,
                        "stepKey": cancel_request.stageKey,
                        "stageKey": cancel_request.stageKey,
                        "attemptId": cancel_request.attemptId,
                        "manifestHash": cancel_request.manifestHash,
                        "sdkVersion": get_effective_openai_agents_version(),
                        "adapterVersion": self.adapter_version,
                        "redactedPayload": {
                            "eventType": "cancellation",
                            "status": "cancelled",
                            "cancelReason": cancel_request.cancelReason,
                            "runId": cancel_request.runId,
                        },
                    }
                )
            )
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
                "events": events,
                "traceMetadata": {
                    "cancelReason": cancel_request.cancelReason,
                    "actorMetadata": cancel_request.actorMetadata,
                    **authority_metadata,
                },
                "terminalReason": "runtime_error",
                "adapterVersion": self.adapter_version,
                "sdkVersion": get_effective_openai_agents_version(),
                "attemptId": cancel_request.attemptId,
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
            "Agent": agents_mod.Agent,
            "Runner": agents_mod.Runner,
            "RunConfig": agents_mod.RunConfig,
            "OpenAIResponsesModel": agents_mod.OpenAIResponsesModel,
            "OpenAIChatCompletionsModel": agents_mod.OpenAIChatCompletionsModel,
            "RunState": agents_mod.RunState,
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

        agent_name = _media_production_canonical_agent_name(request) or (
            request.personaSnapshot.displayLabel
            if request.personaSnapshot is not None
            else (request.stepAssignment.ownerDisplayLabel if request.stepAssignment else None)
            or "SmartSpecPro Runtime Agent"
        )
        agent_kwargs: dict[str, Any] = {
            "name": agent_name,
            "instructions": request.objective,
            "model": sdk_model,
            "tools": [tool.tool for tool in prepared_tools],
            "handoffs": [handoff.handoff for handoff in prepared_handoffs],
        }
        if request.assurance is not None:
            output_type = resolve_vertical_drama_output_type(request.assurance)
            if output_type is not None:
                agent_kwargs["output_type"] = output_type
                agent_kwargs["output_guardrails"] = build_vertical_drama_output_guardrails(request.assurance)
        agent = sdk["Agent"](**agent_kwargs)
        sdk_tracing_enabled = trace_config.sdk_tracing_enabled and request.surface != "media_production"
        include_sensitive_trace_data = False if request.surface == "media_production" else trace_config.include_sensitive_data
        run_config = sdk["RunConfig"](
            tracing_disabled=not sdk_tracing_enabled,
            trace_include_sensitive_data=include_sensitive_trace_data,
            workflow_name=f"SmartSpecPro {request.surface} runtime",
            trace_id=request.traceCorrelationIds.traceId,
            group_id=request.runId or request.roomId,
            trace_metadata={
                "surface": request.surface,
                "requestId": request.requestId,
                "idempotencyKey": request.idempotencyKey,
                "adapterVersion": self.adapter_version,
                "capabilityManifestHash": (
                    request.productionAgentsSdkCapabilityManifest.manifestHash
                    if request.productionAgentsSdkCapabilityManifest
                    else None
                ),
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
        run_kwargs: dict[str, Any] = {
            "context": self._build_context(request),
            "run_config": sdk_runtime["RunConfig"],
        }
        if request.assurance is not None:
            run_kwargs["max_turns"] = request.assurance.budget.maxTurns
        run_call = sdk_runtime["Runner"].run(agent, self._build_input_payload(request), **run_kwargs)
        if request.assurance is not None:
            return await asyncio.wait_for(run_call, timeout=request.assurance.budget.maxWallClockSeconds)
        return await run_call

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
        run_kwargs: dict[str, Any] = {
            "context": self._build_context(request),
            "run_config": sdk_runtime["RunConfig"],
        }
        if request.assurance is not None:
            run_kwargs["max_turns"] = request.assurance.budget.maxTurns
        return sdk_runtime["Runner"].run_streamed(agent, self._build_input_payload(request), **run_kwargs)

    async def _resume_with_sdk(
        self,
        request: Any,
        *,
        transport_config: GatewayTransportConfig,
    ) -> Any:
        if request.surface == "media_production":
            raise OpenAIAgentsAdapterError(
                "raw_checkpoint_payload_rejected",
                "Media production resumes must use platform checkpoint refs instead of raw SDK state.",
            )
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
        run_kwargs: dict[str, Any] = {"run_config": sdk_runtime["RunConfig"]}
        if request.assurance is not None:
            run_kwargs["max_turns"] = request.assurance.budget.maxTurns
        run_call = sdk_runtime["Runner"].run(agent, run_state, **run_kwargs)
        if request.assurance is not None:
            return await asyncio.wait_for(run_call, timeout=request.assurance.budget.maxWallClockSeconds)
        return await run_call

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
        checkpoint_payload = resume_payload
        if request.surface == "media_production":
            if resume_payload and not _is_refs_only_checkpoint_payload(resume_payload):
                raise OpenAIAgentsAdapterError(
                    "raw_checkpoint_payload_rejected",
                    "Media production checkpoint payloads must be refs-only.",
                )
            checkpoint_payload = resume_payload or _build_refs_only_checkpoint_payload(request)
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
                "stepKey": request.stepContext.stepKey if request.stepContext else None,
                "attemptId": request.stepContext.attemptId if request.stepContext else None,
                "manifestHash": request.productionAgentsSdkCapabilityManifest.manifestHash
                if request.productionAgentsSdkCapabilityManifest
                else None,
                "status": status,
                "originalAttemptId": request.stepContext.attemptId if request.stepContext else None,
                "linkedAttemptId": request.stepContext.attemptId if request.stepContext else None,
                "checkpointPayload": checkpoint_payload,
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
            _enforce_media_production_tool_call_limits(request, result.toolCallsMade)
            authority_metadata = _media_production_authority_metadata(request)
            if not authority_metadata:
                return result
            response = result.model_copy(
                update={
                    "selectedAgentName": _media_production_canonical_agent_name(request),
                    "traceMetadata": {
                        **result.traceMetadata,
                        **authority_metadata,
                    },
                    "eventSequenceMetadata": {
                        **result.eventSequenceMetadata,
                        **authority_metadata,
                    },
                }
            )
            _enforce_media_production_response_identity(request, response)
            return response

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
                    if request.surface == "media_production":
                        checkpoint = self._build_checkpoint(
                            request=request,
                            status="pending",
                            resume_payload=_build_refs_only_checkpoint_payload(request),
                        )
                    else:
                        state = result.to_state()
                        checkpoint = self._build_checkpoint(
                            request=request,
                            status="pending",
                            resume_payload=state.to_json(strict_context=False),
                        )
            review_verdict = getattr(result, "review_verdict", None)

        tool_calls_made = _extract_tool_call_slugs(result)
        _enforce_media_production_tool_call_limits(request, tool_calls_made)
        authority_metadata = _media_production_authority_metadata(request)
        metadata = {
            "exportMode": build_trace_config().export_mode,
            "productionSafe": build_trace_config().production_safe,
            **trace_metadata,
            **authority_metadata,
        }

        canonical_agent_name = _media_production_canonical_agent_name(request)
        response_payload = {
            "runtimeContractVersion": CURRENT_RUNTIME_CONTRACT_VERSION,
            "traceSchemaVersion": CURRENT_TRACE_SCHEMA_VERSION,
            "checkpointSchemaVersion": CURRENT_CHECKPOINT_SCHEMA_VERSION,
            "status": status,
            "selectedAgentName": canonical_agent_name or selected_agent_name or "SmartSpecPro Runtime Agent",
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
            "toolCallsMade": tool_calls_made,
            "handoffsExecuted": [],
            "actingPersona": request.personaSnapshot,
            "stepAssignment": request.stepAssignment,
            "nextAction": None,
            "stepId": request.stepContext.stepId if request.stepContext else None,
            "attemptId": request.stepContext.attemptId if request.stepContext else None,
            "checkpointMetadata": checkpoint.model_dump(mode="json") if checkpoint else None,
            "eventSequenceMetadata": {
                "count": len(events),
                **authority_metadata,
            },
            "stepLinks": [],
        }
        response = AgentRuntimeResponse.model_validate(response_payload)
        if request.assurance is not None and response.finalOutput is not None:
            try:
                validate_vertical_drama_output_identity(request.assurance, response.finalOutput)
            except ValueError as exc:
                raise OpenAIAgentsAdapterError("assurance_output_invalid", str(exc)) from exc
        _enforce_media_production_response_identity(request, response)
        return response
