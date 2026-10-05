"""Deterministic decision kernel for recoverable lifecycle gaps."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any


TRUE_BLOCKER_CLASSES = {
    "EXTERNAL_DESTRUCTIVE_NO_RECOVERY",
    "MISSING_CREDENTIAL_NO_FALLBACK",
    "PRODUCT_AMBIGUITY",
    "CRITICAL_SECURITY_ACCEPTANCE",
    "MANDATORY_LEGAL_APPROVAL_NO_SUBSTITUTE",
    "PLATFORM_LIMITATION_NO_ALTERNATIVE",
}
REGISTERED_PREDICATE_ADAPTERS = {
    "admission_passes",
    "canonical_sha_matches",
    "evidence_exists",
    "external_job_complete",
    "manual_acceptance_present",
    "provider_healthy",
    "resource_available",
    "test_passes",
}


def classify_failure(failure_class: str, *, has_safe_alternative: bool = False) -> str:
    """Only explicit authority/security/external classes may terminate progress."""
    if failure_class in TRUE_BLOCKER_CLASSES and not has_safe_alternative:
        return "TRUE_BLOCKER"
    return "RECOVERABLE"


def blocker_strategy(repeat_count: int, *, meaningful_delta: bool) -> str:
    """Escalate repeated gaps and forbid blind retries after three no-delta loops."""
    if repeat_count >= 3 and not meaningful_delta:
        return "STALLED_STRATEGY"
    if repeat_count >= 2:
        return "CHALLENGE_BLOCKER"
    return "TRY_NEXT_SAFE_STRATEGY"


def _valid_predicate(predicate: Any) -> bool:
    return (
        isinstance(predicate, Mapping)
        and isinstance(predicate.get("kind"), str)
        and predicate.get("kind") in REGISTERED_PREDICATE_ADAPTERS
        and bool(predicate.get("source") or predicate.get("locator"))
    )


def _predicate_proven(predicate: Mapping[str, Any], satisfied: Iterable[Mapping[str, Any]]) -> bool:
    return any(
        candidate.get("evidence")
        and all(candidate.get(key) == value for key, value in predicate.items())
        for candidate in satisfied
    )


def next_ready_workunit(
    workunits: Iterable[Mapping[str, Any]],
    *,
    satisfied_predicates: Iterable[Mapping[str, Any]] = (),
    prohibited_retries: Iterable[str] = (),
    completed_workunits: Iterable[Mapping[str, Any]] = (),
    canonical_sha: str | None = None,
) -> str | None:
    """Return a runnable unit only when dependency and wait predicates are proven."""
    units = list(workunits)
    completed = {
        str(unit["id"])
        for unit in units
        if unit.get("status") == "COMPLETE"
        and bool(unit.get("completion_evidence"))
        and unit.get("evidence_fresh", True) is True
        and canonical_sha
        and unit.get("canonical_sha") == canonical_sha
    }
    completed.update(
        str(row["id"])
        for row in completed_workunits
        if isinstance(row, Mapping)
        and row.get("status") == "COMPLETE"
        and bool(row.get("completion_evidence"))
        and row.get("evidence_fresh") is True
        and row.get("canonical_sha") == canonical_sha
    )
    satisfied = list(satisfied_predicates)
    prohibited = set(prohibited_retries)
    for unit in units:
        prerequisites = set(map(str, unit.get("prerequisites", [])))
        evidence_fresh = unit.get("evidence_fresh", True) is True
        predicate = unit.get("waiting_predicate")
        reactivation = unit.get("reactivation_predicate")
        if predicate is not None:
            if not _valid_predicate(predicate) or not _valid_predicate(reactivation):
                continue
            if not _predicate_proven(predicate, satisfied) or not _predicate_proven(reactivation, satisfied):
                continue
        elif unit.get("status", "READY").startswith("WAITING_"):
            continue
        strategy = unit.get("strategy")
        if (
            (unit.get("status", "READY") == "READY" or (unit.get("status", "").startswith("WAITING_") and predicate is not None))
            and _valid_predicate(unit.get("completion_predicate"))
            and (not strategy or strategy not in prohibited)
            and prerequisites <= completed
            and evidence_fresh
        ):
            return str(unit["id"])
    return None


def resume_capsule(
    checkpoint: Mapping[str, Any],
    workunits: Iterable[Mapping[str, Any]],
    *,
    satisfied_predicates: Iterable[Mapping[str, Any]] = (),
    reconciled_canonical_sha: str | None = None,
) -> dict[str, Any]:
    """Resume exact next action while retaining closed work and failed strategies."""
    units = list(workunits)
    prohibited = list(checkpoint.get("prohibited_retries", []))
    canonical_sha = checkpoint.get("canonical_sha")
    canonical_is_reconciled = bool(
        canonical_sha
        and reconciled_canonical_sha
        and checkpoint.get("canonical_sha") == reconciled_canonical_sha
        and checkpoint.get("evidence_fresh") is True
    )
    completed_records = checkpoint.get("completed_workunits", [])
    verified_completed = [
        row
        for row in completed_records
        if isinstance(row, Mapping)
        and row.get("status") == "COMPLETE"
        and bool(row.get("completion_evidence"))
        and row.get("evidence_fresh") is True
        and row.get("canonical_sha") == reconciled_canonical_sha
    ]
    next_unit = None
    if canonical_is_reconciled:
        next_unit = next_ready_workunit(
            units,
            satisfied_predicates=satisfied_predicates,
            prohibited_retries=prohibited,
            completed_workunits=verified_completed,
            canonical_sha=reconciled_canonical_sha,
        )
    return {
        "next_workunit": next_unit,
        "completed_workunits": list(completed_records),
        "unresolved_requirements": list(checkpoint.get("unresolved_requirements", [])),
        "blocker_classification": checkpoint.get("blocker_classification"),
        "attempted_strategies": list(checkpoint.get("attempted_strategies", [])),
        "prohibited_retries": list(checkpoint.get("prohibited_retries", [])),
        "waiting_predicate": checkpoint.get("waiting_predicate"),
        "reactivation_predicate": checkpoint.get("reactivation_predicate"),
        "evidence_fresh": checkpoint.get("evidence_fresh", False),
        "canonical_reconciled": canonical_is_reconciled,
    }


def outcome_complete(
    requirements: Iterable[Mapping[str, Any]],
    *,
    integrated: bool,
    required_verification_fresh: bool,
    deployment_required: bool = False,
    deployed: bool = False,
    acceptance_required: bool = False,
    accepted: bool = False,
    authority_resolved: bool = False,
) -> bool:
    """Completion requires every applicable requirement and requested evidence."""
    rows = list(requirements)
    ledger_closed = all(
        (r.get("applicability") == "NOT_APPLICABLE" and r.get("final_state") == "NOT_APPLICABLE")
        or (r.get("applicability") != "NOT_APPLICABLE" and r.get("final_state") == "PASS" and bool(r.get("evidence")))
        for r in rows
    )
    if not authority_resolved or not rows or not ledger_closed or not integrated or not required_verification_fresh:
        return False
    if deployment_required and not deployed:
        return False
    if acceptance_required and not accepted:
        return False
    return True


def decide_closure(scenario: Mapping[str, Any]) -> str:
    """Map observable lifecycle facts to the next safe closure action."""
    event = scenario["event"]
    facts = scenario.get("facts", {})

    if event == "same_blocker_no_delta":
        return blocker_strategy(int(facts.get("repeat_count", 0)), meaningful_delta=bool(facts.get("meaningful_delta")))
    if event == "critical_security_finding":
        return "TRUE_BLOCKER" if facts.get("critical") else "SECURITY_REVIEW"
    if event == "destructive_db_change_unrecoverable":
        recoverable = facts.get("backup_verified") or facts.get("rollback_proven")
        return "BACKUP_AND_EXECUTE" if recoverable else "TRUE_BLOCKER"
    if event == "conflicting_product_outcomes":
        return "CONTINUE" if facts.get("repository_resolves") else "PRODUCT_AMBIGUITY"
    if event == "full_verification_resource_wait":
        return "QUEUE_AND_CONTINUE" if facts.get("ready_independent_unit") else "QUEUE"
    if event == "resume_after_checkpoint":
        if not facts.get("canonical_sha") or facts.get("canonical_sha") != facts.get("reconciled_canonical_sha") or not facts.get("evidence_fresh"):
            return "RECONCILE_CANONICAL_STATE"
        selected = next_ready_workunit(
            facts.get("workunits", []),
            satisfied_predicates=facts.get("satisfied_predicates", []),
            prohibited_retries=facts.get("prohibited_retries", []),
            completed_workunits=facts.get("completed_workunits", []),
            canonical_sha=facts.get("reconciled_canonical_sha"),
        )
        return "RESUME_NEXT_READY" if selected else "WAIT_WITH_PREDICATE"
    if event == "production_acceptance_evidence_missing":
        return "CONTINUE_UNTIL_ACCEPTANCE" if facts.get("acceptance_required") and not facts.get("acceptance_evidence") else "COMPLETE_ELIGIBLE"
    if event == "unrelated_baseline_failure":
        return "ISOLATE_AND_CONTINUE" if not facts.get("task_regression") and facts.get("independent_work") else "DEBUG_FIX_AND_RETEST"
    if event == "unrelated_dirty_session_worktree":
        return "PRESERVE_AND_CONTINUE" if not facts.get("ownership_overlap") else "ISOLATE_OWNERSHIP"
    if event == "internal_approval_gate":
        return "REPAIR_POLICY" if not facts.get("safety_basis") else "APPLY_RISK_CONTROL"

    # Event-specific closure strategies remain explicit and testable.
    strategies = {
        "replaceable_asset_rights_gap": ("SUBSTITUTE", facts.get("replacement_available")),
        "unsupported_public_claim": ("DOWNGRADE", not facts.get("claim_required")),
        "unnecessary_internal_approval": ("REPAIR_POLICY", not facts.get("safety_basis")),
        "task_caused_test_failure": ("DEBUG_FIX_AND_RETEST", facts.get("repair_safe")),
        "provider_unavailable": ("SUBSTITUTE", facts.get("compatible_fallback")),
        "destructive_db_change_recoverable": ("BACKUP_AND_EXECUTE", facts.get("backup_verified") and facts.get("migration_policy_allows")),
        "generatable_missing_evidence": ("VERIFY_NOW", facts.get("evidence_generatable")),
        "owner_unassigned": ("ASSUME_OWNERSHIP", facts.get("conductor_has_authority")),
        "safe_partial_checkpoint": ("INTEGRATE_AND_CONTINUE", facts.get("fast_gate_passed") and facts.get("requirements_remain")),
        "fixable_remaining_spec_requirements": ("CLOSE_REQUIREMENTS", facts.get("unresolved", 0) > 0 and facts.get("unresolved") == facts.get("fixable")),
        "project_policy_deadlock": ("SELF_HEAL_AND_RESUME", facts.get("policy_project_local") and not facts.get("safety_gain")),
    }
    if event not in strategies:
        raise ValueError(f"Unknown lifecycle event: {event}")
    action, condition = strategies[event]
    return action if condition else "CHALLENGE_BLOCKER"
