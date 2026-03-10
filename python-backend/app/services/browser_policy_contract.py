"""Shared browser policy contract models for Python consumers."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


BROWSER_APPROVAL_TTL_DEFAULT_SECONDS = 300
BROWSER_APPROVAL_TTL_MIN_SECONDS = 60
BROWSER_APPROVAL_TTL_MAX_SECONDS = 900
BROWSER_APPROVAL_DOM_DRIFT_THRESHOLD = 0.2


class BrowserPolicyConfig(BaseModel):
    enabled: bool = True
    enforcementMode: Literal["observe", "read_only", "draft", "commit", "expanded"] = "observe"
    defaultApprovalTtlSeconds: int = Field(
        default=BROWSER_APPROVAL_TTL_DEFAULT_SECONDS,
        ge=BROWSER_APPROVAL_TTL_MIN_SECONDS,
        le=BROWSER_APPROVAL_TTL_MAX_SECONDS,
    )
    reviewCadenceDays: int = 90
    killSwitchEnabled: bool = False
    requireTamperEvidence: bool = True
    evidenceRetentionDays: int = 365
    allowedDomains: list[str] = Field(default_factory=list)
    visionModel: str = "gpt-4o"
    seededDefault: bool = False


class BrowserPolicyUserCustomization(BaseModel):
    allowPersonalDomainSubset: bool = True
    allowModeCap: bool = True
    allowTransferBlocks: bool = True
    allowApprovalTtlCap: bool = True
    allowActionApprovalEscalation: bool = True
    allowPreferredVisionModel: bool = False


class BrowserPolicyUserProfile(BaseModel):
    enabled: bool = True
    modeCap: Literal["observe", "read_only", "draft", "commit", "expanded"] | None = None
    allowedDomainsSubset: list[str] = Field(default_factory=list)
    blockedTransfers: list[
        Literal["download", "upload", "clipboard", "external_send"]
    ] = Field(default_factory=list)
    requireApprovalForActionClasses: list[
        Literal["read", "draft", "commit", "restricted"]
    ] = Field(default_factory=list)
    approvalTtlSecondsCap: int | None = Field(
        default=None,
        ge=BROWSER_APPROVAL_TTL_MIN_SECONDS,
        le=BROWSER_APPROVAL_TTL_MAX_SECONDS,
    )
    preferredVisionModel: str | None = None
    notifyOnApprovalRequests: bool = True
    notifyOnPolicyIncidents: bool = True


class BrowserPolicyRule(BaseModel):
    id: int | None = None
    priority: int = 100
    enabled: bool = True
    description: str | None = None
    match: dict[str, object] = Field(default_factory=dict)
    decision: Literal[
        "allow",
        "allow_with_redaction",
        "require_approval",
        "deny",
        "escalate_for_review",
    ]
    reasonCode: str
    actionClass: Literal["read", "draft", "commit", "restricted"] | None = None


class BrowserWorkflowEntitlementConfig(BaseModel):
    approvalTtlSeconds: int = Field(
        default=BROWSER_APPROVAL_TTL_DEFAULT_SECONDS,
        ge=BROWSER_APPROVAL_TTL_MIN_SECONDS,
        le=BROWSER_APPROVAL_TTL_MAX_SECONDS,
    )
    maxExtractedRecords: int | None = Field(default=None, gt=0)
    maxExternalSends: int | None = Field(default=None, gt=0)
    maxOriginTransitions: int | None = Field(default=None, gt=0)
    maxNonReadActions: int | None = Field(default=None, gt=0)


class BrowserWorkflowEntitlement(BaseModel):
    tenantId: str
    workflowId: int
    workflowName: str
    enabled: bool = True
    reviewCadenceDays: int = 90
    allowedCapabilities: list[str] = Field(default_factory=list)
    forbiddenCapabilities: list[str] = Field(default_factory=list)
    allowedDataClasses: list[str] = Field(default_factory=lambda: ["public", "internal"])
    config: BrowserWorkflowEntitlementConfig = Field(default_factory=BrowserWorkflowEntitlementConfig)


class BrowserPolicyEvidence(BaseModel):
    actionDigest: str
    payloadPreviewHash: str | None = None
    domFingerprint: str | None = None
    screenshotHash: str | None = None


class BrowserPolicyApproval(BaseModel):
    required: bool
    approvalId: str | None = None
    approvalTtlSeconds: int | None = Field(
        default=None,
        ge=BROWSER_APPROVAL_TTL_MIN_SECONDS,
        le=BROWSER_APPROVAL_TTL_MAX_SECONDS,
    )


class BrowserPolicyDecisionEnvelope(BaseModel):
    version: Literal["2026-03-10"]
    tenantId: str
    userId: int | None = None
    workflowId: int | None = None
    executionId: str | None = None
    traceId: str | None = None
    actionType: str
    actionClass: Literal["read", "draft", "commit", "restricted"]
    pageSensitivity: Literal[
        "none",
        "auth",
        "financial",
        "admin",
        "sensitive_data",
        "communication",
        "code",
    ]
    decision: Literal[
        "allow",
        "allow_with_redaction",
        "require_approval",
        "deny",
        "escalate_for_review",
    ]
    reasonCodes: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    riskScore: int = Field(ge=0, le=100)
    evidence: BrowserPolicyEvidence
    approval: BrowserPolicyApproval | None = None


class BrowserApprovalPayload(BaseModel):
    actionDescription: str
    actionDigest: str
    payloadPreviewHash: str
    domFingerprint: str
    screenshotHash: str | None = None
    targetOrigin: str
    executionId: str
    reasonCodes: list[str] = Field(default_factory=list)
    approvalTtlSeconds: int = Field(
        ge=BROWSER_APPROVAL_TTL_MIN_SECONDS,
        le=BROWSER_APPROVAL_TTL_MAX_SECONDS,
    )


class BrowserPolicyExecutionContext(BaseModel):
    config: BrowserPolicyConfig
    rules: list[BrowserPolicyRule] = Field(default_factory=list)
    entitlement: BrowserWorkflowEntitlement
    userCustomization: BrowserPolicyUserCustomization | None = None
    userProfile: BrowserPolicyUserProfile | None = None


class BrowserPolicyAuditMetadata(BaseModel):
    traceId: str | None = None
    eventHash: str
    previousEventHash: str | None = None
    jsonlPersisted: bool
    dbPersisted: bool
    auditWriteFailed: bool = False


class BrowserPolicyIncidentStatus(BaseModel):
    approvalState: Literal[
        "not_required",
        "approved",
        "pending",
        "context_changed",
        "revoked",
        "expired",
        "rejected",
    ]
    outcome: Literal["blocked", "executed", "failed"]
    operatorMessage: str


class BrowserPolicyEvaluationResponse(BaseModel):
    decision: BrowserPolicyDecisionEnvelope
    approvalPayload: BrowserApprovalPayload | None = None
    correlationKey: str | None = None
    audit: BrowserPolicyAuditMetadata | None = None
    incident: BrowserPolicyIncidentStatus | None = None


class BrowserPolicyOutcomeResponse(BaseModel):
    audit: BrowserPolicyAuditMetadata | None = None
    incident: BrowserPolicyIncidentStatus | None = None


class BrowserApprovalContextSnapshot(BaseModel):
    actionDigest: str
    domFingerprint: str
    targetOrigin: str


def validate_browser_approval_context(
    stored: BrowserApprovalContextSnapshot,
    observed: BrowserApprovalContextSnapshot,
    dom_drift: float,
    revoked: bool = False,
) -> tuple[bool, str | None]:
    if revoked:
        return False, "approval_revoked"

    if stored.targetOrigin != observed.targetOrigin:
        return False, "approval_context_changed"

    if stored.actionDigest != observed.actionDigest:
        return False, "approval_context_changed"

    if (
        stored.domFingerprint != observed.domFingerprint
        and dom_drift > BROWSER_APPROVAL_DOM_DRIFT_THRESHOLD
    ):
        return False, "approval_context_changed"

    return True, None
