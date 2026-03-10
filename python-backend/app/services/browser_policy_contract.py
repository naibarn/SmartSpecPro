"""Shared browser policy contract models for Python consumers."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


BROWSER_APPROVAL_TTL_DEFAULT_SECONDS = 300
BROWSER_APPROVAL_TTL_MIN_SECONDS = 60
BROWSER_APPROVAL_TTL_MAX_SECONDS = 900
BROWSER_APPROVAL_DOM_DRIFT_THRESHOLD = 0.2


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
