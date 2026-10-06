"""Canonical handoff states and completion policy.

This module is the single semantic writer contract for Spec lifecycle state.
It deliberately does not infer product relevance from age or implementation
completeness.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

SCHEMA_VERSION = 1
DISPOSITIONS = {
    "ACTIVE_CANONICAL", "ACTIVE_SUPPORTING", "LEGACY_COMPATIBILITY",
    "SUPERSEDED_FULL", "SUPERSEDED_PARTIAL", "MERGED_INTO", "RETIRED",
    "HISTORICAL_ONLY", "DORMANT_UNRESOLVED", "CANCELLED_EXPLICIT",
    "INVALID_OR_UNKNOWN",
}
CONTINUATIONS = {
    "CONTINUE_REQUIRED", "CONTINUE_RECOMMENDED", "CONTINUE_OPTIONAL",
    "VALIDATION_ONLY", "MAINTENANCE_ONLY", "DO_NOT_CONTINUE_SUPERSEDED",
    "DO_NOT_CONTINUE_RETIRED", "DO_NOT_CONTINUE_HISTORICAL",
    "RECONCILIATION_REQUIRED", "HUMAN_PRODUCT_DECISION_REQUIRED",
}
CONFIDENCE = {"HIGH", "MEDIUM", "LOW", "UNRESOLVED"}
FINAL_REQUIREMENT_STATES = {"PASS", "FAIL", "BLOCKED_TRUE_EXTERNAL", "NOT_APPLICABLE"}
INTERMEDIATE_REQUIREMENT_STATES = {"OPEN", "PARTIAL", "VALIDATION_PENDING", "STALE_EVIDENCE"}
LIFECYCLE_STATES = {
    "DISCOVERING", "WORKING", "CHECKPOINT_READY", "CANONICALIZING",
    "PARTIAL_INTEGRATED", "CONTINUATION_REQUIRED", "WAITING_DEPENDENCY",
    "WAITING_EXTERNAL", "WAITING_RESOURCE", "WAITING_CAPABILITY",
    "WAITING_APPROVAL", "WAITING_CANONICAL_ARTIFACT", "IMPLEMENTATION_COMPLETE",
    "VALIDATION_PENDING", "VALIDATING", "REPAIR_REQUIRED", "VERIFIED",
    "RELEASE_READY", "DEPLOYING", "DEPLOYED", "BLOCKED_RECOVERABLE",
    "FAILED_TERMINAL", "CANCELLED",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def new_manifest(identity: dict[str, Any], *, now: str | None = None) -> dict[str, Any]:
    """Create a conservative reconciliation seed; this is not a completion claim."""
    ts = now or utc_now()
    return {
        "schema_version": SCHEMA_VERSION,
        "generation": 0,
        "identity": {**identity},
        "relevance_assessment": {
            "current_architecture_fit": "UNASSESSED", "successor_or_supersession": "UNASSESSED",
            "current_runtime_dependency": "UNASSESSED", "current_product_relevance": "UNASSESSED",
            "residual_requirements": [], "security_data_compliance_obligations": "UNASSESSED",
            "implementation_equivalence": "UNASSESSED", "conflict_duplication_risk": "UNASSESSED",
            "active_references": [], "deployment_reality": "UNASSESSED", "evidence": [],
        },
        "authority": {
            "status": "UNRESOLVED", "confidence": "UNRESOLVED", "predecessors": [],
            "successors": [], "conflicts": [], "evidence": [],
        },
        "disposition": {
            "value": "DORMANT_UNRESOLVED", "rationale": "Not yet reconciled.",
            "confidence": "UNRESOLVED", "evidence": [{"path": identity.get("canonical_path"), "digest": identity.get("digest"), "kind": "NORMATIVE_SPEC"}],
        },
        "continuation_assessment": {
            "decision": "RECONCILIATION_REQUIRED", "confidence": "UNRESOLVED",
            "rationale": "Not yet reconciled.", "residual_requirements": [],
            "evidence": [], "next_action": "Reconcile against current architecture and evidence.",
        },
        "lifecycle": {
            "current_state": "DISCOVERING", "previous_state": None,
            "state_evidence": [], "updated_at": ts,
        },
        "implementation": {
            "started": False, "status": "UNKNOWN", "mapping": [],
            "source_paths": [], "checkpoint_shas": [],
        },
        "integration": {"canonical_ref": None, "integrated": False, "canonical_sha": None, "integrated_at": None},
        "verification": {"required_profiles": [], "status": "UNKNOWN", "sha": None, "evidence": [], "freshness": "UNKNOWN", "task_regressions": [], "baseline_issues": []},
        "deployment": {"required": False, "status": "UNKNOWN", "source_sha": None, "artifact_digest": None, "environment": None, "evidence": []},
        "acceptance": {"required": False, "status": "UNKNOWN", "evidence": []},
        "requirements_summary": {"total": 0, "applicable": 0, "pass": 0, "fail": 0, "unresolved": 0, "blocked_true_external": 0, "not_applicable": 0},
        "dependencies": {"specs": [], "runtime_capabilities": [], "predicates": [], "satisfaction_evidence": []},
        "blockers": [],
        "continuation": {"next_ready_workunit": None, "next_action": None, "waiting_predicate": None, "reactivation_predicate": None, "resume_point": None},
        "reconciliation": {"mode": "UNRECONCILED", "confidence": "UNRESOLVED", "sources": [], "inferred_fields": [], "unproven_fields": [], "stale_fields": [], "reconciled_at": None},
        "concurrency": {"expected_spec_digest": identity.get("digest"), "expected_canonical_sha": None},
        "updated_at": ts,
    }


def validate_manifest(manifest: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for field in ("identity", "authority", "disposition", "continuation_assessment", "lifecycle", "relevance_assessment", "requirements_summary", "reconciliation", "concurrency"):
        if not isinstance(manifest.get(field), dict):
            errors.append(f"missing object: {field}")
    if errors:
        return errors
    if manifest.get("schema_version") != SCHEMA_VERSION:
        errors.append("unsupported schema_version")
    identity = manifest["identity"]
    for field in ("spec_id", "slug", "title", "canonical_path", "digest"):
        if not identity.get(field):
            errors.append(f"identity.{field} is required")
    disposition = manifest["disposition"].get("value")
    if disposition not in DISPOSITIONS:
        errors.append("disposition.value is invalid")
    if not manifest["disposition"].get("rationale") or not manifest["disposition"].get("evidence"):
        errors.append("disposition requires rationale and evidence")
    assessment = manifest["continuation_assessment"]
    if assessment.get("decision") not in CONTINUATIONS:
        errors.append("continuation_assessment.decision is invalid")
    if assessment.get("confidence") not in CONFIDENCE:
        errors.append("continuation_assessment.confidence is invalid")
    if not assessment.get("rationale") or not assessment.get("next_action"):
        errors.append("continuation assessment requires rationale and next_action")
    if str(assessment.get("decision", "")).startswith("DO_NOT_CONTINUE") and not assessment.get("evidence"):
        errors.append("DO_NOT_CONTINUE requires supporting evidence")
    if manifest["lifecycle"].get("current_state") not in LIFECYCLE_STATES:
        errors.append("lifecycle.current_state is invalid")
    if manifest["authority"].get("status") not in {"ACTIVE_CANONICAL", "ACTIVE_SUPPORTING", "LEGACY_COMPATIBILITY", "SUPERSEDED_FULL", "SUPERSEDED_PARTIAL", "MERGED_INTO", "RETIRED", "HISTORICAL_ONLY", "DORMANT_UNRESOLVED", "CANCELLED_EXPLICIT", "INVALID_OR_UNKNOWN", "AUTHORITY_CONFLICT", "UNRESOLVED"}:
        errors.append("authority.status is invalid")
    for section, key in (("disposition", "confidence"), ("authority", "confidence"), ("reconciliation", "confidence")):
        if manifest[section].get(key) not in CONFIDENCE:
            errors.append(f"{section}.{key} is invalid")
    return errors


def validate_ledger(ledger: dict[str, Any], *, canonical_sha: str | None = None) -> list[str]:
    errors: list[str] = []
    if ledger.get("schema_version") != SCHEMA_VERSION:
        errors.append("unsupported requirement ledger schema_version")
    if not ledger.get("spec_id") or not ledger.get("spec_digest"):
        errors.append("requirement ledger identity is incomplete")
    requirements = ledger.get("requirements")
    if not isinstance(requirements, list):
        return errors + ["requirements must be an array"]
    seen: set[str] = set()
    valid_states = FINAL_REQUIREMENT_STATES | INTERMEDIATE_REQUIREMENT_STATES
    for index, requirement in enumerate(requirements):
        prefix = f"requirements[{index}]"
        req_id = requirement.get("requirement_id")
        if not req_id:
            errors.append(f"{prefix}.requirement_id is required")
        elif req_id in seen:
            errors.append(f"duplicate requirement_id: {req_id}")
        seen.add(req_id)
        for field in ("authority_source", "requirement_digest", "next_action"):
            if not requirement.get(field):
                errors.append(f"{prefix}.{field} is required")
        state = requirement.get("final_state")
        if state not in valid_states:
            errors.append(f"{prefix}.final_state is invalid")
        if state == "PASS":
            if not requirement.get("implementation_evidence") or not requirement.get("verification_evidence"):
                errors.append(f"{prefix} PASS requires implementation and verification evidence")
            if not requirement.get("evidence_sha") or requirement.get("evidence_freshness") != "FRESH":
                errors.append(f"{prefix} PASS requires fresh exact-SHA evidence")
            if canonical_sha and requirement.get("evidence_sha") != canonical_sha:
                errors.append(f"{prefix} evidence_sha does not match canonical SHA")
        if state == "NOT_APPLICABLE" and (not requirement.get("applicability_rationale") or not requirement.get("verification_evidence")):
            errors.append(f"{prefix} NOT_APPLICABLE requires rationale and evidence")
        if state == "FAIL" and not requirement.get("verification_evidence"):
            errors.append(f"{prefix} FAIL requires verification evidence")
        if state == "BLOCKED_TRUE_EXTERNAL" and (not requirement.get("blocker") or not requirement.get("verification_evidence")):
            errors.append(f"{prefix} BLOCKED_TRUE_EXTERNAL requires blocker and evidence")
    return errors


def requirement_final_state(requirement: dict[str, Any]) -> str:
    """Resolve requirement closure without promoting intermediate states."""
    if requirement.get("applicability") == "NOT_APPLICABLE":
        return "NOT_APPLICABLE"
    state = requirement.get("final_state") or requirement.get("status")
    if state in FINAL_REQUIREMENT_STATES:
        return state
    if state in INTERMEDIATE_REQUIREMENT_STATES:
        return state
    return "OPEN"


def completion_eligible(manifest: dict[str, Any], ledger: dict[str, Any]) -> tuple[bool, list[str]]:
    """Shared no-false-complete kernel; callers cannot override its predicates."""
    reasons: list[str] = []
    errors = validate_manifest(manifest)
    if errors:
        reasons.extend(errors)
        return False, reasons
    if manifest["reconciliation"].get("confidence") not in {"HIGH", "MEDIUM"}:
        reasons.append("reconciliation confidence is LOW or UNRESOLVED")
    if manifest["authority"].get("status") in {"UNRESOLVED", "AUTHORITY_CONFLICT", "INVALID_OR_UNKNOWN"}:
        reasons.append("Spec authority is unresolved or conflicting")
    if manifest["disposition"].get("value") not in {"ACTIVE_CANONICAL", "ACTIVE_SUPPORTING", "LEGACY_COMPATIBILITY"}:
        reasons.append("disposition is not an active continuation target")
    if manifest["lifecycle"].get("current_state") not in {"IMPLEMENTATION_COMPLETE", "VERIFIED", "RELEASE_READY", "DEPLOYED"}:
        reasons.append("lifecycle has not reached implementation completion")
    requirements = ledger.get("requirements", [])
    for req in requirements:
        state = requirement_final_state(req)
        if state not in {"PASS", "NOT_APPLICABLE"}:
            reasons.append(f"requirement {req.get('requirement_id', '<unknown>')} is {state}")
        elif state == "PASS":
            if not req.get("implementation_evidence") or not req.get("verification_evidence"):
                reasons.append(f"requirement {req.get('requirement_id', '<unknown>')} lacks implementation or verification evidence")
            if req.get("evidence_freshness") != "FRESH" or req.get("evidence_sha") != manifest.get("integration", {}).get("canonical_sha"):
                reasons.append(f"requirement {req.get('requirement_id', '<unknown>')} evidence is stale or not bound to canonical SHA")
        elif state == "NOT_APPLICABLE" and (not req.get("next_action") or not req.get("applicability_rationale")):
            reasons.append(f"requirement {req.get('requirement_id', '<unknown>')} lacks NOT_APPLICABLE rationale")
    verification = manifest.get("verification", {})
    if verification.get("status") != "PASS" or not verification.get("sha"):
        reasons.append("required verification evidence is missing")
    integration = manifest.get("integration", {})
    if not integration.get("integrated") or not integration.get("canonical_sha"):
        reasons.append("canonical integration evidence is missing")
    deployment = manifest.get("deployment", {})
    if deployment.get("required") and (deployment.get("status") != "PASS" or not deployment.get("source_sha")):
        reasons.append("required deployment evidence is missing")
    acceptance = manifest.get("acceptance", {})
    if acceptance.get("required") and (acceptance.get("status") != "PASS" or not acceptance.get("evidence")):
        reasons.append("required acceptance evidence is missing")
    exact_sha = integration.get("canonical_sha")
    if verification.get("status") == "PASS" and verification.get("sha") != exact_sha:
        reasons.append("verification evidence is not bound to the canonical SHA")
    if deployment.get("required") and deployment.get("status") == "PASS" and deployment.get("source_sha") != exact_sha:
        reasons.append("deployment evidence is not bound to the canonical SHA")
    return not reasons, reasons
