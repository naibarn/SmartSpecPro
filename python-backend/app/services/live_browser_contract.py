"""Shared live-browser contract models used across Node and Python boundaries."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


LiveBrowserActorType = Literal["agent", "user", "system", "policy"]
LiveBrowserSourceType = Literal["automation", "chat", "workflow", "agency"]
LiveBrowserPresentationState = Literal[
    "running",
    "review_required",
    "needs_user_input",
    "person_in_control",
    "ai_in_control",
    "reconnecting",
    "session_ended",
]
LiveBrowserSessionStatus = Literal[
    "created",
    "provisioning",
    "ready",
    "agent_running",
    "waiting_for_human",
    "human_controlling",
    "waiting_for_runtime_recovery",
    "failed_recovery_required",
    "completed",
    "cancelled",
    "failed",
    "expired",
]
LiveBrowserControlMode = Literal["observe", "approve_only", "takeover", "agent_control"]
LiveBrowserAssistRequestType = Literal["decision", "field_input", "review_page", "takeover_required"]
LiveBrowserAssistRequestStatus = Literal["pending", "resolved", "cancelled"]
LiveBrowserEventType = Literal[
    "session_created",
    "session_state_changed",
    "stream_ready",
    "frame_updated",
    "url_changed",
    "command_queued",
    "command_started",
    "command_completed",
    "command_failed",
    "assist_requested",
    "assist_resolved",
    "approval_requested",
    "approval_resolved",
    "takeover_started",
    "takeover_lease_expiring",
    "takeover_ended",
    "incident",
    "agent_started",
    "agent_resumed",
    "navigation_completed",
    "session_completed",
    "session_failed",
]
LiveBrowserErrorCode = Literal[
    "session_version_conflict",
    "session_not_found",
    "session_terminated",
    "invalid_state_transition",
    "policy_denied",
    "rate_limited",
    "command_queue_full",
    "session_pool_exhausted",
    "takeover_locked_out",
    "step_up_auth_required",
    "lease_expired",
    "stream_unavailable",
]
LiveBrowserApprovalDecision = Literal["approved", "rejected"]
LiveBrowserBarrierType = Literal[
    "login_required",
    "captcha_required",
    "payment_review_required",
    "booking_confirmation_required",
]
LiveBrowserStreamScope = Literal["viewer", "controller"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LiveBrowserActor(StrictModel):
    actorType: LiveBrowserActorType
    actorId: str


class LiveBrowserCommand(StrictModel):
    type: Literal["natural_language"]
    text: str


class LiveBrowserAssistDecisionResponse(StrictModel):
    type: Literal["decision"]
    value: str


class LiveBrowserAssistFieldInputResponse(StrictModel):
    type: Literal["field_input"]
    fields: dict[str, Any] = Field(default_factory=dict)


class LiveBrowserAssistReviewPageResponse(StrictModel):
    type: Literal["review_page"]
    notes: str


class LiveBrowserAssistTakeoverRequiredResponse(StrictModel):
    type: Literal["takeover_required"]
    reason: str


LiveBrowserAssistResponse = (
    LiveBrowserAssistDecisionResponse
    | LiveBrowserAssistFieldInputResponse
    | LiveBrowserAssistReviewPageResponse
    | LiveBrowserAssistTakeoverRequiredResponse
)


class LiveBrowserStream(StrictModel):
    viewerToken: str | None = None
    controllerToken: str | None = None
    expiresAt: str
    leaseExpiresAt: str | None = None


class LiveBrowserSessionSummary(StrictModel):
    sessionId: str
    state: LiveBrowserPresentationState
    barrierType: LiveBrowserBarrierType | None = None
    badgeLabel: str
    statusLine: str
    primaryActionLabel: str
    pageTitle: str | None = None
    url: str | None = None
    compactNotice: str | None = None
    sourceLabel: str


class LiveBrowserSessionArtifact(StrictModel):
    sessionId: str
    summary: LiveBrowserSessionSummary
    updatedAt: str | None = None


class LiveBrowserSession(StrictModel):
    sessionId: str
    tenantId: str
    userId: int
    sourceType: LiveBrowserSourceType
    sourceId: str | None = None
    status: LiveBrowserSessionStatus
    controlMode: LiveBrowserControlMode
    sessionVersion: int = Field(ge=0)
    controllerActorType: LiveBrowserActorType | None = None
    controllerActorId: str | None = None
    controllerConnectionId: str | None = None
    controllerLeaseExpiresAt: str | None = None
    pauseReason: str | None = None
    barrierType: LiveBrowserBarrierType | None = None
    pendingAssistRequestId: str | None = None
    pendingApprovalRequestId: str | None = None
    policyContext: dict[str, Any] = Field(default_factory=dict)
    browserContextRef: dict[str, Any] = Field(default_factory=dict)
    stream: LiveBrowserStream | None = None
    activeTabCount: int = Field(default=1, gt=0)
    startedAt: str
    lastActivityAt: str
    endedAt: str | None = None
    endReason: str | None = None


class LiveBrowserEventPayload(BaseModel):
    session: LiveBrowserSession | None = None
    model_config = ConfigDict(extra="allow")


class LiveBrowserEventEnvelope(StrictModel):
    eventId: str
    sessionId: str
    sessionVersion: int = Field(ge=0)
    type: LiveBrowserEventType
    timestamp: str
    payload: LiveBrowserEventPayload = Field(default_factory=LiveBrowserEventPayload)
    cursor: str


class LiveBrowserError(StrictModel):
    code: LiveBrowserErrorCode
    message: str
    currentSessionVersion: int | None = Field(default=None, ge=0)
    retryable: bool
    reasonCodes: list[str] = Field(default_factory=list)


class LiveBrowserErrorResponse(StrictModel):
    accepted: Literal[False]
    error: LiveBrowserError


class LiveBrowserCreateSessionRequest(StrictModel):
    actor: LiveBrowserActor
    sourceType: LiveBrowserSourceType
    sourceId: str | None = None
    initialUrl: str | None = None
    mode: LiveBrowserControlMode = "observe"
    executionIntent: dict[str, Any] | None = None


class LiveBrowserCreateSessionResponse(StrictModel):
    sessionId: str
    status: LiveBrowserSessionStatus
    controlMode: LiveBrowserControlMode
    sessionVersion: int = Field(ge=0)
    stream: LiveBrowserStream


class LiveBrowserGetSessionRequest(StrictModel):
    sessionId: str
    actor: LiveBrowserActor


class LiveBrowserMutationRequest(StrictModel):
    sessionId: str
    sessionVersion: int = Field(ge=0)
    idempotencyKey: str
    actor: LiveBrowserActor


class LiveBrowserSendCommandRequest(LiveBrowserMutationRequest):
    command: LiveBrowserCommand


class LiveBrowserSendCommandResponse(StrictModel):
    accepted: Literal[True]
    sessionVersion: int = Field(ge=0)
    queuedCommandId: str


class LiveBrowserUpdatePolicyContextRequest(LiveBrowserMutationRequest):
    policyContextPatch: dict[str, Any] = Field(default_factory=dict)


class LiveBrowserUpdatePolicyContextResponse(StrictModel):
    accepted: Literal[True]
    sessionVersion: int = Field(ge=0)
    policyContext: dict[str, Any] = Field(default_factory=dict)


class LiveBrowserPauseAgentRequest(LiveBrowserMutationRequest):
    reason: str


class LiveBrowserPauseAgentResponse(StrictModel):
    accepted: Literal[True]
    status: LiveBrowserSessionStatus
    controlMode: LiveBrowserControlMode
    sessionVersion: int = Field(ge=0)


class LiveBrowserTakeControlRequest(LiveBrowserMutationRequest):
    reason: str


class LiveBrowserTakeControlResponse(StrictModel):
    accepted: Literal[True]
    status: LiveBrowserSessionStatus
    controlMode: LiveBrowserControlMode
    sessionVersion: int = Field(ge=0)
    stream: LiveBrowserStream


class LiveBrowserReturnControlRequest(LiveBrowserMutationRequest):
    checkpoint: str
    notes: str | None = None


class LiveBrowserReturnControlResponse(StrictModel):
    accepted: Literal[True]
    status: LiveBrowserSessionStatus
    controlMode: LiveBrowserControlMode
    sessionVersion: int = Field(ge=0)


class LiveBrowserSubmitAssistResponseRequest(LiveBrowserMutationRequest):
    assistRequestId: str
    response: LiveBrowserAssistResponse


class LiveBrowserSubmitAssistResponseResponse(StrictModel):
    accepted: Literal[True]
    assistRequestStatus: LiveBrowserAssistRequestStatus
    sessionVersion: int = Field(ge=0)


class LiveBrowserResolveApprovalRequest(LiveBrowserMutationRequest):
    approvalRequestId: str
    decision: LiveBrowserApprovalDecision
    notes: str | None = None


class LiveBrowserResolveApprovalResponse(StrictModel):
    accepted: Literal[True]
    approvalStatus: LiveBrowserApprovalDecision
    sessionVersion: int = Field(ge=0)
    agentResumed: bool


class LiveBrowserCancelSessionRequest(LiveBrowserMutationRequest):
    reason: str


class LiveBrowserCancelSessionResponse(StrictModel):
    accepted: Literal[True]
    status: LiveBrowserSessionStatus
    sessionVersion: int = Field(ge=0)


class LiveBrowserListEventsRequest(StrictModel):
    sessionId: str
    actor: LiveBrowserActor
    cursor: str | None = None
    limit: int = Field(default=100, gt=0, le=500)


class LiveBrowserListEventsResponse(StrictModel):
    sessionId: str
    events: list[LiveBrowserEventEnvelope] = Field(default_factory=list)
    nextCursor: str | None = None
    hasMore: bool


class LiveBrowserStreamTokenRequest(StrictModel):
    sessionId: str
    actor: LiveBrowserActor
    scope: LiveBrowserStreamScope


class LiveBrowserStreamTokenResponse(StrictModel):
    sessionId: str
    scope: LiveBrowserStreamScope
    token: str
    expiresAt: str
    leaseExpiresAt: str | None = None
