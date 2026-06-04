from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

CURRENT_RUNTIME_CONTRACT_VERSION = 2
CURRENT_TRACE_SCHEMA_VERSION = 2
CURRENT_CHECKPOINT_SCHEMA_VERSION = 2
MINIMUM_COMPATIBLE_RUNTIME_CONTRACT_VERSION = 1
MINIMUM_COMPATIBLE_TRACE_SCHEMA_VERSION = 1
MINIMUM_COMPATIBLE_CHECKPOINT_SCHEMA_VERSION = 1

RuntimeSurface = Literal["chat", "team", "responses", "skill", "media_production"]
RuntimeOriginSurface = Literal[
    "chat",
    "team",
    "responses",
    "media_studio",
    "media_production",
    "marketplace_capture",
    "media_studio_production",
    "media_studio_video_shot",
    "storyboard_review",
    "video_edit",
    "workflow",
    "unknown",
]
RuntimeEntryPoint = Literal[
    "chat_turn",
    "team_step",
    "responses_call",
    "enhance_prompt",
    "execute_custom_skill",
    "marketplace_auto_review_stage",
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
MediaProductionOriginSurface = Literal[
    "marketplace_capture",
    "media_studio_production",
    "media_studio_video_shot",
    "storyboard_review",
    "video_edit",
]
MediaProductionCreditCategory = Literal[
    "llm_planning",
    "llm_verification",
    "llm_visual_qa",
    "llm_audio_qa",
    "llm_repair",
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


def _plan_context_value(plan_context: dict[str, Any] | None, key: str) -> Any:
    if not isinstance(plan_context, dict):
        return None
    raw_input = plan_context.get("input")
    if isinstance(raw_input, dict) and key in raw_input:
        return raw_input.get(key)
    return plan_context.get(key)


def _same_string_set(left: list[str], right: list[str]) -> bool:
    return len(left) == len(right) and set(left) == set(right)


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
    def validate_versions(self) -> ContractVersions:
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


class AgentsGatewayInvocationMetadata(ContractModel):
    tenantId: str = Field(min_length=1)
    userId: str = Field(min_length=1)
    surface: Literal["media_production"]
    originSurface: MediaProductionOriginSurface
    productionProjectId: str | None = Field(default=None, min_length=1)
    productionRunId: str = Field(min_length=1)
    agentRunId: str = Field(min_length=1)
    agentName: str = Field(min_length=1)
    agentRole: str = Field(min_length=1)
    stageKey: str = Field(min_length=1)
    stepId: str = Field(min_length=1)
    attemptId: str = Field(min_length=1)
    modelPolicyId: str = Field(min_length=1)
    selectedModelId: str = Field(min_length=1)
    creditCategory: MediaProductionCreditCategory
    idempotencyKey: str = Field(min_length=1)
    creditReservationRef: str = Field(min_length=1)
    creditLedgerRef: str = Field(min_length=1)
    creditPayerRef: str = Field(min_length=1)
    preflightSnapshotRef: str = Field(min_length=1)
    creditAuditRef: str = Field(min_length=1)


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


class ProductionAgentsSdkAllowedHandoff(ContractModel):
    fromAgent: str = Field(min_length=1)
    toAgent: str = Field(min_length=1)
    reasonCodes: list[str] = Field(min_length=1)
    allowedToolNames: list[str] = Field(default_factory=list)
    canWidenReadScope: Literal[False]
    canWidenWriteScope: Literal[False]
    canChangeCreditPolicy: Literal[False]


class ProductionAgentsSdkAllowedTool(ContractModel):
    name: str = Field(min_length=1)
    category: Literal[
        "read_state",
        "write_checkpoint",
        "credit_estimate",
        "credit_reservation",
        "schedule_media",
        "attach_artifact_ref",
        "qa_classifier",
        "handoff_projection",
        "render_schedule",
    ]
    mutating: bool
    nodeExecuted: bool
    requiresApprovalRef: bool
    creditCategory: MediaProductionCreditCategory | None = None
    idempotencyKey: str = Field(min_length=1)
    timeoutMs: int = Field(gt=0)
    maxCallsPerAttempt: int = Field(gt=0)
    outputTrust: Literal["untrusted", "node_verified_ref"]


class ProductionAgentsSdkHostedCapabilities(ContractModel):
    webSearch: Literal[False]
    fileSearch: Literal[False]
    computerUse: Literal[False]
    codeInterpreter: Literal[False]
    imageGeneration: Literal[False]
    audioGeneration: Literal[False]
    videoGeneration: Literal[False]
    remoteMcp: Literal[False]
    shell: Literal[False]


class ProductionAgentsSdkOutputSchema(ContractModel):
    artifactKind: str = Field(min_length=1)
    schemaVersion: str = Field(min_length=1)
    required: bool


class ProductionAgentsSdkSessionPolicy(ContractModel):
    persistRawSdkSession: Literal[False]
    checkpointRefsOnly: Literal[True]
    resumeCursorRef: str | None = Field(default=None, min_length=1)
    maxSessionEventBytes: int = Field(gt=0)


class ProductionAgentsSdkTracePolicy(ContractModel):
    captureSensitiveInputOutput: Literal[False]
    externalSdkTraceExport: Literal["disabled", "development_only"]
    redactionProfileId: str = Field(min_length=1)
    maxTraceEventBytes: int = Field(gt=0)
    platformTraceEventRefs: list[str] = Field(default_factory=list)


class ProductionAgentsSdkStreamPolicy(ContractModel):
    normalizeEvents: Literal[True]
    stableEventIds: Literal[True]
    duplicateEventBehavior: Literal["idempotent_noop"]


class ProductionAgentsSdkCapabilityManifest(ContractModel):
    schemaVersion: Literal["1.0"]
    tenantId: str = Field(min_length=1)
    userId: str = Field(min_length=1)
    runId: str = Field(min_length=1)
    stageKey: str = Field(min_length=1)
    attemptId: str = Field(min_length=1)
    manifestHash: str = Field(min_length=1)
    allowedAgents: list[str] = Field(min_length=1)
    allowedHandoffs: list[ProductionAgentsSdkAllowedHandoff] = Field(default_factory=list)
    allowedTools: list[ProductionAgentsSdkAllowedTool] = Field(default_factory=list)
    hostedSdkCapabilities: ProductionAgentsSdkHostedCapabilities
    outputSchemas: list[ProductionAgentsSdkOutputSchema] = Field(default_factory=list)
    sessionPolicy: ProductionAgentsSdkSessionPolicy
    tracePolicy: ProductionAgentsSdkTracePolicy
    streamPolicy: ProductionAgentsSdkStreamPolicy
    approvedByNodeAt: str = Field(min_length=1)


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
    stageKey: str | None = None
    attemptId: str | None = None
    manifestHash: str | None = None
    sdkVersion: str
    adapterVersion: str
    redactedPayload: dict[str, Any] = Field(default_factory=dict)


class AgentRuntimeCheckpoint(ContractVersions):
    checkpointId: str
    surface: RuntimeSurface
    requestId: str
    tenantId: str
    resumeCursor: str | None = None
    stepKey: str | None = Field(default=None, min_length=1)
    attemptId: str | None = Field(default=None, min_length=1)
    manifestHash: str | None = Field(default=None, min_length=1)
    status: Literal["pending", "resumed", "cancelled"]
    originalAttemptId: str | None = None
    linkedAttemptId: str | None = None
    checkpointPayload: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_checkpoint_authority_identity(self) -> AgentRuntimeCheckpoint:
        if self.surface == "media_production" and (
            self.stepKey is None or self.attemptId is None or self.manifestHash is None
        ):
            raise ValueError("media production checkpoint requires stage key, attempt id, and manifest hash")
        return self


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
    gatewayInvocationMetadata: AgentsGatewayInvocationMetadata | None = None
    productionAgentsSdkCapabilityManifest: ProductionAgentsSdkCapabilityManifest | None = None

    @model_validator(mode="after")
    def validate_request_consistency(self) -> AgentRuntimeRequest:
        if self.executionEnvelope.tenantId != self.tenantId:
            raise ValueError("execution envelope tenant must match request tenant")
        if self.surface == "media_production":
            if self.gatewayInvocationMetadata is None:
                raise ValueError("media production requires gateway invocation metadata")
            if self.productionAgentsSdkCapabilityManifest is None:
                raise ValueError("media production requires production agents SDK capability manifest")
            if self.stepContext is None or not self.stepContext.stepKey or not self.stepContext.attemptId:
                raise ValueError("media production requires step context stage key and attempt id")
            if self.gatewayInvocationMetadata.tenantId != self.tenantId:
                raise ValueError("gateway invocation tenant must match request tenant")
            if self.gatewayInvocationMetadata.idempotencyKey != self.idempotencyKey:
                raise ValueError("gateway invocation idempotency key must match request idempotency key")
            if self.originSurface != self.gatewayInvocationMetadata.originSurface:
                raise ValueError("gateway invocation origin surface must match request origin surface")
            if self.runId and self.gatewayInvocationMetadata.agentRunId != self.runId:
                raise ValueError("gateway invocation agent run id must match request run id")
            if self.stepContext:
                if self.stepContext.stepId and self.gatewayInvocationMetadata.stepId != self.stepContext.stepId:
                    raise ValueError("gateway invocation step id must match request step context")
                if self.stepContext.stepKey and self.gatewayInvocationMetadata.stageKey != self.stepContext.stepKey:
                    raise ValueError("gateway invocation stage key must match request step context")
                if self.stepContext.attemptId and self.gatewayInvocationMetadata.attemptId != self.stepContext.attemptId:
                    raise ValueError("gateway invocation attempt id must match request step context")
            expected_model_id = self.modelConfig.resolvedGatewayModelId or self.modelConfig.modelId
            if self.gatewayInvocationMetadata.selectedModelId != expected_model_id:
                raise ValueError("gateway invocation selected model must match runtime model config")
            if self.productionAgentsSdkCapabilityManifest.tenantId != self.tenantId:
                raise ValueError("production manifest tenant must match request tenant")
            if self.productionAgentsSdkCapabilityManifest.userId != self.gatewayInvocationMetadata.userId:
                raise ValueError("production manifest user must match gateway invocation user")
            if self.productionAgentsSdkCapabilityManifest.runId != self.gatewayInvocationMetadata.agentRunId:
                raise ValueError("production manifest run must match gateway invocation run")
            if self.productionAgentsSdkCapabilityManifest.stageKey != self.gatewayInvocationMetadata.stageKey:
                raise ValueError("production manifest stage must match gateway invocation stage")
            if self.productionAgentsSdkCapabilityManifest.attemptId != self.gatewayInvocationMetadata.attemptId:
                raise ValueError("production manifest attempt must match gateway invocation attempt")
            manifest_hash = _plan_context_value(self.planContext, "capabilityManifestHash") or _plan_context_value(
                self.planContext,
                "manifestHash",
            )
            if isinstance(manifest_hash, str) and self.productionAgentsSdkCapabilityManifest.manifestHash != manifest_hash:
                raise ValueError("production manifest hash must match request manifest hash")
            if not _same_string_set(self.allowedAgents, self.executionEnvelope.allowedAgents):
                raise ValueError("media production allowed agents must match the execution envelope")
            if not _same_string_set(self.allowedAgents, self.productionAgentsSdkCapabilityManifest.allowedAgents):
                raise ValueError("production manifest agent authority must match request allowed agents")
            if self.gatewayInvocationMetadata.agentRole not in set(self.allowedAgents):
                raise ValueError("gateway invocation agent role must be allowed by request agent authority")
            request_tools = set(self.allowedTools)
            manifest_tools = {tool.name for tool in self.productionAgentsSdkCapabilityManifest.allowedTools}
            if not _same_string_set(self.allowedTools, self.executionEnvelope.allowedTools):
                raise ValueError("media production allowed tools must match the execution envelope")
            if request_tools != manifest_tools:
                raise ValueError("production manifest tool authority must match request allowed tools")
            candidate_schema_refs = {
                schema_ref
                for candidate in self.candidateSkillManifests
                if candidate.outputSchema
                for schema_ref in (
                    candidate.outputSchema.get("schemaRef"),
                    candidate.outputSchema.get("artifactKind"),
                )
                if isinstance(schema_ref, str) and schema_ref
            }
            manifest_schema_refs = {
                schema.artifactKind for schema in self.productionAgentsSdkCapabilityManifest.outputSchemas
            }
            if not manifest_schema_refs.issubset(candidate_schema_refs):
                raise ValueError("production manifest output schema authority must match candidate manifest")
        return self


class AgentRuntimeResumeRequest(AgentRuntimeRequest):
    checkpointPayload: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_resume_boundary(self) -> AgentRuntimeResumeRequest:
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
    manifestHash: str | None = Field(default=None, min_length=1)
    stageKey: str | None = Field(default=None, min_length=1)
    attemptId: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def validate_cancel_authority_identity(self) -> AgentRuntimeCancelRequest:
        if self.surface == "media_production" and (
            self.manifestHash is None or self.stageKey is None or self.attemptId is None
        ):
            raise ValueError("media production cancel requires manifest hash, stage key, and attempt id")
        return self


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
