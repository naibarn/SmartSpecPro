from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

CURRENT_RUNTIME_CONTRACT_VERSION = 2
CURRENT_TRACE_SCHEMA_VERSION = 2
CURRENT_CHECKPOINT_SCHEMA_VERSION = 2
MINIMUM_COMPATIBLE_RUNTIME_CONTRACT_VERSION = 1
MINIMUM_COMPATIBLE_TRACE_SCHEMA_VERSION = 1
MINIMUM_COMPATIBLE_CHECKPOINT_SCHEMA_VERSION = 1

RuntimeSurface = Literal["chat", "team", "responses", "skill"]
RuntimeOriginSurface = Literal[
    "chat",
    "team",
    "responses",
    "media_studio",
    "workflow",
    "unknown",
]
RuntimeEntryPoint = Literal[
    "chat_turn",
    "team_step",
    "responses_call",
    "enhance_prompt",
    "execute_custom_skill",
    "system",
]
ReviewVerdictStatus = Literal["pass", "fail", "needs_repair", "blocked"]
RuntimeStatus = Literal["completed", "paused", "cancelled", "failed", "running"]
RuntimeTerminalReason = Literal[
    "plan_completed",
    "step_failed_retry_exhausted",
    "review_failed_retry_exhausted",
    "approval_required",
    "approval_rejected",
    "budget_exhausted",
    "timeout_step",
    "timeout_run",
    "tool_denied",
    "permission_mismatch",
    "gateway_unavailable",
    "runtime_error",
    "rollback_forced",
    "plan_incomplete_cap_reached",
]
AgentContextTrustLevel = Literal[
    "trusted_platform",
    "tenant_authored",
    "retrieved_untrusted",
    "tool_generated_untrusted",
    "connector_generated_untrusted",
]
PersonaProvenance = Literal[
    "conversation_override",
    "user_default",
    "tenant_default",
    "platform_default",
    "room_member_roster",
    "direct_request",
]
TeamMemberKind = Literal["assistant", "human", "external_connector", "system"]
StepLinkType = Literal[
    "plan_summary",
    "plan_step",
    "owner_result",
    "review_result",
    "repair_result",
    "checkpoint",
    "terminal_result",
    "execution_trace",
]
StepLinkStatus = Literal["available", "pending"]


def _is_supported_version(version: int, current: int, minimum: int) -> bool:
    return minimum <= version <= current


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AgentRuntimeContractError(ValueError):
    def __init__(self, *, code: str, issues: list[dict[str, str]]):
        super().__init__(code)
        self.code = code
        self.issues = issues


class ContractVersions(ContractModel):
    runtimeContractVersion: int
    traceSchemaVersion: int
    checkpointSchemaVersion: int

    @model_validator(mode="after")
    def validate_versions(self) -> "ContractVersions":
        if not _is_supported_version(
            self.runtimeContractVersion,
            CURRENT_RUNTIME_CONTRACT_VERSION,
            MINIMUM_COMPATIBLE_RUNTIME_CONTRACT_VERSION,
        ):
            raise ValueError("unsupported runtime contract version")
        if not _is_supported_version(
            self.traceSchemaVersion,
            CURRENT_TRACE_SCHEMA_VERSION,
            MINIMUM_COMPATIBLE_TRACE_SCHEMA_VERSION,
        ):
            raise ValueError("unsupported trace schema version")
        if not _is_supported_version(
            self.checkpointSchemaVersion,
            CURRENT_CHECKPOINT_SCHEMA_VERSION,
            MINIMUM_COMPATIBLE_CHECKPOINT_SCHEMA_VERSION,
        ):
            raise ValueError("unsupported checkpoint schema version")
        return self


class TraceCorrelationIds(ContractModel):
    traceId: str
    parentTraceId: str | None = None


class PersonaSnapshot(ContractModel):
    personaId: str
    displayLabel: str
    nickname: str | None = None
    provenance: PersonaProvenance
    promptSegmentRef: str | None = None
    guidanceSummary: str | None = None


class TeamMemberSnapshot(ContractModel):
    memberId: str
    memberKind: TeamMemberKind
    memberRole: str
    personaId: str | None = None
    displayLabel: str
    personaDisplayLabel: str | None = None
    isLead: bool = False
    preferredLanguage: str | None = None
    personaGuidanceSummary: str | None = None


class StepAssignment(ContractModel):
    ownerMemberId: str
    ownerPersonaId: str | None = None
    ownerDisplayLabel: str | None = None
    reviewerMemberId: str
    reviewerPersonaId: str | None = None
    reviewerDisplayLabel: str | None = None


class ExecutionEnvelope(ContractModel):
    envelopeId: str
    tenantId: str
    issuedAt: str
    expiresAt: str
    allowedTools: list[str]
    allowedSkills: list[str]
    allowedAgents: list[str]
    sideEffectPolicy: Literal["read_only", "approval_required", "mutating_allowed"]


class RuntimeModelConfig(ContractModel):
    providerId: str
    modelId: str
    gatewayRouteId: str | None = None
    resolvedGatewayModelId: str | None = None


class ContextEvidenceItem(ContractModel):
    artifactId: str
    sourceType: str
    origin: str
    trustLevel: AgentContextTrustLevel
    sanitizationLevel: str
    contentRef: str
    tokenEstimate: int
    contextPackSlot: str | None = None
    sourceRef: str | None = None
    retrievalRecipeMetadata: dict[str, Any] | None = None


class AgentCapabilityManifest(ContractModel):
    slug: str
    manifestSchemaVersion: int
    name: str
    purpose: str
    supportedSurfaces: list[RuntimeSurface]
    supportedOriginSurfaces: list[RuntimeOriginSurface] = Field(default_factory=list)
    supportedEntryPoints: list[RuntimeEntryPoint] = Field(default_factory=list)
    taskTypes: list[str]
    requiredContext: list[str] = Field(default_factory=list)
    preferredContext: list[str] = Field(default_factory=list)
    inputSchema: dict[str, Any] | None = None
    outputSchema: dict[str, Any] | None = None
    supportedArtifactTypes: list[str] = Field(default_factory=list)
    requiredEvidenceKinds: list[str] = Field(default_factory=list)
    reviewChecklist: list[str] = Field(default_factory=list)
    failureModes: list[str] = Field(default_factory=list)
    doNotUseWhen: list[str] = Field(default_factory=list)


class ReviewVerdict(ContractModel):
    status: ReviewVerdictStatus
    score: float | None = None
    issues: list[str] = Field(default_factory=list)
    recommendation: str | None = None
    checkpointRequired: bool | None = None


class StepLink(ContractModel):
    linkType: StepLinkType
    stepKey: str
    attemptId: str | None = None
    traceId: str | None = None
    checkpointId: str | None = None
    messageId: str | None = None
    anchorId: str | None = None
    label: str
    isPrimary: bool
    status: StepLinkStatus


class StepContext(ContractModel):
    stepId: str | None = None
    stepKey: str | None = None
    attemptId: str | None = None


class AgentRuntimeEvent(ContractVersions):
    eventId: str
    eventName: str
    surface: RuntimeSurface
    requestId: str
    idempotencyKey: str
    sequence: int
    sourceComponent: str
    traceId: str | None = None
    stepId: str | None = None
    stepKey: str | None = None
    attemptId: str | None = None
    sdkVersion: str
    adapterVersion: str
    redactedPayload: dict[str, Any] = Field(default_factory=dict)


class AgentRuntimeCheckpoint(ContractVersions):
    checkpointId: str
    surface: RuntimeSurface
    requestId: str
    tenantId: str
    resumeCursor: str | None = None
    status: Literal["pending", "resumed", "cancelled"]
    originalAttemptId: str | None = None
    linkedAttemptId: str | None = None
    checkpointPayload: dict[str, Any] = Field(default_factory=dict)


class RuntimeArtifact(ContractModel):
    artifactId: str
    artifactType: str
    contentRef: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentRuntimeRequest(ContractVersions):
    surface: RuntimeSurface
    originSurface: RuntimeOriginSurface | None = None
    entryPoint: RuntimeEntryPoint
    tenantId: str
    roomId: str | None = None
    runId: str | None = None
    messageId: str | None = None
    requestId: str
    idempotencyKey: str
    objective: str
    planContext: dict[str, Any] | None = None
    stepContext: StepContext | None = None
    activePersonaId: str | None = None
    personaSnapshot: PersonaSnapshot | None = None
    teamMembers: list[TeamMemberSnapshot]
    stepAssignment: StepAssignment | None = None
    approvalCheckpointId: str | None = None
    resumeCursor: str | None = None
    structuredContextPackRef: str | None = None
    contextEvidenceItems: list[ContextEvidenceItem]
    candidateSkillManifests: list[AgentCapabilityManifest]
    allowedTools: list[str]
    allowedSkills: list[str]
    allowedAgents: list[str]
    completionPolicy: dict[str, Any]
    reviewPolicy: dict[str, Any]
    retryPolicy: dict[str, Any]
    traceCorrelationIds: TraceCorrelationIds
    sdkVersionConstraint: str | None = None
    modelConfig: RuntimeModelConfig
    executionEnvelope: ExecutionEnvelope

    @model_validator(mode="after")
    def validate_request_consistency(self) -> "AgentRuntimeRequest":
        if self.executionEnvelope.tenantId != self.tenantId:
            raise ValueError("execution envelope tenant must match request tenant")
        return self


class AgentRuntimeResumeRequest(AgentRuntimeRequest):
    checkpointPayload: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_resume_boundary(self) -> "AgentRuntimeResumeRequest":
        if not self.approvalCheckpointId and not self.resumeCursor:
            raise ValueError("resume requires checkpoint id or resume cursor")
        return self


class AgentRuntimeCancelRequest(ContractVersions):
    surface: RuntimeSurface
    tenantId: str
    roomId: str | None = None
    runId: str | None = None
    requestId: str
    idempotencyKey: str
    cancelReason: str | None = None
    actorMetadata: dict[str, Any] = Field(default_factory=dict)
    traceCorrelationIds: TraceCorrelationIds


class AgentRuntimeResponse(ContractVersions):
    status: RuntimeStatus
    selectedAgentName: str | None = None
    selectedSkillSlug: str | None = None
    providerId: str | None = None
    modelId: str | None = None
    gatewayRouteId: str | None = None
    resolvedGatewayModelId: str | None = None
    finalOutput: Any = None
    artifacts: list[RuntimeArtifact] = Field(default_factory=list)
    reviewVerdict: ReviewVerdict | None = None
    events: list[AgentRuntimeEvent] = Field(default_factory=list)
    traceMetadata: dict[str, Any] = Field(default_factory=dict)
    checkpoint: AgentRuntimeCheckpoint | None = None
    terminalReason: RuntimeTerminalReason | None = None
    adapterVersion: str
    sdkVersion: str
    toolCallsMade: list[str] = Field(default_factory=list)
    handoffsExecuted: list[str] = Field(default_factory=list)
    actingPersona: PersonaSnapshot | None = None
    stepAssignment: StepAssignment | None = None
    nextAction: str | None = None
    stepId: str | None = None
    attemptId: str | None = None
    checkpointMetadata: dict[str, Any] | None = None
    eventSequenceMetadata: dict[str, Any] = Field(default_factory=dict)
    stepLinks: list[StepLink] = Field(default_factory=list)


def _redact_validation_errors(exc: ValidationError) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    for error in exc.errors():
        path = ".".join(str(part) for part in error.get("loc", ()))
        issues.append(
            {
                "path": path or "<root>",
                "code": str(error.get("type", "validation_error")),
                "message": str(error.get("msg", "Invalid request")),
            }
        )
    return issues


def _wrap_validation_error(exc: ValidationError) -> AgentRuntimeContractError:
    return AgentRuntimeContractError(
        code="invalid_request",
        issues=_redact_validation_errors(exc),
    )


def validate_agent_runtime_request(payload: dict[str, Any] | AgentRuntimeRequest) -> AgentRuntimeRequest:
    try:
        if isinstance(payload, AgentRuntimeRequest):
            return payload
        return AgentRuntimeRequest.model_validate(payload)
    except ValidationError as exc:
        raise _wrap_validation_error(exc) from exc


def validate_agent_runtime_resume_request(
    payload: dict[str, Any] | AgentRuntimeResumeRequest,
) -> AgentRuntimeResumeRequest:
    try:
        if isinstance(payload, AgentRuntimeResumeRequest):
            return payload
        return AgentRuntimeResumeRequest.model_validate(payload)
    except ValidationError as exc:
        raise _wrap_validation_error(exc) from exc


def validate_agent_runtime_cancel_request(
    payload: dict[str, Any] | AgentRuntimeCancelRequest,
) -> AgentRuntimeCancelRequest:
    try:
        if isinstance(payload, AgentRuntimeCancelRequest):
            return payload
        return AgentRuntimeCancelRequest.model_validate(payload)
    except ValidationError as exc:
        raise _wrap_validation_error(exc) from exc


def validate_agent_runtime_response(
    payload: dict[str, Any] | AgentRuntimeResponse,
) -> AgentRuntimeResponse:
    try:
        if isinstance(payload, AgentRuntimeResponse):
            return payload
        return AgentRuntimeResponse.model_validate(payload)
    except ValidationError as exc:
        raise AgentRuntimeContractError(
            code="invalid_response",
            issues=_redact_validation_errors(exc),
        ) from exc
