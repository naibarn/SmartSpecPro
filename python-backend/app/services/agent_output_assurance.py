from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


ORCHESTRA_CONTRACT_VERSION = 1
ORCHESTRA_MINIMUM_COMPATIBLE_VERSION = 1
TaskKind = Literal[
    "video_prompt", "image_prompt", "text_prompt", "skill_execution",
    "structured_generation", "phone_call_scene", "cross_location_dialogue",
    "shout_across_scenes", "voiceover_narration", "prop_interaction",
]
FindingCode = Literal[
    "contract_invalid", "contract_hash_mismatch", "evidence_quality_insufficient",
    "evidence_reference_unreadable", "evidence_identity_ambiguous", "evidence_extra_people_unresolved",
    "custom_identity_conflict", "speaker_face_visibility_required", "provider_budget_exceeded",
    "provider_capability_mismatch", "output_contract_mismatch", "budget_exceeded", "plan_cycle_detected",
    "manifest_untrusted", "side_effect_unauthorized", "side_effect_token_replayed", "agency_origin_forbidden",
]


class AssuranceModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RuntimeBudget(AssuranceModel):
    maxTurns: int = Field(default=8, ge=0)
    maxToolCalls: int = Field(default=16, ge=0)
    maxParallelAgents: int = Field(default=3, gt=0)
    maxPlanDepth: int = Field(default=4, gt=0)
    maxWallClockSeconds: float = Field(default=180, gt=0)
    maxInputTokens: int = Field(default=32000, gt=0)
    maxOutputTokens: int = Field(default=8000, gt=0)
    maxRepairAttempts: int = Field(default=2, ge=0)
    estimatedCost: float = Field(default=0, ge=0)


class EvidenceItem(AssuranceModel):
    ref: str = Field(min_length=1)
    purpose: str = Field(min_length=1)
    qualityScore: float | None = Field(default=None, ge=0, le=1)
    readable: bool = True
    resolution: Literal["unknown", "low", "usable", "high"] = "unknown"
    visibleFaces: int | None = Field(default=None, ge=0)
    unresolvedPeople: int = Field(default=0, ge=0)
    trusted: bool = False


class EvidencePolicy(AssuranceModel):
    requiredPurposes: list[str] = Field(default_factory=list)
    requireVisionFor: list[TaskKind] = Field(default_factory=list)
    allowTextOnlyFallback: bool = False
    maxEvidenceItems: int = Field(default=16, gt=0)
    minQualityScore: float = Field(default=0.7, ge=0, le=1)


class ProviderCapabilityProfile(AssuranceModel):
    providerId: str = Field(min_length=1)
    modelId: str = Field(min_length=1)
    maxPromptChars: int | None = Field(default=None, gt=0)
    supportsVision: bool = False
    supportsStructuredOutput: bool = False
    supportsLipSync: bool = False
    supportsMultiLocation: bool = False


class OutputContract(AssuranceModel):
    schemaRef: str = Field(min_length=1)
    requiredFields: list[str] = Field(default_factory=list)
    maxChars: int | None = Field(default=None, gt=0)


class SideEffectAuthorization(AssuranceModel):
    tokenId: str = Field(min_length=1)
    tenantId: str = Field(min_length=1)
    contractHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    outputHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    policyHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    allowedEffects: list[str] = Field(min_length=1)
    expiresAt: datetime
    nonce: str = Field(min_length=1)


class AssuranceRequest(AssuranceModel):
    contractVersion: int = Field(ge=ORCHESTRA_MINIMUM_COMPATIBLE_VERSION, le=ORCHESTRA_CONTRACT_VERSION)
    contractId: str = Field(min_length=1)
    attemptId: str = Field(min_length=1)
    taskKind: TaskKind
    contractHash: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    evidencePolicy: EvidencePolicy
    evidence: list[EvidenceItem] = Field(default_factory=list)
    outputContract: OutputContract
    providerProfile: ProviderCapabilityProfile | None = None
    budget: RuntimeBudget
    rulePackIds: list[str] = Field(default_factory=list)
    sideEffectPolicy: Literal["read_only", "approval_required", "mutating_allowed"] = "read_only"
    sideEffectAuthorization: SideEffectAuthorization | None = None
    repairAttempts: int = Field(default=0, ge=0)


class AssuranceFinding(AssuranceModel):
    code: FindingCode
    severity: Literal["info", "warning", "error", "blocking"]
    message: str = Field(min_length=1)
    evidenceRefs: list[str] = Field(default_factory=list)
    userAction: str | None = None


class AssuranceResult(AssuranceModel):
    executionId: str = Field(min_length=1)
    attemptId: str = Field(min_length=1)
    state: str
    contractHash: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    findings: list[AssuranceFinding] = Field(default_factory=list)
    sideEffectAuthorizationId: str | None = None


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_hex(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def validate_evidence_bundle(request: AssuranceRequest) -> AssuranceFinding | None:
    if len(request.evidence) > request.evidencePolicy.maxEvidenceItems:
        return AssuranceFinding(code="evidence_quality_insufficient", severity="blocking", message="evidence_item_limit_exceeded")
    missing = [purpose for purpose in request.evidencePolicy.requiredPurposes if not any(item.purpose == purpose for item in request.evidence)]
    if missing:
        return AssuranceFinding(code="evidence_quality_insufficient", severity="blocking", message=f"missing_evidence_purposes:{','.join(missing)}")
    bad = [item for item in request.evidence if not item.readable or item.unresolvedPeople > 0 or (item.qualityScore is not None and item.qualityScore < request.evidencePolicy.minQualityScore)]
    if bad or (request.taskKind in request.evidencePolicy.requireVisionFor and not request.evidence and not request.evidencePolicy.allowTextOnlyFallback):
        code: FindingCode = "evidence_extra_people_unresolved" if any(item.unresolvedPeople > 0 for item in bad) else "evidence_quality_insufficient"
        return AssuranceFinding(code=code, severity="blocking", message="reference_evidence_requires_user_correction", evidenceRefs=[item.ref for item in bad])
    return None


def validate_provider_prompt_length(profile: ProviderCapabilityProfile, prompt: str) -> AssuranceFinding | None:
    if profile.maxPromptChars is not None and len(prompt) > profile.maxPromptChars:
        return AssuranceFinding(code="provider_budget_exceeded", severity="blocking", message=f"prompt_chars:{len(prompt)}>{profile.maxPromptChars}")
    return None


def compose_character_identity(name: str, custom_description: str | None = None, position: str | None = None) -> str:
    custom = (custom_description or "").strip()
    if custom:
        return f"{name} ({custom})"
    return f"{name} ({position.strip()})" if position and position.strip() else name


def validate_side_effect_authorization(authorization: SideEffectAuthorization | None, expected: dict[str, str], now: datetime | None = None) -> AssuranceFinding | None:
    if authorization is None:
        return AssuranceFinding(code="side_effect_unauthorized", severity="blocking", message="side_effect_authorization_required")
    if any(getattr(authorization, key) != value for key, value in expected.items()):
        return AssuranceFinding(code="side_effect_unauthorized", severity="blocking", message="side_effect_authorization_binding_mismatch")
    current = now or datetime.now(timezone.utc)
    expires = authorization.expiresAt if authorization.expiresAt.tzinfo else authorization.expiresAt.replace(tzinfo=timezone.utc)
    if expires <= current:
        return AssuranceFinding(code="side_effect_unauthorized", severity="blocking", message="side_effect_authorization_expired")
    return None


def detect_plan_cycle(plan: list[dict[str, Any]]) -> bool:
    graph = {str(step["id"]): [str(dep) for dep in step.get("dependsOn", [])] for step in plan}
    visiting: set[str] = set()
    visited: set[str] = set()
    def visit(node: str) -> bool:
        if node in visiting:
            return True
        if node in visited:
            return False
        visiting.add(node)
        if any(dep in graph and visit(dep) for dep in graph.get(node, [])):
            return True
        visiting.remove(node)
        visited.add(node)
        return False
    return any(visit(node) for node in graph)
